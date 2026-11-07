import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { CapabilityClaimSchema, EvidenceReceiptSchema, OpportunityNeedSchema, ParticipantSchema } from '../contracts/index.ts';
import type { CapabilityClaim, EvidenceReceipt, OpportunityNeed, Participant } from '../contracts/index.ts';
import { openDatabase } from '../db/client.ts';
import { publishEvent } from '../events/bus.ts';
import { getOrFetchSnapshot, writeSnapshot } from '../github/cache.ts';
import type { SnapshotFetcher } from '../github/cache.ts';
import { GithubFetchError } from '../github/connector.ts';
import type { FetchGithubOptions, GithubSnapshot } from '../github/connector.ts';
import { analyzeStage1, enrichStage2, llmClientFromEnv, persistAnalysis } from '../intelligence/capability-agent.ts';
import type { CapabilityAnalysis, LlmClient } from '../intelligence/capability-agent.ts';
import { discoverStage1, enrichOpportunities, persistOpportunities } from '../intelligence/opportunity-agent.ts';
import type { OpportunityAnalysis } from '../intelligence/opportunity-agent.ts';
import { enrichExplanation, explainMatches, geminiClientFromEnv } from '../matching/explanation-agent.ts';
import type { ExplanationLlm, StagedExplanation } from '../matching/explanation-agent.ts';
import { selectTopMatches } from '../matching/scorer.ts';
import type { ParticipantProfile } from '../matching/scorer.ts';
import { ANALYZE_JOB_KIND } from '../routes/onboarding.ts';
import { MATCH_REFRESH_JOB_KIND } from '../routes/me.ts';
import type { Logger } from '../server.ts';

export const WORKER_CONCURRENCY_LEVELS = [8, 16, 24, 32] as const;
export type WorkerConcurrency = (typeof WORKER_CONCURRENCY_LEVELS)[number];
export const GITHUB_FETCH_MODES = ['full-graphql', 'fast-rest-top5'] as const;
export type GithubFetchMode = (typeof GITHUB_FETCH_MODES)[number];
export const DEFAULT_WORKER_SETTINGS: WorkerSettings = { workerConcurrency: 8, githubFetchMode: 'full-graphql' };
export const MAX_ATTEMPTS = 3;
export const RETRY_BASE_MS = 30_000;
// A job still `running` this long after its last update was abandoned by a crashed worker.
export const STALE_RUNNING_MS = 10 * 60_000;
export const DEFAULT_POLL_MS = 500;
export const SKIPPED_CONSENT = 'skipped: consent_withdrawn';
const SETTINGS_FILE = 'data/worker-settings.json';

/** Worker settings shared between the server (`/admin` writes) and the worker process (reads every tick). */
export interface WorkerSettings {
  workerConcurrency: WorkerConcurrency;
  githubFetchMode: GithubFetchMode;
}

/** A leased `async_jobs` row. */
export interface AsyncJob {
  id: string;
  kind: string;
  participant_id: string | null;
  payload: Record<string, unknown>;
  attempts: number;
}

export interface WorkerDeps {
  /** Snapshot fetcher override (tests); defaults to the live GitHub/website connector. */
  fetcher?: SnapshotFetcher;
  /** A-004/A-005 Stage 2 client; `null` disables Stage 2 enrichment; defaults to `llmClientFromEnv()`. */
  llm?: LlmClient | null;
  /** A-007 Stage 2 client; `null` disables it; defaults to `geminiClientFromEnv()`. */
  explanationLlm?: ExplanationLlm | null;
  now?: () => Date;
  log?: Logger;
  /** Settings source; defaults to reading the settings file. */
  settings?: () => WorkerSettings;
}

export interface TickResult {
  leased: number;
  succeeded: number;
  skipped: number;
  retried: number;
  failed: number;
  /** Settles when every Stage 2 enrichment started by this tick has finished. */
  stage2: Promise<void>;
}

type JobOutcome = { status: 'succeeded' | 'skipped' | 'retried' | 'failed'; stage2?: () => Promise<void> };

/**
 * Path of the shared worker settings file.
 * @param env - Environment (`ARIADNE_WORKER_SETTINGS_PATH` overrides).
 * @returns Absolute path.
 */
export function workerSettingsPath(env: NodeJS.ProcessEnv = process.env): string {
  return resolve(env.ARIADNE_WORKER_SETTINGS_PATH?.trim() || SETTINGS_FILE);
}

/**
 * Validates a partial settings update.
 * @param update - Requested changes.
 * @returns The validated changes.
 * @throws If a value is not one of the allowed presets.
 */
export function validateWorkerSettings(update: Partial<Record<keyof WorkerSettings, unknown>>): Partial<WorkerSettings> {
  const out: Partial<WorkerSettings> = {};
  if (update.workerConcurrency !== undefined) {
    if (!WORKER_CONCURRENCY_LEVELS.includes(update.workerConcurrency as WorkerConcurrency)) {
      throw new Error(`workerConcurrency must be one of ${WORKER_CONCURRENCY_LEVELS.join(', ')}`);
    }
    out.workerConcurrency = update.workerConcurrency as WorkerConcurrency;
  }
  if (update.githubFetchMode !== undefined) {
    if (!GITHUB_FETCH_MODES.includes(update.githubFetchMode as GithubFetchMode)) {
      throw new Error(`githubFetchMode must be one of ${GITHUB_FETCH_MODES.join(', ')}`);
    }
    out.githubFetchMode = update.githubFetchMode as GithubFetchMode;
  }
  return out;
}

/**
 * Reads the worker settings, falling back to defaults when the file is missing or invalid.
 * @param path - Settings file.
 * @returns The settings.
 */
export function getWorkerSettings(path: string = workerSettingsPath()): WorkerSettings {
  if (!existsSync(path)) return { ...DEFAULT_WORKER_SETTINGS };
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    return { ...DEFAULT_WORKER_SETTINGS, ...validateWorkerSettings(parsed) };
  } catch { // prawduct:allow prawduct/broad-except -- a corrupt or half-written settings file must not stop the worker
    return { ...DEFAULT_WORKER_SETTINGS };
  }
}

/**
 * Validates and stores a settings update (write-then-rename, so a reader never sees half a file).
 * @param update - Requested changes.
 * @param path - Settings file.
 * @returns The new settings.
 * @throws If a value is not an allowed preset (nothing is written).
 */
export function setWorkerSettings(update: Partial<Record<keyof WorkerSettings, unknown>>, path: string = workerSettingsPath()): WorkerSettings {
  const next = { ...getWorkerSettings(path), ...validateWorkerSettings(update) };
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(next, null, 2));
  renameSync(tmp, path);
  return next;
}

/**
 * Connector budget for a fetch mode. There is no GraphQL client: `full-graphql` is the full REST budget
 * (profile, repos, flagship README); `fast-rest-top5` skips the README and uses a shorter timeout.
 * @param mode - The fetch mode.
 * @returns Connector option overrides.
 */
export function fetchOptionsFor(mode: GithubFetchMode): Pick<FetchGithubOptions, 'maxCalls' | 'timeoutMs'> {
  return mode === 'fast-rest-top5' ? { maxCalls: 2, timeoutMs: 1500 } : {};
}

/**
 * Runs `fn` over `items` with at most `limit` in flight, preserving result order.
 * @param items - Inputs.
 * @param limit - Maximum concurrent calls (at least 1).
 * @param fn - Async work per item.
 * @returns Results in input order.
 */
export async function mapWithConcurrency<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const lanes = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]!);
    }
  });
  await Promise.all(lanes);
  return results;
}

/**
 * Returns abandoned `running` jobs (worker crashed mid-job) to the queue.
 * @param db - Open database.
 * @param now - Reference time.
 * @returns How many jobs were recovered.
 */
export function recoverStaleJobs(db: DatabaseSync, now: Date): number {
  const cutoff = new Date(now.getTime() - STALE_RUNNING_MS).toISOString();
  const result = db
    .prepare("UPDATE async_jobs SET status = 'queued', updated_at = ? WHERE status = 'running' AND updated_at < ?")
    .run(now.toISOString(), cutoff);
  return Number(result.changes);
}

/**
 * Atomically claims up to `limit` due jobs: `queued` and `run_after <= now` become `running`, attempts + 1.
 * @param db - Open database.
 * @param limit - Maximum jobs to lease.
 * @param now - Reference time.
 * @returns The leased jobs, oldest due first.
 */
export function leaseJobs(db: DatabaseSync, limit: number, now: Date): AsyncJob[] {
  const at = now.toISOString();
  const rows = db
    .prepare(
      `UPDATE async_jobs SET status = 'running', attempts = attempts + 1, updated_at = ?
       WHERE id IN (SELECT id FROM async_jobs WHERE status = 'queued' AND run_after <= ? ORDER BY run_after, created_at, id LIMIT ?)
       RETURNING id, kind, participant_id, payload_json, attempts, run_after, created_at`,
    )
    .all(at, at, limit) as Array<{ id: string; kind: string; participant_id: string | null; payload_json: string; attempts: number; run_after: string; created_at: string }>;
  rows.sort((x, y) => (x.run_after < y.run_after ? -1 : x.run_after > y.run_after ? 1 : x.created_at < y.created_at ? -1 : x.id < y.id ? -1 : 1));
  return rows.map((r) => {
    let payload: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(r.payload_json) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) payload = parsed as Record<string, unknown>;
    } catch {
      payload = {};
    }
    return { id: r.id, kind: r.kind, participant_id: r.participant_id, payload, attempts: Number(r.attempts) };
  });
}

/**
 * Marks a job finished.
 * @param db - Open database.
 * @param id - Job id.
 * @param status - Final status.
 * @param note - Error or skip note (`null` clears it).
 * @param now - Reference time.
 */
function finishJob(db: DatabaseSync, id: string, status: 'succeeded' | 'failed', note: string | null, now: Date): void {
  db.prepare('UPDATE async_jobs SET status = ?, last_error = ?, updated_at = ? WHERE id = ?').run(status, note, now.toISOString(), id);
}

/**
 * Puts a job back in the queue after a transient failure, with linear backoff.
 * @param db - Open database.
 * @param job - The job.
 * @param error - What went wrong.
 * @param now - Reference time.
 */
function requeueJob(db: DatabaseSync, job: AsyncJob, error: string, now: Date): void {
  const runAfter = new Date(now.getTime() + RETRY_BASE_MS * job.attempts).toISOString();
  db.prepare("UPDATE async_jobs SET status = 'queued', run_after = ?, last_error = ?, updated_at = ? WHERE id = ?").run(runAfter, error, now.toISOString(), job.id);
}

interface ParticipantRow {
  id: string;
  display_alias: string;
  github_username: string;
  consent_status: string;
  analysis_state: string;
}

/**
 * Reads the fields the consent gate needs.
 * @param db - Open database.
 * @param id - Participant id.
 * @returns The row, or `undefined` when the participant no longer exists.
 */
function participantRow(db: DatabaseSync, id: string): ParticipantRow | undefined {
  return db.prepare('SELECT id, display_alias, github_username, consent_status, analysis_state FROM participants WHERE id = ?').get(id) as ParticipantRow | undefined;
}

/**
 * Whether a participant may still be processed.
 * @param row - The participant, if it still exists.
 * @returns True only for a consenting, non-withdrawn participant.
 */
function consents(row: ParticipantRow | undefined): row is ParticipantRow {
  return !!row && row.consent_status === 'granted' && row.analysis_state !== 'withdrawn';
}

/**
 * Moves a consenting participant to a new analysis state (never touches a withdrawn one).
 * @param db - Open database.
 * @param id - Participant id.
 * @param state - New state.
 * @param now - Reference time.
 */
function setAnalysisState(db: DatabaseSync, id: string, state: 'fetching_github' | 'analyzing_profile' | 'ready' | 'failed' | 'registered', now: Date): void {
  db.prepare("UPDATE participants SET analysis_state = ?, updated_at = ? WHERE id = ? AND consent_status = 'granted' AND analysis_state <> 'withdrawn'").run(
    state,
    now.toISOString(),
    id,
  );
}

/**
 * Loads one participant's profile for matching, keeping only rows that satisfy the A-001 contracts.
 * @param db - Open database.
 * @param id - Participant id.
 * @returns The profile, or `null` when the participant is missing or its row is not contract-valid.
 */
export function loadProfile(db: DatabaseSync, id: string): ParticipantProfile | null {
  const row = db
    .prepare(
      `SELECT id, display_alias, github_username, github_user_id, avatar_url, website_url, ownership_verified, consent_status,
              consent_granted_at, stage_display_consent, contact_card, analysis_state, created_at, updated_at
       FROM participants WHERE id = ?`,
    )
    .get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  const participant = ParticipantSchema.safeParse({ ...row, ownership_verified: row.ownership_verified === 1, stage_display_consent: row.stage_display_consent === 1 });
  if (!participant.success) return null;
  const json = (value: unknown): unknown => {
    try {
      return JSON.parse(String(value));
    } catch {
      return null;
    }
  };
  const claims = (
    db
      .prepare(
        `SELECT id, participant_id, category, name, epistemic_type, proficiency_signal, confidence, uncertainty_note, evidence_receipt_ids, dismissed_by_user
         FROM capability_claims WHERE participant_id = ?`,
      )
      .all(id) as Array<Record<string, unknown>>
  )
    .map((c) => CapabilityClaimSchema.safeParse({ ...c, evidence_receipt_ids: json(c.evidence_receipt_ids), dismissed_by_user: c.dismissed_by_user === 1 }))
    .flatMap((r) => (r.success ? [r.data as CapabilityClaim] : []));
  const needs = (
    db
      .prepare(
        `SELECT id, participant_id, project_repo, opportunity_type, label, summary, desired_capabilities, confidence, uncertainty_note,
                evidence_receipt_ids, dismissed_by_user
         FROM opportunity_needs WHERE participant_id = ?`,
      )
      .all(id) as Array<Record<string, unknown>>
  )
    .map((n) =>
      OpportunityNeedSchema.safeParse({
        ...n,
        desired_capabilities: json(n.desired_capabilities),
        evidence_receipt_ids: json(n.evidence_receipt_ids),
        dismissed_by_user: n.dismissed_by_user === 1,
      }),
    )
    .flatMap((r) => (r.success ? [r.data as OpportunityNeed] : []));
  const evidence = (
    db
      .prepare(
        `SELECT id, participant_id, source_type, source_url, repo_full_name, title_or_summary, source_updated_at, fetched_at
         FROM evidence_receipts WHERE participant_id = ?`,
      )
      .all(id) as Array<Record<string, unknown>>
  )
    .map((r) => EvidenceReceiptSchema.safeParse(r))
    .flatMap((r) => (r.success ? [r.data as EvidenceReceipt] : []));
  return { participant: participant.data as Participant, claims, needs, evidence };
}

/**
 * Loads the matching pool: every consenting participant whose analysis is ready (live and seeds), each once.
 * @param db - Open database.
 * @returns Profiles in id order.
 */
export function loadPool(db: DatabaseSync): ParticipantProfile[] {
  const ids = db
    .prepare("SELECT DISTINCT id FROM participants WHERE consent_status = 'granted' AND analysis_state = 'ready' ORDER BY id")
    .all() as Array<{ id: string }>;
  return ids.flatMap(({ id }) => {
    const profile = loadProfile(db, id);
    return profile ? [profile] : [];
  });
}

/**
 * Re-runs selection over the whole pool and explains (Stage 1) every selected pair that is still a pure
 * candidate. A match a participant has acted on (any intro state other than `candidate`, or an approval)
 * is never re-explained or re-scored, so continuous re-matching cannot undo a decision.
 * @param db - Open database.
 * @param options - Reference time, logger, and the participant whose cards the caller wants back.
 * @returns Stage 1 cards for pairs involving `focusId` (all cards when omitted).
 */
export function rematch(db: DatabaseSync, options: { now: Date; log?: Logger; focusId?: string }): StagedExplanation[] {
  const pool = loadPool(db);
  if (pool.length < 2) return [];
  const selection = selectTopMatches(pool, { now: options.now, db });
  const decided = new Set(
    (db.prepare("SELECT id FROM matches WHERE intro_state <> 'candidate' OR approval_a = 1 OR approval_b = 1").all() as Array<{ id: string }>).map((r) => r.id),
  );
  const open = new Map([...selection].map(([id, pairs]) => [id, pairs.filter((p) => !decided.has(p.match_id))]));
  const cards = explainMatches(open, pool, { now: options.now, db, ...(options.log ? { log: options.log } : {}) });
  return [...cards.values()].filter(
    (c) => !options.focusId || c.proposal.participant_a_id === options.focusId || c.proposal.participant_b_id === options.focusId,
  );
}

/**
 * Records a final analysis failure: the participant is marked `failed` and `analysis.failed` is published.
 * @param db - Open database.
 * @param row - The participant.
 * @param reason - Contract failure reason.
 * @param now - Reference time.
 */
function failAnalysis(db: DatabaseSync, row: ParticipantRow, reason: 'github_user_not_found' | 'github_rate_limited' | 'github_unavailable' | 'analysis_error', now: Date): void {
  setAnalysisState(db, row.id, 'failed', now);
  publishEvent(db, 'analysis.failed', { display_alias: row.display_alias, reason_code: reason }, { occurredAt: now });
}

/**
 * Stage 2 for one analysed participant: model enrichment of capabilities, needs and match explanations.
 * Each step falls back to its Stage 1 result on a missing key, timeout or error (the agents handle that).
 * A changed fingerprint is written back to the snapshot, where `/me` and `/stage` read it.
 * @param db - Open database.
 * @param ctx - The Stage 1 results to enrich.
 * @param deps - Clients, clock, logger, concurrency.
 */
async function runStage2(
  db: DatabaseSync,
  ctx: { id: string; snapshot: GithubSnapshot; capabilities: CapabilityAnalysis; opportunities: OpportunityAnalysis; goal: string | null },
  deps: { llm: LlmClient | null; explanationLlm: ExplanationLlm | null; now: () => Date; log?: Logger; concurrency: number },
): Promise<void> {
  if (!consents(participantRow(db, ctx.id))) return;
  let changed = false;
  const capabilities = await enrichStage2(ctx.capabilities, ctx.snapshot, { client: deps.llm });
  if (capabilities.llm.used && consents(participantRow(db, ctx.id))) {
    persistAnalysis(db, capabilities, { now: deps.now() });
    writeSnapshot(db, { ...ctx.snapshot, fingerprint: capabilities.fingerprint }, { participantId: ctx.id, now: deps.now() });
    changed = true;
  }
  const opportunities = await enrichOpportunities(ctx.opportunities, { snapshot: ctx.snapshot, capabilities, goal: ctx.goal }, { client: deps.llm, now: deps.now() });
  if (opportunities.llm.used && consents(participantRow(db, ctx.id))) {
    persistOpportunities(db, opportunities, capabilities.receipts, { now: deps.now() });
    changed = true;
  }
  if (!consents(participantRow(db, ctx.id))) return;
  const cards = changed ? rematch(db, { now: deps.now(), focusId: ctx.id, ...(deps.log ? { log: deps.log } : {}) }) : rematch(db, { now: deps.now(), focusId: ctx.id });
  if (!deps.explanationLlm) return;
  const llm = deps.explanationLlm;
  await mapWithConcurrency(cards, deps.concurrency, async (card) => {
    const a = loadProfile(db, card.proposal.participant_a_id);
    const b = loadProfile(db, card.proposal.participant_b_id);
    if (!a || !b) return;
    await enrichExplanation(card, a, b, { llm, db, now: deps.now(), ...(deps.log ? { log: deps.log } : {}) });
  });
}

/**
 * Processes one leased job's Stage 1 and returns its outcome. For `participant.analyze` the returned
 * outcome carries the Stage 2 work to run afterwards.
 * @param db - Open database.
 * @param job - The leased job.
 * @param deps - Fetcher, clients, clock, logger, settings.
 * @returns What happened.
 */
export async function processJob(db: DatabaseSync, job: AsyncJob, deps: WorkerDeps = {}): Promise<JobOutcome> {
  const clock = deps.now ?? (() => new Date());
  const settings = (deps.settings ?? (() => getWorkerSettings()))();
  const row = job.participant_id ? participantRow(db, job.participant_id) : undefined;
  if (job.kind !== ANALYZE_JOB_KIND && job.kind !== MATCH_REFRESH_JOB_KIND) {
    finishJob(db, job.id, 'failed', `unknown job kind: ${job.kind}`, clock());
    return { status: 'failed' };
  }
  if (!consents(row)) {
    finishJob(db, job.id, 'succeeded', SKIPPED_CONSENT, clock());
    return { status: 'skipped' };
  }

  if (job.kind === MATCH_REFRESH_JOB_KIND) {
    rematch(db, { now: clock(), focusId: row.id, ...(deps.log ? { log: deps.log } : {}) });
    finishJob(db, job.id, 'succeeded', null, clock());
    return { status: 'succeeded' };
  }

  const websiteUrl = typeof job.payload.website_url === 'string' ? job.payload.website_url : null;
  const goal = typeof job.payload.goal === 'string' && job.payload.goal.trim() ? job.payload.goal.trim() : null;
  setAnalysisState(db, row.id, 'fetching_github', clock());
  let snapshot: GithubSnapshot;
  try {
    ({ snapshot } = await getOrFetchSnapshot(db, row.github_username, {
      participantId: row.id,
      websiteUrl,
      ...fetchOptionsFor(settings.githubFetchMode),
      ...(deps.fetcher ? { fetcher: deps.fetcher } : {}),
    }));
  } catch (error) { // prawduct:allow prawduct/broad-except -- job boundary: every fetch failure becomes a retry or a recorded failure
    const reason = error instanceof GithubFetchError ? error.reason : 'github_unavailable';
    const message = error instanceof Error ? error.message : String(error);
    const transient = reason !== 'github_user_not_found';
    if (transient && job.attempts < MAX_ATTEMPTS) {
      setAnalysisState(db, row.id, 'registered', clock());
      requeueJob(db, job, `${reason}: ${message}`, clock());
      deps.log?.info('worker job retry scheduled', { job_id: job.id, reason, attempts: job.attempts });
      return { status: 'retried' };
    }
    if (consents(participantRow(db, row.id))) failAnalysis(db, row, reason, clock());
    finishJob(db, job.id, 'failed', `${reason}: ${message}`, clock());
    deps.log?.info('worker job failed', { job_id: job.id, reason });
    return { status: 'failed' };
  }

  setAnalysisState(db, row.id, 'analyzing_profile', clock());
  const capabilities = analyzeStage1(snapshot, row.id);
  const persisted = persistAnalysis(db, capabilities, { now: clock() });
  if (persisted.skipped) {
    finishJob(db, job.id, 'succeeded', SKIPPED_CONSENT, clock());
    return { status: 'skipped' };
  }
  const opportunities = discoverStage1({ snapshot, capabilities, goal }, { now: clock() });
  persistOpportunities(db, opportunities, capabilities.receipts, { now: clock() });
  setAnalysisState(db, row.id, 'ready', clock());
  rematch(db, { now: clock(), focusId: row.id, ...(deps.log ? { log: deps.log } : {}) });
  finishJob(db, job.id, 'succeeded', null, clock());

  const llm = deps.llm === undefined ? llmClientFromEnv() : deps.llm;
  const explanationLlm = deps.explanationLlm === undefined ? (geminiClientFromEnv() ?? null) : deps.explanationLlm;
  return {
    status: 'succeeded',
    stage2: () =>
      runStage2(db, { id: row.id, snapshot, capabilities, opportunities, goal }, {
        llm,
        explanationLlm,
        now: clock,
        concurrency: settings.workerConcurrency,
        ...(deps.log ? { log: deps.log } : {}),
      }),
  };
}

/**
 * One worker tick: recovers abandoned jobs, leases up to `workerConcurrency` due jobs, runs their Stage 1
 * with that much parallelism, then starts the Stage 2 enrichments, also bounded by `workerConcurrency`.
 * @param db - Open database.
 * @param deps - Fetcher, clients, clock, logger, settings.
 * @returns Counts, plus a promise for the Stage 2 work.
 */
export async function runWorkerTick(db: DatabaseSync, deps: WorkerDeps = {}): Promise<TickResult> {
  const clock = deps.now ?? (() => new Date());
  const settings = (deps.settings ?? (() => getWorkerSettings()))();
  recoverStaleJobs(db, clock());
  const jobs = leaseJobs(db, settings.workerConcurrency, clock());
  const outcomes = await mapWithConcurrency(jobs, settings.workerConcurrency, async (job) => {
    try {
      return await processJob(db, job, { ...deps, settings: () => settings });
    } catch (error) { // prawduct:allow prawduct/broad-except -- job boundary: one failing job must not stop the tick
      const message = error instanceof Error ? error.message : String(error);
      const row = job.participant_id ? participantRow(db, job.participant_id) : undefined;
      if (job.kind === ANALYZE_JOB_KIND && consents(row)) failAnalysis(db, row, 'analysis_error', clock());
      finishJob(db, job.id, 'failed', message, clock());
      deps.log?.info('worker job crashed', { job_id: job.id, error: message });
      return { status: 'failed' } as JobOutcome;
    }
  });
  const stage2Tasks = outcomes.flatMap((o) => (o.stage2 ? [o.stage2] : []));
  const stage2 = mapWithConcurrency(stage2Tasks, settings.workerConcurrency, async (task) => {
    try {
      await task();
    } catch (error) { // prawduct:allow prawduct/broad-except -- Stage 2 is best-effort; Stage 1 results already stand
      deps.log?.info('worker stage 2 failed', { error: error instanceof Error ? error.message : String(error) });
    }
  }).then(() => undefined);
  const count = (status: JobOutcome['status']): number => outcomes.filter((o) => o.status === status).length;
  return { leased: jobs.length, succeeded: count('succeeded'), skipped: count('skipped'), retried: count('retried'), failed: count('failed'), stage2 };
}

/**
 * Starts the polling worker loop. Stage 2 work runs in the background between ticks.
 * @param db - Open database.
 * @param deps - Worker dependencies, plus the poll interval.
 * @returns A handle whose `stop()` resolves once the current tick and its Stage 2 work have finished.
 */
export function startWorker(db: DatabaseSync, deps: WorkerDeps & { pollMs?: number } = {}): { stop(): Promise<void> } {
  let stopped = false;
  const pending = new Set<Promise<void>>();
  let wake: (() => void) | null = null;
  const loop = (async () => {
    while (!stopped) {
      try {
        const tick = await runWorkerTick(db, deps);
        const tracked = tick.stage2.finally(() => pending.delete(tracked));
        pending.add(tracked);
        if (tick.leased > 0) continue;
      } catch (error) { // prawduct:allow prawduct/broad-except -- the loop must survive a failing tick (e.g. a locked database)
        deps.log?.info('worker tick failed', { error: error instanceof Error ? error.message : String(error) });
      }
      await new Promise<void>((done) => {
        const timer = setTimeout(done, deps.pollMs ?? DEFAULT_POLL_MS);
        wake = () => {
          clearTimeout(timer);
          done();
        };
      });
      wake = null;
    }
  })();
  return {
    async stop() {
      stopped = true;
      (wake as (() => void) | null)?.();
      await loop;
      await Promise.all(pending);
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const log: Logger = {
    info(message, fields) {
      process.stdout.write(`${JSON.stringify({ level: 'info', time: new Date().toISOString(), message, ...fields })}\n`);
    },
  };
  const { db } = openDatabase();
  const worker = startWorker(db, { log });
  log.info('ariadne worker started', { settings: getWorkerSettings() });
  const shutdown = (signal: string): void => {
    log.info('ariadne worker stopping', { signal });
    void worker.stop().then(() => {
      db.close();
      process.exit(0);
    });
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

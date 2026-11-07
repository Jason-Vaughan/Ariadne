import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { OPPORTUNITY_TYPES, OpportunityNeedSchema } from '../contracts/index.ts';
import type { EvidenceReceipt, OpportunityNeed, OpportunityType } from '../contracts/index.ts';
import { publishEvent } from '../events/bus.ts';
import type { PublishResult } from '../events/bus.ts';
import { FINGERPRINT_AXES, FINGERPRINT_AXIS_LABELS, flagshipRepo } from '../github/connector.ts';
import type { FingerprintAxis, FingerprintVector, GithubRepoSummary, GithubSnapshot } from '../github/connector.ts';
import { sanitizeText } from '../github/sanitize.ts';
import { llmClientFromEnv, STAGE2_TIMEOUT_MS } from './capability-agent.ts';
import type { CapabilityAnalysis, LlmClient, Stage2FallbackReason } from './capability-agent.ts';
import { buildOpportunityPrompt, OPPORTUNITY_PROMPT_VERSION, OPPORTUNITY_SYSTEM_PROMPT } from './prompts.ts';
import type { PromptLongText } from './prompts.ts';

export const INFERENCE_LABEL = 'Potential Opportunity (AI Inference)' as const;
export const CONFIRMED_LABEL = 'Participant Confirmed Need' as const;
/** Repository activity older than this makes a need potentially stale. */
export const STALE_AFTER_DAYS = 120;
export const MAX_STAGE1_NEEDS = 6;
export const MAX_STAGE2_NEEDS = 4;
/** An axis at or above this is a strength; at or below `WEAK_AXIS` it is a gap a partner could fill. */
export const STRONG_AXIS = 55;
export const WEAK_AXIS = 30;

export interface OpportunityAnalysis {
  participant_id: string;
  needs: OpportunityNeed[];
  stage: 1 | 2;
  llm: { used: boolean; model: string | null; prompt_version: string | null; fallback_reason: Stage2FallbackReason | null; rejected_needs: number };
  duration_ms: number;
}

export interface OpportunityInput {
  snapshot: GithubSnapshot;
  /** A-004 analysis of the same snapshot: its receipts are what needs cite. */
  capabilities: CapabilityAnalysis;
  /** The participant's optional one-line goal from /join. */
  goal?: string | null;
}

/** Which axes complement a strong axis, and what a collaborator on that axis typically brings. */
const COMPLEMENTS: Record<FingerprintAxis, readonly FingerprintAxis[]> = {
  systems_infra: ['frontend_ux', 'product_gtm'],
  agent_orchestration: ['llm_eval', 'frontend_ux'],
  llm_eval: ['data_pipelines', 'agent_orchestration'],
  frontend_ux: ['systems_infra', 'data_pipelines'],
  product_gtm: ['systems_infra', 'agent_orchestration'],
  data_pipelines: ['frontend_ux', 'llm_eval'],
};

const AXIS_SKILLS: Record<FingerprintAxis, readonly string[]> = {
  systems_infra: ['Backend services', 'Cloud infrastructure', 'Performance engineering'],
  agent_orchestration: ['Agent orchestration', 'Tool integration (MCP)', 'Workflow automation'],
  llm_eval: ['LLM evaluation', 'Prompt engineering', 'Model benchmarking'],
  frontend_ux: ['Frontend (React)', 'UI/UX design', 'Data visualization'],
  product_gtm: ['Product strategy', 'User research', 'Go-to-market'],
  data_pipelines: ['Data pipelines', 'ETL / streaming', 'Analytics'],
};

const HELP_TOPICS = new Set(['help-wanted', 'good-first-issue', 'hacktoberfest', 'contributions-welcome', 'up-for-grabs', 'first-timers-only']);
const HELP_TEXT = /\b(?:help wanted|contributions? (?:are )?welcome|prs? (?:are )?welcome|pull requests? (?:are )?welcome|looking for (?:contributors|collaborators|help|maintainers))\b/i;
const SCALING_TEXT = /\b(?:todo|roadmap|scal(?:e|ing|ability)|performance|bottleneck|rate[- ]limit|throughput|latency|refactor|migrat(?:e|ion)|production[- ]ready)\b/i;

/** Goal keywords → the need type and skills they point at. Checked in order; the first match wins. */
const GOAL_HINTS: readonly { pattern: RegExp; type: OpportunityType; skills: readonly string[] }[] = [
  { pattern: /\b(?:front[- ]?end|ui|ux|design(?:er)?|react|visuali[sz])/i, type: 'complementary_skill_gap', skills: AXIS_SKILLS.frontend_ux },
  { pattern: /\b(?:scal(?:e|ing)|infra|deploy|backend|performance|reliab)/i, type: 'architecture_scaling', skills: AXIS_SKILLS.systems_infra },
  { pattern: /\b(?:eval|benchmark|llm|model|prompt)/i, type: 'complementary_skill_gap', skills: AXIS_SKILLS.llm_eval },
  { pattern: /\b(?:data|pipeline|etl|analytics)/i, type: 'complementary_skill_gap', skills: AXIS_SKILLS.data_pipelines },
  { pattern: /\b(?:research|paper|explor|study)/i, type: 'shared_research_domain', skills: ['Research collaboration'] },
  { pattern: /\b(?:market|growth|launch|customers?|users?|product|go-to-market|gtm)/i, type: 'complementary_skill_gap', skills: AXIS_SKILLS.product_gtm },
  { pattern: /\b(?:agent|orchestrat|mcp|automat)/i, type: 'complementary_skill_gap', skills: AXIS_SKILLS.agent_orchestration },
];

/**
 * Days between a timestamp and now.
 * @param iso - ISO timestamp.
 * @param now - Reference time.
 * @returns Whole days elapsed (0 for unparseable input).
 */
function daysSince(iso: string, now: Date): number {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? Math.max(0, Math.floor((now.getTime() - ms) / 86_400_000)) : 0;
}

/**
 * Adds an explicit age caveat (and lowers confidence) when the project has had no activity for over 120 days.
 * @param need - Draft need fields.
 * @param repo - The project repository.
 * @param now - Reference time.
 * @returns The fields, with the caveat applied when stale.
 */
function withStaleness<T extends { confidence: number; uncertainty_note: string }>(need: T, repo: GithubRepoSummary | undefined, now: Date): T {
  if (!repo) return need;
  const age = daysSince(repo.pushed_at, now);
  if (age <= STALE_AFTER_DAYS) return need;
  return {
    ...need,
    confidence: Math.round(need.confidence * 0.6 * 100) / 100,
    uncertainty_note: sanitizeText(`Stale: ${repo.full_name} last saw activity ${age} days ago (over ${STALE_AFTER_DAYS}), so this need may be outdated. ${need.uncertainty_note}`, 280),
  };
}

// ---------------------------------------------------------------------------
// Stage 1: deterministic needs
// ---------------------------------------------------------------------------

/**
 * Stage 1: derives contract-valid `OpportunityNeed`s without a model, in a few milliseconds:
 * complementary gaps from the fingerprint (strong axes whose partner axes are weak), repositories that invite
 * contributors, scaling/roadmap work named in the README, shared research domains from domain claims, and the
 * participant's own goal (the only `Participant Confirmed Need`). Every need names one of the participant's
 * repositories and cites receipts from the A-004 analysis; repos idle over 120 days carry a staleness caveat.
 * @param input - Snapshot, A-004 analysis and optional goal.
 * @param options - Clock and id generator overrides.
 * @returns A Stage 1 opportunity analysis (empty when the participant has no public repositories).
 */
export function discoverStage1(input: OpportunityInput, options: { now?: Date; newId?: () => string } = {}): OpportunityAnalysis {
  const started = performance.now();
  const now = options.now ?? new Date();
  const newId = options.newId ?? randomUUID;
  const { snapshot, capabilities } = input;
  const participantId = capabilities.participant_id;
  const receipts = capabilities.receipts;
  const repoReceipt = new Map(receipts.filter((r) => r.source_type === 'repo_metadata').map((r) => [r.repo_full_name, r.id]));
  const readmeReceipt = receipts.find((r) => r.source_type === 'readme_excerpt');
  const profileReceipt = receipts.find((r) => r.source_type === 'user_profile');
  const repoByName = new Map(snapshot.repos.map((r) => [r.full_name, r]));
  const flagship = flagshipRepo(snapshot.repos.filter((r) => repoReceipt.has(r.full_name)));
  const result = (needs: OpportunityNeed[]): OpportunityAnalysis => ({
    participant_id: participantId,
    needs,
    stage: 1,
    llm: { used: false, model: null, prompt_version: null, fallback_reason: null, rejected_needs: 0 },
    duration_ms: Math.round(performance.now() - started),
  });
  // The contract requires every need to name a project repository, so a profile without one yields none.
  if (!flagship) return result([]);

  const needs: OpportunityNeed[] = [];
  const seen = new Set<string>();
  const add = (draft: Omit<OpportunityNeed, 'id' | 'participant_id' | 'dismissed_by_user'>): void => {
    const key = `${draft.opportunity_type}:${draft.project_repo}:${draft.desired_capabilities.join('|').toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    needs.push(OpportunityNeedSchema.parse({ id: newId(), participant_id: participantId, dismissed_by_user: false, ...draft }));
  };
  const cite = (...ids: (string | undefined)[]): string[] => [...new Set(ids.filter((id): id is string => Boolean(id)))];

  // 1. The participant's own goal: the only need the participant has confirmed.
  const goal = sanitizeText(input.goal ?? '', 240);
  if (goal) {
    const hint = GOAL_HINTS.find((h) => h.pattern.test(goal));
    add({
      project_repo: flagship.full_name,
      opportunity_type: hint?.type ?? 'complementary_skill_gap',
      label: CONFIRMED_LABEL,
      summary: goal,
      desired_capabilities: [...(hint?.skills ?? ['Complementary collaborator'])],
      confidence: 0.9,
      uncertainty_note: 'Stated by the participant at sign-up; the project shown is their most prominent public repository.',
      evidence_receipt_ids: cite(repoReceipt.get(flagship.full_name)),
    });
  }

  // 2. Repositories that explicitly invite contributors.
  for (const repo of snapshot.repos) {
    const receiptId = repoReceipt.get(repo.full_name);
    if (!receiptId) continue;
    const readmeHere = snapshot.readme?.repo_full_name === repo.full_name ? snapshot.readme.excerpt : '';
    const topicHit = repo.topics.some((t) => HELP_TOPICS.has(t));
    if (!topicHit && !HELP_TEXT.test(`${repo.description} ${readmeHere}`)) continue;
    const skills = repo.language ? [repo.language, ...repo.topics.filter((t) => !HELP_TOPICS.has(t)).slice(0, 3)] : repo.topics.filter((t) => !HELP_TOPICS.has(t)).slice(0, 4);
    add(
      withStaleness(
        {
          project_repo: repo.full_name,
          opportunity_type: 'open_issue_help',
          label: INFERENCE_LABEL,
          summary: sanitizeText(`${repo.full_name} openly invites contributors${repo.description ? `: ${repo.description}` : ''}`, 240),
          desired_capabilities: skills.length > 0 ? skills.map((s) => sanitizeText(s, 80)) : ['General contributions'],
          confidence: 0.7,
          uncertainty_note: 'The repository signals it welcomes contributors; which issues are open right now was not checked.',
          evidence_receipt_ids: cite(receiptId, readmeHere ? readmeReceipt?.id : undefined),
        },
        repo,
        now,
      ),
    );
  }

  // 3. Scaling / roadmap work named in the flagship README.
  if (snapshot.readme && readmeReceipt && SCALING_TEXT.test(snapshot.readme.excerpt)) {
    const repo = repoByName.get(snapshot.readme.repo_full_name);
    const match = SCALING_TEXT.exec(snapshot.readme.excerpt)?.[0]?.toLowerCase() ?? 'scaling';
    add(
      withStaleness(
        {
          project_repo: snapshot.readme.repo_full_name,
          opportunity_type: 'architecture_scaling',
          label: INFERENCE_LABEL,
          summary: sanitizeText(`${snapshot.readme.repo_full_name}'s README mentions ${match} work a systems-minded collaborator could take on`, 240),
          desired_capabilities: [...AXIS_SKILLS.systems_infra],
          confidence: 0.5,
          uncertainty_note: `Inferred from the word "${match}" in the README; the participant has not confirmed this is a current bottleneck.`,
          evidence_receipt_ids: cite(readmeReceipt.id, repoReceipt.get(snapshot.readme.repo_full_name)),
        },
        repo,
        now,
      ),
    );
  }

  // 4. Complementary gaps: a strong axis whose natural partner axes are weak.
  const fingerprint = capabilities.fingerprint;
  const strong = [...FINGERPRINT_AXES].filter((a) => fingerprint[a] >= STRONG_AXIS).sort((a, b) => fingerprint[b] - fingerprint[a]).slice(0, 2);
  let gaps = 0;
  for (const axis of strong) {
    const weak = COMPLEMENTS[axis].filter((c) => fingerprint[c] <= WEAK_AXIS);
    if (weak.length === 0) continue;
    const partner = weak[0] as FingerprintAxis;
    add(
      withStaleness(
        {
          project_repo: flagship.full_name,
          opportunity_type: 'complementary_skill_gap',
          label: INFERENCE_LABEL,
          summary: sanitizeText(
            `Strong ${FINGERPRINT_AXIS_LABELS[axis]} (${fingerprint[axis]}/100) with little public ${FINGERPRINT_AXIS_LABELS[partner]} (${fingerprint[partner]}/100): ${flagship.full_name} would benefit from a ${FINGERPRINT_AXIS_LABELS[partner]} collaborator`,
            240,
          ),
          desired_capabilities: [...AXIS_SKILLS[partner]],
          confidence: 0.55,
          uncertainty_note: `Inferred from missing ${FINGERPRINT_AXIS_LABELS[partner]} signals in public repositories; the participant may have this skill privately.`,
          evidence_receipt_ids: cite(repoReceipt.get(flagship.full_name), profileReceipt?.id),
        },
        repoByName.get(flagship.full_name),
        now,
      ),
    );
    gaps += 1;
    if (gaps === 2) break;
  }

  // 5. Shared research domains from the strongest domain claims.
  const domainClaims = capabilities.claims.filter((c) => c.category === 'domain' && c.epistemic_type !== 'SELF_REPORTED').slice(0, 2);
  for (const claim of domainClaims) {
    const repoIds = claim.evidence_receipt_ids.filter((id) => receipts.some((r) => r.id === id && r.source_type === 'repo_metadata'));
    const project = receipts.find((r) => r.id === repoIds[0])?.repo_full_name;
    if (!project) continue;
    add(
      withStaleness(
        {
          project_repo: project,
          opportunity_type: 'shared_research_domain',
          label: INFERENCE_LABEL,
          summary: sanitizeText(`Actively building in ${claim.name}; a peer exploring the same area could co-develop ${project}`, 240),
          desired_capabilities: [claim.name],
          confidence: 0.5,
          uncertainty_note: `Inferred from ${claim.name} work in public repositories; shared interest is not the same as a stated need.`,
          evidence_receipt_ids: repoIds.filter((id) => receipts.find((r) => r.id === id)?.repo_full_name === project).slice(0, 3),
        },
        repoByName.get(project),
        now,
      ),
    );
  }

  const confirmed = needs.filter((n) => n.label === CONFIRMED_LABEL);
  const inferred = needs.filter((n) => n.label !== CONFIRMED_LABEL).sort((a, b) => b.confidence - a.confidence);
  return result([...confirmed, ...inferred].slice(0, MAX_STAGE1_NEEDS));
}

// ---------------------------------------------------------------------------
// Stage 2: LLM enrichment, closed-world
// ---------------------------------------------------------------------------

const Stage2NeedSchema = z.object({
  opportunity_type: z.enum(OPPORTUNITY_TYPES),
  project_repo: z.string(),
  summary: z.string().min(1).max(1000),
  desired_capabilities: z.array(z.string()).max(20),
  confidence: z.number().min(0).max(1),
  uncertainty_note: z.string().max(1000).nullable().optional(),
  evidence_receipt_ids: z.array(z.string()).min(1).max(20),
});
const Stage2ResponseSchema = z.object({ needs: z.array(Stage2NeedSchema).max(20) });

/**
 * Parses the model's text as JSON, tolerating a fenced code block.
 * @param text - Raw model output.
 * @returns The parsed value, or `undefined`.
 */
function parseModelJson(text: string): unknown {
  try {
    return JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
  } catch {
    return undefined;
  }
}

/**
 * Longer evidence texts (README, website) to show the model, keyed to their receipts.
 * @param snapshot - Snapshot.
 * @param receipts - A-004 receipts.
 * @returns Prompt texts.
 */
function longTextsFor(snapshot: GithubSnapshot, receipts: readonly EvidenceReceipt[]): PromptLongText[] {
  const texts: PromptLongText[] = [];
  const readme = receipts.find((r) => r.source_type === 'readme_excerpt');
  if (readme && snapshot.readme) texts.push({ receipt_id: readme.id, label: `README ${snapshot.readme.repo_full_name}`, text: snapshot.readme.excerpt.slice(0, 2500) });
  const site = receipts.find((r) => r.source_type === 'public_website');
  if (site && snapshot.website) texts.push({ receipt_id: site.id, label: 'Personal website', text: `${snapshot.website.title}\n${snapshot.website.text}`.slice(0, 1200) });
  return texts;
}

/**
 * Stage 2: asks the model for specific bottlenecks and keeps only what it can verify. A need must name one of the
 * participant's repositories and cite receipts from the A-004 analysis (unknown ids are stripped; a need left with
 * none is dropped). Every model need is labelled `Potential Opportunity (AI Inference)`, confidence is capped below
 * 0.8, an uncertainty note is always present, and stale projects get the age caveat. Falls back to Stage 1 on no
 * client, timeout, error or an unusable answer.
 * @param stage1 - Result of `discoverStage1`.
 * @param input - The same input Stage 1 used.
 * @param options - LLM client (default: from env), timeout, clock and id generator.
 * @returns The Stage 2 analysis, or Stage 1 with `llm.fallback_reason`.
 */
export async function enrichOpportunities(
  stage1: OpportunityAnalysis,
  input: OpportunityInput,
  options: { client?: LlmClient | null; timeoutMs?: number; now?: Date; newId?: () => string } = {},
): Promise<OpportunityAnalysis> {
  const started = performance.now();
  const client = options.client === undefined ? llmClientFromEnv() : options.client;
  const fallback = (reason: Stage2FallbackReason, rejected = 0): OpportunityAnalysis => ({
    ...stage1,
    llm: { used: false, model: client?.model ?? null, prompt_version: client ? OPPORTUNITY_PROMPT_VERSION : null, fallback_reason: reason, rejected_needs: rejected },
  });
  if (!client) return fallback('no_client');

  const now = options.now ?? new Date();
  const newId = options.newId ?? randomUUID;
  const { snapshot, capabilities } = input;
  const receiptById = new Map(capabilities.receipts.map((r) => [r.id, r]));
  const repoByName = new Map(snapshot.repos.map((r) => [r.full_name, r]));
  const prompt = buildOpportunityPrompt({
    receipts: capabilities.receipts,
    longTexts: longTextsFor(snapshot, capabilities.receipts),
    fingerprint: capabilities.fingerprint as FingerprintVector,
    claims: capabilities.claims,
    stage1Needs: stage1.needs,
    repos: snapshot.repos.map((r) => r.full_name),
    goal: sanitizeText(input.goal ?? '', 240) || null,
  });

  const signal = AbortSignal.timeout(options.timeoutMs ?? STAGE2_TIMEOUT_MS);
  let raw: string;
  try {
    raw = await new Promise<string>((resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      client.complete({ system: OPPORTUNITY_SYSTEM_PROMPT, prompt, signal }).then(resolve, reject);
    });
  } catch {
    return fallback(signal.aborted ? 'timeout' : 'llm_error');
  }
  const parsed = Stage2ResponseSchema.safeParse(parseModelJson(raw));
  if (!parsed.success) return fallback('invalid_response');

  const seen = new Set(stage1.needs.map((n) => `${n.opportunity_type}:${n.project_repo}:${n.summary.toLowerCase()}`));
  const added: OpportunityNeed[] = [];
  let rejected = 0;
  for (const proposal of parsed.data.needs) {
    const repo = repoByName.get(proposal.project_repo);
    // A receipt about another repository cannot substantiate this project's need: keep receipts for the named repo,
    // plus repo-less context (profile, website), and require at least one tied to the named repo.
    const ids = [...new Set(proposal.evidence_receipt_ids)]
      .filter((id) => {
        const receipt = receiptById.get(id);
        return receipt !== undefined && (receipt.repo_full_name === null || receipt.repo_full_name === proposal.project_repo);
      })
      .slice(0, 5);
    const citesProject = ids.some((id) => receiptById.get(id)?.repo_full_name === proposal.project_repo);
    const summary = sanitizeText(proposal.summary, 240);
    const skills = proposal.desired_capabilities
      .map((s) => sanitizeText(s, 80))
      .filter((s) => s && !/https?:|@|www\./i.test(s))
      .slice(0, 5);
    if (!repo || !citesProject || !summary || /https?:|www\./i.test(summary)) {
      rejected += 1;
      continue;
    }
    const key = `${proposal.opportunity_type}:${repo.full_name}:${summary.toLowerCase()}`;
    if (seen.has(key)) continue;
    const draft = withStaleness(
      {
        project_repo: repo.full_name,
        opportunity_type: proposal.opportunity_type,
        label: INFERENCE_LABEL,
        summary,
        desired_capabilities: skills,
        confidence: Math.min(proposal.confidence, 0.79),
        uncertainty_note: sanitizeText(proposal.uncertainty_note ?? '', 280) || 'Inferred by the model from the cited evidence; the participant has not confirmed it.',
        evidence_receipt_ids: ids,
      },
      repo,
      now,
    );
    const need = OpportunityNeedSchema.safeParse({ id: newId(), participant_id: stage1.participant_id, dismissed_by_user: false, ...draft });
    if (!need.success) {
      rejected += 1;
      continue;
    }
    seen.add(key);
    added.push(need.data);
    if (added.length === MAX_STAGE2_NEEDS) break;
  }
  if (added.length === 0 && parsed.data.needs.length > 0 && rejected === parsed.data.needs.length) return fallback('no_valid_claims', rejected);

  return {
    ...stage1,
    needs: [...stage1.needs, ...added],
    stage: 2,
    llm: { used: true, model: client.model, prompt_version: OPPORTUNITY_PROMPT_VERSION, fallback_reason: null, rejected_needs: rejected },
    duration_ms: stage1.duration_ms + Math.round(performance.now() - started),
  };
}

/**
 * Runs Stage 1 immediately and Stage 2 enrichment with fallback.
 * @param input - Snapshot, A-004 analysis and optional goal.
 * @param options - LLM client, timeout, clock and id generator.
 * @returns The best available opportunity analysis.
 */
export async function discoverOpportunities(
  input: OpportunityInput,
  options: { client?: LlmClient | null; timeoutMs?: number; now?: Date; newId?: () => string } = {},
): Promise<OpportunityAnalysis> {
  return enrichOpportunities(discoverStage1(input, options), input, options);
}

// ---------------------------------------------------------------------------
// Persistence and events
// ---------------------------------------------------------------------------

export interface PersistOpportunitiesResult {
  needs: number;
  events: PublishResult[];
  /** Set when nothing was written because the participant no longer consents. */
  skipped: 'consent_withdrawn' | null;
}

/**
 * Stores an opportunity analysis and (optionally) announces each need. In one transaction it replaces the
 * participant's non-dismissed needs; needs the participant dismissed are kept, and a new need with the same type,
 * project and summary as a dismissed one is not re-added. Cited receipts are inserted if not already stored (A-004's
 * `persistAnalysis` normally stores them first). Then one `opportunity.identified` event is published per stored need,
 * by display alias, with the public identity only under stage display consent.
 * @param db - Open database with the A-001 schema (the participant must exist).
 * @param analysis - Result of `discoverStage1` / `enrichOpportunities` / `discoverOpportunities`.
 * @param receipts - The A-004 receipts the needs cite.
 * @param options - `publish` (default true) and event time.
 * @returns How many needs were stored and the events published; `skipped: 'consent_withdrawn'` (nothing written or
 *   published) when the participant has withdrawn consent.
 * @throws If the participant does not exist (nothing is written).
 */
export function persistOpportunities(
  db: DatabaseSync,
  analysis: OpportunityAnalysis,
  receipts: readonly EvidenceReceipt[],
  options: { publish?: boolean; now?: Date } = {},
): PersistOpportunitiesResult {
  const participant = db
    .prepare('SELECT display_alias, github_username, avatar_url, stage_display_consent, consent_status, analysis_state FROM participants WHERE id = ?')
    .get(analysis.participant_id) as
    | { display_alias: string; github_username: string; avatar_url: string | null; stage_display_consent: number; consent_status: string; analysis_state: string }
    | undefined;
  if (!participant) throw new Error(`Participant ${analysis.participant_id} does not exist`);
  // A queued analysis can finish after the participant withdrew: fail closed before any write or event.
  if (participant.consent_status !== 'granted' || participant.analysis_state === 'withdrawn') {
    return { needs: 0, events: [], skipped: 'consent_withdrawn' };
  }

  const stored: OpportunityNeed[] = [];
  db.exec('BEGIN IMMEDIATE');
  try {
    const dismissed = new Set(
      (
        db.prepare('SELECT opportunity_type, project_repo, summary FROM opportunity_needs WHERE participant_id = ? AND dismissed_by_user = 1').all(analysis.participant_id) as {
          opportunity_type: string;
          project_repo: string;
          summary: string;
        }[]
      ).map((row) => `${row.opportunity_type}:${row.project_repo}:${row.summary.toLowerCase()}`),
    );
    db.prepare('DELETE FROM opportunity_needs WHERE participant_id = ? AND dismissed_by_user = 0').run(analysis.participant_id);
    const cited = new Set(analysis.needs.flatMap((n) => n.evidence_receipt_ids));
    const insertReceipt = db.prepare(
      `INSERT INTO evidence_receipts (id, participant_id, source_type, source_url, repo_full_name, title_or_summary, source_updated_at, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING`,
    );
    for (const r of receipts) {
      if (cited.has(r.id) && r.participant_id === analysis.participant_id) {
        insertReceipt.run(r.id, r.participant_id, r.source_type, r.source_url, r.repo_full_name, r.title_or_summary, r.source_updated_at, r.fetched_at);
      }
    }
    const insertNeed = db.prepare(
      `INSERT INTO opportunity_needs (id, participant_id, project_repo, opportunity_type, label, summary, desired_capabilities, confidence, uncertainty_note, evidence_receipt_ids, dismissed_by_user)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    );
    for (const n of analysis.needs) {
      if (dismissed.has(`${n.opportunity_type}:${n.project_repo}:${n.summary.toLowerCase()}`)) continue;
      insertNeed.run(n.id, n.participant_id, n.project_repo, n.opportunity_type, n.label, n.summary, JSON.stringify(n.desired_capabilities), n.confidence, n.uncertainty_note, JSON.stringify(n.evidence_receipt_ids));
      stored.push(n);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  const events: PublishResult[] = [];
  if (options.publish ?? true) {
    const display =
      participant.stage_display_consent === 1
        ? { display: { stage_display_consent: true as const, github_username: participant.github_username, avatar_url: participant.avatar_url } }
        : {};
    for (const need of stored) {
      events.push(
        publishEvent(db, 'opportunity.identified', { display_alias: participant.display_alias, ...display, opportunity_type: need.opportunity_type }, { occurredAt: options.now }),
      );
    }
  }
  return { needs: stored.length, events, skipped: null };
}

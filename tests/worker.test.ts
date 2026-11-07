import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { openDatabase } from '../src/db/client.ts';
import { readEventsAfter } from '../src/events/bus.ts';
import { GithubFetchError } from '../src/github/connector.ts';
import type { GithubSnapshot } from '../src/github/connector.ts';
import type { LlmClient } from '../src/intelligence/capability-agent.ts';
import type { ExplanationLlm } from '../src/matching/explanation-agent.ts';
import { ANALYZE_JOB_KIND, getAdmissionPolicy, setAdmissionPolicy } from '../src/routes/onboarding.ts';
import { MATCH_REFRESH_JOB_KIND } from '../src/routes/me.ts';
import { setSeedMode, SEED_COUNT } from '../src/routes/stage-snapshot.ts';
import { applyCapacityUpdate, capacityProfile, capacityState, prewarmVips, ROOM_CAPACITY_PRESETS, validateCapacityUpdate, validatePrewarm } from '../src/routes/admin.ts';
import { startServer } from '../src/server.ts';
import {
  DEFAULT_WORKER_SETTINGS,
  fetchOptionsFor,
  getWorkerSettings,
  hydratePendingSeeds,
  Limiter,
  leaseJobs,
  loadPool,
  mapWithConcurrency,
  MAX_ATTEMPTS,
  processJob,
  recoverStaleJobs,
  rematch,
  runWorkerTick,
  setWorkerSettings,
  startWorker,
  SKIPPED_CONSENT,
  STALE_RUNNING_MS,
} from '../src/worker/job-runner.ts';
import type { WorkerDeps, WorkerSettings } from '../src/worker/job-runner.ts';
import { hydrateSeedPersonas, loadSeedPersonas, seedSnapshot } from '../src/worker/seed-personas.ts';

const NOW = new Date('2026-11-07T12:00:00Z');
const JSON_HEADERS = { 'content-type': 'application/json' };
const SETTINGS_DIR = mkdtempSync(join(tmpdir(), 'ariadne-worker-settings-'));
process.env.ARIADNE_WORKER_SETTINGS_PATH = join(SETTINGS_DIR, 'worker-settings.json');
process.once('exit', () => rmSync(SETTINGS_DIR, { recursive: true, force: true }));
let serial = 0;

/**
 * Opens a fresh WAL database with the A-001 schema in a temp directory.
 * @returns The handle.
 */
function freshDb(): DatabaseSync {
  const dir = mkdtempSync(join(tmpdir(), 'ariadne-worker-'));
  process.once('exit', () => rmSync(dir, { recursive: true, force: true }));
  return openDatabase({ path: join(dir, 'ariadne.db') }).db;
}

/**
 * A valid UUID that sorts after the seed ids.
 * @returns The id.
 */
function nextId(): string {
  serial += 1;
  return `a${serial.toString(16).padStart(7, '0')}-0000-4000-8000-000000000000`;
}

interface Live {
  id: string;
  alias: string;
  login: string;
}

/**
 * Inserts a registered live participant, as onboarding does.
 * @param db - Open database.
 * @param options - Consent state.
 * @returns Its identity.
 */
function addParticipant(db: DatabaseSync, options: { withdrawn?: boolean } = {}): Live {
  const id = nextId();
  const alias = `Live-${(0x1000 + serial).toString(16).toUpperCase()}`;
  const login = `live-builder-${serial}`;
  const at = NOW.toISOString();
  db.prepare(
    `INSERT INTO participants (id, display_alias, github_username, consent_status, consent_granted_at, analysis_state, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, alias, login, options.withdrawn ? 'withdrawn' : 'granted', at, options.withdrawn ? 'withdrawn' : 'registered', at, at);
  return { id, alias, login };
}

/**
 * Queues a job, as onboarding and /me do.
 * @param db - Open database.
 * @param kind - Job kind.
 * @param participantId - Subject participant.
 * @param payload - Job payload.
 * @param runAfter - When it becomes due.
 * @returns The job id.
 */
function enqueue(db: DatabaseSync, kind: string, participantId: string | null, payload: Record<string, unknown> = {}, runAfter: Date = NOW): string {
  const id = nextId();
  db.prepare(
    `INSERT INTO async_jobs (id, kind, participant_id, status, payload_json, attempts, run_after, created_at, updated_at)
     VALUES (?, ?, ?, 'queued', ?, 0, ?, ?, ?)`,
  ).run(id, kind, participantId, JSON.stringify(payload), runAfter.toISOString(), NOW.toISOString(), NOW.toISOString());
  return id;
}

/**
 * Reads a job row.
 * @param db - Open database.
 * @param id - Job id.
 * @returns Status, attempts, note and due time.
 */
function job(db: DatabaseSync, id: string): { status: string; attempts: number; last_error: string | null; run_after: string } {
  return db.prepare('SELECT status, attempts, last_error, run_after FROM async_jobs WHERE id = ?').get(id) as never;
}

/**
 * Reads a participant's analysis state.
 * @param db - Open database.
 * @param id - Participant id.
 * @returns The state.
 */
function state(db: DatabaseSync, id: string): string {
  return (db.prepare('SELECT analysis_state FROM participants WHERE id = ?').get(id) as { analysis_state: string }).analysis_state;
}

/**
 * A fetcher that serves a RAG-builder snapshot for any login. It sits in the LLM/agent cluster whose
 * A-004 claim names and A-005 need labels overlap, so its matches against the seeds actually surface.
 * @returns The fetcher and how often it was called.
 */
function ragFetcher(): { fetcher: NonNullable<WorkerDeps['fetcher']>; calls: string[] } {
  const persona = loadSeedPersonas().find((p) => p.n === 11)!;
  const calls: string[] = [];
  return {
    calls,
    fetcher: async (username) => {
      calls.push(username);
      return seedSnapshot(persona, { id: 'x', display_alias: 'Live-0001', github_username: username }, NOW);
    },
  };
}

const settings = (overrides: Partial<WorkerSettings> = {}): (() => WorkerSettings) => () => ({ ...DEFAULT_WORKER_SETTINGS, ...overrides });
const offline: WorkerDeps = { llm: null, explanationLlm: null, now: () => NOW, settings: settings() };

/**
 * A database with the 25 seeds enabled and hydrated, so a live participant has someone to match.
 * @returns The handle.
 */
function seededDb(): DatabaseSync {
  const db = freshDb();
  setSeedMode(db, true, NOW);
  hydrateSeedPersonas(db, { now: NOW });
  return db;
}

describe('job leasing', () => {
  test('leases only due queued jobs, oldest first, marks them running and counts the attempt', () => {
    const db = freshDb();
    const p = addParticipant(db);
    const early = enqueue(db, MATCH_REFRESH_JOB_KIND, p.id, {}, new Date(NOW.getTime() - 2000));
    const later = enqueue(db, MATCH_REFRESH_JOB_KIND, p.id, {}, new Date(NOW.getTime() - 1000));
    const future = enqueue(db, MATCH_REFRESH_JOB_KIND, p.id, {}, new Date(NOW.getTime() + 60_000));
    const leased = leaseJobs(db, 10, NOW);
    assert.deepEqual(leased.map((j) => j.id), [early, later]);
    assert.deepEqual(leased.map((j) => j.attempts), [1, 1]);
    assert.equal(job(db, early).status, 'running');
    assert.equal(job(db, future).status, 'queued');
    assert.deepEqual(leaseJobs(db, 10, NOW), [], 'a running job is not leased twice');
    db.close();
  });

  test('respects the lease limit', () => {
    const db = freshDb();
    const p = addParticipant(db);
    for (let i = 0; i < 5; i++) enqueue(db, MATCH_REFRESH_JOB_KIND, p.id);
    assert.equal(leaseJobs(db, 3, NOW).length, 3);
    assert.equal(leaseJobs(db, 3, NOW).length, 2);
    db.close();
  });

  test('a job abandoned by a crashed worker returns to the queue', () => {
    const db = freshDb();
    const p = addParticipant(db);
    const crashedAt = new Date(NOW.getTime() - STALE_RUNNING_MS - 1000);
    const id = enqueue(db, MATCH_REFRESH_JOB_KIND, p.id, {}, crashedAt);
    assert.equal(leaseJobs(db, 1, crashedAt).length, 1);
    assert.deepEqual(recoverStaleJobs(db, NOW), { requeued: 1, abandoned: 0 });
    assert.equal(job(db, id).status, 'queued');
    db.close();
  });

  test('a job that keeps crashing the worker is given up after MAX_ATTEMPTS', () => {
    const db = freshDb();
    const p = addParticipant(db);
    const crashedAt = new Date(NOW.getTime() - STALE_RUNNING_MS - 1000);
    const id = enqueue(db, MATCH_REFRESH_JOB_KIND, p.id, {}, crashedAt);
    db.prepare("UPDATE async_jobs SET status = 'running', attempts = ?, updated_at = ? WHERE id = ?").run(MAX_ATTEMPTS, crashedAt.toISOString(), id);
    const lines: string[] = [];
    assert.deepEqual(recoverStaleJobs(db, NOW, { info: (m) => void lines.push(m) }), { requeued: 0, abandoned: 1 });
    assert.equal(job(db, id).status, 'failed');
    assert.match(job(db, id).last_error ?? '', /abandoned/);
    assert.deepEqual(lines, ['worker recovered stale jobs']);
    db.close();
  });

  test('the shared limiter caps concurrent work across independent callers', async () => {
    const limiter = new Limiter(() => 2);
    let peak = 0;
    const task = async (): Promise<void> => {
      peak = Math.max(peak, limiter.inFlight);
      await new Promise((r) => setTimeout(r, 5));
    };
    await Promise.all([1, 2, 3].map(() => Promise.all([limiter.run(task), limiter.run(task)])));
    assert.equal(peak, 2);
  });

  test('mapWithConcurrency never exceeds the limit and keeps order', async () => {
    let inFlight = 0;
    let peak = 0;
    const out = await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return n * 2;
    });
    assert.deepEqual(out, [2, 4, 6, 8, 10, 12, 14]);
    assert.equal(peak, 3);
  });
});

describe('consent gate', () => {
  test('a job for a withdrawn participant is skipped without fetching or matching', async () => {
    const db = seededDb();
    const p = addParticipant(db, { withdrawn: true });
    const id = enqueue(db, ANALYZE_JOB_KIND, p.id, { github_username: p.login, website_url: null, goal: null });
    const { fetcher, calls } = ragFetcher();
    const tick = await runWorkerTick(db, { ...offline, fetcher });
    await tick.stage2;
    assert.equal(tick.skipped, 1);
    assert.equal(job(db, id).status, 'succeeded');
    assert.equal(job(db, id).last_error, SKIPPED_CONSENT);
    assert.deepEqual(calls, []);
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM matches WHERE participant_a_id = ? OR participant_b_id = ?').get(p.id, p.id) as { n: number }).n, 0);
    db.close();
  });

  test('an unknown job kind fails and is not retried', async () => {
    const db = freshDb();
    const p = addParticipant(db);
    const id = enqueue(db, 'something.else', p.id);
    const tick = await runWorkerTick(db, offline);
    assert.equal(tick.failed, 1);
    assert.equal(job(db, id).status, 'failed');
    assert.match(job(db, id).last_error ?? '', /unknown job kind/);
    db.close();
  });
});

describe('participant.analyze', () => {
  test('Stage 1 stores the analysis, marks the participant ready, and explains and announces its matches', async () => {
    const db = seededDb();
    const p = addParticipant(db);
    const id = enqueue(db, ANALYZE_JOB_KIND, p.id, { github_username: p.login, website_url: null, goal: 'Find someone to evaluate my RAG answers' });
    const { fetcher, calls } = ragFetcher();
    const before = readEventsAfter(db, 0).length;
    const tick = await runWorkerTick(db, { ...offline, fetcher });
    await tick.stage2;
    assert.equal(tick.succeeded, 1);
    assert.equal(job(db, id).status, 'succeeded');
    assert.deepEqual(calls, [p.login]);
    assert.equal(state(db, p.id), 'ready');
    assert.ok((db.prepare('SELECT COUNT(*) AS n FROM capability_claims WHERE participant_id = ?').get(p.id) as { n: number }).n > 0);
    const confirmed = db.prepare("SELECT summary FROM opportunity_needs WHERE participant_id = ? AND label = 'Participant Confirmed Need'").all(p.id) as Array<{ summary: string }>;
    assert.deepEqual(confirmed.map((n) => n.summary), ['Find someone to evaluate my RAG answers']);
    const snapshot = db.prepare('SELECT payload_json FROM github_snapshots WHERE github_username = ?').get(p.login) as { payload_json: string };
    assert.ok(JSON.parse(snapshot.payload_json).fingerprint.llm_eval > 0);
    const matches = db.prepare('SELECT id, intro_state FROM matches WHERE participant_a_id = ? OR participant_b_id = ?').all(p.id, p.id) as Array<{ id: string }>;
    assert.ok(matches.length >= 1, 'the live participant is matched against the seeds');
    const types = readEventsAfter(db, 0).slice(before).map((e) => e.type);
    for (const type of ['profile.analysis.completed', 'match.evaluated'] as const) assert.ok(types.includes(type), type);
    db.close();
  });

  test('a transient GitHub failure retries with backoff, then fails and announces it', async () => {
    const db = freshDb();
    const p = addParticipant(db);
    const id = enqueue(db, ANALYZE_JOB_KIND, p.id, { github_username: p.login });
    const fetcher: WorkerDeps['fetcher'] = async () => {
      throw new GithubFetchError('github_rate_limited', 'rate limited');
    };
    let at = NOW;
    for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt++) {
      const tick = await runWorkerTick(db, { ...offline, fetcher, now: () => at });
      assert.equal(tick.retried, 1, `attempt ${attempt}`);
      assert.equal(job(db, id).status, 'queued');
      assert.equal(state(db, p.id), 'registered');
      assert.ok(job(db, id).run_after > at.toISOString(), 'backoff pushes run_after into the future');
      at = new Date(job(db, id).run_after);
    }
    const last = await runWorkerTick(db, { ...offline, fetcher, now: () => at });
    assert.equal(last.failed, 1);
    assert.equal(job(db, id).status, 'failed');
    assert.equal(state(db, p.id), 'failed');
    const failed = readEventsAfter(db, 0).filter((e) => e.type === 'analysis.failed');
    assert.deepEqual(failed.map((e) => e.payload), [{ display_alias: p.alias, reason_code: 'github_rate_limited' }]);
    db.close();
  });

  test('an unknown GitHub user fails at once without retrying', async () => {
    const db = freshDb();
    const p = addParticipant(db);
    const id = enqueue(db, ANALYZE_JOB_KIND, p.id, { github_username: p.login });
    const fetcher: WorkerDeps['fetcher'] = async () => {
      throw new GithubFetchError('github_user_not_found', 'no such user');
    };
    const tick = await runWorkerTick(db, { ...offline, fetcher });
    assert.equal(tick.failed, 1);
    assert.equal(job(db, id).attempts, 1);
    assert.equal(state(db, p.id), 'failed');
    db.close();
  });

  test('Stage 2 writes a model-refined fingerprint back to the snapshot and upgrades match cards', async () => {
    const db = seededDb();
    const p = addParticipant(db);
    enqueue(db, ANALYZE_JOB_KIND, p.id, { github_username: p.login });
    const { fetcher } = ragFetcher();
    const llm: LlmClient = {
      model: 'fake',
      complete: async () =>
        JSON.stringify({ claims: [], fingerprint: { systems_infra: 10, agent_orchestration: 40, llm_eval: 95, frontend_ux: 5, product_gtm: 20, data_pipelines: 60 } }),
    };
    const prompts: string[] = [];
    const explanationLlm: ExplanationLlm = {
      async complete(prompt) {
        prompts.push(prompt);
        const ids = [...prompt.matchAll(/id=(\S+) side=(a|b)/g)];
        const a = ids.find((m) => m[2] === 'a')![1];
        const b = ids.find((m) => m[2] === 'b')![1];
        const aliases = [...prompt.matchAll(/^((?:Live|Seed)-[0-9A-F]{4}): capabilities/gm)].map((m) => m[1]);
        return JSON.stringify({
          why_you_match: 'Your stacks meet in the realtime media path.',
          collaboration_angle: `For 15 minutes, ${aliases[0]} and ${aliases[1]} wire one audio track through the transport.`,
          cited_receipt_ids: [a, b],
        });
      },
    };
    const before = readEventsAfter(db, 0).length;
    const tick = await runWorkerTick(db, { ...offline, fetcher, llm, explanationLlm });
    const baseline = JSON.parse((db.prepare('SELECT payload_json FROM github_snapshots WHERE github_username = ?').get(p.login) as { payload_json: string }).payload_json).fingerprint;
    await tick.stage2;
    const refined = JSON.parse((db.prepare('SELECT payload_json FROM github_snapshots WHERE github_username = ?').get(p.login) as { payload_json: string }).payload_json).fingerprint;
    assert.notDeepEqual(refined, baseline);
    assert.ok(prompts.length >= 1, 'match explanations were enriched');
    const evaluated = readEventsAfter(db, 0).slice(before).filter((e) => e.type === 'match.evaluated');
    assert.ok(evaluated.length >= 2, 'stage 1 and stage 2 refreshes were announced');
    db.close();
  });
});

describe('two-stage timing and fallback', () => {
  test('Stage 1 matches are stored and announced in under 500 ms, before Stage 2 finishes', async () => {
    const db = seededDb();
    const p = addParticipant(db);
    enqueue(db, ANALYZE_JOB_KIND, p.id, { github_username: p.login });
    const { fetcher } = ragFetcher();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const slow: ExplanationLlm = { complete: async () => (await gate, 'not json') };
    const before = readEventsAfter(db, 0).length;
    const started = performance.now();
    const tick = await runWorkerTick(db, { ...offline, fetcher, explanationLlm: slow });
    const stage1Ms = performance.now() - started;
    let stage2Done = false;
    void tick.stage2.then(() => (stage2Done = true));
    assert.ok(stage1Ms < 500, `stage 1 took ${stage1Ms.toFixed(1)} ms`);
    assert.ok(readEventsAfter(db, 0).slice(before).some((e) => e.type === 'match.evaluated'));
    assert.equal(stage2Done, false, 'Stage 2 is still waiting on the model');
    release();
    await tick.stage2;
    db.close();
  });

  test('when every model times out, Stage 1 stands and nothing errors', async () => {
    const db = seededDb();
    const p = addParticipant(db);
    const id = enqueue(db, ANALYZE_JOB_KIND, p.id, { github_username: p.login });
    const { fetcher } = ragFetcher();
    const hang = <T,>(): Promise<T> => new Promise<T>(() => {});
    const llm: LlmClient = { model: 'hang', complete: () => hang<string>() };
    const explanationLlm: ExplanationLlm = { complete: () => hang<string>() };
    const lines: Array<[string, Record<string, unknown> | undefined]> = [];
    // A-004/A-005 time out via AbortSignal.timeout, whose timer is unref'd; keep the loop alive as the worker's poll timer does.
    const keepAlive = setInterval(() => {}, 5);
    const tick = await runWorkerTick(db, { ...offline, fetcher, llm, explanationLlm, stage2TimeoutMs: 20, log: { info: (m, f) => void lines.push([m, f]) } });
    const fingerprint = (db.prepare('SELECT payload_json FROM github_snapshots WHERE github_username = ?').get(p.login) as { payload_json: string }).payload_json;
    await tick.stage2;
    clearInterval(keepAlive);
    assert.equal(job(db, id).status, 'succeeded');
    assert.equal(state(db, p.id), 'ready');
    assert.equal((db.prepare('SELECT payload_json FROM github_snapshots WHERE github_username = ?').get(p.login) as { payload_json: string }).payload_json, fingerprint);
    assert.ok(!lines.some(([m]) => m === 'worker stage 2 failed'));
    assert.ok(lines.some(([, f]) => f?.reason === 'timeout'), 'match enrichment timed out and fell back');
    db.close();
  });

  test('a participant who withdraws mid-analysis gets nothing stored', async () => {
    const db = seededDb();
    const p = addParticipant(db);
    const id = enqueue(db, ANALYZE_JOB_KIND, p.id, { github_username: p.login });
    const { fetcher: inner } = ragFetcher();
    const fetcher: WorkerDeps['fetcher'] = async (u, o) => {
      db.prepare("UPDATE participants SET consent_status = 'withdrawn', analysis_state = 'withdrawn' WHERE id = ?").run(p.id);
      return inner(u, o);
    };
    const tick = await runWorkerTick(db, { ...offline, fetcher });
    await tick.stage2;
    assert.equal(job(db, id).last_error, SKIPPED_CONSENT);
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM capability_claims WHERE participant_id = ?').get(p.id) as { n: number }).n, 0);
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM matches WHERE participant_a_id = ? OR participant_b_id = ?').get(p.id, p.id) as { n: number }).n, 0);
    db.close();
  });

  test('a job that throws is failed and announced, and the tick carries on', async () => {
    const db = freshDb();
    const p = addParticipant(db);
    const id = enqueue(db, ANALYZE_JOB_KIND, p.id, { github_username: p.login });
    const other = addParticipant(db);
    const ok = enqueue(db, MATCH_REFRESH_JOB_KIND, other.id);
    // The fetch succeeds, but A-004 cannot analyse a repo with no topics list: an unexpected crash, not an outage.
    const { fetcher: inner } = ragFetcher();
    const fetcher: WorkerDeps['fetcher'] = async (u, o) => {
      const snapshot = await inner(u, o);
      return { ...snapshot, repos: snapshot.repos.map((r) => ({ ...r, topics: null })) } as unknown as GithubSnapshot;
    };
    const tick = await runWorkerTick(db, { ...offline, fetcher });
    assert.equal(tick.failed, 1);
    assert.equal(job(db, id).status, 'failed');
    assert.equal(job(db, ok).status, 'succeeded');
    assert.equal(state(db, p.id), 'failed');
    assert.deepEqual(readEventsAfter(db, 0).filter((e) => e.type === 'analysis.failed').map((e) => e.payload), [{ display_alias: p.alias, reason_code: 'analysis_error' }]);
    db.close();
  });

  test('the worker loop processes due jobs and stops cleanly', async () => {
    const db = freshDb();
    const p = addParticipant(db);
    const id = enqueue(db, MATCH_REFRESH_JOB_KIND, p.id);
    const worker = startWorker(db, { ...offline, now: () => new Date(), pollMs: 10 });
    const deadline = Date.now() + 3000;
    while (job(db, id).status !== 'succeeded' && Date.now() < deadline) await new Promise((r) => setTimeout(r, 10));
    await worker.stop();
    assert.equal(job(db, id).status, 'succeeded');
    db.close();
  });

  test('seeds added without profiles (stage HUD toggle) are hydrated on the next tick', async () => {
    const db = freshDb();
    setSeedMode(db, true, NOW);
    assert.equal(hydratePendingSeeds(db, NOW), SEED_COUNT);
    assert.equal(hydratePendingSeeds(db, NOW), 0, 'already hydrated');
    assert.ok((db.prepare('SELECT COUNT(*) AS n FROM matches').get() as { n: number }).n > 0);
    db.close();
  });
});

describe('re-matching', () => {
  test('matches.refresh re-runs selection for the participant', async () => {
    const db = seededDb();
    const p = addParticipant(db);
    enqueue(db, ANALYZE_JOB_KIND, p.id, { github_username: p.login });
    const { fetcher } = ragFetcher();
    await (await runWorkerTick(db, { ...offline, fetcher })).stage2;
    db.prepare('DELETE FROM matches WHERE participant_a_id = ? OR participant_b_id = ?').run(p.id, p.id);
    const id = enqueue(db, MATCH_REFRESH_JOB_KIND, p.id, { reason: 'dismissed', table: 'capability_claims', id: 'x' });
    const tick = await runWorkerTick(db, offline);
    assert.equal(tick.succeeded, 1);
    assert.equal(job(db, id).status, 'succeeded');
    assert.ok((db.prepare('SELECT COUNT(*) AS n FROM matches WHERE participant_a_id = ? OR participant_b_id = ?').get(p.id, p.id) as { n: number }).n >= 1);
    db.close();
  });

  test('a match a participant has acted on is never re-scored or re-explained', async () => {
    const db = seededDb();
    rematch(db, { now: NOW });
    const target = db.prepare('SELECT id FROM matches ORDER BY id LIMIT 1').get() as { id: string };
    db.prepare(
      "UPDATE matches SET intro_state = 'proposed_by_a', approval_a = 1, composite_score = 99, complementary_summary = 'kept', updated_at = '2000-01-01T00:00:00.000Z' WHERE id = ?",
    ).run(target.id);
    rematch(db, { now: new Date(NOW.getTime() + 60_000) });
    const after = db.prepare('SELECT intro_state, approval_a, composite_score, complementary_summary, updated_at FROM matches WHERE id = ?').get(target.id);
    assert.deepEqual({ ...after }, { intro_state: 'proposed_by_a', approval_a: 1, composite_score: 99, complementary_summary: 'kept', updated_at: '2000-01-01T00:00:00.000Z' });
    db.close();
  });

  test('the pool holds each consenting, ready participant once', () => {
    const db = seededDb();
    addParticipant(db);
    const pool = loadPool(db);
    assert.equal(pool.length, SEED_COUNT);
    assert.equal(new Set(pool.map((p) => p.participant.id)).size, pool.length);
    db.close();
  });
});

describe('seed personas', () => {
  test('the seed file defines every reserved seed exactly once', () => {
    const personas = loadSeedPersonas();
    assert.deepEqual(personas.map((p) => p.n), Array.from({ length: SEED_COUNT }, (_, i) => i + 1));
  });

  test('hydration gives every seed claims, evidence and a fingerprint, and re-hydrating is stable', () => {
    const db = freshDb();
    setSeedMode(db, true, NOW);
    const first = hydrateSeedPersonas(db, { now: NOW });
    assert.equal(first.hydrated, SEED_COUNT);
    for (const row of db.prepare('SELECT id FROM participants').all() as Array<{ id: string }>) {
      assert.ok((db.prepare('SELECT COUNT(*) AS n FROM capability_claims WHERE participant_id = ?').get(row.id) as { n: number }).n > 0, row.id);
      assert.ok((db.prepare('SELECT COUNT(*) AS n FROM evidence_receipts WHERE participant_id = ?').get(row.id) as { n: number }).n > 0, row.id);
      assert.ok(db.prepare('SELECT 1 FROM github_snapshots WHERE participant_id = ?').get(row.id), row.id);
    }
    const ids = (db.prepare('SELECT id FROM capability_claims ORDER BY id').all() as Array<{ id: string }>).map((r) => r.id);
    hydrateSeedPersonas(db, { now: NOW });
    assert.deepEqual((db.prepare('SELECT id FROM capability_claims ORDER BY id').all() as Array<{ id: string }>).map((r) => r.id), ids);
    assert.equal(readEventsAfter(db, 0).length, 0, 'hydration publishes nothing');
    db.close();
  });

  test('seeds are scorable: the seeded pool produces surfaced matches', () => {
    const db = seededDb();
    const cards = rematch(db, { now: NOW });
    assert.ok(cards.length >= 1);
    for (const card of cards) assert.ok(card.proposal.composite_score >= 45);
    db.close();
  });
});

describe('worker settings', () => {
  test('round-trips valid presets and rejects anything else without writing', () => {
    const path = join(SETTINGS_DIR, 'roundtrip.json');
    assert.deepEqual(getWorkerSettings(path), DEFAULT_WORKER_SETTINGS);
    assert.deepEqual(setWorkerSettings({ workerConcurrency: 24, githubFetchMode: 'fast-rest-top5' }, path), { workerConcurrency: 24, githubFetchMode: 'fast-rest-top5' });
    assert.throws(() => setWorkerSettings({ workerConcurrency: 12 }, path), /workerConcurrency/);
    assert.throws(() => setWorkerSettings({ githubFetchMode: 'graphql' }, path), /githubFetchMode/);
    assert.deepEqual(getWorkerSettings(path), { workerConcurrency: 24, githubFetchMode: 'fast-rest-top5' });
    writeFileSync(path, '{ not json');
    assert.deepEqual(getWorkerSettings(path), DEFAULT_WORKER_SETTINGS);
  });

  test('fetch modes map onto the connector budget', () => {
    assert.deepEqual(fetchOptionsFor('full-graphql'), {});
    assert.deepEqual(fetchOptionsFor('fast-rest-top5'), { maxCalls: 2, timeoutMs: 1500 });
  });

  test('a tick leases at most workerConcurrency jobs', async () => {
    const db = freshDb();
    const p = addParticipant(db);
    for (let i = 0; i < 12; i++) enqueue(db, MATCH_REFRESH_JOB_KIND, p.id);
    const tick = await runWorkerTick(db, { ...offline, settings: settings({ workerConcurrency: 8 }) });
    assert.equal(tick.leased, 8);
    db.close();
  });
});

describe('/admin capacity controller', () => {
  test('validation rejects unknown fields and non-preset values', () => {
    assert.throws(() => validateCapacityUpdate({ maxRoomCapacity: 31 }), /maxRoomCapacity/);
    assert.throws(() => validateCapacityUpdate({ workerConcurrency: 10 }), /workerConcurrency/);
    assert.throws(() => validateCapacityUpdate({ githubFetchMode: 'x' }), /githubFetchMode/);
    assert.throws(() => validateCapacityUpdate({ intakeLocked: 'yes' }), /intakeLocked/);
    assert.throws(() => validateCapacityUpdate({ debug: true }), /unknown fields/);
    for (const preset of ROOM_CAPACITY_PRESETS) validateCapacityUpdate({ maxRoomCapacity: preset });
  });

  test('applying an update changes admission, worker settings and the seed pool', () => {
    const db = freshDb();
    const original = getAdmissionPolicy();
    try {
      applyCapacityUpdate(db, validateCapacityUpdate({ maxRoomCapacity: 80, intakeLocked: true, workerConcurrency: 16, githubFetchMode: 'fast-rest-top5', seedMode: true }), NOW);
      const s = capacityState(db);
      assert.deepEqual(
        [s.maxRoomCapacity, s.intakeLocked, s.workerConcurrency, s.githubFetchMode, s.seedMode, s.seedCount],
        [80, true, 16, 'fast-rest-top5', true, SEED_COUNT],
      );
      assert.ok((db.prepare('SELECT COUNT(*) AS n FROM matches').get() as { n: number }).n > 0, 'enabling seeds re-matches the pool');
      assert.equal(JSON.parse(readFileSync(process.env.ARIADNE_WORKER_SETTINGS_PATH!, 'utf8')).workerConcurrency, 16);
      applyCapacityUpdate(db, validateCapacityUpdate({ seedMode: false }), NOW);
      assert.equal(capacityState(db).seedCount, 0);
    } finally {
      setAdmissionPolicy(original);
      setWorkerSettings({ ...DEFAULT_WORKER_SETTINGS });
      db.close();
    }
  });

  describe('over HTTP', () => {
    let running: Awaited<ReturnType<typeof startServer>>;
    before(async () => {
      const dir = mkdtempSync(join(tmpdir(), 'ariadne-admin-http-'));
      process.once('exit', () => rmSync(dir, { recursive: true, force: true }));
      running = await startServer({ port: 0, dbPath: join(dir, 'ariadne.db'), log: { info() {} } });
    });
    after(async () => {
      await running.close();
    });

    test('serves the panel and state to the presenter machine, and a bad update changes nothing', async () => {
      const original = getAdmissionPolicy();
      try {
        const panel = await fetch(`${running.url}/admin`);
        assert.equal(panel.status, 200);
        assert.match(panel.headers.get('content-type') ?? '', /text\/html/);
        const before = await (await fetch(`${running.url}/api/admin/capacity`)).json();
        const bad = await fetch(`${running.url}/api/admin/capacity`, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ maxRoomCapacity: 50, workerConcurrency: 9 }) });
        assert.equal(bad.status, 400);
        assert.deepEqual(await (await fetch(`${running.url}/api/admin/capacity`)).json(), before);
        const ok = await fetch(`${running.url}/api/admin/capacity`, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ maxRoomCapacity: 50 }) });
        assert.equal(ok.status, 200);
        assert.equal(((await ok.json()) as { maxRoomCapacity: number }).maxRoomCapacity, 50);
      } finally {
        setAdmissionPolicy(original);
      }
    });

    test('choosing a room cap applies its worker profile unless the request overrides it', async () => {
      const original = getAdmissionPolicy();
      try {
        const scaled = (await (await fetch(`${running.url}/api/admin/capacity`, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ maxRoomCapacity: 150 }) })).json()) as Record<string, unknown>;
        assert.deepEqual([scaled.workerConcurrency, scaled.githubFetchMode], [24, 'fast-rest-top5']);
        const override = (await (await fetch(`${running.url}/api/admin/capacity`, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ maxRoomCapacity: 300, workerConcurrency: 16 }) })).json()) as Record<string, unknown>;
        assert.deepEqual([override.workerConcurrency, override.githubFetchMode], [16, 'fast-rest-top5']);
        assert.deepEqual(capacityProfile(30), { workerConcurrency: 8, githubFetchMode: 'full-graphql' });
        assert.deepEqual(capacityProfile(80), { workerConcurrency: 16, githubFetchMode: 'full-graphql' });
      } finally {
        setAdmissionPolicy(original);
        setWorkerSettings({ ...DEFAULT_WORKER_SETTINGS });
      }
    });

    test('rejects forged updates: wrong content type, foreign Origin, cross-site fetch', async () => {
      const body = JSON.stringify({ intakeLocked: true });
      const cases: Array<[Record<string, string>, number]> = [
        [{ 'content-type': 'text/plain' }, 415],
        [{}, 415],
        [{ ...JSON_HEADERS, origin: 'https://evil.example' }, 403],
        [{ ...JSON_HEADERS, 'sec-fetch-site': 'cross-site' }, 403],
      ];
      for (const [headers, status] of cases) {
        for (const path of ['/api/admin/capacity', '/api/admin/prewarm']) {
          const res = await fetch(`${running.url}${path}`, { method: 'POST', headers, body });
          assert.equal(res.status, status, `${path} ${JSON.stringify(headers)}`);
        }
      }
      assert.equal(getAdmissionPolicy().intakeLocked, false, 'no forged request changed anything');
      const same = await fetch(`${running.url}/api/admin/capacity`, { method: 'POST', headers: { ...JSON_HEADERS, origin: running.url }, body: JSON.stringify({}) });
      assert.equal(same.status, 200);
    });

    test('the panel script splits VIP handles on whitespace', async () => {
      const html = await (await fetch(`${running.url}/admin`)).text();
      assert.ok(html.includes('split(/\\s+/)'));
    });

    test('rejects a malformed pre-warm request', async () => {
      const res = await fetch(`${running.url}/api/admin/prewarm`, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ handles: [] }) });
      assert.equal(res.status, 400);
    });

    test('refuses requests that arrived through a proxy', async () => {
      for (const [method, path] of [['GET', '/admin'], ['GET', '/api/admin/capacity'], ['POST', '/api/admin/capacity'], ['POST', '/api/admin/prewarm']] as const) {
        const res = await fetch(`${running.url}${path}`, { method, headers: { ...JSON_HEADERS, 'x-forwarded-for': '203.0.113.9' }, ...(method === 'POST' ? { body: '{}' } : {}) });
        assert.equal(res.status, 403, `${method} ${path}`);
      }
    });

    test('rejects an oversized or non-object body', async () => {
      const big = await fetch(`${running.url}/api/admin/capacity`, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ maxRoomCapacity: 'x'.repeat(5000) }) });
      assert.equal(big.status, 400);
      const arr = await fetch(`${running.url}/api/admin/capacity`, { method: 'POST', headers: JSON_HEADERS, body: '[1]' });
      assert.equal(arr.status, 400);
    });
  });
});

describe('VIP pre-warm', () => {
  test('validates handles and warms snapshots that admit VIPs past a full room', async () => {
    assert.throws(() => validatePrewarm({ handles: 'judge' }), /handles/);
    assert.throws(() => validatePrewarm({ handles: Array.from({ length: 51 }, (_, i) => `h${i}`) }), /at most 50/);
    assert.throws(() => validatePrewarm({ handles: ['a'], websites: ['x'] }), /websites/);
    const db = freshDb();
    const { fetcher, calls } = ragFetcher();
    const result = await prewarmVips(db, validatePrewarm({ handles: ['judge-one', 'Judge-One', 'judge-two'] }), { fetcher });
    assert.deepEqual(result.warmed.sort(), ['judge-one', 'judge-two']);
    assert.deepEqual(calls.sort(), ['judge-one', 'judge-two']);
    assert.ok(db.prepare('SELECT 1 FROM github_snapshots WHERE github_username = ? AND participant_id IS NULL').get('judge-one'));
    db.close();
  });
});

describe('processJob', () => {
  test('a refresh for a participant with no job participant id is skipped', async () => {
    const db = freshDb();
    const outcome = await processJob(db, { id: enqueue(db, MATCH_REFRESH_JOB_KIND, null), kind: MATCH_REFRESH_JOB_KIND, participant_id: null, payload: {}, attempts: 1 }, offline);
    assert.equal(outcome.status, 'skipped');
    db.close();
  });
});

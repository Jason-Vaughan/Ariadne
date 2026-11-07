import type { IncomingMessage, ServerResponse } from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import type { RouteDefinition } from '../server.ts';
import { countActiveParticipants, getAdmissionPolicy, setAdmissionPolicy } from './onboarding.ts';
import { isPresenterRequest, SEED_ID_PREFIX, setSeedMode } from './stage-snapshot.ts';
import { getWorkerSettings, GITHUB_FETCH_MODES, rematch, setWorkerSettings, WORKER_CONCURRENCY_LEVELS } from '../worker/job-runner.ts';
import { hydrateSeedPersonas } from '../worker/seed-personas.ts';

export const ROOM_CAPACITY_PRESETS = [15, 30, 50, 80, 100, 150, 300] as const;
const MAX_BODY_BYTES = 4096;

/** Everything the operator panel shows. */
export interface CapacityState {
  maxRoomCapacity: number;
  intakeLocked: boolean;
  activeParticipants: number;
  workerConcurrency: number;
  githubFetchMode: string;
  seedMode: boolean;
  seedCount: number;
  queue: { queued: number; running: number; failed: number };
  presets: { maxRoomCapacity: readonly number[]; workerConcurrency: readonly number[]; githubFetchMode: readonly string[] };
}

/**
 * Writes a JSON response that must not be cached.
 * @param res - The response.
 * @param status - HTTP status.
 * @param body - JSON-serializable body.
 */
function sendNoStoreJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(text);
}

/**
 * Collects the current operator-visible state.
 * @param db - Open database.
 * @returns The capacity state.
 */
export function capacityState(db: DatabaseSync): CapacityState {
  const policy = getAdmissionPolicy();
  const worker = getWorkerSettings();
  const seeds = db.prepare('SELECT COUNT(*) AS n FROM participants WHERE id LIKE ?').get(`${SEED_ID_PREFIX}%`) as { n: number };
  const counts = Object.fromEntries(
    (db.prepare('SELECT status, COUNT(*) AS n FROM async_jobs GROUP BY status').all() as Array<{ status: string; n: number }>).map((r) => [r.status, Number(r.n)]),
  );
  return {
    maxRoomCapacity: policy.maxRoomCapacity,
    intakeLocked: policy.intakeLocked,
    activeParticipants: countActiveParticipants(db),
    workerConcurrency: worker.workerConcurrency,
    githubFetchMode: worker.githubFetchMode,
    seedMode: Number(seeds.n) > 0,
    seedCount: Number(seeds.n),
    queue: { queued: counts.queued ?? 0, running: counts.running ?? 0, failed: counts.failed ?? 0 },
    presets: { maxRoomCapacity: ROOM_CAPACITY_PRESETS, workerConcurrency: WORKER_CONCURRENCY_LEVELS, githubFetchMode: GITHUB_FETCH_MODES },
  };
}

/**
 * Reads a small JSON object body.
 * @param req - The request.
 * @returns The parsed object.
 * @throws If the body is larger than 4 KB or is not a JSON object.
 */
async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new Error('body too large');
    chunks.push(chunk as Buffer);
  }
  const value = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as unknown;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('body must be a JSON object');
  return value as Record<string, unknown>;
}

/**
 * Validates a capacity update before anything is changed, so a bad field applies nothing.
 * @param body - Requested changes.
 * @returns The validated changes.
 * @throws With a field-specific message when a value is not allowed.
 */
export function validateCapacityUpdate(body: Record<string, unknown>): {
  maxRoomCapacity?: number;
  intakeLocked?: boolean;
  workerConcurrency?: unknown;
  githubFetchMode?: unknown;
  seedMode?: boolean;
} {
  const allowed = new Set(['maxRoomCapacity', 'intakeLocked', 'workerConcurrency', 'githubFetchMode', 'seedMode']);
  const unknown = Object.keys(body).filter((k) => !allowed.has(k));
  if (unknown.length) throw new Error(`unknown fields: ${unknown.join(', ')}`);
  if (body.maxRoomCapacity !== undefined && !ROOM_CAPACITY_PRESETS.includes(body.maxRoomCapacity as (typeof ROOM_CAPACITY_PRESETS)[number])) {
    throw new Error(`maxRoomCapacity must be one of ${ROOM_CAPACITY_PRESETS.join(', ')}`);
  }
  for (const flag of ['intakeLocked', 'seedMode'] as const) {
    if (body[flag] !== undefined && typeof body[flag] !== 'boolean') throw new Error(`${flag} must be true or false`);
  }
  if (body.workerConcurrency !== undefined && !WORKER_CONCURRENCY_LEVELS.includes(body.workerConcurrency as never)) {
    throw new Error(`workerConcurrency must be one of ${WORKER_CONCURRENCY_LEVELS.join(', ')}`);
  }
  if (body.githubFetchMode !== undefined && !GITHUB_FETCH_MODES.includes(body.githubFetchMode as never)) {
    throw new Error(`githubFetchMode must be one of ${GITHUB_FETCH_MODES.join(', ')}`);
  }
  return body as ReturnType<typeof validateCapacityUpdate>;
}

/**
 * Applies a validated update: admission policy, worker settings, and the seed pool (enabling hydrates the
 * 25 seed personas and re-matches the pool; disabling removes them with their matches).
 * @param db - Open database.
 * @param update - Validated changes.
 * @param now - Reference time.
 */
export function applyCapacityUpdate(db: DatabaseSync, update: ReturnType<typeof validateCapacityUpdate>, now: Date = new Date()): void {
  const policy: { maxRoomCapacity?: number; intakeLocked?: boolean } = {};
  if (update.maxRoomCapacity !== undefined) policy.maxRoomCapacity = update.maxRoomCapacity;
  if (update.intakeLocked !== undefined) policy.intakeLocked = update.intakeLocked;
  if (Object.keys(policy).length) setAdmissionPolicy(policy);
  const worker: Record<string, unknown> = {};
  if (update.workerConcurrency !== undefined) worker.workerConcurrency = update.workerConcurrency;
  if (update.githubFetchMode !== undefined) worker.githubFetchMode = update.githubFetchMode;
  if (Object.keys(worker).length) setWorkerSettings(worker);
  if (update.seedMode === true) {
    setSeedMode(db, true, now);
    hydrateSeedPersonas(db, { now });
    rematch(db, { now });
  } else if (update.seedMode === false) {
    setSeedMode(db, false, now);
  }
}

const PANEL_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ariadne · Operator</title>
<style>
  :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
  body { margin: 0 auto; max-width: 720px; padding: 16px; }
  h1 { font-size: 1.4rem; }
  section { border: 1px solid #8884; border-radius: 10px; padding: 12px 16px; margin: 12px 0; }
  .row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  button { font: inherit; padding: 6px 12px; border-radius: 8px; border: 1px solid #8888; cursor: pointer; }
  button[aria-pressed="true"] { background: #2563eb; color: #fff; border-color: #2563eb; }
  .stat { font-variant-numeric: tabular-nums; }
  #status { min-height: 1.4em; }
</style>
</head>
<body>
<h1>Ariadne operator panel</h1>
<p id="status" role="status"></p>
<section><h2>Room</h2>
  <p class="stat">Active participants: <span id="active">–</span> / <span id="capacity">–</span></p>
  <div class="row" id="capacity-presets"></div>
  <div class="row"><button id="intake" type="button"></button></div>
</section>
<section><h2>Worker</h2>
  <p class="stat">Queue: <span id="queued">–</span> queued · <span id="running">–</span> running · <span id="failed">–</span> failed</p>
  <div class="row" id="concurrency-presets"></div>
  <div class="row" id="fetch-modes"></div>
</section>
<section><h2>Seed pool</h2>
  <p class="stat">Seeds in pool: <span id="seeds">–</span></p>
  <div class="row"><button id="seed" type="button"></button></div>
</section>
<script>
const $ = (id) => document.getElementById(id);
let state = null;
async function load() {
  const res = await fetch('/api/admin/capacity', { cache: 'no-store' });
  if (!res.ok) { $('status').textContent = 'Not available from this address.'; return; }
  state = await res.json();
  render();
}
async function update(change) {
  $('status').textContent = 'Saving…';
  const res = await fetch('/api/admin/capacity', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(change) });
  const body = await res.json();
  if (!res.ok) { $('status').textContent = body.detail || 'Update failed.'; return; }
  state = body;
  $('status').textContent = 'Saved.';
  render();
}
function presetButtons(container, values, current, field, label) {
  container.replaceChildren(...values.map((v) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label(v);
    b.setAttribute('aria-pressed', String(v === current));
    b.addEventListener('click', () => update({ [field]: v }));
    return b;
  }));
}
function render() {
  $('active').textContent = String(state.activeParticipants);
  $('capacity').textContent = String(state.maxRoomCapacity);
  $('queued').textContent = String(state.queue.queued);
  $('running').textContent = String(state.queue.running);
  $('failed').textContent = String(state.queue.failed);
  $('seeds').textContent = String(state.seedCount);
  presetButtons($('capacity-presets'), state.presets.maxRoomCapacity, state.maxRoomCapacity, 'maxRoomCapacity', (v) => v + ' seats');
  presetButtons($('concurrency-presets'), state.presets.workerConcurrency, state.workerConcurrency, 'workerConcurrency', (v) => v + ' workers');
  presetButtons($('fetch-modes'), state.presets.githubFetchMode, state.githubFetchMode, 'githubFetchMode', (v) => v);
  $('intake').textContent = state.intakeLocked ? 'Unlock intake' : 'Lock intake';
  $('intake').setAttribute('aria-pressed', String(state.intakeLocked));
  $('intake').onclick = () => update({ intakeLocked: !state.intakeLocked });
  $('seed').textContent = state.seedMode ? 'Remove seed personas' : 'Add 25 seed personas';
  $('seed').setAttribute('aria-pressed', String(state.seedMode));
  $('seed').onclick = () => update({ seedMode: !state.seedMode });
}
load();
setInterval(load, 5000);
</script>
</body>
</html>
`;

/**
 * Refuses a request that does not come straight from this machine's loopback.
 * @param req - The request.
 * @param res - The response (written on refusal).
 * @returns True when the request may proceed.
 */
function presenterOnly(req: IncomingMessage, res: ServerResponse): boolean {
  if (isPresenterRequest(req)) return true;
  sendNoStoreJson(res, 403, { error: 'presenter_only', detail: 'Operator controls are only available on the presenter machine.' });
  return false;
}

export const routes: RouteDefinition[] = [
  {
    method: 'GET',
    path: '/admin',
    /** `GET /admin`: the operator panel (presenter machine only). */
    handler(req, res) {
      if (!presenterOnly(req, res)) return;
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'",
      });
      res.end(PANEL_HTML);
    },
  },
  {
    method: 'GET',
    path: '/api/admin/capacity',
    /** `GET /api/admin/capacity`: current capacity, worker and seed state (presenter machine only). */
    handler(req, res, ctx) {
      if (!presenterOnly(req, res)) return;
      sendNoStoreJson(res, 200, capacityState(ctx.db));
    },
  },
  {
    method: 'POST',
    path: '/api/admin/capacity',
    /**
     * `POST /api/admin/capacity`: change room capacity, intake lock, worker concurrency, GitHub fetch mode
     * or the seed pool. The whole body is validated first; 400 applies nothing. Presenter machine only.
     */
    async handler(req, res, ctx) {
      if (!presenterOnly(req, res)) return;
      let update: ReturnType<typeof validateCapacityUpdate>;
      try {
        update = validateCapacityUpdate(await readJsonBody(req));
      } catch (error) { // prawduct:allow prawduct/broad-except -- request boundary: any malformed body is a 400
        sendNoStoreJson(res, 400, { error: 'invalid_update', detail: error instanceof Error ? error.message : String(error) });
        return;
      }
      applyCapacityUpdate(ctx.db, update);
      ctx.log.info('operator capacity update', update as Record<string, unknown>);
      sendNoStoreJson(res, 200, capacityState(ctx.db));
    },
  },
];

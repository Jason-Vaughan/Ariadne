import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import type { IncomingMessage, Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EventPollResponseSchema, PublicEventEnvelopeSchema } from '../src/contracts/index.ts';
import type { PublicEventEnvelope } from '../src/contracts/index.ts';
import { randomUUID } from 'node:crypto';
import {
  latestSeqId,
  parseCursor,
  publishEvent,
  readEventPage,
  readEventsAfter,
  subscribe,
  subscriberCount,
} from '../src/events/bus.ts';
import { createEventRoutes, formatSseFrame } from '../src/routes/events.ts';
import type { RouteDefinition } from '../src/server.ts';

const REPO_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SCHEMA_SQL = readFileSync(join(REPO_ROOT, 'src/db/schema.sql'), 'utf8');
const MATCH_ID = '6f1c2b1e-8a4d-4c1e-9b7a-2f3d4e5a6b7c';

/**
 * Creates a throwaway directory removed when the test process ends.
 * @param prefix - Directory name prefix.
 * @returns Absolute path of the new directory.
 */
function scratchDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), `ariadne-${prefix}-`));
  process.once('exit', () => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/**
 * Opens a database with the A-001 schema applied, as the app's database client does.
 * @param path - Database file path, or `:memory:`.
 * @returns The open handle.
 */
function openDb(path = ':memory:'): DatabaseSync {
  const db = new DatabaseSync(path);
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  db.exec(SCHEMA_SQL);
  return db;
}

/**
 * Builds a valid `match.evaluated` payload.
 * @param score - Composite score.
 * @returns The payload.
 */
function evaluated(score: number) {
  return { match_id: MATCH_ID, display_alias_a: 'Thread-7C4E', display_alias_b: 'Spool-A1B2', composite_score: score };
}

const registered = { display_alias: 'Thread-7C4E' };

interface Harness {
  db: DatabaseSync;
  dbPath: string;
  base: string;
  server: Server;
  close(): Promise<void>;
}

/**
 * Serves the event routes over real HTTP with the same route context shape the app server passes.
 * @param options - Interval overrides for the stream route.
 * @returns The harness; call `close()` when done.
 */
async function startHarness(options: { heartbeatMs?: number; dbPollMs?: number } = {}): Promise<Harness> {
  const dbPath = join(scratchDir('events'), 'ariadne.db');
  const db = openDb(dbPath);
  const routes: RouteDefinition[] = createEventRoutes({ heartbeatMs: 60_000, dbPollMs: 60_000, ...options });
  const startedAt = Date.now();
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const method = req.method === 'HEAD' ? 'GET' : req.method;
    const route = routes.find((r) => r.method === method && r.path === url.pathname);
    if (!route) {
      res.writeHead(404).end();
      return;
    }
    void route.handler(req, res, { db, params: {}, url, log: { info() {} }, startedAt });
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const { port } = server.address() as AddressInfo;
  return {
    db,
    dbPath,
    base: `http://127.0.0.1:${port}`,
    server,
    close: () =>
      new Promise<void>((done) => {
        server.closeAllConnections();
        server.close(() => {
          db.close();
          done();
        });
      }),
  };
}

/**
 * GETs a JSON endpoint.
 * @param url - Absolute URL.
 * @returns Status, parsed body and headers.
 */
async function getJson(url: string): Promise<{ status: number; body: any; headers: Headers }> {
  const res = await fetch(url);
  return { status: res.status, body: await res.json(), headers: res.headers };
}

interface SseClient {
  response: IncomingMessage;
  /** Everything received so far. */
  text(): string;
  /** Parsed `data:` envelopes from complete frames received so far. */
  events(): PublicEventEnvelope[];
  /** Resolves once `predicate` holds for the received text. */
  waitFor(predicate: (text: string) => boolean, timeoutMs?: number): Promise<void>;
  close(): void;
}

/**
 * Opens a raw SSE connection and buffers what arrives.
 * @param url - Stream URL.
 * @param headers - Extra request headers (e.g. `Last-Event-ID`).
 * @returns The connected client.
 */
function openSse(url: string, headers: Record<string, string> = {}): Promise<SseClient> {
  return new Promise((resolveClient, reject) => {
    const req = request(url, { headers: { accept: 'text/event-stream', ...headers } }, (response) => {
      let buffer = '';
      const waiters: Array<() => void> = [];
      response.setEncoding('utf8');
      response.on('data', (chunk: string) => {
        buffer += chunk;
        for (const wake of waiters.splice(0)) wake();
      });
      const client: SseClient = {
        response,
        text: () => buffer,
        events: () =>
          buffer
            .split('\n\n')
            .slice(0, -1)
            .flatMap((frame) => frame.split('\n'))
            .filter((line) => line.startsWith('data: '))
            .map((line) => JSON.parse(line.slice('data: '.length)) as PublicEventEnvelope),
        waitFor(predicate, timeoutMs = 3000) {
          return new Promise<void>((done, fail) => {
            const timer = setTimeout(() => fail(new Error(`timed out; received: ${JSON.stringify(buffer.slice(-500))}`)), timeoutMs);
            const check = (): void => {
              if (predicate(buffer)) {
                clearTimeout(timer);
                done();
              } else waiters.push(check);
            };
            check();
          });
        },
        close: () => req.destroy(),
      };
      resolveClient(client);
    });
    req.on('error', reject);
    req.end();
  });
}

/**
 * Waits until a condition holds, polling briefly.
 * @param condition - Predicate to satisfy.
 * @param timeoutMs - Give-up time.
 */
async function eventually(condition: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('condition not met in time');
    await new Promise((r) => setTimeout(r, 10));
  }
}

/**
 * Writes a row straight into `domain_events`, bypassing `publishEvent()`, as a foreign writer could.
 * The payload leaks an unconsented username, so the public contract rejects it.
 * @param db - An open database handle.
 */
function insertLeakyRow(db: DatabaseSync): void {
  db.prepare('INSERT INTO domain_events (event_id, type, payload_json, occurred_at) VALUES (?, ?, ?, ?)').run(
    randomUUID(),
    'participant.registered',
    JSON.stringify({ display_alias: 'Thread-7C4E', github_username: 'octocat' }),
    new Date().toISOString(),
  );
}

/**
 * Counts stored events.
 * @param db - An open database handle.
 * @returns Row count of `domain_events`.
 */
function rowCount(db: DatabaseSync): number {
  return Number((db.prepare('SELECT COUNT(*) AS n FROM domain_events').get() as { n: number }).n);
}

describe('event bus', () => {
  test('assigns strictly increasing seq_ids and serves contract-valid envelopes in order', () => {
    const db = openDb();
    const published = [10, 20, 30, 40].map((s) => publishEvent(db, 'match.evaluated', evaluated(s)).envelope);
    const ids = published.map((e) => e.seq_id);
    assert.deepEqual(ids, [1, 2, 3, 4]);
    assert.equal(new Set(published.map((e) => e.event_id)).size, 4);
    for (const envelope of published) PublicEventEnvelopeSchema.parse(envelope);
    assert.deepEqual(readEventsAfter(db, 0), published);
    assert.deepEqual(readEventsAfter(db, 2), published.slice(2));
    assert.equal(latestSeqId(db), 4);
    db.close();
  });

  test('latestSeqId is 0 on an empty stream', () => {
    const db = openDb();
    assert.equal(latestSeqId(db), 0);
    assert.deepEqual(readEventsAfter(db, 0), []);
    db.close();
  });

  test('rejects event types outside the canonical catalog and writes nothing', () => {
    const db = openDb();
    assert.throws(() => publishEvent(db, 'agent.heartbeat' as any, {} as any));
    assert.equal(rowCount(db), 0);
    db.close();
  });

  test('rejects an unconsented username, contact card or unknown key and writes nothing', () => {
    const db = openDb();
    const leaks = [
      { ...registered, github_username: 'octocat' },
      { ...registered, avatar_url: 'https://avatars.example/1' },
      { ...registered, contact_card: '@me' },
      { ...registered, login: 'octocat' },
      { display_alias: 'octocat' },
    ];
    for (const payload of leaks) {
      assert.throws(() => publishEvent(db, 'participant.registered', payload as any), JSON.stringify(payload));
    }
    assert.equal(rowCount(db), 0);
    db.close();
  });

  test('identity is accepted only inside a consented display block', () => {
    const db = openDb();
    const display = { stage_display_consent: true as const, github_username: 'octocat', avatar_url: null };
    const { envelope } = publishEvent(db, 'participant.registered', { ...registered, display });
    assert.deepEqual(envelope.payload, { ...registered, display });
    assert.throws(() =>
      publishEvent(db, 'participant.registered', { ...registered, display: { ...display, stage_display_consent: false } } as any),
    );
    assert.equal(rowCount(db), 1);
    db.close();
  });

  test('introduction.declined carries only the aggregate count', () => {
    const db = openDb();
    assert.deepEqual(publishEvent(db, 'introduction.declined', { declined_total: 3 }).envelope.payload, { declined_total: 3 });
    assert.throws(() => publishEvent(db, 'introduction.declined', { declined_total: 4, match_id: MATCH_ID } as any));
    db.close();
  });

  test('a repeated idempotency key inserts nothing, returns the stored event and wakes no one', () => {
    const db = openDb();
    const woken: number[] = [];
    const unsubscribe = subscribe(db, (seq) => woken.push(seq));
    const key = `${MATCH_ID}:a:interested`;
    const proposed = { match_id: MATCH_ID, display_alias_a: 'Thread-7C4E', display_alias_b: 'Spool-A1B2' };
    const first = publishEvent(db, 'introduction.proposed', proposed, { idempotencyKey: key });
    const second = publishEvent(db, 'introduction.proposed', proposed, { idempotencyKey: key });
    assert.equal(first.inserted, true);
    assert.equal(second.inserted, false);
    assert.deepEqual(second.envelope, first.envelope);
    assert.equal(rowCount(db), 1);
    assert.deepEqual(woken, [first.envelope.seq_id]);
    unsubscribe();
    db.close();
  });

  test('reusing an idempotency key for a different event type is an error', () => {
    const db = openDb();
    const pair = { match_id: MATCH_ID, display_alias_a: 'Thread-7C4E', display_alias_b: 'Spool-A1B2' };
    publishEvent(db, 'introduction.proposed', pair, { idempotencyKey: 'k1' });
    assert.throws(() => publishEvent(db, 'introduction.accepted', pair, { idempotencyKey: 'k1' }), /already used/);
    assert.equal(rowCount(db), 1);
    db.close();
  });

  test('withholds stored rows that fail the public contract, reports them, and still advances the cursor', () => {
    const db = openDb();
    const before = publishEvent(db, 'participant.registered', registered).envelope;
    insertLeakyRow(db);
    const after = publishEvent(db, 'match.evaluated', evaluated(5)).envelope;
    const rejected: number[] = [];
    const page = readEventPage(db, 0, 500, (seq) => rejected.push(seq));
    assert.deepEqual(page.events, [before, after]);
    assert.deepEqual(rejected, [2]);
    assert.equal(page.lastScanned, 3);
    assert.equal(page.scanned, 3);
    assert.deepEqual(readEventPage(db, 1, 1), { events: [], lastScanned: 2, scanned: 1 });
    db.close();
  });

  test('events without an idempotency key never collide', () => {
    const db = openDb();
    publishEvent(db, 'match.evaluated', evaluated(50));
    publishEvent(db, 'match.evaluated', evaluated(50));
    assert.equal(rowCount(db), 2);
    db.close();
  });

  test('parseCursor accepts non-negative integers and rejects everything else', () => {
    assert.equal(parseCursor(undefined), undefined);
    assert.equal(parseCursor(null), undefined);
    assert.equal(parseCursor(''), undefined);
    assert.equal(parseCursor('0'), 0);
    assert.equal(parseCursor(' 42 '), 42);
    for (const bad of ['-1', '1.5', 'abc', '1e3', '99999999999999999999']) assert.equal(parseCursor(bad), null, bad);
  });

  test('formatSseFrame uses seq_id as the SSE id and the envelope as data', () => {
    const db = openDb();
    const { envelope } = publishEvent(db, 'match.evaluated', evaluated(70));
    assert.equal(formatSseFrame(envelope), `id: ${envelope.seq_id}\ndata: ${JSON.stringify(envelope)}\n\n`);
    db.close();
  });
});

describe('GET /api/events/poll', () => {
  test('returns events after the cursor with the latest seq_id, matching the contract schema', async () => {
    const h = await startHarness();
    try {
      const all = [1, 2, 3].map((n) => publishEvent(h.db, 'match.evaluated', evaluated(n)).envelope);
      const { status, body, headers } = await getJson(`${h.base}/api/events/poll?after=${all[0]!.seq_id}`);
      assert.equal(status, 200);
      assert.equal(headers.get('cache-control'), 'no-store');
      EventPollResponseSchema.parse(body);
      assert.deepEqual(body, { events: all.slice(1), latest_seq_id: all[2]!.seq_id });
    } finally {
      await h.close();
    }
  });

  test('defaults to after=0 and honours limit while latest_seq_id still reports the head', async () => {
    const h = await startHarness();
    try {
      const all = [1, 2, 3].map((n) => publishEvent(h.db, 'match.evaluated', evaluated(n)).envelope);
      const { body } = await getJson(`${h.base}/api/events/poll?limit=2`);
      assert.deepEqual(body.events, all.slice(0, 2));
      assert.equal(body.latest_seq_id, all[2]!.seq_id);
      const next = await getJson(`${h.base}/api/events/poll?after=${all[1]!.seq_id}&limit=2`);
      assert.deepEqual(next.body.events, all.slice(2));
    } finally {
      await h.close();
    }
  });

  test('returns an empty page with latest_seq_id 0 on an empty stream', async () => {
    const h = await startHarness();
    try {
      assert.deepEqual((await getJson(`${h.base}/api/events/poll`)).body, { events: [], latest_seq_id: 0 });
    } finally {
      await h.close();
    }
  });

  test('a cursor beyond the head (store was reset) pages from the start, like the stream', async () => {
    const h = await startHarness();
    try {
      const all = [1, 2].map((n) => publishEvent(h.db, 'match.evaluated', evaluated(n)).envelope);
      const { body } = await getJson(`${h.base}/api/events/poll?after=9999`);
      assert.deepEqual(body, { events: all, latest_seq_id: 2 });
    } finally {
      await h.close();
    }
  });

  test('never serves a stored row that fails the public contract', async () => {
    const h = await startHarness();
    try {
      insertLeakyRow(h.db);
      const ok = publishEvent(h.db, 'participant.registered', registered).envelope;
      const res = await fetch(`${h.base}/api/events/poll?after=0`);
      const text = await res.text();
      assert.doesNotMatch(text, /octocat/);
      assert.deepEqual(JSON.parse(text), { events: [ok], latest_seq_id: 2 });
    } finally {
      await h.close();
    }
  });

  test('rejects malformed cursors and limits with 400', async () => {
    const h = await startHarness();
    try {
      for (const query of ['after=-1', 'after=abc', 'limit=0', 'limit=x']) {
        const { status, body } = await getJson(`${h.base}/api/events/poll?${query}`);
        assert.equal(status, 400, query);
        assert.equal(body.error, 'invalid_cursor');
      }
    } finally {
      await h.close();
    }
  });
});

describe('GET /api/events/stream', () => {
  test('sends SSE headers and a retry hint', async () => {
    const h = await startHarness();
    const client = await openSse(`${h.base}/api/events/stream`);
    try {
      assert.equal(client.response.statusCode, 200);
      assert.match(String(client.response.headers['content-type']), /^text\/event-stream/);
      assert.equal(client.response.headers['cache-control'], 'no-cache, no-transform');
      assert.equal(client.response.headers['x-accel-buffering'], 'no');
      await client.waitFor((t) => t.startsWith('retry: 3000\n\n'));
    } finally {
      client.close();
      await h.close();
    }
  });

  test('replays everything after Last-Event-ID, then delivers new events live', async () => {
    const h = await startHarness();
    const before = [1, 2, 3].map((n) => publishEvent(h.db, 'match.evaluated', evaluated(n)).envelope);
    const client = await openSse(`${h.base}/api/events/stream`, { 'Last-Event-ID': String(before[0]!.seq_id) });
    try {
      await client.waitFor(() => client.events().length === 2);
      assert.deepEqual(client.events(), before.slice(1));
      const live = publishEvent(h.db, 'introduction.declined', { declined_total: 1 }).envelope;
      await client.waitFor(() => client.events().length === 3);
      assert.deepEqual(client.events().at(-1), live);
      assert.match(client.text(), new RegExp(`id: ${live.seq_id}\\n`));
    } finally {
      client.close();
      await h.close();
    }
  });

  test('replays from ?after= when no Last-Event-ID is sent, and Last-Event-ID wins when both are', async () => {
    const h = await startHarness();
    const all = [1, 2, 3].map((n) => publishEvent(h.db, 'match.evaluated', evaluated(n)).envelope);
    const byQuery = await openSse(`${h.base}/api/events/stream?after=${all[1]!.seq_id}`);
    const both = await openSse(`${h.base}/api/events/stream?after=${all[1]!.seq_id}`, { 'Last-Event-ID': '0' });
    try {
      await byQuery.waitFor(() => byQuery.events().length === 1);
      assert.deepEqual(byQuery.events(), all.slice(2));
      await both.waitFor(() => both.events().length === 3);
      assert.deepEqual(both.events(), all);
    } finally {
      byQuery.close();
      both.close();
      await h.close();
    }
  });

  test('with no cursor, starts live from the head and does not replay history', async () => {
    const h = await startHarness();
    publishEvent(h.db, 'match.evaluated', evaluated(1));
    const client = await openSse(`${h.base}/api/events/stream`);
    try {
      await client.waitFor((t) => t.includes('retry:'));
      const live = publishEvent(h.db, 'match.evaluated', evaluated(2)).envelope;
      await client.waitFor(() => client.events().length >= 1);
      assert.deepEqual(client.events(), [live]);
    } finally {
      client.close();
      await h.close();
    }
  });

  test('a cursor beyond the head (store was reset) replays from the start instead of going silent', async () => {
    const h = await startHarness();
    const all = [1, 2].map((n) => publishEvent(h.db, 'match.evaluated', evaluated(n)).envelope);
    const client = await openSse(`${h.base}/api/events/stream`, { 'Last-Event-ID': '9999' });
    try {
      await client.waitFor(() => client.events().length === 2);
      assert.deepEqual(client.events(), all);
    } finally {
      client.close();
      await h.close();
    }
  });

  test('replays a backlog larger than one batch completely and in order', async () => {
    const h = await startHarness();
    const total = 1200;
    h.db.exec('BEGIN');
    for (let n = 0; n < total; n++) publishEvent(h.db, 'match.evaluated', evaluated(n % 101));
    h.db.exec('COMMIT');
    const client = await openSse(`${h.base}/api/events/stream?after=0`);
    try {
      await client.waitFor(() => client.events().length === total, 10_000);
      assert.deepEqual(
        client.events().map((e) => e.seq_id),
        Array.from({ length: total }, (_, i) => i + 1),
      );
    } finally {
      client.close();
      await h.close();
    }
  });

  test('stream catch-up matches poll catch-up for the same cursor', async () => {
    const h = await startHarness();
    [1, 2, 3, 4].map((n) => publishEvent(h.db, 'match.evaluated', evaluated(n)));
    const client = await openSse(`${h.base}/api/events/stream?after=1`);
    try {
      await client.waitFor(() => client.events().length === 3);
      const { body } = await getJson(`${h.base}/api/events/poll?after=1`);
      assert.deepEqual(client.events(), body.events);
    } finally {
      client.close();
      await h.close();
    }
  });

  test('picks up events written by another connection (e.g. the worker)', async () => {
    const h = await startHarness({ dbPollMs: 25 });
    const client = await openSse(`${h.base}/api/events/stream?after=0`);
    const worker = new DatabaseSync(h.dbPath);
    try {
      await client.waitFor((t) => t.includes('retry:'));
      const external = publishEvent(worker, 'github.fetch.completed', { ...registered, repo_count: 3, evidence_count: 9 }).envelope;
      await client.waitFor(() => client.events().length === 1);
      assert.deepEqual(client.events(), [external]);
    } finally {
      worker.close();
      client.close();
      await h.close();
    }
  });

  test('heartbeats are SSE comments, never events', async () => {
    const h = await startHarness({ heartbeatMs: 20 });
    const client = await openSse(`${h.base}/api/events/stream`);
    try {
      await client.waitFor((t) => t.includes(': heartbeat\n\n'));
      assert.deepEqual(client.events(), []);
      assert.equal(latestSeqId(h.db), 0);
    } finally {
      client.close();
      await h.close();
    }
  });

  test('a payload rejected by the contract never reaches a connected stream', async () => {
    const h = await startHarness();
    const client = await openSse(`${h.base}/api/events/stream?after=0`);
    try {
      await client.waitFor((t) => t.includes('retry:'));
      assert.throws(() => publishEvent(h.db, 'participant.registered', { ...registered, github_username: 'octocat' } as any));
      const ok = publishEvent(h.db, 'participant.registered', registered).envelope;
      await client.waitFor(() => client.events().length === 1);
      assert.deepEqual(client.events(), [ok]);
      assert.doesNotMatch(client.text(), /octocat/);
    } finally {
      client.close();
      await h.close();
    }
  });

  test('a full batch of contract-failing rows neither stalls the stream nor reaches it', async () => {
    const h = await startHarness();
    h.db.exec('BEGIN');
    for (let n = 0; n < 600; n++) insertLeakyRow(h.db);
    h.db.exec('COMMIT');
    const ok = publishEvent(h.db, 'participant.registered', registered).envelope;
    const client = await openSse(`${h.base}/api/events/stream?after=0`);
    try {
      await client.waitFor(() => client.events().length === 1);
      assert.deepEqual(client.events(), [ok]);
      assert.doesNotMatch(client.text(), /octocat/);
    } finally {
      client.close();
      await h.close();
    }
  });

  test('rejects a malformed cursor with 400', async () => {
    const h = await startHarness();
    try {
      const res = await fetch(`${h.base}/api/events/stream`, { headers: { 'Last-Event-ID': 'nope' } });
      assert.equal(res.status, 400);
      assert.equal(((await res.json()) as { error: string }).error, 'invalid_cursor');
    } finally {
      await h.close();
    }
  });

  test('HEAD returns stream headers without holding the connection open', async () => {
    const h = await startHarness();
    try {
      const res = await fetch(`${h.base}/api/events/stream`, { method: 'HEAD' });
      assert.equal(res.status, 200);
      assert.match(res.headers.get('content-type') ?? '', /^text\/event-stream/);
      assert.equal(subscriberCount(h.db), 0);
    } finally {
      await h.close();
    }
  });

  test('releases its subscription when the client disconnects', async () => {
    const h = await startHarness();
    const client = await openSse(`${h.base}/api/events/stream`);
    try {
      await client.waitFor((t) => t.includes('retry:'));
      assert.equal(subscriberCount(h.db), 1);
      client.close();
      await eventually(() => subscriberCount(h.db) === 0);
    } finally {
      await h.close();
    }
  });
});

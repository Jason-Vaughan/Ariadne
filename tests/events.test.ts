import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import type { IncomingMessage, Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  EVENT_TYPES,
  latestSeqId,
  parseCursor,
  publishEvent,
  readEventsAfter,
  sanitizePublicPayload,
  subscriberCount,
} from '../src/events/bus.ts';
import type { EventType, PublicEventEnvelope } from '../src/events/bus.ts';
import { createEventRoutes, formatSseFrame } from '../src/routes/events.ts';
import type { RouteDefinition } from '../src/server.ts';

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
 * Opens a file-backed WAL database, as production does.
 * @param path - Database file path.
 * @returns The open handle.
 */
function openWal(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  return db;
}

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
  const db = openWal(dbPath);
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
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    db,
    dbPath,
    base: `http://127.0.0.1:${port}`,
    server,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => {
          db.close();
          resolve();
        });
      }),
  };
}

/**
 * GETs a JSON endpoint.
 * @param url - Absolute URL.
 * @returns Status and parsed body.
 */
async function getJson(url: string): Promise<{ status: number; body: any; headers: Headers }> {
  const res = await fetch(url);
  return { status: res.status, body: await res.json(), headers: res.headers };
}

interface SseClient {
  response: IncomingMessage;
  /** Everything received so far. */
  text(): string;
  /** Parsed `data:` envelopes received so far. */
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
  return new Promise((resolve, reject) => {
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
            const timer = setTimeout(() => fail(new Error(`timed out; received: ${JSON.stringify(buffer)}`)), timeoutMs);
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
      resolve(client);
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

describe('event bus', () => {
  test('assigns strictly increasing seq_ids and reads them back in order', () => {
    const db = new DatabaseSync(':memory:');
    const published = EVENT_TYPES.map((type) => publishEvent(db, type, { n: type }));
    const ids = published.map((e) => e.seq_id);
    assert.deepEqual(ids, [...ids].sort((a, b) => a - b));
    assert.equal(new Set(ids).size, ids.length);
    assert.deepEqual(readEventsAfter(db, 0), published);
    assert.deepEqual(readEventsAfter(db, ids[4]!), published.slice(5));
    assert.equal(latestSeqId(db), ids.at(-1));
    db.close();
  });

  test('latestSeqId is 0 on an empty stream', () => {
    const db = new DatabaseSync(':memory:');
    assert.equal(latestSeqId(db), 0);
    assert.deepEqual(readEventsAfter(db, 0), []);
    db.close();
  });

  test('rejects event types outside the canonical catalog', () => {
    const db = new DatabaseSync(':memory:');
    assert.throws(() => publishEvent(db, 'agent.heartbeat' as EventType, {}), /Unknown event type/);
    assert.equal(latestSeqId(db), 0);
    db.close();
  });

  test('strips github_username and avatar_url without display consent, at any depth', () => {
    const payload = {
      participant_id: 'p1',
      pseudonym: 'Thread-7C4E',
      github_username: 'octocat',
      avatar_url: 'https://avatars.example/1',
      score_breakdown: { github_username: 'octocat', avatar_url: 'x', recency: 9 },
      capabilities: [{ avatar_url: 'y', category: 'language' }],
    };
    assert.deepEqual(sanitizePublicPayload('participant.registered', payload), {
      participant_id: 'p1',
      pseudonym: 'Thread-7C4E',
      score_breakdown: { recency: 9 },
      capabilities: [{ category: 'language' }],
    });
  });

  test('keeps github_username and avatar_url with display consent', () => {
    const out = sanitizePublicPayload(
      'participant.registered',
      { github_username: 'octocat', avatar_url: 'https://avatars.example/1' },
      true,
    );
    assert.deepEqual(out, { github_username: 'octocat', avatar_url: 'https://avatars.example/1' });
  });

  test('always strips contact details and secrets, even with consent', () => {
    const out = sanitizePublicPayload(
      'introduction.completed',
      {
        match_id: 'm1',
        pseudonym_a: 'Thread-A',
        pseudonym_b: 'Thread-B',
        channel: 'web',
        contact_card: '@me',
        email: 'a@b.c',
        participant_email: 'a@b.c',
        phone_number: '555',
        github_user_id: 42,
        access_token: 't',
        shared_intro_notes: [{ body: 'hi' }],
      },
      true,
    );
    assert.deepEqual(out, { match_id: 'm1', pseudonym_a: 'Thread-A', pseudonym_b: 'Thread-B', channel: 'web' });
  });

  test('drops any key not on the public allowlist, including identity-bearing aliases', () => {
    const out = sanitizePublicPayload(
      'profile.analysis.completed',
      {
        participant_id: 'p1',
        cluster: 'infra',
        login: 'octocat',
        html_url: 'https://github.com/octocat',
        profile_url: 'https://github.com/octocat',
        project_repo: 'octocat/hello',
        relevant_projects: ['octocat/hello'],
        summary: 'octocat builds compilers',
        score_breakdown: { recency: 8, repo: 'octocat/x' },
      },
      true,
    );
    assert.deepEqual(out, { participant_id: 'p1', cluster: 'infra', score_breakdown: { recency: 8 } });
  });

  test('display consent never reveals identity on two-participant events', () => {
    for (const type of ['match.candidate.generated', 'match.evaluated', 'introduction.proposed', 'introduction.accepted', 'introduction.completed'] as const) {
      const out = sanitizePublicPayload(
        type,
        { match_id: 'm1', pseudonym_a: 'A', pseudonym_b: 'B', github_username: 'octocat', avatar_url: 'x' },
        true,
      );
      assert.deepEqual(out, { match_id: 'm1', pseudonym_a: 'A', pseudonym_b: 'B' }, type);
    }
  });

  test('introduction.declined carries no identifying payload on the public stream', () => {
    const db = new DatabaseSync(':memory:');
    const event = publishEvent(db, 'introduction.declined', { match_id: 'm1', participant_id: 'p1' });
    assert.deepEqual(event.payload, {});
    db.close();
  });

  test('persists only the sanitized payload, so raw PII never reaches the table', () => {
    const db = new DatabaseSync(':memory:');
    publishEvent(db, 'participant.registered', { pseudonym: 'T', github_username: 'octocat', contact_card: '@me' });
    const row = db.prepare('SELECT public_payload FROM domain_events').get() as { public_payload: string };
    assert.equal(row.public_payload, JSON.stringify({ pseudonym: 'T' }));
    db.close();
  });

  test('does not mutate the caller payload', () => {
    const payload = { github_username: 'octocat', nested: { email: 'a@b.c' } };
    sanitizePublicPayload('participant.registered', payload);
    assert.deepEqual(payload, { github_username: 'octocat', nested: { email: 'a@b.c' } });
  });

  test('parseCursor accepts non-negative integers and rejects everything else', () => {
    assert.equal(parseCursor(undefined), undefined);
    assert.equal(parseCursor(null), undefined);
    assert.equal(parseCursor(''), undefined);
    assert.equal(parseCursor('0'), 0);
    assert.equal(parseCursor(' 42 '), 42);
    for (const bad of ['-1', '1.5', 'abc', '1e3', '99999999999999999999']) assert.equal(parseCursor(bad), null, bad);
  });

  test('formatSseFrame uses seq_id as the SSE id', () => {
    const frame = formatSseFrame({ seq_id: 7, type: 'match.evaluated', occurred_at: 't', payload: {} });
    assert.equal(frame, `id: 7\ndata: {"seq_id":7,"type":"match.evaluated","occurred_at":"t","payload":{}}\n\n`);
  });
});

describe('GET /api/events/poll', () => {
  test('returns events after the cursor with the latest seq_id', async () => {
    const h = await startHarness();
    try {
      const all = [1, 2, 3].map((n) => publishEvent(h.db, 'match.evaluated', { n }));
      const { status, body, headers } = await getJson(`${h.base}/api/events/poll?after=${all[0]!.seq_id}`);
      assert.equal(status, 200);
      assert.equal(headers.get('cache-control'), 'no-store');
      assert.deepEqual(body, { events: all.slice(1), latest_seq_id: all[2]!.seq_id });
    } finally {
      await h.close();
    }
  });

  test('defaults to after=0 and honours limit while latest_seq_id still reports the head', async () => {
    const h = await startHarness();
    try {
      const all = [1, 2, 3].map((n) => publishEvent(h.db, 'match.evaluated', { n }));
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
    const before = [1, 2, 3].map((n) => publishEvent(h.db, 'match.evaluated', { n }));
    const client = await openSse(`${h.base}/api/events/stream`, { 'Last-Event-ID': String(before[0]!.seq_id) });
    try {
      await client.waitFor(() => client.events().length === 2);
      assert.deepEqual(client.events(), before.slice(1));
      const live = publishEvent(h.db, 'introduction.proposed', { match_id: 'm1' });
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
    const all = [1, 2, 3].map((n) => publishEvent(h.db, 'match.evaluated', { n }));
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
    publishEvent(h.db, 'match.evaluated', { old: true });
    const client = await openSse(`${h.base}/api/events/stream`);
    try {
      await client.waitFor((t) => t.includes('retry:'));
      const live = publishEvent(h.db, 'match.evaluated', { old: false });
      await client.waitFor(() => client.events().length >= 1);
      assert.deepEqual(client.events(), [live]);
    } finally {
      client.close();
      await h.close();
    }
  });

  test('a cursor beyond the head (store was reset) replays from the start instead of going silent', async () => {
    const h = await startHarness();
    const all = [1, 2].map((n) => publishEvent(h.db, 'match.evaluated', { count: n }));
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
    for (let n = 0; n < total; n++) publishEvent(h.db, 'match.evaluated', { count: n });
    h.db.exec('COMMIT');
    const client = await openSse(`${h.base}/api/events/stream?after=0`);
    try {
      await client.waitFor(() => client.events().length === total, 10_000);
      const ids = client.events().map((e) => e.seq_id);
      assert.deepEqual(ids, Array.from({ length: total }, (_, i) => i + 1));
    } finally {
      client.close();
      await h.close();
    }
  });

  test('stream catch-up matches poll catch-up for the same cursor', async () => {
    const h = await startHarness();
    const all = [1, 2, 3, 4].map((n) => publishEvent(h.db, 'opportunity.identified', { n }));
    const cursor = all[0]!.seq_id;
    const client = await openSse(`${h.base}/api/events/stream?after=${cursor}`);
    try {
      await client.waitFor(() => client.events().length === 3);
      const { body } = await getJson(`${h.base}/api/events/poll?after=${cursor}`);
      assert.deepEqual(client.events(), body.events);
    } finally {
      client.close();
      await h.close();
    }
  });

  test('picks up events written by another connection (e.g. the worker)', async () => {
    const h = await startHarness({ dbPollMs: 25 });
    const client = await openSse(`${h.base}/api/events/stream?after=0`);
    const worker = openWal(h.dbPath);
    try {
      await client.waitFor((t) => t.includes('retry:'));
      const external = publishEvent(worker, 'github.fetch.completed', { participant_id: 'p1' });
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

  test('never streams fields the sanitizer removed', async () => {
    const h = await startHarness();
    const client = await openSse(`${h.base}/api/events/stream?after=0`);
    try {
      publishEvent(h.db, 'participant.registered', { pseudonym: 'T', github_username: 'octocat', avatar_url: 'a', email: 'e' });
      await client.waitFor(() => client.events().length === 1);
      assert.deepEqual(client.events()[0]!.payload, { pseudonym: 'T' });
      assert.doesNotMatch(client.text(), /octocat|avatar_url|email/);
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
      assert.equal((await res.json()).error, 'invalid_cursor');
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
      publishEvent(h.db, 'match.evaluated', {});
    } finally {
      await h.close();
    }
  });
});

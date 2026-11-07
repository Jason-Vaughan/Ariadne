import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DatabaseSync } from 'node:sqlite';
import { openDatabase } from '../src/db/client.ts';
import { publishEvent } from '../src/events/bus.ts';
import { createServer, loadRoutes } from '../src/server.ts';
import type { Logger } from '../src/server.ts';
import { resetRoomData } from '../src/routes/admin.ts';
import { getAdmissionPolicy, setAdmissionPolicy } from '../src/routes/onboarding.ts';
import { setSeedMode } from '../src/routes/stage-snapshot.ts';

const REPO_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const NOW = '2026-11-07T19:00:00Z';
const silent: Logger = { info() {} };

/**
 * Open a throwaway database with the real schema.
 * @param t - Test context.
 * @returns The open database.
 */
function freshDb(t: { after: (fn: () => void) => void }): DatabaseSync {
  const dir = mkdtempSync(join(tmpdir(), 'ariadne-reset-'));
  const { db } = openDatabase({ path: join(dir, 'r.db'), schemaPath: join(REPO_ROOT, 'src', 'db', 'schema.sql') });
  t.after(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return db;
}

/**
 * Fill a room: two builders with a snapshot, evidence, a claim and a match each, seeds, a job and events.
 * @param db - Database.
 */
function populate(db: DatabaseSync): void {
  const ids: string[] = [];
  for (const [alias, login] of [['Thread-0A01', 'alice'], ['Thread-0B02', 'bob']] as const) {
    const id = randomUUID();
    ids.push(id);
    db.prepare(
      `INSERT INTO participants (id, display_alias, github_username, consent_status, consent_granted_at, analysis_state, contact_card, created_at, updated_at)
       VALUES (?, ?, ?, 'granted', ?, 'ready', 'secret@example.com', ?, ?)`,
    ).run(id, alias, login, NOW, NOW, NOW);
    db.prepare('INSERT INTO github_snapshots (github_username, participant_id, payload_json, fetched_at, expires_at) VALUES (?, ?, ?, ?, ?)')
      .run(login, id, '{"version":1}', NOW, NOW);
    const receipt = randomUUID();
    db.prepare(
      `INSERT INTO evidence_receipts (id, participant_id, source_type, source_url, title_or_summary, source_updated_at, fetched_at)
       VALUES (?, ?, 'repo_metadata', ?, 'repo', ?, ?)`,
    ).run(receipt, id, `https://github.com/${login}/x`, NOW, NOW);
    db.prepare(
      `INSERT INTO capability_claims (id, participant_id, category, name, epistemic_type, proficiency_signal, confidence, evidence_receipt_ids)
       VALUES (?, ?, 'language', 'Go', 'OBSERVED_FACT', 'primary', 0.9, ?)`,
    ).run(randomUUID(), id, JSON.stringify([receipt]));
    db.prepare(
      `INSERT INTO async_jobs (id, kind, participant_id, status, payload_json, run_after, created_at, updated_at)
       VALUES (?, 'participant.analyze', ?, 'queued', '{}', ?, ?, ?)`,
    ).run(randomUUID(), id, NOW, NOW, NOW);
  }
  const [a, b] = [...ids].sort() as [string, string];
  db.prepare(
    `INSERT INTO matches (id, participant_a_id, participant_b_id, composite_score, score_breakdown, complementary_summary, relevant_projects,
       suggested_first_collaboration, confidence_limitations, evidence_receipt_ids, intro_state, approval_a, approval_b, created_at, updated_at)
     VALUES (?, ?, ?, 80, '{}', 's', '[]', 'f', 'l', '["e1","e2"]', 'completed', 1, 1, ?, ?)`,
  ).run(randomUUID(), a, b, NOW, NOW);
  setSeedMode(db, true);
  publishEvent(db, 'participant.registered', { display_alias: 'Thread-0A01' });
  publishEvent(db, 'introduction.declined', { declined_total: 1 });
}

/**
 * Row count of a table.
 * @param db - Database.
 * @param table - Table name (fixed list in tests).
 * @returns Number of rows.
 */
function count(db: DatabaseSync, table: string): number {
  return Number((db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n);
}

const ROOM_TABLES = ['participants', 'evidence_receipts', 'capability_claims', 'opportunity_needs', 'matches', 'async_jobs', 'domain_events'];

describe('resetRoomData', () => {
  test('clears every participant and everything derived from them, keeping cached snapshots un-linked', (t) => {
    const db = freshDb(t);
    populate(db);
    assert.ok(count(db, 'participants') > 2 && count(db, 'matches') === 1 && count(db, 'domain_events') === 2);

    const state = resetRoomData(db);
    for (const table of ROOM_TABLES) assert.equal(count(db, table), 0, table);
    assert.equal(count(db, 'github_snapshots'), 2, 'the public GitHub cache survives');
    assert.equal(Number((db.prepare('SELECT COUNT(*) AS n FROM github_snapshots WHERE participant_id IS NOT NULL').get() as { n: number }).n), 0);
    assert.equal(state.activeParticipants, 0);
    assert.equal(state.seedCount, 0);
    assert.equal(state.seedMode, false);
    assert.deepEqual(state.queue, { queued: 0, running: 0, failed: 0 });
  });

  test('room capacity and intake lock are kept', (t) => {
    const db = freshDb(t);
    const saved = getAdmissionPolicy();
    t.after(() => setAdmissionPolicy(saved));
    setAdmissionPolicy({ maxRoomCapacity: 80, intakeLocked: true });
    populate(db);
    const state = resetRoomData(db);
    assert.equal(state.maxRoomCapacity, 80);
    assert.equal(state.intakeLocked, true);
  });

  test('new events after a reset keep their sequence ahead of any client cursor', (t) => {
    const db = freshDb(t);
    populate(db);
    resetRoomData(db);
    const { envelope } = publishEvent(db, 'introduction.declined', { declined_total: 1 });
    assert.ok(envelope.seq_id > 2, 'AUTOINCREMENT keeps counting, so stale cursors never skip new events');
  });
});

describe('POST /api/admin/reset', () => {
  /**
   * Serve the repository routes over a database.
   * @param db - Database.
   * @param run - Callback given the port.
   */
  async function withServer(db: DatabaseSync, run: (port: number) => Promise<void>): Promise<void> {
    const server = createServer({ db, routes: await loadRoutes(join(REPO_ROOT, 'src', 'routes')), publicDir: null, log: silent });
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    try {
      await run((server.address() as { port: number }).port);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((done) => server.close(() => done()));
    }
  }

  /**
   * POST to the reset route.
   * @param port - Server port.
   * @param headers - Request headers.
   * @returns Status and parsed body.
   */
  function post(port: number, headers: Record<string, string>): Promise<{ status: number; body: Record<string, unknown> }> {
    return new Promise((done, fail) => {
      const req = request({ host: '127.0.0.1', port, method: 'POST', path: '/api/admin/reset', headers }, (res) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (c: string) => (text += c));
        res.on('end', () => done({ status: res.statusCode ?? 0, body: JSON.parse(text) as Record<string, unknown> }));
      });
      req.on('error', fail);
      req.end('{}');
    });
  }

  test('refuses anything but a same-origin JSON request from the presenter machine, and then resets', async (t) => {
    const db = freshDb(t);
    populate(db);
    await withServer(db, async (port) => {
      const json = { 'content-type': 'application/json' };
      assert.equal((await post(port, { ...json, 'x-forwarded-for': '203.0.113.9' })).status, 403, 'through the tunnel');
      assert.equal((await post(port, { ...json, host: `evil.example:${port}`, origin: `http://evil.example:${port}` })).status, 403, 'DNS rebinding');
      assert.equal((await post(port, { 'content-type': 'text/plain' })).status, 415, 'cross-site simple request');
      assert.equal((await post(port, { ...json, origin: 'https://evil.example' })).status, 403, 'foreign origin');
      assert.ok(count(db, 'participants') > 0, 'no refused request deleted anything');

      const ok = await post(port, { ...json, origin: `http://127.0.0.1:${port}` });
      assert.equal(ok.status, 200);
      assert.equal(ok.body.activeParticipants, 0);
      for (const table of ROOM_TABLES) assert.equal(count(db, table), 0, table);
    });
  });
});

test('the operator panel offers a two-click reset', () => {
  const source = readFileSync(join(REPO_ROOT, 'src', 'routes', 'admin.ts'), 'utf8');
  assert.ok(source.includes('<button id="reset" type="button">🧹 Reset all room data</button>'));
  assert.ok(source.includes("'Click again to confirm full reset'"));
  assert.ok(source.includes("fetch('/api/admin/reset', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })"));
});

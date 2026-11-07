import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DatabaseSync } from 'node:sqlite';
import { openDatabase } from '../src/db/client.ts';
import { publishEvent } from '../src/events/bus.ts';
import {
  buildStageSnapshot,
  isActiveEvent,
  RECENT_EVENT_COUNT,
  seedProfiles,
  setSeedMode,
} from '../src/routes/stage-snapshot.ts';

const REPO_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const NOW = '2026-11-07T19:00:00Z';

/**
 * Open a throwaway database with the real schema.
 * @param t - Test context.
 * @returns The open database.
 */
function freshDb(t: { after: (fn: () => void) => void }): DatabaseSync {
  const dir = mkdtempSync(join(tmpdir(), 'ariadne-events-'));
  const { db } = openDatabase({ path: join(dir, 'e.db'), schemaPath: join(REPO_ROOT, 'src', 'db', 'schema.sql') });
  t.after(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return db;
}

/**
 * Insert a participant with stage consent off.
 * @param db - Database.
 * @param alias - Display alias.
 * @param username - GitHub login.
 * @returns Participant id.
 */
function addParticipant(db: DatabaseSync, alias: string, username: string): string {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO participants (id, display_alias, github_username, consent_status, consent_granted_at, analysis_state, created_at, updated_at)
     VALUES (?, ?, ?, 'granted', ?, 'ready', ?, ?)`,
  ).run(id, alias, username, NOW, NOW, NOW);
  return id;
}

/**
 * Aliases named by the snapshot's recent events, in feed order.
 * @param db - Database.
 * @returns One entry per event: its aliases joined, or `global`.
 */
function feed(db: DatabaseSync): string[] {
  return buildStageSnapshot(db).recent_events.map((e) => {
    const p = e.payload as Record<string, unknown>;
    const names = [p.display_alias, p.display_alias_a, p.display_alias_b].filter((x) => typeof x === 'string');
    return names.length ? names.join('+') : 'global';
  });
}

test('a builder who withdraws and is deleted disappears from the event feed, with their pair events', (t) => {
  const db = freshDb(t);
  addParticipant(db, 'Thread-0A01', 'alice');
  const warp = addParticipant(db, 'Warp-09E0', 'warp');
  const spindle = addParticipant(db, 'Spindle-7732', 'spindle');
  publishEvent(db, 'participant.registered', { display_alias: 'Thread-0A01' });
  publishEvent(db, 'participant.registered', { display_alias: 'Warp-09E0' });
  publishEvent(db, 'participant.registered', { display_alias: 'Spindle-7732' });
  publishEvent(db, 'match.candidate.generated', { match_id: randomUUID(), display_alias_a: 'Thread-0A01', display_alias_b: 'Warp-09E0' });
  publishEvent(db, 'introduction.declined', { declined_total: 1 });
  assert.deepEqual(feed(db), ['Thread-0A01', 'Warp-09E0', 'Spindle-7732', 'Thread-0A01+Warp-09E0', 'global']);

  // "Withdraw & Delete My Data" removes the row; a consent withdrawal alone also takes them off stage.
  db.prepare('DELETE FROM participants WHERE id = ?').run(warp);
  db.prepare("UPDATE participants SET consent_status = 'withdrawn', analysis_state = 'withdrawn' WHERE id = ?").run(spindle);
  publishEvent(db, 'analysis.failed', { display_alias: 'Spindle-7732', reason_code: 'consent_withdrawn' });

  assert.deepEqual(feed(db), ['Thread-0A01', 'global']);
  assert.doesNotMatch(JSON.stringify(buildStageSnapshot(db).recent_events), /Warp-09E0|Spindle-7732/);
});

test('seed events leave the feed when seeds are switched off and return when they are back on', (t) => {
  const db = freshDb(t);
  setSeedMode(db, true);
  const seed = seedProfiles()[0];
  assert.ok(seed);
  publishEvent(db, 'participant.registered', { display_alias: seed.display_alias });
  assert.deepEqual(feed(db), [seed.display_alias]);
  setSeedMode(db, false);
  assert.deepEqual(feed(db), []);
  setSeedMode(db, true);
  assert.deepEqual(feed(db), [seed.display_alias]);
});

test('the feed stays full when old events of removed builders fill the window', (t) => {
  const db = freshDb(t);
  const gone = addParticipant(db, 'Warp-09E0', 'warp');
  addParticipant(db, 'Thread-0A01', 'alice');
  for (let i = 0; i < RECENT_EVENT_COUNT; i++) publishEvent(db, 'github.fetch.started', { display_alias: 'Thread-0A01' });
  for (let i = 0; i < 100; i++) publishEvent(db, 'github.fetch.started', { display_alias: 'Warp-09E0' });
  db.prepare('DELETE FROM participants WHERE id = ?').run(gone);
  const events = buildStageSnapshot(db).recent_events;
  assert.equal(events.length, RECENT_EVENT_COUNT, 'removed builders’ events do not crowd out active ones');
  assert.ok(events.every((e) => (e.payload as { display_alias?: string }).display_alias === 'Thread-0A01'));
});

test('isActiveEvent needs every named builder on stage and always keeps global events', () => {
  const active = new Set(['Thread-0A01', 'Loom-0002']);
  const event = (payload: Record<string, unknown>) =>
    ({ seq_id: 1, event_id: randomUUID(), type: 'participant.registered', occurred_at: NOW, payload }) as Parameters<typeof isActiveEvent>[0];
  assert.equal(isActiveEvent(event({ display_alias: 'Thread-0A01' }), active), true);
  assert.equal(isActiveEvent(event({ display_alias: 'Warp-09E0' }), active), false);
  assert.equal(isActiveEvent(event({ display_alias_a: 'Thread-0A01', display_alias_b: 'Loom-0002' }), active), true);
  assert.equal(isActiveEvent(event({ display_alias_a: 'Thread-0A01', display_alias_b: 'Warp-09E0' }), active), false, 'both sides must be present');
  assert.equal(isActiveEvent(event({ declined_total: 3 }), active), true);
});

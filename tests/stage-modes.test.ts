import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DatabaseSync } from 'node:sqlite';
import { openDatabase } from '../src/db/client.ts';
import { publishEvent } from '../src/events/bus.ts';
import { createServer, loadRoutes } from '../src/server.ts';
import type { Logger } from '../src/server.ts';
import { getAdmissionPolicy, setAdmissionPolicy } from '../src/routes/onboarding.ts';
import {
  buildStageSnapshot,
  parseBreakdown,
  parseFingerprint,
  scoreContributions,
  seedProfiles,
  setSeedMode,
  SPOTLIGHT_LIMIT,
  stageSafeEvent,
} from '../src/routes/stage-snapshot.ts';
import {
  describeEvent,
  groupEvents,
  pipelineTiles,
  stageForEvent,
} from '../public/stage/activity-feed.js';
import { galleryOrder, radarPoint, radarPolygon, strongestAxis } from '../public/stage/fingerprints.js';
import { breakdownRows, resolveIndex, stepIndex } from '../public/stage/spotlight.js';
import { actionForKey, hudItems } from '../public/stage/operator-controls.js';

const REPO_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const NOW = '2026-11-07T19:00:00Z';
const silent: Logger = { info() {} };
const BREAKDOWN = { capability_similarity: 0.8, need_offer_fit: 0.6, complementarity: 0.5, novelty: 0.4, freshness: 1 };
const FINGERPRINT = { systems_infra: 80, agent_orchestration: 95, llm_eval: 40, frontend_ux: 10, product_gtm: 20, data_pipelines: 60 };

/**
 * Open a throwaway database with the real schema.
 * @param t - Test context.
 * @returns The open database.
 */
function freshDb(t: { after: (fn: () => void) => void }): DatabaseSync {
  const dir = mkdtempSync(join(tmpdir(), 'ariadne-modes-'));
  const { db } = openDatabase({ path: join(dir, 'modes.db'), schemaPath: join(REPO_ROOT, 'src', 'db', 'schema.sql') });
  t.after(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return db;
}

/**
 * Insert a participant.
 * @param db - Database.
 * @param alias - Display alias.
 * @param username - GitHub login.
 * @param options - Consent, analysis state and consent status.
 * @returns Participant id.
 */
function addParticipant(
  db: DatabaseSync,
  alias: string,
  username: string,
  options: { consent?: 0 | 1; state?: string; status?: string } = {},
): string {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO participants (id, display_alias, github_username, consent_status, consent_granted_at,
       stage_display_consent, contact_card, analysis_state, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'secret@example.com', ?, ?, ?)`,
  ).run(id, alias, username, options.status ?? 'granted', NOW, options.consent ?? 0, options.state ?? 'ready', NOW, NOW);
  return id;
}

/**
 * Insert an evidence receipt.
 * @param db - Database.
 * @param participantId - Owner.
 * @param title - Summary text.
 * @param options - Source type and repo.
 * @returns Receipt id.
 */
function addEvidence(
  db: DatabaseSync,
  participantId: string,
  title: string,
  options: { type?: string; repo?: string | null; url?: string } = {},
): string {
  const id = randomUUID();
  const type = options.type ?? 'repo_metadata';
  const url = options.url ?? (type === 'public_website' ? 'https://example.com/about' : `https://github.com/${options.repo ?? 'x/y'}`);
  db.prepare(
    `INSERT INTO evidence_receipts (id, participant_id, source_type, source_url, repo_full_name, title_or_summary,
       source_updated_at, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, participantId, type, url, options.repo === undefined ? 'x/y' : options.repo, title, NOW, NOW);
  return id;
}

/**
 * Insert a capability claim citing a receipt.
 * @param db - Database.
 * @param participantId - Owner.
 * @param receiptId - Cited receipt.
 * @param dismissed - Whether the participant dismissed it.
 */
function addClaim(db: DatabaseSync, participantId: string, receiptId: string, dismissed = 0): void {
  db.prepare(
    `INSERT INTO capability_claims (id, participant_id, category, name, epistemic_type, proficiency_signal, confidence,
       evidence_receipt_ids, dismissed_by_user) VALUES (?, ?, 'language', 'TypeScript', 'OBSERVED_FACT', 'primary', 0.9, ?, ?)`,
  ).run(randomUUID(), participantId, JSON.stringify([receiptId]), dismissed);
}

/**
 * Store a GitHub snapshot whose payload carries a fingerprint.
 * @param db - Database.
 * @param participantId - Owner.
 * @param username - GitHub login.
 * @param fingerprint - Fingerprint value to store (any shape, to test parsing).
 */
function addSnapshot(db: DatabaseSync, participantId: string, username: string, fingerprint: unknown): void {
  db.prepare(
    `INSERT INTO github_snapshots (github_username, participant_id, payload_json, fetched_at, expires_at) VALUES (?, ?, ?, ?, ?)`,
  ).run(username, participantId, JSON.stringify({ version: 1, fingerprint }), NOW, NOW);
}

/**
 * Insert a match.
 * @param db - Database.
 * @param x - One participant.
 * @param y - The other.
 * @param score - Composite score.
 * @param introState - Introduction state.
 * @param evidenceIds - Cited receipts (at least two).
 * @returns Match id.
 */
function addMatch(db: DatabaseSync, x: string, y: string, score: number, introState: string, evidenceIds: string[]): string {
  const [a, b] = x < y ? [x, y] : [y, x];
  const both = introState === 'completed' || introState === 'mutual_accepted' ? 1 : 0;
  const approvalA = both || introState === 'proposed_by_a' ? 1 : 0;
  const approvalB = both || introState === 'proposed_by_b' ? 1 : 0;
  const id = randomUUID();
  db.prepare(
    `INSERT INTO matches (id, participant_a_id, participant_b_id, composite_score, score_breakdown, complementary_summary,
       relevant_projects, suggested_first_collaboration, confidence_limitations, evidence_receipt_ids, intro_state,
       approval_a, approval_b, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'Agents meet infra in repo octo/agent-kit', '[]', 'Pair on the eval harness', 'l', ?, ?, ?, ?, ?, ?)`,
  ).run(id, a, b, score, JSON.stringify(BREAKDOWN), JSON.stringify(evidenceIds), introState, approvalA, approvalB, NOW, NOW);
  return id;
}

describe('pipeline (view 1)', () => {
  test('counters cover live builders only, per stage', (t) => {
    const db = freshDb(t);
    addParticipant(db, 'Thread-0001', 'q1', { state: 'registered' });
    addParticipant(db, 'Thread-0002', 'f1', { state: 'fetching_github' });
    addParticipant(db, 'Thread-0003', 'x1', { state: 'failed' });
    addParticipant(db, 'Thread-0004', 'a1', { state: 'analyzing_profile' });
    const ready = addParticipant(db, 'Thread-0005', 'r1');
    const other = addParticipant(db, 'Thread-0006', 'r2');
    addParticipant(db, 'Thread-0007', 'gone', { status: 'withdrawn' });
    const e1 = addEvidence(db, ready, 'agent-kit repo', { repo: 'r1/agent-kit' });
    const e2 = addEvidence(db, ready, 'portfolio site', { type: 'public_website', repo: null });
    const e3 = addEvidence(db, other, 'pipelines repo', { repo: 'r2/pipes' });
    addClaim(db, ready, e1);
    addClaim(db, ready, e2, 1);
    addMatch(db, ready, other, 70, 'proposed_by_a', [e1, e3]);
    setSeedMode(db, true);

    const { pipeline } = buildStageSnapshot(db);
    assert.deepEqual(pipeline, {
      crawl: { registered: 1, fetching: 1, failed: 1 },
      evidence: { receipts: 3, repos: 2, websites: 1 },
      fingerprint: { analyzing: 1, ready: 2, claims: 1 },
      match: { matches: 1, one_sided: 1, golden: 0 },
    });
  });

  test('recent events keep a GitHub identity only for builders shown on stage now', (t) => {
    const db = freshDb(t);
    addParticipant(db, 'Thread-0A01', 'alice', { consent: 1 });
    addParticipant(db, 'Thread-0B02', 'bob', { consent: 0 });
    publishEvent(db, 'participant.registered', {
      display_alias: 'Thread-0A01',
      display: { stage_display_consent: true, github_username: 'alice', avatar_url: null },
    });
    // bob consented when this event was written and has since withdrawn stage display.
    publishEvent(db, 'participant.registered', {
      display_alias: 'Thread-0B02',
      display: { stage_display_consent: true, github_username: 'bob', avatar_url: null },
    });

    const open = buildStageSnapshot(db);
    assert.equal(open.recent_events.length, 2);
    assert.deepEqual(open.recent_events.map((e) => describeEvent(e)), ['@alice scanned in', 'Thread-0B02 scanned in']);
    assert.doesNotMatch(JSON.stringify(open.recent_events), /bob/);

    const privateMode = buildStageSnapshot(db, { privacyMode: true });
    assert.doesNotMatch(JSON.stringify(privateMode.recent_events), /alice|bob/);
  });

  test('worker events that carry only aliases gain the identity of builders shown on stage now', (t) => {
    const db = freshDb(t);
    addParticipant(db, 'Thread-0A01', 'alice', { consent: 1 });
    addParticipant(db, 'Thread-0B02', 'bob', { consent: 0 });
    db.prepare("UPDATE participants SET avatar_url = 'https://avatars.githubusercontent.com/u/1?v=4' WHERE github_username = 'alice'").run();
    publishEvent(db, 'github.fetch.completed', { display_alias: 'Thread-0A01', repo_count: 3, evidence_count: 9 });
    publishEvent(db, 'match.evaluated', { match_id: randomUUID(), display_alias_a: 'Thread-0A01', display_alias_b: 'Thread-0B02', composite_score: 77 });

    const lines = buildStageSnapshot(db).recent_events.map((e) => describeEvent(e));
    assert.deepEqual(lines, ['@alice: 3 repos → 9 evidence receipts', 'Scored @alice ↔ Thread-0B02: 77']);
    const first = buildStageSnapshot(db).recent_events[0]?.payload as Record<string, unknown>;
    assert.deepEqual(first.display, { stage_display_consent: true, github_username: 'alice', avatar_url: 'https://avatars.githubusercontent.com/u/1?v=4' });
    assert.doesNotMatch(JSON.stringify(buildStageSnapshot(db).recent_events), /bob/);

    const privateMode = buildStageSnapshot(db, { privacyMode: true }).recent_events.map((e) => describeEvent(e));
    assert.deepEqual(privateMode, ['Thread-0A01: 3 repos → 9 evidence receipts', 'Scored Thread-0A01 ↔ Thread-0B02: 77']);
  });

  test('stageSafeEvent strips both sides of a pair independently', () => {
    const event = {
      seq_id: 1,
      event_id: randomUUID(),
      type: 'introduction.completed' as const,
      occurred_at: NOW,
      payload: {
        match_id: randomUUID(),
        display_alias_a: 'Thread-0A01',
        display_alias_b: 'Thread-0B02',
        display_a: { stage_display_consent: true as const, github_username: 'alice', avatar_url: null },
        display_b: { stage_display_consent: true as const, github_username: 'bob', avatar_url: null },
        channel: 'web' as const,
      },
    };
    const safe = stageSafeEvent(event, new Set(['Thread-0A01']));
    assert.equal(describeEvent(safe), '⚡ Golden thread @alice ↔ Thread-0B02');
    assert.ok('display_b' in event.payload, 'the original event is not modified');
  });

  test('every event type maps to a column and a readable line', () => {
    const pair = { match_id: 'm', display_alias_a: 'Loom-0001', display_alias_b: 'Weft-0002' };
    const cases: Array<[string, Record<string, unknown>, string, string]> = [
      ['participant.registered', { display_alias: 'Loom-0001' }, 'crawl', 'Loom-0001 scanned in'],
      ['github.fetch.started', { display_alias: 'Loom-0001' }, 'crawl', "Crawling Loom-0001's public GitHub"],
      ['analysis.failed', { display_alias: 'Loom-0001', reason_code: 'github_rate_limited' }, 'crawl', 'Loom-0001: GitHub rate limit, retrying'],
      ['github.fetch.completed', { display_alias: 'Loom-0001', repo_count: 12, evidence_count: 30 }, 'evidence', 'Loom-0001: 12 repos → 30 evidence receipts'],
      ['profile.analysis.completed', { display_alias: 'Loom-0001', capability_count: 7 }, 'fingerprint', 'Loom-0001: fingerprint ready, 7 capabilities'],
      ['opportunity.identified', { display_alias: 'Loom-0001', opportunity_type: 'open_issue_help' }, 'fingerprint', 'Loom-0001: spotted open issues to help with'],
      ['match.candidate.generated', pair, 'match', 'Candidate match Loom-0001 ↔ Weft-0002'],
      ['match.evaluated', { ...pair, composite_score: 88 }, 'match', 'Scored Loom-0001 ↔ Weft-0002: 88'],
      ['introduction.proposed', pair, 'match', 'Interest sent Loom-0001 ↔ Weft-0002'],
      ['introduction.accepted', pair, 'match', 'Interest returned Loom-0001 ↔ Weft-0002'],
      ['introduction.declined', { declined_total: 2 }, 'match', '2 intros passed on, privately'],
      ['introduction.completed', { ...pair, channel: 'web' }, 'match', '⚡ Golden thread Loom-0001 ↔ Weft-0002'],
    ];
    for (const [type, payload, stage, text] of cases) {
      assert.equal(stageForEvent(type), stage, type);
      assert.equal(describeEvent({ type, payload }), text, type);
    }
    assert.equal(stageForEvent('unknown.type'), null);
  });

  test('groupEvents lists the newest first and caps each column', () => {
    const events = Array.from({ length: 9 }, (_, i) => ({
      seq_id: i + 1,
      type: 'participant.registered',
      payload: { display_alias: `Loom-000${i + 1}` },
    }));
    events.push({ seq_id: 10, type: 'introduction.completed', payload: { match_id: 'm', display_alias_a: 'Loom-0001', display_alias_b: 'Loom-0002', channel: 'web' } } as never);
    const grouped = groupEvents(events, 3);
    assert.deepEqual(grouped.crawl.map((e: { seq_id: number }) => e.seq_id), [9, 8, 7]);
    assert.equal(grouped.match[0]?.golden, true);
    assert.deepEqual(grouped.evidence, []);
    const tiles = pipelineTiles({
      crawl: { registered: 1, fetching: 2, failed: 3 },
      evidence: { receipts: 4, repos: 5, websites: 6 },
      fingerprint: { analyzing: 7, ready: 8, claims: 9 },
      match: { matches: 10, one_sided: 11, golden: 12 },
    });
    assert.deepEqual(Object.values(tiles).flat().map((tile: { value: number }) => tile.value), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });
});

describe('fingerprints (view 2)', () => {
  test('cards carry the stored fingerprint and evidence, with titles only for builders shown on stage', (t) => {
    const db = freshDb(t);
    const alice = addParticipant(db, 'Thread-0A01', 'alice', { consent: 1 });
    const bob = addParticipant(db, 'Thread-0B02', 'bob');
    addSnapshot(db, alice, 'alice', FINGERPRINT);
    addSnapshot(db, bob, 'bob', { ...FINGERPRINT, llm_eval: 140, frontend_ux: -5 });
    const ea = addEvidence(db, alice, 'alice/agent-kit: multi-agent runtime', { repo: 'alice/agent-kit' });
    addEvidence(db, bob, 'bob/secret-lab: eval harness', { repo: 'bob/secret-lab' });
    addClaim(db, alice, ea);

    const snapshot = buildStageSnapshot(db);
    const [a, b] = snapshot.fingerprints;
    assert.ok(a && b);
    assert.deepEqual([a.label, a.fingerprint, a.evidence_count, a.claim_count], ['@alice', FINGERPRINT, 1, 1]);
    assert.deepEqual(a.evidence, [{ source_type: 'repo_metadata', title: 'alice/agent-kit: multi-agent runtime', url: 'https://github.com/alice/agent-kit' }]);
    assert.equal(b.label, 'Thread-0B02');
    assert.equal(b.fingerprint?.llm_eval, 100, 'values are clamped to 0–100');
    assert.equal(b.fingerprint?.frontend_ux, 0);
    assert.deepEqual(b.evidence, [{ source_type: 'repo_metadata', title: null, url: null }]);
    assert.doesNotMatch(JSON.stringify(snapshot), /secret-lab|bob\/|secret@example\.com/);

    const privateMode = buildStageSnapshot(db, { privacyMode: true });
    assert.doesNotMatch(JSON.stringify(privateMode.fingerprints), /alice/);
  });

  test('parseFingerprint rejects missing, malformed or incomplete vectors', () => {
    assert.equal(parseFingerprint(null), null);
    assert.equal(parseFingerprint('{bad'), null);
    assert.equal(parseFingerprint('"text"'), null);
    assert.equal(parseFingerprint(JSON.stringify({ ...FINGERPRINT, data_pipelines: 'high' })), null);
    const { data_pipelines: _dropped, ...partial } = FINGERPRINT;
    assert.equal(parseFingerprint(JSON.stringify(partial)), null);
    assert.deepEqual(parseFingerprint(JSON.stringify({ ...FINGERPRINT, extra: 5 })), FINGERPRINT);
  });

  test('radar geometry, strongest axis and gallery order', () => {
    const top = radarPoint(0, 1, 50);
    assert.ok(Math.abs(top.x) < 1e-9 && Math.abs(top.y + 50) < 1e-9, 'first axis points straight up');
    assert.equal(radarPolygon(FINGERPRINT, 100).split(' ').length, 6);
    assert.equal(radarPolygon({}, 100), '0.0,0.0 0.0,0.0 0.0,0.0 0.0,0.0 0.0,0.0 0.0,0.0');
    assert.equal(strongestAxis(FINGERPRINT), 'Agents');
    const cards = [
      { alias: 'old-live', is_seed: false, fingerprint: FINGERPRINT },
      { alias: 'seed', is_seed: true, fingerprint: FINGERPRINT },
      { alias: 'pending', is_seed: false, fingerprint: null },
      { alias: 'new-live', is_seed: false, fingerprint: FINGERPRINT },
    ];
    assert.deepEqual(galleryOrder(cards).map((c: { alias: string }) => c.alias), ['new-live', 'old-live', 'pending', 'seed']);
  });
});

describe('spotlight (view 4)', () => {
  test('pairs come golden first, each side shows only its own cited evidence, and the thesis needs both consents', (t) => {
    const db = freshDb(t);
    const alice = addParticipant(db, 'Thread-0A01', 'alice', { consent: 1 });
    const bob = addParticipant(db, 'Thread-0B02', 'bob', { consent: 1 });
    const carol = addParticipant(db, 'Thread-0C03', 'carol');
    const ea = addEvidence(db, alice, 'alice runtime', { repo: 'alice/rt' });
    addEvidence(db, alice, 'alice uncited', { repo: 'alice/other' });
    const eb = addEvidence(db, bob, 'bob evals', { repo: 'bob/evals' });
    const ec = addEvidence(db, carol, 'carol private repo', { repo: 'carol/x' });
    const gold = addMatch(db, alice, bob, 61, 'completed', [ea, eb]);
    const high = addMatch(db, alice, carol, 95, 'candidate', [ea, ec]);
    addMatch(db, bob, carol, 99, 'declined', [eb, ec]);

    const { spotlight } = buildStageSnapshot(db);
    assert.deepEqual(spotlight.map((s) => s.match_id), [gold, high], 'golden before a higher score; declined hidden');
    const [g, h] = spotlight;
    assert.ok(g && h);
    assert.deepEqual(g.breakdown, BREAKDOWN);
    assert.deepEqual(g.contributions, { capability_similarity: 28, need_offer_fit: 18, complementarity: 7.5, novelty: 4, freshness: 10 });
    const sides = [g.a, g.b].sort((x, y) => x.label.localeCompare(y.label));
    assert.deepEqual(sides.map((s) => s.evidence.map((e) => e.title)), [['alice runtime'], ['bob evals']]);
    assert.deepEqual(g.thesis, { summary: 'Agents meet infra in repo octo/agent-kit', first_collaboration: 'Pair on the eval harness' });

    assert.equal(h.thesis, null, 'carol has not opted in, so the pair thesis stays private');
    const carolSide = h.a.alias === 'Thread-0C03' ? h.a : h.b;
    assert.deepEqual(carolSide.evidence, [{ source_type: 'repo_metadata', title: null, url: null }]);
    assert.doesNotMatch(JSON.stringify(h), /carol/);

    const privateMode = buildStageSnapshot(db, { privacyMode: true }).spotlight;
    assert.ok(privateMode.every((s) => s.thesis === null));
    assert.doesNotMatch(JSON.stringify(privateMode), /alice|bob|octo\/agent-kit/);
  });

  test('the spotlight is capped and tolerates a malformed breakdown', (t) => {
    const db = freshDb(t);
    const hub = addParticipant(db, 'Thread-0A01', 'hub');
    const e1 = addEvidence(db, hub, 'hub repo');
    for (let i = 0; i < SPOTLIGHT_LIMIT + 3; i++) {
      const other = addParticipant(db, `Thread-1${String(i).padStart(3, '0')}`, `peer${i}`);
      addMatch(db, hub, other, 50 + i, 'candidate', [e1, addEvidence(db, other, 'peer repo')]);
    }
    db.prepare("UPDATE matches SET score_breakdown = '{\"capability_similarity\": 2}' WHERE composite_score = 64").run();
    const { spotlight } = buildStageSnapshot(db);
    assert.equal(spotlight.length, SPOTLIGHT_LIMIT);
    const top = spotlight[0];
    assert.ok(top);
    assert.equal(top.score, 64);
    assert.equal(top.breakdown, null);
    assert.equal(top.contributions, null);
    assert.equal(parseBreakdown('nope'), null);
    assert.deepEqual(scoreContributions({ capability_similarity: 1, need_offer_fit: 1, complementarity: 1, novelty: 1, freshness: 1 }), {
      capability_similarity: 35, need_offer_fit: 30, complementarity: 15, novelty: 10, freshness: 10,
    });
  });

  test('stepping wraps both ways and a refresh keeps the same match on screen', () => {
    assert.equal(stepIndex(0, 3, -1), 2);
    assert.equal(stepIndex(2, 3, 1), 0);
    assert.equal(stepIndex(0, 0, 1), 0);
    const entries = [{ match_id: 'a' }, { match_id: 'b' }, { match_id: 'c' }];
    assert.equal(resolveIndex(entries, 'c', 0), 2);
    assert.equal(resolveIndex(entries, 'gone', 7), 2);
    assert.equal(resolveIndex([], 'gone', 3), 0);
    assert.deepEqual(breakdownRows(null, null), []);
    const rows = breakdownRows(BREAKDOWN, scoreContributions(BREAKDOWN));
    assert.deepEqual(rows.map((r: { points: number }) => r.points), [28, 18, 7.5, 4, 10]);
  });
});

describe('operator controls', () => {
  test('hotkeys map to actions, and spotlight stepping applies only on view 4', () => {
    for (const [key, action] of [['1', 'view:1'], ['4', 'view:4'], ['q', 'qr'], ['S', 'seed'], ['p', 'privacy'], [' ', 'cycle']] as const) {
      assert.equal(actionForKey({ key }, '3'), action, key);
    }
    assert.equal(actionForKey({ key: 'ArrowRight' }, '4'), 'spotlight:next');
    assert.equal(actionForKey({ key: 'n' }, '4'), 'spotlight:next');
    assert.equal(actionForKey({ key: 'ArrowLeft' }, '4'), 'spotlight:prev');
    assert.equal(actionForKey({ key: 'p' }, '4'), 'privacy', 'P stays the privacy override in the spotlight');
    assert.equal(actionForKey({ key: 'ArrowRight' }, '3'), null);
    assert.equal(actionForKey({ key: 'q', metaKey: true }, '3'), null, 'browser shortcuts pass through');
    assert.equal(actionForKey({ key: 'x' }, '3'), null);
    for (const view of ['1', '2', '3', '4']) {
      assert.equal(actionForKey({ key: 'a' }, view), 'qr:floating', `A in view ${view}`);
      assert.equal(actionForKey({ key: 'A' }, view), 'qr:floating', `Shift+A in view ${view}`);
      assert.equal(actionForKey({ key: 'r' }, view), 'qr:floating', `R in view ${view}`);
    }
  });

  test('the HUD reports room fill, intake lock, channel and modes', () => {
    const base = { privacy_mode: false, presenter: true, admission: { max_room_capacity: 30, intake_locked: false, live_builders: 8 } };
    assert.deepEqual(hudItems(base, { channel: 'SSE', cycling: false }).map((i: { text: string }) => i.text), ['Room 8/30', 'Intake open', 'Live: SSE']);
    const full = { ...base, privacy_mode: true, presenter: false, admission: { max_room_capacity: 8, intake_locked: false, live_builders: 8 } };
    assert.deepEqual(hudItems(full, { channel: 'event polling', cycling: true }).map((i: { text: string }) => i.text),
      ['Room 8/8', 'Room full', 'Live: event polling', 'Privacy override ON', 'Auto-cycle ON', 'View-only screen']);
    const locked = { ...base, admission: { ...base.admission, intake_locked: true } };
    assert.equal(hudItems(locked, { channel: 'SSE', cycling: false })[1]?.text, '🔒 Intake locked');
  });

  test('the snapshot reports the live admission policy', (t) => {
    const db = freshDb(t);
    const saved = getAdmissionPolicy();
    t.after(() => setAdmissionPolicy(saved));
    addParticipant(db, 'Thread-0A01', 'alice');
    setSeedMode(db, true);
    setAdmissionPolicy({ maxRoomCapacity: 50, intakeLocked: true });
    assert.deepEqual(buildStageSnapshot(db).admission, { max_room_capacity: 50, intake_locked: true, live_builders: 1 });
    assert.equal(seedProfiles().length, 25, 'seeds never count against the room');
  });
});

test('/stage/ mounts the view modules and serves them as JavaScript', async (t) => {
  const db = freshDb(t);
  const server = createServer({ db, routes: await loadRoutes(join(REPO_ROOT, 'src', 'routes')), publicDir: join(REPO_ROOT, 'public'), log: silent });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const port = (server.address() as { port: number }).port;
  const get = (path: string): Promise<{ status: number; type: string; body: string }> =>
    new Promise((done, fail) => {
      request({ host: '127.0.0.1', port, path }, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (c: string) => (body += c));
        res.on('end', () => done({ status: res.statusCode ?? 0, type: String(res.headers['content-type'] ?? ''), body }));
      }).on('error', fail).end();
    });
  const page = await get('/stage/');
  for (const module of ['activity-feed.js', 'fingerprints.js', 'spotlight.js', 'operator-controls.js', 'network-graph.js']) {
    assert.ok(page.body.includes(`from './${module}'`), module);
    const served = await get(`/stage/${module}`);
    assert.equal(served.status, 200, module);
    assert.equal(served.type, 'text/javascript; charset=utf-8', module);
  }
  for (const id of ['id="pipeline"', 'id="gallery"', 'id="spotlight"', 'id="hud"', 'data-action="spotlight:next"', 'data-action="spotlight:prev"']) {
    assert.ok(page.body.includes(id), id);
  }
  assert.doesNotMatch(page.body, /arrives with A-011/, 'no placeholder views remain');
});

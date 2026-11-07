import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DatabaseSync } from 'node:sqlite';
import { openDatabase } from '../src/db/client.ts';
import { ANALYZE_JOB_KIND } from '../src/routes/onboarding.ts';
import { buildStageSnapshot, seedProfiles, setSeedMode, stageAvatarUrl } from '../src/routes/stage-snapshot.ts';
import { DEFAULT_WORKER_SETTINGS, runWorkerTick } from '../src/worker/job-runner.ts';
import type { WorkerDeps } from '../src/worker/job-runner.ts';
import { loadSeedPersonas, seedSnapshot } from '../src/worker/seed-personas.ts';
import { renderGraph } from '../public/stage/network-graph.js';
import { avatarBadge, renderFingerprintGallery } from '../public/stage/fingerprints.js';
import { renderSpotlight } from '../public/stage/spotlight.js';
import { byClass, byTag, FakeNode, installFakeDocument } from './helpers/fake-dom.ts';

const REPO_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const NOW = new Date('2026-11-07T19:00:00Z');
const AVATAR = 'https://avatars.githubusercontent.com/u/583231?v=4';

installFakeDocument();


// ---------------------------------------------------------------------------
// Database helpers
// ---------------------------------------------------------------------------

/**
 * Open a throwaway database with the real schema.
 * @param t - Test context.
 * @returns The open database.
 */
function freshDb(t: { after: (fn: () => void) => void }): DatabaseSync {
  const dir = mkdtempSync(join(tmpdir(), 'ariadne-avatars-'));
  const { db } = openDatabase({ path: join(dir, 'a.db'), schemaPath: join(REPO_ROOT, 'src', 'db', 'schema.sql') });
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
 * @param consent - Stage display consent.
 * @param avatar - Stored avatar URL.
 * @returns Participant id.
 */
function addParticipant(db: DatabaseSync, alias: string, username: string, consent: 0 | 1, avatar: string | null = null): string {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO participants (id, display_alias, github_username, avatar_url, consent_status, consent_granted_at,
       stage_display_consent, analysis_state, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'granted', ?, ?, 'ready', ?, ?)`,
  ).run(id, alias, username, avatar, NOW.toISOString(), consent, NOW.toISOString(), NOW.toISOString());
  return id;
}

/**
 * Insert a candidate match citing two receipts.
 * @param db - Database.
 * @param x - One participant.
 * @param y - The other.
 */
function addMatch(db: DatabaseSync, x: string, y: string): void {
  const [a, b] = x < y ? [x, y] : [y, x];
  db.prepare(
    `INSERT INTO matches (id, participant_a_id, participant_b_id, composite_score, score_breakdown, complementary_summary,
       relevant_projects, suggested_first_collaboration, confidence_limitations, evidence_receipt_ids, created_at, updated_at)
     VALUES (?, ?, ?, 70, '{}', 's', '[]', 'f', 'l', '["e1","e2"]', ?, ?)`,
  ).run(randomUUID(), a, b, NOW.toISOString(), NOW.toISOString());
}

describe('avatar population', () => {
  test('participant.analyze stores the GitHub avatar from the fetched snapshot', async (t) => {
    const db = freshDb(t);
    const id = addParticipant(db, 'Thread-0A01', 'octocat', 1);
    const other = addParticipant(db, 'Thread-0B02', 'hubot', 1, AVATAR);
    for (const [pid, login] of [[id, 'octocat'], [other, 'hubot']] as const) {
      db.prepare(
        `INSERT INTO async_jobs (id, kind, participant_id, status, payload_json, attempts, run_after, created_at, updated_at)
         VALUES (?, ?, ?, 'queued', ?, 0, ?, ?, ?)`,
      ).run(randomUUID(), ANALYZE_JOB_KIND, pid, JSON.stringify({ github_username: login, website_url: null, goal: null }),
        NOW.toISOString(), NOW.toISOString(), NOW.toISOString());
    }
    const persona = loadSeedPersonas()[0];
    assert.ok(persona);
    const fetcher: NonNullable<WorkerDeps['fetcher']> = async (username) => ({
      ...seedSnapshot(persona, { id: 'x', display_alias: 'Live-0001', github_username: username }, NOW),
      avatar_url: username === 'octocat' ? 'https://avatars.githubusercontent.com/u/1?v=4' : null,
    });
    const tick = await runWorkerTick(db, { llm: null, explanationLlm: null, now: () => NOW, settings: () => DEFAULT_WORKER_SETTINGS, fetcher });
    await tick.stage2;
    const avatarOf = (pid: string): string | null =>
      (db.prepare('SELECT avatar_url FROM participants WHERE id = ?').get(pid) as { avatar_url: string | null }).avatar_url;
    assert.equal(avatarOf(id), 'https://avatars.githubusercontent.com/u/1?v=4');
    assert.equal(avatarOf(other), AVATAR, 'a snapshot without an avatar keeps the stored one');
  });
});

describe('avatars in the stage snapshot', () => {
  test('only builders shown on stage get an avatar, on nodes, fingerprint cards and spotlight sides', (t) => {
    const db = freshDb(t);
    const shown = addParticipant(db, 'Thread-0A01', 'octocat', 1, AVATAR);
    const hidden = addParticipant(db, 'Thread-0B02', 'hubot', 0, 'https://avatars.githubusercontent.com/u/2?v=4');
    addMatch(db, shown, hidden);

    const snap = buildStageSnapshot(db);
    const node = (alias: string) => snap.nodes.find((n) => n.alias === alias);
    assert.equal(node('Thread-0A01')?.display?.avatar_url, AVATAR);
    assert.equal(node('Thread-0B02')?.display, null);
    assert.deepEqual(snap.fingerprints.map((c) => [c.alias, c.avatar_url]), [['Thread-0A01', AVATAR], ['Thread-0B02', null]]);
    const entry = snap.spotlight[0];
    assert.ok(entry);
    const sides = Object.fromEntries([entry.a, entry.b].map((s) => [s.alias, s.avatar_url]));
    assert.deepEqual(sides, { 'Thread-0A01': AVATAR, 'Thread-0B02': null });
    assert.doesNotMatch(JSON.stringify(snap), /u\/2\?v=4|hubot/);

    const privateMode = buildStageSnapshot(db, { privacyMode: true });
    assert.doesNotMatch(JSON.stringify(privateMode), /avatars\.githubusercontent\.com/);
  });

  test('seeds never get an avatar, even if their row claims stage consent', (t) => {
    const db = freshDb(t);
    setSeedMode(db, true, NOW);
    const seed = seedProfiles()[0];
    assert.ok(seed);
    db.prepare('UPDATE participants SET stage_display_consent = 1 WHERE id = ?').run(seed.id);
    const snap = buildStageSnapshot(db);
    assert.ok(snap.nodes.every((n) => n.display === null));
    assert.ok(snap.fingerprints.every((c) => c.avatar_url === null));
    assert.doesNotMatch(JSON.stringify(snap), /ariadne-seed-/);
  });

  test('stageAvatarUrl keeps GitHub avatar URLs and otherwise uses the per-login avatar', () => {
    assert.equal(stageAvatarUrl(AVATAR, 'octocat'), AVATAR);
    for (const bad of [null, 'http://avatars.githubusercontent.com/u/1', 'https://evil.example/a.png', 'javascript:alert(1)', 'not a url']) {
      assert.equal(stageAvatarUrl(bad, 'octocat'), 'https://avatars.githubusercontent.com/octocat?s=128', String(bad));
    }
  });
});

describe('avatar rendering with green-dot fallback', () => {
  const snapshot = {
    nodes: [
      { alias: 'Thread-0A01', label: '@octocat', is_seed: false, analysis_state: 'ready', display: { github_username: 'octocat', avatar_url: AVATAR } },
      { alias: 'Thread-0B02', label: 'Thread-0B02', is_seed: false, analysis_state: 'ready', display: null },
    ],
    edges: [],
  };
  const positions = new Map([['Thread-0A01', { x: 10, y: 10 }], ['Thread-0B02', { x: 90, y: 90 }]]);

  test('graph nodes draw a clipped avatar in a ring over the dot, and a load error leaves only the dot', () => {
    const svg = new FakeNode('svg');
    renderGraph(svg as unknown as SVGSVGElement, snapshot, positions);
    const groups = svg.findAll(byClass('node'));
    assert.equal(groups.length, 2);
    const [withAvatar, withoutAvatar] = groups as [FakeNode, FakeNode];
    assert.equal(withAvatar.findAll(byClass('dot')).length, 1, 'the dot is always drawn');
    const image = withAvatar.findAll(byTag('image'))[0];
    assert.ok(image);
    assert.equal(image.getAttribute('href'), AVATAR);
    const clipRef = image.getAttribute('clip-path');
    const clipId = /^url\(#(.+)\)$/.exec(clipRef ?? '')?.[1];
    assert.ok(clipId && svg.findAll((n) => n.tagName === 'clipPath' && n.getAttribute('id') === clipId).length === 1, 'clip path defined');
    assert.equal(withAvatar.findAll(byClass('avatar-ring')).length, 1);
    assert.equal(withoutAvatar.findAll(byTag('image')).length, 0, 'no avatar for a pseudonymous builder');
    assert.equal(withoutAvatar.findAll(byClass('dot')).length, 1);

    image.fire('error');
    assert.equal(withAvatar.findAll(byTag('image')).length, 0);
    assert.equal(withAvatar.findAll(byClass('avatar-ring')).length, 0, 'no empty ring is left behind');
    assert.equal(withAvatar.findAll(byClass('dot')).length, 1);
  });

  test('avatarBadge shows the image, or the dot when absent or broken', () => {
    const none = avatarBadge(null) as unknown as FakeNode;
    assert.equal(none.findAll(byClass('avatar-dot')).length, 1);
    assert.equal(none.findAll(byTag('img')).length, 0);

    const badge = avatarBadge(AVATAR, 'avatar-lg') as unknown as FakeNode;
    assert.match(badge.className, /avatar-lg/);
    const img = badge.findAll(byTag('img'))[0];
    assert.ok(img);
    assert.equal(img.src, AVATAR);
    assert.equal(img.referrerPolicy, 'no-referrer');
    img.fire('error');
    assert.equal(badge.findAll(byTag('img')).length, 0);
    assert.equal(badge.findAll(byClass('avatar-dot')).length, 1);
  });

  test('fingerprint cards and spotlight headers carry the avatar badge', () => {
    const gallery = new FakeNode('div');
    renderFingerprintGallery(gallery as unknown as HTMLElement, [
      { alias: 'Thread-0A01', label: '@octocat', is_seed: false, avatar_url: AVATAR, fingerprint: null, evidence_count: 0, claim_count: 0, evidence: [] },
      { alias: 'Thread-0B02', label: 'Thread-0B02', is_seed: false, avatar_url: null, fingerprint: null, evidence_count: 0, claim_count: 0, evidence: [] },
    ]);
    const cards = gallery.findAll(byClass('fp-card'));
    const srcs = cards.map((c) => c.findAll(byTag('img')).map((i) => i.src));
    assert.deepEqual(srcs.sort((a, b) => b.length - a.length), [[AVATAR], []]);
    assert.ok(cards.every((c) => c.findAll(byClass('avatar-badge')).length === 1));

    const spot = new FakeNode('div');
    renderSpotlight(spot as unknown as HTMLElement, {
      match_id: 'm', score: 80, state: 'golden', breakdown: null, contributions: null, thesis: null,
      a: { alias: 'Thread-0A01', label: '@octocat', is_seed: false, avatar_url: AVATAR, evidence: [] },
      b: { alias: 'Thread-0B02', label: 'Thread-0B02', is_seed: false, avatar_url: null, evidence: [] },
    }, 0, 1);
    const names = spot.findAll(byClass('spot-name'));
    assert.equal(names.length, 2);
    assert.equal(names[0]?.findAll(byTag('img'))[0]?.src, AVATAR);
    assert.equal(names[1]?.findAll(byClass('avatar-dot')).length, 1);
    assert.match(names[0]?.text() ?? '', /@octocat/);
  });
});

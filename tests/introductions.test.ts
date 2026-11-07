import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { after, before, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { MatchProposalSchema, PublicEventEnvelopeSchema } from '../src/contracts/index.ts';
import { openDatabase } from '../src/db/client.ts';
import { requestedState } from '../src/matching/intro-state-machine.ts';
import { buildVcard, contactPoints, escapeVcard } from '../src/routes/introductions.ts';
import { resetRateLimits, setAdmissionPolicy } from '../src/routes/onboarding.ts';
import type { Logger } from '../src/server.ts';
import { createServer, loadRoutes } from '../src/server.ts';

const REPO_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const silent: Logger = { info() {} };
const AT = '2026-11-07T18:00:00Z';
const BREAKDOWN = JSON.stringify({ capability_similarity: 0.9, need_offer_fit: 0.8, complementarity: 0.6, novelty: 0.5, freshness: 1 });

describe('requestedState', () => {
  it('maps taps to the state each side asks for', () => {
    assert.equal(requestedState('candidate', 'a', 'interested'), 'proposed_by_a');
    assert.equal(requestedState('candidate', 'b', 'interested'), 'proposed_by_b');
    assert.equal(requestedState('proposed_by_a', 'b', 'interested'), 'mutual_accepted');
    assert.equal(requestedState('proposed_by_a', 'a', 'interested'), 'proposed_by_a');
    assert.equal(requestedState('completed', 'a', 'interested'), 'completed');
    assert.equal(requestedState('declined', 'a', 'interested'), 'proposed_by_a');
    assert.equal(requestedState('candidate', 'a', 'pass'), 'declined');
  });
});

describe('vCard', () => {
  it('escapes commas, semicolons, backslashes and newlines', () => {
    assert.equal(escapeVcard('a,b;c\\d\ne'), 'a\\,b\\;c\\\\d\\ne');
  });

  it('builds a CRLF vCard 3.0 for the counterpart', () => {
    const card = buildVcard({
      display_alias: 'Loom-0002',
      github_username: 'hubot',
      avatar_url: null,
      website_url: 'https://hubot.dev',
      contact_card: 'Signal: @hubot; DM me',
    });
    assert.equal(
      card,
      'BEGIN:VCARD\r\nVERSION:3.0\r\nFN:@hubot\r\nNICKNAME:Loom-0002\r\nURL;TYPE=github:https://github.com/hubot\r\n' +
        'URL;TYPE=website:https://hubot.dev\r\nNOTE:Met via Ariadne — Signal: @hubot\\; DM me\r\nEND:VCARD\r\n',
    );
  });
});

describe('contactPoints', () => {
  it('pulls emails and phone numbers out of a free-text card', () => {
    assert.deepEqual(contactPoints('Email me: Jane.Doe@example.com · call +1 (415) 555-0134 · X @jane · 2026'), {
      emails: ['Jane.Doe@example.com'],
      phones: ['+14155550134'],
    });
    assert.deepEqual(contactPoints('Signal: @hubot; DM me'), { emails: [], phones: [] });
    assert.deepEqual(contactPoints(null), { emails: [], phones: [] });
  });
});

describe('introductions API', () => {
  let dir: string;
  let db: DatabaseSync;
  let server: Server;
  let base: string;
  const people: Record<'a' | 'b' | 'c', { id: string; cookie: string }> = {} as never;
  const MATCH = '20000000-0000-4000-8000-000000000001';
  const MATCH_AC = '20000000-0000-4000-8000-000000000002';

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), 'ariadne-intros-'));
    db = openDatabase({ path: 'ariadne.db', cwd: dir, schemaPath: join(REPO_ROOT, 'src', 'db', 'schema.sql') }).db;
    server = createServer({ db, routes: await loadRoutes(join(REPO_ROOT, 'src', 'routes')), publicDir: null, log: silent });
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    const address = server.address();
    base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
  });

  after(async () => {
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  /**
   * Registers a participant through `/api/participants`.
   * @param github - Handle.
   * @param extra - Extra body fields.
   * @returns Id and session cookie.
   */
  async function join_(github: string, extra: Record<string, unknown> = {}): Promise<{ id: string; cookie: string }> {
    const res = await fetch(`${base}/api/participants`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ github, consent_processing: true, ...extra }),
    });
    assert.equal(res.status, 201);
    const body = (await res.json()) as { participant: { id: string } };
    return { id: body.participant.id, cookie: (res.headers.get('set-cookie') ?? '').split(';')[0]! };
  }

  /**
   * Inserts a candidate match between two participants in canonical order.
   * @param id - Match id.
   * @param x - One participant id.
   * @param y - The other.
   */
  function insertMatch(id: string, x: string, y: string): void {
    const [a, b] = x < y ? [x, y] : [y, x];
    db.prepare(
      `INSERT INTO matches (id, participant_a_id, participant_b_id, composite_score, score_breakdown, complementary_summary,
         relevant_projects, suggested_first_collaboration, confidence_limitations, evidence_receipt_ids, created_at, updated_at)
       VALUES (?, ?, ?, 80, ?, 'Rust SFU meets WebAudio UI.', '["octocat/sfu","hubot/worklets"]', 'Pair on worklet latency.',
               'Inferred from READMEs.', '["e1","e2"]', ?, ?)`,
    ).run(id, a, b, BREAKDOWN, AT, AT);
  }

  /**
   * POSTs a decision as a participant.
   * @param who - Participant key.
   * @param decision - Decision.
   * @param matchId - Match id.
   * @returns Response.
   */
  function decide(who: 'a' | 'b' | 'c', decision: string, matchId = MATCH): Promise<Response> {
    return fetch(`${base}/api/matches/${matchId}/decision`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: people[who].cookie },
      body: JSON.stringify({ decision }),
    });
  }

  /**
   * GETs a match sub-resource as a participant.
   * @param who - Participant key, or `null` for no session.
   * @param path - `room`, `vcard`.
   * @param matchId - Match id.
   * @returns Response.
   */
  function get(who: 'a' | 'b' | 'c' | null, path: string, matchId = MATCH): Promise<Response> {
    return fetch(`${base}/api/matches/${matchId}/${path}`, { headers: who ? { cookie: people[who].cookie } : {} });
  }

  /**
   * POSTs to a room.
   * @param who - Participant key.
   * @param body - Message or venue.
   * @param matchId - Match id.
   * @returns Response.
   */
  function postRoom(who: 'a' | 'b' | 'c', body: Record<string, unknown>, matchId = MATCH): Promise<Response> {
    return fetch(`${base}/api/matches/${matchId}/room`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: people[who].cookie },
      body: JSON.stringify(body),
    });
  }

  /**
   * Introduction events in order, validated against the public contract.
   * @returns Event types and payloads.
   */
  function introEvents(): Array<{ type: string; payload: Record<string, unknown> }> {
    const rows = db
      .prepare("SELECT seq_id, event_id, type, payload_json, occurred_at FROM domain_events WHERE type LIKE 'introduction.%' ORDER BY seq_id")
      .all() as Array<Record<string, string | number>>;
    return rows.map((row) => {
      const envelope = { seq_id: row.seq_id, event_id: row.event_id, type: row.type, occurred_at: row.occurred_at, payload: JSON.parse(String(row.payload_json)) };
      assert.equal(PublicEventEnvelopeSchema.safeParse(envelope).success, true, `contract-valid ${row.type}`);
      return { type: String(row.type), payload: envelope.payload };
    });
  }

  /**
   * The stored match, validated against the A-001 contract.
   * @param id - Match id.
   * @returns State and approvals.
   */
  function stored(id = MATCH): { intro_state: string; approval_a: number; approval_b: number } {
    const row = db.prepare('SELECT * FROM matches WHERE id = ?').get(id) as Record<string, unknown>;
    const asContract = {
      ...row,
      score_breakdown: JSON.parse(String(row.score_breakdown)),
      relevant_projects: JSON.parse(String(row.relevant_projects)),
      evidence_receipt_ids: ['33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444'],
      shared_intro_notes: JSON.parse(String(row.shared_intro_notes)),
      approval_a: row.approval_a === 1,
      approval_b: row.approval_b === 1,
    };
    delete (asContract as Record<string, unknown>).created_at;
    delete (asContract as Record<string, unknown>).updated_at;
    assert.equal(MatchProposalSchema.safeParse(asContract).success, true, 'stored match satisfies the contract');
    return { intro_state: String(row.intro_state), approval_a: Number(row.approval_a), approval_b: Number(row.approval_b) };
  }

  /** Which side ('a'|'b') a person is on in the A–B match. */
  const sideOf = (who: 'a' | 'b') => (people[who].id === [people.a.id, people.b.id].sort()[0] ? 'a' : 'b');

  beforeEach(async () => {
    db.exec('DELETE FROM matches; DELETE FROM domain_events; DELETE FROM async_jobs; DELETE FROM participants;');
    setAdmissionPolicy({ maxRoomCapacity: 30, intakeLocked: false });
    resetRateLimits();
    delete process.env.ARIADNE_REQUIRE_VERIFIED_OWNERSHIP;
    people.a = await join_('octocat');
    people.b = await join_('hubot', { website_url: 'hubot.dev', stage_display_consent: true });
    people.c = await join_('outsider');
    db.prepare("UPDATE participants SET contact_card = 'Signal: @hubot' WHERE id = ?").run(people.b.id);
    db.prepare("UPDATE participants SET contact_card = 'Signal: @octocat' WHERE id = ?").run(people.a.id);
    db.exec("DELETE FROM domain_events");
    insertMatch(MATCH, people.a.id, people.b.id);
    insertMatch(MATCH_AC, people.a.id, people.c.id);
  });

  it('records one-sided interest without unlocking the room or leaking contact details', async () => {
    const res = await decide('a', 'interested');
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { state: `proposed_by_${sideOf('a')}`, completed: false, room: null });
    assert.deepEqual(stored(), sideOf('a') === 'a'
      ? { intro_state: 'proposed_by_a', approval_a: 1, approval_b: 0 }
      : { intro_state: 'proposed_by_b', approval_a: 0, approval_b: 1 });
    assert.deepEqual(introEvents().map((e) => e.type), ['introduction.proposed']);

    for (const who of ['a', 'b'] as const) {
      const room = await get(who, 'room');
      assert.equal(room.status, 403);
      const text = await room.text();
      assert.doesNotMatch(text, /Signal|hubot\.dev/);
      assert.equal((await get(who, 'vcard')).status, 403);
    }
    const me = (await (await fetch(`${base}/api/me`, { headers: { cookie: people.b.cookie } })).json()) as { matches: Array<{ their_interest: boolean }> };
    assert.equal(me.matches[0]!.their_interest, true);
  });

  it('treats a repeated tap as an idempotent no-op', async () => {
    await decide('a', 'interested');
    const again = await decide('a', 'interested');
    assert.equal(again.status, 200);
    assert.equal(((await again.json()) as { noop: boolean }).noop, true);
    assert.equal(introEvents().length, 1);
  });

  it('completes on bilateral interest, emits completed exactly once and unlocks the room', async () => {
    await decide('a', 'interested');
    const res = await decide('b', 'interested');
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { state: 'completed', completed: true, room: `/me/matches/${MATCH}` });
    assert.deepEqual(stored(), { intro_state: 'completed', approval_a: 1, approval_b: 1 });

    await decide('b', 'interested');
    await decide('a', 'interested');
    const events = introEvents();
    assert.deepEqual(events.map((e) => e.type), ['introduction.proposed', 'introduction.accepted', 'introduction.completed']);
    const completed = events[2]!.payload;
    assert.equal(completed.channel, 'web');
    const hubotSide = sideOf('b');
    assert.equal((completed[`display_${hubotSide}`] as { github_username: string }).github_username, 'hubot', 'consenting participant shown on stage');
    assert.equal(completed[`display_${hubotSide === 'a' ? 'b' : 'a'}`], undefined, 'non-consenting participant stays anonymous');

    const room = await get('a', 'room');
    assert.equal(room.status, 200);
    const body = (await room.json()) as Record<string, any>;
    assert.equal(body.counterpart.github_username, 'hubot');
    assert.equal(body.counterpart.github_url, 'https://github.com/hubot');
    assert.equal(body.counterpart.website_url, 'https://hubot.dev');
    assert.equal(body.counterpart.contact_card, 'Signal: @hubot');
    assert.deepEqual(body.icebreaker.relevant_projects, ['octocat/sfu', 'hubot/worklets']);
    assert.equal(((await (await get('b', 'room')).json()) as Record<string, any>).counterpart.contact_card, 'Signal: @octocat');
  });

  it('persists venue pins and chat for both participants', async () => {
    await decide('a', 'interested');
    await decide('b', 'interested');
    assert.equal((await postRoom('a', { message: 'Hi! Free now?' })).status, 201);
    assert.equal((await postRoom('b', { venue: 'near_stage' })).status, 201);
    assert.equal((await postRoom('b', { venue: 'custom', venue_note: "I'm by the front left table" })).status, 201);

    const forA = ((await (await get('a', 'room')).json()) as { notes: Array<{ author: string; body: string }> }).notes;
    assert.deepEqual(forA.map((n) => [n.author, n.body]), [
      ['me', 'Hi! Free now?'],
      ['them', '📍 Near Stage'],
      ['them', "📍 I'm by the front left table"],
    ]);
    const forB = ((await (await get('b', 'room')).json()) as { notes: Array<{ author: string }> }).notes;
    assert.deepEqual(forB.map((n) => n.author), ['them', 'me', 'me']);
    stored();
  });

  it('rejects malformed room posts', async () => {
    await decide('a', 'interested');
    await decide('b', 'interested');
    assert.equal((await postRoom('a', { venue: 'rooftop' })).status, 400);
    assert.equal((await postRoom('a', { venue: 'custom', venue_note: 'x'.repeat(121) })).status, 400);
    assert.equal((await postRoom('a', { message: '   ' })).status, 400);
    assert.equal((await postRoom('a', { message: 'x'.repeat(1001) })).status, 400);
  });

  it('keeps outsiders and signed-out visitors out of every room endpoint', async () => {
    await decide('a', 'interested');
    await decide('b', 'interested');
    assert.equal((await get('c', 'room')).status, 403);
    assert.equal((await get('c', 'vcard')).status, 403);
    assert.equal((await postRoom('c', { message: 'hi' })).status, 403);
    assert.equal((await decide('c', 'interested')).status, 403);
    assert.equal((await get(null, 'room')).status, 401);
    const page = await fetch(`${base}/me/matches/${MATCH}`, { redirect: 'manual' });
    assert.equal(page.status, 302);
    assert.equal(page.headers.get('location'), '/join');
    assert.equal((await fetch(`${base}/me/matches/${MATCH}`, { headers: { cookie: people.c.cookie } })).status, 403);
    assert.equal((await fetch(`${base}/me/matches/${MATCH}`, { headers: { cookie: people.a.cookie } })).status, 200);
  });

  it('refuses room posts while the room is locked', async () => {
    await decide('a', 'interested');
    assert.equal((await postRoom('a', { message: 'hi' })).status, 403);
  });

  it('serves the counterpart vCard from an unlocked room', async () => {
    await decide('a', 'interested');
    await decide('b', 'interested');
    const res = await get('a', 'vcard');
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /text\/vcard/);
    assert.match(res.headers.get('content-disposition') ?? '', /filename="hubot\.vcf"/);
    const card = await res.text();
    assert.match(card, /^BEGIN:VCARD\r\nVERSION:3\.0\r\nFN:@hubot\r\n/);
    assert.match(card, /NOTE:Met via Ariadne — Signal: @hubot\r\nEND:VCARD\r\n$/);
  });

  /**
   * PUTs a contact card as a participant.
   * @param who - Participant key, or `null` for no session.
   * @param value - Body value.
   * @returns Response.
   */
  function putCard(who: 'a' | 'b' | 'c' | null, value: unknown): Promise<Response> {
    return fetch(`${base}/api/me/contact-card`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...(who ? { cookie: people[who].cookie } : {}) },
      body: JSON.stringify({ contact_card: value }),
    });
  }

  it('lets a participant share their own contact card with completed-intro counterparts', async () => {
    await decide('a', 'interested');
    await decide('b', 'interested');
    const saved = await putCard('a', '  X @octo · octo@example.com · +1 415 555 0134  ');
    assert.equal(saved.status, 200);
    assert.deepEqual(await saved.json(), { contact_card: 'X @octo · octo@example.com · +1 415 555 0134' });

    const forB = (await (await get('b', 'room')).json()) as Record<string, any>;
    assert.equal(forB.counterpart.contact_card, 'X @octo · octo@example.com · +1 415 555 0134');
    const forA = (await (await get('a', 'room')).json()) as Record<string, any>;
    assert.equal(forA.me.contact_card, 'X @octo · octo@example.com · +1 415 555 0134');

    const card = await (await get('b', 'vcard')).text();
    assert.match(card, /\r\nEMAIL;TYPE=INTERNET:octo@example\.com\r\n/);
    assert.match(card, /\r\nTEL;TYPE=CELL:\+14155550134\r\n/);

    assert.equal((await putCard('a', null)).status, 200);
    assert.equal(((await (await get('b', 'room')).json()) as Record<string, any>).counterpart.contact_card, null);
  });

  it('validates contact cards and requires a session', async () => {
    assert.equal((await putCard('a', 'x'.repeat(281))).status, 400);
    assert.equal((await putCard('a', 42)).status, 400);
    assert.equal((await putCard(null, 'hi')).status, 401);
    assert.equal((await putCard('a', '   ')).status, 200, 'blank clears the card');
    const row = db.prepare('SELECT contact_card FROM participants WHERE id = ?').get(people.a.id);
    assert.deepEqual({ ...row }, { contact_card: null });
  });

  it('refuses decisions with a withdrawn participant and never publishes their stale stage identity', async () => {
    db.prepare("UPDATE participants SET consent_status = 'withdrawn' WHERE id = ?").run(people.b.id);
    const res = await decide('a', 'interested');
    assert.equal(res.status, 409);
    assert.equal(((await res.json()) as { error: string }).error, 'participant_withdrawn');
    assert.deepEqual(introEvents(), []);
    assert.equal(stored().intro_state, 'candidate');
    assert.equal((await decide('b', 'interested')).status, 401, 'a withdrawn participant counts as signed out');
  });

  it('locks a completed room and vCard once the counterpart withdraws consent', async () => {
    await decide('a', 'interested');
    await decide('b', 'interested');
    db.prepare("UPDATE participants SET consent_status = 'withdrawn' WHERE id = ?").run(people.b.id);
    for (const path of ['room', 'vcard']) {
      const res = await get('a', path);
      assert.equal(res.status, 403);
      const text = await res.text();
      assert.match(text, /participant_withdrawn/);
      assert.doesNotMatch(text, /Signal|hubot\.dev/);
    }
    assert.equal((await postRoom('a', { message: 'still there?' })).status, 403);
    assert.equal((await get('b', 'room')).status, 401);
    assert.equal((await putCard('b', 'x')).status, 401);
    const me = (await (await fetch(`${base}/api/me`, { headers: { cookie: people.a.cookie } })).json()) as { matches: Array<{ id: string }> };
    assert.deepEqual(me.matches.map((m) => m.id), [MATCH_AC], 'the match with the withdrawn participant disappears from /me');
  });

  it('treats analysis_state withdrawn as withdrawn even while consent_status still reads granted', async () => {
    await decide('a', 'interested');
    await decide('b', 'interested');
    db.prepare("UPDATE participants SET analysis_state = 'withdrawn' WHERE id = ?").run(people.b.id);
    assert.equal((await get('a', 'room')).status, 403);
    assert.equal((await get('a', 'vcard')).status, 403);
    assert.equal((await get('b', 'room')).status, 401);
    assert.equal((await decide('a', 'pass', MATCH_AC)).status, 200, 'unrelated matches keep working');
    const me = (await (await fetch(`${base}/api/me`, { headers: { cookie: people.a.cookie } })).json()) as { matches: Array<{ id: string }> };
    assert.equal(me.matches.some((m) => m.id === MATCH), false);
  });

  it('omits a stage-consenting participant from intro events once their analysis is withdrawn', async () => {
    db.prepare("UPDATE participants SET analysis_state = 'withdrawn' WHERE id = ?").run(people.b.id);
    assert.equal((await decide('a', 'interested')).status, 409);
    assert.doesNotMatch(JSON.stringify(introEvents()), /hubot/);
  });

  it('removes the room and scrubs stage identity when a participant deletes their data', async () => {
    await decide('a', 'interested');
    await decide('b', 'interested');
    const del = await fetch(`${base}/api/participants/me`, { method: 'DELETE', headers: { cookie: people.b.cookie } });
    assert.equal(del.status, 204);
    assert.equal((await get('a', 'room')).status, 404);
    assert.equal((await get('a', 'vcard')).status, 404);
    assert.doesNotMatch(JSON.stringify(introEvents()), /hubot/);
  });

  it('declines on Pass with only the public counter, and refuses later interest', async () => {
    const res = await decide('c', 'pass', MATCH_AC);
    assert.equal(res.status, 200);
    assert.equal(stored(MATCH_AC).intro_state, 'declined');
    const events = introEvents();
    assert.deepEqual(events, [{ type: 'introduction.declined', payload: { declined_total: 1 } }]);
    assert.equal((await decide('a', 'interested', MATCH_AC)).status, 409);
    assert.equal((await decide('c', 'pass', MATCH_AC)).status, 200, 'repeated pass is a no-op');
    assert.equal(introEvents().length, 1);
  });

  it('does not let the proposer pass on their own pending proposal', async () => {
    await decide('a', 'interested');
    assert.equal((await decide('a', 'pass')).status, 409);
    assert.equal(stored().intro_state, `proposed_by_${sideOf('a')}`);
  });

  it('validates the request', async () => {
    assert.equal((await decide('a', 'maybe')).status, 400);
    assert.equal((await decide('a', 'interested', '20000000-0000-4000-8000-00000000dead')).status, 404);
    const anonymous = await fetch(`${base}/api/matches/${MATCH}/decision`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'interested' }),
    });
    assert.equal(anonymous.status, 401);
  });

  it('requires verified ownership when strict verification is switched on', async () => {
    process.env.ARIADNE_REQUIRE_VERIFIED_OWNERSHIP = '1';
    try {
      const res = await decide('a', 'interested');
      assert.equal(res.status, 403);
      assert.equal(((await res.json()) as { error: string }).error, 'verification_required');
      db.prepare('UPDATE participants SET ownership_verified = 1 WHERE id = ?').run(people.a.id);
      assert.equal((await decide('a', 'interested')).status, 200);
    } finally {
      delete process.env.ARIADNE_REQUIRE_VERIFIED_OWNERSHIP;
    }
  });
});

describe('intro room page behaviour', () => {
  const script = readFileSync(join(REPO_ROOT, 'public', 'app', 'intro-room.js'), 'utf8');
  const IDS = ['locked', 'locked-message', 'room', 'title', 'counterpart', 'links', 'contact-card', 'vcard', 'copy', 'copy-status',
    'first-collab', 'thesis', 'projects', 'venues', 'venue-form', 'venue-note', 'notes', 'chat-form', 'chat-input', 'chat-status',
    'contact-form', 'my-contact', 'contact-status'];

  class FakeNode {
    tagName: string;
    className = '';
    hidden = false;
    value = '';
    children: FakeNode[] = [];
    attributes: Record<string, string> = {};
    listeners: Record<string, (event?: unknown) => unknown> = {};
    private ownText = '';
    constructor(tag: string) { this.tagName = tag.toUpperCase(); }
    get textContent(): string { return this.ownText + this.children.map((c) => c.textContent).join(''); }
    set textContent(v: string) { this.ownText = v; this.children = []; }
    appendChild(c: FakeNode): FakeNode { this.children.push(c); return c; }
    replaceChildren(...n: FakeNode[]): void { this.ownText = ''; this.children = n; }
    setAttribute(k: string, v: string): void { this.attributes[k] = v; }
    addEventListener(t: string, f: (event?: unknown) => unknown): void { this.listeners[t] = f; }
    all(): FakeNode[] { return this.children.flatMap((c) => [c, ...c.all()]); }
  }

  const unlockedRoom = {
    match_id: 'm1',
    me: { display_alias: 'Thread-7C4E', github_username: 'octocat', contact_card: 'X @octo' },
    counterpart: {
      display_alias: 'Loom-0002', github_username: 'hubot', github_url: 'https://github.com/hubot', avatar_url: null,
      website_url: 'javascript:alert(1)', contact_card: '<img src=x onerror=alert(1)>',
    },
    icebreaker: { complementary_summary: 'Stacks fit.', suggested_first_collaboration: 'Pair on latency.', relevant_projects: ['hubot/worklets'] },
    venue_options: [{ key: 'near_stage', label: 'Near Stage' }],
    notes: [{ id: 'n1', author: 'them', body: 'Hi!', created_at: AT }],
  };

  /**
   * Runs intro-room.js against a fake DOM.
   * @param answer - Returns `[status, body]` per request.
   * @returns Elements, requests and redirect target.
   */
  async function loadRoom(answer: (url: string, init?: { method?: string; body?: string }) => [number, unknown]) {
    const elements: Record<string, FakeNode> = {};
    for (const id of IDS) elements[id] = new FakeNode('div');
    const requests: Array<{ url: string; method: string; body: unknown }> = [];
    const page = { redirectedTo: null as string | null };
    const intervals: Array<() => void> = [];
    runInNewContext(script, {
      document: { getElementById: (id: string) => elements[id], createElement: (tag: string) => new FakeNode(tag) },
      window: { location: { pathname: '/me/matches/m1', assign: (to: string) => { page.redirectedTo = to; } } },
      navigator: { clipboard: { writeText: async () => {} } },
      fetch: async (url: string, init?: { method?: string; body?: string }) => {
        requests.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(init.body) : null });
        const [status, body] = answer(url, init);
        return { ok: status >= 200 && status < 300, status, json: async () => body };
      },
      setInterval: (fn: () => void) => intervals.push(fn),
      decodeURIComponent, encodeURIComponent, JSON, Object,
    });
    for (let i = 0; i < 6; i += 1) await new Promise((done) => setImmediate(done));
    return { elements, requests, page, intervals };
  }

  it('shows the locked state until both have tapped Interested', async () => {
    const { elements } = await loadRoom(() => [403, { error: 'room_locked' }]);
    assert.equal(elements.locked!.hidden, false);
    assert.equal(elements.room!.hidden, true);
    assert.match(elements['locked-message']!.textContent, /both tap Interested/);
  });

  it('unlocks on its own when the counterpart taps Interested (issue #44)', async () => {
    let locked = true;
    const { elements, intervals } = await loadRoom(() => (locked ? [403, { error: 'room_locked' }] : [200, unlockedRoom]));
    assert.equal(elements.locked!.hidden, false);
    locked = false;
    intervals[0]!();
    for (let i = 0; i < 6; i += 1) await new Promise((done) => setImmediate(done));
    assert.equal(elements.room!.hidden, false);
    assert.match(elements.title!.textContent, /@hubot/);
  });

  it('stops polling a room that belongs to someone else', async () => {
    const { requests, intervals } = await loadRoom(() => [403, { error: 'not_your_match' }]);
    intervals[0]!();
    for (let i = 0; i < 6; i += 1) await new Promise((done) => setImmediate(done));
    assert.equal(requests.length, 1);
  });

  it('sends a signed-out visitor to /join', async () => {
    const { page } = await loadRoom(() => [401, {}]);
    assert.equal(page.redirectedTo, '/join');
  });

  it('renders the unlocked room as text with https-only links', async () => {
    const { elements } = await loadRoom(() => [200, unlockedRoom]);
    assert.equal(elements.room!.hidden, false);
    assert.match(elements.title!.textContent, /@hubot/);
    const links = elements.links!.all().filter((n) => n.tagName === 'A');
    assert.deepEqual(links.map((l) => l.attributes.href), ['https://github.com/hubot'], 'non-https website is not linked');
    assert.equal(elements['contact-card']!.textContent, 'Contact: <img src=x onerror=alert(1)>');
    assert.equal(elements.vcard!.attributes.href, '/api/matches/m1/vcard');
    assert.match(elements.notes!.textContent, /@hubot: Hi!/);
  });

  it('prefills and saves my contact card', async () => {
    const { elements, requests } = await loadRoom((url, init) =>
      init?.method === 'PUT' ? [200, { contact_card: 'X @octo · octo@example.com' }] : [200, unlockedRoom],
    );
    assert.equal(elements['my-contact']!.value, 'X @octo');
    elements['my-contact']!.value = 'X @octo · octo@example.com';
    await elements['contact-form']!.listeners.submit!({ preventDefault() {} });
    const put = requests.find((r) => r.method === 'PUT');
    assert.equal(put?.url, '/api/me/contact-card');
    assert.deepEqual(put?.body, { contact_card: 'X @octo · octo@example.com' });
    assert.match(elements['contact-status']!.textContent, /Saved/);
  });

  it('posts chat messages and venue pins', async () => {
    const { elements, requests } = await loadRoom((url, init) =>
      init?.method === 'POST' ? [201, { ...unlockedRoom, notes: [...unlockedRoom.notes, { id: 'n2', author: 'me', body: 'On my way', created_at: AT }] }] : [200, unlockedRoom],
    );
    elements['chat-input']!.value = 'On my way';
    await elements['chat-form']!.listeners.submit!({ preventDefault() {} });
    await elements.venues!.children[0]!.listeners.click!();
    const posts = requests.filter((r) => r.method === 'POST');
    assert.deepEqual(posts.map((p) => p.body), [{ message: 'On my way' }, { venue: 'near_stage' }]);
    assert.equal(elements['chat-input']!.value, '');
    assert.match(elements.notes!.textContent, /You: On my way/);
  });
});

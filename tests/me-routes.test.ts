import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { after, before, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { openDatabase } from '../src/db/client.ts';
import { resetRateLimits, setAdmissionPolicy } from '../src/routes/onboarding.ts';
import { MATCH_REFRESH_JOB_KIND, progressSteps } from '../src/routes/me.ts';
import type { Logger } from '../src/server.ts';
import { createServer, loadRoutes } from '../src/server.ts';

const REPO_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const silent: Logger = { info() {} };
const AT = '2026-11-07T18:00:00Z';
const BREAKDOWN = JSON.stringify({ capability_similarity: 0.9, need_offer_fit: 0.8, complementarity: 0.6, novelty: 0.5, freshness: 1 });

describe('progressSteps', () => {
  const statuses = (state: string, hasFingerprint = false, matches = 0) =>
    progressSteps(state, hasFingerprint, matches).map((s) => s.status);

  it('walks crawl -> fingerprint -> matches', () => {
    assert.deepEqual(statuses('registered'), ['active', 'pending', 'pending']);
    assert.deepEqual(statuses('fetching_github'), ['active', 'pending', 'pending']);
    assert.deepEqual(statuses('analyzing_profile', true), ['done', 'active', 'pending']);
    assert.deepEqual(statuses('ready', true, 0), ['done', 'done', 'active']);
    assert.deepEqual(statuses('ready', true, 2), ['done', 'done', 'done']);
  });

  it('marks the step that failed', () => {
    assert.deepEqual(statuses('failed', false), ['failed', 'pending', 'pending']);
    assert.deepEqual(statuses('failed', true), ['done', 'failed', 'pending']);
  });
});

describe('/me routes', () => {
  let dir: string;
  let db: DatabaseSync;
  let server: Server;
  let base: string;
  let me: { id: string; cookie: string };

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), 'ariadne-me-'));
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
   * Inserts another participant directly.
   * @param id - Participant id.
   * @param login - GitHub login.
   * @param alias - Display alias.
   * @param stageConsent - Stage display consent.
   */
  function insertParticipant(id: string, login: string, alias: string, stageConsent = false): void {
    db.prepare(
      `INSERT INTO participants (id, display_alias, github_username, consent_status, consent_granted_at, stage_display_consent,
         contact_card, created_at, updated_at)
       VALUES (?, ?, ?, 'granted', ?, ?, 'SECRET-CONTACT-CARD', ?, ?)`,
    ).run(id, alias, login, AT, stageConsent ? 1 : 0, AT, AT);
  }

  /**
   * Inserts a GitHub evidence receipt.
   * @param id - Receipt id.
   * @param owner - Participant id.
   * @param repo - `owner/repo`.
   */
  function insertEvidence(id: string, owner: string, repo: string): void {
    db.prepare(
      `INSERT INTO evidence_receipts (id, participant_id, source_type, source_url, repo_full_name, title_or_summary, source_updated_at, fetched_at)
       VALUES (?, ?, 'repo_metadata', ?, ?, ?, ?, ?)`,
    ).run(id, owner, `https://github.com/${repo}`, repo, repo, AT, AT);
  }

  /**
   * Inserts a match between two participants in canonical order.
   * @param id - Match id.
   * @param x - One participant.
   * @param y - The other.
   * @param score - Composite score.
   * @param state - Intro state.
   * @param approvals - Which participants approved.
   */
  function insertMatch(id: string, x: string, y: string, score: number, state = 'candidate', approvals: string[] = []): void {
    const [a, b] = x < y ? [x, y] : [y, x];
    db.prepare(
      `INSERT INTO matches (id, participant_a_id, participant_b_id, composite_score, score_breakdown, complementary_summary,
         relevant_projects, suggested_first_collaboration, confidence_limitations, evidence_receipt_ids, intro_state,
         approval_a, approval_b, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'Complementary stacks.', '["octo/sfu"]', 'Pair on latency.', 'Inferred from READMEs.', ?, ?, ?, ?, ?, ?)`,
    ).run(id, a, b, score, BREAKDOWN, JSON.stringify([`e-${id}`.slice(0, 36), 'missing-receipt']), state,
      approvals.includes(a) ? 1 : 0, approvals.includes(b) ? 1 : 0, AT, AT);
  }

  const P1 = '10000000-0000-4000-8000-000000000001';
  const P2 = '10000000-0000-4000-8000-000000000002';
  const P3 = '10000000-0000-4000-8000-000000000003';
  const P4 = '10000000-0000-4000-8000-000000000004';
  const P5 = '10000000-0000-4000-8000-000000000005';
  const P6 = '10000000-0000-4000-8000-000000000006';

  beforeEach(async () => {
    db.exec(`DELETE FROM matches; DELETE FROM evidence_receipts; DELETE FROM capability_claims; DELETE FROM opportunity_needs;
             DELETE FROM github_snapshots; DELETE FROM async_jobs; DELETE FROM domain_events; DELETE FROM participants;`);
    setAdmissionPolicy({ maxRoomCapacity: 30, intakeLocked: false });
    resetRateLimits();
    const res = await fetch(`${base}/api/participants`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ github: 'octocat', consent_processing: true }),
    });
    const body = (await res.json()) as { participant: { id: string } };
    me = { id: body.participant.id, cookie: (res.headers.get('set-cookie') ?? '').split(';')[0]! };

    insertParticipant(P1, 'hidden-builder', 'Loom-0001');
    insertParticipant(P2, 'public-builder', 'Loom-0002', true);
    insertParticipant(P3, 'intro-done', 'Loom-0003');
    insertParticipant(P4, 'low-score', 'Loom-0004');
    insertParticipant(P5, 'declined', 'Loom-0005');
    insertParticipant(P6, 'stranger', 'Loom-0006');
  });

  /**
   * GETs `/api/me` with the signed-in cookie.
   * @returns The parsed dashboard.
   */
  async function dashboard(): Promise<Record<string, any>> {
    const res = await fetch(`${base}/api/me`, { headers: { cookie: me.cookie } });
    assert.equal(res.status, 200);
    return (await res.json()) as Record<string, any>;
  }

  it('redirects a signed-out /me visit to /join and serves the page when signed in', async () => {
    const out = await fetch(`${base}/me`, { redirect: 'manual' });
    assert.equal(out.status, 302);
    assert.equal(out.headers.get('location'), '/join');
    const signedIn = await fetch(`${base}/me`, { headers: { cookie: me.cookie } });
    assert.equal(signedIn.status, 200);
    const html = await signedIn.text();
    assert.match(html, /Withdraw &amp; Delete My Data/);
    assert.match(html, /\/app\/me\.js/);
  });

  it('answers 401 to /api/me without a session', async () => {
    assert.equal((await fetch(`${base}/api/me`)).status, 401);
  });

  it('returns the fingerprint as six labelled axes', async () => {
    db.prepare(
      `INSERT INTO github_snapshots (github_username, participant_id, payload_json, fetched_at, expires_at) VALUES ('octocat', ?, ?, ?, ?)`,
    ).run(me.id, JSON.stringify({ fingerprint: { systems_infra: 80, agent_orchestration: 40, llm_eval: 10, frontend_ux: 120, product_gtm: 0, data_pipelines: 30 }, fetched_at: AT }), AT, AT);
    db.prepare("UPDATE participants SET analysis_state = 'analyzing_profile' WHERE id = ?").run(me.id);
    const data = await dashboard();
    assert.deepEqual(data.fingerprint.axes.map((a: { key: string }) => a.key), [
      'systems_infra', 'agent_orchestration', 'llm_eval', 'frontend_ux', 'product_gtm', 'data_pipelines',
    ]);
    assert.equal(data.fingerprint.axes[3].value, 100, 'values are clamped to 0-100');
    assert.deepEqual(data.progress.map((s: { status: string }) => s.status), ['done', 'active', 'pending']);
  });

  it("shows only the participant's own top-3 surfaced matches, best first", async () => {
    insertMatch('20000000-0000-4000-8000-000000000001', me.id, P1, 70);
    insertMatch('20000000-0000-4000-8000-000000000002', me.id, P2, 90);
    insertMatch('20000000-0000-4000-8000-000000000003', me.id, P3, 80, 'completed', [me.id, P3]);
    insertMatch('20000000-0000-4000-8000-000000000004', me.id, P4, 60);
    insertMatch('20000000-0000-4000-8000-000000000005', me.id, P5, 95, 'declined');
    insertMatch('20000000-0000-4000-8000-000000000006', me.id, P6, 40);
    insertMatch('20000000-0000-4000-8000-000000000007', P1, P2, 99);
    const { matches } = await dashboard();
    assert.deepEqual(matches.map((m: { composite_score: number }) => m.composite_score), [90, 80, 70]);
  });

  it('reveals a counterpart handle only with their stage consent or a completed bilateral intro, and never a contact card', async () => {
    insertMatch('20000000-0000-4000-8000-000000000001', me.id, P1, 70);
    insertMatch('20000000-0000-4000-8000-000000000002', me.id, P2, 90);
    insertMatch('20000000-0000-4000-8000-000000000003', me.id, P3, 80, 'completed', [me.id, P3]);
    const res = await fetch(`${base}/api/me`, { headers: { cookie: me.cookie } });
    const text = await res.text();
    assert.doesNotMatch(text, /SECRET-CONTACT-CARD|contact_card/);
    assert.doesNotMatch(text, /hidden-builder/);
    const byAlias = Object.fromEntries(
      (JSON.parse(text).matches as Array<{ counterpart: { display_alias: string; github_username: string | null } }>).map((m) => [
        m.counterpart.display_alias,
        m.counterpart.github_username,
      ]),
    );
    assert.deepEqual(byAlias, { 'Loom-0002': 'public-builder', 'Loom-0003': 'intro-done', 'Loom-0001': null });
  });

  it('tells the viewer when the counterpart is interested', async () => {
    const side = me.id < P1 ? 'b' : 'a';
    insertMatch('20000000-0000-4000-8000-000000000001', me.id, P1, 70, `proposed_by_${side}`, [P1]);
    const [card] = (await dashboard()).matches;
    assert.equal(card.their_interest, true);
    assert.equal(card.my_interest, false);
  });

  it('cites only existing https evidence on match cards', async () => {
    const matchId = '20000000-0000-4000-8000-000000000001';
    insertEvidence(`e-${matchId}`.slice(0, 36), P1, 'hidden-builder/sfu');
    insertMatch(matchId, me.id, P1, 70);
    const [card] = (await dashboard()).matches;
    assert.deepEqual(card.evidence.map((e: { source_url: string }) => e.source_url), ['https://github.com/hidden-builder/sfu']);
  });

  it("dismisses only the participant's own AI inferences and queues a match refresh", async () => {
    const insertClaim = db.prepare(
      `INSERT INTO capability_claims (id, participant_id, category, name, epistemic_type, proficiency_signal, confidence, uncertainty_note, evidence_receipt_ids)
       VALUES (?, ?, 'framework', ?, 'AI_INFERENCE', 'active', 0.6, 'From README.', '["x"]')`,
    );
    insertClaim.run('30000000-0000-4000-8000-000000000001', me.id, 'Kubernetes');
    insertClaim.run('30000000-0000-4000-8000-000000000002', P1, 'Elixir');

    assert.equal((await dashboard()).offers[0].dismissible, true);
    const own = await fetch(`${base}/api/me/claims/30000000-0000-4000-8000-000000000001/dismiss`, { method: 'POST', headers: { cookie: me.cookie } });
    assert.equal(own.status, 200);
    assert.deepEqual((await dashboard()).offers, []);
    const job = db.prepare('SELECT kind, participant_id FROM async_jobs WHERE kind = ?').get(MATCH_REFRESH_JOB_KIND);
    assert.deepEqual({ ...job }, { kind: MATCH_REFRESH_JOB_KIND, participant_id: me.id });

    const foreign = await fetch(`${base}/api/me/claims/30000000-0000-4000-8000-000000000002/dismiss`, { method: 'POST', headers: { cookie: me.cookie } });
    assert.equal(foreign.status, 404);
    const untouched = db.prepare("SELECT dismissed_by_user FROM capability_claims WHERE id = '30000000-0000-4000-8000-000000000002'").get();
    assert.deepEqual({ ...untouched }, { dismissed_by_user: 0 });
    assert.equal((await fetch(`${base}/api/me/claims/x/dismiss`, { method: 'POST' })).status, 401);
  });

  it('refuses to dismiss observed facts or confirmed needs', async () => {
    db.prepare(
      `INSERT INTO capability_claims (id, participant_id, category, name, epistemic_type, proficiency_signal, confidence, uncertainty_note, evidence_receipt_ids)
       VALUES ('30000000-0000-4000-8000-000000000003', ?, 'language', 'Rust', 'OBSERVED_FACT', 'primary', 0.95, NULL, '["x"]')`,
    ).run(me.id);
    db.prepare(
      `INSERT INTO opportunity_needs (id, participant_id, project_repo, opportunity_type, label, summary, desired_capabilities, confidence, uncertainty_note, evidence_receipt_ids)
       VALUES ('40000000-0000-4000-8000-000000000002', ?, 'octocat/app', 'open_issue_help', 'Participant Confirmed Need', 'Needs a designer', '[]', 0.9, 'Confirmed.', '[]')`,
    ).run(me.id);
    const claim = await fetch(`${base}/api/me/claims/30000000-0000-4000-8000-000000000003/dismiss`, { method: 'POST', headers: { cookie: me.cookie } });
    assert.equal(claim.status, 409);
    const need = await fetch(`${base}/api/me/needs/40000000-0000-4000-8000-000000000002/dismiss`, { method: 'POST', headers: { cookie: me.cookie } });
    assert.equal(need.status, 409);
    const data = await dashboard();
    assert.equal(data.offers.length, 1);
    assert.equal(data.needs.length, 1);
    assert.equal(Number((db.prepare('SELECT COUNT(*) AS n FROM async_jobs WHERE kind = ?').get(MATCH_REFRESH_JOB_KIND) as { n: number }).n), 0);
  });

  it('dismisses an AI-inferred need', async () => {
    db.prepare(
      `INSERT INTO opportunity_needs (id, participant_id, project_repo, opportunity_type, summary, desired_capabilities, confidence, uncertainty_note, evidence_receipt_ids)
       VALUES ('40000000-0000-4000-8000-000000000001', ?, 'octocat/app', 'open_issue_help', 'Needs CRDT help', '["CRDT"]', 0.5, 'Old issue.', '[]')`,
    ).run(me.id);
    assert.equal((await dashboard()).needs.length, 1);
    const res = await fetch(`${base}/api/me/needs/40000000-0000-4000-8000-000000000001/dismiss`, { method: 'POST', headers: { cookie: me.cookie } });
    assert.equal(res.status, 200);
    assert.equal((await dashboard()).needs.length, 0);
  });
});

describe('/me page behaviour', () => {
  const script = readFileSync(join(REPO_ROOT, 'public', 'app', 'me.js'), 'utf8');
  const STATIC_IDS = ['alias', 'handle', 'progress', 'fingerprint', 'offers', 'needs', 'matches', 'withdraw', 'withdraw-note'];

  class FakeNode {
    tagName: string;
    className = '';
    disabled = false;
    children: FakeNode[] = [];
    attributes: Record<string, string> = {};
    style: Record<string, string> = {};
    listeners: Record<string, () => unknown> = {};
    private ownText = '';

    constructor(tagName: string) {
      this.tagName = tagName.toUpperCase();
    }

    get textContent(): string {
      return this.ownText + this.children.map((c) => c.textContent).join('');
    }

    set textContent(value: string) {
      this.ownText = value;
      this.children = [];
    }

    appendChild(child: FakeNode): FakeNode {
      this.children.push(child);
      return child;
    }

    replaceChildren(...nodes: FakeNode[]): void {
      this.ownText = '';
      this.children = nodes;
    }

    setAttribute(name: string, value: string): void {
      this.attributes[name] = value;
    }

    addEventListener(type: string, fn: () => unknown): void {
      this.listeners[type] = fn;
    }

    /** Every descendant (depth-first). */
    all(): FakeNode[] {
      return this.children.flatMap((c) => [c, ...c.all()]);
    }
  }

  const sample = {
    participant: { id: 'p', display_alias: 'Thread-7C4E', github_username: 'octocat', analysis_state: 'ready' },
    progress: [
      { key: 'crawl', label: 'GitHub + Website Crawl', status: 'done' },
      { key: 'fingerprint', label: '6-Axis Builder Fingerprint', status: 'done' },
      { key: 'matches', label: 'Top-3 Complementary Matches', status: 'done' },
    ],
    fingerprint: { axes: ['Systems/Infra', 'Agent Orchestration', 'LLM/Eval', 'Frontend/UX', 'Product/GTM', 'Data/Pipelines'].map((label, i) => ({ key: `k${i}`, label, value: i * 20 })) },
    offers: [{ id: 'c1', name: 'Rust', dismissible: false }, { id: 'c2', name: 'Kubernetes', dismissible: true }],
    needs: [],
    matches: [1, 2, 3].map((n) => ({
      id: `m${n}`,
      counterpart: { display_alias: `Loom-000${n}`, github_username: n === 2 ? 'public-builder' : null },
      composite_score: 100 - n * 10,
      score_breakdown: { capability_similarity: 0.9, need_offer_fit: 0.8, complementarity: 0.6, novelty: 0.5, freshness: 1 },
      complementary_summary: `Summary ${n} <script>alert(1)</script>`,
      suggested_first_collaboration: 'Pair on latency.',
      confidence_limitations: 'Inferred.',
      evidence: [
        { source_url: 'https://github.com/x/sfu', repo_full_name: 'x/sfu', title_or_summary: 'sfu' },
        { source_url: 'javascript:alert(1)', repo_full_name: null, title_or_summary: 'bad link' },
      ],
      my_interest: false,
      their_interest: n === 3,
    })),
    latest_seq_id: 10,
  };

  /**
   * Runs me.js against a fake DOM.
   * @param answer - Returns `[status, body]` per request.
   * @returns Elements, request log, redirect target and the EventSource instance.
   */
  async function loadPage(answer: (url: string, init?: { method?: string }) => [number, unknown]) {
    const elements: Record<string, FakeNode> = {};
    for (const id of STATIC_IDS) elements[id] = new FakeNode('div');
    const requests: Array<{ url: string; method: string }> = [];
    const page = { redirectedTo: null as string | null, source: null as null | { onmessage?: (m: { data: string }) => void; url: string } };
    runInNewContext(script, {
      document: { getElementById: (id: string) => elements[id], createElement: (tag: string) => new FakeNode(tag) },
      window: { location: { assign: (to: string) => { page.redirectedTo = to; } } },
      fetch: async (url: string, init?: { method?: string }) => {
        requests.push({ url, method: init?.method ?? 'GET' });
        const [status, body] = answer(url, init);
        return { ok: status >= 200 && status < 300, status, json: async () => body };
      },
      EventSource: class {
        url: string;
        onmessage?: (m: { data: string }) => void;
        onerror?: () => void;
        constructor(url: string) {
          this.url = url;
          page.source = this;
        }
        close() {}
      },
      setTimeout, clearTimeout, setInterval, clearInterval, encodeURIComponent, JSON, Math, Object, String, Number, Boolean,
    });
    await settle();
    return { elements, requests, page };
  }

  /** Lets pending promise callbacks run. */
  async function settle(): Promise<void> {
    for (let i = 0; i < 6; i += 1) await new Promise((done) => setImmediate(done));
  }

  /**
   * Waits until a condition holds, failing after two seconds.
   * @param condition - Predicate to poll.
   */
  async function waitFor(condition: () => boolean): Promise<void> {
    const deadline = Date.now() + 2000;
    while (!condition()) {
      if (Date.now() > deadline) throw new Error('condition not met within 2s');
      await new Promise((done) => setTimeout(done, 20));
    }
  }

  const answerSample = (url: string): [number, unknown] => (url === '/api/me' ? [200, sample] : [404, {}]);

  it('renders the stepper, six fingerprint axes, offers and three match cards', async () => {
    const { elements } = await loadPage(answerSample);
    assert.equal(elements.alias!.textContent, 'Thread-7C4E');
    assert.equal(elements.progress!.children.length, 3);
    assert.equal(elements.fingerprint!.all().filter((n) => n.className === 'bar-row').length, 6);
    const cards = elements.matches!.children;
    assert.equal(cards.length, 3);
    assert.match(cards[0]!.textContent, /Loom-0001/);
    assert.match(cards[1]!.textContent, /@public-builder/);
    assert.match(cards[2]!.textContent, /interested in meeting you/);
    assert.equal(cards[0]!.all().filter((n) => n.className === 'bar-row').length, 5, 'five score components');
    const dismissButtons = elements.offers!.all().filter((n) => n.tagName === 'BUTTON');
    assert.equal(dismissButtons.length, 1, 'only the AI inference can be dismissed');
  });

  it('never turns data into markup or unsafe links', async () => {
    const { elements } = await loadPage(answerSample);
    const links = elements.matches!.all().filter((n) => n.tagName === 'A');
    assert.ok(links.length > 0);
    for (const link of links) assert.match(link.attributes.href ?? '', /^https:\/\//);
    assert.ok(links.every((l) => l.attributes.rel === 'noopener noreferrer'));
    assert.match(elements.matches!.textContent, /<script>alert\(1\)<\/script>/, 'markup stays literal text');
  });

  it('sends a signed-out visitor to /join', async () => {
    const { page } = await loadPage(() => [401, {}]);
    assert.equal(page.redirectedTo, '/join');
  });

  it('subscribes from the dashboard cursor and refreshes only for events naming this participant', async () => {
    const { requests, page } = await loadPage(answerSample);
    assert.match(page.source!.url, /after=10$/);
    const meFetches = () => requests.filter((r) => r.url === '/api/me').length;
    const before = meFetches();
    page.source!.onmessage!({ data: JSON.stringify({ seq_id: 11, type: 'match.evaluated', payload: { display_alias_a: 'Loom-0009', display_alias_b: 'Loom-0008' } }) });
    await new Promise((done) => setTimeout(done, 400));
    assert.equal(meFetches(), before, 'an event about other participants triggers no refresh');
    page.source!.onmessage!({ data: JSON.stringify({ seq_id: 12, type: 'match.evaluated', payload: { display_alias_a: 'Thread-7C4E', display_alias_b: 'Loom-0001' } }) });
    page.source!.onmessage!({ data: JSON.stringify({ seq_id: 13, type: 'match.candidate.generated', payload: { display_alias_a: 'Thread-7C4E', display_alias_b: 'Loom-0002' } }) });
    await waitFor(() => meFetches() > before);
    await new Promise((done) => setTimeout(done, 400));
    assert.equal(meFetches(), before + 1, 'a burst of events about this participant coalesces into one refresh');
  });

  it('explains that introductions are not open yet when the decision endpoint is missing', async () => {
    const { elements, requests } = await loadPage(answerSample);
    const card = elements.matches!.children[0]!;
    const interested = card.all().find((n) => n.tagName === 'BUTTON' && /Interested/.test(n.textContent))!;
    await interested.listeners.click!();
    await settle();
    assert.ok(requests.some((r) => r.url === '/api/matches/m1/decision' && r.method === 'POST'));
    assert.match(card.textContent, /Introductions open shortly/);
  });

  it('withdraws only after a second tap', async () => {
    const { elements, requests, page } = await loadPage((url, init) =>
      url === '/api/participants/me' && init?.method === 'DELETE' ? [204, {}] : answerSample(url),
    );
    await elements.withdraw!.listeners.click!();
    assert.equal(requests.some((r) => r.method === 'DELETE'), false);
    assert.match(elements.withdraw!.textContent, /Tap again/);
    await elements.withdraw!.listeners.click!();
    await settle();
    assert.ok(requests.some((r) => r.url === '/api/participants/me' && r.method === 'DELETE'));
    assert.equal(page.redirectedTo, '/join');
  });
});

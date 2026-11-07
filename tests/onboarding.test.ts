import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import {
  createSessionToken,
  parseCookies,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  verifySessionToken,
} from '../src/auth/session.ts';
import { DisplayAliasSchema, PublicEventEnvelopeSchema } from '../src/contracts/index.ts';
import { openDatabase } from '../src/db/client.ts';
import { subscribe } from '../src/events/bus.ts';
import {
  ANALYZE_JOB_KIND,
  displayAliasFor,
  isPrivateHost,
  normalizeGithubHandle,
  normalizeWebsiteUrl,
  RATE_LIMIT_MAX,
  resetRateLimits,
  setAdmissionPolicy,
} from '../src/routes/onboarding.ts';
import type { Logger } from '../src/server.ts';
import { createServer, loadRoutes } from '../src/server.ts';

const REPO_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const silent: Logger = { info() {} };

describe('normalizeGithubHandle', () => {
  const accepted: Array<[string, string]> = [
    ['octocat', 'octocat'],
    ['@OctoCat', 'octocat'],
    ['  octo-cat  ', 'octo-cat'],
    ['github.com/octocat', 'octocat'],
    ['https://github.com/OctoCat/', 'octocat'],
    ['https://www.github.com/octocat?tab=repositories', 'octocat'],
  ];
  for (const [input, login] of accepted) {
    it(`accepts ${JSON.stringify(input)}`, () => assert.equal(normalizeGithubHandle(input), login));
  }

  const rejected: unknown[] = ['', '@', '-octocat', 'octo--cat', 'a'.repeat(40), 'https://github.com/octocat/repo', 'https://gitlab.com/octocat', 'octo cat', 42, null];
  for (const input of rejected) {
    it(`rejects ${JSON.stringify(input)}`, () => assert.equal(normalizeGithubHandle(input), null));
  }
});

describe('normalizeWebsiteUrl', () => {
  it('treats an empty value as no website', () => {
    assert.deepEqual(normalizeWebsiteUrl(''), { ok: true, url: null });
    assert.deepEqual(normalizeWebsiteUrl(undefined), { ok: true, url: null });
  });

  const accepted: Array<[string, string]> = [
    ['jasonvaughan.com', 'https://jasonvaughan.com'],
    ['https://jasonvaughan.com/', 'https://jasonvaughan.com'],
    ['http://jasonvaughan.com', 'https://jasonvaughan.com'],
    ['JasonVaughan.com/about#me', 'https://jasonvaughan.com/about'],
    ['https://example.dev/portfolio?x=1', 'https://example.dev/portfolio?x=1'],
  ];
  for (const [input, url] of accepted) {
    it(`normalizes ${input}`, () => assert.deepEqual(normalizeWebsiteUrl(input), { ok: true, url }));
  }

  const rejected: Array<[string, string]> = [
    ['localhost:3000', 'private_address'],
    ['http://127.0.0.1', 'private_address'],
    ['http://2130706433', 'private_address'],
    ['10.0.0.5', 'private_address'],
    ['192.168.1.10', 'private_address'],
    ['169.254.169.254/latest/meta-data', 'private_address'],
    ['172.20.0.1', 'private_address'],
    ['http://[::1]/', 'private_address'],
    ['http://[::ffff:127.0.0.1]/', 'private_address'],
    ['printer.local', 'private_address'],
    ['intranet', 'private_address'],
    ['https://www.linkedin.com/in/someone', 'login_walled'],
    ['x.com/someone', 'login_walled'],
    ['ftp://example.com', 'invalid_url'],
    ['https://user:pass@example.com', 'invalid_url'],
  ];
  for (const [input, reason] of rejected) {
    it(`rejects ${input} as ${reason}`, () => assert.deepEqual(normalizeWebsiteUrl(input), { ok: false, reason }));
  }
});

describe('isPrivateHost', () => {
  it('allows ordinary public hosts and addresses', () => {
    for (const host of ['jasonvaughan.com', 'github.io', '8.8.8.8', '172.32.0.1']) assert.equal(isPrivateHost(host), false, host);
  });
});

describe('displayAliasFor', () => {
  it('is deterministic and matches the contract format', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    assert.equal(displayAliasFor(id), displayAliasFor(id));
    assert.equal(DisplayAliasSchema.safeParse(displayAliasFor(id)).success, true);
    assert.notEqual(displayAliasFor(id), displayAliasFor('22222222-2222-4222-8222-222222222222'));
  });
});

describe('session tokens', () => {
  const secret = 'x'.repeat(32);
  const id = '11111111-1111-4111-8111-111111111111';
  const issued = new Date('2026-11-07T18:00:00Z');

  it('round-trips a valid token', () => {
    assert.equal(verifySessionToken(createSessionToken(id, secret, issued), secret, issued), id);
  });

  it('rejects a forged, re-signed or expired token', () => {
    const token = createSessionToken(id, secret, issued);
    const [, at, sig] = token.split('.');
    assert.equal(verifySessionToken(`22222222-2222-4222-8222-222222222222.${at}.${sig}`, secret, issued), null);
    assert.equal(verifySessionToken(token, 'y'.repeat(32), issued), null);
    assert.equal(verifySessionToken('garbage', secret, issued), null);
    const later = new Date(issued.getTime() + (SESSION_TTL_SECONDS + 1) * 1000);
    assert.equal(verifySessionToken(token, secret, later), null);
  });

  it('parses cookie headers', () => {
    assert.deepEqual(parseCookies('a=1; ariadne_session=abc.1.x; b=%20'), { a: '1', ariadne_session: 'abc.1.x', b: ' ' });
  });
});

describe('join page behaviour', () => {
  const script = readFileSync(join(REPO_ROOT, 'public', 'app', 'join.js'), 'utf8');
  const ids = [
    'join-form', 'capacity', 'capacity-message', 'submit', 'status', 'github', 'website_url', 'goal',
    'consent_processing', 'stage_display_consent', 'retry', 'prewarm-entry',
    'github-error', 'website_url-error', 'goal-error', 'consent_processing-error',
  ];

  interface FakeElement {
    hidden: boolean;
    textContent: string;
    value: string;
    checked: boolean;
    disabled: boolean;
    listeners: Record<string, (event?: unknown) => unknown>;
    addEventListener(type: string, fn: (event?: unknown) => unknown): void;
    focus(): void;
  }

  /**
   * Loads join.js against a fake DOM whose `fetch` answers from the given handlers.
   * @param answer - Returns `[status, body]` for each request.
   * @returns The elements, recorded requests and redirect target.
   */
  async function loadPage(answer: (url: string, init?: { method?: string; body?: string }) => [number, unknown]) {
    const elements: Record<string, FakeElement> = {};
    for (const id of ids) {
      elements[id] = {
        hidden: false, textContent: '', value: '', checked: false, disabled: false, listeners: {},
        addEventListener(type, fn) { this.listeners[type] = fn; },
        focus() {},
      };
    }
    elements.capacity!.hidden = true;
    const requests: Array<{ url: string; body: unknown }> = [];
    const page = { redirectedTo: null as string | null };
    runInNewContext(script, {
      document: { getElementById: (id: string) => elements[id] },
      window: { location: { assign: (to: string) => { page.redirectedTo = to; } } },
      fetch: async (url: string, init?: { method?: string; body?: string }) => {
        requests.push({ url, body: init?.body ? JSON.parse(init.body) : null });
        const [status, body] = answer(url, init);
        return { ok: status >= 200 && status < 300, status, json: async () => body };
      },
    });
    await settle();
    return { elements, requests, page };
  }

  /** Lets pending promise callbacks run. */
  async function settle(): Promise<void> {
    for (let i = 0; i < 5; i += 1) await new Promise((done) => setImmediate(done));
  }

  /**
   * Submits the form as a user would.
   * @param elements - Page elements.
   */
  async function submitForm(elements: Record<string, FakeElement>): Promise<void> {
    await elements['join-form']!.listeners.submit!({ preventDefault() {} });
    await settle();
  }

  const fullRoom = { open: false, active: 30, max: 30, locked: false, message: '🚧 System is currently at capacity (30/30) — please try back later!' };

  it('shows the form when the room is open', async () => {
    const { elements } = await loadPage(() => [200, { open: true, active: 1, max: 30, locked: false, message: null }]);
    assert.equal(elements['join-form']!.hidden, false);
    assert.equal(elements.capacity!.hidden, true);
  });

  it('replaces the form with the capacity notice when the room is full', async () => {
    const { elements } = await loadPage(() => [200, fullRoom]);
    assert.equal(elements.capacity!.hidden, false);
    assert.equal(elements['capacity-message']!.textContent, fullRoom.message);
    assert.equal(elements['join-form']!.hidden, true);
  });

  it('sends the stage display choice explicitly: true when left checked, false when unchecked', async () => {
    for (const checked of [true, false]) {
      const { elements, requests } = await loadPage((url) =>
        url.endsWith('/admission') ? [200, { open: true, active: 0, max: 30, locked: false, message: null }] : [201, { participant: {}, redirect: '/me' }],
      );
      elements.github!.value = 'octocat';
      elements.consent_processing!.checked = true;
      elements.stage_display_consent!.checked = checked;
      await submitForm(elements);
      const post = requests.find((r) => r.url === '/api/participants');
      assert.equal((post?.body as { stage_display_consent: boolean }).stage_display_consent, checked);
    }
  });

  it('lets a pre-registered judge enter their handle and join while the room is full', async () => {
    const { elements, requests, page } = await loadPage((url) =>
      url.endsWith('/admission') ? [200, fullRoom] : [201, { participant: {}, redirect: '/me' }],
    );
    elements['prewarm-entry']!.listeners.click!();
    assert.equal(elements['join-form']!.hidden, false);
    assert.equal(elements.capacity!.hidden, false);

    elements.github!.value = 'judge-one';
    elements.consent_processing!.checked = true;
    await submitForm(elements);
    const post = requests.find((r) => r.url === '/api/participants');
    assert.equal((post?.body as { github: string }).github, 'judge-one');
    assert.equal(page.redirectedTo, '/me');
  });

  it('keeps the guest form open and explains when the handle is not pre-registered', async () => {
    const { elements, page } = await loadPage((url) =>
      url.endsWith('/admission') ? [200, fullRoom] : [429, { error: 'room_at_capacity', message: fullRoom.message }],
    );
    elements['prewarm-entry']!.listeners.click!();
    elements.github!.value = 'walk-in';
    elements.consent_processing!.checked = true;
    await submitForm(elements);
    assert.equal(elements['join-form']!.hidden, false);
    assert.match(elements.status!.textContent, /not on the pre-registered list/);
    assert.equal(page.redirectedTo, null);
  });

  it('blocks submission until processing consent is ticked', async () => {
    const { elements, requests } = await loadPage(() => [200, { open: true, active: 0, max: 30, locked: false, message: null }]);
    elements.github!.value = 'octocat';
    await submitForm(elements);
    assert.equal(requests.some((r) => r.url === '/api/participants'), false);
    assert.match(elements['consent_processing-error']!.textContent, /tick this box/);
  });
});

describe('onboarding API', () => {
  let dir: string;
  let db: DatabaseSync;
  let server: Server;
  let base: string;

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), 'ariadne-onboarding-'));
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

  beforeEach(() => {
    db.exec('DELETE FROM participants; DELETE FROM domain_events; DELETE FROM async_jobs; DELETE FROM github_snapshots;');
    setAdmissionPolicy({ maxRoomCapacity: 30, intakeLocked: false });
    resetRateLimits();
  });

  afterEach(() => resetRateLimits());

  /**
   * Posts a registration.
   * @param body - JSON body.
   * @param headers - Extra headers (cookie, forwarded address).
   * @returns The response.
   */
  function register(body: Record<string, unknown>, headers: Record<string, string> = {}): Promise<Response> {
    return fetch(`${base}/api/participants`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify({ consent_processing: true, ...body }),
    });
  }

  /**
   * The `name=value` part of a response's session cookie.
   * @param res - Response carrying `Set-Cookie`.
   * @returns Cookie header value to send back.
   */
  function sessionOf(res: Response): string {
    const header = res.headers.get('set-cookie') ?? '';
    return header.split(';')[0]!;
  }

  /**
   * Counts rows in a table.
   * @param table - Table name.
   * @returns Row count.
   */
  function count(table: string): number {
    return Number((db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n);
  }

  it('serves /join with the GitHub-profile badge and consent controls', async () => {
    const res = await fetch(`${base}/join`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /text\/html/);
    const html = await res.text();
    assert.match(html, /⚡ REQUIRES GITHUB PROFILE/);
    assert.match(html, /Display my @github handle on the 16:9 stage visualizer \(uncheck for anonymous alias\)/);
    assert.match(html, /<input type="checkbox" id="stage_display_consent" name="stage_display_consent" checked>/, 'stage display is pre-checked');
    assert.match(html, /must be publicly accessible with no login required/);
    assert.match(html, /id="prewarm-entry"/);
  });

  it('registers a participant, starts a session, emits participant.registered and queues analysis', async () => {
    const res = await register({ github: '@OctoCat', website_url: 'jasonvaughan.com', goal: 'Looking for a WebRTC co-hacker' });
    assert.equal(res.status, 201);
    const body = (await res.json()) as { participant: Record<string, unknown>; redirect: string };
    assert.equal(body.redirect, '/me');
    assert.equal(body.participant.github_username, 'octocat');
    assert.equal(body.participant.website_url, 'https://jasonvaughan.com');
    assert.equal(body.participant.stage_display_consent, false);

    const cookie = res.headers.get('set-cookie') ?? '';
    assert.match(cookie, new RegExp(`^${SESSION_COOKIE}=`));
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);

    const row = db.prepare('SELECT stage_display_consent, ownership_verified, consent_status FROM participants').get();
    assert.deepEqual({ ...row }, { stage_display_consent: 0, ownership_verified: 0, consent_status: 'granted' });

    const event = db.prepare('SELECT seq_id, event_id, type, payload_json, occurred_at FROM domain_events').get() as Record<string, string | number>;
    const envelope = { ...event, payload: JSON.parse(String(event.payload_json)) };
    delete (envelope as Record<string, unknown>).payload_json;
    assert.equal(PublicEventEnvelopeSchema.safeParse(envelope).success, true);
    assert.deepEqual(envelope.payload, { display_alias: body.participant.display_alias });

    const job = db.prepare('SELECT kind, status, payload_json FROM async_jobs').get() as Record<string, string>;
    assert.equal(job.kind, ANALYZE_JOB_KIND);
    assert.equal(job.status, 'queued');
    assert.deepEqual(JSON.parse(job.payload_json!), {
      github_username: 'octocat',
      website_url: 'https://jasonvaughan.com',
      goal: 'Looking for a WebRTC co-hacker',
    });
  });

  it('never opts a client into stage display when the field is omitted', async () => {
    await register({ github: 'octocat' });
    const row = db.prepare('SELECT stage_display_consent FROM participants').get();
    assert.deepEqual({ ...row }, { stage_display_consent: 0 });
    const payload = JSON.parse((db.prepare('SELECT payload_json FROM domain_events').get() as { payload_json: string }).payload_json);
    assert.equal(payload.display, undefined);
  });

  it('puts the handle on the stage event only with stage display consent', async () => {
    await register({ github: 'octocat', stage_display_consent: true });
    const payload = JSON.parse((db.prepare('SELECT payload_json FROM domain_events').get() as { payload_json: string }).payload_json);
    assert.deepEqual(payload.display, { stage_display_consent: true, github_username: 'octocat', avatar_url: null });
  });

  it('marks the session cookie Secure behind the HTTPS tunnel', async () => {
    const res = await register({ github: 'octocat' }, { 'x-forwarded-proto': 'https' });
    assert.match(res.headers.get('set-cookie') ?? '', /; Secure/);
  });

  const invalid: Array<[string, Record<string, unknown>, string]> = [
    ['an empty handle', { github: '' }, 'github'],
    ['an invalid handle', { github: 'not a user!' }, 'github'],
    ['a private website', { github: 'octocat', website_url: '192.168.0.10' }, 'website_url'],
    ['a login-walled website', { github: 'octocat', website_url: 'linkedin.com/in/octocat' }, 'website_url'],
    ['a goal over 160 characters', { github: 'octocat', goal: 'x'.repeat(161) }, 'goal'],
    ['a multi-line goal', { github: 'octocat', goal: 'one\ntwo' }, 'goal'],
    ['no processing consent', { github: 'octocat', consent_processing: false }, 'consent_processing'],
  ];
  for (const [name, body, field] of invalid) {
    it(`rejects ${name} with 400 and stores nothing`, async () => {
      const res = await register(body);
      assert.equal(res.status, 400);
      assert.equal(((await res.json()) as { field: string }).field, field);
      assert.equal(count('participants'), 0);
      assert.equal(count('domain_events'), 0);
    });
  }

  it('rejects a non-JSON body', async () => {
    const res = await fetch(`${base}/api/participants`, { method: 'POST', body: 'github=octocat' });
    assert.equal(res.status, 400);
  });

  it('refuses a handle that already joined, so nobody can take over another session', async () => {
    await register({ github: 'octocat' });
    const res = await register({ github: 'https://github.com/OctoCat' });
    assert.equal(res.status, 409);
    assert.equal(count('participants'), 1);
  });

  it('returns the existing participant for a live session without a second event', async () => {
    const first = await register({ github: 'octocat' });
    const firstBody = (await first.json()) as { participant: { id: string } };
    const again = await register({ github: 'someone-else' }, { cookie: sessionOf(first) });
    assert.equal(again.status, 200);
    assert.equal(((await again.json()) as { participant: { id: string } }).participant.id, firstBody.participant.id);
    assert.equal(count('participants'), 1);
    assert.equal(count('domain_events'), 1);
  });

  it('closes the room at capacity with the friendly notice', async () => {
    setAdmissionPolicy({ maxRoomCapacity: 2 });
    assert.equal((await register({ github: 'alpha' })).status, 201);
    assert.equal((await register({ github: 'bravo' })).status, 201);
    const full = await register({ github: 'charlie' });
    assert.equal(full.status, 429);
    const body = (await full.json()) as { error: string; message: string };
    assert.equal(body.error, 'room_at_capacity');
    assert.equal(body.message, '🚧 System is currently at capacity (2/2) — please try back later!');
    const admission = (await (await fetch(`${base}/api/participants/admission`)).json()) as Record<string, unknown>;
    assert.deepEqual(admission, { open: false, active: 2, max: 2, locked: false, message: body.message });
  });

  it('never counts seed personas against room capacity', async () => {
    setAdmissionPolicy({ maxRoomCapacity: 1 });
    const insertSeed = db.prepare(
      `INSERT INTO participants (id, display_alias, github_username, consent_status, consent_granted_at, created_at, updated_at)
       VALUES (?, ?, ?, 'granted', ?, ?, ?)`,
    );
    const at = '2026-11-07T18:00:00Z';
    insertSeed.run('5eed0000-0000-4000-8000-000000000001', 'Loom-0001', 'seed-by-id', at, at, at);
    insertSeed.run('66666666-6666-4666-8666-666666666666', 'Loom-0002', 'ariadne-seed-two', at, at, at);
    assert.equal((await register({ github: 'real-attendee' })).status, 201);
    assert.equal((await register({ github: 'second-attendee' })).status, 429);
  });

  it('reserves the seed handle prefix', async () => {
    const res = await register({ github: 'ariadne-seed-me' });
    assert.equal(res.status, 400);
    assert.equal(((await res.json()) as { error: string }).error, 'reserved_github');
  });

  it('wakes live event subscribers on registration', async () => {
    const seen: number[] = [];
    const unsubscribe = subscribe(db, (seqId) => seen.push(seqId));
    try {
      await register({ github: 'octocat' });
    } finally {
      unsubscribe();
    }
    assert.equal(seen.length, 1);
  });

  it('admits a pre-warmed handle past a full or locked room', async () => {
    setAdmissionPolicy({ maxRoomCapacity: 1, intakeLocked: true });
    db.prepare(
      `INSERT INTO github_snapshots (github_username, participant_id, payload_json, fetched_at, expires_at)
       VALUES ('judge-one', NULL, '{}', ?, ?)`,
    ).run('2026-11-07T18:00:00Z', '2026-11-08T18:00:00Z');
    assert.equal((await register({ github: 'walk-in' })).status, 429);
    assert.equal((await register({ github: 'judge-one' })).status, 201);
  });

  it('returns the signed-in profile and 401 without a session', async () => {
    assert.equal((await fetch(`${base}/api/participants/me`)).status, 401);
    const res = await register({ github: 'octocat' });
    const me = await fetch(`${base}/api/participants/me`, { headers: { cookie: sessionOf(res) } });
    assert.equal(me.status, 200);
    assert.equal(((await me.json()) as { participant: { github_username: string } }).participant.github_username, 'octocat');
  });

  it('withdraws: purges derived data, scrubs stage identity, frees the slot and ends the session', async () => {
    setAdmissionPolicy({ maxRoomCapacity: 1 });
    const res = await register({ github: 'octocat', stage_display_consent: true });
    const cookie = sessionOf(res);
    const { participant } = (await res.json()) as { participant: { id: string } };
    db.prepare(
      `INSERT INTO evidence_receipts (id, participant_id, source_type, source_url, title_or_summary, source_updated_at, fetched_at)
       VALUES ('33333333-3333-4333-8333-333333333333', ?, 'user_profile', 'https://github.com/octocat', 'Profile', ?, ?)`,
    ).run(participant.id, '2026-11-07T18:00:00Z', '2026-11-07T18:00:00Z');
    assert.equal((await register({ github: 'waiting' })).status, 429);

    const del = await fetch(`${base}/api/participants/me`, { method: 'DELETE', headers: { cookie } });
    assert.equal(del.status, 204);
    assert.match(del.headers.get('set-cookie') ?? '', /Max-Age=0/);
    assert.equal(count('participants'), 0);
    assert.equal(count('evidence_receipts'), 0);
    assert.equal(count('async_jobs'), 0);
    const payload = JSON.parse((db.prepare('SELECT payload_json FROM domain_events').get() as { payload_json: string }).payload_json);
    assert.equal(payload.display, undefined);
    assert.doesNotMatch(JSON.stringify(payload), /octocat/);

    assert.equal((await fetch(`${base}/api/participants/me`, { headers: { cookie } })).status, 401);
    assert.equal((await register({ github: 'waiting' })).status, 201);
  });

  it('answers 401 to a withdrawal without a session', async () => {
    assert.equal((await fetch(`${base}/api/participants/me`, { method: 'DELETE' })).status, 401);
  });

  it('rate-limits registration attempts per client address', async () => {
    const headers = { 'x-forwarded-for': '203.0.113.7' };
    for (let i = 0; i < RATE_LIMIT_MAX; i += 1) await register({ github: '' }, headers);
    const limited = await register({ github: 'octocat' }, headers);
    assert.equal(limited.status, 429);
    assert.equal(((await limited.json()) as { error: string }).error, 'rate_limited');
    assert.ok(Number(limited.headers.get('retry-after')) > 0);
    assert.equal((await register({ github: 'octocat' }, { 'x-forwarded-for': '198.51.100.9' })).status, 201);
  });
});

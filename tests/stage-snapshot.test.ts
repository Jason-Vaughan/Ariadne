import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DatabaseSync } from 'node:sqlite';
import { openDatabase } from '../src/db/client.ts';
import { DisplayAliasSchema, GithubUsernameSchema, IdSchema } from '../src/contracts/types.ts';
import { createServer, loadRoutes } from '../src/server.ts';
import type { Logger } from '../src/server.ts';
import {
  buildStageSnapshot,
  capTopEdges,
  edgeStateFor,
  encodeQr,
  isLoopbackHost,
  isPresenterRequest,
  isSeedId,
  qrToSvg,
  resolveJoinUrl,
  SEED_COUNT,
  seedProfiles,
  setSeedMode,
  stageSafeEvent,
} from '../src/routes/stage-snapshot.ts';
import type { StageEdge } from '../src/routes/stage-snapshot.ts';
import {
  edgeClass,
  edgePath,
  findNewGoldenEdges,
  goldenBannerText,
  layoutGraph,
} from '../public/stage/network-graph.js';

const REPO_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const silent: Logger = { info() {} };
const NOW = '2026-11-07T19:00:00Z';

/**
 * Open a throwaway database with the real schema, closed and removed after the test.
 * @param t - Test context.
 * @returns The open database.
 */
function freshDb(t: { after: (fn: () => void) => void }): DatabaseSync {
  const dir = mkdtempSync(join(tmpdir(), 'ariadne-stage-'));
  const { db } = openDatabase({ path: join(dir, 'stage.db'), schemaPath: join(REPO_ROOT, 'src', 'db', 'schema.sql') });
  t.after(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return db;
}

interface ParticipantSeed {
  alias: string;
  username: string;
  consent?: 0 | 1;
  status?: 'granted' | 'withdrawn';
  state?: string;
  contact?: string | null;
}

/**
 * Insert a live participant.
 * @param db - Database.
 * @param p - Participant fields.
 * @returns The new participant id.
 */
function addParticipant(db: DatabaseSync, p: ParticipantSeed): string {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO participants (id, display_alias, github_username, avatar_url, consent_status, consent_granted_at,
       stage_display_consent, contact_card, analysis_state, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, p.alias, p.username, `https://avatars.example.com/${p.username}`, p.status ?? 'granted', NOW, p.consent ?? 0,
    p.contact ?? null, p.state ?? 'ready', NOW, NOW);
  return id;
}

/**
 * Insert a match between two participants with a given introduction state.
 * @param db - Database.
 * @param x - One participant id.
 * @param y - The other participant id.
 * @param score - Composite score.
 * @param introState - Introduction state.
 * @returns The match id.
 */
function addMatch(db: DatabaseSync, x: string, y: string, score: number, introState = 'candidate'): string {
  const [a, b] = x < y ? [x, y] : [y, x];
  const approvals: Record<string, [number, number]> = {
    candidate: [0, 0], proposed_by_a: [1, 0], proposed_by_b: [0, 1], mutual_accepted: [1, 1], completed: [1, 1], declined: [0, 0],
  };
  const [approvalA, approvalB] = approvals[introState] ?? [0, 0];
  const id = randomUUID();
  db.prepare(
    `INSERT INTO matches (id, participant_a_id, participant_b_id, composite_score, score_breakdown, complementary_summary,
       relevant_projects, suggested_first_collaboration, confidence_limitations, evidence_receipt_ids, intro_state,
       approval_a, approval_b, created_at, updated_at)
     VALUES (?, ?, ?, ?, '{}', 's', '[]', 'c', 'l', '["e1","e2"]', ?, ?, ?, ?, ?)`,
  ).run(id, a, b, score, introState, approvalA, approvalB, NOW, NOW);
  return id;
}

/**
 * Set a match's introduction state, keeping approvals consistent with it.
 * @param db - Database.
 * @param id - Match id.
 * @param introState - New state.
 */
function setIntroState(db: DatabaseSync, id: string, introState: string): void {
  const both = introState === 'completed' || introState === 'mutual_accepted' ? 1 : 0;
  db.prepare('UPDATE matches SET intro_state = ?, approval_a = ?, approval_b = ? WHERE id = ?').run(introState, both, both, id);
}

/**
 * Edge fixture.
 * @param id - Match id.
 * @param a - Alias.
 * @param b - Alias.
 * @param score - Score.
 * @param state - Edge state.
 * @returns The edge.
 */
function edge(id: string, a: string, b: string, score: number, state: StageEdge['state'] = 'suggested'): StageEdge {
  return { match_id: id, a, b, score, state };
}

describe('seed pool', () => {
  test('seed profiles are 25 distinct rows that satisfy the participant contract', () => {
    const seeds = seedProfiles();
    assert.equal(seeds.length, SEED_COUNT);
    assert.equal(new Set(seeds.map((s) => s.id)).size, SEED_COUNT);
    for (const s of seeds) {
      assert.ok(IdSchema.safeParse(s.id).success, s.id);
      assert.ok(DisplayAliasSchema.safeParse(s.display_alias).success, s.display_alias);
      assert.ok(GithubUsernameSchema.safeParse(s.github_username).success, s.github_username);
      assert.ok(isSeedId(s.id));
    }
    assert.equal(isSeedId(randomUUID()), false);
  });

  test('toggling ON adds the seeds to the pool and OFF removes only seeds and their matches, in under 300ms', (t) => {
    const db = freshDb(t);
    const live = addParticipant(db, { alias: 'Thread-0A01', username: 'alice' });
    const on = setSeedMode(db, true);
    assert.deepEqual([on.seed_mode, on.seed_count], [true, 25]);
    assert.ok(on.elapsed_ms < 300, `took ${on.elapsed_ms}ms`);
    assert.equal(setSeedMode(db, true).seed_count, 25, 'turning seeds on twice inserts nothing new');

    const seedId = seedProfiles()[0]?.id ?? '';
    addMatch(db, live, seedId, 80);
    assert.equal(buildStageSnapshot(db).kpis.matches, 1, 'a live scanner matches against a seed');

    const off = setSeedMode(db, false);
    assert.deepEqual([off.seed_mode, off.seed_count], [false, 0]);
    assert.ok(off.elapsed_ms < 300, `took ${off.elapsed_ms}ms`);
    const snapshot = buildStageSnapshot(db);
    assert.deepEqual(snapshot.nodes.map((n) => n.alias), ['Thread-0A01']);
    assert.equal(snapshot.kpis.matches, 0, 'matches with seeds leave with them');
  });
});

describe('stage snapshot', () => {
  test('labels use the GitHub handle only with consent and never expose ids or contact cards', (t) => {
    const db = freshDb(t);
    const a = addParticipant(db, { alias: 'Thread-0A01', username: 'alice', consent: 1, contact: 'alice@example.com' });
    addParticipant(db, { alias: 'Thread-0B02', username: 'bob', consent: 0, state: 'analyzing_profile' });
    addParticipant(db, { alias: 'Thread-0C03', username: 'carol', status: 'withdrawn' });
    const snapshot = buildStageSnapshot(db, { now: new Date(NOW) });

    assert.deepEqual(
      snapshot.nodes.map((n) => [n.alias, n.label, n.display?.github_username ?? null]),
      [['Thread-0A01', '@alice', 'alice'], ['Thread-0B02', 'Thread-0B02', null]],
    );
    const json = JSON.stringify(snapshot);
    assert.doesNotMatch(json, /alice@example\.com/);
    assert.doesNotMatch(json, /bob/);
    assert.doesNotMatch(json, /carol|Thread-0C03/, 'withdrawn participants disappear');
    assert.ok(!json.includes(a), 'participant ids are not exposed');
    assert.deepEqual(snapshot.kpis, { live_builders: 2, seed_builders: 0, profiles_ready: 1, matches: 0, one_sided: 0, golden_threads: 0 });
    assert.equal(snapshot.generated_at, '2026-11-07T19:00:00.000Z');
  });

  test('privacy mode replaces every consented handle with the pseudonym', (t) => {
    const db = freshDb(t);
    addParticipant(db, { alias: 'Thread-0A01', username: 'alice', consent: 1 });
    const snapshot = buildStageSnapshot(db, { privacyMode: true });
    assert.equal(snapshot.privacy_mode, true);
    assert.deepEqual(snapshot.nodes.map((n) => [n.label, n.display]), [['Thread-0A01', null]]);
    assert.doesNotMatch(JSON.stringify(snapshot), /alice/);
  });

  test('edges carry their introduction state, and a mutual match turns golden', (t) => {
    const db = freshDb(t);
    const a = addParticipant(db, { alias: 'Thread-0A01', username: 'alice' });
    const b = addParticipant(db, { alias: 'Thread-0B02', username: 'bob' });
    const c = addParticipant(db, { alias: 'Thread-0C03', username: 'carol' });
    const ab = addMatch(db, a, b, 90);
    addMatch(db, a, c, 70, 'proposed_by_a');
    addMatch(db, b, c, 60, 'declined');

    const before = buildStageSnapshot(db);
    assert.deepEqual(before.edges.map((e) => e.state).sort(), ['one_sided', 'suggested']);
    assert.equal(before.kpis.one_sided, 1);

    setIntroState(db, ab, 'completed');
    const after = buildStageSnapshot(db);
    const golden = after.edges.find((e) => e.match_id === ab);
    assert.equal(golden?.state, 'golden');
    assert.equal(after.kpis.golden_threads, 1);

    const fresh = findNewGoldenEdges(new Set(before.edges.filter((e) => e.state === 'golden').map((e) => e.match_id)), after.edges);
    assert.deepEqual(fresh.map((e) => e.match_id), [ab]);
    const nodes = new Map(after.nodes.map((n) => [n.alias, n]));
    const [first] = fresh;
    assert.ok(first);
    assert.match(
      goldenBannerText(first, nodes),
      /^⚡ NEW GOLDEN THREAD: (Thread-0A01 ↔ Thread-0B02|Thread-0B02 ↔ Thread-0A01)$/,
    );
    assert.deepEqual(findNewGoldenEdges(new Set([ab]), after.edges), [], 'an existing golden thread is not celebrated again');
  });

  test('edgeStateFor maps every introduction state and hides declined matches', () => {
    assert.equal(edgeStateFor('candidate'), 'suggested');
    assert.equal(edgeStateFor('proposed_by_a'), 'one_sided');
    assert.equal(edgeStateFor('proposed_by_b'), 'one_sided');
    assert.equal(edgeStateFor('mutual_accepted'), 'golden');
    assert.equal(edgeStateFor('completed'), 'golden');
    assert.equal(edgeStateFor('declined'), null);
  });
});

describe('top-3 edge cap', () => {
  test('no node keeps more than three edges, across a dense random graph', () => {
    const aliases = Array.from({ length: 30 }, (_, i) => `Thread-${String(i).padStart(4, '0')}`);
    let n = 0;
    let rng = 7;
    const rand = (): number => {
      rng = (rng * 1103515245 + 12345) % 2 ** 31;
      return rng / 2 ** 31;
    };
    const states: StageEdge['state'][] = ['suggested', 'one_sided', 'golden'];
    const edges: StageEdge[] = [];
    for (let i = 0; i < aliases.length; i++) {
      for (let j = i + 1; j < aliases.length; j++) {
        edges.push(edge(`m${n++}`, aliases[i] ?? '', aliases[j] ?? '', Math.floor(rand() * 100), states[Math.floor(rand() * 3)] ?? 'suggested'));
      }
    }
    const kept = capTopEdges(edges);
    const degree = new Map<string, number>();
    for (const e of kept) {
      degree.set(e.a, (degree.get(e.a) ?? 0) + 1);
      degree.set(e.b, (degree.get(e.b) ?? 0) + 1);
    }
    assert.ok(Math.max(...degree.values()) <= 3);
    assert.ok(kept.length >= 30, 'the cap still leaves a connected-looking web');
  });

  test('golden threads survive the cap ahead of higher-scoring suggestions', () => {
    const edges = [
      edge('s1', 'A', 'B', 99), edge('s2', 'A', 'C', 98), edge('s3', 'A', 'D', 97),
      edge('g1', 'A', 'E', 40, 'golden'),
    ];
    assert.deepEqual(capTopEdges(edges).map((e) => e.match_id), ['g1', 's1', 's2']);
  });

  test('the snapshot applies the cap to stored matches', (t) => {
    const db = freshDb(t);
    const hub = addParticipant(db, { alias: 'Thread-0A01', username: 'hub' });
    for (let i = 0; i < 6; i++) {
      const other = addParticipant(db, { alias: `Thread-1B0${i}`, username: `peer${i}` });
      addMatch(db, hub, other, 50 + i);
    }
    const snapshot = buildStageSnapshot(db);
    assert.equal(snapshot.kpis.matches, 6, 'KPIs count every match');
    assert.deepEqual(snapshot.edges.map((e) => e.score), [55, 54, 53], 'only the hub\'s top three are drawn');
  });
});

describe('presenter guard and join URL', () => {
  const fakeReq = (remoteAddress: string, headers: Record<string, string> = {}) =>
    ({ socket: { remoteAddress }, headers: { host: '127.0.0.1:3420', ...headers } }) as unknown as Parameters<typeof isPresenterRequest>[0];

  test('only direct loopback requests without proxy headers count as the presenter', () => {
    assert.equal(isPresenterRequest(fakeReq('127.0.0.1')), true);
    assert.equal(isPresenterRequest(fakeReq('::1')), true);
    assert.equal(isPresenterRequest(fakeReq('::ffff:127.0.0.1')), true);
    assert.equal(isPresenterRequest(fakeReq('127.0.0.1', { 'x-forwarded-for': '203.0.113.9' })), false);
    assert.equal(isPresenterRequest(fakeReq('127.0.0.1', { 'cf-connecting-ip': '203.0.113.9' })), false);
    assert.equal(isPresenterRequest(fakeReq('192.168.1.20')), false);
  });

  test('a DNS-rebinding page is not the presenter, even on a loopback socket without proxy headers', () => {
    for (const host of ['localhost', 'localhost:3420', '127.0.0.1:3420', '[::1]:3420', 'LOCALHOST:3420']) {
      assert.equal(isLoopbackHost(host), true, host);
      assert.equal(isPresenterRequest(fakeReq('127.0.0.1', { host })), true, host);
    }
    for (const host of ['evil.example:3420', 'evil.example', '127.0.0.1.evil.example', 'localhost.evil.example:3420',
      '[::2]:3420', 'cursatory.tail123678.ts.net', '']) {
      assert.equal(isPresenterRequest(fakeReq('127.0.0.1', { host })), false, host);
    }
    assert.equal(isLoopbackHost(undefined), false);
  });

  test('the join URL needs an https ARIADNE_PUBLIC_URL', () => {
    assert.equal(resolveJoinUrl({}), null);
    assert.equal(resolveJoinUrl({ ARIADNE_PUBLIC_URL: 'http://ariadne.example.com' }), null);
    assert.equal(resolveJoinUrl({ ARIADNE_PUBLIC_URL: 'not a url' }), null);
    assert.equal(resolveJoinUrl({ ARIADNE_PUBLIC_URL: 'https://ariadne.trycloudflare.com/' }), 'https://ariadne.trycloudflare.com/join');
  });
});

describe('QR encoder', () => {
  const fingerprint = (m: boolean[][]): string =>
    createHash('sha256').update(m.map((r) => r.map((c) => (c ? '1' : '0')).join('')).join('\n')).digest('hex');

  // Fingerprints of symbols that OpenCV's QR decoder read back as the input text.
  test('matches symbols verified with an independent decoder', () => {
    const v4 = encodeQr('https://ariadne-demo.trycloudflare.com/join');
    assert.equal(v4.length, 33);
    assert.equal(fingerprint(v4), '4921ac34b2286de9f0f354f305853c1a2a5983e0676863292ce3a792387bec0f');
    const v8 = encodeQr(`https://example.com/${'y'.repeat(120)}`);
    assert.equal(v8.length, 49, 'version 8 carries version information');
    assert.equal(fingerprint(v8), '0f05cd5fa11ecea15425854211741e4e10b77de83d7e0fc6768fa094f6c9c72d');
  });

  test('draws the three finder patterns and refuses text beyond version 10', () => {
    const m = encodeQr('https://a.co/join');
    const size = m.length;
    for (const [x, y] of [[0, 0], [size - 7, 0], [0, size - 7]] as const) {
      const ring = [0, 1, 2, 3, 4, 5, 6].map((i) => (m[y]?.[x + i] ? 1 : 0)).join('');
      assert.equal(ring, '1111111', `finder at ${x},${y}`);
      assert.equal(m[y + 3]?.[x + 3], true);
    }
    assert.throws(() => encodeQr('x'.repeat(300)), RangeError);
  });

  test('renders an SVG with a four-module quiet zone', () => {
    const svg = qrToSvg(encodeQr('https://a.co/join'));
    assert.match(svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 33 33"/);
    assert.match(svg, /M4 4h1v1h-1z/);
  });
});

describe('stage routes', () => {
  /**
   * Serve the repository routes and public files over a database.
   * @param db - Database.
   * @param run - Callback given the port.
   */
  async function withServer(db: DatabaseSync, run: (port: number) => Promise<void>): Promise<void> {
    const server = createServer({ db, routes: await loadRoutes(join(REPO_ROOT, 'src', 'routes')), publicDir: join(REPO_ROOT, 'public'), log: silent });
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    try {
      await run((server.address() as { port: number }).port);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((done) => server.close(() => done()));
    }
  }

  /**
   * Minimal HTTP client that can set arbitrary headers.
   * @param port - Server port.
   * @param method - HTTP method.
   * @param path - Request path.
   * @param options - Headers and body.
   * @returns Status, content type and body text.
   */
  function call(
    port: number,
    method: string,
    path: string,
    options: { headers?: Record<string, string>; body?: string } = {},
  ): Promise<{ status: number; type: string; body: string }> {
    return new Promise((done, fail) => {
      const req = request({ host: '127.0.0.1', port, method, path, headers: options.headers }, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (c: string) => (body += c));
        res.on('end', () => done({ status: res.statusCode ?? 0, type: String(res.headers['content-type'] ?? ''), body }));
      });
      req.on('error', fail);
      req.end(options.body);
    });
  }

  test('snapshot, seed toggle and presenter guard work over HTTP', async (t) => {
    const db = freshDb(t);
    addParticipant(db, { alias: 'Thread-0A01', username: 'alice', consent: 1 });
    await withServer(db, async (port) => {
      const snap = await call(port, 'GET', '/api/stage/snapshot');
      assert.equal(snap.status, 200);
      const body = JSON.parse(snap.body);
      assert.equal(body.presenter, true);
      assert.equal(body.nodes[0].label, '@alice');

      const priv = JSON.parse((await call(port, 'GET', '/api/stage/snapshot?privacy=1')).body);
      assert.equal(priv.nodes[0].label, 'Thread-0A01');

      const tunnelled = await call(port, 'GET', '/api/stage/snapshot', { headers: { 'x-forwarded-for': '203.0.113.9' } });
      assert.equal(JSON.parse(tunnelled.body).presenter, false);

      const json = { 'content-type': 'application/json' };
      const denied = await call(port, 'POST', '/api/stage/seed-toggle', { headers: { ...json, 'x-forwarded-for': '203.0.113.9' }, body: '{}' });
      assert.equal(denied.status, 403);
      assert.equal(buildStageSnapshot(db).kpis.seed_builders, 0, 'a tunnelled request changes nothing');

      const flipOn = await call(port, 'POST', '/api/stage/seed-toggle', { headers: json, body: '' });
      assert.equal(flipOn.status, 200);
      assert.equal(JSON.parse(flipOn.body).seed_mode, true, 'an empty body flips the mode');
      const off = await call(port, 'POST', '/api/stage/seed-toggle', { headers: json, body: '{"enabled":false}' });
      assert.equal(JSON.parse(off.body).seed_count, 0);

      assert.equal((await call(port, 'POST', '/api/stage/seed-toggle', { headers: json, body: '{"enabled":"yes"}' })).status, 400);
      assert.equal((await call(port, 'POST', '/api/stage/seed-toggle', { headers: json, body: '{oops' })).status, 400);
      for (const body of ['null', '[]', '"on"', '7']) {
        assert.equal((await call(port, 'POST', '/api/stage/seed-toggle', { headers: json, body })).status, 400, body);
      }
      assert.equal(buildStageSnapshot(db).kpis.seed_builders, 0, 'rejected bodies change nothing');
    });
  });

  test('the seed toggle refuses cross-site requests from a page in the presenter\'s browser', async (t) => {
    const db = freshDb(t);
    await withServer(db, async (port) => {
      const self = `http://127.0.0.1:${port}`;
      const post = (headers: Record<string, string>, body = '{"enabled":true}') => call(port, 'POST', '/api/stage/seed-toggle', { headers, body });
      const seeds = (): number => buildStageSnapshot(db).kpis.seed_builders;

      // A cross-site "simple request" (no preflight) can only carry these content types.
      for (const type of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x']) {
        const res = await post({ 'content-type': type, origin: 'https://evil.example' });
        assert.equal(res.status, 415, type);
      }
      assert.equal((await post({})).status, 415, 'no content type');

      const foreign = await post({ 'content-type': 'application/json', origin: 'https://evil.example' });
      assert.equal(foreign.status, 403);
      assert.equal(JSON.parse(foreign.body).reason, 'foreign_origin');
      assert.equal((await post({ 'content-type': 'application/json', origin: 'null' })).status, 403, 'opaque origin');
      for (const site of ['cross-site', 'same-site']) {
        const res = await post({ 'content-type': 'application/json', 'sec-fetch-site': site });
        assert.equal(res.status, 403, site);
        assert.equal(JSON.parse(res.body).reason, 'cross_site_fetch', site);
      }
      assert.equal(seeds(), 0, 'no refused request changed the pool');

      const stagePage = await post({ 'content-type': 'application/json; charset=utf-8', origin: self, 'sec-fetch-site': 'same-origin' });
      assert.equal(stagePage.status, 200, 'the stage page itself is allowed');
      assert.equal(seeds(), 25);
      const rebound = `http://evil.example:${port}`;
      const rebinding = await post({ 'content-type': 'application/json', host: `evil.example:${port}`, origin: rebound, 'sec-fetch-site': 'same-origin' }, '{"enabled":false}');
      assert.equal(rebinding.status, 403, 'a DNS-rebinding page passes every same-origin check but not the Host check');
      assert.equal(JSON.parse(rebinding.body).error, 'presenter_only');
      assert.equal(seeds(), 25);
      const reboundSnapshot = await call(port, 'GET', '/api/stage/snapshot', { headers: { host: `evil.example:${port}` } });
      assert.equal(JSON.parse(reboundSnapshot.body).presenter, false);

      const curl = await post({ 'content-type': 'application/json', 'sec-fetch-site': 'none' }, '{"enabled":false}');
      assert.equal(curl.status, 200, 'a direct request from the host (no Origin) is allowed');
      assert.equal(seeds(), 0);
    });
  });

  test('the join QR is served only once the public URL is configured', async (t) => {
    const db = freshDb(t);
    const saved = process.env.ARIADNE_PUBLIC_URL;
    t.after(() => {
      if (saved === undefined) delete process.env.ARIADNE_PUBLIC_URL;
      else process.env.ARIADNE_PUBLIC_URL = saved;
    });
    await withServer(db, async (port) => {
      delete process.env.ARIADNE_PUBLIC_URL;
      const missing = await call(port, 'GET', '/api/stage/join-qr.svg');
      assert.equal(missing.status, 404);
      assert.equal(JSON.parse(missing.body).error, 'join_url_not_configured');

      process.env.ARIADNE_PUBLIC_URL = 'https://ariadne-demo.trycloudflare.com';
      const qr = await call(port, 'GET', '/api/stage/join-qr.svg');
      assert.equal(qr.status, 200);
      assert.equal(qr.type, 'image/svg+xml');
      assert.equal(qr.body, qrToSvg(encodeQr('https://ariadne-demo.trycloudflare.com/join')));
      assert.equal(JSON.parse((await call(port, 'GET', '/api/stage/snapshot')).body).join_url, 'https://ariadne-demo.trycloudflare.com/join');
    });
  });

  test('/stage/ serves the 16:9 shell with all four views, controls, the QR badge and the watermark', async (t) => {
    const db = freshDb(t);
    await withServer(db, async (port) => {
      assert.equal((await call(port, 'GET', '/stage')).status, 301);
      const page = await call(port, 'GET', '/stage/');
      assert.equal(page.status, 200);
      for (const text of ['1: Under-the-Hood Pipeline', '2: Builder Fingerprints', '3: Web of Connections', '4: Match Spotlight',
        '⚡ SCAN TO JOIN — REQUIRES GITHUB PROFILE', 'Builders Scanned In', '🌱 Seed AI Devs: OFF', 'class="tc-bg-watermark"']) {
        assert.ok(page.body.includes(text), text);
      }
      assert.equal((await call(port, 'GET', '/stage/network-graph.js')).type, 'text/javascript; charset=utf-8');
      assert.equal((await call(port, 'GET', '/stage/stage.css')).status, 200);
    });
  });
});

describe('network graph helpers', () => {
  const nodes = ['Thread-0A01', 'Thread-0B02', 'Thread-0C03', 'Seed-0001'].map((alias) => ({ alias }));
  const edges = [{ a: 'Thread-0A01', b: 'Thread-0B02' }, { a: 'Thread-0B02', b: 'Seed-0001' }];

  test('layout is deterministic and stays inside the padded canvas', () => {
    const opts = { width: 1000, height: 600, padding: 50 };
    const first = layoutGraph(nodes, edges, opts);
    const second = layoutGraph(nodes, edges, opts);
    assert.deepEqual([...first.entries()], [...second.entries()]);
    for (const { x, y } of first.values()) {
      assert.ok(x >= 50 && x <= 950 && y >= 50 && y <= 550, `${x},${y}`);
    }
  });

  test('a refresh starts from the previous layout instead of reshuffling', () => {
    const opts = { width: 1000, height: 600, padding: 50 };
    const first = layoutGraph(nodes, edges, opts);
    const nudged = layoutGraph([...nodes, { alias: 'Thread-0D04' }], edges, { ...opts, previous: first, iterations: 10 });
    for (const [alias, p] of first) {
      const q = nudged.get(alias);
      assert.ok(q && Math.hypot(p.x - q.x, p.y - q.y) < 200, alias);
    }
  });

  test('edge styling and paths', () => {
    assert.equal(edgeClass('golden'), 'edge edge-golden');
    assert.equal(edgeClass('one_sided'), 'edge edge-one-sided');
    assert.equal(edgeClass('suggested'), 'edge edge-suggested');
    assert.match(edgePath({ x: 0, y: 0 }, { x: 10, y: 0 }, false), /^M0\.0 0\.0L10\.0 0\.0$/);
    assert.match(edgePath({ x: 0, y: 0 }, { x: 10, y: 0 }, true), /^M0\.0 0\.0Q5\.0 2\.2 10\.0 0\.0$/);
  });
});

test('stageSafeEvent fills identities from current stage displays and removes everyone else\'s', () => {
  const display = { github_username: 'alice', avatar_url: 'https://avatars.githubusercontent.com/u/1?v=4' };
  const displays = new Map([['Thread-0A01', display], ['Thread-0C03', null]]);
  const pair = {
    seq_id: 1,
    event_id: randomUUID(),
    type: 'introduction.completed' as const,
    occurred_at: NOW,
    payload: {
      match_id: randomUUID(),
      display_alias_a: 'Thread-0A01',
      display_alias_b: 'Thread-0B02',
      display_b: { stage_display_consent: true as const, github_username: 'bob', avatar_url: null },
      channel: 'web' as const,
    },
  };
  const safe = stageSafeEvent(pair, displays).payload as Record<string, unknown>;
  assert.deepEqual(safe.display_a, { stage_display_consent: true, ...display }, 'added from the stage, though the event had none');
  assert.equal('display_b' in safe, false, 'an identity the stage does not show is removed');
  assert.ok(!('display_a' in pair.payload), 'the stored event is not modified');

  const single = { seq_id: 2, event_id: randomUUID(), type: 'participant.registered' as const, occurred_at: NOW, payload: { display_alias: 'Thread-0C03' } };
  assert.equal('display' in stageSafeEvent(single, displays).payload, false, 'a node without a display stays pseudonymous');
});

test('/stage/ opens on View 1 and carries a floating QR outside the views', () => {
  const html = readFileSync(join(REPO_ROOT, 'public', 'stage', 'index.html'), 'utf8');
  assert.match(html, /const state = \{\n  view: '1',/);
  assert.match(html, /<button type="button" id="qr-float-toggle" data-action="qr:floating" aria-pressed="false">📌 Floating QR<kbd>A<\/kbd><\/button>/);
  const panel = html.indexOf('<aside id="qr-floating"');
  assert.ok(panel > html.indexOf('</main>'), 'the floating QR sits outside every view, so it persists across them');
  for (const id of ['id="qr-float-handle"', 'id="qr-float-frame"', 'id="qr-float-url"', 'id="qr-float-count"', 'Drag to move']) {
    assert.ok(html.includes(id), id);
  }
  assert.ok(html.includes("else if (action === 'qr:floating') toggleFloatingQr();"));
  assert.ok(html.includes('(event.clientX - drag.x) / state.scale'), 'dragging divides by the stage scale');
  assert.ok(html.includes('<div id="qr-modal" hidden>'), 'the Q overlay is unchanged');
});

// Key-to-action mapping is tested in tests/stage-modes.test.ts; this checks the page wires it up.
test('the stage page keeps every hotkey wired', () => {
  const html = readFileSync(join(REPO_ROOT, 'public', 'stage', 'index.html'), 'utf8');
  assert.ok(html.includes('bindControls(document, () => state.view, dispatch)'));
  for (const action of ["action === 'qr'", "action === 'seed'", "action === 'privacy'", "action === 'cycle'", "action.startsWith('view:')"]) {
    assert.ok(html.includes(action), action);
  }
});

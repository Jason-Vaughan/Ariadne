import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { DatabaseSync } from 'node:sqlite';
import { clearGithubRateLimit, recordGithubRateLimit } from '../src/routes/health.ts';
import {
  backupDatabase,
  checkDatabaseHealth,
  checkSchemaReadiness,
  countQueuedJobs,
  DEFAULT_DB_PATH,
  openDatabase,
  REQUIRED_TABLES,
  resolveDbPath,
  resolveSchemaPath,
} from '../src/db/client.ts';
import type { Logger, RouteDefinition, RunningServer, StaticAlias } from '../src/server.ts';
import {
  assertSafeBind,
  createServer,
  DEFAULT_STATIC_ALIASES,
  loadRoutes,
  matchRoute,
  resolveAliasedFile,
  resolveStaticFile,
  startServer,
} from '../src/server.ts';

const REPO_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const silent: Logger = { info() {} };

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

const QUEUE_SCHEMA = `CREATE TABLE IF NOT EXISTS async_jobs (id TEXT PRIMARY KEY, status TEXT NOT NULL);`;
const FULL_SCHEMA = REQUIRED_TABLES.map((name) =>
  name === 'async_jobs' ? QUEUE_SCHEMA : `CREATE TABLE IF NOT EXISTS ${name} (id TEXT PRIMARY KEY);`,
).join('\n');

/**
 * Serves the repository routes over a given database on an ephemeral loopback port.
 * @param db - Database handle the routes receive.
 * @param run - Callback given the base URL while the server is up.
 */
async function withRepoRoutes(db: DatabaseSync, run: (base: string) => Promise<void>): Promise<void> {
  const server = createServer({ db, routes: await loadRoutes(join(REPO_ROOT, 'src', 'routes')), publicDir: null, log: silent });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  try {
    await run(`http://127.0.0.1:${(server.address() as { port: number }).port}`);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
  }
}

describe('github rate-limit recorder', () => {
  test('ignores absent or malformed headers and keeps the last good snapshot', () => {
    try {
      assert.equal(recordGithubRateLimit({ remaining: null, limit: '5000', reset: '1' }), null);
      assert.equal(recordGithubRateLimit({ remaining: 'abc', limit: '5000', reset: '1' }), null);
      assert.equal(recordGithubRateLimit({ remaining: '-1', limit: '5000', reset: '1' }), null);
      assert.equal(recordGithubRateLimit({ remaining: ' ', limit: '5000', reset: '1' }), null);
      assert.deepEqual(recordGithubRateLimit({ remaining: 7, limit: 60, reset: 0 }, new Date(0)), {
        remaining: 7,
        limit: 60,
        resetAt: '1970-01-01T00:00:00.000Z',
        observedAt: '1970-01-01T00:00:00.000Z',
      });
      assert.equal(recordGithubRateLimit({ remaining: 'x', limit: 'y', reset: 'z' }), null);
    } finally {
      clearGithubRateLimit();
    }
  });
});

describe('db client', () => {
  test('opens in WAL mode with a 5s busy timeout and creates the parent directory', () => {
    const dir = scratchDir('db');
    const { db, path } = openDatabase({ path: 'nested/data/ariadne.db', cwd: dir, schemaPath: null });
    try {
      assert.equal(path, join(dir, 'nested/data/ariadne.db'));
      assert.deepEqual(checkDatabaseHealth(db), { ok: true, journalMode: 'wal', busyTimeoutMs: 5000 });
    } finally {
      db.close();
    }
  });

  test('data persists across close and reopen', () => {
    const dir = scratchDir('persist');
    const first = openDatabase({ path: 'a.db', cwd: dir, schemaPath: null });
    first.db.exec("CREATE TABLE notes (body TEXT); INSERT INTO notes VALUES ('kept');");
    first.db.close();
    const second = openDatabase({ path: 'a.db', cwd: dir, schemaPath: null });
    try {
      assert.deepEqual({ ...second.db.prepare('SELECT body FROM notes').get() }, { body: 'kept' });
    } finally {
      second.db.close();
    }
  });

  test('applies an idempotent schema file on every open', () => {
    const dir = scratchDir('schema');
    writeFileSync(join(dir, 'schema.sql'), QUEUE_SCHEMA);
    const first = openDatabase({ path: 'x.db', cwd: dir, schemaPath: 'schema.sql' });
    assert.equal(first.schemaApplied, true);
    first.db.close();
    const second = openDatabase({ path: 'x.db', cwd: dir, schemaPath: 'schema.sql' });
    assert.equal(second.schemaApplied, true);
    second.db.close();
  });

  test('a missing schema file is skipped, not an error', () => {
    const dir = scratchDir('noschema');
    const { db, schemaApplied } = openDatabase({ path: 'x.db', cwd: dir, schemaPath: 'absent.sql' });
    db.close();
    assert.equal(schemaApplied, false);
  });

  test('refuses an in-memory database because it cannot run in WAL mode', () => {
    const dir = scratchDir('memory');
    assert.throws(() => openDatabase({ path: ':memory:', cwd: dir, schemaPath: null }), /WAL/);
    assert.equal(existsSync(join(dir, ':memory:')), false, 'must not create a file named :memory:');
  });

  test('queue depth counts only queued jobs and is null before the table exists', () => {
    const dir = scratchDir('queue');
    const { db } = openDatabase({ path: 'q.db', cwd: dir, schemaPath: null });
    try {
      assert.equal(countQueuedJobs(db), null);
      db.exec(QUEUE_SCHEMA);
      db.exec("INSERT INTO async_jobs VALUES ('1','queued'),('2','queued'),('3','running'),('4','done');");
      assert.equal(countQueuedJobs(db), 2);
    } finally {
      db.close();
    }
  });

  test('schema readiness names every missing required table', () => {
    const dir = scratchDir('readiness');
    const { db } = openDatabase({ path: 'r.db', cwd: dir, schemaPath: null });
    try {
      assert.deepEqual(checkSchemaReadiness(db), { ready: false, missingTables: [...REQUIRED_TABLES] });
      db.exec(QUEUE_SCHEMA);
      assert.deepEqual(checkSchemaReadiness(db).missingTables, REQUIRED_TABLES.filter((t) => t !== 'async_jobs'));
      db.exec(FULL_SCHEMA);
      assert.deepEqual(checkSchemaReadiness(db), { ready: true, missingTables: [] });
    } finally {
      db.close();
    }
  });

  test('backupDatabase writes a readable copy and a checksum that shasum verifies', () => {
    const dir = scratchDir('backup');
    const { db } = openDatabase({ path: 'live.db', cwd: dir, schemaPath: null });
    try {
      db.exec("CREATE TABLE notes (body TEXT); INSERT INTO notes VALUES ('snapshot me');");
      const result = backupDatabase(db, join(dir, 'backups', 'b1.db'));
      assert.equal(result.path, join(dir, 'backups', 'b1.db'));
      assert.equal(result.sha256, createHash('sha256').update(readFileSync(result.path)).digest('hex'));
      assert.equal(readFileSync(result.checksumPath, 'utf8'), `${result.sha256}  b1.db\n`);
      const check = spawnSync('shasum', ['-a', '256', '-c', 'b1.db.sha256'], { cwd: join(dir, 'backups'), encoding: 'utf8' });
      assert.equal(check.status, 0, check.stdout + check.stderr);

      const copy = openDatabase({ path: result.path, schemaPath: null });
      try {
        assert.deepEqual({ ...copy.db.prepare('SELECT body FROM notes').get() }, { body: 'snapshot me' });
      } finally {
        copy.db.close();
      }
      assert.throws(() => backupDatabase(db, result.path), /already exists/);
    } finally {
      db.close();
    }
  });

  test('database path comes from ARIADNE_DB_PATH, else the default', () => {
    assert.equal(resolveDbPath({ ARIADNE_DB_PATH: '/tmp/x.db' }), '/tmp/x.db');
    assert.equal(resolveDbPath({ ARIADNE_DB_PATH: '  ' }), DEFAULT_DB_PATH);
    assert.equal(resolveDbPath({}), 'data/ariadne.db');
    assert.equal(resolveSchemaPath({ ARIADNE_SCHEMA_PATH: '/tmp/s.sql' }), '/tmp/s.sql');
    assert.equal(resolveSchemaPath({}), 'src/db/schema.sql');
  });
});

describe('bind guard', () => {
  test('accepts loopback on the Ariadne port', () => {
    assert.doesNotThrow(() => assertSafeBind('127.0.0.1', 3420));
  });

  test('refuses non-loopback hosts', () => {
    for (const host of ['0.0.0.0', '::', 'localhost.evil', '192.168.1.5']) {
      assert.throws(() => assertSafeBind(host, 3420), /loopback/);
    }
  });

  test('refuses TangleClaw and Medusa control-plane ports', () => {
    for (const port of [3100, 3102, 8443, 3009, 3010]) {
      assert.throws(() => assertSafeBind('127.0.0.1', port), /control plane/);
    }
  });
});

describe('route loader', () => {
  test('mounts every route module, ignoring test and declaration files', async () => {
    const dir = scratchDir('routes');
    writeFileSync(join(dir, 'a.ts'), "export const routes = [{ method: 'GET', path: '/a', handler() {} }];");
    writeFileSync(join(dir, 'b.ts'), "export default [{ method: 'POST', path: '/b/:id', handler() {} }];");
    writeFileSync(join(dir, 'a.test.ts'), 'throw new Error("must not be imported");');
    writeFileSync(join(dir, 'types.d.ts'), 'export {};');
    const routes = await loadRoutes(dir);
    assert.deepEqual(routes.map((r) => `${r.method} ${r.path}`), ['GET /a', 'POST /b/:id']);
  });

  test('a missing routes directory yields no routes', async () => {
    assert.deepEqual(await loadRoutes(join(scratchDir('empty'), 'nope')), []);
  });

  test('fails loudly when two modules claim the same method and path', async () => {
    const dir = scratchDir('dupe');
    writeFileSync(join(dir, 'one.ts'), "export const routes = [{ method: 'GET', path: '/x', handler() {} }];");
    writeFileSync(join(dir, 'two.ts'), "export const routes = [{ method: 'GET', path: '/x', handler() {} }];");
    await assert.rejects(loadRoutes(dir), /Duplicate route GET \/x in two\.ts \(already defined in one\.ts\)/);
  });

  test('rejects a module without a route array or with a malformed route', async () => {
    const noArray = scratchDir('noarray');
    writeFileSync(join(noArray, 'bad.ts'), 'export const handler = () => {};');
    await assert.rejects(loadRoutes(noArray), /must export "routes"/);

    const malformed = scratchDir('malformed');
    writeFileSync(join(malformed, 'bad.ts'), "export const routes = [{ method: 'FETCH', path: '/x', handler() {} }];");
    await assert.rejects(loadRoutes(malformed), /malformed route/);
  });

  test('the repository routes directory mounts GET /api/health', async () => {
    const routes = await loadRoutes(join(REPO_ROOT, 'src', 'routes'));
    assert.ok(routes.some((r) => r.method === 'GET' && r.path === '/api/health'));
  });

  test('path params capture decoded segments and lengths must match', () => {
    const routes: RouteDefinition[] = [{ method: 'GET', path: '/api/matches/:id', handler() {} }];
    assert.deepEqual(matchRoute(routes, 'GET', '/api/matches/a%20b')?.params, { id: 'a b' });
    assert.equal(matchRoute(routes, 'GET', '/api/matches'), null);
    assert.equal(matchRoute(routes, 'GET', '/api/matches/1/extra'), null);
    assert.equal(matchRoute(routes, 'POST', '/api/matches/1'), null);
    assert.equal(matchRoute(routes, 'GET', '/api/matches/%E0%A4%A'), null);
  });
});

describe('static files', () => {
  test('serves files and directory index pages but never escapes the public directory', () => {
    const root = scratchDir('public');
    const pub = join(root, 'public');
    mkdirSync(join(pub, 'stage'), { recursive: true });
    writeFileSync(join(pub, 'stage', 'index.html'), '<h1>stage</h1>');
    writeFileSync(join(root, 'secret.txt'), 'nope');
    assert.equal(resolveStaticFile(pub, '/stage'), join(pub, 'stage', 'index.html'));
    assert.equal(resolveStaticFile(pub, '/stage/'), join(pub, 'stage', 'index.html'));
    assert.equal(resolveStaticFile(pub, '/../secret.txt'), null);
    assert.equal(resolveStaticFile(pub, '/%2e%2e/secret.txt'), null);
    assert.equal(resolveStaticFile(pub, '/stage/%00'), null);
    assert.equal(resolveStaticFile(pub, '/missing.js'), null);
  });
});

describe('static aliases and report publication', () => {
  test('a file alias serves exactly one URL and nothing near it', () => {
    const root = scratchDir('alias');
    writeFileSync(join(root, 'logo.png'), 'PNG');
    const aliases: StaticAlias[] = [{ path: '/tangleclaw-logo.png', file: join(root, 'logo.png') }];
    assert.equal(resolveAliasedFile(aliases, '/tangleclaw-logo.png'), join(root, 'logo.png'));
    for (const path of ['/tangleclaw-logo.png/', '/TANGLECLAW-LOGO.PNG', '/x/tangleclaw-logo.png', '/logo.png']) {
      assert.equal(resolveAliasedFile(aliases, path), null, path);
    }
  });

  test('the default aliases expose only the logos, never sprint-reports/', () => {
    assert.deepEqual(DEFAULT_STATIC_ALIASES.map((a) => a.path), ['/tangleclaw-logo.png', '/ariadne-logo.png']);
    assert.equal(
      resolveAliasedFile(DEFAULT_STATIC_ALIASES, '/tangleclaw-logo.png'),
      join(REPO_ROOT, 'roadmap-board', 'tangleclaw-logo.png'),
    );
    assert.equal(
      resolveAliasedFile(DEFAULT_STATIC_ALIASES, '/ariadne-logo.png'),
      join(REPO_ROOT, 'roadmap-board', 'ariadne-logo.png'),
    );
    for (const path of ['/reports/v0.1.0/', '/reports/v0.1.0/index.html', '/reports/scripts/sync-live-sprint.py']) {
      assert.equal(resolveAliasedFile(DEFAULT_STATIC_ALIASES, path), null, path);
    }
  });

  test('the committed draft report is unreachable over HTTP, whatever tags exist', async () => {
    // Serving involves no git lookup at all, so neither a local nor a pushed v0.1.0 tag can change this.
    const draft = join(REPO_ROOT, 'sprint-reports', 'v0.1.0', 'index.html');
    assert.ok(existsSync(draft), 'fixture precondition: the pre-staged v0.1.0 draft is committed');
    const { db } = openDatabase({ path: 'd.db', cwd: scratchDir('draft'), schemaPath: null });
    const server = createServer({ db, routes: [], publicDir: scratchDir('draft-pub'), log: silent });
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    try {
      for (const path of ['/reports/v0.1.0/', '/reports/v0.1.0', '/reports/v0.1.0/index.html', '/sprint-reports/v0.1.0/']) {
        assert.equal((await fetch(`${base}${path}`, { redirect: 'manual' })).status, 404, path);
      }
    } finally {
      server.closeAllConnections();
      await new Promise<void>((done) => server.close(() => done()));
      db.close();
    }
  });

  test('a report goes public only once published into public/reports/<version>/', async () => {
    const root = scratchDir('publish');
    const pub = join(root, 'public');
    mkdirSync(join(pub, 'reports'), { recursive: true });
    writeFileSync(join(pub, 'reports', 'index.html'), 'hub');
    const { db } = openDatabase({ path: 'p.db', cwd: root, schemaPath: null });
    const server = createServer({ db, routes: [], publicDir: pub, staticAliases: [], log: silent });
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    try {
      assert.equal(await (await fetch(`${base}/reports/`)).text(), 'hub');
      assert.equal((await fetch(`${base}/reports/v0.1.0/`)).status, 404);

      mkdirSync(join(pub, 'reports', 'v0.1.0'));
      writeFileSync(join(pub, 'reports', 'v0.1.0', 'index.html'), '<a href="../">hub</a>');
      const redirect = await fetch(`${base}/reports/v0.1.0?x=1`, { redirect: 'manual' });
      assert.equal(redirect.status, 301);
      assert.equal(redirect.headers.get('location'), '/reports/v0.1.0/?x=1');
      const report = await fetch(`${base}/reports/v0.1.0/`);
      assert.equal(report.status, 200);
      assert.equal(await report.text(), '<a href="../">hub</a>');
    } finally {
      server.closeAllConnections();
      await new Promise<void>((done) => server.close(() => done()));
      db.close();
    }
  });
});

describe('running server', () => {
  let running: RunningServer;
  let publicDir: string;
  let schemaFile: string;
  const logged: string[] = [];
  const savedToken = process.env.ARIADNE_GITHUB_TOKEN;

  before(async () => {
    process.env.ARIADNE_GITHUB_TOKEN = 'ghp_SECRET_VALUE_MUST_NOT_LEAK';
    const root = scratchDir('server');
    const routesDir = join(root, 'routes');
    publicDir = join(root, 'public');
    mkdirSync(routesDir);
    mkdirSync(join(publicDir, 'join'), { recursive: true });
    writeFileSync(join(publicDir, 'join', 'index.html'), '<h1>join</h1>');
    writeFileSync(
      join(routesDir, 'health.ts'),
      `export { routes } from ${JSON.stringify(join(REPO_ROOT, 'src', 'routes', 'health.ts'))};`,
    );
    writeFileSync(
      join(routesDir, 'probe.ts'),
      `export const routes = [
        { method: 'GET', path: '/api/echo/:name', handler(_q, res, ctx) {
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ name: ctx.params.name, q: ctx.url.searchParams.get('q') }));
        } },
        { method: 'GET', path: '/api/boom', async handler() { throw new Error('secret stack detail'); } },
      ];`,
    );
    schemaFile = join(root, 'schema.sql');
    writeFileSync(schemaFile, FULL_SCHEMA);
    running = await startServer({
      port: 0,
      dbPath: join(root, 'data', 'ariadne.db'),
      schemaPath: schemaFile,
      routesDir,
      publicDir,
      log: { info: (message, fields) => logged.push(`${message} ${JSON.stringify(fields ?? {})}`) },
    });
  });

  after(async () => {
    await running.close();
    if (savedToken === undefined) delete process.env.ARIADNE_GITHUB_TOKEN;
    else process.env.ARIADNE_GITHUB_TOKEN = savedToken;
  });

  test('listens on loopback only', () => {
    assert.match(running.url, /^http:\/\/127\.0\.0\.1:\d+$/);
  });

  test('GET /api/health is 200 ok once WAL and the full schema are in place', async () => {
    const response = await fetch(`${running.url}/api/health`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.status, 'ok');
    assert.deepEqual(body.database, { ok: true, journalMode: 'wal', busyTimeoutMs: 5000 });
    assert.deepEqual(body.schema, { ready: true, missingTables: [] });
    assert.equal(body.queue.depth, 0);
    assert.equal(body.schemaReady, true);
    assert.deepEqual(body.github, { tokenConfigured: true, rateLimitRemaining: null, rateLimit: null });
  });

  test('health reports the GitHub rate limit the connector last recorded', async () => {
    try {
      recordGithubRateLimit({ remaining: '4321', limit: '5000', reset: '1800000000' }, new Date('2026-11-07T19:00:00Z'));
      const body = await (await fetch(`${running.url}/api/health`)).json();
      assert.deepEqual(body.github, {
        tokenConfigured: true,
        rateLimitRemaining: 4321,
        rateLimit: { remaining: 4321, limit: 5000, resetAt: '2027-01-15T08:00:00.000Z', observedAt: '2026-11-07T19:00:00.000Z' },
      });
    } finally {
      clearGithubRateLimit();
    }
  });

  test('health is 503 not_ready on a WAL database whose schema is incomplete', async () => {
    const dir = scratchDir('partial');
    const { db } = openDatabase({ path: 'p.db', cwd: dir, schemaPath: null });
    db.exec(QUEUE_SCHEMA);
    try {
      await withRepoRoutes(db, async (base) => {
        const response = await fetch(`${base}/api/health`);
        assert.equal(response.status, 503);
        const body = await response.json();
        assert.equal(body.status, 'not_ready');
        assert.equal(body.schemaReady, false);
        assert.equal(body.database.ok, true);
        assert.deepEqual(body.schema.missingTables, REQUIRED_TABLES.filter((t) => t !== 'async_jobs'));
        assert.equal(body.queue.depth, 0);
      });
    } finally {
      db.close();
    }
  });

  test('health leaks no secret, path or TangleClaw/Medusa detail', async () => {
    const text = await (await fetch(`${running.url}/api/health`)).text();
    for (const forbidden of ['ghp_SECRET', 'TANGLECLAW', 'MEDUSA', '3102', '8443', 'ariadne.db', tmpdir()]) {
      assert.ok(!text.includes(forbidden), `health body must not contain ${forbidden}`);
    }
  });

  test('health returns 503 degraded once the database is unavailable', async () => {
    const dir = scratchDir('degraded');
    const { db } = openDatabase({ path: 'd.db', cwd: dir, schemaPath: null });
    db.close();
    await withRepoRoutes(db, async (base) => {
      const response = await fetch(`${base}/api/health`);
      assert.equal(response.status, 503);
      const body = await response.json();
      assert.equal(body.status, 'degraded');
      assert.deepEqual(body.database, { ok: false, journalMode: null, busyTimeoutMs: null, error: 'database unavailable' });
      assert.deepEqual(body.schema, { ready: false, missingTables: null });
      assert.equal(body.queue.depth, null);
    });
  });

  test('mounted routes receive path params and the parsed URL', async () => {
    const response = await fetch(`${running.url}/api/echo/ariadne?q=1`);
    assert.deepEqual(await response.json(), { name: 'ariadne', q: '1' });
  });

  test('a throwing handler yields a generic JSON 500 and logs the stack server-side', async () => {
    const response = await fetch(`${running.url}/api/boom`);
    assert.equal(response.status, 500);
    const text = await response.text();
    assert.deepEqual(JSON.parse(text), { error: 'internal_error' });
    assert.ok(!text.includes('secret stack detail'));
    assert.ok(logged.some((line) => line.includes('secret stack detail')));
  });

  test('serves public/ files with a content type, and HEAD has no body', async () => {
    const response = await fetch(`${running.url}/join`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /text\/html/);
    assert.equal(await response.text(), '<h1>join</h1>');
    const head = await fetch(`${running.url}/join`, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
  });

  test('unknown paths get a JSON 404', async () => {
    const response = await fetch(`${running.url}/api/nope`);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: 'not_found', path: '/api/nope' });
  });

  test('data written through the server survives a restart', async () => {
    running.db.exec("CREATE TABLE IF NOT EXISTS restart_probe (v TEXT); INSERT INTO restart_probe VALUES ('survived');");
    const dbPath = (running.db.prepare('PRAGMA database_list').get() as { file: string }).file;
    await running.close();
    running = await startServer({
      port: 0,
      dbPath,
      schemaPath: schemaFile,
      routesDir: join(REPO_ROOT, 'src', 'routes'),
      publicDir,
      log: silent,
    });
    assert.deepEqual({ ...running.db.prepare('SELECT v FROM restart_probe').get() }, { v: 'survived' });
    assert.equal((await fetch(`${running.url}/api/health`)).status, 200);
  });

  test('startServer refuses an unsafe bind before opening anything', async () => {
    await assert.rejects(startServer({ host: '0.0.0.0', port: 0, log: silent }), /loopback/);
    await assert.rejects(startServer({ port: 3102, log: silent }), /control plane/);
  });
});

describe('entry point', () => {
  /**
   * Starts `node src/server.ts` and resolves with the first logged JSON line.
   * @param env - Extra environment variables for the child.
   * @returns The child process and its first log record.
   */
  function launch(env: Record<string, string>): Promise<{ child: ChildProcess; first: Record<string, unknown> }> {
    const child = spawn(process.execPath, ['--no-warnings', join(REPO_ROOT, 'src', 'server.ts')], {
      env: { PATH: process.env.PATH ?? '/usr/bin:/bin', ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return new Promise((done, fail) => {
      let buffered = '';
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        fail(new Error('server entry point produced no log line within 5s'));
      }, 5000);
      child.stdout.on('data', (chunk: Buffer) => {
        buffered += chunk.toString();
        const newline = buffered.indexOf('\n');
        if (newline >= 0) {
          clearTimeout(timer);
          done({ child, first: JSON.parse(buffered.slice(0, newline)) });
        }
      });
    });
  }

  test('node src/server.ts with ARIADNE_SCHEMA_PATH applies that schema and reports ready', async () => {
    const dir = scratchDir('entry-schema');
    writeFileSync(join(dir, 'schema.sql'), FULL_SCHEMA);
    const { child, first } = await launch({
      ARIADNE_PORT: '0',
      ARIADNE_DB_PATH: join(dir, 'e.db'),
      ARIADNE_SCHEMA_PATH: join(dir, 'schema.sql'),
    });
    try {
      assert.equal(first.schemaApplied, true);
      assert.equal(first.schemaReady, true);
      assert.equal((await fetch(`${first.url}/api/health`)).status, 200);
    } finally {
      const exited = new Promise<number | null>((done) => child.once('exit', (code) => done(code)));
      child.kill('SIGTERM');
      assert.equal(await exited, 0);
    }
  });

  test('node src/server.ts boots without a schema, reports not_ready and shuts down on SIGTERM', async () => {
    const dir = scratchDir('entry');
    // Point at an absent schema explicitly so this stays true once src/db/schema.sql lands in the repo.
    const { child, first } = await launch({
      ARIADNE_PORT: '0',
      ARIADNE_DB_PATH: join(dir, 'e.db'),
      ARIADNE_SCHEMA_PATH: join(dir, 'absent-schema.sql'),
    });
    try {
      assert.equal(first.message, 'ariadne server listening');
      assert.equal(first.schemaReady, false);
      const response = await fetch(`${first.url}/api/health`);
      assert.equal(response.status, 503);
      const body = await response.json();
      assert.equal(body.status, 'not_ready');
      assert.deepEqual(body.schema.missingTables, [...REQUIRED_TABLES]);
    } finally {
      const exited = new Promise<number | null>((done) => child.once('exit', (code) => done(code)));
      child.kill('SIGTERM');
      assert.equal(await exited, 0);
    }
  });

  test('an unsafe ARIADNE_PORT makes the entry point exit 1', async () => {
    const { child, first } = await launch({ ARIADNE_PORT: '3102', ARIADNE_DB_PATH: join(scratchDir('bad'), 'b.db') });
    assert.equal(first.message, 'ariadne server failed to start');
    assert.equal(await new Promise((done) => child.once('exit', (code) => done(code))), 1);
  });
});

describe('tunnel script', () => {
  const script = join(REPO_ROOT, 'scripts', 'tunnel.sh');

  /**
   * Runs tunnel.sh with an explicit, minimal environment.
   * @param args - Script arguments.
   * @param env - Extra environment variables.
   * @returns The spawn result.
   */
  function runTunnel(args: string[], env: Record<string, string> = {}) {
    return spawnSync('bash', [script, ...args], { encoding: 'utf8', env: { PATH: '/usr/bin:/bin', HOME: tmpdir(), ...env } });
  }

  /**
   * Builds a bin directory with stub `curl` (exits with `$STUB_CURL_EXIT`, as `curl --fail` does on a 503)
   * and stub `cloudflared` (prints its arguments instead of opening a tunnel).
   * @returns The directory to put first on PATH.
   */
  function stubBin(): string {
    const bin = scratchDir('bin');
    writeFileSync(join(bin, 'curl'), '#!/bin/sh\necho "curl $*" >&2\nexit "${STUB_CURL_EXIT:-0}"\n', { mode: 0o755 });
    writeFileSync(join(bin, 'cloudflared'), '#!/bin/sh\necho "cloudflared-started $*"\n', { mode: 0o755 });
    return bin;
  }

  test('does not open the tunnel when /api/health is not 2xx (e.g. 503 not_ready)', () => {
    const bin = stubBin();
    const result = runTunnel([], { PATH: `${bin}:/usr/bin:/bin`, STUB_CURL_EXIT: '22' });
    assert.equal(result.status, 69);
    assert.match(result.stderr, /not ready at http:\/\/127\.0\.0\.1:3420\/api\/health/);
    assert.match(result.stderr, /curl --silent --fail .*http:\/\/127\.0\.0\.1:3420\/api\/health/);
    assert.ok(!result.stdout.includes('cloudflared-started'));
  });

  test('opens the tunnel to 127.0.0.1:3420 only after a 2xx health probe', () => {
    const bin = stubBin();
    const result = runTunnel([], { PATH: `${bin}:/usr/bin:/bin`, STUB_CURL_EXIT: '0' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^cloudflared-started tunnel --no-autoupdate --url http:\/\/127\.0\.0\.1:3420$/m);
  });

  test('--check targets only 127.0.0.1:3420 by default', () => {
    const result = runTunnel(['--check']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /target=http:\/\/127\.0\.0\.1:3420$/m);
  });

  test('refuses any port other than the Ariadne app and staging ports', () => {
    for (const port of ['3102', '8443', '3009', '80']) {
      const result = runTunnel(['--check'], { ARIADNE_PORT: port });
      assert.equal(result.status, 65, `port ${port} must be refused`);
    }
    assert.equal(runTunnel(['--check'], { ARIADNE_PORT: '3421' }).status, 0);
  });

  test('refuses unknown providers and arguments', () => {
    assert.equal(runTunnel(['--check'], { ARIADNE_TUNNEL: 'tailscale' }).status, 64);
    assert.equal(runTunnel(['--expose-all']).status, 64);
  });

  test('--backup DEST snapshots ARIADNE_DB_PATH and prints the digest as JSON', () => {
    const dir = scratchDir('tunnel-backup');
    const { db } = openDatabase({ path: 'live.db', cwd: dir, schemaPath: null });
    db.exec("CREATE TABLE notes (body TEXT); INSERT INTO notes VALUES ('kept');");
    db.close();
    const dest = join(dir, 'out', 'snap.db');
    const result = runTunnel(['--backup', dest], {
      PATH: `${dirname(process.execPath)}:/usr/bin:/bin`,
      ARIADNE_DB_PATH: join(dir, 'live.db'),
    });
    assert.equal(result.status, 0, result.stderr);
    const printed = JSON.parse(result.stdout);
    assert.equal(printed.path, dest);
    assert.equal(printed.sha256, createHash('sha256').update(readFileSync(dest)).digest('hex'));
    assert.ok(existsSync(`${dest}.sha256`));
  });

  test('--backup refuses to invent a database that does not exist', () => {
    const dir = scratchDir('tunnel-nobackup');
    const result = runTunnel(['--backup', join(dir, 'snap.db')], {
      PATH: `${dirname(process.execPath)}:/usr/bin:/bin`,
      ARIADNE_DB_PATH: join(dir, 'missing.db'),
    });
    assert.equal(result.status, 66);
    assert.equal(existsSync(join(dir, 'missing.db')), false);
    assert.equal(existsSync(join(dir, 'snap.db')), false);
  });
});

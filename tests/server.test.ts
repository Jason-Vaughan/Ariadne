import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkDatabaseHealth, countQueuedJobs, DEFAULT_DB_PATH, openDatabase, resolveDbPath } from '../src/db/client.ts';
import type { Logger, RouteDefinition, RunningServer } from '../src/server.ts';
import { assertSafeBind, createServer, loadRoutes, matchRoute, resolveStaticFile, startServer } from '../src/server.ts';

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

  test('database path comes from ARIADNE_DB_PATH, else the default', () => {
    assert.equal(resolveDbPath({ ARIADNE_DB_PATH: '/tmp/x.db' }), '/tmp/x.db');
    assert.equal(resolveDbPath({ ARIADNE_DB_PATH: '  ' }), DEFAULT_DB_PATH);
    assert.equal(resolveDbPath({}), 'data/ariadne.db');
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

describe('running server', () => {
  let running: RunningServer;
  let publicDir: string;
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
    running = await startServer({
      port: 0,
      dbPath: join(root, 'data', 'ariadne.db'),
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

  test('GET /api/health reports WAL readiness, queue depth and GitHub status', async () => {
    const response = await fetch(`${running.url}/api/health`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.status, 'ok');
    assert.deepEqual(body.database, { ok: true, journalMode: 'wal', busyTimeoutMs: 5000 });
    assert.equal(typeof body.queue.depth === 'number' || body.queue.depth === null, true);
    assert.deepEqual(body.github, { tokenConfigured: true, rateLimit: null });
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
    const server = createServer({ db, routes: await loadRoutes(join(REPO_ROOT, 'src', 'routes')), publicDir: null, log: silent });
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    try {
      const { port } = server.address() as { port: number };
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      assert.equal(response.status, 503);
      const body = await response.json();
      assert.equal(body.status, 'degraded');
      assert.deepEqual(body.database, { ok: false, journalMode: null, busyTimeoutMs: null, error: 'database unavailable' });
      assert.equal(body.queue.depth, null);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((done) => server.close(() => done()));
    }
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
    running = await startServer({ port: 0, dbPath, routesDir: join(REPO_ROOT, 'src', 'routes'), publicDir, log: silent });
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

  test('node src/server.ts boots, mounts the repository routes and shuts down on SIGTERM', async () => {
    const dir = scratchDir('entry');
    const { child, first } = await launch({ ARIADNE_PORT: '0', ARIADNE_DB_PATH: join(dir, 'e.db') });
    try {
      assert.equal(first.message, 'ariadne server listening');
      const response = await fetch(`${first.url}/api/health`);
      assert.equal(response.status, 200);
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
});

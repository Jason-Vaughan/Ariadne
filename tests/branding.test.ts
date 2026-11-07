import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from '../src/db/client.ts';
import { createServer, DEFAULT_STATIC_ALIASES, loadRoutes } from '../src/server.ts';
import type { Logger } from '../src/server.ts';

const REPO_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const silent: Logger = { info() {} };
const LOGO_PAGES = ['public/stage/index.html', 'public/app/join.html', 'public/app/me.html', 'public/app/intro-room.html'];

/**
 * Width and height from a PNG's IHDR chunk.
 * @param bytes - PNG file contents.
 * @returns Pixel dimensions.
 */
function pngSize(bytes: Buffer): { width: number; height: number } {
  assert.equal(bytes.subarray(1, 4).toString('latin1'), 'PNG', 'file is a PNG');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

test('the official logo ships as a web-sized PNG and is aliased at /ariadne-logo.png', () => {
  const alias = DEFAULT_STATIC_ALIASES.find((a) => a.path === '/ariadne-logo.png');
  assert.ok(alias, 'alias registered');
  const bytes = readFileSync(alias.file);
  assert.deepEqual(pngSize(bytes), { width: 900, height: 299 });
  assert.ok(bytes.length < 400_000, `logo stays light for venue Wi-Fi (${bytes.length} bytes)`);
});

test('every participant and stage page shows the logo, with a fallback to the hosted copy', () => {
  for (const page of LOGO_PAGES) {
    const html = readFileSync(join(REPO_ROOT, page), 'utf8');
    assert.match(html, /<img[^>]*src="\/ariadne-logo\.png"[^>]*alt="Ariadne"/, page);
    assert.ok(html.includes("https://raw.githubusercontent.com/Jason-Vaughan/project-assets/main/ariadne-logo.png"), page);
  }
});

test('the server serves the logo, and the admin panel allows only same-origin images', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'ariadne-brand-'));
  const { db } = openDatabase({ path: join(dir, 'b.db'), schemaPath: join(REPO_ROOT, 'src', 'db', 'schema.sql') });
  const server = createServer({ db, routes: await loadRoutes(join(REPO_ROOT, 'src', 'routes')), publicDir: join(REPO_ROOT, 'public'), log: silent });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  t.after(() => {
    server.closeAllConnections();
    server.close();
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const port = (server.address() as { port: number }).port;
  const get = (path: string): Promise<{ status: number; headers: Record<string, unknown>; body: Buffer }> =>
    new Promise((done, fail) => {
      request({ host: '127.0.0.1', port, path }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => done({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }));
      }).on('error', fail).end();
    });

  const logo = await get('/ariadne-logo.png');
  assert.equal(logo.status, 200);
  assert.equal(logo.headers['content-type'], 'image/png');
  assert.deepEqual(pngSize(logo.body), { width: 900, height: 299 });

  const admin = await get('/admin');
  assert.equal(admin.status, 200);
  assert.match(String(admin.headers['content-security-policy']), /(^|; )img-src 'self'(;|$)/);
  assert.match(String(admin.headers['content-security-policy']), /default-src 'none'/, 'everything else stays denied');
  assert.match(admin.body.toString('utf8'), /<img src="\/ariadne-logo\.png" alt="Ariadne"/);
});

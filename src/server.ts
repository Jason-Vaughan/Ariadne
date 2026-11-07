import { createServer as createHttpServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { checkSchemaReadiness, openDatabase } from './db/client.ts';

export const DEFAULT_HOST = '127.0.0.1';
export const DEFAULT_PORT = 3420;
/** TangleClaw control plane and Medusa ports; Ariadne must never bind or proxy them. */
export const FORBIDDEN_PORTS: readonly number[] = [3100, 3102, 8443, 3009, 3010];
const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1']);
const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

const REPO_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
export const DEFAULT_ROUTES_DIR = join(REPO_ROOT, 'src', 'routes');
export const DEFAULT_PUBLIC_DIR = join(REPO_ROOT, 'public');

/**
 * One exact URL served from one file outside `public/`, consulted only after `public/` misses.
 */
export interface StaticAlias {
  path: string;
  file: string;
}

// Sprint reports are deliberately NOT aliased from sprint-reports/: that directory holds pre-staged
// drafts that describe releases before they happen. A report becomes public only when the certifying
// publish step copies it into public/reports/<version>/, so no repository state (tags included) can
// expose a draft.
export const DEFAULT_STATIC_ALIASES: readonly StaticAlias[] = [
  { path: '/tangleclaw-logo.png', file: join(REPO_ROOT, 'roadmap-board', 'tangleclaw-logo.png') },
];

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface Logger {
  info(message: string, fields?: Record<string, unknown>): void;
}

export interface RouteContext {
  db: DatabaseSync;
  /** Values for `:name` segments in the route path. */
  params: Record<string, string>;
  url: URL;
  log: Logger;
  startedAt: number;
}

export type RouteHandler = (req: IncomingMessage, res: ServerResponse, ctx: RouteContext) => void | Promise<void>;

/**
 * One HTTP route. A module in `src/routes/` exports `routes: RouteDefinition[]`
 * (or a default-exported array); the server mounts every module it finds there.
 */
export interface RouteDefinition {
  method: HttpMethod;
  /** Absolute path; `:name` segments capture into `ctx.params`. */
  path: string;
  handler: RouteHandler;
}

export interface CreateServerOptions {
  db: DatabaseSync;
  routes: RouteDefinition[];
  publicDir?: string | null;
  staticAliases?: readonly StaticAlias[];
  log?: Logger;
}

export interface StartServerOptions {
  host?: string;
  port?: number;
  dbPath?: string;
  /** Schema file applied on open; defaults to `src/db/schema.sql`, `null` skips it. */
  schemaPath?: string | null;
  routesDir?: string;
  publicDir?: string | null;
  staticAliases?: readonly StaticAlias[];
  log?: Logger;
}

export interface RunningServer {
  server: Server;
  db: DatabaseSync;
  url: string;
  close(): Promise<void>;
}

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.woff2': 'font/woff2',
};

/**
 * Builds the info-level JSON-lines logger used outside tests.
 * @returns A logger writing one JSON object per line to stdout.
 */
export function createConsoleLogger(): Logger {
  return {
    info(message, fields = {}) {
      process.stdout.write(`${JSON.stringify({ level: 'info', time: new Date().toISOString(), message, ...fields })}\n`);
    },
  };
}

/**
 * Writes a JSON response.
 * @param res - The response to write.
 * @param status - HTTP status code.
 * @param body - Value serialized as the JSON body.
 */
export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
  });
  res.end(payload);
}

/**
 * Rejects any bind address other than loopback and any TangleClaw/Medusa control-plane port.
 * @param host - Requested bind host.
 * @param port - Requested bind port.
 * @throws If the host is not loopback or the port is forbidden or out of range.
 */
export function assertSafeBind(host: string, port: number): void {
  if (!LOOPBACK_HOSTS.has(host)) {
    throw new Error(`Ariadne binds to loopback only; refusing host "${host}"`);
  }
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid port "${port}"`);
  }
  if (FORBIDDEN_PORTS.includes(port)) {
    throw new Error(`Port ${port} belongs to the TangleClaw/Medusa control plane; refusing to bind`);
  }
}

/**
 * Checks one route module export and returns its routes.
 * @param exported - The module namespace imported from a route file.
 * @param file - File name, used in error messages.
 * @returns The validated route definitions.
 * @throws If the module exports no route array or a route is malformed.
 */
function readRouteModule(exported: Record<string, unknown>, file: string): RouteDefinition[] {
  const candidate = exported.routes ?? exported.default;
  if (!Array.isArray(candidate)) {
    throw new Error(`Route module ${file} must export "routes" (or a default export) as an array`);
  }
  for (const route of candidate as Partial<RouteDefinition>[]) {
    if (
      !route ||
      typeof route.method !== 'string' ||
      !HTTP_METHODS.has(route.method) ||
      typeof route.path !== 'string' ||
      !route.path.startsWith('/') ||
      typeof route.handler !== 'function'
    ) {
      throw new Error(`Route module ${file} has a malformed route: ${JSON.stringify({ method: route?.method, path: route?.path })}`);
    }
  }
  return candidate as RouteDefinition[];
}

/**
 * Imports every route module in a directory, in file-name order.
 * Skips test files and declaration files. Two routes with the same method and path fail loudly
 * rather than letting one lane's route silently shadow another's.
 * @param dir - Directory holding `*.ts` route modules.
 * @returns All routes from all modules.
 * @throws On a malformed module or a duplicate method + path.
 */
export async function loadRoutes(dir: string = DEFAULT_ROUTES_DIR): Promise<RouteDefinition[]> {
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir)
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.d.ts') && !name.endsWith('.test.ts'))
    .sort();

  const routes: RouteDefinition[] = [];
  const owners = new Map<string, string>();
  for (const file of files) {
    const exported = (await import(pathToFileURL(join(dir, file)).href)) as Record<string, unknown>;
    for (const route of readRouteModule(exported, file)) {
      const key = `${route.method} ${route.path}`;
      const owner = owners.get(key);
      if (owner) throw new Error(`Duplicate route ${key} in ${file} (already defined in ${owner})`);
      owners.set(key, file);
      routes.push(route);
    }
  }
  return routes;
}

/**
 * Finds the route for a method and path.
 * @param routes - Candidate routes.
 * @param method - Request method.
 * @param pathname - Decoded-later request path (no query string).
 * @returns The matching route and its captured params, or `null`.
 */
export function matchRoute(
  routes: RouteDefinition[],
  method: string,
  pathname: string,
): { route: RouteDefinition; params: Record<string, string> } | null {
  const requestSegments = pathname.split('/').filter(Boolean);
  for (const route of routes) {
    if (route.method !== method) continue;
    const routeSegments = route.path.split('/').filter(Boolean);
    if (routeSegments.length !== requestSegments.length) continue;
    const params: Record<string, string> = {};
    let matched = true;
    for (const [i, expected] of routeSegments.entries()) {
      const actual = requestSegments[i] ?? '';
      if (expected.startsWith(':')) {
        try {
          params[expected.slice(1)] = decodeURIComponent(actual);
        } catch {
          matched = false;
          break;
        }
      } else if (expected !== actual) {
        matched = false;
        break;
      }
    }
    if (matched) return { route, params };
  }
  return null;
}

/**
 * Resolves a request path to a file inside the public directory, refusing anything that escapes it.
 * `/stage` and `/stage/` both serve `public/stage/index.html`.
 * @param publicDir - Absolute public directory.
 * @param pathname - Raw request path.
 * @returns The absolute file path, or `null` when nothing servable exists.
 */
export function resolveStaticFile(publicDir: string, pathname: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const root = resolve(publicDir);
  let candidate = resolve(root, `.${decoded}`);
  if (candidate !== root && !candidate.startsWith(root + sep)) return null;
  if (existsSync(candidate) && statSync(candidate).isDirectory()) candidate = join(candidate, 'index.html');
  if (!existsSync(candidate) || !statSync(candidate).isFile()) return null;
  return candidate;
}

/**
 * Resolves a request path through the static aliases that back content outside `public/`.
 * @param aliases - Alias table, checked in order.
 * @param pathname - Raw request path.
 * @returns The absolute file path, or `null` when no alias serves it.
 */
export function resolveAliasedFile(aliases: readonly StaticAlias[], pathname: string): string | null {
  for (const alias of aliases) {
    if (pathname === alias.path && existsSync(alias.file) && statSync(alias.file).isFile()) return alias.file;
  }
  return null;
}

/**
 * Whether a resolved static file is a directory index reached without a trailing slash,
 * in which case relative links on the page would resolve against the parent directory.
 * @param file - Resolved file path.
 * @param pathname - Raw request path.
 * @returns True when the client should be redirected to `pathname + '/'`.
 */
function needsTrailingSlash(file: string, pathname: string): boolean {
  return (
    file.endsWith(`${sep}index.html`) &&
    !pathname.endsWith('/') &&
    !pathname.endsWith('index.html') &&
    pathname.startsWith('/') &&
    !pathname.startsWith('//') &&
    !pathname.includes('\\')
  );
}

/**
 * Creates the Ariadne HTTP server: API routes first, then `public/`, then static aliases, else a JSON 404.
 * A directory index reached without a trailing slash is redirected (301) so relative links resolve.
 * Handler errors become a generic JSON 500; stack traces are logged, never returned.
 * @param options - Database, routes, optional public directory and logger.
 * @returns An unstarted `http.Server`.
 */
export function createServer(options: CreateServerOptions): Server {
  const { db, routes } = options;
  const publicDir = options.publicDir === undefined ? DEFAULT_PUBLIC_DIR : options.publicDir;
  const staticAliases = options.staticAliases ?? DEFAULT_STATIC_ALIASES;
  const log = options.log ?? createConsoleLogger();
  const startedAt = Date.now();

  return createHttpServer(async (req, res) => {
    const method = req.method ?? 'GET';
    const url = new URL(req.url ?? '/', `http://${DEFAULT_HOST}`);
    try {
      const found = matchRoute(routes, method === 'HEAD' ? 'GET' : method, url.pathname);
      if (found) {
        await found.route.handler(req, res, { db, params: found.params, url, log, startedAt });
        return;
      }
      if (method === 'GET' || method === 'HEAD') {
        const file =
          (publicDir ? resolveStaticFile(publicDir, url.pathname) : null) ??
          resolveAliasedFile(staticAliases, url.pathname);
        if (file && needsTrailingSlash(file, url.pathname)) {
          res.writeHead(301, { location: `${url.pathname}/${url.search}` });
          res.end();
          return;
        }
        if (file) {
          const body = readFileSync(file);
          res.writeHead(200, {
            'content-type': CONTENT_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
            'content-length': body.length,
            'x-content-type-options': 'nosniff',
          });
          res.end(method === 'HEAD' ? undefined : body);
          return;
        }
      }
      sendJson(res, 404, { error: 'not_found', path: url.pathname });
    } catch (error) {
      log.info('request failed', {
        method,
        path: url.pathname,
        error: error instanceof Error ? error.stack ?? error.message : String(error),
      });
      if (!res.headersSent) sendJson(res, 500, { error: 'internal_error' });
      else res.end();
    }
  });
}

/**
 * Opens the database, mounts `src/routes/*.ts` and listens on loopback.
 * @param options - Host, port, paths and logger overrides; port defaults to `ARIADNE_PORT` or 3420.
 * @returns The running server with its URL and a `close()` that stops the server and closes the database.
 * @throws If the bind is unsafe, the database cannot enter WAL mode, or a route module is invalid.
 */
export async function startServer(options: StartServerOptions = {}): Promise<RunningServer> {
  const host = options.host ?? DEFAULT_HOST;
  const port = options.port ?? Number(process.env.ARIADNE_PORT ?? DEFAULT_PORT);
  assertSafeBind(host, port);
  const log = options.log ?? createConsoleLogger();

  const { db, path, schemaApplied } = openDatabase({ path: options.dbPath, schemaPath: options.schemaPath, cwd: REPO_ROOT });
  try {
    const routes = await loadRoutes(options.routesDir ?? DEFAULT_ROUTES_DIR);
    const server = createServer({ db, routes, publicDir: options.publicDir, staticAliases: options.staticAliases, log });
    await new Promise<void>((resolveListen, rejectListen) => {
      server.once('error', rejectListen);
      server.listen(port, host, () => {
        server.off('error', rejectListen);
        resolveListen();
      });
    });
    const address = server.address();
    const boundPort = typeof address === 'object' && address ? address.port : port;
    const url = `http://${host.includes(':') ? `[${host}]` : host}:${boundPort}`;
    const schema = checkSchemaReadiness(db);
    log.info('ariadne server listening', { url, routes: routes.length, schemaApplied, schemaReady: schema.ready, database: path });
    if (!schema.ready) {
      log.info('schema not ready: /api/health returns 503 until these tables exist', { missingTables: schema.missingTables });
    }

    return {
      server,
      db,
      url,
      close: () =>
        new Promise<void>((resolveClose) => {
          server.closeAllConnections();
          server.close(() => {
            db.close();
            resolveClose();
          });
        }),
    };
  } catch (error) {
    db.close();
    throw error;
  }
}

// No top-level await: route modules import helpers from this file, and awaiting here would leave
// this module unevaluated while loadRoutes() waits on those imports — a deadlock.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  startServer().then(
    (running) => {
      const shutdown = (signal: string): void => {
        createConsoleLogger().info('ariadne server stopping', { signal });
        void running.close().then(() => process.exit(0));
      };
      process.once('SIGINT', () => shutdown('SIGINT'));
      process.once('SIGTERM', () => shutdown('SIGTERM'));
    },
    (error: unknown) => {
      createConsoleLogger().info('ariadne server failed to start', {
        error: error instanceof Error ? error.message : String(error),
      });
      process.exit(1);
    },
  );
}

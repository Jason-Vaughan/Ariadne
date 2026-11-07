import type { RouteDefinition } from '../server.ts';
import { sendJson } from '../server.ts';
import { checkDatabaseHealth, checkSchemaReadiness, countQueuedJobs } from '../db/client.ts';
import type { SchemaReadiness } from '../db/client.ts';

export interface GithubRateLimit {
  remaining: number;
  limit: number;
  /** ISO8601 time the window resets (from `x-ratelimit-reset`). */
  resetAt: string;
  /** ISO8601 time the figures were observed. */
  observedAt: string;
}

export interface GithubStatus {
  tokenConfigured: boolean;
  rateLimitRemaining: number | null;
  rateLimit: GithubRateLimit | null;
}

let latestRateLimit: GithubRateLimit | null = null;

/**
 * Records the latest GitHub rate-limit headers so `/api/health` can report them.
 * The GitHub connector calls this after each API response; health never calls GitHub itself.
 * @param headers - `x-ratelimit-remaining`, `x-ratelimit-limit` and `x-ratelimit-reset` (epoch seconds).
 * @param now - Observation time; defaults to the current time.
 * @returns The stored snapshot, or `null` (and nothing stored) when the headers are absent or malformed.
 */
export function recordGithubRateLimit(
  headers: { remaining: string | number | null; limit: string | number | null; reset: string | number | null },
  now: Date = new Date(),
): GithubRateLimit | null {
  const raw = [headers.remaining, headers.limit, headers.reset];
  // Number('') is 0, so an empty header must count as absent rather than as an exhausted limit.
  if (raw.some((value) => value === null || (typeof value === 'string' && value.trim() === ''))) return null;
  const [remaining, limit, reset] = raw.map(Number) as [number, number, number];
  if (![remaining, limit, reset].every((n) => Number.isFinite(n) && n >= 0)) return null;
  latestRateLimit = {
    remaining,
    limit,
    resetAt: new Date(reset * 1000).toISOString(),
    observedAt: now.toISOString(),
  };
  return latestRateLimit;
}

/**
 * Clears the recorded rate limit.
 */
export function clearGithubRateLimit(): void {
  latestRateLimit = null;
}

/**
 * Reports whether a GitHub token is configured and the latest recorded rate-limit figures.
 * The token value itself never enters the response.
 * @param env - Environment to inspect.
 * @returns Token presence plus the last recorded rate limit, or nulls before any GitHub call.
 */
export function githubStatus(env: NodeJS.ProcessEnv = process.env): GithubStatus {
  return {
    tokenConfigured: Boolean(env.ARIADNE_GITHUB_TOKEN?.trim()),
    rateLimitRemaining: latestRateLimit?.remaining ?? null,
    rateLimit: latestRateLimit,
  };
}

export const routes: RouteDefinition[] = [
  {
    method: 'GET',
    path: '/api/health',
    /**
     * `GET /api/health` is a readiness check: 200 only when the database is a responsive WAL store
     * and every required table exists. `scripts/tunnel.sh` refuses to expose the app on anything else.
     * 503 `degraded` means the database is unavailable; 503 `not_ready` means the schema is incomplete.
     * Carries no paths, secrets or stack traces.
     */
    handler(_req, res, ctx) {
      const database = checkDatabaseHealth(ctx.db);
      let schema: SchemaReadiness | null = null;
      let queueDepth: number | null = null;
      if (database.ok) {
        try {
          schema = checkSchemaReadiness(ctx.db);
          queueDepth = countQueuedJobs(ctx.db);
        } catch {
          queueDepth = null;
        }
      }
      const status = !database.ok ? 'degraded' : schema?.ready ? 'ok' : 'not_ready';
      sendJson(res, status === 'ok' ? 200 : 503, {
        status,
        schemaReady: schema?.ready ?? false,
        service: 'ariadne',
        uptimeSeconds: Math.round((Date.now() - ctx.startedAt) / 1000),
        database,
        schema: schema ?? { ready: false, missingTables: null },
        queue: { depth: queueDepth },
        github: githubStatus(),
        time: new Date().toISOString(),
      });
    },
  },
];

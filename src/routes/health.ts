import type { RouteDefinition } from '../server.ts';
import { sendJson } from '../server.ts';
import { checkDatabaseHealth, countQueuedJobs } from '../db/client.ts';

/**
 * Reports whether a GitHub token is configured. The token value itself is never read into the response,
 * and live rate-limit figures stay `null` until a GitHub connector records them.
 * @param env - Environment to inspect.
 * @returns Token presence and the (not yet available) rate-limit snapshot.
 */
export function githubStatus(env: NodeJS.ProcessEnv = process.env): { tokenConfigured: boolean; rateLimit: null } {
  return { tokenConfigured: Boolean(env.ARIADNE_GITHUB_TOKEN?.trim()), rateLimit: null };
}

export const routes: RouteDefinition[] = [
  {
    method: 'GET',
    path: '/api/health',
    /**
     * `GET /api/health`: 200 when the database is a responsive WAL store, 503 otherwise.
     * Carries no paths, secrets or stack traces.
     */
    handler(_req, res, ctx) {
      const database = checkDatabaseHealth(ctx.db);
      let queueDepth: number | null = null;
      if (database.ok) {
        try {
          queueDepth = countQueuedJobs(ctx.db);
        } catch {
          queueDepth = null;
        }
      }
      sendJson(res, database.ok ? 200 : 503, {
        status: database.ok ? 'ok' : 'degraded',
        service: 'ariadne',
        uptimeSeconds: Math.round((Date.now() - ctx.startedAt) / 1000),
        database,
        queue: { depth: queueDepth },
        github: githubStatus(),
        time: new Date().toISOString(),
      });
    },
  },
];

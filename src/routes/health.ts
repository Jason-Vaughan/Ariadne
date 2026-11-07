import type { RouteDefinition } from '../server.ts';
import { sendJson } from '../server.ts';
import { checkDatabaseHealth, checkSchemaReadiness, countQueuedJobs } from '../db/client.ts';
import type { SchemaReadiness } from '../db/client.ts';

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

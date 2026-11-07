import type { ServerResponse } from 'node:http';
import type { RouteDefinition } from '../server.ts';
import { effectiveCursor, latestSeqId, MAX_BATCH, parseCursor, readEventPage, subscribe } from '../events/bus.ts';
import type { PublicEventEnvelope } from '../contracts/index.ts';
import type { Logger } from '../server.ts';

export const HEARTBEAT_MS = 15_000;
// Picks up events written by other connections (e.g. the worker), which never signal this process.
export const DB_POLL_MS = 1_000;
export const DEFAULT_POLL_LIMIT = 100;
export const RETRY_MS = 3_000;

export interface EventRouteOptions {
  heartbeatMs?: number;
  dbPollMs?: number;
}

/**
 * Writes a JSON response that intermediaries must not cache.
 * @param res - The response.
 * @param status - HTTP status.
 * @param body - JSON-serializable body.
 */
function sendNoStoreJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(text);
}

/**
 * Builds the callback that reports a stored row withheld for failing the public contract.
 * @param log - The request logger.
 * @returns A callback taking the withheld row's `seq_id`.
 */
function logRejected(log: Logger): (seqId: number) => void {
  return (seqId) => log.info('event withheld: stored row fails the public event contract', { seq_id: seqId });
}

/**
 * Formats one envelope as an SSE frame whose `id` is the `seq_id`, so `Last-Event-ID` resumes exactly.
 * @param event - The public envelope.
 * @returns The frame text.
 */
export function formatSseFrame(event: PublicEventEnvelope): string {
  return `id: ${event.seq_id}\ndata: ${JSON.stringify(event)}\n\n`;
}

/**
 * Builds the `/api/events/*` routes.
 * @param options - Heartbeat and database-poll intervals (overridable for tests).
 * @returns The stream and poll route definitions.
 */
export function createEventRoutes(options: EventRouteOptions = {}): RouteDefinition[] {
  const heartbeatMs = options.heartbeatMs ?? HEARTBEAT_MS;
  const dbPollMs = options.dbPollMs ?? DB_POLL_MS;

  return [
    {
      method: 'GET',
      path: '/api/events/poll',
      /**
       * `GET /api/events/poll?after=<seq_id>&limit=<n>`: `{ events, latest_seq_id }`; 400 on a malformed cursor or limit.
       */
      handler(_req, res, ctx) {
        const after = parseCursor(ctx.url.searchParams.get('after'));
        const limit = parseCursor(ctx.url.searchParams.get('limit'));
        if (after === null || limit === null || limit === 0) {
          sendNoStoreJson(res, 400, { error: 'invalid_cursor', detail: 'after and limit must be non-negative integers' });
          return;
        }
        const head = latestSeqId(ctx.db);
        const wanted = Math.min(limit ?? DEFAULT_POLL_LIMIT, MAX_BATCH);
        const onRejected = logRejected(ctx.log);
        const events: PublicEventEnvelope[] = [];
        let cursor = effectiveCursor(after ?? 0, head);
        // Keep reading past withheld rows, so a page of them cannot leave the client re-asking forever.
        for (;;) {
          const page = readEventPage(ctx.db, cursor, MAX_BATCH, onRejected);
          events.push(...page.events.slice(0, wanted - events.length));
          if (events.length >= wanted || page.scanned < MAX_BATCH) break;
          cursor = page.lastScanned;
        }
        sendNoStoreJson(res, 200, { events, latest_seq_id: head });
      },
    },
    {
      method: 'GET',
      path: '/api/events/stream',
      /**
       * `GET /api/events/stream`: SSE. Resumes after `Last-Event-ID` (preferred) or `?after=`;
       * with neither it starts live from the latest event. Heartbeats are SSE comments, never events.
       */
      handler(req, res, ctx) {
        const header = req.headers['last-event-id'];
        const fromHeader = parseCursor(Array.isArray(header) ? header[0] : header);
        const cursor = fromHeader === undefined ? parseCursor(ctx.url.searchParams.get('after')) : fromHeader;
        if (cursor === null) {
          sendNoStoreJson(res, 400, { error: 'invalid_cursor', detail: 'Last-Event-ID / after must be a non-negative integer' });
          return;
        }

        res.writeHead(200, {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-cache, no-transform',
          connection: 'keep-alive',
          'x-accel-buffering': 'no',
          'x-content-type-options': 'nosniff',
        });
        if (req.method === 'HEAD') {
          res.end();
          return;
        }
        res.flushHeaders();
        res.write(`retry: ${RETRY_MS}\n\n`);

        const head = latestSeqId(ctx.db);
        let lastSent = cursor === undefined ? head : effectiveCursor(cursor, head);
        let closed = false;
        let waitingForDrain = false;
        const onRejected = logRejected(ctx.log);

        /**
         * Sends stored events after the last one this client received, pausing while the socket buffer is full.
         * A failure ends only this stream.
         */
        const flush = (): void => {
          if (closed || waitingForDrain) return;
          try {
            for (;;) {
              const page = readEventPage(ctx.db, lastSent, MAX_BATCH, onRejected);
              for (const event of page.events) {
                lastSent = event.seq_id;
                if (!res.write(formatSseFrame(event))) {
                  waitingForDrain = true;
                  res.once('drain', () => {
                    waitingForDrain = false;
                    flush();
                  });
                  return;
                }
              }
              lastSent = page.lastScanned;
              if (page.scanned < MAX_BATCH) return;
            }
          } catch (error) { // prawduct:allow prawduct/broad-except -- per-connection boundary: one broken stream must not affect others
            ctx.log.info('event stream closed after read failure', {
              error: error instanceof Error ? error.message : String(error),
            });
            cleanup();
            res.end();
          }
        };

        // Deferred so a publisher never runs stream I/O (or its failures) inside publishEvent().
        const unsubscribe = subscribe(ctx.db, () => setImmediate(flush));
        const dbPoll = setInterval(flush, dbPollMs);
        const heartbeat = setInterval(() => {
          if (!closed) res.write(': heartbeat\n\n');
        }, heartbeatMs);

        /** Releases timers and the subscription once the client goes away. */
        const cleanup = (): void => {
          if (closed) return;
          closed = true;
          clearInterval(dbPoll);
          clearInterval(heartbeat);
          unsubscribe();
        };
        req.on('close', cleanup);
        res.on('close', cleanup);
        res.on('error', cleanup);

        flush();
      },
    },
  ];
}

export const routes: RouteDefinition[] = createEventRoutes();

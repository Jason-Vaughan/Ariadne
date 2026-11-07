import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { DatabaseSync } from 'node:sqlite';
import { EVENT_PAYLOAD_SCHEMAS, EventTypeSchema, PublicEventEnvelopeSchema } from '../contracts/index.ts';
import type { EventPayload, EventType, PublicEventEnvelope } from '../contracts/index.ts';

export const MAX_BATCH = 500;

export interface PublishOptions {
  /**
   * Makes the publish idempotent: a second publish with the same key inserts nothing and
   * returns the event already stored (e.g. `<match_id>:a:interested` for a repeated decision).
   */
  idempotencyKey?: string;
  /** Event time; defaults to now. */
  occurredAt?: Date;
}

export interface PublishResult {
  envelope: PublicEventEnvelope;
  /** False when `idempotencyKey` matched an existing event and nothing was written. */
  inserted: boolean;
}

interface EventRow {
  seq_id: number;
  event_id: string;
  type: string;
  payload_json: string;
  occurred_at: string;
}

const SELECT_COLUMNS = 'seq_id, event_id, type, payload_json, occurred_at';
const emitters = new WeakMap<DatabaseSync, EventEmitter>();

export interface EventPage {
  /** Contract-valid envelopes, oldest first. */
  events: PublicEventEnvelope[];
  /** Highest `seq_id` examined, valid or not (the cursor to read from next); `after` when nothing was read. */
  lastScanned: number;
  /** Rows examined; equal to the limit means more may follow. */
  scanned: number;
}

/**
 * Converts a stored row into its public envelope without validating it.
 * @param row - A `domain_events` row.
 * @returns The envelope as stored.
 */
function toEnvelope(row: EventRow): PublicEventEnvelope {
  return {
    seq_id: Number(row.seq_id),
    event_id: row.event_id,
    type: row.type,
    occurred_at: row.occurred_at,
    payload: JSON.parse(row.payload_json),
  } as PublicEventEnvelope;
}

/**
 * Validates a stored row against the public envelope contract. Rows written by other
 * connections (e.g. the worker) may not have gone through `publishEvent()`.
 * @param row - A `domain_events` row.
 * @returns The envelope, or `null` when the row is malformed or would expose non-public data.
 */
function toPublicEnvelope(row: EventRow): PublicEventEnvelope | null {
  let candidate: unknown;
  try {
    candidate = toEnvelope(row);
  } catch {
    return null;
  }
  const parsed = PublicEventEnvelopeSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

/**
 * Returns the per-database emitter used to wake live subscribers.
 * @param db - An open database handle.
 * @returns The emitter for that handle.
 */
function emitterFor(db: DatabaseSync): EventEmitter {
  let emitter = emitters.get(db);
  if (!emitter) {
    emitter = new EventEmitter();
    emitter.setMaxListeners(0);
    emitters.set(db, emitter);
  }
  return emitter;
}

/**
 * Validates a payload against its type's strict public schema, appends it to `domain_events`,
 * and wakes live subscribers. The strict schema is the privacy gate: a key the contract does not
 * name (a raw username, contact card, token) is rejected, so it can never be stored or served.
 * @param db - An open database handle whose schema includes `domain_events` (A-001 `src/db/schema.sql`).
 * @param type - A canonical event type.
 * @param payload - The public payload for that type.
 * @param options - Idempotency key and event time.
 * @returns The stored envelope and whether this call inserted it.
 * @throws If `type` is unknown or the payload fails its schema (nothing is written).
 */
export function publishEvent<T extends EventType>(
  db: DatabaseSync,
  type: T,
  payload: EventPayload<T>,
  options: PublishOptions = {},
): PublishResult {
  const eventType = EventTypeSchema.parse(type);
  const validPayload = EVENT_PAYLOAD_SCHEMAS[eventType].parse(payload);
  const idempotencyKey = options.idempotencyKey ?? null;
  const result = db
    .prepare(
      `INSERT INTO domain_events (event_id, type, payload_json, idempotency_key, occurred_at)
       VALUES (?, ?, ?, ?, ?) ON CONFLICT (idempotency_key) DO NOTHING`,
    )
    .run(randomUUID(), eventType, JSON.stringify(validPayload), idempotencyKey, (options.occurredAt ?? new Date()).toISOString());

  if (Number(result.changes) === 0) {
    const existing = db
      .prepare(`SELECT ${SELECT_COLUMNS} FROM domain_events WHERE idempotency_key = ?`)
      .get(idempotencyKey) as EventRow | undefined;
    if (!existing) throw new Error(`Event insert for ${eventType} wrote nothing and matched no idempotency key`);
    if (existing.type !== eventType) {
      throw new Error(`Idempotency key already used by a ${existing.type} event, not ${eventType}`);
    }
    // The stored row may come from another writer, so it gets the same public-contract check as any read.
    const envelope = toPublicEnvelope(existing);
    if (!envelope) throw new Error(`Stored event for idempotency key fails the public event contract (seq ${existing.seq_id})`);
    return { envelope, inserted: false };
  }

  const row = db
    .prepare(`SELECT ${SELECT_COLUMNS} FROM domain_events WHERE seq_id = ?`)
    .get(Number(result.lastInsertRowid)) as unknown as EventRow;
  emitterFor(db).emit('published', Number(row.seq_id));
  return { envelope: toEnvelope(row), inserted: true };
}

/**
 * Reads one page of rows after a cursor and keeps only contract-valid envelopes. A row that fails
 * the public contract is skipped (and reported) rather than served, but still advances the cursor.
 * @param db - An open database handle.
 * @param after - Exclusive lower bound on `seq_id`.
 * @param limit - Maximum rows to examine (clamped to 1..MAX_BATCH).
 * @param onRejected - Called with the `seq_id` of each skipped row.
 * @returns The valid envelopes and how far the page scanned.
 */
export function readEventPage(
  db: DatabaseSync,
  after: number,
  limit = MAX_BATCH,
  onRejected?: (seqId: number) => void,
): EventPage {
  const bounded = Math.min(Math.max(Math.trunc(limit), 1), MAX_BATCH);
  const rows = db
    .prepare(`SELECT ${SELECT_COLUMNS} FROM domain_events WHERE seq_id > ? ORDER BY seq_id ASC LIMIT ?`)
    .all(after, bounded) as unknown as EventRow[];
  const events: PublicEventEnvelope[] = [];
  for (const row of rows) {
    const envelope = toPublicEnvelope(row);
    if (envelope) events.push(envelope);
    else onRejected?.(Number(row.seq_id));
  }
  const lastRow = rows.at(-1);
  return { events, lastScanned: lastRow ? Number(lastRow.seq_id) : after, scanned: rows.length };
}

/**
 * Reads contract-valid public envelopes with `seq_id` greater than a cursor, oldest first.
 * @param db - An open database handle.
 * @param after - Exclusive lower bound on `seq_id`.
 * @param limit - Maximum rows to examine (clamped to 1..MAX_BATCH).
 * @returns The envelopes.
 */
export function readEventsAfter(db: DatabaseSync, after: number, limit = MAX_BATCH): PublicEventEnvelope[] {
  return readEventPage(db, after, limit).events;
}

/**
 * Normalizes a client cursor against the current head. A cursor past the head means the store
 * was reset (e.g. a fresh demo database), so the client is sent back to the start.
 * @param cursor - The client's cursor.
 * @param head - The current latest `seq_id`.
 * @returns The cursor to read after.
 */
export function effectiveCursor(cursor: number, head: number): number {
  return cursor > head ? 0 : cursor;
}

/**
 * Returns the highest assigned `seq_id`.
 * @param db - An open database handle.
 * @returns The latest sequence number, or 0 when no event exists.
 */
export function latestSeqId(db: DatabaseSync): number {
  const row = db.prepare('SELECT COALESCE(MAX(seq_id), 0) AS latest FROM domain_events').get() as { latest: number };
  return Number(row.latest);
}

/**
 * Registers a callback fired after each in-process publish on this handle.
 * Writers on other connections are not signalled; stream readers also poll for those.
 * @param db - An open database handle.
 * @param listener - Receives the new `seq_id`.
 * @returns A function that removes the listener.
 */
export function subscribe(db: DatabaseSync, listener: (seqId: number) => void): () => void {
  const emitter = emitterFor(db);
  emitter.on('published', listener);
  return () => emitter.off('published', listener);
}

/**
 * Counts live subscribers on a handle, for leak checks and health reporting.
 * @param db - An open database handle.
 * @returns The number of registered listeners.
 */
export function subscriberCount(db: DatabaseSync): number {
  return emitters.get(db)?.listenerCount('published') ?? 0;
}

/**
 * Parses a client-supplied cursor (`Last-Event-ID` or `?after=`).
 * @param raw - The raw header or query value.
 * @returns The cursor; `undefined` when absent; `null` when present but not a non-negative safe integer.
 */
export function parseCursor(raw: string | null | undefined): number | undefined | null {
  if (raw === null || raw === undefined || raw.trim() === '') return undefined;
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isSafeInteger(value) ? value : null;
}

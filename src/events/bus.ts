import { EventEmitter } from 'node:events';
import type { DatabaseSync } from 'node:sqlite';

// Mirrors DATA_AND_EVENTS_CONTRACT.md §3 until A-001's src/contracts exports the canonical catalog.
export const EVENT_TYPES = [
  'participant.registered',
  'github.fetch.started',
  'github.fetch.completed',
  'profile.analysis.completed',
  'opportunity.identified',
  'match.candidate.generated',
  'match.evaluated',
  'introduction.proposed',
  'introduction.accepted',
  'introduction.declined',
  'introduction.completed',
  'analysis.failed',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

/** One row of the public event stream, as served by SSE and the poll endpoint. */
export interface PublicEventEnvelope {
  seq_id: number;
  type: EventType;
  occurred_at: string;
  payload: Record<string, unknown>;
}

export interface PublishOptions {
  /**
   * The subject participant's `public_display_consent`. Unlocks `github_username` and `avatar_url` only,
   * and only on single-participant event types; two-participant events never carry them.
   */
  publicDisplayConsent?: boolean;
  /** Event time; defaults to now. */
  occurredAt?: Date;
}

export const MAX_BATCH = 500;

export const EVENT_SCHEMA = `CREATE TABLE IF NOT EXISTS domain_events (
  seq_id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  public_payload TEXT NOT NULL,
  occurred_at TEXT NOT NULL
);`;

const EVENT_TYPE_SET: ReadonlySet<string> = new Set(EVENT_TYPES);

/**
 * The only keys the public stream may carry, at any depth. Fail closed: a key not listed here is dropped,
 * so a producer adding a field cannot leak identity by accident. Free text and `owner/repo` names are
 * deliberately absent because they can embed a GitHub login.
 */
export const PUBLIC_PAYLOAD_KEYS: ReadonlySet<string> = new Set([
  'participant_id',
  'pseudonym',
  'display_alias',
  'cluster',
  'cluster_badge',
  'analysis_state',
  'stage',
  'progress',
  'match_id',
  'participant_a_id',
  'participant_b_id',
  'pseudonym_a',
  'pseudonym_b',
  'channel',
  'intro_state',
  'composite_score',
  'score_breakdown',
  'complementary_skills',
  'project_relevance',
  'evidence_strength',
  'recency',
  'opportunity_id',
  'opportunity_type',
  'category',
  'capabilities',
  'label',
  'confidence',
  'count',
  'evidence_count',
  'error_code',
  'duration_ms',
  'attempt',
]);

// Shown only with the subject's public_display_consent, and only on events about exactly one participant.
const CONSENT_GATED_KEYS: ReadonlySet<string> = new Set(['github_username', 'avatar_url']);
const SINGLE_SUBJECT_TYPES: ReadonlySet<EventType> = new Set([
  'participant.registered',
  'github.fetch.started',
  'github.fetch.completed',
  'profile.analysis.completed',
  'opportunity.identified',
  'analysis.failed',
]);
// The public stream counts declines; it must not reveal who declined whom.
const AGGREGATE_ONLY_TYPES: ReadonlySet<EventType> = new Set(['introduction.declined']);

const ensured = new WeakSet<DatabaseSync>();
const emitters = new WeakMap<DatabaseSync, EventEmitter>();

/**
 * Creates the `domain_events` table if it does not exist. Safe to call repeatedly.
 * @param db - An open database handle.
 */
export function ensureEventSchema(db: DatabaseSync): void {
  if (ensured.has(db)) return;
  db.exec(EVENT_SCHEMA);
  ensured.add(db);
}

/**
 * Checks whether a string is one of the canonical event types.
 * @param value - Candidate type name.
 * @returns True for a catalogued `EventType`.
 */
export function isEventType(value: string): value is EventType {
  return EVENT_TYPE_SET.has(value);
}

/**
 * Keeps only allowlisted fields, at any depth, so the public stream stays pseudonymous.
 * `github_username` / `avatar_url` survive only with display consent on a single-participant
 * event type; aggregate-only types lose their whole payload.
 * @param type - The event type being published.
 * @param payload - The raw payload from the publisher.
 * @param publicDisplayConsent - Whether the event's single subject consented to public display.
 * @returns A new, sanitized payload; the input is not modified.
 */
export function sanitizePublicPayload(
  type: EventType,
  payload: Record<string, unknown>,
  publicDisplayConsent = false,
): Record<string, unknown> {
  if (AGGREGATE_ONLY_TYPES.has(type)) return {};
  const allowIdentity = publicDisplayConsent && SINGLE_SUBJECT_TYPES.has(type);
  return sanitizeValue(payload, allowIdentity) as Record<string, unknown>;
}

/**
 * Recursively copies a JSON-like value, keeping only allowlisted keys.
 * @param value - Value to copy.
 * @param allowIdentity - Whether consent-gated identity keys may be kept.
 * @returns The sanitized copy.
 */
function sanitizeValue(value: unknown, allowIdentity: boolean): unknown {
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item, allowIdentity));
  if (value === null || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    const allowed = PUBLIC_PAYLOAD_KEYS.has(key) || (allowIdentity && CONSENT_GATED_KEYS.has(key));
    if (allowed) out[key] = sanitizeValue(child, allowIdentity);
  }
  return out;
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
 * Sanitizes and appends one event to `domain_events`, then wakes live subscribers.
 * @param db - An open database handle.
 * @param type - A canonical event type.
 * @param payload - Raw payload; private fields are stripped before anything is written.
 * @param options - Display consent and event time.
 * @returns The stored public envelope with its assigned `seq_id`.
 * @throws If `type` is not in the canonical catalog.
 */
export function publishEvent(
  db: DatabaseSync,
  type: EventType,
  payload: Record<string, unknown> = {},
  options: PublishOptions = {},
): PublicEventEnvelope {
  if (!isEventType(type)) throw new Error(`Unknown event type: ${String(type)}`);
  ensureEventSchema(db);
  const publicPayload = sanitizePublicPayload(type, payload, options.publicDisplayConsent ?? false);
  const occurredAt = (options.occurredAt ?? new Date()).toISOString();
  const result = db
    .prepare('INSERT INTO domain_events (event_type, public_payload, occurred_at) VALUES (?, ?, ?)')
    .run(type, JSON.stringify(publicPayload), occurredAt);
  const envelope: PublicEventEnvelope = {
    seq_id: Number(result.lastInsertRowid),
    type,
    occurred_at: occurredAt,
    payload: publicPayload,
  };
  emitterFor(db).emit('published', envelope.seq_id);
  return envelope;
}

/**
 * Reads public envelopes with `seq_id` greater than a cursor, oldest first.
 * @param db - An open database handle.
 * @param after - Exclusive lower bound on `seq_id`.
 * @param limit - Maximum rows to return (clamped to 1..MAX_BATCH).
 * @returns The envelopes, built only from the `public_payload` column.
 */
export function readEventsAfter(db: DatabaseSync, after: number, limit = MAX_BATCH): PublicEventEnvelope[] {
  ensureEventSchema(db);
  const bounded = Math.min(Math.max(Math.trunc(limit), 1), MAX_BATCH);
  const rows = db
    .prepare(
      'SELECT seq_id, event_type, public_payload, occurred_at FROM domain_events WHERE seq_id > ? ORDER BY seq_id ASC LIMIT ?',
    )
    .all(after, bounded) as Array<{ seq_id: number; event_type: string; public_payload: string; occurred_at: string }>;
  return rows.map((row) => ({
    seq_id: Number(row.seq_id),
    type: row.event_type as EventType,
    occurred_at: row.occurred_at,
    payload: JSON.parse(row.public_payload) as Record<string, unknown>,
  }));
}

/**
 * Returns the highest assigned `seq_id`.
 * @param db - An open database handle.
 * @returns The latest sequence number, or 0 when no event exists.
 */
export function latestSeqId(db: DatabaseSync): number {
  ensureEventSchema(db);
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

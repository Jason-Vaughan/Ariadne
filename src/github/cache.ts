import type { DatabaseSync } from 'node:sqlite';
import { GithubUsernameSchema } from '../contracts/index.ts';
import { fetchGithubSnapshot } from './connector.ts';
import type { FetchGithubOptions, GithubSnapshot } from './connector.ts';

/** Snapshots live 24 hours, long enough to cover the whole event from a pre-demo warm-up. */
export const SNAPSHOT_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Normalizes and validates a GitHub login for use as the cache key.
 * @param raw - Login as entered (may carry `@` or capitals).
 * @returns The lowercase login.
 * @throws If the login is not a valid GitHub username.
 */
export function cacheKey(raw: string): string {
  const username = raw.trim().replace(/^@/, '').toLowerCase();
  return GithubUsernameSchema.parse(username);
}

/**
 * Reads an unexpired snapshot from `github_snapshots`.
 * @param db - Open database with the A-001 schema.
 * @param username - GitHub login.
 * @param now - Current time.
 * @returns The cached snapshot, or `null` when absent, expired or unreadable.
 */
export function readSnapshot(db: DatabaseSync, username: string, now: Date = new Date()): GithubSnapshot | null {
  const row = db
    .prepare('SELECT payload_json, expires_at FROM github_snapshots WHERE github_username = ?')
    .get(cacheKey(username)) as { payload_json: string; expires_at: string } | undefined;
  if (!row || !(Date.parse(row.expires_at) > now.getTime())) return null;
  try {
    const snapshot = JSON.parse(row.payload_json) as GithubSnapshot;
    return snapshot?.version === 1 ? snapshot : null;
  } catch {
    return null;
  }
}

/**
 * Stores (or replaces) a snapshot with a fresh 24-hour expiry. An existing participant link is kept when the new
 * write has none (e.g. a pre-warm of a handle that already registered).
 * @param db - Open database with the A-001 schema.
 * @param snapshot - Snapshot to store.
 * @param options - Owning participant (must exist), clock and TTL overrides.
 */
export function writeSnapshot(
  db: DatabaseSync,
  snapshot: GithubSnapshot,
  options: { participantId?: string | null; now?: Date; ttlMs?: number } = {},
): void {
  const now = options.now ?? new Date();
  db.prepare(
    `INSERT INTO github_snapshots (github_username, participant_id, payload_json, fetched_at, expires_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (github_username) DO UPDATE SET
       participant_id = COALESCE(excluded.participant_id, github_snapshots.participant_id),
       payload_json = excluded.payload_json,
       fetched_at = excluded.fetched_at,
       expires_at = excluded.expires_at`,
  ).run(
    cacheKey(snapshot.username),
    options.participantId ?? null,
    JSON.stringify(snapshot),
    snapshot.fetched_at,
    new Date(now.getTime() + (options.ttlMs ?? SNAPSHOT_TTL_MS)).toISOString(),
  );
}

export type SnapshotFetcher = (username: string, options: FetchGithubOptions) => Promise<GithubSnapshot>;

export interface GetSnapshotOptions extends FetchGithubOptions {
  participantId?: string | null;
  fetcher?: SnapshotFetcher;
  /** Bypass a cached copy (still stores the fresh one). */
  refresh?: boolean;
}

// Single-flight: concurrent scans of the same handle share one GitHub retrieval.
const inFlight = new Map<string, Promise<GithubSnapshot>>();

/**
 * Returns a participant's snapshot from the 24-hour cache, or fetches and caches it. Concurrent callers for the same
 * handle share one retrieval, so a QR burst never multiplies GitHub calls.
 * @param db - Open database with the A-001 schema.
 * @param username - GitHub login.
 * @param options - Participant link, website, fetcher and connector overrides.
 * @returns The snapshot and whether it came from the cache.
 * @throws GithubFetchError when a fetch is needed and fails.
 */
export async function getOrFetchSnapshot(
  db: DatabaseSync,
  username: string,
  options: GetSnapshotOptions = {},
): Promise<{ snapshot: GithubSnapshot; cached: boolean }> {
  const key = cacheKey(username);
  if (!options.refresh) {
    const cached = readSnapshot(db, key, options.now?.());
    if (cached) {
      if (options.participantId) linkParticipant(db, key, options.participantId);
      return { snapshot: cached, cached: true };
    }
  }
  let pending = inFlight.get(key);
  if (!pending) {
    const { fetcher = fetchGithubSnapshot, participantId: _participantId, refresh: _refresh, ...connectorOptions } = options;
    pending = fetcher(key, connectorOptions).finally(() => inFlight.delete(key));
    inFlight.set(key, pending);
  }
  const snapshot = await pending;
  writeSnapshot(db, snapshot, { participantId: options.participantId ?? null, now: options.now?.() });
  return { snapshot, cached: false };
}

/**
 * Links an existing cached snapshot to the participant who registered with that handle.
 * @param db - Open database.
 * @param username - Normalized login.
 * @param participantId - Participant UUID (must exist).
 */
function linkParticipant(db: DatabaseSync, username: string, participantId: string): void {
  db.prepare('UPDATE github_snapshots SET participant_id = ? WHERE github_username = ? AND participant_id IS NULL').run(participantId, username);
}

export interface PrewarmResult {
  warmed: string[];
  alreadyCached: string[];
  failed: { handle: string; reason: string }[];
}

/**
 * Pre-warms the cache for VIP/judge handles before demo time, with bounded concurrency so warming never competes
 * with live scans for rate limit. Each handle may carry an optional public website.
 * @param db - Open database with the A-001 schema.
 * @param handles - GitHub logins to warm (duplicates and invalid entries are reported, not fetched twice).
 * @param options - Website map, concurrency (default 2), fetcher and connector overrides.
 * @returns Which handles were fetched, which were already fresh, and which failed and why.
 */
export async function prewarmSnapshots(
  db: DatabaseSync,
  handles: readonly string[],
  options: GetSnapshotOptions & { websites?: Record<string, string>; concurrency?: number } = {},
): Promise<PrewarmResult> {
  const result: PrewarmResult = { warmed: [], alreadyCached: [], failed: [] };
  const queue: string[] = [];
  const websites = new Map(Object.entries(options.websites ?? {}).map(([handle, url]) => [handle.trim().replace(/^@/, '').toLowerCase(), url]));
  for (const handle of handles) {
    let key: string;
    try {
      key = cacheKey(handle);
    } catch {
      result.failed.push({ handle, reason: 'invalid_username' });
      continue;
    }
    if (!queue.includes(key)) queue.push(key);
  }
  const { websites: _websites, concurrency = 2, ...rest } = options;
  const worker = async (): Promise<void> => {
    for (let key = queue.shift(); key !== undefined; key = queue.shift()) {
      try {
        const { cached } = await getOrFetchSnapshot(db, key, { ...rest, participantId: null, websiteUrl: websites.get(key) ?? null });
        (cached ? result.alreadyCached : result.warmed).push(key);
      } catch (error) {
        const reason = (error as { reason?: unknown })?.reason;
        result.failed.push({ handle: key, reason: typeof reason === 'string' ? reason : 'github_unavailable' });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, queue.length || 1)) }, worker));
  return result;
}

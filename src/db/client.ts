import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

// Rule #316 names data/ariadne.db; ARCHITECTURE.md's data/ariadne.sqlite is reachable via ARIADNE_DB_PATH.
export const DEFAULT_DB_PATH = 'data/ariadne.db';
export const DEFAULT_SCHEMA_PATH = 'src/db/schema.sql';
export const BUSY_TIMEOUT_MS = 5000;

export interface OpenDatabaseOptions {
  /** Database file path; relative paths resolve against `cwd`. */
  path?: string;
  /** Idempotent schema file to apply on open; `null` skips schema application. */
  schemaPath?: string | null;
  /** Base directory for relative paths. Defaults to `process.cwd()`. */
  cwd?: string;
}

export interface AriadneDatabase {
  db: DatabaseSync;
  path: string;
  schemaApplied: boolean;
}

export interface DatabaseHealth {
  ok: boolean;
  journalMode: string | null;
  busyTimeoutMs: number | null;
  error?: string;
}

/**
 * Resolves the database path from `ARIADNE_DB_PATH`, falling back to the default.
 * @param env - Environment to read; defaults to `process.env`.
 * @returns The configured database path (possibly relative).
 */
export function resolveDbPath(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.ARIADNE_DB_PATH?.trim();
  return configured ? configured : DEFAULT_DB_PATH;
}

/**
 * Opens the Ariadne SQLite database in WAL mode and applies the schema file when present.
 * The schema file is executed on every open, so it must be idempotent (`CREATE ... IF NOT EXISTS`).
 * @param options - Path, schema and base-directory overrides.
 * @returns The open handle, its absolute path and whether a schema file was applied.
 * @throws If the database cannot enter WAL mode (e.g. an in-memory database).
 */
export function openDatabase(options: OpenDatabaseOptions = {}): AriadneDatabase {
  const cwd = options.cwd ?? process.cwd();
  const requested = options.path ?? resolveDbPath();
  const path = requested === ':memory:' ? requested : resolve(cwd, requested);
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });

  const db = new DatabaseSync(path);
  try {
    const mode = db.prepare('PRAGMA journal_mode = WAL').get() as { journal_mode: string };
    if (mode.journal_mode.toLowerCase() !== 'wal') {
      throw new Error(`SQLite refused WAL mode (got "${mode.journal_mode}") for ${path}`);
    }
    db.exec(`PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}; PRAGMA foreign_keys = ON;`);

    let schemaApplied = false;
    const schemaPath = options.schemaPath === undefined ? DEFAULT_SCHEMA_PATH : options.schemaPath;
    if (schemaPath !== null) {
      const absoluteSchema = resolve(cwd, schemaPath);
      if (existsSync(absoluteSchema)) {
        db.exec(readFileSync(absoluteSchema, 'utf8'));
        schemaApplied = true;
      }
    }
    return { db, path, schemaApplied };
  } catch (error) {
    db.close();
    throw error;
  }
}

/**
 * Reports WAL readiness for the health endpoint without exposing file paths or stack traces.
 * @param db - An open database handle.
 * @returns Journal mode and busy timeout, with `ok` true only for a responsive WAL database.
 */
export function checkDatabaseHealth(db: DatabaseSync): DatabaseHealth {
  try {
    const journal = db.prepare('PRAGMA journal_mode').get() as { journal_mode: string };
    const busy = db.prepare('PRAGMA busy_timeout').get() as Record<string, number>;
    const journalMode = journal.journal_mode.toLowerCase();
    return { ok: journalMode === 'wal', journalMode, busyTimeoutMs: Number(Object.values(busy)[0]) };
  } catch {
    return { ok: false, journalMode: null, busyTimeoutMs: null, error: 'database unavailable' };
  }
}

/**
 * Counts worker jobs waiting to be claimed (`async_jobs.status = 'queued'`).
 * @param db - An open database handle.
 * @returns The queue depth, or `null` when the `async_jobs` table does not exist yet.
 */
export function countQueuedJobs(db: DatabaseSync): number | null {
  const table = db
    .prepare("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'async_jobs'")
    .get();
  if (!table) return null;
  const row = db.prepare("SELECT COUNT(*) AS depth FROM async_jobs WHERE status = 'queued'").get() as { depth: number };
  return Number(row.depth);
}

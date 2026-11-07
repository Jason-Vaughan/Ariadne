import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';

// Rule #316 names data/ariadne.db; ARCHITECTURE.md's data/ariadne.sqlite is reachable via ARIADNE_DB_PATH.
export const DEFAULT_DB_PATH = 'data/ariadne.db';
export const DEFAULT_SCHEMA_PATH = 'src/db/schema.sql';
export const BUSY_TIMEOUT_MS = 5000;
/** Tables the A-001 schema must create before Ariadne counts as ready to serve traffic. */
export const REQUIRED_TABLES: readonly string[] = [
  'participants',
  'github_snapshots',
  'evidence_receipts',
  'capability_claims',
  'opportunity_needs',
  'matches',
  'domain_events',
  'async_jobs',
];

export interface SchemaReadiness {
  ready: boolean;
  missingTables: string[];
}

export interface OpenDatabaseOptions {
  /** Database file path; relative paths resolve against `cwd`. */
  path?: string;
  /** Idempotent schema file to apply on open; defaults to `ARIADNE_SCHEMA_PATH` or `src/db/schema.sql`; `null` skips it. */
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
 * Resolves the schema file path from `ARIADNE_SCHEMA_PATH`, falling back to the default.
 * @param env - Environment to read; defaults to `process.env`.
 * @returns The configured schema path (possibly relative).
 */
export function resolveSchemaPath(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.ARIADNE_SCHEMA_PATH?.trim();
  return configured ? configured : DEFAULT_SCHEMA_PATH;
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
    const schemaPath = options.schemaPath === undefined ? resolveSchemaPath() : options.schemaPath;
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
 * Checks that every table the application depends on exists.
 * @param db - An open database handle.
 * @param required - Table names to look for; defaults to `REQUIRED_TABLES`.
 * @returns Whether the schema is complete, and which required tables are absent.
 */
export function checkSchemaReadiness(db: DatabaseSync, required: readonly string[] = REQUIRED_TABLES): SchemaReadiness {
  const rows = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[];
  const present = new Set(rows.map((row) => row.name));
  const missingTables = required.filter((name) => !present.has(name));
  return { ready: missingTables.length === 0, missingTables };
}

export interface BackupResult {
  path: string;
  bytes: number;
  sha256: string;
  checksumPath: string;
}

/**
 * Writes a consistent point-in-time copy of the database with `VACUUM INTO` (safe while the server
 * is writing in WAL mode), then a `<dest>.sha256` file in `shasum -a 256 -c` format beside it.
 * @param db - An open database handle.
 * @param destPath - Backup file to create; must not exist yet.
 * @returns The backup's absolute path, size, SHA-256 digest and checksum file path.
 * @throws If the destination already exists or SQLite cannot write it.
 */
export function backupDatabase(db: DatabaseSync, destPath: string): BackupResult {
  const path = resolve(destPath);
  if (existsSync(path)) throw new Error(`Backup destination already exists: ${path}`);
  mkdirSync(dirname(path), { recursive: true });
  db.prepare('VACUUM INTO ?').run(path);
  const sha256 = createHash('sha256').update(readFileSync(path)).digest('hex');
  const checksumPath = `${path}.sha256`;
  writeFileSync(checksumPath, `${sha256}  ${basename(path)}\n`);
  return { path, bytes: statSync(path).size, sha256, checksumPath };
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

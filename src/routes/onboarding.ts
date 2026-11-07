import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import {
  clearedSessionCookie,
  createSessionToken,
  getSessionSecret,
  isSecureRequest,
  readSession,
  sessionCookie,
} from '../auth/session.ts';
import { GithubUsernameSchema, ParticipantSchema } from '../contracts/index.ts';
import type { Participant } from '../contracts/index.ts';
import { publishEvent } from '../events/bus.ts';
import type { RouteDefinition } from '../server.ts';
import { sendJson } from '../server.ts';

export const DEFAULT_MAX_ROOM_CAPACITY = 30;
export const GOAL_MAX_LENGTH = 160;
export const MAX_BODY_BYTES = 16 * 1024;
export const RATE_LIMIT_MAX = 20;
export const RATE_LIMIT_WINDOW_MS = 60_000;
export const ANALYZE_JOB_KIND = 'participant.analyze';
/** Seed personas (A-010) use reserved ids and handles; they never occupy attendee capacity. */
export const SEED_ID_PREFIX = '5eed0000-';
export const SEED_HANDLE_PREFIX = 'ariadne-seed-';

const JOIN_PAGE = fileURLToPath(new URL('../../public/app/join.html', import.meta.url));

const ALIAS_WORDS = [
  'Thread', 'Loom', 'Spindle', 'Weft', 'Warp', 'Shuttle', 'Skein', 'Bobbin',
  'Needle', 'Knot', 'Spool', 'Strand', 'Braid', 'Twine', 'Fiber', 'Silk',
] as const;

/** Sites whose profile pages require a login, so a crawler would only see a login wall. */
const LOGIN_WALLED_HOSTS = [
  'linkedin.com', 'facebook.com', 'instagram.com', 'x.com', 'twitter.com',
  'accounts.google.com', 'docs.google.com', 'drive.google.com',
] as const;

const PRIVATE_HOST_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.home.arpa'] as const;

export interface AdmissionPolicy {
  maxRoomCapacity: number;
  intakeLocked: boolean;
}

let admissionPolicy: AdmissionPolicy = {
  maxRoomCapacity: Number(process.env.ARIADNE_MAX_ROOM_CAPACITY) || DEFAULT_MAX_ROOM_CAPACITY,
  intakeLocked: false,
};

/**
 * Current room capacity and intake lock; admin/stage controls change it through `setAdmissionPolicy`.
 * @returns A copy of the active policy.
 */
export function getAdmissionPolicy(): AdmissionPolicy {
  return { ...admissionPolicy };
}

/**
 * Updates the room capacity and/or intake lock.
 * @param update - Fields to change; `maxRoomCapacity` must be a positive integer.
 * @returns The policy now in force.
 * @throws If `maxRoomCapacity` is not a positive integer.
 */
export function setAdmissionPolicy(update: Partial<AdmissionPolicy>): AdmissionPolicy {
  if (update.maxRoomCapacity !== undefined && !(Number.isInteger(update.maxRoomCapacity) && update.maxRoomCapacity > 0)) {
    throw new Error(`maxRoomCapacity must be a positive integer, got ${update.maxRoomCapacity}`);
  }
  admissionPolicy = { ...admissionPolicy, ...update };
  return getAdmissionPolicy();
}

const attempts = new Map<string, { count: number; windowStart: number }>();

/**
 * Clears per-IP registration attempt counters.
 */
export function resetRateLimits(): void {
  attempts.clear();
}

/**
 * Client address for rate limiting. Ariadne binds loopback only, so forwarded headers can only come
 * from the local tunnel; without them every venue client would share the tunnel's address.
 * @param req - Incoming request.
 * @returns The best available client address.
 */
function clientAddress(req: IncomingMessage): string {
  const forwarded = req.headers['cf-connecting-ip'] ?? req.headers['x-forwarded-for'];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
  return first || req.socket.remoteAddress || 'unknown';
}

/**
 * Counts one registration attempt from an address.
 * @param address - Client address.
 * @param now - Current time in milliseconds.
 * @returns Seconds to wait when over the limit, else `null`.
 */
function takeAttempt(address: string, now: number = Date.now()): number | null {
  const entry = attempts.get(address);
  if (!entry || now - entry.windowStart >= RATE_LIMIT_WINDOW_MS) {
    attempts.set(address, { count: 1, windowStart: now });
    return null;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX ? Math.ceil((entry.windowStart + RATE_LIMIT_WINDOW_MS - now) / 1000) : null;
}

/**
 * Normalizes a GitHub handle or profile URL to a lowercase login.
 * Accepts `octocat`, `@octocat`, `github.com/octocat` and `https://github.com/octocat/`.
 * @param input - Raw user input.
 * @returns The login, or `null` when the input is not a single valid GitHub user.
 */
export function normalizeGithubHandle(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  let value = input.trim();
  const profile = /^(?:https?:\/\/)?(?:www\.)?github\.com\/(.*)$/i.exec(value);
  if (profile) {
    const segments = (profile[1] ?? '').split(/[?#]/)[0]!.split('/').filter(Boolean);
    if (segments.length !== 1) return null;
    value = segments[0]!;
  }
  value = value.replace(/^@/, '').toLowerCase();
  return GithubUsernameSchema.safeParse(value).success ? value : null;
}

/**
 * Whether a URL hostname is loopback, private, link-local or otherwise not on the public web.
 * WHATWG URL parsing has already canonicalized numeric forms such as `2130706433` to `127.0.0.1`.
 * @param hostname - `URL.hostname`.
 * @returns True when the host must not be crawled.
 */
export function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || PRIVATE_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) return true;
  const v4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(host);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  if (host.includes(':')) {
    return host === '::' || host === '::1' || host.startsWith('::ffff:') || /^f[cd]/.test(host) || /^fe[89ab]/.test(host);
  }
  return !host.includes('.');
}

export type WebsiteResult = { ok: true; url: string | null } | { ok: false; reason: 'invalid_url' | 'private_address' | 'login_walled' };

/**
 * Normalizes an optional public website: adds `https://` when the scheme is missing, upgrades `http`
 * to `https`, drops the fragment and a bare trailing slash.
 * @param input - Raw user input; empty or absent means no website.
 * @returns The normalized URL (or `null`), or why it was rejected.
 */
export function normalizeWebsiteUrl(input: unknown): WebsiteResult {
  if (input === undefined || input === null || (typeof input === 'string' && input.trim() === '')) return { ok: true, url: null };
  if (typeof input !== 'string' || input.length > 2048) return { ok: false, reason: 'invalid_url' };
  const raw = input.trim();
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return { ok: false, reason: 'invalid_url' };
  }
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password || !url.hostname) {
    return { ok: false, reason: 'invalid_url' };
  }
  if (isPrivateHost(url.hostname)) return { ok: false, reason: 'private_address' };
  const host = url.hostname.toLowerCase();
  if (LOGIN_WALLED_HOSTS.some((walled) => host === walled || host.endsWith(`.${walled}`))) {
    return { ok: false, reason: 'login_walled' };
  }
  url.protocol = 'https:';
  url.hash = '';
  return { ok: true, url: url.pathname === '/' && !url.search ? url.origin : url.href };
}

/**
 * Deterministic stage alias for a participant id, e.g. `Thread-7C4E`.
 * @param participantId - Participant UUID.
 * @returns An alias matching the contract's display-alias format.
 */
export function displayAliasFor(participantId: string): string {
  const digest = createHash('sha256').update(participantId).digest();
  const word = ALIAS_WORDS[digest[0]! % ALIAS_WORDS.length]!;
  return `${word}-${digest.subarray(1, 3).toString('hex').toUpperCase()}`;
}

interface ParticipantRow {
  id: string;
  display_alias: string;
  github_username: string;
  website_url: string | null;
  stage_display_consent: number;
  analysis_state: string;
  created_at: string;
}

/**
 * What a participant sees about themselves.
 * @param row - Participant row.
 * @returns The self-view: no contact card, no internal flags.
 */
function selfView(row: ParticipantRow) {
  return {
    id: row.id,
    display_alias: row.display_alias,
    github_username: row.github_username,
    website_url: row.website_url,
    stage_display_consent: row.stage_display_consent === 1,
    analysis_state: row.analysis_state,
    created_at: row.created_at,
  };
}

/**
 * Loads a participant by id.
 * @param db - Database handle.
 * @param id - Participant id.
 * @returns The row, or `undefined`.
 */
function findParticipant(db: DatabaseSync, id: string): ParticipantRow | undefined {
  return db
    .prepare(
      'SELECT id, display_alias, github_username, website_url, stage_display_consent, analysis_state, created_at FROM participants WHERE id = ?',
    )
    .get(id) as ParticipantRow | undefined;
}

/**
 * Active (consenting) non-seed participants occupying room capacity.
 * @param db - Database handle.
 * @returns The count.
 */
export function countActiveParticipants(db: DatabaseSync): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM participants
       WHERE consent_status = 'granted' AND substr(id, 1, ?) <> ? AND substr(github_username, 1, ?) <> ?`,
    )
    .get(SEED_ID_PREFIX.length, SEED_ID_PREFIX, SEED_HANDLE_PREFIX.length, SEED_HANDLE_PREFIX) as { n: number };
  return Number(row.n);
}

/**
 * Whether a handle was pre-warmed (VIP/judge) before registering, which admits it past a full room.
 * @param db - Database handle.
 * @param login - Normalized GitHub login.
 * @returns True when an unclaimed GitHub snapshot exists for it.
 */
function isPrewarmed(db: DatabaseSync, login: string): boolean {
  return Boolean(db.prepare('SELECT 1 FROM github_snapshots WHERE github_username = ? AND participant_id IS NULL').get(login));
}

/**
 * The capacity notice shown on `/join` and returned by a refused registration.
 * @param active - Participants in the room.
 * @param policy - Admission policy.
 * @returns The friendly message.
 */
function capacityMessage(active: number, policy: AdmissionPolicy): string {
  return `🚧 System is currently at capacity (${Math.min(active, policy.maxRoomCapacity)}/${policy.maxRoomCapacity}) — please try back later!`;
}

/**
 * Reads and parses a JSON request body.
 * @param req - Incoming request.
 * @returns The parsed object, `'too_large'`, or `'invalid'`.
 */
async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown> | 'too_large' | 'invalid'> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) return 'too_large';
    chunks.push(chunk as Buffer);
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : 'invalid';
  } catch {
    return 'invalid';
  }
}

/**
 * Runs `work` inside an immediate (write-locking) transaction.
 * @param db - Database handle.
 * @param work - Statements to run atomically.
 * @returns Whatever `work` returns.
 */
function inTransaction<T>(db: DatabaseSync, work: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

/**
 * Sends a 400 naming the offending field.
 * @param res - Response.
 * @param field - Field name.
 * @param error - Machine-readable code.
 * @param message - Human-readable explanation.
 */
function badRequest(res: ServerResponse, field: string, error: string, message: string): void {
  sendJson(res, 400, { error, field, message });
}

const WEBSITE_MESSAGES: Record<string, string> = {
  invalid_url: 'Enter a public website such as jasonvaughan.com.',
  private_address: 'That address is private or local; use a site anyone on the internet can open.',
  login_walled: 'That site requires a login to view; use a page that is open to everyone.',
};

/**
 * `POST /api/participants`: registers a participant, starts their session, emits `participant.registered`
 * and queues profile analysis. A request with a live session returns that participant unchanged.
 * @param req - Incoming request.
 * @param res - Response.
 * @param db - Database handle.
 * @param log - Info-level logger.
 */
async function register(req: IncomingMessage, res: ServerResponse, db: DatabaseSync, log: { info(m: string, f?: Record<string, unknown>): void }): Promise<void> {
  const wait = takeAttempt(clientAddress(req));
  if (wait !== null) {
    res.setHeader('retry-after', String(wait));
    sendJson(res, 429, { error: 'rate_limited', message: 'Too many attempts — please wait a moment and try again.' });
    return;
  }

  const existingId = readSession(req);
  const existing = existingId ? findParticipant(db, existingId) : undefined;
  if (existing) {
    sendJson(res, 200, { participant: selfView(existing), redirect: '/me' });
    return;
  }

  const body = await readJsonBody(req);
  if (body === 'too_large') return sendJson(res, 413, { error: 'body_too_large' });
  if (body === 'invalid') return badRequest(res, 'body', 'invalid_request', 'Send a JSON object.');

  const login = normalizeGithubHandle(body.github);
  if (!login) return badRequest(res, 'github', 'invalid_github', 'Enter your GitHub username (e.g. octocat) or profile URL.');
  if (login.startsWith(SEED_HANDLE_PREFIX)) {
    return badRequest(res, 'github', 'reserved_github', 'That handle is reserved for demo profiles; use your own GitHub username.');
  }
  const website = normalizeWebsiteUrl(body.website_url);
  if (!website.ok) return badRequest(res, 'website_url', website.reason, WEBSITE_MESSAGES[website.reason]!);
  const goal = body.goal === undefined || body.goal === null ? '' : body.goal;
  if (typeof goal !== 'string' || goal.trim().length > GOAL_MAX_LENGTH || /[\r\n]/.test(goal)) {
    return badRequest(res, 'goal', 'invalid_goal', `Keep it to one line of at most ${GOAL_MAX_LENGTH} characters.`);
  }
  if (body.consent_processing !== true) {
    return badRequest(res, 'consent_processing', 'consent_required', 'Please agree to the analysis of your public GitHub profile to join.');
  }
  const stageConsent = body.stage_display_consent === true;

  const outcome = inTransaction(db, () => {
    if (db.prepare('SELECT 1 FROM participants WHERE github_username = ?').get(login)) return { kind: 'duplicate' as const };
    const policy = getAdmissionPolicy();
    const active = countActiveParticipants(db);
    if ((policy.intakeLocked || active >= policy.maxRoomCapacity) && !isPrewarmed(db, login)) {
      return { kind: 'full' as const, message: capacityMessage(active, policy), active, policy };
    }

    const now = new Date().toISOString();
    let participant: Participant | null = null;
    for (let attempt = 0; attempt < 5 && !participant; attempt += 1) {
      const id = randomUUID();
      const alias = displayAliasFor(id);
      if (db.prepare('SELECT 1 FROM participants WHERE display_alias = ?').get(alias)) continue;
      participant = ParticipantSchema.parse({
        id,
        display_alias: alias,
        github_username: login,
        github_user_id: null,
        avatar_url: null,
        website_url: website.url,
        ownership_verified: false,
        consent_status: 'granted',
        consent_granted_at: now,
        stage_display_consent: stageConsent,
        contact_card: null,
        analysis_state: 'registered',
        created_at: now,
        updated_at: now,
      });
    }
    if (!participant) throw new Error('could not allocate a unique display alias');

    db.prepare(
      `INSERT INTO participants (id, display_alias, github_username, github_user_id, avatar_url, website_url,
         ownership_verified, consent_status, consent_granted_at, stage_display_consent, contact_card, analysis_state,
         created_at, updated_at)
       VALUES (?, ?, ?, NULL, NULL, ?, 0, 'granted', ?, ?, NULL, 'registered', ?, ?)`,
    ).run(participant.id, participant.display_alias, login, website.url, now, stageConsent ? 1 : 0, now, now);

    db.prepare(
      `INSERT INTO async_jobs (id, kind, participant_id, status, payload_json, attempts, run_after, created_at, updated_at)
       VALUES (?, ?, ?, 'queued', ?, 0, ?, ?, ?)`,
    ).run(
      randomUUID(),
      ANALYZE_JOB_KIND,
      participant.id,
      JSON.stringify({ github_username: login, website_url: website.url, goal: goal.trim() || null }),
      now,
      now,
      now,
    );
    // Published last so live SSE subscribers are woken only once the rest of the registration is written.
    publishEvent(
      db,
      'participant.registered',
      {
        display_alias: participant.display_alias,
        ...(stageConsent ? { display: { stage_display_consent: true as const, github_username: login, avatar_url: null } } : {}),
      },
      { idempotencyKey: `participant.registered:${participant.id}`, occurredAt: new Date(now) },
    );
    return { kind: 'created' as const, participant };
  });

  if (outcome.kind === 'duplicate') {
    sendJson(res, 409, {
      error: 'already_registered',
      message: 'That GitHub handle has already joined. If it is yours, open Ariadne on the device you joined with.',
    });
    return;
  }
  if (outcome.kind === 'full') {
    sendJson(res, 429, {
      error: 'room_at_capacity',
      message: outcome.message,
      capacity: { active: outcome.active, max: outcome.policy.maxRoomCapacity, locked: outcome.policy.intakeLocked },
    });
    return;
  }

  const created = findParticipant(db, outcome.participant.id)!;
  res.setHeader('set-cookie', sessionCookie(createSessionToken(created.id, getSessionSecret()), isSecureRequest(req)));
  log.info('participant registered', { participant_id: created.id, display_alias: created.display_alias });
  sendJson(res, 201, { participant: selfView(created), redirect: '/me' });
}

/**
 * `DELETE /api/participants/me`: deletes the participant and everything derived from them (cascade),
 * strips their consented identity from past public events, frees their room slot and ends the session.
 * @param req - Incoming request.
 * @param res - Response.
 * @param db - Database handle.
 * @param log - Info-level logger.
 */
function withdraw(req: IncomingMessage, res: ServerResponse, db: DatabaseSync, log: { info(m: string, f?: Record<string, unknown>): void }): void {
  const id = readSession(req);
  const participant = id ? findParticipant(db, id) : undefined;
  res.setHeader('set-cookie', clearedSessionCookie(isSecureRequest(req)));
  if (!participant) {
    sendJson(res, 401, { error: 'not_signed_in' });
    return;
  }
  inTransaction(db, () => {
    for (const key of ['display', 'display_a', 'display_b']) {
      db.prepare(
        `UPDATE domain_events SET payload_json = json_remove(payload_json, '$.${key}')
         WHERE json_extract(payload_json, '$.${key}.github_username') = ?`,
      ).run(participant.github_username);
    }
    db.prepare('DELETE FROM participants WHERE id = ?').run(participant.id);
  });
  log.info('participant withdrew and data deleted', { participant_id: participant.id });
  res.writeHead(204, { 'cache-control': 'no-store' });
  res.end();
}

export const routes: RouteDefinition[] = [
  {
    method: 'GET',
    path: '/join',
    /** Serves the mobile onboarding page. */
    handler(_req, res) {
      const page = readFileSync(JOIN_PAGE);
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'content-length': page.length,
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      });
      res.end(page);
    },
  },
  {
    method: 'GET',
    path: '/api/participants/admission',
    /** Whether `/join` is open, with the room fill and the capacity notice when it is not. */
    handler(_req, res, ctx) {
      const policy = getAdmissionPolicy();
      const active = countActiveParticipants(ctx.db);
      const open = !policy.intakeLocked && active < policy.maxRoomCapacity;
      sendJson(res, 200, {
        open,
        active,
        max: policy.maxRoomCapacity,
        locked: policy.intakeLocked,
        message: open ? null : capacityMessage(active, policy),
      });
    },
  },
  {
    method: 'POST',
    path: '/api/participants',
    /** Registers a participant (see `register`). */
    handler: (req, res, ctx) => register(req, res, ctx.db, ctx.log),
  },
  {
    method: 'GET',
    path: '/api/participants/me',
    /** The signed-in participant's own profile, or 401. */
    handler(req, res, ctx) {
      const id = readSession(req);
      const participant = id ? findParticipant(ctx.db, id) : undefined;
      if (!participant) {
        if (id) res.setHeader('set-cookie', clearedSessionCookie(isSecureRequest(req)));
        sendJson(res, 401, { error: 'not_signed_in' });
        return;
      }
      sendJson(res, 200, { participant: selfView(participant) });
    },
  },
  {
    method: 'DELETE',
    path: '/api/participants/me',
    /** Withdraws and deletes the signed-in participant (see `withdraw`). */
    handler: (req, res, ctx) => withdraw(req, res, ctx.db, ctx.log),
  },
];

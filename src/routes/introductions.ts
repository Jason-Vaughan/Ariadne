import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { readSession } from '../auth/session.ts';
import { canRevealContact, IntroRoomMessageSchema, ParticipantSchema } from '../contracts/index.ts';
import type { IntroRoomMessage, IntroductionState } from '../contracts/index.ts';
import { applyDecision, requiresVerifiedOwnership } from '../matching/intro-state-machine.ts';
import type { Decision, Side } from '../matching/intro-state-machine.ts';
import type { RouteDefinition } from '../server.ts';
import { sendJson } from '../server.ts';

export const MAX_ROOM_NOTES = 200;
export const VENUE_NOTE_MAX = 120;
export const VENUE_OPTIONS = [
  { key: 'near_stage', label: 'Near Stage' },
  { key: 'coffee_area', label: 'Coffee Area' },
  { key: 'back_tables', label: 'Back Tables' },
] as const;

const ROOM_PAGE = fileURLToPath(new URL('../../public/app/intro-room.html', import.meta.url));
const MAX_BODY_BYTES = 8 * 1024;

interface Viewer {
  id: string;
  ownership_verified: number;
}

interface MatchRow {
  id: string;
  participant_a_id: string;
  participant_b_id: string;
  intro_state: IntroductionState;
  approval_a: number;
  approval_b: number;
  complementary_summary: string;
  suggested_first_collaboration: string;
  relevant_projects: string;
  shared_intro_notes: string;
}

interface PersonRow {
  display_alias: string;
  github_username: string;
  avatar_url: string | null;
  website_url: string | null;
  contact_card: string | null;
}

type Access =
  | { ok: true; viewer: Viewer; match: MatchRow; side: Side; counterpartActive: boolean }
  | { ok: false; status: number; error: string };

/**
 * Authenticates the caller and authorizes them for one match: only its two participants pass, and a
 * participant whose consent is withdrawn counts as signed out. Reports whether the counterpart's
 * consent is still granted, since a withdrawn counterpart locks the room.
 * @param req - Incoming request.
 * @param db - Database handle.
 * @param matchId - Match id from the path.
 * @returns The viewer, match and side, or the status to answer with.
 */
function authorize(req: IncomingMessage, db: DatabaseSync, matchId: string): Access {
  const viewerId = readSession(req);
  const viewer = viewerId
    ? (db.prepare("SELECT id, ownership_verified FROM participants WHERE id = ? AND consent_status = 'granted'").get(viewerId) as Viewer | undefined)
    : undefined;
  if (!viewer) return { ok: false, status: 401, error: 'not_signed_in' };
  const match = db
    .prepare(
      `SELECT id, participant_a_id, participant_b_id, intro_state, approval_a, approval_b, complementary_summary,
              suggested_first_collaboration, relevant_projects, shared_intro_notes
       FROM matches WHERE id = ?`,
    )
    .get(matchId) as MatchRow | undefined;
  if (!match) return { ok: false, status: 404, error: 'not_found' };
  const side: Side | null = match.participant_a_id === viewer.id ? 'a' : match.participant_b_id === viewer.id ? 'b' : null;
  if (!side) return { ok: false, status: 403, error: 'not_your_match' };
  const counterpartId = side === 'a' ? match.participant_b_id : match.participant_a_id;
  const counterpartActive = Boolean(
    db.prepare("SELECT 1 FROM participants WHERE id = ? AND consent_status = 'granted'").get(counterpartId),
  );
  return { ok: true, viewer, match, side, counterpartActive };
}

/**
 * Reads a small JSON object body.
 * @param req - Incoming request.
 * @returns The object, or `null` when the body is not a JSON object within the size limit.
 */
async function readJson(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) return null;
    chunks.push(chunk as Buffer);
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
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
 * Whether the match's room is unlocked: completed with both explicit approvals.
 * @param match - Match row.
 * @returns True when contact details may be revealed.
 */
function unlocked(match: MatchRow): boolean {
  return canRevealContact({ intro_state: match.intro_state, approval_a: match.approval_a === 1, approval_b: match.approval_b === 1 });
}

/**
 * Parses stored room notes, dropping anything that fails the contract.
 * @param text - `matches.shared_intro_notes`.
 * @returns Valid notes in order.
 */
function storedNotes(text: string): IntroRoomMessage[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  return Array.isArray(parsed) ? parsed.filter((n): n is IntroRoomMessage => IntroRoomMessageSchema.safeParse(n).success) : [];
}

/**
 * The room as one participant sees it: both identities revealed, the icebreaker, venue options and notes.
 * @param db - Database handle.
 * @param match - Unlocked match.
 * @param side - Viewer's side.
 * @returns Room payload.
 */
function roomView(db: DatabaseSync, match: MatchRow, side: Side) {
  const lookup = db.prepare('SELECT display_alias, github_username, avatar_url, website_url, contact_card FROM participants WHERE id = ?');
  const meId = side === 'a' ? match.participant_a_id : match.participant_b_id;
  const otherId = side === 'a' ? match.participant_b_id : match.participant_a_id;
  const me = lookup.get(meId) as unknown as PersonRow;
  const other = lookup.get(otherId) as unknown as PersonRow;
  let projects: unknown;
  try {
    projects = JSON.parse(match.relevant_projects);
  } catch {
    projects = [];
  }
  return {
    match_id: match.id,
    me: { display_alias: me.display_alias, github_username: me.github_username, contact_card: me.contact_card },
    counterpart: {
      display_alias: other.display_alias,
      github_username: other.github_username,
      github_url: `https://github.com/${other.github_username}`,
      avatar_url: other.avatar_url,
      website_url: other.website_url,
      contact_card: other.contact_card,
    },
    icebreaker: {
      complementary_summary: match.complementary_summary,
      suggested_first_collaboration: match.suggested_first_collaboration,
      relevant_projects: Array.isArray(projects) ? projects.filter((p): p is string => typeof p === 'string') : [],
    },
    venue_options: VENUE_OPTIONS,
    notes: storedNotes(match.shared_intro_notes).map((n) => ({
      id: n.id,
      author: n.author_participant_id === meId ? 'me' : 'them',
      body: n.body,
      created_at: n.created_at,
    })),
  };
}

/**
 * Escapes a vCard 3.0 text value.
 * @param value - Raw text.
 * @returns Escaped text safe on one property line.
 */
export function escapeVcard(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/[,;]/g, (c) => `\\${c}`);
}

/**
 * Email addresses and phone numbers mentioned in a free-text contact card.
 * @param card - Contact card text.
 * @returns Distinct emails and phone numbers (phones normalized to `+` and digits).
 */
export function contactPoints(card: string | null): { emails: string[]; phones: string[] } {
  if (!card) return { emails: [], phones: [] };
  const emails = [...new Set(card.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [])];
  const withoutEmails = emails.reduce((text, email) => text.split(email).join(' '), card);
  const phones = [
    ...new Set(
      (withoutEmails.match(/\+?\d[\d\s().-]{5,}\d/g) ?? [])
        .map((raw) => `${raw.trim().startsWith('+') ? '+' : ''}${raw.replace(/\D/g, '')}`)
        .filter((phone) => phone.replace('+', '').length >= 7 && phone.replace('+', '').length <= 15),
    ),
  ];
  return { emails, phones };
}

/**
 * vCard 3.0 for the counterpart, with CRLF line endings.
 * @param person - Counterpart identity.
 * @returns The `.vcf` text.
 */
export function buildVcard(person: PersonRow): string {
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${escapeVcard(`@${person.github_username}`)}`,
    `NICKNAME:${escapeVcard(person.display_alias)}`,
    `URL;TYPE=github:https://github.com/${escapeVcard(person.github_username)}`,
  ];
  if (person.website_url?.startsWith('https://')) lines.push(`URL;TYPE=website:${escapeVcard(person.website_url)}`);
  const points = contactPoints(person.contact_card);
  for (const email of points.emails) lines.push(`EMAIL;TYPE=INTERNET:${escapeVcard(email)}`);
  for (const phone of points.phones) lines.push(`TEL;TYPE=CELL:${escapeVcard(phone)}`);
  lines.push(`NOTE:${escapeVcard(['Met via Ariadne', person.contact_card].filter(Boolean).join(' — '))}`);
  lines.push('END:VCARD');
  return `${lines.join('\r\n')}\r\n`;
}

/**
 * Sends the outcome of a refused or rejected access check.
 * @param res - Response.
 * @param access - Failed access result.
 */
function deny(res: ServerResponse, access: Extract<Access, { ok: false }>): void {
  sendJson(res, access.status, { error: access.error });
}

/**
 * `POST /api/matches/:id/decision` — Interested or Pass by one of the match's participants.
 * @param req - Incoming request.
 * @param res - Response.
 * @param db - Database handle.
 * @param matchId - Match id.
 * @param log - Info logger.
 */
async function decide(req: IncomingMessage, res: ServerResponse, db: DatabaseSync, matchId: string, log: { info(m: string, f?: Record<string, unknown>): void }): Promise<void> {
  const body = await readJson(req);
  const decision = body?.decision;
  if (decision !== 'interested' && decision !== 'pass') {
    sendJson(res, 400, { error: 'invalid_decision', message: "decision must be 'interested' or 'pass'" });
    return;
  }
  const result = inTransaction(db, () => {
    const access = authorize(req, db, matchId);
    if (!access.ok) return access;
    if (!access.counterpartActive) return { ok: false as const, status: 409, error: 'participant_withdrawn' };
    const verified = requiresVerifiedOwnership() ? access.viewer.ownership_verified === 1 : true;
    return { ok: true as const, side: access.side, ...applyDecision(db, access.match, access.side, decision as Decision, verified) };
  });
  if (!result.ok) return deny(res, result);
  switch (result.outcome) {
    case 'allowed':
      log.info('intro decision applied', { match_id: matchId, side: result.side, decision, state: result.state });
      return sendJson(res, 200, { state: result.state, completed: result.completed, room: result.completed ? `/me/matches/${matchId}` : null });
    case 'noop':
      return sendJson(res, 200, { state: result.state, completed: result.state === 'completed', noop: true });
    case 'unverified':
      return sendJson(res, 403, { error: 'verification_required', message: 'Verify your GitHub ownership to connect.' });
    default:
      return sendJson(res, 409, { error: 'not_allowed', state: result.state, message: 'This introduction can no longer change that way.' });
  }
}

/**
 * `POST /api/matches/:id/room` — a chat message or a venue pin from one participant of an unlocked room.
 * @param req - Incoming request.
 * @param res - Response.
 * @param db - Database handle.
 * @param matchId - Match id.
 */
async function postToRoom(req: IncomingMessage, res: ServerResponse, db: DatabaseSync, matchId: string): Promise<void> {
  const body = await readJson(req);
  if (!body) return sendJson(res, 400, { error: 'invalid_request' });
  let text: string | null = null;
  if (typeof body.venue === 'string') {
    const option = VENUE_OPTIONS.find((o) => o.key === body.venue);
    if (option) text = `📍 ${option.label}`;
    else if (body.venue === 'custom' && typeof body.venue_note === 'string') {
      const note = body.venue_note.trim();
      if (!note || note.length > VENUE_NOTE_MAX || /[\r\n]/.test(note)) {
        return sendJson(res, 400, { error: 'invalid_venue', message: `Describe where you are in at most ${VENUE_NOTE_MAX} characters.` });
      }
      text = `📍 ${note}`;
    } else return sendJson(res, 400, { error: 'invalid_venue' });
  } else if (typeof body.message === 'string') {
    text = body.message.trim();
  }
  if (!text) return sendJson(res, 400, { error: 'empty_message' });

  const result = inTransaction(db, () => {
    const access = authorize(req, db, matchId);
    if (!access.ok) return access;
    if (!access.counterpartActive) return { ok: false as const, status: 403, error: 'participant_withdrawn' };
    if (!unlocked(access.match)) return { ok: false as const, status: 403, error: 'room_locked' };
    const notes = storedNotes(access.match.shared_intro_notes);
    if (notes.length >= MAX_ROOM_NOTES) return { ok: false as const, status: 429, error: 'room_full' };
    const parsed = IntroRoomMessageSchema.safeParse({
      id: randomUUID(),
      author_participant_id: access.viewer.id,
      body: text,
      created_at: new Date().toISOString(),
    });
    if (!parsed.success) return { ok: false as const, status: 400, error: 'invalid_message' };
    db.prepare('UPDATE matches SET shared_intro_notes = ?, updated_at = ? WHERE id = ?').run(
      JSON.stringify([...notes, parsed.data]),
      parsed.data.created_at,
      matchId,
    );
    const updated = { ...access.match, shared_intro_notes: JSON.stringify([...notes, parsed.data]) };
    return { ok: true as const, room: roomView(db, updated, access.side) };
  });
  if (!result.ok) return deny(res, result);
  sendJson(res, 201, result.room);
}

/**
 * `PUT /api/me/contact-card` — the signed-in participant sets or clears their own contact card, which
 * only their completed-intro counterparts ever see.
 * @param req - Incoming request.
 * @param res - Response.
 * @param db - Database handle.
 */
async function saveContactCard(req: IncomingMessage, res: ServerResponse, db: DatabaseSync): Promise<void> {
  const viewerId = readSession(req);
  const exists = viewerId ? db.prepare("SELECT 1 FROM participants WHERE id = ? AND consent_status = 'granted'").get(viewerId) : undefined;
  if (!viewerId || !exists) return sendJson(res, 401, { error: 'not_signed_in' });
  const body = await readJson(req);
  const raw = body?.contact_card;
  const value = typeof raw === 'string' ? raw.trim() || null : raw === null ? null : undefined;
  const parsed = ParticipantSchema.shape.contact_card.safeParse(value);
  if (value === undefined || !parsed.success) {
    return sendJson(res, 400, { error: 'invalid_contact_card', message: 'Keep your contact note to 280 characters.' });
  }
  db.prepare('UPDATE participants SET contact_card = ?, updated_at = ? WHERE id = ?').run(parsed.data, new Date().toISOString(), viewerId);
  sendJson(res, 200, { contact_card: parsed.data });
}

export const routes: RouteDefinition[] = [
  {
    method: 'POST',
    path: '/api/matches/:id/decision',
    /** Interested / Pass (see `decide`). */
    handler: (req, res, ctx) => decide(req, res, ctx.db, ctx.params.id ?? '', ctx.log),
  },
  {
    method: 'GET',
    path: '/api/matches/:id/room',
    /** The unlocked private intro room, or 403 `room_locked` until both have approved. */
    handler(req, res, ctx) {
      const access = authorize(req, ctx.db, ctx.params.id ?? '');
      if (!access.ok) return deny(res, access);
      if (!access.counterpartActive) return sendJson(res, 403, { error: 'participant_withdrawn' });
      if (!unlocked(access.match)) return sendJson(res, 403, { error: 'room_locked', state: access.match.intro_state });
      sendJson(res, 200, roomView(ctx.db, access.match, access.side));
    },
  },
  {
    method: 'POST',
    path: '/api/matches/:id/room',
    /** Chat message or venue pin (see `postToRoom`). */
    handler: (req, res, ctx) => postToRoom(req, res, ctx.db, ctx.params.id ?? ''),
  },
  {
    method: 'GET',
    path: '/api/matches/:id/vcard',
    /** The counterpart's vCard, only from an unlocked room. */
    handler(req, res, ctx) {
      const access = authorize(req, ctx.db, ctx.params.id ?? '');
      if (!access.ok) return deny(res, access);
      if (!access.counterpartActive) return sendJson(res, 403, { error: 'participant_withdrawn' });
      if (!unlocked(access.match)) return sendJson(res, 403, { error: 'room_locked' });
      const otherId = access.side === 'a' ? access.match.participant_b_id : access.match.participant_a_id;
      const person = ctx.db
        .prepare('SELECT display_alias, github_username, avatar_url, website_url, contact_card FROM participants WHERE id = ?')
        .get(otherId) as unknown as PersonRow;
      const card = Buffer.from(buildVcard(person), 'utf8');
      res.writeHead(200, {
        'content-type': 'text/vcard; charset=utf-8',
        'content-disposition': `attachment; filename="${person.github_username}.vcf"`,
        'content-length': card.length,
        'cache-control': 'no-store',
      });
      res.end(card);
    },
  },
  {
    method: 'PUT',
    path: '/api/me/contact-card',
    /** Sets or clears the caller's own contact card (see `saveContactCard`). */
    handler: (req, res, ctx) => saveContactCard(req, res, ctx.db),
  },
  {
    method: 'GET',
    path: '/me/matches/:id',
    /** Serves the intro room page to the match's participants; signed-out visitors go to `/join`. */
    handler(req, res, ctx) {
      const access = authorize(req, ctx.db, ctx.params.id ?? '');
      if (!access.ok && access.status === 401) {
        res.writeHead(302, { location: '/join', 'cache-control': 'no-store' });
        res.end();
        return;
      }
      if (!access.ok) return deny(res, access);
      const page = readFileSync(ROOM_PAGE);
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'content-length': page.length,
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      });
      res.end(page);
    },
  },
];

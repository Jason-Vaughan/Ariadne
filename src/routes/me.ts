import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { readSession } from '../auth/session.ts';
import { MATCH_SURFACE_THRESHOLD } from '../contracts/index.ts';
import type { IntroductionState } from '../contracts/index.ts';
import { latestSeqId } from '../events/bus.ts';
import { FINGERPRINT_AXES, FINGERPRINT_AXIS_LABELS } from '../github/connector.ts';
import type { RouteDefinition } from '../server.ts';
import { sendJson } from '../server.ts';

export const TOP_MATCHES = 3;
export const MATCH_REFRESH_JOB_KIND = 'matches.refresh';

const ME_PAGE = fileURLToPath(new URL('../../public/app/me.html', import.meta.url));

export type StepStatus = 'done' | 'active' | 'pending' | 'failed';

export interface ProgressStep {
  key: 'crawl' | 'fingerprint' | 'matches';
  label: string;
  status: StepStatus;
}

interface ParticipantRow {
  id: string;
  display_alias: string;
  github_username: string;
  website_url: string | null;
  stage_display_consent: number;
  analysis_state: string;
}

interface EvidenceRow {
  id: string;
  source_type: string;
  source_url: string;
  repo_full_name: string | null;
  title_or_summary: string;
}

interface MatchRow {
  id: string;
  participant_a_id: string;
  participant_b_id: string;
  composite_score: number;
  score_breakdown: string;
  complementary_summary: string;
  relevant_projects: string;
  suggested_first_collaboration: string;
  confidence_limitations: string;
  evidence_receipt_ids: string;
  intro_state: IntroductionState;
  approval_a: number;
  approval_b: number;
}

/**
 * The participant for a request's session.
 * @param req - Incoming request.
 * @param db - Database handle.
 * @returns The participant row, or `undefined` when signed out or deleted.
 */
function sessionParticipant(req: IncomingMessage, db: DatabaseSync): ParticipantRow | undefined {
  const id = readSession(req);
  if (!id) return undefined;
  return db
    .prepare('SELECT id, display_alias, github_username, website_url, stage_display_consent, analysis_state FROM participants WHERE id = ?')
    .get(id) as ParticipantRow | undefined;
}

/**
 * Parses a JSON column, falling back when it is malformed.
 * @param text - Stored JSON.
 * @param fallback - Value used when parsing fails.
 * @returns The parsed value.
 */
function parseJson<T>(text: string | null | undefined, fallback: T): T {
  try {
    return text ? (JSON.parse(text) as T) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * The three-step research stepper derived from the analysis state and whether matches exist.
 * @param analysisState - `participants.analysis_state`.
 * @param hasFingerprint - Whether a GitHub snapshot with a fingerprint exists.
 * @param matchCount - Surfaced matches.
 * @returns The steps in order.
 */
export function progressSteps(analysisState: string, hasFingerprint: boolean, matchCount: number): ProgressStep[] {
  const steps: ProgressStep[] = [
    { key: 'crawl', label: 'GitHub + Website Crawl', status: 'pending' },
    { key: 'fingerprint', label: '6-Axis Builder Fingerprint', status: 'pending' },
    { key: 'matches', label: 'Top-3 Complementary Matches', status: 'pending' },
  ];
  const [crawl, fingerprint, matches] = steps as [ProgressStep, ProgressStep, ProgressStep];
  if (analysisState === 'registered' || analysisState === 'fetching_github') {
    crawl.status = 'active';
  } else if (analysisState === 'analyzing_profile') {
    crawl.status = 'done';
    fingerprint.status = 'active';
  } else if (analysisState === 'ready') {
    crawl.status = 'done';
    fingerprint.status = 'done';
    matches.status = matchCount > 0 ? 'done' : 'active';
  } else if (analysisState === 'failed') {
    crawl.status = hasFingerprint ? 'done' : 'failed';
    fingerprint.status = hasFingerprint ? 'failed' : 'pending';
  }
  return steps;
}

/**
 * The participant's fingerprint from their latest GitHub snapshot, expired or not.
 * @param db - Database handle.
 * @param login - GitHub login.
 * @returns Six labelled axes (0–100) and when they were computed, or `null`.
 */
function fingerprintFor(db: DatabaseSync, login: string) {
  const row = db.prepare('SELECT payload_json FROM github_snapshots WHERE github_username = ?').get(login) as
    | { payload_json: string }
    | undefined;
  const snapshot = parseJson<{ fingerprint?: Record<string, unknown>; fetched_at?: string }>(row?.payload_json, {});
  if (!snapshot.fingerprint) return null;
  const vector = snapshot.fingerprint;
  return {
    axes: FINGERPRINT_AXES.map((key) => {
      const value = Number(vector[key]);
      return { key, label: FINGERPRINT_AXIS_LABELS[key], value: Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0 };
    }),
    fetched_at: snapshot.fetched_at ?? null,
  };
}

/**
 * Evidence pills for a list of receipt ids, keeping only https sources.
 * @param db - Database handle.
 * @param ids - Receipt ids in citation order.
 * @returns The pills that exist.
 */
function evidencePills(db: DatabaseSync, ids: string[]) {
  const lookup = db.prepare(
    'SELECT id, source_type, source_url, repo_full_name, title_or_summary FROM evidence_receipts WHERE id = ?',
  );
  return ids
    .map((id) => lookup.get(id) as EvidenceRow | undefined)
    .filter((row): row is EvidenceRow => Boolean(row) && row!.source_url.startsWith('https://'))
    .map((row) => ({ ...row }));
}

/**
 * The participant's own non-dismissed capability claims (offers).
 * @param db - Database handle.
 * @param participantId - Participant id.
 * @returns Offer pills with their evidence.
 */
function offersFor(db: DatabaseSync, participantId: string) {
  const rows = db
    .prepare(
      `SELECT id, category, name, epistemic_type, proficiency_signal, confidence, uncertainty_note, evidence_receipt_ids
       FROM capability_claims WHERE participant_id = ? AND dismissed_by_user = 0 ORDER BY confidence DESC, name`,
    )
    .all(participantId) as Array<Record<string, string | number | null>>;
  return rows.map((row) => ({
    id: row.id,
    category: row.category,
    name: row.name,
    epistemic_type: row.epistemic_type,
    proficiency_signal: row.proficiency_signal,
    confidence: row.confidence,
    uncertainty_note: row.uncertainty_note,
    dismissible: row.epistemic_type === 'AI_INFERENCE',
    evidence: evidencePills(db, parseJson<string[]>(String(row.evidence_receipt_ids), [])),
  }));
}

/**
 * The participant's own non-dismissed opportunity needs.
 * @param db - Database handle.
 * @param participantId - Participant id.
 * @returns Need pills with their evidence.
 */
function needsFor(db: DatabaseSync, participantId: string) {
  const rows = db
    .prepare(
      `SELECT id, project_repo, opportunity_type, label, summary, confidence, uncertainty_note, evidence_receipt_ids
       FROM opportunity_needs WHERE participant_id = ? AND dismissed_by_user = 0 ORDER BY confidence DESC`,
    )
    .all(participantId) as Array<Record<string, string | number | null>>;
  return rows.map((row) => ({
    id: row.id,
    project_repo: row.project_repo,
    opportunity_type: row.opportunity_type,
    label: row.label,
    summary: row.summary,
    confidence: row.confidence,
    uncertainty_note: row.uncertainty_note,
    dismissible: row.label === 'Potential Opportunity (AI Inference)',
    evidence: evidencePills(db, parseJson<string[]>(String(row.evidence_receipt_ids), [])),
  }));
}

/**
 * The participant's top surfaced matches, viewed from their side. A counterpart's GitHub identity
 * appears only with their stage-display consent or after a completed bilateral introduction;
 * contact cards are never included here (they belong to the A-012 introduction room).
 * @param db - Database handle.
 * @param participantId - The viewer.
 * @returns Up to `TOP_MATCHES` cards ordered by score.
 */
function matchesFor(db: DatabaseSync, participantId: string) {
  const rows = db
    .prepare(
      `SELECT id, participant_a_id, participant_b_id, composite_score, score_breakdown, complementary_summary,
              relevant_projects, suggested_first_collaboration, confidence_limitations, evidence_receipt_ids,
              intro_state, approval_a, approval_b
       FROM matches
       WHERE (participant_a_id = ? OR participant_b_id = ?) AND composite_score >= ? AND intro_state <> 'declined'
       ORDER BY composite_score DESC, id LIMIT ?`,
    )
    .all(participantId, participantId, MATCH_SURFACE_THRESHOLD, TOP_MATCHES) as unknown as MatchRow[];
  const counterpartLookup = db.prepare(
    'SELECT display_alias, github_username, avatar_url, stage_display_consent FROM participants WHERE id = ?',
  );
  return rows.map((row) => {
    const iAmA = row.participant_a_id === participantId;
    const other = counterpartLookup.get(iAmA ? row.participant_b_id : row.participant_a_id) as
      | { display_alias: string; github_username: string; avatar_url: string | null; stage_display_consent: number }
      | undefined;
    const revealed =
      Boolean(other) &&
      (other!.stage_display_consent === 1 || (row.intro_state === 'completed' && row.approval_a === 1 && row.approval_b === 1));
    const mine = iAmA ? row.approval_a === 1 : row.approval_b === 1;
    const theirs = iAmA ? row.approval_b === 1 : row.approval_a === 1;
    return {
      id: row.id,
      counterpart: {
        display_alias: other?.display_alias ?? 'Unknown',
        github_username: revealed ? other!.github_username : null,
        avatar_url: revealed ? other!.avatar_url : null,
      },
      composite_score: row.composite_score,
      score_breakdown: parseJson<Record<string, number>>(row.score_breakdown, {}),
      complementary_summary: row.complementary_summary,
      relevant_projects: parseJson<string[]>(row.relevant_projects, []),
      suggested_first_collaboration: row.suggested_first_collaboration,
      confidence_limitations: row.confidence_limitations,
      evidence: evidencePills(db, parseJson<string[]>(row.evidence_receipt_ids, [])),
      intro_state: row.intro_state,
      my_interest: mine,
      their_interest: theirs,
    };
  });
}

/**
 * Builds the `/api/me` dashboard payload.
 * @param db - Database handle.
 * @param participant - The signed-in participant.
 * @returns Profile, progress, fingerprint, offers, needs, top matches and the event cursor.
 */
export function dashboardFor(db: DatabaseSync, participant: ParticipantRow) {
  const fingerprint = fingerprintFor(db, participant.github_username);
  const matches = matchesFor(db, participant.id);
  return {
    participant: {
      id: participant.id,
      display_alias: participant.display_alias,
      github_username: participant.github_username,
      website_url: participant.website_url,
      stage_display_consent: participant.stage_display_consent === 1,
      analysis_state: participant.analysis_state,
    },
    progress: progressSteps(participant.analysis_state, fingerprint !== null, matches.length),
    fingerprint,
    offers: offersFor(db, participant.id),
    needs: needsFor(db, participant.id),
    matches,
    latest_seq_id: latestSeqId(db),
  };
}

/** The column and value that mark a record as an AI inference, per table. */
const INFERENCE_MARKER = {
  capability_claims: { column: 'epistemic_type', value: 'AI_INFERENCE' },
  opportunity_needs: { column: 'label', value: 'Potential Opportunity (AI Inference)' },
} as const;

export type DismissOutcome = 'dismissed' | 'not_found' | 'not_dismissible';

/**
 * Marks one of the participant's own AI-inferred records dismissed and queues a match refresh.
 * Observed facts and participant-confirmed needs cannot be dismissed.
 * @param db - Database handle.
 * @param table - `capability_claims` or `opportunity_needs`.
 * @param id - Record id.
 * @param participantId - Owner; records of other participants are never touched.
 * @returns What happened.
 */
function dismiss(db: DatabaseSync, table: 'capability_claims' | 'opportunity_needs', id: string, participantId: string): DismissOutcome {
  const marker = INFERENCE_MARKER[table];
  const row = db.prepare(`SELECT ${marker.column} AS kind FROM ${table} WHERE id = ? AND participant_id = ?`).get(id, participantId) as
    | { kind: string }
    | undefined;
  if (!row) return 'not_found';
  if (row.kind !== marker.value) return 'not_dismissible';
  db.prepare(`UPDATE ${table} SET dismissed_by_user = 1 WHERE id = ? AND participant_id = ?`).run(id, participantId);
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO async_jobs (id, kind, participant_id, status, payload_json, attempts, run_after, created_at, updated_at)
     VALUES (?, ?, ?, 'queued', ?, 0, ?, ?, ?)`,
  ).run(randomUUID(), MATCH_REFRESH_JOB_KIND, participantId, JSON.stringify({ reason: 'dismissed', table, id }), now, now, now);
  return 'dismissed';
}

/**
 * Route handler factory for the two dismiss endpoints.
 * @param table - Table whose record is dismissed.
 * @returns The handler.
 */
function dismissHandler(table: 'capability_claims' | 'opportunity_needs') {
  return (req: IncomingMessage, res: ServerResponse, ctx: { db: DatabaseSync; params: Record<string, string>; log: { info(m: string, f?: Record<string, unknown>): void } }) => {
    const participant = sessionParticipant(req, ctx.db);
    if (!participant) return sendJson(res, 401, { error: 'not_signed_in' });
    const outcome = dismiss(ctx.db, table, ctx.params.id ?? '', participant.id);
    if (outcome === 'not_found') return sendJson(res, 404, { error: 'not_found' });
    if (outcome === 'not_dismissible') {
      return sendJson(res, 409, { error: 'not_dismissible', message: 'Only AI inferences can be dismissed.' });
    }
    ctx.log.info('inference dismissed', { participant_id: participant.id, table, id: ctx.params.id });
    sendJson(res, 200, { dismissed: true });
  };
}

export const routes: RouteDefinition[] = [
  {
    method: 'GET',
    path: '/me',
    /** Serves the participant dashboard, or redirects a signed-out visitor to `/join`. */
    handler(req, res, ctx) {
      if (!sessionParticipant(req, ctx.db)) {
        res.writeHead(302, { location: '/join', 'cache-control': 'no-store' });
        res.end();
        return;
      }
      const page = readFileSync(ME_PAGE);
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
    path: '/api/me',
    /** The signed-in participant's dashboard data, or 401. */
    handler(req, res, ctx) {
      const participant = sessionParticipant(req, ctx.db);
      if (!participant) return sendJson(res, 401, { error: 'not_signed_in' });
      sendJson(res, 200, dashboardFor(ctx.db, participant));
    },
  },
  { method: 'POST', path: '/api/me/claims/:id/dismiss', handler: dismissHandler('capability_claims') },
  { method: 'POST', path: '/api/me/needs/:id/dismiss', handler: dismissHandler('opportunity_needs') },
];

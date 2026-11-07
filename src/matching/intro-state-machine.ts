import type { DatabaseSync } from 'node:sqlite';
import { classifyIntroTransition } from '../contracts/index.ts';
import type { IntroActor, IntroductionState, IntroTransitionOutcome, PublicDisplay } from '../contracts/index.ts';
import { publishEvent } from '../events/bus.ts';

export type Decision = 'interested' | 'pass';
export type Side = 'a' | 'b';

export interface MatchSides {
  id: string;
  participant_a_id: string;
  participant_b_id: string;
  intro_state: IntroductionState;
  approval_a: number;
  approval_b: number;
}

export interface DecisionResult {
  /** Contract outcome of the participant's own transition (`noop` for a repeated decision). */
  outcome: IntroTransitionOutcome;
  /** State after the decision (unchanged unless `outcome` is `allowed`). */
  state: IntroductionState;
  /** Whether this decision completed the introduction (both approvals in place). */
  completed: boolean;
}

/**
 * Whether intros require GitHub ownership verification rather than a signed `/join` session.
 * Zero-OAuth onboarding never verifies ownership, so by default a signed-in session counts as the
 * verified actor; `ARIADNE_REQUIRE_VERIFIED_OWNERSHIP=1` restores strict verification.
 * @param env - Environment to read.
 * @returns True when only `ownership_verified = 1` participants may propose or accept.
 */
export function requiresVerifiedOwnership(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.ARIADNE_REQUIRE_VERIFIED_OWNERSHIP === '1';
}

/**
 * The state a participant's tap asks for. A repeated tap asks for the current state, which the
 * contract classifies as an idempotent `noop`.
 * @param state - Current intro state.
 * @param side - The tapping participant's side.
 * @param decision - `interested` or `pass`.
 * @returns The requested next state.
 */
export function requestedState(state: IntroductionState, side: Side, decision: Decision): IntroductionState {
  const mine: IntroductionState = side === 'a' ? 'proposed_by_a' : 'proposed_by_b';
  const theirs: IntroductionState = side === 'a' ? 'proposed_by_b' : 'proposed_by_a';
  if (decision === 'pass') return 'declined';
  if (state === theirs) return 'mutual_accepted';
  if (state === 'mutual_accepted' || state === 'completed') return state;
  return mine;
}

/**
 * Approval flags after moving to a state; a decline keeps whatever approval existed.
 * @param state - New state.
 * @param current - Current `[approval_a, approval_b]`.
 * @returns New `[approval_a, approval_b]`.
 */
function approvalsFor(state: IntroductionState, current: [number, number]): [number, number] {
  switch (state) {
    case 'candidate':
      return [0, 0];
    case 'proposed_by_a':
      return [1, 0];
    case 'proposed_by_b':
      return [0, 1];
    case 'mutual_accepted':
    case 'completed':
      return [1, 1];
    default:
      return current;
  }
}

interface PairIdentity {
  display_alias: string;
  github_username: string;
  avatar_url: string | null;
  stage_display_consent: number;
  consent_status: string;
}

/**
 * Public pair payload for introduction events: aliases always, identity only with stage consent from a
 * participant whose overall consent is still granted.
 * @param db - Database handle.
 * @param match - The match.
 * @returns Payload fields shared by proposed/accepted/completed events.
 */
function pairPayload(db: DatabaseSync, match: MatchSides) {
  const lookup = db.prepare(
    'SELECT display_alias, github_username, avatar_url, stage_display_consent, consent_status FROM participants WHERE id = ?',
  );
  const a = lookup.get(match.participant_a_id) as unknown as PairIdentity;
  const b = lookup.get(match.participant_b_id) as unknown as PairIdentity;
  const display = (p: PairIdentity): PublicDisplay | undefined =>
    p.stage_display_consent === 1 && p.consent_status === 'granted'
      ? { stage_display_consent: true, github_username: p.github_username, avatar_url: p.avatar_url }
      : undefined;
  const displayA = display(a);
  const displayB = display(b);
  return {
    match_id: match.id,
    display_alias_a: a.display_alias,
    display_alias_b: b.display_alias,
    ...(displayA ? { display_a: displayA } : {}),
    ...(displayB ? { display_b: displayB } : {}),
  };
}

/**
 * Writes a new state and approvals.
 * @param db - Database handle.
 * @param id - Match id.
 * @param state - New state.
 * @param approvals - New `[approval_a, approval_b]`.
 * @param now - Update time.
 */
function writeState(db: DatabaseSync, id: string, state: IntroductionState, approvals: [number, number], now: string): void {
  db.prepare('UPDATE matches SET intro_state = ?, approval_a = ?, approval_b = ?, updated_at = ? WHERE id = ?').run(
    state,
    approvals[0],
    approvals[1],
    now,
    id,
  );
}

/**
 * Applies one participant's Interested/Pass decision. Must run inside a write transaction.
 * The second Interested completes the intro immediately (system step), emitting
 * `introduction.accepted` and `introduction.completed` once each; a Pass emits only the public
 * declined counter. Repeated decisions change nothing and emit nothing.
 * @param db - Database handle.
 * @param match - The match as currently stored.
 * @param side - The deciding participant's side.
 * @param decision - `interested` or `pass`.
 * @param verified - Whether the deciding participant counts as verified.
 * @param now - Decision time.
 * @returns The outcome and resulting state.
 */
export function applyDecision(
  db: DatabaseSync,
  match: MatchSides,
  side: Side,
  decision: Decision,
  verified: boolean,
  now: Date = new Date(),
): DecisionResult {
  const target = requestedState(match.intro_state, side, decision);
  const actor: IntroActor = { side, verified };
  const outcome = classifyIntroTransition(match.intro_state, target, actor);
  if (outcome !== 'allowed') return { outcome, state: match.intro_state, completed: false };

  const at = now.toISOString();
  const current: [number, number] = [match.approval_a, match.approval_b];
  writeState(db, match.id, target, approvalsFor(target, current), at);

  if (target === 'declined') {
    const row = db.prepare("SELECT COUNT(*) AS n FROM matches WHERE intro_state = 'declined'").get() as { n: number };
    publishEvent(db, 'introduction.declined', { declined_total: Number(row.n) }, { idempotencyKey: `${match.id}:intro:declined`, occurredAt: now });
    return { outcome, state: target, completed: false };
  }

  const pair = pairPayload(db, match);
  if (target === 'proposed_by_a' || target === 'proposed_by_b') {
    publishEvent(db, 'introduction.proposed', pair, { idempotencyKey: `${match.id}:intro:proposed`, occurredAt: now });
    return { outcome, state: target, completed: false };
  }

  // target === 'mutual_accepted': the system completes the introduction in the same transaction.
  publishEvent(db, 'introduction.accepted', pair, { idempotencyKey: `${match.id}:intro:accepted`, occurredAt: now });
  const completion = classifyIntroTransition('mutual_accepted', 'completed', { side: 'system', verified: false });
  if (completion !== 'allowed') throw new Error(`mutual_accepted -> completed refused: ${completion}`);
  writeState(db, match.id, 'completed', [1, 1], at);
  publishEvent(db, 'introduction.completed', { ...pair, channel: 'web' }, { idempotencyKey: `${match.id}:intro:completed`, occurredAt: now });
  return { outcome, state: 'completed', completed: true };
}

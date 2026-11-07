import { z } from 'zod';

/** RFC 4122 UUID used for every entity id. */
export const IdSchema = z.uuid();

/** ISO-8601 UTC timestamp with offset, e.g. `2026-11-07T17:30:00Z`. */
export const TimestampSchema = z.iso.datetime({ offset: true });

/** Confidence score in the closed range 0.0–1.0. */
export const ConfidenceSchema = z.number().min(0).max(1);

/**
 * Stage-safe display alias such as `Thread-7C4E`. The fixed shape guarantees an
 * alias can never carry a GitHub login or other identifying text.
 */
export const DisplayAliasSchema = z.string().regex(/^[A-Z][a-z]{1,15}-[0-9A-F]{4}$/);

/** Normalized (lowercase) GitHub login, following GitHub's own login rules. */
export const GithubUsernameSchema = z
  .string()
  .regex(/^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,38}$/);

/** Any absolute `https:` URL. */
export const HttpsUrlSchema = z.url({ protocol: /^https$/ });

/** `owner/repo` GitHub repository name. */
export const RepoFullNameSchema = z.string().regex(/^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/);

// ---------------------------------------------------------------------------
// Participant
// ---------------------------------------------------------------------------

export const CONSENT_STATUSES = ['granted', 'withdrawn'] as const;
export const ConsentStatusSchema = z.enum(CONSENT_STATUSES);
export type ConsentStatus = z.infer<typeof ConsentStatusSchema>;

export const ANALYSIS_STATES = [
  'registered',
  'fetching_github',
  'analyzing_profile',
  'ready',
  'failed',
  'withdrawn',
] as const;
export const AnalysisStateSchema = z.enum(ANALYSIS_STATES);
export type AnalysisState = z.infer<typeof AnalysisStateSchema>;

export const ParticipantSchema = z.strictObject({
  id: IdSchema,
  display_alias: DisplayAliasSchema,
  github_username: GithubUsernameSchema,
  github_user_id: z.number().int().positive().nullable(),
  avatar_url: HttpsUrlSchema.nullable(),
  website_url: HttpsUrlSchema.nullable().optional(),
  ownership_verified: z.boolean().default(false),
  consent_status: ConsentStatusSchema,
  consent_granted_at: TimestampSchema,
  stage_display_consent: z.boolean().default(false),
  contact_card: z.string().max(280).nullable(),
  analysis_state: AnalysisStateSchema,
  created_at: TimestampSchema,
  updated_at: TimestampSchema,
});
export type Participant = z.infer<typeof ParticipantSchema>;

// ---------------------------------------------------------------------------
// EvidenceReceipt
// ---------------------------------------------------------------------------

export const EVIDENCE_SOURCE_TYPES = [
  'repo_metadata',
  'readme_excerpt',
  'commit_activity',
  'open_issue',
  'pull_request',
  'user_profile',
  'public_website',
] as const;
export const EvidenceSourceTypeSchema = z.enum(EVIDENCE_SOURCE_TYPES);
export type EvidenceSourceType = z.infer<typeof EvidenceSourceTypeSchema>;

/**
 * Whether a URL points at github.com, the only host GitHub-sourced evidence may cite.
 * @param url - Absolute URL to check.
 * @returns True when the host is exactly `github.com`.
 */
export function isGithubPermalink(url: string): boolean {
  return new URL(url).hostname === 'github.com';
}

export const EvidenceReceiptSchema = z
  .strictObject({
    id: IdSchema,
    participant_id: IdSchema,
    source_type: EvidenceSourceTypeSchema,
    source_url: HttpsUrlSchema,
    repo_full_name: RepoFullNameSchema.nullable(),
    title_or_summary: z.string().min(1).max(280),
    source_updated_at: TimestampSchema,
    fetched_at: TimestampSchema,
  })
  .refine((r) => r.source_type === 'public_website' || isGithubPermalink(r.source_url), {
    path: ['source_url'],
    message: 'GitHub evidence must cite a https://github.com/ permalink',
  });
export type EvidenceReceipt = z.infer<typeof EvidenceReceiptSchema>;

// ---------------------------------------------------------------------------
// CapabilityClaim
// ---------------------------------------------------------------------------

export const CAPABILITY_CATEGORIES = [
  'language',
  'framework',
  'domain',
  'systems_architecture',
  'tooling',
] as const;
export const CapabilityCategorySchema = z.enum(CAPABILITY_CATEGORIES);

export const EPISTEMIC_TYPES = ['SELF_REPORTED', 'OBSERVED_FACT', 'AI_INFERENCE'] as const;
export const EpistemicTypeSchema = z.enum(EPISTEMIC_TYPES);
export type EpistemicType = z.infer<typeof EpistemicTypeSchema>;

export const PROFICIENCY_SIGNALS = ['primary', 'active', 'exploratory'] as const;
export const ProficiencySignalSchema = z.enum(PROFICIENCY_SIGNALS);

/** Below this confidence a claim must explain its uncertainty. */
export const UNCERTAINTY_NOTE_THRESHOLD = 0.75;

export const CapabilityClaimSchema = z
  .strictObject({
    id: IdSchema,
    participant_id: IdSchema,
    category: CapabilityCategorySchema,
    name: z.string().min(1).max(80),
    epistemic_type: EpistemicTypeSchema,
    proficiency_signal: ProficiencySignalSchema,
    confidence: ConfidenceSchema,
    uncertainty_note: z.string().min(1).max(280).nullable(),
    evidence_receipt_ids: z.array(IdSchema).min(1),
    dismissed_by_user: z.boolean().default(false),
  })
  .refine(
    (c) =>
      c.uncertainty_note !== null ||
      (c.confidence >= UNCERTAINTY_NOTE_THRESHOLD && c.epistemic_type !== 'AI_INFERENCE'),
    {
      path: ['uncertainty_note'],
      message: 'uncertainty_note is required when confidence < 0.75 or epistemic_type is AI_INFERENCE',
    },
  );
export type CapabilityClaim = z.infer<typeof CapabilityClaimSchema>;

// ---------------------------------------------------------------------------
// OpportunityNeed
// ---------------------------------------------------------------------------

export const OPPORTUNITY_TYPES = [
  'open_issue_help',
  'complementary_skill_gap',
  'architecture_scaling',
  'shared_research_domain',
] as const;
export const OpportunityTypeSchema = z.enum(OPPORTUNITY_TYPES);
export type OpportunityType = z.infer<typeof OpportunityTypeSchema>;

export const OPPORTUNITY_LABELS = [
  'Potential Opportunity (AI Inference)',
  'Participant Confirmed Need',
] as const;
export const OpportunityLabelSchema = z.enum(OPPORTUNITY_LABELS);

export const OpportunityNeedSchema = z.strictObject({
  id: IdSchema,
  participant_id: IdSchema,
  project_repo: RepoFullNameSchema,
  opportunity_type: OpportunityTypeSchema,
  label: OpportunityLabelSchema.default('Potential Opportunity (AI Inference)'),
  summary: z.string().min(1).max(240),
  desired_capabilities: z.array(z.string().min(1).max(80)),
  confidence: ConfidenceSchema,
  uncertainty_note: z.string().min(1).max(280),
  evidence_receipt_ids: z.array(IdSchema),
  dismissed_by_user: z.boolean().default(false),
});
export type OpportunityNeed = z.infer<typeof OpportunityNeedSchema>;

// ---------------------------------------------------------------------------
// MatchProposal
// ---------------------------------------------------------------------------

/** Minimum composite score for a match to be surfaced. */
export const MATCH_SURFACE_THRESHOLD = 45;

/** Weights of the five-component hybrid match score (TangleClaw Rule #314.3). They sum to 1. */
export const SCORE_WEIGHTS = {
  capability_similarity: 0.35,
  need_offer_fit: 0.3,
  complementarity: 0.15,
  novelty: 0.1,
  freshness: 0.1,
} as const;

/**
 * The five normalized score components, each in 0.0–1.0:
 * - `capability_similarity`: cos(u, v) of the two capability vectors.
 * - `need_offer_fit`: max(cos(n_u, o_v), cos(n_v, o_u)) — one side's needs against the other's offers.
 * - `complementarity`, `novelty`, `freshness`: as defined in MATCH_SCORING_SPEC.md.
 */
export const ScoreBreakdownSchema = z.strictObject({
  capability_similarity: z.number().min(0).max(1),
  need_offer_fit: z.number().min(0).max(1),
  complementarity: z.number().min(0).max(1),
  novelty: z.number().min(0).max(1),
  freshness: z.number().min(0).max(1),
});
export type ScoreBreakdown = z.infer<typeof ScoreBreakdownSchema>;

/**
 * Highest score a pair with nothing to trade can reach (MATCH_SCORING_SPEC.md TC-SCORE-02).
 * It sits below MATCH_SURFACE_THRESHOLD so similarity and freshness alone never surface a clone.
 */
export const ANTI_CLONE_SCORE_CAP = 38;

/**
 * Whether a pair has nothing distinct to trade: no need/offer fit and no complementary layers.
 * @param breakdown - The five normalized components.
 * @returns True when the anti-clone cap applies.
 */
export function isCloneLike(breakdown: ScoreBreakdown): boolean {
  return breakdown.need_offer_fit === 0 && breakdown.complementarity === 0;
}

/**
 * Composite score: `round(100 × (0.35·capability_similarity + 0.30·need_offer_fit
 * + 0.15·complementarity + 0.10·novelty + 0.10·freshness))`, capped at
 * ANTI_CLONE_SCORE_CAP when the pair is clone-like.
 * @param breakdown - The five normalized components.
 * @returns Integer score in 0–100.
 */
export function compositeScore(breakdown: ScoreBreakdown): number {
  const weighted =
    SCORE_WEIGHTS.capability_similarity * breakdown.capability_similarity +
    SCORE_WEIGHTS.need_offer_fit * breakdown.need_offer_fit +
    SCORE_WEIGHTS.complementarity * breakdown.complementarity +
    SCORE_WEIGHTS.novelty * breakdown.novelty +
    SCORE_WEIGHTS.freshness * breakdown.freshness;
  const score = Math.round(weighted * 100);
  return isCloneLike(breakdown) ? Math.min(score, ANTI_CLONE_SCORE_CAP) : score;
}

export const INTRODUCTION_STATES = [
  'candidate',
  'proposed_by_a',
  'proposed_by_b',
  'mutual_accepted',
  'completed',
  'declined',
] as const;
export const IntroductionStateSchema = z.enum(INTRODUCTION_STATES);
export type IntroductionState = z.infer<typeof IntroductionStateSchema>;

export const IntroRoomMessageSchema = z.strictObject({
  id: IdSchema,
  author_participant_id: IdSchema,
  body: z.string().min(1).max(1000),
  created_at: TimestampSchema,
});
export type IntroRoomMessage = z.infer<typeof IntroRoomMessageSchema>;

/**
 * Approval flags each intro state requires, as `[approval_a, approval_b]`. A decline
 * may follow one participant's approval, so it only rules out a mutual approval.
 */
const APPROVALS_BY_STATE: Readonly<Record<IntroductionState, readonly [boolean, boolean] | null>> = {
  candidate: [false, false],
  proposed_by_a: [true, false],
  proposed_by_b: [false, true],
  mutual_accepted: [true, true],
  completed: [true, true],
  declined: null,
};

/**
 * Whether a match's approval flags are consistent with its introduction state.
 * @param state - The match's intro state.
 * @param approvalA - Whether participant A explicitly approved.
 * @param approvalB - Whether participant B explicitly approved.
 * @returns True when the flags are exactly what the state implies.
 */
export function approvalsMatchState(state: IntroductionState, approvalA: boolean, approvalB: boolean): boolean {
  const required = APPROVALS_BY_STATE[state];
  if (required === null) return !(approvalA && approvalB);
  return required[0] === approvalA && required[1] === approvalB;
}

export const MatchProposalSchema = z
  .strictObject({
    id: IdSchema,
    participant_a_id: IdSchema,
    participant_b_id: IdSchema,
    composite_score: z.number().int().min(0).max(100),
    score_breakdown: ScoreBreakdownSchema,
    complementary_summary: z.string().min(1).max(600),
    relevant_projects: z.array(RepoFullNameSchema),
    suggested_first_collaboration: z.string().min(1).max(600),
    confidence_limitations: z.string().min(1).max(600),
    evidence_receipt_ids: z.array(IdSchema).min(2),
    intro_state: IntroductionStateSchema,
    approval_a: z.boolean().default(false),
    approval_b: z.boolean().default(false),
    shared_intro_notes: z.array(IntroRoomMessageSchema).default([]),
  })
  .refine((m) => m.participant_a_id < m.participant_b_id, {
    path: ['participant_b_id'],
    message: 'participant_a_id must sort strictly before participant_b_id',
  })
  .refine((m) => m.composite_score === compositeScore(m.score_breakdown), {
    path: ['composite_score'],
    message: 'composite_score must equal compositeScore(score_breakdown)',
  })
  .refine((m) => approvalsMatchState(m.intro_state, m.approval_a, m.approval_b), {
    path: ['intro_state'],
    message: 'approval_a / approval_b must match intro_state',
  })
  .refine((m) => m.intro_state === 'completed' || m.shared_intro_notes.length === 0, {
    path: ['shared_intro_notes'],
    message: 'shared_intro_notes exist only once the introduction is completed',
  })
  .refine(
    (m) =>
      m.shared_intro_notes.every(
        (n) => n.author_participant_id === m.participant_a_id || n.author_participant_id === m.participant_b_id,
      ),
    { path: ['shared_intro_notes'], message: 'intro notes must be authored by a match participant' },
  );
export type MatchProposal = z.infer<typeof MatchProposalSchema>;

/**
 * Whether contact cards may be returned for a match: only after BOTH participants
 * explicitly approved and the introduction completed.
 * @param match - The match's state and approval flags.
 * @returns True only when contact details may be revealed to the two participants.
 */
export function canRevealContact(match: Pick<MatchProposal, 'intro_state' | 'approval_a' | 'approval_b'>): boolean {
  return match.intro_state === 'completed' && match.approval_a && match.approval_b;
}

// ---------------------------------------------------------------------------
// Mutual-introduction state machine
// ---------------------------------------------------------------------------

/** Who requests a transition: participant A, participant B, or the system. */
export type IntroActorSide = 'a' | 'b' | 'system';

/** The acting party and whether it has `ownership_verified === true`. */
export interface IntroActor {
  readonly side: IntroActorSide;
  readonly verified: boolean;
}

interface IntroEdge {
  readonly to: IntroductionState;
  readonly actor: IntroActorSide;
  readonly requiresVerifiedActor: boolean;
}

/**
 * Allowed edges of the mutual-introduction state machine (DATA_AND_EVENTS_CONTRACT.md §2).
 * Each edge names the only party that may take it, so the approval completing
 * `mutual_accepted` always comes from the participant who did not propose.
 */
export const INTRO_TRANSITIONS: Readonly<Record<IntroductionState, readonly IntroEdge[]>> = {
  candidate: [
    { to: 'proposed_by_a', actor: 'a', requiresVerifiedActor: true },
    { to: 'proposed_by_b', actor: 'b', requiresVerifiedActor: true },
    { to: 'declined', actor: 'a', requiresVerifiedActor: false },
    { to: 'declined', actor: 'b', requiresVerifiedActor: false },
  ],
  proposed_by_a: [
    { to: 'mutual_accepted', actor: 'b', requiresVerifiedActor: true },
    { to: 'declined', actor: 'b', requiresVerifiedActor: false },
  ],
  proposed_by_b: [
    { to: 'mutual_accepted', actor: 'a', requiresVerifiedActor: true },
    { to: 'declined', actor: 'a', requiresVerifiedActor: false },
  ],
  mutual_accepted: [{ to: 'completed', actor: 'system', requiresVerifiedActor: false }],
  completed: [],
  declined: [],
};

/**
 * Outcome of a requested introduction transition.
 * - `allowed`: apply it and emit its event.
 * - `noop`: the match is already in that state; answer idempotently and emit nothing.
 * - `wrong_actor`: the edge exists but belongs to another party.
 * - `unverified`: the right party, but it has not verified GitHub ownership.
 * - `forbidden`: no such edge.
 */
export type IntroTransitionOutcome = 'allowed' | 'noop' | 'wrong_actor' | 'unverified' | 'forbidden';

/**
 * Classify a requested introduction state change.
 * @param from - Current state of the match.
 * @param to - Requested next state.
 * @param actor - The requesting party and its verification status.
 * @returns How the caller should treat the request.
 */
export function classifyIntroTransition(
  from: IntroductionState,
  to: IntroductionState,
  actor: IntroActor,
): IntroTransitionOutcome {
  if (from === to) return 'noop';
  const edges = INTRO_TRANSITIONS[from].filter((e) => e.to === to);
  if (edges.length === 0) return 'forbidden';
  const edge = edges.find((e) => e.actor === actor.side);
  if (!edge) return 'wrong_actor';
  if (edge.requiresVerifiedActor && !actor.verified) return 'unverified';
  return 'allowed';
}

/**
 * Whether a state change may be applied. A same-state request returns false: it
 * is an idempotent no-op, not a transition, and must not emit a second event.
 * @param from - Current state of the match.
 * @param to - Requested next state.
 * @param actor - The requesting party and its verification status.
 * @returns True only when the transition is `allowed`.
 */
export function canTransitionIntroState(
  from: IntroductionState,
  to: IntroductionState,
  actor: IntroActor,
): boolean {
  return classifyIntroTransition(from, to, actor) === 'allowed';
}

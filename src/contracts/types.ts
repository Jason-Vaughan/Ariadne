import { z } from 'zod';

/** RFC 4122 UUID used for every entity id. */
export const IdSchema = z.uuid();

/** ISO-8601 UTC timestamp with offset, e.g. `2026-11-07T17:30:00Z`. */
export const TimestampSchema = z.iso.datetime({ offset: true });

/** Confidence score in the closed range 0.0–1.0. */
export const ConfidenceSchema = z.number().min(0).max(1);

/**
 * Stage-safe handle such as `Thread-7C4E`. The fixed shape guarantees a
 * pseudonym can never carry a GitHub login or other identifying text.
 */
export const PseudonymSchema = z.string().regex(/^[A-Z][a-z]{1,15}-[0-9A-F]{4}$/);

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
  pseudonym: PseudonymSchema,
  github_username: GithubUsernameSchema,
  github_user_id: z.number().int().positive().nullable(),
  avatar_url: HttpsUrlSchema.nullable(),
  website_url: HttpsUrlSchema.nullable().optional(),
  ownership_verified: z.boolean().default(false),
  consent_status: ConsentStatusSchema,
  consent_granted_at: TimestampSchema,
  public_display_consent: z.boolean().default(false),
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

export const ScoreBreakdownSchema = z.strictObject({
  complementary_skills: z.number().min(0).max(40),
  project_relevance: z.number().min(0).max(30),
  evidence_strength: z.number().min(0).max(20),
  recency: z.number().min(0).max(10),
});
export type ScoreBreakdown = z.infer<typeof ScoreBreakdownSchema>;

/**
 * Composite score as defined by MATCH_SCORING_SPEC.md: `round(D1 + D2 + D3 + D4)`.
 * @param breakdown - The four scored dimensions.
 * @returns Integer score in 0–100.
 */
export function compositeScore(breakdown: ScoreBreakdown): number {
  return Math.round(
    breakdown.complementary_skills +
      breakdown.project_relevance +
      breakdown.evidence_strength +
      breakdown.recency,
  );
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
    shared_intro_notes: z.array(IntroRoomMessageSchema).default([]),
  })
  .refine((m) => m.participant_a_id < m.participant_b_id, {
    path: ['participant_b_id'],
    message: 'participant_a_id must sort strictly before participant_b_id',
  })
  .refine((m) => m.composite_score === compositeScore(m.score_breakdown), {
    path: ['composite_score'],
    message: 'composite_score must equal round(sum of score_breakdown)',
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

// ---------------------------------------------------------------------------
// Mutual-introduction state machine
// ---------------------------------------------------------------------------

interface IntroEdge {
  readonly to: IntroductionState;
  readonly requiresVerifiedActor: boolean;
}

/** Allowed edges of the mutual-introduction state machine (DATA_AND_EVENTS_CONTRACT.md §2). */
export const INTRO_TRANSITIONS: Readonly<Record<IntroductionState, readonly IntroEdge[]>> = {
  candidate: [
    { to: 'proposed_by_a', requiresVerifiedActor: true },
    { to: 'proposed_by_b', requiresVerifiedActor: true },
    { to: 'declined', requiresVerifiedActor: false },
  ],
  proposed_by_a: [
    { to: 'mutual_accepted', requiresVerifiedActor: true },
    { to: 'declined', requiresVerifiedActor: false },
  ],
  proposed_by_b: [
    { to: 'mutual_accepted', requiresVerifiedActor: true },
    { to: 'declined', requiresVerifiedActor: false },
  ],
  mutual_accepted: [{ to: 'completed', requiresVerifiedActor: false }],
  completed: [],
  declined: [],
};

/**
 * Outcome of a requested introduction transition.
 * - `allowed`: apply it and emit its event.
 * - `noop`: the match is already in that state; answer idempotently and emit nothing.
 * - `unverified`: the edge exists but the actor has not verified GitHub ownership.
 * - `forbidden`: no such edge.
 */
export type IntroTransitionOutcome = 'allowed' | 'noop' | 'unverified' | 'forbidden';

/**
 * Classify a requested introduction state change.
 * @param from - Current state of the match.
 * @param to - Requested next state.
 * @param actorVerified - Whether the acting participant has `ownership_verified === true`.
 * @returns How the caller should treat the request.
 */
export function classifyIntroTransition(
  from: IntroductionState,
  to: IntroductionState,
  actorVerified: boolean,
): IntroTransitionOutcome {
  if (from === to) return 'noop';
  const edge = INTRO_TRANSITIONS[from].find((e) => e.to === to);
  if (!edge) return 'forbidden';
  if (edge.requiresVerifiedActor && !actorVerified) return 'unverified';
  return 'allowed';
}

/**
 * Whether a state change may be applied. A same-state request returns false: it
 * is an idempotent no-op, not a transition, and must not emit a second event.
 * @param from - Current state of the match.
 * @param to - Requested next state.
 * @param actorVerified - Whether the acting participant has `ownership_verified === true`.
 * @returns True only when the transition is `allowed`.
 */
export function canTransitionIntroState(
  from: IntroductionState,
  to: IntroductionState,
  actorVerified: boolean,
): boolean {
  return classifyIntroTransition(from, to, actorVerified) === 'allowed';
}

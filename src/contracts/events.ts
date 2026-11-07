import { z } from 'zod';
import {
  GithubUsernameSchema,
  HttpsUrlSchema,
  IdSchema,
  OpportunityTypeSchema,
  PseudonymSchema,
  TimestampSchema,
} from './types.ts';

/** Canonical event catalog (DATA_AND_EVENTS_CONTRACT.md §3), in lifecycle order. */
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
export const EventTypeSchema = z.enum(EVENT_TYPES);
export type EventType = z.infer<typeof EventTypeSchema>;

/**
 * Identity a participant opted to show on stage. It can only be constructed with
 * `public_display_consent: true`, so an unconsented username has nowhere to go.
 */
export const PublicDisplaySchema = z.strictObject({
  public_display_consent: z.literal(true),
  github_username: GithubUsernameSchema,
  avatar_url: HttpsUrlSchema.nullable(),
});
export type PublicDisplay = z.infer<typeof PublicDisplaySchema>;

export const ANALYSIS_FAILURE_REASONS = [
  'github_user_not_found',
  'github_rate_limited',
  'github_unavailable',
  'website_unreachable',
  'analysis_timeout',
  'analysis_error',
  'consent_withdrawn',
] as const;
export const AnalysisFailureReasonSchema = z.enum(ANALYSIS_FAILURE_REASONS);

const count = z.number().int().min(0);

const participantRef = {
  participant_pseudonym: PseudonymSchema,
  display: PublicDisplaySchema.optional(),
};

const pairRef = {
  match_id: IdSchema,
  pseudonym_a: PseudonymSchema,
  pseudonym_b: PseudonymSchema,
  display_a: PublicDisplaySchema.optional(),
  display_b: PublicDisplaySchema.optional(),
};

/**
 * Public payload per event type. Every object is strict: a key the contract does
 * not name (a token, contact card, raw username) fails validation.
 */
export const EVENT_PAYLOAD_SCHEMAS = {
  'participant.registered': z.strictObject({ ...participantRef }),
  'github.fetch.started': z.strictObject({ ...participantRef }),
  'github.fetch.completed': z.strictObject({
    ...participantRef,
    repo_count: count,
    evidence_count: count,
  }),
  'profile.analysis.completed': z.strictObject({ ...participantRef, capability_count: count }),
  'opportunity.identified': z.strictObject({
    ...participantRef,
    opportunity_type: OpportunityTypeSchema,
  }),
  'match.candidate.generated': z.strictObject({ ...pairRef }),
  'match.evaluated': z.strictObject({
    ...pairRef,
    composite_score: z.number().int().min(0).max(100),
  }),
  'introduction.proposed': z.strictObject({ ...pairRef }),
  'introduction.accepted': z.strictObject({ ...pairRef }),
  'introduction.declined': z.strictObject({ declined_total: count }),
  'introduction.completed': z.strictObject({ ...pairRef, channel: z.literal('web') }),
  'analysis.failed': z.strictObject({
    ...participantRef,
    reason_code: AnalysisFailureReasonSchema,
  }),
} as const satisfies Record<EventType, z.ZodType>;

export type EventPayload<T extends EventType> = z.infer<(typeof EVENT_PAYLOAD_SCHEMAS)[T]>;

/**
 * Build the strict envelope schema for one event type.
 * @param type - The event type literal.
 * @returns Envelope schema whose payload is that type's public payload.
 */
function envelopeFor<T extends EventType>(type: T) {
  return z.strictObject({
    seq_id: z.number().int().positive(),
    event_id: IdSchema,
    type: z.literal(type),
    occurred_at: TimestampSchema,
    payload: EVENT_PAYLOAD_SCHEMAS[type],
  });
}

/** Every event served on `GET /api/events/stream` and `GET /api/events/poll`. */
export const PublicEventEnvelopeSchema = z.discriminatedUnion('type', [
  envelopeFor('participant.registered'),
  envelopeFor('github.fetch.started'),
  envelopeFor('github.fetch.completed'),
  envelopeFor('profile.analysis.completed'),
  envelopeFor('opportunity.identified'),
  envelopeFor('match.candidate.generated'),
  envelopeFor('match.evaluated'),
  envelopeFor('introduction.proposed'),
  envelopeFor('introduction.accepted'),
  envelopeFor('introduction.declined'),
  envelopeFor('introduction.completed'),
  envelopeFor('analysis.failed'),
]);
export type PublicEventEnvelope = z.infer<typeof PublicEventEnvelopeSchema>;

/** Response body of `GET /api/events/poll?after=<seq_id>`. */
export const EventPollResponseSchema = z
  .strictObject({
    events: z.array(PublicEventEnvelopeSchema),
    latest_seq_id: z.number().int().min(0),
  })
  .refine((r) => r.events.every((e) => e.seq_id <= r.latest_seq_id), {
    path: ['latest_seq_id'],
    message: 'latest_seq_id must be at least every returned seq_id',
  });
export type EventPollResponse = z.infer<typeof EventPollResponseSchema>;

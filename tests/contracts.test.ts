import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CapabilityClaimSchema,
  EVENT_TYPES,
  EventPollResponseSchema,
  EvidenceReceiptSchema,
  INTRODUCTION_STATES,
  MatchProposalSchema,
  OpportunityNeedSchema,
  ParticipantSchema,
  PublicEventEnvelopeSchema,
  canTransitionIntroState,
  classifyIntroTransition,
  compositeScore,
  type IntroductionState,
} from '../src/contracts';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const E1 = '33333333-3333-4333-8333-333333333333';
const E2 = '44444444-4444-4444-8444-444444444444';
const M = '55555555-5555-4555-8555-555555555555';
const NOW = '2026-11-07T18:00:00Z';

/**
 * Minimal valid participant input, with overrides.
 * @param over - Fields to replace.
 * @returns Participant-shaped object.
 */
function participant(over: Record<string, unknown> = {}) {
  return {
    id: A,
    pseudonym: 'Thread-7C4E',
    github_username: 'octo-cat',
    github_user_id: 583231,
    avatar_url: 'https://avatars.githubusercontent.com/u/583231',
    consent_status: 'granted',
    consent_granted_at: NOW,
    contact_card: null,
    analysis_state: 'registered',
    created_at: NOW,
    updated_at: NOW,
    ...over,
  };
}

/**
 * Valid match proposal input, with overrides.
 * @param over - Fields to replace.
 * @returns MatchProposal-shaped object.
 */
function match(over: Record<string, unknown> = {}) {
  return {
    id: M,
    participant_a_id: A,
    participant_b_id: B,
    composite_score: 84,
    score_breakdown: { complementary_skills: 34, project_relevance: 24, evidence_strength: 17, recency: 9 },
    complementary_summary: 'Rust SFU builder meets WebAudio UI builder.',
    relevant_projects: ['octo-cat/sfu', 'hubot/worklets'],
    suggested_first_collaboration: 'Pair for 15 minutes on worklet-to-SFU latency.',
    confidence_limitations: 'Domain overlap inferred from READMEs only.',
    evidence_receipt_ids: [E1, E2],
    intro_state: 'candidate',
    ...over,
  };
}

/**
 * Valid envelope for `type` with the given payload.
 * @param type - Event type.
 * @param payload - Event payload.
 * @returns Envelope-shaped object.
 */
function envelope(type: string, payload: Record<string, unknown>) {
  return { seq_id: 1, event_id: E1, type, occurred_at: NOW, payload };
}

describe('Participant', () => {
  it('accepts a valid participant and defaults consent flags to false', () => {
    const p = ParticipantSchema.parse(participant());
    expect(p.public_display_consent).toBe(false);
    expect(p.ownership_verified).toBe(false);
  });

  it('accepts an optional https website_url and null', () => {
    expect(ParticipantSchema.parse(participant({ website_url: 'https://jasonvaughan.com' })).website_url).toBe(
      'https://jasonvaughan.com',
    );
    expect(ParticipantSchema.safeParse(participant({ website_url: null })).success).toBe(true);
  });

  it.each([
    ['http website', { website_url: 'http://jasonvaughan.com' }],
    ['uppercase login', { github_username: 'OctoCat' }],
    ['identifying pseudonym', { pseudonym: 'octo-cat' }],
    ['unknown consent', { consent_status: 'maybe' }],
    ['unknown key', { access_token: 'ghp_secret' }],
  ])('rejects %s', (_name, over) => {
    expect(ParticipantSchema.safeParse(participant(over)).success).toBe(false);
  });
});

describe('EvidenceReceipt', () => {
  const base = {
    id: E1,
    participant_id: A,
    source_type: 'repo_metadata',
    source_url: 'https://github.com/octo-cat/sfu',
    repo_full_name: 'octo-cat/sfu',
    title_or_summary: 'Rust SFU',
    source_updated_at: NOW,
    fetched_at: NOW,
  };

  it('accepts GitHub evidence and public_website evidence', () => {
    expect(EvidenceReceiptSchema.safeParse(base).success).toBe(true);
    expect(
      EvidenceReceiptSchema.safeParse({
        ...base,
        source_type: 'public_website',
        source_url: 'https://jasonvaughan.com/about',
        repo_full_name: null,
      }).success,
    ).toBe(true);
  });

  it('rejects GitHub evidence citing a non-GitHub host', () => {
    expect(EvidenceReceiptSchema.safeParse({ ...base, source_url: 'https://example.com/x' }).success).toBe(false);
  });

  it('rejects summaries over 280 characters', () => {
    expect(EvidenceReceiptSchema.safeParse({ ...base, title_or_summary: 'x'.repeat(281) }).success).toBe(false);
  });
});

describe('CapabilityClaim', () => {
  const base = {
    id: E2,
    participant_id: A,
    category: 'language',
    name: 'Rust',
    epistemic_type: 'OBSERVED_FACT',
    proficiency_signal: 'primary',
    confidence: 0.9,
    uncertainty_note: null,
    evidence_receipt_ids: [E1],
  };

  it('accepts a confident observed fact without a note', () => {
    expect(CapabilityClaimSchema.parse(base).dismissed_by_user).toBe(false);
  });

  it('requires an uncertainty note for low confidence or AI inference', () => {
    expect(CapabilityClaimSchema.safeParse({ ...base, confidence: 0.6 }).success).toBe(false);
    expect(CapabilityClaimSchema.safeParse({ ...base, epistemic_type: 'AI_INFERENCE' }).success).toBe(false);
    expect(
      CapabilityClaimSchema.safeParse({ ...base, epistemic_type: 'AI_INFERENCE', uncertainty_note: 'From README.' })
        .success,
    ).toBe(true);
  });

  it('requires at least one evidence receipt', () => {
    expect(CapabilityClaimSchema.safeParse({ ...base, evidence_receipt_ids: [] }).success).toBe(false);
  });
});

describe('OpportunityNeed', () => {
  it('defaults the label to an AI inference', () => {
    const need = OpportunityNeedSchema.parse({
      id: E2,
      participant_id: A,
      project_repo: 'octo-cat/sfu',
      opportunity_type: 'open_issue_help',
      summary: 'Needs help with browser audio worklets.',
      desired_capabilities: ['WebAudio'],
      confidence: 0.7,
      uncertainty_note: 'Issue is 30 days old.',
      evidence_receipt_ids: [E1],
    });
    expect(need.label).toBe('Potential Opportunity (AI Inference)');
  });
});

describe('MatchProposal', () => {
  it('accepts a valid candidate match', () => {
    expect(MatchProposalSchema.parse(match()).shared_intro_notes).toEqual([]);
  });

  it('computes the composite score as the rounded sum', () => {
    expect(compositeScore({ complementary_skills: 10.4, project_relevance: 10, evidence_strength: 10, recency: 0 })).toBe(
      30,
    );
  });

  it.each([
    ['unordered participants', { participant_a_id: B, participant_b_id: A }],
    ['composite not matching breakdown', { composite_score: 90 }],
    ['breakdown out of range', { score_breakdown: { complementary_skills: 41, project_relevance: 24, evidence_strength: 17, recency: 9 }, composite_score: 91 }],
    ['fewer than two receipts', { evidence_receipt_ids: [E1] }],
    [
      'notes before completion',
      { shared_intro_notes: [{ id: E1, author_participant_id: A, body: 'hi', created_at: NOW }] },
    ],
    [
      'note by an outsider',
      {
        intro_state: 'completed',
        shared_intro_notes: [{ id: E1, author_participant_id: E2, body: 'hi', created_at: NOW }],
      },
    ],
  ])('rejects %s', (_name, over) => {
    expect(MatchProposalSchema.safeParse(match(over)).success).toBe(false);
  });
});

describe('PublicEventEnvelope', () => {
  const samplePayloads: Record<(typeof EVENT_TYPES)[number], Record<string, unknown>> = {
    'participant.registered': { participant_pseudonym: 'Thread-7C4E' },
    'github.fetch.started': { participant_pseudonym: 'Thread-7C4E' },
    'github.fetch.completed': { participant_pseudonym: 'Thread-7C4E', repo_count: 6, evidence_count: 14 },
    'profile.analysis.completed': { participant_pseudonym: 'Thread-7C4E', capability_count: 5 },
    'opportunity.identified': { participant_pseudonym: 'Thread-7C4E', opportunity_type: 'open_issue_help' },
    'match.candidate.generated': { match_id: M, pseudonym_a: 'Thread-7C4E', pseudonym_b: 'Loom-1A2B' },
    'match.evaluated': { match_id: M, pseudonym_a: 'Thread-7C4E', pseudonym_b: 'Loom-1A2B', composite_score: 84 },
    'introduction.proposed': { match_id: M, pseudonym_a: 'Thread-7C4E', pseudonym_b: 'Loom-1A2B' },
    'introduction.accepted': { match_id: M, pseudonym_a: 'Thread-7C4E', pseudonym_b: 'Loom-1A2B' },
    'introduction.declined': { declined_total: 3 },
    'introduction.completed': { match_id: M, pseudonym_a: 'Thread-7C4E', pseudonym_b: 'Loom-1A2B', channel: 'web' },
    'analysis.failed': { participant_pseudonym: 'Thread-7C4E', reason_code: 'github_rate_limited' },
  };

  it('defines exactly the 12 canonical event types', () => {
    expect(EVENT_TYPES).toHaveLength(12);
  });

  it.each(EVENT_TYPES)('accepts a valid %s envelope', (type) => {
    expect(PublicEventEnvelopeSchema.safeParse(envelope(type, samplePayloads[type])).success).toBe(true);
  });

  it('rejects an unknown event type', () => {
    expect(PublicEventEnvelopeSchema.safeParse(envelope('participant.deleted', {})).success).toBe(false);
  });

  it('admits identity only with explicit public display consent', () => {
    const display = { public_display_consent: true, github_username: 'octo-cat', avatar_url: null };
    expect(
      PublicEventEnvelopeSchema.safeParse(
        envelope('participant.registered', { participant_pseudonym: 'Thread-7C4E', display }),
      ).success,
    ).toBe(true);
    expect(
      PublicEventEnvelopeSchema.safeParse(
        envelope('participant.registered', {
          participant_pseudonym: 'Thread-7C4E',
          display: { ...display, public_display_consent: false },
        }),
      ).success,
    ).toBe(false);
  });

  it.each([
    ['raw github_username', { github_username: 'octo-cat' }],
    ['contact card', { contact_card: '@octo on Signal' }],
    ['token', { token: 'ghp_abc123' }],
  ])('rejects a payload leaking a %s', (_name, extra) => {
    expect(
      PublicEventEnvelopeSchema.safeParse(
        envelope('introduction.completed', { ...samplePayloads['introduction.completed'], ...extra }),
      ).success,
    ).toBe(false);
  });

  it('carries only an aggregate count for declined introductions', () => {
    expect(
      PublicEventEnvelopeSchema.safeParse(
        envelope('introduction.declined', { declined_total: 1, match_id: M }),
      ).success,
    ).toBe(false);
  });

  it('validates the poll response cursor', () => {
    const ev = envelope('participant.registered', samplePayloads['participant.registered']);
    expect(EventPollResponseSchema.safeParse({ events: [{ ...ev, seq_id: 7 }], latest_seq_id: 7 }).success).toBe(true);
    expect(EventPollResponseSchema.safeParse({ events: [{ ...ev, seq_id: 7 }], latest_seq_id: 6 }).success).toBe(false);
    expect(EventPollResponseSchema.safeParse({ events: [], latest_seq_id: 0 }).success).toBe(true);
  });
});

describe('introduction state machine', () => {
  const allowed: Array<[IntroductionState, IntroductionState]> = [
    ['candidate', 'proposed_by_a'],
    ['candidate', 'proposed_by_b'],
    ['candidate', 'declined'],
    ['proposed_by_a', 'mutual_accepted'],
    ['proposed_by_b', 'mutual_accepted'],
    ['proposed_by_a', 'declined'],
    ['proposed_by_b', 'declined'],
    ['mutual_accepted', 'completed'],
  ];
  const isAllowed = (from: IntroductionState, to: IntroductionState) =>
    allowed.some(([f, t]) => f === from && t === to);

  it.each(allowed)('allows %s -> %s for a verified actor', (from, to) => {
    expect(canTransitionIntroState(from, to, true)).toBe(true);
  });

  it('forbids every edge outside the diagram', () => {
    for (const from of INTRODUCTION_STATES) {
      for (const to of INTRODUCTION_STATES) {
        if (from === to || isAllowed(from, to)) continue;
        expect(classifyIntroTransition(from, to, true), `${from} -> ${to}`).toBe('forbidden');
      }
    }
  });

  it('treats a repeated decision as an idempotent no-op', () => {
    for (const state of INTRODUCTION_STATES) {
      expect(classifyIntroTransition(state, state, true)).toBe('noop');
      expect(canTransitionIntroState(state, state, true)).toBe(false);
    }
  });

  it('requires verified ownership to propose or accept', () => {
    expect(classifyIntroTransition('candidate', 'proposed_by_a', false)).toBe('unverified');
    expect(classifyIntroTransition('proposed_by_b', 'mutual_accepted', false)).toBe('unverified');
    expect(canTransitionIntroState('candidate', 'proposed_by_b', false)).toBe(false);
  });

  it('lets an unverified participant pass and the system complete', () => {
    expect(canTransitionIntroState('candidate', 'declined', false)).toBe(true);
    expect(canTransitionIntroState('mutual_accepted', 'completed', false)).toBe(true);
  });

  it('never leaves a terminal state', () => {
    for (const to of INTRODUCTION_STATES) {
      expect(canTransitionIntroState('completed', to, true)).toBe(false);
      expect(canTransitionIntroState('declined', to, true)).toBe(false);
    }
  });
});

describe('SQLite schema', () => {
  let dir: string;
  let db: DatabaseSync;
  const schema = readFileSync(new URL('../src/db/schema.sql', import.meta.url), 'utf8');

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ariadne-schema-'));
    db = new DatabaseSync(join(dir, 'ariadne.db'));
    db.exec(schema);
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  /**
   * Insert a participant row with the given id and login.
   * @param id - Participant id.
   * @param login - GitHub login.
   * @param pseudonym - Stage handle.
   */
  function insertParticipant(id: string, login: string, pseudonym: string) {
    db.prepare(
      `INSERT INTO participants (id, pseudonym, github_username, consent_status, consent_granted_at, created_at, updated_at)
       VALUES (?, ?, ?, 'granted', ?, ?, ?)`,
    ).run(id, pseudonym, login, NOW, NOW, NOW);
  }

  it('creates all eight tables in WAL mode and re-applies idempotently', () => {
    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)
      .all()
      .map((r) => (r as { name: string }).name);
    expect(tables).toEqual([
      'async_jobs',
      'capability_claims',
      'domain_events',
      'evidence_receipts',
      'github_snapshots',
      'matches',
      'opportunity_needs',
      'participants',
    ]);
    expect((db.prepare('PRAGMA journal_mode').get() as { journal_mode: string }).journal_mode).toBe('wal');
    expect(() => db.exec(schema)).not.toThrow();
  });

  it('defaults privacy flags to 0', () => {
    insertParticipant(A, 'octo-cat', 'Thread-7C4E');
    const row = db.prepare('SELECT public_display_consent, ownership_verified FROM participants').get();
    expect(row).toEqual({ public_display_consent: 0, ownership_verified: 0 });
  });

  it('enforces canonical match ordering and valid intro states', () => {
    insertParticipant(A, 'octo-cat', 'Thread-7C4E');
    insertParticipant(B, 'hubot', 'Loom-1A2B');
    const insert = db.prepare(
      `INSERT INTO matches (id, participant_a_id, participant_b_id, composite_score, score_breakdown,
         complementary_summary, relevant_projects, suggested_first_collaboration, confidence_limitations,
         evidence_receipt_ids, intro_state, created_at, updated_at)
       VALUES (?, ?, ?, 84, '{}', 's', '[]', 'c', 'l', ?, ?, ?, ?)`,
    );
    const receipts = JSON.stringify([E1, E2]);
    expect(() => insert.run(M, A, B, receipts, 'candidate', NOW, NOW)).not.toThrow();
    expect(() => insert.run(E1, B, A, receipts, 'candidate', NOW, NOW)).toThrow();
    expect(() => insert.run(E2, A, B, receipts, 'accepted', NOW, NOW)).toThrow();
  });

  it('assigns increasing seq_ids and blocks duplicate idempotency keys', () => {
    const insert = db.prepare(
      `INSERT INTO domain_events (event_id, type, payload_json, idempotency_key, occurred_at) VALUES (?, ?, '{}', ?, ?)`,
    );
    const first = insert.run(E1, 'introduction.proposed', `${M}:a:interested`, NOW);
    const second = insert.run(E2, 'participant.registered', null, NOW);
    expect(Number(second.lastInsertRowid)).toBeGreaterThan(Number(first.lastInsertRowid));
    expect(() => insert.run(M, 'introduction.proposed', `${M}:a:interested`, NOW)).toThrow();
    expect(() => insert.run(A, 'participant.deleted', null, NOW)).toThrow();
  });

  it('purges a participant and everything derived from them', () => {
    insertParticipant(A, 'octo-cat', 'Thread-7C4E');
    db.prepare(
      `INSERT INTO evidence_receipts (id, participant_id, source_type, source_url, title_or_summary, source_updated_at, fetched_at)
       VALUES (?, ?, 'public_website', 'https://jasonvaughan.com', 'Portfolio', ?, ?)`,
    ).run(E1, A, NOW, NOW);
    db.prepare('DELETE FROM participants WHERE id = ?').run(A);
    expect(db.prepare('SELECT count(*) AS n FROM evidence_receipts').get()).toEqual({ n: 0 });
  });

  it('rejects GitHub evidence citing a non-GitHub URL', () => {
    insertParticipant(A, 'octo-cat', 'Thread-7C4E');
    expect(() =>
      db
        .prepare(
          `INSERT INTO evidence_receipts (id, participant_id, source_type, source_url, title_or_summary, source_updated_at, fetched_at)
           VALUES (?, ?, 'repo_metadata', 'https://example.com/x', 't', ?, ?)`,
        )
        .run(E1, A, NOW, NOW),
    ).toThrow();
  });
});

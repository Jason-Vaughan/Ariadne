import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, it } from 'node:test';
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
  canRevealContact,
  canTransitionIntroState,
  classifyIntroTransition,
  compositeScore,
  type EventType,
  type IntroActor,
  type IntroductionState,
} from '../src/contracts/index.ts';

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
    assert.equal(p.public_display_consent, false);
    assert.equal(p.ownership_verified, false);
  });

  it('accepts an optional https website_url and null', () => {
    const p = ParticipantSchema.parse(participant({ website_url: 'https://jasonvaughan.com' }));
    assert.equal(p.website_url, 'https://jasonvaughan.com');
    assert.equal(ParticipantSchema.safeParse(participant({ website_url: null })).success, true);
  });

  const rejected: Array<[string, Record<string, unknown>]> = [
    ['http website', { website_url: 'http://jasonvaughan.com' }],
    ['uppercase login', { github_username: 'OctoCat' }],
    ['identifying pseudonym', { pseudonym: 'octo-cat' }],
    ['unknown consent', { consent_status: 'maybe' }],
    ['unknown key', { access_token: 'ghp_secret' }],
  ];
  for (const [name, over] of rejected) {
    it(`rejects ${name}`, () => {
      assert.equal(ParticipantSchema.safeParse(participant(over)).success, false);
    });
  }
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
    assert.equal(EvidenceReceiptSchema.safeParse(base).success, true);
    const website = {
      ...base,
      source_type: 'public_website',
      source_url: 'https://jasonvaughan.com/about',
      repo_full_name: null,
    };
    assert.equal(EvidenceReceiptSchema.safeParse(website).success, true);
  });

  it('rejects GitHub evidence citing a non-GitHub host', () => {
    assert.equal(EvidenceReceiptSchema.safeParse({ ...base, source_url: 'https://example.com/x' }).success, false);
  });

  it('rejects summaries over 280 characters', () => {
    assert.equal(EvidenceReceiptSchema.safeParse({ ...base, title_or_summary: 'x'.repeat(281) }).success, false);
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
    assert.equal(CapabilityClaimSchema.parse(base).dismissed_by_user, false);
  });

  it('requires an uncertainty note for low confidence or AI inference', () => {
    assert.equal(CapabilityClaimSchema.safeParse({ ...base, confidence: 0.6 }).success, false);
    assert.equal(CapabilityClaimSchema.safeParse({ ...base, epistemic_type: 'AI_INFERENCE' }).success, false);
    const noted = { ...base, epistemic_type: 'AI_INFERENCE', uncertainty_note: 'From README.' };
    assert.equal(CapabilityClaimSchema.safeParse(noted).success, true);
  });

  it('requires at least one evidence receipt', () => {
    assert.equal(CapabilityClaimSchema.safeParse({ ...base, evidence_receipt_ids: [] }).success, false);
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
    assert.equal(need.label, 'Potential Opportunity (AI Inference)');
  });
});

describe('MatchProposal', () => {
  it('accepts a valid candidate match', () => {
    assert.deepEqual(MatchProposalSchema.parse(match()).shared_intro_notes, []);
  });

  it('computes the composite score as the rounded sum', () => {
    const score = compositeScore({ complementary_skills: 10.4, project_relevance: 10, evidence_strength: 10, recency: 0 });
    assert.equal(score, 30);
  });

  const rejected: Array<[string, Record<string, unknown>]> = [
    ['unordered participants', { participant_a_id: B, participant_b_id: A }],
    ['composite not matching breakdown', { composite_score: 90 }],
    [
      'breakdown out of range',
      {
        score_breakdown: { complementary_skills: 41, project_relevance: 24, evidence_strength: 17, recency: 9 },
        composite_score: 91,
      },
    ],
    ['fewer than two receipts', { evidence_receipt_ids: [E1] }],
    [
      'notes before completion',
      { shared_intro_notes: [{ id: E1, author_participant_id: A, body: 'hi', created_at: NOW }] },
    ],
    [
      'note by an outsider',
      {
        intro_state: 'completed',
        approval_a: true,
        approval_b: true,
        shared_intro_notes: [{ id: E1, author_participant_id: E2, body: 'hi', created_at: NOW }],
      },
    ],
  ];
  for (const [name, over] of rejected) {
    it(`rejects ${name}`, () => {
      assert.equal(MatchProposalSchema.safeParse(match(over)).success, false);
    });
  }
  it('accepts a completed match carrying both approvals and participant notes', () => {
    const completed = match({
      intro_state: 'completed',
      approval_a: true,
      approval_b: true,
      shared_intro_notes: [{ id: E1, author_participant_id: B, body: 'hi', created_at: NOW }],
    });
    assert.equal(MatchProposalSchema.safeParse(completed).success, true);
  });

  const inconsistentApprovals: Array<[string, Record<string, unknown>]> = [
    ['candidate already approved', { approval_a: true }],
    ['proposal by A missing A', { intro_state: 'proposed_by_a' }],
    ['proposal by A carrying B', { intro_state: 'proposed_by_a', approval_a: true, approval_b: true }],
    ['mutual acceptance with one approval', { intro_state: 'mutual_accepted', approval_a: true }],
    ['completion without approvals', { intro_state: 'completed' }],
    ['decline after both approved', { intro_state: 'declined', approval_a: true, approval_b: true }],
  ];
  for (const [name, over] of inconsistentApprovals) {
    it(`rejects ${name}`, () => {
      assert.equal(MatchProposalSchema.safeParse(match(over)).success, false);
    });
  }

  it('accepts a decline after one approval', () => {
    assert.equal(MatchProposalSchema.safeParse(match({ intro_state: 'declined', approval_a: true })).success, true);
  });

  it('reveals contact only after both approvals and completion', () => {
    assert.equal(canRevealContact({ intro_state: 'completed', approval_a: true, approval_b: true }), true);
    assert.equal(canRevealContact({ intro_state: 'mutual_accepted', approval_a: true, approval_b: true }), false);
    assert.equal(canRevealContact({ intro_state: 'completed', approval_a: true, approval_b: false }), false);
    assert.equal(canRevealContact({ intro_state: 'proposed_by_a', approval_a: true, approval_b: false }), false);
  });
});

describe('PublicEventEnvelope', () => {
  const samplePayloads: Record<EventType, Record<string, unknown>> = {
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
    assert.equal(EVENT_TYPES.length, 12);
  });

  for (const type of EVENT_TYPES) {
    it(`accepts a valid ${type} envelope`, () => {
      assert.equal(PublicEventEnvelopeSchema.safeParse(envelope(type, samplePayloads[type])).success, true);
    });
  }

  it('rejects an unknown event type', () => {
    assert.equal(PublicEventEnvelopeSchema.safeParse(envelope('participant.deleted', {})).success, false);
  });

  it('admits identity only with explicit public display consent', () => {
    const display = { public_display_consent: true, github_username: 'octo-cat', avatar_url: null };
    const consented = envelope('participant.registered', { participant_pseudonym: 'Thread-7C4E', display });
    assert.equal(PublicEventEnvelopeSchema.safeParse(consented).success, true);
    const unconsented = envelope('participant.registered', {
      participant_pseudonym: 'Thread-7C4E',
      display: { ...display, public_display_consent: false },
    });
    assert.equal(PublicEventEnvelopeSchema.safeParse(unconsented).success, false);
  });

  const leaks: Array<[string, Record<string, unknown>]> = [
    ['raw github_username', { github_username: 'octo-cat' }],
    ['contact card', { contact_card: '@octo on Signal' }],
    ['token', { token: 'ghp_abc123' }],
  ];
  for (const [name, extra] of leaks) {
    it(`rejects a payload leaking a ${name}`, () => {
      const leaky = envelope('introduction.completed', { ...samplePayloads['introduction.completed'], ...extra });
      assert.equal(PublicEventEnvelopeSchema.safeParse(leaky).success, false);
    });
  }

  it('carries only an aggregate count for declined introductions', () => {
    const declined = envelope('introduction.declined', { declined_total: 1, match_id: M });
    assert.equal(PublicEventEnvelopeSchema.safeParse(declined).success, false);
  });

  it('validates the poll response cursor', () => {
    const ev = { ...envelope('participant.registered', samplePayloads['participant.registered']), seq_id: 7 };
    assert.equal(EventPollResponseSchema.safeParse({ events: [ev], latest_seq_id: 7 }).success, true);
    assert.equal(EventPollResponseSchema.safeParse({ events: [ev], latest_seq_id: 6 }).success, false);
    assert.equal(EventPollResponseSchema.safeParse({ events: [], latest_seq_id: 0 }).success, true);
  });
});

describe('introduction state machine', () => {
  const A_OK: IntroActor = { side: 'a', verified: true };
  const B_OK: IntroActor = { side: 'b', verified: true };
  const SYSTEM: IntroActor = { side: 'system', verified: false };
  const allowed: Array<[IntroductionState, IntroductionState, IntroActor]> = [
    ['candidate', 'proposed_by_a', A_OK],
    ['candidate', 'proposed_by_b', B_OK],
    ['candidate', 'declined', A_OK],
    ['candidate', 'declined', B_OK],
    ['proposed_by_a', 'mutual_accepted', B_OK],
    ['proposed_by_b', 'mutual_accepted', A_OK],
    ['proposed_by_a', 'declined', B_OK],
    ['proposed_by_b', 'declined', A_OK],
    ['mutual_accepted', 'completed', SYSTEM],
  ];
  const hasEdge = (from: IntroductionState, to: IntroductionState) =>
    allowed.some(([f, t]) => f === from && t === to);

  for (const [from, to, actor] of allowed) {
    it(`allows ${from} -> ${to} by ${actor.side}`, () => {
      assert.equal(canTransitionIntroState(from, to, actor), true);
    });
  }

  it('forbids every edge outside the diagram, whoever asks', () => {
    for (const from of INTRODUCTION_STATES) {
      for (const to of INTRODUCTION_STATES) {
        if (from === to || hasEdge(from, to)) continue;
        for (const actor of [A_OK, B_OK, SYSTEM]) {
          assert.equal(classifyIntroTransition(from, to, actor), 'forbidden', `${from} -> ${to} by ${actor.side}`);
        }
      }
    }
  });

  it('never lets a proposer accept their own proposal', () => {
    assert.equal(classifyIntroTransition('proposed_by_a', 'mutual_accepted', A_OK), 'wrong_actor');
    assert.equal(classifyIntroTransition('proposed_by_b', 'mutual_accepted', B_OK), 'wrong_actor');
    assert.equal(classifyIntroTransition('proposed_by_a', 'mutual_accepted', SYSTEM), 'wrong_actor');
  });

  it('lets each participant propose only on their own behalf', () => {
    assert.equal(classifyIntroTransition('candidate', 'proposed_by_a', B_OK), 'wrong_actor');
    assert.equal(classifyIntroTransition('candidate', 'proposed_by_b', A_OK), 'wrong_actor');
  });

  it('leaves completion to the system', () => {
    assert.equal(classifyIntroTransition('mutual_accepted', 'completed', A_OK), 'wrong_actor');
    assert.equal(classifyIntroTransition('mutual_accepted', 'completed', B_OK), 'wrong_actor');
  });

  it('treats a repeated decision as an idempotent no-op', () => {
    for (const state of INTRODUCTION_STATES) {
      assert.equal(classifyIntroTransition(state, state, A_OK), 'noop');
      assert.equal(canTransitionIntroState(state, state, B_OK), false);
    }
  });

  it('requires verified ownership to propose or accept', () => {
    assert.equal(classifyIntroTransition('candidate', 'proposed_by_a', { side: 'a', verified: false }), 'unverified');
    assert.equal(classifyIntroTransition('proposed_by_b', 'mutual_accepted', { side: 'a', verified: false }), 'unverified');
    assert.equal(canTransitionIntroState('candidate', 'proposed_by_b', { side: 'b', verified: false }), false);
  });

  it('lets an unverified participant pass', () => {
    assert.equal(canTransitionIntroState('candidate', 'declined', { side: 'a', verified: false }), true);
    assert.equal(canTransitionIntroState('proposed_by_a', 'declined', { side: 'b', verified: false }), true);
  });

  it('never leaves a terminal state', () => {
    for (const to of INTRODUCTION_STATES) {
      for (const actor of [A_OK, B_OK, SYSTEM]) {
        assert.equal(canTransitionIntroState('completed', to, actor), false);
        assert.equal(canTransitionIntroState('declined', to, actor), false);
      }
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
   * Insert a participant row.
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

  /**
   * Read a single row as a plain object (node:sqlite rows have a null prototype).
   * @param sql - Query returning one row.
   * @returns The row's columns.
   */
  function row(sql: string): Record<string, unknown> {
    return { ...db.prepare(sql).get() };
  }

  it('creates all eight tables in WAL mode and re-applies idempotently', () => {
    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)
      .all()
      .map((r) => (r as { name: string }).name);
    assert.deepEqual(tables, [
      'async_jobs',
      'capability_claims',
      'domain_events',
      'evidence_receipts',
      'github_snapshots',
      'matches',
      'opportunity_needs',
      'participants',
    ]);
    assert.equal(row('PRAGMA journal_mode').journal_mode, 'wal');
    assert.doesNotThrow(() => db.exec(schema));
  });

  it('defaults privacy flags to 0', () => {
    insertParticipant(A, 'octo-cat', 'Thread-7C4E');
    assert.deepEqual(row('SELECT public_display_consent, ownership_verified FROM participants'), {
      public_display_consent: 0,
      ownership_verified: 0,
    });
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
    assert.doesNotThrow(() => insert.run(M, A, B, receipts, 'candidate', NOW, NOW));
    assert.throws(() => insert.run(E1, B, A, receipts, 'candidate', NOW, NOW));
    assert.throws(() => insert.run(E2, A, B, receipts, 'accepted', NOW, NOW));
  });

  it('ties approval flags to the intro state', () => {
    insertParticipant(A, 'octo-cat', 'Thread-7C4E');
    insertParticipant(B, 'hubot', 'Loom-1A2B');
    const insert = db.prepare(
      `INSERT INTO matches (id, participant_a_id, participant_b_id, composite_score, score_breakdown,
         complementary_summary, relevant_projects, suggested_first_collaboration, confidence_limitations,
         evidence_receipt_ids, intro_state, approval_a, approval_b, created_at, updated_at)
       VALUES (?, ?, ?, 84, '{}', 's', '[]', 'c', 'l', ?, ?, ?, ?, ?, ?)`,
    );
    const receipts = JSON.stringify([E1, E2]);
    assert.throws(() => insert.run(M, A, B, receipts, 'proposed_by_a', 1, 1, NOW, NOW));
    assert.throws(() => insert.run(M, A, B, receipts, 'completed', 1, 0, NOW, NOW));
    assert.throws(() => insert.run(M, A, B, receipts, 'candidate', 1, 0, NOW, NOW));
    assert.doesNotThrow(() => insert.run(M, A, B, receipts, 'mutual_accepted', 1, 1, NOW, NOW));
    db.prepare(`UPDATE matches SET intro_state = 'completed' WHERE id = ?`).run(M);
    assert.throws(() => db.prepare(`UPDATE matches SET approval_b = 0 WHERE id = ?`).run(M));
  });

  it('assigns increasing seq_ids and blocks duplicate idempotency keys', () => {
    const insert = db.prepare(
      `INSERT INTO domain_events (event_id, type, payload_json, idempotency_key, occurred_at) VALUES (?, ?, '{}', ?, ?)`,
    );
    const first = insert.run(E1, 'introduction.proposed', `${M}:a:interested`, NOW);
    const second = insert.run(E2, 'participant.registered', null, NOW);
    assert.ok(Number(second.lastInsertRowid) > Number(first.lastInsertRowid));
    assert.throws(() => insert.run(M, 'introduction.proposed', `${M}:a:interested`, NOW));
    assert.throws(() => insert.run(A, 'participant.deleted', null, NOW));
  });

  it('purges a participant and everything derived from them', () => {
    insertParticipant(A, 'octo-cat', 'Thread-7C4E');
    db.prepare(
      `INSERT INTO evidence_receipts (id, participant_id, source_type, source_url, title_or_summary, source_updated_at, fetched_at)
       VALUES (?, ?, 'public_website', 'https://jasonvaughan.com', 'Portfolio', ?, ?)`,
    ).run(E1, A, NOW, NOW);
    db.prepare('DELETE FROM participants WHERE id = ?').run(A);
    assert.deepEqual(row('SELECT count(*) AS n FROM evidence_receipts'), { n: 0 });
  });

  it('rejects GitHub evidence citing a non-GitHub URL', () => {
    insertParticipant(A, 'octo-cat', 'Thread-7C4E');
    const insert = db.prepare(
      `INSERT INTO evidence_receipts (id, participant_id, source_type, source_url, title_or_summary, source_updated_at, fetched_at)
       VALUES (?, ?, 'repo_metadata', 'https://example.com/x', 't', ?, ?)`,
    );
    assert.throws(() => insert.run(E1, A, NOW, NOW));
  });
});

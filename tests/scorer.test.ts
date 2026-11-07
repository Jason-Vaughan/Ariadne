import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import {
  ANTI_CLONE_SCORE_CAP,
  CapabilityClaimSchema,
  compositeScore,
  EvidenceReceiptSchema,
  MATCH_SURFACE_THRESHOLD,
  MatchProposalSchema,
  OpportunityNeedSchema,
  ParticipantSchema,
  PublicEventEnvelopeSchema,
} from '../src/contracts/index.ts';
import type { CapabilityClaim, EvidenceReceipt, OpportunityNeed, Participant } from '../src/contracts/index.ts';
import { readEventsAfter } from '../src/events/bus.ts';
import { novelty, surfacingRejections } from '../src/matching/anti-clone.ts';
import { matchIdFor, scorePair, selectTopMatches } from '../src/matching/scorer.ts';
import type { ParticipantProfile } from '../src/matching/scorer.ts';

const REPO_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const NOW = new Date('2026-11-07T12:00:00Z');
const DAY = 86_400_000;
let serial = 0;

/**
 * A fresh, valid UUID; ids sort in creation order.
 * @returns The id.
 */
function nextId(): string {
  serial += 1;
  return `${serial.toString(16).padStart(8, '0')}-0000-4000-8000-000000000000`;
}

/**
 * ISO timestamp a number of days before NOW.
 * @param days - Age in days.
 * @returns The timestamp.
 */
function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * DAY).toISOString();
}

interface ClaimSpec {
  name: string;
  category: CapabilityClaim['category'];
  proficiency?: CapabilityClaim['proficiency_signal'];
  confidence?: number;
}

interface NeedSpec {
  wants: string[];
  confidence?: number;
  issueAgeDays?: number;
  inferred?: boolean;
  dismissed?: boolean;
}

/**
 * Builds a contract-valid profile: one fresh repo receipt backing every claim, one open-issue receipt per need.
 * Every record is parsed through its A-001 schema, so a fixture can never drift from the contract.
 * @param alias - Display alias (e.g. `Thread-0A01`).
 * @param repo - `owner/repo` of the participant's project.
 * @param claims - Capability claims.
 * @param needs - Opportunity needs.
 * @param options - Repo age, consent, or an evidence override.
 * @returns The profile.
 */
function profile(
  alias: string,
  repo: string,
  claims: ClaimSpec[],
  needs: NeedSpec[] = [],
  options: { repoAgeDays?: number; consent?: Participant['consent_status']; evidence?: 'none' | 'invalid' } = {},
): ParticipantProfile {
  const id = nextId();
  const participant = ParticipantSchema.parse({
    id,
    display_alias: alias,
    github_username: alias.toLowerCase(),
    github_user_id: serial,
    avatar_url: null,
    consent_status: options.consent ?? 'granted',
    consent_granted_at: daysAgo(1),
    contact_card: null,
    analysis_state: options.consent === 'withdrawn' ? 'withdrawn' : 'ready',
    created_at: daysAgo(1),
    updated_at: daysAgo(1),
  });
  const evidence: EvidenceReceipt[] = [];
  const repoReceipt = EvidenceReceiptSchema.parse({
    id: nextId(),
    participant_id: id,
    source_type: 'repo_metadata',
    source_url: `https://github.com/${repo}`,
    repo_full_name: repo,
    title_or_summary: `${repo} repository`,
    source_updated_at: daysAgo(options.repoAgeDays ?? 5),
    fetched_at: NOW.toISOString(),
  });
  if (options.evidence !== 'none') evidence.push(repoReceipt);
  const parsedClaims = claims.map((c) => {
    const confidence = c.confidence ?? 0.9;
    return CapabilityClaimSchema.parse({
      id: nextId(),
      participant_id: id,
      category: c.category,
      name: c.name,
      epistemic_type: 'OBSERVED_FACT',
      proficiency_signal: c.proficiency ?? 'primary',
      confidence,
      uncertainty_note: confidence < 0.75 ? 'Limited commit history.' : null,
      evidence_receipt_ids: [repoReceipt.id],
    });
  });
  const parsedNeeds = needs.map((n, i) => {
    const issue = EvidenceReceiptSchema.parse({
      id: nextId(),
      participant_id: id,
      source_type: 'open_issue',
      source_url: `https://github.com/${repo}/issues/${i + 1}`,
      repo_full_name: repo,
      title_or_summary: `Help wanted: ${n.wants.join(', ')}`,
      source_updated_at: daysAgo(n.issueAgeDays ?? 3),
      fetched_at: NOW.toISOString(),
    });
    if (options.evidence !== 'none') evidence.push(issue);
    return OpportunityNeedSchema.parse({
      id: nextId(),
      participant_id: id,
      project_repo: repo,
      opportunity_type: 'open_issue_help',
      label: n.inferred === false ? 'Participant Confirmed Need' : 'Potential Opportunity (AI Inference)',
      summary: `Help with ${n.wants.join(' and ')}`,
      desired_capabilities: n.wants,
      confidence: n.confidence ?? 0.85,
      uncertainty_note: 'Inferred from an open issue.',
      evidence_receipt_ids: [issue.id],
      dismissed_by_user: n.dismissed ?? false,
    });
  });
  if (options.evidence === 'invalid') {
    // Receipt ids the claims cite exist but belong to another participant, so they cannot count.
    evidence.push(...evidence.splice(0).map((r) => ({ ...r, participant_id: '00000000-0000-4000-8000-0000000000ff' })));
  }
  return { participant, claims: parsedClaims, needs: parsedNeeds, evidence };
}

/** TC-SCORE-01 pair: a Rust/WebRTC media-server builder and a TypeScript/WebAudio UI builder, each needing the other. */
function highSynergyPair(): [ParticipantProfile, ParticipantProfile] {
  const a = profile(
    'Thread-0A01',
    'sfu-labs/rust-sfu',
    [
      { name: 'Rust', category: 'language' },
      { name: 'WebRTC', category: 'systems_architecture' },
      { name: 'TypeScript', category: 'language' },
      { name: 'realtime-media', category: 'domain' },
    ],
    [{ wants: ['React', 'WebAudio'] }],
  );
  const b = profile(
    'Spool-0B02',
    'wave-ui/audio-deck',
    [
      { name: 'TypeScript', category: 'language' },
      { name: 'React', category: 'framework' },
      { name: 'WebAudio', category: 'framework' },
      { name: 'WebRTC', category: 'framework' },
      { name: 'realtime-media', category: 'domain' },
    ],
    [{ wants: ['Rust', 'WebRTC'] }],
  );
  return [a, b];
}

describe('anti-clone helpers', () => {
  test('novelty is the Jaccard distance of capability names', () => {
    assert.equal(novelty(new Set(['a', 'b']), new Set(['a', 'b'])), 0);
    assert.equal(novelty(new Set(['a']), new Set(['b'])), 1);
    assert.equal(novelty(new Set(['a', 'b', 'c']), new Set(['b', 'c', 'd'])), 0.5);
    assert.equal(novelty(new Set(), new Set()), 1);
  });

  test('surfacing requires score >= 45, a non-clone pair and cited evidence on both sides', () => {
    const tradable = { capability_similarity: 0.5, need_offer_fit: 0.5, complementarity: 0.5, novelty: 0.5, freshness: 1 };
    assert.deepEqual(surfacingRejections({ breakdown: tradable, compositeScore: 60, evidenceA: ['x'], evidenceB: ['y'] }), []);
    assert.deepEqual(surfacingRejections({ breakdown: tradable, compositeScore: 44, evidenceA: ['x'], evidenceB: ['y'] }), [
      'below_threshold',
    ]);
    assert.deepEqual(surfacingRejections({ breakdown: tradable, compositeScore: 60, evidenceA: ['x', 'z'], evidenceB: [] }), [
      'insufficient_evidence',
    ]);
    const clone = { ...tradable, need_offer_fit: 0, complementarity: 0 };
    assert.deepEqual(surfacingRejections({ breakdown: clone, compositeScore: 38, evidenceA: ['x'], evidenceB: ['y'] }), [
      'below_threshold',
      'clone_like',
    ]);
  });
});

describe('scorePair', () => {
  test('TC-SCORE-01: a high bidirectional-complementarity pair scores >= 75, surfaces and ranks first', () => {
    // MATCH_SCORING_SPEC.md quotes 82-94 here, which its own §3 formulas cannot reach for a realistic pair:
    // need/offer fit is diluted by everything else the offerer offers, and similarity trades off against novelty.
    // The dispatch acceptance criterion (>= 75) is asserted instead; the spec range was reported to PM/Arc.
    const [a, b] = highSynergyPair();
    const pair = scorePair(a, b, { now: NOW });
    assert.ok(pair.composite_score >= 75, `score ${pair.composite_score}`);
    assert.equal(pair.score_breakdown.complementarity, 1);
    assert.equal(pair.score_breakdown.freshness, 1);
    assert.equal(pair.surfaceable, true);
    assert.deepEqual(pair.relevant_projects, ['sfu-labs/rust-sfu', 'wave-ui/audio-deck']);
    assert.ok(pair.evidence_receipt_ids.length >= 2);
    assert.ok(pair.limitations.some((l) => l.includes('inferred from public activity')));
    const rival = profile('Rival-0B04', 'other/ui', [
      { name: 'TypeScript', category: 'language' },
      { name: 'Vue', category: 'framework' },
    ], [{ wants: ['Rust'] }]);
    assert.equal(selectTopMatches([a, b, rival], { now: NOW }).get(a.participant.id)![0]!.match_id, pair.match_id);
  });

  test('the composite always equals the contract compositeScore and yields a valid MatchProposal', () => {
    const [a, b] = highSynergyPair();
    const pair = scorePair(a, b, { now: NOW });
    assert.equal(pair.composite_score, compositeScore(pair.score_breakdown));
    MatchProposalSchema.parse({
      id: pair.match_id,
      participant_a_id: pair.participant_a_id,
      participant_b_id: pair.participant_b_id,
      composite_score: pair.composite_score,
      score_breakdown: pair.score_breakdown,
      complementary_summary: 'placeholder',
      relevant_projects: pair.relevant_projects,
      suggested_first_collaboration: 'placeholder',
      confidence_limitations: 'placeholder',
      evidence_receipt_ids: pair.evidence_receipt_ids,
      intro_state: 'candidate',
    });
  });

  test('is symmetric and deterministic: argument order and repetition change nothing', () => {
    const [a, b] = highSynergyPair();
    const forward = scorePair(a, b, { now: NOW });
    assert.deepEqual(scorePair(b, a, { now: NOW }), forward);
    assert.deepEqual(scorePair(a, b, { now: NOW }), forward);
    assert.ok(forward.participant_a_id < forward.participant_b_id);
    assert.equal(forward.match_id, matchIdFor(forward.participant_a_id, forward.participant_b_id));
  });

  test('TC-SCORE-02: identical-stack clones are capped at 38 and never surface', () => {
    const stack: ClaimSpec[] = [
      { name: 'Python', category: 'language' },
      { name: 'Flask', category: 'framework' },
      { name: 'tutorials', category: 'domain' },
    ];
    const pair = scorePair(profile('Clone-0C01', 'learner-a/flask-tutorial', stack), profile('Clone-0C02', 'learner-b/flask-tutorial', stack), {
      now: NOW,
    });
    assert.equal(pair.score_breakdown.need_offer_fit, 0);
    assert.equal(pair.score_breakdown.complementarity, 0);
    assert.equal(pair.score_breakdown.novelty, 0);
    assert.ok(pair.composite_score >= 25 && pair.composite_score <= ANTI_CLONE_SCORE_CAP, `score ${pair.composite_score}`);
    assert.equal(pair.surfaceable, false);
    assert.ok(pair.rejections.includes('clone_like'));
  });

  test('TC-SCORE-03: a 900-day-old issue need is discounted, freshness drops to 0.1 and a caveat is attached', () => {
    const stale = profile(
      'Dusty-0D01',
      'old-org/graphql-api',
      [
        { name: 'Node.js', category: 'framework' },
        { name: 'APIs', category: 'domain' },
      ],
      [{ wants: ['GraphQL'], issueAgeDays: 900 }],
      { repoAgeDays: 540 },
    );
    const fresh = profile(
      'Dusty-0D01',
      'old-org/graphql-api',
      [
        { name: 'Node.js', category: 'framework' },
        { name: 'APIs', category: 'domain' },
      ],
      [{ wants: ['GraphQL'], issueAgeDays: 3 }],
      { repoAgeDays: 540 },
    );
    const helper = profile('Graph-0D02', 'qlhelp/graphql-kit', [
      { name: 'GraphQL', category: 'systems_architecture' },
      { name: 'APIs', category: 'domain' },
    ], [], { repoAgeDays: 400 });
    const discounted = scorePair(stale, helper, { now: NOW });
    const undiscounted = scorePair(fresh, helper, { now: NOW });
    assert.equal(discounted.score_breakdown.freshness, 0.1);
    assert.ok(discounted.limitations.some((l) => l.includes('no activity for over 120 days')));
    assert.ok(!undiscounted.limitations.some((l) => l.includes('no activity for over 120 days')));
    assert.equal(
      discounted.score_breakdown.need_offer_fit,
      Math.round(undiscounted.score_breakdown.need_offer_fit * 0.2 * 10_000) / 10_000,
    );
    assert.ok(discounted.composite_score < undiscounted.composite_score);
    // With a fresh need competing, only the stale share is discounted.
    const mixed = (age: number) =>
      profile('Dusty-0D03', 'old-org/graphql-api', [{ name: 'APIs', category: 'domain' }], [
        { wants: ['GraphQL'], issueAgeDays: age },
        { wants: ['Kotlin'], issueAgeDays: 3 },
      ]);
    const penalized = scorePair(mixed(900), helper, { now: NOW }).score_breakdown.need_offer_fit;
    const unpenalized = scorePair(mixed(3), helper, { now: NOW }).score_breakdown.need_offer_fit;
    assert.ok(penalized < unpenalized, `${penalized} < ${unpenalized}`);
    // A stale need the helper cannot meet must not drag down the fit of a fresh need it does meet.
    const unmet = (age: number) =>
      profile('Dusty-0D06', 'old-org/graphql-api', [{ name: 'APIs', category: 'domain' }], [
        { wants: ['GraphQL'], issueAgeDays: 3 },
        { wants: ['Kotlin'], issueAgeDays: age },
      ]);
    const staleUnmet = scorePair(unmet(900), helper, { now: NOW }).score_breakdown.need_offer_fit;
    const freshUnmet = scorePair(unmet(3), helper, { now: NOW }).score_breakdown.need_offer_fit;
    assert.ok(staleUnmet >= freshUnmet, `${staleUnmet} >= ${freshUnmet}`);
  });

  test('a need with an old issue but also fresh non-issue evidence is not treated as stale', () => {
    const helper = profile('Graph-0D04', 'qlhelp/graphql-kit', [{ name: 'GraphQL', category: 'systems_architecture' }]);
    const owner = profile('Dusty-0D05', 'old-org/graphql-api', [{ name: 'APIs', category: 'domain' }], [
      { wants: ['GraphQL'], issueAgeDays: 900 },
    ]);
    const freshRepoReceipt = owner.evidence.find((r) => r.source_type === 'repo_metadata')!;
    const backed = { ...owner, needs: owner.needs.map((n) => ({ ...n, evidence_receipt_ids: [...n.evidence_receipt_ids, freshRepoReceipt.id] })) };
    const staleOnly = scorePair(owner, helper, { now: NOW });
    const withFresh = scorePair(backed, helper, { now: NOW });
    assert.ok(staleOnly.limitations.some((l) => l.includes('no activity for over 120 days')));
    assert.ok(!withFresh.limitations.some((l) => l.includes('no activity for over 120 days')));
    assert.ok(withFresh.score_breakdown.need_offer_fit > staleOnly.score_breakdown.need_offer_fit);
  });

  test('TC-SCORE-04: a dismissed inferred need is excluded and the score recomputes without it', () => {
    const offerer = profile('Kube-0E01', 'ops-co/k8s-operator', [
      { name: 'Kubernetes', category: 'systems_architecture' },
      { name: 'Go', category: 'language' },
      { name: 'cloud', category: 'domain' },
    ]);
    const base: ClaimSpec[] = [
      { name: 'React', category: 'framework' },
      { name: 'cloud', category: 'domain' },
    ];
    const withNeed = profile('Front-0E02', 'web-co/dashboard', base, [{ wants: ['Kubernetes'] }]);
    const dismissed = { ...withNeed, needs: withNeed.needs.map((n) => ({ ...n, dismissed_by_user: true })) };
    const withoutNeed = { ...withNeed, needs: [] };
    const before = scorePair(withNeed, offerer, { now: NOW });
    const after = scorePair(dismissed, offerer, { now: NOW });
    assert.ok(before.score_breakdown.need_offer_fit > 0);
    assert.equal(after.score_breakdown.need_offer_fit, 0);
    assert.deepEqual(after.score_breakdown, scorePair(withoutNeed, offerer, { now: NOW }).score_breakdown);
    assert.ok(after.composite_score < before.composite_score);
  });

  test('a dismissed capability claim is excluded from every component', () => {
    const [a, b] = highSynergyPair();
    const dismissedAll = { ...b, claims: b.claims.map((c) => ({ ...c, dismissed_by_user: true })) };
    const pair = scorePair(a, dismissedAll, { now: NOW });
    assert.equal(pair.score_breakdown.capability_similarity, 0);
    assert.equal(pair.score_breakdown.complementarity, 0);
  });

  test('insufficient evidence: a high-synergy pair without valid evidence on one side is rejected', () => {
    const [a, b] = highSynergyPair();
    for (const mode of ['none', 'invalid'] as const) {
      const bare = profile(
        'Spool-0B03',
        'wave-ui/audio-deck',
        b.claims.map((c) => ({ name: c.name, category: c.category, proficiency: c.proficiency_signal })),
        [{ wants: ['Rust', 'WebRTC'] }],
        { evidence: mode },
      );
      const pair = scorePair(a, bare, { now: NOW });
      assert.ok(pair.composite_score >= MATCH_SURFACE_THRESHOLD, `${mode}: score ${pair.composite_score}`);
      assert.equal(pair.surfaceable, false, mode);
      assert.deepEqual(pair.rejections, ['insufficient_evidence'], mode);
    }
  });

  test('a receipt that fails EvidenceReceiptSchema (GitHub evidence off github.com) is not counted', () => {
    const [a, b] = highSynergyPair();
    const offsite = { ...b, evidence: b.evidence.map((r) => ({ ...r, source_url: 'https://example.com/fake' })) };
    const pair = scorePair(a, offsite, { now: NOW });
    assert.ok(!pair.evidence_receipt_ids.some((id) => b.evidence.some((r) => r.id === id)));
    assert.deepEqual(pair.rejections, ['insufficient_evidence']);
  });

  test('capability names match across case, spaces and underscores (agent_orchestration pairs with evals-observability)', () => {
    const orchestrator = profile('Agent-5A01', 'agents/orch', [
      { name: 'agent_orchestration', category: 'domain' },
      { name: 'AI', category: 'domain' },
    ]);
    const evaluator = profile('Evals-5A02', 'evals/obs', [
      { name: 'Evals Observability', category: 'domain' },
      { name: 'AI', category: 'domain' },
    ]);
    assert.equal(scorePair(orchestrator, evaluator, { now: NOW }).score_breakdown.complementarity, 1);
  });

  test('refuses to score a participant against themselves', () => {
    const [a] = highSynergyPair();
    assert.throws(() => scorePair(a, a, { now: NOW }), /themselves/);
  });
});

describe('selectTopMatches', () => {
  test('TC-SCORE-05: an empty, single or disjoint pool returns no matches and never pads', () => {
    assert.deepEqual(selectTopMatches([], { now: NOW }), new Map());
    const lone = profile('Solo-0F01', 'solo/one', [{ name: 'Haskell', category: 'language' }]);
    assert.deepEqual(selectTopMatches([lone], { now: NOW }), new Map([[lone.participant.id, []]]));
    const other = profile('Solo-0F02', 'solo/two', [{ name: 'COBOL', category: 'language' }, { name: 'banking', category: 'domain' }]);
    const pair = scorePair(lone, other, { now: NOW });
    assert.ok(pair.composite_score < MATCH_SURFACE_THRESHOLD, `score ${pair.composite_score}`);
    const result = selectTopMatches([lone, other], { now: NOW });
    assert.deepEqual([...result.values()], [[], []]);
  });

  test('returns each participant its top 3 by score, deterministically, whatever the input order', () => {
    const [hub, best] = highSynergyPair();
    const variants = ['Echo-1A01', 'Echo-1A02', 'Echo-1A03', 'Echo-1A04'].map((alias, i) =>
      profile(
        alias,
        `ui-${i}/deck`,
        [
          { name: 'TypeScript', category: 'language' },
          { name: 'React', category: 'framework' },
          { name: 'realtime-media', category: 'domain', confidence: 0.9 - i * 0.05 },
          ...(i < 2 ? [{ name: 'WebAudio', category: 'framework' as const }] : []),
        ],
        [{ wants: ['Rust', 'WebRTC'], confidence: 0.85 - i * 0.1 }],
      ),
    );
    const pool = [hub, best, ...variants];
    const result = selectTopMatches(pool, { now: NOW });
    const hubList = result.get(hub.participant.id)!;
    assert.equal(hubList.length, 3);
    const allForHub = pool
      .filter((p) => p !== hub)
      .map((p) => scorePair(hub, p, { now: NOW }))
      .filter((p) => p.surfaceable)
      .sort((x, y) => y.composite_score - x.composite_score);
    assert.ok(allForHub.length > 3, 'fixture needs more than 3 surfaceable candidates');
    assert.deepEqual(
      hubList.map((p) => p.composite_score),
      allForHub.slice(0, 3).map((p) => p.composite_score),
    );
    for (let i = 1; i < hubList.length; i++) assert.ok(hubList[i - 1]!.composite_score >= hubList[i]!.composite_score);
    const reversed = selectTopMatches([...pool].reverse(), { now: NOW });
    for (const [id, list] of result) assert.deepEqual(reversed.get(id), list);
  });

  test('breaks score ties on the other participant id', () => {
    const [hub] = highSynergyPair();
    const twin = (alias: string) =>
      profile(alias, 'ui/twin', [
        { name: 'TypeScript', category: 'language' },
        { name: 'React', category: 'framework' },
        { name: 'WebAudio', category: 'framework' },
        { name: 'realtime-media', category: 'domain' },
      ], [{ wants: ['Rust', 'WebRTC'] }]);
    const first = twin('Twin-2A01');
    const second = twin('Twin-2A02');
    const list = selectTopMatches([second, hub, first], { now: NOW }).get(hub.participant.id)!;
    assert.equal(list[0]!.composite_score, list[1]!.composite_score);
    assert.deepEqual(
      list.map((p) => (p.participant_a_id === hub.participant.id ? p.participant_b_id : p.participant_a_id)),
      [first.participant.id, second.participant.id],
    );
  });

  test('excludes participants without granted consent', () => {
    const [a, b] = highSynergyPair();
    const withdrawn = profile('Gone-3A01', 'gone/repo', b.claims.map((c) => ({ name: c.name, category: c.category })), [
      { wants: ['Rust', 'WebRTC'] },
    ], { consent: 'withdrawn' });
    const result = selectTopMatches([a, b, withdrawn], { now: NOW });
    assert.equal(result.has(withdrawn.participant.id), false);
    assert.ok(result.get(a.participant.id)!.every((p) => p.participant_b_id !== withdrawn.participant.id && p.participant_a_id !== withdrawn.participant.id));
  });

  test('publishes match.candidate.generated once per selected pair, idempotently, when a db is supplied', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(readFileSync(join(REPO_ROOT, 'src/db/schema.sql'), 'utf8'));
    const [a, b] = highSynergyPair();
    const result = selectTopMatches([a, b], { now: NOW, db });
    const pair = result.get(a.participant.id)![0]!;
    const events = readEventsAfter(db, 0);
    assert.equal(events.length, 1);
    PublicEventEnvelopeSchema.parse(events[0]);
    assert.equal(events[0]!.type, 'match.candidate.generated');
    assert.deepEqual(events[0]!.payload, {
      match_id: pair.match_id,
      display_alias_a: pair.participant_a_id === a.participant.id ? 'Thread-0A01' : 'Spool-0B02',
      display_alias_b: pair.participant_b_id === b.participant.id ? 'Spool-0B02' : 'Thread-0A01',
    });
    selectTopMatches([a, b], { now: NOW, db });
    assert.equal(readEventsAfter(db, 0).length, 1);
    db.close();
  });

  test('ranks a pool of 30 in under 5 ms (best of 5 runs)', () => {
    const stacks: ClaimSpec[][] = [
      [{ name: 'Rust', category: 'language' }, { name: 'WebRTC', category: 'systems_architecture' }, { name: 'realtime-media', category: 'domain' }],
      [{ name: 'TypeScript', category: 'language' }, { name: 'React', category: 'framework' }, { name: 'realtime-media', category: 'domain' }],
      [{ name: 'Python', category: 'language' }, { name: 'PyTorch', category: 'framework' }, { name: 'ml', category: 'domain' }],
      [{ name: 'Go', category: 'language' }, { name: 'Kubernetes', category: 'systems_architecture' }, { name: 'ml', category: 'domain' }],
    ];
    const wants = [['React'], ['Rust', 'WebRTC'], ['Kubernetes'], ['PyTorch']];
    const pool = Array.from({ length: 30 }, (_, i) =>
      profile(`Perf-${(0x1000 + i).toString(16).toUpperCase()}`, `perf-${i}/repo`, stacks[i % 4]!, [{ wants: wants[i % 4]! }]),
    );
    let best = Infinity;
    for (let run = 0; run < 5; run++) {
      const start = performance.now();
      selectTopMatches(pool, { now: NOW });
      best = Math.min(best, performance.now() - start);
    }
    assert.ok(best < 5, `best run ${best.toFixed(2)} ms`);
  });
});

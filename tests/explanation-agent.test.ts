import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import {
  CapabilityClaimSchema,
  EvidenceReceiptSchema,
  MatchProposalSchema,
  OpportunityNeedSchema,
  ParticipantSchema,
} from '../src/contracts/index.ts';
import type { CapabilityClaim, EvidenceReceipt } from '../src/contracts/index.ts';
import { readEventsAfter } from '../src/events/bus.ts';
import {
  buildEnrichmentPrompt,
  buildStage1Explanation,
  createGeminiClient,
  enrichExplanation,
  explainMatches,
  geminiClientFromEnv,
  scoreLine,
} from '../src/matching/explanation-agent.ts';
import type { ExplanationLlm, StagedExplanation } from '../src/matching/explanation-agent.ts';
import { extractUrls, formatEvidencePills, hasCrossEvidence } from '../src/matching/evidence-formatter.ts';
import { scorePair, selectTopMatches } from '../src/matching/scorer.ts';
import type { ParticipantProfile } from '../src/matching/scorer.ts';

const REPO_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SCHEMA_SQL = readFileSync(join(REPO_ROOT, 'src/db/schema.sql'), 'utf8');
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
}

/**
 * Builds a contract-valid profile whose repo is owned by the participant's own GitHub login.
 * @param alias - Display alias.
 * @param project - Repo name under the participant's login.
 * @param claims - Capability claims (primary, confidence 0.9).
 * @param wants - Desired capabilities of one inferred need (omit for none).
 * @param contactCard - Private contact card.
 * @returns The profile.
 */
function profile(alias: string, project: string, claims: ClaimSpec[], wants: string[] = [], contactCard: string | null = null): ParticipantProfile {
  const id = nextId();
  const login = `dev-${alias.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
  const repo = `${login}/${project}`;
  const participant = ParticipantSchema.parse({
    id,
    display_alias: alias,
    github_username: login,
    github_user_id: serial,
    avatar_url: null,
    consent_status: 'granted',
    consent_granted_at: daysAgo(1),
    contact_card: contactCard,
    analysis_state: 'ready',
    created_at: daysAgo(1),
    updated_at: daysAgo(1),
  });
  const repoReceipt = EvidenceReceiptSchema.parse({
    id: nextId(),
    participant_id: id,
    source_type: 'repo_metadata',
    source_url: `https://github.com/${repo}`,
    repo_full_name: repo,
    title_or_summary: `${repo} repository`,
    source_updated_at: daysAgo(4),
    fetched_at: NOW.toISOString(),
  });
  const evidence: EvidenceReceipt[] = [repoReceipt];
  const parsedClaims = claims.map((c) =>
    CapabilityClaimSchema.parse({
      id: nextId(),
      participant_id: id,
      category: c.category,
      name: c.name,
      epistemic_type: 'OBSERVED_FACT',
      proficiency_signal: 'primary',
      confidence: 0.9,
      uncertainty_note: null,
      evidence_receipt_ids: [repoReceipt.id],
    }),
  );
  const needs = wants.length
    ? [
        (() => {
          const issue = EvidenceReceiptSchema.parse({
            id: nextId(),
            participant_id: id,
            source_type: 'open_issue',
            source_url: `https://github.com/${repo}/issues/1`,
            repo_full_name: repo,
            title_or_summary: `Help wanted: ${wants.join(', ')}`,
            source_updated_at: daysAgo(2),
            fetched_at: NOW.toISOString(),
          });
          evidence.push(issue);
          return OpportunityNeedSchema.parse({
            id: nextId(),
            participant_id: id,
            project_repo: repo,
            opportunity_type: 'open_issue_help',
            summary: `Help with ${wants.join(' and ')}`,
            desired_capabilities: wants,
            confidence: 0.85,
            uncertainty_note: 'Inferred from an open issue.',
            evidence_receipt_ids: [issue.id],
          });
        })(),
      ]
    : [];
  return { participant, claims: parsedClaims, needs, evidence };
}

/**
 * The TC-SCORE-01 style pair, returned as [A, B] in canonical order.
 * @returns Both profiles, A first.
 */
function pair(): [ParticipantProfile, ParticipantProfile] {
  const x = profile(
    'Thread-0A01',
    'rust-sfu',
    [
      { name: 'Rust', category: 'language' },
      { name: 'WebRTC', category: 'systems_architecture' },
      { name: 'TypeScript', category: 'language' },
      { name: 'realtime-media', category: 'domain' },
    ],
    ['React', 'WebAudio'],
    'signal: @thread-private',
  );
  const y = profile(
    'Spool-0B02',
    'audio-deck',
    [
      { name: 'TypeScript', category: 'language' },
      { name: 'React', category: 'framework' },
      { name: 'WebAudio', category: 'framework' },
      { name: 'WebRTC', category: 'framework' },
      { name: 'realtime-media', category: 'domain' },
    ],
    ['Rust', 'WebRTC'],
    'spool@example.com',
  );
  return x.participant.id < y.participant.id ? [x, y] : [y, x];
}

/**
 * Stage 1 card for the standard pair.
 * @returns Profiles and the staged card.
 */
function staged(): { a: ParticipantProfile; b: ParticipantProfile; card: StagedExplanation } {
  const [a, b] = pair();
  aliases.a = { id: a.participant.id, alias: a.participant.display_alias };
  aliases.b = { id: b.participant.id, alias: b.participant.display_alias };
  return { a, b, card: buildStage1Explanation(scorePair(a, b, { now: NOW }), a, b) };
}

/**
 * Opens an in-memory database with the A-001 schema and both participants inserted.
 * @param profiles - Participants to insert.
 * @returns The handle.
 */
function dbWith(profiles: readonly ParticipantProfile[]): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(SCHEMA_SQL);
  const insert = db.prepare(
    `INSERT INTO participants (id, display_alias, github_username, github_user_id, consent_status, consent_granted_at, contact_card, analysis_state, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const { participant: p } of profiles) {
    insert.run(p.id, p.display_alias, p.github_username, p.github_user_id, p.consent_status, p.consent_granted_at, p.contact_card, p.analysis_state, p.created_at, p.updated_at);
  }
  return db;
}

/**
 * A fake model that returns a fixed reply.
 * @param reply - Text to return, or a function of the prompt.
 * @returns The client and the prompts it saw.
 */
function fakeLlm(reply: string | ((prompt: string) => string)): ExplanationLlm & { prompts: string[] } {
  const prompts: string[] = [];
  return {
    prompts,
    async complete(prompt) {
      prompts.push(prompt);
      return typeof reply === 'string' ? reply : reply(prompt);
    },
  };
}

/**
 * Display alias of the card's participant A, read from its Stage 1 pairing text.
 * @param card - The Stage 1 card.
 * @returns The alias.
 */
function aliasA(card: StagedExplanation): string {
  return card.proposal.participant_a_id === aliases.a.id ? aliases.a.alias : aliases.b.alias;
}

/**
 * Display alias of the card's participant B.
 * @param card - The Stage 1 card.
 * @returns The alias.
 */
function aliasB(card: StagedExplanation): string {
  return card.proposal.participant_b_id === aliases.a.id ? aliases.a.alias : aliases.b.alias;
}

const aliases = { a: { id: '', alias: '' }, b: { id: '', alias: '' } };

/**
 * A grounded thesis citing one pill from each side.
 * @param card - The Stage 1 card.
 * @param overrides - Fields to replace.
 * @returns JSON text.
 */
function thesis(card: StagedExplanation, overrides: Record<string, unknown> = {}): string {
  const pa = card.pills.find((p) => p.side === 'a')!;
  const pb = card.pills.find((p) => p.side === 'b')!;
  return JSON.stringify({
    why_you_match: `One of you runs the media server in ${pa.repo}, the other builds the browser audio UI in ${pb.repo}: ${pa.url}`,
    collaboration_angle: `For 15 minutes, ${card.proposal.participant_a_id ? aliasA(card) : ''} and ${aliasB(card)} wire the audio worklet to the SFU for one call and measure latency together.`,
    cited_receipt_ids: [pa.receipt_id, pb.receipt_id],
    ...overrides,
  });
}

describe('evidence pills', () => {
  test('keep only cited, owned, contract-valid receipts, side A first, deduplicated by URL', () => {
    const [a, b] = pair();
    const foreign = { ...b.evidence[0]!, participant_id: a.participant.id };
    const duplicateUrl = { ...a.evidence[0]!, id: nextId() };
    const pills = formatEvidencePills(
      [...a.evidence, ...b.evidence, foreign, duplicateUrl].map((r) => r.id).concat('00000000-0000-4000-8000-0000000000aa'),
      { id: a.participant.id, evidence: [...a.evidence, duplicateUrl] },
      { id: b.participant.id, evidence: [...b.evidence, foreign] },
    );
    assert.deepEqual(new Set(pills.map((p) => p.receipt_id)), new Set([...a.evidence, ...b.evidence].map((r) => r.id)));
    assert.equal(new Set(pills.map((p) => p.url)).size, pills.length);
    assert.equal(pills[0]!.side, 'a');
    assert.ok(hasCrossEvidence(pills));
    assert.equal(hasCrossEvidence(pills.filter((p) => p.side === 'a')), false);
  });

  test('extractUrls strips trailing punctuation', () => {
    assert.deepEqual(extractUrls('see https://github.com/a/b. and (https://x.dev/y), done'), ['https://github.com/a/b', 'https://x.dev/y']);
  });
});

describe('Stage 1', () => {
  test('produces a contract-valid card with all seven spec elements and cross-participant pills', () => {
    const { a, b, card } = staged();
    const p = card.proposal;
    MatchProposalSchema.parse(p);
    assert.ok(p.complementary_summary.startsWith(scoreLine(p.composite_score, p.score_breakdown)));
    assert.match(p.complementary_summary, /Thread-0A01 brings .*Rust|Spool-0B02 brings .*React/);
    assert.match(p.complementary_summary, /You both build in realtime-media/);
    assert.ok(p.relevant_projects.length === 2);
    for (const repo of p.relevant_projects) assert.ok(p.complementary_summary.includes(repo), repo);
    assert.match(p.suggested_first_collaboration, /15 minutes/);
    assert.match(p.confidence_limitations, /inferred from public activity/);
    assert.match(p.confidence_limitations, /does not mean either of you has asked for help/);
    assert.ok(p.evidence_receipt_ids.length >= 2);
    assert.ok(hasCrossEvidence(card.pills));
    assert.deepEqual(p.evidence_receipt_ids, card.pills.map((x) => x.receipt_id));
    for (const pill of card.pills) assert.match(pill.url, /^https:\/\/github\.com\//);
    const text = `${p.complementary_summary} ${p.suggested_first_collaboration} ${p.confidence_limitations}`;
    for (const profileX of [a, b]) {
      assert.ok(!text.includes(profileX.participant.contact_card!), 'contact card leaked');
    }
    assert.equal(p.intro_state, 'candidate');
  });

  test('refuses pairs that are not surfaceable or profiles in the wrong order', () => {
    const { a, b } = staged();
    const scored = scorePair(a, b, { now: NOW });
    assert.throws(() => buildStage1Explanation({ ...scored, surfaceable: false, rejections: ['below_threshold'] }, a, b), /not surfaceable/);
    assert.throws(() => buildStage1Explanation(scored, b, a), /do not match the pair/);
  });

  test('explainMatches persists each pair once, publishes match.evaluated idempotently and never resets intro state', () => {
    const [a, b] = pair();
    const db = dbWith([a, b]);
    const selection = selectTopMatches([a, b], { now: NOW });
    const cards = explainMatches(selection, [a, b], { now: NOW, db });
    assert.equal(cards.size, 1);
    const card = [...cards.values()][0]!;
    const row = db.prepare('SELECT * FROM matches WHERE id = ?').get(card.proposal.id) as Record<string, unknown>;
    assert.equal(row.complementary_summary, card.proposal.complementary_summary);
    assert.deepEqual(JSON.parse(row.evidence_receipt_ids as string), card.proposal.evidence_receipt_ids);
    const events = readEventsAfter(db, 0);
    assert.deepEqual(
      events.map((e) => [e.type, e.payload]),
      [
        [
          'match.evaluated',
          {
            match_id: card.proposal.id,
            display_alias_a: a.participant.display_alias,
            display_alias_b: b.participant.display_alias,
            composite_score: card.proposal.composite_score,
          },
        ],
      ],
    );
    db.prepare("UPDATE matches SET intro_state = 'proposed_by_a', approval_a = 1 WHERE id = ?").run(card.proposal.id);
    explainMatches(selection, [a, b], { now: new Date(NOW.getTime() + 60_000), db });
    const after = db.prepare('SELECT intro_state, approval_a, updated_at FROM matches WHERE id = ?').get(card.proposal.id) as Record<string, unknown>;
    assert.equal(after.intro_state, 'proposed_by_a');
    assert.equal(after.approval_a, 1);
    assert.equal(after.updated_at, new Date(NOW.getTime() + 60_000).toISOString());
    assert.equal(readEventsAfter(db, 0).length, 1);
    db.close();
  });

  test('two participants citing the same shared repo URL both keep their evidence', () => {
    const [a, b] = pair();
    const sharedUrl = 'https://github.com/media-org/shared-sfu';
    const share = (p: ParticipantProfile): ParticipantProfile => ({
      ...p,
      evidence: p.evidence.map((r) => (r.source_type === 'repo_metadata' ? { ...r, source_url: sharedUrl, repo_full_name: 'media-org/shared-sfu' } : r)),
    });
    const sa = share(a);
    const sb = share(b);
    const card = buildStage1Explanation(scorePair(sa, sb, { now: NOW }), sa, sb);
    assert.ok(card.pills.some((p) => p.side === 'a' && p.url === sharedUrl));
    assert.ok(card.pills.some((p) => p.side === 'b' && p.url === sharedUrl));
  });

  test('Stage 1 and Stage 2 writes nest inside a caller transaction', async () => {
    const { a, b, card } = staged();
    const db = dbWith([a, b]);
    db.exec('BEGIN');
    const cards = explainMatches(new Map([[a.participant.id, [scorePair(a, b, { now: NOW })]]]), [a, b], { now: NOW, db });
    const result = await enrichExplanation(card, a, b, { llm: fakeLlm(thesis(card)), db, now: NOW });
    db.exec('COMMIT');
    assert.equal(cards.size, 1);
    assert.equal(result.source, 'llm');
    assert.equal(readEventsAfter(db, 0).length, 2);
    db.close();
  });

  test('a pair that cannot be explained is skipped and logged; the rest of the batch still runs', () => {
    const [a, b] = pair();
    const db = dbWith([a, b]);
    const good = scorePair(a, b, { now: NOW });
    const orphan = { ...good, match_id: '6f1c2b1e-8a4d-4c1e-9b7a-2f3d4e5a6b7c', participant_b_id: 'ffffffff-0000-4000-8000-000000000000' };
    const lines: Array<[string, Record<string, unknown> | undefined]> = [];
    const cards = explainMatches(new Map([[a.participant.id, [orphan, good]]]), [a, b], { now: NOW, db, log: { info: (m, f) => void lines.push([m, f]) } });
    assert.deepEqual([...cards.keys()], [good.match_id]);
    assert.equal(lines.length, 1);
    assert.equal(lines[0]![1]!.match_id, orphan.match_id);
    assert.equal(readEventsAfter(db, 0).length, 1);
    db.close();
  });

  test('explains the top matches of a 30-person pool in under 50 ms (best of 5)', () => {
    const stacks: Array<[ClaimSpec[], string[]]> = [
      [[{ name: 'Rust', category: 'language' }, { name: 'WebRTC', category: 'systems_architecture' }, { name: 'realtime-media', category: 'domain' }], ['React']],
      [[{ name: 'TypeScript', category: 'language' }, { name: 'React', category: 'framework' }, { name: 'realtime-media', category: 'domain' }], ['Rust', 'WebRTC']],
    ];
    const pool = Array.from({ length: 30 }, (_, i) =>
      profile(`Perf-${(0x2000 + i).toString(16).toUpperCase()}`, `proj-${i}`, stacks[i % 2]![0], stacks[i % 2]![1]),
    );
    const selection = selectTopMatches(pool, { now: NOW });
    let best = Infinity;
    let count = 0;
    for (let run = 0; run < 5; run++) {
      const start = performance.now();
      count = explainMatches(selection, pool, { now: NOW }).size;
      best = Math.min(best, performance.now() - start);
    }
    assert.ok(count > 0);
    assert.ok(best < 50, `best run ${best.toFixed(2)} ms for ${count} cards`);
  });
});

describe('Stage 2', () => {
  test('without a client, Stage 1 stands', async () => {
    const { a, b, card } = staged();
    assert.deepEqual(await enrichExplanation(card, a, b, { now: NOW }), { proposal: card.proposal, source: 'stage1', rejection: 'no_client' });
  });

  test('a grounded thesis replaces the summary and first step, keeps the score line, and updates the row', async () => {
    const { a, b, card } = staged();
    const db = dbWith([a, b]);
    explainMatches(new Map([[a.participant.id, [scorePair(a, b, { now: NOW })]]]), [a, b], { now: NOW, db });
    const llm = fakeLlm(thesis(card));
    const result = await enrichExplanation(card, a, b, { llm, db, now: NOW });
    assert.equal(result.source, 'llm');
    MatchProposalSchema.parse(result.proposal);
    assert.ok(result.proposal.complementary_summary.startsWith(scoreLine(card.proposal.composite_score, card.proposal.score_breakdown)));
    assert.match(result.proposal.suggested_first_collaboration, /measure latency/);
    assert.deepEqual(result.proposal.evidence_receipt_ids, card.proposal.evidence_receipt_ids);
    const row = db.prepare('SELECT complementary_summary, suggested_first_collaboration FROM matches WHERE id = ?').get(card.proposal.id) as Record<string, string>;
    assert.equal(row.complementary_summary, result.proposal.complementary_summary);
    assert.equal(row.suggested_first_collaboration, result.proposal.suggested_first_collaboration);
    db.close();
  });

  test('accepts a fenced JSON reply', async () => {
    const { a, b, card } = staged();
    const result = await enrichExplanation(card, a, b, { llm: fakeLlm('```json\n' + thesis(card) + '\n```'), now: NOW });
    assert.equal(result.source, 'llm');
  });

  test('the verification gate rejects ungrounded or private output and keeps Stage 1', async () => {
    const { a, b, card } = staged();
    const pa = card.pills.find((p) => p.side === 'a')!;
    const cases: Array<[string, string]> = [
      ['foreign_citation', thesis(card, { cited_receipt_ids: [pa.receipt_id, '00000000-0000-4000-8000-0000000000bb'] })],
      ['one_sided_citation', thesis(card, { cited_receipt_ids: [pa.receipt_id] })],
      ['foreign_url', thesis(card, { why_you_match: 'Both of you should read https://github.com/someone-else/repo today.' })],
      ['private_detail', thesis(card, { collaboration_angle: `${a.participant.display_alias} and ${b.participant.display_alias}: email spool@example.com to set up a call.` })],
      ['private_detail', thesis(card, { collaboration_angle: `${a.participant.display_alias} and ${b.participant.display_alias}: write to builders@hackathon.dev for a room.` })],
      ['private_detail', thesis(card, { collaboration_angle: `${a.participant.display_alias} and ${b.participant.display_alias}: ping @spool on chat after this.` })],
      ['private_detail', thesis(card, { collaboration_angle: `${a.participant.display_alias} and ${b.participant.display_alias}: ask "@spool" for access.` })],
      ['foreign_repo', thesis(card, { why_you_match: 'You could both learn from someone-else/media-kit first.' })],
      ['foreign_repo', thesis(card, { why_you_match: 'Start from github.com/someone-else/media-kit together.' })],
      ['foreign_repo', thesis(card, { why_you_match: 'Borrow the approach from Facebook/react first.' })],
      ['foreign_url', thesis(card, { why_you_match: 'The kit at gitlab.com/someone/kit is a good start.' })],
      ['foreign_url', thesis(card, { why_you_match: 'Read example.com/path before you meet.' })],
      ['foreign_url', thesis(card, { why_you_match: 'Book a room on example.com first.' })],
      ['missing_element', thesis(card, { why_you_match: '   ' })],
      ['missing_element', thesis(card, { collaboration_angle: 'Spend 15 minutes wiring the worklet to the SFU.' })],
      ['private_detail', thesis(card, { why_you_match: `Ask ${b.participant.github_username} about the deck.` })],
      ['private_detail', thesis(card, { collaboration_angle: `${a.participant.display_alias} and ${b.participant.display_alias}: message them at ${a.participant.contact_card}.` })],
      ['too_long', thesis(card, { why_you_match: 'x'.repeat(700) })],
      ['missing_element', thesis(card, { collaboration_angle: '   ' })],
      ['malformed', 'not json at all'],
      ['malformed', JSON.stringify({ why_you_match: 'hi', collaboration_angle: 'go', cited_receipt_ids: 'nope' })],
    ];
    for (const [expected, reply] of cases) {
      const result = await enrichExplanation(card, a, b, { llm: fakeLlm(reply), now: NOW });
      assert.equal(result.source, 'stage1', expected);
      assert.equal(result.rejection, expected, reply.slice(0, 80));
      assert.equal(result.proposal, card.proposal);
    }
  });

  test('mentioning a repo whose name contains a participant login is allowed', async () => {
    const { a, b, card } = staged();
    const repo = card.pills.find((p) => p.side === 'b')!.repo!;
    assert.ok(repo.startsWith(`${b.participant.github_username}/`));
    const result = await enrichExplanation(card, a, b, {
      llm: fakeLlm(thesis(card, { collaboration_angle: `${a.participant.display_alias} and ${b.participant.display_alias} open ${repo} together for 15 minutes and trace one call.` })),
      now: NOW,
    });
    assert.equal(result.source, 'llm');
  });

  test('citing a profile URL that contains a login (no repo) is allowed', async () => {
    const { a, b, card } = staged();
    const profileUrl = `https://github.com/${b.participant.github_username}`;
    const withProfile: StagedExplanation = {
      ...card,
      pills: [
        ...card.pills,
        { receipt_id: '00000000-0000-4000-8000-0000000000cc', side: 'b', label: 'GitHub profile', url: profileUrl, repo: null, source_type: 'user_profile', source_updated_at: NOW.toISOString() },
      ],
    };
    const result = await enrichExplanation(withProfile, a, b, {
      llm: fakeLlm(thesis(card, { collaboration_angle: `${a.participant.display_alias} and ${b.participant.display_alias} start from ${profileUrl} and pick one repo to pair on.` })),
      now: NOW,
    });
    assert.equal(result.source, 'llm', result.rejection);
  });

  test('a client error or a reply slower than the timeout falls back to Stage 1, and the request is aborted', async () => {
    const { a, b, card } = staged();
    const failing: ExplanationLlm = { complete: async () => Promise.reject(new Error('503')) };
    assert.equal((await enrichExplanation(card, a, b, { llm: failing, now: NOW })).rejection, 'error');
    let aborted = false;
    const hanging: ExplanationLlm = {
      complete: (_prompt, { signal }) =>
        new Promise<string>(() => {
          signal.addEventListener('abort', () => {
            aborted = true;
          });
        }),
    };
    const started = Date.now();
    const result = await enrichExplanation(card, a, b, { llm: hanging, timeoutMs: 30, now: NOW });
    assert.equal(result.rejection, 'timeout');
    assert.equal(result.proposal, card.proposal);
    assert.ok(aborted);
    assert.ok(Date.now() - started < 1000);
  });

  test('capability pairs such as Rust/WebRTC and the phrase and/or are not mistaken for repos', async () => {
    const { a, b, card } = staged();
    const result = await enrichExplanation(card, a, b, {
      llm: fakeLlm(thesis(card, { why_you_match: 'One of you lives in Rust/WebRTC and the other in TypeScript/WebAudio, and/or both, e.g. Node.js-style tooling.' })),
      now: NOW,
    });
    assert.equal(result.source, 'llm', result.rejection);
  });

  test('an accepted thesis keeps the score line and the who-brings-what pairing, and publishes a stage 2 refresh', async () => {
    const { a, b, card } = staged();
    const db = dbWith([a, b]);
    explainMatches(new Map([[a.participant.id, [scorePair(a, b, { now: NOW })]]]), [a, b], { now: NOW, db });
    const result = await enrichExplanation(card, a, b, { llm: fakeLlm(thesis(card)), db, now: NOW });
    assert.equal(result.source, 'llm');
    assert.ok(result.proposal.complementary_summary.includes(card.pairing));
    assert.ok(card.context.length > 0 && result.proposal.complementary_summary.includes(card.context), 'repo sentence kept');
    const events = readEventsAfter(db, 0);
    assert.deepEqual(events.map((e) => e.type), ['match.evaluated', 'match.evaluated']);
    await enrichExplanation(card, a, b, { llm: fakeLlm(thesis(card)), db, now: NOW });
    assert.equal(readEventsAfter(db, 0).length, 2, 'stage 2 refresh is idempotent per score');
    // Re-running Stage 1 with the same score and evidence keeps the enriched text.
    explainMatches(new Map([[a.participant.id, [scorePair(a, b, { now: NOW })]]]), [a, b], { now: NOW, db });
    const row = db.prepare('SELECT complementary_summary FROM matches WHERE id = ?').get(card.proposal.id) as Record<string, string>;
    assert.equal(row.complementary_summary, result.proposal.complementary_summary);
    db.close();
  });

  test('a thesis for a row re-scored in the meantime is discarded as stale', async () => {
    const { a, b, card } = staged();
    const db = dbWith([a, b]);
    explainMatches(new Map([[a.participant.id, [scorePair(a, b, { now: NOW })]]]), [a, b], { now: NOW, db });
    db.prepare('UPDATE matches SET composite_score = composite_score - 1 WHERE id = ?').run(card.proposal.id);
    const result = await enrichExplanation(card, a, b, { llm: fakeLlm(thesis(card)), db, now: NOW });
    assert.equal(result.rejection, 'stale');
    const row = db.prepare('SELECT complementary_summary FROM matches WHERE id = ?').get(card.proposal.id) as Record<string, string>;
    assert.equal(row.complementary_summary, card.proposal.complementary_summary);
    assert.equal(readEventsAfter(db, 0).length, 1);
    db.close();
  });

  test('fallbacks are logged with their reason and the underlying error', async () => {
    const { a, b, card } = staged();
    const lines: Array<[string, Record<string, unknown> | undefined]> = [];
    const log = { info: (m: string, f?: Record<string, unknown>) => void lines.push([m, f]) };
    await enrichExplanation(card, a, b, { llm: { complete: async () => Promise.reject(new Error('HTTP 401')) }, log, now: NOW });
    await enrichExplanation(card, a, b, { log, now: NOW });
    assert.deepEqual(lines, [['match enrichment kept stage 1', { match_id: card.proposal.id, reason: 'error', detail: 'HTTP 401' }]]);
  });

  test('the prompt carries aliases and the pair evidence but no GitHub logins or contact cards', () => {
    const { a, b, card } = staged();
    const prompt = buildEnrichmentPrompt(card, a, b);
    assert.match(prompt, /Thread-0A01/);
    assert.match(prompt, /Spool-0B02/);
    for (const pill of card.pills) assert.ok(prompt.includes(pill.receipt_id));
    const outsideEvidence = card.pills.reduce((text, p) => text.split(p.url).join('').split(p.repo ?? '\u0000').join(''), prompt);
    for (const p of [a, b]) {
      assert.ok(!outsideEvidence.includes(p.participant.github_username), 'login leaked into the prompt');
      assert.ok(!prompt.includes(p.participant.contact_card!), 'contact card leaked into the prompt');
    }
  });
});

describe('Gemini client', () => {
  test('posts a generateContent request and joins the reply parts', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"a":' }, { text: '1}' }] } }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const client = createGeminiClient({ apiKey: 'test-key', fetchImpl });
    const text = await client.complete('hello', { signal: new AbortController().signal });
    assert.equal(text, '{"a":1}');
    assert.equal(calls[0]!.url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
    assert.equal((calls[0]!.init.headers as Record<string, string>)['x-goog-api-key'], 'test-key');
    const body = JSON.parse(calls[0]!.init.body as string);
    assert.equal(body.contents[0].parts[0].text, 'hello');
    assert.equal(body.generationConfig.responseMimeType, 'application/json');
  });

  test('an HTTP error throws (and so falls back), and no key means no client', async () => {
    const fetchImpl = (async () => new Response('nope', { status: 429 })) as unknown as typeof fetch;
    await assert.rejects(createGeminiClient({ apiKey: 'k', fetchImpl }).complete('x', { signal: new AbortController().signal }), /HTTP 429/);
    assert.equal(geminiClientFromEnv({}), undefined);
    assert.ok(geminiClientFromEnv({ GEMINI_API_KEY: 'k' }));
  });
});

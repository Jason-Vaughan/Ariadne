import type { DatabaseSync } from 'node:sqlite';
import { MatchProposalSchema } from '../contracts/index.ts';
import type { MatchProposal, ScoreBreakdown } from '../contracts/index.ts';
import { publishEvent } from '../events/bus.ts';
import { findPrivateSpans, formatEvidencePills, hasCrossEvidence, scrubPrivateDetails } from './evidence-formatter.ts';
import type { EvidencePill, PrivacyContext } from './evidence-formatter.ts';
import { needKeys, normalizeCapability } from './scorer.ts';
import type { PairScore, ParticipantProfile } from './scorer.ts';
import type { Logger } from '../server.ts';

export const ENRICHMENT_TIMEOUT_MS = 4_000;
export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
const MAX_TEXT = 600;
const WILLINGNESS_NOTE =
  'The score estimates collaboration potential from public work; it does not mean either of you has asked for help.';

/** A Stage 1 match card: the contract record plus the pills it cites. */
export interface StagedExplanation {
  proposal: MatchProposal;
  pills: EvidencePill[];
  /** The deterministic "who brings what" sentences; kept in every summary, enriched or not. */
  pairing: string;
  /** The deterministic shared-domain and repo sentence; also kept when enriched. */
  context: string;
}

export interface Stage1Options {
  /** Timestamp for persisted rows; keeps Stage 1 reproducible. */
  now: Date;
  /** When given, proposals are upserted into `matches` and `match.evaluated` is published. */
  db?: DatabaseSync;
  /** Receives one line per pair that could not be explained. */
  log?: Logger;
}

/** Minimal text-completion client; inject a fake in tests or `createGeminiClient()` in production. */
export interface ExplanationLlm {
  complete(prompt: string, options: { signal: AbortSignal }): Promise<string>;
}

export interface EnrichOptions {
  llm?: ExplanationLlm;
  timeoutMs?: number;
  /** When given, an accepted thesis updates the `matches` row and publishes `match.evaluated` (stage 2). */
  db?: DatabaseSync;
  now: Date;
  /** Receives one line per fallback or failure, with the reason. */
  log?: Logger;
}

export type EnrichmentRejection =
  | 'no_client'
  | 'timeout'
  | 'error'
  | 'malformed'
  | 'foreign_citation'
  | 'one_sided_citation'
  | 'foreign_url'
  | 'foreign_repo'
  | 'private_detail'
  | 'missing_element'
  | 'too_long'
  | 'stale';

export interface EnrichmentResult {
  proposal: MatchProposal;
  source: 'llm' | 'stage1';
  rejection?: EnrichmentRejection;
}

interface LlmThesis {
  why_you_match: string;
  collaboration_angle: string;
  cited_receipt_ids: string[];
}

/**
 * Formats the score line every card leads with (spec §4 element 1).
 * @param score - Composite score.
 * @param b - Its breakdown.
 * @returns e.g. `76/100 (Capability 0.67 · Need/Offer 0.71 · …)`.
 */
export function scoreLine(score: number, b: ScoreBreakdown): string {
  const f = (n: number): string => n.toFixed(2);
  return `${score}/100 (Capability ${f(b.capability_similarity)} · Need/Offer ${f(b.need_offer_fit)} · Complementarity ${f(
    b.complementarity,
  )} · Novelty ${f(b.novelty)} · Freshness ${f(b.freshness)}).`;
}

/**
 * Shortens text to the contract's 600-character limit on a word boundary.
 * @param text - Text to bound.
 * @returns The text, ending in `…` if it was cut.
 */
function bound(text: string): string {
  if (text.length <= MAX_TEXT) return text;
  const cut = text.slice(0, MAX_TEXT - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), MAX_TEXT / 2))}…`;
}

/**
 * Capabilities one side offers (primary/active claims) that the other side's needs ask for.
 * @param offerer - The offering participant.
 * @param needer - The participant with needs.
 * @returns Matching capability labels, as the offerer names them, plus the first need they serve.
 */
function servedNeeds(offerer: ParticipantProfile, needer: ParticipantProfile): { capabilities: string[]; need?: ParticipantProfile['needs'][number] } {
  const offers = new Map<string, string>();
  for (const c of offerer.claims) {
    if (!c.dismissed_by_user && c.proficiency_signal !== 'exploratory') offers.set(normalizeCapability(c.name), c.name);
  }
  const capabilities: string[] = [];
  let need: ParticipantProfile['needs'][number] | undefined;
  for (const n of needer.needs) {
    if (n.dismissed_by_user) continue;
    for (const want of n.desired_capabilities) {
      // Same vocabulary as the scorer: a generic need ("Backend services") is met by the concrete skills it covers.
      for (const key of needKeys(want)) {
        const label = offers.get(key);
        if (label && !capabilities.includes(label)) {
          capabilities.push(label);
          need ??= n;
        }
      }
    }
  }
  return { capabilities, need };
}

/**
 * The strongest capabilities a participant holds, for cards with no explicit need/offer match.
 * @param profile - The participant.
 * @returns Up to two capability names.
 */
function topCapabilities(profile: ParticipantProfile): string[] {
  return profile.claims
    .filter((c) => !c.dismissed_by_user)
    .sort((x, y) => y.confidence - x.confidence || (x.name < y.name ? -1 : 1))
    .slice(0, 2)
    .map((c) => c.name);
}

/**
 * The privacy context for a pair: its evidence, repos and aliases may appear; contact cards, logins
 * outside its repos, and anything else private may not. Capability names are not mistaken for links.
 * @param pills - The pair's evidence pills.
 * @param a - Participant A's profile.
 * @param b - Participant B's profile.
 * @returns The context shared by the Stage 1 scrub and the Stage 2 gate.
 */
export function privacyContext(pills: readonly EvidencePill[], a: ParticipantProfile, b: ParticipantProfile): PrivacyContext {
  return {
    allowedUrls: pills.map((p) => p.url),
    allowedRepos: [...new Set(pills.flatMap((p) => (p.repo ? [p.repo] : [])))],
    aliases: [a.participant.display_alias, b.participant.display_alias],
    contactCards: [a, b].map((p) => p.participant.contact_card).filter((v): v is string => !!v && v.trim().length > 0),
    logins: [a.participant.github_username, b.participant.github_username],
    capabilities: new Set(
      [a, b].flatMap((p) => [...p.claims.map((c) => c.name), ...p.needs.flatMap((n) => n.desired_capabilities)]).map(normalizeCapability),
    ),
  };
}

/**
 * Builds the deterministic Stage 1 card for a surfaceable pair: all seven spec §4 elements,
 * naming participants only by display alias.
 * @param pair - The A-006 pair score (canonically ordered).
 * @param a - Participant A's profile (`pair.participant_a_id`).
 * @param b - Participant B's profile.
 * @returns The contract-valid proposal and its pills.
 * @throws If the profiles don't match the pair, the pair isn't surfaceable, or the cited evidence isn't cross-participant.
 */
export function buildStage1Explanation(pair: PairScore, a: ParticipantProfile, b: ParticipantProfile): StagedExplanation {
  if (a.participant.id !== pair.participant_a_id || b.participant.id !== pair.participant_b_id) {
    throw new Error('Profiles do not match the pair (pass participant A, then participant B)');
  }
  if (!pair.surfaceable) throw new Error(`Pair ${pair.match_id} is not surfaceable: ${pair.rejections.join(', ')}`);
  const pills = formatEvidencePills(pair.evidence_receipt_ids, { id: a.participant.id, evidence: a.evidence }, { id: b.participant.id, evidence: b.evidence });
  if (!hasCrossEvidence(pills)) throw new Error(`Pair ${pair.match_id} lacks cross-participant evidence`);

  const aliasA = a.participant.display_alias;
  const aliasB = b.participant.display_alias;
  const aForB = servedNeeds(a, b);
  const bForA = servedNeeds(b, a);
  const sharedDomains = a.claims
    .filter((c) => c.category === 'domain' && !c.dismissed_by_user)
    .map((c) => c.name)
    .filter((name) => b.claims.some((d) => d.category === 'domain' && !d.dismissed_by_user && normalizeCapability(d.name) === normalizeCapability(name)));
  const reposA = pills.filter((p) => p.side === 'a' && p.repo).map((p) => p.repo!);
  const reposB = pills.filter((p) => p.side === 'b' && p.repo).map((p) => p.repo!);

  const pairing: string[] = [];
  if (aForB.capabilities.length) pairing.push(`${aliasA} brings ${aForB.capabilities.join(', ')}, which ${aliasB}'s work asks for.`);
  if (bForA.capabilities.length) pairing.push(`${aliasB} brings ${bForA.capabilities.join(', ')}, which ${aliasA}'s work asks for.`);
  if (!pairing.length) {
    pairing.push(`${aliasA} works with ${topCapabilities(a).join(' and ')}; ${aliasB} works with ${topCapabilities(b).join(' and ')}.`);
  }
  const why = [
    sharedDomains.length ? `You both build in ${sharedDomains.join(', ')}.` : '',
    reposA.length && reposB.length ? `See ${[...new Set(reposA)].join(', ')} and ${[...new Set(reposB)].join(', ')}.` : '',
  ]
    .filter(Boolean)
    .join(' ');
  const ctx = privacyContext(pills, a, b);
  const pairingText = scrubPrivateDetails(pairing.join(' '), ctx);
  const context = scrubPrivateDetails(why, ctx);
  const summary = bound([scoreLine(pair.composite_score, pair.score_breakdown), pairingText, context].filter(Boolean).join(' '));

  const firstNeed = aForB.need ?? bForA.need;
  const helper = aForB.need ? aliasA : aliasB;
  const owner = aForB.need ? aliasB : aliasA;
  const firstCapability = (aForB.need ? aForB.capabilities : bForA.capabilities)[0];
  const collaboration = bound(
    scrubPrivateDetails(
      firstNeed && firstCapability
      ? `Spend 15 minutes on "${firstNeed.summary}" in ${firstNeed.project_repo}: ${owner} explains the problem, ${helper} sketches how ${firstCapability} would solve it, then pick one small step to try together today.`
      : `Spend 15 minutes comparing ${reposA[0] ?? `${aliasA}'s project`} and ${reposB[0] ?? `${aliasB}'s project`} and pick one small integration to prototype together today.`,
      ctx,
    ),
  );
  const limitations = bound(scrubPrivateDetails([...pair.limitations, WILLINGNESS_NOTE].join(' '), ctx));

  const proposal = MatchProposalSchema.parse({
    id: pair.match_id,
    participant_a_id: pair.participant_a_id,
    participant_b_id: pair.participant_b_id,
    composite_score: pair.composite_score,
    score_breakdown: pair.score_breakdown,
    complementary_summary: summary,
    relevant_projects: pair.relevant_projects,
    suggested_first_collaboration: collaboration,
    confidence_limitations: limitations,
    evidence_receipt_ids: pills.map((p) => p.receipt_id),
    intro_state: 'candidate',
  });
  return { proposal, pills, pairing: pairingText, context };
}

/**
 * Inserts or refreshes a proposal's scored and explained fields in `matches`. Introduction state,
 * approvals and shared notes are never touched, so a re-score cannot undo a participant's decision.
 * While the score and evidence are unchanged, the stored summary and first step are kept, so an
 * accepted Stage 2 thesis survives a re-run of Stage 1.
 * @param db - Open database handle.
 * @param proposal - The proposal to store.
 * @param now - Timestamp for created_at / updated_at.
 */
export function upsertProposal(db: DatabaseSync, proposal: MatchProposal, now: Date): void {
  const at = now.toISOString();
  db.prepare(
    `INSERT INTO matches (id, participant_a_id, participant_b_id, composite_score, score_breakdown, complementary_summary,
       relevant_projects, suggested_first_collaboration, confidence_limitations, evidence_receipt_ids, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET
       composite_score = excluded.composite_score,
       score_breakdown = excluded.score_breakdown,
       complementary_summary = CASE WHEN matches.composite_score = excluded.composite_score
         AND matches.evidence_receipt_ids = excluded.evidence_receipt_ids
         THEN matches.complementary_summary ELSE excluded.complementary_summary END,
       relevant_projects = excluded.relevant_projects,
       suggested_first_collaboration = CASE WHEN matches.composite_score = excluded.composite_score
         AND matches.evidence_receipt_ids = excluded.evidence_receipt_ids
         THEN matches.suggested_first_collaboration ELSE excluded.suggested_first_collaboration END,
       confidence_limitations = excluded.confidence_limitations,
       evidence_receipt_ids = excluded.evidence_receipt_ids,
       updated_at = excluded.updated_at`,
  ).run(
    proposal.id,
    proposal.participant_a_id,
    proposal.participant_b_id,
    proposal.composite_score,
    JSON.stringify(proposal.score_breakdown),
    proposal.complementary_summary,
    JSON.stringify(proposal.relevant_projects),
    proposal.suggested_first_collaboration,
    proposal.confidence_limitations,
    JSON.stringify(proposal.evidence_receipt_ids),
    at,
    at,
  );
}

/**
 * Stage 1 for a whole selection: builds each distinct pair's card once and, with a database,
 * upserts it and publishes `match.evaluated` (idempotent per pair and score) in one savepoint per pair.
 * A pair that cannot be explained is skipped and logged; the rest of the batch still runs.
 * @param selection - `selectTopMatches()` output.
 * @param profiles - The pool's profiles.
 * @param options - Timestamp and optional database.
 * @returns Cards keyed by match id, in match-id order.
 */
export function explainMatches(
  selection: ReadonlyMap<string, readonly PairScore[]>,
  profiles: readonly ParticipantProfile[],
  options: Stage1Options,
): Map<string, StagedExplanation> {
  const byId = new Map(profiles.map((p) => [p.participant.id, p]));
  const pairs = new Map<string, PairScore>();
  for (const list of selection.values()) for (const pair of list) pairs.set(pair.match_id, pair);
  const explained = new Map<string, StagedExplanation>();
  for (const pair of [...pairs.values()].sort((x, y) => (x.match_id < y.match_id ? -1 : 1))) {
    const a = byId.get(pair.participant_a_id);
    const b = byId.get(pair.participant_b_id);
    try {
      if (!a || !b) throw new Error('missing profile');
      const staged = buildStage1Explanation(pair, a, b);
      if (options.db) {
        const db = options.db;
        db.exec('SAVEPOINT explain_pair');
        try {
          upsertProposal(db, staged.proposal, options.now);
          publishEvent(
            db,
            'match.evaluated',
            {
              match_id: pair.match_id,
              display_alias_a: a.participant.display_alias,
              display_alias_b: b.participant.display_alias,
              composite_score: pair.composite_score,
            },
            { idempotencyKey: `${pair.match_id}:evaluated:stage1:${pair.composite_score}` },
          );
          db.exec('RELEASE explain_pair');
        } catch (error) {
          db.exec('ROLLBACK TO explain_pair; RELEASE explain_pair');
          throw error;
        }
      }
      explained.set(pair.match_id, staged);
    } catch (error) { // prawduct:allow prawduct/broad-except -- per-pair boundary: one bad pair must not stop the rest of the batch
      options.log?.info('match explanation skipped', {
        match_id: pair.match_id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return explained;
}

/**
 * Builds the Stage 2 prompt. It carries only display aliases, capability names, need summaries and
 * the pair's own evidence pills: no GitHub usernames, contact details or other participants.
 * @param staged - The Stage 1 card.
 * @param a - Participant A's profile.
 * @param b - Participant B's profile.
 * @returns The prompt text.
 */
export function buildEnrichmentPrompt(staged: StagedExplanation, a: ParticipantProfile, b: ParticipantProfile): string {
  const ctx = privacyContext(staged.pills, a, b);
  const describe = (p: ParticipantProfile): string => {
    const caps = p.claims.filter((c) => !c.dismissed_by_user).map((c) => `${c.name} (${c.proficiency_signal})`).join(', ');
    const needs = p.needs.filter((n) => !n.dismissed_by_user).map((n) => n.summary).join('; ');
    return scrubPrivateDetails(`${p.participant.display_alias}: capabilities [${caps}]; needs [${needs || 'none stated'}]`, ctx);
  };
  const pills = staged.pills.map((p) => `- id=${p.receipt_id} side=${p.side} ${p.label} ${p.url}`).join('\n');
  return [
    'You write a short collaboration thesis for two hackathon builders who were matched on their public work.',
    describe(a),
    describe(b),
    `Score: ${scoreLine(staged.proposal.composite_score, staged.proposal.score_breakdown)}`,
    'Evidence you may cite (use only these ids and URLs):',
    pills,
    'Rules: refer to people only by the aliases above; mention repositories only by the names listed above;',
    'do not invent URLs, repository names, handles, emails or contact details;',
    `collaboration_angle must be one concrete 15-minute first step that names both ${a.participant.display_alias} and ${b.participant.display_alias};`,
    'cite at least one evidence id from each side; keep each field under 400 characters.',
    'Reply with JSON only: {"why_you_match": string, "collaboration_angle": string, "cited_receipt_ids": string[]}',
  ].join('\n');
}

/**
 * The verification gate for an LLM thesis. Any failure rejects the whole thesis.
 * @param thesis - Parsed model output.
 * @param staged - The Stage 1 card it would replace.
 * @param a - Participant A's profile.
 * @param b - Participant B's profile.
 * @returns The first rejection, or `null` when the thesis is grounded.
 */
export function verifyThesis(thesis: LlmThesis, staged: StagedExplanation, a: ParticipantProfile, b: ParticipantProfile): EnrichmentRejection | null {
  const pillById = new Map(staged.pills.map((p) => [p.receipt_id, p]));
  if (!thesis.cited_receipt_ids.every((id) => pillById.has(id))) return 'foreign_citation';
  const sides = new Set(thesis.cited_receipt_ids.map((id) => pillById.get(id)!.side));
  if (!sides.has('a') || !sides.has('b')) return 'one_sided_citation';
  const text = `${thesis.why_you_match}\n${thesis.collaboration_angle}`;
  const spans = findPrivateSpans(text, privacyContext(staged.pills, a, b));
  if (spans.some((sp) => sp.kind === 'private')) return 'private_detail';
  if (spans.some((sp) => sp.kind === 'link')) return 'foreign_url';
  if (spans.length) return 'foreign_repo';
  const angle = thesis.collaboration_angle;
  if (!thesis.why_you_match.trim()) return 'missing_element';
  if (!angle.includes(a.participant.display_alias) || !angle.includes(b.participant.display_alias)) return 'missing_element';
  const summary = enrichedSummary(staged, thesis.why_you_match);
  if (summary.length > MAX_TEXT || thesis.collaboration_angle.trim().length > MAX_TEXT || !thesis.why_you_match.trim() || !thesis.collaboration_angle.trim()) {
    return 'too_long';
  }
  return null;
}

/**
 * The enriched summary: the score line, the deterministic "who brings what" sentences and the
 * shared-domain/repo sentence stay, followed by the model's thesis.
 * @param staged - The Stage 1 card.
 * @param why - The model's `why_you_match`.
 * @returns The summary text.
 */
function enrichedSummary(staged: StagedExplanation, why: string): string {
  return [scoreLine(staged.proposal.composite_score, staged.proposal.score_breakdown), staged.pairing, staged.context, why.trim()]
    .filter(Boolean)
    .join(' ');
}

/**
 * Parses model output into a thesis, tolerating a fenced JSON block.
 * @param raw - Model text.
 * @returns The thesis, or `null` when it is not the expected JSON shape.
 */
function parseThesis(raw: string): LlmThesis | null {
  const body = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    const value = JSON.parse(body) as Partial<LlmThesis>;
    if (
      typeof value.why_you_match === 'string' &&
      typeof value.collaboration_angle === 'string' &&
      Array.isArray(value.cited_receipt_ids) &&
      value.cited_receipt_ids.every((id) => typeof id === 'string')
    ) {
      return value as LlmThesis;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Stage 2: asks the injected model for a richer thesis and keeps it only if the verification gate
 * passes. On a missing client, timeout, error, malformed reply, failed gate or a row re-scored in the
 * meantime, Stage 1 stands (and the reason is logged). With a database, an accepted thesis updates the
 * row and publishes `match.evaluated` again so live views refresh. Never throws for model failures.
 * @param staged - The Stage 1 card.
 * @param a - Participant A's profile.
 * @param b - Participant B's profile.
 * @param options - Client, timeout (default 4 s), optional database, timestamp.
 * @returns The resulting proposal and where its text came from.
 */
export async function enrichExplanation(
  staged: StagedExplanation,
  a: ParticipantProfile,
  b: ParticipantProfile,
  options: EnrichOptions,
): Promise<EnrichmentResult> {
  const fallback = (rejection: EnrichmentRejection, detail?: string): EnrichmentResult => {
    if (rejection !== 'no_client') {
      options.log?.info('match enrichment kept stage 1', { match_id: staged.proposal.id, reason: rejection, ...(detail ? { detail } : {}) });
    }
    return { proposal: staged.proposal, source: 'stage1', rejection };
  };
  if (!options.llm) return fallback('no_client');

  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve('timeout');
    }, options.timeoutMs ?? ENRICHMENT_TIMEOUT_MS);
  });
  let raw: string | 'timeout';
  try {
    raw = await Promise.race([options.llm.complete(buildEnrichmentPrompt(staged, a, b), { signal: controller.signal }), timeout]);
  } catch (error) { // prawduct:allow prawduct/broad-except -- external model boundary: any client failure falls back to Stage 1
    return fallback('error', error instanceof Error ? error.message : String(error));
  } finally {
    clearTimeout(timer);
  }
  if (raw === 'timeout') return fallback('timeout');

  const thesis = parseThesis(raw);
  if (!thesis) return fallback('malformed');
  const rejection = verifyThesis(thesis, staged, a, b);
  if (rejection) return fallback(rejection);

  const proposal = MatchProposalSchema.parse({
    ...staged.proposal,
    complementary_summary: enrichedSummary(staged, thesis.why_you_match),
    suggested_first_collaboration: thesis.collaboration_angle.trim(),
  });
  if (options.db) {
    const db = options.db;
    // A savepoint nests inside a caller's transaction as well as standing alone.
    db.exec('SAVEPOINT enrich_match');
    try {
      // Only the row this card was built from: a re-score in the meantime makes this thesis stale.
      const updated = db
        .prepare(
          `UPDATE matches SET complementary_summary = ?, suggested_first_collaboration = ?, updated_at = ?
           WHERE id = ? AND composite_score = ? AND evidence_receipt_ids = ?`,
        )
        .run(
          proposal.complementary_summary,
          proposal.suggested_first_collaboration,
          options.now.toISOString(),
          proposal.id,
          proposal.composite_score,
          JSON.stringify(proposal.evidence_receipt_ids),
        );
      if (Number(updated.changes) === 0) {
        db.exec('ROLLBACK TO enrich_match; RELEASE enrich_match');
        return fallback('stale');
      }
      publishEvent(
        db,
        'match.evaluated',
        {
          match_id: proposal.id,
          display_alias_a: a.participant.display_alias,
          display_alias_b: b.participant.display_alias,
          composite_score: proposal.composite_score,
        },
        { idempotencyKey: `${proposal.id}:evaluated:stage2:${proposal.composite_score}` },
      );
      db.exec('RELEASE enrich_match');
    } catch (error) {
      db.exec('ROLLBACK TO enrich_match; RELEASE enrich_match');
      throw error;
    }
  }
  return { proposal, source: 'llm' };
}

/**
 * A Gemini `generateContent` client for Stage 2. Not exercised against the live API in tests.
 * @param config - API key, model (default gemini-2.5-flash) and an optional fetch implementation.
 * @returns The client.
 */
export function createGeminiClient(config: { apiKey: string; model?: string; fetchImpl?: typeof fetch }): ExplanationLlm {
  const model = config.model ?? DEFAULT_GEMINI_MODEL;
  const doFetch = config.fetchImpl ?? fetch;
  return {
    async complete(prompt, { signal }) {
      const res = await doFetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        signal,
        headers: { 'content-type': 'application/json', 'x-goog-api-key': config.apiKey },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.4 },
        }),
      });
      if (!res.ok) throw new Error(`Gemini request failed with HTTP ${res.status}`);
      const body = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
      return (body.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
    },
  };
}

/**
 * Builds a Gemini client from `ARIADNE_GEMINI_API_KEY` (or `GEMINI_API_KEY`), if one is set.
 * @param env - Environment to read.
 * @returns The client, or `undefined` so Stage 1 stands.
 */
export function geminiClientFromEnv(env: NodeJS.ProcessEnv = process.env): ExplanationLlm | undefined {
  const apiKey = (env.ARIADNE_GEMINI_API_KEY ?? env.GEMINI_API_KEY)?.trim();
  return apiKey ? createGeminiClient({ apiKey, model: env.ARIADNE_GEMINI_MODEL?.trim() || undefined }) : undefined;
}

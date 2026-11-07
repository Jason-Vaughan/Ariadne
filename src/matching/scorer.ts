import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { compositeScore, EvidenceReceiptSchema } from '../contracts/index.ts';
import type { CapabilityClaim, EvidenceReceipt, OpportunityNeed, Participant, ScoreBreakdown } from '../contracts/index.ts';
import { publishEvent } from '../events/bus.ts';
import { novelty, surfacingRejections } from './anti-clone.ts';
import type { SurfacingRejection } from './anti-clone.ts';

export const DEFAULT_TOP_K = 3;
/** An open-issue need older than this, with no newer evidence, is discounted (MATCH_SCORING_SPEC.md §3.2). */
export const STALE_NEED_DAYS = 120;
export const STALE_NEED_FACTOR = 0.2;

const PROFICIENCY_WEIGHT = { primary: 1.0, active: 0.7, exploratory: 0.4 } as const;
const LAYER_CATEGORIES: ReadonlySet<string> = new Set(['systems_architecture', 'framework', 'tooling']);
// Pairs of architectural layers that complement each other (MATCH_SCORING_SPEC.md §3.3).
const COMPLEMENTARY_LAYER_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['category:systems_architecture', 'category:framework'],
  ['category:systems_architecture', 'category:tooling'],
  ['name:agent-orchestration', 'name:evals-observability'],
];
const DAY_MS = 86_400_000;

/** Everything the scorer needs about one participant. Only records belonging to `participant` are used. */
export interface ParticipantProfile {
  participant: Participant;
  claims: readonly CapabilityClaim[];
  needs: readonly OpportunityNeed[];
  evidence: readonly EvidenceReceipt[];
}

export interface ScoreOptions {
  /** Reference time for freshness and stale-need discounting; makes scoring reproducible. */
  now: Date;
}

export interface TopMatchOptions extends ScoreOptions {
  /** Candidates per participant (default 3). */
  k?: number;
  /** When given, each selected pair is published once as `match.candidate.generated`. */
  db?: DatabaseSync;
}

/** A scored, canonically ordered pair (`participant_a_id < participant_b_id`). */
export interface PairScore {
  match_id: string;
  participant_a_id: string;
  participant_b_id: string;
  composite_score: number;
  score_breakdown: ScoreBreakdown;
  /** Cited receipts from both sides, sorted. */
  evidence_receipt_ids: string[];
  relevant_projects: string[];
  /** Honest caveats to carry into `confidence_limitations`. */
  limitations: string[];
  surfaceable: boolean;
  rejections: SurfacingRejection[];
}

interface Side {
  profile: ParticipantProfile;
  claims: CapabilityClaim[];
  needs: OpportunityNeed[];
  evidenceById: Map<string, EvidenceReceipt>;
}

/**
 * Normalizes a capability name so `TypeScript` and ` typescript ` count as the same capability.
 * @param name - Raw capability name.
 * @returns Lowercased, trimmed name with whitespace and underscores collapsed to `-`.
 */
export function normalizeCapability(name: string): string {
  return name.trim().toLowerCase().replace(/[\s_]+/g, '-');
}

/**
 * Whether a profile may be scored at all: consent granted and not withdrawn.
 * @param profile - The participant profile.
 * @returns True when the participant is eligible for matching.
 */
export function isEligible(profile: ParticipantProfile): boolean {
  return profile.participant.consent_status === 'granted' && profile.participant.analysis_state !== 'withdrawn';
}

/**
 * Fails closed: scoring a participant who has not granted consent, or has withdrawn, is an error.
 * @param profile - The participant profile.
 * @throws If the profile is not eligible.
 */
function assertEligible(profile: ParticipantProfile): void {
  if (!isEligible(profile)) throw new Error(`Participant ${profile.participant.id} is not eligible for matching (consent not granted or withdrawn)`);
}

/**
 * Keeps the profile's contract-valid evidence and the non-dismissed claims and needs it supports.
 * A claim, or an inferred need, counts only if it cites at least one valid receipt the participant
 * owns, so an unsupported record can neither move the score nor borrow unrelated receipts to pass
 * the evidence gate. A participant-confirmed need is the participant's own statement and needs no receipt.
 * @param profile - The participant profile.
 * @returns The working view used by every component formula.
 */
function toSide(profile: ParticipantProfile): Side {
  const id = profile.participant.id;
  const evidenceById = new Map<string, EvidenceReceipt>();
  for (const receipt of profile.evidence) {
    if (receipt.participant_id === id && EvidenceReceiptSchema.safeParse(receipt).success) evidenceById.set(receipt.id, receipt);
  }
  const supported = (ids: readonly string[]): boolean => ids.some((rid) => evidenceById.has(rid));
  return {
    profile,
    claims: profile.claims.filter((c) => c.participant_id === id && !c.dismissed_by_user && supported(c.evidence_receipt_ids)),
    needs: profile.needs.filter(
      (n) =>
        n.participant_id === id &&
        !n.dismissed_by_user &&
        (n.label === 'Participant Confirmed Need' || supported(n.evidence_receipt_ids)),
    ),
    evidenceById,
  };
}

/**
 * Adds a weight to a sparse vector entry.
 * @param vector - Vector keyed by capability name.
 * @param key - Capability name.
 * @param weight - Amount to add.
 */
function add(vector: Map<string, number>, key: string, weight: number): void {
  vector.set(key, (vector.get(key) ?? 0) + weight);
}

/**
 * Cosine similarity of two sparse vectors, floored at 0. An empty vector has similarity 0.
 * @param a - First vector.
 * @param b - Second vector.
 * @returns Similarity in 0–1.
 */
export function cosine(a: ReadonlyMap<string, number>, b: ReadonlyMap<string, number>): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const [key, value] of a) {
    normA += value * value;
    const other = b.get(key);
    if (other !== undefined) dot += value * other;
  }
  for (const value of b.values()) normB += value * value;
  if (normA === 0 || normB === 0) return 0;
  return Math.min(1, Math.max(0, dot / Math.sqrt(normA * normB)));
}

/**
 * Capability vector `u`: each claim contributes `confidence × p` (p = 1.0 / 0.7 / 0.4 by proficiency).
 * @param claims - Non-dismissed claims.
 * @returns Sparse vector keyed by normalized capability name.
 */
function capabilityVector(claims: readonly CapabilityClaim[]): Map<string, number> {
  const vector = new Map<string, number>();
  for (const c of claims) add(vector, normalizeCapability(c.name), c.confidence * PROFICIENCY_WEIGHT[c.proficiency_signal]);
  return vector;
}

/**
 * Offer vector `o`: primary and active claims, weighted by confidence.
 * @param claims - Non-dismissed claims.
 * @returns Sparse vector keyed by normalized capability name.
 */
function offerVector(claims: readonly CapabilityClaim[]): Map<string, number> {
  const vector = new Map<string, number>();
  for (const c of claims) {
    if (c.proficiency_signal === 'primary' || c.proficiency_signal === 'active') add(vector, normalizeCapability(c.name), c.confidence);
  }
  return vector;
}

/**
 * Whether a need rests solely on open issues whose latest activity is older than STALE_NEED_DAYS.
 * @param need - The need.
 * @param side - Its owner's working view.
 * @param now - Reference time.
 * @returns True when the stale-issue penalty applies.
 */
function isStaleNeed(need: OpportunityNeed, side: Side, now: Date): boolean {
  const receipts = need.evidence_receipt_ids.map((id) => side.evidenceById.get(id)).filter((r) => r !== undefined);
  if (receipts.length === 0) return false;
  return receipts.every(
    (r) => r.source_type === 'open_issue' && now.getTime() - Date.parse(r.source_updated_at) > STALE_NEED_DAYS * DAY_MS,
  );
}

/**
 * Need vectors `n`: each desired capability weighted by the need's confidence. `discounted` applies the
 * ×0.2 stale-issue factor; `full` does not, and supplies the norm in `needFit` so the discount
 * lowers the fit (cosine alone would ignore a uniform scale-down).
 * @param side - The participant's working view.
 * @param now - Reference time.
 * @returns Both vectors and the needs that were discounted as stale.
 */
function needVectors(side: Side, now: Date): { discounted: Map<string, number>; full: Map<string, number>; stale: OpportunityNeed[] } {
  const discounted = new Map<string, number>();
  const full = new Map<string, number>();
  const stale: OpportunityNeed[] = [];
  for (const need of side.needs) {
    const isStale = isStaleNeed(need, side, now);
    if (isStale) stale.push(need);
    for (const capability of need.desired_capabilities) {
      const key = normalizeCapability(capability);
      add(discounted, key, need.confidence * (isStale ? STALE_NEED_FACTOR : 1));
      add(full, key, need.confidence);
    }
  }
  return { discounted, full, stale };
}

/**
 * One direction of need/offer fit: `dot(n_discounted, o) / (‖n_full‖ · ‖o‖)`, clamped to 0–1.
 * Equals plain cosine when nothing is stale, scales by exactly 0.2 when everything is, and a stale
 * need the offerer cannot meet never lowers the fit of a fresh need they can.
 * @param discounted - Needs with stale weights discounted.
 * @param full - Needs without discounting.
 * @param offers - The other side's offer vector.
 * @returns Fit in 0–1.
 */
function needFit(discounted: ReadonlyMap<string, number>, full: ReadonlyMap<string, number>, offers: ReadonlyMap<string, number>): number {
  let dot = 0;
  for (const [key, value] of discounted) dot += value * (offers.get(key) ?? 0);
  let normFull = 0;
  for (const value of full.values()) normFull += value * value;
  let normOffers = 0;
  for (const value of offers.values()) normOffers += value * value;
  if (normFull === 0 || normOffers === 0) return 0;
  return Math.min(1, Math.max(0, dot / Math.sqrt(normFull * normOffers)));
}

/**
 * Architectural layers a participant holds, from primary or active claims.
 * @param claims - Non-dismissed claims.
 * @returns Layer keys (`category:<c>` and `name:<n>`).
 */
function layers(claims: readonly CapabilityClaim[]): Set<string> {
  const held = new Set<string>();
  for (const c of claims) {
    if (c.proficiency_signal === 'exploratory') continue;
    if (LAYER_CATEGORIES.has(c.category)) held.add(`category:${c.category}`);
    held.add(`name:${normalizeCapability(c.name)}`);
  }
  return held;
}

/**
 * Domain tags a participant holds (claims of category `domain`).
 * @param claims - Non-dismissed claims.
 * @returns Normalized domain names.
 */
function domains(claims: readonly CapabilityClaim[]): Set<string> {
  return new Set(claims.filter((c) => c.category === 'domain').map((c) => normalizeCapability(c.name)));
}

/**
 * Complementarity: 1.0 for complementary layers plus a shared domain, 0.5 for complementary layers alone, else 0.
 * Layers are complementary when one side holds x without y and the other holds y without x.
 * @param la - Participant A's layers.
 * @param lb - Participant B's layers.
 * @param da - Participant A's domains.
 * @param db - Participant B's domains.
 * @returns Complementarity in {0, 0.5, 1}.
 */
function complementarity(la: ReadonlySet<string>, lb: ReadonlySet<string>, da: ReadonlySet<string>, db: ReadonlySet<string>): number {
  const complementary = COMPLEMENTARY_LAYER_PAIRS.some(
    ([x, y]) => (la.has(x) && !lb.has(x) && lb.has(y) && !la.has(y)) || (la.has(y) && !lb.has(y) && lb.has(x) && !la.has(x)),
  );
  if (!complementary) return 0;
  for (const domain of db) if (da.has(domain)) return 1;
  return 0.5;
}

/**
 * Latest activity time per cited project (repo, or URL for non-repo evidence).
 * @param receipts - Cited receipts.
 * @returns Epoch milliseconds keyed by project.
 */
function latestByProject(receipts: readonly EvidenceReceipt[]): Map<string, number> {
  const latest = new Map<string, number>();
  for (const r of receipts) {
    const project = r.repo_full_name ?? r.source_url;
    latest.set(project, Math.max(latest.get(project) ?? 0, Date.parse(r.source_updated_at)));
  }
  return latest;
}

/**
 * Freshness from the median age of the cited projects' latest activity: <=30 d → 1.0, <=90 → 0.7, <=180 → 0.4, else 0.1.
 * @param a - Participant A's latest activity per project.
 * @param b - Participant B's latest activity per project.
 * @param now - Reference time.
 * @returns Freshness in {0.1, 0.4, 0.7, 1.0}.
 */
function freshness(a: ReadonlyMap<string, number>, b: ReadonlyMap<string, number>, now: Date): number {
  const merged = new Map(a);
  for (const [project, at] of b) merged.set(project, Math.max(merged.get(project) ?? 0, at));
  const ages = [...merged.values()].map((t) => (now.getTime() - t) / DAY_MS).sort((x, y) => x - y);
  if (ages.length === 0) return 0.1;
  const mid = Math.floor(ages.length / 2);
  const median = ages.length % 2 === 1 ? ages[mid]! : (ages[mid - 1]! + ages[mid]!) / 2;
  if (median <= 30) return 1.0;
  if (median <= 90) return 0.7;
  if (median <= 180) return 0.4;
  return 0.1;
}

/**
 * Receipts a side's non-dismissed claims and needs cite, in id order.
 * @param side - The participant's working view.
 * @returns The cited, contract-valid receipts.
 */
function citedEvidence(side: Side): EvidenceReceipt[] {
  const ids = new Set<string>();
  for (const c of side.claims) for (const id of c.evidence_receipt_ids) ids.add(id);
  for (const n of side.needs) for (const id of n.evidence_receipt_ids) ids.add(id);
  return [...ids]
    .sort()
    .map((id) => side.evidenceById.get(id))
    .filter((r) => r !== undefined);
}

/**
 * Deterministic match id: a version-8 UUID from sha256 of the ordered participant ids.
 * @param a - Lower participant id.
 * @param b - Higher participant id.
 * @returns A stable RFC 9562 UUID.
 */
export function matchIdFor(a: string, b: string): string {
  const hex = createHash('sha256').update(`ariadne-match:${a}:${b}`).digest('hex');
  const variant = ((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Rounds a component to 4 decimals so floating-point noise never changes a composite score.
 * @param value - Raw component.
 * @returns Rounded component.
 */
function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

/** A profile's derived data, computed once and reused for every pair it takes part in. */
export interface PreparedProfile {
  profile: ParticipantProfile;
  claims: CapabilityClaim[];
  needs: OpportunityNeed[];
  capabilities: Map<string, number>;
  offers: Map<string, number>;
  needsDiscounted: Map<string, number>;
  needsFull: Map<string, number>;
  staleNeeds: OpportunityNeed[];
  names: Set<string>;
  layers: Set<string>;
  domains: Set<string>;
  latestByProject: Map<string, number>;
  cited: EvidenceReceipt[];
}

/**
 * Derives everything pair scoring needs from one profile.
 * @param profile - The participant profile.
 * @param options - Reference time (stale-need discounting depends on it).
 * @returns The prepared profile.
 * @throws If the participant has not granted consent or has withdrawn.
 */
export function prepareProfile(profile: ParticipantProfile, options: ScoreOptions): PreparedProfile {
  assertEligible(profile);
  const side = toSide(profile);
  const needs = needVectors(side, options.now);
  const cited = citedEvidence(side);
  return {
    profile,
    claims: side.claims,
    needs: side.needs,
    capabilities: capabilityVector(side.claims),
    offers: offerVector(side.claims),
    needsDiscounted: needs.discounted,
    needsFull: needs.full,
    staleNeeds: needs.stale,
    names: new Set(side.claims.map((c) => normalizeCapability(c.name))),
    layers: layers(side.claims),
    domains: domains(side.claims),
    latestByProject: latestByProject(cited),
    cited,
  };
}

/**
 * Scores one pair with the five-component model and applies the surfacing gate.
 * Pure and deterministic for a fixed `now`; argument order does not matter.
 * @param first - One participant's profile.
 * @param second - The other participant's profile.
 * @param options - Reference time.
 * @returns The canonically ordered pair score.
 * @throws If both profiles are the same participant, or either is not eligible (consent not granted or withdrawn).
 */
export function scorePair(first: ParticipantProfile, second: ParticipantProfile, options: ScoreOptions): PairScore {
  return scorePrepared(prepareProfile(first, options), prepareProfile(second, options), options);
}

/**
 * Scores two prepared profiles. See `scorePair`.
 * @param first - One prepared profile.
 * @param second - The other prepared profile.
 * @param options - Reference time.
 * @returns The canonically ordered pair score.
 * @throws If both profiles are the same participant, or either is not eligible.
 */
export function scorePrepared(first: PreparedProfile, second: PreparedProfile, options: ScoreOptions): PairScore {
  assertEligible(first.profile);
  assertEligible(second.profile);
  const idFirst = first.profile.participant.id;
  const idSecond = second.profile.participant.id;
  if (idFirst === idSecond) throw new Error('Cannot score a participant against themselves');
  const [a, b] = idFirst < idSecond ? [first, second] : [second, first];

  const breakdown: ScoreBreakdown = {
    capability_similarity: round4(cosine(a.capabilities, b.capabilities)),
    need_offer_fit: round4(
      Math.max(needFit(a.needsDiscounted, a.needsFull, b.offers), needFit(b.needsDiscounted, b.needsFull, a.offers)),
    ),
    complementarity: complementarity(a.layers, b.layers, a.domains, b.domains),
    novelty: round4(novelty(a.names, b.names)),
    freshness: freshness(a.latestByProject, b.latestByProject, options.now),
  };
  const score = compositeScore(breakdown);

  const limitations: string[] = [];
  for (const need of [...a.staleNeeds, ...b.staleNeeds]) {
    limitations.push(
      `The need "${need.summary}" rests only on an open issue in ${need.project_repo} with no activity for over ${STALE_NEED_DAYS} days; confirm it is still a priority.`,
    );
  }
  for (const need of [...a.needs, ...b.needs]) {
    if (need.label === 'Potential Opportunity (AI Inference)') {
      limitations.push(`The need "${need.summary}" is inferred from public activity, not confirmed by the participant.`);
    }
  }

  const rejections = surfacingRejections({
    breakdown,
    compositeScore: score,
    evidenceA: a.cited.map((r) => r.id),
    evidenceB: b.cited.map((r) => r.id),
  });
  const cited = [...a.cited, ...b.cited];
  const idA = a.profile.participant.id;
  const idB = b.profile.participant.id;
  return {
    match_id: matchIdFor(idA, idB),
    participant_a_id: idA,
    participant_b_id: idB,
    composite_score: score,
    score_breakdown: breakdown,
    evidence_receipt_ids: cited.map((r) => r.id).sort(),
    relevant_projects: [...new Set(cited.map((r) => r.repo_full_name).filter((p): p is string => p !== null))].sort(),
    limitations,
    surfaceable: rejections.length === 0,
    rejections,
  };
}

/**
 * Ranks each eligible participant's top-k surfaceable candidates. Never pads: a participant with
 * fewer qualifying candidates gets fewer, possibly none. Ties break on the other participant's id.
 * With `db`, each selected pair is published once as `match.candidate.generated` (idempotent per pair);
 * `match.evaluated` belongs to the explanation stage (A-007).
 * @param profiles - The pool (live participants and active seeds).
 * @param options - Reference time, k, optional database.
 * @returns Candidates per participant id, best first; every eligible participant has an entry.
 */
export function selectTopMatches(profiles: readonly ParticipantProfile[], options: TopMatchOptions): Map<string, PairScore[]> {
  const k = options.k ?? DEFAULT_TOP_K;
  const eligible = profiles.filter(isEligible);
  const prepared = eligible.map((p) => prepareProfile(p, options));
  const candidates = new Map<string, PairScore[]>(eligible.map((p) => [p.participant.id, []]));
  for (let i = 0; i < prepared.length; i++) {
    for (let j = i + 1; j < prepared.length; j++) {
      const pair = scorePrepared(prepared[i]!, prepared[j]!, options);
      if (!pair.surfaceable) continue;
      candidates.get(pair.participant_a_id)!.push(pair);
      candidates.get(pair.participant_b_id)!.push(pair);
    }
  }
  const selected = new Map<string, PairScore>();
  for (const [id, list] of candidates) {
    const other = (p: PairScore): string => (p.participant_a_id === id ? p.participant_b_id : p.participant_a_id);
    list.sort((x, y) => y.composite_score - x.composite_score || (other(x) < other(y) ? -1 : 1));
    list.splice(k);
    for (const pair of list) selected.set(pair.match_id, pair);
  }
  if (options.db) publishSelected(options.db, [...selected.values()], eligible);
  return candidates;
}

/**
 * Publishes `match.candidate.generated` for each selected pair, in match-id order.
 * @param db - Open database handle.
 * @param pairs - Selected pairs.
 * @param profiles - Eligible profiles, for display aliases.
 */
function publishSelected(db: DatabaseSync, pairs: readonly PairScore[], profiles: readonly ParticipantProfile[]): void {
  const aliases = new Map(profiles.map((p) => [p.participant.id, p.participant.display_alias]));
  for (const pair of [...pairs].sort((x, y) => (x.match_id < y.match_id ? -1 : 1))) {
    publishEvent(
      db,
      'match.candidate.generated',
      {
        match_id: pair.match_id,
        display_alias_a: aliases.get(pair.participant_a_id)!,
        display_alias_b: aliases.get(pair.participant_b_id)!,
      },
      { idempotencyKey: `${pair.match_id}:candidate` },
    );
  }
}

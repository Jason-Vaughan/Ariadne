import { isCloneLike, MATCH_SURFACE_THRESHOLD } from '../contracts/index.ts';
import type { ScoreBreakdown } from '../contracts/index.ts';

/** Minimum cited evidence receipts for a match to surface (MATCH_SCORING_SPEC.md §2 evidence gate). */
export const MINIMUM_CITED_EVIDENCE = 2;

export type SurfacingRejection = 'below_threshold' | 'clone_like' | 'insufficient_evidence';

export interface SurfacingInput {
  breakdown: ScoreBreakdown;
  compositeScore: number;
  /** Cited receipt ids belonging to participant A. */
  evidenceA: readonly string[];
  /** Cited receipt ids belonging to participant B. */
  evidenceB: readonly string[];
}

/**
 * Jaccard distance between two capability-name sets: `1 − |A ∩ B| / max(1, |A ∪ B|)`.
 * Identical profiles score 0, disjoint ones 1.
 * @param a - Participant A's capability names.
 * @param b - Participant B's capability names.
 * @returns Novelty in 0–1.
 */
export function novelty(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  let shared = 0;
  for (const name of a) if (b.has(name)) shared++;
  const union = a.size + b.size - shared;
  return 1 - shared / Math.max(1, union);
}

/**
 * Lists every reason a scored pair may not be shown. An empty list means the pair surfaces.
 * The anti-clone guard is the contract's `isCloneLike`: a pair with no need/offer fit and no
 * complementary layers has nothing to trade, whatever its score.
 * @param input - The pair's breakdown, composite score and cited evidence per side.
 * @returns The rejections, in a fixed order.
 */
export function surfacingRejections(input: SurfacingInput): SurfacingRejection[] {
  const rejections: SurfacingRejection[] = [];
  if (input.compositeScore < MATCH_SURFACE_THRESHOLD) rejections.push('below_threshold');
  if (isCloneLike(input.breakdown)) rejections.push('clone_like');
  // At least one receipt per side is what makes MINIMUM_CITED_EVIDENCE (2) hold.
  if (input.evidenceA.length === 0 || input.evidenceB.length === 0) rejections.push('insufficient_evidence');
  return rejections;
}

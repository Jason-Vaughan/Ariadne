# [feature] A-007: Two-stage match explanation & collaboration thesis agent (Stage 1 Instant + Stage 2 Gemini Flash)

- **Issue ID:** `A-007`
- **Priority:** `P0`
- **Assigned Lane & Car:** `Ariadne-Lane-C` (`Car 1-C`)
- **Milestone / Train:** `Train 1 — Core Pipeline & Stage Shell (v0.2.0)`
- **Dependencies:** `A-006`

## 1. Description
Implement the Two-Stage Match Evaluation & Introduction Thesis Agent (`src/lib/agents/match-evaluator.ts` and `src/lib/agents/intro-writer.ts`):
- **Stage 1 (`< 50ms` Instant Deterministic Explanation & Repo Evidence Pills):** Immediately formats the Top-3 scored candidate pairs from `A-006` with all 7 required `MatchProposal` fields using deterministic evidence templates citing both builders' actual repositories and complementary 6-Axis Fingerprint strengths.
- **Stage 2 (`Gemini Flash` `gemini-2.5-flash` Parallel Enrichment):** Streams a tailored, human-readable *"Why You Two Should Talk Right Now"* collaboration thesis and *"First 3 Minutes Icebreaker"* over SSE (`match.enriched`), validated by the Verification Gate.

## 2. Rationale
Under our Two-Stage Progressive UX, attendees must see their Top-3 matches + clickable GitHub repo evidence pills in **`< 500ms`** (Stage 1), while Gemini Flash enriches the narrative explanation in the background (`2–5s`, Stage 2) without ever blocking the UI.

## 3. Dependencies
- Depends on `A-006` (top scored candidate pairs and `ScoreBreakdown`).

## 4. Implementation Boundaries
- **In Scope:** `src/lib/agents/match-evaluator.ts`, `src/lib/agents/intro-writer.ts` (Stage 1 instant template + Stage 2 `gemini-2.5-flash` enrichment), Verification Gate check that all cited repos/URLs belong to the two matched participants, and emission of `match.evaluated` and `match.enriched`.
- **Out of Scope:** UI rendering (`A-008`) and bilateral state transitions (`A-012`).

## 5. Acceptance Criteria
- [ ] Stage 1 produces complete, valid `MatchProposal` records (all 7 required fields + 2 cited repo evidence pills) in `< 50ms` immediately after `A-006` scoring.
- [ ] Stage 2 `gemini-2.5-flash` enrichment upgrades the collaboration thesis and concrete 3-minute starter topic asynchronously and emits `match.enriched`.
- [ ] Verification Gate rejects or strips any cited repository URL that does not exist in Participant A or Participant B's `EvidenceReceipt` set.
- [ ] Emits `match.evaluated` (Stage 1) and `match.enriched` (Stage 2) with privacy-safe stage payloads.

## 6. Test Requirements
- Unit tests verifying `< 50ms` Stage 1 output completeness (all 7 required fields present), cross-participant citation verification, and Stage 2 Gemini Flash enrichment + fallback.

## 7. Security & Privacy Considerations
- Do not include private contact details in `MatchProposal` text; contact details are unlocked strictly after bilateral approval in `A-012`.

## 8. Expected Demonstration Impact
Guarantees sub-500ms match cards on mobile phones during a 40-person QR scan burst while streaming custom Gemini Flash collaboration pitches seconds later.

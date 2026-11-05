# [feature] A-007: Match research and proposal agent

- **Issue ID:** `A-007`
- **Priority:** `P0`
- **Assigned Lane:** `Ariadne-Lane-C` (Builder C)
- **Milestone:** `Wave 2 — Strong Success (v0.2.0-m2)`
- **Dependencies:** `A-006`

## 1. Description
Implement the Match Evaluation Agent and Introduction Agent (`src/lib/agents/match-evaluator.ts` and `src/lib/agents/intro-writer.ts`) plus Verification Gate checks that inspect the top candidate pairs from `A-006`, validate that the collaboration thesis is grounded in real repository evidence, and generate all 7 required match proposal fields—including a concrete *"Suggested First Conversation or Collaboration"*.

## 2. Rationale
While `A-006` ranks pairs mathematically, participants need a concise, specific, human-readable explanation of *why* they should talk and *what* they could build or discuss in their first 15 minutes together.

## 3. Dependencies
- Depends on `A-006` (top scored candidate pairs and `ScoreBreakdown`).

## 4. Implementation Boundaries
- **In Scope:** `src/lib/agents/match-evaluator.ts`, `src/lib/agents/intro-writer.ts`, deterministic template fallback (if LLM times out), Verification Gate check that all cited repos/URLs belong to the two matched participants, and emission of `match.evaluated`.
- **Out of Scope:** UI rendering (`A-008`) and bilateral state transitions (`A-012`).

## 5. Acceptance Criteria
- [ ] Produces complete `MatchProposal` records containing all 7 required fields: score + breakdown, complementary capabilities, relevant project names, why they benefit from meeting, 1 concrete suggested first conversation, confidence limitations, and verified GitHub evidence links.
- [ ] Verification Gate rejects or strips any cited repository URL that does not exist in Participant A or Participant B's `EvidenceReceipt` set.
- [ ] Emits `match.evaluated` with privacy-safe stage payload.

## 6. Test Requirements
- Unit tests verifying schema completeness (all 7 required outputs present), cross-participant citation verification, and deterministic template fallback under LLM timeout.

## 7. Security & Privacy Considerations
- Do not include private contact details (`discord_handle`, email) in `MatchProposal` text; contact details are unlocked strictly after bilateral approval in `A-012`.

## 8. Expected Demonstration Impact
Delivers the core "Aha!" moment of **Strong Success (`M2`)**: reading a specific, evidence-backed explanation of why two attendees at the hackathon should collaborate on a concrete problem.

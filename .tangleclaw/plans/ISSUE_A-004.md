# [feature] A-004: Evidence-backed capability analysis

- **Issue ID:** `A-004`
- **Priority:** `P0`
- **Assigned Lane:** `Ariadne-Lane-B` (Builder B)
- **Milestone:** `Wave 1 — Minimum Success (v0.1.0-m1)`
- **Dependencies:** `A-003`

## 1. Description
Implement the Profile Research Agent (`src/lib/agents/profile-research.ts`) and deterministic fallback extractor that analyze a participant's normalized `EvidenceReceipt[]` snapshot to produce structured `CapabilityClaim[]` records across languages, frameworks, domains, and systems architecture—strictly distinguishing `OBSERVED_FACT` from `AI_INFERENCE`.

## 2. Rationale
Participants and judges need to trust that Ariadne understands what a builder actually builds. Every claimed capability must link directly to one or more GitHub evidence receipts and disclose confidence/uncertainty.

## 3. Dependencies
- Depends on `A-003` (normalized `EvidenceReceipt[]` and `github_snapshots`).

## 4. Implementation Boundaries
- **In Scope:** `src/lib/agents/profile-research.ts`, closed-world evidence citation verifier, deterministic fallback capability extractor (if LLM times out), and emission of `profile.analysis.completed`.
- **Out of Scope:** Project bottleneck/opportunity discovery (`A-005`) and pairwise match scoring (`A-006`).

## 5. Acceptance Criteria
- [ ] Every generated `CapabilityClaim` cites at least one valid `EvidenceReceipt.id` from the participant's snapshot; any claim lacking a valid receipt is rejected by the Verification Gate.
- [ ] Direct repository metadata (primary languages, explicit topics, commit activity) is labeled `OBSERVED_FACT`, while synthesized architectural/domain takeaways are labeled `AI_INFERENCE` with `confidence` and `uncertainty_note`.
- [ ] Emits `profile.analysis.completed` with sanitized domain summary for the stage visualizer.
- [ ] Allows participants to dismiss any `AI_INFERENCE` claim via API.

## 6. Test Requirements
- Unit tests verifying closed-world citation verification (hallucinated receipt IDs are stripped/rejected), `OBSERVED_FACT` vs `AI_INFERENCE` labeling, and deterministic fallback extraction when LLM is unavailable.

## 7. Security & Privacy Considerations
- Wrap all repository text in `<untrusted_github_evidence>` delimiters inside the agent prompt so README prompt-injection attempts cannot override agent instructions.

## 8. Expected Demonstration Impact
Completes the **Minimum Success (`M1`)** user journey: within seconds of scanning the QR code, a participant sees an accurate, citation-backed technical capability profile of their real GitHub work.

# [feature] A-004: Evidence-backed capability analysis & 6-Axis Builder Fingerprint refinement (Gemini Flash + Deterministic Stage 1)

- **Issue ID:** `A-004`
- **Priority:** `P0`
- **Assigned Lane & Car:** `Ariadne-Lane-B` (`Car 1-B`)
- **Milestone / Train:** `Train 1 — Core Pipeline & Stage Shell (v0.2.0)`
- **Dependencies:** `A-003`

## 1. Description
Implement the Two-Stage Profile Research Agent (`src/lib/agents/profile-research.ts`):
- **Stage 1 (`< 100ms` Deterministic Extractor):** Immediately extracts `OBSERVED_FACT` capability pills (primary languages, frameworks, repo topics) and baseline **6-Axis Builder Fingerprint** (`Systems/Infra`, `Agent Orchestration`, `LLM/Eval`, `Frontend/UX`, `Product/GTM`, `Data/Pipelines`) from `EvidenceReceipt[]`.
- **Stage 2 (`Gemini Flash` `gemini-2.5-flash` Parallel Enrichment):** Refines the 6-Axis Builder Fingerprint and synthesizes higher-order `AI_INFERENCE` architectural Superpowers (`Offers`) with closed-world GitHub receipt citations.

## 2. Rationale
Participants and judges need instant (`< 500ms`) visual feedback on their phone and on the 16:9 Stage Visualizer (`View 1: Pipeline` & `View 2: Builder Fingerprints`), followed seamlessly by Gemini Flash's deep architectural synthesis.

## 3. Dependencies
- Depends on `A-003` (normalized `EvidenceReceipt[]` and `github_snapshots`).

## 4. Implementation Boundaries
- **In Scope:** `src/lib/agents/profile-research.ts` (Stage 1 deterministic + Stage 2 `gemini-2.5-flash` enrichment), 6-Axis Builder Fingerprint refinement, closed-world evidence citation verifier, and emission of `profile.analysis.completed`.
- **Out of Scope:** Project bottleneck/opportunity discovery (`A-005`) and pairwise match scoring (`A-006`).

## 5. Acceptance Criteria
- [ ] Stage 1 deterministic capability extraction and 6-Axis Builder Fingerprint complete in `< 100ms` with zero external LLM dependency.
- [ ] Stage 2 `gemini-2.5-flash` enrichment produces structured `CapabilityClaim[]` records where every claim cites at least one valid `EvidenceReceipt.id` from the participant's snapshot.
- [ ] Direct repository metadata is labeled `OBSERVED_FACT`, while synthesized architectural takeaways are labeled `AI_INFERENCE` with `confidence` and `uncertainty_note`.
- [ ] Emits `profile.analysis.completed` with the 6-Axis Builder Fingerprint and top Superpower pills for `/me` and `/stage` (`View 1` & `View 2`).

## 6. Test Requirements
- Unit tests verifying Stage 1 `< 100ms` deterministic extraction, closed-world citation verification (hallucinated receipt IDs are stripped/rejected), `OBSERVED_FACT` vs `AI_INFERENCE` labeling, and Stage 2 Gemini Flash fallback.

## 7. Security & Privacy Considerations
- Wrap all repository text in `<untrusted_github_evidence>` delimiters inside the Gemini prompt so README prompt-injection attempts cannot override agent instructions.

## 8. Expected Demonstration Impact
Powers **Column 2 (`Capability Extraction`)** and **Column 3 (`Builder Fingerprint Synthesis`)** on the 16:9 Stage Visualizer and the participant's mobile Builder DNA card.

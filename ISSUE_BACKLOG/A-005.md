# [feature] A-005: Opportunity and bottleneck discovery (Gemini Flash + Deterministic Stage 1)

- **Issue ID:** `A-005`
- **Priority:** `P1`
- **Assigned Lane & Car:** `Ariadne-Lane-B` (`Car 1-B`)
- **Milestone / Train:** `Train 1 — Core Pipeline & Stage Shell (v0.2.0)`
- **Dependencies:** `A-003`, `A-004`

## 1. Description
Implement the Two-Stage Opportunity Discovery Agent (`src/lib/agents/opportunity-discovery.ts`) that inspects a participant's recent repository activity, open issues, PR signals, 6-Axis Builder Fingerprint gaps, and optional `/join` goal note to identify candidate collaboration opportunities (`OpportunityNeed[]` — what they are looking for / complementary gaps):
- **Stage 1 (`< 100ms` Deterministic):** Infers complementary domain needs from their 6-Axis Builder Fingerprint gaps and open issue labels (`help wanted`, `bug`, `ui`, `infra`, `eval`).
- **Stage 2 (`Gemini Flash` `gemini-2.5-flash` Parallel Enrichment):** Synthesizes specific project bottlenecks and complementary collaborator profiles with cited repository receipts.

## 2. Rationale
Great matchmaking is complementary (`Needs ↔ Offers`), not cloning (`Python ↔ Python`). Identifying where a builder's current project has a bottleneck or missing axis allows `A-006` to pair a strong Systems/Agent builder with a strong Frontend/Visualizer or Eval builder.

## 3. Dependencies
- Depends on `A-003` (GitHub issue/PR/README evidence receipts) and `A-004` (capability profile & 6-Axis Builder Fingerprint).

## 4. Implementation Boundaries
- **In Scope:** `src/lib/agents/opportunity-discovery.ts` (Stage 1 deterministic + Stage 2 `gemini-2.5-flash`), stale-issue detection (`> 120 days`), confidence and uncertainty note generation, and emission of `opportunity.identified`.
- **Out of Scope:** Pairwise match scoring (`A-006`) or match explanation generation (`A-007`).

## 5. Acceptance Criteria
- [ ] Stage 1 deterministic complementary-need extraction runs in `< 100ms` so initial matching (`A-006`) never waits on LLM latency.
- [ ] Stage 2 `gemini-2.5-flash` enrichment cites supporting `EvidenceReceipt` IDs and labels inferences `'Potential Opportunity (AI Inference)'`.
- [ ] Stale issues (`> 120 days` since update) carry an explicit age/uncertainty caveat in `uncertainty_note`.
- [ ] Emits `opportunity.identified` events for `/stage` (`View 1: Pipeline` & `View 2: Builder Fingerprints`).

## 6. Test Requirements
- Unit tests verifying Stage 1 complementary gap detection, stale-issue caveat injection, mandatory `Potential Opportunity (AI Inference)` labeling, and citation verification.

## 7. Security & Privacy Considerations
- Treat open issue and PR bodies from third-party contributors on a participant's repo as untrusted input.

## 8. Expected Demonstration Impact
Surfaces high-signal *"Superpower vs. Looking For"* pills on every Builder Fingerprint card on `/stage` (`View 2`) and `/me`.

# [feature] A-001: Core architecture and data/event contracts

- **Issue ID:** `A-001`
- **Priority:** `P0`
- **Assigned Lane:** `Ariadne-INT` + `Ariadne-Arc-PRR`
- **Milestone:** `Wave 0 — Foundation (v0.0.1-contracts)`
- **Dependencies:** None (Root dependency for all workstreams)

## 1. Description
Establish the foundational TypeScript project skeleton, database schema (`participants`, `github_snapshots`, `evidence_receipts`, `capability_claims`, `opportunity_needs`, `matches`, `domain_events`, `async_jobs`), and shared TypeScript interfaces (`src/contracts/*`) defining all entities, state machines, and event envelopes specified in `DATA_AND_EVENTS_CONTRACT.md`.

## 2. Rationale
Four concurrent Builder lanes (`Lane-A` through `Lane-D`) will execute in parallel immediately after Wave 0. Defining strict, compile-time verified contracts and database schemas first prevents shared-file collisions and integration mismatches later in the day.

## 3. Dependencies
- None. Must merge before `A-002`..`A-017` begin implementation commits.

## 4. Implementation Boundaries
- **In Scope:** `src/contracts/*`, `src/db/schema.ts`, `src/db/client.ts`, `src/lib/governance/sanitizer.ts` (interface + stub), unit test harness configuration (`vitest`), and JSDoc annotations on all contract exports.
- **Out of Scope:** UI pages, live GitHub API calls, LLM agent prompts, match scoring math, or SSE route handlers.

## 5. Acceptance Criteria
- [ ] All 6 core domain entities (`Participant`, `EvidenceReceipt`, `CapabilityClaim`, `OpportunityNeed`, `MatchProposal`, `PublicEventEnvelope`) and all 12 `EventType` literals are exported with strict TypeScript types and runtime Zod validators.
- [ ] Database tables and indexes apply cleanly against the configured database (`Neon Postgres` / `libSQL`).
- [ ] Mutual-introduction state machine transition validator (`canTransitionIntroState(from, to, actorVerified)`) is implemented and exported.
- [ ] All subsequent workstreams (`A-002`..`A-017`) can import `src/contracts` without editing shared root files.

## 6. Test Requirements
- Contract validation unit tests (`tests/contracts.test.ts`) verifying valid payloads pass and malformed/unconsented payloads fail schema validation.
- State machine transition table unit tests covering valid, duplicate (idempotent), and forbidden state transitions.

## 7. Security & Privacy Considerations
- Enforce at the schema level that `PublicEventEnvelope` cannot contain raw tokens, private contact handles, or unconsented `github_username` fields when `public_display_consent === false`.
- Default `public_display_consent` to `false` and `ownership_verified` to `false`.

## 8. Expected Demonstration Impact
Provides the rock-solid architectural spine that enables 4 autonomous TangleClaw Builders to construct the application concurrently without breaking the build—a centerpiece proof point for Objective B (TangleClaw multi-agent orchestration).

# Build Plan — Car 01-A: A-001 Core Contracts & SQLite Schema (Issue #1)

- **Branch:** `feat/a-001-contracts`
- **Dispatch:** Ariadne-PM Wave 1 (msg `2a6b0477`), operator GO 2026-11-07 11:12 PST
- **Critic mode:** waived — Builder lanes run no internal Critic/PRR (`project-preferences.md` Delegation); external review by Ariadne-Arc (#1563)
- **Requirements Confidence:** Medium — specs disagree in places; resolutions recorded below.

## Confidence Check
1. **Problem:** Four Builder lanes need one frozen, importable contract (types + Zod validators + event catalog + DB schema) before they build in parallel.
2. **Success:** `import { ParticipantSchema, EventType, canTransitionIntroState } from './src/contracts'` works; `schema.sql` applies cleanly to SQLite in WAL mode; contract tests are green.
3. **Out of scope:** DB client, routes, SSE handlers, scoring math, GitHub/website fetching, UI.

## File envelope (dispatch)
`src/contracts/types.ts`, `src/contracts/events.ts`, `src/contracts/index.ts` (barrel, `src/contracts/*`), `src/db/schema.sql`, `tests/contracts.test.ts`, `package.json`, `tsconfig.json`, `vitest.config.ts`, `CHANGELOG.md`.

## Decisions
- [DECISION: Canonical source is `DATA_AND_EVENTS_CONTRACT.md`; the dispatch adds `website_url` on Participant and `'public_website'` on EvidenceReceipt.source_type.]
- [DECISION: ScoreBreakdown is the contract's 4-dimension form (40/30/20/10), matching `MATCH_SCORING_SPEC.md`; Rule #314's 5-component formula is flagged to PM, not implemented.]
- [DECISION: Root `src/` layout per dispatch + LANE_QUEUE, not the `packages/shared` layout in project-preferences; flagged to PM.]
- [DECISION: `PublicEventEnvelope` payloads are strict per-type Zod objects keyed by pseudonym; `github_username`/`avatar_url` only admitted alongside `public_display_consent: true`; secret/contact keys rejected anywhere in the payload.]
- [DECISION: `canTransitionIntroState` returns false for same-state requests; `classifyIntroTransition` reports `'noop'` so routes can answer idempotently without emitting events.]
- [ASSUMPTION: Decline (`Pass`) and `mutual_accepted → completed` do not require a verified actor — invariant 1 names only `proposed_by_*` and `mutual_accepted`.]

## Chunks
- [x] 1. Contracts, schema, tests, changelog — single chunk.

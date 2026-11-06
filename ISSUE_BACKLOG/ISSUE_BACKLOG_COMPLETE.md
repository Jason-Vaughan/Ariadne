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
# [feature] A-002: Public QR onboarding — Zero-OAuth 1-tap GitHub handle entry

- **Issue ID:** `A-002`
- **Priority:** `P0`
- **Assigned Lane & Car:** `Ariadne-Lane-A` (`Car 1-A`)
- **Milestone / Train:** `Train 1 — Core Pipeline & Stage Shell (v0.2.0)`
- **Dependencies:** `A-001`

## 1. Description
Build the mobile-first QR landing and onboarding flow (`/join`) with a prominent **`⚡ REQUIRES GITHUB PROFILE`** badge, **Zero-OAuth 1-Tap GitHub `@username` / URL entry** (so attendees join in `< 1s` on venue Wi-Fi without an OAuth login/2FA wall), optional 1-line *"What I'm building or looking for today"* note, optional 1-click GitHub OAuth for a `"Verified"` badge, explicit data-processing & stage-display consent controls, provisional profile page (`/me`), and immediate emission of `participant.registered`.

## 2. Rationale
On congested hackathon venue Wi-Fi, requiring a full GitHub OAuth redirect + 2FA on mobile causes ~50% drop-off during a 3-minute stage pitch. By requiring a public GitHub `@username` directly (`Zero-OAuth`), any attendee with a GitHub profile joins in `< 1 second` and immediately triggers the live GitHub crawl and 6-axis Builder Fingerprint pipeline on the 16:9 Stage Visualizer.

## 3. Dependencies
- Depends on `A-001` (`Participant` contract, SQLite schema, and `participant.registered` event contract).

## 4. Implementation Boundaries
- **In Scope:** `src/app/page.tsx`, `src/app/join/page.tsx`, `src/app/me/page.tsx` (provisional shell + progressive status indicators), `src/app/api/participants/route.ts`, `src/app/api/participants/me/route.ts` (including `DELETE` withdrawal endpoint), and optional `src/app/api/auth/github/*`.
- **Out of Scope:** Deep GitHub API repository fetching (`A-003`), LLM profile synthesis (`A-004`), or match scoring (`A-006`).

## 5. Acceptance Criteria
- [ ] Displays a clear, high-contrast **`⚡ REQUIRES GITHUB PROFILE`** banner at the top of `/join`.
- [ ] Accepts any valid GitHub handle (`octocat`, `@octocat`) or profile URL (`https://github.com/octocat`) with zero OAuth login wall required, plus an optional 1-line collaboration goal (`<= 160 chars`).
- [ ] Submission is blocked unless the explicit GitHub public-analysis consent checkbox is checked.
- [ ] Submitting creates a persistent `Participant` record with a deterministic pseudonym (`Thread-XXXX`), sets a signed `HttpOnly` session cookie, emits `participant.registered`, and redirects to `/me` in `< 1.0s`.
- [ ] **Hard Room Capacity Admission Gate (`maxRoomCapacity`, default `30`):** When active non-seed participants reach `maxRoomCapacity` (or when the Operator locks intake via `/stage` or `/admin`), `/join` and `POST /api/participants` display a friendly mobile notice: **`"🚧 System is currently at capacity (30/30) — please try back later!"`** with a **`[🔄 Try Again]`** button (while existing sessions and pre-warmed VIP/Judge handles continue through unimpeded).
- [ ] Participant can withdraw and delete their profile at any time via a clear *"Withdraw & Delete My Data"* action (`DELETE /api/participants/me`), which immediately frees a capacity slot.

## 6. Test Requirements
- Unit/API tests verifying username/URL normalization, rejection of empty/invalid handles or unconsented submissions (`400`), session cookie creation, and complete data purge upon `DELETE /api/participants/me`.

## 7. Security & Privacy Considerations
- Enforce IP/cookie rate limiting on `POST /api/participants`.
- Ensure the optional *"Display my @github handle on the 16:9 stage visualizer"* checkbox is clearly labeled.
- Request zero private repository scopes if optional GitHub OAuth is used (`read:user` only).

## 8. Expected Demonstration Impact
Enables frictionless live audience participation during the hackathon: attendees scan the QR code, type their GitHub `@username` in one tap, and watch their card enter **Stage 1: GitHub Crawl** on the 16:9 big screen within 1 second.
# [feature] A-003: GitHub public-data connector, Multi-PAT pool, 24h SQLite cache & VIP pre-warmer

- **Issue ID:** `A-003`
- **Priority:** `P0`
- **Assigned Lane & Car:** `Ariadne-Lane-B` (`Car 1-B`)
- **Milestone / Train:** `Train 1 — Core Pipeline & Stage Shell (v0.2.0)`
- **Dependencies:** `A-001`

## 1. Description
Implement the bounded GitHub public-data connector (`src/lib/github/*`) that retrieves a participant's public profile metadata, top/recent non-fork repositories, truncated `README.md` excerpts, language distributions, and recent public issues/PRs, normalizing them into verifiable `EvidenceReceipt` records and computing an initial **6-Axis Builder Fingerprint** (`Systems/Infra`, `Agent Orchestration`, `LLM/Eval`, `Frontend/UX`, `Product/GTM`, `Data/Pipelines`). Includes **Multi-PAT Token Rotation (`GITHUB_TOKENS`)**, a **24-hour SQLite Snapshot Cache**, and a **VIP / Judge Pre-Warm Endpoint (`POST /api/admin/prewarm`)**.

## 2. Rationale
When 40–150 people scan the QR code simultaneously during a stage pitch, Ariadne must never hit GitHub API rate limits or stall on slow network calls. Rotating across 2–3 GitHub PATs (`15,000+ req/hr`), caching snapshots for 24h in SQLite, and allowing the Operator to pre-warm judge/VIP handles ahead of time guarantees sub-second reliability.

## 3. Dependencies
- Depends on `A-001` (`EvidenceReceipt` contract, `github_snapshots` table, event contracts `github.fetch.started`, `github.fetch.completed`, `analysis.failed`).

## 4. Implementation Boundaries
- **In Scope:** `src/lib/github/client.ts` (with `GITHUB_TOKENS` round-robin rotation + adaptive `full` vs `fast-rest` mode), `src/lib/github/normalizer.ts` (including deterministic 6-axis Builder Fingerprint baseline), `src/lib/github/sanitizer.ts`, 24-hour snapshot caching in `github_snapshots`, and `POST /api/admin/prewarm` (accepts an array of GitHub handles to pre-fetch into SQLite cache).
- **Out of Scope:** Gemini Flash deep capability synthesis (`A-004`) or opportunity inference (`A-005`).

## 5. Acceptance Criteria
- [ ] Supports comma-separated `GITHUB_TOKENS` (or single `GITHUB_TOKEN`) with automatic token rotation on `X-RateLimit-Remaining < 50` or `403/429`.
- [ ] Retrieves public profile, up to 10 non-fork public repositories, languages, topics, and truncated `README.md` (`<= 3,500 chars`), emitting `github.fetch.started` and `github.fetch.completed` with repo count and duration (`ms`).
- [ ] Computes a deterministic baseline **6-Axis Builder Fingerprint** (`0–100` across `Systems/Infra`, `Agent Orchestration`, `LLM/Eval`, `Frontend/UX`, `Product/GTM`, `Data/Pipelines`) from repo languages/topics in `< 50ms` so Stage 1 progressive UX renders immediately.
- [ ] Serves repeat or pre-warmed handles from the 24-hour `github_snapshots` SQLite cache in `< 10ms` (`0` external GitHub API calls).
- [ ] `POST /api/admin/prewarm` accepts `{ handles: ["user1", "user2", ...] }` and caches their GitHub snapshots in the background before demo time.

## 6. Test Requirements
- Unit tests covering Multi-PAT token rotation, GraphQL/REST response normalization, 24-hour SQLite cache hits, 6-axis Builder Fingerprint calculation, `POST /api/admin/prewarm`, and HTML/prompt-injection sanitization.

## 7. Security & Privacy Considerations
- Query **only** public endpoints; filter out any private repository references.
- Sanitize all external GitHub text before storing or passing downstream.

## 8. Expected Demonstration Impact
Powers **Column 1 (`GitHub Crawl`)** and **Column 3 (`Builder Fingerprint`)** on the 16:9 Stage Visualizer with sub-second cached speed and bulletproof rate-limit headroom.
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
# [feature] A-006: Match scoring engine

- **Issue ID:** `A-006`
- **Priority:** `P0`
- **Assigned Lane:** `Ariadne-Lane-C` (Builder C)
- **Milestone:** `Wave 1 — Minimum Success / Wave 2 Bridge (v0.1.0-m1 / v0.2.0-m2)`
- **Dependencies:** `A-001`, `A-004`

## 1. Description
Implement the deterministic, explainable 4-factor heuristic Match Scoring Engine (`src/lib/scoring/engine.ts`) that ranks candidate pairs using the exact weights specified in `MATCH_SCORING_SPEC.md`: Complementary skills & needs (`40%`), Active project/domain relevance (`30%`), Strength of supporting evidence (`20%`), and Recency of relevant activity (`10%`).

## 2. Rationale
Participants and judges must be able to see *why* two builders were matched with a transparent, auditable mathematical breakdown rather than an opaque black-box LLM number.

## 3. Dependencies
- Depends on `A-001` (`CapabilityClaim`, `OpportunityNeed`, `EvidenceReceipt`, `ScoreBreakdown` contracts) and consumes profiles generated by `A-004`/`A-005`.

## 4. Implementation Boundaries
- **In Scope:** `src/lib/scoring/engine.ts`, sub-score calculators (`complementarity`, `domainRelevance`, `evidenceStrength`, `recency`), minimum threshold filtering (`score >= 45`), top-3 candidate selection, and emission of `match.candidate.generated`.
- **Out of Scope:** LLM prose explanation generation (`A-007`) and UI rendering (`A-008`).

## 5. Acceptance Criteria
- [ ] Computes deterministic `composite_score` (`0–100`) and 4-part `ScoreBreakdown` (`40 / 30 / 20 / 10` max points) for any pair of participant profiles.
- [ ] Excludes any `CapabilityClaim` or `OpportunityNeed` where `dismissed_by_user === true`.
- [ ] Applies stale-issue discounting when supporting issue evidence is `> 120 days` old.
- [ ] Enforces the minimum quality threshold (`score >= 45`); returns fewer than 3 (or 0) candidates if fewer meet the threshold—never pads results.

## 6. Test Requirements
- Unit test suite (`tests/scoring.test.ts`) implementing all 5 specification test cases (`TC-SCORE-01` through `TC-SCORE-05`: High Bidirectional Complementarity, Identical Clone Filtering, Stale Issue Discounting, User Dismissed Inference, and Zero-Match Integrity).

## 7. Security & Privacy Considerations
- Pure, side-effect-free computation operating only on consented (`consent_status === 'granted'`), non-withdrawn profiles.

## 8. Expected Demonstration Impact
Provides instant, reproducible 4-bar score breakdowns on both the mobile Match Card and the 16:9 Stage Spotlight screen.
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
# [feature] A-008: Mobile participant Builder Fingerprint & progressive Top-3 Match Cards UI

- **Issue ID:** `A-008`
- **Priority:** `P0`
- **Assigned Lane & Car:** `Ariadne-Lane-A` (`Car 1-A` Shell & `Car 2-A` Live Wiring)
- **Milestone / Train:** `Train 1 (v0.2.0) & Train 2 (v0.3.0)`
- **Dependencies:** `A-002`, `A-006`, `A-007`

## 1. Description
Build the private mobile participant dashboard (`/me`) showing:
1. Their own **6-Axis Builder Fingerprint Card** (`Systems/Infra`, `Agent Orchestration`, `LLM/Eval`, `Frontend/UX`, `Product/GTM`, `Data/Pipelines`) + Superpower (`Offers`) & Looking-For (`Needs`) pills,
2. Their **Top-3 Complementary Match Cards** (`score >= 45`), rendered in **`< 500ms`** (Stage 1 deterministic match + repo evidence pills) and progressively upgraded live via SSE/poll when Stage 2 Gemini Flash enrichment (`match.enriched`) arrives,
3. One-tap **`Interested`** and **`Pass`** buttons plus live incoming-interest alerts.

## 2. Rationale
After typing their GitHub handle on `/join`, `/me` is the participant's personal mobile command center. Seeing their own 6-Axis Builder Fingerprint and Top-3 matches in under a second—and watching the Gemini Flash deep collaboration pitch stream in live—makes the mobile experience feel magical.

## 3. Dependencies
- Depends on `A-002` (session & `/join`), `A-006` (scoring breakdown), and `A-007` (Two-Stage match proposals).

## 4. Implementation Boundaries
- **In Scope:** `src/app/me/page.tsx`, `src/components/BuilderFingerprintCard.tsx`, `src/components/MatchCard.tsx`, `src/components/CapabilityBadgeList.tsx`, `src/app/api/matches/route.ts`, and progressive SSE/poll updates for Stage 1 → Stage 2 enrichment.
- **Out of Scope:** Private Web Introduction Room (`/me/matches/:id`, `A-012`).

## 5. Acceptance Criteria
- [ ] Renders the participant's **6-Axis Builder Fingerprint** and verified GitHub capability/opportunity pills at the top of `/me`.
- [ ] Displays up to **3 Top Matches** ordered by `composite_score` (`>= 45`), rendering Stage 1 deterministic cards + clickable GitHub repo evidence pills in `< 500ms` and smoothly updating in place when `match.enriched` arrives.
- [ ] Each Match Card renders: overall score, 4-dimension breakdown bar (`40/30/20/10`), complementary skills, cited repos with clickable GitHub links, suggested first conversation, and 1-tap `Interested` / `Pass` buttons.
- [ ] Allows the participant to dismiss any inaccurate AI-inferred capability or opportunity on their own profile and trigger a match refresh.

## 6. Test Requirements
- Component and API tests covering Builder Fingerprint rendering, 3-match rendering, Stage 1 → Stage 2 progressive update, unauthenticated redirect to `/join`, and inference dismissal.

## 7. Security & Privacy Considerations
- `GET /api/matches` returns matches **only** for the authenticated session's `participant_id`.
- Counterpart private contact details remain hidden until both tap `Interested` (`A-012`).

## 8. Expected Demonstration Impact
Gives every hackathon attendee a fast, gorgeous mobile view of their own Builder DNA and their Top 3 complementary peers in the room.
# [feature] A-009: SQLite append-only live event stream (SSE + polling fallback)

- **Issue ID:** `A-009`
- **Priority:** `P0`
- **Assigned Lane & Car:** `Ariadne-Lane-D` (`Car 1-D`)
- **Milestone / Train:** `Train 1 — Core Engine & Stage Graph (v0.2.0)`
- **Dependencies:** `A-001`

## 1. Description
Implement the SQLite-backed append-only structured event publisher (`src/lib/events/publisher.ts`), Server-Sent Events (SSE) streaming endpoint (`GET /api/events/stream?after=<seq_id>`), and automatic JSON polling fallback endpoint (`GET /api/events/poll?after=<seq_id>`) plus aggregate KPI summary endpoint (`GET /api/events/summary`).

## 2. Rationale
Both the mobile participant progress view (`/me`) and the 16:9 Presentation Visualizer (`/stage`) need real-time, verifiable updates that survive venue proxy buffering or brief Wi-Fi drops via automatic reconnect (`Last-Event-ID`) and HTTP polling fallback.

## 3. Dependencies
- Depends on `A-001` (`PublicEventEnvelope`, `EventType` catalog, and SQLite `domain_events` table).

## 4. Implementation Boundaries
- **In Scope:** `src/lib/events/publisher.ts`, `src/lib/events/sanitizer.ts`, `src/app/api/events/stream/route.ts`, `src/app/api/events/poll/route.ts`, `src/app/api/events/summary/route.ts`, and `changelog.d/A-009-010-011.md`.
- **Out of Scope:** Modifying `src/contracts/*` or root `CHANGELOG.md`.

## 5. Acceptance Criteria
- [ ] `publishDomainEvent()` atomically inserts into SQLite `domain_events` (`seq_id INTEGER PRIMARY KEY AUTOINCREMENT`) after running the public-payload privacy sanitizer.
- [ ] `GET /api/events/stream` streams standard SSE frames and replays missed events when `Last-Event-ID` or `?after=<seq_id>` is supplied.
- [ ] `GET /api/events/poll?after=<seq_id>` returns `{ events: PublicEventEnvelope[], latest_seq_id: number }` so browser clients automatically fall back to polling if SSE chunking is buffered.
- [ ] Zero simulated or synthetic heartbeat events are disguised as agent activity.

## 6. Test Requirements
- Unit/integration tests verifying monotonic SQLite `seq_id` ordering, SSE `Last-Event-ID` replay, `/api/events/poll` catch-up parity, and strict stripping of unconsented `github_username`/`avatar_url` fields.

## 7. Security & Privacy Considerations
- Both `/api/events/stream` and `/api/events/poll` read **exclusively** from the pre-sanitized `public_payload` column.

## 8. Expected Demonstration Impact
Drives live sub-second updates on both the 16:9 auditorium screen and attendee mobile phones with automatic proxy resilience.
# [feature] A-010: Interactive Stage Visualizer Shell, Top-3 Web of Connections, Golden Arcs & Seed Pool Toggle

- **Issue ID:** `A-010`
- **Priority:** `P0`
- **Assigned Lane & Car:** `Ariadne-Lane-D` (`Car 1-D`)
- **Milestone / Train:** `Train 1 — Core Pipeline & Stage Shell (v0.2.0)`
- **Dependencies:** `A-009`

## 1. Description
Build the `1920x1080` (`16:9`) interactive Stage Visualizer dashboard shell (`/stage`), persistent 6-metric top KPI ribbon, **Clickable 4-View Navigation Bar (`[1: Pipeline]`, `[2: Fingerprints]`, `[3: Web of Connections]`, `[4: Spotlight]`)**, **`[📱 QR Overlay: REQUIRES GITHUB PROFILE]`** modal (`Q`), **`[🌱 Seed AI Devs: OFF / ON (+25 Profiles)]`** toggle button (`S`), and **View 3: Sparse Top-3 (`k = 3`) Web of Connections** force-directed graph with **Glowing Golden Arcs** for mutual matches.

## 2. Rationale
At a hackathon of AI peers, drawing an all-to-all match graph creates an unreadable hairball. Capping rendered edges to each participant's **Top 3 Complementary Matches (`k = 3`)** creates a crystal-clear Web of Connections. In addition, the 1-click **`[🌱 Seed AI Devs: OFF/ON]`** button gives the presenter an "Ace Up Their Sleeve": if only 3–5 attendees scan the QR code live, toggling Seed Mode merges 25 realistic SF AI builder profiles into the live matching pool so the live attendees match with each other AND the 25 seeded builders on stage.

## 3. Dependencies
- Depends on `A-009` (`GET /api/events/stream` and `GET /api/events/poll`).

## 4. Implementation Boundaries
- **In Scope:** `src/app/stage/page.tsx`, `src/components/stage/KpiRibbon.tsx`, `src/components/stage/StageHeaderControls.tsx` (4 clickable view tabs + QR modal button + Seed Pool toggle button), `src/components/stage/NetworkGraph.tsx` (Top-3 edge cap + Golden Arcs + Stage Celebration Banner), `src/components/stage/QrJoinBanner.tsx` (with bold `⚡ SCAN TO JOIN — REQUIRES GITHUB PROFILE`), and `POST /api/stage/seed-toggle` (toggles the 25 curated AI builder profiles in/out of the active pool).
- **Out of Scope:** View 1 Pipeline Assembly Line, View 2 Fingerprints Gallery, and View 4 Spotlight deep-dive (`A-011`).

## 5. Acceptance Criteria
- [ ] Renders at `1920x1080` (`16:9`) with clickable top navigation buttons for all 4 views (`[1: Under-the-Hood Pipeline]`, `[2: Builder Fingerprints]`, `[3: Web of Connections]`, `[4: Match Spotlight]`) plus keyboard shortcuts (`1/2/3/4/Q/S/Space`).
- [ ] **QR Join Modal (`[📱 QR Overlay]` / `Q`):** Displays a giant scannable QR code with a high-contrast badge reading **`⚡ SCAN TO JOIN — REQUIRES GITHUB PROFILE`** and a live `"N Builders Scanned In"` counter.
- [ ] **Seed AI Devs Toggle (`[🌱 Seed AI Devs: OFF/ON]` / `S`):** Clicking toggles 25 pre-curated SF AI developer profiles (`is_seed = 1`) into/out of the active matching pool in `< 300ms`, matching real live scanners against both live peers and seeded AI builders.
- [ ] **Top-3 (`k = 3`) Web of Connections (`View 3`):** Renders at most the Top 3 highest-scoring match edges per node with 3 distinct visual states:
  1. `candidate` (Suggested Top-3 Match): Dashed cyan-slate line.
  2. `proposed_by_a/b` (1-Sided Interest): Solid pulsing amber line.
  3. `completed` (**Mutual Match — "Golden Arc"**): Thick glowing gold arc with an expanding ripple animation + 5-second top-of-screen **Golden Thread Celebration Banner** (`"⚡ NEW GOLDEN THREAD: @userA ↔ @userB"`).

## 6. Test Requirements
- Component and API tests verifying Top-3 (`k = 3`) edge capping (no node exceeds 3 rendered primary edges), Seed Pool toggle (`OFF ↔ ON`) inclusion/exclusion in live matching, Golden Arc transition on `introduction.completed`, and QR overlay rendering.

## 7. Security & Privacy Considerations
- Enforce pseudonymous labels (`Thread-XXXX`) whenever `public_display_consent === false` (or when privacy override `P` is active).

## 8. Expected Demonstration Impact
Gives the Presenter total stage command: show the QR code (`REQUIRES GITHUB PROFILE`), flip on the 25 Seed AI Devs if the test crowd is small, and watch the Top-3 Web of Connections light up with glowing Golden Arcs.
# [feature] A-011: Stage Views 1, 2, 4 & 5 — Narratable 4-Stage Pipeline, Builder Fingerprints, Match Spotlight & Capacity Scaler

- **Issue ID:** `A-011`
- **Priority:** `P0`
- **Assigned Lane & Car:** `Ariadne-Lane-D` (`Car 1-D`)
- **Milestone / Train:** `Train 1 — Core Pipeline & Stage Shell (v0.2.0)`
- **Dependencies:** `A-007`, `A-009`, `A-010`

## 1. Description
Implement the four deep-inspection views inside the `/stage` visualizer dashboard so the presenter can click between them and narrate what Ariadne is doing under the hood:
- **View 1 (`[1: Under-the-Hood Pipeline]`):** 4-Column Narratable Assembly Line (`1. GitHub Crawl` → `2. Gemini Agent Fan-Out` → `3. 6-Axis Builder Fingerprint` → `4. Anti-Clone Matchmaking`) with **Stage Narrator Pacing (`~3s/step`)**, `[⏸ Pause]`, `[🔄 Replay]`, Anti-Clone rejection callouts, and a bottom `🎯 Live Narrator X-Ray Bar`.
- **View 2 (`[2: Builder Fingerprints]`):** Live grid of **6-Axis Builder Fingerprint Cards** showing each person's Superpower (`Offers`), Bottleneck (`Needs`), and cited GitHub repos.
- **View 4 (`[4: Match Spotlight]`):** Side-by-side comparison of any selected match pair (or the latest Golden Arc mutual match) showing both Builder Fingerprints, the `40/30/20/10` score bars, repo evidence pills, and collaboration thesis.
- **View 5 (`[5: ⚡ Capacity & Burst Scaler]`):** Stage-visible **Capacity & QR Burst Engineering Panel** where clicking Room Size Presets (`30`, `80`, `150`, `300+`) visibly scales the **Gemini Flash Parallel Worker Core Grid (`8..32` cores)**, shows the **Multi-PAT GitHub Rate-Limit Shield & 24h SQLite Cache gauge**, and displays the **$O(N^2)$ Stage 1 (`< 12ms`) vs. Top-3 Gate (`96% LLM Call Reduction`)** math live on stage!

## 2. Rationale
When everyone in the room scans the QR code, a static network graph isn't enough—judges want to see the agentic pipeline visibly crawling repos, synthesizing Builder Fingerprints, and scoring complementary pairs under the hood, with 1-click buttons to switch between the Pipeline, the Fingerprints Gallery, the Web of Connections, and the Spotlight view.

## 3. Dependencies
- Depends on `A-007` (evaluated match payload), `A-009` (SSE/poll event stream), and `A-010` (`/stage` 4-view navigation shell).

## 4. Implementation Boundaries
- **In Scope:** `src/components/stage/PipelineAssemblyView.tsx` (View 1), `src/components/stage/FingerprintsGalleryView.tsx` (View 2), `src/components/stage/SpotlightView.tsx` (View 4), `GET /api/stage/snapshot` (returns pipeline column counts, participant fingerprints, and top matches), and click-to-spotlight wiring from Views 1, 2, and 3.
- **Out of Scope:** Mobile participant screens (`A-008`, `A-012`).

## 5. Acceptance Criteria
- [ ] **View 1 (`[1: Under-the-Hood Pipeline]`) — 4-Column Narratable Assembly Line:**
  - **Column 1 (`1. GitHub Crawl`):** Displays `@username`, repo count, top 3 repo names, language distribution bar (`TS/Rust/Python`), and cache/live timing badge.
  - **Column 2 (`2. Gemini Agent Fan-Out`):** Displays concurrent `🤖 Capability Agent (Offers)` + `🔍 Bottleneck Agent (Needs)` outputs with `Gemini Worker #N` badges and repo citation count.
  - **Column 3 (`3. Builder Fingerprint Synthesis`):** Renders animated 6-axis DNA bars (`Systems/Infra`, `Agent Orchestration`, `LLM/Eval`, `Frontend/UX`, `Product/GTM`, `Data/Pipelines`) and stamps a bold Builder Archetype badge.
  - **Column 4 (`4. Anti-Clone Matchmaking`):** Displays peer evaluation count, **1 explicit Anti-Clone rejection callout** (`"❌ Skipped @peer (Stack Clone > 0.72)"`), and the **selected Top-3 Complementary Matches** (`"✅ @match (91/100)"`).
- [ ] **Stage Narrator Pacing, Pause & Replay Controls (`[🎬 Stage Narrator (3s/step) | Fast]`, `[⏸ Pause]`, `[🔄 Replay]`):**
  - Decouples stage visual pacing from backend speed: while the attendee's mobile phone (`/me`) receives matches in `< 500ms`, `View 1` on `/stage` defaults to a narratable **`~2.5s–3.0s` visual dwell per column** so cards never flash past before the presenter can point to them.
  - Includes **`[⏸ Pause Pipeline]`** (freezes the columns so the presenter can point at a specific card) and **`[🔄 Replay Walkthrough]`** (re-runs the latest scanner or a selected builder across all 4 columns on demand).
- [ ] **Bottom `🎯 Live Narrator X-Ray Bar`:** Clicking any builder card (or enabling `[🎯 Auto-Follow Latest Scanner]`) pins a magnified 28pt single-builder horizontal stepper across the bottom of `View 1` (`1. Crawl ──► 2. Gemini Extract ──► 3. 6-Axis DNA ──► 4. Top-3 Matched`).
- [ ] **View 2 (`[2: Builder Fingerprints]`):** Renders a responsive grid of 6-Axis Builder Fingerprint Cards (radar/bar visualization + Superpower pill + Looking-For pill + cited repo badges). Clicking any card filters/highlights their Top-3 matches.
- [ ] **View 4 (`[4: Match Spotlight]`):** Renders Builder A and Builder B side-by-side with their 6-Axis Fingerprints, Composite Score (`e.g., 91/100`), 4-dimension breakdown bars (`40/30/20/10`), cited GitHub repo links, and `"Why You Two Should Talk"` thesis.
- [ ] **View 5 (`[5: ⚡ Capacity & Burst Scaler]` / hotkey `5` or `C`):** Renders the stage-visible Capacity & Admission Gate showcase with:
  1. Interactive **Hard Room Cap Buttons (`[15]`, `[● 30 (Default)]`, `[50]`, `[100]`, `[🔒 Lock Intake]`)** wired to `POST /api/admin/capacity` — showing live fill (`e.g., 18 / 30 Builders`) and a preview of the mobile *"🚧 System is at capacity — please try back later"* screen shown to overflow scanners,
  2. Live **Gemini Flash Worker Core Grid (`8` → `16` → `24` → `32` visual worker slots)** showing active vs. idle workers,
  3. **Multi-PAT GitHub Quota (`15,000 req/hr`) & 24h SQLite Cache Hit Rate** gauge + VIP Pre-Warm input (VIP handles bypass the hard cap),
  4. **$O(N^2)$ Pairwise & Top-3 Gate Cost-Reduction Calculator** showing `N(N-1)/2` Stage 1 deterministic evaluations (`< 12ms`) vs. `3 × N` Stage 2 Gemini calls (`92%–98%` LLM call reduction).
- [ ] Clicking any view tab (`1`, `2`, `3`, `4`, `5`) transitions views instantaneously (`< 50ms`) without losing live SSE state.

## 6. Test Requirements
- Component and state tests verifying View 1 4-stage card progression on SSE events, View 2 6-axis Builder Fingerprint rendering, View 4 Spotlight pair selection, and pseudonymity compliance.

## 7. Security & Privacy Considerations
- `GET /api/stage/snapshot` and `/api/stage/spotlight` strip all private contact details and respect `public_display_consent`.

## 8. Expected Demonstration Impact
Delivers the ultimate "Under the Hood" stage demo: as attendees scan the QR code, you click **`[1: Pipeline]`** to show live GitHub crawling & Gemini worker fan-out, **`[2: Fingerprints]`** to show the room's Builder DNA cards, **`[3: Web of Connections]`** to show the Top-3 match web, and **`[4: Spotlight]`** to inspect a live Golden Arc match!
# [feature] A-012: Zero-blocker mutual-introduction workflow, Private Web Intro Room, Venue Locator & Golden Arc trigger

- **Issue ID:** `A-012`
- **Priority:** `P0`
- **Assigned Lane & Car:** `Ariadne-Lane-A` (`Car 2-A`)
- **Milestone / Train:** `Train 2 — End-to-End Integration & Mutual Intros (v0.3.0)`
- **Dependencies:** `A-008`

## 1. Description
Implement the frictionless bilateral mutual-introduction state machine (`POST /api/matches/:id/decision`) with **zero OAuth login blocker** (authenticated directly by the participant's `/join` session cookie), live incoming-interest banner on `/me`, and the unlocked **Private Web Introduction Room** (`/me/matches/:id`) when both participants tap `Interested`—complete with **Mutual Contact Reveal**, **AI "First 3 Minutes" Collaboration Icebreaker**, **Physical Venue Locator (`"Where are you in the room?"`)**, **Live 2-Person Web Chat**, **1-Tap `Save Contact (vCard .vcf)` & `Copy Intro` buttons**, and immediate emission of `introduction.completed` to light up a **Glowing Golden Arc** on the 16:9 Stage Visualizer.

## 2. Rationale
When two attendees at a live hackathon both tap `Interested` on their phones, the payoff must be instantaneous (`< 500ms`), practical for meeting face-to-face in a crowded venue, and visually celebrated on the big screen (`Golden Arc`).

## 3. Dependencies
- Depends on `A-008` (Mobile Match Cards UI and isolated participant session).

## 4. Implementation Boundaries
- **In Scope:** `src/lib/intros/state-machine.ts`, `src/app/api/matches/[id]/decision/route.ts`, `src/app/api/matches/[id]/room/route.ts` (`GET` room state + `POST` live 2-person chat message / venue location update), `src/app/me/matches/[id]/page.tsx`, 1-tap `.vcf` vCard download & clipboard/SMS copy helpers, and emission of `introduction.proposed`, `introduction.accepted`, `introduction.declined`, and `introduction.completed`.
- **Out of Scope:** External Discord/Medusa bot integrations (deferred to post-hackathon roadmap).

## 5. Acceptance Criteria
- [ ] **1-Tap Zero-Blocker Decision:** Tapping `Interested` on `/me` works immediately in 1 tap using the participant's `/join` session cookie (`zero` OAuth redirect wall).
- [ ] **Deterministic State Machine:** Transitions `candidate` → `proposed_by_a/b` → `completed` (when both tap `Interested`) or `declined` (when either taps `Pass`), with strict idempotency on repeated taps.
- [ ] **Incoming Interest Banner:** When Participant A taps `Interested`, Participant B sees a prominent live banner on `/me`: **`"⚡ @userA wants to connect with you! Tap Interested to unlock your Intro Room"`**.
- [ ] **Private Web Introduction Room (`/me/matches/:id`):** Once `completed`, both participants unlock:
  1. **Mutual Contact Reveal:** Verified GitHub profile links + any shared contact handles (X/LinkedIn/Email/Phone).
  2. **AI "First 3 Minutes" Icebreaker:** Concrete starter question + collaboration thesis citing their exact repositories.
  3. **Physical Venue Locator & Live 2-Person Chat:** Quick-tap location pills (`"Near Stage"`, `"Coffee Area"`, `"Back Tables"`, or custom text) + live SSE/polled 2-person message thread so they can find each other in the room in `< 60 seconds`.
  4. **1-Tap Export Buttons:** **`[📇 Save Contact (vCard)]`** and **`[📋 Copy Intro / Share via SMS]`**.
- [ ] **Stage Golden Arc Trigger:** Emits `introduction.completed`, turning their edge into a **Glowing Golden Arc** and firing the 5-second celebration banner on `/stage`.

## 6. Test Requirements
- State-machine and API tests verifying: (a) unilateral interest never leaks counterpart contact info or unlocks `/me/matches/:id`, (b) bilateral interest unlocks `/me/matches/:id` and emits `introduction.completed` exactly once, (c) venue locator & 2-person chat messages persist and stream to both peers, and (d) vCard `.vcf` payload formats cleanly.

## 7. Security & Privacy Considerations
- Enforce strict row-level authorization: only `participant_a` or `participant_b` of that specific match can access `/me/matches/:id` or post chat/location updates.

## 8. Expected Demonstration Impact
Delivers the signature "Aha!" payoff of the demo: two people tap `Interested` on their phones, their thread turns into a **Glowing Golden Arc** on the 16:9 stage screen, and their phones open a live Intro Room with a Venue Locator (`"I'm by the front left table!"`), AI icebreaker, and 1-tap vCard download.
# [DEFERRED TO POST-HACKATHON ROADMAP] A-013: Discord event bot

- **Issue ID:** `A-013`
- **Status:** **DEFERRED — POST-HACKATHON ROADMAP ONLY (Do NOT publish in H-Day MVP sprint)**
- **Superseded By:** **ARIADNE ARCHITECTURE AMENDMENT — WEB-ONLY HACKATHON MVP (`A-012` Web-Native Mutual Introduction Room)**

## Summary
Per the Web-Only Hackathon MVP Amendment, all match proposals (`Interested` / `Pass`) and mutually approved introductions are handled 100% inside the self-hosted Ariadne web interface (`/me` and `/me/matches/:id`). No Discord dependency is included in the Saturday hackathon sprint.
# [chore] A-014: Self-hosted server (:3420), SQLite WAL, narrow HTTPS tunnel & resilience

- **Issue ID:** `A-014`
- **Priority:** `P0`
- **Assigned Lane & Car:** `Ariadne-INT` (`Car 0-INT` Slice 1 & `Car 3-INT` Slice 2)
- **Milestone / Train:** `Train 0 (v0.1.0) & Train 3 (v1.0.0)`
- **Dependencies:** `A-001`

## 1. Description
Configure and verify the self-hosted Ariadne web server bound to PortHub port `127.0.0.1:3420`, persistent SQLite WAL database (`data/ariadne.sqlite`) with pre-release atomic backups, narrowly scoped public HTTPS tunnel (`cloudflared` / `ngrok` targeting exclusively `127.0.0.1:3420`), health/readiness endpoint (`GET /api/health`), and strict control-plane isolation checks.

## 2. Rationale
Per the Web-Only Hackathon MVP Amendment, Ariadne runs directly on the TangleClaw host while remaining 100% isolated from TangleClaw's control plane (`:3102`, `:3100`, `:8443`) and internal Medusa services (`:3009`, `:3010`).

## 3. Dependencies
- Depends on `A-001` (core repository & SQLite schema initialization).

## 4. Implementation Boundaries
- **In Scope:** PortHub lease registration (`3420`, `3421`, `4420`), SQLite WAL configuration (`PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;`), `GET /api/health` readiness endpoint, pre-cutover SQLite backup script, narrow HTTPS tunnel startup/verification, and `< 15s` tag rollback procedure.
- **Out of Scope:** Touching `tailscale serve`/`funnel` on `:8443` or exposing any TangleClaw/Medusa port or credential.

## 5. Acceptance Criteria
- [ ] Local server binds strictly to `127.0.0.1:3420` (registered in PortHub) and serves both the mobile participant interface (`/join`, `/me`) and presentation visualizer (`/stage`, `/reports`).
- [ ] Narrow public HTTPS tunnel forwards traffic **only** to `http://127.0.0.1:3420`.
- [ ] `GET /api/health` reports SQLite WAL readiness, GitHub API rate-limit status, and worker queue depth without leaking secrets or stack traces.
- [ ] Pre-cutover SQLite backup (`sqlite3 .backup`) and SHA-256 verification execute cleanly at each Train cutover (`v0.1.0`, `v0.2.0`, `v0.3.0`, `v1.0.0`).

## 6. Test Requirements
- Integration and security boundary tests verifying `GET /api/health`, SQLite WAL persistence across restarts, and zero exposure of TangleClaw/Medusa environment variables or routes.

## 7. Security & Privacy Considerations
- Run Ariadne with a dedicated, minimal environment variable set (`ARIADNE_*` only). Never mount host filesystem directories outside the Ariadne repo.

## 8. Expected Demonstration Impact
Provides zero-cloud-setup local speed (`< 5ms` SQLite queries) combined with instant public mobile accessibility via the narrow HTTPS tunnel.
# [docs] A-015: Hackathon provenance & Per-Version v2.0.0 Interactive Sprint Reports

- **Issue ID:** `A-015`
- **Priority:** `P0`
- **Assigned Lane & Car:** `Ariadne-Obsr` + `Ariadne-PM` (`Car 0-INT` Slice 1 & Per-Train `O-Gate`)
- **Milestone / Train:** `Train 0 (v0.1.0) through Train 3 (v1.0.0)`
- **Dependencies:** `A-001`

## 1. Description
Maintain the cryptographic provenance ledger (`docs/provenance/PROVENANCE_LEDGER.md`) and generate per-version **TangleClaw Sprint Reporting Standard `v2.0.0`** Interactive HTML Sprint Reports (`/reports/v0.1.0/`, `/reports/v0.2.0/`, `/reports/v0.3.0/`, `/reports/v1.0.0/`, and the cumulative `/reports/v0.1.0-v1.0.0-retrospective/`) served directly by the Ariadne web app and linked from the 16:9 Stage Visualizer.

## 2. Rationale
Objective B of the hackathon is proving to judges how a single Operator directed an autonomous TangleClaw fleet across 4 governed Release Trains on Saturday. Adopting TangleClaw's `v2.0.0` Sprint Report Standard (`metrics_schema.py` + `validate-sprint-report.py`) gives judges an interactive, audit-grade dashboard of every Car, PR, test count, gate review, and `t1..t8` timestamp.

## 3. Dependencies
- Depends on `A-001` (repository initialization).

## 4. Implementation Boundaries
- **In Scope:** Pre-event SHA-256 manifest (`PRE_EVENT_MANIFEST.sha256`), Python report generator script (`scripts/gen_sprint_report.py` modeled on `/Users/jasonvaughan/Documents/Projects/Shared/TangleClaw-Shared/sprint-reports/generators/gen_v5660.py`), static/route serving under `/reports/*`, and `/provenance` summary view.
- **Out of Scope:** Hand-editing HTML reports without running the generator/validator.

## 5. Acceptance Criteria
- [ ] Pre-event planning documents are listed with their SHA-256 digests and explicitly labeled **Pre-Event Preparation (Nov 5–6, 2026)**.
- [ ] First application code commit (`t2_first_branch_commit`) is timestamped strictly after **09:30 AM PST on Saturday, November 7, 2026**, following explicit Operator `GO`.
- [ ] At each Train release (`v0.1.0`, `v0.2.0`, `v0.3.0`, `v1.0.0`), `Ariadne-Obsr` generates the `v2.0.0` HTML report containing the embedded `tc-sprint-metrics-json` block (`t1..t8` timestamps, `T_eng`, `ADE`, Car-by-Car LOC/test SVG charts, 4-Gate audit table, and 16-row `Rule #283` table).
- [ ] `/reports/` hub index compares all 4 Saturday Release Trains side-by-side for judges.

## 6. Test Requirements
- Automated verification confirming `/reports/` and each version report return `200 OK`, contain valid `tc-sprint-metrics-json` payloads, and confirm zero executable code existed prior to `v0.0.0-planning-baseline`.

## 7. Security & Privacy Considerations
- Redact internal machine tokens or private participant records from public sprint reports.

## 8. Expected Demonstration Impact
Provides a show-stopping judge presentation asset during Minute 2 of the live demo: an interactive engineering telemetry hub built automatically at each release train throughout the day.
# [feature] A-016: Two-stage progressive pipeline, Parallel Gemini Flash worker pool & Onsite Capacity Controller

- **Issue ID:** `A-016`
- **Priority:** `P0`
- **Assigned Lane & Car:** `Ariadne-Lane-C` (`Car 2-C`)
- **Milestone / Train:** `Train 2 — End-to-End Integration & Mutual Intros (v0.3.0)`
- **Dependencies:** `A-003`..`A-007`, `A-009`

## 1. Description
Implement the **Two-Stage Progressive Match Pipeline** and **Parallel Gemini Flash (`gemini-2.5-flash`) Worker Pool** (`src/lib/jobs/runner.ts` + `src/lib/scoring/rematcher.ts`), paired with the **Onsite Room Capacity Controller (`/admin` + `POST /api/admin/capacity`)** so the Operator can dynamically dial the expected crowd size (`30`, `80`, `150`, `300+` concurrent QR scanners) onsite and auto-scale worker concurrency, GitHub fetch mode, and continuous rematching.

## 2. Rationale
During the live stage pitch, dozens of attendees will scan the QR code within the same 30-second window. A **Two-Stage Progressive UX** guarantees that every attendee gets their **Stage 1 deterministic 6-axis Builder Fingerprint + Top-3 Matches + repo evidence pills in `< 500ms`**, while the **Stage 2 Parallel Gemini Flash Worker Pool** fans out `8..32` concurrent workers in the background to stream deep capability/bottleneck/thesis enrichments over SSE (`2–5s`) with zero blocking or rate-limit bottlenecks.

## 3. Dependencies
- Depends on `A-003`..`A-007` and `A-009`.

## 4. Implementation Boundaries
- **In Scope:** `src/lib/jobs/runner.ts` (Two-Stage execution + configurable `WORKER_CONCURRENCY` pool using `GEMINI_API_KEY` `gemini-2.5-flash` with deterministic fallback), `src/lib/scoring/rematcher.ts` (Top-3 continuous rematching preserving acted-upon matches), `src/app/admin/page.tsx`, and `src/app/api/admin/capacity/route.ts` (live room-size presets: `30`, `80`, `150`, `300+` + VIP pre-warm trigger UI + Seed Pool toggle button).
- **Out of Scope:** Modifying frozen `src/contracts/*`.

## 5. Acceptance Criteria
- [ ] **Stage 1 (`< 500ms` Instant Deterministic Match):** Immediately upon `github.fetch.completed`, computes the participant's baseline 6-Axis Builder Fingerprint and runs `A-006` (`40/30/20/10`) against all active pool members to emit their initial **Top-3 Matches + repo evidence pills** in `< 500ms`.
- [ ] **Stage 2 (`2–5s` Parallel Gemini Flash Fan-Out):** Fans out `A-004` (capabilities), `A-005` (bottlenecks), and `A-007` (match explanations) across a parallel worker pool (`Promise.allSettled` bounded by `workerConcurrency`, defaulting to `GEMINI_MODEL=gemini-2.5-flash`) and streams `match.enriched` events via SSE to `/me` and `/stage`.
- [ ] **Zero-Downtime Deterministic Fallback:** If `GEMINI_API_KEY` is absent, rate-limited, or times out (`> 6s`), Stage 1 deterministic capabilities, bottlenecks, and evidence-backed match explanations remain 100% functional with zero user-visible errors.
- [ ] **Onsite Room Capacity & Hard Admission Cap Controller (`/admin`, `/stage` View 5 & `POST /api/admin/capacity`):**
  - Defaults `maxRoomCapacity` to **`30`** (with 1-click presets **`[15]`**, **`[30]`**, **`[50]`**, **`[100]`**, plus **`[🔒 Lock Intake]`**).
  - Enforces the hard admission cap on new QR joins (`429 ROOM_AT_CAPACITY` -> friendly *"System is at capacity — please try back later"* notice on `/join`), while always admitting pre-warmed VIP/Judge handles.
  - Dynamically scales `workerConcurrency` (`8` → `16` → `24` → `32` parallel Gemini Flash workers) and `githubFetchMode` (`full-graphql` vs `fast-rest-top5`) to match the selected cap.
- [ ] **Continuous Rematching:** Preserves any match where either participant has already tapped `Interested` or `Pass`.

## 6. Test Requirements
- Unit/integration tests verifying: (1) `< 500ms` Stage 1 deterministic match emission before Stage 2 LLM completion, (2) parallel worker concurrency scaling via `POST /api/admin/capacity`, (3) graceful deterministic fallback when LLM times out, and (4) preservation of acted-upon matches during continuous rematching.

## 7. Security & Privacy Considerations
- Immediately exclude any participant with `consent_status === 'withdrawn'` from worker and rematching passes.

## 8. Expected Demonstration Impact
Gives the Operator a live onsite capacity dial (`/admin`) and guarantees that whether 10 people or 200 people scan the QR code at once, everyone sees matches on their phone in `< 500ms` while the 16:9 Stage Visualizer shows parallel Gemini Flash workers flying through the queue.
# [DEFERRED TO POST-HACKATHON ROADMAP] A-017: Medusa coordination adapter

- **Issue ID:** `A-017`
- **Status:** **DEFERRED — POST-HACKATHON ROADMAP ONLY (Do NOT publish in H-Day MVP sprint)**
- **Superseded By:** **ARIADNE ARCHITECTURE AMENDMENT — WEB-ONLY HACKATHON MVP**

## Summary
Per the Web-Only Hackathon MVP Amendment, no Medusa or Morpheus application dependency is included in the Saturday hackathon MVP. All capability and match evaluations run inside Ariadne's bounded in-process SQLite job worker (`A-004`–`A-007`, `A-016`).

# H-Day GitHub Issue Backlog Index — ARIADNE (`ARIADNE-HACK-2026`)
*Amended: Web-Only Self-Hosted MVP + `TC-Lane-PM` 4-Train Bundled Cars (`Rule #294`)*

> **CRITICAL DIRECTIVE:** These 15 active H-Day MVP issue drafts (`A-001`–`A-012`, `A-014`–`A-016`) are prepared locally for H-Day publication. **Do NOT create remote GitHub repository or publish issues before 09:30 AM PST on Saturday, November 7, 2026, AND explicit Operator `GO`.**
> Per the **Web-Only Hackathon MVP Amendment**, `A-013` (Discord event bot) and `A-017` (Medusa coordination adapter) have been moved to the **Post-Hackathon Roadmap**.

---

## 1. Active H-Day MVP Backlog Arranged by Release Trains & Cars (`15 Issues`)

| ID | Title | Priority | Train / Version | Bundled Car | Assigned Lane | Draft File |
|---|---|---|---|---|---|---|
| **A-001** | Core architecture, SQLite WAL schema & data/event contracts | `P0` | **Train 0 (`v0.1.0`)** | **`Car 0-INT`** | `Ariadne-INT` + `Arc` | `ISSUE_BACKLOG/A-001.md` |
| **A-014** | Self-hosted server (`:3420`), SQLite WAL, narrow HTTPS tunnel & resilience | `P0` | **Train 0 (`v0.1.0`) & Train 3 (`v1.0.0`)** | **`Car 0-INT` / `Car 3-INT`** | `Ariadne-INT` | `ISSUE_BACKLOG/A-014.md` |
| **A-015** | Hackathon provenance & Per-Version `v2.0.0` Interactive Sprint Reports | `P0` | **Train 0 (`v0.1.0`) – Train 3 (`v1.0.0`)** | **`Car 0-INT` / `Obsr`** | `Ariadne-Obsr` + `PM` | `ISSUE_BACKLOG/A-015.md` |
| **A-002** | Mobile QR onboarding, consent & session isolation | `P0` | **Train 1 (`v0.2.0`)** | **`Car 1-A`** | `Ariadne-Lane-A` | `ISSUE_BACKLOG/A-002.md` |
| **A-008** | Mobile participant profile & top-3 match results interface | `P0` | **Train 1 (`v0.2.0` Shell) / Train 2 (`v0.3.0` Live)** | **`Car 1-A` / `Car 2-A`** | `Ariadne-Lane-A` | `ISSUE_BACKLOG/A-008.md` |
| **A-003** | Bounded GitHub public-data connector & SQLite snapshot cache | `P0` | **Train 1 (`v0.2.0`)** | **`Car 1-B`** | `Ariadne-Lane-B` | `ISSUE_BACKLOG/A-003.md` |
| **A-004** | Evidence-backed capability analysis agent | `P0` | **Train 1 (`v0.2.0`)** | **`Car 1-B`** | `Ariadne-Lane-B` | `ISSUE_BACKLOG/A-004.md` |
| **A-005** | Opportunity and bottleneck discovery agent | `P1` | **Train 1 (`v0.2.0`)** | **`Car 1-B`** | `Ariadne-Lane-B` | `ISSUE_BACKLOG/A-005.md` |
| **A-006** | Deterministic 4-factor match scoring engine (`40/30/20/10`) | `P0` | **Train 1 (`v0.2.0`)** | **`Car 1-C`** | `Ariadne-Lane-C` | `ISSUE_BACKLOG/A-006.md` |
| **A-007** | Match research and proposal explanation agent | `P0` | **Train 1 (`v0.2.0`)** | **`Car 1-C`** | `Ariadne-Lane-C` | `ISSUE_BACKLOG/A-007.md` |
| **A-009** | SQLite append-only event stream (`SSE` + polling fallback) | `P0` | **Train 1 (`v0.2.0`)** | **`Car 1-D`** | `Ariadne-Lane-D` | `ISSUE_BACKLOG/A-009.md` |
| **A-010** | 16:9 Presentation Visualizer — Network Mode & KPI ribbon | `P0` | **Train 1 (`v0.2.0`)** | **`Car 1-D`** | `Ariadne-Lane-D` | `ISSUE_BACKLOG/A-010.md` |
| **A-011** | 16:9 Presentation Visualizer — Activity & Spotlight modes | `P1` | **Train 1 (`v0.2.0`)** | **`Car 1-D`** | `Ariadne-Lane-D` | `ISSUE_BACKLOG/A-011.md` |
| **A-012** | Web-native mutual-introduction workflow & private intro room | `P0` | **Train 2 (`v0.3.0`)** | **`Car 2-A`** | `Ariadne-Lane-A` | `ISSUE_BACKLOG/A-012.md` |
| **A-016** | In-process async job worker & continuous rematching | `P1` | **Train 2 (`v0.3.0`)** | **`Car 2-C`** | `Ariadne-Lane-C` | `ISSUE_BACKLOG/A-016.md` |

---

## 2. Post-Hackathon Roadmap (Explicitly Deferred — Zero H-Day Scope)

Per the **Web-Only Hackathon MVP Amendment** and Operator Charter Section 8, the following items are **deferred to the post-hackathon roadmap**:
- **`A-013` (Deferred):** Dedicated Discord event bot for match proposals and thread creation (`ISSUE_BACKLOG/A-013.md` retained as post-hackathon reference only).
- **`A-017` (Deferred):** Medusa A2A coordination adapter (`ISSUE_BACKLOG/A-017.md` retained as post-hackathon reference only).
- **Morpheus Integration:** Deferred to post-hackathon roadmap.
- Conversational interview bot.
- Résumé, LinkedIn, X, and Instagram analysis.
- Persistent personal agents across events.
- Internet-wide Medusa federation & independent agent identity/trust.
- Long-term project opportunity monitoring & TangleClaw-backed execution of agreed collaborations.
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
# [feature] A-002: Public onboarding and QR intake

- **Issue ID:** `A-002`
- **Priority:** `P0`
- **Assigned Lane:** `Ariadne-Lane-A` (Builder A)
- **Milestone:** `Wave 1 — Minimum Success (v0.1.0-m1)`
- **Dependencies:** `A-001`

## 1. Description
Build the mobile-first QR landing and onboarding flow (`/join`), GitHub username/URL input and optional 1-click GitHub OAuth sign-in, explicit data-processing consent and optional public stage-display consent controls, provisional profile page (`/me`), and immediate emission of `participant.registered`.

## 2. Rationale
The onboarding page is the front door for every hackathon attendee scanning the stage QR code. It must complete in under 10 seconds on mobile cellular/venue Wi-Fi without requiring a lengthy questionnaire or interview.

## 3. Dependencies
- Depends on `A-001` (`Participant` contract, database schema, and `participant.registered` event contract).

## 4. Implementation Boundaries
- **In Scope:** `src/app/page.tsx`, `src/app/join/page.tsx`, `src/app/me/page.tsx` (provisional shell + progressive status indicators), `src/app/api/participants/route.ts`, `src/app/api/participants/me/route.ts` (including `DELETE` withdrawal endpoint), and `src/app/api/auth/github/*`.
- **Out of Scope:** Deep GitHub API repository fetching (`A-003`), LLM profile synthesis (`A-004`), or match scoring (`A-006`).

## 5. Acceptance Criteria
- [ ] Scanning the QR code opens a mobile-responsive onboarding view that accepts either a GitHub handle (`octocat`) or profile URL (`https://github.com/octocat`).
- [ ] Submission is blocked unless the explicit GitHub analysis consent checkbox is checked.
- [ ] Submitting creates a persistent `Participant` record with a deterministic pseudonym (`Thread-XXXX`), sets a signed `HttpOnly` session cookie, emits `participant.registered`, and redirects to `/me` in `< 2.0s`.
- [ ] Participant can withdraw and delete their profile at any time via a clear *"Withdraw & Delete My Data"* action (`DELETE /api/participants/me`).

## 6. Test Requirements
- Unit/API tests verifying username/URL normalization, rejection of unconsented submissions (`400`), rate-limit enforcement, session cookie creation, and complete data purge upon `DELETE /api/participants/me`.

## 7. Security & Privacy Considerations
- Enforce IP rate limiting on `POST /api/participants` (`5 req / 10 min`).
- Ensure the optional *"Display my GitHub identity on the stage visualizer"* checkbox defaults to `false` (pseudonymous by default).
- Request zero private repository scopes if GitHub OAuth is used (`read:user` only).

## 8. Expected Demonstration Impact
Enables live audience participation during the hackathon: any attendee or judge can scan the QR code on their phone and watch their `Thread-XXXX` node appear on the 16:9 stage screen within 2 seconds.
# [feature] A-003: GitHub public-data connector

- **Issue ID:** `A-003`
- **Priority:** `P0`
- **Assigned Lane:** `Ariadne-Lane-B` (Builder B)
- **Milestone:** `Wave 1 — Minimum Success (v0.1.0-m1)`
- **Dependencies:** `A-001`

## 1. Description
Implement the bounded GitHub public-data connector (`src/lib/github/*`) that retrieves a consenting participant's public profile metadata, top/recent non-fork repositories, truncated `README.md` excerpts, language distributions, and recent public issues/PRs, normalizing them into verifiable `EvidenceReceipt` records with caching and rate-limit resilience.

## 2. Rationale
All capability claims and collaboration matches in Ariadne must be grounded in verifiable public GitHub evidence with direct URLs and timestamps, while staying well within GitHub API rate limits and a 10-second wall-clock latency budget.

## 3. Dependencies
- Depends on `A-001` (`EvidenceReceipt` contract, `github_snapshots` table, event contracts `github.fetch.started`, `github.fetch.completed`, `analysis.failed`).

## 4. Implementation Boundaries
- **In Scope:** `src/lib/github/client.ts`, `src/lib/github/normalizer.ts`, `src/lib/github/sanitizer.ts`, 30-minute snapshot caching in `github_snapshots`, and REST fallback if GraphQL is unavailable.
- **Out of Scope:** LLM capability extraction (`A-004`) or opportunity inference (`A-005`).

## 5. Acceptance Criteria
- [ ] Retrieves public profile, up to 10 non-fork public repositories, languages, topics, truncated `README.md` (`<= 3,500 chars`), and recent open issues/PRs in `< 10s`.
- [ ] Emits `github.fetch.started` and `github.fetch.completed` with exact repository and evidence receipt counts.
- [ ] Produces normalized `EvidenceReceipt[]` records with valid `https://github.com/...` URLs and `source_updated_at` timestamps.
- [ ] Handles unknown usernames (`404`), users with 0 public repos, and rate limits (`403/429`) gracefully without crashing the worker.

## 6. Test Requirements
- Unit tests covering GraphQL/REST response normalization, 30-minute cache hits, `404`/`429` graceful error state transitions, and HTML/prompt-injection sanitization on untrusted README/issue strings.

## 7. Security & Privacy Considerations
- Query **only** public endpoints; filter out any private repository references.
- Sanitize all external GitHub text (strip HTML tags, scripts, and markdown tracking images) before storing or passing downstream.

## 8. Expected Demonstration Impact
Powers the live evidence receipts shown on both the participant's mobile profile and the stage Activity/Spotlight views, proving Ariadne reads real engineering history rather than hallucinating skills.
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
# [feature] A-005: Opportunity and bottleneck discovery

- **Issue ID:** `A-005`
- **Priority:** `P1`
- **Assigned Lane:** `Ariadne-Lane-B` (Builder B)
- **Milestone:** `Wave 2 — Strong Success (v0.2.0-m2)`
- **Dependencies:** `A-003`, `A-004`

## 1. Description
Implement the Opportunity Discovery Agent (`src/lib/agents/opportunity-discovery.ts`) that inspects a participant's recent repository activity, open issues, PR signals, and architectural focus to identify candidate collaboration opportunities (`OpportunityNeed[]`) and desired complementary skills.

## 2. Rationale
Great professional discovery is not just matching two people who both write Python—it is connecting a builder who has a specific systems, UI, or domain challenge with someone who has solved that exact problem.

## 3. Dependencies
- Depends on `A-003` (GitHub issue/PR/README evidence receipts) and `A-004` (capability profile context).

## 4. Implementation Boundaries
- **In Scope:** `src/lib/agents/opportunity-discovery.ts`, stale-issue detection (`> 120 days`), confidence and uncertainty note generation, and emission of `opportunity.identified`.
- **Out of Scope:** Pairwise match scoring (`A-006`) or match explanation generation (`A-007`).

## 5. Acceptance Criteria
- [ ] Every `OpportunityNeed` cites supporting `EvidenceReceipt` IDs and defaults `label` to `'Potential Opportunity (AI Inference)'`.
- [ ] Stale issues (`> 120 days` since update) are never misstated as confirmed blockers and automatically carry an explicit age/uncertainty caveat in `uncertainty_note`.
- [ ] Does not infer personal willingness to collaborate from public GitHub activity.
- [ ] Emits `opportunity.identified` events for the stage visualizer.

## 6. Test Requirements
- Unit tests verifying stale-issue caveat injection, mandatory `Potential Opportunity (AI Inference)` labeling, citation verification, and user dismissal toggling.

## 7. Security & Privacy Considerations
- Treat open issue and PR bodies from third-party contributors on a participant's repo as untrusted input; never attribute a third-party commenter's identity to the participant.

## 8. Expected Demonstration Impact
Surfaces high-signal *"Here is what they are building and where a collaborator could help"* insights that make Ariadne's matches feel remarkably perceptive during live judging.
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
# [feature] A-008: Participant results interface

- **Issue ID:** `A-008`
- **Priority:** `P0`
- **Assigned Lane:** `Ariadne-Lane-A` (Builder A)
- **Milestone:** `Wave 2 — Strong Success (v0.2.0-m2)`
- **Dependencies:** `A-002`, `A-006`, `A-007`

## 1. Description
Build the private participant dashboard (`/me`) and match results view showing the participant's analyzed capability/opportunity profile alongside up to 3 evidence-backed Match Cards, complete with 4-factor score bars, clickable GitHub evidence links, confidence caveats, and `Interested` / `Pass` action controls.

## 2. Rationale
After scanning the QR code and consenting on `/join`, `/me` is the participant's personal command center on their phone throughout the event.

## 3. Dependencies
- Depends on `A-002` (session & provisional `/me` shell), `A-006` (scoring breakdown), and `A-007` (match explanations).

## 4. Implementation Boundaries
- **In Scope:** `src/app/me/page.tsx`, `src/components/MatchCard.tsx`, `src/components/CapabilityBadgeList.tsx`, `src/app/api/matches/route.ts`, and empty/pending/error state views.
- **Out of Scope:** Bilateral introduction delivery (`A-012`) and Discord bot notifications (`A-013`).

## 5. Acceptance Criteria
- [ ] Displays 0 to 3 top matches ordered by `composite_score` (`>= 45`).
- [ ] Each Match Card renders: overall score, 4-dimension breakdown bar, complementary skills, relevant repos with clickable GitHub links, confidence limitation note, and suggested first collaboration.
- [ ] Renders clear, honest UI states for `fetching_github`, `analyzing_profile`, `0 matches yet (waiting for compatible builders)`, and `failed (retry available)`.
- [ ] Allows the participant to dismiss any inaccurate AI-inferred capability or opportunity on their own profile and trigger a match refresh.

## 6. Test Requirements
- Component and API tests covering 3-match rendering, 1-match partial rendering, 0-match honest empty state, unauthenticated redirect to `/join`, and inference dismissal.

## 7. Security & Privacy Considerations
- `GET /api/matches` returns matches **only** for the authenticated session's `participant_id`.
- Counterpart private contact details remain hidden until `intro_state === 'completed'`.

## 8. Expected Demonstration Impact
Gives every hackathon participant and judge a polished, mobile-friendly view on their own phone showing their top 3 collaborators with clickable GitHub proof.
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
# [feature] A-010: Public network visualizer

- **Issue ID:** `A-010`
- **Priority:** `P0`
- **Assigned Lane:** `Ariadne-Lane-D` (Builder D)
- **Milestone:** `Wave 1 — Minimum Success (v0.1.0-m1)`
- **Dependencies:** `A-009`

## 1. Description
Build the 16:9 auditorium stage shell (`/stage`), persistent 6-metric top KPI ribbon, scannable QR onboarding card, and **Mode 1: Network Mode** interactive force-directed graph showing participant nodes, progressive analysis states, and match connection edges driven live by `A-009`.

## 2. Rationale
The stage visualizer is Ariadne's shared physical presence in the hackathon venue—inviting attendees to scan the QR code and watching the community graph form in real time.

## 3. Dependencies
- Depends on `A-009` (`GET /api/events/stream` and `GET /api/events/summary`).

## 4. Implementation Boundaries
- **In Scope:** `src/app/stage/page.tsx`, `src/components/stage/KpiRibbon.tsx`, `src/components/stage/NetworkGraph.tsx`, `src/components/stage/QrJoinBanner.tsx`, and keyboard shortcut controller (`1/2/3/Space/S`).
- **Out of Scope:** Detailed Activity Mode matrix and Spotlight Mode deep-dive card (`A-011`).

## 5. Acceptance Criteria
- [ ] Renders cleanly at `1920x1080` (`16:9`) with high-contrast typography legible from 30 feet away.
- [ ] Displays the 6 required stage KPIs: Participants Joined, Profiles Analyzed, Opportunities Evaluated, Proposals Generated, Mutual Introductions Approved, and Active Agent Operations.
- [ ] Spawns a new node within `< 1.5s` of `participant.registered` and transitions node styling through `fetching_github` → `analyzing_profile` → `ready`.
- [ ] Draws distinct edge styles for `candidate` (dashed), `proposed` (pulsing directional amber), and `completed` (glowing emerald thread).
- [ ] Enforces pseudonymous labels (`Thread-XXXX`) by default; shows GitHub handle/avatar only when `public_display_consent === true` (and supports pressing `S` to force 100% pseudonymity).

## 6. Test Requirements
- Component and state-reducer tests verifying event replay into graph state, node removal on `participant.withdrawn`, and pseudonymity enforcement.

## 7. Security & Privacy Considerations
- Never render unconsented handles, private messages, or raw model chains-of-thought on `/stage`.

## 8. Expected Demonstration Impact
Completes the visual centerpiece of **Minimum Success (`M1`)**: a living, breathing network graph on the big screen that reacts immediately when anyone scans the QR code.
# [feature] A-011: Activity and spotlight visualization

- **Issue ID:** `A-011`
- **Priority:** `P1`
- **Assigned Lane:** `Ariadne-Lane-D` (Builder D)
- **Milestone:** `Wave 2 — Strong Success (v0.2.0-m2)`
- **Dependencies:** `A-007`, `A-009`, `A-010`

## 1. Description
Extend the `/stage` visualizer with **Mode 2: Activity Mode** (structured real-time matrix of Profile Research, Opportunity Discovery, and Match Evaluation agent operations) and **Mode 3: Spotlight Mode** (stage-wide deep dive into a selected match pair showing their 4-factor score bars, complementary skills, cited repository count, suggested first collaboration, and introduction status), plus hands-free `Auto-Cycle` mode (`Space`).

## 2. Rationale
While Network Mode shows the macro graph, judges and attendees also need to see the *depth* of Ariadne's evidence-backed reasoning on the big screen without peering at a small phone display.

## 3. Dependencies
- Depends on `A-007` (evaluated match payload), `A-009` (SSE event stream), and `A-010` (`/stage` layout shell).

## 4. Implementation Boundaries
- **In Scope:** `src/components/stage/ActivityMatrix.tsx`, `src/components/stage/SpotlightView.tsx`, `GET /api/stage/spotlight` (sanitized top matches for stage cycling), and operator keyboard controls (`2`, `3`, `N`, `P`, `Space`).
- **Out of Scope:** Participant mobile views (`A-008`) or Discord bot interactions (`A-013`).

## 5. Acceptance Criteria
- [ ] **Activity Mode (`2`)** displays verifiable agent task completions (`github.fetch.completed`, `profile.analysis.completed`, `opportunity.identified`, `match.evaluated`) with execution timing and evidence counts—never simulated reasoning.
- [ ] **Spotlight Mode (`3`)** renders a selected match pair side-by-side with their 4-dimension score breakdown bars, sanitized collaboration explanation, suggested first conversation, and live introduction status badge.
- [ ] Stage operator can cycle through real matches using `N` / `P` or enable hands-free mode rotation via `Space`.

## 6. Test Requirements
- Unit and component tests verifying Spotlight sanitization (pseudonymous unless consented), keyboard navigation (`1`/`2`/`3`/`N`/`P`/`Space`), and graceful rendering when 0 matches exist yet.

## 7. Security & Privacy Considerations
- `GET /api/stage/spotlight` strips all unconsented identities and private contact details before returning data to the stage client.

## 8. Expected Demonstration Impact
Gives the Operator a high-impact judging presentation tool: press `3` on the stage laptop to spotlight a real match made at the event and walk the judges through the exact evidence and scoring breakdown.
# [feature] A-012: Web-native mutual-introduction workflow & private intro room

- **Issue ID:** `A-012`
- **Priority:** `P0`
- **Assigned Lane & Car:** `Ariadne-Lane-A` (`Car 2-A`)
- **Milestone / Train:** `Train 2 — End-to-End Integration & Mutual Intros (v0.3.0)`
- **Dependencies:** `A-008`

## 1. Description
Implement the web-only bilateral mutual-introduction state machine (`POST /api/matches/:id/decision`), GitHub ownership verification gate (`ownership_verified === true` via 1-click GitHub OAuth or bio challenge), private incoming-interest notification banner on `/me`, and the unlocked **Private Web Introduction Room** (`/me/matches/:id`) when both participants click `Interested`.

## 2. Rationale
Per the Web-Only Hackathon MVP Amendment, all participant introductions happen directly inside the Ariadne mobile web interface without requiring Discord or external bots. No contact information may be disclosed and no introduction may fire without verified bilateral approval.

## 3. Dependencies
- Depends on `A-008` (Match Cards UI and isolated participant session).

## 4. Implementation Boundaries
- **In Scope:** `src/lib/intros/state-machine.ts`, `src/app/api/matches/[id]/decision/route.ts`, `src/app/api/matches/[id]/room/route.ts`, `src/app/me/matches/[id]/page.tsx`, ownership verification prompt modal, and emission of `introduction.proposed`, `introduction.accepted`, `introduction.declined`, and `introduction.completed` (`channel: 'web'`).
- **Out of Scope:** External Discord/Medusa bot integrations (deferred to post-hackathon roadmap).

## 5. Acceptance Criteria
- [ ] Clicking `Interested` requires `ownership_verified === true` (prompts 1-click GitHub OAuth or GitHub bio challenge token check if not yet verified).
- [ ] Transitions match state deterministically (`candidate` → `proposed_by_a/b` → `mutual_accepted` → `completed`, or `declined`).
- [ ] Repeated clicks or retries are strictly idempotent and never produce duplicate events or duplicate introductions.
- [ ] Once `completed`, both participants unlock the **Private Web Introduction Room** (`/me/matches/:id`) displaying verified GitHub links, optional `contact_card` notes, cited repositories, copyable starter prompt, and a shared icebreaker message box.

## 6. Test Requirements
- State-machine and API concurrency/idempotency tests verifying: (a) unverified users cannot trigger outbound proposals (`403`), (b) unilateral interest does not reveal counterpart contact info, (c) bilateral interest unlocks `/me/matches/:id` and emits `introduction.completed` exactly once, and (d) `Pass` transitions to `declined` without leaking rejection alerts.

## 7. Security & Privacy Considerations
- Enforce strict row-level authorization: only `participant_a` or `participant_b` of that specific match can call `POST /api/matches/:id/decision` or access `/me/matches/:id`.

## 8. Expected Demonstration Impact
Delivers **Exceptional Success (`M3`)** entirely in the mobile browser: two consenting attendees tap `Interested` on their phones, unlock their private Web Introduction Room, and trigger a glowing emerald connection on the 16:9 stage visualizer.
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
# [feature] A-016: In-process async job worker & continuous rematching

- **Issue ID:** `A-016`
- **Priority:** `P1`
- **Assigned Lane & Car:** `Ariadne-Lane-C` (`Car 2-C`)
- **Milestone / Train:** `Train 2 — End-to-End Integration & Mutual Intros (v0.3.0)`
- **Dependencies:** `A-006`, `A-007`

## 1. Description
Implement the SQLite-backed in-process asynchronous job runner (`src/lib/jobs/runner.ts`) that orchestrates the end-to-end pipeline (`github.fetch` → `profile-research` → `opportunity-discovery` → `match-scoring` → `proposal-writer` → `SSE event emission`) and implements continuous rematching (`src/lib/scoring/rematcher.ts`) so existing participants automatically receive updated top-3 matches as new attendees join.

## 2. Rationale
Early event arrivers initially see a small pool. Continuous rematching inside the SQLite async worker ensures early participants automatically get high-value matches as additional attendees scan the QR code, without blocking HTTP onboarding requests.

## 3. Dependencies
- Depends on `A-003`..`A-007` and `A-009`.

## 4. Implementation Boundaries
- **In Scope:** `src/lib/jobs/runner.ts`, `src/lib/scoring/rematcher.ts`, `src/app/api/worker/tick/route.ts`, preservation of acted-upon (`proposed`/`accepted`/`declined`) matches, and `changelog.d/A-016.md`.
- **Out of Scope:** Modifying frozen `src/contracts/*`.

## 5. Acceptance Criteria
- [ ] Enqueued participant onboarding jobs execute asynchronously in the background worker (`< 15ms` HTTP response on `POST /api/participants`) and recover stalled leases automatically on server restart.
- [ ] When Participant $N$ reaches `ready`, `rematcher` evaluates Participant $N$ against all active `ready` participants deterministically.
- [ ] Triggers `A-007` explanation generation **only** when Participant $N$ enters an existing participant's top-3 slate (`score >= 45`).
- [ ] Never overwrites or resets a match where either participant has already clicked `Interested` or `Pass`.

## 6. Test Requirements
- Unit/integration tests verifying: (1) async job queue execution & lease recovery, (2) early participant with 0 matches receives a match when a compatible 2nd participant joins, and (3) acted-upon matches remain untouched.

## 7. Security & Privacy Considerations
- Immediately exclude any participant with `consent_status === 'withdrawn'` from worker and rematching passes.

## 8. Expected Demonstration Impact
Connects all 4 lanes into a seamless, self-driving pipeline that continuously discovers new collaborations as the hackathon room fills up.
# [DEFERRED TO POST-HACKATHON ROADMAP] A-017: Medusa coordination adapter

- **Issue ID:** `A-017`
- **Status:** **DEFERRED — POST-HACKATHON ROADMAP ONLY (Do NOT publish in H-Day MVP sprint)**
- **Superseded By:** **ARIADNE ARCHITECTURE AMENDMENT — WEB-ONLY HACKATHON MVP**

## Summary
Per the Web-Only Hackathon MVP Amendment, no Medusa or Morpheus application dependency is included in the Saturday hackathon MVP. All capability and match evaluations run inside Ariadne's bounded in-process SQLite job worker (`A-004`–`A-007`, `A-016`).

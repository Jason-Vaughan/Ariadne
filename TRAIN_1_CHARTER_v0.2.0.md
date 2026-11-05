# Ariadne Sprint Charter `ARI-T1` v1.0 — `v0.2.0: Parallel Core Engine & 16:9 Stage Visualizer` (`Train 1`)

- **Charter ID:** `ARI-T1 v1.0`
- **Target Release:** `v0.2.0` (`Milestone M1: Train 1 — Parallel Core Engine & Stage Graph`)
- **Scheduled Window:** Saturday, November 7, 2026 · `10:15 AM – 12:00 PM PST` (`1 hour 45 minutes`)
- **Base Commit (`origin/main`):** `tag: v0.1.0` (frozen `src/contracts/*` and `src/db/schema.ts`)
- **Sprint Coordinator:** `Ariadne-PM` (`#149`, `ariadne-pm-db0f895f`)
- **Architect & A-Gate Reviewer:** `Ariadne-Arc`
- **Sole Release & Merge Integrator:** `Ariadne-INT`
- **I-Gate Reviewer:** `Ariadne-PRR`
- **Observer & O-Gate / Sprint Report Producer:** `Ariadne-Obsr`
- **Parallel Builder Lanes:** `Ariadne-Lane-A`, `Ariadne-Lane-B`, `Ariadne-Lane-C`, `Ariadne-Lane-D` (Claude Code Sonnet)
- **Reporting Standard:** `SPRINT_REPORT_STANDARD.md v2.0.0`

---

## 1. Executive Summary & Bundling Strategy (`Rule #294`)

Because `Train 0` (`v0.1.0`) freezes `src/contracts/*` and `src/db/schema.ts`, `Train 1` (`v0.2.0`) dispatches **all 4 Builder lanes (`Lane-A`, `Lane-B`, `Lane-C`, `Lane-D`) simultaneously** across **4 strictly file-disjoint Multi-Issue Cars (`Car 1-A`, `Car 1-B`, `Car 1-C`, `Car 1-D`)**.
This lands **10 of the 15 MVP issues in a single parallel wave by 12:00 PM PST** with `0` overlapping product files and `0` cross-lane rebase waits.

---

## 2. Wave 1 Feature Cars (`10` Issues — `100%` File-Disjoint Across 4 Lanes)

### `Car 1-A` (`W1-A`): Mobile QR Onboarding, Explicit Consent, Withdrawal & Participant Results Shell
- **Covered Issues (`2`):**
  1. **`A-002`**: `[feature] Mobile QR onboarding, consent & session isolation`
     - Implement `/join` mobile intake, GitHub username/URL normalization, mandatory consent checkbox, optional public stage-display toggle (default `false`), signed `HttpOnly` session cookie, `POST /api/participants`, `DELETE /api/participants/me` one-click withdrawal, and 1-click GitHub OAuth / bio challenge endpoint (`/api/auth/github/*`).
  2. **`A-008` (Slice 1 — UI Shell)**: `[feature] Mobile participant profile & top-3 match results interface (UI Shell & Fixture Wiring)`
     - Implement `/me` mobile dashboard shell, progressive research status checklist, `CapabilityBadgeList.tsx`, and `MatchCard.tsx` rendering the 7 required match fields against `src/contracts/*`.
- **Builder Lane:** `Ariadne-Lane-A`
- **I-Gate Reviewer:** `Ariadne-PRR`
- **A-Gate Reviewer:** `Ariadne-Arc`
- **Branch Name:** `feat/a002-a008-mobile-onboarding-and-results-shell`
- **Exclusive File Write Envelope (`Car 1-A`):**
  - `src/app/page.tsx`
  - `src/app/join/page.tsx`
  - `src/app/me/page.tsx`
  - `src/components/mobile/CapabilityBadgeList.tsx`
  - `src/components/mobile/MatchCard.tsx`
  - `src/components/mobile/ConsentForm.tsx`
  - `src/app/api/participants/route.ts`
  - `src/app/api/participants/me/route.ts`
  - `src/app/api/auth/github/route.ts`
  - `src/app/api/auth/github/callback/route.ts`
  - `src/lib/auth/session.ts`
  - `changelog.d/A-002-008-shell.md`
  - `tests/train1/car1a-onboarding-and-mobile-ui.test.ts`

---

### `Car 1-B` (`W1-B`): Bounded GitHub Public-Data Connector, Capability Analysis Agent & Opportunity Discovery Agent
- **Covered Issues (`3`):**
  1. **`A-003`**: `[feature] Bounded GitHub public-data connector & SQLite snapshot cache`
     - Implement single-query GraphQL + bounded REST fallback fetcher (`<= 10s` timeout), 30-minute SQLite snapshot cache (`github_snapshots`), untrusted HTML/markdown sanitizer, and `EvidenceReceipt[]` normalizer.
  2. **`A-004`**: `[feature] Evidence-backed capability analysis agent`
     - Implement `runProfileResearchAgent()` + deterministic fallback extractor producing `CapabilityClaim[]` (`OBSERVED_FACT` vs `AI_INFERENCE`) with closed-world `EvidenceReceipt` citation verification.
  3. **`A-005`**: `[feature] Opportunity and bottleneck discovery agent`
     - Implement `runOpportunityDiscoveryAgent()` identifying candidate `OpportunityNeed[]` items labeled `'Potential Opportunity (AI Inference)'`, with automatic stale-issue caveats (`> 120 days`).
- **Builder Lane:** `Ariadne-Lane-B`
- **I-Gate Reviewer:** `Ariadne-PRR`
- **A-Gate Reviewer:** `Ariadne-Arc`
- **Branch Name:** `feat/a003-a004-a005-github-connector-and-profile-agents`
- **Exclusive File Write Envelope (`Car 1-B`):**
  - `src/lib/github/client.ts`
  - `src/lib/github/normalizer.ts`
  - `src/lib/github/sanitizer.ts`
  - `src/lib/agents/profile-research.ts`
  - `src/lib/agents/opportunity-discovery.ts`
  - `src/lib/governance/citation-verifier.ts`
  - `changelog.d/A-003-004-005.md`
  - `tests/train1/car1b-github-and-intelligence-agents.test.ts`

---

### `Car 1-C` (`W1-C`): Deterministic 4-Factor Match Scoring Engine (`40/30/20/10`) & Match Proposal Agent
- **Covered Issues (`2`):**
  1. **`A-006`**: `[feature] Deterministic 4-factor match scoring engine (40/30/20/10)`
     - Implement `scoreParticipantPair()` and `rankTopMatchesForParticipant()` enforcing the 40% Complementarity / 30% Domain / 20% Evidence / 10% Recency weights, stale-issue discounting, dismissed-inference exclusion, and `score >= 45` threshold (never padding results).
  2. **`A-007`**: `[feature] Match research and proposal explanation agent`
     - Implement `runMatchEvaluationAgent()` and `runIntroductionAgent()` (plus deterministic template fallback) generating all 7 required `MatchProposal` explanation fields and verifying cross-participant evidence citations.
- **Builder Lane:** `Ariadne-Lane-C`
- **I-Gate Reviewer:** `Ariadne-PRR`
- **A-Gate Reviewer:** `Ariadne-Arc`
- **Branch Name:** `feat/a006-a007-match-scoring-and-proposal-agent`
- **Exclusive File Write Envelope (`Car 1-C`):**
  - `src/lib/scoring/engine.ts`
  - `src/lib/scoring/subscores.ts`
  - `src/lib/agents/match-evaluator.ts`
  - `src/lib/agents/intro-writer.ts`
  - `changelog.d/A-006-007.md`
  - `tests/train1/car1c-scoring-and-proposals.test.ts`

---

### `Car 1-D` (`W1-D`): SQLite Event Bus (`SSE` + Polling Fallback) & 16:9 Presentation Visualizer (Network, Activity & Spotlight Modes)
- **Covered Issues (`3`):**
  1. **`A-009`**: `[feature] SQLite append-only live event stream (SSE + polling fallback)`
     - Implement `publishDomainEvent()`, public-payload privacy sanitizer, `GET /api/events/stream` (SSE with `Last-Event-ID`), `GET /api/events/poll?after=<seq_id>` fallback, and `GET /api/events/summary`.
  2. **`A-010`**: `[feature] 16:9 Presentation Visualizer — Network Mode & KPI ribbon`
     - Implement `/stage` `1920x1080` shell, 6-KPI top ribbon, QR join banner, pseudonymous node/edge force graph (`NetworkGraph.tsx`), and keyboard shortcuts (`1/2/3/Space/N/P/S`).
  3. **`A-011`**: `[feature] 16:9 Presentation Visualizer — Activity & Spotlight modes`
     - Implement **Activity Mode (`2`)** live agent event matrix (`ActivityMatrix.tsx`) and **Spotlight Mode (`3`)** side-by-side match breakdown view (`SpotlightView.tsx` + `GET /api/stage/spotlight`).
- **Builder Lane:** `Ariadne-Lane-D`
- **I-Gate Reviewer:** `Ariadne-PRR`
- **A-Gate Reviewer:** `Ariadne-Arc`
- **Branch Name:** `feat/a009-a010-a011-event-bus-and-stage-visualizer`
- **Exclusive File Write Envelope (`Car 1-D`):**
  - `src/lib/events/publisher.ts`
  - `src/lib/events/sanitizer.ts`
  - `src/app/api/events/stream/route.ts`
  - `src/app/api/events/poll/route.ts`
  - `src/app/api/events/summary/route.ts`
  - `src/app/api/stage/spotlight/route.ts`
  - `src/app/stage/page.tsx`
  - `src/components/stage/KpiRibbon.tsx`
  - `src/components/stage/QrJoinBanner.tsx`
  - `src/components/stage/NetworkGraph.tsx`
  - `src/components/stage/ActivityMatrix.tsx`
  - `src/components/stage/SpotlightView.tsx`
  - `changelog.d/A-009-010-011.md`
  - `tests/train1/car1d-events-and-stage-visualizer.test.ts`

---

## 3. Release Cut & Gate Exit Criteria (`v0.2.0` — Target `12:00 PM PST`)

1. **`R-Gate` (`Ariadne-PRR`) & `A-Gate` (`Ariadne-Arc`):** Verify all 4 Cars respect their exclusive file envelopes, pass all unit tests (including `TC-SCORE-01..05` in `Car 1-C`), and enforce default stage pseudonymity (`Thread-XXXX`).
2. **`I-Gate` (`Ariadne-INT`):** Merge `Car 1-A..D` via `gh pr merge --merge`, compile `changelog.d/*.md` into `CHANGELOG.md`, take pre-cutover SQLite backup, tag `v0.2.0`, reload `127.0.0.1:3420`, and record durable Chunk-Boundary receipts (`#1889`).
3. **`O-Gate` (`Ariadne-Obsr`):** Certify `v0.2.0` metrics (`t1..t8`) and publish `/reports/v0.2.0/index.html` + update `/reports/index.html`.

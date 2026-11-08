# Ariadne Sprint Charter `ARI-T2` v1.0 — `v0.3.0: End-to-End Async Pipeline, Web Mutual Intros & Continuous Rematching` (`Train 2`)

- **Charter ID:** `ARI-T2 v1.0`
- **Target Release:** `v0.3.0` (`Milestone M2/M3: Train 2 — End-to-End Integration, Mutual Intros & Rematching`)
- **Scheduled Window:** Saturday, November 7, 2026 · `12:00 PM – 13:45 PM PST` (`1 hour 45 minutes`)
- **Base Commit (`origin/main`):** `tag: v0.2.0`
- **Sprint Coordinator:** `Ariadne-PM` (`#149`, `ariadne-pm-db0f895f`)
- **Architect & A-Gate Reviewer:** `Ariadne-Arc`
- **Sole Release & Merge Integrator:** `Ariadne-INT`
- **I-Gate Reviewer:** `Ariadne-PRR`
- **Observer & O-Gate / Sprint Report Producer:** `Ariadne-Obsr`
- **Parallel Builder Lanes:** `Ariadne-Lane-A`, `Ariadne-Lane-C`, `Ariadne-Lane-D` (with `Ariadne-Lane-B` on standby for any GitHub edge-case refinement)
- **Reporting Standard:** `SPRINT_REPORT_STANDARD.md v2.0.0`

---

## 1. Executive Summary & Bundling Strategy

With all core domain modules (`Car 1-A..D`) merged in `v0.2.0` at noon, `Train 2` (`v0.3.0`) wires the complete end-to-end asynchronous pipeline and bilateral Web Introduction Room across **3 file-disjoint Cars (`Car 2-A`, `Car 2-C`, `Car 2-D`)**.
Completing `v0.3.0` by **`13:45 PM PST`** achieves **Minimum, Strong, and Exceptional Success (`M1` + `M2` + `M3`)** with more than **4 full hours remaining** before judging!

---

## 2. Wave 1 Feature Cars (`3` Parallel File-Disjoint Cars)

### `Car 2-A` (`W2-A`): Live Match Results API, Ownership Verification Gate & Private Web Mutual-Introduction Room
- **Covered Issues (`2`):**
  1. **`A-008` (Slice 2 — Live Wiring)**: `[feature] Mobile participant profile & top-3 match results interface (Live DB & Dismissal Wiring)`
     - Wire `GET /api/matches` and `POST /api/participants/me/claims/:id/dismiss` (allowing a participant to dismiss an inaccurate AI inference and trigger instant score recalculation).
  2. **`A-012`**: `[feature] Web-native mutual-introduction workflow & private intro room`
     - Implement `POST /api/matches/[id]/decision` (`Interested` / `Pass`), enforce `ownership_verified === true` gate (prompting 1-click GitHub OAuth or bio challenge modal if unverified), and build the unlocked **Private Web Introduction Room** (`/me/matches/[id]/page.tsx` + `POST /api/matches/[id]/room`) with verified GitHub handles, shared `contact_card` notes, copyable starter prompt, and shared icebreaker note box.
- **Builder Lane:** `Ariadne-Lane-A`
- **I-Gate Reviewer:** `Ariadne-PRR`
- **A-Gate Reviewer:** `Ariadne-Arc`
- **Branch Name:** `feat/a008-a012-live-matches-and-web-mutual-intros`
- **Exclusive File Write Envelope (`Car 2-A`):**
  - `src/app/me/page.tsx`
  - `src/app/me/matches/[id]/page.tsx`
  - `src/components/mobile/MatchCard.tsx`
  - `src/components/mobile/OwnershipVerifyModal.tsx`
  - `src/app/api/matches/route.ts`
  - `src/app/api/matches/[id]/decision/route.ts`
  - `src/app/api/matches/[id]/room/route.ts`
  - `src/app/api/participants/me/claims/[id]/dismiss/route.ts`
  - `src/lib/intros/state-machine.ts`
  - `changelog.d/A-008-012.md`
  - `tests/train2/car2a-mutual-intros-and-live-matches.test.ts`

---

### `Car 2-C` (`W2-C`): SQLite In-Process Async Worker Pipeline & Continuous Rematching Engine
- **Covered Issues (`1` + Pipeline Orchestration):**
  1. **`A-016`**: `[feature] In-process async job worker & continuous rematching`
     - Implement `src/lib/jobs/runner.ts` (`enqueueAnalysisJob`, `processNextJob`, stalled-lease recovery) connecting `Car 1-B` (`fetchGitHubSnapshot` → `runProfileResearchAgent` → `runOpportunityDiscoveryAgent`), `Car 1-C` (`rankTopMatchesForParticipant` → `runMatchEvaluationAgent` → `runIntroductionAgent`), and `Car 1-D` (`publishDomainEvent`).
     - Implement `src/lib/scoring/rematcher.ts` so that whenever a new participant completes profile analysis, existing `ready` participants automatically have their top-3 candidates re-evaluated (without touching any already `proposed`/`accepted`/`declined` match).
- **Builder Lane:** `Ariadne-Lane-C`
- **I-Gate Reviewer:** `Ariadne-PRR`
- **A-Gate Reviewer:** `Ariadne-Arc`
- **Branch Name:** `feat/a016-async-worker-and-continuous-rematching`
- **Exclusive File Write Envelope (`Car 2-C`):**
  - `src/lib/jobs/runner.ts`
  - `src/lib/scoring/rematcher.ts`
  - `src/app/api/worker/tick/route.ts`
  - `changelog.d/A-016.md`
  - `tests/train2/car2c-worker-and-rematcher.test.ts`

---

### `Car 2-D` (`W2-D`): 16:9 Stage Bilateral Connection Animations, Strict Pseudonymity Hotkey & Judge Reports HUD
- **Covered Scope:**
  - Enhance `/stage` (`NetworkGraph.tsx`, `SpotlightView.tsx`, `KpiRibbon.tsx`) with live animated edge transitions on `introduction.proposed` and `introduction.completed`, verify global pseudonymity override hotkey (`S`), and add a stage footer link/shortcut (`R`) to open the Interactive Sprint Reports Hub (`/reports/`).
- **Builder Lane:** `Ariadne-Lane-D`
- **I-Gate Reviewer:** `Ariadne-PRR`
- **A-Gate Reviewer:** `Ariadne-Arc`
- **Branch Name:** `feat/stage-bilateral-intro-animations-and-judge-hud`
- **Exclusive File Write Envelope (`Car 2-D`):**
  - `src/app/stage/page.tsx`
  - `src/components/stage/NetworkGraph.tsx`
  - `src/components/stage/SpotlightView.tsx`
  - `src/components/stage/KpiRibbon.tsx`
  - `changelog.d/Car-2D-stage-hud.md`
  - `tests/train2/car2d-stage-animations-and-privacy.test.ts`

---

## 3. Release Cut & Gate Exit Criteria (`v0.3.0` — Target `13:45 PM PST`)

1. **`R-Gate` (`Ariadne-PRR`) & `A-Gate` (`Ariadne-Arc`):** Verify bilateral consent invariant (unverified or unilateral requests never leak contact cards) and end-to-end worker pipeline test suite passes.
2. **`I-Gate` (`Ariadne-INT`):** Merge `Car 2-A`, `Car 2-C`, `Car 2-D` via `gh pr merge --merge`, compile `changelog.d/*.md` into `CHANGELOG.md`, take pre-cutover SQLite backup, tag `v0.3.0`, reload `127.0.0.1:3420`.
3. **`O-Gate` (`Ariadne-Obsr`):** Certify `v0.3.0` metrics (`t1..t8`) and publish `/reports/v0.3.0/index.html` + update `/reports/index.html`.

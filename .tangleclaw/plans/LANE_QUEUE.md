# Ariadne Fleet Dispatch Queue (`LANE_QUEUE.md`)

**Project:** `ARIADNE-HACK-2026` (*Find Your Thread.*)  
**PM Coordinator:** `Ariadne-PM` (`projectId: 149`, Medusa ID: `ariadne-pm-db0f895f`)  
**Published Interactive Roadmap:** [ARIADNE_ROADMAP.md](https://cursatory.tail123678.ts.net:8443/plans/149/ARIADNE_ROADMAP.md)  
**Sorting Methodology:** `TC-Lane-PM` Pairwise Disjoint File-Envelope Algorithm (`Envelope(A) ∩ Envelope(B) = ∅`) — **100% Solo-Issue Parallel Waves (`1 Issue = 1 Builder Lane = 1 PR`), Zero Shared-File Collisions**  
**Authorization Gate:** **STAGED — DO NOT DISPATCH BEFORE SATURDAY NOV 7, 2026 @ `09:30 AM PST` OPERATOR `GO`**

---

## 1. File-Collision Matrix & Wave Assignment Summary

By auditing every issue's predicted file touch-surface (`Envelope(i)`) and sequencing shared-subsystem issues across consecutive versions (`v0.1.0` → `v0.2.0` → `v0.3.0` → `v0.4.0`), **every issue in the 15-issue MVP runs as a pure 1-Issue Solo Parallel Dispatch (`1 Issue = 1 Builder Lane = 1 PR`) with zero multi-issue Cars needed**:

| Subsystem / Directory Surface | `v0.1.0` (`09:30–10:05`) | `v0.2.0` (`10:05–11:00`) | `v0.3.0` (`11:00–12:00`) | `v0.4.0` (`12:00–13:00`) | `v1.0.0` (`13:00–17:45`) |
|---|---|---|---|---|---|
| **Contracts / Onboarding / Mobile UI** (`src/contracts/*`, `public/app/*`) | **`A-001` (`#1`)** · `Lane-A`<br>`src/contracts/*`, `src/db/schema.sql` | **`A-002` (`#2`)** · `Lane-A`<br>`src/routes/onboarding.ts`, `public/app/join.*` | **`A-008` (`#8`)** · `Lane-A`<br>`public/app/me.*`, `src/routes/me.ts` | **`A-012` (`#12`)** · `Lane-A`<br>`src/routes/introductions.ts`, `public/app/intro-room.js` | Live QR Dogfooding & Mobile Polish (`Lane-A`) |
| **Server / GitHub / Intelligence AI** (`src/server.ts`, `src/github/*`, `src/intelligence/*`) | **`A-014` (`#14` S1)** · `Lane-B`<br>`src/server.ts`, `src/db/client.ts`, `scripts/tunnel.sh` | **`A-003` (`#3`)** · `Lane-B`<br>`src/github/connector.ts`, `src/github/cache.ts` | **`A-004` (`#4`)** · `Lane-B`<br>`src/intelligence/capability-agent.ts` | **`A-005` (`#5`)** · `Lane-B`<br>`src/intelligence/opportunity-agent.ts` | Rate-Limit & Cache Hardening (`Lane-B`) |
| **Event Bus / Matching / Worker** (`src/events/*`, `src/matching/*`, `src/worker/*`) | **`A-009` (`#9`)** · `Lane-C`<br>`src/events/bus.ts`, `src/routes/events.ts` | **`A-006` (`#6`)** · `Lane-C`<br>`src/matching/scorer.ts` (`40/30/20/10`) | **`A-007` (`#7`)** · `Lane-C`<br>`src/matching/explanation-agent.ts` | **`A-016` (`#16`)** · `Lane-C`<br>`src/worker/job-runner.ts`, `data/golden-seed-24.json` | Match Tuning & Seed Verification (`Lane-C`) |
| **Reports / 16:9 Stage Visualizer** (`public/reports/*`, `public/stage/*`) | **`A-015` (`#15` S1)** · `Lane-D`<br>`public/reports/*`, `public/roadmap/*` | **`A-010` (`#10`)** · `Lane-D`<br>`public/stage/network-graph.js`, `src/routes/stage-snapshot.ts` | **`A-011` (`#11`)** · `Lane-D`<br>`public/stage/spotlight.js`, `public/stage/activity-feed.js` | Stage Intro Celebrations & HUD Polish (`Lane-D`) | **`A-014` S2 + `A-015` S2** (`INT` + `Obsr`) |
| **Pairwise File Overlap (`∩`)** | **`∅` (`0` shared files)** | **`∅` (`0` shared files)** | **`∅` (`0` shared files)** | **`∅` (`0` shared files)** | **`∅` (`0` shared files)** |

---

## 2. Staged Solo-Issue Dispatch Queue (`v0.1.0` → `v1.0.0`)

| Wave / Version | Issue | Target Lane | Branch Name | Exclusive File Envelope | Status | `R-Gate` (`PRR`) | `I-Gate` (`INT`) | `O-Gate` (`Obsr`) |
|---|---|---|---|---|---|---|---|---|
| **`v0.1.0`** (`09:30–10:05`) | **`A-001` (`#1`)** | `Ariadne-Lane-A` | `feat/a-001-contracts-schema` | `src/contracts/*`, `src/db/schema.sql`, `tests/contracts.test.ts` | `STAGED` | Pending | Pending | Pending |
| **`v0.1.0`** (`09:30–10:05`) | **`A-014` (`#14` S1)** | `Ariadne-Lane-B` | `feat/a-014-server-foundation` | `src/server.ts`, `src/db/client.ts`, `src/routes/health.ts`, `scripts/tunnel.sh`, `tests/server.test.ts` | `STAGED` | Pending | Pending | Pending |
| **`v0.1.0`** (`09:30–10:05`) | **`A-009` (`#9`)** | `Ariadne-Lane-C` | `feat/a-009-event-bus-sse` | `src/events/bus.ts`, `src/routes/events.ts`, `tests/events.test.ts` | `STAGED` | Pending | Pending | Pending |
| **`v0.1.0`** (`09:30–10:05`) | **`A-015` (`#15` S1)** | `Ariadne-Lane-D` | `feat/a-015-reports-roadmap-hub` | `public/reports/*`, `public/roadmap/*`, `scripts/build-sprint-report.js`, `tests/reports.test.ts` | `STAGED` | Pending | Pending | Pending |
| **`v0.2.0`** (`10:05–11:00`) | **`A-002` (`#2`)** | `Ariadne-Lane-A` | `feat/a-002-qr-onboarding` | `src/routes/onboarding.ts`, `src/auth/session.ts`, `public/app/join.*`, `tests/onboarding.test.ts` | `STAGED` | Pending | Pending | Pending |
| **`v0.2.0`** (`10:05–11:00`) | **`A-003` (`#3`)** | `Ariadne-Lane-B` | `feat/a-003-github-connector` | `src/github/connector.ts`, `src/github/cache.ts`, `src/github/sanitize.ts`, `tests/github-connector.test.ts` | `STAGED` | Pending | Pending | Pending |
| **`v0.2.0`** (`10:05–11:00`) | **`A-006` (`#6`)** | `Ariadne-Lane-C` | `feat/a-006-match-scorer` | `src/matching/scorer.ts`, `src/matching/anti-clone.ts`, `tests/scorer.test.ts` | `STAGED` | Pending | Pending | Pending |
| **`v0.2.0`** (`10:05–11:00`) | **`A-010` (`#10`)** | `Ariadne-Lane-D` | `feat/a-010-stage-network` | `public/stage/index.html`, `public/stage/network-graph.js`, `public/stage/stage.css`, `src/routes/stage-snapshot.ts`, `tests/stage-snapshot.test.ts` | `STAGED` | Pending | Pending | Pending |
| **`v0.3.0`** (`11:00–12:00`) | **`A-008` (`#8`)** | `Ariadne-Lane-A` | `feat/a-008-mobile-matches-ui` | `public/app/me.html`, `public/app/me.js`, `public/app/app.css`, `src/routes/me.ts`, `tests/me-routes.test.ts` | `STAGED` | Pending | Pending | Pending |
| **`v0.3.0`** (`11:00–12:00`) | **`A-004` (`#4`)** | `Ariadne-Lane-B` | `feat/a-004-capability-agent` | `src/intelligence/capability-agent.ts`, `src/intelligence/prompts.ts`, `tests/capability-agent.test.ts` | `STAGED` | Pending | Pending | Pending |
| **`v0.3.0`** (`11:00–12:00`) | **`A-007` (`#7`)** | `Ariadne-Lane-C` | `feat/a-007-explanation-agent` | `src/matching/explanation-agent.ts`, `src/matching/evidence-formatter.ts`, `tests/explanation-agent.test.ts` | `STAGED` | Pending | Pending | Pending |
| **`v0.3.0`** (`11:00–12:00`) | **`A-011` (`#11`)** | `Ariadne-Lane-D` | `feat/a-011-stage-spotlight` | `public/stage/spotlight.js`, `public/stage/activity-feed.js`, `public/stage/operator-controls.js`, `tests/stage-modes.test.ts` | `STAGED` | Pending | Pending | Pending |
| **`v0.4.0`** (`12:00–13:00`) | **`A-012` (`#12`)** | `Ariadne-Lane-A` | `feat/a-012-mutual-intros` | `src/routes/introductions.ts`, `src/matching/intro-state-machine.ts`, `public/app/intro-room.js`, `tests/introductions.test.ts` | `STAGED` | Pending | Pending | Pending |
| **`v0.4.0`** (`12:00–13:00`) | **`A-005` (`#5`)** | `Ariadne-Lane-B` | `feat/a-005-opportunity-agent` | `src/intelligence/opportunity-agent.ts`, `tests/opportunity-agent.test.ts` | `STAGED` | Pending | Pending | Pending |
| **`v0.4.0`** (`12:00–13:00`) | **`A-016` (`#16`)** | `Ariadne-Lane-C` | `feat/a-016-async-worker` | `src/worker/job-runner.ts`, `src/worker/seed-personas.ts`, `data/golden-seed-24.json`, `tests/worker.test.ts` | `STAGED` | Pending | Pending | Pending |
| **`v1.0.0`** (`13:00–17:45`) | **`A-014` (`#14` S2) + `A-015` (`#15` S2)** | `Ariadne-INT` + `Ariadne-Obsr` | `chore/v1-0-0-release-certification` | `public/reports/v1.0.0.html`, `public/reports/index.html`, `public/roadmap/index.html` | `STAGED` | Pending | Pending | Pending |

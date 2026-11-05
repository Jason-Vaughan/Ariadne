# Ariadne Sprint Charter `ARI-T0` v1.0 — `v0.1.0: Core Contracts, SQLite WAL & Self-Hosted Bootstrap` (`Train 0`)

- **Charter ID:** `ARI-T0 v1.0`
- **Target Release:** `v0.1.0` (`Milestone M0: Train 0 — Contracts, SQLite WAL & Bootstrap`)
- **Scheduled Window:** Saturday, November 7, 2026 · `09:30 – 10:15 AM PST` (`45 minutes` — strictly after Operator `GO`)
- **Base Commit (`origin/main`):** `v0.0.0-planning-baseline`
- **Sprint Coordinator:** `Ariadne-PM` (`#149`, `ariadne-pm-db0f895f`)
- **Architect & A-Gate Reviewer:** `Ariadne-Arc`
- **Sole Release & Merge Integrator:** `Ariadne-INT`
- **I-Gate Reviewer:** `Ariadne-PRR`
- **Observer & O-Gate / Sprint Report Producer:** `Ariadne-Obsr`
- **Reporting Standard:** `SPRINT_REPORT_STANDARD.md v2.0.0` (`metrics_schema.py` + `validate-sprint-report.py`)

---

## 1. Executive Summary & Bundling Strategy

`v0.1.0` (`Train 0`) establishes the **immutable contract and persistence spine** of Ariadne during the first 45 minutes of the hackathon (`09:30 – 10:15 AM PST`).
Once `Car 0-INT` merges and `v0.1.0` is tagged:
1. `src/contracts/*`, `src/db/schema.ts`, and `package.json` are **FROZEN** for `Train 1` (`v0.2.0`).
2. All 4 Builder lanes (`Ariadne-Lane-A`, `Ariadne-Lane-B`, `Ariadne-Lane-C`, `Ariadne-Lane-D`) branch off `v0.1.0` into isolated Git worktrees and build **10 issues simultaneously in a single parallel wave** against deterministic contract fixtures with `0` file collisions.

---

## 2. Train 0 Feature Car (`3` Issues — Single Foundation Car)

### `Car 0-INT` (`W0-INT`): Core TypeScript/Zod Contracts, SQLite WAL Schema, Self-Hosted `:3420` Bootstrap & Initial Provenance Ledger
- **Covered Issues (`3`):**
  1. **`A-001`**: `[feature] Core architecture, SQLite WAL schema & data/event contracts`
     - Implement and export all frozen TypeScript interfaces and runtime Zod schemas in `src/contracts/*` (`Participant`, `EvidenceReceipt`, `CapabilityClaim`, `OpportunityNeed`, `MatchProposal`, `ScoreBreakdown`, `PublicEventEnvelope`, `EventType`, `canTransitionIntroState`).
     - Implement SQLite (`WAL` mode) database client and schema initializer (`src/db/client.ts`, `src/db/schema.ts`) creating tables: `participants`, `github_snapshots`, `evidence_receipts`, `capability_claims`, `opportunity_needs`, `matches`, `domain_events`, and `async_jobs`.
  2. **`A-014` (Slice 1)**: `[chore] Self-hosted server (:3420), SQLite WAL, narrow HTTPS tunnel & resilience (Bootstrap Slice)`
     - Register PortHub lease for `127.0.0.1:3420` (`loopback`), implement `GET /api/health` reporting SQLite WAL readiness and queue depth, and verify the narrow public HTTPS tunnel (`cloudflared` / `ngrok` targeting `http://127.0.0.1:3420` only).
  3. **`A-015` (Slice 1)**: `[docs] Hackathon provenance & Per-Version v2.0.0 Interactive Sprint Reports (Baseline Slice)`
     - Commit `docs/provenance/PRE_EVENT_MANIFEST.sha256`, initialize `scripts/gen_sprint_report.py` (`v2.0.0` standard), and mount `/reports` and `/provenance` static/route handlers.
- **Builder / Executor Lane:** `Ariadne-INT`
- **I-Gate Reviewer:** `Ariadne-PRR`
- **A-Gate Reviewer:** `Ariadne-Arc`
- **Branch Name:** `feat/a001-a014-a015-contracts-sqlite-bootstrap`
- **Exclusive File Write Envelope (`Car 0-INT`):**
  - `package.json`
  - `tsconfig.json`
  - `vitest.config.ts`
  - `src/contracts/index.ts`
  - `src/contracts/entities.ts`
  - `src/contracts/events.ts`
  - `src/contracts/state-machine.ts`
  - `src/contracts/fixtures.ts`
  - `src/db/client.ts`
  - `src/db/schema.ts`
  - `src/app/api/health/route.ts`
  - `src/app/provenance/page.tsx`
  - `src/app/reports/route.ts`
  - `scripts/gen_sprint_report.py`
  - `docs/provenance/PROVENANCE_LEDGER.md`
  - `changelog.d/A-001-014-015.md`
  - `tests/train0/contracts-and-sqlite.test.ts`

---

## 3. Release Cut & Gate Exit Criteria (`v0.1.0` — Target `10:15 AM PST`)

1. **`R-Gate` (`Ariadne-PRR`) & `A-Gate` (`Ariadne-Arc`):** Verify all entities and event envelopes in `src/contracts/*` match `DATA_AND_EVENTS_CONTRACT.md` and `tests/train0/contracts-and-sqlite.test.ts` passes (`100%` green).
2. **`I-Gate` (`Ariadne-INT`):** Merge `Car 0-INT` via `gh pr merge --merge`, compile `changelog.d/A-001-014-015.md` into `CHANGELOG.md`, tag `v0.1.0`, verify `http://127.0.0.1:3420/api/health` returns `200 OK`, and create worktrees `wt-lane-a`..`d`.
3. **`O-Gate` (`Ariadne-Obsr`):** Record `t1..t8` timestamps for `v0.1.0` and generate `/reports/v0.1.0/index.html` + update `/reports/index.html`.

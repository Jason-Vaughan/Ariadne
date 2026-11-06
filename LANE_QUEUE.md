# Ariadne Fleet Dispatch Queue (`LANE_QUEUE.md`) — `ARIADNE-HACK-2026`

- **Active Project:** `Ariadne-PM` (`#149`, `ariadne-pm-db0f895f`)
- **Current Authorization State:** `PREPARATION ONLY — H-DAY ENGINEERING NOT AUTHORIZED`
- **Governing Rule Proposal:** `Rule #304` (`ARIADNE PM & FLEET GOVERNANCE OVERLAY v1.0`)
- **Master SSOT Index:** [https://cursatory.tail123678.ts.net:8443/plans/149/MASTER_SSOT.md](https://cursatory.tail123678.ts.net:8443/plans/149/MASTER_SSOT.md) (`/Users/jasonvaughan/Documents/Projects/Ariadne-PM/PROJECT_DOCUMENTS.md`)

---

## 1. Active Train & Car Queue (`Staged for Saturday, Nov 7 @ 09:30 AM PST Operator GO`)

| Train / Release | Car ID | Assigned Lane | Bundled Issues | Branch Name | I-Gate / A-Gate | Status |
|---|---|---|---|---|---|---|
| **Train 0 (`v0.1.0`)**<br>`09:30–10:15` | **`Car 0-INT`** | `Ariadne-INT` | `A-001`, `A-014` (S1), `A-015` (S1) | `feat/a001-a014-a015-contracts-sqlite-bootstrap` | `PRR` + `Arc` | `STAGED (Pre-GO)` |
| **Train 1 (`v0.2.0`)**<br>`10:15–12:00` | **`Car 1-A`** | `Ariadne-Lane-A` | `A-002`, `A-008` (Shell) | `feat/a002-a008-mobile-onboarding-and-results-shell` | `PRR` + `Arc` | `STAGED (Wait v0.1.0)` |
| **Train 1 (`v0.2.0`)**<br>`10:15–12:00` | **`Car 1-B`** | `Ariadne-Lane-B` | `A-003`, `A-004`, `A-005` | `feat/a003-a004-a005-github-connector-and-profile-agents` | `PRR` + `Arc` | `STAGED (Wait v0.1.0)` |
| **Train 1 (`v0.2.0`)**<br>`10:15–12:00` | **`Car 1-C`** | `Ariadne-Lane-C` | `A-006`, `A-007` | `feat/a006-a007-match-scoring-and-proposal-agent` | `PRR` + `Arc` | `STAGED (Wait v0.1.0)` |
| **Train 1 (`v0.2.0`)**<br>`10:15–12:00` | **`Car 1-D`** | `Ariadne-Lane-D` | `A-009`, `A-010`, `A-011` | `feat/a009-a010-a011-event-bus-and-stage-visualizer` | `PRR` + `Arc` | `STAGED (Wait v0.1.0)` |
| **Train 2 (`v0.3.0`)**<br>`12:00–13:45` | **`Car 2-A`** | `Ariadne-Lane-A` | `A-008` (Live), `A-012` | `feat/a008-a012-live-matches-and-web-mutual-intros` | `PRR` + `Arc` | `STAGED (Wait v0.2.0)` |
| **Train 2 (`v0.3.0`)**<br>`12:00–13:45` | **`Car 2-C`** | `Ariadne-Lane-C` | `A-016` + Async Worker | `feat/a016-async-worker-and-continuous-rematching` | `PRR` + `Arc` | `STAGED (Wait v0.2.0)` |
| **Train 2 (`v0.3.0`)**<br>`12:00–13:45` | **`Car 2-D`** | `Ariadne-Lane-D` | Stage Intro Animations & HUD | `feat/stage-bilateral-intro-animations-and-judge-hud` | `PRR` + `Arc` | `STAGED (Wait v0.2.0)` |
| **Train 3 (`v1.0.0`)**<br>`13:45–17:45` | **`Car 3-A..D`** | `Lane-A..D` | Live Dogfooding Polish & Bug Fixes | `fix/train3-lane-<x>-polish` | `PRR` | `STAGED (Wait v0.3.0)` |
| **Train 3 (`v1.0.0`)**<br>`13:45–17:45` | **`Car 3-INT`** | `INT` + `Obsr` | `A-014` (S2), `A-015` (S2) | `chore/a014-a015-v100-hardening-and-judge-reports` | `PRR` + `Arc` + `Obsr` | `STAGED (Wait v0.3.0)` |

---

## 2. Chunk-Boundary Receipt Ledger (`#1889`)

*(Populated on H-Day as each Car completes `R-Gate` + `I-Gate` merge before `/clear` and next-Train dispatch.)*

| Train | Car ID | Lane | Merged PR & Commit SHA | Test Receipt | `changelog.d` Fragment | Builder Ack | Boundary Verdict |
|---|---|---|---|---|---|---|---|
| `v0.1.0` | `Car 0-INT` | `Ariadne-INT` | *Pending H-Day* | *Pending* | `changelog.d/A-001-014-015.md` | *Pending* | `PENDING` |
| `v0.2.0` | `Car 1-A` | `Ariadne-Lane-A` | *Pending H-Day* | *Pending* | `changelog.d/A-002-008-shell.md` | *Pending* | `PENDING` |
| `v0.2.0` | `Car 1-B` | `Ariadne-Lane-B` | *Pending H-Day* | *Pending* | `changelog.d/A-003-004-005.md` | *Pending* | `PENDING` |
| `v0.2.0` | `Car 1-C` | `Ariadne-Lane-C` | *Pending H-Day* | *Pending* | `changelog.d/A-006-007.md` | *Pending* | `PENDING` |
| `v0.2.0` | `Car 1-D` | `Ariadne-Lane-D` | *Pending H-Day* | *Pending* | `changelog.d/A-009-010-011.md` | *Pending* | `PENDING` |
| `v0.3.0` | `Car 2-A` | `Ariadne-Lane-A` | *Pending H-Day* | *Pending* | `changelog.d/A-008-012.md` | *Pending* | `PENDING` |
| `v0.3.0` | `Car 2-C` | `Ariadne-Lane-C` | *Pending H-Day* | *Pending* | `changelog.d/A-016.md` | *Pending* | `PENDING` |
| `v0.3.0` | `Car 2-D` | `Ariadne-Lane-D` | *Pending H-Day* | *Pending* | `changelog.d/Car-2D-stage-hud.md` | *Pending* | `PENDING` |

---

## 3. Waiting on the Operator

1. **Approve `Rule #304`** (`ARIADNE PM & FLEET GOVERNANCE OVERLAY v1.0`) in TangleClaw Settings → Project Rules (`projectId: 149`).
2. **Saturday, Nov 7 @ 09:30 AM PST:** Issue explicit `GO — AUTHORIZE ARIADNE H-DAY EXECUTION` to unlock `Train 0`.

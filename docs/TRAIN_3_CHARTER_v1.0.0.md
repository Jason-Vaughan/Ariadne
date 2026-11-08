# Ariadne Sprint Charter `ARI-T3` v1.0 — `v1.0.0: Live Dogfooding, UI Polish, Hardening & Judge Sprint Reports` (`Train 3`)

- **Charter ID:** `ARI-T3 v1.0`
- **Target Release:** `v1.0.0` (`Milestone M4: Train 3 — Polish, Dogfooding & Final Judge Release`)
- **Scheduled Window:** Saturday, November 7, 2026 · `13:45 PM – 17:45 PM PST` (`4.0 hours`)
- **Base Commit (`origin/main`):** `tag: v0.3.0`
- **Sprint Coordinator:** `Ariadne-PM` (`#149`, `ariadne-pm-db0f895f`)
- **Architect & A-Gate Reviewer:** `Ariadne-Arc`
- **Sole Release & Merge Integrator:** `Ariadne-INT`
- **I-Gate Reviewer:** `Ariadne-PRR`
- **Observer & O-Gate / Sprint Report Producer:** `Ariadne-Obsr`
- **Parallel Builder Lanes:** `Ariadne-Lane-A`, `Ariadne-Lane-B`, `Ariadne-Lane-C`, `Ariadne-Lane-D`
- **Reporting Standard:** `SPRINT_REPORT_STANDARD.md v2.0.0` (`validate-sprint-report.py --all`)

---

## 1. Executive Summary & Afternoon Polish Strategy

Because `Train 0` (`v0.1.0`), `Train 1` (`v0.2.0`), and `Train 2` (`v0.3.0`) complete the entire functional MVP before `14:00 PM PST`, `Train 3` (`v1.0.0`) provides **4 full hours (`13:45 – 17:45 PM PST`)** to:
1. Onboard real hackathon attendees via the mobile QR code and observe real-world usage.
2. Dispatch targeted, file-disjoint bug-fix and UX-polish Cars across `Lane-A..D` (mobile responsiveness, match card clarity, 16:9 stage animations).
3. Complete **`Car 3-INT` (`A-014` Slice 2 + `A-015` Slice 2)**: production hardening, synthetic fixture purge, and publication of the final **`v1.0.0` Interactive Sprint Report** plus the **`v0.1.0–v1.0.0` Cumulative Hackathon Retrospective** at `/reports/`.

---

## 2. Train 3 Planned Cars (`13:45 – 17:30 PM PST`)

### `Car 3-A..D` (`W3-POLISH`): Live Dogfooding Bug Fixes & UI Enhancements (Elastic Disjoint Cars)
- **Builder Lanes:** `Ariadne-Lane-A` (Mobile UX polish), `Ariadne-Lane-B` (GitHub edge-case handling), `Ariadne-Lane-C` (Explanation phrasing & scoring calibration), `Ariadne-Lane-D` (16:9 Stage visual polish).
- **I-Gate Reviewer:** `Ariadne-PRR`
- **A-Gate Reviewer:** `Ariadne-Arc`
- **Branch Pattern:** `fix/train3-lane-<a|b|c|d>-polish`
- **Rule:** Every polish Car maintains strict directory ownership (`src/app/me/*` on Lane A, `src/lib/github/*` on Lane B, `src/lib/scoring/*` on Lane C, `src/app/stage/*` on Lane D) and writes `changelog.d/Car-3X-polish.md`.

---

### `Car 3-INT` (`W3-REL`): Production Hardening, Fixture Purge & Final `v2.0.0` Judge Sprint Reports (`A-014` S2 + `A-015` S2)
- **Covered Issues (`2` Final Slices):**
  1. **`A-014` (Slice 2 — Final Hardening)**: `[chore] Self-hosted server (:3420), SQLite WAL, narrow HTTPS tunnel & resilience (Final Hardening)`
     - Purge/hide any internal `[TEST FIXTURE]` rows from `data/ariadne.sqlite` so 100% of stage nodes and matches represent real consenting human participants.
     - Take the final pre-judging atomic SQLite backup (`data/backups/ariadne-v1.0.0-golden.sqlite`) and verify `< 15s` rollback readiness.
  2. **`A-015` (Slice 2 — Final Judge Reports)**: `[docs] Hackathon provenance & Per-Version v2.0.0 Interactive Sprint Reports (Final Release & Retrospective)`
     - Generate `/reports/v1.0.0/index.html`, `/reports/v0.1.0-v1.0.0-retrospective/index.html`, and the updated `/reports/index.html` Hub + Interactive Roadmap Board (`/roadmap/index.html`) showing all 4 Trains (`v0.1.0`..`v1.0.0`), 15 closed MVP issues, `t1..t8` timestamps, and 4-Gate audit tables.
- **Executor Lanes:** `Ariadne-INT` + `Ariadne-Obsr`
- **I-Gate Reviewer:** `Ariadne-PRR`
- **A-Gate Reviewer:** `Ariadne-Arc`
- **Branch Name:** `chore/a014-a015-v100-hardening-and-judge-reports`
- **Exclusive File Write Envelope (`Car 3-INT`):**
  - `docs/provenance/PROVENANCE_LEDGER.md`
  - `public/reports/*`
  - `public/roadmap/*`
  - `scripts/gen_sprint_report.py`
  - `CHANGELOG.md`
  - `package.json`

---

## 3. Hard Demo Freeze (`17:45 PM PST`)

At **`17:45 PM PST`** (15 minutes before the `18:00 PM` judging window):
- `v1.0.0` is tagged and live on `127.0.0.1:3420` behind the narrow public HTTPS tunnel.
- All Builder lanes (`Lane-A..D`) are parked at rest (`safe-to-clear`).
- Zero code mutations or restarts are permitted during `17:45 – 20:00 PM PST` unless the Operator explicitly commands a rollback.

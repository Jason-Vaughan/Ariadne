# Interactive Roadmap Board & Sprint Reports Hub Specification — ARIADNE (`ARIADNE-HACK-2026`)
*Modeled on `TC-Lane-PM` Supplement (`TangleClaw-Shared/roadmap-board/` & `sprint-reports/`)*

> **Pre-Event Compliance Note:** Per Section 0 (*Critical Directive — No Code, UI Pages, or Scripts Before Hackathon Day*), this document specifies the exact structure, data bindings, and reference templates on `cursatory` that `Ariadne-INT` and `Ariadne-Obsr` will instantiate after the Operator's Saturday 09:30 AM PST `GO`.

---

## 1. Host Reference Templates (Verified Present on `cursatory`)

`TC-Lane-PM` provided the following canonical files on this machine for `Ariadne-Obsr` and `Ariadne-INT` to adapt at H-Day kickoff (`Car 0-INT`, `A-015` Slice 1):
1. **Canonical Sprint Reporting Standard (`v2.0.0`):**
   - `/Users/jasonvaughan/Documents/Projects/Shared/TangleClaw-Shared/sprint-reports/SPRINT_REPORT_STANDARD.md`
   - `/Users/jasonvaughan/Documents/Projects/Shared/TangleClaw-Shared/sprint-reports/SPRINT_REPORT_CONTRACT.md`
   - `/Users/jasonvaughan/Documents/Projects/Shared/TangleClaw-Shared/sprint-reports/metrics_schema.py` & `metrics-schema.json`
   - `/Users/jasonvaughan/Documents/Projects/Shared/TangleClaw-Shared/sprint-reports/validate-sprint-report.py`
   - `/Users/jasonvaughan/Documents/Projects/Shared/TangleClaw-Shared/sprint-reports/generators/gen_v5660.py` (Single-Version Report Generator)
   - `/Users/jasonvaughan/Documents/Projects/Shared/TangleClaw-Shared/sprint-reports/generators/gen_v5650_v5660_retro.py` (Multi-Version Train Retrospective Generator)
   - `/Users/jasonvaughan/Documents/Projects/Shared/TangleClaw-Shared/sprint-reports/index.html` (Sprint Reports Hub Index)
2. **Interactive Roadmap Board Reference:**
   - `/Users/jasonvaughan/Documents/Projects/Shared/TangleClaw-Shared/roadmap-board/index.html`
   - `/Users/jasonvaughan/Documents/Projects/Shared/TangleClaw-Shared/roadmap-board/sync-board.sh`

---

## 2. Ariadne Interactive Roadmap Board (`/roadmap/index.html`)

Served live from the self-hosted Ariadne server (`http://127.0.0.1:3420/roadmap` and public tunnel `https://<ariadne-url>/roadmap`) and updated at every Train dispatch and Train reconciliation (`Rule #289` / `Rule #304`):

### 2.1 Header & Top KPI Ribbon
- **Header:** `ARIADNE — Autonomous Hackathon Roadmap Board (Find Your Thread)`
- **Quick Links:** `← Live 16:9 Stage Visualizer (/stage)` · `Autonomous Sprint Reports Hub (/reports/)` · `Latest: v0.X.0 Sprint Report` · `Provenance Ledger (/provenance)`
- **KPI Cards (`5`):**
  1. **Active Release Train:** `Train 0 (v0.1.0)` → `Train 1 (v0.2.0)` → `Train 2 (v0.3.0)` → `Train 3 (v1.0.0)`
  2. **MVP Issues Completed:** `X / 15` (`0%` → `20%` → `87%` → `100%`)
  3. **Bundled Cars Merged:** `X / 8` (`Car 0-INT`, `Car 1-A..D`, `Car 2-A/C/D`)
  4. **Fleet Lanes Active:** `8–9` (`PM`, `Arc`, `PRR`, `INT`, `Obsr`, `Lane-A..D`)
  5. **Pre-Event Code Commits:** `0` *(Verified by `PRE_EVENT_MANIFEST.sha256`)*

### 2.2 Four Expandable Train Sections
Each Train card displays its scheduled PST window, target release tag, link to its Sprint Charter and `v2.0.0` Sprint Report, and a table of its Bundled Cars and Issues:
- **Train 0 (`v0.1.0` · `09:30–10:15 PST`):** `Car 0-INT` (`A-001`, `A-014` S1, `A-015` S1)
- **Train 1 (`v0.2.0` · `10:15–12:00 PST`):** `Car 1-A` (`A-002`, `A-008` shell), `Car 1-B` (`A-003`, `A-004`, `A-005`), `Car 1-C` (`A-006`, `A-007`), `Car 1-D` (`A-009`, `A-010`, `A-011`)
- **Train 2 (`v0.3.0` · `12:00–13:45 PST`):** `Car 2-A` (`A-008` live, `A-012`), `Car 2-C` (`A-016` + async worker), `Car 2-D` (Stage intro animations & HUD)
- **Train 3 (`v1.0.0` · `13:45–17:45 PST`):** `Car 3-A..D` (Dogfooding polish & bug fixes), `Car 3-INT` (`A-014` S2, `A-015` S2)
- **Post-Hackathon Deferred Section:** `A-013` (Discord bot), `A-017` (Medusa adapter), Morpheus integration.

---

## 3. Ariadne Sprint Reports Hub (`/reports/index.html`)

Served at `https://<ariadne-url>/reports/` and linked directly from the 16:9 Stage Visualizer (`R` hotkey) so hackathon judges can inspect the engineering telemetry of every release:

### 3.1 Hub Index Cards (`5` Report Cards Populated Across H-Day)
1. **Cumulative Highlight Card:** **`v0.1.0 – v1.0.0 Hackathon Train Retrospective`** (`/reports/v0.1.0-v1.0.0-retrospective/index.html`) — Full-day longitudinal rollup across all 4 Trains (`09:30 – 17:45 PST`), total LOC, total automated tests, 4-lane parallelism speedup, and 100% H-Day provenance proof.
2. **`v1.0.0` (`Train 3` — Final Production Release & Judge Freeze · `17:30 PST`)** (`/reports/v1.0.0/index.html`)
3. **`v0.3.0` (`Train 2` — End-to-End Wiring, Web Mutual Intros & Rematching · `13:45 PST`)** (`/reports/v0.3.0/index.html`)
4. **`v0.2.0` (`Train 1` — 10-Issue Parallel 4-Car Core Build · `12:00 PST`)** (`/reports/v0.2.0/index.html`)
5. **`v0.1.0` (`Train 0` — Frozen Contracts, SQLite WAL & `:3420` Bootstrap · `10:15 PST`)** (`/reports/v0.1.0/index.html`)

### 3.2 Mandatory `v2.0.0` Validation Gate Before Publishing Each Report
At each Train boundary (`t8_observer_certification_completed`), `Ariadne-Obsr` runs:
1. `python3 scripts/gen_sprint_report.py --version v0.X.0` (emitting the 8 canonical sections `#overview`, `#architecture`, `#velocity`, `#deliverables`, `#telemetry`, `#postmortem`, `#waves`, `#next-sprint` and the embedded `tc-sprint-metrics-json` block with `t1..t8`).
2. Structural verification ensuring `0` missing timestamps, `100%` issue/PR accounting, and live `HTTP 200` readback on `http://127.0.0.1:3420/reports/v0.X.0/`.

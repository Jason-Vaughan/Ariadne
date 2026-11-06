# Changelog

All notable changes to Ariadne-PM are documented in this file.

## [Unreleased]

### Added
- **Full Python Sprint Reporting & Roadmap System (`sprint-reports/` + `roadmap-board/`):**
  - Installed and configured the complete TangleClaw Python reporting toolchain inside `Ariadne-PM/sprint-reports/`:
    - `metrics_schema.py` & `metrics-schema.json`: Single source of truth for `SPRINT_REPORT_CONTRACT v2.0.0` (8-timestamp release cadence `t1..t8`, full engineering window `T_eng`, 4-state work-completion accounting `State A..D`, 3-tier operating cost taxonomy, orthogonal throughput + legacy `ADE_v1`, and embedded `#tc-canonical-metrics` JSON).
    - `validate-sprint-report.py` & `test_validate_sprint_report.py`: Full contract validator and 10-test unit suite (`10/10` passing) enforcing the 8-section canonical layout, 3+ SVGs, 16-row `Rule #283` table, 4-gate audit table, and mathematical consistency.
    - `scripts/enrich-sprint-reports.py`, `scripts/generate-sprint-report.py`, and `scripts/sync-live-sprint.py`: Automated generator, Open Graph / ADE enricher, and live sprint wave tracker.
    - `generators/gen_v010.py` & `v0.1.0/index.html`: Generated and validated the canonical 1,918-line `v0.1.0` executive report (`PASS [v0.1.0]`) and `sprint-reports/index.html` (`PASS [hub]`).
  - Integrated `TC-Lane-PM` Advisory #3 (`813dd5b1-b210-411b-af36-4e0acaa1106f`) into `roadmap-board/build-ariadne-roadmap.py`, `serve-roadmap.py`, and `publish-public-roadmap.sh` with persistent `Train 1..4` track headers, `builds_beside` parallel summaries, and live PortHub `:3422` serving of `/reports/v0.1.0/` and `/sprint-v0.1.0.html`.
- **Standalone TangleClaw-Style Roadmap Board (`roadmap-board/index.html`) & Live PortHub Server (`:3422`):**
  - Built `roadmap-board/build-ariadne-roadmap.py`, `roadmap-board/index.html`, `roadmap-board/Ariadne-Public-Roadmap-preview.html`, `roadmap-board/publish-public-roadmap.sh`, and `sprint-reports/index.html` using the exact `https://jason-vaughan.github.io/TangleClaw/` HTML/CSS release-drawer layout.
  - Leased PortHub port `3422` (`project: "Ariadne-PM"`, `service: "roadmap-board"`, `reach: "tailnet"`, `permanent: true`) and started `roadmap-board/serve-roadmap.py` at `http://cursatory.tail123678.ts.net:3422/`.
- **Published Interactive Parallel Roadmap Board (`ARIADNE_ROADMAP.md`) & Pairwise Disjoint Solo-Issue Sorting:**
  - Consulted `TC-Lane-PM` (`#74`, `328ce4a2-76c0-417f-9e97-6772f4f8604b`) on the 3-Bucket File-Collision Sorting Methodology (`Envelope(A) ∩ Envelope(B) = ∅`).
  - Sorted all 15 MVP issues (`A-001`–`A-012`, `A-014`–`A-016`) into 100% file-disjoint Solo-Issue Parallel Waves (`v0.1.0`, `v0.2.0`, `v0.3.0`, `v0.4.0`, `v1.0.0`) so every issue executes solo (`1 Issue = 1 Builder Lane = 1 PR`) with zero shared-file overlap and no artificial multi-issue bundling.
  - Published `ARIADNE_ROADMAP.md` (with native TangleClaw `tc-release` interactive cards and clickable issue pills) to `.tangleclaw/plans/ARIADNE_ROADMAP.md` and updated `LANE_QUEUE.md` and `PROJECT_DOCUMENTS.md`.
- **Fleet Provisioning Pack & Git-Tracked Role Priming Prompts (`.tangleclaw/priming/`):**
  - Updated `FLEET_PROVISIONING_PACK.md` with the complete 1-Paste Operator Dashboard Console provisioner that: (1) creates any missing `Ariadne-*` lanes using verified TangleClaw engine IDs (`antigravity`, `codex`, `claude-sonnet-reviewer`), (2) configures all 8 lanes via `PATCH /api/projects/<name>` (`medusaEnabled: true`, `medusaWake: true`, `defaultLaunchMode: "bypassPermissions"`, `showLaunchModePicker: false`, `confirmBypassHidden: true`, `releaseMode: "off"`, `workloadNudge: { enabled: true, coordinatorProject: "Ariadne-PM" }`), (3) seeds active `TEAM COMMON CORE` and `<ROLE> ROLE OVERLAY` session rules (`POST /api/session-rules`), and (4) delegates `project-manager` role + `lifecycle`/`hold`/`stop` control assignments to `Ariadne-PM` (`#149`).
  - Configured `Ariadne-PM` (`#149`) via `PATCH /api/projects/Ariadne-PM` with `medusaEnabled: true`, `medusaWake: true`, `defaultLaunchMode: "bypassPermissions"`, and `showLaunchModePicker: false`.
  - Added git-tracked priming prompts in `.tangleclaw/priming/` (`pm.md`, `architect.md`, `prr.md`, `integrator.md`, `observer.md`, `builder.md`) mirrored to `.tangleclaw/plans/PRIMING_*.md`.
- **Master SSOT Index, Per-Train Sprint Charters, Dispatch Queue & Rule Proposal (`Rule #304`):**
  - Added `PROJECT_DOCUMENTS.md` (`MASTER_SSOT.md`) as the Single Source of Truth linking all 4 Per-Train Sprint Charters (`TRAIN_0_CHARTER_v0.1.0.md` through `TRAIN_3_CHARTER_v1.0.0.md`), core specifications, runbooks, and 17 issue drafts.
  - Added `LANE_QUEUE.md` staging the 4 Release Trains (`v0.1.0`..`v1.0.0`), 8 File-Disjoint Cars (`Car 0-INT`, `Car 1-A..D`, `Car 2-A/C/D`), and Chunk-Boundary receipt ledger (`#1889`).
  - Added `ROADMAP_AND_REPORTS_HUB_SPEC.md` specifying the `/roadmap/index.html` and `/reports/index.html` (`v2.0.0` Sprint Reports Hub & Retrospective) structure.
  - Proposed consolidated startup rule **`Rule #304`** (`ARIADNE PM & FLEET GOVERNANCE OVERLAY v1.0`) on `projectId=149` via `POST /api/session-rules`.

### Changed
- **Web-Only Self-Hosted Hackathon MVP Amendment & `TC-Lane-PM` Advisory Integration:**
  - Updated `PROJECT_CHARTER.md`, `PRODUCT_REQUIREMENTS.md`, `ARCHITECTURE.md`, `DATA_AND_EVENTS_CONTRACT.md`, `PRIVACY_AND_SECURITY.md`, `PREFLIGHT_CHECKLIST.md`, `RISK_REGISTER.md`, and `OPERATOR_APPROVAL_PACKET.md` to specify a single self-hosted Node.js web application on `127.0.0.1:3420` (PortHub-registered, strictly isolated from TangleClaw control plane) exposed via a narrowly scoped public HTTPS tunnel (`cloudflared`/`ngrok`), backed by SQLite (`WAL` mode), in-process async job workers, and SSE with automatic HTTP polling fallback (`/api/events/poll`).
  - Deferred Discord (`A-013`), Medusa (`A-017`), and Morpheus integrations to the post-hackathon roadmap; all mutual introductions execute natively inside the authenticated private Web Introduction Room (`A-012`, `/me/matches/:id`).
  - Restructured `DEPENDENCY_DAG.md`, `FLEET_CHARTER.md`, `RELEASE_PLAN.md`, `HACKATHON_RUNBOOK.md`, `DEMO_RUNBOOK.md`, `PROVENANCE_AND_JUDGING.md`, and `ISSUE_BACKLOG/` around `TC-Lane-PM`'s **4-Train Multi-Issue Bundled Car Playbook (`Rule #294`)** (`Train 0 v0.1.0` at 10:15 AM, `Train 1 v0.2.0` shipping 10 issues across 4 parallel Cars by 12:00 PM, `Train 2 v0.3.0` completing the full MVP by 13:45 PM, and `Train 3 v1.0.0` providing a 4-hour afternoon polish & dogfooding runway) and **TangleClaw Sprint Reporting Standard `v2.0.0`** (`/reports/v0.1.0..v1.0.0`).

### Added
- Initial pre-hackathon preparation package for `ARIADNE-HACK-2026` (Anything Applied Agentic Hackathon, Nov 7, 2026 — preparation-only scope, zero application code).

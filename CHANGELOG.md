# Changelog

All notable changes to Ariadne-PM are documented in this file.

## [Unreleased]

### Added
- **Fleet Provisioning Pack & Git-Tracked Role Priming Prompts (`.tangleclaw/priming/`):**
  - Added `FLEET_PROVISIONING_PACK.md` with the 1-Paste Operator Dashboard Console batch provisioner (`POST /api/projects` is `OPERATOR_ONLY`) and role overlay rule definitions for `Ariadne-Arc`, `Ariadne-PRR`, `Ariadne-INT`, `Ariadne-Obsr`, and `Ariadne-Lane-A..D`.
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

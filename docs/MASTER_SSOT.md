# Master Project Documents Index (SSOT) — ARIADNE (`ARIADNE-HACK-2026`)

> [!IMPORTANT]
> **Single Source of Truth (SSOT) — Prominent Live Links & Dashboards**
> - **🌐 Public Roadmap & Documentation Hub (GitHub Pages):** **[https://jason-vaughan.github.io/Ariadne/](https://jason-vaughan.github.io/Ariadne/)**
> - **📚 Public Branded Documentation Portal (GitHub Pages & `:3422`):** **[https://jason-vaughan.github.io/Ariadne/docs/](https://jason-vaughan.github.io/Ariadne/docs/)** · **[http://cursatory.tail123678.ts.net:3422/docs/](http://cursatory.tail123678.ts.net:3422/docs/)**
> - **⭐ Master SSOT Index:** **[https://jason-vaughan.github.io/Ariadne/docs/MASTER_SSOT.html](https://jason-vaughan.github.io/Ariadne/docs/MASTER_SSOT.html)** · **[http://cursatory.tail123678.ts.net:3422/docs/MASTER_SSOT.md](http://cursatory.tail123678.ts.net:3422/docs/MASTER_SSOT.md)** · **[MagicDNS `:8443`](https://cursatory.tail123678.ts.net:8443/plans/149/MASTER_SSOT.md)**
> - **📊 Certified Sprint Reports Hub (`v2.0.0` Standard — `v0.1.0`..`v0.4.0`):** **[https://jason-vaughan.github.io/Ariadne/reports/](https://jason-vaughan.github.io/Ariadne/reports/)** · **[http://cursatory.tail123678.ts.net:3422/reports/](http://cursatory.tail123678.ts.net:3422/reports/)**
> - **🎤 Live Room Presentation & Monitor Script (`LIVE_PITCH_SCRIPT.md`):** **[https://jason-vaughan.github.io/Ariadne/docs/LIVE_PITCH_SCRIPT.html](https://jason-vaughan.github.io/Ariadne/docs/LIVE_PITCH_SCRIPT.html)** · **[http://cursatory.tail123678.ts.net:3422/docs/LIVE_PITCH_SCRIPT.md](http://cursatory.tail123678.ts.net:3422/docs/LIVE_PITCH_SCRIPT.md)** · **[MagicDNS `:8443`](https://cursatory.tail123678.ts.net:8443/plans/149/LIVE_PITCH_SCRIPT.md)**
> - **🖥️ Live 16:9 Stage Visualizer (`/stage/`):** **[http://cursatory.tail123678.ts.net:3422/stage/](http://cursatory.tail123678.ts.net:3422/stage/)**
> - **🎬 Split-Screen Automated Demo Theater & 1080p MP4 Video:** **[http://cursatory.tail123678.ts.net:3422/demo-theater](http://cursatory.tail123678.ts.net:3422/demo-theater)** · **[http://cursatory.tail123678.ts.net:3422/demo-video.mp4](http://cursatory.tail123678.ts.net:3422/demo-video.mp4)**
> - **📱 Public QR Onboarding URL (Cloudflare HTTPS Tunnel):** **[https://cell-internationally-thermal-magnet.trycloudflare.com/join](https://cell-internationally-thermal-magnet.trycloudflare.com/join)**
> - **📦 Public GitHub Repository:** **[https://github.com/Jason-Vaughan/Ariadne](https://github.com/Jason-Vaughan/Ariadne)**
> - **Final H-Day Sprint Status:** **100% COMPLETE (`v0.1.0`–`v0.4.0` + `v1.0.0` Live Dogfooding Waves Merged · `24/24` Active Issues Closed · `29` PRs Merged · `563/563` Automated Tests Passing)**

---

## 0. Verified 9-Lane Ariadne Fleet Roster (`#149..#157`) & PM Lifecycle Delegation

- **Coordinator Role (`coordinator_roles`):** `Ariadne-PM` (`projectId: 149`) holds **`role_CDwpzRB3TFL9`** (`role: "project-manager"`, `status: "active"`, `authorityVersion: 1`).
- **All 9 Lanes Provisioned & Verified:** Every lane operated with `medusaEnabled: true`, `medusaWake: true`, `defaultLaunchMode: "bypassPermissions"`, active session rules, and active control delegation to `project:149`:

| ID | Lane Name | Engine | Gate / Role | Active Rule IDs | Control Assignment (`project:149`) | Role Priming Doc |
|---|---|---|---|---|---|---|
| **`149`** | **`Ariadne-PM`** | `antigravity` | **PM & Release Train Conductor** (`role_CDwpzRB3TFL9`) | `#304` | *Self (Coordinator)* | [PRIMING_PM.md](PRIMING_PM.html) |
| **`150`** | **`Ariadne-Obsr`** | `antigravity` | **`O-Gate` — Sprint Observer & `v2.0.0` Reports** | `#312`, `#313` | `asg_aW760W25RJquRzfY` (`active`) | [PRIMING_OBSERVER.md](PRIMING_OBSERVER.html) |
| **`151`** | **`Ariadne-Lane-A`** | `claude-fable-sprint` | **Builder A — Mobile Onboarding (`/join`), `/me` & Mutual Intro Room** | `#314`, `#315` | `asg_z1u01SMjP7Z-fG-k` (`active`) | [PRIMING_BUILDER.md](PRIMING_BUILDER.html) |
| **`152`** | **`Ariadne-Lane-B`** | `claude-fable-sprint` | **Builder B — GitHub Connector, 6-Axis Fingerprint & AI Intelligence Agents** | `#316`, `#317` | `asg_45rOtnDPuLlFLFyO` (`active`) | [PRIMING_BUILDER.md](PRIMING_BUILDER.html) |
| **`153`** | **`Ariadne-Lane-C`** | `claude-fable-sprint` | **Builder C — Bounded Complementarity Scorer, Explanations & Async Worker** | `#318`, `#319` | `asg_gDuncr4ewLLit5Yu` (`active`) | [PRIMING_BUILDER.md](PRIMING_BUILDER.html) |
| **`154`** | **`Ariadne-Lane-D`** | `claude-fable-sprint` | **Builder D — 16:9 Stage Visualizer (`Views 1–4`), Explainer Modal & Admin Reset** | `#320`, `#321` | `asg_LlRqxB3KX-KJ-4wr` (`active`) | [PRIMING_BUILDER.md](PRIMING_BUILDER.html) |
| **`155`** | **`Ariadne-Arc`** | `antigravity` | **`A-Gate` — Technical Architect** | `#306`, `#307` | `asg_xItpc0jxCnaMWgPB` (`active`) | [PRIMING_ARCHITECT.md](PRIMING_ARCHITECT.html) |
| **`156`** | **`Ariadne-PRR`** | `codex` | **`R-Gate` — Independent PR Reviewer** | `#308`, `#309` | `asg_pkHu9jClj6o79TEj` (`active`) | [PRIMING_PRR.md](PRIMING_PRR.html) |
| **`157`** | **`Ariadne-INT`** | `codex` | **`I-Gate` — Sole Integrator & `:3420` Deployer** | `#310`, `#311` | `asg_huVXFxnSDERY-Ir0` (`active`) | [PRIMING_INTEGRATOR.md](PRIMING_INTEGRATOR.html) |

---

## 1. As-Built Architecture & Final Execution Summary (`v0.1.0` → `v1.0.0`)

- **Application Topology:** Single self-hosted Node.js (`v22.22.3`) + TypeScript web application bound to PortHub port **`127.0.0.1:3420`**, strictly isolated from TangleClaw's control plane (`:3102`, `:3100`, `:8443`) and exposed via a narrowly scoped Cloudflare HTTPS tunnel (`com.ariadne.cloudflared` → `127.0.0.1:3420`).
- **Two Synchronized Interfaces on One Backend:**
  1. **Mobile Participant Interface (`/join`, `/me`, `/me/matches/:id`):**
     - **1-Tap Frictionless Onboarding (`A-002`, `A-021`, `A-025`):** Zero-OAuth GitHub handle entry, optional public website & 1-line collaboration goal, notice-based analysis consent (no mandatory processing checkbox), and pre-checked `@github` stage display opt-in.
     - **6-Axis Superpower Profile & Top-3 Match Cards (`/me` — `A-008`, `A-019`):** Displays the participant's 6-Axis Builder Fingerprint, verified repo capability claims, collaboration bottlenecks, and Top-3 complementary matches with dual SSE + 2.5s auto-polling behind Cloudflare tunnels.
     - **Double-Opt-In Mutual Intro Room (`/me/matches/:id` — `A-012`):** Bilateral consent gate (`candidate → proposed_by_a/b → mutual_accepted`), contact reveal, 1-tap `.vcf` vCard download, AI collaboration thesis, and physical venue locator pills (`Near Stage`, `Coffee Area`, etc.).
  2. **16:9 Presentation Stage Visualizer (`/stage/`, `/admin`, `/reports/`, `/roadmap/`):**
     - **View 1 (`1: Under-the-Hood Pipeline` — Default Startup View, `A-011`, `A-020`, `A-022`):** 4-column live pipeline (`GitHub + Website Crawl` → `Evidence & Sanitizer` → `6-Axis Fingerprint` → `Match Scorer & Golden Thread`) streaming real `@github` handles.
     - **View 2 (`2: Builder Fingerprints` — `A-011`, `A-018`):** Hexagonal 6-Axis radar gallery with GitHub profile avatars (and green-dot privacy fallback).
     - **View 3 (`3: Web of Connections` — `A-010`, `A-018`):** Force-directed Top-3 (`k=3`) network graph with circular GitHub avatars, instant `+25` AI Builder Seed toggle (`S`), and glowing gold `⚡ NEW GOLDEN THREAD` arcs.
     - **View 4 (`4: Match Spotlight` — `A-011`):** Side-by-side pair comparison, 5-bar score breakdown (`35/30/15/10/10`), and AI collaboration thesis.
     - **Stage HUD Controls (`A-022`, `A-023`, `A-024`):** Draggable persistent Floating QR (`A`/`R`), Full-Screen QR Modal (`Q`), Full-Screen 4-Tab Stage Explainer & Formula Modal (`I`/`?`), Privacy Pseudonymizer (`P`), Auto-Cycle (`Space`), and Presenter 2-Click Full Room Reset (`🧹 Reset` → `POST /api/admin/reset`).
- **Calibrated 6-Axis Superpower Fingerprint (`A-003`, `A-004`, `A-026`):**
  - Star-weighted non-fork repo analysis (`w = 1 + min(1, log10(1 + stars)/2)` across up to 10 repos), context-aware language routing (routing CLI/MCP/agent `TypeScript`/`JavaScript` work to `Agent Orchestration` + `Product/GTM` + `Systems/Infra` rather than `Frontend/UX`), disambiguated `Agent Orchestration` vs. `LLM/Eval` vocabularies, structural `Product/GTM` credit for live websites/profile READMEs, and bounded Stage 2 Gemini 2.5 Flash refinement (`±25` points max shift).
- **Bounded Complementarity Match Scorer (`A-006`):**
  - **5-Component Formula:** `35%` Capability Similarity + `30%` Bidirectional Need ↔ Offer Fit + `15%` Architectural Complementarity + `10%` Jaccard Novelty + `10%` Repo Freshness, with a hard **`38`-point Anti-Clone Penalty Cap** (`< 45` surfacing threshold) when `need_offer_fit === 0` and `complementarity === 0`.

---

## 2. Per-Wave Release Schedule & Shipped Issue Ledger (`24/24` Shipped)

| Wave / Release | Window (PST) | Charter Document | Shipped Issues & PRs | Status |
|---|---|---|---|---|
| **Wave 0 (`v0.1.0`)** | `09:30 – 10:35` | [TRAIN_0_CHARTER_v0.1.0.md](TRAIN_0_CHARTER_v0.1.0.html) | `#1` (`A-001` PR #20), `#13` (`A-014` PR #19), `#9` (`A-009` PR #21), `#14` (`A-015` PR #18) | ✅ Certified ([Report](../reports/v0.1.0/)) |
| **Wave 1 (`v0.2.0`)** | `10:35 – 11:30` | [TRAIN_1_CHARTER_v0.2.0.md](TRAIN_1_CHARTER_v0.2.0.html) | `#2` (`A-002` PR #22), `#3` (`A-003` PR #23), `#6` (`A-006` PR #26), `#10` (`A-010` PR #24) | ✅ Certified ([Report](../reports/v0.2.0/)) |
| **Wave 2 (`v0.3.0`)** | `11:30 – 12:35` | [TRAIN_2_CHARTER_v0.3.0.md](TRAIN_2_CHARTER_v0.3.0.html) | `#8` (`A-008` PR #28), `#4` (`A-004` PR #27), `#7` (`A-007` PR #32), `#11` (`A-011` PR #29) | ✅ Certified ([Report](../reports/v0.3.0/)) |
| **Wave 3 (`v0.4.0`)** | `12:35 – 13:30` | [TRAIN_3_CHARTER_v1.0.0.md](TRAIN_3_CHARTER_v1.0.0.html) | `#12` (`A-012` PR #34), `#5` (`A-005` PR #31), `#15` (`A-016` PR #38), `#40` (Branding PR #41) | ✅ Certified ([Report](../reports/v0.4.0/)) |
| **Wave 4 (`v1.0.0` Live Dogfooding)** | `13:30 – 17:35` | [LIVE_PITCH_SCRIPT.md](LIVE_PITCH_SCRIPT.html) | `#42` (`A-018` PR #43), `#44` (`A-019` PR #45), `#46` (`A-020` PR #47), `#48` (`A-021` PR #50), `#49` (`A-022` PR #51), `#52` (`A-023` PR #53), `#54` (`A-024` PR #55), `#56` (`A-025` PR #57), `#58` (`A-026` PR #59) | ✅ All `24/24` Shipped (`563/563` Tests) |

---

## 3. Core Architecture, Product & Subsystem Specifications

| Document | Portal Link | MagicDNS Link (`:8443`) | Scope & Purpose |
|---|---|---|---|
| **Executive Project Charter** | [PROJECT_CHARTER.md](PROJECT_CHARTER.html) | [`:8443` Plan](https://cursatory.tail123678.ts.net:8443/plans/149/PROJECT_CHARTER.md) | Mission, Web-Only Amendment, success tiers (`v0.1.0`–`v1.0.0`), and governance constraints. |
| **Product Requirements (PRD)** | [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.html) | [`:8443` Plan](https://cursatory.tail123678.ts.net:8443/plans/149/PRODUCT_REQUIREMENTS.md) | Mobile QR user journey, progressive latency targets, and dual-interface specs. |
| **Architecture & ADRs (A–G)** | [ARCHITECTURE.md](ARCHITECTURE.html) | [`:8443` Plan](https://cursatory.tail123678.ts.net:8443/plans/149/ARCHITECTURE.md) | Self-hosted Node.js + SQLite WAL + narrow HTTPS tunnel topology and ADRs. |
| **Data & Events Contract** | [DATA_AND_EVENTS_CONTRACT.md](DATA_AND_EVENTS_CONTRACT.html) | [`:8443` Plan](https://cursatory.tail123678.ts.net:8443/plans/149/DATA_AND_EVENTS_CONTRACT.md) | Canonical SQLite table schemas, TypeScript interfaces, intro state machine, and 12 SSE/poll event types. |
| **Match Scoring Specification** | [MATCH_SCORING_SPEC.md](MATCH_SCORING_SPEC.html) | [`:8443` Plan](https://cursatory.tail123678.ts.net:8443/plans/149/MATCH_SCORING_SPEC.md) | 5-Component Bounded Complementarity formula (`35/30/15/10/10` + `38` Anti-Clone Cap) and test cases. |
| **GitHub Intelligence Spec** | [GITHUB_INTELLIGENCE_SPEC.md](GITHUB_INTELLIGENCE_SPEC.html) | [`:8443` Plan](https://cursatory.tail123678.ts.net:8443/plans/149/GITHUB_INTELLIGENCE_SPEC.md) | Bounded REST + Multi-PAT pool, 24h SQLite snapshot cache, 6-Axis Superpower Fingerprint (`A-026`), and sanitizer. |
| **16:9 Stage Visualizer Spec** | [VISUALIZER_SPEC.md](VISUALIZER_SPEC.html) | [`:8443` Plan](https://cursatory.tail123678.ts.net:8443/plans/149/VISUALIZER_SPEC.md) | 4 Stage Views (`1` Pipeline, `2` Fingerprints, `3` Web of Connections, `4` Spotlight), Floating QR (`A`), Info Modal (`I`), and Reset (`🧹`). |
| **Privacy, Identity & Security** | [PRIVACY_AND_SECURITY.md](PRIVACY_AND_SECURITY.html) | [`:8443` Plan](https://cursatory.tail123678.ts.net:8443/plans/149/PRIVACY_AND_SECURITY.md) | Two-Tier Progressive Identity, bilateral consent gate, one-click data erasure, and control-plane isolation. |

---

## 4. Fleet Governance, Scheduling, Runbooks & Readiness

| Document | Portal Link | MagicDNS Link (`:8443`) | Scope & Purpose |
|---|---|---|---|
| **🎤 Live Room Presentation Script** | [LIVE_PITCH_SCRIPT.md](LIVE_PITCH_SCRIPT.html) | [`:8443` Plan](https://cursatory.tail123678.ts.net:8443/plans/149/LIVE_PITCH_SCRIPT.md) | Monitor-first interactive 3-minute script (`Q` → `1` → `2` → `3` → `S` → `4` → `I` → Reports), hotkey strip, and Judge Q&A cheat sheet. |
| **Fleet Charter & Durable Rules** | [FLEET_CHARTER.md](FLEET_CHARTER.html) | [`:8443` Plan](https://cursatory.tail123678.ts.net:8443/plans/149/FLEET_CHARTER.md) | 9-pane fleet topology (`PM`, `Arc`, `PRR`, `INT`, `Obsr`, `Lane-A..D`), worktree isolation, and Durable Fleet Rules. |
| **Fleet Provisioning & Rule Pack** | [FLEET_PROVISIONING_PACK.md](FLEET_PROVISIONING_PACK.html) | [`:8443` Plan](https://cursatory.tail123678.ts.net:8443/plans/149/FLEET_PROVISIONING_PACK.md) | Operator Dashboard Console provisioner for the 8 fleet lanes, role overlays, and priming links. |
| **Fleet Dispatch Queue (`LANE_QUEUE`)** | [LANE_QUEUE.md](LANE_QUEUE.html) | [`:8443` Plan](https://cursatory.tail123678.ts.net:8443/plans/149/LANE_QUEUE.md) | Dispatch queue staging all Release Trains and Chunk-Boundary receipt ledger (`#1889`). |
| **Roadmap & Sprint Reports Hub Spec** | [ROADMAP_AND_REPORTS_HUB_SPEC.md](ROADMAP_AND_REPORTS_HUB_SPEC.html) | [`:8443` Plan](https://cursatory.tail123678.ts.net:8443/plans/149/ROADMAP_AND_REPORTS_HUB_SPEC.md) | Specification for `/roadmap/` and `/reports/` (`v2.0.0` Sprint Reports Hub & Retrospective). |
| **Dependency DAG & Car Schedule** | [DEPENDENCY_DAG.md](DEPENDENCY_DAG.html) | [`:8443` Plan](https://cursatory.tail123678.ts.net:8443/plans/149/DEPENDENCY_DAG.md) | 4-Train DAG, file-disjoint Car write envelopes (`Envelope(A) ∩ Envelope(B) = ∅`). |
| **Release & Deployment Plan** | [RELEASE_PLAN.md](RELEASE_PLAN.html) | [`:8443` Plan](https://cursatory.tail123678.ts.net:8443/plans/149/RELEASE_PLAN.md) | Train cutover gates (`A-Gate`, `R-Gate`, `I-Gate`, `O-Gate`), SQLite WAL backups, and rollback protocol. |
| **H-Day Launch Runbook** | [HACKATHON_RUNBOOK.md](HACKATHON_RUNBOOK.html) | [`:8443` Plan](https://cursatory.tail123678.ts.net:8443/plans/149/HACKATHON_RUNBOOK.md) | Minute-by-minute post-`GO` launch sequence and full-day schedule. |
| **Stage Demo & Judging Runbook** | [DEMO_RUNBOOK.md](DEMO_RUNBOOK.html) | [`:8443` Plan](https://cursatory.tail123678.ts.net:8443/plans/149/DEMO_RUNBOOK.md) | 3-minute live stage script and degraded-mode playbooks. |
| **Provenance & Judge Reporting** | [PROVENANCE_AND_JUDGING.md](PROVENANCE_AND_JUDGING.html) | [`:8443` Plan](https://cursatory.tail123678.ts.net:8443/plans/149/PROVENANCE_AND_JUDGING.md) | 3-bucket provenance ledger and TangleClaw Sprint Reporting Standard `v2.0.0`. |
| **Technical Readiness Checklist** | [PREFLIGHT_CHECKLIST.md](PREFLIGHT_CHECKLIST.html) | [`:8443` Plan](https://cursatory.tail123678.ts.net:8443/plans/149/PREFLIGHT_CHECKLIST.md) | Host readiness (`node v22.22.3`, `gh`, `cloudflared`, PortHub `3420`). |
| **Risk Register** | [RISK_REGISTER.md](RISK_REGISTER.html) | [`:8443` Plan](https://cursatory.tail123678.ts.net:8443/plans/149/RISK_REGISTER.md) | Technical/event risks and pre-engineered mitigations. |
| **Operator Approval Packet** | [OPERATOR_APPROVAL_PACKET.md](OPERATOR_APPROVAL_PACKET.html) | [`:8443` Plan](https://cursatory.tail123678.ts.net:8443/plans/149/OPERATOR_APPROVAL_PACKET.md) | Ratification decisions (`D-1`–`D-5`) and H-Day `GO` trigger phrase. |

---

## 5. Complete H-Day GitHub Issue Backlog (`24` Shipped + `2` Deferred V2)

- **Master Backlog Index:** [ISSUE_BACKLOG_INDEX.md](ISSUE_BACKLOG_INDEX.html)
- **Single-Page Consolidated Backlog (All Drafts):** [ISSUE_BACKLOG_COMPLETE.md](ISSUE_BACKLOG_COMPLETE.html)

| Issue ID | GitHub Issue & PR | Title | Wave & Lane | Spec / Issue Link |
|---|---|---|---|---|
| **A-001** | `#1` (PR #20) | Core architecture, SQLite WAL schema & data/event contracts | `v0.1.0` · `Lane-A` | [ISSUE_A-001.md](ISSUE_A-001.html) |
| **A-002** | `#2` (PR #22) | Public QR onboarding — Zero-OAuth GitHub handle & session isolation | `v0.2.0` · `Lane-A` | [ISSUE_A-002.md](ISSUE_A-002.html) |
| **A-003** | `#3` (PR #23) | Bounded GitHub + public website connector, Multi-PAT pool & 24h cache | `v0.2.0` · `Lane-B` | [ISSUE_A-003.md](ISSUE_A-003.html) |
| **A-004** | `#4` (PR #27) | Evidence-backed capability analysis & 6-Axis Builder Fingerprint | `v0.3.0` · `Lane-B` | [ISSUE_A-004.md](ISSUE_A-004.html) |
| **A-005** | `#5` (PR #31) | Opportunity and bottleneck discovery agent | `v0.4.0` · `Lane-B` | [ISSUE_A-005.md](ISSUE_A-005.html) |
| **A-006** | `#6` (PR #26) | Deterministic 5-component match scoring engine (`35/30/15/10/10` + `<=38` anti-clone cap) | `v0.2.0` · `Lane-C` | [ISSUE_A-006.md](ISSUE_A-006.html) |
| **A-007** | `#7` (PR #32) | Two-stage match explanation & collaboration thesis agent | `v0.3.0` · `Lane-C` | [ISSUE_A-007.md](ISSUE_A-007.html) |
| **A-008** | `#8` (PR #28) | Mobile participant 6-Axis Fingerprint & Top-3 Match Cards UI (`/me`) | `v0.3.0` · `Lane-A` | [ISSUE_A-008.md](ISSUE_A-008.html) |
| **A-009** | `#9` (PR #21) | SQLite append-only live event stream (`SSE` + polling fallback) | `v0.1.0` · `Lane-C` | [ISSUE_A-009.md](ISSUE_A-009.html) |
| **A-010** | `#10` (PR #24) | 16:9 Stage Visualizer — Web of Connections (`View 3`), Golden Arcs & Seed Toggle | `v0.2.0` · `Lane-D` | [ISSUE_A-010.md](ISSUE_A-010.html) |
| **A-011** | `#11` (PR #29) | 16:9 Stage Visualizer — Pipeline (`View 1`), Fingerprints (`View 2`), Spotlight (`View 4`) & Admin | `v0.3.0` · `Lane-D` | [ISSUE_A-011.md](ISSUE_A-011.html) |
| **A-012** | `#12` (PR #34) | Web-native mutual-introduction workflow, Private Intro Room & Venue Locator | `v0.4.0` · `Lane-A` | [ISSUE_A-012.md](ISSUE_A-012.html) |
| **A-014** | `#13` (PR #19) | Self-hosted server (`:3420`), auto-mounted route loader, SQLite WAL & tunnel | `v0.1.0` · `Lane-B` | [ISSUE_A-014.md](ISSUE_A-014.html) |
| **A-015** | `#14` (PR #18) | Hackathon provenance & Per-Version `v2.0.0` Interactive Sprint Reports Hub | `v0.1.0` · `Lane-D` | [ISSUE_A-015.md](ISSUE_A-015.html) |
| **A-016** | `#15` (PR #38) | Two-stage progressive worker, continuous rematching & `/admin` capacity controller | `v0.4.0` · `Lane-C` | [ISSUE_A-016.md](ISSUE_A-016.html) |
| **A-018** | `#42` (PR #43) | Render GitHub profile avatars on Stage Visualizer nodes & cards with green-dot fallback | `v1.0.0` · `Lane-D` | [GitHub #42](https://github.com/Jason-Vaughan/Ariadne/issues/42) |
| **A-019** | `#44` (PR #45) | Auto-refresh `/me` and `/me/matches/:id` when SSE frames are buffered by Cloudflare tunnel | `v1.0.0` · `Lane-A` | [GitHub #44](https://github.com/Jason-Vaughan/Ariadne/issues/44) |
| **A-020** | `#46` (PR #47) | Filter withdrawn/deleted/switched-off-seed aliases from Stage View 1 event feed | `v1.0.0` · `Lane-D` | [GitHub #46](https://github.com/Jason-Vaughan/Ariadne/issues/46) |
| **A-021** | `#48` (PR #50) | Default `stage_display_consent` to checked on `/join` and lead with `@github_username` on `/me` | `v1.0.0` · `Lane-A` | [GitHub #48](https://github.com/Jason-Vaughan/Ariadne/issues/48) |
| **A-022** | `#49` (PR #51) | Default `/stage/` to View 1 Pipeline, show `@github_username` in events & add Floating QR (`A`) | `v1.0.0` · `Lane-D` | [GitHub #49](https://github.com/Jason-Vaughan/Ariadne/issues/49) |
| **A-023** | `#52` (PR #53) | Add per-view `ℹ️ Info / How It Works` button & full-screen stage explainer modal (`I` / `?`) | `v1.0.0` · `Lane-D` | [GitHub #52](https://github.com/Jason-Vaughan/Ariadne/issues/52) |
| **A-024** | `#54` (PR #55) | Add `POST /api/admin/reset` & 2-click `🧹 Reset` room data wipe on `/admin` and `/stage/` | `v1.0.0` · `Lane-D` | [GitHub #54](https://github.com/Jason-Vaughan/Ariadne/issues/54) |
| **A-025** | `#56` (PR #57) | Remove mandatory processing-consent checkbox from `/join` for 1-tap notice-based onboarding | `v1.0.0` · `Lane-A` | [GitHub #56](https://github.com/Jason-Vaughan/Ariadne/issues/56) |
| **A-026** | `#58` (PR #59) | Re-calibrate 6-Axis Builder Fingerprint & `KNOWN_TECH` superpowers (`Agent` vs `LLM/Eval` & `JS/TS` routing) | `v1.0.0` · `Lane-B` | [GitHub #58](https://github.com/Jason-Vaughan/Ariadne/issues/58) |
| *A-013* | *`#16` (Deferred)* | *[DEFERRED — Post-Hackathon V2] Discord event bot* | *Post-Hackathon* | [ISSUE_A-013.md](ISSUE_A-013.html) |
| *A-017* | *`#17` (Deferred)* | *[DEFERRED — Post-Hackathon V2] Medusa coordination adapter* | *Post-Hackathon* | [ISSUE_A-017.md](ISSUE_A-017.html) |

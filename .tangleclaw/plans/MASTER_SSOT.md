# Master Project Documents Index (SSOT) — ARIADNE (`ARIADNE-HACK-2026`)

> [!IMPORTANT]
> **Single Source of Truth (SSOT) — Prominent Live Links & Dashboards**
> - **Master SSOT Index (`:8443`):** [https://cursatory.tail123678.ts.net:8443/plans/149/PROJECT_DOCUMENTS.md](https://cursatory.tail123678.ts.net:8443/plans/149/PROJECT_DOCUMENTS.md) *(Mirror: [MASTER_SSOT.md](https://cursatory.tail123678.ts.net:8443/plans/149/MASTER_SSOT.md))*
> - **Branded Documentation Portal (All 52 Docs with Static TangleClaw Watermark on `:3422/docs/`):** **[http://cursatory.tail123678.ts.net:3422/docs/](http://cursatory.tail123678.ts.net:3422/docs/)** *(Direct Master SSOT: **[http://cursatory.tail123678.ts.net:3422/docs/MASTER_SSOT.md](http://cursatory.tail123678.ts.net:3422/docs/MASTER_SSOT.md)**)*
> - **Live Interactive Roadmap Board (`TangleClaw Roadmap 2` UI on PortHub `:3422`):** **[http://cursatory.tail123678.ts.net:3422/](http://cursatory.tail123678.ts.net:3422/)**
> - **Public Roadmap Preview (`:3422/public`):** **[http://cursatory.tail123678.ts.net:3422/public](http://cursatory.tail123678.ts.net:3422/public)**
> - **Sprint Reports Hub (`v2.0.0` Standard on `:3422/reports/`):** **[http://cursatory.tail123678.ts.net:3422/reports/](http://cursatory.tail123678.ts.net:3422/reports/)**
> - **`v0.1.0` Executive Sprint Report (`:3422/reports/v0.1.0/`):** **[http://cursatory.tail123678.ts.net:3422/reports/v0.1.0/](http://cursatory.tail123678.ts.net:3422/reports/v0.1.0/)**
> - **Plan-Viewer Roadmap (`tc-release` on `:8443`):** **[https://cursatory.tail123678.ts.net:8443/plans/149/ARIADNE_ROADMAP.md](https://cursatory.tail123678.ts.net:8443/plans/149/ARIADNE_ROADMAP.md)**
> - **Fleet Dispatch Queue (`LANE_QUEUE.md`):** **[https://cursatory.tail123678.ts.net:8443/plans/149/LANE_QUEUE.md](https://cursatory.tail123678.ts.net:8443/plans/149/LANE_QUEUE.md)**
> - **Fleet Provisioning & Rule Pack (`FLEET_PROVISIONING_PACK.md`):** **[https://cursatory.tail123678.ts.net:8443/plans/149/FLEET_PROVISIONING_PACK.md](https://cursatory.tail123678.ts.net:8443/plans/149/FLEET_PROVISIONING_PACK.md)**
> - **Authorization Status:** **PREPARATION ONLY — ZERO APPLICATION CODE BEFORE SATURDAY NOV 7, 2026 @ 09:30 AM PST OPERATOR `GO`**

---

## 0. Verified 9-Lane Ariadne Fleet Roster (`#149..#157`) & PM Lifecycle Delegation

- **Coordinator Role (`coordinator_roles`):** `Ariadne-PM` (`projectId: 149`) holds **`role_CDwpzRB3TFL9`** (`role: "project-manager"`, `status: "active"`, `authorityVersion: 1`).
- **All 9 Lanes Provisioned & Verified:** Every lane has `medusaEnabled: true`, `medusaWake: true`, `defaultLaunchMode: "bypassPermissions"`, `showLaunchModePicker: false`, active session rules, and active control delegation to `project:149`:

| ID | Lane Name | Engine | Gate / Role | Active Rule IDs | Control Assignment (`project:149`) | Role Priming Link (MagicDNS) |
|---|---|---|---|---|---|---|
| **`149`** | **`Ariadne-PM`** | `antigravity` | **PM & Release Train Conductor** (`role_CDwpzRB3TFL9`) | `#304` | *Self (Coordinator)* | [PRIMING_PM.md](https://cursatory.tail123678.ts.net:8443/plans/149/PRIMING_PM.md) |
| **`150`** | **`Ariadne-Obsr`** | `antigravity` | **`O-Gate` — Sprint Observer & `v2.0.0` Reports** | `#312`, `#313` | `asg_aW760W25RJquRzfY` (`active`) | [PRIMING_OBSERVER.md](https://cursatory.tail123678.ts.net:8443/plans/149/PRIMING_OBSERVER.md) |
| **`151`** | **`Ariadne-Lane-A`** | `claude-fable-sprint` (`claude-opus-5-5 --effort high`) | **Builder A — Onboarding, GitHub & Introductions** | `#314`, `#315` | `asg_z1u01SMjP7Z-fG-k` (`active`) | [PRIMING_BUILDER.md](https://cursatory.tail123678.ts.net:8443/plans/149/PRIMING_BUILDER.md) |
| **`152`** | **`Ariadne-Lane-B`** | `claude-fable-sprint` (`claude-opus-5-5 --effort high`) | **Builder B — Hybrid Matching & Evidence Engine** | `#316`, `#317` | `asg_45rOtnDPuLlFLFyO` (`active`) | [PRIMING_BUILDER.md](https://cursatory.tail123678.ts.net:8443/plans/149/PRIMING_BUILDER.md) |
| **`153`** | **`Ariadne-Lane-C`** | `claude-fable-sprint` (`claude-opus-5-5 --effort high`) | **Builder C — Mobile Participant Web UI** | `#318`, `#319` | `asg_gDuncr4ewLLit5Yu` (`active`) | [PRIMING_BUILDER.md](https://cursatory.tail123678.ts.net:8443/plans/149/PRIMING_BUILDER.md) |
| **`154`** | **`Ariadne-Lane-D`** | `claude-fable-sprint` (`claude-opus-5-5 --effort high`) | **Builder D — Stage Visualizer, Privacy & Resilience** | `#320`, `#321` | `asg_LlRqxB3KX-KJ-4wr` (`active`) | [PRIMING_BUILDER.md](https://cursatory.tail123678.ts.net:8443/plans/149/PRIMING_BUILDER.md) |
| **`155`** | **`Ariadne-Arc`** | `antigravity` | **`A-Gate` — Technical Architect** | `#306`, `#307` | `asg_xItpc0jxCnaMWgPB` (`active`) | [PRIMING_ARCHITECT.md](https://cursatory.tail123678.ts.net:8443/plans/149/PRIMING_ARCHITECT.md) |
| **`156`** | **`Ariadne-PRR`** | `codex` | **`R-Gate` — Independent PR Reviewer** | `#308`, `#309` | `asg_pkHu9jClj6o79TEj` (`active`) | [PRIMING_PRR.md](https://cursatory.tail123678.ts.net:8443/plans/149/PRIMING_PRR.md) |
| **`157`** | **`Ariadne-INT`** | `codex` | **`I-Gate` — Sole Integrator & `:3420` Deployer** | `#310`, `#311` | `asg_huVXFxnSDERY-Ir0` (`active`) | [PRIMING_INTEGRATOR.md](https://cursatory.tail123678.ts.net:8443/plans/149/PRIMING_INTEGRATOR.md) |

---

## 1. Quick-Reference Architecture & Execution Summary

- **Application Topology:** Single self-hosted Node.js (`v22.22.3`) web application bound to PortHub port **`127.0.0.1:3420`**, strictly isolated from TangleClaw's control plane (`:3102`, `:3100`, `:8443`) and exposed via a narrowly scoped public HTTPS tunnel (`cloudflared` / `ngrok` pointing solely to `127.0.0.1:3420`).
- **Two Interfaces on One Backend:**
  1. **Mobile Participant Interface (`/join`, `/me`, `/me/matches/:id`):** QR onboarding, GitHub identity submission, consent controls, research progress, top-3 evidence-backed matches (40/30/20/10 scorer), `Interested`/`Pass` controls, and mutually approved private web introductions.
  2. **16:9 Presentation Visualizer (`/stage`, `/reports`, `/roadmap`):** Full-screen live network graph, agent activity feed, match spotlight view, and interactive `v2.0.0` Sprint Reports for judges.
- **Persistence & Realtime:** Local **SQLite (`WAL` mode)** (`data/ariadne.sqlite`), in-process SQLite-leased async workers for GitHub/AI analysis, and **SSE (`GET /api/events/stream`) with automatic HTTP polling fallback (`GET /api/events/poll`)**.
- **Zero External Messaging Dependencies in MVP:** Discord (`A-013`), Medusa (`A-017`), and Morpheus are deferred to the post-hackathon roadmap.

---

## 2. Per-Train Sprint Charters (`TC-Lane-PM` Bundled Car Playbook)

| Train / Release | Window (PST) | Charter Link (MagicDNS) | Cars & Bundled Issues | Target Milestone |
|---|---|---|---|---|
| **Train 0 (`v0.1.0`)** | `09:30 – 10:15` *(45m)* | [TRAIN_0_CHARTER_v0.1.0.md](https://cursatory.tail123678.ts.net:8443/plans/149/TRAIN_0_CHARTER_v0.1.0.md) | **`Car 0-INT`:** `A-001`, `A-014` (S1), `A-015` (S1) | Freeze `src/contracts/*` & SQLite WAL schema; `:3420` live. |
| **Train 1 (`v0.2.0`)** | `10:15 – 12:00` *(1h 45m)* | [TRAIN_1_CHARTER_v0.2.0.md](https://cursatory.tail123678.ts.net:8443/plans/149/TRAIN_1_CHARTER_v0.2.0.md) | **`Car 1-A`:** `A-002`, `A-008` (Shell)<br>**`Car 1-B`:** `A-003`, `A-004`, `A-005`<br>**`Car 1-C`:** `A-006`, `A-007`<br>**`Car 1-D`:** `A-009`, `A-010`, `A-011` | **10 of 15 MVP issues shipped in 1 parallel wave by noon!** |
| **Train 2 (`v0.3.0`)** | `12:00 – 13:45` *(1h 45m)* | [TRAIN_2_CHARTER_v0.3.0.md](https://cursatory.tail123678.ts.net:8443/plans/149/TRAIN_2_CHARTER_v0.3.0.md) | **`Car 2-A`:** `A-008` (Live), `A-012`<br>**`Car 2-C`:** `A-016` + Async Worker<br>**`Car 2-D`:** Stage Intro Animations & HUD | **Full MVP (`M1`+`M2`+`M3`) live before 2:00 PM PST!** |
| **Train 3 (`v1.0.0`)** | `13:45 – 17:45` *(4.0h)* | [TRAIN_3_CHARTER_v1.0.0.md](https://cursatory.tail123678.ts.net:8443/plans/149/TRAIN_3_CHARTER_v1.0.0.md) | **`Car 3-A..D`:** Polish & Bug Fixes<br>**`Car 3-INT`:** `A-014` (S2), `A-015` (S2) | 4 hours of live dogfooding, UI polish & final `v2.0.0` Judge Reports. |

---

## 3. Core Architecture, Product & Subsystem Specifications

| Document | Shareable MagicDNS Link | Scope & Purpose |
|---|---|---|
| **Executive Project Charter** | [PROJECT_CHARTER.md](https://cursatory.tail123678.ts.net:8443/plans/149/PROJECT_CHARTER.md) | Mission, Web-Only Amendment, success tiers (`v0.1.0`–`v1.0.0`), and governance constraints. |
| **Product Requirements (PRD)** | [PRODUCT_REQUIREMENTS.md](https://cursatory.tail123678.ts.net:8443/plans/149/PRODUCT_REQUIREMENTS.md) | 12-step mobile QR user journey, progressive latency targets, and dual-interface specs. |
| **Architecture & ADRs (A–G)** | [ARCHITECTURE.md](https://cursatory.tail123678.ts.net:8443/plans/149/ARCHITECTURE.md) | Self-hosted Node.js + SQLite WAL + narrow HTTPS tunnel topology and ADRs. |
| **Data & Events Contract** | [DATA_AND_EVENTS_CONTRACT.md](https://cursatory.tail123678.ts.net:8443/plans/149/DATA_AND_EVENTS_CONTRACT.md) | Canonical SQLite table schemas, TypeScript interfaces, intro state machine, and 12 SSE/poll event types. |
| **Match Scoring Specification** | [MATCH_SCORING_SPEC.md](https://cursatory.tail123678.ts.net:8443/plans/149/MATCH_SCORING_SPEC.md) | Deterministic 40/30/20/10 heuristic formula, 7 required output fields, and 5 unit test cases (`TC-SCORE-01`..`05`). |
| **GitHub Intelligence Spec** | [GITHUB_INTELLIGENCE_SPEC.md](https://cursatory.tail123678.ts.net:8443/plans/149/GITHUB_INTELLIGENCE_SPEC.md) | Single-query GraphQL budget (`1 pt/user`), 30-min SQLite snapshot cache, and untrusted input sanitization. |
| **16:9 Stage Visualizer Spec** | [VISUALIZER_SPEC.md](https://cursatory.tail123678.ts.net:8443/plans/149/VISUALIZER_SPEC.md) | Network, Activity, and Spotlight modes, 6-KPI ribbon, pseudonymous defaults (`Thread-XXXX`), and operator hotkeys. |
| **Privacy, Identity & Security** | [PRIVACY_AND_SECURITY.md](https://cursatory.tail123678.ts.net:8443/plans/149/PRIVACY_AND_SECURITY.md) | Two-Tier Progressive Identity, bilateral consent gate, one-click data erasure, and control-plane isolation. |

---

## 4. Fleet Governance, Scheduling, Runbooks & Readiness

| Document | Shareable MagicDNS Link | Scope & Purpose |
|---|---|---|
| **Fleet Charter & Durable Rules** | [FLEET_CHARTER.md](https://cursatory.tail123678.ts.net:8443/plans/149/FLEET_CHARTER.md) | 8–9 pane fleet topology (`PM`, `Arc`, `PRR`, `INT`, `Obsr`, `Lane-A..D`), worktree isolation, and 6 Durable Fleet Rules (**`Rule #304` Active** on `projectId: 149`). |
| **Fleet Provisioning & Rule Pack** | [FLEET_PROVISIONING_PACK.md](https://cursatory.tail123678.ts.net:8443/plans/149/FLEET_PROVISIONING_PACK.md) | 1-Paste Operator Dashboard Console provisioner for the 8 remaining fleet lanes (`Ariadne-Arc`, `PRR`, `INT`, `Obsr`, `Lane-A..D`), role overlays, and priming links (`PRIMING_PM.md`, `PRIMING_ARCHITECT.md`, `PRIMING_PRR.md`, `PRIMING_INTEGRATOR.md`, `PRIMING_OBSERVER.md`, `PRIMING_BUILDER.md`). |
| **Fleet Dispatch Queue (`LANE_QUEUE`)** | [LANE_QUEUE.md](https://cursatory.tail123678.ts.net:8443/plans/149/LANE_QUEUE.md) | Live dispatch queue staging all 4 Release Trains (`v0.1.0`–`v1.0.0`), 8 Bundled Cars, and Chunk-Boundary receipt ledger (`#1889`). |
| **Roadmap Board & Sprint Reports Hub Spec** | [ROADMAP_AND_REPORTS_HUB_SPEC.md](https://cursatory.tail123678.ts.net:8443/plans/149/ROADMAP_AND_REPORTS_HUB_SPEC.md) | Specification for `/roadmap/index.html` and `/reports/index.html` (`v2.0.0` Sprint Reports Hub & Retrospective). |
| **Dependency DAG & Car Schedule** | [DEPENDENCY_DAG.md](https://cursatory.tail123678.ts.net:8443/plans/149/DEPENDENCY_DAG.md) | 4-Train DAG, file-disjoint Car write envelopes, and `changelog.d/` collision prevention. |
| **Release & Deployment Plan** | [RELEASE_PLAN.md](https://cursatory.tail123678.ts.net:8443/plans/149/RELEASE_PLAN.md) | Train cutover gates (`A-Gate`, `R-Gate`, `I-Gate`, `O-Gate`), SQLite WAL backups, and `< 15s` rollback protocol. |
| **H-Day Launch Runbook** | [HACKATHON_RUNBOOK.md](https://cursatory.tail123678.ts.net:8443/plans/149/HACKATHON_RUNBOOK.md) | Minute-by-minute post-`GO` launch sequence (`T+00` to `T+45`) and full-day schedule (`09:30 – 18:00 PST`). |
| **Stage Demo & Judging Runbook** | [DEMO_RUNBOOK.md](https://cursatory.tail123678.ts.net:8443/plans/149/DEMO_RUNBOOK.md) | 3-minute live stage script (QR scan → Spotlight → Mutual Intro → Judge Sprint Reports) and degraded-mode playbooks. |
| **Provenance & Judge Reporting** | [PROVENANCE_AND_JUDGING.md](https://cursatory.tail123678.ts.net:8443/plans/149/PROVENANCE_AND_JUDGING.md) | 3-bucket provenance ledger and TangleClaw Sprint Reporting Standard `v2.0.0` (`t1..t8` timestamps, `T_eng`, `ADE`). |
| **Technical Readiness Checklist** | [PREFLIGHT_CHECKLIST.md](https://cursatory.tail123678.ts.net:8443/plans/149/PREFLIGHT_CHECKLIST.md) | Verified host readiness (`node v22.22.3`, `gh`, `cloudflared`, `ngrok`, PortHub `3420`) and remaining Operator checks. |
| **Risk Register** | [RISK_REGISTER.md](https://cursatory.tail123678.ts.net:8443/plans/149/RISK_REGISTER.md) | 9 key technical/event risks and pre-engineered mitigations. |
| **Operator Approval Packet** | [OPERATOR_APPROVAL_PACKET.md](https://cursatory.tail123678.ts.net:8443/plans/149/OPERATOR_APPROVAL_PACKET.md) | 5 ratification decisions (`D-1`–`D-5`), minimal `.env` keys (`3–5` vars), and H-Day `GO` trigger phrase. |

---

## 5. Complete H-Day GitHub Issue Drafts (`15` Active MVP + `2` Deferred)

- **Master Backlog Index:** [ISSUE_BACKLOG_INDEX.md](https://cursatory.tail123678.ts.net:8443/plans/149/ISSUE_BACKLOG_INDEX.md)
- **Single-Page Consolidated Backlog (All Drafts):** [ISSUE_BACKLOG_COMPLETE.md](https://cursatory.tail123678.ts.net:8443/plans/149/ISSUE_BACKLOG_COMPLETE.md)

| Issue ID | Title | Train & Car | Shareable MagicDNS Link |
|---|---|---|---|
| **A-001** | Core architecture, SQLite WAL schema & data/event contracts | `Train 0` · `Car 0-INT` | [ISSUE_A-001.md](https://cursatory.tail123678.ts.net:8443/plans/149/ISSUE_A-001.md) |
| **A-002** | Mobile QR onboarding, consent & session isolation | `Train 1` · `Car 1-A` | [ISSUE_A-002.md](https://cursatory.tail123678.ts.net:8443/plans/149/ISSUE_A-002.md) |
| **A-003** | Bounded GitHub public-data connector & SQLite snapshot cache | `Train 1` · `Car 1-B` | [ISSUE_A-003.md](https://cursatory.tail123678.ts.net:8443/plans/149/ISSUE_A-003.md) |
| **A-004** | Evidence-backed capability analysis agent | `Train 1` · `Car 1-B` | [ISSUE_A-004.md](https://cursatory.tail123678.ts.net:8443/plans/149/ISSUE_A-004.md) |
| **A-005** | Opportunity and bottleneck discovery agent | `Train 1` · `Car 1-B` | [ISSUE_A-005.md](https://cursatory.tail123678.ts.net:8443/plans/149/ISSUE_A-005.md) |
| **A-006** | Deterministic 4-factor match scoring engine (`40/30/20/10`) | `Train 1` · `Car 1-C` | [ISSUE_A-006.md](https://cursatory.tail123678.ts.net:8443/plans/149/ISSUE_A-006.md) |
| **A-007** | Match research and proposal explanation agent | `Train 1` · `Car 1-C` | [ISSUE_A-007.md](https://cursatory.tail123678.ts.net:8443/plans/149/ISSUE_A-007.md) |
| **A-008** | Mobile participant profile & top-3 match results interface | `Train 1/2` · `Car 1-A / 2-A` | [ISSUE_A-008.md](https://cursatory.tail123678.ts.net:8443/plans/149/ISSUE_A-008.md) |
| **A-009** | SQLite append-only live event stream (`SSE` + polling fallback) | `Train 1` · `Car 1-D` | [ISSUE_A-009.md](https://cursatory.tail123678.ts.net:8443/plans/149/ISSUE_A-009.md) |
| **A-010** | 16:9 Presentation Visualizer — Network Mode & KPI ribbon | `Train 1` · `Car 1-D` | [ISSUE_A-010.md](https://cursatory.tail123678.ts.net:8443/plans/149/ISSUE_A-010.md) |
| **A-011** | 16:9 Presentation Visualizer — Activity & Spotlight modes | `Train 1` · `Car 1-D` | [ISSUE_A-011.md](https://cursatory.tail123678.ts.net:8443/plans/149/ISSUE_A-011.md) |
| **A-012** | Web-native mutual-introduction workflow & private intro room | `Train 2` · `Car 2-A` | [ISSUE_A-012.md](https://cursatory.tail123678.ts.net:8443/plans/149/ISSUE_A-012.md) |
| **A-014** | Self-hosted server (`:3420`), SQLite WAL, narrow HTTPS tunnel & resilience | `Train 0/3` · `Car 0-INT / 3-INT` | [ISSUE_A-014.md](https://cursatory.tail123678.ts.net:8443/plans/149/ISSUE_A-014.md) |
| **A-015** | Hackathon provenance & Per-Version `v2.0.0` Interactive Sprint Reports | `Train 0–3` · `Car 0-INT / Obsr` | [ISSUE_A-015.md](https://cursatory.tail123678.ts.net:8443/plans/149/ISSUE_A-015.md) |
| **A-016** | In-process async job worker & continuous rematching | `Train 2` · `Car 2-C` | [ISSUE_A-016.md](https://cursatory.tail123678.ts.net:8443/plans/149/ISSUE_A-016.md) |
| *A-013* | *[DEFERRED — Post-Hackathon] Discord event bot* | *Post-Hackathon* | [ISSUE_A-013.md](https://cursatory.tail123678.ts.net:8443/plans/149/ISSUE_A-013.md) |
| *A-017* | *[DEFERRED — Post-Hackathon] Medusa coordination adapter* | *Post-Hackathon* | [ISSUE_A-017.md](https://cursatory.tail123678.ts.net:8443/plans/149/ISSUE_A-017.md) |

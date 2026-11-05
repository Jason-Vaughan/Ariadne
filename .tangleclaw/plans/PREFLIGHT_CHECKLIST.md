# Pre-Hackathon Fleet & Infrastructure Readiness Checklist — ARIADNE (`ARIADNE-HACK-2026`)
*Amended: Web-Only Self-Hosted Hackathon MVP (SQLite WAL + Narrow HTTPS Tunnel)*

> **Verification Legend:**
> - `[x]` **Verified Ready Today** (via read-only preflight inspection on `cursatory.tail123678.ts.net`)
> - `[ ]` **Operator Action / Decision Before Saturday 09:30 AM PST**

---

## 1. TangleClaw Fleet & Workspace Readiness

- [x] **Isolated PM Session Created:** `Ariadne-PM` (Project ID `149`, Medusa workspace `ariadne-pm-db0f895f`) is active and attested `READY`.
- [x] **Advisory Consultation with `TC-Lane-PM` Completed:** Incorporated the 4-Train Bundled Car roadmap (`Rule #294`), Role Overlays (`Rule #285`, `#283`, `#280`, `#271`), `changelog.d/` fragments, and Sprint Reporting Standard `v2.0.0`.
- [x] **Worktree Isolation Planned:** Separate Git worktrees (`wt-arc`, `wt-prr`, `wt-obsr`, `wt-lane-a`..`d`) and non-overlapping directory ownership matrix specified in `DEPENDENCY_DAG.md`.
- [x] **PortHub Local Ports Selected (Conflict-Free):** Verified against all 67 existing PortHub leases that `3420` (Ariadne production/demo server), `3421` (Ariadne integration/test server), and `4420` (test runner) are unleased.
- [x] **Zero Interference with `v5.67.0` Sprint:** No `TC-Lane-*` or `SGM-*` repos, ports, or sessions were mutated.
- [ ] **Operator Pre-Saturday Fleet Action:** Create/stage the TangleClaw project tabs (`Ariadne-Arc`, `Ariadne-PRR`, `Ariadne-INT`, `Ariadne-Obsr`, `Ariadne-Lane-A..D`) so they are parked and ready to launch Saturday morning at `09:30 AM PST`.

---

## 2. Self-Hosted Runtime, SQLite & Narrow Public HTTPS Tunnel Readiness

- [x] **Node.js Runtime Verified:** `v22.22.3` installed locally (includes native `node:sqlite` + supports `better-sqlite3` WAL mode).
- [x] **Public HTTPS Tunnel Binaries Verified on Host:** Both `/opt/homebrew/bin/cloudflared` and `/opt/homebrew/bin/ngrok` are installed on `cursatory`.
- [x] **Strict Control-Plane Isolation Designed:** Tunnel points **exclusively** to `http://127.0.0.1:3420` (never exposing `:3102`, `:3100`, `:8443`, `:3009`, or `:3010`, and never running `tailscale serve`/`funnel` that could displace TangleClaw's Caddy front door).
- [x] **Zero External Cloud DB or Discord Bot Setup Required:** SQLite WAL handles all persistence locally; Discord, Medusa, and Morpheus are deferred to the post-hackathon roadmap.

---

## 3. GitHub Repository & API Readiness

- [x] **GitHub CLI Authenticated:** Verified `gh auth status` is logged in as `Jason-Vaughan` (`ssh` protocol, scopes: `admin:org`, `admin:public_key`, `gist`, `repo`).
- [x] **Proposed Repo Owner & Name:** `Jason-Vaughan/ariadne` (public creation command staged in `HACKATHON_RUNBOOK.md` for post-`GO` execution; **unpublished now**).
- [x] **15 MVP Issue Drafts Ready (`A-001`–`A-012`, `A-014`–`A-016`):** Stored locally in `ISSUE_BACKLOG/`.
- [x] **Licensing Deferred per Charter:** Repository will initialize without an open-source license (`UNLICENSED` / TBD until Operator decides).
- [ ] **Operator Pre-Saturday GitHub & LLM Credential Staging (Only 4 Env Vars Needed!):**
  1. `ARIADNE_GITHUB_TOKEN`: Personal Access Token (public read-only / zero private repo scopes) for the `5,000 req/hr` server-side GraphQL budget.
  2. `ARIADNE_GITHUB_OAUTH_CLIENT_ID` & `ARIADNE_GITHUB_OAUTH_CLIENT_SECRET`: Optional GitHub OAuth App (`read:user` only) for 1-click ownership verification (backed by zero-OAuth GitHub bio challenge fallback).
  3. `ARIADNE_LLM_API_KEY`: API key for bounded agent extraction with a `$25` spend cap.

---

## 4. Stage Presentation & Per-Version Judge Reporting Readiness

- [x] **16:9 Stage Specification Complete:** Network, Activity, and Spotlight modes + keyboard controls (`1/2/3/Space/N/P/S`) specified in `VISUALIZER_SPEC.md`.
- [x] **Canonical Sprint Report Standard `v2.0.0` Verified on Host:** Verified `/Users/jasonvaughan/Documents/Projects/Shared/TangleClaw-Shared/sprint-reports/metrics_schema.py` and `validate-sprint-report.py` are available as reference templates for `Ariadne-Obsr` to generate `/reports/v0.1.0`..`v1.0.0`.
- [ ] **Operator Physical Pack List for Saturday Morning:**
  - Laptop charger + HDMI / USB-C display adapter for 16:9 stage projector.
  - Phone charged + personal hotspot tested as backup internet.

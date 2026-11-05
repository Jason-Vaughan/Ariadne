# Provenance & Per-Version Judge Reporting Specification — ARIADNE (`ARIADNE-HACK-2026`)
*Amended: Incorporating TangleClaw Sprint Reporting Standard `v2.0.0` (`Rule #283.5`)*

## 1. Purpose

Objective B of the hackathon is proving to judges that a single human Operator directed a TangleClaw autonomous engineering fleet to plan, build, review, test, integrate, and ship Ariadne within the Saturday build window (`09:30 AM – 18:00 PM PST`).
To make this proof undeniable and visually compelling, Ariadne adopts **TangleClaw's Canonical Interactive Sprint Reporting Standard `v2.0.0`** (modeled on `/Users/jasonvaughan/Documents/Projects/Shared/TangleClaw-Shared/sprint-reports/SPRINT_REPORT_STANDARD.md` and `metrics_schema.py`).

---

## 2. Three-Bucket Provenance Classification

| Bucket | Time Window | What It Contains | Verification Proof |
|---|---|---|---|
| **Bucket 1: Pre-Existing Open-Source Platform (`TangleClaw`)** | Built prior to Nov 7, 2026 | TangleClaw orchestration engine, PortHub, Medusa local switchboard, Chunk-Boundary Protocol v1.0.0 (`#1889`), and Sprint Report Generator Standard `v2.0.0`. | Public Git history and tagged releases (`v5.66.0` / `v5.67.0`) in the TangleClaw repository. |
| **Bucket 2: Pre-Event Planning Package (`Ariadne-PM`)** | Prepared Nov 5–6, 2026 (Before 09:30 AM Nov 7) | The 17 Markdown planning specifications and 15 MVP issue drafts (`ISSUE_BACKLOG/A-001.md`..`A-016.md`). **Zero executable application code.** | Cryptographic SHA-256 manifest (`PRE_EVENT_MANIFEST.sha256`) committed as initial tag `v0.0.0-planning-baseline` at H-Day kickoff. |
| **Bucket 3: H-Day Autonomous Fleet Implementation (`Ariadne`)** | **Nov 7, 2026 · 09:30 AM – 17:45 PM PST** | 100% of Ariadne TypeScript source code, SQLite WAL database layer, mobile & 16:9 stage interfaces, GitHub connector, AI agents, 40/30/20/10 scorer, SSE/polling bus, and unit/integration tests. | Primary-source Git commit timestamps (`t2 >= 09:30 PST`), GitHub PR review receipts, and per-version `v2.0.0` Interactive HTML Sprint Reports (`v0.1.0`..`v1.0.0`). |

---

## 3. Per-Version Interactive Sprint Reporting Mechanism (`v2.0.0` Standard)

At the completion of every Release Train on Saturday (`v0.1.0`, `v0.2.0`, `v0.3.0`, `v1.0.0`), `Ariadne-Obsr` and `Ariadne-INT` run a Python report generator modeled on `/Users/jasonvaughan/Documents/Projects/Shared/TangleClaw-Shared/sprint-reports/generators/gen_v5660.py` and `metrics_schema.py` to publish an interactive HTML report served live at `https://<ariadne-url>/reports/v0.X.0/` and indexed at `https://<ariadne-url>/reports/`:

### 3.1 Mandatory 8-Timestamp Ledger Per Version (`t1..t8`)
Every version report embeds a machine-verifiable `<script id="tc-sprint-metrics-json" type="application/json">` block and visual timeline table recording:
1. `t1_first_activity`: Train authorization / dispatch timestamp (`>= 09:30 AM PST` for `v0.1.0`).
2. `t2_first_branch_commit`: Earliest Git commit timestamp on the Train's first feature Car (`git log --format=%aI`).
3. `t3_first_pr_opened`: Timestamp when the first Car PR opens.
4. `t4_final_feature_pr_merged`: Timestamp when the final Car PR of the Train merges to `main`.
5. `t5_release_pr_merged`: Timestamp when `Ariadne-INT` merges the compiled `CHANGELOG.md` & version bump PR.
6. `t6_release_tag_published`: Timestamp when annotated tag `v0.X.0` is pushed to GitHub.
7. `t7_live_deploy_completed`: Timestamp when the pre-cutover SQLite WAL backup SHA-256 is recorded and `http://127.0.0.1:3420/api/health` returns `200 OK` on the new version.
8. `t8_observer_certification_completed`: Timestamp when `Ariadne-Obsr` certifies `O-Gate PASS`.

### 3.2 Canonical 8-Section Interactive Report Structure for Judges
Each generated report (`v0.1.0`, `v0.2.0`, `v0.3.0`, `v1.0.0`, plus the cumulative `v0.1.0-v1.0.0-hackathon-retrospective`) includes:
- **Hero & Plain-English Summary Card (`#overview` & `#plain-english`):** Explains in clear, judge-friendly English what shipped in that Train, Total Wall Clock (`t1 → t7`), Full Engineering Window (`T_eng = t2 → t7`), First-Time Gate Pass Rate, and Autonomous Delivery Efficiency (`ADE`).
- **Section 1 (`#architecture`):** 9-node SVG diagram of the Ariadne Fleet (`Ariadne-PM`, `Ariadne-Arc`, `Ariadne-PRR`, `Ariadne-INT`, `Ariadne-Obsr`, `Ariadne-Lane-A..D`).
- **Section 2 (`#velocity`):** Canonical 8-timestamp ledger (`t1..t8`) and Car-by-Car build/review/merge latency table.
- **Section 3 (`#deliverables`):** Car-by-Car SVG bar chart (`+LOC / -LOC` and Net New Tests per PR) + deep-dive cards with clickable GitHub PR links.
- **Section 4 (`#telemetry`):** Longitudinal Train-over-Train comparison table (`v0.1.0` vs `v0.2.0` vs `v0.3.0` vs `v1.0.0`) showing throughput (`Issues/Hr`), parallel 4-lane speedup, and zero `CHANGELOG.md` collisions via `changelog.d/` fragments.
- **Section 5 (`#postmortem`):** 4-Gate Governance Audit Table (`Gate 1: A-Gate Architect`, `Gate 2: R-Gate PRR`, `Gate 3: I-Gate Integrator`, `Gate 4: O-Gate Observer`) + 16-Row `Rule #283` Empirical Evaluation Table.
- **Section 6 (`#waves`):** Interactive Car & PR Explorer with filter buttons by Lane (`Lane-A..D`, `INT`) and live search.
- **Section 7 (`#next-sprint`):** Actionable guardrails carried into the next Train.

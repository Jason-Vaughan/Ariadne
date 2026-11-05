# Fleet Resource Plan, Role Overlays & Durable Rules — ARIADNE (`ARIADNE-HACK-2026`)
*Amended: Incorporating `TC-Lane-PM` Advisory Playbook (`Rule #285`, `Rule #283`, `Rule #294`)*

## 1. Recommended Ariadne Fleet Topology (Modeled on TangleClaw's Fleet)

Per advisory consultation with `TC-Lane-PM`, Ariadne mirrors TangleClaw's battle-tested multi-agent role separation so that **code authors (`Lane-A..D`) never review or merge their own work**, and **4 Builder lanes execute in parallel without file collisions**:

| Project / Lane Name | Engine / Model Tier | Role Overlay | Core Responsibilities | Assigned Worktree |
|---|---|---|---|---|
| **`Ariadne-PM`** *(Live — ID #149)* | `antigravity` (Gemini 4 Argon / Pro) | **PM Role Overlay (`Rule #285`)** | Coordinator-only (never edits app code). Owns Train charters, `LANE_QUEUE.md`, Car dispatch, `validateNextChunkDispatch` checks, and Operator escalations. | `/Users/jasonvaughan/Documents/Projects/Ariadne-PM` |
| **`Ariadne-Arc`** | `antigravity` or `codex` | **Architect Overlay (`Rule #257`)** | Read-only architectural authority. Authors pre-dispatch export & file-envelope rulings (`W1A..W1D`) and evaluates `A-Gate` on contracts, privacy, and security boundaries. | `/Users/jasonvaughan/Documents/Projects/Ariadne-wt-arc` |
| **`Ariadne-PRR`** | `codex` | **PR Reviewer Overlay (`R-Gate`)** | Read-only, fail-closed Reviewer. Runs the 7-Goal Critic + 4-Goal Release-Readiness protocol on exact `headRefOid` of every Builder PR (`[C1]..[C7]`, `[R1]..[R4]`). | `/Users/jasonvaughan/Documents/Projects/Ariadne-wt-prr` |
| **`Ariadne-INT`** | `codex` | **Integrator Overlay (`I-Gate`)** | Sole merge and deploy executor. Bootstraps `Car 0-INT` (`v0.1.0`), merges approved PRs via `gh pr merge --merge`, compiles `changelog.d/*` into `CHANGELOG.md`, manages local PortHub server (`127.0.0.1:3420`) + narrow HTTPS tunnel, and reports `W<N>-REC` once per Train. | `/Users/jasonvaughan/Documents/Projects/Ariadne` (`main`) |
| **`Ariadne-Obsr`** | `antigravity` | **Observer Overlay (`Rule #283` / `O-Gate`)** | Pure Sprint Process & Telemetry Observer. Tracks `t1..t8` timestamps per Train and runs the Python generator to publish canonical `v2.0.0` Interactive HTML Sprint Reports (`v0.1.0`..`v1.0.0`) for judges. | `/Users/jasonvaughan/Documents/Projects/Ariadne-wt-obsr` |
| **`Ariadne-Lane-A`** | `claude` (Sonnet) | **Builder Overlay (`Rule #271`)** | Executes `Car 1-A` (`A-002`, `A-008` shell) and `Car 2-A` (`A-008` live, `A-012` Web Mutual-Intro State Machine & Intro Room). | `/Users/jasonvaughan/Documents/Projects/Ariadne-wt-lane-a` |
| **`Ariadne-Lane-B`** | `claude` (Sonnet) | **Builder Overlay (`Rule #271`)** | Executes `Car 1-B` (`A-003` GitHub Connector + `A-004` Capability Agent + `A-005` Opportunity Discovery Agent). | `/Users/jasonvaughan/Documents/Projects/Ariadne-wt-lane-b` |
| **`Ariadne-Lane-C`** | `claude` (Sonnet) | **Builder Overlay (`Rule #271`)** | Executes `Car 1-C` (`A-006` 40/30/20/10 Scorer + `A-007` Proposal Agent) and `Car 2-C` (`A-016` Continuous Rematching + SQLite Async Job Worker). | `/Users/jasonvaughan/Documents/Projects/Ariadne-wt-lane-c` |
| **`Ariadne-Lane-D`** | `claude` (Sonnet) | **Builder Overlay (`Rule #271`)** | Executes `Car 1-D` (`A-009` SQLite SSE/Poll Event Bus + `A-010` Network Graph + `A-011` Activity & Spotlight Views) and `Car 2-D` (Stage Polish & Judge HUD). | `/Users/jasonvaughan/Documents/Projects/Ariadne-wt-lane-d` |

> **Elastic Sizing Option:** If you prefer fewer active panes on Saturday, `Ariadne-Arc` and `Ariadne-PRR` can be combined into a single `Ariadne-Arc-PRR` (`codex`) pane (matching `SGM-Arc-PRR`), bringing the total fleet from 9 panes to **8 panes** (`PM`, `Arc-PRR`, `INT`, `Obsr`, `Lane-A..D`).

---

## 2. Durable Fleet Rules to Adopt (Mimicking TangleClaw's High-Velocity Rules)

These 6 rules distill `TC-Lane-PM`'s active governing rules (`#294`, `#285`, `#283`, `#280`, `#271`, `#257`) for the Ariadne fleet:

### Rule 1 — Multi-Issue File-Disjoint Car Bundling (`TC Rule #294`)
Never split co-located issues in the same Train across multiple sequential waves. Bundle 2–3 related issues per Builder lane into a single **Car** (1 branch, 1 PR) with a strictly disjoint file write envelope so an entire Train of 8–10 issues ships in **one parallel wave of 4 PRs** with zero rebase churn.

### Rule 2 — Pre-Flight Architect Export & Envelope Ruling (`TC Rule #257` / `A-Gate`)
Before `Ariadne-PM` dispatches any Car, `Ariadne-Arc` posts a concise ruling on the issue(s) specifying:
1. Exact TypeScript symbols/interfaces imported from frozen `src/contracts/*`.
2. Exact function signatures the Car must export.
3. The Car's **Allowed File Scope** (exclusive write envelope).
4. Any Car touching `src/contracts/*`, `src/db/schema.ts`, privacy/consent checks, or public tunnel config requires explicit `Ariadne-Arc` `A-Gate ACCEPT` before merge.

### Rule 3 — Single-File Changelog Fragments (`changelog.d/<car>.md`)
Builders **never** edit root `CHANGELOG.md` or `package.json` on feature branches (the #1 cause of parallel merge conflicts). Instead, each Builder Car writes `changelog.d/<car-id>.md` (`### Added` / `### Changed` / `### Fixed`). During the Train release cut (`W-REL`), `Ariadne-INT` compiles all fragments into root `CHANGELOG.md` and bumps the version tag (`v0.1.0`, `v0.2.0`, `v0.3.0`, `v1.0.0`).

### Rule 4 — Single-Turn Plan+Build Fast Path (`TC Rule #271` / `A384`)
When a Car dispatch cites an approved `Ariadne-Arc` ruling and frozen `src/contracts/*`, the Builder executes implementation, JSDoc annotation, unit tests (`vitest run`), and PR creation in a **single turn** without stopping for an intermediate plan-approval round-trip. Any requirement question is routed via Medusa (`tc message send`) to `Ariadne-INT` or `Ariadne-PM` rather than blocking on local pane input.

### Rule 5 — Formal PRR Envelope, True-Merge (`--merge`) & Chunk-Boundary Receipt (`TC Rule #286` & `#1889`)
- Every dispatch to `Ariadne-PRR` includes the formal envelope: `{ repository, base, head, headRefOid, PR #, test_output, Allowed File Scope }`.
- `Ariadne-PRR` verifies `headRefOid` matches before issuing `R-Gate ACCEPT`.
- `Ariadne-INT` merges exclusively via `gh pr merge <PR#> --merge --delete-branch` (preserving true branch topology for Judge Sprint Reports) and records the durable Chunk-Boundary Receipt (`ready_after_clear`) before `Ariadne-PM` clears/dispatches the lane for the next Train.

### Rule 6 — Quiet Routing & Switchboard Hygiene (`TC Rule #280`)
- Every lane updates `tc workload set` at dispatch acceptance, task transition, external wait, and completion.
- When receiving a Medusa message with `replyRequired: true`, always send `tc message send --in-reply-to <id>` **before** `tc message ack <id>`.
- Do not wake `Ariadne-Obsr` on individual PRs; wake `Ariadne-Obsr` once per Train boundary (`v0.1.0`, `v0.2.0`, `v0.3.0`, `v1.0.0`) to certify `O-Gate` and generate that Train's Interactive HTML Sprint Report.

# Fleet Resource Plan & Charter — ARIADNE (`ARIADNE-HACK-2026`)

## 1. Fleet Topology & Role Allocation

To maximize throughput during the 8.5-hour H-Day window without exhausting host memory or model rate limits—and without interfering with any active TangleClaw `v5.67.0` sessions—Ariadne uses a **lean, right-sized 8-role fleet** (6 persistent TangleClaw lanes + 2 consolidated reviewer/observer functions):

| Role / Lane Name | Engine / Model Tier | Primary Responsibility | Assigned Issues | Worktree / Checkout |
|---|---|---|---|---|
| **`Ariadne-PM`** *(Live — ID #149)* | `antigravity` (Gemini 4 Argon / Pro) | Charter management, issue dispatch, dependency gating (`validateNextChunkDispatch`), progress telemetry, Operator escalation, and Provenance ledger (`A-015`). | `A-015` (Provenance & Demo Evidence) | `/Users/jasonvaughan/Documents/Projects/Ariadne-PM` |
| **`Ariadne-Arc-PRR`** *(Architect + Reviewer)* | `codex` or `antigravity` | Authors foundational contracts (`A-001` design sign-off), enforces cross-lane interface boundaries, and runs Independent PR Review (`R-Gate`) on Builder PRs. | `A-001` (with Integrator), PR Review Gates | `/Users/jasonvaughan/Documents/Projects/Ariadne/wt-arc` |
| **`Ariadne-INT`** *(Integrator + Deploy)* | `codex` or `claude` | Bootstraps repository & `A-001` contract types, owns shared `package.json`/DB schema migrations, merges reviewed PRs (`I-Gate`), manages Vercel/DB deployment (`A-014`), and records Observer release snapshots. | `A-001`, `A-014` | `/Users/jasonvaughan/Documents/Projects/Ariadne/main` |
| **`Ariadne-Lane-A`** *(Builder A: Web & Flows)* | `claude` (Sonnet) | Mobile QR onboarding, consent UI, GitHub OAuth ownership check, private match results interface, and mutual-introduction state machine + Discord/Web delivery. | `A-002`, `A-008`, `A-012`, `A-013` | `/Users/jasonvaughan/Documents/Projects/Ariadne/wt-lane-a` |
| **`Ariadne-Lane-B`** *(Builder B: GitHub & Intel)* | `claude` (Sonnet) | Bounded GitHub GraphQL/REST connector, caching, rate-limit handling, Profile Research Agent, and Opportunity Discovery Agent. | `A-003`, `A-004`, `A-005` | `/Users/jasonvaughan/Documents/Projects/Ariadne/wt-lane-b` |
| **`Ariadne-Lane-C`** *(Builder C: Matching & Agents)* | `claude` (Sonnet) | Deterministic 4-factor Match Scoring Engine, Match Research & Proposal Agent, Continuous Rematching (`P2`), and optional Medusa adapter (`P2`). | `A-006`, `A-007`, `A-016`, `A-017` | `/Users/jasonvaughan/Documents/Projects/Ariadne/wt-lane-c` |
| **`Ariadne-Lane-D`** *(Builder D: Stream & Stage)* | `claude` (Sonnet) or `antigravity` | Append-only event stream (`SSE`), 16:9 Network Mode force graph, Activity Mode feed, and Spotlight Mode stage view. | `A-009`, `A-010`, `A-011` | `/Users/jasonvaughan/Documents/Projects/Ariadne/wt-lane-d` |

> **Resource Sizing Note:** Consolidating Architect + Independent PR Reviewer into `Ariadne-Arc-PRR` and Integrator + Deployment + Telemetry into `Ariadne-INT` (alongside `Ariadne-PM`) cuts persistent coordinator overhead in half while preserving strict separation between **code authors** (`Lane-A`..`D`) and **code reviewers/mergers** (`Arc-PRR` & `INT`). If extra capacity is available on Saturday, a dedicated `Ariadne-Obsr` session can be spun up; otherwise `Ariadne-PM` + `Ariadne-INT` maintain the automated provenance log.

---

## 2. Worktree & File-Ownership Isolation Matrix

To eliminate merge conflicts during parallel H-Day execution, each Builder lane owns a dedicated directory subtree after `A-001` merges:

| Directory / File Path | Exclusive Owner | Modification Rule for Other Lanes |
|---|---|---|
| `src/contracts/*`, `src/db/schema.ts`, `package.json` | `Ariadne-INT` + `Ariadne-Arc-PRR` | **Frozen after `A-001` (`Wave 0`).** Any schema or dependency addition requires an urgent request to `Ariadne-INT`. |
| `src/app/(onboarding)/*`, `src/app/me/*`, `src/app/api/participants/*`, `src/app/api/matches/*`, `src/lib/intros/*`, `src/lib/discord/*` | `Ariadne-Lane-A` | Owned by Lane A. |
| `src/lib/github/*`, `src/lib/agents/profile-research.ts`, `src/lib/agents/opportunity-discovery.ts` | `Ariadne-Lane-B` | Owned by Lane B. Exports pure functions consuming/producing `src/contracts/*` types. |
| `src/lib/scoring/*`, `src/lib/agents/match-evaluator.ts`, `src/lib/agents/intro-writer.ts`, `src/lib/medusa/*` | `Ariadne-Lane-C` | Owned by Lane C. Exports pure functions + unit tests. |
| `src/lib/events/*`, `src/app/api/events/stream/*`, `src/app/stage/*` | `Ariadne-Lane-D` | Owned by Lane D. Consumes `PublicEventEnvelope` contract. |
| `docs/provenance/*`, `CHANGELOG.md`, `FEATURES.md`, `PROJECT-MAP.md` | `Ariadne-PM` / `Ariadne-INT` | Updated at wave integration checkpoints. |

### Worktree Creation Commands (To Run on H-Day After Repo Creation)
```bash
# Executed ONLY on H-Day after Operator GO and repo initialization:
git worktree add ../Ariadne-wt-arc -b arc/review
git worktree add ../Ariadne-wt-lane-a -b feat/lane-a-wave1
git worktree add ../Ariadne-wt-lane-b -b feat/lane-b-wave1
git worktree add ../Ariadne-wt-lane-c -b feat/lane-c-wave1
git worktree add ../Ariadne-wt-lane-d -b feat/lane-d-wave1
```
*(All branch retirements must run `tc branch check <branch>` first and proceed only on `safe` exit 0.)*

---

## 3. Governance Gates & Permissions

1. **Chunk-Boundary Protocol v1.0.0 Enforcement:**
   - Every wave chunk requires a durable receipt (commit SHA, test pass output, `CHANGELOG.md` entry, JSDoc check, and Builder acknowledgment) before `Ariadne-PM` dispatches Chunk $N+1$.
2. **Independent Review Gate (`R-Gate`):**
   - No Builder merges their own PR.
   - `Ariadne-Arc-PRR` verifies: (a) contract compliance, (b) unit test coverage, (c) JSDoc presence on all exported functions, (d) privacy/consent invariants (no unconsented stage fields, no raw token leaks), and (e) `CHANGELOG.md` update.
3. **Integration & Deployment Gate (`I-Gate`):**
   - `Ariadne-INT` merges `R-Gate`-approved PRs into `main`, verifies the integrated build (`npm test && npm run build`), tags milestone checkpoints (`v0.1.0-m1`, `v0.2.0-m2`, `v0.3.0-m3`), and monitors Vercel production health.
4. **Coexistence with TangleClaw `v5.67.0`:**
   - If any `TC-Lane-*` or `SGM-*` session is still active on Saturday morning, Operator can pause/park idle lanes before launching `Ariadne-Lane-A..D` so concurrent active model sessions stay `<= 6`.

# Ariadne (`ARIADNE-HACK-2026`) — Interactive Parallel Roadmap Board

Releases at the top. Issues are sorted into versions (`v0.1.0` → `v0.2.0` → `v0.3.0` → `v0.4.0` → `v1.0.0`) using **`TC-Lane-PM`'s Pairwise Disjoint File-Envelope Algorithm (`Envelope(A) ∩ Envelope(B) = ∅`)** so that within every release version, all active Builder lanes (`Ariadne-Lane-A`, `Lane-B`, `Lane-C`, `Lane-D`) execute **1-Issue Solo Dispatches (`1 Issue = 1 Builder Lane = 1 PR`)** in parallel with **zero shared-file collisions** and no artificial multi-issue bundling.

> **Pre-Event Preparation State:** All 15 Hackathon MVP issues (`#1`–`#12`, `#14`–`#16`) are staged and sorted below. Zero application code is written prior to Saturday, November 7, 2026 @ `09:30 AM PST` Operator `GO`.

Each item shows its issue number and its state in words. The colours and what each state means are in the legend the page draws above the first release. Press any issue pill to read its detail and click through to its full specification.

_Data as of 2026-11-05 22:36 PST._ Sorted by `Ariadne-PM` (`#149`) per `TC-Lane-PM` (`#74`) File-Collision Sorting Methodology.

| Release | Window (PST) | Name | Parallel Solo Lanes | Issues | Done | Pairwise File Overlap |
|---|---|---|---|---|---|---|
| **v0.1.0** | `09:30 – 10:05` *(35m)* | Foundation, Contracts, Server & Live Event Bus | 4 (`Lane-A..D`) | 4 | 0 | **`∅` (`0` shared files)** |
| **v0.2.0** | `10:05 – 11:00` *(55m)* | QR Onboarding, GitHub Connector, Scorer & Stage Graph | 4 (`Lane-A..D`) | 4 | 0 | **`∅` (`0` shared files)** |
| **v0.3.0** | `11:00 – 12:00` *(60m)* | Capability AI, Match Explanations, Mobile UI & Stage Modes | 4 (`Lane-A..D`) | 4 | 0 | **`∅` (`0` shared files)** |
| **v0.4.0** | `12:00 – 13:00` *(60m)* | Mutual Intro Room, Opportunity Agent & Async Job Worker | 3 (`Lane-A..C`) | 3 | 0 | **`∅` (`0` shared files)** |
| **v1.0.0** | `13:00 – 17:45` *(4h 45m)* | Live QR Dogfooding, Stage Polish & Judge Provenance Pack | 4 (`Lane-A..D` + `Obsr`) | 2 *(Slice 2)* | 0 | **`∅` (`0` shared files)** |

---

## How the Issues Were Sorted (`TC-Lane-PM` 3-Bucket File-Collision Algorithm)

1. **Bucket 1 — Pure Disjoint Solo Issues (`Envelope(i) ∩ Envelope(j) = ∅`):**
   - When two issues touch completely separate directories (`src/github/*` vs `src/matching/*` vs `public/stage/*` vs `public/app/*`), they are placed in the **same release version** and dispatched **solo in parallel (`1 Issue = 1 Lane = 1 PR`)** — no multi-issue Cars or Trains needed.
2. **Bucket 2 — Shared-Subsystem Issues (`Envelope(i) ∩ Envelope(j) ≠ ∅`):**
   - When two issues touch the same subsystem files, they are **sequenced into consecutive versions** so two builders never touch the same file at the same time:
     - **Mobile Web (`public/app/*`):** `#2 (A-002 Onboarding)` in `v0.2.0` → `#8 (A-008 Profile & Match Cards)` in `v0.3.0` → `#12 (A-012 Private Intro Room)` in `v0.4.0`.
     - **AI Intelligence (`src/intelligence/*`):** `#3 (A-003 GitHub Connector)` in `v0.2.0` → `#4 (A-004 Capability Agent)` in `v0.3.0` → `#5 (A-005 Opportunity Agent)` in `v0.4.0`.
     - **Matching Engine (`src/matching/*`):** `#6 (A-006 Deterministic 40/30/20/10 Scorer)` in `v0.2.0` → `#7 (A-007 Match Explanation Agent)` in `v0.3.0` → `#16 (A-016 Continuous Rematch Worker)` in `v0.4.0`.
     - **16:9 Stage Visualizer (`public/stage/*`):** `#10 (A-010 Network Graph & KPI Ribbon)` in `v0.2.0` → `#11 (A-011 Activity Feed & Spotlight Modes)` in `v0.3.0`.
3. **Bucket 3 — Shared Chokepoint / Entrypoint Isolation (`v0.1.0`):**
   - `#1 (A-001 Contracts & SQLite Schema)` and `#14 (A-014 Express Server & Auto-Route Loader)` land in `v0.1.0` (`09:30–10:05 PST`). Because `#14` includes an auto-discovery route registry (`src/routes/*.ts`), **zero** feature issues in `v0.2.0`–`v0.4.0` ever need to edit `src/server.ts`, `src/db/schema.sql`, or `package.json`.

---

## v0.1.0 — Foundation, Contracts, Server & Live Event Bus (`09:30 – 10:05 PST`)

**0 of 4 cars done** · 4 workstreams in parallel

- Freeze canonical TypeScript interfaces (`src/contracts/*`) and SQLite WAL schema (`src/db/schema.sql`).
- Boot Express server on PortHub port `127.0.0.1:3420` with auto-mounted route loader and narrow public HTTPS tunnel (`cloudflared`/`ngrok`).
- Stand up append-only SQLite event bus (`SSE GET /api/events/stream` + fallback `GET /api/events/poll`).
- Publish live `/roadmap` and `/reports` (`v2.0.0` Sprint Reports Hub) static mounts.

**Can start in parallel:** Solo #1 (A-001): Contracts & SQLite WAL Schema; Solo #13 (A-014): Self-Hosted `:3420` Server & Auto-Route Loader; Solo #9 (A-009): SSE + Polling Fallback Event Bus; Solo #14 (A-015): Live Roadmap & v2.0.0 Sprint Reports Hub.
*(Shared Governance Envelope Rule: Every Car across all versions is authorized to append its `[Unreleased]` entry to `CHANGELOG.md` and update `.prawduct/*` governance artifacts; `Ariadne-INT` resolves/combines `CHANGELOG.md` entries at merge time. `Refs #N` or `Closes #N` are both accepted on Wave PRs.)*

- **Solo #1 (A-001): Contracts & SQLite WAL Schema** — 0 of 1 done · lane: Ariadne-Lane-A · Exclusive envelope: `src/contracts/types.ts`, `src/contracts/events.ts`, `src/db/schema.sql`, `tests/contracts.test.ts` (+ shared `CHANGELOG.md`, `package.json`, `tsconfig.json`).
- **Solo #13 (A-014): Self-Hosted `:3420` Server & Auto-Route Loader** — 0 of 1 done · lane: Ariadne-Lane-B · Exclusive envelope: `src/server.ts`, `src/db/client.ts`, `src/routes/health.ts`, `scripts/tunnel.sh`, `tests/server.test.ts` (+ shared `CHANGELOG.md`, `package.json`, `tsconfig.json`).
- **Solo #9 (A-009): SSE + Polling Fallback Event Bus** — 0 of 1 done · lane: Ariadne-Lane-C · Exclusive envelope: `src/events/bus.ts`, `src/routes/events.ts`, `tests/events.test.ts` (+ shared `CHANGELOG.md`).
- **Solo #14 (A-015): Live Roadmap & v2.0.0 Sprint Reports Hub** — 0 of 1 done · lane: Ariadne-Lane-D · Exclusive envelope: `public/reports/index.html`, `public/roadmap/index.html`, `scripts/build-sprint-report.js`, `tests/reports.test.ts` (+ shared `CHANGELOG.md`).

```tc-release
{
 "version": "0.1.0",
 "trains": [
  {
   "kind": "bucket",
   "title": "Solo #1 (A-001): Contracts & SQLite WAL Schema [Envelope: src/contracts/*, src/db/schema.sql]",
   "owner": "Ariadne-Lane-A",
   "verified": false,
   "cars": [
    {
     "issue": 1,
     "closed": false,
     "state": "open",
     "href": "https://cursatory.tail123678.ts.net:8443/plans/149/ISSUE_A-001.md",
     "type": "feature",
     "title": "A-001: Core architecture, SQLite WAL schema & data/event contracts"
    }
   ],
   "sequencing": "Solo parallel dispatch (1 issue = 1 lane = 1 PR). Zero shared-file overlap with Lanes B, C, or D."
  },
  {
   "kind": "bucket",
   "title": "Solo #14 (A-014): Self-Hosted :3420 Server & Auto-Route Loader [Envelope: src/server.ts, src/db/client.ts]",
   "owner": "Ariadne-Lane-B",
   "verified": false,
   "cars": [
    {
     "issue": 14,
     "closed": false,
     "state": "open",
     "href": "https://cursatory.tail123678.ts.net:8443/plans/149/ISSUE_A-014.md",
     "type": "feature",
     "title": "A-014: Self-hosted server (:3420), SQLite WAL connection, narrow HTTPS tunnel & resilience"
    }
   ],
   "sequencing": "Solo parallel dispatch (1 issue = 1 lane = 1 PR). Zero shared-file overlap with Lanes A, C, or D."
  },
  {
   "kind": "bucket",
   "title": "Solo #9 (A-009): SSE + Polling Fallback Event Bus [Envelope: src/events/bus.ts, src/routes/events.ts]",
   "owner": "Ariadne-Lane-C",
   "verified": false,
   "cars": [
    {
     "issue": 9,
     "closed": false,
     "state": "open",
     "href": "https://cursatory.tail123678.ts.net:8443/plans/149/ISSUE_A-009.md",
     "type": "feature",
     "title": "A-009: SQLite append-only live event stream (SSE + automatic HTTP polling fallback)"
    }
   ],
   "sequencing": "Solo parallel dispatch (1 issue = 1 lane = 1 PR). Zero shared-file overlap with Lanes A, B, or D."
  },
  {
   "kind": "bucket",
   "title": "Solo #15 (A-015): Live Roadmap & v2.0.0 Sprint Reports Hub [Envelope: public/reports/*, public/roadmap/*]",
   "owner": "Ariadne-Lane-D",
   "verified": false,
   "cars": [
    {
     "issue": 15,
     "closed": false,
     "state": "open",
     "href": "https://cursatory.tail123678.ts.net:8443/plans/149/ISSUE_A-015.md",
     "type": "feature",
     "title": "A-015: Hackathon provenance & Per-Version v2.0.0 Interactive Sprint Reports Hub"
    }
   ],
   "sequencing": "Solo parallel dispatch (1 issue = 1 lane = 1 PR). Zero shared-file overlap with Lanes A, B, or C."
  }
 ]
}
```

---

## v0.2.0 — QR Onboarding, GitHub Connector, Scorer & Stage Graph (`10:05 – 11:00 PST`)

**0 of 4 cars done** · 4 workstreams in parallel

- Deliver mobile QR onboarding (`/join`), GitHub identity validation, two-tier privacy consent, and `HttpOnly` session cookies (`#2` / `A-002`).
- Deliver bounded 1-query GraphQL GitHub public-data connector, 30-minute SQLite snapshot cache, and prompt-injection sanitizer (`#3` / `A-003`).
- Deliver deterministic 4-factor match scoring engine (`40/30/20/10` + `<= 0.72` anti-clone threshold) with 5 unit test cases (`#6` / `A-006`).
- Deliver 16:9 Presentation Visualizer Network Mode (`/stage`), pseudonymous node rendering (`Thread-XXXX`), and 6-KPI ribbon (`#10` / `A-010`).

**Can start in parallel:** Solo #2 (A-002): Mobile QR Onboarding & Session Isolation; Solo #3 (A-003): Bounded GitHub Public-Data Connector & Cache; Solo #6 (A-006): Deterministic 4-Factor Match Scoring Engine; Solo #10 (A-010): 16:9 Stage Visualizer Network Graph & KPI Ribbon.

- **Solo #2 (A-002): Mobile QR Onboarding & Session Isolation** — 0 of 1 done · lane: Ariadne-Lane-A · Exclusive envelope: `src/routes/onboarding.ts`, `src/auth/session.ts`, `public/app/join.html`, `public/app/join.js`, `tests/onboarding.test.ts`.
  - Car dependencies: #2 waits on #1, #14.
- **Solo #3 (A-003): Bounded GitHub Public-Data Connector & Cache** — 0 of 1 done · lane: Ariadne-Lane-B · Exclusive envelope: `src/github/connector.ts`, `src/github/cache.ts`, `src/github/sanitize.ts`, `tests/github-connector.test.ts`.
  - Car dependencies: #3 waits on #1.
- **Solo #6 (A-006): Deterministic 4-Factor Match Scoring Engine** — 0 of 1 done · lane: Ariadne-Lane-C · Exclusive envelope: `src/matching/scorer.ts`, `src/matching/anti-clone.ts`, `tests/scorer.test.ts`.
  - Car dependencies: #6 waits on #1.
- **Solo #10 (A-010): 16:9 Stage Visualizer Network Graph & KPI Ribbon** — 0 of 1 done · lane: Ariadne-Lane-D · Exclusive envelope: `public/stage/index.html`, `public/stage/network-graph.js`, `public/stage/stage.css`, `src/routes/stage-snapshot.ts`, `tests/stage-snapshot.test.ts`.
  - Car dependencies: #10 waits on #1, #9.

```tc-release
{
 "version": "0.2.0",
 "trains": [
  {
   "kind": "bucket",
   "title": "Solo #2 (A-002): Mobile QR Onboarding & Session Isolation [Envelope: src/routes/onboarding.ts, public/app/join.*]",
   "owner": "Ariadne-Lane-A",
   "verified": false,
   "cars": [
    {
     "issue": 2,
     "closed": false,
     "state": "open",
     "href": "https://cursatory.tail123678.ts.net:8443/plans/149/ISSUE_A-002.md",
     "type": "feature",
     "title": "A-002: Mobile QR onboarding, consent & session isolation"
    }
   ],
   "sequencing": "Solo parallel dispatch (1 issue = 1 lane = 1 PR). Zero shared-file overlap with Lanes B, C, or D."
  },
  {
   "kind": "bucket",
   "title": "Solo #3 (A-003): Bounded GitHub Public-Data Connector & Cache [Envelope: src/github/*]",
   "owner": "Ariadne-Lane-B",
   "verified": false,
   "cars": [
    {
     "issue": 3,
     "closed": false,
     "state": "open",
     "href": "https://cursatory.tail123678.ts.net:8443/plans/149/ISSUE_A-003.md",
     "type": "feature",
     "title": "A-003: Bounded GitHub public-data connector & SQLite snapshot cache"
    }
   ],
   "sequencing": "Solo parallel dispatch (1 issue = 1 lane = 1 PR). Zero shared-file overlap with Lanes A, C, or D."
  },
  {
   "kind": "bucket",
   "title": "Solo #6 (A-006): Deterministic 4-Factor Match Scoring Engine [Envelope: src/matching/scorer.ts]",
   "owner": "Ariadne-Lane-C",
   "verified": false,
   "cars": [
    {
     "issue": 6,
     "closed": false,
     "state": "open",
     "href": "https://cursatory.tail123678.ts.net:8443/plans/149/ISSUE_A-006.md",
     "type": "feature",
     "title": "A-006: Deterministic 4-factor match scoring engine (40/30/20/10)"
    }
   ],
   "sequencing": "Solo parallel dispatch (1 issue = 1 lane = 1 PR). Zero shared-file overlap with Lanes A, B, or D."
  },
  {
   "kind": "bucket",
   "title": "Solo #10 (A-010): 16:9 Stage Visualizer Network Graph & KPI Ribbon [Envelope: public/stage/network-graph.js, src/routes/stage-snapshot.ts]",
   "owner": "Ariadne-Lane-D",
   "verified": false,
   "cars": [
    {
     "issue": 10,
     "closed": false,
     "state": "open",
     "href": "https://cursatory.tail123678.ts.net:8443/plans/149/ISSUE_A-010.md",
     "type": "feature",
     "title": "A-010: 16:9 Presentation Visualizer — Network Mode & KPI ribbon"
    }
   ],
   "sequencing": "Solo parallel dispatch (1 issue = 1 lane = 1 PR). Zero shared-file overlap with Lanes A, B, or C."
  }
 ]
}
```

---

## v0.3.0 — Capability AI, Match Explanations, Mobile UI & Stage Modes (`11:00 – 12:00 PST`)

**0 of 4 cars done** · 4 workstreams in parallel

- Deliver mobile participant profile (`/me`), live research progress stepper, and top-3 evidence-backed match cards with `Interested` / `Pass` actions (`#8` / `A-008`).
- Deliver evidence-backed Capability Analysis Agent citing real GitHub repositories and activity (`#4` / `A-004`).
- Deliver Match Research & Proposal Explanation Agent generating concrete collaboration hypotheses (`#7` / `A-007`).
- Deliver 16:9 Presentation Visualizer Activity Feed & Spotlight Modes plus Operator privacy/hotkey HUD (`#11` / `A-011`).

**Can start in parallel:** Solo #8 (A-008): Mobile Profile & Top-3 Match Results UI; Solo #4 (A-004): Evidence-Backed Capability Analysis Agent; Solo #7 (A-007): Match Research & Proposal Explanation Agent; Solo #11 (A-011): 16:9 Stage Visualizer Activity & Spotlight Modes.

- **Solo #8 (A-008): Mobile Profile & Top-3 Match Results UI** — 0 of 1 done · lane: Ariadne-Lane-A · Exclusive envelope: `public/app/me.html`, `public/app/me.js`, `public/app/app.css`, `src/routes/me.ts`, `tests/me-routes.test.ts`.
  - Car dependencies: #8 waits on #2, #9.
- **Solo #4 (A-004): Evidence-Backed Capability Analysis Agent** — 0 of 1 done · lane: Ariadne-Lane-B · Exclusive envelope: `src/intelligence/capability-agent.ts`, `src/intelligence/prompts.ts`, `tests/capability-agent.test.ts`.
  - Car dependencies: #4 waits on #3.
- **Solo #7 (A-007): Match Research & Proposal Explanation Agent** — 0 of 1 done · lane: Ariadne-Lane-C · Exclusive envelope: `src/matching/explanation-agent.ts`, `src/matching/evidence-formatter.ts`, `tests/explanation-agent.test.ts`.
  - Car dependencies: #7 waits on #6.
- **Solo #11 (A-011): 16:9 Stage Visualizer Activity & Spotlight Modes** — 0 of 1 done · lane: Ariadne-Lane-D · Exclusive envelope: `public/stage/spotlight.js`, `public/stage/activity-feed.js`, `public/stage/operator-controls.js`, `tests/stage-modes.test.ts`.
  - Car dependencies: #11 waits on #10.

```tc-release
{
 "version": "0.3.0",
 "trains": [
  {
   "kind": "bucket",
   "title": "Solo #8 (A-008): Mobile Profile & Top-3 Match Results UI [Envelope: public/app/me.*, src/routes/me.ts]",
   "owner": "Ariadne-Lane-A",
   "verified": false,
   "cars": [
    {
     "issue": 8,
     "closed": false,
     "state": "open",
     "href": "https://cursatory.tail123678.ts.net:8443/plans/149/ISSUE_A-008.md",
     "type": "feature",
     "title": "A-008: Mobile participant profile & top-3 match results interface"
    }
   ],
   "sequencing": "Solo parallel dispatch (1 issue = 1 lane = 1 PR). Sequenced after v0.2.0 #2 so public/app/* has zero concurrent writers."
  },
  {
   "kind": "bucket",
   "title": "Solo #4 (A-004): Evidence-Backed Capability Analysis Agent [Envelope: src/intelligence/capability-agent.ts]",
   "owner": "Ariadne-Lane-B",
   "verified": false,
   "cars": [
    {
     "issue": 4,
     "closed": false,
     "state": "open",
     "href": "https://cursatory.tail123678.ts.net:8443/plans/149/ISSUE_A-004.md",
     "type": "feature",
     "title": "A-004: Evidence-backed capability analysis agent"
    }
   ],
   "sequencing": "Solo parallel dispatch (1 issue = 1 lane = 1 PR). Sequenced after v0.2.0 #3 (GitHub connector)."
  },
  {
   "kind": "bucket",
   "title": "Solo #7 (A-007): Match Research & Proposal Explanation Agent [Envelope: src/matching/explanation-agent.ts]",
   "owner": "Ariadne-Lane-C",
   "verified": false,
   "cars": [
    {
     "issue": 7,
     "closed": false,
     "state": "open",
     "href": "https://cursatory.tail123678.ts.net:8443/plans/149/ISSUE_A-007.md",
     "type": "feature",
     "title": "A-007: Match research and proposal explanation agent"
    }
   ],
   "sequencing": "Solo parallel dispatch (1 issue = 1 lane = 1 PR). Sequenced after v0.2.0 #6 (Scorer)."
  },
  {
   "kind": "bucket",
   "title": "Solo #11 (A-011): 16:9 Stage Visualizer Activity & Spotlight Modes [Envelope: public/stage/spotlight.js, public/stage/activity-feed.js]",
   "owner": "Ariadne-Lane-D",
   "verified": false,
   "cars": [
    {
     "issue": 11,
     "closed": false,
     "state": "open",
     "href": "https://cursatory.tail123678.ts.net:8443/plans/149/ISSUE_A-011.md",
     "type": "feature",
     "title": "A-011: 16:9 Presentation Visualizer — Activity & Spotlight modes"
    }
   ],
   "sequencing": "Solo parallel dispatch (1 issue = 1 lane = 1 PR). Sequenced after v0.2.0 #10 so public/stage/* has zero concurrent writers."
  }
 ]
}
```

---

## v0.4.0 — Mutual Intro Room, Opportunity Agent & Async Job Worker (`12:00 – 13:00 PST`)

**0 of 3 cars done** · 3 workstreams in parallel

- Deliver web-native double-opt-in Mutual Introduction state machine (`approval_a = 1 AND approval_b = 1`), contact card reveal gate, and private Web Introduction Room (`/me/matches/:id`) (`#12` / `A-012`).
- Deliver Opportunity & Bottleneck Discovery Agent extracting high-value complementary collaboration needs (`#5` / `A-005`).
- Deliver in-process SQLite-leased async job worker, continuous incremental rematching, and 24-persona golden seed fixture (`#16` / `A-016`).
- **Complete all 15 Hackathon MVP issues by `13:00 PM PST` (1:00 PM)!**

**Can start in parallel:** Solo #12 (A-012): Mutual-Introduction Workflow & Private Intro Room; Solo #5 (A-005): Opportunity & Bottleneck Discovery Agent; Solo #16 (A-016): Async SQLite Job Worker & Continuous Rematching.

- **Solo #12 (A-012): Mutual-Introduction Workflow & Private Intro Room** — 0 of 1 done · lane: Ariadne-Lane-A · Exclusive envelope: `src/routes/introductions.ts`, `src/matching/intro-state-machine.ts`, `public/app/intro-room.js`, `tests/introductions.test.ts`.
  - Car dependencies: #12 waits on #8.
- **Solo #5 (A-005): Opportunity & Bottleneck Discovery Agent** — 0 of 1 done · lane: Ariadne-Lane-B · Exclusive envelope: `src/intelligence/opportunity-agent.ts`, `tests/opportunity-agent.test.ts`.
  - Car dependencies: #5 waits on #4.
- **Solo #16 (A-016): Async SQLite Job Worker & Continuous Rematching** — 0 of 1 done · lane: Ariadne-Lane-C · Exclusive envelope: `src/worker/job-runner.ts`, `src/worker/seed-personas.ts`, `data/golden-seed-24.json`, `tests/worker.test.ts`.
  - Car dependencies: #16 waits on #3, #4, #6, #7.

```tc-release
{
 "version": "0.4.0",
 "trains": [
  {
   "kind": "bucket",
   "title": "Solo #12 (A-012): Mutual-Introduction Workflow & Private Intro Room [Envelope: src/routes/introductions.ts, public/app/intro-room.js]",
   "owner": "Ariadne-Lane-A",
   "verified": false,
   "cars": [
    {
     "issue": 12,
     "closed": false,
     "state": "open",
     "href": "https://cursatory.tail123678.ts.net:8443/plans/149/ISSUE_A-012.md",
     "type": "feature",
     "title": "A-012: Web-native mutual-introduction workflow & private intro room"
    }
   ],
   "sequencing": "Solo parallel dispatch (1 issue = 1 lane = 1 PR). Sequenced after v0.3.0 #8."
  },
  {
   "kind": "bucket",
   "title": "Solo #5 (A-005): Opportunity & Bottleneck Discovery Agent [Envelope: src/intelligence/opportunity-agent.ts]",
   "owner": "Ariadne-Lane-B",
   "verified": false,
   "cars": [
    {
     "issue": 5,
     "closed": false,
     "state": "open",
     "href": "https://cursatory.tail123678.ts.net:8443/plans/149/ISSUE_A-005.md",
     "type": "feature",
     "title": "A-005: Opportunity and bottleneck discovery agent"
    }
   ],
   "sequencing": "Solo parallel dispatch (1 issue = 1 lane = 1 PR). Sequenced after v0.3.0 #4 so src/intelligence/* has zero concurrent writers."
  },
  {
   "kind": "bucket",
   "title": "Solo #16 (A-016): Async SQLite Job Worker & Continuous Rematching [Envelope: src/worker/*, data/golden-seed-24.json]",
   "owner": "Ariadne-Lane-C",
   "verified": false,
   "cars": [
    {
     "issue": 16,
     "closed": false,
     "state": "open",
     "href": "https://cursatory.tail123678.ts.net:8443/plans/149/ISSUE_A-016.md",
     "type": "feature",
     "title": "A-016: In-process async job worker & continuous rematching"
    }
   ],
   "sequencing": "Solo parallel dispatch (1 issue = 1 lane = 1 PR). Zero shared-file overlap with Lanes A or B."
  }
 ]
}
```

---

## v1.0.0 — Live QR Dogfooding, Stage Polish & Judge Provenance Pack (`13:00 – 17:45 PST`)

**0 of 2 cars done** · 2 workstreams in parallel *(plus 4h 45m runway for live dogfooding bug fixes & UI polish)*

- 4 hours and 45 minutes dedicated to live QR room dogfooding, mobile UX polish, 60fps stage animations, rate-limit chaos rehearsal, and final judge presentation readiness.
- Publish final `v2.0.0` Interactive Sprint Reports (`v0.1.0.html`..`v1.0.0.html`) and GitHub Pages (`gh-pages`) public roadmap & provenance ledger (`#14` Slice 2 + `#15` Slice 2).

**Can start in parallel:** Final Resilience & Demo Rehearsal (#14 Slice 2); Final v2.0.0 Judge Sprint Reports & Provenance Ledger (#15 Slice 2).

- **Final Resilience & Demo Rehearsal (#14 Slice 2)** — 0 of 1 done · lane: Ariadne-INT · Offline snapshot cache rehearsal, SQLite WAL backup check, and 3-minute stage demo dry-run.
- **Final v2.0.0 Judge Sprint Reports & Provenance Ledger (#15 Slice 2)** — 0 of 1 done · lane: Ariadne-Obsr · Generates `public/reports/v1.0.0.html`, updates `public/reports/index.html`, and publishes to `gh-pages`.

```tc-release
{
 "version": "1.0.0",
 "trains": [
  {
   "kind": "bucket",
   "title": "Final Resilience, Tunnel Verification & Stage Demo Rehearsal (#14 Slice 2)",
   "owner": "Ariadne-INT",
   "verified": false,
   "cars": [
    {
     "issue": 14,
     "closed": false,
     "state": "open",
     "href": "https://cursatory.tail123678.ts.net:8443/plans/149/DEMO_RUNBOOK.md",
     "type": "chore",
     "title": "A-014 (Slice 2): Offline fallback verification, SQLite WAL backup & 3-minute stage demo rehearsal"
    }
   ],
   "sequencing": "Runs across the 13:00–17:45 PST polish window alongside live dogfooding bug-fix PRs."
  },
  {
   "kind": "bucket",
   "title": "Final v2.0.0 Judge Sprint Reports & Provenance Publication (#15 Slice 2)",
   "owner": "Ariadne-Obsr",
   "verified": false,
   "cars": [
    {
     "issue": 15,
     "closed": false,
     "state": "open",
     "href": "https://cursatory.tail123678.ts.net:8443/plans/149/PROVENANCE_AND_JUDGING.md",
     "type": "documentation",
     "title": "A-015 (Slice 2): Publish v0.1.0–v1.0.0 Sprint Reports (v2.0.0 standard) & H-Day Provenance Proof"
    }
   ],
   "sequencing": "Publishes after each version tag and finalizes v1.0.0 report + gh-pages push before 17:45 PST."
  }
 ]
}
```

---

## Not scheduled (Deferred to Post-Hackathon V2 Roadmap)

**2 issues** deliberately excluded from the Saturday Hackathon MVP per the **Web-Only Self-Hosted Hackathon MVP Architecture Amendment**.

| Issue | Type | State | Reason for Deferral |
|---|---|---|---|
| [A-013 (#13)](https://cursatory.tail123678.ts.net:8443/plans/149/ISSUE_A-013.md) | feature | deferred | Discord event bot & thread creation superseded by Web-Native Mutual Introduction Room (`A-012`, `/me/matches/:id`). |
| [A-017 (#17)](https://cursatory.tail123678.ts.net:8443/plans/149/ISSUE_A-017.md) | feature | deferred | Medusa runtime coordination adapter superseded by in-process SQLite-leased async worker (`A-016`). |

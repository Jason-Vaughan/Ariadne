# Feature Index

<!--
Maintained automatically: the wrap-step handler appends
stubs when PRs touch new files. Fill in descriptions before
next wrap.

Format: - **Name** — short description. `file.js` plus stable anchors:
`file.js#symbolName` for a function/const, or a literal route string
for server routes. NO :line pointers — nothing re-verifies them, so
they rot.
-->

## UI / Web

- **Public Roadmap Preview Page** — standalone preview HTML for the Ariadne Trains & Cars public roadmap board: `roadmap-board/Ariadne-Public-Roadmap-preview.html`.
- **Interactive Roadmap Board** — Trains & Cars sprint board UI with live GitHub issue status projection: `roadmap-board/index.html`.
- **Published Sprint Reports Hub** — generated public index comparing all released Sprint Reports (`v0.1.0`–`v0.4.0`): `public/reports/index.html`.
- **Published Public Roadmap Page** — generated `/roadmap/` page showing live release waves, workstreams, and issue states: `public/roadmap/index.html`.
- **Mobile QR Join Page** — zero-OAuth mobile onboarding screen (`/join`) for entering a GitHub handle, website, and hackathon goal: `public/app/join.html`.
- **Mobile QR Join Client Script** — client-side form submission, handle validation, and redirect logic for `/join`: `public/app/join.js`.
- **16:9 Venue Stage Shell** — four-view projector visualizer (`/stage`) with live network graph, pipeline feed, fingerprints, match spotlight, floating QR, and operator HUD: `public/stage/index.html`.
- **Stage View 1 Network Graph** — force-directed canvas graph rendering builder nodes, GitHub avatars, complementarity edges, and Golden Arc bilateral intros: `public/stage/network-graph.js`.
- **Venue Stage Stylesheet** — dark-mode 16:9 projector styling, animations, modal explainers, and HUD layout for `/stage`: `public/stage/stage.css`.
- **Published Sprint v0.1.0 Report** — served static copy of the canonical `v0.1.0` executive sprint report at `/reports/v0.1.0/`: `public/reports/v0.1.0/index.html`.
- **Sprint Reports Hub Source Template** — canonical source HTML for the Autonomous Sprint Reports Hub (`SPRINT_REPORT_CONTRACT v2.0.0`): `sprint-reports/index.html`.
- **Canonical Sprint v0.1.0 Report** — Wave 1 (`v0.1.0`) executive engineering and telemetry report source: `sprint-reports/v0.1.0/index.html`.
- **Stage View 2 Live Activity Feed** — real-time stage pipeline ticker and analyzer stepper naming consenting builders: `public/stage/activity-feed.js`.
- **Stage View 3 Builder Fingerprints Grid** — 6-axis radar chart gallery and superpower badges for ready participants on `/stage`: `public/stage/fingerprints.js`.
- **Stage Operator HUD Controls** — keyboard hotkeys (`1`–`4`, `Space`, `N`, `S`, `Q`, `F`, `?`) and presenter-only seed toggle for `/stage`: `public/stage/operator-controls.js`.
- **Stage View 4 Match Spotlight Carousel** — rotating high-complementarity match cards and completed mutual introduction celebration view: `public/stage/spotlight.js`.
- **Mobile Participant App Stylesheet** — responsive mobile-first CSS for `/join`, `/me`, and `/me/matches/:id`: `public/app/app.css`.
- **Mobile Participant Dashboard Page** — `/me` participant thread view showing analysis progress, 6-axis fingerprint, claims/needs, and top-3 matches: `public/app/me.html`.
- **Mobile Participant Dashboard Client** — SSE/poll live-refresh client, claim/need dismissal handlers, and Interested/Pass match actions on `/me`: `public/app/me.js`.
- **Private Mutual Intro Room Page** — unlocked bilateral `/me/matches/:id` screen for contact reveal, venue pins, chat, and vCard download: `public/app/intro-room.html`.
- **Private Mutual Intro Room Client** — 3-second polling chat, venue pin selector, contact card editor, and vCard export logic for `/me/matches/:id`: `public/app/intro-room.js`.
- **Published Sprint v0.2.0 Report** — served static copy of the canonical `v0.2.0` executive sprint report at `/reports/v0.2.0/`: `public/reports/v0.2.0/index.html`.
- **Canonical Sprint v0.2.0 Report** — Wave 2 (`v0.2.0`) executive engineering and telemetry report source: `sprint-reports/v0.2.0/index.html`.
- **Published Sprint v0.3.0 Report** — served static copy of the canonical `v0.3.0` executive sprint report at `/reports/v0.3.0/`: `public/reports/v0.3.0/index.html`.
- **Canonical Sprint v0.3.0 Report** — Wave 3 (`v0.3.0`) executive engineering and telemetry report source: `sprint-reports/v0.3.0/index.html`.
- **Published Sprint v0.4.0 Report** — served static copy of the canonical `v0.4.0` executive sprint report at `/reports/v0.4.0/`: `public/reports/v0.4.0/index.html`.
- **Canonical Sprint v0.4.0 Report** — Wave 4 (`v0.4.0`) executive engineering and telemetry report source: `sprint-reports/v0.4.0/index.html`.
- **Stage Per-View Explainer Modal** — interactive "How it works" overlay explaining the scoring formula, 6 axes, and privacy model for each `/stage` view: `public/stage/explainers.js`.

## Server / API

- **SQLite WAL Database Client** — `node:sqlite` connection manager, WAL pragmas, and idempotent schema migration runner (`A-001`): `src/db/client.ts`.
- **Health & Readiness Route** — `GET /api/health` endpoint reporting SQLite WAL connectivity, schema version, and table counts: `src/routes/health.ts`.
- **Self-Hosted HTTP Server** — `:3420` HTTP server, static asset router, security headers, and route auto-loader (`A-014`): `src/server.ts`.
- **SSE & Polling Event Bus** — SQLite-backed monotonic event log (`event_log`), redaction guard, and `EventEmitter` fan-out (`A-009`): `src/events/bus.ts`.
- **Event Stream & Poll Routes** — `GET /api/events/stream` (SSE with `Last-Event-ID` replay) and `GET /api/events/poll` endpoints: `src/routes/events.ts`.
- **GitHub Snapshot SQLite Cache** — 24-hour keyed SQLite cache (`github_cache`) for normalized GitHub and personal website snapshots: `src/github/cache.ts`.
- **Bounded GitHub & Website Connector** — GitHub REST/GraphQL profile + top-repo fetcher and personal website text extractor (`A-003`): `src/github/connector.ts`.
- **Untrusted Evidence Sanitizer** — strips prompt-injection control sequences, secrets, and unsafe URLs from scraped GitHub/website text: `src/github/sanitize.ts`.
- **Signed Session Cookie Auth** — HMAC-signed participant session cookie (`ariadne_session`) and presenter loopback request guard: `src/auth/session.ts`.
- **Participant Onboarding & Consent Routes** — `POST /api/participants/join`, `GET /api/participants/me`, and `DELETE /api/participants/me` cascading withdrawal routes (`A-002`): `src/routes/onboarding.ts`.
- **Stage Snapshot & Seed Toggle Routes** — `GET /api/stage/snapshot` public projector state and presenter-only `POST /api/stage/seed-toggle` (`A-010`): `src/routes/stage-snapshot.ts`.
- **Anti-Clone Similarity Penalty** — cosine similarity calculator and clone penalty function over 6-axis Builder Fingerprints (`A-006`): `src/matching/anti-clone.ts`.
- **5-Component Complementarity Scorer** — deterministic pairwise match scorer (`need_offer_fit`, `skill_complementarity`, `domain_alignment`, `anti_clone_penalty`, `evidence_confidence`) and top-3 selector (`A-006`): `src/matching/scorer.ts`.
- **Two-Stage Capability Analysis Agent** — Stage 1 deterministic capability/fingerprint extractor and Stage 2 Gemini 2.5 Flash enrichment with receipt citation enforcement (`A-004`): `src/intelligence/capability-agent.ts`.
- **Untrusted Evidence LLM Prompts** — versioned system prompts wrapping participant text in `<untrusted_github_evidence>` delimiters: `src/intelligence/prompts.ts`.
- **Participant Dashboard API Routes** — `GET /api/me`, `POST /api/me/claims/:id/dismiss`, `POST /api/me/needs/:id/dismiss`, and `PUT /api/me/contact-card` (`A-008`): `src/routes/me.ts`.
- **Two-Stage Opportunity Discovery Agent** — Stage 1 deterministic bottleneck/need detector (`>120d` stale caveat) and Stage 2 repo-grounded LLM enrichment (`A-005`): `src/intelligence/opportunity-agent.ts`.
- **Evidence Pill Formatter & Private Span Detector** — validates `EvidenceReceipt` pills and redacts private handles, emails, phones, and external links (`findPrivateSpans`): `src/matching/evidence-formatter.ts`.
- **Two-Stage Match Explanation Agent** — Stage 1 deterministic match card builder and Stage 2 grounded LLM thesis/starter generator (`A-007`): `src/matching/explanation-agent.ts`.
- **Double-Opt-In Introduction State Machine** — atomic transition logic (`candidate` → `proposed_a`/`proposed_b` → `accepted`/`completed` or `declined`) and contact reveal gate (`A-012`): `src/matching/intro-state-machine.ts`.
- **Mutual Introductions & Intro Room Routes** — `POST /api/matches/:id/decision`, `GET`/`POST /api/matches/:id/room`, and `GET /api/matches/:id/vcard` endpoints (`A-012`): `src/routes/introductions.ts`.
- **Golden Seed Personas Dataset** — 25 realistic SF hackathon builder profiles (`ariadne-seed-01`..`25`) for stage and demo hydration: `data/golden-seed-24.json`.
- **Operator Capacity & Reset Controller Routes** — presenter-only `/admin`, `/api/admin/capacity`, `/api/admin/prewarm`, and `/api/admin/reset` endpoints (`A-016`, `A-024`): `src/routes/admin.ts`.
- **Asynchronous SQLite Job Runner** — background worker leasing `participant.analyze` and `matches.refresh` jobs with crash recovery and concurrency limiting (`A-016`): `src/worker/job-runner.ts`.
- **Seed Persona Hydration Pipeline** — deterministic A-004/A-005 hydration and removal of the 25 golden seed personas (`hydrateSeedPersonas`): `src/worker/seed-personas.ts`.

## Governance / Engines

- **Roadmap Sync Status Receipt** — JSON state tracking the last public roadmap synchronization and GitHub Pages publish status: `roadmap-board/roadmap-sync-status.json`.
- **TangleClaw Agent Governance Rules** — generated project rules, PortHub conventions, and multi-agent operating contracts: `AGENTS.md`.
- **Claude Engine Entrypoint Rules** — engine-specific instructions and pointer to `AGENTS.md` governance rules: `CLAUDE.md`.
- **Master Trains & Cars Roadmap Charter** — 5-wave execution plan (`v0.1.0`–`v1.0.0`), lane file envelopes, and 4-Gate (`R`/`A`/`I`/`O`) governance specification: `ARIADNE_ROADMAP.md`.
- **Canonical Data & Events Contract** — frozen SQLite DDL, TypeScript entity schemas, 16-event catalog, and privacy/consent state transitions: `DATA_AND_EVENTS_CONTRACT.md`.
- **Complementarity Match Scoring Specification** — mathematical specification for the 5-component match scorer, 6-axis fingerprint, and evidence citation rules: `MATCH_SCORING_SPEC.md`.
- **Frozen Event Catalog Validators** — runtime schema validators and redaction guards for all 16 `AriadneEvent` types (`A-001`): `src/contracts/events.ts`.
- **Contracts Barrel Export** — public barrel re-exporting all frozen A-001 types, schemas, and event validators: `src/contracts/index.ts`.
- **Core Entity Schemas & State Guards** — TypeScript types and runtime validators for `Participant`, `CapabilityClaim`, `OpportunityNeed`, `EvidenceReceipt`, and `MatchProposal` (`A-001`): `src/contracts/types.ts`.
- **Canonical Sprint Metrics Schema JSON** — exported v2.0.0 telemetry, timestamps (`t1..t8`), 4-state completion, and 3-tier cost ledger across `v0.1.0`–`v0.4.0`: `sprint-reports/metrics-schema.json`.

## CLI / Tooling

- **Public Roadmap Publisher Script** — shell script syncing the roadmap board and sprint reports to `gh-pages`: `roadmap-board/publish-public-roadmap.sh`.
- **Sprint Report & Roadmap Static Builder** — Node CLI compiling `roadmap2-data.json`, GitHub issues, and `sprint-reports/` into `public/roadmap/` and `public/reports/` (`A-015`): `scripts/build-sprint-report.js`.
- **Sprint Reports Builder Test Suite** — unit tests for `build-sprint-report.js` roadmap projection, XSS escaping, and watermark checks: `tests/reports.test.ts`.
- **Cloudflare Tunnel Launcher Script** — helper script starting an ephemeral or named `cloudflared` tunnel to `127.0.0.1:3420` for mobile QR onboarding: `scripts/tunnel.sh`.
- **HTTP Server & Route Loader Tests** — integration tests for `:3420` server startup, static routes, and `/api/health`: `tests/server.test.ts`.
- **NPM Lockfile** — deterministic dependency lockfile for TypeScript and Node tooling: `package-lock.json`.
- **NPM Package Manifest** — project scripts (`start`, `dev`, `test`, `typecheck`, `build:reports`) and dependencies: `package.json`.
- **Contracts & Schema Test Suite** — unit tests verifying A-001 entity validators, intro state transitions, and SQLite WAL migrations: `tests/contracts.test.ts`.
- **TypeScript Compiler Configuration** — strict ESM/NodeNext TypeScript configuration (`tsc --noEmit`): `tsconfig.json`.
- **SSE & Polling Event Bus Tests** — integration tests for `event_log` persistence, cursor replay, SSE fan-out, and private field redaction: `tests/events.test.ts`.
- **GitHub Connector & Cache Tests** — unit tests for GitHub REST/GraphQL normalization, website scraping, sanitization, and 24h SQLite caching: `tests/github-connector.test.ts`.
- **Participant Onboarding & Withdrawal Tests** — integration tests for `/join`, session cookies, capacity locks, and cascading `DELETE /api/participants/me`: `tests/onboarding.test.ts`.
- **Stage Snapshot & Seed Toggle Tests** — integration tests for `/api/stage/snapshot`, consent filtering, and cross-site seed-toggle protection: `tests/stage-snapshot.test.ts`.
- **Complementarity Scorer Test Suite** — unit tests for 5-component match scoring, anti-clone penalties, top-3 selection, and 5ms performance budget: `tests/scorer.test.ts`.
- **Capability Analysis Agent Tests** — unit tests for Stage 1 deterministic claims/fingerprints and Stage 2 LLM citation/fallback gates: `tests/capability-agent.test.ts`.
- **Stage Views & HUD Controls Tests** — DOM tests for Views 1–4 switching, hotkeys, and operator controls on `/stage`: `tests/stage-modes.test.ts`.
- **Mobile `/me` Dashboard Route Tests** — integration tests for `GET /api/me`, claim/need dismissal, and privacy redaction before mutual intro: `tests/me-routes.test.ts`.
- **Opportunity Discovery Agent Tests** — unit tests for Stage 1 confirmed/inferred needs, `>120d` stale caveats, and Stage 2 repo citation checks: `tests/opportunity-agent.test.ts`.
- **Match Explanation Agent Tests** — unit tests for Stage 1 match cards, `findPrivateSpans` scrubbing, and Stage 2 grounding verification: `tests/explanation-agent.test.ts`.
- **Mutual Introductions & Intro Room Tests** — integration tests for bilateral `interested`/`pass` decisions, Golden Arc events, Intro Room chat, and vCard export: `tests/introductions.test.ts`.
- **Background Worker & `/admin` Tests** — integration tests for job leasing, crash recovery, two-stage analysis, seed hydration, and `/admin` capacity controls: `tests/worker.test.ts`.
- **Brand Assets & CSP Tests** — tests verifying `/ariadne-logo.png`, `/tangleclaw-logo.png`, fallback attributes, and `/admin` CSP headers: `tests/branding.test.ts`.
- **Stage GitHub Avatars Tests** — tests verifying GitHub avatar rendering and fallback initials across Stage Views 1, 3, and 4: `tests/stage-avatars.test.ts`.
- **Stage Event Feed Consent Tests** — tests ensuring withdrawn and removed participants are filtered from the live stage event feed: `tests/stage-events.test.ts`.
- **Lightweight Fake DOM Test Harness** — zero-dependency DOM/canvas stub used by stage and client script unit tests: `tests/helpers/fake-dom.ts`.
- **Admin Room Reset Tests** — integration tests for presenter-only `POST /api/admin/reset` room data wipe and optional seed re-hydration: `tests/admin-reset.test.ts`.

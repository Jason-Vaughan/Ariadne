# Project Map

<!--
A "where things live" map: the structural table-of-contents the agent consults
FIRST before grepping or filesystem search. The top-level-directory skeleton is
auto-generated (seeded on toggle-on, refreshed by the project-map wrap-step);
fill in the descriptions. Distinct from FEATURES.md (#207), which maps features
to file paths — this maps the layout itself.
-->

## Structure

- `ISSUE_BACKLOG/` — Pre-hackathon H-Day GitHub issue drafts (`A-001.md` through `A-017.md` + `INDEX.md`), ready for publication after explicit Operator H-Day GO.
- `data/` — Static fixture and seed persona data (`golden-seed-24.json` with 25 curated AI builder profiles); runtime SQLite database files are gitignored.
- `public/` — Static browser assets served by the HTTP server: mobile participant pages (`app/join`, `app/me`, `app/intro-room`), the 16:9 4-view stage visualizer (`stage/`), published O-Gate sprint reports (`reports/`), and the roadmap board (`roadmap/`).
- `roadmap-board/` — Standalone hackathon roadmap board HTML (`index.html`) and official Ariadne logo asset (`ariadne-logo.png`).
- `scripts/` — Operational and build scripts including the Cloudflare quick-tunnel launcher (`tunnel.sh`) and sprint report builder (`build-sprint-report.js`).
- `sprint-reports/` — Canonical O-Gate v2.0.0 sprint report HTML artifacts (`v0.1.0`–`v0.4.0`), Python generators (`generators/`), metrics schema (`metrics-schema.json`, `metrics_schema.py`), and contract validator (`validate-sprint-report.py`).
- `src/` — TypeScript application source: HTTP server (`server.ts`), SQLite schema/client (`db/`), Zod contracts (`contracts/`), event bus (`events/`), GitHub/website connector and sanitizer (`github/`), Stage 1/2 capability and opportunity agents (`intelligence/`), anti-clone scorer, explanation agent, and intro state machine (`matching/`), route handlers (`routes/`), and background job worker (`worker/`).
- `tests/` — Automated Node.js TypeScript test suites (`*.test.ts`), lightweight fake DOM helper (`helpers/fake-dom.ts`), and Python testament suite (`test_ariadne_suite.py`).

## Shared directories / doc groups

_Shared-doc group membership is machine-local state, not project structure, so it is not published here — see the TangleClaw UI for this install's groups._

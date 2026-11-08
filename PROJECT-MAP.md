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
- `changelog.d/` — Per-issue Keep-a-Changelog fragments (`<issue>.<slug>.<type>.md`) compiled into `CHANGELOG.md` at release wrap.
- `data/` — Seed persona fixtures (`golden-seed-24.json`), runtime worker settings, and local SQLite WAL database storage.
- `public/` — Static web assets served on `:3420`: mobile participant app (`/join`, `/me`, `/me/matches/:id`), 16:9 venue stage visualizer (`/stage`), public roadmap (`/roadmap`), and sprint reports (`/reports`).
- `roadmap-board/` — Canonical roadmap JSON (`roadmap2-data.json`), brand assets (`ariadne-logo.png`, `tangleclaw-logo.png`), and public roadmap sync scripts.
- `scripts/` — Build and operational scripts, including `build-sprint-report.js` (generates `/roadmap` and `/reports` hub) and `tunnel.sh` (Cloudflare Tunnel helper).
- `sprint-reports/` — TangleClaw Sprint Report Standard v2.0.0 Python reporting pipeline (`metrics_schema.py`, `validate-sprint-report.py`, `generators/`) and canonical HTML reports (`v0.1.0`–`v1.0.0`).
- `src/` — TypeScript backend (`server.ts`, SQLite WAL `db/`, frozen `contracts/`, SSE `events/`, `github/` connector & cache, two-stage `intelligence/` agents, `matching/` scorer & explanations, HTTP `routes/`, and background `worker/`).
- `tests/` — Node `--test` TypeScript unit and integration test suites covering contracts, routes, GitHub ingestion, agents, scorer, stage views, worker, and sprint report builders.

## Shared directories / doc groups

_Shared-doc group membership is machine-local state, not project structure, so it is not published here — see the TangleClaw UI for this install's groups._

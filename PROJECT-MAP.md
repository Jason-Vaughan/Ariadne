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
- `data/` — Runtime SQLite database and the golden seed persona JSON.
- `public/` — Static participant app, stage visualizer, roadmap, and published report pages.
- `roadmap-board/` — Roadmap dashboard assets, source data, build scripts, and publishing helpers.
- `scripts/` — GitHub issue bootstrap, tunnel launcher, and sprint report build scripts.
- `sprint-reports/` — Report contracts, metrics schemas, generators, validators, assets, and versioned reports.
- `src/` — TypeScript server, routes, contracts, database, GitHub analysis, matching, events, and worker.
- `tests/` — Node and Python suites for app behavior, contracts, reports, and worker flows.

## Shared directories / doc groups

_Shared-doc group membership is machine-local state, not project structure, so it is not published here — see the TangleClaw UI for this install's groups._

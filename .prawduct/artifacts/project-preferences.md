# Project Preferences

Developer preferences for how code is written in this project. Captured during discovery, updated as preferences evolve. Every session should read this before writing code.

## Language & Runtime

- **Language**: TypeScript 5.x (Node.js 22+ LTS) + Python 3.12+ (for Testament runner & sprint report generators)
- **Version**: Node.js >=22.0.0, TypeScript ^5.6.0, Python 3.12+
- **Package manager**: npm workspaces (`packages/shared`, `packages/server`, `packages/client`)

## Code Style

- **Naming**: `camelCase` functions/variables, `PascalCase` classes/types/React components, `UPPER_SNAKE_CASE` constants
- **Formatting**: Prettier / standard 2-space indentation
- **Linting**: TypeScript strict mode (`tsc --noEmit`) + ESLint
- **Type annotations**: Required (`strict: true`, JSDoc comments required on all functions per TangleClaw Core Rule)
- **Imports**: Explicit ESM imports with `@ariadne/shared` workspace imports for cross-package contracts

## Testing

- **Framework**: `testament` (`/Users/jasonvaughan/.local/bin/testament run --json`) wrapping `pytest` (`tests/`) and workspace `vitest` (`npm test`)
- **Style**: Deterministic, zero-network-dependency unit & contract tests (AAA pattern)
- **Coverage expectations**: Happy path + error cases + schema contract validation (`zod`) + privacy scrub assertions
- **Testing strategies**: Schema contract tests (`DATA_AND_EVENTS_CONTRACT.md`), SQLite WAL concurrency tests, SSE replay tests
- **Test location**: `tests/` (Testament pytest bridge + contract suite) and `packages/*/src/__tests__/` (Vitest package tests)
- **Parallelization**: Distributed across the 4-runner Testament pool (`gpu-bozeman`, `14th-mbp`, `nas-bozeman`, `laptop`) via `/Users/jasonvaughan/.local/bin/testament run --json`

## Architecture Patterns

- **Data modeling**: TypeScript interfaces + Zod runtime validators in `@ariadne/shared` (`DATA_AND_EVENTS_CONTRACT.md`)
- **Error handling**: Structured HTTP problem responses + typed Result/error codes, logged at `info` level
- **Async**: `async/await` throughout; SQLite WAL via `better-sqlite3` synchronous transactions wrapped in service boundaries
- **File organization**: Monorepo workspaces (`packages/shared`, `packages/server`, `packages/client`) with strict lane file-scope boundaries (`FLEET_CHARTER.md`)

## Tooling

- **Key libraries**: Fastify, `better-sqlite3` (WAL mode), `zod`, React 18, Vite, Tailwind CSS, HTML5 Canvas 2D + SVG overlay, `@google/genai` (`gemini-3-flash-preview` / `gemini-2.5-flash`)
- **Dev commands**: `/Users/jasonvaughan/.local/bin/testament run --json`, `npm test`, `npm run build`

## Workflow

- **Branching**: feature-branches (`feat/a-001-...`, `feat/a-014-...`, etc. — one branch per Car/Issue)
- **Protected branches**: main
- **PR creation**: automatic (create PR via `gh pr create` as soon as implementation, Testament suite, and Prawduct build/reflection are complete — **DO NOT run internal `/prawduct:pr` or internal PRR subagents**; waive Prawduct's `pr` gate via `.prawduct/.gates-waived` because external PR review is performed in parallel by dedicated fleet lanes `Ariadne-PRR` `#1568` and `Ariadne-Arc` `#1563`)
- **PR merge**: wait_for_user (merged by `Ariadne-INT` `#1565` after `Ariadne-PRR` `#1568` or `Ariadne-Arc` `#1563` issues `APPROVE`)
- **PR merge strategy**: squash
- **Commit attribution**: none
- **Upstream filing**: never-file
- **Delegation**: off (each Builder lane `Ariadne-Lane-A..D` owns a single bounded Car at a time; parallelization happens across the 9-lane TangleClaw fleet, and neither internal `/prawduct:critic` nor internal `/prawduct:pr` subagents are spawned inside a Builder lane)
- **Delegate verification**: `/Users/jasonvaughan/.local/bin/testament run --json` and `npm test`
- **Inner-loop verification**: Run `/Users/jasonvaughan/.local/bin/testament run --json` (and package-scoped `npm test`) at each chunk verification and before opening a PR
- **Delegation approval**: ask-on-reason

---

**What belongs here**: How you want code written. Conventions, tools, style preferences, workflow preferences.

**What doesn't belong here**: What to build (product-brief), system design (data-model, architecture), performance targets (nonfunctional-requirements), or deployment (operational-spec).

## Enforcement

Each preference above should be enforced by one of three mechanisms — assign the mechanism when you add the preference so it doesn't quietly become aspirational.

| Mechanism | Where it lives | What it catches | Trade-off |
|---|---|---|---|
| **Linter** | Project's configured linter (ruff, eslint, swiftlint, etc.) | Mechanical style/naming rules | Best tool when configured. If no linter, preferences in this category fall through to Critic. |
| **Test** | `tests/preferences/test_*.py` (or equivalent) | Structural rules with named exceptions (AST checks, config-presence checks) | Bakes the rule into CI; refuses to be silent. Cost: re-validate when the rule's shape changes. |
| **Critic** | `/critic` review (Goal 4: Norms) | Judgment-required rules (semantic naming, "appropriate" anything, what counts as a "boundary") | No false-confidence test. Cost: requires reviewer per chunk; misses violations between reviews. |

| Preference / norm | Mechanism | Enforcement artifact | Audit home | Why |
|---|---|---|---|---|

# Session Memory

This file persists context across AI sessions. Update it with key decisions, progress, and open questions.

## Boot pointer
- Lane-C (Builder C) of the ARIADNE-HACK-2026 fleet. All four Lane-C cars are merged to `origin/main` (A-009, A-006, A-007, A-016); the fleet was drained on 2026-11-08 for `tc finalize`.
- Open queue (priority order): (1) decide what to do with `stash@{0}` (see Next Session); (2) the A-006 matching-quality follow-up, if PM/Arc want it.
- Tooling on this host: use `~/.tangleclaw/cli/bin/tc` and `/opt/homebrew/bin/gh`; bare `tc`/`curl`/`gh` hit sandbox EPERM. Lane-C never runs `gh pr merge` (Rule #319).
- Cross-session lessons: `.tangleclaw/memories/learnings.md`.

## Next Session
- `stash@{0}` on this clone ("lane-c: learning note, A-016 memory notes, car plans…") holds uncommitted local work preserved instead of `git clean`: a learning rule appended to `.claude/rules/learnings/core.md`, the old A-016 integration notes for this file, the Car 01–04 plans (`.tangleclaw/plans/`, `plans/archive/`) and TangleClaw's `rule-receipt-redelivery-state.json`. Ask the operator whether the learning rule should go to PM for the shared rules; otherwise `git stash pop` to restore it locally, or `git stash drop`.
- Matching quality: after the vocabulary map, 10/25 live persona profiles still surface no match against the 25 seeds (mostly frontend, mobile and product). The limit is A-006's 0.35 `capability_similarity` weight and complementarity never firing. That is an Arc/PM weighting decision, not a bug.

## Last Session — 2026-11-07/08
- Shipped (all merged via Ariadne-INT, with PRR + Arc gates passed):
  - Car 01-C A-009: event bus, SSE and poll (#9, PR #21 → 101d16c).
  - Car 02-C A-006: five-component scorer, anti-clone gate and top-K (#6, PR #26 → 3f14b9e).
  - Scorer timing-flake fix (PR #33 → 2998fd6).
  - Car 03-C A-007: two-stage explanation agent (#7, PR #32 → 1a7c8be).
  - Shared privacy detector follow-up (PR #36 → b5ee8bc).
  - Car 04-C A-016: worker, 25 golden seeds, `/admin`, and the need-vocabulary map (#15, PR #38 → 160ef88).
- Completion receipts for all four cars were sent to PM and Obsr. The fleet drained per PM's shutdown directive. The worktree is clean on `main` at 2b42cde, and the workload receipt reads complete + safe-to-clear.
- Learned: see learnings.md. In short: run a real profile end to end before building on agents; treat all participant-controlled text as untrusted; stop pushing to a branch once its exact-head gates pass; loopback guards need a loopback Host check.

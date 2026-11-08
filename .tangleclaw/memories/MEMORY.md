# Session Memory

This file persists context across AI sessions. Update it with key decisions, progress, and open questions.

## Boot pointer
- Lane: **Ariadne-Lane-B** (Builder B, ARIADNE-HACK-2026). All assigned work is merged; there is no open PR or assignment. Wait for an Ariadne-PM dispatch before writing any code.
- Read first: `.tangleclaw/memories/learnings.md` (cross-session lessons), then this file's Last Session.
- Tooling: `tc`, `curl` and `gh` on PATH are broken shims, so use `~/.tangleclaw/cli/bin/tc`, `/usr/bin/curl` and `/opt/homebrew/bin/gh`. Only use gh for non-merge operations; Builders never merge.
- Open-queue priorities: (1) none dispatched; (2) operator decisions below.

## Next Session
- On start: run `tc start next`, check the inbox, and wait for a dispatch.
- Operator decisions still open:
  - The local branch `keep/a-014-rebased-20261107` reads PRESERVE in `tc branch check` (rebased duplicates of merged A-014 work).
  - `.prawduct/.gates-waived` was written by the PM: it waives only the `pr` gate, for external review.
- Possible follow-ups, only if dispatched:
  - Persist the Stage 2 refined fingerprint (PM-ratified gap; no column exists).
  - Live Gemini output is unverified: no `ARIADNE_LLM_API_KEY` / `GEMINI_API_KEY` is configured on this host.

## Last Session — 2026-11-07 → 2026-11-08 (hackathon build day, session 1567)
**Shipped (all merged to main through Arc + PRR review and INT merge):**

| Work | Issue | PR | Merge |
|---|---|---|---|
| A-014 server :3420, SQLite WAL client, readiness `/api/health`, narrow tunnel, checksummed backup | #13 | #19 | 719b35b |
| A-003 GitHub + website connector, multi-PAT pool, SSRF-guarded fetch, 24h single-flight cache, fingerprint | #3 | #23 | 308443a |
| A-004 capability agent (Stage 1 deterministic, Stage 2 cited-evidence LLM with fallback) | #4 | #27 | e0f2fd0 |
| A-005 opportunity / bottleneck agent | #5 | #31 | ae55786 |
| A-004 follow-up: `persistAnalysis` fails closed on withdrawn consent | — | #35 | 7a9baed |
| A-026 fingerprint rebalance before the pitch (generic AI words, JS context routing) | #58 | #59 | 2b42cde |

**Contracts other lanes depend on:**
- Route modules: `src/routes/*.ts` export `routes: RouteDefinition[]`.
- `/api/health` returns 200 only with WAL on and all 8 A-001 tables present; `tunnel.sh` opens only on a 200.
- Reports are served only from `public/reports/<v>/` after Observer certification.
- `getOrFetchSnapshot` is keyed by handle + website; `undefined` websiteUrl accepts whatever is cached, `null` removes the cached site.
- Both persist functions return `skipped: 'consent_withdrawn'` for withdrawn participants.
- Fingerprint repo weight stays `1 + min(1, log10(1 + stars)/2)`, to match the stage View 2 explainer.

**Learned:** see `learnings.md`: health is a contract with its consumer; key caches by every result-changing input; budget per trust class when ranking and truncating; re-check consent at write time; keep scoring in sync with on-screen explanations.

**State at wrap:** fleet drained on the PM's order. The checkout is on `main` at 2b42cde, the inbox is empty and no exchanges are open, and the workload reads complete / safe-to-clear.

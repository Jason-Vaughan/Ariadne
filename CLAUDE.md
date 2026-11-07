# CLAUDE.md

<!-- PRAWDUCT:ANCHOR — governance pointer managed by the prawduct plugin; keep it small and version-free. -->

## Governance (Prawduct)

This repo is governed by **Prawduct**, a Claude Code plugin; its methodology and
protocols are read on demand via `/prawduct:methodology`.

**Check first: is the plugin loaded?** If `/prawduct:*` commands are unavailable it
is not, and **governance is OFF** — no Stop gate, no Critic, nothing below enforced.
A clone registers the marketplace but installs nothing. Tell the user to
run `claude plugin install prawduct@prawduct`, then restart — don't proceed as if governed.

**With the plugin loaded — before writing any code, STOP and read the build cycle:
`/prawduct:methodology building`.** Skipping it is the #1 governance failure.

Hardest rules:

- **Tests are contracts** — fix the code, never weaken a test.
- **No "pre-existing" exception** — fix what you find, or flag why you can't.
  The fix half is bounded to BLOCKING; below it, the flag is the whole answer.
- **Never silently drop a requirement** — say so explicitly.
- **Run `/prawduct:critic` after medium+ work** — never write findings
  yourself; the independence is the value. Rigor is stage-keyed: a mid-build
  review blocks only on what would ship broken, the review at the merge
  boundary runs everything and is never skipped, and unsure defaults to the
  cheaper mid-build review.

**Enforcement is structural — while the plugin is loaded:** its Stop hook runs at
session end and **blocks** if code changed against an active build plan with no
Critic findings.

---

## Ariadne Fleet Protocol: Prawduct on Builders + External Dual-Reviewer PRR (NO Internal PRR)

1. **Use Prawduct Build Discipline on All Builder Lanes (`Ariadne-Lane-A..D`):**
   - Follow Prawduct's structured chunk cycle (`.prawduct/` state, test-alongside-code, `.prawduct/.test-evidence.json`, and session reflection).
2. **NO Internal PRR (`/prawduct:pr` Subagent Disabled on Builders):**
   - Builders **MUST NOT** invoke `/prawduct:pr`'s internal `pr-reviewer` subagent. All Pull Request Review (PRR) is performed externally by our dedicated fleet reviewers!
   - When opening a PR with `gh pr create`, Builders MUST immediately waive Prawduct's internal Gate 3 (`pr`) so the Stop hook does not block waiting for an internal PR reviewer:
     ```bash
     echo '{"pr": "External PR review performed by dedicated fleet reviewers Ariadne-PRR (#1568) and Ariadne-Arc (#1563)"}' > .prawduct/.gates-waived
     ```
3. **Dual-Reviewer Load Balancing (Preventing Single-PRR Bottlenecks):**
   - To prevent 4 parallel Opus 5.5 Builders from bottlenecking on a single PRR lane, PR review is split 50/50 in parallel across two reviewers:
     - **`Ariadne-Arc` (`#1563`) — Parallel Reviewer A/B:** Reviews PRs from **`Ariadne-Lane-A` (Car A)** and **`Ariadne-Lane-B` (Car B)**.
     - **`Ariadne-PRR` (`#1568`) — Parallel Reviewer C/D:** Reviews PRs from **`Ariadne-Lane-C` (Car C)** and **`Ariadne-Lane-D` (Car D)**.
   - Once either reviewer issues `APPROVE`, **`Ariadne-INT` (`#1565`)** rebases, verifies the full suite via `testament run --json`, and squash-merges to `main`.

---

## Running tests (`testament`)

Run tests through `/Users/jasonvaughan/.local/bin/testament`, not `pytest` directly:

    /Users/jasonvaughan/.local/bin/testament run --json [pytest args…]

Pass the same paths, `-k`, `-m` and flags you'd pass to `pytest` (alongside workspace `npm test` during inner-loop TypeScript checks). `testament run` ships the run to the shared runner pool (or runs locally when configured) and prints one JSON object on stdout when it finishes:

- `status`: `"passed"` (exit 0), `"failed"` (exit 1, see `report.items` for entries with `"outcome": "failed"` or `"error"`), or `"error"` (exit 2, see `error`).
- When `status` is `"error"`, check `error.ran`: if `true`, tests did run and `report` has partial results; if `false`, nothing ran (`error.code` and `error.message` say why).
- Use `/Users/jasonvaughan/.local/bin/testament run --json=summary` when you only need the verdict and any failures.
- Use `/Users/jasonvaughan/.local/bin/testament status` to inspect online runners (`gpu-bozeman`, `14th-mbp`, `nas-bozeman`, `laptop`).

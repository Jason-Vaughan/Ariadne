# Release & Deployment Plan — ARIADNE (`ARIADNE-HACK-2026`)

## 1. Release Train Strategy

Ariadne ships via **5 governed release checkpoints** on Saturday, November 7, 2026, between `09:30 AM` and `18:00 PM` Pacific. Every checkpoint produces:
1. A green CI / local test suite receipt (`vitest run && next build`).
2. An updated `CHANGELOG.md` following Keep a Changelog + TangleClaw `[Unreleased]` bump rules (`### Added`, `### Changed`, `### Fixed`, `### Internal`).
3. An annotated Git tag (`v0.0.1`, `v0.1.0`, `v0.2.0`, `v0.3.0`, `v1.0.0`) and GitHub Release.
4. A verified production Vercel deployment alias.

---

## 2. Release Checkpoints & Acceptance Gates

| Tag | Target Time (PST) | Success Tier | Included Issues | Gate Criteria (`I-Gate`) |
|---|---|---|---|---|
| **`v0.0.1`** | `10:30 AM` | **Wave 0 — Contracts & Infra** | `A-001`, `A-014a`, `A-015a` | Shared TypeScript contracts compile; DB schema migrated; `/api/health` returns `200 OK` on live Vercel URL; pre-event provenance baseline committed. |
| **`v0.1.0`** | `12:30 PM` | **Tier 1 — Minimum Success (Essential)** | `A-002`, `A-003`, `A-004`, `A-006`, `A-009`, `A-010` | Real mobile QR scan → consenting GitHub submission → real GitHub evidence fetched → grounded capability profile displayed on `/me` → pseudonymous node appears live on 16:9 `/stage` Network Graph. |
| **`v0.2.0`** | `15:00 PM` | **Tier 2 — Strong Success (Target)** | `A-005`, `A-007`, `A-008`, `A-011` | Opportunity discovery active; top-3 evidence-backed matches with 4-factor score bars displayed on `/me`; `/stage` Activity Mode and Spotlight Mode functional. |
| **`v0.3.0`** | `16:45 PM` | **Tier 3 — Exceptional Success (Stretch)** | `A-012`, `A-013`, `A-016` *(+ optional `A-017`)* | Bilateral `Interested` approvals unlock private web match card + trigger dedicated Ariadne Discord Bot introduction; `/stage` animates completed emerald connection. |
| **`v1.0.0`** | `17:45 PM` | **Demo Freeze (Judging Lock)** | `A-014b`, `A-015b` | **Hard Code Freeze.** Final provenance packet published at `/provenance`; production alias pinned; zero deployments permitted after `17:45 PM` except emergency rollback. |

---

## 3. Rollback & Incident Protocol

1. **Instant Alias Rollback (`< 30 seconds`):**
   - At each milestone tag (`v0.1.0`, `v0.2.0`, `v0.3.0`), `Ariadne-INT` records the immutable Vercel deployment URL (`https://ariadne-<hash>.vercel.app`).
   - If any subsequent merge degrades `/join`, `/me`, or `/stage`, `Ariadne-INT` immediately runs:
     ```bash
     vercel alias set <last-good-deployment-url> <production-domain>
     ```
2. **Database Forward-Compatibility Rule:**
   - All H-Day database schema changes after `v0.0.1` must be **additive only** (new nullable columns or new tables—never drop or rename a column required by `v0.1.0` or `v0.2.0`), ensuring instant code rollback never conflicts with database state.

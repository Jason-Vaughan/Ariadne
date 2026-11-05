# Provenance & Judging Evidence Specification — ARIADNE (`ARIADNE-HACK-2026`)

## 1. Purpose

Hackathon judges rightfully care about fairness and authenticity: *What existed before 09:30 AM on Saturday, and what was actually built during the event?*
Because Objective B explicitly showcases **TangleClaw** (our pre-existing open-source multi-agent engineering platform) building **Ariadne** (a brand-new application), maintaining a crystal-clear, cryptographically verifiable boundary between **Pre-Event Preparation** and **H-Day Engineering** is a core competitive advantage.

---

## 2. Three-Bucket Provenance Classification

Every artifact in the Ariadne project is explicitly categorized into one of three buckets on the judge-facing `/provenance` page and `PROVENANCE_LEDGER.md`:

| Bucket | Time Window | What It Contains | How It Is Verified |
|---|---|---|---|
| **Bucket 1: Pre-Existing Open-Source Platform (`TangleClaw` & `Medusa`)** | Built prior to Nov 7, 2026 | TangleClaw orchestration server, PortHub, Chunk-Boundary Protocol v1.0.0 (`#1889`), `tc` CLI, and Medusa local switchboard. | Public Git history and prior tagged releases (`v5.66.0` / `v5.67.0`) in the TangleClaw repository. Zero TangleClaw code is claimed as H-Day Ariadne app code. |
| **Bucket 2: Pre-Event Planning & Architecture Package (`Ariadne-PM`)** | Prepared Nov 5–6, 2026 (Before 09:30 AM Nov 7) | The 16 Markdown planning documents and 17 issue drafts (`ISSUE_BACKLOG/A-001.md`..`A-017.md`) in this repository. **Zero executable application code.** | Snapshot hash manifest (`PRE_EVENT_MANIFEST.sha256`) committed as the initial tag `v0.0.0-planning-baseline` immediately upon H-Day `GO`. |
| **Bucket 3: H-Day Autonomous Fleet Implementation (`Ariadne`)** | **Nov 7, 2026, 09:30 AM – 17:45 PM PST** | 100% of Ariadne TypeScript source code, React UI components, API endpoints, database schema/migrations, GitHub connector, agent tasks, scoring engine, SSE visualizer, Discord bot, and automated tests. | Git commit timestamps, GitHub PR creation/merge timestamps, TangleClaw `R-Gate` / `I-Gate` receipts, and Vercel deployment logs between `09:30` and `17:45 PST`. |

---

## 3. H-Day Provenance Ledger Format (`A-015`)

During H-Day execution, `Ariadne-PM` and `Ariadne-INT` update `docs/provenance/PROVENANCE_LEDGER.md` (and expose it at `/provenance`) at each wave boundary (`v0.0.1`, `v0.1.0`, `v0.2.0`, `v0.3.0`, `v1.0.0`) with the following table:

| Wave / Tag | Timestamp (PST) | Issues Closed | PRs Merged (`#`) | Builder Lane(s) | Reviewer (`R-Gate`) | Automated Tests Passing | Live Deployment Alias |
|---|---|---|---|---|---|---|---|
| `v0.0.0-planning-baseline` | `09:33` | Planning Only | — | `Ariadne-PM` | Operator | `0` (No code yet) | Repo Created |
| `v0.0.1-contracts` | `~10:20` | `A-001`, `A-014a`, `A-015a` | PR #1 | `Ariadne-INT` | `Ariadne-Arc-PRR` | Contract suite green | `https://...` |
| `v0.1.0-m1` *(Minimum)* | `~12:30` | `A-002`, `A-003`, `A-004`, `A-006`, `A-009`, `A-010` | PRs #2–#7 | `Lane-A..D` | `Ariadne-Arc-PRR` | Wave 1 suite green | `https://...` |
| `v0.2.0-m2` *(Strong)* | `~15:00` | `A-005`, `A-007`, `A-008`, `A-011` | PRs #8–#11 | `Lane-A..D` | `Ariadne-Arc-PRR` | Wave 2 suite green | `https://...` |
| `v0.3.0-m3` *(Exceptional)* | `~16:45` | `A-012`, `A-013`, `A-016` | PRs #12–#14 | `Lane-A`, `Lane-C` | `Ariadne-Arc-PRR` | Wave 3 suite green | `https://...` |
| `v1.0.0-hackathon` | `~17:45` | `A-014b`, `A-015b` | PR #15 | `Ariadne-INT`, `PM` | `Ariadne-Arc-PRR` | Full suite green | Production Frozen |

---

## 4. Synthetic Fixture Labeling Rule

- During internal H-Day testing between `10:30 AM` and `17:00 PM`, any seeded test profile must carry `is_synthetic_fixture: true` and a `[TEST FIXTURE]` prefix.
- Prior to the `17:45 PM` Demo Freeze (or via a single query filter `?include_fixtures=false` default on `/stage`), all synthetic fixtures are hidden/purged from the production database so that **100% of stage visualizer nodes and matches during judging represent real consenting human participants**.

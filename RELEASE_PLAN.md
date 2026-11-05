# Release & Deployment Plan — ARIADNE (`ARIADNE-HACK-2026`)
*Amended: 4-Train Bundled Car Schedule + Self-Hosted SQLite WAL + Per-Version `v2.0.0` Sprint Reports*

## 1. Four-Train Release Strategy

By bundling the 15 MVP issues into file-disjoint Multi-Issue Cars (`TC Rule #294`), the entire functional application ships across **3 morning/early-afternoon Release Trains (`v0.1.0`, `v0.2.0`, `v0.3.0`) by `13:45 PM PST`**, reserving a full **4-hour afternoon runway (`13:45 – 17:45 PM PST`)** for bug fixes, UI polish, live attendee dogfooding, and Judge Sprint Reports (`v1.0.0`).

---

## 2. Release Trains & Gate Checkpoints

| Train / Tag | Target Time (PST) | Included Cars & Issues | Gate & Deliverable Criteria (`A-Gate` / `R-Gate` / `I-Gate` / `O-Gate`) |
|---|---|---|---|
| **Train 0 (`v0.1.0`)** | `10:15 AM` *(45m)* | **`Car 0-INT`:** `A-001`, `A-014` (S1), `A-015` (S1) | `src/contracts/*` and SQLite WAL `src/db/schema.ts` merged and **FROZEN**; PortHub port `127.0.0.1:3420` bound; `/api/health` green; `v0.1.0` Interactive Sprint Report generated at `/reports/v0.1.0/`. |
| **Train 1 (`v0.2.0`)** | `12:00 PM` *(1h 45m)* | **`Car 1-A`:** `A-002`, `A-008` (Shell)<br>**`Car 1-B`:** `A-003`, `A-004`, `A-005`<br>**`Car 1-C`:** `A-006`, `A-007`<br>**`Car 1-D`:** `A-009`, `A-010`, `A-011` | **10 of 15 MVP issues landed in 1 parallel wave!** Mobile QR onboarding, GitHub connector, Capability & Opportunity agents, 40/30/20/10 scorer, Proposal agent, SSE+poll bus, and all 3 Stage Visualizer modes (`16:9`) merged & tested; `v0.2.0` Sprint Report published at `/reports/v0.2.0/`. |
| **Train 2 (`v0.3.0`)** | `13:45 PM` *(1h 45m)* | **`Car 2-A`:** `A-008` (Live), `A-012`<br>**`Car 2-C`:** `A-016` + Async Worker<br>**`Car 2-D`:** Stage Intro Polish | **Full Exceptional Success MVP Complete before 2:00 PM!** End-to-end async worker pipeline wired; `Interested`/`Pass` bilateral web introductions (`/me/matches/:id`) live; continuous rematching active; `v0.3.0` Sprint Report published at `/reports/v0.3.0/`. |
| **Train 3 (`v1.0.0`)** | `17:30 PM` *(3h 45m polish)* | **Polish & Hardening Cars** (`Lanes A..D`) + **`Car 3-INT/Obsr`** (`A-014` S2, `A-015` S2) | **4 hours of live dogfooding, bug fixes, UI tweaks & stage enhancements.** Final `v1.0.0` Sprint Report + `v0.1.0–v1.0.0` Hackathon Retrospective published at `/reports/`. Hard Demo Freeze at `17:45 PM`. |

---

## 3. Conflict-Free Release Cut (`W-REL`) & Rollback Protocol

1. **`changelog.d/` Fragment Compilation:**
   - Feature Cars write `changelog.d/<car-id>.md` instead of editing root `CHANGELOG.md`.
   - At each Train boundary, `Ariadne-INT` compiles `changelog.d/*.md` into root `CHANGELOG.md`, bumps `package.json` version, merges the release PR (`t5`), and tags `v0.X.0` (`t6`).
2. **Pre-Cutover SQLite Backup & Instant Rollback (`< 15 seconds`):**
   - Before restarting/reloading the local production process on `127.0.0.1:3420` (`t7`), `Ariadne-INT` takes an atomic SQLite backup (`sqlite3 data/ariadne.sqlite ".backup 'data/backups/ariadne-pre-v0.X.0.sqlite'"`) and records its SHA-256 digest.
   - All schema migrations after `v0.1.0` are strictly additive. If any Train cutover fails health checks, `Ariadne-INT` checks out the prior tag (`git checkout v0.X-1.0`) and restarts `127.0.0.1:3420` in `< 15 seconds` without dropping the public HTTPS tunnel.

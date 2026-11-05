# H-Day Minute-by-Minute Launch & Execution Runbook — ARIADNE (`ARIADNE-HACK-2026`)
*Amended: 4-Train Bundled Car Schedule + Web-Only Self-Hosted Stack*

> **CRITICAL GOVERNANCE RULE:** Do NOT execute any step in Section 2 at 09:30 AM PST automatically. Wait for the Operator's explicit **`GO`** command on Saturday, November 7, 2026.

---

## 1. Pre-GO Morning Verification (`09:00 – 09:29 AM PST` — Read-Only)

- **09:00 AM:** Operator arrives at venue, connects laptop to power + venue Wi-Fi (and verifies phone hotspot backup).
- **09:10 AM:** Verify `Ariadne-PM` session is live in TangleClaw and check that the 4 local `.env` variables (`ARIADNE_GITHUB_TOKEN`, `ARIADNE_GITHUB_OAUTH_CLIENT_ID`, `ARIADNE_GITHUB_OAUTH_CLIENT_SECRET`, `ARIADNE_LLM_API_KEY`) are staged.
- **09:20 AM:** Confirm zero application code exists before the `09:30 AM PST` kickoff bell.

---

## 2. Minute-by-Minute Train 0 Launch Sequence (`T+00` to `T+45` After Operator `GO`)

| Offset | Clock (PST) | Actor | Action & Verification Command |
|---|---|---|---|
| **T+00m** | `09:30` | **Operator** | Issues explicit **`GO — AUTHORIZE ARIADNE H-DAY EXECUTION`** in `Ariadne-PM`. |
| **T+01m** | `09:31` | **`Ariadne-PM`** | Records `t1_first_activity` (`date -u +"%Y-%m-%dT%H:%M:%SZ"`) and locks `PRE_EVENT_MANIFEST.sha256`. |
| **T+03m** | `09:33` | **`Ariadne-PM`** | Creates public GitHub repository (`gh repo create Jason-Vaughan/ariadne --public --description "Ariadne — AI-Native Professional Discovery Network (Find Your Thread)"`, license `UNLICENSED`/TBD) and pushes pre-event planning baseline tagged `v0.0.0-planning-baseline`. |
| **T+05m** | `09:35` | **`Ariadne-PM`** | Creates GitHub labels (`P0-critical`, `P1-target`, `P2-stretch`, `car:0-int`, `car:1-a..d`, `car:2-a..d`), milestones (`v0.1.0`, `v0.2.0`, `v0.3.0`, `v1.0.0`), and publishes the 15 MVP issue drafts (`ISSUE_BACKLOG/A-001.md`..`A-016.md`). |
| **T+08m** | `09:38` | **`Ariadne-Arc`** | Posts Pre-Flight Rulings (`W0-INT`, `W1-A`, `W1-B`, `W1-C`, `W1-D`) naming exact exported functions in `src/contracts/*` and exclusive file write envelopes per Car. |
| **T+10m** | `09:40` | **`Ariadne-INT`** | Executes **`Car 0-INT` (`A-001`, `A-014` S1, `A-015` S1)**: initializes project skeleton, frozen `src/contracts/*`, SQLite WAL schema (`src/db/schema.ts`), `/api/health`, registers PortHub port `3420` (`loopback`) + narrow HTTPS tunnel (`cloudflared tunnel --url http://127.0.0.1:3420`), and opens PR #1. |
| **T+32m** | `10:02` | **`Ariadne-PRR` & `Arc`** | Issue `R-Gate ACCEPT` + `A-Gate ACCEPT` on PR #1 (`Car 0-INT`). |
| **T+38m** | `10:08` | **`Ariadne-INT`** | Merges PR #1 via `gh pr merge --merge`, tags **`v0.1.0` (`Train 0`)**, starts local server on `127.0.0.1:3420`, and creates isolated Git worktrees (`wt-lane-a`..`d`, `wt-arc`, `wt-prr`, `wt-obsr`). |
| **T+42m** | `10:12` | **`Ariadne-Obsr`** | Certifies `O-Gate PASS` and generates the **`v0.1.0` Interactive HTML Sprint Report** (`/reports/v0.1.0/`). |
| **T+45m** | `10:15` | **`Ariadne-PM`** | Dispatches **Train 1 (`v0.2.0`)** simultaneously across all 4 Builder lanes (`Single-Turn Plan+Build` fast path):<br>- `Lane-A`: **`Car 1-A`** (`A-002` + `A-008` UI Shell)<br>- `Lane-B`: **`Car 1-B`** (`A-003` + `A-004` + `A-005` GitHub & Intelligence Agents)<br>- `Lane-C`: **`Car 1-C`** (`A-006` + `A-007` 40/30/20/10 Scorer & Proposal Agent)<br>- `Lane-D`: **`Car 1-D`** (`A-009` + `A-010` + `A-011` SQLite SSE/Poll Bus & 16:9 Stage Visualizer) |

---

## 3. Full-Day Train Execution Schedule (`10:15 AM – 18:00 PM PST`)

| Time Window | Train / Version | Fleet Execution | Operator Touchpoint |
|---|---|---|---|
| **10:15 – 11:40** | **Train 1 Build (`v0.2.0`)** | All 4 Builders code & unit-test `Car 1-A`, `Car 1-B`, `Car 1-C`, `Car 1-D` in parallel against frozen `src/contracts/*` fixtures (zero file overlap). `Ariadne-PRR` reviews each PR as it opens. | **Hands-off** (networking on hackathon floor). |
| **11:40 – 12:00** | **Train 1 Cutover (`v0.2.0`)** | `Ariadne-INT` merges all 4 Cars (`--merge`), compiles `changelog.d/*`, tags **`v0.2.0`**, reloads `127.0.0.1:3420`. `Ariadne-Obsr` publishes `/reports/v0.2.0/`. | **12:00 PM (2 min check):** View `/stage` and `/join` live; **10 of 15 MVP issues shipped by noon!** |
| **12:00 – 13:25** | **Train 2 Build (`v0.3.0`)** | `Ariadne-PM` verifies Train 1 chunk receipts (`validateNextChunkDispatch`), clears lanes, and dispatches **Train 2**:<br>- `Car 2-A` (`A-008` live + `A-012` Web Mutual-Intro Room)<br>- `Car 2-C` (`A-016` Rematcher + SQLite Async Job Worker wiring)<br>- `Car 2-D` (Stage Intro Animations & Judge HUD) | **Hands-off** (lunch + networking). |
| **13:25 – 13:45** | **Train 2 Cutover (`v0.3.0`)** | `Ariadne-INT` merges Train 2 Cars, tags **`v0.3.0`**, takes SQLite backup, reloads `127.0.0.1:3420`. `Ariadne-Obsr` publishes `/reports/v0.3.0/`. | **13:45 PM (5 min check):** **100% of Core & Stretch MVP (`M1` + `M2` + `M3`) is live before 2:00 PM!** |
| **13:45 – 17:15** | **Train 3 Polish, Dogfooding & Bug Fixes (`v1.0.0`)** | **3.5+ Hours of Dedicated Polish Runway:** Invite real hackathon attendees to scan the QR code; dispatch targeted UX polish, visual tweaks, and edge-case fixes across `Lane-A..D` based on real usage. | Walk the floor inviting attendees to scan the QR code & connect. |
| **17:15 – 17:45** | **Train 3 Final Release & Demo Freeze (`v1.0.0`)** | `Ariadne-INT` tags **`v1.0.0`**, takes final SQLite snapshot. `Ariadne-Obsr` publishes `/reports/v1.0.0/` and `/reports/v0.1.0-v1.0.0-retrospective/` (passing `validate-sprint-report.py`). **Hard Code Freeze at 17:45 PM.** | **17:45 PM:** Stage laptop connected to 16:9 display; ready for 18:00 PM judging. |

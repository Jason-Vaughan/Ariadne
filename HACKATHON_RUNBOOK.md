# H-Day Minute-by-Minute Launch & Execution Runbook — ARIADNE (`ARIADNE-HACK-2026`)

> **CRITICAL GOVERNANCE RULE:** Do NOT execute any step in Section 2 at 09:30 AM PST automatically. Wait for the Operator's explicit **`GO`** command on Saturday, November 7, 2026.

---

## 1. Pre-GO Morning Verification (`09:00 – 09:29 AM PST` — Read-Only)

- **09:00 AM:** Operator arrives at venue, connects laptop to power + venue Wi-Fi (and verifies cellular hotspot backup).
- **09:10 AM:** Operator verifies `Ariadne-PM` session is live in TangleClaw and checks that pre-provisioned credentials (`GITHUB_TOKEN`, `DATABASE_URL`, `LLM_API_KEY`, `DISCORD_BOT_TOKEN`) are ready in the Operator password manager / `.env` staging note.
- **09:20 AM:** Confirm zero application code exists in `/Users/jasonvaughan/Documents/Projects/Ariadne-PM`. Wait for Hackathon Kickoff bell (`09:30 AM PST`).

---

## 2. Minute-by-Minute Launch Checklist (`T+00` to `T+60` After Explicit Operator `GO`)

| Offset | Clock (PST) | Actor | Action & Verification Command |
|---|---|---|---|
| **T+00m** | `09:30` | **Operator** | Issues explicit **`GO — AUTHORIZE ARIADNE H-DAY EXECUTION`** in `Ariadne-PM`. |
| **T+01m** | `09:31` | **`Ariadne-PM`** | Records exact UTC/PST authorization timestamp (`date -u +"%Y-%m-%dT%H:%M:%SZ"`) and generates the SHA-256 pre-event planning snapshot (`shasum -a 256 *.md ISSUE_BACKLOG/*.md > PRE_EVENT_MANIFEST.sha256`). |
| **T+03m** | `09:33` | **`Ariadne-PM`** | Creates public GitHub repository (`gh repo create Jason-Vaughan/ariadne --public --description "Ariadne — AI-Native Professional Discovery Network (Find Your Thread)"`) with licensing deferred (`UNLICENSED`/TBD per charter) and pushes initial pre-event planning snapshot tagged `v0.0.0-planning-baseline`. |
| **T+06m** | `09:36` | **`Ariadne-PM`** | Creates repository labels (`P0-critical`, `P1-target`, `P2-stretch`, `lane:int`, `lane:a-web`, `lane:b-github`, `lane:c-matching`, `lane:d-stage`) and milestones (`M0`..`M4`). |
| **T+08m** | `09:38` | **`Ariadne-PM`** | Publishes all 17 prepared issue drafts (`ISSUE_BACKLOG/A-001.md` .. `A-017.md`) to GitHub Issues via `gh issue create -F ISSUE_BACKLOG/A-00X.md`. |
| **T+12m** | `09:42` | **`Ariadne-INT` + `Arc-PRR`** | Dispatched on **Wave 0 (`A-001`, `A-014a`, `A-015a`)**: initializes Next.js + TypeScript skeleton, `src/contracts/*`, `src/db/schema.ts`, Vitest harness, and initial Vercel production link. |
| **T+35m** | `10:05` | **`Ariadne-Arc-PRR`** | Completes `R-Gate` review on `A-001` PR; verifies all entity/event contracts match `DATA_AND_EVENTS_CONTRACT.md`. |
| **T+45m** | `10:15` | **`Ariadne-INT`** | Merges `A-001` + `A-014a`, runs database migration, verifies `GET /api/health` on live Vercel HTTPS URL, and tags `v0.0.1-contracts`. |
| **T+50m** | `10:20` | **`Ariadne-INT`** | Creates isolated Git worktrees (`wt-lane-a`, `wt-lane-b`, `wt-lane-c`, `wt-lane-d`, `wt-arc`) from `v0.0.1-contracts` and registers local dev ports (`3420`, `3421`, `4420`) in TangleClaw PortHub. |
| **T+55m** | `10:25` | **`Ariadne-PM`** | Dispatches **Wave 1** in parallel across all 4 Builder lanes via Medusa switchboard (`tc message send`):<br>- `Lane-A`: `A-002` (Onboarding & QR Intake)<br>- `Lane-B`: `A-003` → `A-004` (GitHub Connector & Capability Agent)<br>- `Lane-C`: `A-006` (Match Scoring Engine)<br>- `Lane-D`: `A-009` → `A-010` (SSE Event Stream & Network Graph) |
| **T+60m** | `10:30` | **Operator** | Fleet is at full autonomous cruise. Operator is free to step away from the terminal to network with hackathon attendees while monitoring progress via TangleClaw mobile/MagicDNS view. |

---

## 3. Full-Day Wave Schedule (`10:30 AM – 18:00 PM PST`)

| Time Window | Phase | Key Actions | Operator Touchpoint |
|---|---|---|---|
| **10:30 – 12:15** | **Wave 1 Execution** | Builders A, B, C, D implement and test `A-002`, `A-003`, `A-004`, `A-006`, `A-009`, `A-010`. `Arc-PRR` reviews PRs as they open. | Hands-off (networking on floor). |
| **12:15 – 12:30** | **M1 Integration Gate** | `Ariadne-INT` merges Wave 1 PRs, deploys `v0.1.0-m1`, and runs live QR smoke test. Chunk receipts recorded before `/clear`. | **12:30 PM (2 min check):** Scan QR code on phone, verify own GitHub profile + stage node appear (**Minimum Success achieved**). |
| **12:30 – 14:45** | **Wave 2 Execution** | `Ariadne-PM` verifies Wave 1 chunk receipts (`validateNextChunkDispatch`) and dispatches Wave 2: `A-005` (Lane B), `A-007` (Lane C), `A-008` (Lane A), `A-011` (Lane D). | Hands-off (invite 3–5 fellow attendees to scan QR code as early beta testers). |
| **14:45 – 15:00** | **M2 Integration Gate** | `Ariadne-INT` merges Wave 2 PRs, deploys `v0.2.0-m2`, verifies top-3 evidence-backed matches and Spotlight view. | **15:00 PM (5 min check):** Review real matches generated between early participants (**Strong Success achieved**). Decide if any Wave 3 items need shedding. |
| **15:00 – 16:30** | **Wave 3 Execution** | Dispatch `A-012` (Mutual Intro State Machine), `A-013` (Discord Bot), and `A-016` (Continuous Rematching). | Hands-off. |
| **16:30 – 16:45** | **M3 Integration Gate** | `Ariadne-INT` deploys `v0.3.0-m3` and tests bilateral `Interested` → Discord/Web intro flow. | **16:45 PM (5 min check):** Complete a live mutual introduction test (**Exceptional Success achieved**). |
| **16:45 – 17:45** | **Wave 4 Hardening & Freeze** | `A-014b` resilience checks + `A-015b` final judge provenance ledger (`/provenance`). **Hard Freeze at 17:45 PM (`v1.0.0`).** | **17:45 PM:** Stage laptop connected/verified; ready for 18:00 PM judging. |

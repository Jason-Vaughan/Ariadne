# Pre-Hackathon Fleet & Infrastructure Readiness Checklist — ARIADNE (`ARIADNE-HACK-2026`)

> **Verification Legend:**
> - `[x]` **Verified Ready Today** (via read-only preflight inspection on `cursatory.tail123678.ts.net`)
> - `[ ]` **Operator Action / Decision Before Saturday 09:30 AM PST**

---

## 1. TangleClaw Fleet & Workspace Readiness

- [x] **Isolated PM Session Created:** `Ariadne-PM` (Project ID `149`, Medusa workspace `ariadne-pm-db0f895f`) is active and attested `READY`.
- [x] **Dedicated Planning Directory:** `/Users/jasonvaughan/Documents/Projects/Ariadne-PM` (with `.tangleclaw/plans/` serving shareable MagicDNS URLs).
- [x] **Fleet Role Charter Defined:** 6-lane core topology (`Ariadne-PM`, `Ariadne-Arc-PRR`, `Ariadne-INT`, `Ariadne-Lane-A`, `Ariadne-Lane-B`, `Ariadne-Lane-C`, `Ariadne-Lane-D`) documented in `FLEET_CHARTER.md`.
- [x] **Worktree Isolation Planned:** Separate Git worktrees (`wt-arc`, `wt-lane-a`..`d`) and non-overlapping directory ownership matrix specified.
- [x] **PortHub Local Dev Ports Selected (Conflict-Free):** Verified against all 67 existing PortHub leases that `3420` (web dev), `3421` (worker harness), and `4420` (test UI) are currently unleased.
- [x] **Zero Interference with `v5.67.0` Sprint:** No `TC-Lane-*` or `SGM-*` repos, ports, or sessions were touched.
- [ ] **Operator Pre-Saturday Fleet Action:** Create/stage the TangleClaw project entries for `Ariadne-Arc-PRR`, `Ariadne-INT`, and `Ariadne-Lane-A`..`D` (kept parked until Saturday 09:30 AM `GO`).

---

## 2. GitHub Repository & API Readiness

- [x] **GitHub CLI Authenticated:** Verified `gh auth status` is logged in as `Jason-Vaughan` (`ssh` protocol, scopes: `admin:org`, `admin:public_key`, `gist`, `repo`).
- [x] **Proposed Repo Owner & Name:** `Jason-Vaughan/ariadne` (public creation command staged in `HACKATHON_RUNBOOK.md` for post-`GO` execution; **unpublished now**).
- [x] **17 Issue Drafts Ready (`A-001`–`A-017`):** Stored locally in `ISSUE_BACKLOG/`.
- [x] **Licensing Deferred per Charter:** Repository will initialize without an open-source license (`UNLICENSED` / TBD until Operator decides).
- [ ] **Operator Pre-Saturday GitHub Action:**
  1. Generate a dedicated fine-grained or classic Personal Access Token (`ARIADNE_GITHUB_TOKEN`, public read-only / zero private repo scopes) for the `5,000 req/hr` server-side GraphQL budget.
  2. Create a GitHub OAuth App (`Ariadne Hackathon`) with callback URL `https://<vercel-domain>/api/auth/github/callback` to populate `ARIADNE_GITHUB_OAUTH_ID` and `ARIADNE_GITHUB_OAUTH_SECRET` (used for 1-click ownership verification).

---

## 3. Hosting, Database & Secrets Readiness

- [x] **Node Runtime Verified:** `v22.22.3` installed locally.
- [x] **Vercel CLI Authenticated:** Verified `vercel whoami` is logged in as `jason-vaughan` (CLI v48.6.7).
- [x] **Zero Premature Deployment:** Confirmed no Ariadne application exists or is deployed.
- [ ] **Operator Pre-Saturday Hosting & DB Action:**
  1. Provision 1 free-tier serverless Postgres database (Vercel Postgres / Neon, or Turso libSQL) in the `jason-vaughan` dashboard and copy `ARIADNE_DATABASE_URL` (takes ~60 seconds, `$0` cost).
  2. Stage `ARIADNE_LLM_API_KEY` (Anthropic or OpenAI/Gemini API key with a capped `$25` hackathon spend limit) and a random 32-byte `ARIADNE_SESSION_SECRET`.

---

## 4. Dedicated Discord Application Readiness

- [x] **Operator Gateway Isolation:** Architecture strictly prohibits touching TangleClaw's existing Operator Discord bot.
- [x] **Web Fallback Designed:** `A-012` guarantees 100% of mutual introductions work on the web UI (`/me/matches/:id`) even if Discord is skipped or blocked by user DM settings.
- [ ] **Operator Pre-Saturday Discord Action (5 mins at `https://discord.com/developers/applications`):**
  1. Create new application **`Ariadne Matchmaker`**.
  2. Create Bot user and copy `ARIADNE_DISCORD_BOT_TOKEN` + `ARIADNE_DISCORD_PUBLIC_KEY` + `ARIADNE_DISCORD_APP_ID`.
  3. Enable Permissions: `Send Messages`, `Create Private Threads`, `Send Messages in Threads`, `Embed Links` (Integer: `395137067008`).
  4. If the hackathon has an official Discord server (or if using a dedicated `Ariadne Lounge` Discord server for the event), generate the bot invite link.

---

## 5. Stage Presentation & Venue Resilience

- [x] **16:9 Stage Specification Complete:** Network, Activity, and Spotlight modes + keyboard controls (`1/2/3/Space/N/P/S`) specified in `VISUALIZER_SPEC.md`.
- [x] **Privacy-Safe Default:** `Thread-XXXX` pseudonyms enforced by default; `S` hotkey forces global pseudonymity override.
- [x] **Degraded-Mode Playbooks Ready:** Documented in `DEMO_RUNBOOK.md` for Wi-Fi loss, GitHub rate limits, LLM timeouts, and Discord DM blocks.
- [ ] **Operator Physical Pack List for Saturday Morning:**
  - Laptop charger + HDMI / USB-C display adapter for 16:9 stage projector.
  - Phone charged + personal hotspot tested as backup internet.
  - Optional: Printed table tent card with the `https://ariadne.../join` QR code (or display directly from `/stage` banner).

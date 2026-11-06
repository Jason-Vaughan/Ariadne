# Stage Demo & Judging Runbook — ARIADNE (`ARIADNE-HACK-2026`)
*Updated with 5-View Stage Dashboard, Stage Narrator Pacing, Seed Pool Toggle & Live Capacity Scaler*

- **Demo Window:** Saturday, November 7, 2026 · `18:00 – 20:00 PM Pacific`
- **Target Pitch Duration:** `3 minutes` live presentation + `2 minutes` judge Q&A

---

## 1. Stage Setup Checklist (`17:45 – 17:55 PM PST`)

1. **Tab 1 — Interactive 5-View Stage Dashboard (`16:9` Full Screen):** Open `https://<ariadne-tunnel-url>/stage` (or `http://127.0.0.1:3420/stage`) at `1920x1080`.
   - Start with **`[📱 QR Overlay: REQUIRES GITHUB PROFILE]` (`Q`)** open on screen so judges and the audience can scan immediately as you walk up.
2. **Tab 2 — Live Roadmap 2 & `v2.0.0` Sprint Reports Hub:** Open `http://cursatory.tail123678.ts.net:3422/` and `/reports/` showing the 4 release trains (`v0.1.0`..`v1.0.0`) and 8-timestamp provenance ledger.
3. **Mobile Device(s):** Operator's phone + 1 volunteer/judge phone ready to tap **`Interested`** for the live **Golden Arc** moment.

---

## 2. Three-Minute Live Stage Script (Point-and-Narrate Flow)

### Beat 1 (`0:00 – 0:50`) · QR Scan (`REQUIRES GITHUB PROFILE`) & View 1: Under-the-Hood Pipeline
- **On Screen:** Show the **`[📱 QR Overlay — REQUIRES GITHUB PROFILE]`** modal, invite the audience/judges to scan and type their GitHub `@username` (Zero-OAuth 1-tap entry), then click **`[1: Pipeline]`**.
- **Point & Narrate (using Stage Narrator Pacing `~3s/column` + `[⏸ Pause]` if desired):**
  1. **Point to Column 1 (`GitHub Crawl`):** *"Watch what happens under the hood as you scan in: Column 1 pulls your public GitHub repos, language distribution, and READMEs in under 200ms."*
  2. **Point to Column 2 (`Gemini Agent Fan-Out`):** *"Column 2 fans out parallel Gemini Flash agents—one extracts your verified engineering Superpowers with repo citations; the other finds your current project bottlenecks."*
  3. **Point to Column 3 (`6-Axis Builder Fingerprint`):** *"Column 3 synthesizes your 6-axis Builder DNA (`Systems`, `Agents`, `LLM/Eval`, `UI/UX`, `Product`, `Data`)."*
  4. **Point to Column 4 (`Anti-Clone Matchmaking`):** *"And Column 4 runs our 40/30/20/10 scorer—notice right here it explicitly **rejects** matching two identical backend clones (`>0.72 similarity`) and selects your **Top 3 Complementary Peers**!"*

### Beat 2 (`0:50 – 1:40`) · View 2 (`Fingerprints`), View 3 (`Top-3 Web + Seed Toggle`) & View 4 (`Golden Arc`)
- **Click **`[2: Fingerprints]`** (5s glance):** Show the room's grid of 6-Axis Builder Fingerprint cards.
- **Click **`[3: Web of Connections]`**:**
  - **Your "Ace Up Your Sleeve" Move:** If only 4–5 people scanned the QR code live, say: *"A network effect needs a network—if only 4 of you scanned in, watch what happens when I toggle on our 25 pre-profiled SF AI builders!"* Click **`[🌱 Seed AI Devs: ON (+25)]` (`S`)** and watch the 4 live attendees immediately weave into a crisp **Top-3 (`k=3`) Web of Connections** with the 25 seeded AI builders!
- **Trigger the Mutual Match ("Golden Arc"):**
  - Tap **`Interested`** on two matched phones (`Zero-Blocker 1-Tap`).
  - **On Stage (`View 3` → `View 4: Spotlight`):** Their connection line ignites into a **Glowing Golden Arc** with a 5-second celebration banner (`"⚡ NEW GOLDEN THREAD"`), and their phones unlock the **Private Web Intro Room (`/me/matches/:id`)** with Mutual Contact Reveal, AI 3-Minute Icebreaker, **Physical Venue Locator (`"Near Stage"` / `"Coffee Area"`)**, Live 2-Person Chat, and 1-tap **Save vCard**!

### Beat 3 (`1:40 – 2:20`) · View 5: `⚡ Live Capacity & QR Burst Scaler` (Systems Engineering Differentiator)
- **Click **`[5: ⚡ Capacity]` (`5` / `C`)** right on `/stage`:**
- **Narrative:**
  > *"Most hackathon apps crash or hit HTTP 429 the moment 50 people in an auditorium scan a QR code at once. So we built a dynamic **Capacity & Burst Engine** right into Ariadne."*
- **Point & Click on `View 5`:**
  1. **Click Room Presets (`30` → `80` → `150` → `300+`):** Point to the **Gemini Flash Parallel Worker Grid** scaling from `8` → `16` → `32` concurrent worker cores and switching GitHub ingestion to adaptive mode.
  2. **Point to the $O(N^2)$ Cost & Latency Shield:** Show how `N = 150` (`11,175` pairs) is filtered deterministically in **`< 12ms` (Stage 1)** so attendees get matches on their phones in `< 500ms`, while expensive Stage 2 Gemini LLM calls are gated strictly to **Top-3 (`k=3`) slates—cutting LLM calls by 96%!**
  3. **Point to the Multi-PAT & 24h SQLite Cache Gauge:** `15,000 req/hr` rotated GitHub token pool + `0ms` cached repeat/VIP scans.

### Beat 4 (`2:20 – 3:00`) · Tab 2: Live Roadmap 2 & `v2.0.0` Autonomous Sprint Reports
- **Switch to Tab 2 (`/reports/` and `/` Roadmap Board):**
- **Narrative:**
  > *"Finally—how did one person build all of this today? Every single issue was planned, built, reviewed, and integrated between 9:30 AM and 5:30 PM by a **9-lane autonomous agent fleet on TangleClaw**, audited with full `v2.0.0` post-sprint reports."*
- Show the **4 Parallel Trains & Cars** on the Roadmap Board and open a **`v2.0.0` Sprint Report** (`8-timestamp cadence t1..t8`, `T_eng`, 3-tier cost ledger, and 4-gate audit).

---

## 3. Dependency Failure Playbooks (Live Demo Degraded Modes)

| Failure Scenario | Immediate Symptom | Pre-Engineered Automatic Fallback & Operator Action |
|---|---|---|
| **1. Small Live Crowd Scanning QR** | Only 3–5 attendees scan the QR code | Click **`[🌱 Seed AI Devs: ON (+25)]` (`S`)** on `/stage` — merges 25 realistic SF AI builder profiles into the live pool in `< 300ms`. |
| **2. Venue Proxy Buffers SSE Streams** | Mobile or `/stage` SSE connection stalls | Client automatically falls back to `GET /api/events/poll?after=<seq_id>` every `2s` with zero lost events. |
| **3. GitHub API Rate Limit Burst** | High concurrent QR scan burst | Rotates across `GITHUB_TOKENS` (`15,000 req/hr`), serves 24h SQLite cache (`0ms`) + pre-warmed VIP handles (`POST /api/admin/prewarm`). |
| **4. LLM Provider Latency Spike** | Gemini API > `6s` | **Stage 1 (`< 500ms` deterministic)** already delivered the 6-Axis Fingerprint, Top-3 matches, and repo evidence pills; Stage 2 falls back cleanly with zero errors. |
| **5. Public Tunnel / Venue Wi-Fi Blip** | Tunnel momentarily slow | Switch host to iPhone Hotspot; `/stage` on presenter laptop runs directly against `http://127.0.0.1:3420/stage` (`0ms` loopback). |

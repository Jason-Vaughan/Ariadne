# Live Stage Visualizer & Multi-View Dashboard Specification — ARIADNE (`ARIADNE-HACK-2026`)

## 1. Design Mandate

The Ariadne Live Stage Visualizer (`/stage`) is a **first-class interactive dashboard** built for a `1920x1080` (`16:9`) auditorium projector or stage monitor. When attendees scan the QR code, `/stage` makes the invisible multi-agent work **visibly happen under the hood in real time**—from GitHub crawling to capability extraction, **Builder Fingerprint** synthesis, and **Top-3 Web of Connections** matchmaking.

### Core Integrity & UX Rules
1. **100% Event-Driven & Two-Stage Progressive:** Every card, pipeline transition, Builder Fingerprint, and graph edge is driven live by `GET /api/events/stream` (with automatic `GET /api/events/poll` fallback). Stage 1 deterministic matches + repo evidence pills appear in **`< 500ms`**; Stage 2 parallel **Gemini Flash (`gemini-2.5-flash`)** deep enrichment streams in within **`2–5s`**.
2. **Clickable 4-View Navigation Bar + Hotkeys:** The presenter can click any of the **4 primary view buttons** in the top header (or press `1`, `2`, `3`, `4` on the keyboard) to switch views on stage at any moment.
3. **Top-3 (`k = 3`) Sparse Web of Connections (Anti-Hairball Rule):** Because hackathon attendees are peers who would otherwise form an unreadable all-to-all hairball (`N(N-1)/2` lines), the graph strictly renders **at most the Top 3 (`k = 3`) highest-scoring complementary matches per participant**, styled by 3 clear connection states (Suggested, 1-Sided Interest, and **Glowing Golden Arc** for Mutual Match).
4. **The "Ace Up Your Sleeve" Seed Pool Toggle (`[🌱 Seed AI Devs: OFF / ON]`):** A prominent top-bar toggle button (`S` hotkey) lets the presenter merge **25 pre-profiled SF AI builder profiles** into the live matching pool with 1 click. If only 3–5 attendees scan the QR code during a demo, flipping `Seed Pool: ON` immediately matches those live attendees against each other **and** against the 25 seeded AI builders. Flipping it `OFF` returns cleanly to 100% live scanners.
5. **QR Join Overlay with Explicit GitHub Requirement (`[📱 QR Join]` / `Q`):** Displays a high-contrast scannable QR code with the bold callout: **`⚡ SCAN TO JOIN — REQUIRES GITHUB PROFILE`**.

---

## 2. Screen Layout (`1920x1080` 16:9 Interactive Stage Frame)

```
+---------------------------------------------------------------------------------------------------+
| ARIADNE · Find Your Thread   [Joined | Crawled | Fingerprints | Matches | Mutual Intros | Workers]|
| VIEW TABS: [1: Under-the-Hood Pipeline] [2: Builder Fingerprints] [3: Web of Connections] [4: Spotlight]
| CONTROLS:  [📱 QR Overlay: REQUIRES GITHUB (Q)]  [🌱 Seed AI Devs: OFF/ON (+25) (S)]  [⚡ Load: 80] |
+---------------------------------------------------------------------------------------------------+
|                                                                     |                             |
|                                                                     |   LIVE AGENT TELEMETRY      |
|                       PRIMARY INTERACTIVE CANVAS                    |   & GOLDEN THREAD FEED      |
|                   (74% Width — Active View 1, 2, 3, or 4)           |   (26% Width)               |
|                                                                     |                             |
|   - View 1: 4-Stage Assembly Line (Crawl -> Extract -> Fingerprint -> Match)                      |
|   - View 2: Builder Fingerprints Gallery (6-Axis DNA Cards & Superpowers)                         |
|   - View 3: Top-3 Web of Connections (Force Graph + Golden Arcs)    |   - Parallel Gemini Workers |
|   - View 4: Match Spotlight (Side-by-Side DNA + 40/30/20/10 Bars)   |   - Mutual Match Toasts     |
|                                                                     |   - Persistent Mini QR Card |
+---------------------------------------------------------------------------------------------------+
| FOOTER: SSE Stream Live · Parallel Gemini Flash Pool Ready · Top-3 Edge Cap Active · v0.x         |
+---------------------------------------------------------------------------------------------------+
```

---

## 3. The 4 Clickable Stage Views (`/stage`)

### View 1: `[1] Under-the-Hood Pipeline` (The 4-Stage Narratable Assembly Line + Live X-Ray Bar)
Designed specifically so the presenter can **stand on stage, point to the screen, and narrate what Ariadne is doing in the background** as attendees scan the QR code:

```
+---------------------------------------------------------------------------------------------------+
| VIEW 1: UNDER-THE-HOOD PIPELINE   [🎬 Pacing: Stage Narrator (3s/step) | Fast] [⏸ Pause] [🔄 Replay]|
+------------------------+------------------------+------------------------+------------------------+
| 1. GITHUB CRAWL        | 2. GEMINI AGENT FANOUT | 3. BUILDER FINGERPRINT | 4. ANTI-CLONE MATCHING |
| (Public Repo Harvest)  | (Capabilities & Needs) | (6-Axis Builder DNA)   | (40/30/20/10 Scorer)   |
+------------------------+------------------------+------------------------+------------------------+
| [@octocat]    142ms    | [@karpathy]  Worker #2 | [@simonw]              | [@swyx] -> Top 3 Ready |
| 📦 18 public repos     | 🤖 Agent A (Offers):   | Systems  ████████░ 88  | 🔍 Scanned 29 peers    |
| 🔤 TS 62% · Rust 24%   |  "MCP Server Author"   | Agents   █████████ 94  | ❌ @dev2 (Clone >0.72) |
| 📄 READMEs:            | 🔍 Agent B (Needs):    | LLM/Eval ████████░ 82  | ✅ @ui_pro (Score: 91) |
|  • mcp-router          |  "Needs: Canvas Graph" | UI/UX    ███░░░░░░ 32  | ✅ @infra_x (Score: 87)|
|  • sqlite-vec          | ✅ 4 Repo Citations    | 🏷️ "Agent Infra Arch"  | ⚡ Emitted to Web Graph|
+------------------------+------------------------+------------------------+------------------------+
| 🎯 LIVE NARRATOR X-RAY SPOTLIGHT (Click any builder or [Follow Next Scanner] to magnify in 28pt): |
| [@octocat]  [✓ 1. Crawled 18 Repos] ──► [✓ 2. Extracted 4 Claims] ──► [● 3. Minting 6-Axis DNA...] |
+---------------------------------------------------------------------------------------------------+
```

1. **Stage Narrator Pacing Control (`[🎬 Pacing: Stage Narrator (3s/step) | Live Fast]` + `[⏸ Pause]` + `[🔄 Replay Last Scan]`):**
   - **Dual-Speed Architecture (Fast on Phone, Narratable on Stage):** Even when the backend finishes Stage 1 (`< 500ms`) and Stage 2 (`2–4s`) almost immediately for the attendee's mobile phone (`/me`), **View 1 on `/stage`** defaults to **`Stage Narrator Pacing (`~2.5s–3.5s` dwell per column)`** so cards don't flash past in a blur before you can point to them!
   - You also have **`[⏸ Pause Pipeline]`** (freezes the assembly line mid-flight so you can walk up to the screen and point at a specific card) and **`[🔄 Replay Walkthrough]`** (re-runs the most recent scanner—or a featured builder—step-by-step across all 4 columns on demand).
2. **Column 1 — `1. GitHub Public Crawl & Repo Harvest` (`A-003`):**
   - Visibly ticks through what is being fetched so you can point and say *"Right here it's pulling their public repos, languages, and READMEs"*:
     - Repo count & top 3 repository names (`e.g., mcp-router, agent-eval, sqlite-vec`)
     - Language distribution bar (`TypeScript 62% · Rust 24% · Python 14%`)
     - Cache badge (`⚡ 24h SQLite Cache Hit (4ms)` or `🌐 Live GitHub GraphQL (180ms)`).
3. **Column 2 — `2. Parallel Gemini Flash Agent Fan-Out` (`A-004` + `A-005`):**
   - Shows the **two parallel Gemini Flash sub-agents** (`🤖 Capability Agent` + `🔍 Bottleneck Agent`) running concurrently with worker slot badges (`Gemini Worker #1..#16`):
     - **`Offers (Verified Superpower):`** Shows the extracted skill + exact repo citation pill.
     - **`Needs (Complementary Gap):`** Shows the inferred bottleneck from their open issues/architecture.
4. **Column 3 — `3. 6-Axis Builder Fingerprint Synthesis` (`Builder DNA`):**
   - Animates the builder's **6 horizontal DNA bars / radar polygon** (`Systems/Infra`, `Agent Orchestration`, `LLM/Eval`, `Frontend/UX`, `Product/GTM`, `Data/Pipelines`) and stamps a bold **Builder Archetype Title** (`e.g., "Agent Infrastructure Architect"`).
5. **Column 4 — `4. Anti-Clone Matchmaking & Evidence Gate` (`A-006` + `A-007`):**
   - Makes the math visible on stage! For each builder, it shows:
     - `🔍 Evaluated against N peers in pool`
     - **One explicit Anti-Clone rejection callout:** `❌ Skipped @peer_x (Stack Clone > 0.72 — both pure Backend)` so you can point to it and tell the judges *"Notice it refuses to match two identical clones!"*
     - **The Top-3 Complementary Matches selected:** `✅ #1 @peer_y (91/100 · Complementary UI + Systems)` with a visual pulse sending them into **View 3 (`Web of Connections`)**.
6. **Bottom `🎯 Live Narrator X-Ray Bar` (`[Follow Next Scanner]`):**
   - Clicking any builder card—or toggling **`[🎯 Auto-Follow Latest Scanner]`**—pins a magnified single-builder horizontal stepper across the bottom of `View 1` in large stage typography so you can narrate one specific attendee's entire 4-stage journey from left to right.

### View 2: `[2] Builder Fingerprints Gallery` ("The Room Roster")
A high-contrast, clickable grid of **Builder Fingerprint Cards** for everyone in the active pool:
- **Header:** `@github_handle` (or `Thread-XXXX` pseudonym if stage display consent is unchecked) + avatar + live status badge (`Seeded AI Dev` vs `Live Scanner`).
- **Visual 6-Axis Builder Fingerprint:** Mini radar/bar signature across the 6 engineering dimensions.
- **Superpower (`What They Bring`):** Top 2 evidence-backed capability pills with cited repo names (`e.g., "MCP Server Author (3 repos)"`).
- **Looking For (`Complementary Need`):** Top inferred bottleneck (`e.g., "Needs: WebGL / Canvas Graph UI"`).
- **Click Interaction:** Clicking any Builder Fingerprint card highlights their Top-3 matches or opens them directly in **View 4 (Spotlight)**.

### View 3: `[3] Web of Connections` (Sparse Top-3 Force-Directed Network Graph)
The macro network visualization of the room, engineered to stay crisp and legible at any crowd size (`10` to `300` people):
- **Top-3 (`k = 3`) Edge Cap:** Only the **Top 3 highest-scoring matches per node** (`score >= 45`) are rendered as edges, preventing an all-to-all peer hairball and forming natural complementary clusters.
- **Three Visual Connection States:**
  1. **Suggested Match (`candidate`):** Subtle dashed cyan-slate thread (`opacity: 0.45`).
  2. **One-Sided Interest (`proposed_by_a` or `proposed_by_b`):** Solid amber thread with a directional pulse traveling toward the invited peer.
  3. **Mutual Match — The "Golden Arc" (`completed`):** When **both** participants tap `Interested` on their phones, the edge between them transforms into a **thick, glowing gold arc** with an expanding ripple animation AND triggers a 5-second **Stage Celebration Banner** at the top of the screen:
     > **`⚡ NEW GOLDEN THREAD: @alice ↔ @bob · Matched on Rust Runtime + Agent Eval (Score: 91/100)`**
- **Click Interaction:** Clicking any edge or Golden Arc opens that pair immediately in **View 4 (Match Spotlight)**.

### View 4: `[4] Match Spotlight & Mutual Intro View`
Full-canvas side-by-side comparison of any selected match pair (or automatically triggered when a new Mutual Match occurs):
- **Left & Right Cards:** Builder A and Builder B's **6-Axis Builder Fingerprints**, top languages, and cited GitHub repository pills.
- **Center Bridge:**
  - **Composite Match Score (`e.g., 91 / 100`)** + 4 horizontal score bars:
    - `Complementarity (Needs ↔ Offers): 37 / 40`
    - `Domain & Stack Synergy: 27 / 30`
    - `GitHub Evidence Depth: 18 / 20`
    - `Activity & Anti-Clone Penalty: 9 / 10`
  - **Why You Two Should Talk Right Now:** Concrete collaboration thesis + suggested 3-minute starter topic.
  - **Live Connection Status:** `Suggested Top-3 Match` → `1-Sided Interest Pending` → `⚡ Mutual Match — Intro Room Unlocked!`.

---

## 4. Stage Operator Buttons & Keyboard Shortcuts

Every control is accessible **both** as an on-screen clickable button in the `/stage` header **and** via keyboard shortcut:

| Button / Control | Hotkey | Action on Stage |
|---|---|---|
| **`[1: Pipeline]`** | `1` | Switch to **View 1: Under-the-Hood 4-Stage Pipeline** (`Crawl → Extract → Fingerprint → Match`). |
| **`[2: Fingerprints]`** | `2` | Switch to **View 2: Builder Fingerprints Gallery** (6-axis DNA cards for the room). |
| **`[3: Web of Connections]`** | `3` | Switch to **View 3: Sparse Top-3 Network Graph** with Golden Arcs. |
| **`[4: Match Spotlight]`** | `4` | Switch to **View 4: Side-by-Side Match Spotlight** (`N` / `P` steps through top matches). |
| **`[📱 QR Overlay]`** | `Q` | Toggle large stage QR modal with **`⚡ SCAN TO JOIN — REQUIRES GITHUB PROFILE`**. |
| **`[🌱 Seed AI Devs: OFF/ON]`** | `S` | Toggle the **25 Pre-Curated SF AI Builder Seed Profiles** into/out of the live matching pool ("Ace Up Your Sleeve" for small demo crowds). |
| **`[⚡ Auto-Cycle]`** | `Space` | Hands-free rotation across Views `1 → 2 → 3 → 4` every `15s`. |
| **`[🔒 Privacy Override]`** | `P` | Toggle strict pseudonymity (`Thread-XXXX`) across all stage views. |

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

### View 1: `[1] Under-the-Hood Pipeline` (The 4-Stage Real-Time Assembly Line)
When the audience scans the QR code, this view shows the live factory floor across **4 columns** so judges see the work happening under the hood:
1. **Column 1 — `GitHub Crawl & Repo Harvest` (`A-003`):**
   - Shows active `@username` cards as Ariadne fetches public repos, language byte counts, `README` excerpts, and recent PRs/commits (`e.g., "@octocat · 18 repos · Rust / TypeScript · 142ms"`).
2. **Column 2 — `Capability & Bottleneck Extraction` (`A-004` + `A-005`):**
   - Shows the **Parallel Gemini Flash Worker Pool** (`Worker #1..#N`) extracting verified engineering capabilities (`Offers`) and inferring current project bottlenecks (`Needs`) with cited repository receipts.
3. **Column 3 — `Builder Fingerprint Synthesis` (`Builder DNA`):**
   - Renders each participant's freshly minted **6-Axis Builder Fingerprint** (`Systems/Infra`, `Agent Orchestration`, `LLM/Eval`, `Frontend/UX`, `Product/GTM`, `Data/Pipelines`) + top Superpower pill.
4. **Column 4 — `Complementary Matchmaking` (`A-006` + `A-007`):**
   - Shows deterministic `40/30/20/10` pair evaluations completing in `< 500ms` followed by Gemini Flash collaboration theses, emitting the participant's **Top-3 Matches**.

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

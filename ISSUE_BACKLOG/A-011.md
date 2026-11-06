# [feature] A-011: Stage Views 1, 2, 4 & 5 — Narratable 4-Stage Pipeline, Builder Fingerprints, Match Spotlight & Capacity Scaler

- **Issue ID:** `A-011`
- **Priority:** `P0`
- **Assigned Lane & Car:** `Ariadne-Lane-D` (`Car 1-D`)
- **Milestone / Train:** `Train 1 — Core Pipeline & Stage Shell (v0.2.0)`
- **Dependencies:** `A-007`, `A-009`, `A-010`

## 1. Description
Implement the four deep-inspection views inside the `/stage` visualizer dashboard so the presenter can click between them and narrate what Ariadne is doing under the hood:
- **View 1 (`[1: Under-the-Hood Pipeline]`):** 4-Column Narratable Assembly Line (`1. GitHub Crawl` → `2. Gemini Agent Fan-Out` → `3. 6-Axis Builder Fingerprint` → `4. Anti-Clone Matchmaking`) with **Stage Narrator Pacing (`~3s/step`)**, `[⏸ Pause]`, `[🔄 Replay]`, Anti-Clone rejection callouts, and a bottom `🎯 Live Narrator X-Ray Bar`.
- **View 2 (`[2: Builder Fingerprints]`):** Live grid of **6-Axis Builder Fingerprint Cards** showing each person's Superpower (`Offers`), Bottleneck (`Needs`), and cited GitHub repos.
- **View 4 (`[4: Match Spotlight]`):** Side-by-side comparison of any selected match pair (or the latest Golden Arc mutual match) showing both Builder Fingerprints, the `40/30/20/10` score bars, repo evidence pills, and collaboration thesis.
- **View 5 (`[5: ⚡ Capacity & Burst Scaler]`):** Stage-visible **Capacity & QR Burst Engineering Panel** where clicking Room Size Presets (`30`, `80`, `150`, `300+`) visibly scales the **Gemini Flash Parallel Worker Core Grid (`8..32` cores)**, shows the **Multi-PAT GitHub Rate-Limit Shield & 24h SQLite Cache gauge**, and displays the **$O(N^2)$ Stage 1 (`< 12ms`) vs. Top-3 Gate (`96% LLM Call Reduction`)** math live on stage!

## 2. Rationale
When everyone in the room scans the QR code, a static network graph isn't enough—judges want to see the agentic pipeline visibly crawling repos, synthesizing Builder Fingerprints, and scoring complementary pairs under the hood, with 1-click buttons to switch between the Pipeline, the Fingerprints Gallery, the Web of Connections, and the Spotlight view.

## 3. Dependencies
- Depends on `A-007` (evaluated match payload), `A-009` (SSE/poll event stream), and `A-010` (`/stage` 4-view navigation shell).

## 4. Implementation Boundaries
- **In Scope:** `src/components/stage/PipelineAssemblyView.tsx` (View 1), `src/components/stage/FingerprintsGalleryView.tsx` (View 2), `src/components/stage/SpotlightView.tsx` (View 4), `GET /api/stage/snapshot` (returns pipeline column counts, participant fingerprints, and top matches), and click-to-spotlight wiring from Views 1, 2, and 3.
- **Out of Scope:** Mobile participant screens (`A-008`, `A-012`).

## 5. Acceptance Criteria
- [ ] **View 1 (`[1: Under-the-Hood Pipeline]`) — 4-Column Narratable Assembly Line:**
  - **Column 1 (`1. GitHub Crawl`):** Displays `@username`, repo count, top 3 repo names, language distribution bar (`TS/Rust/Python`), and cache/live timing badge.
  - **Column 2 (`2. Gemini Agent Fan-Out`):** Displays concurrent `🤖 Capability Agent (Offers)` + `🔍 Bottleneck Agent (Needs)` outputs with `Gemini Worker #N` badges and repo citation count.
  - **Column 3 (`3. Builder Fingerprint Synthesis`):** Renders animated 6-axis DNA bars (`Systems/Infra`, `Agent Orchestration`, `LLM/Eval`, `Frontend/UX`, `Product/GTM`, `Data/Pipelines`) and stamps a bold Builder Archetype badge.
  - **Column 4 (`4. Anti-Clone Matchmaking`):** Displays peer evaluation count, **1 explicit Anti-Clone rejection callout** (`"❌ Skipped @peer (Stack Clone > 0.72)"`), and the **selected Top-3 Complementary Matches** (`"✅ @match (91/100)"`).
- [ ] **Stage Narrator Pacing, Pause & Replay Controls (`[🎬 Stage Narrator (3s/step) | Fast]`, `[⏸ Pause]`, `[🔄 Replay]`):**
  - Decouples stage visual pacing from backend speed: while the attendee's mobile phone (`/me`) receives matches in `< 500ms`, `View 1` on `/stage` defaults to a narratable **`~2.5s–3.0s` visual dwell per column** so cards never flash past before the presenter can point to them.
  - Includes **`[⏸ Pause Pipeline]`** (freezes the columns so the presenter can point at a specific card) and **`[🔄 Replay Walkthrough]`** (re-runs the latest scanner or a selected builder across all 4 columns on demand).
- [ ] **Bottom `🎯 Live Narrator X-Ray Bar`:** Clicking any builder card (or enabling `[🎯 Auto-Follow Latest Scanner]`) pins a magnified 28pt single-builder horizontal stepper across the bottom of `View 1` (`1. Crawl ──► 2. Gemini Extract ──► 3. 6-Axis DNA ──► 4. Top-3 Matched`).
- [ ] **View 2 (`[2: Builder Fingerprints]`):** Renders a responsive grid of 6-Axis Builder Fingerprint Cards (radar/bar visualization + Superpower pill + Looking-For pill + cited repo badges). Clicking any card filters/highlights their Top-3 matches.
- [ ] **View 4 (`[4: Match Spotlight]`):** Renders Builder A and Builder B side-by-side with their 6-Axis Fingerprints, Composite Score (`e.g., 91/100`), 4-dimension breakdown bars (`40/30/20/10`), cited GitHub repo links, and `"Why You Two Should Talk"` thesis.
- [ ] **View 5 (`[5: ⚡ Capacity & Burst Scaler]` / hotkey `5` or `C`):** Renders the stage-visible Capacity & Admission Gate showcase with:
  1. Interactive **Hard Room Cap Buttons (`[15]`, `[● 30 (Default)]`, `[50]`, `[100]`, `[🔒 Lock Intake]`)** wired to `POST /api/admin/capacity` — showing live fill (`e.g., 18 / 30 Builders`) and a preview of the mobile *"🚧 System is at capacity — please try back later"* screen shown to overflow scanners,
  2. Live **Gemini Flash Worker Core Grid (`8` → `16` → `24` → `32` visual worker slots)** showing active vs. idle workers,
  3. **Multi-PAT GitHub Quota (`15,000 req/hr`) & 24h SQLite Cache Hit Rate** gauge + VIP Pre-Warm input (VIP handles bypass the hard cap),
  4. **$O(N^2)$ Pairwise & Top-3 Gate Cost-Reduction Calculator** showing `N(N-1)/2` Stage 1 deterministic evaluations (`< 12ms`) vs. `3 × N` Stage 2 Gemini calls (`92%–98%` LLM call reduction).
- [ ] Clicking any view tab (`1`, `2`, `3`, `4`, `5`) transitions views instantaneously (`< 50ms`) without losing live SSE state.

## 6. Test Requirements
- Component and state tests verifying View 1 4-stage card progression on SSE events, View 2 6-axis Builder Fingerprint rendering, View 4 Spotlight pair selection, and pseudonymity compliance.

## 7. Security & Privacy Considerations
- `GET /api/stage/snapshot` and `/api/stage/spotlight` strip all private contact details and respect `public_display_consent`.

## 8. Expected Demonstration Impact
Delivers the ultimate "Under the Hood" stage demo: as attendees scan the QR code, you click **`[1: Pipeline]`** to show live GitHub crawling & Gemini worker fan-out, **`[2: Fingerprints]`** to show the room's Builder DNA cards, **`[3: Web of Connections]`** to show the Top-3 match web, and **`[4: Spotlight]`** to inspect a live Golden Arc match!

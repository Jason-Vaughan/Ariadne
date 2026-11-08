# [feature] A-010: Interactive Stage Visualizer Shell, Top-3 Web of Connections, Golden Arcs & Seed Pool Toggle

- **Issue ID:** `A-010`
- **Priority:** `P0`
- **Assigned Lane & Car:** `Ariadne-Lane-D` (`Car 1-D`)
- **Milestone / Train:** `Train 1 — Core Pipeline & Stage Shell (v0.2.0)`
- **Dependencies:** `A-009`

## 1. Description
Build the `1920x1080` (`16:9`) interactive Stage Visualizer dashboard shell (`/stage`), persistent 6-metric top KPI ribbon, **Clickable 4-View Navigation Bar (`[1: Pipeline]`, `[2: Fingerprints]`, `[3: Web of Connections]`, `[4: Spotlight]`)**, **`[📱 QR Overlay: REQUIRES GITHUB PROFILE]`** modal (`Q`), **`[🌱 Seed AI Devs: OFF / ON (+25 Profiles)]`** toggle button (`S`), and **View 3: Sparse Top-3 (`k = 3`) Web of Connections** force-directed graph with **Glowing Golden Arcs** for mutual matches.

## 2. Rationale
At a hackathon of AI peers, drawing an all-to-all match graph creates an unreadable hairball. Capping rendered edges to each participant's **Top 3 Complementary Matches (`k = 3`)** creates a crystal-clear Web of Connections. In addition, the 1-click **`[🌱 Seed AI Devs: OFF/ON]`** button gives the presenter an "Ace Up Their Sleeve": if only 3–5 attendees scan the QR code live, toggling Seed Mode merges 25 realistic SF AI builder profiles into the live matching pool so the live attendees match with each other AND the 25 seeded builders on stage.

## 3. Dependencies
- Depends on `A-009` (`GET /api/events/stream` and `GET /api/events/poll`).

## 4. Implementation Boundaries
- **In Scope:** `src/app/stage/page.tsx`, `src/components/stage/KpiRibbon.tsx`, `src/components/stage/StageHeaderControls.tsx` (4 clickable view tabs + QR modal button + Seed Pool toggle button), `src/components/stage/NetworkGraph.tsx` (Top-3 edge cap + Golden Arcs + Stage Celebration Banner), `src/components/stage/QrJoinBanner.tsx` (with bold `⚡ SCAN TO JOIN — REQUIRES GITHUB PROFILE`), and `POST /api/stage/seed-toggle` (toggles the 25 curated AI builder profiles in/out of the active pool).
- **Out of Scope:** View 1 Pipeline Assembly Line, View 2 Fingerprints Gallery, and View 4 Spotlight deep-dive (`A-011`).

## 5. Acceptance Criteria
- [ ] Renders at `1920x1080` (`16:9`) with clickable top navigation buttons for all 4 views (`[1: Under-the-Hood Pipeline]`, `[2: Builder Fingerprints]`, `[3: Web of Connections]`, `[4: Match Spotlight]`) plus keyboard shortcuts (`1/2/3/4/Q/S/Space`).
- [ ] **QR Join Modal (`[📱 QR Overlay]` / `Q`):** Displays a giant scannable QR code with a high-contrast badge reading **`⚡ SCAN TO JOIN — REQUIRES GITHUB PROFILE`** and a live `"N Builders Scanned In"` counter.
- [ ] **Seed AI Devs Toggle (`[🌱 Seed AI Devs: OFF/ON]` / `S`):** Clicking toggles 25 pre-curated SF AI developer profiles (`is_seed = 1`) into/out of the active matching pool in `< 300ms`, matching real live scanners against both live peers and seeded AI builders.
- [ ] **Top-3 (`k = 3`) Web of Connections (`View 3`):** Renders at most the Top 3 highest-scoring match edges per node with 3 distinct visual states:
  1. `candidate` (Suggested Top-3 Match): Dashed cyan-slate line.
  2. `proposed_by_a/b` (1-Sided Interest): Solid pulsing amber line.
  3. `completed` (**Mutual Match — "Golden Arc"**): Thick glowing gold arc with an expanding ripple animation + 5-second top-of-screen **Golden Thread Celebration Banner** (`"⚡ NEW GOLDEN THREAD: @userA ↔ @userB"`).

## 6. Test Requirements
- Component and API tests verifying Top-3 (`k = 3`) edge capping (no node exceeds 3 rendered primary edges), Seed Pool toggle (`OFF ↔ ON`) inclusion/exclusion in live matching, Golden Arc transition on `introduction.completed`, and QR overlay rendering.

## 7. Security & Privacy Considerations
- Enforce pseudonymous labels (`Thread-XXXX`) whenever `public_display_consent === false` (or when privacy override `P` is active).

## 8. Expected Demonstration Impact
Gives the Presenter total stage command: show the QR code (`REQUIRES GITHUB PROFILE`), flip on the 25 Seed AI Devs if the test crowd is small, and watch the Top-3 Web of Connections light up with glowing Golden Arcs.

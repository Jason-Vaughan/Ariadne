# [feature] A-016: Two-stage progressive pipeline, Parallel Gemini Flash worker pool & Onsite Capacity Controller

- **Issue ID:** `A-016`
- **Priority:** `P0`
- **Assigned Lane & Car:** `Ariadne-Lane-C` (`Car 2-C`)
- **Milestone / Train:** `Train 2 — End-to-End Integration & Mutual Intros (v0.3.0)`
- **Dependencies:** `A-003`..`A-007`, `A-009`

## 1. Description
Implement the **Two-Stage Progressive Match Pipeline** and **Parallel Gemini Flash (`gemini-2.5-flash`) Worker Pool** (`src/lib/jobs/runner.ts` + `src/lib/scoring/rematcher.ts`), paired with the **Onsite Room Capacity Controller (`/admin` + `POST /api/admin/capacity`)** so the Operator can dynamically dial the expected crowd size (`30`, `80`, `150`, `300+` concurrent QR scanners) onsite and auto-scale worker concurrency, GitHub fetch mode, and continuous rematching.

## 2. Rationale
During the live stage pitch, dozens of attendees will scan the QR code within the same 30-second window. A **Two-Stage Progressive UX** guarantees that every attendee gets their **Stage 1 deterministic 6-axis Builder Fingerprint + Top-3 Matches + repo evidence pills in `< 500ms`**, while the **Stage 2 Parallel Gemini Flash Worker Pool** fans out `8..32` concurrent workers in the background to stream deep capability/bottleneck/thesis enrichments over SSE (`2–5s`) with zero blocking or rate-limit bottlenecks.

## 3. Dependencies
- Depends on `A-003`..`A-007` and `A-009`.

## 4. Implementation Boundaries
- **In Scope:** `src/lib/jobs/runner.ts` (Two-Stage execution + configurable `WORKER_CONCURRENCY` pool using `GEMINI_API_KEY` `gemini-2.5-flash` with deterministic fallback), `src/lib/scoring/rematcher.ts` (Top-3 continuous rematching preserving acted-upon matches), `src/app/admin/page.tsx`, and `src/app/api/admin/capacity/route.ts` (live room-size presets: `30`, `80`, `150`, `300+` + VIP pre-warm trigger UI + Seed Pool toggle button).
- **Out of Scope:** Modifying frozen `src/contracts/*`.

## 5. Acceptance Criteria
- [ ] **Stage 1 (`< 500ms` Instant Deterministic Match):** Immediately upon `github.fetch.completed`, computes the participant's baseline 6-Axis Builder Fingerprint and runs `A-006` (`40/30/20/10`) against all active pool members to emit their initial **Top-3 Matches + repo evidence pills** in `< 500ms`.
- [ ] **Stage 2 (`2–5s` Parallel Gemini Flash Fan-Out):** Fans out `A-004` (capabilities), `A-005` (bottlenecks), and `A-007` (match explanations) across a parallel worker pool (`Promise.allSettled` bounded by `workerConcurrency`, defaulting to `GEMINI_MODEL=gemini-2.5-flash`) and streams `match.enriched` events via SSE to `/me` and `/stage`.
- [ ] **Zero-Downtime Deterministic Fallback:** If `GEMINI_API_KEY` is absent, rate-limited, or times out (`> 6s`), Stage 1 deterministic capabilities, bottlenecks, and evidence-backed match explanations remain 100% functional with zero user-visible errors.
- [ ] **Onsite Room Capacity & Hard Admission Cap Controller (`/admin`, `/stage` View 5 & `POST /api/admin/capacity`):**
  - Defaults `maxRoomCapacity` to **`30`** (with 1-click presets **`[15]`**, **`[30]`**, **`[50]`**, **`[100]`**, plus **`[🔒 Lock Intake]`**).
  - Enforces the hard admission cap on new QR joins (`429 ROOM_AT_CAPACITY` -> friendly *"System is at capacity — please try back later"* notice on `/join`), while always admitting pre-warmed VIP/Judge handles.
  - Dynamically scales `workerConcurrency` (`8` → `16` → `24` → `32` parallel Gemini Flash workers) and `githubFetchMode` (`full-graphql` vs `fast-rest-top5`) to match the selected cap.
- [ ] **Continuous Rematching:** Preserves any match where either participant has already tapped `Interested` or `Pass`.

## 6. Test Requirements
- Unit/integration tests verifying: (1) `< 500ms` Stage 1 deterministic match emission before Stage 2 LLM completion, (2) parallel worker concurrency scaling via `POST /api/admin/capacity`, (3) graceful deterministic fallback when LLM times out, and (4) preservation of acted-upon matches during continuous rematching.

## 7. Security & Privacy Considerations
- Immediately exclude any participant with `consent_status === 'withdrawn'` from worker and rematching passes.

## 8. Expected Demonstration Impact
Gives the Operator a live onsite capacity dial (`/admin`) and guarantees that whether 10 people or 200 people scan the QR code at once, everyone sees matches on their phone in `< 500ms` while the 16:9 Stage Visualizer shows parallel Gemini Flash workers flying through the queue.

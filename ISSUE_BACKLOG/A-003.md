# [feature] A-003: GitHub public-data connector, Multi-PAT pool, 24h SQLite cache & VIP pre-warmer

- **Issue ID:** `A-003`
- **Priority:** `P0`
- **Assigned Lane & Car:** `Ariadne-Lane-B` (`Car 1-B`)
- **Milestone / Train:** `Train 1 — Core Pipeline & Stage Shell (v0.2.0)`
- **Dependencies:** `A-001`

## 1. Description
Implement the bounded GitHub public-data connector (`src/lib/github/*`) that retrieves a participant's public profile metadata, top/recent non-fork repositories, truncated `README.md` excerpts, language distributions, and recent public issues/PRs, normalizing them into verifiable `EvidenceReceipt` records and computing an initial **6-Axis Builder Fingerprint** (`Systems/Infra`, `Agent Orchestration`, `LLM/Eval`, `Frontend/UX`, `Product/GTM`, `Data/Pipelines`). Includes **Multi-PAT Token Rotation (`GITHUB_TOKENS`)**, a **24-hour SQLite Snapshot Cache**, and a **VIP / Judge Pre-Warm Endpoint (`POST /api/admin/prewarm`)**.

## 2. Rationale
When 40–150 people scan the QR code simultaneously during a stage pitch, Ariadne must never hit GitHub API rate limits or stall on slow network calls. Rotating across 2–3 GitHub PATs (`15,000+ req/hr`), caching snapshots for 24h in SQLite, and allowing the Operator to pre-warm judge/VIP handles ahead of time guarantees sub-second reliability.

## 3. Dependencies
- Depends on `A-001` (`EvidenceReceipt` contract, `github_snapshots` table, event contracts `github.fetch.started`, `github.fetch.completed`, `analysis.failed`).

## 4. Implementation Boundaries
- **In Scope:** `src/lib/github/client.ts` (with `GITHUB_TOKENS` round-robin rotation + adaptive `full` vs `fast-rest` mode), `src/lib/github/normalizer.ts` (including deterministic 6-axis Builder Fingerprint baseline), `src/lib/github/sanitizer.ts`, 24-hour snapshot caching in `github_snapshots`, and `POST /api/admin/prewarm` (accepts an array of GitHub handles to pre-fetch into SQLite cache).
- **Out of Scope:** Gemini Flash deep capability synthesis (`A-004`) or opportunity inference (`A-005`).

## 5. Acceptance Criteria
- [ ] Supports comma-separated `GITHUB_TOKENS` (or single `GITHUB_TOKEN`) with automatic token rotation on `X-RateLimit-Remaining < 50` or `403/429`.
- [ ] Retrieves public profile, up to 10 non-fork public repositories, languages, topics, and truncated `README.md` (`<= 3,500 chars`), emitting `github.fetch.started` and `github.fetch.completed` with repo count and duration (`ms`).
- [ ] Computes a deterministic baseline **6-Axis Builder Fingerprint** (`0–100` across `Systems/Infra`, `Agent Orchestration`, `LLM/Eval`, `Frontend/UX`, `Product/GTM`, `Data/Pipelines`) from repo languages/topics in `< 50ms` so Stage 1 progressive UX renders immediately.
- [ ] Serves repeat or pre-warmed handles from the 24-hour `github_snapshots` SQLite cache in `< 10ms` (`0` external GitHub API calls).
- [ ] `POST /api/admin/prewarm` accepts `{ handles: ["user1", "user2", ...] }` and caches their GitHub snapshots in the background before demo time.

## 6. Test Requirements
- Unit tests covering Multi-PAT token rotation, GraphQL/REST response normalization, 24-hour SQLite cache hits, 6-axis Builder Fingerprint calculation, `POST /api/admin/prewarm`, and HTML/prompt-injection sanitization.

## 7. Security & Privacy Considerations
- Query **only** public endpoints; filter out any private repository references.
- Sanitize all external GitHub text before storing or passing downstream.

## 8. Expected Demonstration Impact
Powers **Column 1 (`GitHub Crawl`)** and **Column 3 (`Builder Fingerprint`)** on the 16:9 Stage Visualizer with sub-second cached speed and bulletproof rate-limit headroom.

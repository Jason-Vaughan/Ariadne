# [feature] A-003: GitHub + optional public website connector, Multi-PAT pool, 24h SQLite cache & VIP pre-warmer

- **Issue ID:** `A-003`
- **Priority:** `P0`
- **Assigned Lane & Car:** `Ariadne-Lane-B` (`Car 1-B`)
- **Milestone / Train:** `Train 1 — Core Pipeline & Stage Shell (v0.2.0)`
- **Dependencies:** `A-001`

## 1. Description
Implement the bounded GitHub + optional Public Website connector (`src/github/*`) that retrieves a participant's public GitHub profile metadata, top/recent non-fork repositories, truncated `README.md` excerpts, language distributions, and—when provided—fetches and extracts clean text from their **optional public personal website / portfolio URL (`website_url`, e.g. `https://jasonvaughan.com`)**, normalizing both into verifiable `EvidenceReceipt` records (`source_type: 'github_repo' | 'github_profile' | 'public_website'`) and computing an initial **6-Axis Builder Fingerprint** (`Systems/Infra`, `Agent Orchestration`, `LLM/Eval`, `Frontend/UX`, `Product/GTM`, `Data/Pipelines`). Includes **Multi-PAT Token Rotation (`GITHUB_TOKENS`)**, a **24-hour SQLite Snapshot Cache**, and a **VIP / Judge Pre-Warm Endpoint (`POST /api/admin/prewarm`)**.

## 2. Rationale
When 40–150 people scan the QR code simultaneously during a stage pitch, Ariadne must never hit GitHub API rate limits or stall on slow network calls. Furthermore, many builders showcase their bio, essays, and flagship projects on a personal website (`jasonvaughan.com`). Combining public GitHub repositories with an optional public website crawl (bounded to a `3.0s` timeout and `100 KB` text limit, automatically skipping login-gated pages) produces dramatically richer Builder Fingerprints and match evidence pills.

## 3. Dependencies
- Depends on `A-001` (`EvidenceReceipt` contract, `github_snapshots` table, event contracts `github.fetch.started`, `github.fetch.completed`, `analysis.failed`).

## 4. Implementation Boundaries
- **In Scope:** `src/github/connector.ts` (with `GITHUB_TOKENS` round-robin rotation + bounded public `website_url` fetcher), `src/github/cache.ts`, `src/github/sanitize.ts`, `tests/github-connector.test.ts`, and `POST /api/admin/prewarm`.
- **Out of Scope:** Gemini Flash deep capability synthesis (`A-004`) or opportunity inference (`A-005`).

## 5. Acceptance Criteria
- [ ] Supports comma-separated `GITHUB_TOKENS` (or single `GITHUB_TOKEN`) with automatic token rotation on `X-RateLimit-Remaining < 50` or `403/429`.
- [ ] Retrieves public profile, up to 10 non-fork public repositories, languages, topics, and truncated `README.md` (`<= 3,500 chars`), emitting `github.fetch.started` and `github.fetch.completed` with repo count and duration (`ms`).
- [ ] **Optional Public Website / Portfolio Fetcher (`website_url`):** When `participant.website_url` is present, fetches it in parallel with the GitHub API call (`3.0s` timeout, `max 100 KB` body, SSRF block on private/loopback IPs, strips `<script>`/`<style>`/HTML tags to extract `<title>`, `<meta name="description">`, headings, and body text `<= 3,500 chars`). If the site requires a login (`401/403` or login redirect) or times out, gracefully skips the website without failing the GitHub crawl.
- [ ] Computes a deterministic baseline **6-Axis Builder Fingerprint** (`0–100` across `Systems/Infra`, `Agent Orchestration`, `LLM/Eval`, `Frontend/UX`, `Product/GTM`, `Data/Pipelines`) from repo languages/topics + website keywords in `< 50ms` so Stage 1 progressive UX renders immediately.
- [ ] Serves repeat or pre-warmed handles from the 24-hour `github_snapshots` SQLite cache in `< 10ms` (`0` external API calls).
- [ ] `POST /api/admin/prewarm` accepts `{ handles: ["user1", "user2", ...], websites?: { "user1": "https://jasonvaughan.com" } }` and caches their snapshots in the background before demo time.

## 6. Test Requirements
- Unit tests covering Multi-PAT token rotation, GraphQL/REST response normalization, optional `website_url` HTML-to-text extraction, graceful fallback when a website is unreachable or login-gated, SSRF private-IP rejection, 24-hour SQLite cache hits, 6-axis Builder Fingerprint calculation, `POST /api/admin/prewarm`, and HTML/prompt-injection sanitization.

## 7. Security & Privacy Considerations
- Query **only** public endpoints; filter out any private repository references.
- Sanitize all external GitHub text before storing or passing downstream.

## 8. Expected Demonstration Impact
Powers **Column 1 (`GitHub Crawl`)** and **Column 3 (`Builder Fingerprint`)** on the 16:9 Stage Visualizer with sub-second cached speed and bulletproof rate-limit headroom.

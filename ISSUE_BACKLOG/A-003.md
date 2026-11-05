# [feature] A-003: GitHub public-data connector

- **Issue ID:** `A-003`
- **Priority:** `P0`
- **Assigned Lane:** `Ariadne-Lane-B` (Builder B)
- **Milestone:** `Wave 1 — Minimum Success (v0.1.0-m1)`
- **Dependencies:** `A-001`

## 1. Description
Implement the bounded GitHub public-data connector (`src/lib/github/*`) that retrieves a consenting participant's public profile metadata, top/recent non-fork repositories, truncated `README.md` excerpts, language distributions, and recent public issues/PRs, normalizing them into verifiable `EvidenceReceipt` records with caching and rate-limit resilience.

## 2. Rationale
All capability claims and collaboration matches in Ariadne must be grounded in verifiable public GitHub evidence with direct URLs and timestamps, while staying well within GitHub API rate limits and a 10-second wall-clock latency budget.

## 3. Dependencies
- Depends on `A-001` (`EvidenceReceipt` contract, `github_snapshots` table, event contracts `github.fetch.started`, `github.fetch.completed`, `analysis.failed`).

## 4. Implementation Boundaries
- **In Scope:** `src/lib/github/client.ts`, `src/lib/github/normalizer.ts`, `src/lib/github/sanitizer.ts`, 30-minute snapshot caching in `github_snapshots`, and REST fallback if GraphQL is unavailable.
- **Out of Scope:** LLM capability extraction (`A-004`) or opportunity inference (`A-005`).

## 5. Acceptance Criteria
- [ ] Retrieves public profile, up to 10 non-fork public repositories, languages, topics, truncated `README.md` (`<= 3,500 chars`), and recent open issues/PRs in `< 10s`.
- [ ] Emits `github.fetch.started` and `github.fetch.completed` with exact repository and evidence receipt counts.
- [ ] Produces normalized `EvidenceReceipt[]` records with valid `https://github.com/...` URLs and `source_updated_at` timestamps.
- [ ] Handles unknown usernames (`404`), users with 0 public repos, and rate limits (`403/429`) gracefully without crashing the worker.

## 6. Test Requirements
- Unit tests covering GraphQL/REST response normalization, 30-minute cache hits, `404`/`429` graceful error state transitions, and HTML/prompt-injection sanitization on untrusted README/issue strings.

## 7. Security & Privacy Considerations
- Query **only** public endpoints; filter out any private repository references.
- Sanitize all external GitHub text (strip HTML tags, scripts, and markdown tracking images) before storing or passing downstream.

## 8. Expected Demonstration Impact
Powers the live evidence receipts shown on both the participant's mobile profile and the stage Activity/Spotlight views, proving Ariadne reads real engineering history rather than hallucinating skills.

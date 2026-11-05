# GitHub Intelligence Specification — ARIADNE (`ARIADNE-HACK-2026`)

## 1. Scope & Non-Negotiable Guardrails

1. **Strictly Public Data:** Ariadne queries only public GitHub profile metadata, public non-archived repositories, public README excerpts, language breakdowns, and public issues/PRs.
2. **Zero Private Repo Access:** Even when a participant uses GitHub OAuth to verify account ownership, Ariadne requests **zero scopes** (`scope=""` or `read:user` only)—never `repo` or `private` scopes.
3. **Bounded Retrieval (No Recursive Crawling):** Every participant analysis has a strict wall-clock budget (`<= 10 seconds` for GitHub I/O) and call budget (`1 GraphQL query` or `<= 6 REST calls`).
4. **Untrusted Content Handling:** All repository descriptions, README markdown, issue titles, and PR bodies are treated as untrusted external input—stripped of HTML/script tags, truncated to strict byte limits, and wrapped in XML/delimiter guards before LLM consumption to prevent prompt injection.

---

## 2. Retrieval Strategy & Query Budget (`A-003`)

### 2.1 Primary Path: Single GitHub GraphQL Query (`POST https://api.github.com/graphql`)
Using a single server-side authenticated GraphQL request retrieves the complete public snapshot in **1 rate-limit point** (`~350–700ms`):
- `user(login: $username)`:
  - `databaseId`, `login`, `name`, `bio`, `company`, `location`, `websiteUrl`, `avatarUrl`, `createdAt`, `updatedAt`
  - `pinnedItems(first: 6, types: REPOSITORY)` + `repositories(first: 10, ownerAffiliations: OWNER, isFork: false, privacy: PUBLIC, orderBy: {field: PUSHED_AT, direction: DESC})`:
    - `nameWithOwner`, `url`, `description`, `stargazerCount`, `forkCount`, `pushedAt`, `updatedAt`, `isArchived`
    - `primaryLanguage { name }`, `languages(first: 5) { edges { size node { name } } }`
    - `repositoryTopics(first: 8) { nodes { topic { name } } }`
    - `object(expression: "HEAD:README.md") { ... on Blob { text } }` (truncated immediately in memory to first `3,500 chars`)
    - `issues(first: 5, states: OPEN, orderBy: {field: UPDATED_AT, direction: DESC})`: `number`, `title`, `url`, `updatedAt`, `bodyText` (truncated to `600 chars`), `labels(first: 5)`
  - `pullRequests(first: 8, states: [OPEN, MERGED], orderBy: {field: UPDATED_AT, direction: DESC})`:
    - `title`, `url`, `updatedAt`, `repository { nameWithOwner isPrivate }` (filtered to `isPrivate == false`)

### 2.2 Fallback Path: Bounded REST API
If GraphQL is unavailable or unauthenticated fallback is triggered:
1. `GET /users/:username`
2. `GET /users/:username/repos?type=owner&sort=pushed&per_page=8`
3. Parallel `GET /repos/:owner/:repo/readme` + `GET /repos/:owner/:repo/issues?state=open&per_page=5` for the top 3 active non-fork repositories.

---

## 3. Rate-Limit & Caching Architecture

| Mechanism | Specification |
|---|---|
| **Server Token Pool** | Server-side `GITHUB_TOKEN` (`5,000 points/hr` GraphQL / `5,000 req/hr` REST). At 1 GraphQL point + 1 optional OAuth check per user, 1 token supports `> 2,500` participants/hour. |
| **Snapshot Cache (`github_snapshots`)** | Keyed by lowercase `github_username`. TTL = `30 minutes`. Repeated submissions or page refreshes serve cached snapshot (`0` GitHub API calls). |
| **Conditional Requests** | Store `ETag` / `Last-Modified` on REST calls; `304 Not Modified` costs `0` rate-limit quota. |
| **Rate-Limit Header Telemetry** | Inspect `x-ratelimit-remaining` and `x-ratelimit-reset` on every response. Emit operational warning to Observer if `remaining < 500`. |
| **Graceful Degradation Mode** | If GitHub returns `403/429` or times out after `10s`, fall back to lightweight profile + top-repo metadata stub, mark `confidence_limitations = "Partial GitHub snapshot due to API rate limit"`, and never crash the onboarding flow. |

---

## 4. Evidence Extraction & Epistemic Labeling (`A-004`, `A-005`)

Every retrieved item is normalized into an `EvidenceReceipt` before the Profile Research Agent or Opportunity Discovery Agent runs:
1. **Closed-World Citation Rule:** The LLM prompt receives an indexed array of `EvidenceReceipt` objects (`[EV-1]`, `[EV-2]`, ...). Any capability or opportunity emitted by the agent **must** cite valid receipt IDs from that exact list.
2. **Post-Generation Verification Gate:** The Verification Layer rejects any agent claim whose `evidence_receipt_ids` array is empty or references a non-existent receipt ID.
3. **Stale Signal Tagging:** Any open issue or repository with `pushedAt / updatedAt > 120 days` ago is automatically tagged `stale_signal: true` so the Opportunity Discovery Agent and Match Scorer label it strictly as an exploratory historical signal rather than an active blocker.

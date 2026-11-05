# [feature] A-016: In-process async job worker & continuous rematching

- **Issue ID:** `A-016`
- **Priority:** `P1`
- **Assigned Lane & Car:** `Ariadne-Lane-C` (`Car 2-C`)
- **Milestone / Train:** `Train 2 — End-to-End Integration & Mutual Intros (v0.3.0)`
- **Dependencies:** `A-006`, `A-007`

## 1. Description
Implement the SQLite-backed in-process asynchronous job runner (`src/lib/jobs/runner.ts`) that orchestrates the end-to-end pipeline (`github.fetch` → `profile-research` → `opportunity-discovery` → `match-scoring` → `proposal-writer` → `SSE event emission`) and implements continuous rematching (`src/lib/scoring/rematcher.ts`) so existing participants automatically receive updated top-3 matches as new attendees join.

## 2. Rationale
Early event arrivers initially see a small pool. Continuous rematching inside the SQLite async worker ensures early participants automatically get high-value matches as additional attendees scan the QR code, without blocking HTTP onboarding requests.

## 3. Dependencies
- Depends on `A-003`..`A-007` and `A-009`.

## 4. Implementation Boundaries
- **In Scope:** `src/lib/jobs/runner.ts`, `src/lib/scoring/rematcher.ts`, `src/app/api/worker/tick/route.ts`, preservation of acted-upon (`proposed`/`accepted`/`declined`) matches, and `changelog.d/A-016.md`.
- **Out of Scope:** Modifying frozen `src/contracts/*`.

## 5. Acceptance Criteria
- [ ] Enqueued participant onboarding jobs execute asynchronously in the background worker (`< 15ms` HTTP response on `POST /api/participants`) and recover stalled leases automatically on server restart.
- [ ] When Participant $N$ reaches `ready`, `rematcher` evaluates Participant $N$ against all active `ready` participants deterministically.
- [ ] Triggers `A-007` explanation generation **only** when Participant $N$ enters an existing participant's top-3 slate (`score >= 45`).
- [ ] Never overwrites or resets a match where either participant has already clicked `Interested` or `Pass`.

## 6. Test Requirements
- Unit/integration tests verifying: (1) async job queue execution & lease recovery, (2) early participant with 0 matches receives a match when a compatible 2nd participant joins, and (3) acted-upon matches remain untouched.

## 7. Security & Privacy Considerations
- Immediately exclude any participant with `consent_status === 'withdrawn'` from worker and rematching passes.

## 8. Expected Demonstration Impact
Connects all 4 lanes into a seamless, self-driving pipeline that continuously discovers new collaborations as the hackathon room fills up.

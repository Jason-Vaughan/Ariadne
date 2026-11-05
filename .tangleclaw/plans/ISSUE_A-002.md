# [feature] A-002: Public onboarding and QR intake

- **Issue ID:** `A-002`
- **Priority:** `P0`
- **Assigned Lane:** `Ariadne-Lane-A` (Builder A)
- **Milestone:** `Wave 1 — Minimum Success (v0.1.0-m1)`
- **Dependencies:** `A-001`

## 1. Description
Build the mobile-first QR landing and onboarding flow (`/join`), GitHub username/URL input and optional 1-click GitHub OAuth sign-in, explicit data-processing consent and optional public stage-display consent controls, provisional profile page (`/me`), and immediate emission of `participant.registered`.

## 2. Rationale
The onboarding page is the front door for every hackathon attendee scanning the stage QR code. It must complete in under 10 seconds on mobile cellular/venue Wi-Fi without requiring a lengthy questionnaire or interview.

## 3. Dependencies
- Depends on `A-001` (`Participant` contract, database schema, and `participant.registered` event contract).

## 4. Implementation Boundaries
- **In Scope:** `src/app/page.tsx`, `src/app/join/page.tsx`, `src/app/me/page.tsx` (provisional shell + progressive status indicators), `src/app/api/participants/route.ts`, `src/app/api/participants/me/route.ts` (including `DELETE` withdrawal endpoint), and `src/app/api/auth/github/*`.
- **Out of Scope:** Deep GitHub API repository fetching (`A-003`), LLM profile synthesis (`A-004`), or match scoring (`A-006`).

## 5. Acceptance Criteria
- [ ] Scanning the QR code opens a mobile-responsive onboarding view that accepts either a GitHub handle (`octocat`) or profile URL (`https://github.com/octocat`).
- [ ] Submission is blocked unless the explicit GitHub analysis consent checkbox is checked.
- [ ] Submitting creates a persistent `Participant` record with a deterministic pseudonym (`Thread-XXXX`), sets a signed `HttpOnly` session cookie, emits `participant.registered`, and redirects to `/me` in `< 2.0s`.
- [ ] Participant can withdraw and delete their profile at any time via a clear *"Withdraw & Delete My Data"* action (`DELETE /api/participants/me`).

## 6. Test Requirements
- Unit/API tests verifying username/URL normalization, rejection of unconsented submissions (`400`), rate-limit enforcement, session cookie creation, and complete data purge upon `DELETE /api/participants/me`.

## 7. Security & Privacy Considerations
- Enforce IP rate limiting on `POST /api/participants` (`5 req / 10 min`).
- Ensure the optional *"Display my GitHub identity on the stage visualizer"* checkbox defaults to `false` (pseudonymous by default).
- Request zero private repository scopes if GitHub OAuth is used (`read:user` only).

## 8. Expected Demonstration Impact
Enables live audience participation during the hackathon: any attendee or judge can scan the QR code on their phone and watch their `Thread-XXXX` node appear on the 16:9 stage screen within 2 seconds.

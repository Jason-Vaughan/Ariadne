# [feature] A-002: Public QR onboarding — Zero-OAuth 1-tap GitHub handle entry

- **Issue ID:** `A-002`
- **Priority:** `P0`
- **Assigned Lane & Car:** `Ariadne-Lane-A` (`Car 1-A`)
- **Milestone / Train:** `Train 1 — Core Pipeline & Stage Shell (v0.2.0)`
- **Dependencies:** `A-001`

## 1. Description
Build the mobile-first QR landing and onboarding flow (`/join`) with a prominent **`⚡ REQUIRES GITHUB PROFILE`** badge, **Zero-OAuth 1-Tap GitHub `@username` / URL entry** (so attendees join in `< 1s` on venue Wi-Fi without an OAuth login/2FA wall), optional 1-line *"What I'm building or looking for today"* note, optional 1-click GitHub OAuth for a `"Verified"` badge, explicit data-processing & stage-display consent controls, provisional profile page (`/me`), and immediate emission of `participant.registered`.

## 2. Rationale
On congested hackathon venue Wi-Fi, requiring a full GitHub OAuth redirect + 2FA on mobile causes ~50% drop-off during a 3-minute stage pitch. By requiring a public GitHub `@username` directly (`Zero-OAuth`), any attendee with a GitHub profile joins in `< 1 second` and immediately triggers the live GitHub crawl and 6-axis Builder Fingerprint pipeline on the 16:9 Stage Visualizer.

## 3. Dependencies
- Depends on `A-001` (`Participant` contract, SQLite schema, and `participant.registered` event contract).

## 4. Implementation Boundaries
- **In Scope:** `src/app/page.tsx`, `src/app/join/page.tsx`, `src/app/me/page.tsx` (provisional shell + progressive status indicators), `src/app/api/participants/route.ts`, `src/app/api/participants/me/route.ts` (including `DELETE` withdrawal endpoint), and optional `src/app/api/auth/github/*`.
- **Out of Scope:** Deep GitHub API repository fetching (`A-003`), LLM profile synthesis (`A-004`), or match scoring (`A-006`).

## 5. Acceptance Criteria
- [ ] Displays a clear, high-contrast **`⚡ REQUIRES GITHUB PROFILE`** banner at the top of `/join`.
- [ ] Accepts any valid GitHub handle (`octocat`, `@octocat`) or profile URL (`https://github.com/octocat`) with zero OAuth login wall required, plus an optional 1-line collaboration goal (`<= 160 chars`).
- [ ] Submission is blocked unless the explicit GitHub public-analysis consent checkbox is checked.
- [ ] Submitting creates a persistent `Participant` record with a deterministic pseudonym (`Thread-XXXX`), sets a signed `HttpOnly` session cookie, emits `participant.registered`, and redirects to `/me` in `< 1.0s`.
- [ ] **Hard Room Capacity Admission Gate (`maxRoomCapacity`, default `30`):** When active non-seed participants reach `maxRoomCapacity` (or when the Operator locks intake via `/stage` or `/admin`), `/join` and `POST /api/participants` display a friendly mobile notice: **`"🚧 System is currently at capacity (30/30) — please try back later!"`** with a **`[🔄 Try Again]`** button (while existing sessions and pre-warmed VIP/Judge handles continue through unimpeded).
- [ ] Participant can withdraw and delete their profile at any time via a clear *"Withdraw & Delete My Data"* action (`DELETE /api/participants/me`), which immediately frees a capacity slot.

## 6. Test Requirements
- Unit/API tests verifying username/URL normalization, rejection of empty/invalid handles or unconsented submissions (`400`), session cookie creation, and complete data purge upon `DELETE /api/participants/me`.

## 7. Security & Privacy Considerations
- Enforce IP/cookie rate limiting on `POST /api/participants`.
- Ensure the optional *"Display my @github handle on the 16:9 stage visualizer"* checkbox is clearly labeled.
- Request zero private repository scopes if optional GitHub OAuth is used (`read:user` only).

## 8. Expected Demonstration Impact
Enables frictionless live audience participation during the hackathon: attendees scan the QR code, type their GitHub `@username` in one tap, and watch their card enter **Stage 1: GitHub Crawl** on the 16:9 big screen within 1 second.

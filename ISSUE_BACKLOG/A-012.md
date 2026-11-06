# [feature] A-012: Zero-blocker mutual-introduction workflow, Private Web Intro Room, Venue Locator & Golden Arc trigger

- **Issue ID:** `A-012`
- **Priority:** `P0`
- **Assigned Lane & Car:** `Ariadne-Lane-A` (`Car 2-A`)
- **Milestone / Train:** `Train 2 — End-to-End Integration & Mutual Intros (v0.3.0)`
- **Dependencies:** `A-008`

## 1. Description
Implement the frictionless bilateral mutual-introduction state machine (`POST /api/matches/:id/decision`) with **zero OAuth login blocker** (authenticated directly by the participant's `/join` session cookie), live incoming-interest banner on `/me`, and the unlocked **Private Web Introduction Room** (`/me/matches/:id`) when both participants tap `Interested`—complete with **Mutual Contact Reveal**, **AI "First 3 Minutes" Collaboration Icebreaker**, **Physical Venue Locator (`"Where are you in the room?"`)**, **Live 2-Person Web Chat**, **1-Tap `Save Contact (vCard .vcf)` & `Copy Intro` buttons**, and immediate emission of `introduction.completed` to light up a **Glowing Golden Arc** on the 16:9 Stage Visualizer.

## 2. Rationale
When two attendees at a live hackathon both tap `Interested` on their phones, the payoff must be instantaneous (`< 500ms`), practical for meeting face-to-face in a crowded venue, and visually celebrated on the big screen (`Golden Arc`).

## 3. Dependencies
- Depends on `A-008` (Mobile Match Cards UI and isolated participant session).

## 4. Implementation Boundaries
- **In Scope:** `src/lib/intros/state-machine.ts`, `src/app/api/matches/[id]/decision/route.ts`, `src/app/api/matches/[id]/room/route.ts` (`GET` room state + `POST` live 2-person chat message / venue location update), `src/app/me/matches/[id]/page.tsx`, 1-tap `.vcf` vCard download & clipboard/SMS copy helpers, and emission of `introduction.proposed`, `introduction.accepted`, `introduction.declined`, and `introduction.completed`.
- **Out of Scope:** External Discord/Medusa bot integrations (deferred to post-hackathon roadmap).

## 5. Acceptance Criteria
- [ ] **1-Tap Zero-Blocker Decision:** Tapping `Interested` on `/me` works immediately in 1 tap using the participant's `/join` session cookie (`zero` OAuth redirect wall).
- [ ] **Deterministic State Machine:** Transitions `candidate` → `proposed_by_a/b` → `completed` (when both tap `Interested`) or `declined` (when either taps `Pass`), with strict idempotency on repeated taps.
- [ ] **Incoming Interest Banner:** When Participant A taps `Interested`, Participant B sees a prominent live banner on `/me`: **`"⚡ @userA wants to connect with you! Tap Interested to unlock your Intro Room"`**.
- [ ] **Private Web Introduction Room (`/me/matches/:id`):** Once `completed`, both participants unlock:
  1. **Mutual Contact Reveal:** Verified GitHub profile links + any shared contact handles (X/LinkedIn/Email/Phone).
  2. **AI "First 3 Minutes" Icebreaker:** Concrete starter question + collaboration thesis citing their exact repositories.
  3. **Physical Venue Locator & Live 2-Person Chat:** Quick-tap location pills (`"Near Stage"`, `"Coffee Area"`, `"Back Tables"`, or custom text) + live SSE/polled 2-person message thread so they can find each other in the room in `< 60 seconds`.
  4. **1-Tap Export Buttons:** **`[📇 Save Contact (vCard)]`** and **`[📋 Copy Intro / Share via SMS]`**.
- [ ] **Stage Golden Arc Trigger:** Emits `introduction.completed`, turning their edge into a **Glowing Golden Arc** and firing the 5-second celebration banner on `/stage`.

## 6. Test Requirements
- State-machine and API tests verifying: (a) unilateral interest never leaks counterpart contact info or unlocks `/me/matches/:id`, (b) bilateral interest unlocks `/me/matches/:id` and emits `introduction.completed` exactly once, (c) venue locator & 2-person chat messages persist and stream to both peers, and (d) vCard `.vcf` payload formats cleanly.

## 7. Security & Privacy Considerations
- Enforce strict row-level authorization: only `participant_a` or `participant_b` of that specific match can access `/me/matches/:id` or post chat/location updates.

## 8. Expected Demonstration Impact
Delivers the signature "Aha!" payoff of the demo: two people tap `Interested` on their phones, their thread turns into a **Glowing Golden Arc** on the 16:9 stage screen, and their phones open a live Intro Room with a Venue Locator (`"I'm by the front left table!"`), AI icebreaker, and 1-tap vCard download.

# [feature] A-012: Web-native mutual-introduction workflow & private intro room

- **Issue ID:** `A-012`
- **Priority:** `P0`
- **Assigned Lane & Car:** `Ariadne-Lane-A` (`Car 2-A`)
- **Milestone / Train:** `Train 2 — End-to-End Integration & Mutual Intros (v0.3.0)`
- **Dependencies:** `A-008`

## 1. Description
Implement the web-only bilateral mutual-introduction state machine (`POST /api/matches/:id/decision`), GitHub ownership verification gate (`ownership_verified === true` via 1-click GitHub OAuth or bio challenge), private incoming-interest notification banner on `/me`, and the unlocked **Private Web Introduction Room** (`/me/matches/:id`) when both participants click `Interested`.

## 2. Rationale
Per the Web-Only Hackathon MVP Amendment, all participant introductions happen directly inside the Ariadne mobile web interface without requiring Discord or external bots. No contact information may be disclosed and no introduction may fire without verified bilateral approval.

## 3. Dependencies
- Depends on `A-008` (Match Cards UI and isolated participant session).

## 4. Implementation Boundaries
- **In Scope:** `src/lib/intros/state-machine.ts`, `src/app/api/matches/[id]/decision/route.ts`, `src/app/api/matches/[id]/room/route.ts`, `src/app/me/matches/[id]/page.tsx`, ownership verification prompt modal, and emission of `introduction.proposed`, `introduction.accepted`, `introduction.declined`, and `introduction.completed` (`channel: 'web'`).
- **Out of Scope:** External Discord/Medusa bot integrations (deferred to post-hackathon roadmap).

## 5. Acceptance Criteria
- [ ] Clicking `Interested` requires `ownership_verified === true` (prompts 1-click GitHub OAuth or GitHub bio challenge token check if not yet verified).
- [ ] Transitions match state deterministically (`candidate` → `proposed_by_a/b` → `mutual_accepted` → `completed`, or `declined`).
- [ ] Repeated clicks or retries are strictly idempotent and never produce duplicate events or duplicate introductions.
- [ ] Once `completed`, both participants unlock the **Private Web Introduction Room** (`/me/matches/:id`) displaying verified GitHub links, optional `contact_card` notes, cited repositories, copyable starter prompt, and a shared icebreaker message box.

## 6. Test Requirements
- State-machine and API concurrency/idempotency tests verifying: (a) unverified users cannot trigger outbound proposals (`403`), (b) unilateral interest does not reveal counterpart contact info, (c) bilateral interest unlocks `/me/matches/:id` and emits `introduction.completed` exactly once, and (d) `Pass` transitions to `declined` without leaking rejection alerts.

## 7. Security & Privacy Considerations
- Enforce strict row-level authorization: only `participant_a` or `participant_b` of that specific match can call `POST /api/matches/:id/decision` or access `/me/matches/:id`.

## 8. Expected Demonstration Impact
Delivers **Exceptional Success (`M3`)** entirely in the mobile browser: two consenting attendees tap `Interested` on their phones, unlock their private Web Introduction Room, and trigger a glowing emerald connection on the 16:9 stage visualizer.

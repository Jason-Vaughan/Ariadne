# [feature] A-008: Participant results interface

- **Issue ID:** `A-008`
- **Priority:** `P0`
- **Assigned Lane:** `Ariadne-Lane-A` (Builder A)
- **Milestone:** `Wave 2 — Strong Success (v0.2.0-m2)`
- **Dependencies:** `A-002`, `A-006`, `A-007`

## 1. Description
Build the private participant dashboard (`/me`) and match results view showing the participant's analyzed capability/opportunity profile alongside up to 3 evidence-backed Match Cards, complete with 4-factor score bars, clickable GitHub evidence links, confidence caveats, and `Interested` / `Pass` action controls.

## 2. Rationale
After scanning the QR code and consenting on `/join`, `/me` is the participant's personal command center on their phone throughout the event.

## 3. Dependencies
- Depends on `A-002` (session & provisional `/me` shell), `A-006` (scoring breakdown), and `A-007` (match explanations).

## 4. Implementation Boundaries
- **In Scope:** `src/app/me/page.tsx`, `src/components/MatchCard.tsx`, `src/components/CapabilityBadgeList.tsx`, `src/app/api/matches/route.ts`, and empty/pending/error state views.
- **Out of Scope:** Bilateral introduction delivery (`A-012`) and Discord bot notifications (`A-013`).

## 5. Acceptance Criteria
- [ ] Displays 0 to 3 top matches ordered by `composite_score` (`>= 45`).
- [ ] Each Match Card renders: overall score, 4-dimension breakdown bar, complementary skills, relevant repos with clickable GitHub links, confidence limitation note, and suggested first collaboration.
- [ ] Renders clear, honest UI states for `fetching_github`, `analyzing_profile`, `0 matches yet (waiting for compatible builders)`, and `failed (retry available)`.
- [ ] Allows the participant to dismiss any inaccurate AI-inferred capability or opportunity on their own profile and trigger a match refresh.

## 6. Test Requirements
- Component and API tests covering 3-match rendering, 1-match partial rendering, 0-match honest empty state, unauthenticated redirect to `/join`, and inference dismissal.

## 7. Security & Privacy Considerations
- `GET /api/matches` returns matches **only** for the authenticated session's `participant_id`.
- Counterpart private contact details remain hidden until `intro_state === 'completed'`.

## 8. Expected Demonstration Impact
Gives every hackathon participant and judge a polished, mobile-friendly view on their own phone showing their top 3 collaborators with clickable GitHub proof.

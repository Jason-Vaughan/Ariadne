# [feature] A-008: Mobile participant Builder Fingerprint & progressive Top-3 Match Cards UI

- **Issue ID:** `A-008`
- **Priority:** `P0`
- **Assigned Lane & Car:** `Ariadne-Lane-A` (`Car 1-A` Shell & `Car 2-A` Live Wiring)
- **Milestone / Train:** `Train 1 (v0.2.0) & Train 2 (v0.3.0)`
- **Dependencies:** `A-002`, `A-006`, `A-007`

## 1. Description
Build the private mobile participant dashboard (`/me`) showing:
1. Their own **6-Axis Builder Fingerprint Card** (`Systems/Infra`, `Agent Orchestration`, `LLM/Eval`, `Frontend/UX`, `Product/GTM`, `Data/Pipelines`) + Superpower (`Offers`) & Looking-For (`Needs`) pills,
2. Their **Top-3 Complementary Match Cards** (`score >= 45`), rendered in **`< 500ms`** (Stage 1 deterministic match + repo evidence pills) and progressively upgraded live via SSE/poll when Stage 2 Gemini Flash enrichment (`match.enriched`) arrives,
3. One-tap **`Interested`** and **`Pass`** buttons plus live incoming-interest alerts.

## 2. Rationale
After typing their GitHub handle on `/join`, `/me` is the participant's personal mobile command center. Seeing their own 6-Axis Builder Fingerprint and Top-3 matches in under a second—and watching the Gemini Flash deep collaboration pitch stream in live—makes the mobile experience feel magical.

## 3. Dependencies
- Depends on `A-002` (session & `/join`), `A-006` (scoring breakdown), and `A-007` (Two-Stage match proposals).

## 4. Implementation Boundaries
- **In Scope:** `src/app/me/page.tsx`, `src/components/BuilderFingerprintCard.tsx`, `src/components/MatchCard.tsx`, `src/components/CapabilityBadgeList.tsx`, `src/app/api/matches/route.ts`, and progressive SSE/poll updates for Stage 1 → Stage 2 enrichment.
- **Out of Scope:** Private Web Introduction Room (`/me/matches/:id`, `A-012`).

## 5. Acceptance Criteria
- [ ] Renders the participant's **6-Axis Builder Fingerprint** and verified GitHub capability/opportunity pills at the top of `/me`.
- [ ] Displays up to **3 Top Matches** ordered by `composite_score` (`>= 45`), rendering Stage 1 deterministic cards + clickable GitHub repo evidence pills in `< 500ms` and smoothly updating in place when `match.enriched` arrives.
- [ ] Each Match Card renders: overall score, 4-dimension breakdown bar (`40/30/20/10`), complementary skills, cited repos with clickable GitHub links, suggested first conversation, and 1-tap `Interested` / `Pass` buttons.
- [ ] Allows the participant to dismiss any inaccurate AI-inferred capability or opportunity on their own profile and trigger a match refresh.

## 6. Test Requirements
- Component and API tests covering Builder Fingerprint rendering, 3-match rendering, Stage 1 → Stage 2 progressive update, unauthenticated redirect to `/join`, and inference dismissal.

## 7. Security & Privacy Considerations
- `GET /api/matches` returns matches **only** for the authenticated session's `participant_id`.
- Counterpart private contact details remain hidden until both tap `Interested` (`A-012`).

## 8. Expected Demonstration Impact
Gives every hackathon attendee a fast, gorgeous mobile view of their own Builder DNA and their Top 3 complementary peers in the room.

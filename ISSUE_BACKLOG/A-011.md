# [feature] A-011: Activity and spotlight visualization

- **Issue ID:** `A-011`
- **Priority:** `P1`
- **Assigned Lane:** `Ariadne-Lane-D` (Builder D)
- **Milestone:** `Wave 2 — Strong Success (v0.2.0-m2)`
- **Dependencies:** `A-007`, `A-009`, `A-010`

## 1. Description
Extend the `/stage` visualizer with **Mode 2: Activity Mode** (structured real-time matrix of Profile Research, Opportunity Discovery, and Match Evaluation agent operations) and **Mode 3: Spotlight Mode** (stage-wide deep dive into a selected match pair showing their 4-factor score bars, complementary skills, cited repository count, suggested first collaboration, and introduction status), plus hands-free `Auto-Cycle` mode (`Space`).

## 2. Rationale
While Network Mode shows the macro graph, judges and attendees also need to see the *depth* of Ariadne's evidence-backed reasoning on the big screen without peering at a small phone display.

## 3. Dependencies
- Depends on `A-007` (evaluated match payload), `A-009` (SSE event stream), and `A-010` (`/stage` layout shell).

## 4. Implementation Boundaries
- **In Scope:** `src/components/stage/ActivityMatrix.tsx`, `src/components/stage/SpotlightView.tsx`, `GET /api/stage/spotlight` (sanitized top matches for stage cycling), and operator keyboard controls (`2`, `3`, `N`, `P`, `Space`).
- **Out of Scope:** Participant mobile views (`A-008`) or Discord bot interactions (`A-013`).

## 5. Acceptance Criteria
- [ ] **Activity Mode (`2`)** displays verifiable agent task completions (`github.fetch.completed`, `profile.analysis.completed`, `opportunity.identified`, `match.evaluated`) with execution timing and evidence counts—never simulated reasoning.
- [ ] **Spotlight Mode (`3`)** renders a selected match pair side-by-side with their 4-dimension score breakdown bars, sanitized collaboration explanation, suggested first conversation, and live introduction status badge.
- [ ] Stage operator can cycle through real matches using `N` / `P` or enable hands-free mode rotation via `Space`.

## 6. Test Requirements
- Unit and component tests verifying Spotlight sanitization (pseudonymous unless consented), keyboard navigation (`1`/`2`/`3`/`N`/`P`/`Space`), and graceful rendering when 0 matches exist yet.

## 7. Security & Privacy Considerations
- `GET /api/stage/spotlight` strips all unconsented identities and private contact details before returning data to the stage client.

## 8. Expected Demonstration Impact
Gives the Operator a high-impact judging presentation tool: press `3` on the stage laptop to spotlight a real match made at the event and walk the judges through the exact evidence and scoring breakdown.

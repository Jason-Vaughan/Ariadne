# [feature] A-010: Public network visualizer

- **Issue ID:** `A-010`
- **Priority:** `P0`
- **Assigned Lane:** `Ariadne-Lane-D` (Builder D)
- **Milestone:** `Wave 1 — Minimum Success (v0.1.0-m1)`
- **Dependencies:** `A-009`

## 1. Description
Build the 16:9 auditorium stage shell (`/stage`), persistent 6-metric top KPI ribbon, scannable QR onboarding card, and **Mode 1: Network Mode** interactive force-directed graph showing participant nodes, progressive analysis states, and match connection edges driven live by `A-009`.

## 2. Rationale
The stage visualizer is Ariadne's shared physical presence in the hackathon venue—inviting attendees to scan the QR code and watching the community graph form in real time.

## 3. Dependencies
- Depends on `A-009` (`GET /api/events/stream` and `GET /api/events/summary`).

## 4. Implementation Boundaries
- **In Scope:** `src/app/stage/page.tsx`, `src/components/stage/KpiRibbon.tsx`, `src/components/stage/NetworkGraph.tsx`, `src/components/stage/QrJoinBanner.tsx`, and keyboard shortcut controller (`1/2/3/Space/S`).
- **Out of Scope:** Detailed Activity Mode matrix and Spotlight Mode deep-dive card (`A-011`).

## 5. Acceptance Criteria
- [ ] Renders cleanly at `1920x1080` (`16:9`) with high-contrast typography legible from 30 feet away.
- [ ] Displays the 6 required stage KPIs: Participants Joined, Profiles Analyzed, Opportunities Evaluated, Proposals Generated, Mutual Introductions Approved, and Active Agent Operations.
- [ ] Spawns a new node within `< 1.5s` of `participant.registered` and transitions node styling through `fetching_github` → `analyzing_profile` → `ready`.
- [ ] Draws distinct edge styles for `candidate` (dashed), `proposed` (pulsing directional amber), and `completed` (glowing emerald thread).
- [ ] Enforces pseudonymous labels (`Thread-XXXX`) by default; shows GitHub handle/avatar only when `public_display_consent === true` (and supports pressing `S` to force 100% pseudonymity).

## 6. Test Requirements
- Component and state-reducer tests verifying event replay into graph state, node removal on `participant.withdrawn`, and pseudonymity enforcement.

## 7. Security & Privacy Considerations
- Never render unconsented handles, private messages, or raw model chains-of-thought on `/stage`.

## 8. Expected Demonstration Impact
Completes the visual centerpiece of **Minimum Success (`M1`)**: a living, breathing network graph on the big screen that reacts immediately when anyone scans the QR code.

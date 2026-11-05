# [feature] A-009: SQLite append-only live event stream (SSE + polling fallback)

- **Issue ID:** `A-009`
- **Priority:** `P0`
- **Assigned Lane & Car:** `Ariadne-Lane-D` (`Car 1-D`)
- **Milestone / Train:** `Train 1 — Core Engine & Stage Graph (v0.2.0)`
- **Dependencies:** `A-001`

## 1. Description
Implement the SQLite-backed append-only structured event publisher (`src/lib/events/publisher.ts`), Server-Sent Events (SSE) streaming endpoint (`GET /api/events/stream?after=<seq_id>`), and automatic JSON polling fallback endpoint (`GET /api/events/poll?after=<seq_id>`) plus aggregate KPI summary endpoint (`GET /api/events/summary`).

## 2. Rationale
Both the mobile participant progress view (`/me`) and the 16:9 Presentation Visualizer (`/stage`) need real-time, verifiable updates that survive venue proxy buffering or brief Wi-Fi drops via automatic reconnect (`Last-Event-ID`) and HTTP polling fallback.

## 3. Dependencies
- Depends on `A-001` (`PublicEventEnvelope`, `EventType` catalog, and SQLite `domain_events` table).

## 4. Implementation Boundaries
- **In Scope:** `src/lib/events/publisher.ts`, `src/lib/events/sanitizer.ts`, `src/app/api/events/stream/route.ts`, `src/app/api/events/poll/route.ts`, `src/app/api/events/summary/route.ts`, and `changelog.d/A-009-010-011.md`.
- **Out of Scope:** Modifying `src/contracts/*` or root `CHANGELOG.md`.

## 5. Acceptance Criteria
- [ ] `publishDomainEvent()` atomically inserts into SQLite `domain_events` (`seq_id INTEGER PRIMARY KEY AUTOINCREMENT`) after running the public-payload privacy sanitizer.
- [ ] `GET /api/events/stream` streams standard SSE frames and replays missed events when `Last-Event-ID` or `?after=<seq_id>` is supplied.
- [ ] `GET /api/events/poll?after=<seq_id>` returns `{ events: PublicEventEnvelope[], latest_seq_id: number }` so browser clients automatically fall back to polling if SSE chunking is buffered.
- [ ] Zero simulated or synthetic heartbeat events are disguised as agent activity.

## 6. Test Requirements
- Unit/integration tests verifying monotonic SQLite `seq_id` ordering, SSE `Last-Event-ID` replay, `/api/events/poll` catch-up parity, and strict stripping of unconsented `github_username`/`avatar_url` fields.

## 7. Security & Privacy Considerations
- Both `/api/events/stream` and `/api/events/poll` read **exclusively** from the pre-sanitized `public_payload` column.

## 8. Expected Demonstration Impact
Drives live sub-second updates on both the 16:9 auditorium screen and attendee mobile phones with automatic proxy resilience.

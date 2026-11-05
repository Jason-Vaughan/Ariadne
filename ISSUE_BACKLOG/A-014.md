# [chore] A-014: Self-hosted server (:3420), SQLite WAL, narrow HTTPS tunnel & resilience

- **Issue ID:** `A-014`
- **Priority:** `P0`
- **Assigned Lane & Car:** `Ariadne-INT` (`Car 0-INT` Slice 1 & `Car 3-INT` Slice 2)
- **Milestone / Train:** `Train 0 (v0.1.0) & Train 3 (v1.0.0)`
- **Dependencies:** `A-001`

## 1. Description
Configure and verify the self-hosted Ariadne web server bound to PortHub port `127.0.0.1:3420`, persistent SQLite WAL database (`data/ariadne.sqlite`) with pre-release atomic backups, narrowly scoped public HTTPS tunnel (`cloudflared` / `ngrok` targeting exclusively `127.0.0.1:3420`), health/readiness endpoint (`GET /api/health`), and strict control-plane isolation checks.

## 2. Rationale
Per the Web-Only Hackathon MVP Amendment, Ariadne runs directly on the TangleClaw host while remaining 100% isolated from TangleClaw's control plane (`:3102`, `:3100`, `:8443`) and internal Medusa services (`:3009`, `:3010`).

## 3. Dependencies
- Depends on `A-001` (core repository & SQLite schema initialization).

## 4. Implementation Boundaries
- **In Scope:** PortHub lease registration (`3420`, `3421`, `4420`), SQLite WAL configuration (`PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;`), `GET /api/health` readiness endpoint, pre-cutover SQLite backup script, narrow HTTPS tunnel startup/verification, and `< 15s` tag rollback procedure.
- **Out of Scope:** Touching `tailscale serve`/`funnel` on `:8443` or exposing any TangleClaw/Medusa port or credential.

## 5. Acceptance Criteria
- [ ] Local server binds strictly to `127.0.0.1:3420` (registered in PortHub) and serves both the mobile participant interface (`/join`, `/me`) and presentation visualizer (`/stage`, `/reports`).
- [ ] Narrow public HTTPS tunnel forwards traffic **only** to `http://127.0.0.1:3420`.
- [ ] `GET /api/health` reports SQLite WAL readiness, GitHub API rate-limit status, and worker queue depth without leaking secrets or stack traces.
- [ ] Pre-cutover SQLite backup (`sqlite3 .backup`) and SHA-256 verification execute cleanly at each Train cutover (`v0.1.0`, `v0.2.0`, `v0.3.0`, `v1.0.0`).

## 6. Test Requirements
- Integration and security boundary tests verifying `GET /api/health`, SQLite WAL persistence across restarts, and zero exposure of TangleClaw/Medusa environment variables or routes.

## 7. Security & Privacy Considerations
- Run Ariadne with a dedicated, minimal environment variable set (`ARIADNE_*` only). Never mount host filesystem directories outside the Ariadne repo.

## 8. Expected Demonstration Impact
Provides zero-cloud-setup local speed (`< 5ms` SQLite queries) combined with instant public mobile accessibility via the narrow HTTPS tunnel.

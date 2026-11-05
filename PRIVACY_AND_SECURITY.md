# Privacy, Identity & Security Specification — ARIADNE (`ARIADNE-HACK-2026`)
*Amended: Web-Only Self-Hosted Hackathon MVP (Control-Plane Isolation & SQLite Session Boundaries)*

## 1. Threat Model & Context

Ariadne runs at a live, public in-person hackathon in San Francisco as a self-hosted web application on the TangleClaw host (`cursatory`), exposed via a narrowly scoped public HTTPS tunnel (`127.0.0.1:3420`). Our security design enforces:
1. **Strict Control-Plane Isolation:** Zero public access to TangleClaw control-plane endpoints (`:3102`, `:3100`, `:8443`), agent terminals, internal Medusa services (`:3009`, `:3010`), or host infrastructure credentials.
2. **Third-Party Impersonation Prevention:** Preventing an attendee from entering someone else's GitHub username and approving introductions on their behalf.
3. **Bilateral Introduction Gate:** Never disclosing private contact details or unlocking a mutual introduction room unless **both** participants have verified ownership and clicked `Interested`.
4. **Public Stage Privacy by Default:** Displaying pseudonymous identities (`Thread-XXXX`) on the 16:9 auditorium screen unless a participant expressly opts into public stage disclosure.
5. **Untrusted GitHub Input Sanitization:** Preventing prompt injection or XSS via malicious repository `README.md` or issue content.

---

## 2. Two-Tier Progressive Identity & Session Isolation

### Tier A: Isolated Consenting Session (Provisional Profile & Match Preview)
- Participant enters their GitHub username and checks the mandatory consent box on `/join`.
- Server creates an isolated participant record in SQLite (`data/ariadne.sqlite`) and sets a cryptographically signed `HttpOnly`, `Secure`, `SameSite=Lax` cookie (`ariadne_session`) bound strictly to that `participant_id`.
- Allows immediate public GitHub analysis and candidate match preview (`ownership_verified = false`).

### Tier B: Authenticated Ownership Gate Before Introduction Approvals (`ownership_verified = true`)
Before a participant can send or accept an introduction (`POST /api/matches/:id/decision` with `interested`), they must prove ownership of their GitHub identity via either:
1. **Primary (1-Click): GitHub OAuth Sign-In (`read:user` / zero private repo scopes):**
   - Verifies the authenticated GitHub user's `id`/`login` matches the profile's `github_username` and sets `ownership_verified = true`.
2. **Zero-OAuth Fallback (Public GitHub Bio / Gist Challenge):**
   - Participant places a short one-time challenge token (`ARIADNE-XXXX`) in their public GitHub profile `bio` (or public gist) and taps *Verify Ownership*. Server verifies via public GitHub API and sets `ownership_verified = true`.

---

## 3. Consent, Privacy & Control-Plane Isolation Controls

| Control | Implementation Requirement |
|---|---|
| **Explicit Analysis Consent** | Mandatory unchecked-by-default checkbox on `/join`. Server rejects `POST /api/participants` with `400` if `consent !== true`. |
| **Stage Display Consent** | Separate optional checkbox (default `false`): *"Show my public GitHub username and avatar on the event stage visualizer (otherwise shown pseudonymously as Thread-XXXX)."* |
| **Bilateral Introduction Gate** | Contact notes (`contact_card`) and the shared **Mutual Introduction Room** (`/me/matches/:id`) remain locked at the SQLite query level until **both** `participant_a` and `participant_b` have recorded `decision = 'interested'` with `ownership_verified === true`. |
| **One-Click Withdrawal (`Right to Erasure`)** | Every authenticated participant screen includes a **"Withdraw & Delete My Data"** button (`DELETE /api/participants/me`). Immediately deletes capability claims, opportunities, pending matches, and session cookies from SQLite, marks the record `withdrawn`, and removes the node from `/stage`. |
| **Narrow Public Tunnel Isolation** | The public HTTPS tunnel (`cloudflared` / `ngrok`) forwards **solely** to `http://127.0.0.1:3420`. The Ariadne server runs with a minimal scoped `.env` containing zero TangleClaw service tokens, zero Medusa secrets, and zero filesystem routes outside the Ariadne application directory. |
| **Data Retention & Post-Event Cleanup** | All event SQLite data (`data/ariadne.sqlite` and backups) is retained for **7 days post-hackathon** so matched participants can retrieve their connections, then permanently purged on **November 14, 2026**. |

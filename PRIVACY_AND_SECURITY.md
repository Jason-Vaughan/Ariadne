# Privacy, Identity & Security Specification — ARIADNE (`ARIADNE-HACK-2026`)

## 1. Threat Model & Context

Ariadne runs at a live, public in-person hackathon in San Francisco. Unlike an internal dev tool, any attendee (or internet scanner) can hit the public onboarding URL. Our security design must prevent:
1. **Third-Party Impersonation:** Someone entering `@torvalds` or another attendee's GitHub username and triggering outbound introductions on their behalf.
2. **Unsolicited Messaging / Spam:** Sending Discord messages or revealing contact details without bilateral consent.
3. **Public Stage Privacy Leaks:** Displaying a participant's real name, handle, or private contact details on the 16:9 auditorium screen without their explicit opt-in.
4. **Prompt Injection via GitHub Content:** Malicious instructions embedded inside a public repository's `README.md` or issue body attempting to hijack the matching agent or exfiltrate secrets.
5. **Control Plane Exposure:** Exposing TangleClaw's internal API, Medusa shared secrets, or Operator Discord bot credentials to public web clients.

---

## 2. Smallest Feasible H-Day Identity & Authentication Architecture

To balance **zero-friction 5-second QR onboarding** with **verified account ownership before introductions**, Ariadne uses a **Two-Tier Progressive Identity Model**:

### Tier A: Instant Consenting Intake (Provisional Session)
- Participant enters their GitHub username and checks the mandatory consent box on `/join`.
- Server issues an `HttpOnly`, `Secure`, `SameSite=Lax` signed session token (`ariadne_session`) tied to that `participant_id`.
- Allows Ariadne to immediately fetch public GitHub evidence, build the capability profile, and compute candidate matches (`ownership_verified = false`).

### Tier B: Verified Ownership Gate Before Outbound Introductions (`ownership_verified = true`)
Before a participant can send an introduction request (`POST /api/matches/:id/decision` with `interested`) or view mutual contact details, they must verify ownership via either:
1. **Primary (1-Click): GitHub OAuth Sign-In (`read:user` / zero private scopes):**
   - Standard GitHub OAuth App callback (`/api/auth/github/callback`) verifies that the authenticated GitHub user's `id`/`login` matches the profile's `github_username` and sets `ownership_verified = true`.
   - Note: Participants can also click **"Sign in with GitHub"** right on step 1 of `/join` to complete Tier A + Tier B in a single tap!
2. **Fallback (Zero-OAuth Challenge):**
   - If GitHub OAuth callback has any DNS/redirect hiccup on venue Wi-Fi, participant can verify ownership by pasting a 6-character challenge code (`ARIADNE-XXXX`) into their public GitHub profile `bio` (or a public gist) for 5 seconds and clicking *Verify*.

---

## 3. Consent & Privacy Controls

| Control | Implementation Requirement |
|---|---|
| **Explicit Analysis Consent** | Mandatory unchecked-by-default checkbox on `/join`: *"I consent to Ariadne analyzing my public GitHub profile and repositories to generate collaboration matches at this event."* Server rejects `POST /api/participants` with `400` if `consent !== true`. |
| **Stage Display Consent** | Separate optional checkbox (default `false`): *"Show my public GitHub username and avatar on the event stage visualizer (otherwise shown pseudonymously as Thread-XXXX)."* |
| **Bilateral Introduction Gate** | Contact details (`discord_handle`, email/social link, or mutual intro room) are strictly withheld in database queries until **both** `participant_a` and `participant_b` have recorded `decision = 'interested'` with `ownership_verified = true`. |
| **No Unsolicited Discord DMs** | Ariadne's Discord bot messages a user **only** if they explicitly provided/linked their Discord identity inside Ariadne and opted into Discord notifications. |
| **One-Click Withdrawal (`Right to Erasure`)** | Every authenticated participant screen includes a **"Withdraw & Delete My Data"** button (`DELETE /api/participants/me`). Immediately deletes capability claims, opportunities, pending matches, and session cookies, marks the record `withdrawn`, and removes the node from the stage visualizer. |
| **Data Retention & Post-Event Cleanup** | All event participant profiles, cached GitHub snapshots, and match records are retained for **7 days post-hackathon** so participants can finish connecting, then permanently purged on **November 14, 2026**. |

---

## 4. Abuse Controls, Rate Limits & Prompt-Injection Defense

1. **IP & Session Rate Limits:**
   - Onboarding (`POST /api/participants`): Max `5 requests / 10 minutes` per IP (prevents someone scripting bulk username submissions to exhaust GitHub API or LLM quota).
   - Match Decisions (`POST /api/matches/:id/decision`): Max `20 requests / minute` per verified session.
2. **Untrusted GitHub Input Sanitization:**
   - Strip all HTML tags, markdown image beacons (`![](http...)`), and control characters from fetched GitHub `bio`, `description`, `README`, and `issue` text before storage or LLM prompting.
   - Wrap all external repository text inside `<untrusted_github_evidence>...</untrusted_github_evidence>` delimiters with explicit system instructions that content inside those tags is data only and must never be followed as instructions.
   - Render all UI text via React's default escaped text nodes (never `dangerouslySetInnerHTML`).
3. **Secret & Control-Plane Isolation:**
   - Public Vercel deployment holds only Ariadne-scoped secrets (`ARIADNE_DATABASE_URL`, `ARIADNE_GITHUB_TOKEN`, `ARIADNE_GITHUB_OAUTH_ID/SECRET`, `ARIADNE_LLM_API_KEY`, `ARIADNE_DISCORD_BOT_TOKEN`, `ARIADNE_SESSION_SECRET`).
   - Zero TangleClaw tokens, zero Operator Discord tokens, and zero tailnet/loopback URLs are ever placed in the Ariadne repository or deployment environment.

# Operator Approval Packet — ARIADNE (`ARIADNE-HACK-2026`)
*Amended: Web-Only Self-Hosted Hackathon MVP + `TC-Lane-PM` 4-Train Playbook*

> **Purpose:** Consolidates every decision, credential, and fleet authorization required from the Operator (**Jason Vaughan**) before **Saturday, November 7, 2026 at 09:30 AM PST**. With the Web-Only Self-Hosted Amendment in place, external cloud database provisioning, Discord bot setup, and Medusa adapters are completely eliminated from the critical path.

---

## 1. Decisions for Operator Ratification

| # | Decision Item | Recommended Default | Cost Impact | Operator Action Required |
|---|---|---|---|---|
| **D-1** | **Target GitHub Repository Name & Visibility** | `Jason-Vaughan/ariadne` (Public, created **only after** 09:30 AM PST Saturday `GO`; license left `UNLICENSED`/TBD per charter). | `$0` | Confirm name `Jason-Vaughan/ariadne`. |
| **D-2** | **Self-Hosted Port & Narrow Public HTTPS Tunnel** | Bind Ariadne server to PortHub port **`127.0.0.1:3420`** (`3421` dev/test, `4420` test runner) and expose solely `127.0.0.1:3420` via `/opt/homebrew/bin/cloudflared tunnel --url http://127.0.0.1:3420` (or `ngrok http 3420`), keeping `:8443` Caddy and `:3102` TangleClaw 100% isolated. | **`$0`** | Approve `127.0.0.1:3420` + `cloudflared`/`ngrok` tunnel. |
| **D-3** | **Application LLM Provider & Spend Cap** | Fast structured-output model (`claude-3-5-sonnet` / `claude-3-5-haiku` or `gemini-2.5-flash` / `gpt-4o-mini`) via single API key (`ARIADNE_LLM_API_KEY`). | **`<= $10–$25`** (Hard spend cap on key) | Stage `ARIADNE_LLM_API_KEY`. |
| **D-4** | **GitHub Ownership Verification Method** | **Two-Tier Progressive Auth:** Instant consenting username intake for profile/match preview + **1-click GitHub OAuth (`read:user`)** (or zero-OAuth GitHub bio challenge code `ARIADNE-XXXX`) required before sending outbound `Interested` proposals. | `$0` | Optional: Register a GitHub OAuth App (`Ariadne Hackathon`) or rely on the built-in zero-OAuth GitHub bio token challenge + OAuth option. |
| **D-5** | **TangleClaw Fleet Topology & Durable Rules (`session-rules`)** | Adopt `TC-Lane-PM`'s recommended 8–9 pane fleet (`Ariadne-PM`, `Ariadne-Arc`, `Ariadne-PRR`, `Ariadne-INT`, `Ariadne-Obsr`, `Ariadne-Lane-A..D`) and the 6 Durable Fleet Rules (`Rule #294` Bundled Cars, `A-Gate` Pre-Flight Rulings, `changelog.d/` fragments, `Single-Turn Plan+Build`, `--merge` Dual-Gate, and `v2.0.0` Sprint Reports). | Existing subscriptions | Confirm whether we should submit the 6 Fleet Rules as proposed `session-rules` on `projectId=149` for your approval in the TangleClaw UI. |

---

## 2. Minimal Environment Variables to Stage Before Saturday (`Only 3–5 Keys!`)

Because persistence uses local **SQLite WAL** (`data/ariadne.sqlite`) and introductions are **100% Web-Native**, you only need to stage:

```env
# 1. Local SQLite Database Path & PortHub Port (Zero external DB needed)
ARIADNE_PORT="3420"
ARIADNE_SQLITE_PATH="./data/ariadne.sqlite"

# 2. GitHub Public Intelligence (`5,000 req/hr` GraphQL, zero private scopes)
ARIADNE_GITHUB_TOKEN="ghp_..."

# 3. Bounded Agent Intelligence
ARIADNE_LLM_API_KEY="..."

# 4. Session Signing Secret (32-byte hex — auto-generated on bootstrap if omitted)
ARIADNE_SESSION_SECRET="..."

# 5. Optional 1-Click GitHub OAuth (Zero-OAuth bio challenge works automatically if omitted)
ARIADNE_GITHUB_OAUTH_CLIENT_ID="Iv1..."
ARIADNE_GITHUB_OAUTH_CLIENT_SECRET="..."
```

---

## 3. H-Day Execution Trigger Phrase

No code, repository, or remote issue will be created until Saturday, November 7, 2026 (`>= 09:30 AM PST`) when you send the explicit command:

> **`GO — AUTHORIZE ARIADNE H-DAY EXECUTION`**

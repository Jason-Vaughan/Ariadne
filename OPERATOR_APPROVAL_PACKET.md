# Operator Approval Packet — ARIADNE (`ARIADNE-HACK-2026`)

> **Purpose:** Consolidates every decision, credential, and resource authorization required from the Operator (**Jason Vaughan**) before **Saturday, November 7, 2026 at 09:30 AM PST**. All items have recommended zero-cost or bounded-budget defaults pre-selected so you can approve the packet as-is or override any item.

---

## 1. Decisions for Operator Ratification

| # | Decision Item | Recommended Default | Cost Impact | Operator Action Required |
|---|---|---|---|---|
| **D-1** | **Target GitHub Repository Name & Visibility** | `Jason-Vaughan/ariadne` (Public, created **only after** 09:30 AM PST Saturday `GO`; license left `UNLICENSED`/TBD per charter). | `$0` | Confirm name `Jason-Vaughan/ariadne` (or specify alternative). |
| **D-2** | **Production Hosting & Database Stack** | **Vercel** (`jason-vaughan` CLI already authenticated) + **Neon Serverless Postgres** (or Vercel Postgres / Turso free tier). | **`$0`** (Free tier covers hackathon load easily) | Provision 1 empty Postgres/Turso DB URL (`ARIADNE_DATABASE_URL`) before Saturday morning. |
| **D-3** | **Application LLM Provider & Spend Cap** | Fast structured-output model (`claude-3-5-sonnet` / `claude-3-5-haiku` or `gemini-2.5-flash` / `gpt-4o-mini`) via single API key (`ARIADNE_LLM_API_KEY`). | **`<= $10–$25`** (Hard spend cap on key) | Provide `ARIADNE_LLM_API_KEY` with a `$25` cap. |
| **D-4** | **GitHub Ownership Verification Method** | **Two-Tier Progressive Auth:** Instant consenting username intake for profile/match preview + **1-click GitHub OAuth (`read:user`)** (with bio-token fallback) required before sending outbound `Interested` proposals. | `$0` | Register a GitHub OAuth App (`Ariadne Hackathon`) and save `CLIENT_ID` + `CLIENT_SECRET`. |
| **D-5** | **Dedicated Ariadne Discord Bot** | Standalone Discord app (`Ariadne Matchmaker`) for private match proposals & mutual intro threads, backed by mandatory Web Introduction Room (`A-012`) fallback. | `$0` | Create bot at `discord.com/developers/applications` (5 mins) or mark `A-013` deferred if you prefer 100% web-only intros. |
| **D-6** | **TangleClaw Fleet Allocation on Saturday Morning** | 6 active Ariadne lanes on Saturday (`Ariadne-PM`, `Ariadne-Arc-PRR`, `Ariadne-INT`, `Ariadne-Lane-A`, `Ariadne-Lane-B`, `Ariadne-Lane-C`, `Ariadne-Lane-D`), parking idle `SGM-*` / completed `TC-Lane-*` lanes during the `09:30–18:00` hackathon window. | Existing subscriptions | Confirm which TangleClaw lanes to spin up/rebind for Saturday morning. |

---

## 2. Environment Variables Checklist to Stage Before Saturday `09:30 AM PST`

Prepare these values in a local private staging note (outside any public repo) so `Ariadne-INT` can inject them into Vercel upon H-Day `GO`:

```env
# 1. Database (Neon / Vercel Postgres / Turso)
ARIADNE_DATABASE_URL="postgresql://..."

# 2. GitHub Public Intelligence & 1-Click Ownership OAuth (Zero private scopes)
ARIADNE_GITHUB_TOKEN="ghp_..."
ARIADNE_GITHUB_OAUTH_CLIENT_ID="Iv1..."
ARIADNE_GITHUB_OAUTH_CLIENT_SECRET="..."

# 3. Bounded Agent Intelligence
ARIADNE_LLM_API_KEY="..."

# 4. Session Signing Secret (32-byte hex)
ARIADNE_SESSION_SECRET="..."

# 5. Optional Dedicated Discord Event Bot (A-013)
ARIADNE_DISCORD_BOT_TOKEN="..."
ARIADNE_DISCORD_PUBLIC_KEY="..."
ARIADNE_DISCORD_APP_ID="..."
```

---

## 3. H-Day Execution Trigger Phrase

No code, repository, or remote issue will be created until Saturday, November 7, 2026 (`>= 09:30 AM PST`) when you send the explicit command:

> **`GO — AUTHORIZE ARIADNE H-DAY EXECUTION`**

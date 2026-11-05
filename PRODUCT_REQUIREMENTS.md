# Product Requirements Document (PRD) — ARIADNE (`ARIADNE-HACK-2026`)

## 1. Product Overview

**Ariadne** (*"Find Your Thread."*) is an AI-native professional discovery network built for live technical events. Instead of asking attendees to fill out tedious forms or chat with an onboarding bot for 10 minutes, Ariadne starts from a participant's actual body of public engineering work on GitHub, synthesizes an evidence-backed profile of their demonstrated capabilities and active project needs, and surfaces high-signal collaborations with fellow attendees.

---

## 2. Target User Journey (12-Step MVP Flow)

1. **QR Scan:** Participant scans a large 16:9 stage QR code or table placard QR code (`https://ariadne.app/join` or the live event URL).
2. **Mobile Onboarding:** A fast, mobile-first landing page opens with a clear value proposition (*"Find Your Thread — Top 3 technical collaborators at this event, backed by real GitHub work"*).
3. **Identity Input:** Participant enters their GitHub username or profile URL (with optional one-tap **Sign in with GitHub OAuth** for verified ownership required before initiating outbound introductions).
4. **Explicit Consent:** Participant reviews a concise, plain-language consent card covering:
   - Required: Permission to analyze public GitHub repositories, commits, issues, and PRs for event matching.
   - Optional toggle: Permission to display their real GitHub handle/avatar on the stage visualizer (defaults to **OFF / Pseudonymous**).
   - Optional input: Discord handle or "Join Event Discord" link for bot-facilitated introductions.
5. **Immediate Provisional Profile & Stage Appearance (< 2 seconds):**
   - Participant receives a private session token and lands on their live profile view.
   - `participant.registered` fires immediately; an anonymized node (`Thread-XXXX`) spawns on the 16:9 Network Visualizer.
6. **Bounded GitHub Intelligence & Capability Profile (10–30 seconds progressive):**
   - Ariadne fetches public user metadata, top/recent repositories, README excerpts, language distribution, and recent public issues/PRs.
   - Profile Research Agent and Opportunity Discovery Agent construct a structured profile distinguishing **Observed Evidence** from **Inferred Opportunities**.
7. **Autonomous Match Discovery:**
   - Match Scoring Engine computes deterministic 4-factor complementarity scores against other active participants.
   - Match Evaluation & Introduction Agent investigates the top candidates and generates specific collaboration explanations.
8. **Evidence-Backed Match Presentation (Up to 3 Matches):**
   - Participant sees up to 3 match cards (or fewer if fewer than 3 cross the minimum quality threshold; **never padded with fake or low-quality filler**).
   - Each card displays: overall score + 4-dimension breakdown, complementary skills, relevant repository/issue links, confidence notes, and a concrete *"Suggested First Conversation"*.
9. **Explicit Participant Decision (`Interested` / `Pass`):**
   - Participant taps **Interested** (propose introduction) or **Pass** (dismiss match) on each card.
   - If the participant joined via unverified username entry, tapping **Interested** prompts a 1-click GitHub OAuth ownership verification (or signed GitHub Gist/bio token fallback) so no third party can impersonate a GitHub user to send invitations.
10. **Private Counterpart Notification:**
    - When Participant A marks **Interested** in Participant B, Participant B sees an incoming **Collaboration Interest** badge on their private web dashboard (and optionally receives a private Discord DM from the Ariadne Event Bot if they linked Discord).
11. **Mutually Authorized Introduction:**
    - When Participant B also clicks **Interested** (accepting the proposal), `introduction.accepted` and `introduction.completed` fire.
    - Ariadne opens a private **Mutual Match Thread** on the web application (showing shared contact info, starter prompt, and repo links) and, if both linked Discord, creates a private Discord introduction thread/DM via the Ariadne bot.
12. **Live Stage Reflection:**
    - The 16:9 stage visualizer animates the state transitions (`candidate` → `proposed` → `mutual connection`) without exposing private messages or unconsented identities.

---

## 3. Functional Requirements by Subsystem

### 3.1 Mobile Onboarding & Consent (`A-002`)
- Accept GitHub username (`octocat`) or profile URL (`https://github.com/octocat`), normalizing and validating syntax.
- Enforce explicit consent checkbox before any GitHub API call or database persistence.
- Provide optional Stage Display Opt-In checkbox (default: pseudonymous).
- Provide immediate visual feedback and progressive loading checklist (`Fetching public repos` → `Analyzing capabilities` → `Discovering project opportunities` → `Evaluating matches`).
- Provide a persistent **"Delete My Data / Withdraw"** button accessible from the participant header at all times.

### 3.2 Participant Profile View (`A-004`, `A-005`)
- Display Observed Capabilities (languages, domains, frameworks) with clickable GitHub evidence pills (repo name + URL + last updated timestamp).
- Display Active Projects & Potential Opportunities (e.g., *"Open issue #14 in `repo-x` suggests interest in streaming WebSocket backpressure"*), explicitly labeled as **AI Inference — Potential Opportunity** with a confidence badge (`High` / `Medium` / `Exploratory`).
- Allow participant to toggle off any inferred need they disagree with (*"Dismiss inference"*), immediately triggering score recalculation.

### 3.3 Match Results & Mutual Introduction Interface (`A-008`, `A-012`)
- Display 0 to 3 top matches ordered by composite score (minimum score threshold: `45 / 100`).
- Clearly render empty/pending states:
  - *Analyzing pool:* "Your profile is live (`Thread-4F9A`). Evaluating fellow participants as they join..."
  - *Below threshold:* "We found 1 strong match so far. We only show matches backed by concrete evidence—more will appear as compatible builders join."
- Support idempotent state transitions: `candidate` → `proposed_by_a` / `proposed_by_b` → `mutual_accepted` or `declined`.
- Once `mutual_accepted`, unlock the **Introduction Card** containing:
  - Verified GitHub handle + profile link of both parties.
  - Shared contact handle(s) / Discord thread link.
  - Copyable icebreaker message grounded in their specific repos.

### 3.4 Stage Visualizer (`A-010`, `A-011`)
- Designed for 1920x1080 (16:9) projector/auditorium display with high-contrast dark theme.
- **Top KPI Ribbon:** Joined Participants | Profiles Analyzed | Opportunities Identified | Introductions Proposed | Mutual Connections Made | Active Agent Tasks.
- **Three Switchable Modes (plus Auto-Cycle option for unattended stage display):**
  1. **Network Mode:** Force-directed graph of participant nodes and match edges (dashed = candidate, pulsing amber = proposed, solid emerald glow = mutual introduction).
  2. **Activity Mode:** Structured live event feed showing real agent operations (`github.fetch.completed`, `opportunity.identified`, `match.evaluated`) with latency and evidence count.
  3. **Spotlight Mode:** Highlights a high-scoring match pair (pseudonymous unless both consented to public stage display) with their complementary capability radar, shared domain, and suggested collaboration topic.

---

## 4. Non-Functional Requirements

- **Mobile Onboarding Latency:** Initial submission to provisional profile render `< 2.0s` (P95).
- **Full Profile + Initial Match Turnaround:** `< 35s` (P95) via bounded GitHub GraphQL/REST calls and parallel structured LLM extraction.
- **Stage Stream Latency:** `< 1.5s` from backend state transition to visualizer render via Server-Sent Events (SSE) with automatic `Last-Event-ID` catch-up.
- **Graceful Degradation:** If GitHub API rate limits or LLM timeouts occur, fall back to deterministic repository metadata matching without crashing the user session or stage visualizer.

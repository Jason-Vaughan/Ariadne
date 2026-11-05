# Product Requirements Document (PRD) — ARIADNE (`ARIADNE-HACK-2026`)
*Amended: Web-Only Self-Hosted Hackathon MVP*

## 1. Product Overview

**Ariadne** (*"Find Your Thread."*) is an AI-native professional discovery network built as a single, self-hosted web application running on the TangleClaw host (isolated from the TangleClaw control plane and exposed through a narrowly scoped public HTTPS tunnel). It features two interfaces connected to the same SQLite-backed Ariadne backend:
1. **Mobile Participant Interface (`/join`, `/me`, `/me/matches/:id`):** QR onboarding, GitHub identity submission, consent controls, live research progress, top-3 match results, `Interested`/`Pass` controls, and mutually approved private web introductions.
2. **Presentation Visualizer (`/stage`, `/reports`):** Full-screen `16:9` live network graph, participant activity, agent analysis states, evidence-backed connections, introduction status, and interactive per-version TangleClaw Sprint Reports for judges.

---

## 2. Target User Journey (12-Step Web-Only MVP Flow)

1. **QR Scan:** Participant scans the on-screen 16:9 stage QR code (`https://<ariadne-tunnel-url>/join`).
2. **Mobile Onboarding:** A fast, mobile-friendly Ariadne page opens.
3. **Identity Input:** Participant enters their GitHub username or profile URL (with 1-click GitHub OAuth or challenge verification to bind ownership for introductions).
4. **Explicit Consent:** Participant grants permission for analysis and matching using public GitHub information:
   - Required checkbox: Consent to analyze public GitHub activity for event matching.
   - Optional toggle: Consent to display real GitHub handle/avatar on the public stage visualizer (defaults to **OFF / Pseudonymous `Thread-XXXX`**).
   - Optional field: Preferred contact note/link (e.g., email, X/LinkedIn, or phone/table location) revealed **exclusively** inside a mutually approved web introduction room.
5. **Immediate Provisional Profile & Stage Appearance (`< 1.5s`):**
   - Provisional profile appears immediately on `/me`, and an anonymized node (`Thread-XXXX`) spawns on the 16:9 Presentation Visualizer via SSE (`participant.registered`).
6. **Bounded GitHub & Capability Analysis (`10–30s` async worker):**
   - Ariadne's background worker analyzes recent public GitHub activity and constructs a structured capability and opportunity profile in SQLite.
7. **Autonomous Match Discovery:**
   - Ariadne discovers up to 3 promising collaborations (`score >= 45`) with other event participants.
8. **Evidence-Backed Match Presentation:**
   - Each proposed match on `/me` explains the complementary capabilities, relevant projects, 40/30/20/10 scoring breakdown, confidence limitations, supporting GitHub links, and a concrete suggested first collaboration. (If fewer than 3 meaningful matches exist, show fewer—never fabricate matches).
9. **Participant Decision (`Interested` / `Pass`):**
   - Participant taps **Interested** or **Pass** on each match card.
10. **Private Counterpart Proposal:**
    - When Participant A taps **Interested**, an incoming **Collaboration Proposal** banner appears privately on Participant B's `/me` interface.
11. **Mutually Approved Web Introduction:**
    - If both participants approve (`Interested`), Ariadne unlocks a private **Mutual Introduction Room** (`/me/matches/:id`) for the pair containing their verified GitHub identities, shared contact notes, matched repositories, copyable starter prompt, and a lightweight shared icebreaker note box.
12. **Live Stage Reflection:**
    - The 16:9 Presentation Visualizer animates the match progression (`candidate` → `proposed` → `completed`) without exposing private information.

> **Scope Simplification:** There is no interview requirement and **no Discord, Medusa, or Morpheus dependency** in the hackathon MVP. All three are deferred to the post-hackathon roadmap.

---

## 3. Functional Requirements by Interface

### 3.1 Mobile Participant Interface (`/join`, `/me`, `/me/matches/:id`)
- **Onboarding & Consent (`A-002`):** Normalize GitHub username/URL, enforce mandatory consent checkbox, default stage display to pseudonymous, issue isolated signed session cookie, and provide a persistent **"Withdraw & Delete My Data"** button (`DELETE /api/participants/me`).
- **Research Progress & Profile (`A-004`, `A-005`):** Live SSE + polling fallback checklist (`Fetching public repos` → `Extracting capabilities` → `Finding opportunities` → `Scoring matches`). Clearly distinguish **Observed Evidence** from **AI Inferences** and allow dismissing inaccurate inferences.
- **Match Results & Web Introduction Room (`A-008`, `A-012`):** Show 0–3 top matches with 4-factor score bars and GitHub evidence links. Enforce verified ownership before outbound `Interested` proposals. Unlock the private Web Introduction Room only after bilateral approval.

### 3.2 Presentation Visualizer (`/stage`, `/reports`)
- **16:9 Stage Modes (`A-010`, `A-011`):**
  1. **Network Mode (`1`):** Force-directed participant nodes, analysis state rings, and match edges.
  2. **Activity Mode (`2`):** Structured live agent event feed (`github.fetch.completed`, `profile.analysis.completed`, `opportunity.identified`, `match.evaluated`).
  3. **Spotlight Mode (`3`):** Deep-dive comparison of a selected match pair with 4-factor breakdown and collaboration thesis.
- **Operator Controls:** Keyboard hotkeys for mode switching (`1/2/3`), hands-free auto-cycle (`Space`), match stepping (`N/P`), and global strict pseudonymity override (`S`).
- **Judge Provenance & Per-Version Sprint Reports (`/provenance`, `/reports`):** Built-in viewer serving the TangleClaw Sprint Reporting Standard `v2.0.0` HTML reports for `v0.1.0`, `v0.2.0`, `v0.3.0`, and `v1.0.0`.

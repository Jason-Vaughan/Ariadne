# Executive Project Charter — ARIADNE (`ARIADNE-HACK-2026`)
*Amended: Web-Only Self-Hosted Hackathon MVP*

- **Project ID:** `ARIADNE-HACK-2026` (TangleClaw Project ID: `149` / `Ariadne-PM`)
- **Working Name:** Ariadne
- **Tagline:** *Find Your Thread.*
- **Event:** Anything Applied Agentic Hackathon, San Francisco
- **Hackathon Date:** Saturday, November 7, 2026
- **Build Window:** 09:30 – 18:00 Pacific (8.5 hours)
- **Demo & Judging Window:** 18:00 – 20:00 Pacific
- **Operator:** Jason Vaughan (`Jason-Vaughan`)
- **Engineering Platform:** TangleClaw (Supervised Autonomous Fleet)
- **Current Authorization State:** **PREPARATION ONLY — H-DAY ENGINEERING NOT AUTHORIZED**

---

## 1. Mission Statement

Build and deploy **Ariadne**, an AI-native professional discovery network that connects technically oriented event participants based on verifiable public GitHub work, complementary engineering capabilities, and concrete collaboration opportunities—while simultaneously demonstrating that a single human Operator can direct a TangleClaw autonomous engineering fleet to plan, build, review, test, integrate, and ship a production application in a single 8.5-hour hackathon window.

> *"Tinder for work. Your AI finds the right people, explains why you should connect, and introduces you when you both agree."*

---

## 2. Architecture Amendment Summary (Web-Only Hackathon MVP)

Superseding the earlier cloud/Discord/Medusa draft, **Ariadne is a single, self-hosted web application running on the TangleClaw host (`cursatory`), strictly isolated from the TangleClaw control plane**:
1. **Two Interfaces on One Backend:**
   - **Mobile Participant Interface (`/join`, `/me`, `/me/matches/:id`):** QR onboarding, GitHub identity submission, explicit consent, live research progress, top-3 match results with 40/30/20/10 scoring breakdown, `Interested`/`Pass` controls, and mutually approved private web introductions.
   - **Presentation Visualizer (`/stage`):** Full-screen `16:9` live network graph, participant activity feed, agent analysis states, evidence-backed connections, and introduction status. Operator-controlled with privacy-safe pseudonymous defaults (`Thread-XXXX`).
2. **Self-Hosted Local Stack + Narrow Public HTTPS Tunnel:**
   - Bound to a dedicated PortHub-registered local port (`127.0.0.1:3420`) exposed through a narrowly scoped public HTTPS tunnel (`cloudflared` / `ngrok` pointing solely to `127.0.0.1:3420`—never exposing TangleClaw control-plane ports, agent terminals, or internal services).
   - **SQLite (`WAL` mode)** for persistent application state.
   - **In-process asynchronous workers** (backed by SQLite job leases) for bounded GitHub retrieval and AI capability/match analysis.
   - **Server-Sent Events (SSE) with automatic reconnect + HTTP polling fallback** for live mobile and stage browser updates.
3. **Zero External Messaging Dependencies in MVP:**
   - **No Discord, Medusa, or Morpheus dependency** is required for the hackathon MVP; all three are moved to the post-hackathon roadmap.

---

## 3. Dual Strategic Objectives & Success Thresholds

### Objective A — Build Ariadne | Objective B — Demonstrate TangleClaw

| Tier | Classification | Operational Definition | Target Train / Checkpoint |
|---|---|---|---|
| **Tier 1** | **Minimum Success (Essential)** | Real participant scans QR code, submits GitHub identity with consent, receives an evidence-grounded capability profile with GitHub source links, and appears immediately on the 16:9 live network visualizer. | **Train 1 (`v0.1.0`) — 12:00 PM PST** |
| **Tier 2** | **Strong Success (Target)** | Multiple real participants join; Ariadne analyzes capabilities and project opportunities, computes transparent 4-factor match scores, and presents up to 3 evidence-backed match explanations per participant on their private results view and stage activity/spotlight views. | **Train 2 (`v0.2.0`) — 14:15 PM PST** |
| **Tier 3** | **Exceptional Success (Stretch)** | Two consenting, verified participants both click *Interested*; the mutual-introduction state machine verifies bilateral approval, unlocks their private **Web Introduction Room** with shared contact details & tailored collaboration starter, and animates the completed connection on the stage visualizer. | **Train 3 (`v0.3.0`) — 15:45 PM PST** |
| **Tier 4** | **Polish, Bug Fixes & Judge Reports** | Dedicated 2-hour runway (`15:45 – 17:45 PM PST`) for UI refinement, edge-case hardening, stage rehearsal, and per-version Observer sprint reports (`v0.1.0`..`v1.0.0`). | **Train 4 (`v1.0.0`) — 17:45 PM PST** |

---

## 4. Non-Negotiable Constraints & Governance

1. **Zero Application Code Before H-Day GO:** No source code, UI components, API routes, schemas, migrations, tests, mocks, or starter templates may be created before 09:30 AM PST on Saturday, November 7, 2026, AND an explicit Operator `GO` command.
2. **Evidence Over Fabrication:**
   - Every capability claim and project opportunity must cite a public GitHub URL and timestamp.
   - Distinguish **observed facts** from **AI inferences**.
   - If fewer than 3 meaningful matches exist above threshold (`score >= 45`), return fewer (or zero). Never fabricate profiles, events, or matches.
   - Never infer willingness to collaborate from public GitHub activity; interest requires explicit participant action.
3. **Privacy, Consent & Control-Plane Isolation:**
   - Explicit opt-in consent before fetching or analyzing public GitHub data.
   - Pseudonymous stage visualizer nodes by default (`Thread-XXXX`); public GitHub handles/avatars appear on stage only with explicit opt-in consent.
   - Isolated participant sessions and authenticated/defensibly bound ownership verification before outbound introduction approvals.
   - Strict isolation: public HTTPS tunnel routes **exclusively** to Ariadne's port (`127.0.0.1:3420`). Zero TangleClaw control-plane endpoints (`:3102`, `:3100`, `:8443`), agent terminals, or Medusa services (`:3009`, `:3010`) are reachable through the public service.
   - Per-version provenance and Observer sprint reports generated at every Train release (`v0.1.0`, `v0.2.0`, `v0.3.0`, `v1.0.0`).

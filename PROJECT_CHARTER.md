# Executive Project Charter — ARIADNE (`ARIADNE-HACK-2026`)

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

Build and deploy **Ariadne**, an AI-native professional discovery network that connects technically oriented event participants based on verifiable public GitHub work, complementary engineering capabilities, and concrete collaboration opportunities—while simultaneously demonstrating that a single human Operator can direct a TangleClaw autonomous engineering fleet to build, review, test, integrate, and ship a production application in a single 8.5-hour hackathon window.

> *"Tinder for work. Your AI finds the right people, explains why you should connect, and introduces you when you both agree."*

---

## 2. Dual Strategic Objectives

### Objective A — Product Delivery (Ariadne)
Deliver a live, mobile-accessible web application and 16:9 stage visualizer where hackathon attendees scan a QR code, submit their GitHub identity with explicit consent, receive an evidence-backed capability and opportunity profile, review up to 3 high-signal collaboration matches with transparent scoring breakdowns, and mutually opt into introductions via Discord or a private web match page.

### Objective B — Platform Demonstration (TangleClaw)
Demonstrate supervised multi-agent software engineering under real-time constraints:
- Clear separation between pre-event preparation (planning, specs, issue drafts) and H-Day implementation (100% of application code written after 09:30 AM PST on Nov 7, 2026).
- Parallel execution across isolated Git worktrees (Builders A–D) with Architect contract governance, Independent PR Review gates, Integrator deployment checkpoints, and Observer audit telemetry.
- High Operator leverage: allow Jason Vaughan to network with founders, researchers, and prospective clients on the hackathon floor while supervising the fleet via TangleClaw.

---

## 3. Success Thresholds & Delivery Tiers

| Tier | Classification | Operational Definition | Target Checkpoint |
|---|---|---|---|
| **Tier 1** | **Minimum Success (Essential)** | Real participant scans QR code, submits GitHub identity with consent, receives an evidence-grounded capability profile with GitHub source links, and appears immediately on the 16:9 live network visualizer. | **12:30 PM PST** (M1 Release) |
| **Tier 2** | **Strong Success (Target)** | Multiple real participants join; Ariadne analyzes capabilities and project opportunities, computes transparent 4-factor match scores, and presents up to 3 evidence-backed match explanations per participant on their private results view and stage activity/spotlight views. | **15:00 PM PST** (M2 Release) |
| **Tier 3** | **Exceptional Success (Stretch)** | Two consenting participants both click *Interested*; the mutual-introduction state machine verifies bilateral approval, triggers a private introduction via the dedicated Ariadne Discord bot (with guaranteed private web fallback), and animates the completed connection on the stage visualizer. | **16:45 PM PST** (M3 Release) |

---

## 4. Non-Negotiable Constraints & Governance

1. **Zero Application Code Before H-Day GO:** No source code, UI components, API routes, schemas, migrations, tests, mocks, or starter templates may be created before 09:30 AM PST on Saturday, November 7, 2026, AND an explicit Operator `GO` command.
2. **Evidence Over Fabrication:**
   - Every capability claim and project opportunity must cite a public GitHub URL and timestamp.
   - Distinguish **observed facts** (languages, commits, repo metadata) from **AI inferences** (candidate bottlenecks, collaboration needs).
   - If fewer than 3 meaningful matches exist above threshold, return fewer (or zero). Never fabricate profiles, events, or matches.
   - Do not infer willingness to collaborate from public GitHub activity; interest requires explicit participant action.
3. **Privacy, Consent & Security by Default:**
   - Explicit opt-in consent before fetching or analyzing public GitHub data.
   - Pseudonymous stage visualizer nodes by default (`Thread-#4F9A`); public GitHub handles/avatars appear on the stage screen only if the participant explicitly checks the public-display consent toggle.
   - Mutual opt-in required before disclosing contact channels or triggering an introduction.
   - One-click participant withdrawal/deletion (`DELETE /api/participant/me`) that purges profile and match state and emits `participant.withdrawn`.
   - Strict isolation from TangleClaw's internal control plane and privileged Operator Discord gateway.
4. **Zero Interference with TangleClaw v5.67.0:** Preparation and H-Day operations must not modify TangleClaw core code, alter existing PortHub leases, or contend with active `TC-Lane-*` / `SGM-*` sessions unless explicitly reallocated by the Operator.
5. **Provenance Integrity:** All pre-hackathon planning artifacts are hash-snapshotted prior to H-Day kickoff so judges can independently verify that 100% of executable code was authored during the build window.

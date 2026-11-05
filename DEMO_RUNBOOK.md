# Stage Demo & Judging Runbook — ARIADNE (`ARIADNE-HACK-2026`)
*Amended: Web-Only Self-Hosted MVP + Per-Version `v2.0.0` Interactive Sprint Reports*

- **Demo Window:** Saturday, November 7, 2026 · `18:00 – 20:00 PM Pacific`
- **Target Pitch Duration:** `3 minutes` live presentation + `2 minutes` judge Q&A

---

## 1. Stage Setup Checklist (`17:45 – 17:55 PM PST`)

1. **Tab 1 — Presentation Visualizer (`16:9` Full Screen):** Open `https://<ariadne-tunnel-url>/stage` (or `http://127.0.0.1:3420/stage` if stage laptop is the host) at `1920x1080`.
2. **Tab 2 — Interactive Sprint Reports Hub (`v2.0.0` Standard):** Open `https://<ariadne-tunnel-url>/reports/` showing the 4 release cards (`v0.1.0`, `v0.2.0`, `v0.3.0`, `v1.0.0`) and the cumulative `v0.1.0–v1.0.0 Hackathon Retrospective`.
3. **Mobile Device(s):** Operator's phone + 1 consenting volunteer/judge phone ready to scan the stage QR code (`https://<ariadne-tunnel-url>/join`).

---

## 2. Three-Minute Live Stage Script

### Minute 0:00 – 0:45 · The Problem & Live Mobile QR Onboarding
- **Visual:** Stage screen shows `/stage` in **Mode 1 (Network Mode)** with the prominent QR code and live participant network graph from the room.
- **Narrative:**
  > *"At technical events like today's hackathon, the hardest problem isn't writing code—it's finding the 2 or 3 builders in the room whose real engineering work complements yours. **Ariadne** is Tinder for technical work: scan the QR code, consent to analyzing your public GitHub, and let autonomous research agents find your highest-leverage collaborators."*
- **Live Action:** Invite a judge (or volunteer attendee) to scan the stage QR code on their phone, enter their GitHub username, and check the consent box.
- **Stage Proof:** Point to the 16:9 screen as `participant.registered` fires in `< 1.5s`, spawning their pseudonymous node (`Thread-XXXX`) on the Network Graph while the background SQLite worker starts `github.fetch.started`.

### Minute 0:45 – 1:45 · Evidence-Backed Match Spotlight & Mutual Web Introduction
- **Live Action:** Press `2` on the stage laptop to show **Activity Mode** (`github.fetch.completed`, `profile.analysis.completed`, `opportunity.identified`, `match.evaluated`), then press `3` to enter **Spotlight Mode**.
- **Visual:** Spotlight Mode displays a real match between two consenting participants:
  - Composite Score (`e.g., 87 / 100`) broken down across **Complementarity (40%)**, **Domain (30%)**, **Evidence (20%)**, and **Recency (10%)**.
  - Specific GitHub repositories and open issues cited (honestly distinguishing *Observed Facts* vs *Potential Opportunities*).
  - A concrete **Suggested First Collaboration**.
- **Live Action (Mutual Introduction):** Both consenting participants tap **Interested** on their mobile web interface (`/me`).
- **Stage & Mobile Proof:** The stage edge animates into a glowing **Mutual Connection** (`introduction.completed`), and both mobile browsers immediately unlock the private **Mutual Introduction Room** (`/me/matches/:id`) with verified GitHub links, shared contact cards, and a copyable starter message.

### Minute 1:45 – 3:00 · Objective B: How One Human Built 4 Releases Today with TangleClaw
- **Live Action:** Switch to Tab 2 (`/reports/` — Interactive Sprint Reports Hub).
- **Narrative:**
  > *"While Ariadne was matching builders, **I didn't spend today typing code in an IDE—I spent the day talking to people in this room.** Every line of Ariadne was built between 9:30 AM and 5:30 PM across 4 governed Release Trains (`v0.1.0` through `v1.0.0`) by a supervised autonomous engineering fleet on **TangleClaw**."*
- **Proof Points to Show Judges on `/reports/`:**
  1. **8-Timestamp Provenance Ledger (`t1..t8`):** Open `/reports/v0.2.0/` or the `v0.1.0–v1.0.0 Retrospective` to show the exact primary-source timestamps proving 100% of code was committed after `09:30 AM PST`.
  2. **Parallel 4-Car Execution:** Point to the SVG architecture and Car-by-Car deliverable charts showing how `Lane-A`, `Lane-B`, `Lane-C`, and `Lane-D` shipped 10 issues simultaneously in Train 1 (`v0.2.0`) by noon with zero merge conflicts.
  3. **4-Gate Governance Audit (`A-Gate`, `R-Gate`, `I-Gate`, `O-Gate`):** Show the independent Architect rulings, PR Reviewer receipts, test counts, and Observer telemetry.

---

## 3. Dependency Failure Playbooks (Live Demo Degraded Modes)

| Failure Scenario | Immediate Symptom | Pre-Engineered Automatic Fallback & Operator Action |
|---|---|---|
| **1. Venue Proxy Buffers SSE Streams** | Mobile or `/stage` SSE connection stalls | Client automatically falls back to `GET /api/events/poll?after=<seq_id>` every `3s` with zero lost events. |
| **2. Public Tunnel Blip / Venue Wi-Fi Drop** | Public tunnel URL momentarily unreachable | Switch host/laptop to pre-paired **iPhone Personal Hotspot**; `/stage` on host can also bind directly to `http://127.0.0.1:3420/stage` for zero-latency local projector rendering. |
| **3. GitHub API Rate Limit or Outage During Judge Scan** | `github.fetch` returns `403/429` or times out after `10s` | SQLite `github_snapshots` cache serves any participant analyzed within the last 30 minutes at `0` API cost; for a brand-new scan during an outage, Operator spotlights any of the real consenting attendees analyzed earlier in the afternoon. |
| **4. LLM Provider Latency Spike / Timeout** | Agent extraction exceeds `12s` budget | `Car 1-B` and `Car 1-C` automatically fall back to deterministic repository language/topic/issue extraction and structured template synthesis so the demo completes in `< 3s` without error. |
| **5. Judge Preferring Privacy on Stage** | Judge wants handle hidden on projector | Default is already **Pseudonymous (`Thread-XXXX`)**. Operator can also press `S` on the stage keyboard to enforce 100% pseudonymity across all nodes. |

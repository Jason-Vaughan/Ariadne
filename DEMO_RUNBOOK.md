# Stage Demo & Judging Runbook — ARIADNE (`ARIADNE-HACK-2026`)

- **Demo Window:** Saturday, November 7, 2026 · `18:00 – 20:00 PM Pacific`
- **Target Pitch Duration:** `3 minutes` live presentation + `2 minutes` judge Q&A

---

## 1. Stage Setup Checklist (`17:45 – 17:55 PM PST`)

1. **Display (`16:9` HDMI/USB-C):** Open `https://<ariadne-prod-url>/stage` in full-screen browser mode (`F11` / `Cmd+Ctrl+F`) at `1920x1080`.
2. **Tab 2 (Provenance & Engineering Proof):** Open `https://<ariadne-prod-url>/provenance` and the TangleClaw Fleet Dashboard (`https://cursatory.tail123678.ts.net:8443`) in adjacent tabs for immediate switch during Objective B narrative.
3. **Mobile Device(s):** Operator's phone + 1 consenting volunteer/judge phone ready to scan the stage QR code.
4. **Backup Hotspot:** Operator's phone personal hotspot pre-paired to the stage laptop in case venue Wi-Fi congests during demos.

---

## 2. Three-Minute Live Stage Script

### Minute 0:00 – 0:45 · The Problem & Live QR Intake
- **Visual:** Stage screen shows `/stage` in **Mode 1 (Network Mode)** with the prominent QR code and live participant graph from the room.
- **Narrative:**
  > *"At technical events like today's hackathon, the hardest problem isn't writing code—it's finding the exact 2 or 3 people in the room whose real engineering work complements yours. Traditional networking apps ask you to fill out forms or talk to an onboarding chatbot. **Ariadne** is Tinder for technical work: scan the QR code, give permission to read your public GitHub, and let autonomous research agents find your highest-leverage collaborators."*
- **Live Action:** Invite a judge (or volunteer attendee) to scan the stage QR code, enter their GitHub username, and check the consent box.
- **Stage Proof:** Point to the 16:9 screen as `participant.registered` fires immediately (`< 2s`), spawning their node (`Thread-XXXX`) on the live Network Graph while `github.fetch.started` pulses.

### Minute 0:45 – 1:45 · Evidence-Backed Intelligence & Match Spotlight
- **Live Action:** Press `2` on the stage laptop to switch to **Activity Mode** for 15 seconds—showing real `github.fetch.completed`, `profile.analysis.completed`, and `opportunity.identified` events with actual repo counts and latency—then press `3` to enter **Spotlight Mode**.
- **Visual:** Spotlight Mode displays a real match between the Operator (or consenting volunteer) and another consenting participant:
  - Composite Score (`e.g., 87 / 100`) broken down across **Complementarity (40%)**, **Domain (30%)**, **Evidence (20%)**, and **Recency (10%)**.
  - Specific GitHub repositories and open issues cited (labeled honestly as *Observed Facts* vs *Potential Opportunities*).
  - A concrete **Suggested First Collaboration**.
- **Live Action (Mutual Introduction):** Both consenting participants tap **Interested** on their phones.
- **Stage Proof:** The stage edge transforms into a glowing **Mutual Connection** (`introduction.completed`), and the private web match room + dedicated Ariadne Discord Bot introduction thread appear immediately.

### Minute 1:45 – 3:00 · Objective B: How One Human Built This Today with TangleClaw
- **Live Action:** Switch to Tab 2 (`/provenance` + TangleClaw Fleet View).
- **Narrative:**
  > *"Here is the second half of today's story: while Ariadne was matching builders, **I didn't spend the day typing code in an IDE—I spent the day talking to people in this room.** Every line of Ariadne's application code was built today after 9:30 AM by a supervised autonomous engineering fleet running on **TangleClaw**."*
- **Proof Points to Highlight on `/provenance`:**
  1. **Pre-Event vs H-Day Transparency:** Show the cryptographic SHA-256 baseline of our pre-hackathon specs vs the first code commit at `09:33 AM PST`.
  2. **Parallel Multi-Lane Execution:** Show the 4 concurrent Builder worktrees (`Lane-A` through `Lane-D`), the independent Architect/Reviewer gate (`R-Gate`), and the Integrator release tags (`v0.1.0`, `v0.2.0`, `v0.3.0`, `v1.0.0`).
  3. **Automated Test & Verification Receipts:** Point to the exact PR review receipts and passing unit/integration test counts recorded at each chunk boundary.

---

## 3. Dependency Failure Playbooks (Live Demo Degraded Modes)

| Failure Scenario | Immediate Symptom | Pre-Engineered Automatic Fallback & Operator Action |
|---|---|---|
| **1. Venue Wi-Fi Drops / High Packet Loss** | Stage laptop loses connection | Switch laptop Wi-Fi to pre-paired **Operator iPhone Personal Hotspot** (`< 10s`). SSE stream automatically replays missed events via `Last-Event-ID`. |
| **2. GitHub API Rate Limit or Outage During Judge Scan** | `github.fetch` returns `403/429` or times out after `10s` | `A-003` cache serves any participant analyzed within the last 30 minutes at `0` API cost. For a brand-new scan during a GitHub outage, Operator can also spotlight any of the real consenting attendees already analyzed earlier in the afternoon. |
| **3. LLM Provider Latency Spike / Timeout** | Agent extraction exceeds `15s` budget | `A-004`, `A-006`, and `A-007` automatically fall back to deterministic repository language/topic/issue extraction and template-based match synthesis so the demo completes in `< 5s` without error. |
| **4. Discord API / Bot DM Blocked by User Privacy Settings** | Participant has Discord DMs disabled (`403`) | `A-012` / `A-013` catches `403` automatically and opens the **Private Web Introduction Card** directly on the participant's mobile browser (`/me/matches/:id`) with zero error banner. |
| **5. Judge Preferring Not to Publicly Show Handle on Stage** | Judge wants privacy on the big screen | Default is already **Pseudonymous (`Thread-XXXX`)**. Operator can also press `S` on the stage keyboard to enforce 100% pseudonymity across all nodes. |

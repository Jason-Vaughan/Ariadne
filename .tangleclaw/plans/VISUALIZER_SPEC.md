# Live Stage Visualizer Specification — ARIADNE (`ARIADNE-HACK-2026`)

## 1. Design Mandate

The Ariadne Live Visualizer (`/stage`) is a **first-class product surface** built for a `1920x1080` (`16:9`) auditorium projector or large display monitor. It turns invisible asynchronous agentic work into an intelligible, trustworthy, privacy-safe public spectacle.

### Core Integrity Rules
1. **100% Event-Driven:** Every node, edge, status transition, and activity card on `/stage` is driven by real `PublicEventEnvelope` records from `GET /api/events/stream`.
2. **Zero Simulated Reasoning:** Never display fake "thinking..." monologues or fabricated chain-of-thought text. Display only verifiable operational states (`github.fetch.completed`, `profile.analysis.completed`, `match.evaluated`, `introduction.completed`).
3. **Pseudonymous by Default:** Every participant node displays its deterministic pseudonym (`Thread-7C4E`) and domain badges by default. A participant's real GitHub handle and avatar appear on `/stage` **if and only if** `participant.public_display_consent === true`.
4. **Progressive Appearance:** A new participant node spawns on the canvas within `< 1.5s` of submitting onboarding (`participant.registered`) and visually evolves through analysis states (`ring-pulse` → `capability badges attached` → `candidate match edges drawn`).

---

## 2. Screen Layout (`1920x1080` 16:9 Stage Frame)

```
+-----------------------------------------------------------------------------------+
| ARIADNE · Find Your Thread     [KPI RIBBON: Joined | Analyzed | Opps | Intros]    |
| [QR CODE CARD: Scan to Join]   [Mode: (1) Network | (2) Activity | (3) Spotlight] |
+-----------------------------------------------------------------------------------+
|                                                         |                         |
|                                                         |   LIVE AGENT ACTIVITY   |
|                  PRIMARY STAGE CANVAS                   |   & TELEMETRY RAIL      |
|             (72% Width — Mode-Specific View)            |   (28% Width)           |
|                                                         |                         |
|   - Mode 1: Interactive Force-Directed Network Graph    |   - Active Agent Tasks  |
|   - Mode 2: Full-Screen Structured Event Matrix         |   - Recent Verifications|
|   - Mode 3: Deep-Dive Match Spotlight Comparison        |   - QR Onboarding URL   |
|                                                         |                         |
+-----------------------------------------------------------------------------------+
| FOOTER: Live Event Stream Connected (SSE) · Privacy-Safe Mode Active · v0.x       |
+-----------------------------------------------------------------------------------+
```

### Persistent Top KPI Ribbon (6 Metrics)
1. **Participants Joined** (`participant.registered` count)
2. **Profiles Analyzed** (`profile.analysis.completed` count)
3. **Opportunities Evaluated** (`opportunity.identified` count)
4. **Match Proposals Generated** (`match.evaluated` count)
5. **Mutual Introductions Approved** (`introduction.completed` count)
6. **Active Agent Operations** (in-flight jobs count)

---

## 3. Three Stage Modes

### Mode 1: Network Mode (`A-010`)
- **Nodes:** Each consenting participant is a node:
  - *State `registered` / `fetching_github`:* Pulsing cyan outline ring (`Fetching GitHub...`).
  - *State `analyzing_profile`:* Amber orbital ring (`Extracting Capabilities...`).
  - *State `ready`:* Solid glowing node colored by primary technical domain, displaying `Thread-XXXX` (or GitHub handle if consented) + top 2 domain pills.
- **Edges:**
  - *Candidate Match (`score >= 45`):* Subtle dashed slate line; thickness proportional to `composite_score`.
  - *Introduction Proposed (`proposed_by_a/b`):* Animated directional pulse along the edge.
  - *Mutual Introduction Completed (`completed`):* Bright emerald-gold glowing thread connecting the two nodes with a brief celebration ripple.

### Mode 2: Activity Mode (`A-011`)
- High-density, structured operational feed showing the 4 agent roles at work in real time:
  - **Profile Research Lane:** Shows recently completed repository analyses with repo count, language tags, and execution duration (`ms`).
  - **Opportunity Discovery Lane:** Shows newly identified collaboration needs with confidence tier (`High` / `Medium` / `Exploratory`).
  - **Match Evaluation & Governance Lane:** Shows evaluated match pairs, 4-factor score bars, and Verification Gate pass receipts (`Evidence URLs Verified`).

### Mode 3: Spotlight Mode (`A-011`)
- Full-canvas deep dive into a selected high-scoring match (`match.evaluated` or `introduction.completed`):
  - **Left & Right Cards:** Participant A (`Thread-XXXX`) and Participant B (`Thread-YYYY`) with their top 4 observed capabilities and cited repo count.
  - **Center Bridge:**
    - Composite Score (`e.g., 88 / 100`) + 4-dimension horizontal breakdown bars (`Complementarity 36/40`, `Domain 26/30`, `Evidence 18/20`, `Recency 8/10`).
    - **Why Connect:** Sanitized collaboration thesis.
    - **Suggested First Collaboration:** Concrete topic for their first conversation.
    - **Introduction Status Badge:** `Candidate Match` / `Proposal Pending` / `Mutual Introduction Completed`.

---

## 4. Stage Operator Controls

Accessible via keyboard shortcuts on the stage laptop:
- `1` / `2` / `3`: Switch immediately to **Network**, **Activity**, or **Spotlight** mode.
- `Space`: Toggle **Auto-Cycle Mode** (rotates Network `30s` → Activity `15s` → Spotlight `15s` for hands-free operation while the Operator networks with attendees).
- `N` / `P`: Step through top evaluated matches when in Spotlight mode.
- `S`: Toggle **Strict Pseudonymity Override** (forces 100% of stage nodes to display `Thread-XXXX` pseudonyms even if some users opted into public display, useful for extra-cautious camera recordings).

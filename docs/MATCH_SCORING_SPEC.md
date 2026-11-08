# Match Scoring Specification — ARIADNE (`ARIADNE-HACK-2026`)
*Updated for `v1.0.0` Final As-Built Release (`A-006` / `A-023` / `A-026` — `563/563` Tests Passing)*

> [!IMPORTANT]
> **As-Built `v1.0.0` 5-Component Bounded Complementarity Formula (`src/matching/scorer.ts` & `src/matching/anti-clone.ts`):**
> During Wave 1 (`v0.2.0`, `A-006` PR #26), the initial 4-dimension (`40/30/20/10`) draft was upgraded to the **5-Component Bounded Complementarity Formula (`35% / 30% / 15% / 10% / 10%`)** with a hard **`38`-point Anti-Clone Penalty Cap**:
> - **`0.35 × Capability Similarity`** (`cosine_similarity` of 6-axis vectors + Jaccard overlap of verified `CapabilityClaim`s)
> - **`0.30 × Need ↔ Offer Fit`** (bidirectional alignment between A's bottlenecks/needs and B's verified superpowers/offers)
> - **`0.15 × Architectural Complementarity`** (normalized L1 gap `mean(|Axis_A[i] - Axis_B[i]|) / 100` rewarding non-overlapping strengths when shared foundation `>= 20%`)
> - **`0.10 × Jaccard Novelty`** (`1 - Jaccard(Tech_A, Tech_B)` so two builders bring distinct tools)
> - **`0.10 × Repo Freshness`** (exponential recency of public GitHub commits)
> - **Anti-Clone Penalty Cap (`<= 38`):** If two builders have identical profiles (`capability_similarity >= 0.70`) with `need_offer_fit == 0` and `complementarity == 0`, their composite score is capped at **`38`** (below the `45` surfacing threshold).

## 1. Scoring Philosophy & Epistemic Guardrails

1. **Estimated Collaboration Potential, Not Probability:** The composite score (`0–100`) measures the structural complementarity and domain alignment between two participants' public work. It is **not** a calibrated probability of personal chemistry or willingness to collaborate.
2. **Never Infer Willingness from GitHub Activity:** Public commits, stars, or open issues never imply that a participant wants unsolicited help. Willingness is established **exclusively** when a participant clicks `Interested` inside Ariadne.
3. **Zero-Padding Rule:** Only matches with `composite_score >= 45` AND at least 1 valid `EvidenceReceipt` on each side may be surfaced. Up to 3 top matches are shown per participant. If only 1 or 0 candidates meet the bar, show 1 or 0.

---

## 2. Four-Dimension Heuristic Model

| Dimension | Weight | Max Points | What It Measures |
|---|---|---|---|
| **1. Complementary Skills & Needs** | **40%** | `40 pts` | Bidirectional match between Participant A's demonstrated `OBSERVED_FACT` capabilities and Participant B's `OpportunityNeed.desired_capabilities` (and vice versa), plus non-redundant technical stack complementarity (e.g., Systems/Rust backend builder + Realtime WebGL/TypeScript frontend builder). |
| **2. Active Project / Domain Relevance** | **30%** | `30 pts` | Overlap in active technical domains (e.g., `Agentic Workflows`, `MCP Tooling`, `Local-First Sync`, `Audio/Voice AI`, `Distributed Systems`) weighted by depth of repository evidence. |
| **3. Strength of Supporting Evidence** | **20%** | `20 pts` | Density, specificity, and epistemic quality of backing `EvidenceReceipt` records (`OBSERVED_FACT` multi-repo commits score higher than single-README `AI_INFERENCE` claims; dismissed inferences score `0`). |
| **4. Recency of Relevant Activity** | **10%** | `10 pts` | Exponential decay based on `source_updated_at` of the cited repositories/issues (`<= 30 days` = 10 pts; `31–90 days` = 7 pts; `91–180 days` = 4 pts; `> 180 days` = 1 pt). |
| **Composite Total** | **100%** | **`100 pts`** | Deterministic sum rounded to nearest integer: `S = round(D1 + D2 + D3 + D4)`. |

---

## 3. Sub-Score Formulas (Deterministic Specification for `A-006`)

### 3.1 Dimension 1: Complementary Skills & Needs (`0–40 pts`)
- **Direct Need-to-Skill Alignment (`0–26 pts`):**
  - Let $N_A$ be active (non-dismissed) `OpportunityNeed.desired_capabilities` of A, and $C_B$ be `CapabilityClaim`s of B with `proficiency_signal in ('primary', 'active')`.
  - Forward coverage $F_{A \to B} = \frac{|N_A \cap C_B|}{\max(1, |N_A|)}$, weighted by capability confidence.
  - Reverse coverage $F_{B \to A} = \frac{|N_B \cap C_A|}{\max(1, |N_B|)}$, weighted by capability confidence.
  - Bidirectional bonus (+6 pts) when both $F_{A \to B} > 0$ and $F_{B \to A} > 0$.
- **Adjacent Role Complementarity (`0–14 pts`):**
  - Awarded when A and B share a domain (Dimension 2 > 0) and hold complementary architectural layers (e.g., `systems_architecture` + `framework/UI`, or `agent_orchestration` + `evals_observability`), avoiding 100% identical clone profiles that have nothing distinct to trade.

### 3.2 Dimension 2: Active Project / Domain Relevance (`0–30 pts`)
- Computed via weighted Jaccard similarity over canonical `domain` and `systems_architecture` tags from active repositories:
  $$D_2 = \min\left(30, \text{round}\left(30 \times \frac{\sum_{t \in T_A \cap T_B} w(t)}{\max(1, \min(|T_A|, |T_B|))}\right)\right)$$
  where primary-repo domain tags carry weight $w(t) = 1.0$ and exploratory tags carry $w(t) = 0.5$.

### 3.3 Dimension 3: Strength of Supporting Evidence (`0–20 pts`)
- Evaluates the supporting `EvidenceReceipt` set $E_{AB}$ cited by the matching claims/opportunities:
  - Up to `12 pts` for `OBSERVED_FACT` receipts backed by pushed code, PRs, or multi-commit repositories (`3 pts` per distinct verified repo, max 4 repos).
  - Up to `8 pts` for specific issue/PR/README problem statements with `confidence >= 0.70`.
  - **Stale Issue Penalty:** If an `OpportunityNeed` relies solely on an open GitHub issue older than 120 days with no recent activity, cap its evidence contribution at `2 pts` and append the mandatory uncertainty warning.

### 3.4 Dimension 4: Recency of Relevant Activity (`0–10 pts`)
- Based on the median age in days ($\Delta d$) of the matched repositories' most recent push/issue activity:
  - $\Delta d \le 30$: `10 pts`
  - $30 < \Delta d \le 90$: `7 pts`
  - $90 < \Delta d \le 180$: `4 pts`
  - $\Delta d > 180$: `1 pt`

---

## 4. Required Match Explanation Output Contract

Every proposed match card (`A-007`, `A-008`) must include all 7 required elements:
1. **Score & Breakdown:** e.g., `84 / 100 (Complementarity: 34/40 · Domain: 24/30 · Evidence: 17/20 · Recency: 9/10)`.
2. **Specific Complementary Capabilities:** Explicit pairing of A's demonstrated skill with B's potential need (and/or vice versa).
3. **Relevant Project Evidence:** Direct repo names and context (`owner/repo`).
4. **Why This Pair Might Benefit from Meeting:** 2–3 sentences grounded strictly in the cited repositories.
5. **One Suggested First Conversation or Collaboration:** Concrete 15-minute hackathon discussion prompt.
6. **Confidence Limitations:** Honest statement of what is inferred vs observed (e.g., *"Need for CRDT sync is inferred from open issue #8 in `local-notes`; confirm whether this is still an active priority"*).
7. **Links to Supporting Public GitHub Records:** Clickable `https://github.com/...` URLs from `EvidenceReceipt`.

---

## 5. Verification Test Cases (For H-Day Unit Suite in `A-006`)

| Test Case ID | Scenario | Input Summary | Expected Score Range & Behavior |
|---|---|---|---|
| **TC-SCORE-01** | **High Bidirectional Complementarity** | Builder A has active Rust/WebRTC media server repo with open issue on browser React audio worklets; Builder B has active TypeScript/WebAudio UI repo with open issue on low-latency SFU routing; both pushed `< 14 days` ago. | `82–94 / 100`. Surfaces as #1 match; cites both repos and open issues; labels issue needs as *Potential Opportunity*. |
| **TC-SCORE-02** | **Identical Clone / Low Complementarity** | Two builders with identical fork-heavy tutorial repos in Python, zero open issues/needs, no complementary layer delta. | `25–38 / 100`. Filtered out (`< 45` threshold); does **not** surface as a match. |
| **TC-SCORE-03** | **Stale Issue Discounting** | Builder A has an open issue from 2023 (900 days old) asking for GraphQL help; no commits in 18 months. | Dimension 3 & 4 heavily discounted (`Recency = 1/10`, stale issue penalty applied); mandatory `confidence_limitations` note attached if score crosses 45. |
| **TC-SCORE-04** | **User Dismissed Inference** | Builder A clicks *"Dismiss inference"* on an AI-inferred Kubernetes need. | Dismissed `OpportunityNeed` is excluded immediately; match score recomputes deterministically without that need. |
| **TC-SCORE-05** | **Sparse / Empty Pool (Zero-Match Integrity)** | First participant joins the event (or 2nd participant has zero domain/skill overlap, score = `18`). | Returns `matches: []` (`0` matches). UI renders honest waiting state; never fabricates or forces a sub-threshold match. |

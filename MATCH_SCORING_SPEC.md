# Match Scoring Specification — ARIADNE (`ARIADNE-HACK-2026`)

## 1. Scoring Philosophy & Epistemic Guardrails

1. **Estimated Collaboration Potential, Not Probability:** The composite score (`0–100`) measures the structural complementarity and domain alignment between two participants' public work. It is **not** a calibrated probability of personal chemistry or willingness to collaborate.
2. **Never Infer Willingness from GitHub Activity:** Public commits, stars, or open issues never imply that a participant wants unsolicited help. Willingness is established **exclusively** when a participant clicks `Interested` inside Ariadne.
3. **Zero-Padding Rule:** Only matches with `composite_score >= 45` AND at least 2 cited evidence pills (at least 1 valid `EvidenceReceipt` on each side) may be surfaced. Up to 3 top matches are shown per participant. If only 1 or 0 candidates meet the bar, show 1 or 0.

---

## 2. Five-Component Hybrid Model (TangleClaw Rule #308 / #314.3)

Implemented in `src/contracts/types.ts` (`ScoreBreakdown`, `SCORE_WEIGHTS`, `compositeScore`). Every component is normalized to `0.0–1.0`.

| Component (`ScoreBreakdown` key) | Weight | What It Measures |
|---|---|---|
| **`capability_similarity`** | **0.35** | `cos(u, v)` of the two participants' capability vectors — shared technical ground to start a conversation from. |
| **`need_offer_fit`** | **0.30** | `max(cos(n_u, o_v), cos(n_v, o_u))` — how well one side's needs (`OpportunityNeed.desired_capabilities`) are met by the other side's offers (`CapabilityClaim`s). |
| **`complementarity`** | **0.15** | Complementary architectural layers held by the two participants (e.g., Systems/Rust backend + Realtime WebGL/TypeScript frontend). |
| **`novelty`** | **0.10** | How much each side brings that the other lacks — penalizes identical clone profiles. |
| **`freshness`** | **0.10** | Recency of the cited repositories/issues. |
| **Composite** | **1.00** | `composite_score = round(100 × (0.35·capability_similarity + 0.30·need_offer_fit + 0.15·complementarity + 0.10·novelty + 0.10·freshness))`, an integer `0–100`. |

**Evidence gate (not a weighted component):** a match surfaces only with at least **2 cited evidence pills** — at least one valid `EvidenceReceipt` on each side (`MatchProposal.evidence_receipt_ids` has ≥ 2 entries) — and `composite_score >= 45`.

---

## 3. Component Formulas (Deterministic Specification for `A-006`)

Vectors range over canonical capability names. Only non-dismissed records count.

### 3.1 `capability_similarity`
- $u, v$: per-capability weights for A and B, where a `CapabilityClaim` contributes `confidence × p`, with $p = 1.0$ (`primary`), $0.7$ (`active`), $0.4$ (`exploratory`).
- $\text{capability\_similarity} = \max(0, \cos(u, v))$.

### 3.2 `need_offer_fit`
- $n_X$: A participant's needs — `OpportunityNeed.desired_capabilities`, each weighted by the need's `confidence`.
- $o_X$: offers — `CapabilityClaim`s with `proficiency_signal in ('primary', 'active')`, weighted by `confidence`.
- $\text{need\_offer\_fit} = \max(0, \cos(n_A, o_B), \cos(n_B, o_A))$.
- **Stale Issue Penalty:** a need backed solely by an open GitHub issue older than 120 days with no recent activity has its weight multiplied by `0.2`, and the match carries the mandatory uncertainty warning.

### 3.3 `complementarity`
- `1.0` when A and B share at least one domain tag AND hold complementary architectural layers (e.g., `systems_architecture` + `framework/UI`, `agent_orchestration` + `evals_observability`); `0.5` for complementary layers with no shared domain; `0.0` otherwise.

### 3.4 `novelty`
- With $C_A, C_B$ the sets of capability names: $\text{novelty} = 1 - \frac{|C_A \cap C_B|}{\max(1, |C_A \cup C_B|)}$ (Jaccard distance), so identical clone profiles score `0`.

### 3.5 `freshness`
- From the median age in days ($\Delta d$) of the cited repositories' most recent push/issue activity: $\Delta d \le 30$ → `1.0`; $\le 90$ → `0.7`; $\le 180$ → `0.4`; otherwise `0.1`.

---

## 4. Required Match Explanation Output Contract

Every proposed match card (`A-007`, `A-008`) must include all 7 required elements:
1. **Score & Breakdown:** e.g., `83 / 100 (Capability 1.00 · Need/Offer 0.80 · Complementarity 0.80 · Novelty 0.60 · Freshness 0.60)`.
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
| **TC-SCORE-03** | **Stale Issue Discounting** | Builder A has an open issue from 2023 (900 days old) asking for GraphQL help; no commits in 18 months. | `freshness = 0.1` and the stale issue penalty applied to `need_offer_fit`; mandatory `confidence_limitations` note attached if score crosses 45. |
| **TC-SCORE-04** | **User Dismissed Inference** | Builder A clicks *"Dismiss inference"* on an AI-inferred Kubernetes need. | Dismissed `OpportunityNeed` is excluded immediately; match score recomputes deterministically without that need. |
| **TC-SCORE-05** | **Sparse / Empty Pool (Zero-Match Integrity)** | First participant joins the event (or 2nd participant has zero domain/skill overlap, score = `18`). | Returns `matches: []` (`0` matches). UI renders honest waiting state; never fabricates or forces a sub-threshold match. |

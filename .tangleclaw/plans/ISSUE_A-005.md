# [feature] A-005: Opportunity and bottleneck discovery

- **Issue ID:** `A-005`
- **Priority:** `P1`
- **Assigned Lane:** `Ariadne-Lane-B` (Builder B)
- **Milestone:** `Wave 2 — Strong Success (v0.2.0-m2)`
- **Dependencies:** `A-003`, `A-004`

## 1. Description
Implement the Opportunity Discovery Agent (`src/lib/agents/opportunity-discovery.ts`) that inspects a participant's recent repository activity, open issues, PR signals, and architectural focus to identify candidate collaboration opportunities (`OpportunityNeed[]`) and desired complementary skills.

## 2. Rationale
Great professional discovery is not just matching two people who both write Python—it is connecting a builder who has a specific systems, UI, or domain challenge with someone who has solved that exact problem.

## 3. Dependencies
- Depends on `A-003` (GitHub issue/PR/README evidence receipts) and `A-004` (capability profile context).

## 4. Implementation Boundaries
- **In Scope:** `src/lib/agents/opportunity-discovery.ts`, stale-issue detection (`> 120 days`), confidence and uncertainty note generation, and emission of `opportunity.identified`.
- **Out of Scope:** Pairwise match scoring (`A-006`) or match explanation generation (`A-007`).

## 5. Acceptance Criteria
- [ ] Every `OpportunityNeed` cites supporting `EvidenceReceipt` IDs and defaults `label` to `'Potential Opportunity (AI Inference)'`.
- [ ] Stale issues (`> 120 days` since update) are never misstated as confirmed blockers and automatically carry an explicit age/uncertainty caveat in `uncertainty_note`.
- [ ] Does not infer personal willingness to collaborate from public GitHub activity.
- [ ] Emits `opportunity.identified` events for the stage visualizer.

## 6. Test Requirements
- Unit tests verifying stale-issue caveat injection, mandatory `Potential Opportunity (AI Inference)` labeling, citation verification, and user dismissal toggling.

## 7. Security & Privacy Considerations
- Treat open issue and PR bodies from third-party contributors on a participant's repo as untrusted input; never attribute a third-party commenter's identity to the participant.

## 8. Expected Demonstration Impact
Surfaces high-signal *"Here is what they are building and where a collaborator could help"* insights that make Ariadne's matches feel remarkably perceptive during live judging.

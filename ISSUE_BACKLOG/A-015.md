# [docs] A-015: Hackathon provenance & Per-Version v2.0.0 Interactive Sprint Reports

- **Issue ID:** `A-015`
- **Priority:** `P0`
- **Assigned Lane & Car:** `Ariadne-Obsr` + `Ariadne-PM` (`Car 0-INT` Slice 1 & Per-Train `O-Gate`)
- **Milestone / Train:** `Train 0 (v0.1.0) through Train 3 (v1.0.0)`
- **Dependencies:** `A-001`

## 1. Description
Maintain the cryptographic provenance ledger (`docs/provenance/PROVENANCE_LEDGER.md`) and generate per-version **TangleClaw Sprint Reporting Standard `v2.0.0`** Interactive HTML Sprint Reports (`/reports/v0.1.0/`, `/reports/v0.2.0/`, `/reports/v0.3.0/`, `/reports/v1.0.0/`, and the cumulative `/reports/v0.1.0-v1.0.0-retrospective/`) served directly by the Ariadne web app and linked from the 16:9 Stage Visualizer.

## 2. Rationale
Objective B of the hackathon is proving to judges how a single Operator directed an autonomous TangleClaw fleet across 4 governed Release Trains on Saturday. Adopting TangleClaw's `v2.0.0` Sprint Report Standard (`metrics_schema.py` + `validate-sprint-report.py`) gives judges an interactive, audit-grade dashboard of every Car, PR, test count, gate review, and `t1..t8` timestamp.

## 3. Dependencies
- Depends on `A-001` (repository initialization).

## 4. Implementation Boundaries
- **In Scope:** Pre-event SHA-256 manifest (`PRE_EVENT_MANIFEST.sha256`), Python report generator script (`scripts/gen_sprint_report.py` modeled on `/Users/jasonvaughan/Documents/Projects/Shared/TangleClaw-Shared/sprint-reports/generators/gen_v5660.py`), static/route serving under `/reports/*`, and `/provenance` summary view.
- **Out of Scope:** Hand-editing HTML reports without running the generator/validator.

## 5. Acceptance Criteria
- [ ] Pre-event planning documents are listed with their SHA-256 digests and explicitly labeled **Pre-Event Preparation (Nov 5–6, 2026)**.
- [ ] First application code commit (`t2_first_branch_commit`) is timestamped strictly after **09:30 AM PST on Saturday, November 7, 2026**, following explicit Operator `GO`.
- [ ] At each Train release (`v0.1.0`, `v0.2.0`, `v0.3.0`, `v1.0.0`), `Ariadne-Obsr` generates the `v2.0.0` HTML report containing the embedded `tc-sprint-metrics-json` block (`t1..t8` timestamps, `T_eng`, `ADE`, Car-by-Car LOC/test SVG charts, 4-Gate audit table, and 16-row `Rule #283` table).
- [ ] `/reports/` hub index compares all 4 Saturday Release Trains side-by-side for judges.

## 6. Test Requirements
- Automated verification confirming `/reports/` and each version report return `200 OK`, contain valid `tc-sprint-metrics-json` payloads, and confirm zero executable code existed prior to `v0.0.0-planning-baseline`.

## 7. Security & Privacy Considerations
- Redact internal machine tokens or private participant records from public sprint reports.

## 8. Expected Demonstration Impact
Provides a show-stopping judge presentation asset during Minute 2 of the live demo: an interactive engineering telemetry hub built automatically at each release train throughout the day.

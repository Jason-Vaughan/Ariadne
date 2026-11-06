#!/usr/bin/env python3
"""
Ariadne Sprint Report Contract Validator (v2.0.0)
=================================================
Enforces the canonical 8-section HTML structure, v2.0.0 8-timestamp cadence,
4-state work-completion accounting, 3-tier cost taxonomy, PR & diff integrity,
SVG count, telemetry bar-fill integrity, 16-point Rule #283 table, and interactive
Wave/PR explorer defined in:
  /Users/jasonvaughan/Documents/Projects/Ariadne-PM/sprint-reports/SPRINT_REPORT_CONTRACT.md
  /Users/jasonvaughan/Documents/Projects/Ariadne-PM/sprint-reports/metrics_schema.py

Usage:
  python3 validate-sprint-report.py --all
  python3 validate-sprint-report.py --version v0.1.0
  python3 validate-sprint-report.py path/to/v0.1.0/index.html
"""

import argparse
import datetime
import glob
import json
import os
import pathlib
import re
import sys

REPORTS_DIR = os.path.dirname(os.path.abspath(__file__))
if REPORTS_DIR not in sys.path:
    sys.path.insert(0, REPORTS_DIR)

try:
    from metrics_schema import DETAILED_SPRINT_RECORDS, SUBSCRIPTION_HOURLY_RATE
except ImportError:
    DETAILED_SPRINT_RECORDS = {}
    SUBSCRIPTION_HOURLY_RATE = 2.46

CANONICAL_SECTIONS = [
    "overview",
    "architecture",
    "velocity",
    "deliverables",
    "telemetry",
    "postmortem",
    "waves",
    "next-sprint",
]

LEGACY_VERSIONS = set()


def parse_version_tuple(vstr: str):
    """Parse 'v0.1.0' -> (0, 1, 0) for sorting."""
    m = re.match(r"^v?(\d+)\.(\d+)\.(\d+)", vstr)
    if not m:
        return (0, 0, 0)
    return (int(m.group(1)), int(m.group(2)), int(m.group(3)))


def parse_iso_utc(ts: str) -> datetime.datetime:
    """Parse ISO-8601 UTC timestamp string ('2026-11-07T17:30:00Z')."""
    if ts.endswith("Z"):
        ts = ts[:-1] + "+00:00"
    return datetime.datetime.fromisoformat(ts)


def requires_v2_canonical_metrics(version: str, content: str) -> bool:
    """Return True if the report requires v2.0.0 canonical schema validation."""
    if version in DETAILED_SPRINT_RECORDS:
        return True
    if 'id="tc-canonical-metrics"' in content:
        return True
    v_tuple = parse_version_tuple(version)
    if (0, 1, 0) <= v_tuple < (5, 0, 0) or v_tuple >= (5, 65, 0):
        return True
    return False


def validate_canonical_metrics_payload(version: str, content: str, enforce_registry_match: bool = True) -> list[str]:
    """Validate the embedded #tc-canonical-metrics JSON object and verify mathematical and DOM consistency."""
    errors = []

    if 'id="canonical-timing-and-cost-audit"' not in content:
        errors.append(
            f"[{version}] Missing mandatory #canonical-timing-and-cost-audit card required by SPRINT_REPORT_CONTRACT v2.0.0."
        )

    m = re.search(
        r'<script[^>]+type="application/json"[^>]+id="tc-canonical-metrics"[^>]*>(.*?)</script>',
        content,
        re.S,
    )
    if not m:
        errors.append(
            f"[{version}] Missing mandatory <script type=\"application/json\" id=\"tc-canonical-metrics\"> block."
        )
        return errors

    try:
        rec = json.loads(m.group(1).strip())
    except Exception as exc:
        errors.append(f"[{version}] Invalid JSON in #tc-canonical-metrics: {exc}")
        return errors

    for top_key in ["schema_version", "slug", "timestamps", "durations", "completion", "diff", "economics", "efficiency"]:
        if top_key not in rec:
            errors.append(f"[{version}] #tc-canonical-metrics missing required top-level key '{top_key}'.")
    if errors:
        return errors

    if rec.get("schema_version") != "2.0.0":
        errors.append(f"[{version}] schema_version must be '2.0.0', got '{rec.get('schema_version')}'.")

    # 1. Timestamp chronology check (t1..t8)
    ts = rec["timestamps"]
    ts_keys = [
        "t1_first_activity",
        "t2_first_branch_commit",
        "t3_first_pr_opened",
        "t4_final_feature_pr_merged",
        "t5_release_pr_merged",
        "t6_release_tag_published",
        "t7_live_deploy_completed",
        "t8_observer_certification_completed",
    ]
    parsed_ts = {}
    for k in ts_keys:
        if k not in ts:
            errors.append(f"[{version}] timestamps missing '{k}'.")
        else:
            try:
                parsed_ts[k] = parse_iso_utc(ts[k])
            except Exception as exc:
                errors.append(f"[{version}] Invalid ISO-8601 timestamp for {k}='{ts[k]}': {exc}")

    if len(parsed_ts) == len(ts_keys):
        chronological_pairs = [
            ("t2_first_branch_commit", "t3_first_pr_opened"),
            ("t3_first_pr_opened", "t4_final_feature_pr_merged"),
            ("t4_final_feature_pr_merged", "t5_release_pr_merged"),
            ("t5_release_pr_merged", "t6_release_tag_published"),
            ("t6_release_tag_published", "t7_live_deploy_completed"),
            ("t7_live_deploy_completed", "t8_observer_certification_completed"),
        ]
        for earlier, later in chronological_pairs:
            if parsed_ts[earlier] > parsed_ts[later]:
                errors.append(
                    f"[{version}] Timestamp chronology violation: {earlier} ({ts[earlier]}) > {later} ({ts[later]})."
                )

        # Verify full_engineering_window_hrs matches t7 - min(t1, t2) within 0.08h
        dur = rec["durations"]
        t_start = min(parsed_ts["t1_first_activity"], parsed_ts["t2_first_branch_commit"])
        computed_eng_hrs = (parsed_ts["t7_live_deploy_completed"] - t_start).total_seconds() / 3600.0
        declared_eng_hrs = float(dur.get("full_engineering_window_hrs", 0.0))
        if abs(computed_eng_hrs - declared_eng_hrs) > 0.08:
            errors.append(
                f"[{version}] full_engineering_window_hrs ({declared_eng_hrs:.2f}h) does not match "
                f"(t7 - start) = {computed_eng_hrs:.2f}h. Substituting a pipelined merge/deploy tail "
                f"for the full engineering window is prohibited."
            )

        cadence_hrs = float(dur.get("inter_release_deploy_cadence_hrs", 0.0))
        overlap_hrs = float(dur.get("pipeline_overlap_hrs", 0.0))
        if overlap_hrs > 0.05 and declared_eng_hrs <= cadence_hrs + 0.05:
            errors.append(
                f"[{version}] Pipelined sprint (pipeline_overlap_hrs={overlap_hrs:.2f}h) declared "
                f"full_engineering_window_hrs ({declared_eng_hrs:.2f}h) <= inter_release_deploy_cadence_hrs ({cadence_hrs:.2f}h)."
            )

    # 2. 4-State Work-Completion Accounting & Milestone Reconciliation
    comp = rec["completion"]
    c_active = int(comp.get("chartered_active_issues", 0))
    c_total = int(comp.get("chartered_total_issues", 0))
    state_a = int(comp.get("state_a_implemented_issues", 0))
    state_b = int(comp.get("state_b_integrated_issues", 0))
    state_c = int(comp.get("state_c_verified_closed_issues", 0))
    state_c_ids = comp.get("state_c_issue_ids", [])
    state_d = int(comp.get("state_d_externally_accepted_issues", 0))
    partial = int(comp.get("partial_slice_re_milestoned_issues", 0))
    partial_ids = comp.get("partial_slice_issue_ids", [])
    deferred = int(comp.get("deferred_to_future_milestone_issues", 0))
    deferred_ids = comp.get("deferred_issue_ids", [])
    pre_closed = int(comp.get("pre_closed_milestone_issues", 0))
    pre_closed_ids = comp.get("pre_closed_issue_ids", [])
    ms_closed = int(comp.get("milestone_closed_total", 0))

    if len(state_c_ids) != state_c:
        errors.append(
            f"[{version}] state_c_verified_closed_issues ({state_c}) != len(state_c_issue_ids) ({len(state_c_ids)})."
        )
    if len(partial_ids) != partial:
        errors.append(
            f"[{version}] partial_slice_re_milestoned_issues ({partial}) != len(partial_slice_issue_ids) ({len(partial_ids)})."
        )
    if len(deferred_ids) != deferred:
        errors.append(
            f"[{version}] deferred_to_future_milestone_issues ({deferred}) != len(deferred_issue_ids) ({len(deferred_ids)})."
        )
    if len(pre_closed_ids) != pre_closed:
        errors.append(
            f"[{version}] pre_closed_milestone_issues ({pre_closed}) != len(pre_closed_issue_ids) ({len(pre_closed_ids)})."
        )

    if state_c + partial != c_active:
        errors.append(
            f"[{version}] Unreconciled active issue count: state_c_verified_closed_issues ({state_c}) + "
            f"partial_slice_re_milestoned_issues ({partial}) != chartered_active_issues ({c_active})."
        )
    if state_a != c_active or state_b != c_active:
        errors.append(
            f"[{version}] State A ({state_a}) and State B ({state_b}) must equal chartered_active_issues ({c_active})."
        )
    if state_c + partial + deferred != c_total:
        errors.append(
            f"[{version}] Unreconciled chartered issue count: state_c ({state_c}) + partial ({partial}) + "
            f"deferred ({deferred}) != chartered_total_issues ({c_total})."
        )
    if pre_closed + state_c != ms_closed:
        errors.append(
            f"[{version}] Unreconciled GitHub Milestone closed total: pre_closed_milestone_issues ({pre_closed}) + "
            f"state_c_verified_closed_issues ({state_c}) != milestone_closed_total ({ms_closed})."
        )
    if state_d > 0 and not comp.get("state_d_external_receipt"):
        errors.append(
            f"[{version}] state_d_externally_accepted_issues is {state_d} without 'state_d_external_receipt'."
        )

    # 3. PR & Diff Integrity
    diff = rec["diff"]
    prs_merged = diff.get("prs_merged", [])
    feature_prs = diff.get("feature_prs", [])
    release_prs = diff.get("release_prs", [])
    true_merge_count = int(diff.get("true_merge_count", 0))
    per_pr = diff.get("per_pr", [])

    if len(prs_merged) != true_merge_count:
        errors.append(
            f"[{version}] PR count mismatch: len(prs_merged) ({len(prs_merged)}) != true_merge_count ({true_merge_count})."
        )
    if len(feature_prs) + len(release_prs) != len(prs_merged):
        errors.append(
            f"[{version}] PR partition mismatch: len(feature_prs) ({len(feature_prs)}) + len(release_prs) ({len(release_prs)}) != len(prs_merged) ({len(prs_merged)})."
        )
    if len(per_pr) != len(prs_merged):
        errors.append(
            f"[{version}] per_pr breakdown length ({len(per_pr)}) != len(prs_merged) ({len(prs_merged)})."
        )

    all_issue_ids = set(state_c_ids + partial_ids + deferred_ids + pre_closed_ids)
    pr_issue_collision = set(prs_merged).intersection(all_issue_ids)
    if pr_issue_collision:
        errors.append(
            f"[{version}] Issue ID(s) {sorted(pr_issue_collision)} erroneously listed inside diff.prs_merged."
        )

    feat_ins_sum = sum(int(item["ins"]) for item in per_pr if item["pr"] in feature_prs)
    feat_del_sum = sum(int(item["del"]) for item in per_pr if item["pr"] in feature_prs)
    rel_ins_sum = sum(int(item["ins"]) for item in per_pr if item["pr"] in release_prs)
    rel_del_sum = sum(int(item["del"]) for item in per_pr if item["pr"] in release_prs)

    if feat_ins_sum != int(diff.get("feature_pr_insertions", -1)):
        errors.append(
            f"[{version}] LOC accounting mismatch: sum of feature PR insertions ({feat_ins_sum}) != "
            f"diff.feature_pr_insertions ({diff.get('feature_pr_insertions')})."
        )
    if feat_del_sum != int(diff.get("feature_pr_deletions", -1)):
        errors.append(
            f"[{version}] LOC accounting mismatch: sum of feature PR deletions ({feat_del_sum}) != "
            f"diff.feature_pr_deletions ({diff.get('feature_pr_deletions')})."
        )
    if rel_ins_sum != int(diff.get("release_pr_insertions", -1)) or rel_del_sum != int(diff.get("release_pr_deletions", -1)):
        errors.append(
            f"[{version}] LOC accounting mismatch: release PR insertions/deletions ({rel_ins_sum}/{rel_del_sum}) != "
            f"declared ({diff.get('release_pr_insertions')}/{diff.get('release_pr_deletions')})."
        )

    # 4. 3-Tier Cost & Efficiency Mathematical Consistency
    econ = rec["economics"]
    eff = rec["efficiency"]
    t_eng = float(rec["durations"]["full_engineering_window_hrs"])
    c_alloc = float(econ.get("tier2_allocated_subscription_usd", 0.0))
    expected_c_alloc = round(t_eng * SUBSCRIPTION_HOURLY_RATE, 2)
    if abs(c_alloc - expected_c_alloc) > 0.03:
        errors.append(
            f"[{version}] Tier 2 allocated cost ({c_alloc:.2f}) != round(T_eng * $2.46, 2) ({expected_c_alloc:.2f})."
        )

    tp_closed = float(eff.get("throughput_closed_per_eng_hr", 0.0))
    expected_tp_closed = round(state_c / t_eng, 2) if t_eng > 0 else 0.0
    if abs(tp_closed - expected_tp_closed) > 0.03:
        errors.append(
            f"[{version}] throughput_closed_per_eng_hr ({tp_closed:.2f}) != round(state_c / T_eng, 2) ({expected_tp_closed:.2f})."
        )

    u_closed = float(eff.get("unit_allocated_cost_per_closed_issue_usd", 0.0))
    expected_u_closed = round(c_alloc / state_c, 2) if state_c > 0 else 0.0
    if abs(u_closed - expected_u_closed) > 0.03:
        errors.append(
            f"[{version}] unit_allocated_cost_per_closed_issue_usd ({u_closed:.2f}) != round(C_alloc / state_c, 2) ({expected_u_closed:.2f})."
        )

    ade_closed = float(eff.get("legacy_ade_v1_closed", 0.0))
    expected_ade_closed = round(state_c / (t_eng * c_alloc), 2) if (t_eng * c_alloc) > 0 else 0.0
    if abs(ade_closed - expected_ade_closed) > 0.03:
        errors.append(
            f"[{version}] legacy_ade_v1_closed ({ade_closed:.2f}) != round(state_c / (T_eng * C_alloc), 2) ({expected_ade_closed:.2f})."
        )

    # 5. Verify DOM #ade-efficiency-card text matches the canonical JSON numbers
    ade_banner_match = re.search(
        r'<!-- TANGLECLAW_ADE_BANNER_START -->(.*?)<!-- TANGLECLAW_ADE_BANNER_END -->',
        content,
        re.S,
    )
    if ade_banner_match:
        banner_html = ade_banner_match.group(1)
        for token in [f"{tp_closed:.2f}", f"${c_alloc:.2f}", f"{ade_closed:.2f}", f"{t_eng:.2f}h"]:
            if token not in banner_html:
                errors.append(
                    f"[{version}] Rendered #ade-efficiency-card banner text does not match canonical JSON token '{token}'."
                )

    if enforce_registry_match and version in DETAILED_SPRINT_RECORDS:
        canonical_rec = DETAILED_SPRINT_RECORDS[version]
        if rec != canonical_rec:
            errors.append(
                f"[{version}] Embedded #tc-canonical-metrics JSON diverges from authoritative DETAILED_SPRINT_RECORDS['{version}']."
            )

    return errors


def validate_report(path: str, version: str = None, enforce_registry_match: bool = True) -> list[str]:
    if not os.path.isfile(path):
        return [f"File does not exist: {path}"]

    if version is None:
        parent = os.path.basename(os.path.dirname(os.path.abspath(path)))
        if parent.startswith("v"):
            version = parent
        else:
            m = re.search(r"(v\d+\.\d+\.\d+(?:-v\d+\.\d+\.\d+-retrospective)?)", os.path.basename(path))
            version = m.group(1) if m else "unknown"

    content = pathlib.Path(path).read_text(encoding="utf-8")
    return validate_report_content(content, version, enforce_registry_match=enforce_registry_match)


def validate_report_content(content: str, version: str, enforce_registry_match: bool = True) -> list[str]:
    errors = []
    is_legacy = version in LEGACY_VERSIONS
    is_live_progress = "<!-- AUTO_GENERATED_LIVE_SPRINT_REPORT -->" in content
    lines = content.splitlines()
    line_count = len(lines)
    byte_count = len(content.encode("utf-8"))

    # 1. Minimum line and byte thresholds
    min_lines = 1000 if is_live_progress else 1350
    min_bytes = 50000 if is_live_progress else 85000
    if line_count < min_lines:
        errors.append(
            f"[{version}] Line count {line_count} is below canonical minimum ({min_lines} lines). "
            f"Abbreviated/drifted reports are prohibited."
        )
    if byte_count < min_bytes:
        errors.append(
            f"[{version}] Byte size {byte_count} B is below canonical minimum ({min_bytes} B)."
        )

    # 2. Section IDs & ordering
    section_ids = re.findall(r'<section[^>]+id="([^"]+)"', content)
    if section_ids != CANONICAL_SECTIONS:
        errors.append(
            f"[{version}] Section IDs {section_ids} do not match canonical 8-section order {CANONICAL_SECTIONS}."
        )

    # 3. Topnav links
    for sec_id in CANONICAL_SECTIONS:
        if f'href="#{sec_id}"' not in content:
            errors.append(f"[{version}] Sticky .topnav is missing link href=\"#{sec_id}\".")
    if 'href="../"' not in content and "../index.html" not in content:
        errors.append(f"[{version}] Sticky .topnav is missing '../' All Sprint Reports Hub link.")

    # 3b. Open Graph / Social Link Preview & Logo Metadata
    for og_tag in ['property="og:title"', 'property="og:description"', 'property="og:image"', 'name="twitter:card"', 'rel="apple-touch-icon"']:
        if og_tag not in content:
            errors.append(
                f"[{version}] Missing mandatory link-preview / Open Graph tag ({og_tag}) in <head>."
            )

    # 4. Hero KPI grid, Plain-English Summary & Single ADE Banner Check
    kpi_cards = len(re.findall(r'class="kpi-card"', content))
    if kpi_cards < 8:
        errors.append(f"[{version}] Hero .kpi-grid has {kpi_cards} .kpi-card elements; canonical minimum is 8.")

    if 'id="plain-english"' not in content or not re.search(r"Plain-English Summary", content, re.I):
        errors.append(
            f"[{version}] Report is missing the mandatory Plain-English Summary card (id=\"plain-english\")."
        )

    if not re.search(r"Total Run Time\s*\(Start\s*(?:→|&rarr;|->)\s*Finish\)", content, re.I):
        errors.append(
            f"[{version}] Report is missing the mandatory 'Total Run Time (Start → Finish)' KPI card in the Hero .kpi-grid."
        )

    ade_card_count = len(re.findall(r'id="ade-efficiency-card"', content))
    if 'Autonomous Delivery Efficiency (ADE)' not in content or ade_card_count == 0:
        errors.append(
            f"[{version}] Report is missing the mandatory 'Autonomous Delivery Efficiency (ADE)' KPI card or #ade-efficiency-card formula banner."
        )
    elif ade_card_count > 1:
        errors.append(
            f"[{version}] Found {ade_card_count} duplicate id=\"ade-efficiency-card\" banners; exactly 1 canonical ADE banner is permitted."
        )

    # 4b. Canonical v2.0.0 Metrics Schema & Mathematical Consistency
    if requires_v2_canonical_metrics(version, content) and not is_live_progress:
        errors.extend(
            validate_canonical_metrics_payload(version, content, enforce_registry_match=enforce_registry_match)
        )

    # 5. SVG Architecture, Velocity, and Deliverables diagrams
    svg_count = len(re.findall(r"<svg\b", content))
    if svg_count < 3:
        errors.append(
            f"[{version}] Found {svg_count} <svg> diagram(s); canonical format requires >= 3 "
            f"(Architecture 9-node SVG, Velocity & Test Growth SVG, and Car-by-Car Deliverables SVG)."
        )

    # 6. Telemetry bar rows, non-clipped .bar-fill check & Longitudinal Multi-Sprint Comparison Table
    bar_rows = len(re.findall(r'class="bar-row"', content))
    if bar_rows < 8:
        errors.append(
            f"[{version}] Section 4 (#telemetry) has {bar_rows} .bar-row elements; canonical minimum is 8."
        )
    if not is_live_progress:
        telemetry_match = re.search(r'<section[^>]+id="telemetry"[^>]*>(.*?)</section>', content, re.S)
        telemetry_block = telemetry_match.group(1) if telemetry_match else ""
        if not re.search(r"Longitudinal.*Comparison", telemetry_block, re.I):
            errors.append(
                f"[{version}] Section 4 (#telemetry) is missing the mandatory Longitudinal Sprint Comparison Table "
                f"(heading matching 'Longitudinal ... Comparison')."
            )
        else:
            th_versions = set(re.findall(r"<th[^>]*>.*?v\d+\.\d+\.\d+.*?</th>", telemetry_block, re.I | re.S))
            if len(th_versions) < 5:
                errors.append(
                    f"[{version}] Longitudinal Sprint Comparison Table in #telemetry has {len(th_versions)} sprint version "
                    f"column headers (<th>...vX.Y.Z...</th>); canonical minimum is 5 planned/historical sprints."
                )
            for req_metric in [
                r"Wall\s+Time",
                r"Build\s+Time",
                r"Open-to-Merge|Ancestor\s+Sync",
                r"Commits\s*/\s*PR|Token",
                r"Test\s+Suite|Flakes|Pool",
                r"Regressions|Pre-Merge",
            ]:
                if not re.search(req_metric, telemetry_block, re.I):
                    errors.append(
                        f"[{version}] Longitudinal Sprint Comparison Table in #telemetry is missing required metric row matching '{req_metric}'."
                    )
    non_empty_fills = [
        f.strip()
        for f in re.findall(r'<div class="bar-fill"[^>]*>(.*?)</div>', content, re.S)
        if f.strip()
    ]
    if non_empty_fills:
        errors.append(
            f"[{version}] Found {len(non_empty_fills)} .bar-fill element(s) containing text (e.g. '{non_empty_fills[0][:40]}'). "
            f".bar-track is 12px tall with overflow:hidden, so text inside .bar-fill is vertically clipped. "
            f"Render labels inside .bar-label-row above .bar-track and keep .bar-fill empty."
        )
    if 'class="bar-label"' in content or 'class="bar-val"' in content:
        errors.append(
            f"[{version}] Found legacy unstyled .bar-label / .bar-val inside .bar-row; use .bar-label-row with two <span> elements."
        )

    # 7. Section 5 (#postmortem): What Worked (green .pm-item) & What Didn't (amber .pm-item.warn)
    pm_ok = len(re.findall(r'class="pm-item"', content))
    pm_warn = len(re.findall(r'class="pm-item warn"', content))
    if pm_ok < 4:
        errors.append(
            f"[{version}] Section 5 (#postmortem) 'What Worked Exceptionally Well' has {pm_ok} .pm-item cards; "
            f"canonical minimum is 4."
        )
    if pm_warn < 4:
        errors.append(
            f"[{version}] Section 5 (#postmortem) 'What Didn't Work & Proven Fixes' has {pm_warn} .pm-item.warn cards; "
            f"canonical minimum is 4."
        )
    if "What Worked" not in content:
        errors.append(f"[{version}] Section 5 (#postmortem) is missing the 'What Worked' heading.")
    if "What Didn" not in content:
        errors.append(f"[{version}] Section 5 (#postmortem) is missing the 'What Didn't Work' heading.")
    warn_blocks = re.findall(r'<div class="pm-item warn">(.*?)</div>', content, re.S)
    for idx, wb in enumerate(warn_blocks, 1):
        if "<h4>" not in wb or "<p>" not in wb:
            errors.append(f"[{version}] Section 5 (#postmortem) .pm-item.warn card #{idx} is missing <h4> or <p>.")
        if not re.search(r"Fix|Guardrail|Pillar|Rule", wb, re.I):
            errors.append(
                f"[{version}] Section 5 (#postmortem) .pm-item.warn card #{idx} must specify a concrete Fix/Guardrail."
            )

    # 8. Section 5 (#postmortem): 16-row Rule #283 table & 4-Gate table
    if "Rule #283" not in content and "16-Point" not in content:
        errors.append(f"[{version}] Section 5 (#postmortem) is missing the 16-Point Rule #283 table.")
    for row_idx in range(1, 17):
        if f"<tr><td>{row_idx}</td>" not in content:
            errors.append(
                f"[{version}] Section 5 (#postmortem) 16-Point Rule #283 table is missing row #{row_idx} (<tr><td>{row_idx}</td>)."
            )
    for gate in ["Gate 1", "Gate 2", "Gate 3", "Gate 4"]:
        if gate not in content:
            errors.append(f"[{version}] Section 5 (#postmortem) 4-Gate Audit Table is missing '{gate}'.")

    # 9. Section 6 (#waves): Interactive Wave & PR Explorer
    wave_cards = len(re.findall(r'class="wave-card"', content))
    if wave_cards < 4:
        errors.append(
            f"[{version}] Section 6 (#waves) has {wave_cards} .wave-card elements; canonical minimum is 4."
        )
    if 'id="waveSearch"' not in content:
        errors.append(f"[{version}] Section 6 (#waves) is missing interactive search input #waveSearch.")
    filter_btns = len(re.findall(r'class="filter-btn(?:\s+active)?"', content))
    if filter_btns < 10:
        errors.append(
            f"[{version}] Section 6 (#waves) has {filter_btns} .filter-btn filter buttons; canonical minimum is 10."
        )

    # 10. Section 7 (#next-sprint): 6-Card Next Sprint Plan & Actionable Guardrails
    next_match = re.search(r'<section[^>]+id="next-sprint"[^>]*>(.*?)</section>', content, re.S)
    if not next_match:
        errors.append(f"[{version}] Could not isolate <section id=\"next-sprint\"> block.")
    else:
        next_block = next_match.group(1)
        next_subcards = len(re.findall(r'class="subcard"', next_block))
        if next_subcards < 6:
            errors.append(
                f"[{version}] Section 7 (#next-sprint) has {next_subcards} .subcard recommendation cards; "
                f"canonical minimum is 6."
            )

    return errors


def extract_embedded_json(path: str) -> dict | None:
    if not os.path.isfile(path):
        return None
    txt = pathlib.Path(path).read_text(encoding="utf-8")
    m = re.search(
        r'<script[^>]+type="application/json"[^>]+id="tc-canonical-metrics"[^>]*>(.*?)</script>',
        txt,
        re.S,
    )
    if not m:
        return None
    try:
        return json.loads(m.group(1).strip())
    except Exception:
        return None


def validate_train_consistency(reports_dir: str) -> list[str]:
    """Verify cross-report mathematical consistency when a multi-version retrospective is present."""
    errors = []
    retro_dirs = sorted(glob.glob(os.path.join(reports_dir, "v*-retrospective")))
    for rdir in retro_dirs:
        slug = os.path.basename(rdir)
        m = re.match(r"^(v\d+\.\d+\.\d+)-(v\d+\.\d+\.\d+)-retrospective$", slug)
        if not m:
            continue
        v_start, v_end = m.group(1), m.group(2)
        r_start = extract_embedded_json(os.path.join(reports_dir, v_start, "index.html"))
        r_end = extract_embedded_json(os.path.join(reports_dir, v_end, "index.html"))
        r_retro = extract_embedded_json(os.path.join(rdir, "index.html"))
        if not (r_start and r_end and r_retro):
            errors.append(f"[train consistency] Missing embedded #tc-canonical-metrics JSON in {v_start}, {v_end}, or {slug}.")
            continue
        if set(r_start["diff"]["prs_merged"] + r_end["diff"]["prs_merged"]) != set(r_retro["diff"]["prs_merged"]):
            errors.append(f"[train consistency] {slug} prs_merged does not equal union of {v_start} and {v_end} PRs.")
    return errors


def validate_hub_index(reports_dir: str) -> list[str]:
    errors = []
    hub_path = os.path.join(reports_dir, "index.html")
    if not os.path.isfile(hub_path):
        return [f"Missing hub index: {hub_path}"]

    hub_content = pathlib.Path(hub_path).read_text(encoding="utf-8")
    vdirs = sorted(
        [os.path.basename(p) for p in glob.glob(os.path.join(reports_dir, "v*")) if os.path.isdir(p)],
        key=parse_version_tuple,
    )
    for ver in vdirs:
        if f'href="./{ver}/"' not in hub_content and f'href="{ver}/"' not in hub_content:
            errors.append(f"[hub index.html] Missing report card link href=\"./{ver}/\" for {ver}.")

    latest_badges = len(re.findall(r"● Latest Release", hub_content))
    if latest_badges != 1:
        errors.append(
            f"[hub index.html] Expected exactly 1 '● Latest Release' badge on the newest release card, found {latest_badges}."
        )
    for og_tag in ['property="og:title"', 'property="og:description"', 'property="og:image"', 'name="twitter:card"', 'rel="apple-touch-icon"']:
        if og_tag not in hub_content:
            errors.append(
                f"[hub index.html] Missing mandatory link-preview / Open Graph tag ({og_tag}) in <head>."
            )
    return errors


def main():
    parser = argparse.ArgumentParser(description="Validate Ariadne Interactive Sprint Reports.")
    parser.add_argument("paths", nargs="*", help="Direct path(s) to report HTML files.")
    parser.add_argument("--all", action="store_true", help="Validate all reports in sprint-reports/ and hub index.")
    parser.add_argument("--version", help="Validate a specific version in sprint-reports/ (e.g. v0.1.0).")
    args = parser.parse_args()

    targets = []
    check_hub = False

    if args.all:
        check_hub = True
        for vdir in sorted(glob.glob(os.path.join(REPORTS_DIR, "v*")), key=lambda p: parse_version_tuple(os.path.basename(p))):
            if os.path.isdir(vdir):
                targets.append((os.path.join(vdir, "index.html"), os.path.basename(vdir)))
    elif args.version:
        ver = args.version if args.version.startswith("v") else f"v{args.version}"
        targets.append((os.path.join(REPORTS_DIR, ver, "index.html"), ver))
    elif args.paths:
        for p in args.paths:
            targets.append((p, None))
    else:
        parser.print_help()
        sys.exit(2)

    all_errors = []
    for path, ver in targets:
        errs = validate_report(path, ver)
        if errs:
            all_errors.extend(errs)
        else:
            content = pathlib.Path(path).read_text(encoding="utf-8")
            label = ver or os.path.basename(os.path.dirname(path))
            print(f"PASS [{label}] {path} ({len(content.splitlines())} lines, {len(content.encode('utf-8'))} B)")

    if check_hub:
        train_errs = validate_train_consistency(REPORTS_DIR)
        if train_errs:
            all_errors.extend(train_errs)
        hub_errs = validate_hub_index(REPORTS_DIR)
        if hub_errs:
            all_errors.extend(hub_errs)
        else:
            print(f"PASS [hub] {os.path.join(REPORTS_DIR, 'index.html')}")

    if all_errors:
        print("\nSPRINT REPORT VALIDATION FAILED:", file=sys.stderr)
        for e in all_errors:
            print(f"  ✗ {e}", file=sys.stderr)
        sys.exit(1)

    print("\nAll validated sprint reports conform 100% to the canonical contract.")


if __name__ == "__main__":
    main()

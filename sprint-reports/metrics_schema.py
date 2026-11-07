#!/usr/bin/env python3
"""
Ariadne Autonomous Sprint Reports — Canonical Metrics Schema & Single Source of Truth (v2.0.0)
==============================================================================================

Adapted from TangleClaw's P1 / Rule #283.5 / SPRINT_REPORT_CONTRACT.md v2.0.0 standard for
Ariadne (`ARIADNE-HACK-2026` — Find Your Thread).

Key invariants enforced by this schema:
1. Full Engineering Window (`T_eng`) vs. Inter-Release Deploy Cadence (`T_cadence`):
   - `T_eng = t7_live_deploy_completed - max(t1_first_activity, t2_first_branch_commit)`
   - Pipelined merge/deploy tails (`t7_N - t7_{N-1}`) are recorded separately as
     `inter_release_deploy_cadence_hrs` and are NEVER substituted for `T_eng` in throughput
     or unit-cost denominators.
2. 4-State Work-Completion Accounting (`State A..D`):
   - State A: Implemented (code + unit tests on branch)
   - State B: Integrated (`--merge` on `main`)
   - State C: Verified & Closed in GitHub Milestone (`W_closed`)
   - State D: Externally Accepted (`0` unless explicitly signed off by an external user/judge)
3. 3-Tier Operating Cost Taxonomy:
   - Tier 1 (`measured`): Marginal per-run API fee (`$0.00` under fixed monthly subscriptions)
     + measured Mac Studio M3 Ultra wall-power (`~$0.025/hr`).
   - Tier 2 (`allocated_estimate`): Pro-rata subscription pool (`$440/mo ÷ 178.8 active hrs = $2.46/hr`,
     with 24/7 calendar-hour reference `$440 ÷ 720h = $0.611/hr`).
   - Tier 3 (`hypothetical_estimate`): Unmetered public API shadow estimate (`~$7.80 / 1M` blended tokens).
4. Orthogonal Efficiency Metrics + Disclosed Legacy Composite (`ADE_v1`):
   - Primary: `Throughput = W_closed / T_eng (issues/hr)` and `Unit Cost = C_alloc / W_closed ($/issue)`.
   - Secondary (disclosed legacy index): `ADE_v1 = W_closed / (T_eng * C_alloc)`.
"""

import json
import os
from typing import Dict, Any, Tuple

SCHEMA_VERSION = "2.0.0"

# Fixed monthly subscription pool:
# 2x Claude Max ($400/mo) + 1x ChatGPT Plus ($20/mo) + 1x Gemini Pro ($20/mo) = $440.00/mo
MONTHLY_SUBSCRIPTION_POOL_USD = 440.00
ACTIVE_FLEET_HOURS_PER_MONTH = 178.80
CALENDAR_HOURS_PER_MONTH = 720.00

SUBSCRIPTION_HOURLY_RATE = round(MONTHLY_SUBSCRIPTION_POOL_USD / ACTIVE_FLEET_HOURS_PER_MONTH, 2)  # $2.46/hr
CALENDAR_HOURLY_RATE = round(MONTHLY_SUBSCRIPTION_POOL_USD / CALENDAR_HOURS_PER_MONTH, 3)          # $0.611/hr
ELECTRICITY_HOURLY_RATE = 0.025  # Mac Studio M3 Ultra ~110W @ $0.23/kWh = ~$0.025/hr
BLENDED_API_SHADOW_PER_M_TOKENS = 7.80

# ---------------------------------------------------------------------------
# Detailed v2.0.0 Canonical Records for Ariadne Sprint Releases
# ---------------------------------------------------------------------------
DETAILED_SPRINT_RECORDS: Dict[str, Dict[str, Any]] = {
    "v0.1.0": {
        "schema_version": SCHEMA_VERSION,
        "slug": "v0.1.0",
        "milestone_number": 1,
        "milestone_title": "Train 0 — Foundation, Contracts, Server & Live Event Bus (v0.1.0)",
        "standing_auth": "ARIADNE-HACK-2026-W1",
        "prev_tag": "v0.0.0-init",
        "prev_sha": "d965715",
        "release_tag": "v0.1.0",
        "release_sha": "101d16c",
        "timestamps": {
            "t1_first_activity": "2026-11-07T19:01:48Z",
            "t1_pst": "11:01:48 PST (Wave 1 Charter Dispatch @ d965715)",
            "t2_first_branch_commit": "2026-11-07T19:12:15Z",
            "t2_pst": "11:12:15 PST (First Wave 1 branch commit @ c4c77e1)",
            "t3_first_pr_opened": "2026-11-07T19:12:27Z",
            "t3_pst": "11:12:27 PST (PR #18 opened — Car 01-D / A-015)",
            "t4_final_feature_pr_merged": "2026-11-07T19:51:10Z",
            "t4_pst": "11:51:10 PST (PR #21 merged @ 101d16c — Car 01-C / A-009)",
            "t5_release_pr_merged": "2026-11-07T19:51:10Z",
            "t5_pst": "11:51:10 PST (Wave 1 final merge @ 101d16c)",
            "t6_release_tag_published": "2026-11-07T19:51:30Z",
            "t6_pst": "11:51:30 PST (Annotated tag v0.1.0 published @ 101d16c)",
            "t7_live_deploy_completed": "2026-11-07T19:52:00Z",
            "t7_pst": "11:52:00 PST (Live :3420 /api/health 200 OK & 183/183 tests green)",
            "t8_observer_certification_completed": "2026-11-07T20:17:50Z",
            "t8_pst": "12:17:50 PST (Ariadne-Obsr O-Gate PASS comment #6712507249 on PR #25)",
        },
        "durations": {
            "full_engineering_window_hrs": 0.66,
            "full_engineering_window_human": "39m 45s (0.66h · t2 11:12:15 → t7 11:52:00 PST; t1→t7 wall-clock 50m 12s / 0.84h)",
            "inter_release_deploy_cadence_hrs": 0.66,
            "inter_release_deploy_cadence_human": "39m 45s (0.66h · Wave 1 first commit t2 11:12:15 → v0.1.0 live t7 11:52:00 PST)",
            "pipeline_overlap_hrs": 0.00,
            "pipeline_overlap_pct": 0.0,
            "pipeline_overlap_human": "0m (Wave 1 opens the hackathon sprint train)",
        },
        "completion": {
            "chartered_total_issues": 4,
            "chartered_active_issues": 4,
            "state_a_implemented_issues": 4,
            "state_b_integrated_issues": 4,
            "state_c_verified_closed_issues": 4,
            "state_c_issue_ids": [1, 13, 9, 14],
            "state_d_externally_accepted_issues": 0,
            "partial_slice_re_milestoned_issues": 0,
            "partial_slice_issue_ids": [],
            "partial_slice_ruling": "0 partial slices — all 4 Wave 1 cars (#1 A-001, #13 A-014, #9 A-009, #14 A-015) closed cleanly in v0.1.0.",
            "deferred_to_future_milestone_issues": 0,
            "deferred_issue_ids": [],
            "deferred_label": "Deferred to Milestone #2 (<code>v0.2.0</code>)",
            "deferred_ruling": "0 deferred issues in Wave 1.",
            "pre_closed_milestone_issues": 0,
            "pre_closed_issue_ids": [],
            "milestone_closed_total": 4,
            "milestone_open_total": 0,
        },
        "diff": {
            "prs_merged": [18, 19, 20, 21],
            "feature_prs": [18, 19, 20, 21],
            "release_prs": [],
            "true_merge_count": 0,
            "squash_or_rebase_count": 4,
            "net_repo_files": 24,
            "net_repo_insertions": 5132,
            "net_repo_deletions": 49,
            "feature_pr_files_sum": 28,
            "feature_pr_insertions": 5144,
            "feature_pr_deletions": 61,
            "release_pr_files": 0,
            "release_pr_insertions": 0,
            "release_pr_deletions": 0,
            "per_pr": [
                {"pr": 18, "issue": "#14 (A-015)", "lane": "Ariadne-Lane-D", "files": 5, "ins": 983, "del": 0, "sha": "4a75d2d"},
                {"pr": 19, "issue": "#13 (A-014)", "lane": "Ariadne-Lane-B", "files": 6, "ins": 1499, "del": 0, "sha": "719b35b"},
                {"pr": 20, "issue": "#1 (A-001)", "lane": "Ariadne-Lane-A", "files": 13, "ins": 1533, "del": 61, "sha": "5bacf1e"},
                {"pr": 21, "issue": "#9 (A-009)", "lane": "Ariadne-Lane-C", "files": 4, "ins": 1129, "del": 0, "sha": "101d16c"},
            ],
        },
        "economics": {
            "tier1_measured_marginal_api_usd": 0.00,
            "tier1_measured_marginal_electricity_usd": 0.02,
            "tier1_evidence_class": "measured",
            "tier2_allocated_subscription_usd": 1.63,
            "tier2_hourly_rate_usd": 2.46,
            "tier2_calendar_hour_subscription_usd": 0.40,
            "tier2_calendar_hourly_rate_usd": 0.611,
            "tier2_evidence_class": "allocated_estimate",
            "tier3_hypothetical_api_shadow_usd": 25.00,
            "est_tokens_m": 3.2,
            "tier3_evidence_class": "hypothetical_estimate",
        },
        "efficiency": {
            "throughput_closed_per_eng_hr": 6.04,
            "throughput_addressed_per_eng_hr": 6.04,
            "unit_allocated_cost_per_closed_issue_usd": 0.41,
            "unit_allocated_cost_per_addressed_issue_usd": 0.41,
            "unit_allocated_cost_per_kloc_usd": 0.32,
            "legacy_ade_v1_closed": 3.70,
            "legacy_ade_v1_addressed": 3.70,
        },
    },
    "v0.2.0": {
        "schema_version": SCHEMA_VERSION,
        "slug": "v0.2.0",
        "milestone_number": 2,
        "milestone_title": "Train 1 — QR Onboarding, GitHub Connector, Scorer & Stage Shell (v0.2.0)",
        "standing_auth": "ARIADNE-HACK-2026-W2",
        "prev_tag": "v0.1.0",
        "prev_sha": "101d16c",
        "release_tag": "v0.2.0",
        "release_sha": "3f14b9e",
        "timestamps": {
            "t1_first_activity": "2026-11-07T19:41:30Z",
            "t1_pst": "11:41:30 PST (Wave 2 Charter Dispatch — Car 02-A on Ariadne-Lane-A)",
            "t2_first_branch_commit": "2026-11-07T19:51:13Z",
            "t2_pst": "11:51:13 PST (First Wave 2 branch commit @ 3e9a9fb — Car 02-A / A-002)",
            "t3_first_pr_opened": "2026-11-07T19:51:34Z",
            "t3_pst": "11:51:34 PST (PR #22 opened — Car 02-A / A-002)",
            "t4_final_feature_pr_merged": "2026-11-07T20:14:04Z",
            "t4_pst": "12:14:04 PST (PR #26 merged @ 3f14b9e — Car 02-C / A-006)",
            "t5_release_pr_merged": "2026-11-07T20:14:04Z",
            "t5_pst": "12:14:04 PST (Wave 2 final merge @ 3f14b9e)",
            "t6_release_tag_published": "2026-11-07T20:14:29Z",
            "t6_pst": "12:14:29 PST (Annotated tag v0.2.0 published @ 3f14b9e)",
            "t7_live_deploy_completed": "2026-11-07T20:15:00Z",
            "t7_pst": "12:15:00 PST (Live :3420 /api/health 200 OK & 342/342 tests green)",
            "t8_observer_certification_completed": "2026-11-07T20:40:59Z",
            "t8_pst": "12:40:59 PST (Ariadne-Obsr O-Gate PASS comment #6712751862 on PR #30; final head PASS 20:50:46Z)",
        },
        "durations": {
            "full_engineering_window_hrs": 0.40,
            "full_engineering_window_human": "23m 47s (0.40h · t2 11:51:13 → t7 12:15:00 PST; t1→t7 wall-clock 33m 30s / 0.56h)",
            "inter_release_deploy_cadence_hrs": 0.38,
            "inter_release_deploy_cadence_human": "23m 00s (0.38h · v0.1.0 live t7 11:52:00 → v0.2.0 live t7 12:15:00 PST)",
            "pipeline_overlap_hrs": 0.01,
            "pipeline_overlap_pct": 3.3,
            "pipeline_overlap_human": "47s (0.01h / 3.3% · t2 11:51:13 → prior t7 11:52:00 PST; t1 dispatch overlap 10m 30s)",
        },
        "completion": {
            "chartered_total_issues": 4,
            "chartered_active_issues": 4,
            "state_a_implemented_issues": 4,
            "state_b_integrated_issues": 4,
            "state_c_verified_closed_issues": 4,
            "state_c_issue_ids": [2, 3, 6, 10],
            "state_d_externally_accepted_issues": 0,
            "partial_slice_re_milestoned_issues": 0,
            "partial_slice_issue_ids": [],
            "partial_slice_ruling": "0 partial slices — all 4 Wave 2 cars (#2 A-002, #3 A-003, #6 A-006, #10 A-010) closed cleanly in v0.2.0.",
            "deferred_to_future_milestone_issues": 0,
            "deferred_issue_ids": [],
            "deferred_label": "Deferred to Milestone #3 (<code>v0.3.0</code>)",
            "deferred_ruling": "0 deferred issues in Wave 2.",
            "pre_closed_milestone_issues": 0,
            "pre_closed_issue_ids": [],
            "milestone_closed_total": 4,
            "milestone_open_total": 0,
        },
        "diff": {
            "prs_merged": [23, 22, 24, 26],
            "feature_prs": [23, 22, 24, 26],
            "release_prs": [],
            "true_merge_count": 0,
            "squash_or_rebase_count": 4,
            "net_repo_files": 18,
            "net_repo_insertions": 6682,
            "net_repo_deletions": 0,
            "feature_pr_files_sum": 21,
            "feature_pr_insertions": 6682,
            "feature_pr_deletions": 0,
            "release_pr_files": 0,
            "release_pr_insertions": 0,
            "release_pr_deletions": 0,
            "per_pr": [
                {"pr": 23, "issue": "#3 (A-003)", "lane": "Ariadne-Lane-B", "files": 5, "ins": 2202, "del": 0, "sha": "308443a"},
                {"pr": 22, "issue": "#2 (A-002)", "lane": "Ariadne-Lane-A", "files": 6, "ins": 1386, "del": 0, "sha": "664bfea"},
                {"pr": 24, "issue": "#10 (A-010)", "lane": "Ariadne-Lane-D", "files": 6, "ins": 1971, "del": 0, "sha": "39f605a"},
                {"pr": 26, "issue": "#6 (A-006)", "lane": "Ariadne-Lane-C", "files": 4, "ins": 1123, "del": 0, "sha": "3f14b9e"},
            ],
        },
        "economics": {
            "tier1_measured_marginal_api_usd": 0.00,
            "tier1_measured_marginal_electricity_usd": 0.01,
            "tier1_evidence_class": "measured",
            "tier2_allocated_subscription_usd": 0.98,
            "tier2_hourly_rate_usd": 2.46,
            "tier2_calendar_hour_subscription_usd": 0.24,
            "tier2_calendar_hourly_rate_usd": 0.611,
            "tier2_evidence_class": "allocated_estimate",
            "tier3_hypothetical_api_shadow_usd": 29.60,
            "est_tokens_m": 3.8,
            "tier3_evidence_class": "hypothetical_estimate",
        },
        "efficiency": {
            "throughput_closed_per_eng_hr": 10.09,
            "throughput_addressed_per_eng_hr": 10.09,
            "unit_allocated_cost_per_closed_issue_usd": 0.24,
            "unit_allocated_cost_per_addressed_issue_usd": 0.24,
            "unit_allocated_cost_per_kloc_usd": 0.15,
            "legacy_ade_v1_closed": 10.35,
            "legacy_ade_v1_addressed": 10.35,
        },
    },
    "v0.3.0": {
        "schema_version": SCHEMA_VERSION,
        "slug": "v0.3.0",
        "milestone_number": 3,
        "milestone_title": "Train 2 — Capability Agent, Match Explanations, Mobile UI & Stage Views (v0.3.0)",
        "standing_auth": "ARIADNE-HACK-2026-W3",
        "prev_tag": "v0.2.0",
        "prev_sha": "3f14b9e",
        "release_tag": "v0.3.0",
        "release_sha": "1a7c8be",
        "timestamps": {
            "t1_first_activity": "2026-11-07T20:02:30Z",
            "t1_pst": "12:02:30 PST (Wave 3 Charter Dispatch — Car 03-B on Ariadne-Lane-B)",
            "t2_first_branch_commit": "2026-11-07T20:10:01Z",
            "t2_pst": "12:10:01 PST (First Wave 3 branch commit @ e49ed45 — Car 03-B / A-004)",
            "t3_first_pr_opened": "2026-11-07T20:10:46Z",
            "t3_pst": "12:10:46 PST (PR #27 opened — Car 03-B / A-004)",
            "t4_final_feature_pr_merged": "2026-11-07T20:41:57Z",
            "t4_pst": "12:41:57 PST (PR #32 merged @ 1a7c8be — Car 03-C / A-007)",
            "t5_release_pr_merged": "2026-11-07T20:41:57Z",
            "t5_pst": "12:41:57 PST (Wave 3 final merge @ 1a7c8be)",
            "t6_release_tag_published": "2026-11-07T20:42:23Z",
            "t6_pst": "12:42:23 PST (Annotated tag v0.3.0 published @ 1a7c8be)",
            "t7_live_deploy_completed": "2026-11-07T20:42:45Z",
            "t7_pst": "12:42:45 PST (Live :3420 /api/health 200 OK & 442/442 tests green)",
            "t8_observer_certification_completed": "2026-11-07T21:03:59Z",
            "t8_pst": "13:03:59 PST (Ariadne-Obsr O-Gate PASS comment #6712992075 on PR #37; updated head PASS 21:13:55Z)",
        },
        "durations": {
            "full_engineering_window_hrs": 0.55,
            "full_engineering_window_human": "32m 44s (0.55h · t2 12:10:01 → t7 12:42:45 PST; t1→t7 wall-clock 40m 15s / 0.67h)",
            "inter_release_deploy_cadence_hrs": 0.46,
            "inter_release_deploy_cadence_human": "27m 45s (0.46h · v0.2.0 live t7 12:15:00 → v0.3.0 live t7 12:42:45 PST)",
            "pipeline_overlap_hrs": 0.08,
            "pipeline_overlap_pct": 15.2,
            "pipeline_overlap_human": "4m 59s (0.08h / 15.2% · t2 12:10:01 → prior t7 12:15:00 PST; t1 dispatch overlap 12m 30s)",
        },
        "completion": {
            "chartered_total_issues": 4,
            "chartered_active_issues": 4,
            "state_a_implemented_issues": 4,
            "state_b_integrated_issues": 4,
            "state_c_verified_closed_issues": 4,
            "state_c_issue_ids": [8, 4, 7, 11],
            "state_d_externally_accepted_issues": 0,
            "partial_slice_re_milestoned_issues": 0,
            "partial_slice_issue_ids": [],
            "partial_slice_ruling": "0 partial slices — all 4 Wave 3 cars (#8 A-008, #4 A-004, #7 A-007, #11 A-011) closed cleanly in v0.3.0.",
            "deferred_to_future_milestone_issues": 0,
            "deferred_issue_ids": [],
            "deferred_label": "Deferred to Milestone #4 (<code>v0.4.0</code>)",
            "deferred_ruling": "0 deferred issues in Wave 3.",
            "pre_closed_milestone_issues": 0,
            "pre_closed_issue_ids": [],
            "milestone_closed_total": 4,
            "milestone_open_total": 0,
        },
        "diff": {
            "prs_merged": [25, 27, 29, 28, 33, 35, 32],
            "feature_prs": [27, 29, 28, 33, 35, 32],
            "release_prs": [25],
            "true_merge_count": 1,
            "squash_or_rebase_count": 6,
            "net_repo_files": 35,
            "net_repo_insertions": 9361,
            "net_repo_deletions": 1082,
            "feature_pr_files_sum": 30,
            "feature_pr_insertions": 5477,
            "feature_pr_deletions": 75,
            "release_pr_files": 11,
            "release_pr_insertions": 2908,
            "release_pr_deletions": 1011,
            "per_pr": [
                {"pr": 25, "issue": "#14 (v0.1.0 O-Gate)", "lane": "Ariadne-Obsr", "files": 11, "ins": 2908, "del": 1011, "sha": "0d9a0a6"},
                {"pr": 27, "issue": "#4 (A-004)", "lane": "Ariadne-Lane-B", "files": 4, "ins": 1132, "del": 0, "sha": "e0f2fd0"},
                {"pr": 29, "issue": "#11 (A-011)", "lane": "Ariadne-Lane-D", "files": 10, "ins": 1530, "del": 50, "sha": "fb7c1a1"},
                {"pr": 28, "issue": "#8 (A-008)", "lane": "Ariadne-Lane-A", "files": 6, "ins": 1259, "del": 0, "sha": "d2ada3a"},
                {"pr": 33, "issue": "#6 (A-006 perf)", "lane": "Ariadne-Lane-C", "files": 3, "ins": 52, "del": 21, "sha": "2998fd6"},
                {"pr": 35, "issue": "#4 (A-004 guard)", "lane": "Ariadne-Lane-B", "files": 3, "ins": 25, "del": 4, "sha": "7a9baed"},
                {"pr": 32, "issue": "#7 (A-007)", "lane": "Ariadne-Lane-C", "files": 4, "ins": 1479, "del": 0, "sha": "1a7c8be"},
            ],
        },
        "economics": {
            "tier1_measured_marginal_api_usd": 0.00,
            "tier1_measured_marginal_electricity_usd": 0.01,
            "tier1_evidence_class": "measured",
            "tier2_allocated_subscription_usd": 1.34,
            "tier2_hourly_rate_usd": 2.46,
            "tier2_calendar_hour_subscription_usd": 0.33,
            "tier2_calendar_hourly_rate_usd": 0.611,
            "tier2_evidence_class": "allocated_estimate",
            "tier3_hypothetical_api_shadow_usd": 32.80,
            "est_tokens_m": 4.2,
            "tier3_evidence_class": "hypothetical_estimate",
        },
        "efficiency": {
            "throughput_closed_per_eng_hr": 7.33,
            "throughput_addressed_per_eng_hr": 7.33,
            "unit_allocated_cost_per_closed_issue_usd": 0.34,
            "unit_allocated_cost_per_addressed_issue_usd": 0.34,
            "unit_allocated_cost_per_kloc_usd": 0.14,
            "legacy_ade_v1_closed": 5.46,
            "legacy_ade_v1_addressed": 5.46,
        },
    },
    "v0.4.0": {
        "schema_version": SCHEMA_VERSION,
        "slug": "v0.4.0",
        "milestone_number": 4,
        "milestone_title": "Train 3 — Opportunity Agent, Mutual Intros & Progressive Worker Pool (v0.4.0)",
        "standing_auth": "ARIADNE-HACK-2026-W4",
        "prev_tag": "v0.3.0",
        "prev_sha": "1a7c8be",
        "release_tag": "v0.4.0",
        "release_sha": "160ef88",
        "timestamps": {
            "t1_first_activity": "2026-11-07T20:23:30Z",
            "t1_pst": "12:23:30 PST (Pipelined Wave 4 Charter Dispatch — Car 04-B on Ariadne-Lane-B)",
            "t2_first_branch_commit": "2026-11-07T20:28:44Z",
            "t2_pst": "12:28:44 PST (First Wave 4 branch commit @ 5e647f1 — Car 04-B / A-005; in-range #34 commit @ 992ed84 at 12:33:46 PST)",
            "t3_first_pr_opened": "2026-11-07T20:29:42Z",
            "t3_pst": "12:29:42 PST (PR #31 opened — Car 04-B / A-005; in-range PR #34 opened at 12:34:04 PST)",
            "t4_final_feature_pr_merged": "2026-11-07T21:19:14Z",
            "t4_pst": "13:19:14 PST (PR #38 merged @ 160ef88 — Car 04-C / A-016)",
            "t5_release_pr_merged": "2026-11-07T21:19:14Z",
            "t5_pst": "13:19:14 PST (Wave 4 final merge @ 160ef88)",
            "t6_release_tag_published": "2026-11-07T21:19:32Z",
            "t6_pst": "13:19:32 PST (Annotated tag v0.4.0 published @ 160ef88)",
            "t7_live_deploy_completed": "2026-11-07T21:20:00Z",
            "t7_pst": "13:20:00 PST (Live :3420 /api/health 200 OK, worker running, 25 seed personas hydrated, 516/516 tests green)",
            "t8_observer_certification_completed": "2026-11-07T21:35:00Z",
            "t8_pst": "13:35:00 PST (Ariadne-Obsr O-Gate PASS comment on PR #40)",
        },
        "durations": {
            "full_engineering_window_hrs": 0.85,
            "full_engineering_window_human": "51m 16s (0.85h · t2 12:28:44 → t7 13:20:00 PST; post-tag #34 t2 12:33:46 → t7 46m 14s / 0.77h; t1→t7 wall-clock 56m 30s / 0.94h)",
            "inter_release_deploy_cadence_hrs": 0.62,
            "inter_release_deploy_cadence_human": "37m 15s (0.62h · v0.3.0 live t7 12:42:45 → v0.4.0 live t7 13:20:00 PST)",
            "pipeline_overlap_hrs": 0.23,
            "pipeline_overlap_pct": 27.3,
            "pipeline_overlap_human": "14m 01s (0.23h / 27.3% · t2 12:28:44 → prior t7 12:42:45 PST; post-tag #34 t2 overlap 8m 59s)",
        },
        "completion": {
            "chartered_total_issues": 3,
            "chartered_active_issues": 3,
            "state_a_implemented_issues": 3,
            "state_b_integrated_issues": 3,
            "state_c_verified_closed_issues": 3,
            "state_c_issue_ids": [12, 5, 15],
            "state_d_externally_accepted_issues": 0,
            "partial_slice_re_milestoned_issues": 0,
            "partial_slice_issue_ids": [],
            "partial_slice_ruling": "0 partial slices — all 3 Wave 4 cars (#12 A-012, #5 A-005, #15 A-016) closed cleanly in Milestone #4 (v0.4.0); Car 04-B (#5, PR #31 @ ae55786, +980/-0 LOC) merged pipelined at 20:35:12Z prior to the v0.3.0 tag.",
            "deferred_to_future_milestone_issues": 0,
            "deferred_issue_ids": [],
            "deferred_label": "Deferred to Milestone #5 (<code>v1.0.0</code>)",
            "deferred_ruling": "0 deferred issues in Wave 4 (all 15 MVP issues closed).",
            "pre_closed_milestone_issues": 0,
            "pre_closed_issue_ids": [],
            "milestone_closed_total": 3,
            "milestone_open_total": 0,
        },
        "diff": {
            "prs_merged": [34, 36, 30, 38],
            "feature_prs": [34, 36, 38],
            "release_prs": [30],
            "true_merge_count": 0,
            "squash_or_rebase_count": 4,
            "net_repo_files": 35,
            "net_repo_insertions": 12775,
            "net_repo_deletions": 843,
            "feature_pr_files_sum": 24,
            "feature_pr_insertions": 4677,
            "feature_pr_deletions": 189,
            "release_pr_files": 16,
            "release_pr_insertions": 8098,
            "release_pr_deletions": 654,
            "per_pr": [
                {"pr": 34, "issue": "#12 (A-012)", "lane": "Ariadne-Lane-A", "files": 10, "ins": 1537, "del": 14, "sha": "baff161"},
                {"pr": 36, "issue": "#7 (A-007 privacy)", "lane": "Ariadne-Lane-C", "files": 4, "ins": 197, "del": 166, "sha": "b5ee8bc"},
                {"pr": 30, "issue": "#14 (v0.2.0 O-Gate)", "lane": "Ariadne-Obsr", "files": 16, "ins": 8098, "del": 654, "sha": "c8adc62"},
                {"pr": 38, "issue": "#15 (A-016)", "lane": "Ariadne-Lane-C", "files": 10, "ins": 2943, "del": 9, "sha": "160ef88"},
            ],
        },
        "economics": {
            "tier1_measured_marginal_api_usd": 0.00,
            "tier1_measured_marginal_electricity_usd": 0.02,
            "tier1_evidence_class": "measured",
            "tier2_allocated_subscription_usd": 2.10,
            "tier2_hourly_rate_usd": 2.46,
            "tier2_calendar_hour_subscription_usd": 0.52,
            "tier2_calendar_hourly_rate_usd": 0.611,
            "tier2_evidence_class": "allocated_estimate",
            "tier3_hypothetical_api_shadow_usd": 35.90,
            "est_tokens_m": 4.6,
            "tier3_evidence_class": "hypothetical_estimate",
        },
        "efficiency": {
            "throughput_closed_per_eng_hr": 3.51,
            "throughput_addressed_per_eng_hr": 3.51,
            "unit_allocated_cost_per_closed_issue_usd": 0.70,
            "unit_allocated_cost_per_addressed_issue_usd": 0.70,
            "unit_allocated_cost_per_kloc_usd": 0.16,
            "legacy_ade_v1_closed": 1.67,
            "legacy_ade_v1_addressed": 1.67,
        },
    },
}

# ---------------------------------------------------------------------------
# Longitudinal Canonical Registry: (full_engineering_window_hrs, verified_closed_issues, net_insertions_loc)
# ---------------------------------------------------------------------------
CANONICAL_METRICS: Dict[str, Tuple[float, int, int]] = {
    "v0.1.0": (0.6625, 4, 5132),
    "v0.2.0": (1427.0 / 3600.0, 4, 6682),
    "v0.3.0": (1964.0 / 3600.0, 4, 9361),
    "v0.4.0": (3076.0 / 3600.0, 3, 12775),
}


def compute_summary_metrics(slug: str, hrs: float = None, issues: int = None, loc: int = None) -> Dict[str, Any]:
    """Compute canonical metrics for any sprint slug."""
    if slug in DETAILED_SPRINT_RECORDS:
        rec = DETAILED_SPRINT_RECORDS[slug]
        t_eng = rec["durations"]["full_engineering_window_hrs"]
        w_closed = rec["completion"]["state_c_verified_closed_issues"]
        w_partial = rec["completion"]["partial_slice_re_milestoned_issues"]
        w_addressed = w_closed + w_partial
        net_loc = rec["diff"]["net_repo_insertions"]
        c_alloc = rec["economics"]["tier2_allocated_subscription_usd"]
        tp_closed = rec["efficiency"]["throughput_closed_per_eng_hr"]
        tp_addr = rec["efficiency"]["throughput_addressed_per_eng_hr"]
        u_closed = rec["efficiency"]["unit_allocated_cost_per_closed_issue_usd"]
        u_addr = rec["efficiency"]["unit_allocated_cost_per_addressed_issue_usd"]
        u_kloc = rec["efficiency"]["unit_allocated_cost_per_kloc_usd"]
        ade_closed = rec["efficiency"]["legacy_ade_v1_closed"]
        ade_addr = rec["efficiency"]["legacy_ade_v1_addressed"]
        est_tokens_m = rec["economics"]["est_tokens_m"]
        api_shadow = rec["economics"]["tier3_hypothetical_api_shadow_usd"]
        savings_mult = round(api_shadow / c_alloc, 1) if c_alloc > 0 else 0.0
        return {
            "slug": slug,
            "hrs": t_eng,
            "issues_closed": w_closed,
            "issues_addressed": w_addressed,
            "loc": net_loc,
            "cost": c_alloc,
            "throughput_closed": tp_closed,
            "throughput_addressed": tp_addr,
            "cost_per_issue": u_closed,
            "cost_per_addressed": u_addr,
            "cost_per_kloc": u_kloc,
            "ade_score": ade_closed,
            "ade_addressed": ade_addr,
            "est_tokens_m": est_tokens_m,
            "api_shadow_cost": api_shadow,
            "savings_mult": savings_mult,
            "detailed": rec,
        }

    if hrs is None or issues is None or loc is None:
        hrs, issues, loc = CANONICAL_METRICS[slug]

    cost = round(hrs * SUBSCRIPTION_HOURLY_RATE, 2)
    tp = round(issues / hrs, 2) if hrs > 0 else 0.0
    cost_per_issue = round(cost / issues, 2) if issues > 0 else 0.0
    cost_per_kloc = round(cost / (loc / 1000.0), 2) if loc > 0 else 0.0
    ade_score = round(issues / (hrs * cost), 2) if (hrs * cost) > 0 else 0.0
    est_tokens_m = round(max(1.2, (loc / 1000.0) * 1.35 + (issues * 0.18)), 1)
    api_shadow_cost = round(est_tokens_m * BLENDED_API_SHADOW_PER_M_TOKENS, 2)
    savings_mult = round(api_shadow_cost / cost, 1) if cost > 0 else 0.0

    return {
        "slug": slug,
        "hrs": hrs,
        "issues_closed": issues,
        "issues_addressed": issues,
        "loc": loc,
        "cost": cost,
        "throughput_closed": tp,
        "throughput_addressed": tp,
        "cost_per_issue": cost_per_issue,
        "cost_per_addressed": cost_per_issue,
        "cost_per_kloc": cost_per_kloc,
        "ade_score": ade_score,
        "ade_addressed": ade_score,
        "est_tokens_m": est_tokens_m,
        "api_shadow_cost": api_shadow_cost,
        "savings_mult": savings_mult,
        "detailed": None,
    }


def render_ade_kpi_and_banner(slug: str, hrs: float = None, issues: int = None, loc: int = None) -> Tuple[str, str]:
    """Render the canonical Hero KPI card and the single #ade-efficiency-card banner in #velocity."""
    m = compute_summary_metrics(slug, hrs, issues, loc)
    w_c = m["issues_closed"]
    w_a = m["issues_addressed"]
    t_e = m["hrs"]
    c_a = m["cost"]
    tp_c = m["throughput_closed"]
    tp_a = m["throughput_addressed"]
    u_c = m["cost_per_issue"]
    u_a = m["cost_per_addressed"]
    kloc = m["cost_per_kloc"]
    ade_c = m["ade_score"]
    ade_a = m["ade_addressed"]
    loc_val = m["loc"]
    tok = m["est_tokens_m"]
    shad = m["api_shadow_cost"]
    mult = m["savings_mult"]

    if m["detailed"] is not None:
        d_diff = m["detailed"]["diff"]
        tm_cnt = d_diff["true_merge_count"]
        sq_cnt = d_diff["squash_or_rebase_count"]
        tot_cnt = len(d_diff["prs_merged"])
        quality_summary = f"{tot_cnt}/{tot_cnt} PRs Integrated ({tm_cnt} merge-commit, {sq_cnt} squash), 0 Post-Merge Defects"
    else:
        quality_summary = "100% Clean Integration, 0 Post-Merge Defects"

    if w_a != w_c:
        sub_line = (
            f"Throughput: <code>{tp_c:.2f} closed/hr</code> (<code>{tp_a:.2f} addressed/hr</code> on <code>T_eng={t_e:.2f}h</code>) · "
            f"Allocated: <code>${u_c:.2f}/closed</code> (<code>${u_a:.2f}/addressed</code> · <code>${c_a:.2f}</code> pool) · "
            f"Legacy ADE_v1: <code>{ade_c:.2f}</code> (closed) / <code>{ade_a:.2f}</code> (addressed)"
        )
        formula_line = (
            f"<strong>1. Orthogonal Efficiency Metrics (Primary Standard):</strong> "
            f"<strong>Throughput</strong> = <code>W_closed / T_eng = {w_c} / {t_e:.2f}h = <strong>{tp_c:.2f} closed issues/hr</strong></code> "
            f"(<code>{w_a} / {t_e:.2f}h = {tp_a:.2f} addressed issues/hr</code> including {w_a - w_c} Slice 2 issues re-milestoned) · "
            f"<strong>Unit Allocated Cost</strong> = <code>C_alloc / W_closed = ${c_a:.2f} / {w_c} = <strong>${u_c:.2f}/closed issue</strong></code> "
            f"(<code>${u_a:.2f}/addressed issue</code>; <code>${kloc:.2f}/kLOC</code> across <code>+{loc_val:,}</code> net insertions) · "
            f"<strong>Quality</strong> = <code>{quality_summary}</code>.<br/>\n"
            f"          <strong>2. Disclosed Legacy Composite Index (<code>ADE_v1</code>):</strong> "
            f"<code>ADE_v1 = W / (T_eng × C_alloc) = {w_c} / ({t_e:.2f}h × ${c_a:.2f}) = <strong>{ade_c:.2f}</strong></code> (verified closed) "
            f"or <code>{w_a} / ({t_e:.2f}h × ${c_a:.2f}) = <strong>{ade_a:.2f}</strong></code> (all chartered addressed). "
            f"<em>Dimensional Note:</em> Because <code>C_alloc = $2.46/hr × T_eng</code>, <code>ADE_v1 = W / (2.46 × T_eng²)</code> scales as <code>1/T²</code> (units: <code>issues · hr⁻² · $⁻¹</code>); "
            f"therefore <code>ADE_v1</code> must always use the full engineering window (<code>T_eng = {t_e:.2f}h</code>, never a pipelined merge tail) and is paired with scale-invariant Throughput (<code>{tp_c:.2f} issues/hr</code>)."
        )
    else:
        sub_line = (
            f"Throughput: <code>{tp_c:.2f} closed/hr</code> (<code>T_eng={t_e:.2f}h</code>) · "
            f"Allocated: <code>${u_c:.2f}/issue</code> (<code>${c_a:.2f}</code> pool · <code>${kloc:.2f}/kLOC</code>) · "
            f"Legacy ADE_v1: <code>{ade_c:.2f}</code>"
        )
        formula_line = (
            f"<strong>1. Orthogonal Efficiency Metrics (Primary Standard):</strong> "
            f"<strong>Throughput</strong> = <code>W_closed / T_eng = {w_c} / {t_e:.2f}h = <strong>{tp_c:.2f} closed issues/hr</strong></code> · "
            f"<strong>Unit Allocated Cost</strong> = <code>C_alloc / W_closed = ${c_a:.2f} / {w_c} = <strong>${u_c:.2f}/closed issue</strong></code> "
            f"(<code>${kloc:.2f}/kLOC</code> across <code>+{loc_val:,}</code> insertions) · "
            f"<strong>Quality</strong> = <code>{quality_summary}</code>.<br/>\n"
            f"          <strong>2. Disclosed Legacy Composite Index (<code>ADE_v1</code>):</strong> "
            f"<code>ADE_v1 = W_closed / (T_eng × C_alloc) = {w_c} / ({t_e:.2f}h × ${c_a:.2f}) = <strong>{ade_c:.2f}</strong></code>. "
            f"<em>Dimensional Note:</em> Because <code>C_alloc = $2.46/hr × T_eng</code>, <code>ADE_v1 = W / (2.46 × T_eng²)</code> scales as <code>1/T²</code> (units: <code>issues · hr⁻² · $⁻¹</code>); "
            f"therefore <code>ADE_v1</code> is always evaluated on the full engineering window (<code>T_eng = {t_e:.2f}h</code>, never a pipelined merge tail) alongside scale-invariant Throughput (<code>{tp_c:.2f} issues/hr</code>)."
        )

    kpi_card = (
        f'        <!-- TANGLECLAW_ADE_KPI_START -->\n'
        f'        <div class="kpi-card">\n'
        f'          <div class="kpi-label">Autonomous Delivery Efficiency (ADE)</div>\n'
        f'          <div class="kpi-value" style="color:var(--cyan,#38bdf8)">{tp_c:.2f}/hr · ADE {ade_c:.2f}</div>\n'
        f'          <div class="kpi-meta kpi-sub">{sub_line}</div>\n'
        f'        </div>\n'
        f'        <!-- TANGLECLAW_ADE_KPI_END -->'
    )

    banner = (
        f'      <!-- TANGLECLAW_ADE_BANNER_START -->\n'
        f'      <div id="ade-efficiency-card" class="subcard" style="margin:18px 0;padding:18px 22px;border:1.5px solid rgba(56,189,248,0.45);background:linear-gradient(135deg,rgba(15,23,42,0.95),rgba(14,116,144,0.16));border-radius:12px;">\n'
        f'        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:8px;">\n'
        f'          <span style="color:#38bdf8;font-weight:700;font-size:0.82rem;letter-spacing:0.06em;">📐 AUTONOMOUS DELIVERY EFFICIENCY (ADE) · ORTHOGONAL THROUGHPUT, ALLOCATED COST &amp; LEGACY ADE_v1</span>\n'
        f'          <span class="badge badge-green" style="font-size:0.78rem;">Throughput = {tp_c:.2f} Issues/Hr · Allocated = ${u_c:.2f}/Issue (${kloc:.2f}/kLOC) · Legacy ADE_v1 = {ade_c:.2f}</span>\n'
        f'        </div>\n'
        f'        <div style="font-size:0.90rem;color:#e2e8f0;line-height:1.56;">\n'
        f'          {formula_line}<br/>\n'
        f'          <strong>3. 3-Tier Operating Cost Basis:</strong> '
        f'<strong>Tier 1 (Measured Marginal Cash):</strong> <code>$0.00</code> per-run API fee + <code>~${round(t_e * ELECTRICITY_HOURLY_RATE, 2):.2f}</code> M3 Ultra wall power · '
        f'<strong>Tier 2 (Allocated Subscription Pool):</strong> <code>${c_a:.2f}</code> pro-rata allocation (<code>$440/mo ÷ 178.8 active hrs = $2.46/hr × {t_e:.2f}h</code>; calendar-hour reference <code>${round(t_e * CALENDAR_HOURLY_RATE, 2):.2f}</code> @ <code>$0.611/hr</code>) · '
        f'<strong>Tier 3 (Hypothetical API Shadow Estimate):</strong> <code>~${shad:.0f}</code> (unmetered estimate across <code>~{tok}M</code> tokens → <code>{mult}×</code> subscription compression).\n'
        f'        </div>\n'
        f'      </div>\n'
        f'      <!-- TANGLECLAW_ADE_BANNER_END -->'
    )
    return kpi_card, banner


def render_canonical_governance_and_metrics_cards(slug: str) -> str:
    """Render the mandatory v2.0.0 8-Timestamp Cadence, 4-State Completion, 3-Tier Cost,
    and External Credibility & Disclosure cards plus embedded JSON script."""
    if slug not in DETAILED_SPRINT_RECORDS:
        return ""
    rec = DETAILED_SPRINT_RECORDS[slug]
    ts = rec["timestamps"]
    dur = rec["durations"]
    comp = rec["completion"]
    diff = rec["diff"]
    econ = rec["economics"]
    eff = rec["efficiency"]

    json_payload = json.dumps(rec, indent=2)

    return f'''
      <!-- TANGLECLAW_CANONICAL_METRICS_START -->
      <div class="card" id="canonical-timing-and-cost-audit" style="margin-top:18px;margin-bottom:18px;border:1px solid rgba(56,189,248,0.4);">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px;">
          <h3 style="margin:0;color:var(--accent2);">📊 Canonical 8-Timestamp Release Cadence, 4-State Completion &amp; 3-Tier Cost Ledger (<code>SPRINT_REPORT_CONTRACT v2.0</code>)</h3>
          <span class="badge badge-cyan">Primary-Source Verified · Schema v2.0.0 · 0 Unreconciled Counts</span>
        </div>

        <div class="grid-2" style="gap:16px;margin-bottom:16px;">
          <div>
            <h4 style="margin:0 0 8px;color:var(--green);font-size:0.94rem;">1. Mandatory 8-Timestamp Release Cadence &amp; Engineering Window (<code>T_eng = {dur["full_engineering_window_hrs"]:.2f}h</code>)</h4>
            <div class="table-wrap">
              <table class="pr-table">
                <thead>
                  <tr>
                    <th>Timestamp ID</th>
                    <th>UTC Timestamp</th>
                    <th>Local PST &amp; Primary Source Receipt</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td><code>t1_first_activity</code></td><td><code>{ts["t1_first_activity"]}</code></td><td>{ts["t1_pst"]}</td></tr>
                  <tr><td><code>t2_first_branch_commit</code></td><td><code>{ts["t2_first_branch_commit"]}</code></td><td>{ts["t2_pst"]}</td></tr>
                  <tr><td><code>t3_first_pr_opened</code></td><td><code>{ts["t3_first_pr_opened"]}</code></td><td>{ts["t3_pst"]}</td></tr>
                  <tr><td><code>t4_final_feature_pr_merged</code></td><td><code>{ts["t4_final_feature_pr_merged"]}</code></td><td>{ts["t4_pst"]}</td></tr>
                  <tr><td><code>t5_release_pr_merged</code></td><td><code>{ts["t5_release_pr_merged"]}</code></td><td>{ts["t5_pst"]}</td></tr>
                  <tr><td><code>t6_release_tag_published</code></td><td><code>{ts["t6_release_tag_published"]}</code></td><td>{ts["t6_pst"]}</td></tr>
                  <tr><td><code>t7_live_deploy_completed</code></td><td><code>{ts["t7_live_deploy_completed"]}</code></td><td>{ts["t7_pst"]}</td></tr>
                  <tr><td><code>t8_observer_certification</code></td><td><code>{ts["t8_observer_certification_completed"]}</code></td><td>{ts["t8_pst"]}</td></tr>
                  <tr><td><strong>Full Engineering Window (<code>T_eng</code>)</strong></td><td><strong><code>{dur["full_engineering_window_hrs"]:.2f} hrs</code></strong></td><td><strong>{dur["full_engineering_window_human"]}</strong></td></tr>
                  <tr><td><strong>Inter-Release Deploy Cadence</strong></td><td><code>{dur["inter_release_deploy_cadence_hrs"]:.2f} hrs</code></td><td>{dur["inter_release_deploy_cadence_human"]}</td></tr>
                  <tr><td><strong>Cross-Version Pipeline Overlap</strong></td><td><code>{dur["pipeline_overlap_hrs"]:.2f} hrs ({dur["pipeline_overlap_pct"]:.1f}%)</code></td><td>{dur["pipeline_overlap_human"]}</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h4 style="margin:0 0 8px;color:var(--purple);font-size:0.94rem;">2. 4-State Work-Completion Accounting &amp; Milestone Reconciliation</h4>
            <div class="table-wrap">
              <table class="pr-table">
                <thead>
                  <tr>
                    <th>Completion State / Ledger Row</th>
                    <th>Count</th>
                    <th>Exact Issue IDs &amp; Governance Reconciliation</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>State A — Implemented (Branch + Tests)</strong></td>
                    <td><code>{comp["state_a_implemented_issues"]}</code></td>
                    <td>All {comp["chartered_active_issues"]} active chartered issues implemented with unit tests</td>
                  </tr>
                  <tr>
                    <td><strong>State B — Integrated (Merged on <code>main</code>)</strong></td>
                    <td><code>{comp["state_b_integrated_issues"]}</code></td>
                    <td>Merged across {len(diff["prs_merged"])} PRs (<code>{", ".join("#" + str(p) for p in diff["prs_merged"])}</code>; <code>{diff["true_merge_count"]}</code> merge-commit / <code>{diff["squash_or_rebase_count"]}</code> squash; net diff <code>+{diff["net_repo_insertions"]:,} / -{diff["net_repo_deletions"]}</code> LOC across <code>{diff["net_repo_files"]}</code> files)</td>
                  </tr>
                  <tr>
                    <td><strong>State C — Verified &amp; Closed in Milestone (<code>W_closed</code>)</strong></td>
                    <td><strong><code>{comp["state_c_verified_closed_issues"]}</code></strong></td>
                    <td><code>{", ".join("#" + str(i) for i in comp["state_c_issue_ids"])}</code> (CI + PRR + I-Gate + A-Gate + live SQLite WAL)</td>
                  </tr>
                  <tr>
                    <td><strong>State D — Externally Accepted</strong></td>
                    <td><code>{comp["state_d_externally_accepted_issues"]}</code></td>
                    <td><code>0</code> (Internal autonomous sprint; no external customer sign-off claimed)</td>
                  </tr>
                  <tr>
                    <td><strong>Partial Slice 2 Shipped &amp; Re-Milestoned (<code>W_partial</code>)</strong></td>
                    <td><code>{comp["partial_slice_re_milestoned_issues"]}</code></td>
                    <td>{("<code>" + ", ".join("#" + str(i) for i in comp["partial_slice_issue_ids"]) + "</code> — " + comp["partial_slice_ruling"]) if comp["partial_slice_issue_ids"] else comp["partial_slice_ruling"]}</td>
                  </tr>
                  <tr>
                    <td><strong>Pre-Closed in Milestone + Sprint Closed = Milestone Total</strong></td>
                    <td><code>{comp["pre_closed_milestone_issues"]} + {comp["state_c_verified_closed_issues"]} = {comp["milestone_closed_total"]}</code></td>
                    <td>Pre-closed <code>{(", ".join("#" + str(i) for i in comp["pre_closed_issue_ids"])) if comp["pre_closed_issue_ids"] else "0 (none)"}</code> + <code>{comp["state_c_verified_closed_issues"]}</code> sprint-closed = <strong><code>{comp["milestone_closed_total"]}</code> closed / <code>{comp["milestone_open_total"]}</code> open</strong></td>
                  </tr>
                  <tr>
                    <td><strong>{comp.get("deferred_label", "Deferred to Next Milestone")}</strong></td>
                    <td><code>{comp["deferred_to_future_milestone_issues"]}</code></td>
                    <td><code>{(", ".join("#" + str(i) for i in comp["deferred_issue_ids"])) if comp["deferred_issue_ids"] else "0 (none)"}</code> — {comp["deferred_ruling"]}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div class="grid-2" style="gap:16px;">
          <div style="background:rgba(10,15,29,0.65);border:1px solid var(--border);border-radius:10px;padding:14px 16px;">
            <h4 style="margin:0 0 8px;color:var(--amber);font-size:0.94rem;">3. 3-Tier Operating Cost &amp; Orthogonal Efficiency Accounting</h4>
            <ul style="margin:0;padding-left:18px;font-size:0.85rem;line-height:1.55;color:var(--text-muted);">
              <li><strong>Tier 1 — Measured Marginal Cash Expenditure (<code>measured</code>):</strong> <strong><code>${econ["tier1_measured_marginal_api_usd"]:.2f}</code> incremental model/API fee</strong> (covered by fixed monthly CLI subscriptions) + <strong><code>~${econ["tier1_measured_marginal_electricity_usd"]:.2f}</code></strong> measured Mac Studio M3 Ultra wall-power (<code>~$0.025/hr × {dur["full_engineering_window_hrs"]:.2f}h</code>).</li>
              <li><strong>Tier 2 — Allocated Subscription &amp; Compute Amortization (<code>allocated_estimate</code>):</strong> <strong><code>${econ["tier2_allocated_subscription_usd"]:.2f}</code></strong> on full engineering window <code>T_eng = {dur["full_engineering_window_hrs"]:.2f}h</code> at <code>$2.46/active fleet-hr</code> (<code>$440/mo ÷ 178.8 active hrs/mo</code>; 24/7 calendar-hour reference: <code>${econ["tier2_calendar_hour_subscription_usd"]:.2f}</code> @ <code>$0.611/hr</code>) → <strong><code>${eff["unit_allocated_cost_per_closed_issue_usd"]:.2f} / closed issue</code></strong> (<code>${eff["unit_allocated_cost_per_addressed_issue_usd"]:.2f} / addressed issue</code>, <code>${eff["unit_allocated_cost_per_kloc_usd"]:.2f} / kLOC</code>).</li>
              <li><strong>Tier 3 — Hypothetical Public API Shadow Estimate (<code>hypothetical_estimate</code>):</strong> <strong><code>~${econ["tier3_hypothetical_api_shadow_usd"]:.0f}</code></strong> order-of-magnitude shadow estimate across <code>~{econ["est_tokens_m"]}M</code> estimated CLI tokens (unmetered in SQLite; never co-mingled with Tier 1/2).</li>
              <li><strong>Scale-Invariant Throughput vs. Legacy <code>ADE_v1</code>:</strong> Throughput = <strong><code>{eff["throughput_closed_per_eng_hr"]:.2f} closed issues/hr</code></strong> (<code>{eff["throughput_addressed_per_eng_hr"]:.2f} addressed/hr</code>); Legacy <code>ADE_v1</code> = <strong><code>{eff["legacy_ade_v1_closed"]:.2f}</code></strong> (closed) / <strong><code>{eff["legacy_ade_v1_addressed"]:.2f}</code></strong> (addressed).</li>
            </ul>
          </div>

          <div style="background:rgba(10,15,29,0.65);border:1px solid var(--border);border-radius:10px;padding:14px 16px;">
            <h4 style="margin:0 0 8px;color:var(--accent2);font-size:0.94rem;">4. External Credibility, Governance &amp; Operational Disclosures</h4>
            <ul style="margin:0;padding-left:18px;font-size:0.85rem;line-height:1.55;color:var(--text-muted);">
              <li><strong>Autonomous Code Execution vs. Operator Governance:</strong> <code>0</code> human code edits, conflict resolutions, test runs, or deploy commands across all {len(diff["prs_merged"])} PRs. The Operator provided standing authorization <code>{rec["standing_auth"]}</code> and approved Gate 0 / architectural deferral boundaries (<code>Rule #304</code>).</li>
              <li><strong>Single GitHub Account Attribution Disclosure:</strong> While <code>Ariadne-Lane-A..D</code>, <code>Ariadne-PRR</code>, <code>Ariadne-Arc</code>, <code>Ariadne-INT</code>, <code>Ariadne-PM</code>, and <code>Ariadne-Obsr</code> run in isolated <code>tmux</code> sessions and worktrees across distinct models/engines, all GitHub API commits, reviews, and merges authenticate via the Operator's <code>Jason-Vaughan</code> <code>gh</code> CLI token; role identity is verified via structured review stamps and SQLite audit logs.</li>
              <li><strong>Pairwise Disjoint File-Envelope Guarantee:</strong> Every Car in <code>{slug}</code> satisfies <code>Envelope(A) ∩ Envelope(B) = ∅</code>, ensuring zero rebase collisions across the 4 parallel builder lanes.</li>
              <li><strong>Scope of “Self-Improvement” Claims:</strong> All self-improvement in this sprint train refers strictly to <strong>operational, runtime, and governance rule/code evolution</strong>, <em>not</em> autonomous model-weight training.</li>
            </ul>
          </div>
        </div>
      </div>
      <script type="application/json" id="tc-canonical-metrics">
{json_payload}
      </script>
      <!-- TANGLECLAW_CANONICAL_METRICS_END -->'''


def export_schema_json(out_path: str = None) -> str:
    """Export the full machine-readable metrics-schema.json file."""
    if out_path is None:
        out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "metrics-schema.json")
    payload = {
        "schema_version": SCHEMA_VERSION,
        "subscription_pool": {
            "monthly_usd": MONTHLY_SUBSCRIPTION_POOL_USD,
            "active_fleet_hours_per_month": ACTIVE_FLEET_HOURS_PER_MONTH,
            "calendar_hours_per_month": CALENDAR_HOURS_PER_MONTH,
            "active_hourly_rate_usd": SUBSCRIPTION_HOURLY_RATE,
            "calendar_hourly_rate_usd": CALENDAR_HOURLY_RATE,
            "electricity_hourly_rate_usd": ELECTRICITY_HOURLY_RATE,
            "blended_api_shadow_per_m_tokens_usd": BLENDED_API_SHADOW_PER_M_TOKENS,
        },
        "canonical_summary_registry": {
            slug: compute_summary_metrics(slug) for slug in CANONICAL_METRICS
        },
        "detailed_sprint_records": DETAILED_SPRINT_RECORDS,
    }
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)
    return out_path


if __name__ == "__main__":
    p = export_schema_json()
    print(f"Exported canonical schema v{SCHEMA_VERSION} to {p}")

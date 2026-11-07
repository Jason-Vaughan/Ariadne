#!/usr/bin/env python3
"""
Unit test suite for Ariadne Sprint Report Validator (SPRINT_REPORT_CONTRACT v2.0.0).

Verifies that `validate-sprint-report.py` passes all canonical reports and deterministically
rejects every failure mode:
1. Duplicate / conflicting `id="ade-efficiency-card"` banners.
2. PR count mismatch (`true_merge_count != len(prs_merged)`).
3. Issue IDs (`#1, #14`) erroneously transcribed into the PR list (`diff.prs_merged`).
4. Unreconciled issue / GitHub Milestone closure totals.
5. Claiming multi-slice re-milestoned issues as closed without reconciliation.
6. Substituting a pipelined merge/deploy tail (`0.40h`) for `full_engineering_window_hrs` (`1.20h`).
7. Partial PR LOC summation mismatch (`feature_pr_insertions != sum(per_pr)`).
8. Unreceipted `State D — Externally Accepted` claims (`state_d_externally_accepted_issues > 0` without receipt).
9. Divergence between rendered `#ade-efficiency-card` HTML text and `#tc-canonical-metrics` JSON.
10. Timestamp chronology violations (`t1..t8`).
"""

import copy
import importlib.util
import json
import os
import pathlib
import re
import sys
import unittest

REPORTS_DIR = os.path.dirname(os.path.abspath(__file__))
if REPORTS_DIR not in sys.path:
    sys.path.insert(0, REPORTS_DIR)

spec = importlib.util.spec_from_file_location(
    "validate_sprint_report",
    os.path.join(REPORTS_DIR, "validate-sprint-report.py"),
)
validator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(validator)


def replace_embedded_json(html: str, new_rec: dict) -> str:
    payload = json.dumps(new_rec, indent=2)
    return re.sub(
        r'(<script[^>]+type="application/json"[^>]+id="tc-canonical-metrics"[^>]*>)(.*?)(</script>)',
        lambda m: f"{m.group(1)}\n{payload}\n      {m.group(3)}",
        html,
        flags=re.S,
    )


class TestValidateSprintReport(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.v010_path = os.path.join(REPORTS_DIR, "v0.1.0", "index.html")
        cls.v010_html = pathlib.Path(cls.v010_path).read_text(encoding="utf-8")
        cls.v010_json = validator.extract_embedded_json(cls.v010_path)

    def test_01_canonical_v010_and_hub_pass(self):
        self.assertEqual(validator.validate_report(self.v010_path, "v0.1.0"), [])
        self.assertEqual(validator.validate_train_consistency(REPORTS_DIR), [])
        self.assertEqual(validator.validate_hub_index(REPORTS_DIR), [])

    def test_02_rejects_duplicate_ade_efficiency_card_banner(self):
        dup_html = self.v010_html.replace(
            "<!-- TANGLECLAW_ADE_BANNER_END -->",
            '<!-- TANGLECLAW_ADE_BANNER_END -->\n<div class="card" id="ade-efficiency-card">Conflicting ADE = 3.12 vs 1.13</div>',
        )
        errs = validator.validate_report_content(dup_html, "v0.1.0", enforce_registry_match=False)
        self.assertTrue(any('duplicate id="ade-efficiency-card"' in e for e in errs), f"Expected duplicate ADE error, got {errs}")

    def test_03_rejects_pr_count_mismatch(self):
        bad = copy.deepcopy(self.v010_json)
        bad["diff"]["true_merge_count"] = 0
        bad["diff"]["squash_or_rebase_count"] = len(bad["diff"]["prs_merged"]) - 1
        mut_html = replace_embedded_json(self.v010_html, bad)
        errs = validator.validate_report_content(mut_html, "v0.1.0", enforce_registry_match=False)
        self.assertTrue(any("PR count mismatch" in e for e in errs), f"Expected PR count mismatch error, got {errs}")

    def test_04_rejects_issue_ids_in_pr_list(self):
        bad = copy.deepcopy(self.v010_json)
        # Replace first PR with issue ID #1
        bad["diff"]["prs_merged"] = [1] + bad["diff"]["prs_merged"][1:]
        bad["diff"]["feature_prs"] = [1] + bad["diff"]["feature_prs"][1:]
        mut_html = replace_embedded_json(self.v010_html, bad)
        errs = validator.validate_report_content(mut_html, "v0.1.0", enforce_registry_match=False)
        self.assertTrue(any("Issue ID(s) [1] erroneously listed inside diff.prs_merged" in e for e in errs), f"Got {errs}")

    def test_05_rejects_inflated_closed_issue_count(self):
        bad = copy.deepcopy(self.v010_json)
        bad["completion"]["state_c_verified_closed_issues"] = 6  # Inflated from 4 to 6
        mut_html = replace_embedded_json(self.v010_html, bad)
        errs = validator.validate_report_content(mut_html, "v0.1.0", enforce_registry_match=False)
        self.assertTrue(
            any("state_c_verified_closed_issues" in e for e in errs),
            f"Expected unreconciled closed issue count error, got {errs}",
        )

    def test_06_rejects_partial_slice_claimed_as_closed_without_reconciliation(self):
        bad = copy.deepcopy(self.v010_json)
        bad["completion"]["partial_slice_re_milestoned_issues"] = 2
        bad["completion"]["partial_slice_issue_ids"] = [2, 3]
        mut_html = replace_embedded_json(self.v010_html, bad)
        errs = validator.validate_report_content(mut_html, "v0.1.0", enforce_registry_match=False)
        self.assertTrue(
            any("Unreconciled active issue count" in e or "Unreconciled chartered issue count" in e for e in errs),
            f"Expected milestone/slice reconciliation error, got {errs}",
        )

    def test_07_rejects_pipelined_tail_substituted_for_full_engineering_window(self):
        bad = copy.deepcopy(self.v010_json)
        bad["durations"]["full_engineering_window_hrs"] = 0.40
        mut_html = replace_embedded_json(self.v010_html, bad)
        errs = validator.validate_report_content(mut_html, "v0.1.0", enforce_registry_match=False)
        self.assertTrue(
            any("Substituting a pipelined merge/deploy tail for the full engineering window is prohibited" in e for e in errs),
            f"Expected pipelined tail substitution error, got {errs}",
        )

    def test_08_rejects_partial_loc_summation_error(self):
        bad = copy.deepcopy(self.v010_json)
        bad["diff"]["feature_pr_insertions"] = 770  # Partial 2-of-4 PR sum vs 1420 net
        mut_html = replace_embedded_json(self.v010_html, bad)
        errs = validator.validate_report_content(mut_html, "v0.1.0", enforce_registry_match=False)
        self.assertTrue(any("LOC accounting mismatch" in e for e in errs), f"Expected LOC mismatch error, got {errs}")

    def test_09_rejects_unreceipted_state_d_external_acceptance(self):
        bad = copy.deepcopy(self.v010_json)
        bad["completion"]["state_d_externally_accepted_issues"] = 4
        mut_html = replace_embedded_json(self.v010_html, bad)
        errs = validator.validate_report_content(mut_html, "v0.1.0", enforce_registry_match=False)
        self.assertTrue(any("state_d_externally_accepted_issues" in e for e in errs), f"Expected State D error, got {errs}")

    def test_10_rejects_html_banner_vs_json_divergence_and_chronology_violation(self):
        bad = copy.deepcopy(self.v010_json)
        bad["timestamps"]["t2_first_branch_commit"] = "2026-11-07T20:30:00Z"  # After t3..t8
        ade_str = f"{self.v010_json['efficiency']['legacy_ade_v1_closed']:.2f}"
        mut_html = (
            replace_embedded_json(self.v010_html, bad)
            .replace(f"Legacy ADE_v1 = {ade_str}", "Legacy ADE_v1 = 9.99")
            .replace(f"<strong>{ade_str}</strong>", "<strong>9.99</strong>")
        )
        errs = validator.validate_report_content(mut_html, "v0.1.0", enforce_registry_match=False)
        self.assertTrue(any("Timestamp chronology violation" in e for e in errs), f"Expected chronology error, got {errs}")
        self.assertTrue(any("Rendered #ade-efficiency-card banner text does not match canonical JSON" in e for e in errs), f"Expected banner/JSON mismatch error, got {errs}")

    def test_11_rejects_t1_to_t7_substituted_for_t2_to_t7_and_overlap_mismatch(self):
        v020_path = os.path.join(REPORTS_DIR, "v0.2.0", "index.html")
        v020_html = pathlib.Path(v020_path).read_text(encoding="utf-8")
        v020_json = validator.extract_embedded_json(v020_path)
        self.assertEqual(validator.validate_report(v020_path, "v0.2.0"), [])

        bad = copy.deepcopy(v020_json)
        # Substitute t1->t7 (0.56h) and t1->prev_t7 overlap (0.18h) instead of contract t2->t7 (0.40h) and 47s (0.01h)
        bad["durations"]["full_engineering_window_hrs"] = 0.56
        bad["durations"]["pipeline_overlap_hrs"] = 0.18
        bad["durations"]["pipeline_overlap_pct"] = 32.1
        mut_html = replace_embedded_json(v020_html, bad)
        errs = validator.validate_report_content(mut_html, "v0.2.0", enforce_registry_match=False)
        self.assertTrue(
            any("contract T_eng = (t7 - t2)" in e for e in errs),
            f"Expected contract T_eng = (t7 - t2) error, got {errs}",
        )
        self.assertTrue(
            any("pipeline_overlap_hrs" in e for e in errs),
            f"Expected pipeline_overlap_hrs error, got {errs}",
        )

    def test_12_rejects_early_rounded_t_eng_derived_metrics(self):
        v020_path = os.path.join(REPORTS_DIR, "v0.2.0", "index.html")
        v020_html = pathlib.Path(v020_path).read_text(encoding="utf-8")
        v020_json = validator.extract_embedded_json(v020_path)

        bad_v020 = copy.deepcopy(v020_json)
        # Mutate v0.2.0 back to early-rounded 0.40h figures (10.00/hr, $0.25/issue, ADE 10.20) instead of exact 1427s
        bad_v020["efficiency"]["throughput_closed_per_eng_hr"] = 10.00
        bad_v020["efficiency"]["unit_allocated_cost_per_closed_issue_usd"] = 0.25
        bad_v020["efficiency"]["legacy_ade_v1_closed"] = 10.20
        mut_v020 = replace_embedded_json(v020_html, bad_v020)
        errs_v020 = validator.validate_report_content(mut_v020, "v0.2.0", enforce_registry_match=False)
        self.assertTrue(
            any("throughput_closed_per_eng_hr (10.00) != round(state_c / T_eng_exact, 2) (10.09)" in e for e in errs_v020),
            f"Expected exact-second throughput rejection on v0.2.0, got {errs_v020}",
        )
        self.assertTrue(
            any("legacy_ade_v1_closed (10.20) != round(state_c / (T_eng_exact * C_alloc_exact), 2) (10.35)" in e for e in errs_v020),
            f"Expected exact-second ADE rejection on v0.2.0, got {errs_v020}",
        )

        # Mutate v0.1.0 back to early-rounded 0.66h figures (6.06/hr, $1.62 pool, ADE 3.74) instead of exact 2385s
        bad_v010 = copy.deepcopy(self.v010_json)
        bad_v010["economics"]["tier2_allocated_subscription_usd"] = 1.62
        bad_v010["efficiency"]["throughput_closed_per_eng_hr"] = 6.06
        bad_v010["efficiency"]["legacy_ade_v1_closed"] = 3.74
        mut_v010 = replace_embedded_json(self.v010_html, bad_v010)
        errs_v010 = validator.validate_report_content(mut_v010, "v0.1.0", enforce_registry_match=False)
        self.assertTrue(
            any("throughput_closed_per_eng_hr (6.06) != round(state_c / T_eng_exact, 2) (6.04)" in e for e in errs_v010),
            f"Expected exact-second throughput rejection on v0.1.0, got {errs_v010}",
        )
        self.assertTrue(
            any("legacy_ade_v1_closed (3.74) != round(state_c / (T_eng_exact * C_alloc_exact), 2) (3.70)" in e for e in errs_v010),
            f"Expected exact-second ADE rejection on v0.1.0, got {errs_v010}",
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)

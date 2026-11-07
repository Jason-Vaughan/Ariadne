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
        bad["diff"]["true_merge_count"] = len(bad["diff"]["prs_merged"]) - 1
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


if __name__ == "__main__":
    unittest.main(verbosity=2)

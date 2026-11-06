#!/usr/bin/env python3
"""
Ariadne Canonical Sprint Report Generator & Publisher Helper
============================================================
Usage:
  # 1. Scaffold a new report from the latest canonical template (v0.1.0):
  python3 sprint-reports/scripts/generate-sprint-report.py --scaffold v0.2.0 --from-version v0.1.0

  # 2. Run a version generator script, validate against SPRINT_REPORT_CONTRACT.md, and mirror to .tangleclaw/plans/:
  python3 sprint-reports/scripts/generate-sprint-report.py --run sprint-reports/generators/gen_v010.py --version v0.1.0

  # 3. Validate all existing reports and the hub index:
  python3 sprint-reports/scripts/generate-sprint-report.py --validate-all
"""

import argparse
import os
import pathlib
import shutil
import subprocess
import sys

REPORTS_DIR = pathlib.Path("/Users/jasonvaughan/Documents/Projects/Ariadne-PM/sprint-reports")
VALIDATOR = REPORTS_DIR / "validate-sprint-report.py"
PM_PLANS_DIR = pathlib.Path("/Users/jasonvaughan/Documents/Projects/Ariadne-PM/.tangleclaw/plans")


def run_validator(args_list: list[str]) -> int:
    cmd = [sys.executable, str(VALIDATOR)] + args_list
    res = subprocess.run(cmd)
    return res.returncode


def scaffold_version(new_ver: str, from_ver: str):
    if not new_ver.startswith("v"):
        new_ver = f"v{new_ver}"
    if not from_ver.startswith("v"):
        from_ver = f"v{from_ver}"

    src_html = REPORTS_DIR / from_ver / "index.html"
    if not src_html.is_file():
        print(f"ERROR: Source template {src_html} does not exist.", file=sys.stderr)
        sys.exit(1)

    dst_dir = REPORTS_DIR / new_ver
    dst_dir.mkdir(parents=True, exist_ok=True)
    dst_html = dst_dir / "index.html"

    content = src_html.read_text(encoding="utf-8")
    content = content.replace(from_ver, new_ver).replace(from_ver.lstrip("v"), new_ver.lstrip("v"))
    dst_html.write_text(content, encoding="utf-8")
    print(f"Scaffolded {dst_html} from {src_html}")


def mirror_to_plans(ver: str):
    if not ver.startswith("v"):
        ver = f"v{ver}"
    src_html = REPORTS_DIR / ver / "index.html"
    if not src_html.is_file():
        print(f"ERROR: {src_html} not found to mirror.", file=sys.stderr)
        sys.exit(1)

    slug = ver.replace(".", "")
    if PM_PLANS_DIR.is_dir():
        pm_dst = PM_PLANS_DIR / f"{slug}-sprint-report.html"
        shutil.copy2(src_html, pm_dst)
        print(f"Mirrored to {pm_dst}")


def main():
    parser = argparse.ArgumentParser(description="Generate, validate, and mirror canonical Ariadne sprint reports.")
    parser.add_argument("--scaffold", help="Scaffold a new version directory (e.g. v0.2.0) from --from-version.")
    parser.add_argument("--from-version", default="v0.1.0", help="Template version to copy CSS/JS shell from.")
    parser.add_argument("--run", help="Run a Python generator script (e.g. generators/gen_v010.py).")
    parser.add_argument("--version", help="Version to validate and mirror after --run (e.g. v0.1.0).")
    parser.add_argument("--validate-all", action="store_true", help="Run validate-sprint-report.py --all.")
    args = parser.parse_args()

    if args.scaffold:
        scaffold_version(args.scaffold, args.from_version)
        rc = run_validator(["--version", args.scaffold])
        sys.exit(rc)

    if args.run:
        gen_path = pathlib.Path(args.run).resolve()
        if not gen_path.is_file():
            print(f"ERROR: Generator script not found: {gen_path}", file=sys.stderr)
            sys.exit(1)
        print(f"Running generator: {gen_path}")
        res = subprocess.run([sys.executable, str(gen_path)])
        if res.returncode != 0:
            sys.exit(res.returncode)

        if args.version:
            rc = run_validator(["--version", args.version])
            if rc != 0:
                sys.exit(rc)
            mirror_to_plans(args.version)
        sys.exit(0)

    if args.validate_all:
        sys.exit(run_validator(["--all"]))

    parser.print_help()


if __name__ == "__main__":
    main()

"""
Ariadne Testament Test Suite Runner & Architecture Contract Verification.

Invoked via `/Users/jasonvaughan/.local/bin/testament run --json`.
Executes:
1. Canonical architectural, privacy, and roadmap contract checks.
2. All `tests/*.test.ts` and `tests/*.test.js` suites via `node --test`.
3. Workspace package test suites (`packages/shared`, `packages/server`, `packages/client`)
   whenever `package.json` and package suites are present.
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent
TESTS_DIR = REPO_ROOT / "tests"


def _discover_node_test_files() -> list[str]:
    """Return relative paths of all tests/*.test.ts and tests/*.test.js files."""
    if not TESTS_DIR.is_dir():
        return []
    found = sorted(
        p.relative_to(REPO_ROOT).as_posix()
        for p in list(TESTS_DIR.glob("*.test.ts")) + list(TESTS_DIR.glob("*.test.js"))
    )
    return found or ["__none__"]


def test_canonical_contracts_present() -> None:
    """Verify core Ariadne specification and governance contracts exist and are non-empty."""
    required_files = [
        "ARCHITECTURE.md",
        "DATA_AND_EVENTS_CONTRACT.md",
        "PRIVACY_AND_SECURITY.md",
        "VISUALIZER_SPEC.md",
        "FLEET_CHARTER.md",
        "LANE_QUEUE.md",
        ".testament.toml",
        ".prawduct/project-state.yaml",
    ]
    for rel_path in required_files:
        target = REPO_ROOT / rel_path
        assert target.is_file(), f"Missing canonical contract file: {rel_path}"
        assert target.stat().st_size > 0, f"Empty canonical contract file: {rel_path}"


def test_optional_website_contract_in_onboarding_and_crawler() -> None:
    """Verify A-002 and A-003 specs include the optional public website/portfolio URL contract."""
    a002 = (REPO_ROOT / "ISSUE_BACKLOG" / "A-002.md").read_text(encoding="utf-8")
    a003 = (REPO_ROOT / "ISSUE_BACKLOG" / "A-003.md").read_text(encoding="utf-8")
    assert "website_url" in a002, "A-002 must specify optional website_url field"
    assert "website_url" in a003, "A-003 must specify parallel public website crawler"


def test_public_roadmap_and_watermark_assets() -> None:
    """Verify public roadmap HTML and static TangleClaw watermark asset exist."""
    roadmap_html = REPO_ROOT / "roadmap-board" / "index.html"
    watermark_png = REPO_ROOT / "roadmap-board" / "tangleclaw-logo.png"
    assert roadmap_html.is_file(), "Missing roadmap-board/index.html"
    assert watermark_png.is_file(), "Missing roadmap-board/tangleclaw-logo.png"
    content = roadmap_html.read_text(encoding="utf-8")
    assert "tc-bg-watermark" in content, "roadmap-board/index.html must include fixed tc-bg-watermark"


@pytest.mark.parametrize("rel_test_file", _discover_node_test_files())
def test_node_typescript_suite(rel_test_file: str) -> None:
    """Execute each tests/*.test.ts or tests/*.test.js suite via node --test under Testament."""
    if rel_test_file == "__none__":
        pytest.skip("No tests/*.test.ts files merged on current branch yet")

    result = subprocess.run(
        ["node", "--test", rel_test_file],
        cwd=str(REPO_ROOT),
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert result.returncode == 0, (
        f"node --test {rel_test_file} failed (exit {result.returncode}):\n"
        f"STDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}"
    )


@pytest.mark.parametrize("pkg_name", ["shared", "server", "client"])
def test_workspace_package_suite(pkg_name: str) -> None:
    """Run npm test for each workspace package if present."""
    pkg_dir = REPO_ROOT / "packages" / pkg_name
    pkg_json = pkg_dir / "package.json"
    if not pkg_json.is_file():
        pytest.skip(f"packages/{pkg_name}/package.json not used in flat src/ layout")

    data = json.loads(pkg_json.read_text(encoding="utf-8"))
    scripts = data.get("scripts") or {}
    if "test" not in scripts:
        pytest.skip(f"packages/{pkg_name} has no test script")

    result = subprocess.run(
        ["npm", "test", "--workspace", f"@ariadne/{pkg_name}", "--if-present"],
        cwd=str(REPO_ROOT),
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert result.returncode == 0, (
        f"@ariadne/{pkg_name} test suite failed (exit {result.returncode}):\n"
        f"STDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}"
    )

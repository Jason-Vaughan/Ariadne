#!/usr/bin/env python3
"""
Enrich all Ariadne Sprint Reports and Hub Index with:
1. Open Graph / Twitter Card social link-preview metadata & logo favicons
2. Canonical v2.0.0 Autonomous Delivery Efficiency (ADE) KPI card & formula banner
   imported from `sprint-reports/metrics_schema.py` (Single Source of Truth)
3. Canonical 8-Timestamp Release Cadence, 4-State Work-Completion Accounting,
   3-Tier Cost Taxonomy, and External Credibility & Disclosure cards.
"""
import glob
import html
import os
import pathlib
import re
import subprocess
import sys

REPORTS_DIR = "/Users/jasonvaughan/Documents/Projects/Ariadne-PM/sprint-reports"
if REPORTS_DIR not in sys.path:
    sys.path.insert(0, REPORTS_DIR)

from metrics_schema import (
    CANONICAL_METRICS,
    DETAILED_SPRINT_RECORDS,
    export_schema_json,
    render_ade_kpi_and_banner,
    render_canonical_governance_and_metrics_cards,
)

SITE_BASE = "https://jason-vaughan.github.io/Ariadne/reports"
OG_IMAGE_URL = f"{SITE_BASE}/assets/og-card.png"
FAVICON_URL = f"{SITE_BASE}/assets/logo-icon.png"
APPLE_ICON_URL = f"{SITE_BASE}/assets/apple-touch-icon.png"


def build_og_block(title: str, desc: str, url: str) -> str:
    t = html.escape(title, quote=True)
    d = html.escape(desc, quote=True)
    u = html.escape(url, quote=True)
    return f"""  <!-- TANGLECLAW_OG_META_START -->
  <meta name="description" content="{d}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Ariadne Autonomous Sprint Reports (Powered by TangleClaw)" />
  <meta property="og:title" content="{t}" />
  <meta property="og:description" content="{d}" />
  <meta property="og:url" content="{u}" />
  <meta property="og:image" content="{OG_IMAGE_URL}" />
  <meta property="og:image:type" content="image/png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="{t}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="{t}" />
  <meta name="twitter:description" content="{d}" />
  <meta name="twitter:image" content="{OG_IMAGE_URL}" />
  <link rel="icon" type="image/png" href="{FAVICON_URL}" />
  <link rel="apple-touch-icon" href="{APPLE_ICON_URL}" />
  <!-- TANGLECLAW_OG_META_END -->"""


def inject_og(content: str, title: str, desc: str, url: str) -> str:
    block = build_og_block(title, desc, url)
    if "<!-- TANGLECLAW_OG_META_START -->" in content:
        return re.sub(
            r"\s*<!-- TANGLECLAW_OG_META_START -->.*?<!-- TANGLECLAW_OG_META_END -->",
            lambda m: "\n" + block,
            content,
            flags=re.S,
        )
    return re.sub(
        r"(<title>.*?</title>)",
        lambda m: m.group(1) + "\n" + block,
        content,
        count=1,
        flags=re.S,
    )


def enrich_report(path: str, slug: str):
    content = pathlib.Path(path).read_text(encoding="utf-8")

    title_m = re.search(r"<title>(.*?)</title>", content, re.S)
    raw_title = html.unescape(title_m.group(1).strip()) if title_m else f"Ariadne Sprint {slug} — Executive Engineering Report"

    sub_m = re.search(r'<p class="hero-sub"[^>]*>(.*?)</p>', content, re.S)
    if sub_m:
        raw_desc = re.sub(r"<[^>]+>", " ", sub_m.group(1))
        raw_desc = re.sub(r"\s+", " ", html.unescape(raw_desc)).strip()[:240]
    else:
        raw_desc = f"Ariadne Autonomous Sprint {slug}: Architecture, Wave Execution, PR Deliverables, Telemetry & Governance Audit."

    url = f"{SITE_BASE}/{slug}/"
    content = inject_og(content, raw_title, raw_desc, url)

    if slug in CANONICAL_METRICS or slug in DETAILED_SPRINT_RECORDS:
        kpi_card, banner = render_ade_kpi_and_banner(slug)
        if "<!-- TANGLECLAW_ADE_KPI_START -->" in content:
            content = re.sub(
                r"[ \t]*<!-- TANGLECLAW_ADE_KPI_START -->.*?<!-- TANGLECLAW_ADE_KPI_END -->",
                lambda m: kpi_card,
                content,
                flags=re.S,
            )
        if "<!-- TANGLECLAW_ADE_BANNER_START -->" in content:
            content = re.sub(
                r"[ \t]*<!-- TANGLECLAW_ADE_BANNER_START -->.*?<!-- TANGLECLAW_ADE_BANNER_END -->",
                lambda m: banner,
                content,
                flags=re.S,
            )

    if slug in DETAILED_SPRINT_RECORDS:
        canonical_cards = render_canonical_governance_and_metrics_cards(slug)
        if "<!-- TANGLECLAW_CANONICAL_METRICS_START -->" in content:
            content = re.sub(
                r"\s*<!-- TANGLECLAW_CANONICAL_METRICS_START -->.*?<!-- TANGLECLAW_CANONICAL_METRICS_END -->",
                lambda m: canonical_cards,
                content,
                flags=re.S,
            )

    pathlib.Path(path).write_text(content, encoding="utf-8")
    print(f"Enriched {slug}: {path}")


def run_generators():
    generators_dir = os.path.join(REPORTS_DIR, "generators")
    for gen_script in sorted(glob.glob(os.path.join(generators_dir, "gen_*.py"))):
        subprocess.run([sys.executable, gen_script], check=True)


def main():
    export_schema_json()
    run_generators()
    for p in sorted(glob.glob(os.path.join(REPORTS_DIR, "v*", "index.html"))):
        slug = os.path.basename(os.path.dirname(p))
        enrich_report(p, slug)


if __name__ == "__main__":
    main()

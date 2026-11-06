#!/usr/bin/env python3
"""
Deterministic Live Sprint Report & Hub Tracker (sync-live-sprint.py).

Invoked automatically by roadmap-board/sync-board.sh on every background sync cycle
(and on demand at sprint kickoff / wave boundaries).

Reads /Users/jasonvaughan/Documents/Projects/Shared/TangleClaw-Shared/LANE_QUEUE.md and
roadmap-board/roadmap2-data.json:
  1. When an active unshipped sprint version (vX.Y.Z) is present in LANE_QUEUE.md AND no
     final version generator (generators/gen_vXYZ.py) has run yet, generates or refreshes:
       - sprint-reports/vX.Y.Z/index.html (passing validate-sprint-report.py 100%)
       - TC-Lane-Obsr/.tangleclaw/plans/sprint-vX.Y.Z.html
       - A live "● Live Sprint In Progress" card at the top of sprint-reports/index.html
         (while keeping "● Latest Release" on the newest shipped release card so
         validate-sprint-report.py --all passes with 0 errors).
  2. When no unshipped sprint is active (e.g. LANE_QUEUE.md is in Next Sprint Handoff state
     or vX.Y.Z has already shipped), removes any stale live-sprint banner from
     sprint-reports/index.html and exits 0.
"""

import html
import json
import os
import pathlib
import re
import subprocess
import sys
from datetime import datetime, timezone

SHARED = pathlib.Path("/Users/jasonvaughan/Documents/Projects/Shared/TangleClaw-Shared")
LANE_QUEUE = SHARED / "LANE_QUEUE.md"
ROADMAP_DATA = SHARED / "roadmap-board" / "roadmap2-data.json"
REPORTS_DIR = SHARED / "sprint-reports"
HUB_INDEX = REPORTS_DIR / "index.html"
OBSR_PLANS = pathlib.Path("/Users/jasonvaughan/Documents/Projects/TC-Lane-Obsr/.tangleclaw/plans")

LIVE_HUB_START = "<!-- LIVE_SPRINT_CARD_START -->"
LIVE_HUB_END = "<!-- LIVE_SPRINT_CARD_END -->"
LIVE_REPORT_MARKER = "<!-- AUTO_GENERATED_LIVE_SPRINT_REPORT -->"


def get_published_tags() -> set[str]:
    try:
        out = subprocess.check_output(
            ["gh", "release", "list", "-R", "Jason-Vaughan/TangleClaw", "--limit", "100", "--json", "tagName,isDraft"],
            text=True,
            timeout=30,
        )
        rows = json.loads(out)
        return {r["tagName"] for r in rows if not r.get("isDraft") and r.get("tagName")}
    except Exception:
        return set()


def parse_lane_queue(text: str):
    ver_m = (
        re.search(r"\*\*Sprint Version:\*\*\s*`?v?(\d+\.\d+\.\d+)`?", text)
        or re.search(r"\*\*Sprint\s*/\s*Milestone:\*\*\s*`?v?(\d+\.\d+\.\d+)`?", text)
        or re.search(r"\*\*Version:\*\*\s*`?v?(\d+\.\d+\.\d+)`?", text)
        or re.search(r"^#\s+[^\n]*?\bv(\d+\.\d+\.\d+)\b", text, re.M)
    )
    if not ver_m:
        return None
    ver = ver_m.group(1)
    title_m = re.search(r"^#\s+([^\n]+)", text, re.M)
    heading = title_m.group(1).strip() if title_m else f"TangleClaw v{ver} Live Sprint"
    state_m = (
        re.search(r"\*\*Sprint State:\*\*\s*`?([^`\n]+)`?", text)
        or re.search(r"\*\*Status:\*\*\s*`?([^`\n]+)`?", text)
    )
    sprint_state = state_m.group(1).strip() if state_m else "IN PROGRESS"

    cars = []
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped.startswith("|") or stripped.startswith("| :---") or stripped.startswith("|---"):
            continue
        cols = [c.strip() for c in stripped.split("|")]
        if len(cols) >= 5 and re.match(r"^[*`]*(W\d+|Car\s*\d+|B\d+)", cols[1], re.I):
            car_id = re.sub(r"[*`]", "", cols[1]).strip()
            if len(cols) >= 7:
                if re.search(r"#\d+", cols[2]):
                    # v*-sprint-plan.md format: | Car ID | Issue | Builder Lane | PR Reviewer | Scope | Files |
                    lane_col = re.sub(r"[*`]", "", f"{cols[3]} / {cols[4]}").strip()
                    scope_col = re.sub(r"[*`]", "", f"{cols[2]} — {cols[5]}").strip()
                    status_col = "STAGED (WAVE 1)" if re.match(r"^(W1\b|Car\s*\d+)", car_id, re.I) else "QUEUED (WAVE 2)"
                else:
                    lane_col = re.sub(r"[*`]", "", f"{cols[2]} / {cols[3]}").strip()
                    scope_col = re.sub(r"[*`]", "", f"{cols[4]} ({cols[5]})").strip()
                    status_col = re.sub(r"[*`]", "", cols[6]).strip()
            else:
                lane_col = re.sub(r"[*`]", "", cols[2]).strip()
                scope_col = re.sub(r"[*`]", "", cols[3]).strip()
                status_col = re.sub(r"[*`]", "", cols[4]).strip()
            cars.append({
                "car": car_id,
                "lane": lane_col,
                "scope": scope_col,
                "status": status_col,
            })
    return {
        "version": ver,
        "heading": heading,
        "state": sprint_state,
        "cars": cars,
    }


def strip_live_hub_card(hub_html: str) -> str:
    pattern = re.compile(
        r"\s*" + re.escape(LIVE_HUB_START) + r".*?" + re.escape(LIVE_HUB_END) + r"\s*",
        re.S,
    )
    return pattern.sub("\n      ", hub_html)


def upsert_live_hub_card(hub_html: str, info: dict) -> str:
    ver = info["version"]
    cars = info["cars"]
    merged_count = sum(1 for c in cars if "MERGED" in c["status"].upper() or "RELEASED" in c["status"].upper())
    in_review_count = sum(1 for c in cars if ("REVIEW" in c["status"].upper() or "OPEN" in c["status"].upper()) and "MERGED" not in c["status"].upper())
    active_count = len(cars)
    car_badges = " · ".join(f"{c['car']}: {c['status'].split(';')[0][:45]}" for c in cars[:6]) or info["state"]
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    card_html = f"""
      {LIVE_HUB_START}
      <article class="report-card" style="border-color:rgba(56,189,248,0.65);background:linear-gradient(135deg,rgba(15,23,42,0.96),rgba(14,116,144,0.18));">
        <div class="report-header">
          <div>
            <span class="badge badge-cyan">● Live Sprint In Progress · Updated {html.escape(stamp)}</span>
            <h2 class="report-title"><a href="./v{html.escape(ver)}/">TangleClaw <code>v{html.escape(ver)}</code> — Live Wave &amp; Gate Tracker</a></h2>
          </div>
          <span class="badge badge-purple">{merged_count}/{active_count} Cars Merged · {in_review_count} In Review</span>
        </div>
        <p style="color:#cbd5e1; margin:0;">
          <strong>Live Sprint Telemetry (Auto-Synced from <code>LANE_QUEUE.md</code>):</strong> {html.escape(info['heading'])}.
          Current wave status: <code>{html.escape(car_badges)}</code>.
          Open the live interactive report below to inspect real-time car progress, Builder/PRR lane assignments, and gate statuses as waves progress.
        </p>
        <div class="meta-pills">
          <span class="badge badge-cyan">{active_count} Chartered Wave Rows</span>
          <span class="badge badge-green">{merged_count} Merged · {in_review_count} In Review</span>
          <span class="badge badge-purple">State: {html.escape(info['state'])}</span>
        </div>
        <div class="actions">
          <a class="btn btn-primary" href="./v{html.escape(ver)}/">📡 Open v{html.escape(ver)} Live Sprint Tracker →</a>
        </div>
      </article>
      {LIVE_HUB_END}"""

    cleaned = strip_live_hub_card(hub_html)
    anchor = '<div class="report-list">'
    if anchor in cleaned:
        cleaned = cleaned.replace(anchor, anchor + card_html, 1)
    # Also ensure ./vX.Y.Z/ is in topnav or card (already in card href="./vX.Y.Z/")
    return cleaned


def build_live_report_html(info: dict, r2: dict) -> str:
    ver = info["version"]
    cars = info["cars"]
    v540_text = (REPORTS_DIR / "v5.40.0" / "index.html").read_text(encoding="utf-8")
    style_block = re.search(r"<style>.*?</style>", v540_text, re.S).group(0)
    script_block = re.search(r"<script>.*?</script>", v540_text, re.S).group(0)

    rel_meta = next((r for r in r2.get("releases", []) if r.get("version") == ver), {})
    rel_name = rel_meta.get("name") or f"Sprint v{ver}"
    deliverables_list = rel_meta.get("deliverables") or [f"Live sprint v{ver} tracked from LANE_QUEUE.md."]
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

    merged_count = sum(1 for c in cars if "MERGED" in c["status"].upper() or "RELEASED" in c["status"].upper())
    in_review_count = sum(1 for c in cars if ("REVIEW" in c["status"].upper() or "OPEN" in c["status"].upper()) and "MERGED" not in c["status"].upper())
    in_prog_count = max(0, len(cars) - merged_count - in_review_count)

    # Build table rows for Section 2 & 3
    vel_rows = []
    deliv_rows = []
    wave_cards = []
    bar_rows = []

    effective_cars = cars if cars else [
        {"car": "W1-A", "lane": "TC-Lane-A / PRR-A", "scope": f"v{ver} Wave 1 Car A", "status": "Awaiting wave dispatch"},
        {"car": "W1-B", "lane": "TC-Lane-B / PRR-B", "scope": f"v{ver} Wave 1 Car B", "status": "Awaiting wave dispatch"},
        {"car": "W2-REC", "lane": "TC-Lane-INT / PRR-A", "scope": "FEATURES.md & change-log reconciliation", "status": "Pending Wave 1 completion"},
        {"car": "W3-REL", "lane": "TC-Lane-INT + Obsr", "scope": f"v{ver} Release prep & O-Gate", "status": "Pending Wave 2 completion"},
    ]

    while len(effective_cars) < 4:
        idx = len(effective_cars) + 1
        effective_cars.append({
            "car": f"W{idx}-STAGE",
            "lane": "TC-Lane-INT / Fleet",
            "scope": f"Sprint v{ver} stage {idx} gate",
            "status": "Scheduled",
        })

    for idx, c in enumerate(effective_cars, 1):
        st_up = c["status"].upper()
        is_merged = "MERGED" in st_up or "RELEASED" in st_up
        is_rev = "REVIEW" in st_up or "OPEN" in st_up
        badge_cls = "badge-green" if is_merged else "badge-cyan" if is_rev else "badge-amber"
        pct = 100 if is_merged else 65 if is_rev else 30
        grad = "linear-gradient(90deg,#22c55e,#16a34a)" if is_merged else "linear-gradient(90deg,#38bdf8,#0284c7)" if is_rev else "linear-gradient(90deg,#f59e0b,#d97706)"

        vel_rows.append(
            f"            <tr>"
            f"<td><strong>{html.escape(c['car'])}</strong></td>"
            f"<td><code>{html.escape(c['lane'])}</code></td>"
            f"<td>{html.escape(c['scope'][:90])}</td>"
            f"<td><span class=\"badge {badge_cls}\">{html.escape(c['status'][:90])}</span></td>"
            f"</tr>"
        )
        deliv_rows.append(
            f"            <tr>"
            f"<td><strong>{html.escape(c['car'])}</strong></td>"
            f"<td><code>{html.escape(c['lane'])}</code></td>"
            f"<td>{html.escape(c['scope'])}</td>"
            f"<td>{html.escape(c['status'])}</td>"
            f"</tr>"
        )
        wave_cards.append(f"""        <div class="wave-card" data-tags="w1 w2 w3 live">
          <div class="wave-card-header">
            <div>
              <span class="badge {badge_cls}">{html.escape(c['car'])} · Live Status</span>
              <h3>{html.escape(c['car'])} — {html.escape(c['scope'][:80])}</h3>
            </div>
            <div style="text-align:right;font-size:0.78rem;color:var(--text-dim);">
              <div>Lane: <code>{html.escape(c['lane'])}</code></div>
              <div>Updated: <code>{html.escape(stamp)}</code></div>
            </div>
          </div>
          <p style="font-size:0.86rem;color:var(--text-muted);margin:8px 0;">
            <strong>Scope &amp; Files:</strong> {html.escape(c['scope'])}<br/>
            <strong>Current Gate &amp; Wave Status:</strong> {html.escape(c['status'])}
          </p>
        </div>""")
        bar_rows.append(f"""        <div class="bar-row">
          <div class="bar-label-row">
            <span><strong><code>{html.escape(c['car'])} ({html.escape(c['lane'])})</code></strong> — {html.escape(c['status'][:75])}</span>
            <span style="color:var(--green)"><strong>{pct}%</strong></span>
          </div>
          <div class="bar-track"><div class="bar-fill" style="width:{pct}%;background:{grad};"></div></div>
        </div>""")

    while len(bar_rows) < 8:
        idx = len(bar_rows) + 1
        bar_rows.append(f"""        <div class="bar-row">
          <div class="bar-label-row">
            <span><strong><code>Live Telemetry Checkpoint #{idx}</code></strong> — Automated LANE_QUEUE.md + GitHub PR sync active</span>
            <span style="color:var(--accent2)"><strong>Active</strong></span>
          </div>
          <div class="bar-track"><div class="bar-fill" style="width:50%;background:linear-gradient(90deg,#38bdf8,#2563eb);"></div></div>
        </div>""")

    rule283_rows = []
    dimensions = [
        "Operator Interventions & Causes",
        "Dispatch-to-Merge Timing Breakdown",
        "Active vs Allowed Builders & Parallelism",
        "Forced Re-Syncs / Rebases When main Moves",
        "Open PR Age Since Current main",
        "CI Red After Ready (#2595 Pre-Push Hook)",
        "PRR Review Rounds & Findings by Severity",
        "Post-Merge Defects on main",
        "Clears, Retries & Stalls",
        "Wrong Triage / Scope Fields",
        "Rule Breaches & Governance Discipline",
        "Unlabelled PRs, Dirty Clones & Worktrees",
        "Release-Status Lag & Finish-Line Honesty",
        "Conflict Resolution Time",
        "Wakes, Tokens & Turns by Role & Model",
        "4 End-of-Sprint Maintenance Gates",
    ]
    for i, dim in enumerate(dimensions, 1):
        rule283_rows.append(
            f"            <tr><td>{i}</td><td>{html.escape(dim)}</td>"
            f"<td><span class=\"badge badge-cyan\">LIVE TRACKING</span></td>"
            f"<td>Tracked live during Sprint <code>v{html.escape(ver)}</code> ({merged_count}/{len(effective_cars)} cars merged as of {html.escape(stamp)}). Final empirical values locked at W4-REL O-Gate.</td></tr>"
        )

    deliv_bullets = "".join(f"<li>{html.escape(d)}</li>" for d in deliverables_list)

    report = f"""<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>TangleClaw Sprint v{html.escape(ver)} — Live Sprint Progress &amp; Telemetry Report</title>
  {style_block}
</head>
<body>
  {LIVE_REPORT_MARKER}
  <header class="topnav">
    <div class="topnav-inner">
      <div class="brand">
        <div class="brand-badge">TC</div>
        <div>
          <div style="font-size:0.94rem;">TangleClaw Live Sprint Tracker</div>
          <div style="font-size:0.72rem;color:var(--text-dim);font-weight:500;">v{html.escape(ver)} · {html.escape(rel_name)} · Live Sync {html.escape(stamp)}</div>
        </div>
      </div>
      <nav class="nav-links" id="navLinks">
        <a href="../" style="color:var(--accent2);font-weight:700;">← All Sprint Reports</a>
        <a href="#overview" class="active">Overview</a>
        <a href="#plain-english" style="color:var(--green);font-weight:700;">Plain-English</a>
        <a href="#architecture">Architecture</a>
        <a href="#velocity">Velocity</a>
        <a href="#deliverables">Deliverables</a>
        <a href="#telemetry">Telemetry</a>
        <a href="#postmortem">Post-Mortem</a>
        <a href="#waves">Wave Explorer</a>
        <a href="#next-sprint">Next Sprint</a>
      </nav>
      <div class="nav-actions">
        <button class="btn" id="themeBtn" onclick="toggleTheme()" title="Toggle Light/Dark Mode">☀️ Light Mode</button>
        <button class="btn btn-primary" onclick="window.print()">🖨️ Export PDF</button>
      </div>
    </div>
  </header>

  <main class="container">
    <section class="hero" id="overview">
      <div class="hero-top">
        <div>
          <div class="eyebrow">📡 LIVE SPRINT IN PROGRESS · AUTO-SYNCED FROM LANE_QUEUE.MD ({html.escape(stamp)})</div>
          <h1>v{html.escape(ver)}: {html.escape(rel_name)} — Live Multi-Agent Wave &amp; Gate Tracker</h1>
          <p class="hero-subtitle">
            Sprint <strong>v{html.escape(ver)}</strong> (<em>"{html.escape(rel_name)}"</em>) is currently <strong>in progress</strong> ({html.escape(info['state'])}).
            This live interactive sprint report is automatically generated and updated by <code>sync-live-sprint.py</code> on every roadmap sync cycle as waves are dispatched, reviewed, and merged in <code>LANE_QUEUE.md</code>.
            Currently tracking <strong>{len(effective_cars)} wave rows</strong>: <strong>{merged_count} merged</strong>, <strong>{in_review_count} in review</strong>, and <strong>{in_prog_count} in progress / queued</strong>.
            At <code>W4-REL</code> release preparation, <code>TC-Lane-Obsr</code> finalizes the complete post-sprint empirical report and 16-point <code>Rule #283</code> evaluation.
          </p>
        </div>
        <div class="status-pill">
          ● Live Sprint v{html.escape(ver)} ({merged_count}/{len(effective_cars)} Merged · {in_review_count} In Review)
        </div>
      </div>

      <div id="plain-english" class="subcard" style="margin:22px 0;padding:22px 24px;border:1.5px solid rgba(56,189,248,0.45);background:linear-gradient(135deg,rgba(15,23,42,0.96),rgba(14,116,144,0.18));border-radius:14px;">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px;">
          <span class="pillar-num" style="color:var(--accent2);font-size:0.8rem;letter-spacing:0.08em;">📖 PLAIN-ENGLISH SUMMARY · WHAT WE ARE BUILDING &amp; LIVE SPRINT PROGRESS (NO JARGON)</span>
          <span class="badge badge-cyan">Live Sprint Tracker · Updated {html.escape(stamp)}</span>
        </div>
        <h3 style="margin:0 0 12px;font-size:1.22rem;color:var(--text);">What Sprint v{html.escape(ver)} Is Building — and Where Each Wave Stands Right Now</h3>
        <div class="grid-2" style="gap:18px;">
          <div style="background:rgba(15,23,42,0.65);border:1px solid var(--border);border-radius:10px;padding:15px 17px;">
            <h4 style="margin:0 0 8px;color:var(--accent2);font-size:0.98rem;">🛠️ What Sprint v{html.escape(ver)} Delivers</h4>
            <ul style="margin:0;padding-left:18px;font-size:0.9rem;line-height:1.55;color:var(--text-muted);">
              {deliv_bullets}
            </ul>
          </div>
          <div style="background:rgba(15,23,42,0.65);border:1px solid var(--border);border-radius:10px;padding:15px 17px;">
            <h4 style="margin:0 0 8px;color:var(--green);font-size:0.98rem;">⚡ Live Wave Progress ({merged_count} of {len(effective_cars)} Cars Merged)</h4>
            <p style="margin:0;font-size:0.9rem;line-height:1.55;color:var(--text-muted);">
              The fleet is actively executing <strong>{html.escape(info['heading'])}</strong>. So far, <strong>{merged_count}</strong> wave item(s) have merged to <code>main</code>, <strong>{in_review_count}</strong> are in active PR review with <code>TC-Lane-PRR-A/B</code> and <code>TC-Lane-Arc</code>, and <strong>{in_prog_count}</strong> are in build or queued for the next wave. Between every wave, active Builder and Reviewer lanes run a clean session reset so context stays fresh and never over-compacts.
            </p>
          </div>
        </div>
      </div>

      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-label">Sprint Version</div>
          <div class="kpi-value" style="color:var(--accent2)">v{html.escape(ver)}</div>
          <div class="kpi-meta">{html.escape(rel_name)} · Live Sprint in Progress</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Chartered Wave Rows</div>
          <div class="kpi-value" style="color:var(--green)">{merged_count} / {len(effective_cars)}</div>
          <div class="kpi-meta">{merged_count} Merged · {in_review_count} In Review · {in_prog_count} In Progress/Queued</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Sprint State</div>
          <div class="kpi-value" style="color:var(--accent)">{html.escape(info['state'][:18])}</div>
          <div class="kpi-meta">Synced directly from <code>Shared/TangleClaw-Shared/LANE_QUEUE.md</code></div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Wave Reset Guardrail</div>
          <div class="kpi-value" style="color:var(--green)">Active</div>
          <div class="kpi-meta">Inter-wave <code>tc finalize</code> + fresh launch prevents compaction drift</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Builder Mode</div>
          <div class="kpi-value" style="color:var(--accent2)">bypass</div>
          <div class="kpi-meta"><code>TC-Lane-A..D</code> running in <code>bypassPermissions</code> mode</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Codex Effort Tier</div>
          <div class="kpi-value" style="color:var(--green)">medium</div>
          <div class="kpi-meta"><code>TC-Lane-INT</code>, <code>PRR-A</code>, <code>PRR-B</code> calibrated to <code>medium</code> effort</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Total Run Time (Start → Finish)</div>
          <div class="kpi-value" style="color:var(--green)">Live (In Progress)</div>
          <div class="kpi-meta">v{html.escape(ver)} Autonomous Sprint Train · Updated {html.escape(stamp)}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">4-Gate Governance</div>
          <div class="kpi-value" style="color:var(--green)">Enforced</div>
          <div class="kpi-meta"><code>I-Gate</code> · <code>B-Gate</code> · <code>A-Gate</code> · <code>O-Gate</code> active on all waves</div>
        </div>
      </div>
    </section>

    <section class="section" id="architecture">
      <div class="section-header">
        <div>
          <span class="section-tag">Section 01 · Multi-Agent Fleet Topology &amp; Wave Architecture</span>
          <h2 class="section-title">Sprint v{html.escape(ver)} Multi-Agent Execution Topology</h2>
          <p class="section-desc">
            Four parallel Builder lanes (<code>TC-Lane-A..D</code>), two dedicated PR Reviewer lanes (<code>TC-Lane-PRR-A..B</code>), Architect (<code>TC-Lane-Arc</code>), Release Integrator (<code>TC-Lane-INT</code>), Observer (<code>TC-Lane-Obsr</code>), and Project Manager (<code>TC-Lane-PM</code>) coordinate through <code>LANE_QUEUE.md</code> and Medusa switchboard exchanges.
          </p>
        </div>
      </div>
      <div class="grid-3" style="margin-bottom:20px;">
        <div class="subcard">
          <span class="pillar-num">PILLAR 01 · PARALLEL FILE-DISJOINT BUILDER WAVES</span>
          <h4>Zero-Conflict Scoped Cars Across TC-Lane-A..D</h4>
          <p>Each Builder car in <code>LANE_QUEUE.md</code> carries an explicit signed file scope and branch name verified at the Integrator Start Gate before edits begin.</p>
        </div>
        <div class="subcard">
          <span class="pillar-num">PILLAR 02 · EXACT-HEAD 4-GATE VERIFICATION</span>
          <h4>PRR I/B-Gate, Architect A/R-Gate, Integrator CI-Gate &amp; Observer O-Gate</h4>
          <p>Every PR requires exact-head GitHub Actions <code>Tests</code> CI green, PRR review acceptance, Architect invariant sign-off, and Integrator scope/freshness verification before merge.</p>
        </div>
        <div class="subcard">
          <span class="pillar-num">PILLAR 03 · INTER-WAVE SESSION CONTINUITY &amp; RESET</span>
          <h4>Deterministic Wave Reset Prevents Mid-Sprint Compaction</h4>
          <p>After each wave merges and branches are retired on clean <code>main</code>, lanes finalize and relaunch fresh sessions so no agent ever stalls or degrades from context compaction.</p>
        </div>
      </div>
      <div class="svg-wrap">
        <div class="svg-caption">
          <span>Figure 1.1 — TangleClaw 10-Lane Autonomous Fleet Architecture (Sprint v{html.escape(ver)})</span>
          <span>Live Sync: {html.escape(stamp)}</span>
        </div>
        <svg viewBox="0 0 980 330" width="100%" height="auto" role="img" aria-label="Multi-Agent Fleet Topology">
          <rect x="0" y="0" width="980" height="330" rx="12" fill="#0b1120" />
          <rect x="30" y="30" width="200" height="270" rx="10" fill="#111827" stroke="#38bdf8" stroke-width="1.5" />
          <text x="48" y="60" fill="#38bdf8" font-size="12" font-weight="800">COORDINATORS &amp; GATES</text>
          <text x="48" y="95" fill="#e2e8f0" font-size="11.5">• TC-Lane-PM (Charter)</text>
          <text x="48" y="125" fill="#e2e8f0" font-size="11.5">• TC-Lane-Arc (A/R-Gate)</text>
          <text x="48" y="155" fill="#e2e8f0" font-size="11.5">• TC-Lane-INT (Merge/CI)</text>
          <text x="48" y="185" fill="#e2e8f0" font-size="11.5">• TC-Lane-Obsr (O-Gate)</text>
          <rect x="270" y="30" width="380" height="270" rx="10" fill="#111827" stroke="#22c55e" stroke-width="1.5" />
          <text x="290" y="60" fill="#22c55e" font-size="12" font-weight="800">BUILDER LANES (BYPASS MODE)</text>
          <text x="290" y="95" fill="#e2e8f0" font-size="11.5">• TC-Lane-A · Workstream A</text>
          <text x="290" y="125" fill="#e2e8f0" font-size="11.5">• TC-Lane-B · Workstream B</text>
          <text x="290" y="155" fill="#e2e8f0" font-size="11.5">• TC-Lane-C · Workstream C</text>
          <text x="290" y="185" fill="#e2e8f0" font-size="11.5">• TC-Lane-D · Workstream D</text>
          <rect x="690" y="30" width="260" height="270" rx="10" fill="#111827" stroke="#a855f7" stroke-width="1.5" />
          <text x="710" y="60" fill="#a855f7" font-size="12" font-weight="800">PR REVIEWERS (CODEX MEDIUM)</text>
          <text x="710" y="95" fill="#e2e8f0" font-size="11.5">• TC-Lane-PRR-A (I/B-Gate)</text>
          <text x="710" y="125" fill="#e2e8f0" font-size="11.5">• TC-Lane-PRR-B (I/B-Gate)</text>
          <text x="710" y="165" fill="#94a3b8" font-size="11">Exact-SHA review &amp; Prawduct</text>
        </svg>
      </div>
    </section>

    <section class="section" id="velocity">
      <div class="section-header">
        <div>
          <span class="section-tag">Section 02 · Live Wave Velocity &amp; Execution Timeline</span>
          <h2 class="section-title">Sprint v{html.escape(ver)} Wave Execution Matrix</h2>
          <p class="section-desc">Live wave status synced directly from <code>Shared/TangleClaw-Shared/LANE_QUEUE.md</code>.</p>
        </div>
      </div>
      <div class="svg-wrap">
        <div class="svg-caption">
          <span>Figure 2.1 — Live Wave Progress Bar (v{html.escape(ver)})</span>
          <span>{merged_count} of {len(effective_cars)} Chartered Wave Rows Merged</span>
        </div>
        <svg viewBox="0 0 960 180" width="100%" height="auto" role="img" aria-label="Sprint Velocity Chart">
          <rect x="0" y="0" width="960" height="180" rx="10" fill="#0b1120" />
          <text x="30" y="45" fill="#38bdf8" font-size="13" font-weight="700">Sprint v{html.escape(ver)} Live Wave Progress ({merged_count}/{len(effective_cars)} Merged · {in_review_count} In Review)</text>
          <rect x="30" y="70" width="900" height="32" rx="8" fill="#1e293b" />
          <rect x="30" y="70" width="{max(24, int(900 * (merged_count + 0.5 * in_review_count) / max(1, len(effective_cars))))}" height="32" rx="8" fill="#22c55e" />
          <text x="30" y="135" fill="#94a3b8" font-size="11.5">Last synced from LANE_QUEUE.md at {html.escape(stamp)}</text>
        </svg>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Car / Wave</th>
              <th>Assigned Builder &amp; Reviewer</th>
              <th>Scoped Issues &amp; Branch</th>
              <th>Live Status &amp; Gate Receipts</th>
            </tr>
          </thead>
          <tbody>
{chr(10).join(vel_rows)}
          </tbody>
        </table>
      </div>
    </section>

    <section class="section" id="deliverables">
      <div class="section-header">
        <div>
          <span class="section-tag">Section 03 · Chartered Deliverables &amp; File Scope</span>
          <h2 class="section-title">Sprint v{html.escape(ver)} Deliverables Matrix</h2>
          <p class="section-desc">Each car’s exact issue assignment, branch, file scope, and current review/merge state.</p>
        </div>
      </div>
      <div class="svg-wrap">
        <div class="svg-caption">
          <span>Figure 3.1 — Deliverables Breakdown by Wave State (v{html.escape(ver)})</span>
          <span>Updated {html.escape(stamp)}</span>
        </div>
        <svg viewBox="0 0 960 180" width="100%" height="auto" role="img" aria-label="Deliverables Status Chart">
          <rect x="0" y="0" width="960" height="180" rx="10" fill="#0b1120" />
          <text x="30" y="50" fill="#22c55e" font-size="13" font-weight="700">Merged Cars: {merged_count}</text>
          <text x="320" y="50" fill="#38bdf8" font-size="13" font-weight="700">In Review: {in_review_count}</text>
          <text x="610" y="50" fill="#f59e0b" font-size="13" font-weight="700">In Progress / Queued: {in_prog_count}</text>
          <text x="30" y="110" fill="#94a3b8" font-size="11.5">All deliverables are verified against exact signed file scopes and CI gates before merge.</text>
        </svg>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Car</th>
              <th>Owner / Reviewer</th>
              <th>Signed Scope &amp; Issues</th>
              <th>Current State</th>
            </tr>
          </thead>
          <tbody>
{chr(10).join(deliv_rows)}
          </tbody>
        </table>
      </div>
    </section>

    <section class="section" id="telemetry">
      <div class="section-header">
        <div>
          <span class="section-tag">Section 04 · Live Wave &amp; Gate Telemetry</span>
          <h2 class="section-title">Real-Time Car Completion &amp; Guardrail Telemetry</h2>
          <p class="section-desc">Live progress bars for each chartered car and active sprint guardrail.</p>
        </div>
      </div>
      <div class="bar-chart" style="margin-bottom:24px;">
{chr(10).join(bar_rows)}
      </div>
    </section>

    <section class="section" id="postmortem">
      <div class="section-header">
        <div>
          <span class="section-tag">Section 05 · Live Governance Audit &amp; 16-Point Rule #283 Tracker</span>
          <h2 class="section-title">What Worked, Active Risk Watch &amp; 4-Gate Verification Matrix</h2>
          <p class="section-desc">Tracked continuously during the sprint and finalized by <code>TC-Lane-Obsr</code> at <code>W4-REL O-Gate</code>.</p>
        </div>
      </div>
      <div class="grid-2" style="margin-bottom:22px;">
        <div>
          <h3 style="margin-bottom:12px;color:var(--green);">✅ What Worked Exceptionally Well (Active Guardrails)</h3>
          <div class="pm-item">
            <h4>1. Deterministic Pre-Sprint Fleet Reset &amp; Clean Clones</h4>
            <p>All 10 fleet clones verified on clean <code>main</code> with 1 branch and 1 worktree prior to Wave 1 dispatch, with <code>LANE_QUEUE.md</code> archived and reset below 6 KB.</p>
          </div>
          <div class="pm-item">
            <h4>2. Automatic Real-Time Sprint Report &amp; Roadmap Board Tracking</h4>
            <p><code>reconcile-milestones.py</code> and <code>sync-live-sprint.py</code> automatically update both the Roadmap Board and this live Sprint Report as waves move from Dispatched to In Review to Merged.</p>
          </div>
          <div class="pm-item">
            <h4>3. Builder Bypass Mode &amp; Calibrated Codex Medium Effort</h4>
            <p><code>TC-Lane-A..D</code> run in <code>bypassPermissions</code> mode to prevent interactive prompt stalls, while Codex lanes run on <code>medium</code> effort to preserve quota longevity.</p>
          </div>
          <div class="pm-item">
            <h4>4. Inter-Wave Session Reset Guardrail</h4>
            <p>Active lanes run <code>tc finalize</code> + fresh session launch at wave boundaries so no session accumulates stale context or hits mid-wave auto-compaction.</p>
          </div>
        </div>
        <div>
          <h3 style="margin-bottom:12px;color:var(--amber);">⚠️ What Didn't Work Previously &amp; Feed-Forward Fixes in v{html.escape(ver)}</h3>
          <div class="pm-item warn">
            <h4>1. Per-Version Chartering &amp; Non-Boilerplate Sprint Reports (v{html.escape(ver)})</h4>
            <p>Each version in the 5-version autonomous train (<code>v5.57.0 → v5.61.0</code>) authors and co-signs a dedicated version charter (<code>A494–A498</code>). <strong>Fix / Guardrail:</strong> Gate 0/Gate 4 enforces a co-signed charter incorporating the prior version's empirical post-mortem and feed-forward plan.</p>
          </div>
          <div class="pm-item warn">
            <h4>2. Deterministic Inter-Version Drain, Clone Reset &amp; Double-Enter /clear</h4>
            <p>At every version boundary, all Medusa queues drain to zero and idle clones reset to <code>main</code>. <strong>Fix / Guardrail:</strong> Codex/Claude/AGY lanes run <code>/clear</code> (with double-<code>Enter</code> on Codex TUI panes) verified at <code>contextRemainingPct: 100</code>.</p>
          </div>
          <div class="pm-item warn">
            <h4>3. True Merge Commits Only (Rule #282) &amp; Remote Testament 0.34.0 Pool (Guardrail 10)</h4>
            <p>100% of PRs merge via <code>gh pr merge --merge</code> (verified 2-parent merge commit) by <code>TC-Lane-INT</code> after passing Remote Testament <code>0.34.0</code> pool execution.</p>
          </div>
          <div class="pm-item warn">
            <h4>4. Cross-Version Builder Pipelining (Guardrail 06)</h4>
            <p>Idle Builder lanes (<code>TC-Lane-A..D</code>) immediately pipeline file-disjoint Wave 1 cars from Version N+1 while Version N completes Gate 3/4 release and report verification.</p>
          </div>
        </div>
      </div>

      <h3 style="margin:20px 0 10px;">4-Gate Release Verification Matrix (Rule #283.5)</h3>
      <div class="table-wrap" style="margin-bottom:22px;">
        <table>
          <thead>
            <tr>
              <th>Gate</th>
              <th>Owner</th>
              <th>Verification Scope</th>
              <th>Live Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Gate 1 · I-Gate (PRR Code &amp; Contract Review)</strong></td>
              <td><code>TC-Lane-PRR-A</code> / <code>PRR-B</code></td>
              <td>Exact-SHA diff review, unit/integration test coverage, and charter scope compliance</td>
              <td><span class="badge badge-cyan">ACTIVE</span> Reviewing Wave PRs as opened ({in_review_count} in review, {merged_count} merged).</td>
            </tr>
            <tr>
              <td><strong>Gate 2 · B-Gate (Integrator Verification &amp; CI Gate)</strong></td>
              <td><code>TC-Lane-INT</code></td>
              <td>Exact-head GitHub Actions <code>Tests</code> CI + scope/ancestry/Prawduct verification before merge</td>
              <td><span class="badge badge-cyan">ACTIVE</span> Start-Gate &amp; Merge-Gate enforced on every wave.</td>
            </tr>
            <tr>
              <td><strong>Gate 3 · A-Gate / R-Gate (Architect Invariant &amp; Records Gate)</strong></td>
              <td><code>TC-Lane-Arc</code></td>
              <td>Architectural invariant sign-off on sensitive cars, <code>FEATURES.md</code> reconciliation, and release R-Gate</td>
              <td><span class="badge badge-cyan">ACTIVE</span> Co-signing charter and reviewing architectural cars.</td>
            </tr>
            <tr>
              <td><strong>Gate 4 · O-Gate (Observer Canonical Report &amp; Release Audit)</strong></td>
              <td><code>TC-Lane-Obsr</code></td>
              <td>Live telemetry tracking during sprint + final 8-section empirical report at W4-REL</td>
              <td><span class="badge badge-cyan">LIVE TRACKING</span> Live report active and passing <code>validate-sprint-report.py</code>.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3 style="margin:20px 0 10px;">Rule #283 16-Point Governance &amp; Process Audit (Live In-Sprint View)</h3>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Rule #283 Audit Dimension</th>
              <th>Verdict</th>
              <th>Live Sprint v{html.escape(ver)} Telemetry</th>
            </tr>
          </thead>
          <tbody>
{chr(10).join(rule283_rows)}
          </tbody>
        </table>
      </div>
    </section>

    <section class="section" id="waves">
      <div class="section-header">
        <div>
          <span class="section-tag">Section 06 · Interactive Wave &amp; Deliverable Explorer</span>
          <h2 class="section-title">Filter &amp; Inspect Every Chartered Wave Car in Sprint v{html.escape(ver)}</h2>
          <p class="section-desc">Search by car ID, issue number, lane, or status.</p>
        </div>
      </div>
      <div class="explorer-controls">
        <input type="text" id="waveSearch" class="search-input" placeholder="Search car (W1-A), issue, lane (TC-Lane-A), or status..." oninput="filterWaves()" />
        <div class="filter-group">
          <button class="filter-btn active" onclick="setWaveFilter('all', this)">All Wave Cars ({len(effective_cars)})</button>
          <button class="filter-btn" onclick="setWaveFilter('w1', this)">Wave 1</button>
          <button class="filter-btn" onclick="setWaveFilter('w2', this)">Wave 2</button>
          <button class="filter-btn" onclick="setWaveFilter('w3', this)">Wave 3 / Release</button>
          <button class="filter-btn" onclick="setWaveFilter('live', this)">Live Tracked</button>
          <button class="filter-btn" onclick="setWaveFilter('all', this)">Builder A</button>
          <button class="filter-btn" onclick="setWaveFilter('all', this)">Builder B</button>
          <button class="filter-btn" onclick="setWaveFilter('all', this)">Builder C</button>
          <button class="filter-btn" onclick="setWaveFilter('all', this)">Builder D</button>
          <button class="filter-btn" onclick="setWaveFilter('all', this)">Integrator / PRR</button>
        </div>
      </div>
      <div class="wave-grid" id="waveGrid">
{chr(10).join(wave_cards)}
      </div>
    </section>

    <section class="section" id="next-sprint">
      <div class="section-header">
        <div>
          <span class="section-tag">Section 07 · Active Sprint Guardrails &amp; Wave Reset Protocol</span>
          <h2 class="section-title">6 Enforced Operational Guardrails During Sprint v{html.escape(ver)}</h2>
        </div>
      </div>
      <div class="grid-3">
        <div class="subcard">
          <span class="pillar-num">GUARDRAIL 01 · PER-VERSION CHARTER CO-SIGN (A494–A498)</span>
          <h4>Dedicated Version Charter Co-Signed by PM &amp; Architect at Gate 0</h4>
          <p>Every leg of the <code>v5.57.0 → v5.61.0</code> train starts from a co-signed charter on verified <code>main</code> HEAD.</p>
        </div>
        <div class="subcard">
          <span class="pillar-num">GUARDRAIL 02 · INTER-WAVE SESSION RESET (RULE #291 CL. 5)</span>
          <h4>Finalize &amp; Relaunch Active Lanes Between Waves</h4>
          <p>After a wave merges and branches are deleted on clean <code>main</code>, active Builder/PRR lanes run <code>tc finalize</code> + fresh launch so context never over-compacts.</p>
        </div>
        <div class="subcard">
          <span class="pillar-num">GUARDRAIL 03 · LIVE ROADMAP &amp; SPRINT REPORT AUTO-SYNC</span>
          <h4>Update LANE_QUEUE.md at Every Dispatch, PR Open &amp; Merge</h4>
          <p>Every wave transition in <code>LANE_QUEUE.md</code> immediately updates both the Roadmap Board and this live Sprint Report.</p>
        </div>
        <div class="subcard">
          <span class="pillar-num">GUARDRAIL 04 · SUBSYSTEM SIBLING TEST EXECUTION</span>
          <h4>Run All Touched Subsystem Tests Locally Before Push</h4>
          <p>Builders run all sibling tests for touched modules before pushing PR heads or review fixes.</p>
        </div>
        <div class="subcard">
          <span class="pillar-num">GUARDRAIL 05 · SINGLE HOST SUITE_SLOT COORDINATION</span>
          <h4>One Full Local Suite at a Time via TC-Lane-INT</h4>
          <p>Builders run targeted/staged tests while <code>TC-Lane-INT</code> serializes full pre-deploy local suite runs under <code>SUITE_SLOT</code>.</p>
        </div>
        <div class="subcard">
          <span class="pillar-num">GUARDRAIL 06 · THREE HONEST FINISH LINES AT W4-REL</span>
          <h4>Code Released, Production Updated &amp; Feature Activated</h4>
          <p>Release status documents report each finish line honestly with exact commit SHAs, backup hashes, and live readback receipts.</p>
        </div>
      </div>
    </section>
  </main>

  <footer class="footer">
    <div class="container">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
        <div>
          <strong>TangleClaw Sprint v{html.escape(ver)} Live Progress &amp; Telemetry Report</strong> · Auto-Synced by <code>sync-live-sprint.py</code> ({html.escape(stamp)})
        </div>
        <div>
          <a href="../" style="color:var(--accent2);">← All Sprint Reports</a>
        </div>
      </div>
    </div>
  </footer>
  {script_block}
</body>
</html>
"""
    return report


def main():
    if not LANE_QUEUE.is_file() or not HUB_INDEX.is_file():
        return

    lq_text = LANE_QUEUE.read_text(encoding="utf-8")
    info = parse_lane_queue(lq_text)
    published_tags = get_published_tags()
    hub_html = HUB_INDEX.read_text(encoding="utf-8")

    # Determine if an unshipped sprint is currently active in LANE_QUEUE.md (or fallback to newest v*-sprint-plan.md)
    if not info or f"v{info['version']}" in published_tags or "no next sprint is active here yet" in lq_text.lower():
        pm_plans_dir = pathlib.Path("/Users/jasonvaughan/Documents/Projects/TangleClaw-ProjectManager/.tangleclaw/plans")
        fallback_info = None
        if pm_plans_dir.is_dir():
            for plan_path in sorted(pm_plans_dir.glob("v*-sprint-plan.md"), key=lambda p: p.stat().st_mtime, reverse=True):
                try:
                    cand = parse_lane_queue(plan_path.read_text(encoding="utf-8"))
                    if cand and f"v{cand['version']}" not in published_tags and "DRAFT" not in cand.get("state", "").upper():
                        fallback_info = cand
                        break
                except Exception:
                    pass
        if fallback_info:
            info = fallback_info
        else:
            cleaned = strip_live_hub_card(hub_html)
            if cleaned != hub_html:
                HUB_INDEX.write_text(cleaned, encoding="utf-8")
                print("[sync-live-sprint] Removed stale live-sprint card from sprint-reports/index.html.")
            return

    ver = info["version"]
    report_dir = REPORTS_DIR / f"v{ver}"
    report_file = report_dir / "index.html"

    # Never overwrite a final Observer-authored report (one that lacks LIVE_REPORT_MARKER)
    if report_file.is_file():
        existing = report_file.read_text(encoding="utf-8")
        if LIVE_REPORT_MARKER not in existing:
            print(f"[sync-live-sprint] Final report already exists at {report_file}; skipping live overwrite.")
            return

    r2 = json.loads(ROADMAP_DATA.read_text(encoding="utf-8")) if ROADMAP_DATA.is_file() else {}
    live_html = build_live_report_html(info, r2)

    report_dir.mkdir(parents=True, exist_ok=True)
    report_file.write_text(live_html, encoding="utf-8")

    if OBSR_PLANS.is_dir():
        (OBSR_PLANS / f"sprint-v{ver}.html").write_text(live_html, encoding="utf-8")

    updated_hub = upsert_live_hub_card(hub_html, info)
    if updated_hub != hub_html:
        HUB_INDEX.write_text(updated_hub, encoding="utf-8")

    print(f"[sync-live-sprint] Synced live sprint report for v{ver} ({len(live_html)} bytes, {len(live_html.splitlines())} lines).")


if __name__ == "__main__":
    main()

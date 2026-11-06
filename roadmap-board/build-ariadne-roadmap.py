#!/usr/bin/env python3
"""
Build the Ariadne (ARIADNE-HACK-2026) Interactive Roadmap Board and Sprint Reports Hub
using the exact TangleClaw Roadmap 2 (https://jason-vaughan.github.io/TangleClaw/)
HTML/CSS layout and Pairwise Disjoint File-Envelope Sorting (Envelope(A) ∩ Envelope(B) = ∅).
"""

import html
import json
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

HERE = Path(__file__).resolve().parent
REPORTS_DIR = HERE.parent / "sprint-reports"

PREVIEW_CSS = r"""
:root{color-scheme:light dark;--bg:#f6f8fa;--fg:#1f2328;--muted:#59636e;--line:#d0d7de;--panel:#fff;--table:#f6f8fa;--link:#0969da}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}main{max-width:1180px;margin:auto;padding:2rem 1rem 5rem}a{color:var(--link)}h1{margin-bottom:.3rem}.lede{max-width:78ch;color:var(--muted)}.notice,.sync-status,.reading-guide{border:1px solid var(--line);border-radius:.65rem;background:var(--panel);padding:.8rem 1rem;margin:1rem 0}.notice strong,.sync-status strong,.reading-guide>strong{display:block}.sync-status[data-state="error"]{border-color:#cf222e;background:#ffebe9}.sync-status[data-state="ok"]{display:none}.summary-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(10rem,1fr));gap:.75rem;margin:1.25rem 0}.metric{background:var(--panel);border:1px solid var(--line);border-radius:.65rem;padding:.8rem}.metric strong{display:block;font-size:1.35rem}.status-legend{display:flex;flex-wrap:wrap;gap:.45rem;margin-top:.65rem}.release-card{--accent:#0969da;--tint:#ddf4ff;--stripe:#b6e3ff;border:1px solid var(--line);border-left:.45rem solid var(--accent);border-radius:.8rem;background:var(--tint);margin:1rem 0;overflow:hidden}.theme-0{--accent:#0969da;--tint:#ddf4ff;--stripe:#b6e3ff}.theme-1{--accent:#8250df;--tint:#fbefff;--stripe:#d8b9ff}.theme-2{--accent:#1a7f37;--tint:#dafbe1;--stripe:#aceebb}.theme-3{--accent:#9a6700;--tint:#fff8c5;--stripe:#f8e3a1}.theme-4{--accent:#cf222e;--tint:#ffebe9;--stripe:#ffcecb}.theme-5{--accent:#bf3989;--tint:#ffeff7;--stripe:#ffadda}.release-card>summary{cursor:pointer;display:grid;grid-template-columns:auto minmax(12rem,1fr) auto auto;align-items:center;gap:.65rem;padding:1rem;background:var(--tint);font-weight:600}.release-card>summary:focus-visible{outline:3px solid var(--accent);outline-offset:-3px}.version{font-size:1.15rem;color:var(--accent)}.release-name{font-size:1.05rem}.release-count{color:var(--muted);font-size:.9rem}.stage,.state{display:inline-block;border:1px solid currentColor;border-radius:999px;padding:.08rem .5rem;font-size:.78rem;font-weight:700;white-space:nowrap}.stage-current{color:#1a7f37}.stage-upcoming{color:#8250df}.stage-released{color:#1a7f37}.stage-released::before{content:"✓";margin-right:.3em}.released-on{color:var(--muted);font-size:.9rem}.released-link{font-size:.9rem;font-weight:400}.released-view .release-card{opacity:.92}.firsts{list-style:none;margin:0;padding:0}.firsts li{display:grid;grid-template-columns:7rem 1fr;gap:.1rem .75rem;padding:.6rem 0;border-top:1px solid var(--line)}.first-date{color:var(--muted);font-variant-numeric:tabular-nums}.first-title{font-weight:700}.first-note{grid-column:2;color:var(--muted)}@media(max-width:36rem){.firsts li{grid-template-columns:1fr}.first-note{grid-column:1}}.release-body{border-top:1px solid var(--stripe);padding:1rem;background:var(--panel)}.deliverables{margin-top:0}.workstream{border:1px solid var(--line);border-radius:.6rem;margin:.9rem 0;padding:.8rem;background:var(--tint)}.workstream header{display:flex;gap:.55rem 1rem;flex-wrap:wrap;color:var(--muted)}.identity{font-weight:700;color:var(--fg)}.builds-beside{color:var(--muted);margin:.2rem 0 .6rem}.parallel{font-weight:700}.parallel-alone{color:#cf222e}.parallel-ok{color:#1a7f37}.stream-note{margin:.45rem 0}.table-scroll{overflow-x:auto;border:1px solid var(--line);border-radius:.5rem;margin-top:.65rem}table{width:100%;border-collapse:collapse;background:var(--panel)}th,td{text-align:left;padding:.55rem .65rem;border-bottom:1px solid var(--line);vertical-align:top}th{background:var(--stripe)}tbody tr:nth-child(even){background:var(--table)}tbody tr:last-child td{border-bottom:0}.issue-row{--state-color:#59636e}.issue-row>td:first-child{box-shadow:inset .28rem 0 var(--state-color)}.row-state-closed{--state-color:#1a7f37}.row-state-dropped{--state-color:#59636e}.row-state-blocked{--state-color:#cf222e}.row-state-in-review{--state-color:#8250df}.row-state-deployed{--state-color:#0969da}.row-state-in-progress{--state-color:#9a6700}.row-state-open{--state-color:#59636e}.state-closed{color:#1a7f37;background:#dafbe1}.state-dropped{color:#59636e;background:#f6f8fa}.state-blocked{color:#cf222e;background:#ffebe9}.state-in-review{color:#8250df;background:#fbefff}.state-deployed{color:#0969da;background:#ddf4ff}.state-in-progress{color:#9a6700;background:#fff8c5}.state-open{color:#59636e;background:#f6f8fa}.row-state-dropped .planned-title{text-decoration:line-through}.sequence{text-align:center;width:4rem}.sequence-marker{display:inline-grid;place-items:center;width:1.65rem;height:1.65rem;border-radius:50%;background:var(--stripe);font-weight:800}.prerequisites{min-width:10rem}.prerequisite{display:inline-block;border:1px solid currentColor;border-radius:999px;padding:.08rem .45rem;margin:.05rem .15rem .05rem 0;font-size:.76rem;font-weight:700;white-space:nowrap}.prerequisite a{color:inherit;text-decoration:none}.prerequisite a:hover{text-decoration:underline}.prerequisite-satisfied{color:#1a7f37;background:#dafbe1}.prerequisite-waiting{color:#9a6700;background:#fff8c5}.prerequisite-dropped{color:#cf222e;background:#ffebe9}.no-prerequisites{color:var(--muted)}.reason,.progress-detail{display:block;color:var(--muted);font-size:.82rem;margin-top:.2rem}.progress-detail{max-width:42rem}.issue-type{color:var(--muted);font-size:.82rem}.unsorted-view{border:1px solid var(--line);border-radius:.8rem;background:var(--panel);margin-top:2rem}.unsorted-view>summary{cursor:pointer;font-size:1.15rem;font-weight:700;padding:1rem}.unsorted-body{padding:0 1rem 1rem}.count{color:var(--muted);font-size:.85rem}.withheld,.empty{color:var(--muted)}footer{color:var(--muted);margin-top:2rem;padding-top:1rem;border-top:1px solid var(--line)}
@media(max-width:720px){main{padding:1rem .65rem 3rem}.release-card>summary{grid-template-columns:auto 1fr}.stage,.release-count{justify-self:start}.release-body{padding:.65rem}th,td{padding:.45rem}}
@media(prefers-color-scheme:dark){:root{--bg:#0d1117;--fg:#e6edf3;--muted:#8b949e;--line:#30363d;--panel:#161b22;--table:#0d1117;--link:#58a6ff}.theme-0{--accent:#58a6ff;--tint:#10243a;--stripe:#173a5e}.theme-1{--accent:#bc8cff;--tint:#251843;--stripe:#3c2464}.theme-2{--accent:#56d364;--tint:#112d1c;--stripe:#1d4d2d}.theme-3{--accent:#e3b341;--tint:#332b13;--stripe:#514417}.theme-4{--accent:#ff7b72;--tint:#351518;--stripe:#5a1e24}.theme-5{--accent:#f778ba;--tint:#32162c;--stripe:#542043}.sync-status[data-state="error"]{background:#351518}.stage-current,.state-closed{color:#56d364}.stage-upcoming,.state-in-review{color:#bc8cff}.state-blocked{color:#ff7b72}.state-deployed{color:#58a6ff;background:#0c2d6b}.state-in-progress{color:#e3b341}.stage-released,.state-dropped,.state-open{color:#8b949e}.state-closed,.prerequisite-satisfied{background:#112d1c}.state-in-review{background:#251843}.state-blocked,.prerequisite-dropped{background:#351518}.state-in-progress,.prerequisite-waiting{background:#332b13}.state-dropped,.state-open{background:#21262d}}
.stage-unversioned{color:#8250df}.unversioned-card .release-progress{max-width:82ch}
.exec-pill{display:inline-block;border:1px solid currentColor;border-radius:999px;padding:.08rem .55rem;font-size:.76rem;font-weight:700;white-space:nowrap;margin-left:.35rem}
.exec-autonomous{color:#1a7f37;background:#dafbe1}
.exec-hitl{color:#9a6700;background:#fff8c5}
.exec-design{color:#8250df;background:#fbefff}
@media(prefers-color-scheme:dark){.exec-autonomous{color:#56d364;background:#112d1c}.exec-hitl{color:#e3b341;background:#332b13}.exec-design{color:#bc8cff;background:#251843}}
"""

STATE_TEXT = {
    "closed": "Completed",
    "dropped": "Not planned",
    "blocked": "Blocked",
    "in-review": "In review",
    "deployed": "Deployed, awaiting a check",
    "in-progress": "In progress",
    "open": "Not started",
}

ISSUES = {
    1: {
        "number": 1,
        "code": "A-001",
        "type": "feature",
        "state": "open",
        "title": "A-001: Core architecture, SQLite WAL schema & data/event contracts",
        "url": "https://cursatory.tail123678.ts.net:8443/plans/149/ISSUE_A-001.md",
        "envelope": "src/contracts/types.ts, src/contracts/events.ts, src/db/schema.sql, tests/contracts.test.ts",
    },
    2: {
        "number": 2,
        "code": "A-002",
        "type": "feature",
        "state": "open",
        "title": "A-002: Public QR onboarding — Zero-OAuth 1-tap GitHub handle entry ('REQUIRES GITHUB PROFILE')",
        "url": "https://cursatory.tail123678.ts.net:8443/plans/149/ISSUE_A-002.md",
        "envelope": "src/routes/onboarding.ts, src/auth/session.ts, public/app/join.html, public/app/join.js, tests/onboarding.test.ts",
    },
    3: {
        "number": 3,
        "code": "A-003",
        "type": "feature",
        "state": "open",
        "title": "A-003: GitHub public-data connector, Multi-PAT pool, 24h SQLite cache & VIP pre-warmer",
        "url": "https://cursatory.tail123678.ts.net:8443/plans/149/ISSUE_A-003.md",
        "envelope": "src/github/connector.ts, src/github/cache.ts, src/github/sanitize.ts, tests/github-connector.test.ts",
    },
    4: {
        "number": 4,
        "code": "A-004",
        "type": "feature",
        "state": "open",
        "title": "A-004: Evidence-backed capability analysis & 6-Axis Builder Fingerprint (Gemini Flash + Stage 1)",
        "url": "https://cursatory.tail123678.ts.net:8443/plans/149/ISSUE_A-004.md",
        "envelope": "src/intelligence/capability-agent.ts, src/intelligence/prompts.ts, tests/capability-agent.test.ts",
    },
    5: {
        "number": 5,
        "code": "A-005",
        "type": "feature",
        "state": "open",
        "title": "A-005: Opportunity & bottleneck discovery agent (Gemini Flash + Stage 1 complementary gaps)",
        "url": "https://cursatory.tail123678.ts.net:8443/plans/149/ISSUE_A-005.md",
        "envelope": "src/intelligence/opportunity-agent.ts, tests/opportunity-agent.test.ts",
    },
    6: {
        "number": 6,
        "code": "A-006",
        "type": "feature",
        "state": "open",
        "title": "A-006: Deterministic 4-factor match scoring engine (40/30/20/10 + <=0.72 anti-clone penalty)",
        "url": "https://cursatory.tail123678.ts.net:8443/plans/149/ISSUE_A-006.md",
        "envelope": "src/matching/scorer.ts, src/matching/anti-clone.ts, tests/scorer.test.ts",
    },
    7: {
        "number": 7,
        "code": "A-007",
        "type": "feature",
        "state": "open",
        "title": "A-007: Two-stage match explanation & collaboration thesis agent (<50ms Stage 1 + Gemini Flash)",
        "url": "https://cursatory.tail123678.ts.net:8443/plans/149/ISSUE_A-007.md",
        "envelope": "src/matching/explanation-agent.ts, src/matching/evidence-formatter.ts, tests/explanation-agent.test.ts",
    },
    8: {
        "number": 8,
        "code": "A-008",
        "type": "feature",
        "state": "open",
        "title": "A-008: Mobile participant 6-Axis Builder Fingerprint & progressive Top-3 Match Cards UI (/me)",
        "url": "https://cursatory.tail123678.ts.net:8443/plans/149/ISSUE_A-008.md",
        "envelope": "public/app/me.html, public/app/me.js, public/app/app.css, src/routes/me.ts, tests/me-routes.test.ts",
    },
    9: {
        "number": 9,
        "code": "A-009",
        "type": "feature",
        "state": "open",
        "title": "A-009: SQLite append-only live event stream (SSE /api/events/stream + HTTP polling fallback)",
        "url": "https://cursatory.tail123678.ts.net:8443/plans/149/ISSUE_A-009.md",
        "envelope": "src/events/bus.ts, src/routes/events.ts, tests/events.test.ts",
    },
    10: {
        "number": 10,
        "code": "A-010",
        "type": "feature",
        "state": "open",
        "title": "A-010: Interactive Stage Visualizer Shell, Top-3 Web of Connections, Golden Arcs & Seed Toggle (+25 AI Devs)",
        "url": "https://cursatory.tail123678.ts.net:8443/plans/149/ISSUE_A-010.md",
        "envelope": "public/stage/index.html, public/stage/network-graph.js, public/stage/stage.css, src/routes/stage-snapshot.ts, tests/stage-snapshot.test.ts",
    },
    11: {
        "number": 11,
        "code": "A-011",
        "type": "feature",
        "state": "open",
        "title": "A-011: Stage Views 1, 2 & 4 — Under-the-Hood 4-Stage Pipeline, Builder Fingerprints Gallery & Match Spotlight",
        "url": "https://cursatory.tail123678.ts.net:8443/plans/149/ISSUE_A-011.md",
        "envelope": "public/stage/spotlight.js, public/stage/activity-feed.js, public/stage/operator-controls.js, tests/stage-modes.test.ts",
    },
    12: {
        "number": 12,
        "code": "A-012",
        "type": "feature",
        "state": "open",
        "title": "A-012: Zero-blocker mutual-introduction workflow, Private Web Intro Room, Venue Locator & Golden Arc trigger",
        "url": "https://cursatory.tail123678.ts.net:8443/plans/149/ISSUE_A-012.md",
        "envelope": "src/routes/introductions.ts, src/matching/intro-state-machine.ts, public/app/intro-room.js, tests/introductions.test.ts",
    },
    13: {
        "number": 13,
        "code": "A-013",
        "type": "feature",
        "state": "dropped",
        "title": "A-013: [Deferred to V2] Discord event bot & thread creation adapter",
        "url": "https://cursatory.tail123678.ts.net:8443/plans/149/ISSUE_A-013.md",
        "envelope": "Deferred per Web-Only Self-Hosted Hackathon MVP Amendment",
    },
    14: {
        "number": 14,
        "code": "A-014",
        "type": "feature",
        "state": "open",
        "title": "A-014: Self-hosted server (:3420), auto-mounted route loader, SQLite WAL & narrow HTTPS tunnel",
        "url": "https://cursatory.tail123678.ts.net:8443/plans/149/ISSUE_A-014.md",
        "envelope": "src/server.ts, src/db/client.ts, src/routes/health.ts, scripts/tunnel.sh, tests/server.test.ts",
    },
    15: {
        "number": 15,
        "code": "A-015",
        "type": "feature",
        "state": "open",
        "title": "A-015: Hackathon provenance ledger & Per-Version v2.0.0 Interactive Sprint Reports Hub (/reports)",
        "url": "https://cursatory.tail123678.ts.net:8443/plans/149/ISSUE_A-015.md",
        "envelope": "public/reports/index.html, public/roadmap/index.html, scripts/build-sprint-report.js, tests/reports.test.ts",
    },
    16: {
        "number": 16,
        "code": "A-016",
        "type": "feature",
        "state": "open",
        "title": "A-016: Two-stage progressive pipeline (<500ms + Parallel Gemini Flash pool) & Onsite Capacity Controller (/admin)",
        "url": "https://cursatory.tail123678.ts.net:8443/plans/149/ISSUE_A-016.md",
        "envelope": "src/worker/job-runner.ts, src/worker/seed-personas.ts, data/golden-seed-24.json, tests/worker.test.ts",
    },
    17: {
        "number": 17,
        "code": "A-017",
        "type": "feature",
        "state": "dropped",
        "title": "A-017: [Deferred to V2] Medusa runtime coordination adapter",
        "url": "https://cursatory.tail123678.ts.net:8443/plans/149/ISSUE_A-017.md",
        "envelope": "Deferred per Web-Only Self-Hosted Hackathon MVP Amendment",
    },
}

EXEC_MODES = {
    1: ("autonomous", "⚡ Fully autonomous"),
    2: ("autonomous", "⚡ Fully autonomous"),
    3: ("autonomous", "⚡ Fully autonomous"),
    4: ("autonomous", "⚡ Fully autonomous"),
    5: ("autonomous", "⚡ Fully autonomous"),
    6: ("autonomous", "⚡ Fully autonomous"),
    7: ("autonomous", "⚡ Fully autonomous"),
    8: ("autonomous", "⚡ Fully autonomous"),
    9: ("autonomous", "⚡ Fully autonomous"),
    10: ("autonomous", "⚡ Fully autonomous"),
    11: ("autonomous", "⚡ Fully autonomous"),
    12: ("autonomous", "⚡ Fully autonomous"),
    13: ("design", "🧭 Deferred V2"),
    14: ("hitl", "👤 HITL: .env Keys & Public Tunnel"),
    15: ("autonomous", "⚡ Fully autonomous"),
    16: ("autonomous", "⚡ Fully autonomous"),
    17: ("design", "🧭 Deferred V2"),
}

RELEASE_EXEC_MODES = {
    "0.1.0": ("hitl", "👤 HITL: Operator GO & .env Keys"),
    "0.2.0": ("autonomous", "⚡ Fully autonomous"),
    "0.3.0": ("autonomous", "⚡ Fully autonomous"),
    "0.4.0": ("autonomous", "⚡ Fully autonomous"),
    "1.0.0": ("hitl", "👤 VRF: Live Mobile QR & 16:9 Stage Check"),
}

ROADMAP_DATA = {
    "repo": "Jason-Vaughan/Ariadne",
    "public_projection": {
        "launch_approved": True,
        "withheld_issues": [],
        "exclude_labels": ["security", "internal-only"],
        "exclude_title_prefixes": ["[security]", "[internal]"],
    },
    "releases": [
        {
            "version": "0.1.0",
            "name": "Foundation, Contracts, Auto-Loader Server & Live Event Bus (09:30 – 10:05 PST)",
            "public_status": "Staged for Saturday Nov 7 @ 09:30 AM PST Operator GO. 4 solo parallel workstreams with 0 shared files.",
            "deliverables": [
                "Freeze canonical TypeScript interfaces (src/contracts/*) and SQLite WAL schema (src/db/schema.sql).",
                "Boot Express server on PortHub port 127.0.0.1:3420 with auto-discovery route loader (src/routes/*.ts) so feature waves never touch src/server.ts.",
                "Stand up append-only SQLite event bus with SSE (GET /api/events/stream) and automatic HTTP polling fallback (GET /api/events/poll).",
                "Mount live /roadmap and /reports (TangleClaw Sprint Report Standard v2.0.0) static hubs.",
            ],
            "trains": [
                {
                    "kind": "bucket",
                    "name": "Contracts & SQLite WAL Schema",
                    "owner": "Ariadne-Lane-A",
                    "note": "Exclusive file envelope: src/contracts/types.ts, src/contracts/events.ts, src/db/schema.sql, tests/contracts.test.ts",
                    "cars": [1],
                },
                {
                    "kind": "bucket",
                    "name": "Self-Hosted :3420 Server & Auto-Discovery Route Loader",
                    "owner": "Ariadne-Lane-B",
                    "note": "Exclusive file envelope: src/server.ts, src/db/client.ts, src/routes/health.ts, scripts/tunnel.sh, tests/server.test.ts",
                    "cars": [14],
                },
                {
                    "kind": "bucket",
                    "name": "SQLite Append-Only Event Stream (SSE + Polling Fallback)",
                    "owner": "Ariadne-Lane-C",
                    "note": "Exclusive file envelope: src/events/bus.ts, src/routes/events.ts, tests/events.test.ts",
                    "cars": [9],
                },
                {
                    "kind": "bucket",
                    "name": "Interactive Roadmap & v2.0.0 Sprint Reports Hub",
                    "owner": "Ariadne-Lane-D",
                    "note": "Exclusive file envelope: public/reports/index.html, public/roadmap/index.html, scripts/build-sprint-report.js, tests/reports.test.ts",
                    "cars": [15],
                },
            ],
        },
        {
            "version": "0.2.0",
            "name": "QR Onboarding, GitHub Connector, Deterministic Scorer & Stage Network Graph (10:05 – 11:00 PST)",
            "public_status": "Wave 2 — 4 solo issues running in parallel across 4 disjoint directories (public/app/join.*, src/github/*, src/matching/scorer.ts, public/stage/network-graph.js).",
            "deliverables": [
                "Mobile QR onboarding (/join), GitHub handle validation, two-tier privacy consent, and HttpOnly session binding (#2).",
                "Bounded 1-query GraphQL GitHub public-data connector, 30-minute SQLite snapshot cache, and prompt-injection sanitizer (#3).",
                "Deterministic 4-factor match scoring engine (40/30/20/10 + <=0.72 cosine similarity anti-clone penalty) with 5 unit test cases (#6).",
                "16:9 Presentation Visualizer Network Mode (/stage), pseudonymous node rendering (Thread-XXXX), and 6-KPI ribbon (#10).",
            ],
            "trains": [
                {
                    "kind": "bucket",
                    "name": "Mobile QR Onboarding & Session Isolation",
                    "owner": "Ariadne-Lane-A",
                    "note": "Exclusive file envelope: src/routes/onboarding.ts, src/auth/session.ts, public/app/join.html, public/app/join.js, tests/onboarding.test.ts",
                    "cars": [2],
                    "waits_on": {"2": [1, 14]},
                },
                {
                    "kind": "bucket",
                    "name": "Bounded GitHub Public-Data Connector & Cache",
                    "owner": "Ariadne-Lane-B",
                    "note": "Exclusive file envelope: src/github/connector.ts, src/github/cache.ts, src/github/sanitize.ts, tests/github-connector.test.ts",
                    "cars": [3],
                    "waits_on": {"3": [1]},
                },
                {
                    "kind": "bucket",
                    "name": "Deterministic 4-Factor Match Scoring Engine (40/30/20/10)",
                    "owner": "Ariadne-Lane-C",
                    "note": "Exclusive file envelope: src/matching/scorer.ts, src/matching/anti-clone.ts, tests/scorer.test.ts",
                    "cars": [6],
                    "waits_on": {"6": [1]},
                },
                {
                    "kind": "bucket",
                    "name": "16:9 Stage Visualizer — Network Graph & KPI Ribbon",
                    "owner": "Ariadne-Lane-D",
                    "note": "Exclusive file envelope: public/stage/index.html, public/stage/network-graph.js, public/stage/stage.css, src/routes/stage-snapshot.ts, tests/stage-snapshot.test.ts",
                    "cars": [10],
                    "waits_on": {"10": [1, 9]},
                },
            ],
        },
        {
            "version": "0.3.0",
            "name": "Capability AI Agent, Match Explanations, Mobile Match Cards & Stage Spotlight (11:00 – 12:00 PST)",
            "public_status": "Wave 3 — Sequenced after v0.2.0 so shared subsystems (public/app/*, src/intelligence/*, src/matching/*, public/stage/*) have zero concurrent writers.",
            "deliverables": [
                "Mobile participant profile (/me), live research progress stepper, and top-3 evidence-backed match cards with Interested/Pass controls (#8).",
                "Evidence-backed Capability Analysis Agent citing real GitHub repositories and commits (#4).",
                "Match Research & Proposal Explanation Agent generating concrete collaboration hypotheses (#7).",
                "16:9 Presentation Visualizer Activity Feed & Match Spotlight modes plus Operator privacy/hotkey HUD (#11).",
            ],
            "trains": [
                {
                    "kind": "bucket",
                    "name": "Mobile Profile & Top-3 Match Results UI",
                    "owner": "Ariadne-Lane-A",
                    "note": "Exclusive file envelope: public/app/me.html, public/app/me.js, public/app/app.css, src/routes/me.ts, tests/me-routes.test.ts",
                    "cars": [8],
                    "waits_on": {"8": [2, 9]},
                },
                {
                    "kind": "bucket",
                    "name": "Evidence-Backed Capability Analysis Agent",
                    "owner": "Ariadne-Lane-B",
                    "note": "Exclusive file envelope: src/intelligence/capability-agent.ts, src/intelligence/prompts.ts, tests/capability-agent.test.ts",
                    "cars": [4],
                    "waits_on": {"4": [3]},
                },
                {
                    "kind": "bucket",
                    "name": "Match Research & Proposal Explanation Agent",
                    "owner": "Ariadne-Lane-C",
                    "note": "Exclusive file envelope: src/matching/explanation-agent.ts, src/matching/evidence-formatter.ts, tests/explanation-agent.test.ts",
                    "cars": [7],
                    "waits_on": {"7": [6]},
                },
                {
                    "kind": "bucket",
                    "name": "16:9 Stage Visualizer — Activity Feed & Spotlight Modes",
                    "owner": "Ariadne-Lane-D",
                    "note": "Exclusive file envelope: public/stage/spotlight.js, public/stage/activity-feed.js, public/stage/operator-controls.js, tests/stage-modes.test.ts",
                    "cars": [11],
                    "waits_on": {"11": [10]},
                },
            ],
        },
        {
            "version": "0.4.0",
            "name": "Mutual Introduction Room, Opportunity Agent & Async Rematch Worker (12:00 – 13:00 PST)",
            "public_status": "Wave 4 — Completes all 15 Hackathon MVP issues by 1:00 PM PST via 3 disjoint solo dispatches, leaving 4h 45m for v1.0.0 dogfooding & polish.",
            "deliverables": [
                "Web-native double-opt-in Mutual Introduction state machine (approval_a = 1 AND approval_b = 1), contact reveal gate, and private Intro Room (/me/matches/:id) (#12).",
                "Opportunity & Bottleneck Discovery Agent extracting complementary collaboration needs (#5).",
                "In-process SQLite-leased async job worker, continuous incremental rematching, and 24-persona golden seed fixture (#16).",
            ],
            "trains": [
                {
                    "kind": "bucket",
                    "name": "Web-Native Mutual Introduction Workflow & Private Intro Room",
                    "owner": "Ariadne-Lane-A",
                    "note": "Exclusive file envelope: src/routes/introductions.ts, src/matching/intro-state-machine.ts, public/app/intro-room.js, tests/introductions.test.ts",
                    "cars": [12],
                    "waits_on": {"12": [8]},
                },
                {
                    "kind": "bucket",
                    "name": "Opportunity & Bottleneck Discovery Agent",
                    "owner": "Ariadne-Lane-B",
                    "note": "Exclusive file envelope: src/intelligence/opportunity-agent.ts, tests/opportunity-agent.test.ts",
                    "cars": [5],
                    "waits_on": {"5": [4]},
                },
                {
                    "kind": "bucket",
                    "name": "In-Process Async SQLite Job Worker & Continuous Rematching",
                    "owner": "Ariadne-Lane-C",
                    "note": "Exclusive file envelope: src/worker/job-runner.ts, src/worker/seed-personas.ts, data/golden-seed-24.json, tests/worker.test.ts",
                    "cars": [16],
                    "waits_on": {"16": [3, 4, 6, 7]},
                },
            ],
        },
        {
            "version": "1.0.0",
            "name": "Live QR Dogfooding, Stage Polish, Demo Rehearsal & Final Judge Sprint Reports (13:00 – 17:45 PST)",
            "public_status": "4h 45m afternoon polish & dogfooding runway prior to 18:00 PST Hackathon Stage Demo & Judging.",
            "deliverables": [
                "Live multi-phone QR onboarding dogfooding, mobile UX polish, and 60fps stage graph animations.",
                "Offline snapshot fallback verification, SQLite WAL backup check, and 3-minute stage demo rehearsal.",
                "Final TangleClaw Sprint Report Standard v2.0.0 reports (v0.1.0..v1.0.0) and H-Day Provenance Proof published to /reports/ and GitHub Pages.",
            ],
            "trains": [],
        },
    ],
    "backlog": [
        {
            "name": "Post-Hackathon V2 Integrations",
            "holding": {
                "title": "Post-Hackathon V2 holding (Deferred per Web-Only MVP Amendment)",
                "public_note": "Deferred outside the Saturday Hackathon MVP so Ariadne runs as a single self-hosted Node.js + SQLite WAL + SSE web application with zero external bot/broker dependencies.",
            },
            "note": "Explicitly moved out of H-Day MVP per Operator Web-Only Architecture Amendment.",
            "cars": [13, 17],
        }
    ],
}


def _theme(version: str) -> int:
    parts = [int(x) for x in version.split(".")]
    return (parts[0] * 31 + parts[1] * 7 + parts[2]) % 6


def _prerequisite_badges(numbers, issues):
    if not numbers:
        return '<span class="no-prerequisites">—</span>'
    badges = []
    for n in numbers:
        it = issues.get(n)
        state = it["state"] if it else "open"
        href = html.escape(it["url"], quote=True) if it else "#"
        if state == "closed":
            css, label = "satisfied", f"Requires #{n} ({it['code']}) ✓"
        elif state == "dropped":
            css, label = "dropped", f"Dependency #{n} dropped"
        else:
            css, label = "waiting", f"Waiting on #{n} ({it['code']})"
        badges.append(f'<span class="prerequisite prerequisite-{css}"><a href="{href}">{html.escape(label)}</a></span>')
    return " ".join(badges)


def _issue_table(numbers, issues, public=False, sequence=False, waits_on=None):
    waits_on = waits_on or {}
    rows = []
    for pos, n in enumerate(numbers, 1):
        it = issues[n]
        state = it["state"]
        state_text = STATE_TEXT[state]
        seq_cell = (
            f'<td class="sequence"><span class="sequence-marker" aria-label="Build step {pos}">{pos}</span></td>'
            if sequence else ""
        )
        prereq_cell = (
            f'<td class="prerequisites">{_prerequisite_badges(waits_on.get(str(n), []), issues)}</td>'
            if sequence else ""
        )
        env_detail = (
            f'<span class="progress-detail">Exclusive file envelope: <code>{html.escape(it["envelope"])}</code></span>'
            if not public and it.get("envelope") else ""
        )
        exec_cls, exec_lbl = EXEC_MODES.get(n, ("autonomous", "⚡ Fully autonomous"))
        exec_badge = f'<span class="exec-pill exec-{exec_cls}">{html.escape(exec_lbl)}</span>'
        rows.append(
            f'<tr class="issue-row row-state-{state}" data-issue="{n}">'
            f"{seq_cell}"
            f'<td><a href="{html.escape(it["url"], quote=True)}">#{n} ({html.escape(it["code"])})</a></td>'
            f'<td><span class="state state-{state}">{html.escape(state_text)}</span> {exec_badge}{env_detail}</td>'
            f"{prereq_cell}"
            f'<td><span class="issue-type">{html.escape(it["type"])}</span> '
            f'<span class="planned-title">{html.escape(it["title"])}</span></td>'
            f"</tr>"
        )
    seq_head = '<th scope="col">Order</th>' if sequence else ""
    prereq_head = '<th scope="col">Prerequisites</th>' if sequence else ""
    return (
        f'<div class="table-scroll"><table><thead><tr>{seq_head}<th scope="col">Issue</th>'
        f'<th scope="col">Status</th>{prereq_head}<th scope="col">Planned item</th></tr></thead>'
        f'<tbody>{"".join(rows)}</tbody></table></div>'
    )


def _render_release(release, issues, public=False, is_current=False):
    version = release["version"]
    cars = [n for t in release.get("trains", []) for n in t.get("cars", [])]
    all_closed = bool(cars) and all(issues[n]["state"] in ("closed", "dropped") for n in cars)
    if all_closed or release.get("released_on"):
        stage = "released"
        stage_text = "Released"
    elif is_current:
        stage = "current"
        stage_text = "Current target (Next up at 09:30 PST GO)"
    else:
        stage = "upcoming"
        stage_text = "Upcoming wave"
    open_attr = " open" if (is_current or stage == "released") else ""
    closed_count = sum(1 for n in cars if issues[n]["state"] in ("closed", "dropped"))
    n_streams = len(release.get("trains", []))
    count_text = (
        f"{closed_count}/{len(cars)} completed · {n_streams} parallel Trains / Cars"
        if cars
        else "4h 45m polish, dogfooding & certification window"
    )
    report_link = (
        f' · <a class="released-link" href="reports/v{html.escape(version)}/" style="color:#38bdf8;font-weight:700;">📊 Sprint Report (v{html.escape(version)})</a>'
        if version == "0.1.0" or stage == "released"
        else ""
    )
    deliverables = "".join(f"<li>{html.escape(d)}</li>" for d in release.get("deliverables", []))
    status_line = (
        f'<p class="release-progress"><strong>Wave plan:</strong> {html.escape(release["public_status"])}{report_link}</p>'
        if release.get("public_status") else ""
    )
    beside_line = (
        f'<p class="builds-beside" style="margin:0.5rem 0 0.85rem;font-size:0.86rem;color:#94a3b8;">'
        f'<span class="parallel parallel-ok">Can run beside this release\'s other parallel workstreams</span> '
        f'— {n_streams} pairwise file-disjoint Trains / Cars (<code>Envelope(A) ∩ Envelope(B) = ∅</code> · 0 shared files)</p>'
        if n_streams > 1
        else ""
    )
    track_names = {
        "Ariadne-Lane-A": "Train 1 (Track A — Mobile Participant UX & Contracts)",
        "Ariadne-Lane-B": "Train 2 (Track B — Server Spine, GitHub & Intelligence Agents)",
        "Ariadne-Lane-C": "Train 3 (Track C — Event Stream, Scorer, Explanations & Worker)",
        "Ariadne-Lane-D": "Train 4 (Track D — 16:9 Stage Visualizer & Sprint Reports Hub)",
    }
    streams = []
    for idx, stream in enumerate(release.get("trains", []), 1):
        owner = stream.get("owner", "")
        train_prefix = track_names.get(owner, f"Train {idx}")
        car_total = len(stream.get("cars", []))
        meta = [
            f'<span class="identity">{html.escape(train_prefix)} · {html.escape(stream["name"])} ({car_total} {"Car" if car_total == 1 else "Cars"})</span>'
        ]
        if not public and owner:
            meta.append(f'<span>Lane: <code>{html.escape(owner)}</code></span>')
        meta.append('<span class="parallel parallel-ok">Can run beside this release\'s other parallel workstreams (0 shared files)</span>')
        note = f'<p class="stream-note">{html.escape(stream["note"])}</p>' if (not public and stream.get("note")) else ""
        table = _issue_table(stream.get("cars", []), issues, public=public, sequence=True, waits_on=stream.get("waits_on"))
        streams.append(f'<section class="workstream"><header>{"".join(meta)}</header>{note}{table}</section>')
    empty = (
        '<p class="empty">All 15 feature issues complete in v0.1.0–v0.4.0 by 13:00 PST. '
        'v1.0.0 is reserved for live QR dogfooding bug fixes, UI polish, and final v2.0.0 Judge Sprint Reports.</p>'
        if not cars else ""
    )
    rel_exec_cls, rel_exec_lbl = RELEASE_EXEC_MODES.get(version, ("autonomous", "⚡ Fully autonomous"))
    rel_exec_pill = f'<span class="exec-pill exec-{rel_exec_cls}">{html.escape(rel_exec_lbl)}</span>'
    return (
        f'<details class="release-card theme-{_theme(version)}" data-stage="{stage}"{open_attr}>'
        f'<summary><span class="version">v{html.escape(version)}</span>'
        f'<span class="release-name">{html.escape(release["name"])}</span>'
        f'<span><span class="stage stage-{stage}">{stage_text}</span>{rel_exec_pill}</span>'
        f'<span class="release-count">{html.escape(count_text)}</span></summary>'
        f'<div class="release-body"><ul class="deliverables">{deliverables}</ul>'
        f'{status_line}{beside_line}{empty}{"".join(streams)}</div></details>'
    )


def build_page(public: bool, generated: str) -> str:
    title = "Ariadne public roadmap" if public else "Ariadne — Roadmap Board (Internal Fleet View)"
    intro = (
        "Each release combines Trains and Cars of agentic work that proceed 100% in parallel with pairwise disjoint file envelopes "
        "(Envelope(A) ∩ Envelope(B) = ∅). Every issue is sorted into 4 persistent parallel Trains across Ariadne-Lane-A..D "
        "so all 4 Builder lanes run simultaneously with zero shared-file collisions."
    )
    metrics = [
        ("Planned versions", 5),
        ("Pre-staged reports", 1),
        ("Active MVP issues", 15),
        ("Persistent Trains", 4),
        ("Max parallel lanes", 4),
        ("Multi-issue cars needed", 0),
        ("Shared-file collisions", 0),
        ("Post-Hackathon V2 holding", 2),
    ]
    cards = "".join(
        f'<div class="metric"><strong>{html.escape(str(val))}</strong>{html.escape(label)}</div>'
        for label, val in metrics
    )
    legend = (
        '<div class="reading-guide"><strong>How to read this Roadmap (Trains &amp; Cars · Pairwise Disjoint File Envelopes)</strong>'
        'Issues are arranged across v0.1.0 → v0.2.0 → v0.3.0 → v0.4.0 → v1.0.0 into <strong>4 persistent parallel Trains</strong> '
        '(<code>Train 1 · Track A</code>, <code>Train 2 · Track B</code>, <code>Train 3 · Track C</code>, <code>Train 4 · Track D</code>) '
        'using the TC-Lane-PM File-Collision Sorting Algorithm. Within every release version, every Car has a strictly disjoint '
        'file envelope (<code>Envelope(A) ∩ Envelope(B) = ∅</code>) so all 4 Builder lanes (<code>Ariadne-Lane-A..D</code>) build in parallel '
        'with zero merge conflicts. Cars that touch the same subsystem (e.g. <code>public/app/*</code>, <code>src/intelligence/*</code>, '
        '<code>src/matching/*</code>, <code>public/stage/*</code>) are sequenced into consecutive versions with explicit <code>Waiting on</code> badges.'
        '<div class="status-legend" aria-label="Issue status legend">'
        + "".join(f'<span class="state state-{s}">{html.escape(lbl)}</span>' for s, lbl in STATE_TEXT.items())
        + '<span class="exec-pill exec-autonomous">⚡ Fully autonomous (100% agent-executable)</span>'
        + '<span class="exec-pill exec-hitl">👤 Requires VRF / HITL (Live hardware / tunnel / stage check)</span>'
        + '<span class="exec-pill exec-design">🧭 Needs Operator sign-off / V2</span>'
        + "</div></div>"
    )
    planned_releases = [r for r in ROADMAP_DATA["releases"] if not r.get("released_on")]
    released_releases = list(reversed([r for r in ROADMAP_DATA["releases"] if r.get("released_on")]))
    releases_html = "".join(
        _render_release(r, ISSUES, public=public, is_current=(r["version"] == "0.1.0"))
        for r in planned_releases
    )
    released_section = (
        '<section class="released-view" aria-labelledby="released"><h2 id="released">Released versions (newest first)</h2>'
        + "".join(_render_release(r, ISSUES, public=public, is_current=False) for r in released_releases)
        + "</section>"
        if released_releases else ""
    )
    holding = ROADMAP_DATA["backlog"][0]
    holding_html = (
        '<details class="unsorted-view holding-view"><summary>'
        + html.escape(holding["holding"]["title"])
        + f' <span class="count">{len(holding["cars"])}</span></summary>'
        '<div class="unsorted-body"><p>' + html.escape(holding["holding"]["public_note"]) + "</p>"
        + _issue_table(holding["cars"], ISSUES, public=public, sequence=False)
        + "</div></details>"
    )
    nav = (
        '<p><a href="reports/">📊 Autonomous Sprint Reports Hub (v2.0.0)</a> · '
        '<a href="reports/v0.1.0/">🔬 Sprint v0.1.0 Executive Report</a> · '
        '<a href="https://cursatory.tail123678.ts.net:8443/plans/149/MASTER_SSOT.md">Master SSOT Document Index</a> · '
        '<a href="https://cursatory.tail123678.ts.net:8443/plans/149/LANE_QUEUE.md">Live Fleet Dispatch Queue</a></p>'
    )
    notice = (
        '<div class="notice"><strong>Pre-Event Preparation View (Zero Application Code Before Saturday Nov 7 @ 09:30 AM PST GO).</strong>'
        'All 15 MVP issues (#1–#12, #14–#16) are sorted and staged for parallel execution. Clicking any issue opens its full specification.</div>'
    )
    body = (
        legend
        + '<section aria-labelledby="planned"><h2 id="planned">Planned versions (Saturday, November 7, 2026)</h2>'
        + releases_html
        + "</section>"
        + released_section
        + holding_html
    )
    return (
        '<!doctype html>\n<html lang="en"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        f"<title>{html.escape(title)}</title><style>{PREVIEW_CSS}</style></head><body><main>"
        f"<h1>{html.escape(title)}</h1><p class=\"lede\">{html.escape(intro)}</p>{notice}{nav}"
        f'<div class="summary-grid">{cards}</div>{body}'
        f"<footer>Snapshot: <time>{html.escape(generated)}</time> · Ariadne-PM (#149) · Tagline: Find Your Thread.</footer>"
        "</main></body></html>\n"
    )


def main():
    HERE.mkdir(parents=True, exist_ok=True)
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    generated = datetime.now(ZoneInfo("America/Los_Angeles")).strftime("%Y-%m-%d %H:%M:%S %Z")
    (HERE / "roadmap2-data.json").write_text(json.dumps(ROADMAP_DATA, indent=2) + "\n", encoding="utf-8")
    (HERE / "index.html").write_text(build_page(public=False, generated=generated), encoding="utf-8")
    (HERE / "Ariadne-Public-Roadmap-preview.html").write_text(build_page(public=True, generated=generated), encoding="utf-8")
    (HERE / "roadmap-sync-status.json").write_text(
        json.dumps({"state": "ok", "snapshot": generated, "checkedAt": generated}, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Built {HERE / 'index.html'} and {HERE / 'Ariadne-Public-Roadmap-preview.html'} at {generated}")


if __name__ == "__main__":
    main()

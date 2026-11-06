#!/usr/bin/env python3
"""Allow-list static HTTP server for the Ariadne Interactive Roadmap Board, Sprint Reports Hub & Branded Docs Portal (PortHub 3422)."""

from datetime import datetime
import html
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo

HERE = Path(__file__).resolve().parent
ROOT_DIR = HERE.parent
REPORTS_DIR = ROOT_DIR / "sprint-reports"
PLANS_DIR = ROOT_DIR / ".tangleclaw" / "plans"

FILES = {
    "/": (HERE / "index.html", "text/html; charset=utf-8"),
    "/index.html": (HERE / "index.html", "text/html; charset=utf-8"),
    "/roadmap-board": (HERE / "index.html", "text/html; charset=utf-8"),
    "/roadmap-board/": (HERE / "index.html", "text/html; charset=utf-8"),
    "/roadmap-board/index.html": (HERE / "index.html", "text/html; charset=utf-8"),
    "/public": (HERE / "Ariadne-Public-Roadmap-preview.html", "text/html; charset=utf-8"),
    "/Ariadne-Public-Roadmap-preview.html": (HERE / "Ariadne-Public-Roadmap-preview.html", "text/html; charset=utf-8"),
    "/roadmap-board/Ariadne-Public-Roadmap-preview.html": (HERE / "Ariadne-Public-Roadmap-preview.html", "text/html; charset=utf-8"),
    "/roadmap-sync-status.json": (HERE / "roadmap-sync-status.json", "application/json; charset=utf-8"),
    "/roadmap-board/roadmap-sync-status.json": (HERE / "roadmap-sync-status.json", "application/json; charset=utf-8"),
    "/tangleclaw-logo.png": (HERE / "tangleclaw-logo.png", "image/png"),
    "/roadmap-board/tangleclaw-logo.png": (HERE / "tangleclaw-logo.png", "image/png"),
    "/reports": (REPORTS_DIR / "index.html", "text/html; charset=utf-8"),
    "/reports/": (REPORTS_DIR / "index.html", "text/html; charset=utf-8"),
    "/reports/index.html": (REPORTS_DIR / "index.html", "text/html; charset=utf-8"),
    "/sprint-reports": (REPORTS_DIR / "index.html", "text/html; charset=utf-8"),
    "/sprint-reports/": (REPORTS_DIR / "index.html", "text/html; charset=utf-8"),
    "/sprint-reports/index.html": (REPORTS_DIR / "index.html", "text/html; charset=utf-8"),
}

DOC_PAGE_CSS = r"""
:root{color-scheme:light dark;--bg:#f6f8fa;--fg:#1f2328;--muted:#59636e;--line:#d0d7de;--panel:#ffffff;--code-bg:#f0f3f6;--link:#0969da;--accent:#1a7f37}
@media(prefers-color-scheme:dark){:root{--bg:#0d1117;--fg:#e6edf3;--muted:#8b949e;--line:#30363d;--panel:#161b22;--code-bg:#1f242c;--link:#58a6ff;--accent:#3fb950}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif;position:relative;min-height:100vh}
.tc-bg-watermark{position:fixed;inset:0;z-index:0;pointer-events:none;display:flex;align-items:center;justify-content:center;overflow:hidden}
.tc-bg-watermark img{width:min(82vw,860px);height:min(82vw,860px);object-fit:contain;opacity:.08;filter:saturate(1.1) contrast(1.05);user-select:none;-webkit-user-drag:none}
@media(prefers-color-scheme:dark){.tc-bg-watermark img{opacity:.10;filter:drop-shadow(0 0 48px rgba(86,211,100,.18))}}
header.doc-nav{position:sticky;top:0;z-index:20;background:color-mix(in srgb,var(--panel) 88%,transparent);backdrop-filter:blur(12px);border-bottom:1px solid var(--line);padding:.65rem 1.25rem;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.75rem;font-size:.88rem}
.doc-brand{display:inline-flex;align-items:center;gap:.55rem;font-weight:700;color:var(--fg);text-decoration:none}
.doc-brand img{width:24px;height:24px;border-radius:5px;object-fit:contain}
.doc-links{display:flex;gap:1rem;flex-wrap:wrap;font-weight:600}
main.doc-main{position:relative;z-index:1;max-width:980px;margin:0 auto;padding:2rem 1.25rem 5rem}
a{color:var(--link);text-decoration:none}a:hover{text-decoration:underline}
h1,h2,h3,h4{line-height:1.28;margin-top:1.6em;margin-bottom:.5em}
h1{font-size:1.95rem;margin-top:.4em;padding-bottom:.35rem;border-bottom:1px solid var(--line)}
h2{font-size:1.42rem;padding-bottom:.25rem;border-bottom:1px solid var(--line)}
h3{font-size:1.15rem}
p,ul,ol,blockquote,pre,table{margin:0 0 1rem}
ul,ol{padding-left:1.5rem}
li+li{margin-top:.25rem}
code{font:0.88em/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;background:var(--code-bg);padding:.14rem .38rem;border-radius:5px}
pre{background:var(--code-bg);border:1px solid var(--line);border-radius:8px;padding:.95rem 1.1rem;overflow-x:auto}
pre code{background:none;padding:0;font-size:.84rem}
blockquote{margin-left:0;padding:.5rem 1rem;border-left:4px solid var(--link);background:color-mix(in srgb,var(--panel) 85%,transparent);border-radius:0 8px 8px 0;color:var(--muted)}
hr{border:0;border-top:1px solid var(--line);margin:1.75rem 0}
.table-wrap{overflow-x:auto;margin:1rem 0}
table{width:100%;border-collapse:collapse;background:color-mix(in srgb,var(--panel) 88%,transparent);border:1px solid var(--line);border-radius:8px;overflow:hidden;font-size:.9rem}
th,td{text-align:left;padding:.55rem .75rem;border-bottom:1px solid var(--line);vertical-align:top}
th{background:var(--code-bg);font-weight:700}
.doc-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:.85rem;margin:1.25rem 0}
.doc-card{display:block;padding:1rem;border:1px solid var(--line);border-radius:10px;background:color-mix(in srgb,var(--panel) 88%,transparent);transition:border-color .15s,transform .15s}
.doc-card:hover{border-color:var(--link);transform:translateY(-2px);text-decoration:none}
.doc-card strong{display:block;color:var(--fg);font-size:.98rem;margin-bottom:.25rem}
.doc-card span{color:var(--muted);font-size:.82rem}
footer.doc-footer{margin-top:3rem;padding-top:1rem;border-top:1px solid var(--line);color:var(--muted);font-size:.84rem}
"""


def _render_inline_md(text: str) -> str:
    """Render inline markdown (code spans, links, bold, italic) safely after HTML-escaping."""
    placeholders = []

    def _stash(html_fragment: str) -> str:
        idx = len(placeholders)
        placeholders.append(html_fragment)
        return f"\x00PH{idx}\x00"

    def _code_repl(m):
        return _stash(f"<code>{html.escape(m.group(1))}</code>")

    text = re.sub(r"`([^`]+)`", _code_repl, text)

    def _link_repl(m):
        label = html.escape(m.group(1))
        href = m.group(2).strip()
        if href.startswith("https://cursatory.tail123678.ts.net:8443/plans/149/"):
            fname = href.rsplit("/", 1)[-1]
            href = f"/docs/{fname}"
        return _stash(f'<a href="{html.escape(href, quote=True)}">{label}</a>')

    text = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", _link_repl, text)
    escaped = html.escape(text)
    escaped = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", escaped)
    escaped = re.sub(r"\*([^*]+)\*", r"<em>\1</em>", escaped)
    for idx, frag in enumerate(placeholders):
        escaped = escaped.replace(f"\x00PH{idx}\x00", frag)
    return escaped


def render_markdown_to_html(md_text: str, title: str, file_name: str, mtime_str: str) -> bytes:
    """Render a Markdown document into a full HTML page with the static TangleClaw watermark."""
    lines = md_text.splitlines()
    out = []
    in_code = False
    code_lines = []
    in_ul = False
    in_ol = False
    table_rows = []

    def _flush_lists():
        nonlocal in_ul, in_ol
        if in_ul:
            out.append("</ul>")
            in_ul = False
        if in_ol:
            out.append("</ol>")
            in_ol = False

    def _flush_table():
        nonlocal table_rows
        if not table_rows:
            return
        if len(table_rows) >= 2 and re.fullmatch(r"[\s|:-]+", table_rows[1]):
            headers = [c.strip() for c in table_rows[0].strip("|").split("|")]
            body_rows = table_rows[2:]
            th_html = "".join(f"<th>{_render_inline_md(h)}</th>" for h in headers)
            trs = []
            for r in body_rows:
                cols = [c.strip() for c in r.strip("|").split("|")]
                tds = "".join(f"<td>{_render_inline_md(c)}</td>" for c in cols)
                trs.append(f"<tr>{tds}</tr>")
            out.append(f'<div class="table-wrap"><table><thead><tr>{th_html}</tr></thead><tbody>{"".join(trs)}</tbody></table></div>')
        else:
            for r in table_rows:
                out.append(f"<p>{_render_inline_md(r)}</p>")
        table_rows = []

    for line in lines:
        if line.strip().startswith("```"):
            _flush_lists()
            _flush_table()
            if not in_code:
                in_code = True
                code_lines = []
            else:
                in_code = False
                out.append(f"<pre><code>{html.escape(chr(10).join(code_lines))}</code></pre>")
            continue
        if in_code:
            code_lines.append(line)
            continue

        stripped = line.strip()
        if stripped.startswith("|") and stripped.endswith("|"):
            _flush_lists()
            table_rows.append(stripped)
            continue
        else:
            _flush_table()

        if not stripped:
            _flush_lists()
            continue

        if re.fullmatch(r"---+|___+|\*\*\*+", stripped):
            _flush_lists()
            out.append("<hr>")
            continue

        m_h = re.match(r"^(#{1,4})\s+(.*)$", stripped)
        if m_h:
            _flush_lists()
            lvl = len(m_h.group(1))
            out.append(f"<h{lvl}>{_render_inline_md(m_h.group(2))}</h{lvl}>")
            continue

        if stripped.startswith(">"):
            _flush_lists()
            q_body = stripped.lstrip(">").strip()
            out.append(f"<blockquote>{_render_inline_md(q_body)}</blockquote>")
            continue

        m_ul = re.match(r"^[-*]\s+(.*)$", stripped)
        if m_ul:
            if in_ol:
                out.append("</ol>")
                in_ol = False
            if not in_ul:
                out.append("<ul>")
                in_ul = True
            out.append(f"<li>{_render_inline_md(m_ul.group(1))}</li>")
            continue

        m_ol = re.match(r"^\d+\.\s+(.*)$", stripped)
        if m_ol:
            if in_ul:
                out.append("</ul>")
                in_ul = False
            if not in_ol:
                out.append("<ol>")
                in_ol = True
            out.append(f"<li>{_render_inline_md(m_ol.group(1))}</li>")
            continue

        _flush_lists()
        out.append(f"<p>{_render_inline_md(stripped)}</p>")

    _flush_lists()
    _flush_table()
    if in_code:
        out.append(f"<pre><code>{html.escape(chr(10).join(code_lines))}</code></pre>")

    page_html = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>{html.escape(title)} · Ariadne Documentation (Powered by TangleClaw)</title>
  <style>{DOC_PAGE_CSS}</style>
</head>
<body>
  <div class="tc-bg-watermark" aria-hidden="true">
    <img src="/tangleclaw-logo.png" onerror="this.onerror=null;this.src='https://raw.githubusercontent.com/Jason-Vaughan/project-assets/main/tangleclaw-logo.png'" alt="">
  </div>
  <header class="doc-nav">
    <a class="doc-brand" href="/docs/">
      <img src="/tangleclaw-logo.png" onerror="this.onerror=null;this.src='https://raw.githubusercontent.com/Jason-Vaughan/project-assets/main/tangleclaw-logo.png'" alt="">
      <span>Ariadne Documentation · Orchestrated by TangleClaw</span>
    </a>
    <nav class="doc-links">
      <a href="/">🗺️ Roadmap Board</a>
      <a href="/reports">📊 Sprint Reports</a>
      <a href="/docs/">📚 All Docs ({html.escape(file_name)})</a>
      <a href="https://cursatory.tail123678.ts.net:8443/plans/149/{html.escape(file_name)}">🔒 TangleClaw Raw Plan</a>
    </nav>
  </header>
  <main class="doc-main">
    {"".join(out)}
    <footer class="doc-footer">
      Document: <code>{html.escape(file_name)}</code> · Updated: <time>{html.escape(mtime_str)}</time> · Ariadne-PM (#149) · Static TangleClaw Watermark Active
    </footer>
  </main>
</body>
</html>
"""
    return page_html.encode("utf-8")


def render_docs_index() -> bytes:
    """Render the /docs/ portal index listing all Ariadne markdown specifications with the static TangleClaw watermark."""
    md_files = sorted(PLANS_DIR.glob("*.md"))
    cards = []
    for p in md_files:
        text = p.read_text(encoding="utf-8", errors="replace")
        m_title = re.search(r"^#\s+(.+)$", text, re.M)
        doc_title = m_title.group(1).strip() if m_title else p.name
        mtime = datetime.fromtimestamp(p.stat().st_mtime, ZoneInfo("America/Los_Angeles")).strftime("%Y-%m-%d %H:%M PST")
        cards.append(
            f'<a class="doc-card" href="/docs/{html.escape(p.name)}">'
            f"<strong>{html.escape(p.name)}</strong>"
            f"<span>{html.escape(doc_title[:95])} · {html.escape(mtime)}</span></a>"
        )
    page_html = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Ariadne Documentation Portal · Orchestrated by TangleClaw</title>
  <style>{DOC_PAGE_CSS}</style>
</head>
<body>
  <div class="tc-bg-watermark" aria-hidden="true">
    <img src="/tangleclaw-logo.png" onerror="this.onerror=null;this.src='https://raw.githubusercontent.com/Jason-Vaughan/project-assets/main/tangleclaw-logo.png'" alt="">
  </div>
  <header class="doc-nav">
    <a class="doc-brand" href="/docs/">
      <img src="/tangleclaw-logo.png" onerror="this.onerror=null;this.src='https://raw.githubusercontent.com/Jason-Vaughan/project-assets/main/tangleclaw-logo.png'" alt="">
      <span>Ariadne Documentation Portal · Orchestrated by TangleClaw</span>
    </a>
    <nav class="doc-links">
      <a href="/">🗺️ Roadmap Board</a>
      <a href="/public">🌐 Public Roadmap Preview</a>
      <a href="/reports">📊 Sprint Reports Hub</a>
      <a href="/docs/MASTER_SSOT.md">⭐ Master SSOT</a>
      <a href="/docs/VISUALIZER_SPEC.md">🖥️ Stage Visualizer Spec</a>
      <a href="/docs/DEMO_RUNBOOK.md">🎬 Demo Runbook</a>
    </nav>
  </header>
  <main class="doc-main">
    <h1>Ariadne — Full Documentation Library ({len(md_files)} Canonical Specs)</h1>
    <p>Every specification, charter, runbook, and issue contract in <code>Ariadne-PM (#149)</code> rendered with the fixed static TangleClaw background watermark for live screen-share presentations.</p>
    <div class="doc-grid">{"".join(cards)}</div>
  </main>
</body>
</html>
"""
    return page_html.encode("utf-8")


class Handler(BaseHTTPRequestHandler):
    """Serve allow-listed Ariadne roadmap, sprint report, and branded documentation pages."""

    def _resolve_content(self, raw_path: str):
        path = urlsplit(raw_path).path
        item = FILES.get(path)
        if item and item[0].is_file():
            return (item[0].read_bytes(), item[1])

        if path in ("/docs", "/docs/", "/docs/index.html"):
            return (render_docs_index(), "text/html; charset=utf-8")

        m_doc = re.fullmatch(r"/(?:docs|plans/149)/([A-Za-z0-9][A-Za-z0-9._-]{0,199}\.md)", path)
        if m_doc:
            fname = m_doc.group(1)
            candidate = PLANS_DIR / fname
            if not candidate.is_file():
                candidate = ROOT_DIR / fname
            if candidate.is_file():
                md_text = candidate.read_text(encoding="utf-8", errors="replace")
                m_title = re.search(r"^#\s+(.+)$", md_text, re.M)
                title = m_title.group(1).strip() if m_title else fname
                mtime = datetime.fromtimestamp(candidate.stat().st_mtime, ZoneInfo("America/Los_Angeles")).strftime("%Y-%m-%d %H:%M:%S %Z")
                return (render_markdown_to_html(md_text, title, fname, mtime), "text/html; charset=utf-8")

        m = re.fullmatch(r"/reports/(v\d+\.\d+\.\d+(?:-v\d+\.\d+\.\d+-retrospective)?)(?:/|/index\.html|\.html)?", path)
        if m:
            candidate = REPORTS_DIR / m.group(1) / "index.html"
            if candidate.is_file():
                return (candidate.read_bytes(), "text/html; charset=utf-8")
        m_flat = re.fullmatch(r"/sprint-(v\d+\.\d+\.\d+(?:-v\d+\.\d+\.\d+-retrospective)?)\.html", path)
        if m_flat:
            candidate = REPORTS_DIR / m_flat.group(1) / "index.html"
            if candidate.is_file():
                return (candidate.read_bytes(), "text/html; charset=utf-8")
        m_asset = re.fullmatch(r"/reports/assets/([a-zA-Z0-9._-]+\.png)", path)
        if m_asset:
            candidate = REPORTS_DIR / "assets" / m_asset.group(1)
            if candidate.is_file():
                return (candidate.read_bytes(), "image/png")
        return None

    def do_HEAD(self):
        """Handle HEAD requests for roadmap, report, and documentation pages."""
        resolved = self._resolve_content(self.path)
        if not resolved:
            self.send_error(404)
            return
        content, ctype = resolved
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()

    def do_GET(self):
        """Handle GET requests for roadmap, report, and documentation pages."""
        resolved = self._resolve_content(self.path)
        if not resolved:
            self.send_error(404)
            return
        content, ctype = resolved
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(content)

    def log_message(self, pattern, *args):
        """Log HTTP requests to stdout."""
        print(f"{self.address_string()} - {pattern % args}", flush=True)


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", 3422), Handler).serve_forever()

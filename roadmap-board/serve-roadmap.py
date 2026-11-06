#!/usr/bin/env python3
"""Allow-list static HTTP server for the Ariadne Interactive Roadmap Board & Sprint Reports Hub (PortHub 3422)."""

import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

HERE = Path(__file__).resolve().parent
REPORTS_DIR = HERE.parent / "sprint-reports"
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
    "/reports": (REPORTS_DIR / "index.html", "text/html; charset=utf-8"),
    "/reports/": (REPORTS_DIR / "index.html", "text/html; charset=utf-8"),
    "/reports/index.html": (REPORTS_DIR / "index.html", "text/html; charset=utf-8"),
    "/sprint-reports": (REPORTS_DIR / "index.html", "text/html; charset=utf-8"),
    "/sprint-reports/": (REPORTS_DIR / "index.html", "text/html; charset=utf-8"),
    "/sprint-reports/index.html": (REPORTS_DIR / "index.html", "text/html; charset=utf-8"),
}


class Handler(BaseHTTPRequestHandler):
    """Serve allow-listed Ariadne roadmap and sprint report static HTML files."""

    def _resolve(self, raw_path: str):
        path = urlsplit(raw_path).path
        item = FILES.get(path)
        if item:
            return item
        m = re.fullmatch(r"/reports/(v\d+\.\d+\.\d+(?:-v\d+\.\d+\.\d+-retrospective)?)(?:/|/index\.html|\.html)?", path)
        if m:
            candidate = REPORTS_DIR / m.group(1) / "index.html"
            if candidate.is_file():
                return (candidate, "text/html; charset=utf-8")
        m_flat = re.fullmatch(r"/sprint-(v\d+\.\d+\.\d+(?:-v\d+\.\d+\.\d+-retrospective)?)\.html", path)
        if m_flat:
            candidate = REPORTS_DIR / m_flat.group(1) / "index.html"
            if candidate.is_file():
                return (candidate, "text/html; charset=utf-8")
        m_asset = re.fullmatch(r"/reports/assets/([a-zA-Z0-9._-]+\.png)", path)
        if m_asset:
            candidate = REPORTS_DIR / "assets" / m_asset.group(1)
            if candidate.is_file():
                return (candidate, "image/png")
        return None

    def do_HEAD(self):
        """Handle HEAD requests for roadmap and report HTML files."""
        item = self._resolve(self.path)
        if not item or not item[0].is_file():
            self.send_error(404)
            return
        size = item[0].stat().st_size
        self.send_response(200)
        self.send_header("Content-Type", item[1])
        self.send_header("Content-Length", str(size))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()

    def do_GET(self):
        """Handle GET requests for roadmap and report HTML files."""
        item = self._resolve(self.path)
        if not item or not item[0].is_file():
            self.send_error(404)
            return
        content = item[0].read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", item[1])
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

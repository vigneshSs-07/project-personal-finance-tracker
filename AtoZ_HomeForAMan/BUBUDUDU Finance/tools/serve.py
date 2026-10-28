"""Serve the SDK folder locally for development and testing.

Usage: python tools/serve.py [port]     (default 8765)
Then open http://localhost:8765/ (the app) or http://localhost:8765/tests/ (unit tests).
localhost counts as a secure context, so the service worker and install prompt work.
"""
import http.server
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=str(ROOT), **k)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


if __name__ == "__main__":
    print(f"Serving {ROOT} at http://localhost:{PORT}/  (Ctrl+C to stop)")
    http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()

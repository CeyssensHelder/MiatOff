"""Standalone loopback-only Meters Designer. GPL-3.0-or-later."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import os
import json
import hashlib
from pathlib import Path
import secrets
import socket
import threading
from urllib.parse import unquote, urlsplit
import webbrowser
import meters_library

ROOT = Path(__file__).resolve().parents[1] / "meters"
DEFAULT_PORT = 8890


class Server(ThreadingHTTPServer):
    """Refuse a port that is already in use. On Windows SO_REUSEADDR (the http.server default)
    lets a second server bind the same port, and requests then reach either one."""
    allow_reuse_address = os.name != "nt"

    def __init__(self, address, handler, library_path=None):
        self.library = meters_library.PageLibrary(library_path)
        self.test_library = library_path is not None
        self.library_id = hashlib.sha256(str(self.library.path.resolve()).encode()).hexdigest()
        self.handoff_token = secrets.token_urlsafe(32)
        super().__init__(address, handler)

    def server_bind(self):
        if os.name == "nt":
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()

class Handler(SimpleHTTPRequestHandler):
    def trusted_host(self):
        return self.headers.get("Host") in (
            f"127.0.0.1:{self.server.server_port}", f"localhost:{self.server.server_port}")

    def json_response(self, value, status=200, head=False):
        data = meters_library.encode(value)
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        if not head:
            self.wfile.write(data)

    def api_get(self, path, head=False):
        try:
            if path == "/api/builder/session":
                self.json_response({"service": "MiatOffDesigner", "protocol": 2, "testLibrary": self.server.test_library,
                                    "libraryId": self.server.library_id,
                                    "token": self.server.handoff_token}, head=head)
            elif path in ("/api/builder/themes", "/api/builder/pages"):
                self.json_response({"themes": self.server.library.list()}, head=head)
            elif path.startswith(("/api/builder/themes/", "/api/builder/pages/")):
                self.json_response(self.server.library.get(path.rsplit("/", 1)[1]), head=head)
            else:
                self.json_response({"error": "Unknown builder endpoint"}, 404, head)
        except KeyError:
            self.json_response({"error": "Custom meter not found. Refresh the builder library."}, 404, head)
        except Exception as error:
            self.json_response({"error": "Builder library could not be read: " + str(error)}, 422, head)

    def serve_asset(self, head=False):
        if not self.trusted_host():
            self.send_error(403, "Use the local designer address")
            return
        path = unquote(urlsplit(self.path).path)
        if path.startswith("/api/"):
            self.api_get(path, head)
            return
        if path == "/":
            self.send_response(302)
            self.send_header("Location", "/designer/index.html")
            self.end_headers()
            return
        target = (ROOT / path.lstrip("/")).resolve()
        allowed = any(target.is_relative_to(ROOT / folder) for folder in ("designer", "js", "fonts"))
        if not allowed or not target.is_file():
            self.send_error(404)
            return
        if head:
            super().do_HEAD()
        else:
            super().do_GET()

    def do_GET(self):
        self.serve_asset()

    def do_HEAD(self):
        self.serve_asset(head=True)

    def do_POST(self):
        origin = self.headers.get("Origin")
        allowed = f"http://{self.headers.get('Host')}"
        token = self.headers.get("X-MiatOff-Token", "")
        if not self.trusted_host() or origin != allowed or not secrets.compare_digest(token, self.server.handoff_token):
            self.json_response({"error": "Open the designer from this PC's MiatOff builder and retry."}, 403)
            return
        route = urlsplit(self.path).path
        if route not in ("/api/builder/pages", "/api/builder/pages/plan"):
            self.json_response({"error": "Unknown builder endpoint"}, 404)
            return
        if self.headers.get("Content-Type", "").split(";")[0] != "application/json":
            self.json_response({"error": "Send application/json"}, 415)
            return
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if not 0 < size <= meters_library.MAX_DOCUMENT:
                self.json_response({"error": "Theme must be no larger than 8 MiB"}, 413)
                return
            self.connection.settimeout(10)
            data = self.rfile.read(size)
            if len(data) != size:
                raise ValueError("Incomplete theme; retry sending it")
            def invalid_constant(value):
                raise ValueError("Nonfinite JSON number")
            setup = json.loads(data, parse_constant=invalid_constant)
            if route.endswith("/plan"):
                # Dry run: report which pages a send would remove; nothing is written.
                self.json_response(self.server.library.plan_sync(setup))
                return
            confirmed = [item for item in self.headers.get("X-MiatOff-Confirm-Removal", "").split(",") if item]
            self.json_response(self.server.library.sync(setup, confirm_removal=confirmed))
        except meters_library.RemovalNotConfirmed as error:
            self.json_response({"error": str(error), "code": "removal-unconfirmed", "removed": error.removed}, 409)
        except (ValueError, KeyError, TypeError, AttributeError, RecursionError) as error:
            self.json_response({"error": "Theme not sent: " + str(error)}, 422)
        except Exception as error:
            self.json_response({"error": "Could not save to the builder library: " + str(error)}, 500)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()

    def list_directory(self, path):
        self.send_error(404)


def launch(port=DEFAULT_PORT, open_browser=True, library_path=None):
    """Keep a stable origin so browser drafts survive a server restart."""
    server = Server(("127.0.0.1", port), partial(Handler, directory=str(ROOT)), library_path)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{server.server_port}/designer/index.html"
    print(f"Meters Designer: {url}", flush=True)
    if open_browser:
        webbrowser.open(url)
    return server

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument("--no-browser", action="store_true")
    parser.add_argument("--library-db", type=Path, help="Library database (use a temporary path in tests)")
    args = parser.parse_args()
    try:
        server = launch(args.port, not args.no_browser, args.library_db)
    except OSError as error:
        parser.exit(1, f"Cannot start Meters Designer on port {args.port}: {error}. Choose --port NUMBER.\n")
    try:
        threading.Event().wait()
    except KeyboardInterrupt:
        server.shutdown()
        server.server_close()

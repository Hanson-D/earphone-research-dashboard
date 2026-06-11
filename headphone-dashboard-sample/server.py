#!/usr/bin/env python3
import json
import mimetypes
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, urlparse


IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".heic"}
ALLOWED_ROOTS = set()


def is_within_allowed_root(path):
    resolved = path.resolve()
    return any(resolved == root or root in resolved.parents for root in ALLOWED_ROOTS)


class DashboardHandler(SimpleHTTPRequestHandler):
    def send_json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path != "/api/scan-photos":
            self.send_error(404)
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length) or b"{}")
            root = Path(payload.get("root", "")).expanduser().resolve()
        except (ValueError, json.JSONDecodeError):
            self.send_json({"error": "无效的请求。"}, 400)
            return

        if not root.is_dir():
            self.send_json({"error": f"照片根目录不存在：{root}"}, 400)
            return

        ALLOWED_ROOTS.add(root)
        photos = []
        for path in root.rglob("*"):
            if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS:
                relative = path.relative_to(root)
                photos.append({
                    "name": path.name,
                    "relative_path": relative.as_posix(),
                    "absolute_path": str(path.resolve()),
                    "user_folder": relative.parts[0] if len(relative.parts) > 1 else "",
                    "url": f"/api/photo?path={quote(str(path.resolve()))}",
                })

        photos.sort(key=lambda item: (item["user_folder"], item["name"].lower(), item["relative_path"].lower()))
        self.send_json({"root": str(root), "photos": photos})

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path != "/api/photo":
            super().do_GET()
            return

        values = parse_qs(parsed.query).get("path", [])
        if not values:
            self.send_error(400, "Missing path")
            return

        path = Path(values[0]).expanduser()
        if not path.is_file() or not is_within_allowed_root(path):
            self.send_error(403, "Photo path is not inside a scanned root")
            return

        content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        data = path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


if __name__ == "__main__":
    os.chdir(Path(__file__).resolve().parent)
    port = int(os.environ.get("PORT", "8000"))
    server = ThreadingHTTPServer(("127.0.0.1", port), DashboardHandler)
    print(f"Dashboard: http://127.0.0.1:{port}")
    print("Press Ctrl+C to stop.")
    server.serve_forever()

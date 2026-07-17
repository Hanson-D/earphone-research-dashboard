#!/usr/bin/env python3
import json
import mimetypes
import os
import re
import shutil
import socket
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, urlparse


IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".heic"}
ALLOWED_ROOTS = set()
PROJECT_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")
DEFAULT_PORT = 7362
PORT_SEARCH_LIMIT = 100
DEFAULT_HOST = "0.0.0.0"


def app_root():
    return Path(__file__).resolve().parents[1]


def project_root():
    configured = os.environ.get("DASHBOARD_PROJECTS_ROOT", "projects")
    path = Path(configured).expanduser()
    if not path.is_absolute():
        path = app_root() / path
    return path.resolve()


def project_scan_roots():
    roots = [project_root()]
    if os.environ.get("DASHBOARD_PROJECTS_ROOT"):
        return roots
    base = app_root().resolve()
    for parent in [base, *base.parents][:6]:
        candidate = (parent / "projects").resolve()
        if candidate not in roots:
            roots.append(candidate)
    return roots


def display_path(path):
    resolved = Path(path).expanduser().resolve()
    try:
        return resolved.relative_to(app_root()).as_posix()
    except ValueError:
        return str(resolved)


def resolve_client_path(value):
    raw = Path(str(value or "")).expanduser()
    return raw.resolve()


def safe_relative_root(value, fallback="photos"):
    text = str(value or fallback).strip() or fallback
    if Path(text).is_absolute() or re.match(r"^[A-Za-z]:[\\/]", text):
        raise ValueError("照片根目录必须是相对路径。")
    parts = [part for part in Path(text).parts if part not in ("", ".")]
    if any(part == ".." for part in parts):
        raise ValueError("照片根目录不能包含上级目录。")
    return Path(*parts) if parts else Path(fallback)


def is_valid_project_id(project_id):
    return bool(PROJECT_ID_PATTERN.fullmatch(project_id or ""))


def server_project_path(project_id):
    if not is_valid_project_id(project_id):
        raise ValueError("项目 ID 只能包含字母、数字、下划线和连字符，长度 1-64。")
    return project_root() / f"{project_id}.json"


def server_project_photo_root(project_id):
    if not is_valid_project_id(project_id):
        raise ValueError("项目 ID 只能包含字母、数字、下划线和连字符，长度 1-64。")
    return project_root() / f"{project_id}_assets" / "photos"


def bare_ear_library_root():
    return project_root() / "bare_ears"


def safe_library_part(value, fallback="unknown"):
    clean = re.sub(r"[^A-Za-z0-9_\-\u4e00-\u9fff]+", "_", str(value or "").strip()).strip("._-")
    return clean[:80] or fallback


def export_timestamp():
    return __import__("datetime").datetime.now().strftime("%Y%m%d_%H%M%S")


def save_project_csv_export(project_path_value, csv_text, project_name="project"):
    project_path = resolve_client_path(project_path_value)
    if not project_path.name.endswith(".json"):
        raise ValueError("项目路径必须是 JSON 文件。")
    if not isinstance(csv_text, str) or not csv_text.strip():
        raise ValueError("CSV 内容不能为空。")
    export_dir = project_path.parent / "exports"
    export_dir.mkdir(parents=True, exist_ok=True)
    name = safe_library_part(project_name, project_path.stem)
    target = export_dir / f"{name}_{export_timestamp()}.csv"
    target.write_text("\ufeff" + csv_text, encoding="utf-8")
    return {"path": display_path(target)}


def bare_ear_library_index():
    root = bare_ear_library_root()
    if not root.is_dir():
        return []
    photos = []
    for path in sorted(root.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in IMAGE_EXTENSIONS:
            continue
        try:
            relative = path.relative_to(root)
        except ValueError:
            continue
        parts = relative.parts
        if len(parts) < 3:
            continue
        user, field = parts[0], parts[1]
        rel = relative.as_posix()
        photos.append({
            "user": user,
            "field": field,
            "name": path.name,
            "path": rel,
            "url": f"/api/bare-ear-photo?path={quote(rel)}",
        })
    return photos


def save_bare_ear_library_photos(photos):
    root = bare_ear_library_root()
    root.mkdir(parents=True, exist_ok=True)
    saved = []
    skipped = []
    for item in photos:
        user = safe_library_part(item.get("user"), "user")
        field = safe_library_part(item.get("field"), "bare_ear_photo")
        source = Path(str(item.get("source") or "")).expanduser().resolve()
        if not source.is_file() or source.suffix.lower() not in IMAGE_EXTENSIONS or not is_within_allowed_root(source):
            skipped.append({"user": user, "field": field, "reason": "source_unavailable"})
            continue
        target_dir = root / user / field
        target_dir.mkdir(parents=True, exist_ok=True)
        target = target_dir / source.name
        if target.exists():
            stem = source.stem
            suffix = source.suffix
            index = 2
            while (target_dir / f"{stem}_{index}{suffix}").exists():
                index += 1
            target = target_dir / f"{stem}_{index}{suffix}"
        target.write_bytes(source.read_bytes())
        relative = target.relative_to(root).as_posix()
        saved.append({
            "user": user,
            "field": field,
            "name": target.name,
            "path": relative,
            "url": f"/api/bare-ear-photo?path={quote(relative)}",
        })
    return {"saved": saved, "skipped": skipped}


def safe_relative_photo_path(value):
    parts = [part for part in Path(str(value or "")).parts if part not in ("", ".")]
    if not parts or any(part == ".." for part in parts):
        raise ValueError("照片路径无效。")
    path = Path(*parts)
    if path.suffix.lower() not in IMAGE_EXTENSIONS:
        raise ValueError("只支持图片文件。")
    return path


def safe_relative_asset_path(value, allowed_suffixes=None):
    parts = [part for part in Path(str(value or "")).parts if part not in ("", ".")]
    if not parts or any(part == ".." for part in parts):
        raise ValueError("资源路径无效。")
    path = Path(*parts)
    if allowed_suffixes and path.suffix.lower() not in allowed_suffixes:
        raise ValueError("资源文件类型不支持。")
    return path


def local_project_path_from_payload(value):
    project_path = resolve_client_path(value)
    if not project_path.name.endswith(".json"):
        raise ValueError("项目路径必须是 JSON 文件。")
    project_path.parent.mkdir(parents=True, exist_ok=True)
    return project_path


def save_project_asset_file(project_path_value, kind, relative_value, data):
    project_path = local_project_path_from_payload(project_path_value)
    if kind == "csv":
        relative = safe_relative_asset_path(relative_value or "source.csv", {".csv"})
        target = (project_path.parent / "data" / relative.name).resolve()
        project_relative = Path("data") / relative.name
    elif kind == "photo":
        relative = safe_relative_photo_path(relative_value)
        target = (project_path.parent / "photos" / relative).resolve()
        project_relative = Path("photos") / relative
    else:
        raise ValueError("未知资源类型。")
    base = (project_path.parent / ("photos" if kind == "photo" else "data")).resolve()
    if base != target.parent and base not in target.parents:
        raise ValueError("资源保存路径无效。")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    return {"path": project_relative.as_posix(), "bytes": len(data)}


def copy_project_photos_from_root(project_path_value, root_value):
    project_path = local_project_path_from_payload(project_path_value)
    source_root = Path(str(root_value or "")).expanduser().resolve()
    if not source_root.is_dir() or not is_within_allowed_root(source_root):
        raise ValueError("照片根目录未授权或不存在。请先在照片映射页扫描该目录。")
    target_root = (project_path.parent / "photos").resolve()
    target_root.mkdir(parents=True, exist_ok=True)
    copied = 0
    for source in source_root.rglob("*"):
        if not source.is_file() or source.suffix.lower() not in IMAGE_EXTENSIONS:
            continue
        relative = source.relative_to(source_root)
        target = (target_root / relative).resolve()
        if target_root not in target.parents:
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
        copied += 1
    return {"copied": copied, "photoRoot": "photos"}


def project_title(project_id, project):
    meta = project.get("_server", {}) if isinstance(project.get("_server"), dict) else {}
    return meta.get("title") or project.get("title") or project_id


def with_server_meta(project_id, project, title=None, revision=1):
    clean = dict(project)
    previous_meta = clean.get("_server", {}) if isinstance(clean.get("_server"), dict) else {}
    now = __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat()
    clean["_server"] = {
        "id": project_id,
        "title": title or previous_meta.get("title") or clean.get("title") or project_id,
        "revision": revision,
        "createdAt": previous_meta.get("createdAt") or now,
        "updatedAt": now,
    }
    return clean


def read_server_project(project_id):
    path = server_project_path(project_id)
    if not path.is_file():
        raise FileNotFoundError(project_id)
    project = json.loads(path.read_text(encoding="utf-8"))
    meta = project.get("_server", {}) if isinstance(project.get("_server"), dict) else {}
    revision = int(meta.get("revision") or 1)
    return path, project, revision


def list_server_projects():
    root = project_root()
    root.mkdir(parents=True, exist_ok=True)
    projects = []
    for path in sorted(root.glob("*.json")):
        project_id = path.stem
        if not is_valid_project_id(project_id):
            continue
        try:
            project = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            continue
        meta = project.get("_server", {}) if isinstance(project.get("_server"), dict) else {}
        projects.append({
            "id": project_id,
            "title": project_title(project_id, project),
            "revision": int(meta.get("revision") or 1),
            "updatedAt": meta.get("updatedAt") or "",
            "rows": len(project.get("rows", [])) if isinstance(project.get("rows"), list) else 0,
        })
    return projects


def list_local_project_files():
    roots = project_scan_roots()
    roots[0].mkdir(parents=True, exist_ok=True)
    projects = []
    ignored_parts = {"exports", "photos", "bare_ears"}
    seen = set()
    for root in roots:
        if not root.is_dir():
            continue
        for path in sorted(root.rglob("*.json")):
            resolved = path.resolve()
            if resolved in seen:
                continue
            seen.add(resolved)
            relative_parts = set(path.relative_to(root).parts[:-1])
            if relative_parts & ignored_parts or any(part.endswith("_assets") for part in relative_parts):
                continue
            try:
                project = json.loads(path.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                continue
            projects.append({
                "path": display_path(path),
                "title": project.get("title") or path.stem,
                "rows": len(project.get("rows", [])) if isinstance(project.get("rows"), list) else 0,
                "updatedAt": __import__("datetime").datetime.fromtimestamp(path.stat().st_mtime, __import__("datetime").timezone.utc).isoformat(),
            })
    return projects


def list_local_project_scan_root_info():
    return [{"path": display_path(root), "exists": root.is_dir()} for root in project_scan_roots()]


def save_server_project(project_id, project, expected_revision=None, title=None, create=False):
    if not isinstance(project, dict):
        raise TypeError("项目内容必须是 JSON 对象。")
    path = server_project_path(project_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    if create and path.exists():
        return {"error": "项目 ID 已存在。", "status": 409}
    current_revision = 0
    current = {}
    if path.exists():
        _, current, current_revision = read_server_project(project_id)
        if expected_revision is not None and int(expected_revision) != current_revision:
            return {
                "error": "项目已被其他人更新，请重新加载后再保存。",
                "status": 409,
                "currentRevision": current_revision,
                "project": current,
            }
    elif expected_revision not in (None, 0):
        return {"error": "项目不存在，无法按指定版本保存。", "status": 404}
    next_revision = current_revision + 1
    if isinstance(current.get("_server"), dict) and "_server" not in project:
        project = {**project, "_server": current["_server"]}
    clean = with_server_meta(project_id, project, title=title, revision=next_revision)
    path.write_text(json.dumps(clean, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"project": clean, "revision": next_revision, "path": str(path)}


def is_within_allowed_root(path):
    resolved = path.resolve()
    return any(resolved == root or root in resolved.parents for root in ALLOWED_ROOTS)


def legacy_paths_enabled():
    return os.environ.get("DASHBOARD_LEGACY_PATHS", "1") != "0"


def port_candidates(start=DEFAULT_PORT, limit=PORT_SEARCH_LIMIT):
    return range(start, start + limit)


def create_server(host, preferred_port, allow_fallback=True):
    errors = []
    ports = port_candidates(preferred_port) if allow_fallback else [preferred_port]
    for port in ports:
        try:
            return ThreadingHTTPServer((host, port), DashboardHandler), port
        except PermissionError:
            raise
        except OSError as error:
            errors.append((port, error))
    last_port, last_error = errors[-1]
    raise OSError(f"No available port from {preferred_port} to {last_port}") from last_error


class DashboardHandler(SimpleHTTPRequestHandler):
    def send_json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/bare-ear-library":
            if not legacy_paths_enabled():
                self.send_json({"error": "服务器部署已关闭本地空耳库写入接口。"}, 403)
                return
            try:
                payload = self.read_json_body()
                result = save_bare_ear_library_photos(payload.get("photos") or [])
            except (ValueError, TypeError, json.JSONDecodeError) as error:
                self.send_json({"error": str(error)}, 400)
                return
            self.send_json(result)
            return
        if parsed.path == "/api/server/projects":
            self.create_server_project()
            return
        if parsed.path.startswith("/api/server/projects/") and parsed.path.endswith("/photos"):
            self.upload_server_project_photo(parsed)
            return
        if parsed.path.startswith("/api/server/projects/"):
            self.save_server_project_endpoint(parsed.path.rsplit("/", 1)[-1])
            return
        if parsed.path == "/api/project-assets":
            if not legacy_paths_enabled():
                self.send_json({"error": "服务器部署已关闭本地项目资源写入接口。"}, 403)
                return
            self.save_project_asset(parsed)
            return
        if parsed.path == "/api/copy-project-photos":
            if not legacy_paths_enabled():
                self.send_json({"error": "服务器部署已关闭本地照片复制接口。"}, 403)
                return
            try:
                payload = self.read_json_body()
                result = copy_project_photos_from_root(payload.get("projectPath"), payload.get("root"))
            except (ValueError, TypeError, json.JSONDecodeError) as error:
                self.send_json({"error": str(error)}, 400)
                return
            self.send_json(result)
            return
        if parsed.path == "/api/save-project":
            if not legacy_paths_enabled():
                self.send_json({"error": "服务器部署已关闭本地路径保存接口。"}, 403)
                return
            self.save_project()
            return
        if parsed.path == "/api/export-project-csv":
            if not legacy_paths_enabled():
                self.send_json({"error": "服务器部署已关闭本地路径导出接口。"}, 403)
                return
            try:
                payload = self.read_json_body()
                result = save_project_csv_export(payload.get("projectPath"), payload.get("csv"), payload.get("projectName") or "project")
            except (ValueError, TypeError, json.JSONDecodeError) as error:
                self.send_json({"error": str(error)}, 400)
                return
            self.send_json(result)
            return
        if parsed.path != "/api/scan-photos":
            self.send_error(404)
            return
        if not legacy_paths_enabled():
            self.send_json({"error": "服务器部署已关闭任意照片目录扫描接口。"}, 403)
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
                    "absolute_path": relative.as_posix(),
                    "user_folder": relative.parts[0] if len(relative.parts) > 1 else "",
                    "url": f"/api/photo?path={quote(str(path.resolve()))}",
                })

        photos.sort(key=lambda item: (item["user_folder"], item["name"].lower(), item["relative_path"].lower()))
        self.send_json({"root": str(root), "photos": photos})

    def save_project(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length) or b"{}")
            project_path = resolve_client_path(payload.get("path", ""))
            project = payload.get("project")
        except (ValueError, json.JSONDecodeError):
            self.send_json({"error": "无效的项目保存请求。"}, 400)
            return

        if not project_path.name.endswith(".json"):
            self.send_json({"error": "项目文件必须是 .json。"}, 400)
            return
        project_path.parent.mkdir(parents=True, exist_ok=True)
        if not isinstance(project, dict):
            self.send_json({"error": "项目内容必须是 JSON 对象。"}, 400)
            return

        project_path.write_text(json.dumps(project, ensure_ascii=False, indent=2), encoding="utf-8")
        self.send_json({"path": display_path(project_path)})

    def save_project_asset(self, parsed):
        try:
            query = parse_qs(parsed.query)
            project_path = query.get("projectPath", [""])[0]
            kind = query.get("kind", [""])[0]
            path = query.get("path", [""])[0]
            length = int(self.headers.get("Content-Length", "0"))
            data = self.rfile.read(length)
            result = save_project_asset_file(project_path, kind, path, data)
        except ValueError as error:
            self.send_json({"error": str(error)}, 400)
            return
        self.send_json(result)

    def read_json_body(self):
        length = int(self.headers.get("Content-Length", "0"))
        return json.loads(self.rfile.read(length) or b"{}")

    def create_server_project(self):
        try:
            payload = self.read_json_body()
            project_id = payload.get("id", "")
            title = payload.get("title") or project_id
            project = payload.get("project") or {"version": 1, "rows": [], "mappingRows": [], "dashboardConfig": {}}
            result = save_server_project(project_id, project, title=title, create=True)
        except (ValueError, TypeError, json.JSONDecodeError) as error:
            self.send_json({"error": str(error)}, 400)
            return
        if "error" in result:
            self.send_json(result, result.get("status", 400))
            return
        self.send_json({
            "id": project_id,
            "title": project_title(project_id, result["project"]),
            "revision": result["revision"],
            "project": result["project"],
        }, 201)

    def save_server_project_endpoint(self, project_id):
        try:
            payload = self.read_json_body()
            result = save_server_project(
                project_id,
                payload.get("project"),
                expected_revision=payload.get("revision"),
                title=payload.get("title"),
            )
        except (ValueError, TypeError, json.JSONDecodeError) as error:
            self.send_json({"error": str(error)}, 400)
            return
        if "error" in result:
            self.send_json(result, result.get("status", 400))
            return
        self.send_json({
            "id": project_id,
            "title": project_title(project_id, result["project"]),
            "revision": result["revision"],
            "project": result["project"],
        })

    def upload_server_project_photo(self, parsed):
        try:
            parts = parsed.path.strip("/").split("/")
            project_id = parts[3]
            relative_path = safe_relative_photo_path(parse_qs(parsed.query).get("path", [""])[0])
            root = server_project_photo_root(project_id)
            target = (root / relative_path).resolve()
            if root.resolve() not in target.parents:
                raise ValueError("照片路径无效。")
            length = int(self.headers.get("Content-Length", "0"))
            data = self.rfile.read(length)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
        except (ValueError, IndexError) as error:
            self.send_json({"error": str(error)}, 400)
            return

        relative = relative_path.as_posix()
        self.send_json({
            "photo": {
                "name": relative_path.name,
                "relative_path": relative,
                "absolute_path": f"/api/server/projects/{project_id}/photos?path={quote(relative)}",
                "url": f"/api/server/projects/{project_id}/photos?path={quote(relative)}",
                "user_folder": relative_path.parts[0] if len(relative_path.parts) > 1 else "",
            }
        })

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/bare-ear-library":
            self.send_json({"photos": bare_ear_library_index()})
            return
        if parsed.path == "/api/bare-ear-photo":
            self.serve_bare_ear_photo(parsed)
            return
        if parsed.path == "/api/server/projects":
            self.send_json({"projects": list_server_projects()})
            return
        if parsed.path == "/api/list-projects":
            if not legacy_paths_enabled():
                self.send_json({"error": "服务器部署已关闭本地项目列表接口。"}, 403)
                return
            self.send_json({"projects": list_local_project_files(), "roots": list_local_project_scan_root_info()})
            return
        if parsed.path.startswith("/api/server/projects/") and parsed.path.endswith("/photos"):
            self.serve_server_project_photo(parsed)
            return
        if parsed.path == "/api/project-photo":
            self.serve_project_photo(parsed)
            return
        if parsed.path.startswith("/api/server/projects/"):
            project_id = parsed.path.rsplit("/", 1)[-1]
            try:
                _, project, revision = read_server_project(project_id)
            except ValueError as error:
                self.send_json({"error": str(error)}, 400)
                return
            except FileNotFoundError:
                self.send_json({"error": f"项目不存在：{project_id}"}, 404)
                return
            except json.JSONDecodeError:
                self.send_json({"error": "项目文件不是有效 JSON。"}, 400)
                return
            self.send_json({
                "id": project_id,
                "title": project_title(project_id, project),
                "revision": revision,
                "project": project,
            })
            return
        if parsed.path == "/api/load-project":
            if not legacy_paths_enabled():
                self.send_json({"error": "服务器部署已关闭本地路径加载接口。"}, 403)
                return
            values = parse_qs(parsed.query).get("path", [])
            if not values:
                self.send_error(400, "Missing path")
                return
            project_path = resolve_client_path(values[0])
            if not project_path.is_file():
                self.send_json({"error": f"项目文件不存在：{project_path}"}, 404)
                return
            try:
                project = json.loads(project_path.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                self.send_json({"error": "项目文件不是有效 JSON。"}, 400)
                return
            self.send_json({"path": display_path(project_path), "project": project})
            return
        if parsed.path != "/api/photo":
            super().do_GET()
            return
        if not legacy_paths_enabled():
            self.send_error(403, "Legacy local photo endpoint is disabled")
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

    def serve_project_photo(self, parsed):
        try:
            query = parse_qs(parsed.query)
            root = safe_relative_root(query.get("root", ["photos"])[0])
            relative_path = safe_relative_photo_path(query.get("path", [""])[0])
            project_values = query.get("project", [])
            if project_values:
                project_path = resolve_client_path(project_values[0])
                if not project_path.name.endswith(".json"):
                    raise ValueError("项目路径必须是 JSON 文件。")
                base = (project_path.parent / root).resolve()
            else:
                base = (app_root() / root).resolve()
            path = (base / relative_path).resolve()
            if base not in path.parents or not path.is_file():
                self.send_error(404, "Project photo not found")
                return
        except ValueError as error:
            self.send_json({"error": str(error)}, 400)
            return

        content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        data = path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def serve_server_project_photo(self, parsed):
        try:
            parts = parsed.path.strip("/").split("/")
            project_id = parts[3]
            relative_path = safe_relative_photo_path(parse_qs(parsed.query).get("path", [""])[0])
            root = server_project_photo_root(project_id).resolve()
            path = (root / relative_path).resolve()
            if root not in path.parents or not path.is_file():
                self.send_error(404, "Photo not found")
                return
        except (ValueError, IndexError) as error:
            self.send_json({"error": str(error)}, 400)
            return

        content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        data = path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def serve_bare_ear_photo(self, parsed):
        try:
            relative = safe_relative_photo_path(parse_qs(parsed.query).get("path", [""])[0])
            root = bare_ear_library_root().resolve()
            path = (root / relative).resolve()
            if root not in path.parents or not path.is_file():
                self.send_error(404, "Bare ear photo not found")
                return
        except ValueError as error:
            self.send_json({"error": str(error)}, 400)
            return

        content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        data = path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


if __name__ == "__main__":
    os.chdir(Path(__file__).resolve().parents[1])
    explicit_port = "PORT" in os.environ and os.environ.get("PORT", "").strip() != ""
    port = int(os.environ.get("PORT", str(DEFAULT_PORT)))
    host = os.environ.get("HOST", DEFAULT_HOST)
    try:
        server, port = create_server(host, port, allow_fallback=not explicit_port)
    except PermissionError as error:
        print(f"无法启动看板服务：{host}:{port} 被系统拒绝。")
        print("Windows 常见原因是该端口被系统保留、安全软件拦截，或 Python 没有本地网络权限。")
        print("请优先使用“打开耳机数据看板.bat”，它会自动换一个可用端口。")
        print(f"原始错误：{error}")
        raise SystemExit(1)
    except OSError as error:
        print(f"无法启动看板服务：{host}:{port} 不可用。")
        if explicit_port:
            print("你显式指定了 PORT，因此不会自动换端口。请关闭占用程序，或换一个 PORT 环境变量后重试。")
        else:
            print(f"已尝试 {DEFAULT_PORT}-{DEFAULT_PORT + PORT_SEARCH_LIMIT - 1}，没有找到可用端口。")
        print(f"原始错误：{error}")
        raise SystemExit(1)
    local_base = f"http://127.0.0.1:{port}"
    if host in ("0.0.0.0", "::"):
        print(f"Dashboard local: {local_base}")
        print(f"Server entry local: {local_base}/server/server.html")
        print(f"LAN access: http://YOUR_COMPUTER_IP:{port}")
        print(f"LAN server entry: http://YOUR_COMPUTER_IP:{port}/server/server.html")
    else:
        print(f"Dashboard: http://{host}:{port}")
        print(f"Server entry: http://{host}:{port}/server/server.html")
    print("Press Ctrl+C to stop.")
    server.serve_forever()

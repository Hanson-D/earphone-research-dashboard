#!/usr/bin/env python3
import json
import os
import re
import tempfile
from datetime import datetime, timezone
from pathlib import Path


CATALOG_FILENAME = ".dashboard-project-index.json"
PROJECT_CODE_PATTERN = re.compile(r"^[A-Z][A-Z0-9_-]{0,31}$")
IGNORED_PARTS = {"exports", "photos", "bare_ears", ".cache"}


def catalog_path(root):
    return Path(root).expanduser().resolve() / CATALOG_FILENAME


def empty_catalog():
    return {"version": 1, "projects": {}}


def load_catalog(root):
    path = catalog_path(root)
    if not path.is_file():
        return empty_catalog()
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict) or not isinstance(payload.get("projects"), dict):
        raise ValueError("Project index must contain a projects object.")
    return payload


def save_catalog(root, payload):
    path = catalog_path(root)
    path.parent.mkdir(parents=True, exist_ok=True)
    handle, temporary_name = tempfile.mkstemp(prefix=path.name + ".", dir=str(path.parent))
    try:
        with os.fdopen(handle, "w", encoding="utf-8") as temporary:
            json.dump(payload, temporary, ensure_ascii=False, indent=2)
            temporary.write("\n")
        os.chmod(temporary_name, 0o660)
        os.replace(temporary_name, str(path))
    except Exception:
        try:
            os.unlink(temporary_name)
        except OSError:
            pass
        raise
    return path


def project_title(path, project):
    server_meta = project.get("_server") if isinstance(project.get("_server"), dict) else {}
    return str(server_meta.get("title") or project.get("title") or path.stem)


def scan_projects(root):
    root = Path(root).expanduser().resolve()
    if not root.is_dir():
        return []
    projects = []
    for path in sorted(root.rglob("*.json")):
        if path.name == CATALOG_FILENAME:
            continue
        relative = path.relative_to(root)
        parent_parts = set(relative.parts[:-1])
        if parent_parts & IGNORED_PARTS or any(part.endswith("_assets") for part in parent_parts):
            continue
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if not isinstance(payload, dict):
            continue
        projects.append({
            "path": relative.as_posix(),
            "title": project_title(path, payload),
        })
    return projects


def validate_project_code(code):
    code = str(code or "").strip().upper()
    if not PROJECT_CODE_PATTERN.fullmatch(code):
        raise ValueError("Project code must use 1-32 uppercase letters, numbers, underscore, or hyphen.")
    return code


def next_project_code(existing_codes):
    used = set(existing_codes)
    number = 1
    while "P{:04d}".format(number) in used:
        number += 1
    return "P{:04d}".format(number)


def validate_catalog(payload):
    seen_paths = {}
    for code, record in payload.get("projects", {}).items():
        validate_project_code(code)
        if not isinstance(record, dict) or not str(record.get("path") or "").strip():
            raise ValueError("Project index entry {} has no path.".format(code))
        path = str(record["path"])
        if path in seen_paths:
            raise ValueError("Project path is assigned twice: {} and {}.".format(seen_paths[path], code))
        seen_paths[path] = code


def sync_catalog(root):
    root = Path(root).expanduser().resolve()
    root.mkdir(parents=True, exist_ok=True)
    catalog = load_catalog(root)
    validate_catalog(catalog)
    indexed = catalog["projects"]
    scanned = scan_projects(root)
    scanned_by_path = {item["path"]: item for item in scanned}
    matched_codes = set()
    matched_paths = set()
    assigned = []
    moved = []

    for code, record in indexed.items():
        item = scanned_by_path.get(record.get("path"))
        if item:
            record["title"] = item["title"]
            record["missing"] = False
            matched_codes.add(code)
            matched_paths.add(item["path"])

    remaining_codes_by_title = {}
    for code, record in indexed.items():
        if code not in matched_codes and record.get("title"):
            remaining_codes_by_title.setdefault(str(record["title"]), []).append(code)
    remaining_paths_by_title = {}
    for item in scanned:
        if item["path"] not in matched_paths:
            remaining_paths_by_title.setdefault(item["title"], []).append(item)

    for title, items in remaining_paths_by_title.items():
        codes = remaining_codes_by_title.get(title, [])
        if len(items) == 1 and len(codes) == 1:
            code = codes[0]
            old_path = indexed[code]["path"]
            indexed[code].update({"path": items[0]["path"], "title": title, "missing": False})
            matched_codes.add(code)
            matched_paths.add(items[0]["path"])
            moved.append({"code": code, "from": old_path, "to": items[0]["path"]})

    for item in scanned:
        if item["path"] in matched_paths:
            continue
        code = next_project_code(indexed.keys())
        indexed[code] = {"path": item["path"], "title": item["title"], "missing": False}
        matched_codes.add(code)
        matched_paths.add(item["path"])
        assigned.append({"code": code, **item})

    missing = []
    for code, record in indexed.items():
        if code not in matched_codes:
            record["missing"] = True
            missing.append({"code": code, "path": record["path"], "title": record.get("title") or ""})

    catalog["updatedAt"] = datetime.now(timezone.utc).isoformat()
    save_catalog(root, catalog)
    return {"catalog": catalog, "assigned": assigned, "moved": moved, "missing": missing}


def code_for_project_path(root, project_path, catalog=None):
    root = Path(root).expanduser().resolve()
    resolved = Path(project_path).expanduser().resolve()
    try:
        relative = resolved.relative_to(root).as_posix()
    except ValueError:
        return None
    catalog = catalog or load_catalog(root)
    for code, record in catalog.get("projects", {}).items():
        if not record.get("missing") and record.get("path") == relative:
            return code
    return None


def code_for_asset_path(root, asset_path, catalog=None):
    root = Path(root).expanduser().resolve()
    resolved = Path(asset_path).expanduser().resolve()
    catalog = catalog or load_catalog(root)
    candidates = []
    for code, record in catalog.get("projects", {}).items():
        if record.get("missing"):
            continue
        project_file = (root / record.get("path", "")).resolve()
        project_dir = project_file.parent
        if resolved == project_dir or project_dir in resolved.parents:
            candidates.append((len(project_dir.parts), code))
    return max(candidates)[1] if candidates else None


def set_project_code(root, current_code, new_code):
    catalog = load_catalog(root)
    current_code = validate_project_code(current_code)
    new_code = validate_project_code(new_code)
    if current_code not in catalog["projects"]:
        raise ValueError("Unknown project code: {}".format(current_code))
    if new_code != current_code and new_code in catalog["projects"]:
        raise ValueError("Project code already exists: {}".format(new_code))
    catalog["projects"][new_code] = catalog["projects"].pop(current_code)
    catalog["updatedAt"] = datetime.now(timezone.utc).isoformat()
    save_catalog(root, catalog)
    return catalog["projects"][new_code]


def relink_project(root, code, relative_path):
    root = Path(root).expanduser().resolve()
    catalog = load_catalog(root)
    code = validate_project_code(code)
    if code not in catalog["projects"]:
        raise ValueError("Unknown project code: {}".format(code))
    relative_path = Path(str(relative_path or "")).as_posix().lstrip("/")
    scanned = {item["path"]: item for item in scan_projects(root)}
    if relative_path not in scanned:
        raise ValueError("Project JSON was not found in the scan: {}".format(relative_path))
    for other_code, record in catalog["projects"].items():
        if other_code != code and record.get("path") == relative_path:
            raise ValueError("Project path is already assigned to {}.".format(other_code))
    item = scanned[relative_path]
    catalog["projects"][code].update({"path": relative_path, "title": item["title"], "missing": False})
    catalog["updatedAt"] = datetime.now(timezone.utc).isoformat()
    save_catalog(root, catalog)
    return catalog["projects"][code]

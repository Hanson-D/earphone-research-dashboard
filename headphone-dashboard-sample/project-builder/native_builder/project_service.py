from __future__ import annotations

import csv
import json
import os
import shutil
import tempfile
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .core import (
    MappingConfig,
    MappingResult,
    PhotoFile,
    infer_folder_views,
    infer_mapping_fields,
    map_photos,
    mapping_overrides,
    read_csv_file,
    resolve_field_roles,
    stable_row_key,
)
from .photo_index import PhotoIndex


UPDATE_MODES = {"new", "csv", "photos", "all", "mapping"}


@dataclass
class BuildRequest:
    update_mode: str = "new"
    project_name: str = ""
    project_path: str = ""
    csv_path: str = ""
    photo_root: str = ""
    output_root: str = ""
    mapping_mode: str = "auto"
    mapping_fields: dict[str, Any] = field(default_factory=dict)
    mapping_views: list[str] = field(default_factory=list)
    expected_ears: list[str] = field(default_factory=list)
    field_role_overrides: dict[str, str] = field(default_factory=dict)
    photo_mapping_overrides: dict[str, str] = field(default_factory=dict)
    photo_ear_mode: bool | None = None
    single_ear_mode: bool | None = None
    include_bare_ear_photos: bool | None = None
    bare_ear_config: dict[str, Any] = field(default_factory=dict)
    protocol_template: dict[str, Any] | None = None
    dashboard_config: dict[str, Any] = field(default_factory=dict)
    strict: bool = False
    dry_run: bool = False


@dataclass
class BuildResult:
    request: BuildRequest
    project: dict[str, Any]
    mapping: MappingResult
    rows: list[dict[str, str]]
    headers: list[str]
    photos: list[PhotoFile]
    field_roles: dict[str, str]
    target: Path
    source_project: dict[str, Any] | None
    source_project_dir: Path | None
    csv_encoding: str
    diff: dict[str, Any]
    output_path: str = ""


class ProjectService:
    def __init__(self, cache_root: str | Path | None = None):
        platform_cache = os.environ.get("LOCALAPPDATA") or os.environ.get("XDG_CACHE_HOME") or str(Path.home() / ".cache")
        default = Path(platform_cache) / "EarphoneProjectBuilder"
        self.cache_root = Path(cache_root or default)
        self.cache_root.mkdir(parents=True, exist_ok=True)
        self.index = PhotoIndex(self.cache_root / "index.sqlite", self.cache_root / "thumbnails")

    def close(self) -> None:
        self.index.close()

    def load_project(self, value: str | Path) -> tuple[dict[str, Any], Path, Path]:
        path = Path(value).expanduser().resolve()
        if path.is_dir():
            matches = sorted(path.glob("*.json"))
            if not matches:
                raise ValueError(f"项目目录内没有 JSON：{path}")
            preferred = path / f"{path.name}.json"
            json_path = preferred if preferred in matches else matches[0]
            project_dir = path
        elif path.is_file():
            json_path, project_dir = path, path.parent
        else:
            raise ValueError(f"项目不存在：{path}")
        project = json.loads(json_path.read_text("utf-8-sig"))
        if not isinstance(project.get("rows"), list):
            raise ValueError("项目 JSON 缺少 rows")
        return project, project_dir, json_path

    def prepare(self, request: BuildRequest) -> BuildResult:
        if request.update_mode not in UPDATE_MODES:
            raise ValueError(f"未知更新模式：{request.update_mode}")
        existing: dict[str, Any] | None = None
        existing_dir: Path | None = None
        if request.update_mode != "new":
            if not request.project_path:
                raise ValueError("更新已有项目时必须选择项目 JSON 或文件夹")
            existing, existing_dir, _ = self.load_project(request.project_path)

        uses_new_csv = request.update_mode in {"new", "csv", "all"}
        uses_new_photos = request.update_mode in {"new", "photos", "all"}
        if uses_new_csv:
            if not request.csv_path:
                raise ValueError("当前更新模式需要选择 CSV")
            rows, headers, encoding = read_csv_file(request.csv_path)
        else:
            rows = [dict(row) for row in (existing or {}).get("mappingRows") or (existing or {}).get("rows") or []]
            headers = list(rows[0]) if rows else []
            encoding = "project-json"
        if not rows:
            raise ValueError("没有可用于映射的数据行")

        if request.update_mode == "csv":
            active_photo_root = None
            photos = []
        elif uses_new_photos:
            if not request.photo_root and request.update_mode != "new":
                raise ValueError("当前更新模式需要选择照片目录")
            active_photo_root = Path(request.photo_root).expanduser().resolve() if request.photo_root else None
            photos = self.index.scan(active_photo_root) if active_photo_root else []
        else:
            photo_value = str((existing or {}).get("photoRoot") or "photos")
            candidate = Path(photo_value)
            active_photo_root = candidate if candidate.is_absolute() else (existing_dir / candidate if existing_dir else candidate)
            photos = self.index.scan(active_photo_root)
        if not photos and request.update_mode in {"photos", "all", "mapping"}:
            raise ValueError(f"照片目录中没有支持的图片：{active_photo_root}")

        existing_mapping_fields = dict((existing or {}).get("mappingFields") or {})
        fields_config = {**existing_mapping_fields, **request.mapping_fields}
        user_field, ear_field, device_field = infer_mapping_fields(rows, fields_config)
        missing_users = [index + 1 for index, row in enumerate(rows) if not str(row.get(user_field, "")).strip()]
        if missing_users:
            raise ValueError(f"用户字段 {user_field} 存在空值，首个位置为第 {missing_users[0]} 行")
        views = list(request.mapping_views or (existing or {}).get("mappingViews") or [])
        mode = request.mapping_mode if request.mapping_mode != "auto" else str((existing or {}).get("mappingMode") or "auto")
        if photos and mode in {"auto", "folders"} and not views:
            views = infer_folder_views(rows, photos, user_field, ear_field, device_field)
        overrides = {**self._stable_overrides(existing, user_field, ear_field, device_field), **request.photo_mapping_overrides}
        mapping_config = MappingConfig(
            mode=mode,
            user_field=user_field,
            ear_field=ear_field,
            device_field=device_field,
            views=views,
            expected_ears=list(request.expected_ears),
            photo_ear_mode=bool(existing_mapping_fields.get("photoEarMode")) if request.photo_ear_mode is None else request.photo_ear_mode,
            single_ear_mode=bool(existing_mapping_fields.get("singleEarMode")) if request.single_ear_mode is None else request.single_ear_mode,
            include_bare_ear=bool(existing_mapping_fields.get("includeBareEarPhotos")) if request.include_bare_ear_photos is None else request.include_bare_ear_photos,
            bare_ear_config=request.bare_ear_config or dict(existing_mapping_fields.get("bareEarConfig") or {}),
            overrides=overrides,
        )
        key_counts = Counter(stable_row_key(row, mapping_config) for row in rows)
        duplicates = sorted(key for key, count in key_counts.items() if key and count > 1)
        if duplicates:
            raise ValueError(f"稳定行键不唯一，请补充条件字段或修正重复记录：{duplicates[0]}")
        if not photos and not views:
            mapping = MappingResult([dict(row) for row in rows], [], [], [], [], [], "sequence")
        else:
            mapping = map_photos(rows, photos, mapping_config)
        if request.update_mode == "csv" and existing:
            self._preserve_existing_assignments(mapping, existing, mapping_config)
            mapping.audit = [item for item in mapping.audit if not (
                item.get("status") == "missing" and any(
                    slot["rowIndex"] + 1 == item.get("rowIndex") and slot["field"] == item.get("field") and slot["value"]
                    for slot in mapping.slots
                )
            )]

        old_dashboard = dict((existing or {}).get("dashboardConfig") or {})
        dashboard_config = {**old_dashboard, **request.dashboard_config}
        old_roles = dict(old_dashboard.get("fieldRoleOverrides") or {})
        field_roles = resolve_field_roles(headers + [field for field in mapping.photo_fields if field not in headers], mapping.rows, {**old_roles, **request.field_role_overrides})
        user_id_fields = [field_name for field_name, role in field_roles.items() if role == "user_id"]
        if len(user_id_fields) > 1:
            raise ValueError(f"只能有一个“用户编号”变量类别，当前为：{', '.join(user_id_fields)}")
        dashboard_config["fieldRoleOverrides"] = field_roles
        project_name = _safe_name(request.project_name or (existing or {}).get("title") or Path(request.csv_path).stem)
        source_csv = self._source_csv(request, existing)
        project = {
            "version": 1,
            "title": project_name,
            "savedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "rows": mapping.rows,
            "mappingRows": rows,
            "sourceCsv": source_csv,
            "photoRoot": "photos",
            "mappingMode": mapping.mode,
            "mappingFields": {
                "userField": user_field,
                "earField": ear_field,
                "deviceField": device_field,
                "photoEarMode": mapping_config.photo_ear_mode,
                "includeBareEarPhotos": mapping_config.include_bare_ear,
                "bareEarConfig": mapping_config.bare_ear_config,
                "singleEarMode": mapping_config.single_ear_mode,
            },
            "mappingViews": mapping_config.views,
            "photoMappingOverrides": mapping_overrides(mapping, stable=False),
            "protocolTemplate": request.protocol_template if request.protocol_template is not None else (existing or {}).get("protocolTemplate"),
            "dashboardConfig": dashboard_config,
        }
        target = existing_dir if existing_dir else Path(request.output_root).expanduser().resolve() / project_name
        if request.update_mode == "new" and not request.output_root:
            raise ValueError("新建项目时必须选择输出目录")
        diff = self._diff(existing, project, photos, uses_new_photos)
        if request.strict and mapping.audit:
            error = ValueError(f"映射检查发现 {len(mapping.audit)} 个问题，strict 模式已阻止发布")
            setattr(error, "exit_code", 2)
            raise error
        return BuildResult(request, project, mapping, rows, headers, photos, field_roles, target, existing, existing_dir, encoding, diff)

    def publish(self, prepared: BuildResult) -> BuildResult:
        request, target = prepared.request, prepared.target
        if request.dry_run:
            return prepared
        if request.update_mode == "new" and target.exists():
            raise ValueError(f"项目目录已存在：{target}")
        target.parent.mkdir(parents=True, exist_ok=True)
        staging = Path(tempfile.mkdtemp(prefix=f".{target.name}.builder-", dir=target.parent))
        try:
            if prepared.source_project_dir:
                shutil.copytree(prepared.source_project_dir, staging, dirs_exist_ok=True, copy_function=shutil.copy2)
            (staging / "data").mkdir(parents=True, exist_ok=True)
            (staging / "photos").mkdir(parents=True, exist_ok=True)
            (staging / "exports").mkdir(parents=True, exist_ok=True)
            if request.update_mode in {"new", "csv", "all"}:
                destination = staging / prepared.project["sourceCsv"]
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(Path(request.csv_path), destination)
            if request.update_mode in {"new", "photos", "all"}:
                for photo in prepared.photos:
                    destination = staging / "photos" / Path(photo.relative_path)
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(photo.absolute_path, destination)
            project_json = staging / f"{prepared.project['title']}.json"
            for old_json in staging.glob("*.json"):
                if old_json != project_json and prepared.source_project_dir and old_json.name == f"{prepared.source_project_dir.name}.json":
                    old_json.unlink()
            project_json.write_text(json.dumps(prepared.project, ensure_ascii=False, indent=2) + "\n", "utf-8")
            self._write_audit(staging / "exports" / "photo_mapping_audit.csv", prepared.mapping.audit)
            (staging / "exports" / "publish_summary.json").write_text(
                json.dumps({"mode": request.update_mode, "diff": prepared.diff, "issues": len(prepared.mapping.audit)}, ensure_ascii=False, indent=2) + "\n",
                "utf-8",
            )
            self._validate_staging(staging, prepared.project)
            if target.exists():
                stamp = datetime.now().strftime("%Y%m%d-%H%M%S-%f")
                backup = target.with_name(f"{target.name}.backup-{stamp}")
                target.rename(backup)
                try:
                    staging.rename(target)
                except Exception:
                    backup.rename(target)
                    raise
            else:
                staging.rename(target)
            prepared.output_path = str(target)
            return prepared
        except Exception:
            if staging.exists():
                shutil.rmtree(staging, ignore_errors=True)
            raise

    def _source_csv(self, request: BuildRequest, existing: dict[str, Any] | None) -> str:
        if request.update_mode in {"new", "csv", "all"}:
            return f"data/{Path(request.csv_path).name}"
        return str((existing or {}).get("sourceCsv") or "")

    def _stable_overrides(self, existing: dict[str, Any] | None, user_field: str, ear_field: str, device_field: str) -> dict[str, str]:
        if not existing:
            return {}
        source_rows = existing.get("mappingRows") or existing.get("rows") or []
        config = MappingConfig(user_field=user_field, ear_field=ear_field, device_field=device_field)
        overrides: dict[str, str] = {}
        for override_key, value in dict(existing.get("photoMappingOverrides") or {}).items():
            prefix, separator, field_name = str(override_key).rpartition("::")
            if not separator or not field_name:
                continue
            if prefix.isdigit() and int(prefix) < len(source_rows):
                prefix = stable_row_key(source_rows[int(prefix)], config)
            overrides[f"{prefix}::{field_name}"] = str(value or "")
        return overrides

    def _preserve_existing_assignments(self, mapping: MappingResult, existing: dict[str, Any], config: MappingConfig) -> None:
        old_source = existing.get("mappingRows") or existing.get("rows") or []
        old_mapped = existing.get("rows") or []
        by_key = {stable_row_key(row, config): old_mapped[index] for index, row in enumerate(old_source) if index < len(old_mapped)}
        for slot in mapping.slots:
            old = by_key.get(slot["stableKey"], {})
            if slot["field"] in old:
                slot["value"] = str(old.get(slot["field"]) or "")
                slot["source"] = "preserved"
                mapping.rows[slot["rowIndex"]][slot["field"]] = slot["value"]

    def _diff(self, old: dict[str, Any] | None, project: dict[str, Any], photos: list[PhotoFile], updates_photos: bool) -> dict[str, Any]:
        old_rows = (old or {}).get("mappingRows") or []
        return {
            "csvRowsBefore": len(old_rows),
            "csvRowsAfter": len(project["mappingRows"]),
            "photoInputCount": len(photos) if updates_photos else 0,
            "mappingChanges": len(project.get("photoMappingOverrides") or {}),
            "preservedDashboardConfig": bool(old),
        }

    def _write_audit(self, path: Path, audit: list[dict[str, Any]]) -> None:
        headers = ["status", "user", "device", "rowIndex", "field", "view", "message"]
        rows = audit or [{"status": "ok", "message": "未发现缺失照片或映射异常"}]
        with path.open("w", encoding="utf-8-sig", newline="") as stream:
            writer = csv.DictWriter(stream, fieldnames=headers, extrasaction="ignore")
            writer.writeheader()
            writer.writerows(rows)

    def _validate_staging(self, staging: Path, project: dict[str, Any]) -> None:
        json_path = staging / f"{project['title']}.json"
        loaded = json.loads(json_path.read_text("utf-8"))
        if loaded.get("version") != 1 or not isinstance(loaded.get("rows"), list):
            raise ValueError("候选项目 JSON 校验失败")
        missing = []
        for row in loaded["rows"]:
            for field_name, value in row.items():
                if (field_name.startswith("photo_") or field_name.startswith("bare_ear_photo")) and value:
                    photo_root = (staging / "photos").resolve()
                    candidate = (photo_root / Path(str(value))).resolve()
                    try:
                        candidate.relative_to(photo_root)
                    except ValueError as error:
                        raise ValueError(f"照片引用越出项目目录：{value}") from error
                    if not candidate.is_file():
                        missing.append(str(value))
        if missing:
            raise ValueError(f"候选项目引用了不存在的照片：{missing[0]}")


def _safe_name(value: str) -> str:
    clean = re_sub_invalid(str(value or "").strip()).strip(". ")[:120]
    if not clean:
        raise ValueError("项目名称为空或无效")
    return clean


def re_sub_invalid(value: str) -> str:
    import re
    return re.sub(r'[\\/:*?"<>|\x00-\x1f]', "_", value)

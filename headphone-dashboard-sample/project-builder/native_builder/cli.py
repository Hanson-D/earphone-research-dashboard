from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from .project_service import BuildRequest, ProjectService


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="earphone-project-builder", description="耳机研究看板独立项目制作器")
    sub = parser.add_subparsers(dest="command")
    sub.add_parser("gui", help="打开原生桌面界面")
    build = sub.add_parser("build", help="无界面构建或更新项目")
    build.add_argument("--config", help="JSON 配置文件")
    build.add_argument("--update-mode", choices=["new", "csv", "photos", "all", "mapping"])
    build.add_argument("--project", dest="project_path")
    build.add_argument("--project-name")
    build.add_argument("--csv", dest="csv_path")
    build.add_argument("--photos", dest="photo_root")
    build.add_argument("--output", dest="output_root")
    build.add_argument("--mapping-mode", choices=["auto", "folders", "sequence"])
    build.add_argument("--user-field")
    build.add_argument("--ear-field")
    build.add_argument("--no-ear-field", action="store_true")
    build.add_argument("--device-field")
    build.add_argument("--no-device-field", action="store_true")
    build.add_argument("--views", help="逗号分隔的照片视角")
    build.add_argument("--photo-ear-mode", action="store_true")
    build.add_argument("--single-ear", action="store_true")
    build.add_argument("--include-bare-ear", action="store_true")
    build.add_argument("--strict", action="store_true")
    build.add_argument("--dry-run", action="store_true")
    build.add_argument("--json", action="store_true", dest="json_output")
    return parser


def _load_config(path: str | None) -> dict[str, Any]:
    if not path:
        return {}
    config_path = Path(path).expanduser().resolve()
    value = json.loads(config_path.read_text("utf-8-sig"))
    for key in ("project_path", "csv_path", "photo_root", "output_root"):
        if value.get(key) and not Path(value[key]).is_absolute():
            value[key] = str((config_path.parent / value[key]).resolve())
    return value


def request_from_args(args: argparse.Namespace) -> BuildRequest:
    values = _load_config(args.config)
    direct = {
        "update_mode": args.update_mode,
        "project_path": args.project_path,
        "project_name": args.project_name,
        "csv_path": args.csv_path,
        "photo_root": args.photo_root,
        "output_root": args.output_root,
        "mapping_mode": args.mapping_mode,
    }
    values.update({key: value for key, value in direct.items() if value not in (None, "")})
    fields = dict(values.get("mapping_fields") or values.get("mappingFields") or {})
    if args.user_field:
        fields["userField"] = args.user_field
    if args.ear_field:
        fields["earField"] = args.ear_field
    if args.no_ear_field:
        fields["earField"] = None
    if args.device_field:
        fields["deviceField"] = args.device_field
    if args.no_device_field:
        fields["deviceField"] = None
    values["mapping_fields"] = fields
    if args.views:
        values["mapping_views"] = [item.strip() for item in args.views.replace("，", ",").split(",") if item.strip()]
    for attribute, key in (
        ("photo_ear_mode", "photo_ear_mode"),
        ("single_ear", "single_ear_mode"),
        ("include_bare_ear", "include_bare_ear_photos"),
        ("strict", "strict"),
        ("dry_run", "dry_run"),
    ):
        if getattr(args, attribute):
            values[key] = True
    aliases = {
        "projectName": "project_name", "projectPath": "project_path", "csvPath": "csv_path",
        "photoRoot": "photo_root", "outputRoot": "output_root", "mappingMode": "mapping_mode",
        "mappingViews": "mapping_views", "fieldRoleOverrides": "field_role_overrides",
        "photoMappingOverrides": "photo_mapping_overrides", "photoEarMode": "photo_ear_mode",
        "singleEarMode": "single_ear_mode", "includeBareEarPhotos": "include_bare_ear_photos",
        "bareEarConfig": "bare_ear_config", "protocolTemplate": "protocol_template",
        "dashboardConfig": "dashboard_config", "updateMode": "update_mode", "mode": "mapping_mode",
        "views": "mapping_views", "failOnIssues": "strict",
    }
    for old, new in aliases.items():
        if old in values and new not in values:
            values[new] = values[old]
    allowed = set(BuildRequest.__dataclass_fields__)
    return BuildRequest(**{key: value for key, value in values.items() if key in allowed})


def run_build(args: argparse.Namespace) -> int:
    service = ProjectService()
    try:
        request = request_from_args(args)
        prepared = service.prepare(request)
        result = service.publish(prepared)
        payload = {
            "projectName": result.project["title"],
            "updateMode": request.update_mode,
            "mappingMode": result.mapping.mode,
            "csvRows": len(result.rows),
            "photos": len(result.photos),
            "photoFields": result.mapping.photo_fields,
            "issues": len(result.mapping.audit),
            "diff": result.diff,
            "dryRun": request.dry_run,
            "outputPath": result.output_path,
        }
        if args.json_output:
            print(json.dumps(payload, ensure_ascii=False))
        else:
            print(f"项目：{payload['projectName']}")
            print(f"更新模式：{payload['updateMode']} · 映射模式：{payload['mappingMode']}")
            print(f"CSV {payload['csvRows']} 行 · 照片 {payload['photos']} 张 · 问题 {payload['issues']} 个")
            print("仅检查，未写入。" if request.dry_run else f"输出：{payload['outputPath']}")
        return 0
    except Exception as error:
        print(f"项目生成失败：{error}", file=sys.stderr)
        return int(getattr(error, "exit_code", 1))
    finally:
        service.close()


def main(argv: list[str] | None = None) -> int:
    parser = _parser()
    args = parser.parse_args(argv)
    if args.command in {None, "gui"}:
        try:
            from .gui import run_gui
        except ImportError as error:
            parser.error(f"无法加载 PySide6 图形界面：{error}")
        return run_gui()
    return run_build(args)


if __name__ == "__main__":
    raise SystemExit(main())

from __future__ import annotations

import csv
import io
import re
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable


IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".heic"}
FIELD_ROLE_LABELS = {
    "user_id": "用户编号",
    "device": "设备 / 条件",
    "user": "组间变量",
    "ear_size": "人耳尺寸",
    "dimension": "记录分组变量",
    "interference": "干涉变量",
    "metric": "评分 / 数值指标",
    "pressure": "挤压程度",
    "photo": "照片",
    "ignore": "忽略",
}

PRESSURE_SITES = (
    "tragus", "antitragus", "helix", "concha", "canal", "lobe", "postauricular",
    "auricle_front", "auricle_upper", "postauricular_middle", "lobe_rear", "auricle_outer",
    "耳屏", "对耳屏", "耳轮", "耳甲", "耳甲腔", "耳道", "耳道口", "耳塞", "耳垂",
    "耳廓前侧", "耳廓上侧", "耳后中侧", "耳垂后侧", "耳廓外侧", "耳后", "耳背",
    "夹持", "耳夹", "耳上", "耳挂", "挂钩", "挂耳",
)


@dataclass(frozen=True)
class PhotoFile:
    relative_path: str
    absolute_path: str
    name: str
    user_folder: str
    size: int = 0
    mtime_ns: int = 0

    @classmethod
    def from_path(cls, root: Path, path: Path) -> "PhotoFile":
        relative = path.relative_to(root).as_posix()
        stat = path.stat()
        parts = relative.split("/")
        return cls(relative, str(path.resolve()), path.name, parts[0] if len(parts) > 1 else "", stat.st_size, stat.st_mtime_ns)


@dataclass
class MappingConfig:
    mode: str = "auto"
    user_field: str = ""
    ear_field: str = ""
    device_field: str = ""
    views: list[str] = field(default_factory=list)
    expected_ears: list[str] = field(default_factory=list)
    photo_ear_mode: bool = False
    single_ear_mode: bool = False
    include_bare_ear: bool = False
    bare_ear_config: dict[str, Any] = field(default_factory=dict)
    overrides: dict[str, str] = field(default_factory=dict)


@dataclass
class MappingResult:
    rows: list[dict[str, str]]
    slots: list[dict[str, Any]]
    photo_fields: list[str]
    photo_views: list[dict[str, str]]
    audit: list[dict[str, Any]]
    unused_photos: list[str]
    mode: str


def read_csv_file(path: str | Path) -> tuple[list[dict[str, str]], list[str], str]:
    source_path = Path(path)
    raw = source_path.read_bytes()
    selected = ""
    text = ""
    for encoding in ("utf-8-sig", "utf-8", "gb18030"):
        try:
            text = raw.decode(encoding)
            selected = encoding
            break
        except UnicodeDecodeError:
            continue
    if not selected:
        raise ValueError(f"无法识别 CSV 编码：{source_path}")
    reader = csv.reader(io.StringIO(text, newline=""))
    table = list(reader)
    if not table:
        raise ValueError("CSV 为空")
    headers = [item.strip() for item in table[0]]
    if any(not item for item in headers):
        raise ValueError("CSV 含有空表头")
    duplicates = sorted({item for item in headers if headers.count(item) > 1})
    if duplicates:
        raise ValueError(f"CSV 含有重复表头：{', '.join(duplicates)}")
    rows: list[dict[str, str]] = []
    for number, values in enumerate(table[1:], start=2):
        if not any(value.strip() for value in values):
            continue
        if len(values) > len(headers):
            raise ValueError(f"CSV 第 {number} 行列数超过表头")
        padded = values + [""] * (len(headers) - len(values))
        rows.append({header: padded[index].strip() for index, header in enumerate(headers)})
    if not rows:
        raise ValueError("CSV 有表头但没有数据行")
    return rows, headers, selected


def _numeric_values(field_name: str, rows: list[dict[str, str]]) -> list[float] | None:
    values: list[float] = []
    for row in rows:
        raw = row.get(field_name, "")
        if raw in ("", None):
            continue
        try:
            values.append(float(raw))
        except (TypeError, ValueError):
            return None
    return values or None


def _likely_field(headers: Iterable[str], patterns: Iterable[str]) -> str:
    for pattern in patterns:
        found = next((header for header in headers if re.search(pattern, header, re.I)), "")
        if found:
            return found
    return ""


def _stable_within_group(rows: list[dict[str, str]], group_field: str, value_field: str) -> bool:
    if not group_field or group_field == value_field:
        return False
    values: dict[str, str] = {}
    for row in rows:
        group = str(row.get(group_field, "")).strip()
        if not group:
            continue
        value = str(row.get(value_field, "")).strip()
        if group in values and values[group] != value:
            return False
        values[group] = value
    return bool(values)


def infer_field_role(field_name: str, rows: list[dict[str, str]]) -> str:
    name = str(field_name)
    lower = name.lower()
    headers = list(rows[0]) if rows else []
    values = _numeric_values(field_name, rows)
    is_numeric = values is not None
    if re.search(r"^(user_id|participant_id|subject_id|用户编号|用户id)$", name, re.I):
        return "user_id"
    if re.search(r"^device_name$|device_id|condition|设备|条件", name, re.I):
        return "device"
    if re.search(r"photo|image|picture|照片|图片", name, re.I) or any(
        Path(str(row.get(field_name, ""))).suffix.lower() in IMAGE_EXTENSIONS for row in rows
    ):
        return "photo"
    if re.search(r"record|comment|备注|说明|description", name, re.I):
        return "ignore"
    if is_numeric and re.search(r"comfort|stability|satisfaction|preference|overall|舒适|稳定|满意|偏好|综合", name, re.I):
        return "metric"
    if re.search(r"pressure|relief|挤压|压力|压迫", name, re.I):
        return "pressure"
    device_field = _likely_field(headers, (r"^device_name$", r"device_id|condition|设备|条件"))
    if re.search(r"interference|collision|conflict|contact|overlap|obstruction|block|position|location|干涉|干扰|碰撞|冲突|遮挡|接触|位置|区域|方向", name, re.I) and _stable_within_group(rows, device_field, field_name):
        return "interference"
    user_field = _likely_field(headers, (r"^(user_id|participant_id|subject_id|用户编号|用户id)$", r"user|participant|subject|姓名|用户|受试者"))
    ear_part = re.search(r"ear|auricle|concha|canal|helix|pinna|lobe|耳|甲腔|耳道|耳轮|耳廓|耳垂|人耳", name, re.I)
    measure = re.search(r"size|width|height|length|depth|distance|angle|diameter|thickness|area|volume|ratio|percent|dimension|measure|尺寸|大小|宽度|宽|高度|高|长度|长|深度|深|距离|间距|夹角|角度|直径|厚度|厚|面积|体积|容积|比例|百分比|占比|测量", name, re.I)
    if ear_part and measure and _stable_within_group(rows, user_field, field_name):
        return "ear_size"
    normalized = re.sub(r"(?:pressure|relief|score|rating|degree|level|value|分数|评分|得分|程度|挤压|压力)", "", lower).strip(" _-")
    if is_numeric and values and all(value.is_integer() for value in values) and ((min(values) >= 0 and max(values) <= 10) or (min(values) >= 1 and max(values) <= 5)):
        if any(site.lower() == normalized for site in PRESSURE_SITES):
            return "pressure"
    if re.search(r"gender|sex|age|年龄|性别|ear_|concha|canal|protrusion|helix|耳|甲腔|耳道|外展|耳轮", name, re.I):
        return "user"
    if is_numeric:
        return "metric"
    return "dimension"


def resolve_field_roles(headers: list[str], rows: list[dict[str, str]], overrides: dict[str, str] | None = None) -> dict[str, str]:
    overrides = overrides or {}
    valid = set(FIELD_ROLE_LABELS)
    return {header: overrides.get(header) if overrides.get(header) in valid else infer_field_role(header, rows) for header in headers}


def natural_key(value: Any) -> list[Any]:
    return [int(part) if part.isdigit() else part.casefold() for part in re.split(r"(\d+)", str(value))]


def normalize_token(value: Any) -> str:
    return re.sub(r"[\s_\-—–/\\()\[\]{}【】（）:：,，.。]+", "", str(value or "").strip().lower())


def folder_matches(part: str, value: str) -> bool:
    left, right = normalize_token(part), normalize_token(value)
    return bool(left and right and (left == right or left in right or right in left))


def path_parts(photo: PhotoFile) -> list[str]:
    return photo.relative_path.split("/")[:-1]


def parts_include(parts: list[str], value: str) -> bool:
    return any(folder_matches(part, value) for part in parts)


def infer_ear(value: str) -> str:
    text, token = str(value or "").strip(), normalize_token(value)
    if re.search(r"左耳|左侧|左", text) or token in {"l", "left", "leftear"}:
        return "左耳"
    if re.search(r"右耳|右侧|右", text) or token in {"r", "right", "rightear"}:
        return "右耳"
    return ""


def _is_bare_part(part: str) -> bool:
    return bool(re.fullmatch(r"空耳|裸耳|无设备|未佩戴|bare|bareear|noearphone|nodevice|unworn", normalize_token(part), re.I))


def _is_bare(photo: PhotoFile) -> bool:
    return any(_is_bare_part(part) for part in path_parts(photo))


def infer_mapping_fields(rows: list[dict[str, str]], configured: dict[str, Any] | None = None) -> tuple[str, str, str]:
    configured = configured or {}
    headers = list(rows[0]) if rows else []
    user = configured.get("userField") or configured.get("user_field") or _likely_field(headers, (
        r"^(name|姓名|user_name|用户姓名)$", r"^(user_id|participant_id|subject_id|用户编号|用户id)$", r"user|participant|subject|姓名|用户|受试者"
    ))
    ear = "" if configured.get("earField", configured.get("ear_field", "missing")) is None else (
        configured.get("earField") or configured.get("ear_field") or _likely_field(headers, (r"ear_side|左右耳|耳侧|left_right|^side$",))
    )
    device = "" if configured.get("deviceField", configured.get("device_field", "missing")) is None else (
        configured.get("deviceField") or configured.get("device_field") or _likely_field(headers, (r"^device_name$", r"prototype|sample|样机|device_name|device_id|condition|设备|条件"))
    )
    if not user or user not in headers:
        raise ValueError(f"无法识别用户字段，可用字段：{', '.join(headers)}")
    if ear and ear not in headers:
        raise ValueError(f"耳侧字段不存在：{ear}")
    if device and device not in headers:
        raise ValueError(f"设备字段不存在：{device}")
    return user, ear, device


def _ear_values(rows: list[dict[str, str]], ear_field: str, photos: list[PhotoFile], expected: list[str]) -> list[str]:
    values: list[str] = []
    for value in ([row.get(ear_field, "") for row in rows] if ear_field else []) + [part for photo in photos for part in path_parts(photo)] + list(expected):
        ear = infer_ear(value)
        if ear and ear not in values:
            values.append(ear)
    return sorted(values, key=lambda item: (0 if item == "左耳" else 1, natural_key(item)))


def _clean_view(value: str) -> str:
    return re.sub(r"^(view|angle|direction|方向|视角)[\s_\-—–:：]+", "", str(value).strip(), flags=re.I)


def infer_folder_views(rows: list[dict[str, str]], photos: list[PhotoFile], user_field: str, ear_field: str, device_field: str) -> list[str]:
    ears = _ear_values(rows, ear_field, photos, [])
    views: list[str] = []
    for photo in photos:
        if _is_bare(photo) and device_field:
            continue
        parts = path_parts(photo)
        for row in rows:
            if not parts_include(parts, row.get(user_field, "")):
                continue
            if device_field and row.get(device_field) and not parts_include(parts, row[device_field]):
                continue
            excluded = [row.get(user_field, ""), row.get(device_field, ""), *ears]
            residual = [_clean_view(part) for part in parts if not _is_bare_part(part) and not any(value and folder_matches(part, value) for value in excluded)]
            candidates = residual if device_field else residual[-1:]
            for view in candidates:
                if view and normalize_token(view) not in {normalize_token(item) for item in views}:
                    views.append(view)
    order = {"正面": 0, "front": 0, "侧面": 1, "side": 1, "profile": 1, "背面": 2, "后面": 2, "back": 2, "rear": 2}
    return sorted(views, key=lambda item: (next((rank for key, rank in order.items() if key in normalize_token(item)), 10), natural_key(item)))


def photo_field_names(labels: list[str]) -> list[str]:
    used: set[str] = set()
    result: list[str] = []
    for index, label in enumerate(labels, 1):
        clean = re.sub(r"[^\w\u4e00-\u9fff]+", "_", str(label), flags=re.UNICODE).strip("_") or f"view_{index}"
        base, name, suffix = f"photo_{clean}", f"photo_{clean}", 2
        while name in used:
            name, suffix = f"{base}_{suffix}", suffix + 1
        used.add(name)
        result.append(name)
    return result


def _descriptors(rows: list[dict[str, str]], photos: list[PhotoFile], config: MappingConfig) -> list[dict[str, str]]:
    ears = _ear_values(rows, config.ear_field, photos, config.expected_ears)
    if config.single_ear_mode:
        ears = []
    elif config.photo_ear_mode and not ears:
        ears = config.expected_ears or ["左耳", "右耳"]
    if config.mode == "folders" and ears:
        items = [{"ear": ear, "view": view, "label": f"{ear}_{view}"} for ear in ears for view in config.views]
    elif config.photo_ear_mode and ears:
        items = [{"ear": ear, "view": view, "label": f"{ear}_{view}"} for ear in ears for view in config.views]
    else:
        items = [{"ear": "", "view": view, "label": view} for view in config.views]
    fields = photo_field_names([item["label"] for item in items])
    return [{**item, "field": fields[index], "display": f"{item['ear']} · {item['view']}" if item["ear"] else item["view"]} for index, item in enumerate(items)]


def _bare_descriptors(config: MappingConfig) -> list[dict[str, str]]:
    if not config.include_bare_ear and not config.bare_ear_config.get("enabled"):
        return []
    split = bool(config.bare_ear_config.get("splitByEar")) and not config.single_ear_mode
    if split:
        result: list[dict[str, str]] = []
        for ear, key in (("左耳", "leftCount"), ("右耳", "rightCount")):
            count = max(0, int(config.bare_ear_config.get(key, 1)))
            for index in range(count):
                suffix = f"_{index + 1}" if count > 1 else ""
                result.append({"ear": ear, "view": "空耳", "label": f"{ear} · 空耳{f' {index + 1}' if count > 1 else ''}", "field": f"bare_ear_photo_{ear}{suffix}"})
        return result
    count = max(1, int(config.bare_ear_config.get("genericCount", config.bare_ear_config.get("count", 1))))
    return [{"ear": "", "view": "空耳", "label": f"空耳{f' {index + 1}' if count > 1 else ''}", "field": f"bare_ear_photo{f'_{index + 1}' if count > 1 else ''}"} for index in range(count)]


def stable_row_key(row: dict[str, str], config: MappingConfig) -> str:
    return "|||".join(str(row.get(field, "")).strip() for field in (config.user_field, config.device_field, config.ear_field) if field)


def _expand_folder_rows(rows: list[dict[str, str]], photos: list[PhotoFile], config: MappingConfig) -> list[dict[str, str]]:
    if config.mode != "folders" or not config.device_field:
        return [dict(row) for row in rows]
    users = sorted({str(row.get(config.user_field, "")) for row in rows if row.get(config.user_field)}, key=natural_key)
    devices = sorted({str(row.get(config.device_field, "")) for row in rows if row.get(config.device_field)}, key=natural_key)
    ears = _ear_values(rows, config.ear_field, photos, config.expected_ears)
    combos: list[tuple[str, str]] = []
    for photo in photos:
        if _is_bare(photo):
            continue
        parts = path_parts(photo)
        user = next((value for value in users if parts_include(parts, value)), "")
        if not user:
            continue
        device = next((value for value in devices if parts_include(parts, value)), "")
        if not device:
            excluded = [user, *ears, *config.views]
            residual = [_clean_view(part) for part in parts if not any(value and folder_matches(part, value) for value in excluded)]
            device = residual[-1] if residual else ""
        if device and (user, device) not in combos:
            combos.append((user, device))
    existing = {(str(row.get(config.user_field, "")), str(row.get(config.device_field, ""))) for row in rows}
    templates = {user: next(row for row in rows if str(row.get(config.user_field, "")) == user) for user in users}
    expanded = [dict(row) for row in rows]
    for user, device in sorted(combos, key=lambda item: (natural_key(item[0]), natural_key(item[1]))):
        if (user, device) in existing:
            continue
        row = dict(templates.get(user, {}))
        row[config.user_field] = user
        row[config.device_field] = device
        expanded.append(row)
        existing.add((user, device))
    return expanded


def map_photos(rows: list[dict[str, str]], photos: list[PhotoFile], config: MappingConfig) -> MappingResult:
    if config.mode not in {"auto", "folders", "sequence"}:
        raise ValueError(f"未知照片映射模式：{config.mode}")
    mode = config.mode
    if mode == "auto":
        inferred = infer_folder_views(rows, photos, config.user_field, config.ear_field, config.device_field)
        mode = "folders" if inferred else "sequence"
        if not config.views:
            config.views = inferred
    config.mode = mode
    if mode == "folders" and not config.views:
        config.views = infer_folder_views(rows, photos, config.user_field, config.ear_field, config.device_field)
    if mode == "folders" and any(_is_bare(photo) for photo in photos):
        config.include_bare_ear = True
    if mode == "folders" and not config.ear_field and not config.photo_ear_mode and not config.expected_ears and not config.single_ear_mode:
        group_ears: dict[str, set[str]] = defaultdict(set)
        for photo in photos:
            if _is_bare(photo):
                continue
            parts = path_parts(photo)
            user = next((str(row.get(config.user_field, "")) for row in rows if parts_include(parts, row.get(config.user_field, ""))), "")
            if not user:
                continue
            device = next((str(row.get(config.device_field, "")) for row in rows if config.device_field and parts_include(parts, row.get(config.device_field, ""))), "")
            ear = next((infer_ear(part) for part in parts if infer_ear(part)), "")
            if ear:
                group_ears[f"{user}|||{device}"].add(ear)
        if group_ears and all(len(ears) == 1 for ears in group_ears.values()):
            config.single_ear_mode = True
    if not config.views:
        raise ValueError("未配置或识别出照片视角")
    rows = _expand_folder_rows(rows, photos, config)
    descriptors = _bare_descriptors(config) + _descriptors(rows, photos, config)
    photo_fields = [item["field"] for item in descriptors]
    mapped = [{key: value for key, value in row.items() if not re.search(r"photo|image|picture|照片|图片", key, re.I)} for row in rows]
    for row in mapped:
        row.update({field_name: "" for field_name in photo_fields})
    slots: list[dict[str, Any]] = []
    audit: list[dict[str, Any]] = []
    used: set[str] = set()

    photos_sorted = sorted(photos, key=lambda item: natural_key(item.relative_path))
    if mode == "sequence":
        bare_descriptors = [item for item in descriptors if item["field"].startswith("bare_ear_photo")]
        regular_descriptors = [item for item in descriptors if not item["field"].startswith("bare_ear_photo")]
        by_user: dict[str, list[PhotoFile]] = defaultdict(list)
        for photo in photos_sorted:
            by_user[photo.user_folder].append(photo)
        row_groups: dict[str, list[int]] = defaultdict(list)
        for index, row in enumerate(rows):
            row_groups[str(row.get(config.user_field, ""))].append(index)
        for user, indices in row_groups.items():
            user_photos = by_user.get(user, [])
            labeled_bare = [item for item in user_photos if _is_bare(item)]
            bare = labeled_bare if labeled_bare else user_photos[:len(bare_descriptors)]
            regular = [item for item in user_photos if item not in bare]
            for bare_index, descriptor in enumerate(bare_descriptors):
                applicable = [index for index in indices if not descriptor["ear"] or not config.ear_field or folder_matches(rows[index].get(config.ear_field, ""), descriptor["ear"])]
                if not applicable:
                    continue
                photo = bare[bare_index] if bare_index < len(bare) else None
                _assign_slot(mapped, rows, slots, audit, used, applicable[0], descriptor, photo, config)
                value = mapped[applicable[0]][descriptor["field"]]
                for row_index in applicable[1:]:
                    mapped[row_index][descriptor["field"]] = value
            regular_index = 0
            for row_index in indices:
                row = rows[row_index]
                for descriptor in regular_descriptors:
                    if descriptor["ear"] and config.ear_field and not folder_matches(row.get(config.ear_field, ""), descriptor["ear"]):
                        continue
                    photo = regular[regular_index] if regular_index < len(regular) else None
                    regular_index += 1
                    _assign_slot(mapped, rows, slots, audit, used, row_index, descriptor, photo, config)
            for photo in user_photos:
                if photo.relative_path not in used:
                    audit.append(_audit("extra", user, "", "", "", f"未使用照片：{photo.relative_path}"))
    else:
        for row_index, row in enumerate(rows):
            for descriptor in descriptors:
                parts_match: list[PhotoFile] = []
                for photo in photos_sorted:
                    parts = path_parts(photo)
                    wants_bare = descriptor["field"].startswith("bare_ear_photo")
                    if wants_bare != _is_bare(photo):
                        continue
                    if not parts_include(parts, row.get(config.user_field, "")):
                        continue
                    if descriptor["ear"] and not parts_include(parts, descriptor["ear"]):
                        continue
                    if config.ear_field and row.get(config.ear_field) and not wants_bare and not parts_include(parts, row[config.ear_field]):
                        continue
                    if config.device_field and row.get(config.device_field) and not wants_bare and not parts_include(parts, row[config.device_field]):
                        continue
                    if not wants_bare and not parts_include(parts, descriptor["view"]):
                        continue
                    parts_match.append(photo)
                photo = parts_match[0] if parts_match else None
                _assign_slot(mapped, rows, slots, audit, used, row_index, descriptor, photo, config)
                for extra in parts_match[1:]:
                    audit.append(_audit("extra", row.get(config.user_field, ""), row.get(config.device_field, "") if config.device_field else "", row_index + 1, descriptor["field"], f"重复/补拍照片：{extra.relative_path}"))

    unused = [photo.relative_path for photo in photos_sorted if photo.relative_path not in used]
    return MappingResult(mapped, slots, photo_fields, [item for item in descriptors if not item["field"].startswith("bare_ear_photo")], audit, unused, mode)


def _assign_slot(mapped: list[dict[str, str]], source_rows: list[dict[str, str]], slots: list[dict[str, Any]], audit: list[dict[str, Any]], used: set[str], row_index: int, descriptor: dict[str, str], photo: PhotoFile | None, config: MappingConfig) -> None:
    row = source_rows[row_index]
    stable_key = stable_row_key(row, config)
    stable_override = f"{stable_key}::{descriptor['field']}"
    legacy_override = f"{row_index}::{descriptor['field']}"
    value = config.overrides.get(stable_override, config.overrides.get(legacy_override, photo.relative_path if photo else ""))
    mapped[row_index][descriptor["field"]] = value
    if value:
        used.add(value)
    else:
        audit.append(_audit("missing", row.get(config.user_field, ""), row.get(config.device_field, "") if config.device_field else "", row_index + 1, descriptor["field"], "缺失照片"))
    slots.append({
        "rowIndex": row_index,
        "stableKey": stable_key,
        "field": descriptor["field"],
        "label": descriptor["label"],
        "user": row.get(config.user_field, ""),
        "device": row.get(config.device_field, "") if config.device_field else "",
        "ear": descriptor["ear"] or (row.get(config.ear_field, "") if config.ear_field else ""),
        "view": descriptor["view"],
        "value": value,
        "automatic": photo.relative_path if photo else "",
        "source": "manual" if value != (photo.relative_path if photo else "") else "automatic",
    })


def _audit(status: str, user: Any, device: Any, row_index: Any, field_name: Any, message: str) -> dict[str, Any]:
    return {"status": status, "user": user, "device": device, "rowIndex": row_index, "field": field_name, "view": field_name, "message": message}


def set_slot(result: MappingResult, slot_index: int, value: str) -> None:
    slot = result.slots[slot_index]
    slot["value"] = value
    slot["source"] = "manual"
    result.rows[slot["rowIndex"]][slot["field"]] = value


def swap_slots(result: MappingResult, first: int, second: int) -> None:
    left, right = result.slots[first]["value"], result.slots[second]["value"]
    set_slot(result, first, right)
    set_slot(result, second, left)


def swap_device_groups(result: MappingResult, user: str, first_device: str, second_device: str) -> None:
    first = {(slot["ear"], slot["view"]): index for index, slot in enumerate(result.slots) if slot["user"] == user and slot["device"] == first_device}
    second = {(slot["ear"], slot["view"]): index for index, slot in enumerate(result.slots) if slot["user"] == user and slot["device"] == second_device}
    for key in set(first) & set(second):
        swap_slots(result, first[key], second[key])


def swap_ear_groups(result: MappingResult, user: str) -> None:
    left = {(slot["device"], slot["view"]): index for index, slot in enumerate(result.slots) if slot["user"] == user and "左" in slot["ear"]}
    right = {(slot["device"], slot["view"]): index for index, slot in enumerate(result.slots) if slot["user"] == user and "右" in slot["ear"]}
    for key in set(left) & set(right):
        swap_slots(result, left[key], right[key])


def restore_slots(result: MappingResult, user: str | None = None) -> None:
    for index, slot in enumerate(result.slots):
        if user is None or slot["user"] == user:
            set_slot(result, index, slot["automatic"])
            slot["source"] = "automatic"


def mapping_overrides(result: MappingResult, stable: bool = False) -> dict[str, str]:
    overrides: dict[str, str] = {}
    for slot in result.slots:
        if slot["value"] == slot["automatic"]:
            continue
        prefix = slot["stableKey"] if stable else str(slot["rowIndex"])
        overrides[f"{prefix}::{slot['field']}"] = slot["value"]
    return overrides

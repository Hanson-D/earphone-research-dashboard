#!/usr/bin/env python3
import json
import hmac
import os
import re
import tempfile
from pathlib import Path


CLIENT_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$")
ACCESS_TOKEN_PATTERN = re.compile(r"^[A-Za-z0-9_-]{32,}$")
MIN_ACCESS_PORT = 1024
MAX_ACCESS_PORT = 65535


def auth_required():
    legacy = os.environ.get("DASHBOARD_AUTH_REQUIRED", "0")
    return os.environ.get("DASHBOARD_CLIENT_ACCESS_REQUIRED", legacy) == "1"


def auth_config_path():
    configured = os.environ.get("DASHBOARD_CLIENT_ACCESS_CONFIG") or os.environ.get("DASHBOARD_AUTH_CONFIG")
    return Path(configured or "/etc/earphone-dashboard/access.json")


def new_config():
    return {"version": 2, "clients": {}}


def normalize_projects(projects):
    if isinstance(projects, str):
        projects = [item.strip() for item in projects.split(",")]
    values = []
    for project_id in projects or []:
        project_id = str(project_id).strip().upper()
        if project_id and project_id not in values:
            values.append(project_id)
    return values


def validate_client_id(client_id):
    value = str(client_id or "").strip()
    if not CLIENT_ID_PATTERN.fullmatch(value):
        raise ValueError("Client ID must use 1-32 letters, numbers, underscore, or hyphen.")
    return value


def validate_access_port(port):
    try:
        value = int(port)
    except (TypeError, ValueError):
        raise ValueError("Client access port must be numeric.")
    if not MIN_ACCESS_PORT <= value <= MAX_ACCESS_PORT:
        raise ValueError("Client access port must be between {} and {}.".format(MIN_ACCESS_PORT, MAX_ACCESS_PORT))
    return value


def validate_access_token(token):
    value = str(token or "")
    if not ACCESS_TOKEN_PATTERN.fullmatch(value):
        raise ValueError("Client access token must contain at least 32 URL-safe characters.")
    return value


def _upgrade_config(payload):
    if not isinstance(payload, dict):
        raise ValueError("Client access config must be a JSON object.")
    if "clients" not in payload:
        payload["clients"] = {}
    if not isinstance(payload["clients"], dict):
        raise ValueError("Client access config must contain a clients object.")
    payload["version"] = 2
    return payload


def validate_config(payload):
    payload = _upgrade_config(payload)
    ports = {}
    for client_id, record in payload["clients"].items():
        validate_client_id(client_id)
        if not isinstance(record, dict):
            raise ValueError("Client record must be an object: {}".format(client_id))
        port = validate_access_port(record.get("port"))
        if port in ports:
            raise ValueError("Client access port {} is assigned to both {} and {}.".format(port, ports[port], client_id))
        ports[port] = client_id
        record["port"] = port
        record["admin"] = bool(record.get("admin"))
        record["projects"] = ["*"] if record["admin"] else normalize_projects(record.get("projects"))
        record["displayName"] = str(record.get("displayName") or client_id)
        record["disabled"] = bool(record.get("disabled"))
        try:
            record["token"] = validate_access_token(record.get("token"))
        except ValueError:
            raise ValueError("Client access token is invalid: {}".format(client_id))
    return payload


def load_config(path=None):
    target = Path(path) if path else auth_config_path()
    payload = json.loads(target.read_text(encoding="utf-8"))
    return validate_config(payload)


def save_config(payload, path=None):
    payload = validate_config(payload)
    target = Path(path) if path else auth_config_path()
    target.parent.mkdir(parents=True, exist_ok=True)
    handle, temporary_name = tempfile.mkstemp(prefix=target.name + ".", dir=str(target.parent))
    try:
        with os.fdopen(handle, "w", encoding="utf-8") as temporary:
            json.dump(payload, temporary, ensure_ascii=False, indent=2)
            temporary.write("\n")
        os.chmod(temporary_name, 0o640)
        os.replace(temporary_name, str(target))
    except Exception:
        try:
            os.unlink(temporary_name)
        except OSError:
            pass
        raise


def initialize_config(path=None):
    target = Path(path) if path else auth_config_path()
    if not target.exists():
        save_config(new_config(), target)
        return True
    original = json.loads(target.read_text(encoding="utf-8"))
    needs_upgrade = original.get("version") != 2 or "clients" not in original
    upgraded = _upgrade_config(original)
    if needs_upgrade:
        save_config(upgraded, target)
    return False


def public_user(client_id, record):
    return {
        "username": client_id,
        "clientId": client_id,
        "displayName": record.get("displayName") or client_id,
        "admin": bool(record.get("admin")),
        "projects": ["*"] if record.get("admin") else normalize_projects(record.get("projects")),
    }


def client_for_id(config, client_id, token):
    if not client_id or not token:
        return None
    record = config.get("clients", {}).get(str(client_id))
    if not isinstance(record, dict) or record.get("disabled"):
        return None
    if not hmac.compare_digest(str(record.get("token") or ""), str(token)):
        return None
    return public_user(str(client_id), record)


def active_client_ports(config):
    return {
        int(record["port"]): client_id
        for client_id, record in config.get("clients", {}).items()
        if isinstance(record, dict) and not record.get("disabled")
    }


def can_access_project(user, project_id):
    if not user:
        return False
    return bool(user.get("admin")) or str(project_id).upper() in set(user.get("projects") or [])

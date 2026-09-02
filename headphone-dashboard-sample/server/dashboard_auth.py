#!/usr/bin/env python3
import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import tempfile
import time
from pathlib import Path


USERNAME_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$")
PASSWORD_SCHEME = "pbkdf2_sha256"
PASSWORD_ITERATIONS = 260000
SESSION_TTL_SECONDS = 8 * 60 * 60


def auth_required():
    return os.environ.get("DASHBOARD_AUTH_REQUIRED", "0") == "1"


def auth_config_path():
    return Path(os.environ.get("DASHBOARD_AUTH_CONFIG", "/etc/earphone-dashboard/access.json"))


def new_config():
    return {
        "version": 1,
        "sessionSecret": secrets.token_hex(32),
        "users": {},
    }


def load_config(path=None):
    target = Path(path) if path else auth_config_path()
    payload = json.loads(target.read_text(encoding="utf-8"))
    if not isinstance(payload, dict) or not isinstance(payload.get("users"), dict):
        raise ValueError("Authentication config must contain a users object.")
    secret = payload.get("sessionSecret")
    if not isinstance(secret, str) or len(secret) < 32:
        raise ValueError("Authentication config sessionSecret is missing or too short.")
    return payload


def save_config(payload, path=None):
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
    if target.exists():
        return False
    save_config(new_config(), target)
    return True


def validate_username(username):
    if not USERNAME_PATTERN.fullmatch(str(username or "")):
        raise ValueError("Username must use 1-64 letters, numbers, dot, underscore, or hyphen.")
    return str(username)


def normalize_projects(projects):
    if isinstance(projects, str):
        projects = [item.strip() for item in projects.split(",")]
    values = []
    for project_id in projects or []:
        project_id = str(project_id).strip()
        if project_id and project_id not in values:
            values.append(project_id)
    return values


def hash_password(password, iterations=PASSWORD_ITERATIONS):
    if len(str(password or "")) < 10:
        raise ValueError("Password must contain at least 10 characters.")
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return "$".join([
        PASSWORD_SCHEME,
        str(iterations),
        base64.urlsafe_b64encode(salt).decode("ascii").rstrip("="),
        base64.urlsafe_b64encode(digest).decode("ascii").rstrip("="),
    ])


def _decode_base64(value):
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def verify_password(password, encoded):
    try:
        scheme, iterations, salt, expected = str(encoded).split("$", 3)
        if scheme != PASSWORD_SCHEME:
            return False
        actual = hashlib.pbkdf2_hmac(
            "sha256",
            str(password).encode("utf-8"),
            _decode_base64(salt),
            int(iterations),
        )
        return hmac.compare_digest(actual, _decode_base64(expected))
    except (TypeError, ValueError):
        return False


def public_user(username, record):
    return {
        "username": username,
        "displayName": record.get("displayName") or username,
        "admin": bool(record.get("admin")),
        "projects": ["*"] if record.get("admin") else normalize_projects(record.get("projects")),
    }


def authenticate(config, username, password):
    record = config.get("users", {}).get(str(username))
    if not isinstance(record, dict) or record.get("disabled"):
        return None
    if not verify_password(password, record.get("password")):
        return None
    return public_user(str(username), record)


def can_access_project(user, project_id):
    if not user:
        return False
    return bool(user.get("admin")) or str(project_id) in set(user.get("projects") or [])


def _encode_json(payload):
    data = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def create_session(config, username, now=None, ttl=SESSION_TTL_SECONDS):
    record = config.get("users", {}).get(username)
    if not isinstance(record, dict):
        raise ValueError("Unknown user.")
    now = int(now if now is not None else time.time())
    payload = _encode_json({
        "u": username,
        "r": int(record.get("revision") or 1),
        "iat": now,
        "exp": now + int(ttl),
    })
    signature = hmac.new(
        config["sessionSecret"].encode("utf-8"),
        payload.encode("ascii"),
        hashlib.sha256,
    ).digest()
    return payload + "." + base64.urlsafe_b64encode(signature).decode("ascii").rstrip("=")


def read_session(config, token, now=None):
    try:
        payload, signature = str(token).split(".", 1)
        expected = hmac.new(
            config["sessionSecret"].encode("utf-8"),
            payload.encode("ascii"),
            hashlib.sha256,
        ).digest()
        if not hmac.compare_digest(expected, _decode_base64(signature)):
            return None
        data = json.loads(_decode_base64(payload).decode("utf-8"))
        now = int(now if now is not None else time.time())
        if int(data.get("exp") or 0) <= now:
            return None
        username = data.get("u")
        record = config.get("users", {}).get(username)
        if not isinstance(record, dict) or record.get("disabled"):
            return None
        if int(data.get("r") or 0) != int(record.get("revision") or 1):
            return None
        return public_user(username, record)
    except (KeyError, TypeError, ValueError, json.JSONDecodeError):
        return None

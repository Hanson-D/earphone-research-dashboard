#!/usr/bin/env python3
import argparse
import base64
import ctypes
import getpass
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import time
import urllib.parse
import webbrowser
from pathlib import Path


APP_NAME = "EarphoneDashboardClient"
BUNDLE_NAME = "client.bundle"
CLIENT_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$")
TOKEN_PATTERN = re.compile(r"^[A-Za-z0-9_-]{32,}$")
CREATE_NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)
CREATE_NEW_PROCESS_GROUP = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)


class ClientError(RuntimeError):
    pass


def application_dir():
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


def decode_bytes(value, label):
    try:
        return base64.b64decode(str(value or ""), validate=True)
    except ValueError as error:
        raise ClientError("Invalid {} in client.bundle.".format(label)) from error


def decode_text(value, label):
    try:
        return decode_bytes(value, label).decode("utf-8")
    except UnicodeDecodeError as error:
        raise ClientError("Invalid {} in client.bundle.".format(label)) from error


def validate_bundle(payload):
    if not isinstance(payload, dict) or payload.get("version") != 1:
        raise ClientError("Unsupported client.bundle format.")
    client_id = str(payload.get("clientId") or "")
    if not CLIENT_ID_PATTERN.fullmatch(client_id):
        raise ClientError("Invalid client ID in client.bundle.")
    for field in ("sshPort", "localPort", "remotePort"):
        try:
            value = int(payload.get(field))
        except (TypeError, ValueError) as error:
            raise ClientError("Invalid {} in client.bundle.".format(field)) from error
        if not 1 <= value <= 65535:
            raise ClientError("{} is outside the valid port range.".format(field))
        payload[field] = value
    for field in ("sshUser", "serverHost", "keyName"):
        if not str(payload.get(field) or "").strip():
            raise ClientError("Missing {} in client.bundle.".format(field))
    expected_key = "kanban_{}".format(client_id)
    expected_user = "kanban_{}".format(client_id.replace("-", "_"))
    if payload["keyName"] != expected_key or payload["sshUser"] != expected_user:
        raise ClientError("Client identity fields do not match the client ID.")
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,252}", str(payload["serverHost"])):
        raise ClientError("Invalid server host in client.bundle.")
    if not TOKEN_PATTERN.fullmatch(str(payload.get("accessToken") or "")):
        raise ClientError("Invalid access token in client.bundle.")
    decode_text(payload.get("knownHosts"), "known hosts")
    if payload.get("privateKey"):
        decode_text(payload.get("privateKey"), "private key")
    return payload


def load_bundle(path):
    try:
        payload = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise ClientError("Cannot read client.bundle: {}".format(error)) from error
    return validate_bundle(payload)


def state_root(client_id):
    base = os.environ.get("LOCALAPPDATA")
    if not base:
        raise ClientError("LOCALAPPDATA is unavailable for this Windows account.")
    return Path(base) / "EarphoneDashboardTunnel" / client_id


def run_hidden(arguments, check=True):
    result = subprocess.run(
        arguments,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        creationflags=CREATE_NO_WINDOW,
    )
    if check and result.returncode != 0:
        detail = (result.stderr or result.stdout or "command failed").strip()
        raise ClientError(detail)
    return result


def windows_identity():
    result = run_hidden(["whoami.exe"])
    return result.stdout.strip() or getpass.getuser()


def process_is_ssh(pid):
    result = run_hidden(
        ["tasklist.exe", "/FI", "PID eq {}".format(pid), "/FO", "CSV", "/NH"],
        check=False,
    )
    return result.returncode == 0 and "ssh.exe" in result.stdout.lower()


def stop_recorded_tunnel(root):
    pid_path = root / "tunnel.pid"
    if not pid_path.is_file():
        return False
    try:
        pid = int(pid_path.read_text(encoding="ascii").strip())
    except (OSError, ValueError):
        pid = 0
    if pid > 0 and process_is_ssh(pid):
        run_hidden(["taskkill.exe", "/PID", str(pid), "/F"], check=False)
    try:
        pid_path.unlink()
    except OSError:
        pass
    return True


def grant_full_control(path, identity):
    run_hidden(["icacls.exe", str(path), "/grant:r", "{}:(F)".format(identity)])


def restrict_secret(path, identity):
    run_hidden(["icacls.exe", str(path), "/inheritance:r"])
    run_hidden(["icacls.exe", str(path), "/grant:r", "{}:(R)".format(identity)])


def install_bundle(payload):
    root = state_root(payload["clientId"])
    root.mkdir(parents=True, exist_ok=True)
    stop_recorded_tunnel(root)
    identity = windows_identity()
    key_path = root / payload["keyName"]
    if payload.get("privateKey"):
        if key_path.exists():
            grant_full_control(key_path, identity)
        key_path.write_bytes(decode_bytes(payload["privateKey"], "private key"))
    elif not key_path.is_file():
        raise ClientError(
            "This upgrade bundle has no private key, and this Windows account has no installed key. "
            "Ask the administrator to recreate the client."
        )
    known_hosts_path = root / "known_hosts"
    known_hosts_path.write_bytes(decode_bytes(payload["knownHosts"], "known hosts"))
    state_path = root / "client.json"
    if state_path.exists():
        grant_full_control(state_path, identity)
    safe_state = dict(payload)
    safe_state.pop("privateKey", None)
    safe_state.pop("knownHosts", None)
    state_path.write_text(json.dumps(safe_state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    restrict_secret(key_path, identity)
    restrict_secret(state_path, identity)
    return root, key_path, known_hosts_path


def local_port_in_use(port):
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(0.25)
    try:
        return sock.connect_ex(("127.0.0.1", port)) == 0
    finally:
        sock.close()


def start_tunnel(payload, root, key_path, known_hosts_path):
    if local_port_in_use(payload["localPort"]):
        raise ClientError("Local port {} is already in use.".format(payload["localPort"]))
    ssh = shutil.which("ssh.exe")
    if not ssh:
        raise ClientError("Windows OpenSSH Client is not installed.")
    arguments = [
        ssh,
        "-N",
        "-i", str(key_path),
        "-p", str(payload["sshPort"]),
        "-L", "127.0.0.1:{}:127.0.0.1:{}".format(payload["localPort"], payload["remotePort"]),
        "-o", "BatchMode=yes",
        "-o", "ExitOnForwardFailure=yes",
        "-o", "ServerAliveInterval=30",
        "-o", "ServerAliveCountMax=3",
        "-o", "StrictHostKeyChecking=yes",
        "-o", 'UserKnownHostsFile="{}"'.format(known_hosts_path),
        "{}@{}".format(payload["sshUser"], payload["serverHost"]),
    ]
    log_path = root / "ssh.log"
    with log_path.open("ab") as log_file:
        process = subprocess.Popen(
            arguments,
            stdin=subprocess.DEVNULL,
            stdout=log_file,
            stderr=log_file,
            creationflags=CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP,
        )
    (root / "tunnel.pid").write_text(str(process.pid), encoding="ascii")
    for _ in range(40):
        if process.poll() is not None:
            stop_recorded_tunnel(root)
            try:
                detail = log_path.read_text(encoding="utf-8", errors="replace")[-1200:].strip()
            except OSError:
                detail = ""
            raise ClientError("SSH tunnel exited before it became ready.{}".format(
                "\n\n" + detail if detail else ""
            ))
        if local_port_in_use(payload["localPort"]):
            return process
        time.sleep(0.25)
    stop_recorded_tunnel(root)
    raise ClientError("SSH tunnel did not become ready within 10 seconds.")


def dashboard_url(payload):
    query = urllib.parse.urlencode({"access_token": payload["accessToken"]})
    return "http://127.0.0.1:{}/?{}".format(payload["localPort"], query)


def show_error(message):
    if sys.platform == "win32":
        ctypes.windll.user32.MessageBoxW(None, str(message), "Earphone Dashboard", 0x10)
    else:
        print("ERROR: {}".format(message), file=sys.stderr)


def main(argv=None):
    parser = argparse.ArgumentParser(description="Open the Earphone Dashboard Windows client.")
    parser.add_argument("--stop", action="store_true", help="Stop this client's recorded SSH tunnel.")
    parser.add_argument("--bundle", default=str(application_dir() / BUNDLE_NAME))
    args = parser.parse_args(argv)
    try:
        payload = load_bundle(args.bundle)
        root = state_root(payload["clientId"])
        if args.stop:
            stop_recorded_tunnel(root)
            return 0
        root, key_path, known_hosts_path = install_bundle(payload)
        start_tunnel(payload, root, key_path, known_hosts_path)
        webbrowser.open(dashboard_url(payload), new=2)
        return 0
    except ClientError as error:
        show_error(error)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
import argparse
import base64
import json
import os
import re
import tempfile
from pathlib import Path


TOKEN_PATTERN = re.compile(r"^[A-Za-z0-9_-]{32,}$")


def encode_file(path):
    return base64.b64encode(Path(path).read_bytes()).decode("ascii")


def main():
    parser = argparse.ArgumentParser(description="Create a portable Windows dashboard client bundle.")
    parser.add_argument("--output", required=True)
    parser.add_argument("--client-id", required=True)
    parser.add_argument("--ssh-user", required=True)
    parser.add_argument("--server-host", required=True)
    parser.add_argument("--ssh-port", required=True, type=int)
    parser.add_argument("--local-port", required=True, type=int)
    parser.add_argument("--remote-port", required=True, type=int)
    parser.add_argument("--key-name", required=True)
    parser.add_argument("--access-token", required=True)
    parser.add_argument("--known-hosts", required=True)
    parser.add_argument("--private-key")
    args = parser.parse_args()
    if not TOKEN_PATTERN.fullmatch(args.access_token):
        raise SystemExit("Invalid access token.")
    payload = {
        "version": 1,
        "clientId": args.client_id,
        "sshUser": args.ssh_user,
        "serverHost": args.server_host,
        "sshPort": args.ssh_port,
        "localPort": args.local_port,
        "remotePort": args.remote_port,
        "keyName": args.key_name,
        "accessToken": args.access_token,
        "knownHosts": encode_file(args.known_hosts),
    }
    if args.private_key and Path(args.private_key).is_file():
        payload["privateKey"] = encode_file(args.private_key)
    target = Path(args.output)
    target.parent.mkdir(parents=True, exist_ok=True)
    handle, temporary_name = tempfile.mkstemp(prefix=target.name + ".", dir=str(target.parent))
    try:
        with os.fdopen(handle, "w", encoding="utf-8") as temporary:
            json.dump(payload, temporary, ensure_ascii=False, indent=2)
            temporary.write("\n")
        os.chmod(temporary_name, 0o600)
        os.replace(temporary_name, str(target))
    except Exception:
        try:
            os.unlink(temporary_name)
        except OSError:
            pass
        raise


if __name__ == "__main__":
    main()

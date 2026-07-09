#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

export HOST="${HOST:-0.0.0.0}"
if [[ -z "${PORT:-}" ]]; then
  PORT=""
  for candidate in $(seq 7362 7461); do
    if ! lsof -iTCP:"${candidate}" -sTCP:LISTEN -n -P >/dev/null 2>&1; then
      PORT="${candidate}"
      break
    fi
  done
fi

if [[ -z "${PORT:-}" ]]; then
  echo "No available local port was found between 7362 and 7461."
  echo "Please set PORT manually or stop the program using these ports."
  exit 1
fi

export PORT
export DASHBOARD_LEGACY_PATHS=0

if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3 was not found. Please install Python 3 first."
  exit 1
fi

echo "Starting Earphone Research Dashboard server mode..."
echo "Local test entry: http://127.0.0.1:${PORT}/server/server.html"
echo "LAN users should open: http://SERVER_IP:${PORT}/server/server.html"
echo
python3 server/server.py

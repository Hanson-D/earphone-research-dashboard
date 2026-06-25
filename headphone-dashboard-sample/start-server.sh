#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

export HOST="${HOST:-0.0.0.0}"
export PORT="${PORT:-8000}"
export DASHBOARD_LEGACY_PATHS=0

if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3 was not found. Please install Python 3 first."
  exit 1
fi

echo "Starting Earphone Research Dashboard server mode..."
echo "Local test entry: http://127.0.0.1:${PORT}/server.html"
echo "LAN users should open: http://SERVER_IP:${PORT}/server.html"
echo
python3 server.py

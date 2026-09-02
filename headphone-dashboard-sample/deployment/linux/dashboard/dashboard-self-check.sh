#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${APP_ROOT:-/home/earphone/kanban/app}"
PROJECTS_ROOT="${PROJECTS_ROOT:-/home/earphone/kanban/projects}"
DASHBOARD_USER="${DASHBOARD_USER:-dashboard}"
DASHBOARD_HOST="${DASHBOARD_HOST:-127.0.0.1}"
DASHBOARD_PORT="${DASHBOARD_PORT:-7362}"
DASHBOARD_PYTHON="${DASHBOARD_PYTHON:-/opt/earphone-dashboard/python/bin/python3}"

[[ "$(id -un)" == "${DASHBOARD_USER}" ]] || {
  printf 'ERROR: Run as %s.\n' "${DASHBOARD_USER}" >&2
  exit 1
}

failures=0

check() {
  local label="$1"
  shift
  if "$@"; then
    printf 'PASS  %s\n' "${label}"
  else
    printf 'FAIL  %s\n' "${label}"
    failures=$((failures + 1))
  fi
}

check "dashboard Python executable" test -x "${DASHBOARD_PYTHON}"
if [[ ! -x "${DASHBOARD_PYTHON}" ]]; then
  exit 1
fi
check "dashboard Python 3.7+" "${DASHBOARD_PYTHON}" -c \
  'import sys; raise SystemExit(0 if sys.version_info >= (3, 7) else 1)'
check "server.py readable" test -r "${APP_ROOT}/server/server.py"
check "projects directory writable" test -w "${PROJECTS_ROOT}"
check "thumbnail cache writable" test -w "${PROJECTS_ROOT}/.cache/photo-thumbnails"

if "${DASHBOARD_PYTHON}" -c 'import PIL' >/dev/null 2>&1; then
  printf 'PASS  Pillow available\n'
else
  printf 'WARN  Pillow is not installed; original images will be used when thumbnails cannot be generated.\n'
fi

if [[ -f "${APP_ROOT}/server/server_test.py" ]]; then
  if (cd "${APP_ROOT}" && "${DASHBOARD_PYTHON}" server/server_test.py); then
    printf 'PASS  backend unit tests\n'
  else
    printf 'FAIL  backend unit tests\n'
    failures=$((failures + 1))
  fi
fi

if command -v curl >/dev/null 2>&1; then
  if curl --fail --silent --show-error --max-time 3 \
    "http://${DASHBOARD_HOST}:${DASHBOARD_PORT}/" >/dev/null; then
    printf 'PASS  running service HTTP check\n'
  else
    printf 'INFO  running service HTTP check unavailable; the service may be stopped.\n'
  fi
fi

(( failures == 0 )) || exit 1

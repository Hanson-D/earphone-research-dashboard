#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${APP_ROOT:-/home/earphone/kanban/app}"
PROJECTS_ROOT="${PROJECTS_ROOT:-/home/earphone/kanban/projects}"
DASHBOARD_USER="${DASHBOARD_USER:-dashboard}"

[[ "$(id -un)" == "${DASHBOARD_USER}" ]] || {
  printf 'ERROR: Run as %s.\n' "${DASHBOARD_USER}" >&2
  exit 1
}

[[ -r "${APP_ROOT}/server/server.py" ]] || {
  printf 'ERROR: Cannot read %s/server/server.py\n' "${APP_ROOT}" >&2
  exit 1
}

install -d -m 0770 "${PROJECTS_ROOT}"
install -d -m 0770 "${PROJECTS_ROOT}/.cache"
install -d -m 0770 "${PROJECTS_ROOT}/.cache/photo-thumbnails"

probe="${PROJECTS_ROOT}/.dashboard-write-test.$$"
printf 'ok\n' >"${probe}"
rm -f "${probe}"

printf 'Dashboard data directories initialized.\n'
printf 'Application readable: %s\n' "${APP_ROOT}"
printf 'Projects writable: %s\n' "${PROJECTS_ROOT}"

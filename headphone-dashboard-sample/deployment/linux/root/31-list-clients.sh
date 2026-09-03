#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../lib/common.sh"

require_root

printf '%-16s %-20s %-28s %-8s %-8s %-10s %s\n' \
  CLIENT SSH_USER SERVER LOCAL ACCESS STATUS ACCOUNT

shopt -s nullglob
configs=("${CLIENTS_ROOT}"/*.conf)
shopt -u nullglob

if ((${#configs[@]} == 0)); then
  printf 'No clients are registered.\n'
  exit 0
fi

for config in "${configs[@]}"; do
  unset CLIENT_ID SSH_USER SERVER_HOST SSH_PORT LOCAL_PORT REMOTE_PORT ACCESS_PORT STATUS
  # shellcheck disable=SC1090
  source "${config}"
  account_status=missing
  if getent passwd "${SSH_USER}" >/dev/null; then
    account_status=present
  fi
  access_port="${ACCESS_PORT:-${REMOTE_PORT:-legacy}}"
  printf '%-16s %-20s %-28s %-8s %-8s %-10s %s\n' \
    "${CLIENT_ID}" "${SSH_USER}" "${SERVER_HOST}:${SSH_PORT}" \
    "${LOCAL_PORT}" "${access_port}" "${STATUS}" "${account_status}"
done

printf '\nProject access:\n'
if [[ -x "${DASHBOARD_PYTHON}" && -f "${APP_ROOT}/server/manage-clients.py" ]]; then
  "${DASHBOARD_PYTHON}" "${APP_ROOT}/server/manage-clients.py" \
    --config "$(auth_config_path)" --projects-root "${PROJECTS_ROOT}" list
else
  printf 'Client access runtime is not configured.\n'
fi

#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../lib/common.sh"

require_root

printf '%-16s %-20s %-28s %-8s %-10s %s\n' \
  CLIENT SSH_USER SERVER LOCAL STATUS ACCOUNT

shopt -s nullglob
configs=("${CLIENTS_ROOT}"/*.conf)
shopt -u nullglob

if ((${#configs[@]} == 0)); then
  printf 'No clients are registered.\n'
  exit 0
fi

for config in "${configs[@]}"; do
  unset CLIENT_ID SSH_USER SERVER_HOST SSH_PORT LOCAL_PORT STATUS
  # shellcheck disable=SC1090
  source "${config}"
  account_status=missing
  if getent passwd "${SSH_USER}" >/dev/null; then
    account_status=present
  fi
  printf '%-16s %-20s %-28s %-8s %-10s %s\n' \
    "${CLIENT_ID}" "${SSH_USER}" "${SERVER_HOST}:${SSH_PORT}" \
    "${LOCAL_PORT}" "${STATUS}" "${account_status}"
done

#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../lib/common.sh"

require_root
require_dashboard_python

operation="${1:-}"
case "${operation}" in
  add|list|set-projects|reset-password|delete) ;;
  *) die "Usage: $0 {add|list|set-projects|reset-password|delete}" ;;
esac

config="$(auth_config_path)"
if [[ "${operation}" == "add" || "${operation}" == "set-projects" ]]; then
  printf 'Available project codes:\n'
  "${DASHBOARD_PYTHON}" "${APP_ROOT}/server/manage-projects.py" --root "${PROJECTS_ROOT}" list
  printf '\n'
fi
"${DASHBOARD_PYTHON}" "${APP_ROOT}/server/manage-users.py" \
  --config "${config}" --projects-root "${PROJECTS_ROOT}" "${operation}"
chown root:"${DASHBOARD_GROUP}" "${config}"
chmod 0640 "${config}"

printf 'Dashboard service restart is not required.\n'

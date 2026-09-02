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
"${DASHBOARD_PYTHON}" "${APP_ROOT}/server/manage-users.py" --config "${config}" "${operation}"
chown root:"${DASHBOARD_GROUP}" "${config}"
chmod 0640 "${config}"

printf 'Dashboard service restart is not required.\n'

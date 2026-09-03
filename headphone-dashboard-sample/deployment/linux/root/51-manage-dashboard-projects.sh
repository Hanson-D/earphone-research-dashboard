#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../lib/common.sh"

require_root
require_dashboard_python

operation="${1:-}"
case "${operation}" in
  sync|list|set-code|relink) ;;
  *) die "Usage: $0 {sync|list|set-code|relink}" ;;
esac

"${DASHBOARD_PYTHON}" "${APP_ROOT}/server/manage-projects.py" \
  --root "${PROJECTS_ROOT}" --auth-config "$(auth_config_path)" "${operation}"

index_path="${PROJECTS_ROOT}/.dashboard-project-index.json"
if [[ -f "${index_path}" ]]; then
  chown root:"${DASHBOARD_GROUP}" "${index_path}"
  chmod 0640 "${index_path}"
fi

if [[ -f "$(auth_config_path)" ]]; then
  chown root:"${DASHBOARD_GROUP}" "$(auth_config_path)"
  chmod 0640 "$(auth_config_path)"
fi

printf 'Dashboard service restart is not required.\n'

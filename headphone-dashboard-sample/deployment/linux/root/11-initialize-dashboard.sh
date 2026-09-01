#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../lib/common.sh"

require_root
getent passwd "${DASHBOARD_USER}" >/dev/null || die "Service account does not exist: ${DASHBOARD_USER}"

run_as_user "${DASHBOARD_USER}" env \
  APP_ROOT="${APP_ROOT}" \
  PROJECTS_ROOT="${PROJECTS_ROOT}" \
  DASHBOARD_USER="${DASHBOARD_USER}" \
  bash "${SCRIPT_DIR}/../dashboard/dashboard-initialize.sh"

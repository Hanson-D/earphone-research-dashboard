#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../lib/common.sh"

require_root

action="${1:-status}"
unit="${SERVICE_NAME}.service"

case "${action}" in
  enable)
    systemctl enable "${unit}"
    ;;
  disable)
    systemctl disable "${unit}"
    ;;
  start)
    if ! systemctl is-active --quiet "${unit}"; then
      listener="$(dashboard_listener)"
      [[ -z "${listener}" ]] || die "Port ${DASHBOARD_PORT} is already in use: ${listener}"
    fi
    systemctl start "${unit}"
    systemctl status "${unit}" --no-pager
    ;;
  stop)
    systemctl stop "${unit}"
    ;;
  restart)
    systemctl restart "${unit}"
    systemctl status "${unit}" --no-pager
    ;;
  status)
    systemctl status "${unit}" --no-pager
    printf '\nListener:\n'
    dashboard_listener
    ;;
  logs)
    journalctl -u "${unit}" -f
    ;;
  health)
    require_command curl
    curl --fail --silent --show-error --max-time 5 \
      "http://${DASHBOARD_HOST}:${DASHBOARD_PORT}/api/health" >/dev/null
    printf 'Dashboard health check passed: http://%s:%s/api/health\n' \
      "${DASHBOARD_HOST}" "${DASHBOARD_PORT}"
    ;;
  *)
    die "Usage: $0 {enable|disable|start|stop|restart|status|logs|health}"
    ;;
esac

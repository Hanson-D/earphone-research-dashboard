#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../lib/common.sh"

require_root
require_dashboard_python
require_command systemctl

[[ -f "${APP_ROOT}/server/server.py" ]] || die "Missing ${APP_ROOT}/server/server.py"
[[ -f "${APP_ROOT}/server/manage-users.py" ]] || die "Missing ${APP_ROOT}/server/manage-users.py"

if ! getent group "${DASHBOARD_GROUP}" >/dev/null; then
  groupadd --system "${DASHBOARD_GROUP}"
  log "Created service group ${DASHBOARD_GROUP}."
fi

if ! getent passwd "${DASHBOARD_USER}" >/dev/null; then
  useradd --system \
    --gid "${DASHBOARD_GROUP}" \
    --home-dir /var/lib/earphone-dashboard \
    --create-home \
    --shell /usr/sbin/nologin \
    "${DASHBOARD_USER}"
  log "Created service account ${DASHBOARD_USER}."
else
  log "Service account ${DASHBOARD_USER} already exists."
fi

ensure_config_dirs
install -d -o "${DASHBOARD_USER}" -g "${DASHBOARD_GROUP}" -m 0770 "${PROJECTS_ROOT}"

chgrp -R "${DASHBOARD_GROUP}" "${APP_ROOT}"
find "${APP_ROOT}" -type d -exec chmod g+rX {} +
find "${APP_ROOT}" -type f -exec chmod g+r {} +

for parent in "$(dirname "${APP_ROOT}")" "$(dirname "$(dirname "${APP_ROOT}")")"; do
  [[ -d "${parent}" ]] || continue
  if ! run_as_user "${DASHBOARD_USER}" test -x "${parent}"; then
    if command -v setfacl >/dev/null 2>&1; then
      setfacl -m "u:${DASHBOARD_USER}:--x" "${parent}"
      log "Granted ${DASHBOARD_USER} traverse access to ${parent} with ACL."
    elif confirm "setfacl is unavailable. Grant other users traverse-only access to ${parent}"; then
      chmod o+x "${parent}"
      log "Granted traverse-only access to ${parent}."
    else
      die "Cannot grant ${DASHBOARD_USER} access through ${parent}. Install the acl package and rerun."
    fi
  fi
done

python_binary="$(dashboard_python_path)"
if ! run_as_user "${DASHBOARD_USER}" "${python_binary}" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 7) else 1)'; then
  die "${DASHBOARD_USER} cannot execute dashboard Python: ${python_binary}"
fi

auth_config="$(auth_config_path)"
"${python_binary}" "${APP_ROOT}/server/manage-users.py" --config "${auth_config}" init
chown root:"${DASHBOARD_GROUP}" "${auth_config}"
chmod 0640 "${auth_config}"

env_path="$(dashboard_env_path)"
cat >"${env_path}.tmp" <<EOF
HOST=${DASHBOARD_HOST}
PORT=${DASHBOARD_PORT}
DASHBOARD_PROJECTS_ROOT=${PROJECTS_ROOT}
DASHBOARD_LEGACY_PATHS=1
DASHBOARD_AUTH_REQUIRED=1
DASHBOARD_AUTH_CONFIG=${auth_config}
EOF
install -o root -g "${DASHBOARD_GROUP}" -m 0640 "${env_path}.tmp" "${env_path}"
rm -f "${env_path}.tmp"

unit_path="$(service_unit_path)"
cat >"${unit_path}.tmp" <<EOF
[Unit]
Description=Earphone Research Dashboard
After=network.target

[Service]
Type=simple
User=${DASHBOARD_USER}
Group=${DASHBOARD_GROUP}
WorkingDirectory=${APP_ROOT}
EnvironmentFile=${env_path}
ExecStart=${python_binary} ${APP_ROOT}/server/server.py
Restart=on-failure
RestartSec=3
UMask=0007

[Install]
WantedBy=multi-user.target
EOF
install -o root -g root -m 0644 "${unit_path}.tmp" "${unit_path}"
rm -f "${unit_path}.tmp"

systemctl daemon-reload
if systemd_analyze_supports_verify; then
  systemd-analyze verify "${unit_path}" >/dev/null
elif command -v systemd-analyze >/dev/null 2>&1; then
  warn "This systemd-analyze version has no verify operation; unit validation will occur when the service starts."
else
  warn "systemd-analyze is unavailable; unit verification will occur when the service starts."
fi

log "Dashboard service configuration installed."
printf 'Authentication is enabled. Add at least one dashboard administrator before starting the service.\n'
printf 'Service was not enabled or started.\n'
printf 'Next: run 21_initialize_dashboard.bat, then 50_enable_service.bat and 51_start_service.bat.\n'

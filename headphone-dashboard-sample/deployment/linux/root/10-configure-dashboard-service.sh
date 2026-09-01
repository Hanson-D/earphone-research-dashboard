#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../lib/common.sh"

require_root
require_command python3
require_command systemctl

[[ -f "${APP_ROOT}/server/server.py" ]] || die "Missing ${APP_ROOT}/server/server.py"

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
  if ! runuser -u "${DASHBOARD_USER}" -- test -x "${parent}"; then
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

python_binary="$(python_path)"
[[ -n "${python_binary}" ]] || die "python3 was not found."

env_path="$(dashboard_env_path)"
cat >"${env_path}.tmp" <<EOF
HOST=${DASHBOARD_HOST}
PORT=${DASHBOARD_PORT}
DASHBOARD_PROJECTS_ROOT=${PROJECTS_ROOT}
DASHBOARD_LEGACY_PATHS=1
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
systemd-analyze verify "${unit_path}" >/dev/null

log "Dashboard service configuration installed."
printf 'Service was not enabled or started.\n'
printf 'Next: run 12_initialize_dashboard.bat, then 40_enable_service.bat and 41_start_service.bat.\n'

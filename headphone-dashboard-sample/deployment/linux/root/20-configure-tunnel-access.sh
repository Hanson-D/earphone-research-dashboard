#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../lib/common.sh"

require_root
require_command systemctl

sshd_binary="$(sshd_path)" || die "sshd was not found."
sshd_main=/etc/ssh/sshd_config
sshd_dropin_dir=/etc/ssh/sshd_config.d
sshd_dropin="${sshd_dropin_dir}/earphone-dashboard.conf"
nologin_path="$(command -v nologin || true)"
[[ -n "${nologin_path}" ]] || nologin_path=/usr/sbin/nologin
[[ -x "${nologin_path}" ]] || die "nologin was not found."

if ! getent group "${TUNNEL_GROUP}" >/dev/null; then
  groupadd --system "${TUNNEL_GROUP}"
  log "Created tunnel group ${TUNNEL_GROUP}."
fi

install -d -o root -g root -m 0755 "${sshd_dropin_dir}"

if ! grep -Eq '^[[:space:]]*Include[[:space:]]+/etc/ssh/sshd_config\.d/\*\.conf' "${sshd_main}"; then
  backup="${sshd_main}.earphone-dashboard.$(date +%Y%m%d%H%M%S).bak"
  cp -a "${sshd_main}" "${backup}"
  if ! confirm "OpenSSH does not include sshd_config.d. Add the Include directive to ${sshd_main}"; then
    die "Tunnel access configuration was cancelled."
  fi
  temp_main="$(mktemp)"
  {
    printf 'Include /etc/ssh/sshd_config.d/*.conf\n'
    cat "${sshd_main}"
  } >"${temp_main}"
  install -o root -g root -m 0600 "${temp_main}" "${sshd_main}"
  rm -f "${temp_main}"
  log "Added sshd_config.d Include directive. Backup: ${backup}"
fi

cat >"${sshd_dropin}.tmp" <<EOF
Match Group ${TUNNEL_GROUP}
    AuthenticationMethods publickey
    PasswordAuthentication no
    KbdInteractiveAuthentication no
    AllowTcpForwarding local
    PermitOpen ${DASHBOARD_HOST}:${DASHBOARD_PORT}
    X11Forwarding no
    AllowAgentForwarding no
    PermitTTY no
    ForceCommand ${nologin_path}
EOF
install -o root -g root -m 0600 "${sshd_dropin}.tmp" "${sshd_dropin}"
rm -f "${sshd_dropin}.tmp"

if ! "${sshd_binary}" -t; then
  rm -f "${sshd_dropin}"
  die "sshd validation failed. The dashboard drop-in was removed."
fi

ssh_service="$(sshd_service_name)" || die "The OpenSSH systemd service was not found."
systemctl reload "${ssh_service}.service"

log "Restricted SSH tunnel access configured for group ${TUNNEL_GROUP}."
printf 'Future client additions do not need an SSH reload.\n'

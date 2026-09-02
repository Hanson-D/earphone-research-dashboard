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
managed_begin='# BEGIN EARPHONE DASHBOARD MANAGED BLOCK'
managed_end='# END EARPHONE DASHBOARD MANAGED BLOCK'
nologin_path="$(command -v nologin || true)"
[[ -n "${nologin_path}" ]] || nologin_path=/usr/sbin/nologin
[[ -x "${nologin_path}" ]] || die "nologin was not found."

if ! getent group "${TUNNEL_GROUP}" >/dev/null; then
  groupadd --system "${TUNNEL_GROUP}"
  log "Created tunnel group ${TUNNEL_GROUP}."
fi

temp_probe="$(mktemp)"
temp_main="$(mktemp)"
disabled_dropin=""
cleanup() {
  rm -f "${temp_probe}" "${temp_main}"
}
trap cleanup EXIT

printf 'Include /dev/null\n' >"${temp_probe}"
probe_output="$("${sshd_binary}" -t -f "${temp_probe}" 2>&1 || true)"
include_supported=1
if printf '%s\n' "${probe_output}" | grep -Eqi 'bad configuration option.*include|unsupported option.*include'; then
  include_supported=0
  log "OpenSSH does not support Include; using a managed block in ${sshd_main}."
fi

if [[ -f "${sshd_dropin}" ]]; then
  disabled_dropin="${sshd_dropin}.disabled.$(date +%Y%m%d%H%M%S)"
  mv "${sshd_dropin}" "${disabled_dropin}"
fi

awk -v begin="${managed_begin}" -v end="${managed_end}" -v remove_include="${include_supported}" '
  $0 == begin { managed = 1; next }
  $0 == end { managed = 0; next }
  managed { next }
  remove_include == 0 && $0 ~ /^[[:space:]]*[Ii][Nn][Cc][Ll][Uu][Dd][Ee][[:space:]]+\/etc\/ssh\/sshd_config\.d\/\*\.conf[[:space:]]*$/ { next }
  { print }
' "${sshd_main}" >"${temp_main}"

cat >>"${temp_main}" <<EOF

${managed_begin}
Match Group ${TUNNEL_GROUP}
    PubkeyAuthentication yes
    PasswordAuthentication no
    AllowTcpForwarding local
    PermitOpen ${DASHBOARD_HOST}:${DASHBOARD_PORT}
    X11Forwarding no
    AllowAgentForwarding no
    PermitTTY no
    ForceCommand ${nologin_path}
Match all
${managed_end}
EOF

if ! "${sshd_binary}" -t -f "${temp_main}"; then
  if [[ -n "${disabled_dropin}" ]]; then
    mv "${disabled_dropin}" "${sshd_dropin}"
  fi
  die "sshd validation failed; the existing configuration was not replaced."
fi

backup="${sshd_main}.earphone-dashboard.$(date +%Y%m%d%H%M%S).bak"
cp -a "${sshd_main}" "${backup}"
install -o root -g root -m 0600 "${temp_main}" "${sshd_main}"

if ! "${sshd_binary}" -t; then
  install -o root -g root -m 0600 "${backup}" "${sshd_main}"
  if [[ -n "${disabled_dropin}" ]]; then
    mv "${disabled_dropin}" "${sshd_dropin}"
  fi
  die "Installed sshd configuration failed validation and was rolled back."
fi

ssh_service="$(sshd_service_name)" || die "The OpenSSH systemd service was not found."
systemctl reload "${ssh_service}.service"

log "Restricted SSH tunnel access configured for group ${TUNNEL_GROUP}."
printf 'Backup: %s\n' "${backup}"
printf 'Future client additions do not need an SSH reload.\n'

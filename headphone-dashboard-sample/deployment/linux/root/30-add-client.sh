#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../lib/common.sh"
source "${SCRIPT_DIR}/../lib/client-bundle.sh"

require_root
require_command ssh-keygen
require_command chpasswd
require_command python3
require_command sha256sum

client_id=""
server_host=""
ssh_port="22"
local_port=""
created_user=0
created_bundle=0
completed=0
temp_dir=""
bundle_root=""

cleanup() {
  if [[ -n "${temp_dir}" && -d "${temp_dir}" ]]; then
    find "${temp_dir}" -type f -delete
    find "${temp_dir}" -depth -type d -empty -delete
  fi
  if (( completed == 0 )); then
    if (( created_bundle == 1 )) && [[ -n "${bundle_root}" && -d "${bundle_root}" ]]; then
      find "${bundle_root}" -type f -delete
      find "${bundle_root}" -depth -type d -empty -delete
    fi
    if (( created_user == 1 )) && getent passwd "${ssh_user:-}" >/dev/null; then
      userdel --remove "${ssh_user}" >/dev/null 2>&1 || true
    fi
  fi
}
trap cleanup EXIT

while (($#)); do
  case "$1" in
    --client-id) client_id="${2:-}"; shift 2 ;;
    --server-host) server_host="${2:-}"; shift 2 ;;
    --ssh-port) ssh_port="${2:-}"; shift 2 ;;
    --local-port) local_port="${2:-}"; shift 2 ;;
    *) die "Unknown argument: $1" ;;
  esac
done

[[ -n "${client_id}" ]] || read -r -p 'Client ID: ' client_id
[[ -n "${server_host}" ]] || read -r -p 'Server IP or DNS name: ' server_host
validate_client_id "${client_id}"
validate_server_host "${server_host}"
validate_port "${ssh_port}"

ensure_config_dirs
[[ -n "${local_port}" ]] || local_port="$(next_local_port)"
validate_port "${local_port}"

config_path="$(client_config_path "${client_id}")"
[[ ! -e "${config_path}" ]] || die "Client already exists: ${client_id}"
if grep -Rqs "^LOCAL_PORT=${local_port}$" "${CLIENTS_ROOT}"; then
  die "Local port is already assigned: ${local_port}"
fi

getent group "${TUNNEL_GROUP}" >/dev/null || \
  die "Tunnel access is not configured. Run 20_configure_tunnel_access.bat first."
[[ -f /etc/ssh/sshd_config.d/earphone-dashboard.conf ]] || \
  die "Restricted SSH configuration is missing. Run 20_configure_tunnel_access.bat first."

ssh_user="$(client_ssh_user "${client_id}")"
if getent passwd "${ssh_user}" >/dev/null; then
  die "Linux account already exists without a client record: ${ssh_user}"
fi

nologin_path="$(command -v nologin || true)"
[[ -n "${nologin_path}" ]] || nologin_path=/usr/sbin/nologin
useradd --create-home --gid "${TUNNEL_GROUP}" --shell "${nologin_path}" "${ssh_user}"
created_user=1

random_password="$(python3 -c 'import secrets; print(secrets.token_urlsafe(48))')"
printf '%s:%s\n' "${ssh_user}" "${random_password}" | chpasswd
unset random_password

home_dir="$(getent passwd "${ssh_user}" | cut -d: -f6)"
install -d -o "${ssh_user}" -g "${TUNNEL_GROUP}" -m 0700 "${home_dir}/.ssh"

temp_dir="$(mktemp -d)"
private_key="${temp_dir}/kanban_${client_id}"
ssh-keygen -q -t ed25519 -N '' -C "earphone-dashboard:${client_id}" -f "${private_key}"

public_key="$(cat "${private_key}.pub")"
printf 'restrict,port-forwarding,permitopen="%s:%s" %s\n' \
  "${DASHBOARD_HOST}" "${DASHBOARD_PORT}" "${public_key}" \
  >"${home_dir}/.ssh/authorized_keys"
chown "${ssh_user}:${TUNNEL_GROUP}" "${home_dir}/.ssh/authorized_keys"
chmod 0600 "${home_dir}/.ssh/authorized_keys"

bundle_root="${EXPORT_ROOT}/${client_id}"
[[ ! -e "${bundle_root}" ]] || die "Export directory already exists: ${bundle_root}"
created_bundle=1
create_client_bundle \
  "${bundle_root}" "${private_key}" "${client_id}" "${ssh_user}" \
  "${server_host}" "${ssh_port}" "${local_port}"

fingerprint="$(ssh-keygen -lf "${private_key}.pub" | awk '{print $2}')"
cat >"${config_path}.tmp" <<EOF
CLIENT_ID=${client_id}
SSH_USER=${ssh_user}
SERVER_HOST=${server_host}
SSH_PORT=${ssh_port}
LOCAL_PORT=${local_port}
REMOTE_HOST=${DASHBOARD_HOST}
REMOTE_PORT=${DASHBOARD_PORT}
KEY_FINGERPRINT=${fingerprint}
STATUS=active
CREATED_AT=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
EOF
install -o root -g root -m 0640 "${config_path}.tmp" "${config_path}"
rm -f "${config_path}.tmp"
completed=1

log "Client created: ${client_id}"
printf 'SSH user: %s\n' "${ssh_user}"
printf 'Windows local URL: http://127.0.0.1:%s/\n' "${local_port}"
printf 'Export directory: %s\n' "${bundle_root}"
printf 'Key fingerprint: %s\n' "${fingerprint}"
printf 'The dashboard service and sshd were not restarted.\n'

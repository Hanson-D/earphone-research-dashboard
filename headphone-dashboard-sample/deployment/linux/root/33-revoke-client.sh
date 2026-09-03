#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../lib/common.sh"

require_root
require_dashboard_python
[[ -f "${APP_ROOT}/server/manage-clients.py" ]] || \
  die "Missing client access manager. Upload the current application first."

client_id="${1:-}"
[[ -n "${client_id}" ]] || read -r -p 'Client ID to revoke: ' client_id
validate_client_id "${client_id}"

config_path="$(client_config_path "${client_id}")"
[[ -f "${config_path}" ]] || die "Client not found: ${client_id}"
ssh_user="$(read_client_value "${client_id}" SSH_USER)"

if ! confirm "Revoke client ${client_id} and lock account ${ssh_user}"; then
  die "Revocation cancelled."
fi

"${DASHBOARD_PYTHON}" "${APP_ROOT}/server/manage-clients.py" \
  --config "$(auth_config_path)" --client-id "${client_id}" disable
chown root:"${DASHBOARD_GROUP}" "$(auth_config_path)"
chmod 0640 "$(auth_config_path)"

if getent passwd "${ssh_user}" >/dev/null; then
  home_dir="$(getent passwd "${ssh_user}" | cut -d: -f6)"
  if [[ -f "${home_dir}/.ssh/authorized_keys" ]]; then
    mv "${home_dir}/.ssh/authorized_keys" "${home_dir}/.ssh/authorized_keys.revoked.$(date +%Y%m%d%H%M%S)"
  fi
  usermod --lock "${ssh_user}"
fi

sed -i 's/^STATUS=.*/STATUS=revoked/' "${config_path}"
printf 'REVOKED_AT=%s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" >>"${config_path}"

log "Client revoked: ${client_id}"
printf 'Project data and dashboard service were not changed. The client listener will close automatically.\n'

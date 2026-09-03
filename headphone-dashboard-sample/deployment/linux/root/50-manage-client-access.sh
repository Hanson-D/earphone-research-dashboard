#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../lib/common.sh"
source "${SCRIPT_DIR}/../lib/client-bundle.sh"

require_root
require_dashboard_python

operation="${1:-}"
case "${operation}" in
  list|set-projects|migrate) ;;
  *) die "Usage: $0 {list|set-projects|migrate}" ;;
esac

access_config="$(auth_config_path)"

show_projects() {
  printf 'Available project codes:\n'
  "${DASHBOARD_PYTHON}" "${APP_ROOT}/server/manage-projects.py" --root "${PROJECTS_ROOT}" list
  printf '\n'
}

finish_config() {
  chown root:"${DASHBOARD_GROUP}" "${access_config}"
  chmod 0640 "${access_config}"
}

if [[ "${operation}" == "list" ]]; then
  "${DASHBOARD_PYTHON}" "${APP_ROOT}/server/manage-clients.py" \
    --config "${access_config}" --projects-root "${PROJECTS_ROOT}" list
  exit 0
fi

if [[ "${operation}" == "set-projects" ]]; then
  show_projects
  "${DASHBOARD_PYTHON}" "${APP_ROOT}/server/manage-clients.py" \
    --config "${access_config}" --projects-root "${PROJECTS_ROOT}" set-projects
  finish_config
  printf 'Permissions are reloaded automatically; service restart is not required.\n'
  exit 0
fi

show_projects
shopt -s nullglob
configs=("${CLIENTS_ROOT}"/*.conf)
shopt -u nullglob
if ((${#configs[@]} == 0)); then
  die "No existing SSH clients were found."
fi

for config in "${configs[@]}"; do
  unset CLIENT_ID SSH_USER SERVER_HOST SSH_PORT LOCAL_PORT REMOTE_PORT STATUS
  # shellcheck disable=SC1090
  source "${config}"
  if [[ "${STATUS:-active}" != "active" ]]; then
    printf 'Skipping non-active client: %s\n' "${CLIENT_ID}"
    continue
  fi
  access_port="${LOCAL_PORT}"
  [[ "${access_port}" != "${DASHBOARD_PORT}" ]] || \
    die "Client ${CLIENT_ID} uses reserved backend port ${DASHBOARD_PORT}; choose a new local/access port first."

  access_token="$("${DASHBOARD_PYTHON}" - "${access_config}" "${CLIENT_ID}" <<'PY'
import json
import secrets
import sys
try:
    payload = json.load(open(sys.argv[1], encoding="utf-8"))
except (OSError, ValueError):
    payload = {}
print(payload.get("clients", {}).get(sys.argv[2], {}).get("token") or secrets.token_urlsafe(32))
PY
  )"

  if "${DASHBOARD_PYTHON}" - "${access_config}" "${CLIENT_ID}" <<'PY'
import json
import sys
try:
    payload = json.load(open(sys.argv[1], encoding="utf-8"))
except (OSError, ValueError):
    raise SystemExit(1)
raise SystemExit(0 if sys.argv[2] in payload.get("clients", {}) else 1)
PY
  then
    printf 'Client access already exists, refreshing tunnel binding: %s\n' "${CLIENT_ID}"
    "${DASHBOARD_PYTHON}" "${APP_ROOT}/server/manage-clients.py" \
      --config "${access_config}" --client-id "${CLIENT_ID}" --port "${access_port}" set-port
    "${DASHBOARD_PYTHON}" "${APP_ROOT}/server/manage-clients.py" \
      --config "${access_config}" --client-id "${CLIENT_ID}" --token "${access_token}" set-token
  else
    printf '\nConfigure project access for existing client %s.\n' "${CLIENT_ID}"
    read -r -p "Display name [${CLIENT_ID}]: " display_name
    display_name="${display_name:-${CLIENT_ID}}"
    read -r -p 'Administrator (y/N): ' admin_answer
    admin_answer="${admin_answer:-N}"
    projects=""
    if [[ ! "${admin_answer}" =~ ^[Yy]$ ]]; then
      read -r -p 'Project codes, comma separated: ' projects
    fi
    "${DASHBOARD_PYTHON}" "${APP_ROOT}/server/manage-clients.py" \
      --config "${access_config}" --projects-root "${PROJECTS_ROOT}" \
      --client-id "${CLIENT_ID}" --port "${access_port}" \
      --display-name "${display_name}" --admin "${admin_answer}" --projects "${projects}" \
      --token "${access_token}" add
  fi

  home_dir="$(getent passwd "${SSH_USER}" | cut -d: -f6)"
  authorized_keys="${home_dir}/.ssh/authorized_keys"
  [[ -f "${authorized_keys}" ]] || die "Missing authorized_keys for ${CLIENT_ID}: ${authorized_keys}"
  grep -Eq 'permitopen="[^"]+"' "${authorized_keys}" || \
    die "Missing per-key permitopen restriction for ${CLIENT_ID}; revoke and recreate this client."
  sed -i -E "s|permitopen=\"[^\"]+\"|permitopen=\"${DASHBOARD_HOST}:${access_port}\"|" "${authorized_keys}"
  grep -Fq "permitopen=\"${DASHBOARD_HOST}:${access_port}\"" "${authorized_keys}" || \
    die "Failed to bind the SSH key for ${CLIENT_ID} to port ${access_port}."
  chown "${SSH_USER}:${TUNNEL_GROUP}" "${authorized_keys}"
  chmod 0600 "${authorized_keys}"

  write_client_value "${config}" ACCESS_PORT "${access_port}"
  write_client_value "${config}" REMOTE_PORT "${access_port}"
  refresh_client_bundle \
    "${EXPORT_ROOT}/${CLIENT_ID}" "${CLIENT_ID}" "${SSH_USER}" \
    "${SERVER_HOST}" "${SSH_PORT}" "${LOCAL_PORT}" "${access_port}" "${access_token}"
  printf 'Migrated client: %s -> server port %s\n' "${CLIENT_ID}" "${access_port}"
done

finish_config
printf '\nExisting Windows installations must rerun install-client.bat from the refreshed client package.\n'
printf 'Permissions and listeners are reloaded automatically; service restart is not required.\n'

#!/usr/bin/env bash
set -euo pipefail

deployment_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
client_template_root="${deployment_root}/windows-client-template"

render_client_template() {
  local source_file="$1"
  local target_file="$2"
  local client_id="$3"
  local ssh_user="$4"
  local server_host="$5"
  local ssh_port="$6"
  local local_port="$7"
  local key_name="$8"
  local remote_port="$9"
  local access_token="${10}"

  sed \
    -e "s/__CLIENT_ID__/${client_id}/g" \
    -e "s/__SSH_USER__/${ssh_user}/g" \
    -e "s/__SERVER_HOST__/${server_host}/g" \
    -e "s/__SSH_PORT__/${ssh_port}/g" \
    -e "s/__LOCAL_PORT__/${local_port}/g" \
    -e "s/__REMOTE_PORT__/${remote_port}/g" \
    -e "s/__KEY_NAME__/${key_name}/g" \
    -e "s/__ACCESS_TOKEN__/${access_token}/g" \
    "${source_file}" >"${target_file}"
}

write_known_hosts() {
  local server_host="$1"
  local ssh_port="$2"
  local target_file="$3"
  local known_name="${server_host}"
  local key_file

  if [[ "${ssh_port}" != "22" ]]; then
    known_name="[${server_host}]:${ssh_port}"
  fi

  : >"${target_file}"
  shopt -s nullglob
  for key_file in /etc/ssh/ssh_host_*_key.pub; do
    awk -v host="${known_name}" '{print host, $1, $2}' "${key_file}" >>"${target_file}"
  done
  shopt -u nullglob
  [[ -s "${target_file}" ]] || die "No SSH host public keys were found."
}

create_client_bundle() {
  local bundle_root="$1"
  local private_key="$2"
  local client_id="$3"
  local ssh_user="$4"
  local server_host="$5"
  local ssh_port="$6"
  local local_port="$7"
  local remote_port="$8"
  local access_token="$9"
  local key_name="kanban_${client_id}"
  local template

  [[ -d "${client_template_root}" ]] || die "Missing client templates: ${client_template_root}"

  install -d -o root -g root -m 0700 "${bundle_root}/key"
  install -o root -g root -m 0600 "${private_key}" "${bundle_root}/key/${key_name}"

  for template in install-client.ps1 start-kanban.ps1 stop-kanban.ps1 status-kanban.ps1 client-config.ps1; do
    render_client_template \
      "${client_template_root}/${template}" \
      "${bundle_root}/${template}" \
      "${client_id}" "${ssh_user}" "${server_host}" "${ssh_port}" "${local_port}" "${key_name}" "${remote_port}" "${access_token}"
  done

  for template in install-client.bat start-kanban.bat stop-kanban.bat status-kanban.bat; do
    install -o root -g root -m 0644 \
      "${client_template_root}/${template}" "${bundle_root}/${template}"
  done

  write_known_hosts "${server_host}" "${ssh_port}" "${bundle_root}/known_hosts"

  cat >"${bundle_root}/README.txt" <<EOF
Earphone Dashboard client: ${client_id}

1. Run install-client.bat once.
2. Run start-kanban.bat whenever the dashboard is needed.
3. If the browser does not open, run start-kanban.bat again.
4. Run stop-kanban.bat to close the SSH tunnel.

No dashboard username or password is required. This package contains the SSH key
and its paired client access token; distribute the complete folder only to the
assigned user.

Server: ${server_host}:${ssh_port}
SSH user: ${ssh_user}
Local dashboard URL after start-kanban.bat: http://127.0.0.1:${local_port}/
EOF

  (
    cd "${bundle_root}"
    find . -type f ! -name SHA256SUMS.txt -print0 \
      | sort -z \
      | xargs -0 sha256sum >SHA256SUMS.txt
  )
}

refresh_client_bundle() {
  local bundle_root="$1"
  local client_id="$2"
  local ssh_user="$3"
  local server_host="$4"
  local ssh_port="$5"
  local local_port="$6"
  local remote_port="$7"
  local access_token="$8"
  local key_name="kanban_${client_id}"
  local template

  install -d -o root -g root -m 0700 "${bundle_root}"
  for template in install-client.ps1 start-kanban.ps1 stop-kanban.ps1 status-kanban.ps1 client-config.ps1; do
    render_client_template \
      "${client_template_root}/${template}" \
      "${bundle_root}/${template}" \
      "${client_id}" "${ssh_user}" "${server_host}" "${ssh_port}" "${local_port}" "${key_name}" "${remote_port}" "${access_token}"
  done
  for template in install-client.bat start-kanban.bat stop-kanban.bat status-kanban.bat; do
    install -o root -g root -m 0644 \
      "${client_template_root}/${template}" "${bundle_root}/${template}"
  done
  write_known_hosts "${server_host}" "${ssh_port}" "${bundle_root}/known_hosts"
  if [[ -f "${bundle_root}/key/${key_name}" ]]; then
    install_mode='Full installer: the existing private key is included.'
  else
    install_mode='Upgrade package: it reuses the private key already installed for this Windows user.'
  fi
  cat >"${bundle_root}/README.txt" <<EOF
Earphone Dashboard client update: ${client_id}

${install_mode}

1. On the Windows account that already uses this client, run install-client.bat.
2. Run start-kanban.bat.
3. If installation reports that no existing private key is available, ask the
   administrator to revoke and recreate this client.

No dashboard username or password is required.
Local dashboard URL after start-kanban.bat: http://127.0.0.1:${local_port}/
EOF
  (
    cd "${bundle_root}"
    find . -type f ! -name SHA256SUMS.txt -print0 \
      | sort -z \
      | xargs -0 sha256sum >SHA256SUMS.txt
  )
}

#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${APP_ROOT:-/home/earphone/kanban/app}"
PROJECTS_ROOT="${PROJECTS_ROOT:-/home/earphone/kanban/projects}"
CONFIG_ROOT="${CONFIG_ROOT:-/etc/earphone-dashboard}"
CLIENTS_ROOT="${CLIENTS_ROOT:-${CONFIG_ROOT}/clients}"
EXPORT_ROOT="${EXPORT_ROOT:-/root/kanban-export}"
DASHBOARD_USER="${DASHBOARD_USER:-dashboard}"
DASHBOARD_GROUP="${DASHBOARD_GROUP:-dashboard}"
TUNNEL_GROUP="${TUNNEL_GROUP:-kanban-tunnel}"
SERVICE_NAME="${SERVICE_NAME:-earphone-dashboard}"
DASHBOARD_HOST="${DASHBOARD_HOST:-127.0.0.1}"
DASHBOARD_PORT="${DASHBOARD_PORT:-7362}"
DASHBOARD_SOURCE_PYTHON="${DASHBOARD_SOURCE_PYTHON:-/root/anaconda3/bin/python3}"
DASHBOARD_RUNTIME_ROOT="${DASHBOARD_RUNTIME_ROOT:-/opt/earphone-dashboard/python}"
DASHBOARD_PYTHON="${DASHBOARD_PYTHON:-${DASHBOARD_RUNTIME_ROOT}/bin/python3}"

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

warn() {
  printf 'WARNING: %s\n' "$*" >&2
}

die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

require_root() {
  [[ "$(id -u)" -eq 0 ]] || die "Run this script as root."
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "Required command not found: $1"
}

run_as_user() {
  local target_user="$1"
  shift

  if command -v runuser >/dev/null 2>&1; then
    runuser -u "${target_user}" -- "$@"
    return
  fi
  if command -v sudo >/dev/null 2>&1; then
    sudo -u "${target_user}" -- "$@"
    return
  fi
  if command -v su >/dev/null 2>&1; then
    local command_line
    printf -v command_line '%q ' "$@"
    su -s /bin/bash -c "${command_line% }" "${target_user}"
    return
  fi

  die "Cannot switch to ${target_user}: runuser, sudo, and su are unavailable."
}

confirm() {
  local prompt="$1"
  local answer
  read -r -p "${prompt} [y/N]: " answer
  [[ "${answer}" =~ ^[Yy]$ ]]
}

validate_client_id() {
  [[ "$1" =~ ^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$ ]] || \
    die "Client ID must be 1-32 characters using letters, numbers, underscore, or hyphen."
}

validate_server_host() {
  [[ "$1" =~ ^[A-Za-z0-9][A-Za-z0-9._:-]{0,252}$ ]] || \
    die "Server host contains unsupported characters."
}

validate_port() {
  [[ "$1" =~ ^[0-9]+$ ]] || die "Port must be numeric."
  (( 1 <= 10#$1 && 10#$1 <= 65535 )) || die "Port must be between 1 and 65535."
}

python_version() {
  "$1" -c 'import sys; print("{}.{}.{}".format(*sys.version_info[:3]))'
}

python_is_supported() {
  "$1" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 7) else 1)'
}

dashboard_python_path() {
  [[ -x "${DASHBOARD_PYTHON}" ]] && printf '%s\n' "${DASHBOARD_PYTHON}"
}

require_dashboard_python() {
  [[ -x "${DASHBOARD_PYTHON}" ]] || \
    die "Dashboard Python is missing: ${DASHBOARD_PYTHON}. Run 15_prepare_python_runtime.bat first."
  python_is_supported "${DASHBOARD_PYTHON}" || \
    die "Dashboard Python $(python_version "${DASHBOARD_PYTHON}") is unsupported; Python 3.7+ is required."
}

systemd_analyze_supports_verify() {
  command -v systemd-analyze >/dev/null 2>&1 &&
    systemd-analyze --help 2>&1 | grep -Eq '(^|[[:space:]])verify([[:space:]]|$)'
}

sshd_path() {
  if command -v sshd >/dev/null 2>&1; then
    command -v sshd
  elif [[ -x /usr/sbin/sshd ]]; then
    printf '%s\n' /usr/sbin/sshd
  else
    return 1
  fi
}

sshd_service_name() {
  if systemctl list-unit-files sshd.service --no-legend 2>/dev/null | grep -q '^sshd\.service'; then
    printf '%s\n' sshd
  elif systemctl list-unit-files ssh.service --no-legend 2>/dev/null | grep -q '^ssh\.service'; then
    printf '%s\n' ssh
  else
    return 1
  fi
}

reload_sshd_service() {
  if command -v systemctl >/dev/null 2>&1; then
    if systemctl reload ssh.service >/dev/null 2>&1; then
      printf '%s\n' 'systemctl reload ssh.service'
      return
    fi
    if systemctl reload sshd.service >/dev/null 2>&1; then
      printf '%s\n' 'systemctl reload sshd.service'
      return
    fi
  fi
  if command -v service >/dev/null 2>&1 && service ssh reload >/dev/null 2>&1; then
    printf '%s\n' 'service ssh reload'
    return
  fi
  if [[ -x /etc/init.d/ssh ]] && /etc/init.d/ssh reload >/dev/null 2>&1; then
    printf '%s\n' '/etc/init.d/ssh reload'
    return
  fi
  die "Unable to reload OpenSSH with systemctl, service, or /etc/init.d/ssh."
}

service_unit_path() {
  printf '/etc/systemd/system/%s.service\n' "${SERVICE_NAME}"
}

dashboard_env_path() {
  printf '%s/dashboard.env\n' "${CONFIG_ROOT}"
}

client_config_path() {
  printf '%s/%s.conf\n' "${CLIENTS_ROOT}" "$1"
}

client_ssh_user() {
  printf 'kanban_%s\n' "$1" | tr '-' '_'
}

ensure_config_dirs() {
  install -d -o root -g root -m 0750 "${CONFIG_ROOT}" "${CLIENTS_ROOT}"
  install -d -o root -g root -m 0700 "${EXPORT_ROOT}"
}

next_local_port() {
  local port=17361
  local file
  while :; do
    local used=0
    shopt -s nullglob
    for file in "${CLIENTS_ROOT}"/*.conf; do
      if grep -Eq "^LOCAL_PORT=${port}$" "${file}"; then
        used=1
        break
      fi
    done
    shopt -u nullglob
    (( used == 0 )) && {
      printf '%s\n' "${port}"
      return
    }
    ((port += 1))
    (( port <= 65535 )) || die "No client local port is available."
  done
}

read_client_value() {
  local client_id="$1"
  local key="$2"
  local config
  config="$(client_config_path "${client_id}")"
  [[ -f "${config}" ]] || die "Client not found: ${client_id}"
  sed -n "s/^${key}=//p" "${config}" | head -n 1
}

dashboard_listener() {
  if command -v ss >/dev/null 2>&1; then
    ss -lntp 2>/dev/null | awk -v port=":${DASHBOARD_PORT}" '$4 ~ port "$" {print}' || true
    return
  fi
  if command -v lsof >/dev/null 2>&1; then
    lsof -n -P -iTCP:"${DASHBOARD_PORT}" -sTCP:LISTEN 2>/dev/null || true
    return
  fi
  if command -v python3 >/dev/null 2>&1; then
    python3 - "${DASHBOARD_HOST}" "${DASHBOARD_PORT}" <<'PY'
import socket
import sys

host, port = sys.argv[1], int(sys.argv[2])
sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
try:
    sock.bind((host, port))
except OSError:
    print("{}:{} is already in use; process details are unavailable.".format(host, port))
finally:
    sock.close()
PY
    return
  fi
  die "Cannot inspect port ${DASHBOARD_PORT}: ss, lsof, and python3 are unavailable."
}

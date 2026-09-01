#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../lib/common.sh"

require_root

failures=0

check_command() {
  local command_name="$1"
  if command -v "${command_name}" >/dev/null 2>&1; then
    printf 'OK      command %-12s %s\n' "${command_name}" "$(command -v "${command_name}")"
  else
    printf 'MISSING command %s\n' "${command_name}"
    failures=$((failures + 1))
  fi
}

printf 'Earphone Dashboard deployment preflight\n'
printf '======================================\n'

if [[ -r /etc/os-release ]]; then
  # shellcheck disable=SC1091
  source /etc/os-release
  printf 'OS: %s\n' "${PRETTY_NAME:-unknown}"
else
  printf 'OS: unknown\n'
fi

for command_name in \
  bash python3 systemctl ssh-keygen sed awk grep install getent \
  useradd groupadd chpasswd usermod userdel curl sha256sum \
  find xargs mktemp chmod chgrp cut tr sort; do
  check_command "${command_name}"
done

printf '\nCompatibility helpers:\n'
if command -v runuser >/dev/null 2>&1; then
  printf 'OK      user switch     runuser\n'
elif command -v sudo >/dev/null 2>&1; then
  printf 'OK      user switch     sudo\n'
elif command -v su >/dev/null 2>&1; then
  printf 'OK      user switch     su\n'
else
  printf 'MISSING user switch     runuser, sudo, or su is required\n'
  failures=$((failures + 1))
fi

if command -v ss >/dev/null 2>&1; then
  printf 'OK      port inspection ss\n'
elif command -v lsof >/dev/null 2>&1; then
  printf 'OK      port inspection lsof\n'
else
  printf 'OK      port inspection python3 socket fallback\n'
fi

if command -v systemd-analyze >/dev/null 2>&1; then
  printf 'OK      unit validation systemd-analyze\n'
else
  printf 'OPTIONAL unit validation systemd-analyze not found; start-time validation will be used\n'
fi

if command -v setfacl >/dev/null 2>&1; then
  printf 'OK      path ACL        setfacl\n'
else
  printf 'OPTIONAL path ACL        setfacl not found; interactive traverse permission fallback will be used\n'
fi

if command -v nologin >/dev/null 2>&1 || [[ -x /usr/sbin/nologin ]]; then
  printf 'OK      login shell     nologin\n'
else
  printf 'MISSING login shell     nologin\n'
  failures=$((failures + 1))
fi

if sshd_binary="$(sshd_path 2>/dev/null)"; then
  printf 'OK      sshd            %s\n' "${sshd_binary}"
  if "${sshd_binary}" -t; then
    printf 'OK      sshd config syntax\n'
  else
    printf 'FAILED  sshd config syntax\n'
    failures=$((failures + 1))
  fi
else
  printf 'MISSING sshd\n'
  failures=$((failures + 1))
fi

if [[ -f "${APP_ROOT}/server/server.py" ]]; then
  printf 'OK      application     %s\n' "${APP_ROOT}"
else
  printf 'MISSING application     %s/server/server.py\n' "${APP_ROOT}"
  failures=$((failures + 1))
fi

printf '\nPath permissions:\n'
namei -l "${APP_ROOT}" 2>/dev/null || true

printf '\nPort %s listeners:\n' "${DASHBOARD_PORT}"
listener="$(dashboard_listener)"
if [[ -n "${listener}" ]]; then
  printf '%s\n' "${listener}"
else
  printf 'No listener found.\n'
fi

printf '\nFirewall summary:\n'
if command -v ufw >/dev/null 2>&1; then
  ufw status 2>/dev/null || true
elif command -v firewall-cmd >/dev/null 2>&1; then
  firewall-cmd --get-active-zones 2>/dev/null || true
  firewall-cmd --list-all 2>/dev/null || true
elif command -v nft >/dev/null 2>&1; then
  nft list ruleset 2>/dev/null | grep -E "${DASHBOARD_PORT}|hook input|policy" || true
else
  printf 'No supported firewall management command was found.\n'
fi

printf '\nExisting deployment objects:\n'
getent passwd "${DASHBOARD_USER}" || true
getent group "${TUNNEL_GROUP}" || true
systemctl status "${SERVICE_NAME}.service" --no-pager 2>/dev/null || true

printf '\nPreflight result: '
if (( failures == 0 )); then
  printf 'PASS\n'
else
  printf 'FAIL (%s required checks failed)\n' "${failures}"
  exit 1
fi

#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
printf 'Dashboard password accounts were replaced by SSH-key-bound client access.\n' >&2
printf 'Use %s/50-manage-client-access.sh instead.\n' "${SCRIPT_DIR}" >&2
exit 2

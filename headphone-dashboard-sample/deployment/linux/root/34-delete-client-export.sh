#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../lib/common.sh"

require_root

client_id="${1:-}"
[[ -n "${client_id}" ]] || read -r -p 'Client ID export to delete: ' client_id
validate_client_id "${client_id}"

bundle_root="${EXPORT_ROOT}/${client_id}"
[[ -d "${bundle_root}" ]] || die "Export directory not found: ${bundle_root}"

printf 'This deletes the Linux export copy, including the private key.\n'
printf 'It does not revoke the installed client or delete the public key.\n'
if ! confirm "Confirm that the Windows client was installed and delete ${bundle_root}"; then
  die "Export deletion cancelled."
fi

find "${bundle_root}" -type f -delete
find "${bundle_root}" -depth -type d -empty -delete
log "Deleted client export directory: ${bundle_root}"

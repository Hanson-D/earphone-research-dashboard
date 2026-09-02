#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../lib/common.sh"

require_root

[[ -x "${DASHBOARD_SOURCE_PYTHON}" ]] || \
  die "Source Python is missing: ${DASHBOARD_SOURCE_PYTHON}"
python_is_supported "${DASHBOARD_SOURCE_PYTHON}" || \
  die "Source Python $(python_version "${DASHBOARD_SOURCE_PYTHON}") is unsupported; Python 3.7+ is required."

source_prefix="$("${DASHBOARD_SOURCE_PYTHON}" -c 'import sys; print(sys.prefix)')"
conda_binary="${source_prefix}/bin/conda"
[[ -x "${conda_binary}" ]] || die "Conda is missing: ${conda_binary}"

if [[ -x "${DASHBOARD_PYTHON}" ]]; then
  python_is_supported "${DASHBOARD_PYTHON}" || \
    die "Existing dashboard Python is unsupported: ${DASHBOARD_PYTHON}"
  log "Dashboard Python already exists: ${DASHBOARD_PYTHON} ($(python_version "${DASHBOARD_PYTHON}"))"
else
  if [[ -e "${DASHBOARD_RUNTIME_ROOT}" ]]; then
    die "Runtime path exists but has no usable Python: ${DASHBOARD_RUNTIME_ROOT}. Move it aside and rerun."
  fi

  install -d -o root -g root -m 0755 "$(dirname "${DASHBOARD_RUNTIME_ROOT}")"
  log "Cloning the offline Conda environment from ${source_prefix} to ${DASHBOARD_RUNTIME_ROOT}."
  "${conda_binary}" create --yes --offline \
    --copy --prefix "${DASHBOARD_RUNTIME_ROOT}" --clone "${source_prefix}"

  [[ -x "${DASHBOARD_PYTHON}" ]] || \
    die "Conda clone completed without ${DASHBOARD_PYTHON}."
  find "${DASHBOARD_RUNTIME_ROOT}" -type d -exec chmod a+rX {} +
  find "${DASHBOARD_RUNTIME_ROOT}" -type f -exec chmod a+r {} +
fi

pillow_wheel="${DASHBOARD_PILLOW_WHEEL:-}"
if [[ -z "${pillow_wheel}" ]]; then
  case "$(uname -m)" in
    x86_64)
      pillow_candidate=/tmp/Pillow-9.5.0-cp37-cp37m-manylinux_2_17_x86_64.manylinux2014_x86_64.whl
      ;;
    aarch64)
      pillow_candidate=/tmp/Pillow-9.5.0-cp37-cp37m-manylinux_2_17_aarch64.manylinux2014_aarch64.whl
      ;;
    i386|i486|i586|i686)
      pillow_candidate=/tmp/Pillow-9.5.0-cp37-cp37m-manylinux_2_17_i686.manylinux2014_i686.whl
      ;;
    *)
      pillow_candidate=""
      ;;
  esac
  [[ -n "${pillow_candidate}" && -f "${pillow_candidate}" ]] && pillow_wheel="${pillow_candidate}"
fi

if ! "${DASHBOARD_PYTHON}" -c 'import PIL' >/dev/null 2>&1 && [[ -n "${pillow_wheel}" ]]; then
  [[ -f "${pillow_wheel}" ]] || die "Pillow wheel does not exist: ${pillow_wheel}"
  log "Installing Pillow from offline wheel: ${pillow_wheel}"
  "${DASHBOARD_PYTHON}" -m pip install --no-index --no-user "${pillow_wheel}"
fi

if "${DASHBOARD_PYTHON}" -c 'import PIL' >/dev/null 2>&1; then
  pillow_version="$("${DASHBOARD_PYTHON}" -c 'from PIL import Image; print(Image.__version__)')"
  log "Pillow is available in the dashboard runtime: ${pillow_version}"
else
  warn "Pillow is not present. Copy the matching Pillow 9.5.0 wheel to /tmp and rerun this script."
fi

printf 'Dashboard Python: %s\n' "${DASHBOARD_PYTHON}"
printf 'Python version: %s\n' "$(python_version "${DASHBOARD_PYTHON}")"
printf 'The dashboard account and service were not configured or started.\n'

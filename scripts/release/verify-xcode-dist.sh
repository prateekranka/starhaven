#!/usr/bin/env bash
set -Eeuo pipefail

readonly SCRIPT_DIR="$(cd -P -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
readonly REPOSITORY_ROOT="$(cd -P -- "${SCRIPT_DIR}/../.." && pwd -P)"
readonly STAGED_ROOT="${REPOSITORY_ROOT}/ios/Artifacts/GameDist"
readonly STAMP="${DERIVED_FILE_DIR:?DERIVED_FILE_DIR is required}/starhaven-gamedist-verified.stamp"

[[ -d "${STAGED_ROOT}" && ! -L "${STAGED_ROOT}" ]] || { printf 'missing staged GameDist: %s\n' "${STAGED_ROOT}" >&2; exit 2; }
[[ -f "${STAGED_ROOT}/build-info.json" && -f "${STAGED_ROOT}/dist-hashes.json" ]] || { printf 'staged GameDist metadata is incomplete\n' >&2; exit 2; }

source_sha="$(/usr/bin/plutil -extract sourceSha raw -o - "${STAGED_ROOT}/build-info.json")"
clean="$(/usr/bin/plutil -extract clean raw -o - "${STAGED_ROOT}/build-info.json")"
[[ "${source_sha}" =~ ^[a-f0-9]{40}$ ]] || { printf 'staged source SHA is invalid\n' >&2; exit 2; }
[[ "${clean}" == "true" ]] || { printf 'staged build is not clean\n' >&2; exit 2; }

/usr/bin/env node "${REPOSITORY_ROOT}/scripts/release/verify-staged-dist.mjs" \
  --staged "${STAGED_ROOT}" \
  --expected-sha "${source_sha}" \
  --staged-only >/dev/null

mkdir -p "${DERIVED_FILE_DIR}"
printf 'sourceSha=%s\nfiles=%s\n' "${source_sha}" "$(/usr/bin/find "${STAGED_ROOT}" -type f -print | wc -l | tr -d ' ')" > "${STAMP}"
printf 'PASS: staged Starhaven artifact verified at %s\n' "${source_sha}"

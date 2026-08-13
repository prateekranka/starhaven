#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "${ROOT}"
MODE="${1:-sqim}"
TEAM_ID="${STARHAVEN_TEAM_ID:-4JRB53LG5C}"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Cannot sign an iOS IPA on $(uname -s). Push the web pack instead, or run this script on a Mac." >&2
  exit 2
fi

if [[ "${MODE}" != "sqim" && "${MODE}" != "testflight" && "${MODE}" != "both" ]]; then
  echo "usage: $0 [sqim|testflight|both]" >&2
  exit 2
fi

npm ci
npm run build
SHA="$(git rev-parse HEAD)"
node scripts/release/stage-ios-dist.mjs \
  --source dist \
  --target ios/Artifacts/GameDist \
  --expected-sha "${SHA}" \
  --input-list ios/Artifacts/GameDistInputs.xcfilelist

if command -v xcodegen >/dev/null 2>&1; then
  (cd ios && xcodegen generate)
fi

ship_sqim() {
  if ! command -v sqim >/dev/null 2>&1; then
    echo "sqim CLI not found. Install Sqim or use $0 testflight." >&2
    return 1
  fi
  sqim status
  sqim upload --device --build \
    --project ios/Starhaven.xcodeproj \
    --scheme Starhaven \
    --team-id "${TEAM_ID}" \
    --allow-provisioning-updates
}

ship_testflight() {
  if ! command -v asc >/dev/null 2>&1; then
    echo "asc CLI not found. Archive from Xcode or install the App Store Connect CLI." >&2
    return 1
  fi
  echo "Archiving and uploading TestFlight via asc. CFBundleVersion must be unique (currently $(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' ios/Starhaven/Resources/Info.plist))."
  asc xcode archive --project ios/Starhaven.xcodeproj --scheme Starhaven --configuration Release
}

case "${MODE}" in
  sqim) ship_sqim ;;
  testflight) ship_testflight ;;
  both) ship_sqim; ship_testflight ;;
esac

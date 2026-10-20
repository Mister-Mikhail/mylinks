#!/usr/bin/env bash
set -euo pipefail
# Real official stable binary, not a user-agent override. Keep the version in logs.
version=26.8.1.1111-1
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
curl -fsSL --retry 2 --max-time 120 "https://repo.yandex.ru/yandex-browser/deb/pool/main/y/yandex-browser-stable/yandex-browser-stable_${version}_amd64.deb" -o "$work/yandex.deb"
dpkg-deb -x "$work/yandex.deb" "$work/app"
export PLAYWRIGHT_EXECUTABLE_PATH="$work/app/opt/yandex/browser/yandex-browser"
"$PLAYWRIGHT_EXECUTABLE_PATH" --version
npm run test:e2e -- tests/icon-library.spec.ts tests/icon-delivery.spec.ts tests/public-profile.spec.ts --workers=2

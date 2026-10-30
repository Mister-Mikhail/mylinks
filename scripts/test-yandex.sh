#!/usr/bin/env bash
set -euo pipefail
# A real official binary. Called only by the full/manual suite.
version=26.8.1.1111-1
cache_dir="${YANDEX_CACHE_DIR:-$HOME/.cache/mylinks-yandex}"
mkdir -p "$cache_dir"
package="$cache_dir/yandex-${version}.deb"
if ! dpkg-deb --info "$package" >/dev/null 2>&1; then
  rm -f "$package"
  curl -fL --retry 2 --connect-timeout 15 --max-time 120 \
    "https://repo.yandex.ru/yandex-browser/deb/pool/main/y/yandex-browser-stable/yandex-browser-stable_${version}_amd64.deb" -o "$package.part"
  dpkg-deb --info "$package.part" >/dev/null
  mv "$package.part" "$package"
fi
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
dpkg-deb -x "$package" "$work"
export PLAYWRIGHT_EXECUTABLE_PATH="$work/opt/yandex/browser/yandex-browser"
"$PLAYWRIGHT_EXECUTABLE_PATH" --version
specs=()
for name in icon-library icon-delivery public-profile crop-font-gestures background-images featured-images wizard-layout editor-layout editor-polish-full-avatar editor-review-capture; do
  [ ! -f "tests/$name.spec.ts" ] || specs+=("tests/$name.spec.ts")
done
npx playwright test "${specs[@]}" --workers=4 --reporter=line

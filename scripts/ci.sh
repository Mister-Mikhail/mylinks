#!/usr/bin/env bash
# Local and CI entry point. Deploy is a separate build-only mode.
set -euo pipefail
mask() {
  perl -pe 'BEGIN { $| = 1; $p = $ENV{BEGET_FTP_PASSWORD} // "" }
            s/\Q$p\E/***/g if length $p;
            s#(\w+://[^:/\s]+:)[^@\s]+@#$1***@#g;'
}
exec > >(mask | tee -a ci.log) 2>&1
suite="${CI_SUITE:-quick}"
if [ "${CI_DEPS_INSTALLED:-false}" != true ]; then npm ci; fi
if [ "$suite" = build ]; then
  npm run build
  bash scripts/deploy.sh
  exit 0
fi
npm run lint
npm run build
npm run test:unit
npm run test:php
case "$suite" in
  quick) npm run test:quick ;;
  full)
    python3 scripts/test-avatar-processing.py
    if [ -f scripts/test-asset-routes.py ]; then python3 scripts/test-asset-routes.py; fi
    npm run test:full
    bash scripts/test-yandex.sh
    ;;
  *) echo "Unknown CI_SUITE: $suite" >&2; exit 1 ;;
esac

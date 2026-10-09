#!/usr/bin/env bash
# Everything CI does lives here, so it can change without touching .github/workflows.
# Pull request: lint, build, e2e, dependency audit.  Push to main: lint, build, deploy to Beget.
set -euo pipefail

# ci.log is posted as a comment, so credentials are masked before anything is written.
mask() {
  perl -pe 'BEGIN { $| = 1; $p = $ENV{BEGET_FTP_PASSWORD} // "" }
            s/\Q$p\E/***/g if length $p;
            s#(\w+://[^:/\s]+:)[^@\s]+@#$1***@#g;'
}
exec > >(mask | tee -a ci.log) 2>&1

echo "node $(node -v), npm $(npm -v), commit ${GITHUB_SHA:-local}"
npm ci
npm run lint
npm run build
php -l dist/share-profile.php
php -l dist/share-avatar.php
php -l dist/share-image.php
php -l dist/preview-config.php
php tests/share-preview.php
php tests/share-image.php

if [ "${IS_PR:-false}" = "true" ]; then
  npx playwright install --with-deps chromium > /dev/null
  npm run test:e2e -- --workers=2 --reporter=line
  echo "== npm audit (production dependencies)"
  npm audit --omit=dev || true
  echo "== npm audit (all dependencies)"
  npm audit || true
  exit 0
fi

bash scripts/deploy.sh


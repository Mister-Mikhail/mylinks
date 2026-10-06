#!/usr/bin/env bash
# Everything CI does lives here, so it can change without touching .github/workflows.
# Pull request: lint, build, e2e, dependency audit.  Push to main: lint, build, deploy to Beget.
# A pull request that contains design/figma-uploads.json also captures every screen
# (tests/design-screens.spec.ts) and uploads the images to Figma (scripts/figma-upload.mjs).
set -euo pipefail

# ci.log is posted as a comment, so credentials are masked before anything is written.
mask() {
  perl -pe 'BEGIN { $| = 1; $p = $ENV{BEGET_FTP_PASSWORD} // "" }
            s/\Q$p\E/***/g if length $p;
            s#(\w+://[^:/\s]+:)[^@\s]+@#$1***@#g;
            s#(figma[^\s"]*[?&](?:token|signature|X-Amz-Signature)=)[^&\s"]+#$1***#gi;'
}
exec > >(mask | tee -a ci.log) 2>&1

echo "node $(node -v), npm $(npm -v), commit ${GITHUB_SHA:-local}"
npm ci
npm run lint
npm run build

if [ "${IS_PR:-false}" = "true" ]; then
  npx playwright install --with-deps chromium > /dev/null
  if [ -f design/figma-uploads.json ]; then
    echo "== Design screenshots → Figma"
    DESIGN_SCREENS=1 npx playwright test tests/design-screens.spec.ts --workers=2 --reporter=line || echo "(some screens failed, uploading the rest)"
    ls design-screens || true
    node scripts/figma-upload.mjs || echo "(Figma upload failed)"
  fi
  npm run test:e2e -- --workers=2 --reporter=line
  echo "== npm audit (production dependencies)"
  npm audit --omit=dev || true
  echo "== npm audit (all dependencies)"
  npm audit || true
  if [ -f design/audit-fix-preview ]; then
    echo "== package-lock changes proposed by npm audit fix"
    npm audit fix --package-lock-only --ignore-scripts > /dev/null 2>&1 || true
    git diff --unified=2 package-lock.json | head -n 80
  fi
  exit 0
fi

bash scripts/deploy.sh

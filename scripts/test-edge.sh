#!/usr/bin/env bash
set -euo pipefail
# Deno must not rediscover the frontend package.json and replace npm-ci versions.
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
cp -R supabase/functions "$work/functions"
cd "$work"
deno test --node-modules-dir=auto functions/_shared/
deno check --node-modules-dir=auto functions/admin-profile/index.ts
deno check --node-modules-dir=auto functions/favicon/index.ts

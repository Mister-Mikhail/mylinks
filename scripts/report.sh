#!/usr/bin/env bash
# Posts the CI result: on the PR for pull requests, on the deploy-log issue for main.
set -uo pipefail
if [ "$STATUS" = "success" ]; then
  if [ "${IS_PR:-false}" = "true" ]; then head="✅ Проверки пройдены (lint, build, e2e)"; else head="✅ Опубликовано на mylinks.bar"; fi
else
  head="❌ Ошибка ($STATUS)"
fi
{
  echo "$head — \`${GITHUB_SHA::7}\` — [лог](${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID})"
  if [ -f ci.log ]; then
    echo; echo '<details><summary>Лог (последние строки)</summary>'; echo; echo '```'
    tail -n 80 ci.log | sed 's/\x1b\[[0-9;]*m//g' | grep -v -i 'pass '
    echo '```'; echo '</details>'
  fi
} > comment.md
if [ "${IS_PR:-false}" = "true" ]; then target="$PR"; else target="$DEPLOY_LOG_ISSUE"; fi
gh api "repos/${GITHUB_REPOSITORY}/issues/${target}/comments" -F body=@comment.md

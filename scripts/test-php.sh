#!/usr/bin/env bash
set -euo pipefail
for file in public/*.php; do php -l "$file" > /dev/null; done
for file in tests/*.php; do php "$file"; done

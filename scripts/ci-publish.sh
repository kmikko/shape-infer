#!/usr/bin/env bash
set -euo pipefail

VERSION=$(node -p "require('./package.json').version")

if npm view "shape-infer@${VERSION}" --json > /dev/null 2>&1; then
  echo "shape-infer@${VERSION} is already published — skipping."
else
  npm publish --no-git-checks
fi

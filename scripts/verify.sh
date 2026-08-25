#!/bin/sh
set -eu

repository_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

cd "$repository_root"
node --check contact-worker/src/index.js
(cd contact-worker && npm test)
./scripts/build-pages.sh
node scripts/test-static-site.mjs
git diff --check

if command -v xmllint >/dev/null 2>&1; then
  xmllint --noout sitemap.xml
else
  echo "warning: xmllint is unavailable; sitemap syntax was not checked" >&2
fi

echo "legal-site verification passed"

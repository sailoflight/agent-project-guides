#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT"

node -e '
const fs = require("fs");
for (const file of ["schemas/project.schema.json", "schemas/project-v3.schema.json", "schemas/catalog-entry.schema.json", "schemas/context-route.schema.json", "PACKAGE_REMOTE.json", "routing/context-classifier.json"]) JSON.parse(fs.readFileSync(file, "utf8"));
for (const file of fs.readdirSync("routing").filter((name) => name.endsWith(".jsonl"))) {
  fs.readFileSync(`routing/${file}`, "utf8").split(/\r?\n/).filter(Boolean).forEach((line) => JSON.parse(line));
}
'
python3 scripts/test-schema.py
node scripts/validate-routing.mjs
./scripts/test-install.sh
node scripts/test-v2.mjs
node scripts/test-v3.mjs
node scripts/apg.mjs catalog check
node scripts/apg.mjs project validate --target .
node scripts/apg.mjs release verify-source

if [ "${APG_RUN_REAL_PILOTS:-0}" = 1 ]; then
  node scripts/test-release-pilots.mjs
fi

git diff --check

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
node scripts/test-context-state.mjs
node scripts/test-context-choice.mjs
node scripts/apg.mjs catalog check
node scripts/apg.mjs project validate --target .
node scripts/apg.mjs release verify-source

# Self-hosting gate: this repository's own root bootstrap must carry a valid
# integrity line and must still match bootstrap/AGENTS.v2-block.md. Neither
# condition was checked before decisions/0006 P9 was extended to the v2 block,
# and this repository's root file had silently fallen one sentence behind its own
# template.
node -e '
const { spawnSync } = require("child_process");
const result = spawnSync(process.execPath, ["scripts/apg.mjs", "project", "validate", "--target", "."], { encoding: "utf8" });
if (result.status !== 0) { process.stderr.write(result.stderr); process.exit(1); }
const bootstrap = JSON.parse(result.stdout).bootstrap;
if (bootstrap?.integrity !== "valid") { console.error("self-hosted root bootstrap has no valid integrity line:", bootstrap); process.exit(1); }
if (bootstrap.template_match !== true) { console.error("self-hosted root bootstrap is stale against bootstrap/AGENTS.v2-block.md:", bootstrap); process.exit(1); }
'

if [ "${APG_RUN_REAL_PILOTS:-0}" = 1 ]; then
  node scripts/test-release-pilots.mjs
fi

git diff --check

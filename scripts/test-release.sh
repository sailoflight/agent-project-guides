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
# ADR 0005's genericity gate was written but never wired into a runner, so the
# cross-harness contract had a covering test that nothing invoked - it could rot
# silently. Both of these belong in the release runner: the genericity gate scans
# every shipped markdown surface for client names, and the interop harness SKIPs
# cleanly when the `br` binary is absent (it needs no network and no toolchain).
node scripts/test-genericity.mjs
./scripts/test-interop-br.sh
# ADR 0007 and ADR 0006 both declare their own validation in prose. These two make
# it executable: the boundary gate pins the CLI surface and the distribution
# manifest against the authority/execution partition, and the writers harness
# re-checks the census literals against the real components and drives APG's guard
# with the bytes the UBS installer actually appends. Both SKIP cleanly when their
# third-party inputs are absent - the writers harness needs the checkouts listed in
# decisions/0006, not a toolchain. Its section D additionally drives the writers'
# released binaries and asserts the observed facts from ADR 0006. Section D is
# driven BY DEFAULT, not on request: the harness already defaults APG_EXTERNAL_BIN
# to .agent-scratch/external-test/bin, so installing the verified payloads there
# is all it takes. Inside it each component is an independent sub-block, so an
# absent binary costs one GAP rather than the whole section; if the staged
# directory itself is missing, the section reports one GAP instead of passing
# silently. Either way this runner stays usable with no network and no large
# local files.
node scripts/test-boundary.mjs
# The provenance record behind the external writers harness. It has no external
# inputs, so unlike section D it runs everywhere: it pins that the record stays off
# the distribution surface, that it has not drifted from the harness it describes,
# and that its build-provenance caveat is still present (agreeing checksums are not
# provenance, and the counts read like a security result if the caveat is dropped).
node scripts/test-external-provenance.mjs
# decisions/0006 P6: the observation ledger records the instruction blocks APG saw, so
# that a whole-file rewrite can be attributed after the fact. It has no external inputs
# and no network, and it is the only gate that asserts the ledger is append-only, that
# observing leaves the root file and its neighbourhood untouched, and that a marker
# version bump is reported as a version change rather than as a clobber.
node scripts/test-observation-ledger.mjs
# Project memory is tracked in git, and the index that makes it searchable
# rewrites an access timestamp on every read, so the file went dirty after almost
# any session. This gate pins the clean filter that removes the churn without
# removing the field the documents plugin requires.
node scripts/test-mnemon-index-filter.mjs
./scripts/test-interop-writers.sh
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
else
  printf '%s\n' 'release pilots: skipped (set APG_RUN_REAL_PILOTS=1 to run). Scope when enabled: the self-contained synthetic CLI pilot plus any external pilot source that still declares its frozen 1.4.3 root entry; real-host-task outcomes are separate release evidence and are never produced here.'
fi

git diff --check

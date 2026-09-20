#!/usr/bin/env node
// Product-boundary gate for decisions/0007-authority-plane-and-execution-plane.md.
//
// ADR 0007 declares its own validation: "the shipped CLI surface must contain no
// command that indexes, schedules, executes, or stores derived state" and
// "catalog/manifest regeneration confirms no external bytes entered the
// distribution surface". Those two sentences were prose only - nothing ran them -
// which is exactly the failure mode this repository recorded in 3.0.10 for ADR
// 0005's genericity gate. This script makes them executable.
//
// It is deliberately narrow: it does not judge whether a command *feels* like
// execution. It pins the exact set of top-level command groups, so adding one is a
// deliberate act that has to be reviewed against ADR 0007, and it pins the
// distribution manifest to the same allowlist the packer uses, so no third-party
// byte can appear there without also appearing in this test's diff.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { listDistributionFiles, readJson } from '../lib/core.mjs';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

// 1. The CLI surface. ADR 0007: authority, contracts and evidence are APG's;
//    retrieval, memory mechanics, scheduling and execution belong to the
//    execution stack. These nine groups are the accepted surface.
const EXPECTED_GROUPS = [
  'context', 'project', 'catalog', 'release', 'provider',
  'migrate', 'risk', 'memory', 'dsh',
];
const FORBIDDEN = /^(?:index|search|retriev\w*|schedule\w*|queue|job|jobs|run|execute|worker|daemon|serve|server|store|vector|cache|crawl|scrape)$/i;

const help = execFileSync(process.execPath, [path.join(packageRoot, 'scripts/apg.mjs'), '--help'], { encoding: 'utf8' });
const block = help.split(/^Commands:\s*$/m)[1]?.split(/^Options:\s*$/m)[0] ?? '';
const groups = block.split('\n')
  .map((line) => line.match(/^\s{2}([a-z][a-z0-9-]*)\s{2,}/)?.[1])
  .filter(Boolean);

check(groups.length > 0, 'could not read the command list out of `apg --help`');
check(JSON.stringify(groups) === JSON.stringify(EXPECTED_GROUPS),
  `CLI surface changed: got [${groups.join(', ')}], ADR 0007 pins [${EXPECTED_GROUPS.join(', ')}] - review the addition against the authority/execution partition before updating this list`);
// Checked against the union of what ships and what this file pins, so a mistake in
// the pinned list is caught by the same rule that guards the CLI.
for (const group of new Set([...groups, ...EXPECTED_GROUPS])) {
  check(!FORBIDDEN.test(group), `command group '${group}' names a mechanism ADR 0007 assigns to the execution stack`);
}

// 2. The distribution surface. The manifest must equal the packer's own allowlist
//    (so a hand-added path cannot smuggle a component in), and no distributed path
//    may name a surveyed third-party component - ADR 0007 rejects vendoring their
//    NOASSERTION bytes.
const manifest = readJson(path.join(packageRoot, 'PACKAGE_MANIFEST.json'), 'PACKAGE_MANIFEST.json');
const listed = manifest.files.map((file) => file.path).sort();
const allowed = listDistributionFiles(packageRoot).sort();
check(JSON.stringify(listed) === JSON.stringify(allowed),
  'PACKAGE_MANIFEST.json does not match the packer allowlist - regenerate it with `apg release manifest`');

const THIRD_PARTY = /(?:^|\/)(?:ubs|ultimate_bug_scanner|beads_rust|beads_viewer|eidetic_engine|eidetic_engine_cli|mcp_agent_mail|mcp_agent_mail_rust|frankenterm|cass_memory_system|storage_ballast_helper|agentic_coding_flywheel_setup|cross_agent_session_resumer|destructive_command_guard)(?:\/|$)/i;
for (const file of listed) {
  check(!THIRD_PARTY.test(file), `distribution surface contains a third-party component path: ${file}`);
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exit(1);
}
console.log(`PASS: product boundary holds (${groups.length} command groups, ${listed.length} distributed files, no execution mechanism and no third-party bytes)`);

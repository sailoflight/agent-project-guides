#!/usr/bin/env node
// Gate for scripts/external-components.json, the provenance record behind
// scripts/test-interop-writers.sh section D.
//
// Why this needs a gate rather than a comment. The file exists so the external
// assertions can be re-established after the gitignored staging area is deleted.
// A provenance list rots in three specific ways, and each one already has a
// failure mode recorded in this repository:
//
//   1. It drifts from the harness it claims to describe, so the list looks
//      authoritative while naming components nothing drives. (The 3.0.10 lesson:
//      a declared validation with no runner.)
//   2. It leaks into the distribution surface, where NOASSERTION component bytes
//      and their paths are forbidden (ADR 0004, ADR 0007, test-boundary.mjs).
//   3. Its caveats get dropped, so agreeing checksums start reading as build
//      provenance. That is the failure this file is most likely to suffer,
//      because the counts look like a security result and are not one.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listDistributionFiles, readJson } from '../lib/core.mjs';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const relative = 'scripts/external-components.json';
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

const record = readJson(path.join(packageRoot, relative), relative);

// 1. It must not be part of what the packer ships.
const distributed = new Set(listDistributionFiles(packageRoot));
check(!distributed.has(relative),
  `${relative} is on the distribution surface; it names third-party components and must not ship`);

// 2. Shape, so a truncated or hand-mangled file cannot pass.
check(record.schema_version === 1, `schema_version must be 1, got ${JSON.stringify(record.schema_version)}`);
const released = record.released_artifacts;
const scripted = record.script_driven_checkouts;
check(Array.isArray(released) && released.length === 9, `expected 9 released-artifact components, got ${released?.length}`);
check(Array.isArray(scripted) && scripted.length === 2, `expected 2 script-driven checkouts, got ${scripted?.length}`);

const HEX = /^[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/;
for (const component of released ?? []) {
  const where = `component ${component.id}`;
  check(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\.git$/.test(component.repo ?? ''), `${where}: repo must be a github https clone url`);
  check(/^v?\d+\.\d+/.test(component.tag ?? ''), `${where}: tag looks wrong: ${JSON.stringify(component.tag)}`);
  check(/^\d+$/.test(String(component.asset?.id ?? '')), `${where}: asset.id must be the numeric GitHub asset id`);
  check(HEX.test(component.asset?.sha256 ?? ''), `${where}: asset.sha256 must be 64 lowercase hex`);
  check(HEX.test(component.binary?.sha256 ?? ''), `${where}: binary.sha256 must be 64 lowercase hex`);
  check(Number.isInteger(component.binary?.bytes) && component.binary.bytes > 0, `${where}: binary.bytes must be a positive integer`);
  check(Number.isInteger(component.checksum_sources_agreeing) && component.checksum_sources_agreeing >= 3,
    `${where}: fewer than 3 agreeing checksum sources is not enough to admit an artifact`);
  // No component byte may be named as a repository path.
  const serialized = JSON.stringify(component);
  check(!/"(?:file|path|local)"/.test(serialized), `${where}: names a local file/path, which this file must not do`);
}
for (const entry of scripted ?? []) {
  check(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\.git$/.test(entry.repo ?? ''), `checkout ${entry.id}: repo must be a github https clone url`);
  check(COMMIT.test(entry.commit ?? ''), `checkout ${entry.id}: commit must be a 40-char hex sha`);
}

// 3. It must not drift from the harness it describes. Every component here has to
//    be named by the harness, either as a staged `<id>-<tag>` directory or as a
//    checkout directory, so a component that stops being driven fails this gate.
const harness = fs.readFileSync(path.join(packageRoot, 'scripts/test-interop-writers.sh'), 'utf8');
for (const component of released ?? []) {
  const staged = `${component.id}-${String(component.tag).replace(/^v/, '')}`;
  check(harness.includes(staged),
    `component ${component.id}: scripts/test-interop-writers.sh never references a staged "${staged}" directory`);
}
const checkoutDirs = ['ultimate_bug_scanner', 'agentic_coding_flywheel_setup'];
for (const dir of checkoutDirs) {
  check(harness.includes(dir), `checkout ${dir}: scripts/test-interop-writers.sh never references it`);
}

// 4. The caveat that keeps the counts honest. If someone deletes this line the
//    agreeing-checksum numbers start implying provenance, which they do not prove.
const provenance = record.verification?.build_provenance ?? '';
check(/^NOT PERFORMED/.test(provenance),
  'verification.build_provenance must still begin with "NOT PERFORMED"; agreeing checksums are not provenance');

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exit(1);
}
console.log(`PASS: external provenance holds (${released.length} released artifacts, ${scripted.length} checkouts, not distributed, build provenance still marked absent)`);

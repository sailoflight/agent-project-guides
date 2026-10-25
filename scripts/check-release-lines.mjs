#!/usr/bin/env node
// Gate for RELEASE_LINES.json: the file that answers "which line may a consumer load
// right now, and may it replace the launcher". The structural half is enforced by
// validateReleaseLines; this script adds the one fact the structure cannot know — the
// branch it is currently sitting on must describe itself with the version this
// checkout actually is. A line table that silently disagrees with PACKAGE_VERSION is
// the prose problem again, only machine-readable this time.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RELEASE_LINES_FILE, readReleaseLines, validateReleaseLines } from '../lib/release-lines.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, RELEASE_LINES_FILE);
if (!fs.statSync(file, { throwIfNoEntry: false })?.isFile()) {
  process.stderr.write(`FAIL: ${RELEASE_LINES_FILE} is missing\n`);
  process.exit(1);
}
let parsed;
try {
  parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
} catch (error) {
  process.stderr.write(`FAIL: ${RELEASE_LINES_FILE} is not valid JSON: ${error.message}\n`);
  process.exit(1);
}
let lines;
try {
  lines = validateReleaseLines(parsed);
} catch (error) {
  process.stderr.write(`FAIL: ${RELEASE_LINES_FILE}: ${error.message}\n`);
  process.exit(1);
}

const version = fs.readFileSync(path.join(root, 'PACKAGE_VERSION'), 'utf8').trim();
const branch = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: root, encoding: 'utf8' });
const current = branch.status === 0 ? branch.stdout.trim() : '';
const problems = [];
let checked = 'skipped';
if (current && current !== 'HEAD') {
  const own = lines.lines.find((line) => line.ref === current);
  if (!own) {
    problems.push(`branch ${current} is not described in ${RELEASE_LINES_FILE}`);
  } else {
    checked = current;
    if (own.package_version !== version) {
      problems.push(`line ${own.id} (ref ${current}) says ${own.package_version} but PACKAGE_VERSION is ${version}`);
    }
  }
}

if (problems.length) {
  for (const problem of problems) process.stderr.write(`FAIL: ${problem}\n`);
  process.exit(1);
}
process.stdout.write(`${JSON.stringify({
  valid: true,
  default: lines.default,
  lines: lines.lines.map((line) => ({ id: line.id, ref: line.ref, package_version: line.package_version, loadable: line.loadable, promotable: line.promotable })),
  branch_checked: checked,
  package_version: version,
})}\n`);

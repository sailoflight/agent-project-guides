#!/usr/bin/env node
// Acceptance for the three things another project asked for before it can register this
// repository as a managed capability (issue #1, infra, 2026-10-25):
//
//   R1  PACKAGE_MANIFEST.json states files[].mode, and a changed permission bit is red
//   R2  RELEASE_LINES.json answers "which line may be loaded" without prose
//   R3  a read-only command reports whether a project's root block still matches its pin
//
// Each case drives the shipped CLI on a real file tree; none of them inspect the code
// that is supposed to have done the work.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildFileManifest, canonicalJson, sha256, verifyFileManifest } from '../lib/core.mjs';
import { validateReleaseLines } from '../lib/release-lines.mjs';
import { writeCatalog } from '../lib/catalog.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'scripts', 'apg.mjs');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'apg-registration-'));
process.on('exit', () => fs.rmSync(temporary, { recursive: true, force: true }));
let assertions = 0;

function run(args, { home = path.join(temporary, 'home'), cwd = root, expect = 0 } = {}) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, AGENT_PROJECT_GUIDES_HOME: home },
  });
  const text = expect === 0 ? result.stdout : result.stderr;
  assert.equal(result.status, expect, `expected exit ${expect} for apg ${args.join(' ')}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);
  assertions += 1;
  return text.trim() ? JSON.parse(text) : undefined;
}

function copyIn(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  fs.chmodSync(to, fs.statSync(from).mode & 0o777);
}

// ---------------------------------------------------------------- R1: manifest mode

// The fixture is the distribution itself: every path the published manifest names,
// copied with its real permission bits. A hand-written fixture could agree with the
// builder by accident; this one cannot.
const fixture = path.join(temporary, 'package');
const published = JSON.parse(fs.readFileSync(path.join(root, 'PACKAGE_MANIFEST.json'), 'utf8'));
for (const entry of published.files) copyIn(path.join(root, entry.path), path.join(fixture, entry.path));
const built = run(['release', 'manifest', '--source', fixture]);
assert.equal(built.status, 'written');
const manifest = built.manifest;
const modes = manifest.files.map((entry) => entry.mode);
assert.ok(modes.every((mode) => Number.isInteger(mode) && mode >= 0 && mode <= 0o777), 'every manifest entry must carry a permission mask');
assert.equal(manifest.files.find((entry) => entry.path === 'scripts/install.sh').mode, 0o755, 'an executable keeps its exec bits in the manifest');
assert.equal(manifest.files.find((entry) => entry.path === 'lib/core.mjs').mode, 0o644, 'a data file keeps its read bits in the manifest');
assert.equal(built.manifest.digest, published.digest, 'the fixture is a byte-for-byte copy, so the digest must agree');
const modeFree = {
  schema_version: manifest.schema_version,
  package_version: manifest.package_version,
  files: manifest.files.map(({ path: filePath, bytes, sha256: hash }) => ({ path: filePath, bytes, sha256: hash })),
};
assert.notEqual(`sha256:${sha256(canonicalJson(modeFree))}`, manifest.digest, 'mode must be covered by the digest, not merely printed next to it');
assert.equal(run(['release', 'verify-source', '--source', fixture]).valid, true);

const installed = run(['release', 'install', '--source', fixture], { home: path.join(temporary, 'install-home') });
const releaseRoot = installed.root;
assert.equal(run(['release', 'verify', '--root', releaseRoot]).valid, true, 'a freshly installed release verifies');
const installedCli = path.join(releaseRoot, 'scripts', 'install.sh');
fs.chmodSync(installedCli, 0o644);
const red = run(['release', 'verify', '--root', releaseRoot], { expect: 2 });
assert.equal(red.error, 'release_corrupt', 'a changed permission bit must be red, not tolerated');
fs.chmodSync(installedCli, 0o755);
assert.equal(run(['release', 'verify', '--root', releaseRoot]).valid, true, 'restoring the bit restores the verdict');

// A generated file must not inherit the builder's umask: the bits are release content
// now, so "who ran the build" must not change what is published. Measured failure:
// catalog.jsonl came out 0o664 from a umask-002 shell while git recorded 100644.
const catalogFile = path.join(fixture, 'catalog', 'catalog.jsonl');
const savedUmask = process.umask(0o002);
try {
  writeCatalog(fixture);
} finally {
  process.umask(savedUmask);
}
assert.equal(fs.statSync(catalogFile).mode & 0o777, 0o644, 'a generated catalog must not take the builder umask');

// And publishing refuses a group- or other-writable file outright, because a consumer
// rejects `mode & 0o022` and the bit is almost always a umask accident, not a decision.
fs.chmodSync(catalogFile, 0o664);
const refused = run(['release', 'manifest', '--source', fixture], { expect: 2 });
assert.match(refused.message, /group\/other-writable/, 'a 0o664 file must stop the manifest, not ship');
assert.match(refused.message, /catalog\/catalog\.jsonl/, 'the refusal must name the file');
fs.chmodSync(catalogFile, 0o644);
assert.equal(run(['release', 'manifest', '--source', fixture]).status, 'written', 'normalizing the bits lets publishing continue');

// A manifest from before the boundary is still valid on its own shape; a current one
// that simply lost the field is refused. Both are checked through the public verifier.
const legacy = path.join(temporary, 'legacy');
fs.mkdirSync(legacy, { recursive: true });
fs.writeFileSync(path.join(legacy, 'PACKAGE_VERSION'), '3.0.10\n');
// verifyFileManifest is about installed release roots, which always carry the manifest
// beside the payload; its presence is asserted, its content is not part of the digest.
fs.writeFileSync(path.join(legacy, 'release-manifest.json'), '{}\n');
const legacyManifest = buildFileManifest(legacy);
for (const entry of legacyManifest.files) delete entry.mode;
assert.equal(verifyFileManifest(legacy, legacyManifest).package_version, '3.0.10', 'a 3.0.10 manifest without mode stays verifiable');
fs.writeFileSync(path.join(legacy, 'PACKAGE_VERSION'), '3.0.11\n');
const currentManifest = buildFileManifest(legacy);
for (const entry of currentManifest.files) delete entry.mode;
assert.throws(() => verifyFileManifest(legacy, currentManifest), /omits files\[\]\.mode/, 'a 3.0.11 manifest without mode must be refused');
assertions += 2;

// ------------------------------------------------------------- R2: release lines

const lines = validateReleaseLines(JSON.parse(fs.readFileSync(path.join(root, 'RELEASE_LINES.json'), 'utf8')));
assert.equal(lines.lines.filter((line) => line.promotable).length, 1, 'exactly one line may replace the launcher');
assert.equal(lines.default, lines.lines.find((line) => line.promotable).id, 'the default line is the promotable one');
const base = JSON.parse(JSON.stringify(lines));
const two = JSON.parse(JSON.stringify(base));
two.lines.push({ ...two.lines[0], id: 'other', ref: 'other-branch' });
assert.throws(() => validateReleaseLines(two), /exactly one release line may be promotable/, 'two promotable lines must be refused');
const quiet = JSON.parse(JSON.stringify(base));
quiet.lines.find((line) => !line.promotable).preconditions = [];
assert.throws(() => validateReleaseLines(quiet), /gives no reason/, 'a held line without a precondition is refused');
const dangling = JSON.parse(JSON.stringify(base));
dangling.default = 'nope';
assert.throws(() => validateReleaseLines(dangling), /unknown line/, 'a default that names nothing is refused');
assertions += 3;

// ------------------------------------------------------------------ R3: block verify

const project = path.join(temporary, 'project');
fs.mkdirSync(project, { recursive: true });
for (const name of ['.agent-project-guides.json', 'AGENTS.md', 'PACKAGE_VERSION']) copyIn(path.join(root, name), path.join(project, name));
const clean = run(['project', 'block-verify', '--target', project]);
assert.equal(clean.status, 'ready');
assert.equal(clean.marker, 'v2');
assert.equal(clean.mismatches.length, 0);
assert.equal(clean.block.start_byte, 0);
assert.ok(clean.block.end_byte > 0);
assert.equal(clean.release_line.id, lines.default, 'the block names the line it belongs to');
assert.match(clean.declared.root_block_hash, /^sha256:[0-9a-f]{64}$/);

const edited = path.join(temporary, 'edited');
fs.mkdirSync(edited, { recursive: true });
for (const name of ['.agent-project-guides.json', 'AGENTS.md', 'PACKAGE_VERSION']) copyIn(path.join(root, name), path.join(edited, name));
const editedFile = path.join(edited, 'AGENTS.md');
fs.writeFileSync(editedFile, fs.readFileSync(editedFile, 'utf8').replace('Project governance bootstrap', 'Project governance BootstrAp'));
const broken = run(['project', 'block-verify', '--target', edited]);
assert.equal(broken.status, 'mismatch', 'one changed character inside the block must be red');
const failing = broken.mismatches.map((entry) => entry.field);
assert.ok(failing.includes('root_block_hash_matches'), 'the descriptor anchor is what catches a hand edit');
assert.ok(failing.includes('integrity_line_valid'), 'the block integrity line is a second, independent witness');
assert.equal(broken.block.start_byte, 0);
assert.ok(broken.block.end_byte > 0, 'a mismatch still reports where the block is');
const integrity = broken.mismatches.find((entry) => entry.field === 'integrity_line_valid');
assert.equal(typeof integrity.line, 'number', 'a mismatch points at the line that failed');

// The command is read-only: verifying must not rewrite the project it inspects.
const before = fs.readFileSync(editedFile);
const beforeStat = fs.statSync(editedFile);
run(['project', 'block-verify', '--target', edited]);
assert.deepEqual(fs.readFileSync(editedFile), before, 'block-verify must not touch the root file');
assert.equal(fs.statSync(editedFile).mtimeMs, beforeStat.mtimeMs, 'block-verify must not rewrite the root file');
assertions += 2;

process.stdout.write(`${JSON.stringify({ valid: true, assertions, manifest: manifest.digest, release_line: lines.default })}\n`);

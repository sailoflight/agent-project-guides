#!/usr/bin/env node
// ADR 0009/0010: materialise the first real component store from bytes that are
// already on this machine.
//
// Why this exists and what it refuses to do. The store only holds what someone
// already staged; this tool copies or hard-links those bytes into the digest-named
// layout and seals a manifest over them. It never downloads, never verifies against a
// network, and never repairs an entry it finds broken - a store that silently repairs
// itself cannot be trusted to serve the same component twice. A mismatch between the
// committed acquisition record and the bytes on disk is a hard failure, because that
// discrepancy is exactly what the record exists to catch.
//
// Usage:
//   node scripts/build-component-store.mjs [--record <record.json>]
//        [--source <staged dir>] [--store <root>] [--dry-run] [--require-all]
//
// --dry-run plans every entry and writes nothing. Without --link/--copy the tool hard
// links when the store shares a filesystem with the source and copies otherwise, and
// reports which it used, because a hard-linked entry shares its inode with the staged
// copy: tampering through either path is still detected by digest, but it is not
// isolated.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson, sha256 } from '../lib/core.mjs';
import { COMPONENT_MANIFEST, entryDir, packageManifest, storeRoot, verifyEntry } from '../lib/components.mjs';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parse(argv) {
  const options = { record: path.join(packageRoot, 'scripts', 'external-components.json'), source: path.join(packageRoot, '.agent-scratch', 'external-test', 'bin'), mode: null };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--dry-run') options.dryRun = true;
    else if (value === '--require-all') options.requireAll = true;
    else if (value === '--link') options.mode = 'link';
    else if (value === '--copy') options.mode = 'copy';
    else if (value === '--record' || value === '--source' || value === '--store') options[value.slice(2)] = argv[++index];
    else throw new Error(`unknown argument: ${value}`);
  }
  return options;
}

function materialise(target, source, mode) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (mode !== 'copy') {
    try {
      fs.linkSync(source, target);
      return 'link';
    } catch (error) {
      if (mode === 'link') throw error;
      if (!['EXDEV', 'EPERM', 'EMLINK', 'EACCES'].includes(error.code)) throw error;
    }
  }
  fs.copyFileSync(source, target);
  return 'copy';
}

function main() {
  const options = parse(process.argv.slice(2));
  const record = JSON.parse(fs.readFileSync(options.record, 'utf8'));
  const root = storeRoot({ store: options.store });
  const results = [];
  let failed = false;
  for (const artifact of record.released_artifacts ?? []) {
    const source = path.join(options.source, artifact.asset.name);
    const stat = fs.statSync(source, { throwIfNoEntry: false });
    if (!stat?.isFile()) {
      if (options.requireAll) failed = true;
      results.push({ id: artifact.id, version: artifact.version_reported, state: 'not-staged', expected: artifact.asset.name });
      continue;
    }
    const content = fs.readFileSync(source);
    const observed = `sha256:${sha256(content)}`;
    if (content.length !== artifact.asset.bytes || observed !== `sha256:${artifact.asset.sha256}`) {
      failed = true;
      results.push({ id: artifact.id, version: artifact.version_reported, state: 'record-mismatch', bytes: content.length, expected_bytes: artifact.asset.bytes, observed: observed.slice(0, 19) });
      continue;
    }
    const manifest = packageManifest({
      id: artifact.id,
      version: artifact.version_reported,
      provenance: { repo: artifact.repo, tag: artifact.tag, asset_id: String(artifact.asset.id) },
      requires: artifact.requires,
      files: [{ path: artifact.asset.name, content }],
    });
    const dir = entryDir(root, artifact.id, manifest.digest);
    if (fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory()) {
      verifyEntry(dir);
      results.push({ id: artifact.id, version: artifact.version_reported, digest: manifest.digest, state: 'present', dir });
      continue;
    }
    if (options.dryRun) {
      results.push({ id: artifact.id, version: artifact.version_reported, digest: manifest.digest, state: 'planned', bytes: content.length });
      continue;
    }
    const mode = materialise(path.join(dir, artifact.asset.name), source, options.mode);
    fs.writeFileSync(path.join(dir, COMPONENT_MANIFEST), canonicalJson(manifest), { mode: 0o444 });
    results.push({ id: artifact.id, version: artifact.version_reported, digest: manifest.digest, state: 'materialised', mode, bytes: content.length, dir });
  }
  // A record change that moves a digest leaves the previous directory behind, and two
  // digests under one id is a conflict the verifier refuses to resolve. Reporting it here,
  // where the intended digest is known, names the exact directory to delete; the builder
  // never deletes it itself.
  const intended = new Map(results.filter((entry) => entry.digest).map((entry) => [entry.id, entry.digest]));
  const stale = [];
  for (const [id, digest] of intended) {
    const idDir = path.join(root, id);
    if (!fs.statSync(idDir, { throwIfNoEntry: false })?.isDirectory()) continue;
    for (const version of fs.readdirSync(idDir).sort()) {
      if (!version.startsWith('sha256-')) continue;
      if (version === `sha256-${digest.replace('sha256:', '')}`) continue;
      stale.push({ id, digest: version.replace('sha256-', 'sha256:'), dir: path.join(idDir, version) });
    }
  }
  const summary = {
    root,
    dry_run: Boolean(options.dryRun),
    record: path.relative(packageRoot, options.record),
    entries: results,
    materialised: results.filter((entry) => entry.state === 'materialised').length,
    present: results.filter((entry) => entry.state === 'present').length,
    not_staged: results.filter((entry) => entry.state === 'not-staged').map((entry) => entry.id),
    record_mismatch: results.filter((entry) => entry.state === 'record-mismatch').map((entry) => entry.id),
    stale,
  };
  process.stdout.write(`${canonicalJson(summary)}\n`);
  if (failed) process.exitCode = 1;
}

main();

#!/usr/bin/env node
// ADR 0009: one component store per machine, shared by every project on it, and
// discovery that is falsifiable.
//
// This gate exists because the store's whole value proposition is a claim that is easy
// to assert and hard to hold: "the project reuses what is already there". Three ways
// that claim goes quietly false, and each has an assertion below. A store that copies
// per project still resolves; a probe that trusts "the port answers" still returns
// something; a manifest that tolerates an extra file still verifies. So the gate pins
// the sibling root, the single copy, the exact file set, and the four discovery states
// against real loopback servers.
//
// The validator and probe live here rather than in lib/ on purpose: ADR 0009 D7 keeps
// this contract off the distribution surface, and row 2 of the owner arbitration keeps
// decision 2 (the declarative manifest) closed. Lifting this code into lib/ is that
// decision, not this commit.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { canonicalJson, platformHomes, sha256 } from '../lib/core.mjs';

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'apg-components-test-'));
process.on('exit', () => fs.rmSync(temporary, { recursive: true, force: true }));

const COMPONENT_MANIFEST = 'component-manifest.json';

function componentsRoot(env) {
  return path.join(platformHomes(env).data, 'components');
}

function entryDir(env, id, digest) {
  return path.join(componentsRoot(env), id, digest.replace(':', '-'));
}

function sha256Of(bytes) {
  return `sha256:${sha256(bytes)}`;
}

function buildManifest(files) {
  const entries = [];
  for (const [relative, bytes] of files) entries.push({ path: relative, bytes: bytes.length, sha256: sha256Of(bytes) });
  entries.sort((left, right) => left.path.localeCompare(right.path));
  const portable = { schema_version: 1, kind: 'package', files: entries };
  return { ...portable, digest: `sha256:${sha256(canonicalJson(portable))}` };
}

function writeEntry(dir, files, { manifestMode = 0o444, manifest = buildManifest(files) } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  for (const [relative, bytes] of files) {
    const target = path.join(dir, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes, { mode: 0o644 });
  }
  fs.writeFileSync(path.join(dir, COMPONENT_MANIFEST), canonicalJson(manifest), { mode: manifestMode });
  return manifest;
}

// Verification mirrors the shipped release validator (`lib/provider.mjs`): canonical
// digest over the manifest without its own digest, safe relative paths, no case
// collisions, a read-only manifest, and - the assertion that carries the most weight -
// a file set that matches EXACTLY, with the manifest excluded from its own content
// set. The set comparison runs before the per-file hashes so that a missing file is
// reported as a missing file rather than as a read error.
function verifyEntry(dir) {
  const manifestPath = path.join(dir, COMPONENT_MANIFEST);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const { digest, ...portable } = manifest;
  assert.equal(`sha256:${sha256(canonicalJson(portable))}`, digest, 'component manifest digest is invalid');
  assert.equal(path.basename(dir), digest.replace(':', '-'), 'component directory is not named by its digest');
  assert.equal(fs.statSync(manifestPath).mode & 0o777, 0o444, 'a component manifest must be read-only');
  const declared = new Set();
  const folded = new Set();
  for (const entry of manifest.files) {
    assert.ok(typeof entry.path === 'string' && !path.isAbsolute(entry.path) && !entry.path.includes('\\') && !entry.path.split('/').some((part) => !part || part === '..'), `unsafe component path: ${entry.path}`);
    const key = entry.path.toLocaleLowerCase('und');
    assert.ok(!declared.has(entry.path) && !folded.has(key), `duplicate or case-colliding component path: ${entry.path}`);
    declared.add(entry.path);
    folded.add(key);
  }
  const observed = [];
  const visit = (relative = '') => {
    for (const item of fs.readdirSync(path.join(dir, relative), { withFileTypes: true })) {
      const child = relative ? `${relative}/${item.name}` : item.name;
      assert.ok(!item.isSymbolicLink(), `component contains a symlink: ${child}`);
      if (item.isDirectory()) visit(child);
      else observed.push(child);
    }
  };
  visit();
  assert.deepEqual(observed.sort(), [...declared, COMPONENT_MANIFEST].sort(), 'component file set is not exactly its manifest');
  for (const entry of manifest.files) {
    const bytes = fs.readFileSync(path.join(dir, entry.path));
    assert.equal(bytes.length, entry.bytes, `component size mismatch: ${entry.path}`);
    assert.equal(sha256Of(bytes), entry.sha256, `component hash mismatch: ${entry.path}`);
  }
  return manifest;
}

// A record names an identity, never a location: the same rule the shipped provenance
// gate already enforces for component records (`scripts/test-external-provenance.mjs:56`).
function validateEntry(entry) {
  if (entry.kind === 'service') {
    assert.equal(entry.delivery, 'staged', 'a service entry cannot be delivery: fetched - an already-running service cannot be downloaded');
    assert.ok(/^[A-Za-z0-9._-]+:[0-9]{1,5}$/.test(entry.endpoint || ''), 'a service endpoint must be host:port');
    assert.equal(typeof entry.singleton, 'boolean', 'a service entry must declare singleton');
  }
  const serialized = JSON.stringify(entry);
  assert.ok(!/"(?:file|path|local)"\s*:/.test(serialized), 'a component record must not name a local file/path');
  assert.ok(!serialized.includes(temporary), 'a component record must not contain a machine path');
  return entry;
}

function resolveFile(entry, env) {
  const dir = entryDir(env, entry.id, entry.digest);
  if (!fs.existsSync(dir)) return { state: 'not-installed', reusable: false, action: 'none' };
  verifyEntry(dir);
  return { state: 'available', reusable: true, dir };
}

function startService(id, revision) {
  const requests = [];
  const server = http.createServer((request, response) => {
    requests.push({ method: request.method, url: request.url });
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ id, revision }));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ port: server.address().port, requests, close: () => new Promise((done) => server.close(done)) })));
}

function probe(entry, timeout = 400) {
  return new Promise((resolve) => {
    const [host, port] = entry.endpoint.split(':');
    const request = http.get({ host, port: Number(port), path: entry.health, timeout }, (response) => {
      let body = '';
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        let observed;
        try { observed = JSON.parse(body); } catch { resolve({ state: 'conflict', reusable: false, reason: 'the endpoint answered with something that is not a component identity' }); return; }
        if (observed.id !== entry.id) resolve({ state: 'conflict', reusable: false, reason: `the endpoint belongs to ${observed.id}` });
        else if (!entry.revision) resolve({ state: 'degraded', reusable: true, reason: 'the declaration pins no revision, so the identity is unverified' });
        else if (observed.revision !== entry.revision) resolve({ state: 'degraded', reusable: true, reason: `revision ${observed.revision} does not match the pinned ${entry.revision}` });
        else resolve({ state: 'available', reusable: true });
      });
    });
    request.on('timeout', () => { request.destroy(); resolve({ state: 'degraded', reusable: false, reason: 'the health probe timed out' }); });
    request.on('error', () => resolve({ state: 'not-installed', reusable: false, action: 'none' }));
  });
}

// A singleton with two live instances must be a conflict, not a choice: picking one
// would silently reintroduce the second deployment this store exists to prevent.
function resolveService(entry, observations) {
  const available = observations.filter((observation) => observation.state === 'available');
  if (entry.singleton && available.length > 1) return { state: 'conflict', reusable: false, reason: `${available.length} instances of a singleton are live` };
  if (available.length) return { state: 'available', reusable: true, instances: available.length };
  const conflicted = observations.find((observation) => observation.state === 'conflict');
  if (conflicted) return { state: 'conflict', reusable: false, reason: conflicted.reason };
  const degraded = observations.find((observation) => observation.state === 'degraded');
  if (degraded) return { state: 'degraded', reusable: false, reason: degraded.reason };
  return { state: 'not-installed', reusable: false, action: 'none' };
}

// 1. The store sits beside APG's own package store, under the variable that already
// exists. A second variable for the same machine would be one more thing to keep in sync.
const override = { AGENT_PROJECT_GUIDES_HOME: path.join(temporary, 'home') };
const xdg = { XDG_DATA_HOME: path.join(temporary, 'xdg'), HOME: path.join(temporary, 'nohome') };
for (const env of [override, xdg]) {
  assert.equal(componentsRoot(env), path.join(platformHomes(env).data, 'components'));
  assert.equal(path.dirname(componentsRoot(env)), platformHomes(env).data, 'the component store must be a sibling of the release store, not a new root');
}
assert.equal(platformHomes(override).data, path.join(override.AGENT_PROJECT_GUIDES_HOME, 'data'), 'the documented variable alone decides the root');
assert.notEqual(componentsRoot(override), path.join(platformHomes(override).data, 'releases'));

// 2. A valid entry verifies, and two projects referencing it resolve to one copy. This
// is the "别到处都是" assertion: the count is the contract, not the path.
const env = override;
const files = new Map([['bin/tool', Buffer.from('#!/bin/sh\necho tool\n')], ['README.md', Buffer.from('# tool\n')]]);
const manifest = buildManifest(files);
const entry = validateEntry({ kind: 'package', id: 'tool', digest: manifest.digest, version: '1.0.0', delivery: 'staged' });
writeEntry(entryDir(env, 'tool', entry.digest), files, { manifest });
const resolvedA = resolveFile(entry, env);
const resolvedB = resolveFile(entry, env);
assert.equal(resolvedA.state, 'available');
assert.equal(resolvedA.dir, resolvedB.dir, 'two projects must resolve to the same directory');
assert.deepEqual(fs.readdirSync(path.join(componentsRoot(env), 'tool')), [entry.digest.replace(':', '-')], 'the store must hold exactly one copy of the component');

// 3. The file set is exact. An extra file, a missing file, a tampered byte, a writable
// manifest and a directory that does not match its digest must each fail - a store that
// tolerates any of them cannot be trusted to serve the same component twice.
const tamper = (name) => entryDir(env, `probe-${name}`, manifest.digest);
writeEntry(tamper('extra'), files, { manifest });
fs.writeFileSync(path.join(tamper('extra'), 'smuggled.bin'), 'x');
assert.throws(() => verifyEntry(tamper('extra')), /file set is not exactly its manifest/);
writeEntry(tamper('missing'), files, { manifest });
fs.rmSync(path.join(tamper('missing'), 'README.md'));
assert.throws(() => verifyEntry(tamper('missing')), /file set is not exactly its manifest/);
writeEntry(tamper('tampered'), files, { manifest });
fs.writeFileSync(path.join(tamper('tampered'), 'bin/tool'), '#!/bin/sh\necho backdoor\n');
assert.throws(() => verifyEntry(tamper('tampered')), /component (size|hash) mismatch/);
writeEntry(tamper('writable'), files, { manifest, manifestMode: 0o644 });
assert.throws(() => verifyEntry(tamper('writable')), /must be read-only/);
const renamed = path.join(componentsRoot(env), 'probe-renamed', `sha256-${'b'.repeat(64)}`);
writeEntry(renamed, files, { manifest });
assert.throws(() => verifyEntry(renamed), /not named by its digest/);

// 4. A missing component is not an error and produces no fetch action. This is the line
// between a store and a package manager.
const absent = validateEntry({ kind: 'package', id: 'mail', digest: `sha256:${'c'.repeat(64)}`, version: '0.1.0', delivery: 'staged' });
assert.deepEqual(resolveFile(absent, env), { state: 'not-installed', reusable: false, action: 'none' });

// 5. A service entry carries identity only, never bytes, and can never be fetched.
assert.throws(() => validateEntry({ kind: 'service', id: 'mail', endpoint: '127.0.0.1:8765', transport: 'http', revision: '0.1.0', health: '/health', singleton: true, delivery: 'fetched' }), /cannot be delivery: fetched/);
assert.throws(() => validateEntry({ kind: 'service', id: 'mail', endpoint: '127.0.0.1:8765', transport: 'http', revision: '0.1.0', health: '/health', singleton: true, delivery: 'staged', local: '/opt/mail' }), /must not name a local file\/path/);
const service = validateEntry({ kind: 'service', id: 'mail', endpoint: '127.0.0.1:8765', transport: 'http', revision: '0.1.0', health: '/health', singleton: true, delivery: 'staged' });
assert.ok(!/"(?:file|path|local)"\s*:/.test(JSON.stringify(service)), 'a service record must name no location');

// 6. The four discovery states, against real servers on loopback. "The port answers" is
// not evidence, so a foreign identity is a conflict and a revision mismatch is degraded
// - never a silent reuse.
const mail = await startService('mail', '0.1.0');
const foreign = await startService('somethingelse', '9.9.9');
const live = { ...service, endpoint: `127.0.0.1:${mail.port}` };
assert.deepEqual(await probe(live), { state: 'available', reusable: true });
assert.equal((await probe({ ...live, revision: '0.2.0' })).state, 'degraded', 'a revision mismatch must not be reused silently');
assert.equal((await probe({ ...live, revision: undefined })).state, 'degraded', 'an unpinned revision cannot be verified');
assert.equal((await probe({ ...service, endpoint: `127.0.0.1:${foreign.port}` })).state, 'conflict', 'a foreign identity on the declared port is a conflict');
const closing = await startService('closed', '0.1.0');
const closedPort = closing.port;
await closing.close();
assert.deepEqual(await probe({ ...service, endpoint: `127.0.0.1:${closedPort}` }), { state: 'not-installed', reusable: false, action: 'none' });
assert.deepEqual(await resolveService(service, [{ state: 'available', reusable: true }]), { state: 'available', reusable: true, instances: 1 });
assert.equal((await resolveService(service, [{ state: 'available', reusable: true }, { state: 'available', reusable: true }])).state, 'conflict', 'two live instances of a singleton must be a conflict');
assert.deepEqual(await resolveService(service, [{ state: 'not-installed', reusable: false }]), { state: 'not-installed', reusable: false, action: 'none' });

// 7. Discovery is read-only. The servers above recorded every request they received; a
// probe that restarted, posted, or warmed the service would show up here.
assert.ok(mail.requests.length >= 2, 'the probe must actually have reached the service');
for (const request of [...mail.requests, ...foreign.requests]) {
  assert.equal(request.method, 'GET', `discovery must not issue a state-changing request: ${request.method} ${request.url}`);
  assert.equal(request.url, '/health', `discovery must only touch the declared health path: ${request.url}`);
}
await mail.close();
await foreign.close();

console.log('PASS: the component store is a sibling of the release store under the existing variable, holds one verified copy per machine, rejects an inexact file set, never fetches, never names a location, and resolves all four discovery states from real loopback probes without issuing a state-changing request');

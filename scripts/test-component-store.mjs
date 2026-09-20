#!/usr/bin/env node
// ADR 0009 (the store) and ADR 0010 (its contract on the distribution surface).
//
// This gate exists because the store's value proposition is a claim that is easy to
// assert and hard to hold: "the project reuses what is already there". Four ways that
// claim goes quietly false, and each has an assertion below. A store that copies per
// project still resolves; a probe that trusts "the port answers" still returns
// something; a manifest that tolerates an extra file still verifies; and a builder that
// ignores the acquisition record still produces directories. So the gate pins the
// sibling root, the single copy, the exact file set, the four discovery states against
// real loopback servers, and the builder's behaviour when the record and the bytes
// disagree.
//
// The implementation under test lives in lib/components.mjs on purpose (ADR 0010).
// Until that ADR, this gate carried its own copy of the validator, which meant the gate
// tested a helper no consumer would ever run.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { canonicalJson, platformHomes, sha256 } from '../lib/core.mjs';
import {
  IDENTITY_DEFAULTS,
  IDENTITY_FIELDS,
  REQUIREMENT_KINDS,
  SERVICE_DIR,
  STOP_KINDS,
  applyRequirements,
  checkRequirements,
  componentsRoot,
  entryDir,
  packageManifest,
  probeService,
  readStoreEntryRecords,
  resolvePackage,
  resolveService,
  validateEntry,
  verifyEntry,
  writePackageEntry,
} from '../lib/components.mjs';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'apg-components-test-'));
process.on('exit', () => fs.rmSync(temporary, { recursive: true, force: true }));

function startServer(payload) {
  const requests = [];
  const server = http.createServer((request, response) => {
    requests.push({ method: request.method, url: request.url });
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(payload));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({
    port: server.address().port,
    requests,
    // closeAllConnections because the probes above are keep-alive by default in modern
    // Node: without it server.close() waits on a socket no one will send on again.
    close: () => new Promise((done) => { server.closeAllConnections?.(); server.close(() => done()); }),
  })));
}

// 1. The store sits beside APG's own package store, under the variable that already
// exists. A second root variable for the same machine would be one more thing to keep in
// sync, and the sibling relationship is the assertion that pins it.
const override = { AGENT_PROJECT_GUIDES_HOME: path.join(temporary, 'home') };
const xdg = { XDG_DATA_HOME: path.join(temporary, 'xdg'), HOME: path.join(temporary, 'nohome') };
for (const env of [override, xdg]) {
  assert.equal(componentsRoot(env), path.join(platformHomes(env).data, 'components'));
  assert.equal(path.dirname(componentsRoot(env)), platformHomes(env).data, 'the component store must be a sibling of the release store, not a new root');
}
assert.equal(platformHomes(override).data, path.join(override.AGENT_PROJECT_GUIDES_HOME, 'data'), 'the documented variable alone decides the root');
assert.notEqual(componentsRoot(override), path.join(platformHomes(override).data, 'releases'));

// 2. A valid entry verifies, and two projects referencing it resolve to one copy. This is
// the "别到处都是" assertion: the count is the contract, not the path.
const env = override;
const root = componentsRoot(env);
const files = [{ path: 'bin/tool', content: Buffer.from('#!/bin/sh\necho tool\n') }, { path: 'README.md', content: Buffer.from('# tool\n') }];
const manifest = packageManifest({ id: 'tool', version: '1.0.0', files });
writePackageEntry(entryDir(root, 'tool', manifest.digest), manifest, files);
const entry = validateEntry({ kind: 'package', id: 'tool', digest: manifest.digest });
const resolvedA = resolvePackage(entry, root);
const resolvedB = resolvePackage(entry, root);
assert.equal(resolvedA.state, 'available');
assert.equal(resolvedA.dir, resolvedB.dir, 'two projects must resolve to the same directory');
assert.deepEqual(fs.readdirSync(path.join(root, 'tool')), [manifest.digest.replace(':', '-')], 'the store must hold exactly one copy of the component');

// 3. The file set is exact. An extra file, a missing file, a tampered byte, a writable
// manifest and a directory that does not match its digest must each fail - a store that
// tolerates any of them cannot be trusted to serve the same component twice.
const tamper = (name) => entryDir(root, `probe-${name}`, manifest.digest);
writePackageEntry(tamper('extra'), manifest, files);
fs.writeFileSync(path.join(tamper('extra'), 'smuggled.bin'), 'x');
assert.throws(() => verifyEntry(tamper('extra')), /file set is not exactly its manifest/);
writePackageEntry(tamper('missing'), manifest, files);
fs.rmSync(path.join(tamper('missing'), 'README.md'));
assert.throws(() => verifyEntry(tamper('missing')), /file set is not exactly its manifest/);
writePackageEntry(tamper('tampered'), manifest, files);
fs.writeFileSync(path.join(tamper('tampered'), 'bin/tool'), '#!/bin/sh\necho backdoor\n');
assert.throws(() => verifyEntry(tamper('tampered')), /component (size|hash) mismatch/);
writePackageEntry(tamper('writable'), manifest, files, { mode: 0o644 });
assert.throws(() => verifyEntry(tamper('writable')), /must be read-only/);
const renamed = path.join(root, 'probe-renamed', `sha256-${'b'.repeat(64)}`);
writePackageEntry(renamed, manifest, files);
assert.throws(() => verifyEntry(renamed), /not named by its digest/);
// The five deliberately-broken entries above must not leak into the store walk or the
// CLI check below: a store containing them is exactly what those two report on.
for (const name of ['extra', 'missing', 'tampered', 'writable']) fs.rmSync(tamper(name), { recursive: true, force: true });
fs.rmSync(path.dirname(renamed), { recursive: true, force: true });

// 4. A missing component is not an error and produces no fetch action. This is the line
// between a store and a package manager.
const absent = validateEntry({ kind: 'package', id: 'mail', digest: `sha256:${'c'.repeat(64)}` });
assert.deepEqual(resolvePackage(absent, root), { id: 'mail', state: 'not-installed', reusable: false, action: 'none' });

// 5. Identity, never location. A service entry cannot be fetched, cannot address a name
// that would require resolution, and cannot carry a location field at all.
const validService = { kind: 'service', id: 'mail', endpoint: '127.0.0.1:8765', transport: 'http', revision: '0.1.0', health: '/health', singleton: true, delivery: 'staged' };
assert.throws(() => validateEntry({ ...validService, delivery: 'fetched' }), /cannot be delivery: fetched/);
assert.throws(() => validateEntry({ ...validService, endpoint: 'example.com:8765' }), /must be a local host:port literal/);
assert.throws(() => validateEntry({ ...validService, endpoint: 'deadbeef:8765' }), /must be a local host:port literal/);
assert.throws(() => validateEntry({ ...validService, endpoint: '127.0.0.1' }), /must be a local host:port literal/);
assert.throws(() => validateEntry({ ...validService, local: '/opt/mail' }), /must not name a local file\/path/);
assert.throws(() => validateEntry({ ...validService, singleton: 'yes' }), /must declare singleton/);
assert.throws(() => validateEntry({ ...validService, health: 'health' }), /must declare a health path/);
for (const endpoint of ['127.0.0.1:8765', 'localhost:8765', '[::1]:8765']) assert.equal(validateEntry({ ...validService, endpoint }).endpoint, endpoint);
// A record may say which fields its own endpoint uses, admit that nobody can check, or
// name what it needs first. Each of those is a declaration the loader has to keep honest.
assert.deepEqual(validateEntry({ ...validService, identity: { id_field: 'service', revision_field: 'rev' } }).identity, { id_field: 'service', revision_field: 'rev' });
assert.deepEqual(IDENTITY_DEFAULTS, { id_field: 'id', revision_field: 'revision' });
assert.throws(() => validateEntry({ ...validService, identity: { name: 'service' } }), /identity may only name/);
assert.throws(() => validateEntry({ ...validService, identity: { id_field: 'not a field' } }), /must be a field name/);
assert.throws(() => validateEntry({ ...validService, identity: { id_field: 'id' }, asserted_identity: true }), /either checks its identity or asserts it/);
assert.equal(validateEntry({ ...validService, stop: 'sigkill' }).stop, 'sigkill');
assert.throws(() => validateEntry({ ...validService, stop: 'sigterm' }), /unknown stop kind/);
assert.throws(() => validateEntry({ ...validService, requires: [] }), /requires must be a non-empty array/);
assert.throws(() => validateEntry({ ...validService, requires: [{ bin: 'tmux', env: 'EE_TOKEN' }] }), /exactly one of/);
assert.throws(() => validateEntry({ ...validService, requires: [{ bin: 'tmux' }, { bin: 'tmux' }] }), /duplicate requirement/);
assert.throws(() => validateEntry({ ...validService, requires: ['tmux'] }), /a requirement must be an object/);
// Requirements resolve against the best evidence the caller has, and anything unmet
// downgrades the verdict: a component whose declared dependency is missing is not usable.
const checked = checkRequirements([{ bin: 'sh' }, { env: 'APG_TEST_PRESENT' }, { component: 'tool' }], { describe: (id) => (id === 'tool' ? 'available' : null), env: { APG_TEST_PRESENT: '1' } });
assert.deepEqual(checked.met, ['bin:sh', 'env:APG_TEST_PRESENT', 'component:tool']);
assert.deepEqual(checked.unmet, []);
assert.deepEqual(checkRequirements([{ env: 'APG_TEST_ABSENT' }], { env: {} }).unmet, [{ requirement: 'env:APG_TEST_ABSENT', reason: 'the environment variable is not set' }]);
assert.deepEqual(checkRequirements([{ component: 'nope' }], { describe: () => null }).unmet.map((item) => item.requirement), ['component:nope']);
assert.equal(applyRequirements({ id: 'tool', state: 'available', reusable: true }, checked).state, 'available', 'a met requirement must not change the verdict');
assert.equal(applyRequirements({ id: 'tool', state: 'available', reusable: true }, checkRequirements([{ bin: 'definitely-not-a-real-binary-xyz' }])).state, 'degraded', 'an unmet requirement makes an otherwise available entry degraded');
assert.equal(applyRequirements({ id: 'tool', state: 'available', reusable: true }, applyRequirements({ id: 'tool', state: 'available', reusable: true }, { unmet: [] })).state, 'available');
const service = validateEntry(validService);
assert.ok(!/"(?:file|path|local)"\s*:/.test(JSON.stringify(service)), 'a service record must name no location');

// 6. The shipped schema and the code agree. A schema that documents fields the manifest
// never writes - or omits fields it does - would be a declaration nothing enforces.
const schema = JSON.parse(fs.readFileSync(path.join(packageRoot, 'schemas', 'component-entry.schema.json'), 'utf8'));
assert.deepEqual(schema.$defs.package.required.slice().sort(), Object.keys(manifest).filter((key) => key !== 'provenance').sort(), 'the package schema does not match what the manifest writes');
assert.deepEqual(schema.$defs.service.required.slice().sort(), Object.keys(service).filter((key) => key !== 'revision').sort(), 'the service schema does not match what an entry carries');
assert.equal(schema.$defs.service.properties.delivery.const, 'staged');
assert.equal(schema.$defs.package.properties.kind.const, 'package');
assert.ok(schema.$defs.service.properties.endpoint.pattern.includes('localhost'), 'the schema must pin the no-resolution rule too');
for (const key of ['identity', 'asserted_identity', 'stop', 'requires']) assert.ok(key in schema.$defs.service.properties, `the service schema must declare ${key}, because the loader accepts it`);
assert.ok('requires' in schema.$defs.package.properties, 'the package schema must declare requires');
assert.deepEqual(schema.$defs.requirement.oneOf.map((variant) => variant.required[0]).sort(), [...REQUIREMENT_KINDS].sort(), 'the shipped requirement kinds and the loader must be the same set');
assert.deepEqual(schema.$defs.service.properties.stop.enum.slice().sort(), [...STOP_KINDS].sort());
assert.deepEqual(Object.keys(schema.$defs.service.properties.identity.properties).sort(), [...IDENTITY_FIELDS].sort());

// 7. Walking a real store finds both kinds, and a malformed service entry is refused
// rather than skipped.
fs.mkdirSync(path.join(root, SERVICE_DIR), { recursive: true });
fs.writeFileSync(path.join(root, SERVICE_DIR, 'mail-0.1.0.json'), canonicalJson(service));
const records = readStoreEntryRecords(root);
assert.ok(records.packages.some((item) => item.id === 'tool'), 'the store walk must find the package');
assert.ok(records.services.some((item) => item.id === 'mail'), 'the store walk must find the service');
fs.writeFileSync(path.join(root, SERVICE_DIR, 'broken.json'), '{ not json');
assert.throws(() => readStoreEntryRecords(root), /service entry is invalid/);
fs.rmSync(path.join(root, SERVICE_DIR, 'broken.json'));

// 8. The builder materialises staged bytes and refuses to disagree with the record. This
// is the end-to-end assertion: a synthetic acquisition record, real bytes on disk, and
// one artifact whose recorded digest is wrong.
const staged = path.join(temporary, 'staged');
fs.mkdirSync(staged, { recursive: true });
const good = Buffer.from('archive payload\n');
fs.writeFileSync(path.join(staged, 'good.tar.gz'), good);
fs.writeFileSync(path.join(staged, 'bad.tar.gz'), Buffer.from('other payload\n'));
const record = {
  schema_version: 1,
  released_artifacts: [
    { id: 'good', repo: 'https://github.com/example/good.git', tag: 'v1.0.0', version_reported: 'good-1.0.0', asset: { id: '1', name: 'good.tar.gz', bytes: good.length, sha256: sha256(good) }, requires: [{ bin: 'definitely-not-a-real-binary-xyz' }] },
    { id: 'bad', repo: 'https://github.com/example/bad.git', tag: 'v1.0.0', version_reported: 'bad-1.0.0', asset: { id: '2', name: 'bad.tar.gz', bytes: 13, sha256: 'd'.repeat(64) } },
  ],
};
const recordPath = path.join(temporary, 'record.json');
fs.writeFileSync(recordPath, canonicalJson(record));
const build = (extra = []) => spawnSync(process.execPath, [path.join(packageRoot, 'scripts', 'build-component-store.mjs'), '--record', recordPath, '--source', staged, '--store', root, ...extra], { encoding: 'utf8' });
const dry = build(['--dry-run']);
assert.equal(dry.status, 1, 'a record that disagrees with the bytes on disk must fail');
const dryResult = JSON.parse(dry.stdout);
assert.deepEqual(dryResult.record_mismatch, ['bad']);
const planned = dryResult.entries.find((item) => item.id === 'good');
assert.equal(planned.state, 'planned');
assert.equal(fs.existsSync(entryDir(root, 'good', planned.digest)), false, 'a dry run must write nothing');
const first = JSON.parse(build().stdout);
assert.equal(first.entries.find((item) => item.id === 'good').state, 'materialised');
assert.ok(['link', 'copy'].includes(first.entries.find((item) => item.id === 'good').mode), 'the builder must report how it materialised the bytes');
const again = JSON.parse(build().stdout);
assert.equal(again.entries.find((item) => item.id === 'good').state, 'present', 'a second run must be idempotent');
assert.equal(resolvePackage(validateEntry({ kind: 'package', id: 'good', digest: planned.digest }), root).state, 'available', 'the materialised entry must verify');
const builtManifest = JSON.parse(fs.readFileSync(path.join(entryDir(root, 'good', planned.digest), 'component-manifest.json'), 'utf8'));
assert.deepEqual(builtManifest.requires, [{ bin: 'definitely-not-a-real-binary-xyz' }], 'a declared requirement must travel from the acquisition record into the manifest, and therefore into the digest');

// 9. The shipped CLI surface reaches the store, read-only, and reports what it found.
const cli = spawnSync(process.execPath, [path.join(packageRoot, 'scripts', 'apg.mjs'), 'components', 'verify', '--store', root], { encoding: 'utf8' });
assert.equal(cli.status, 0, `apg components verify failed: ${cli.stderr}`);
const verified = JSON.parse(cli.stdout);
assert.equal(verified.present, true);
assert.ok(verified.reusable_packages.includes('tool'), 'the CLI must report the verified package as reusable');
assert.deepEqual(verified.missing_packages, []);
assert.deepEqual(verified.degraded_packages, ['good'], 'a package whose declared executable is absent must be reported degraded rather than reusable');
assert.ok(verified.packages_total >= 2, 'the package count must cover every digest directory in the store, not only the reusable ones');
assert.ok(!('reusable' in verified), 'the package command must not publish a bare `reusable` key: the service command used to publish one over a different domain, and reading `reusable: []` from the wrong command is how "nine packages available" gets read as "nothing is reusable"');
assert.ok(verified.services.some((item) => item.id === 'mail'), 'the CLI must list the declared service');
const missingStore = spawnSync(process.execPath, [path.join(packageRoot, 'scripts', 'apg.mjs'), 'components', 'verify', '--store', path.join(temporary, 'nowhere')], { encoding: 'utf8' });
assert.equal(missingStore.status, 0, 'an absent store is not an error');
assert.equal(JSON.parse(missingStore.stdout).present, false);
const probeCli = spawnSync(process.execPath, [path.join(packageRoot, 'scripts', 'apg.mjs'), 'components', 'probe', '--store', root], { encoding: 'utf8' });
assert.equal(probeCli.status, 0, `apg components probe failed: ${probeCli.stderr}`);
const probed = JSON.parse(probeCli.stdout);
assert.ok(probed.services.some((item) => item.id === 'mail'), 'the probe must report the declared service');
assert.deepEqual(probed.reusable_services, [], 'a service whose port is dead must not be reported reusable');
assert.ok(!('reusable' in probed) && !('action' in probed), 'the probe must name its own domain and must not publish a constant action');

// 9b. Two digests under one id are a conflict, not a choice. A changed manifest moves the
// digest and leaves the old directory behind; before this check the stale copy made the id
// look reusable and the summary listed it twice. The builder names the directory to remove
// and never removes it itself.
const staleDir = path.join(root, 'good', `sha256-${'e'.repeat(64)}`);
fs.mkdirSync(staleDir, { recursive: true });
fs.writeFileSync(path.join(staleDir, 'component-manifest.json'), canonicalJson(packageManifest({ id: 'good', version: 'good-0.0.9', files: [{ path: 'good.tar.gz', content: good }] })), { mode: 0o444 });
const staleRun = JSON.parse(build().stdout);
assert.deepEqual(staleRun.stale.map((item) => item.id), ['good'], 'the builder must name a digest directory the acquisition record no longer declares');
assert.equal(staleRun.stale[0].dir, staleDir, 'the builder must name the exact directory rather than describe it, so nothing has to be guessed before deleting');
assert.equal(fs.existsSync(staleDir), true, 'the builder must report stale bytes, never delete them');
const duplicated = JSON.parse(spawnSync(process.execPath, [path.join(packageRoot, 'scripts', 'apg.mjs'), 'components', 'verify', '--store', root], { encoding: 'utf8' }).stdout);
assert.deepEqual(duplicated.conflicted_packages, ['good'], 'two digests under one id must be reported as a conflict');
assert.ok(!duplicated.reusable_packages.includes('good'), 'a stale copy must not make an id reusable');
assert.equal(duplicated.packages.find((item) => item.id === 'good').digests.length, 2, 'the conflict must name both digests');
assert.ok(!duplicated.degraded_packages.includes('good'), 'a conflicted id is not reported as merely degraded: the ambiguity is the finding');
fs.rmSync(staleDir, { recursive: true, force: true });
const cleaned = JSON.parse(spawnSync(process.execPath, [path.join(packageRoot, 'scripts', 'apg.mjs'), 'components', 'verify', '--store', root], { encoding: 'utf8' }).stdout);
assert.deepEqual(cleaned.conflicted_packages, [], 'removing the stale directory must clear the conflict');
assert.deepEqual(cleaned.degraded_packages, ['good'], 'the surviving entry keeps its own verdict');

// 10. The four discovery states, against real servers on loopback. "The port answers" is
// not evidence, so a foreign identity is a conflict and a revision mismatch is degraded
// - never a silent reuse.
const mail = await startServer({ id: 'mail', revision: '0.1.0' });
const foreign = await startServer({ id: 'somethingelse', revision: '9.9.9' });
const anonymous = await startServer({ status: 'ready', version: '0.1.0' });
const aliased = await startServer({ service: 'mail', rev: '0.1.0' });
const live = { ...service, endpoint: `127.0.0.1:${mail.port}` };
assert.deepEqual(await probeService(live), { id: 'mail', state: 'available', reusable: true });
assert.equal((await probeService({ ...live, revision: '0.2.0' })).state, 'degraded', 'a revision mismatch must not be reused silently');
assert.equal((await probeService({ ...live, revision: undefined })).state, 'degraded', 'an unpinned revision cannot be verified');
assert.equal((await probeService({ ...service, endpoint: `127.0.0.1:${foreign.port}` })).state, 'conflict', 'a foreign identity on the declared port is a conflict');
const anonymousVerdict = await probeService({ ...service, endpoint: `127.0.0.1:${anonymous.port}` });
assert.equal(anonymousVerdict.state, 'conflict', 'liveness is not identity: a 200 that names no component is a conflict, not a reuse');
assert.match(anonymousVerdict.reason, /no component identity/, 'the refusal must name what was missing rather than reporting the owner as undefined');
assert.equal((await probeService({ ...service, endpoint: `127.0.0.1:${aliased.port}` })).state, 'conflict', 'a differently named identity is still a conflict until the record declares the mapping');
assert.deepEqual(await probeService({ ...service, endpoint: `127.0.0.1:${aliased.port}`, identity: { id_field: 'service', revision_field: 'rev' } }), { id: 'mail', state: 'available', reusable: true }, 'a declared identity mapping is what lets a real service be verified instead of guessed at');
assert.equal((await probeService({ ...service, endpoint: `127.0.0.1:${aliased.port}`, identity: { revision_field: 'rev' } })).state, 'conflict', 'the id field still defaults to id when only the revision field is declared');
assert.equal((await probeService({ ...live, asserted_identity: true })).state, 'degraded', 'an asserted identity may be reachable but can never be available');
assert.equal((await probeService({ ...service, endpoint: `127.0.0.1:${aliased.port}`, identity: { revision_field: 'rev' } })).state, 'conflict');
const closing = await startServer({ id: 'closed', revision: '0.1.0' });
const closedPort = closing.port;
await closing.close();
assert.deepEqual(await probeService({ ...service, endpoint: `127.0.0.1:${closedPort}` }), { id: 'mail', state: 'not-installed', reusable: false, action: 'none' });
assert.deepEqual(await resolveService(service, [{ state: 'available', reusable: true }]), { id: 'mail', state: 'available', reusable: true, instances: 1 });
assert.equal((await resolveService(service, [{ state: 'available', reusable: true }, { state: 'available', reusable: true }])).state, 'conflict', 'two live instances of a singleton must be a conflict');
assert.deepEqual(await resolveService(service, [{ state: 'not-installed', reusable: false }]), { id: 'mail', state: 'not-installed', reusable: false, action: 'none' });

// 11. Discovery is read-only. The servers above recorded every request they received; a
// probe that restarted, posted, or warmed the service would show up here.
assert.ok(mail.requests.length >= 2, 'the probe must actually have reached the service');
for (const request of [...mail.requests, ...foreign.requests, ...anonymous.requests, ...aliased.requests]) {
  assert.equal(request.method, 'GET', `discovery must not issue a state-changing request: ${request.method} ${request.url}`);
  assert.equal(request.url, '/health', `discovery must only touch the declared health path: ${request.url}`);
}
await mail.close();
await foreign.close();
await anonymous.close();
await aliased.close();

console.log('PASS: the component store is a sibling of the release store under the existing variable, holds one verified copy per machine, rejects an inexact file set, matches its shipped schema, never fetches, never names a location, resolves all four discovery states from real loopback probes without a state-changing request, refuses liveness that names no component, lets a service declare which fields carry its identity and refuses to trust an asserted one, downgrades an entry whose declared prerequisite is missing, refuses to resolve an id the store holds twice and names the stale directory instead of deleting it, names packages and services apart so the two outputs cannot be read for each other, and refuses to disagree with the acquisition record');

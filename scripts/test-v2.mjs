#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'scripts', 'apg.mjs');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'apg-v2-test-'));
process.on('exit', () => fs.rmSync(temporary, { recursive: true, force: true }));

function run(args, { home, cwd = root, expect = 0, extraEnv = {} } = {}) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...extraEnv, AGENT_PROJECT_GUIDES_HOME: home || path.join(temporary, 'home') },
  });
  assert.equal(result.status, expect, `command failed: apg ${args.join(' ')}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);
  const text = expect === 0 ? result.stdout : result.stderr;
  return text.trim() ? JSON.parse(text) : undefined;
}

function project(name) {
  const directory = path.join(temporary, name);
  fs.mkdirSync(directory, { recursive: true });
  const initialized = spawnSync('git', ['init', '-q', directory], { encoding: 'utf8' });
  assert.equal(initialized.status, 0, initialized.stderr);
  return directory;
}

function gitOutput(directory, args) {
  const result = spawnSync('git', ['-C', directory, ...args], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

function runInstalled(command, args, cwd, home) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', env: { ...process.env, AGENT_PROJECT_GUIDES_HOME: home } });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

function runAsync(args, home) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cli, ...args], { cwd: root, env: { ...process.env, AGENT_PROJECT_GUIDES_HOME: home } });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value)}\n`);
}

function copyTree(source, destination) {
  fs.cpSync(source, destination, { recursive: true, dereference: false });
}

// Catalog generation is deterministic and current.
const catalogCheck = run(['catalog', 'check']);
assert.equal(catalogCheck.valid, true);
const firstCatalog = fs.readFileSync(path.join(root, 'catalog', 'catalog.jsonl'));
run(['catalog', 'build']);
assert.deepEqual(fs.readFileSync(path.join(root, 'catalog', 'catalog.jsonl')), firstCatalog);

// Thin bootstrap initializes without staging, resolves exactly, loads exact hashes, and uninstalls byte-for-byte.
const thin = project('thin');
const originalRoot = Buffer.from('# Project rules\r\n\r\nKeep this suffix without a final newline.');
fs.writeFileSync(path.join(thin, 'AGENTS.md'), originalRoot);
const thinHome = path.join(temporary, 'thin-home');
const initialized = run([
  'project', 'init', '--target', thin, '--project-id', 'test.thin', '--mode', 'thin-bootstrap', '--source', root,
  '--facets', 'cli', '--overlays', 'agent-governance',
], { home: thinHome });
assert.equal(initialized.status, 'initialized');
assert.equal(initialized.staged, false);
assert.equal(gitOutput(thin, ['diff', '--cached', '--name-only']), '');
assert.doesNotMatch(gitOutput(thin, ['status', '--porcelain=v1', '--untracked-files=all']), /\.agent-project-guides\/local/);
assert.match(initialized.provider.digest, /^sha256:[0-9a-f]{64}$/);
let status = run(['project', 'validate', '--target', thin], { home: thinHome });
assert.equal(status.valid, true);
assert.equal(status.provider.immutable, true);
const validThinDescriptor = JSON.parse(fs.readFileSync(path.join(thin, '.agent-project-guides.json'), 'utf8'));
const invalidDescriptors = [
  { ...structuredClone(validThinDescriptor), project_id: 'test.invalid-null', overlays: null },
  { ...structuredClone(validThinDescriptor), project_id: 'test.invalid-absolute', layout: { scratch: ['/tmp/outside'], memory: 'docs/memory' } },
  { ...structuredClone(validThinDescriptor), project_id: 'test.invalid-escape', layout: { scratch: ['.agent-scratch'], memory: '../outside' } },
  { ...structuredClone(validThinDescriptor), project_id: 'test.invalid-backslash', layout: { scratch: ['dir\\outside'], memory: 'docs/memory' } },
  { ...structuredClone(validThinDescriptor), project_id: 'test.invalid-drive', layout: { scratch: ['C:/outside'], memory: 'docs/memory' } },
  { ...structuredClone(validThinDescriptor), project_id: 'test.invalid-dot', layout: { scratch: ['./scratch'], memory: 'docs/memory' } },
  { ...structuredClone(validThinDescriptor), project_id: 'test.invalid-trailing', layout: { scratch: ['scratch/'], memory: 'docs/memory' } },
];
for (const [index, invalidDescriptor] of invalidDescriptors.entries()) {
  const invalidProject = project(`invalid-descriptor-${index}`);
  writeJson(path.join(invalidProject, '.agent-project-guides.json'), invalidDescriptor);
  fs.copyFileSync(path.join(thin, 'AGENTS.md'), path.join(invalidProject, 'AGENTS.md'));
  assert.ok(['invalid_descriptor', 'invalid_path'].includes(run(['project', 'validate', '--target', invalidProject], { home: thinHome, expect: 2 }).error));
}
const resolution = run([
  'provider', 'resolve', '--target', thin, '--plane', 'development', '--role', 'developer', '--mode', 'feature', '--task', 'add cli flag',
], { home: thinHome });
assert.deepEqual(resolution.exact, [
  'role:development/developer#feature-任务卡',
  'role:development/developer#最小上下文',
  'role:development/developer#实现和验证',
  'role:development/developer#文档触发',
  'role:development/developer#完成',
  'role:development/developer#禁止',
  'profile:cli#3-evidence-map',
  'profile:cli#4-cli-contract',
  'profile:cli#5-verification-preset',
  'overlay:agent-governance',
]);
assert.ok(resolution.exact_token_estimate <= 1_100);
assert.equal(resolution.token_estimate_method, 'utf8-bytes/4-ceiling');
assert.ok(!resolution.exact.includes('role:development/developer'));
assert.ok(!resolution.exact.includes('profile:cli'));
const search = run(['provider', 'search', '--target', thin, '--query', 'Author Check', '--limit', '3'], { home: thinHome });
assert.ok(search.results.length > 0);
assert.equal(new Set(search.results.map((entry) => entry.path)).size, search.results.length);
const batchLoaded = run(['provider', 'load', '--target', thin, '--ids', resolution.exact.join(',')], { home: thinHome });
assert.deepEqual(batchLoaded.sources.map(([id]) => id), resolution.exact);
assert.equal(batchLoaded.exact_token_estimate, resolution.exact_token_estimate);
assert.ok(batchLoaded.sources.every((pair) => pair.length === 2 && typeof pair[1] === 'string'));
const oneBatchLoaded = run(['provider', 'load', '--target', thin, '--ids', resolution.exact[0]], { home: thinHome });
assert.equal(oneBatchLoaded.sources.length, 1);
assert.equal(oneBatchLoaded.sources[0][0], resolution.exact[0]);
const loaded = run(['provider', 'load', '--target', thin, '--id', resolution.exact[0]], { home: thinHome });
assert.match(loaded.content, /Feature 任务卡/);
const loadedAgain = run(['provider', 'load', '--target', thin, '--id', resolution.exact[0], '--hash', loaded.hash], { home: thinHome });
assert.equal(loadedAgain.hash, loaded.hash);
const section = run(['provider', 'load', '--target', thin, '--id', 'profile:cli#5-verification-preset'], { home: thinHome });
assert.match(section.content, /^## 5\. Verification preset/m);
assert.doesNotMatch(section.content, /^## 6\./m);
assert.equal(section.section, '5. Verification preset');
run(['provider', 'load', '--target', thin, '--id', resolution.exact[0], '--hash', `sha256:${'0'.repeat(64)}`], { home: thinHome, expect: 2 });

const capabilities = run(['provider', 'capabilities', '--target', thin], { home: thinHome });
assert.ok(capabilities.capabilities.includes('section-routes-v1'));
assert.ok(capabilities.capabilities.includes('batch-load-v1'));
assert.equal(run([
  'provider', 'load', '--target', thin, '--ids', `${resolution.exact[0]},${resolution.exact[0]}`,
], { home: thinHome, expect: 2 }).error, 'invalid_arguments');
assert.equal(run(['provider', 'resolve', '--target', thin, '--mode', 'feature'], { home: thinHome, expect: 2 }).error, 'route_conflict');
assert.equal(run(['provider', 'resolve', '--target', thin, '--role', 'developer'], { home: thinHome, expect: 2 }).error, 'route_conflict');
const initializedRoute = run([
  'provider', 'resolve', '--target', thin, '--plane', 'development', '--role', 'developer', '--mode', 'initialize',
], { home: thinHome });
assert.deepEqual(initializedRoute.exact, ['procedure:package-adaptation', 'profile:cli', 'overlay:agent-governance']);
function assertBatchMatches(route) {
  const batch = run(['provider', 'load', '--target', thin, '--ids', route.exact.join(',')], { home: thinHome });
  assert.deepEqual(batch.sources.map(([id]) => id), route.exact);
  assert.equal(batch.exact_token_estimate, route.exact_token_estimate);
}
assertBatchMatches(initializedRoute);
const readaptRoute = run([
  'provider', 'resolve', '--target', thin, '--plane', 'development', '--role', 'maintainer', '--mode', 'readapt',
], { home: thinHome });
assert.deepEqual(readaptRoute.exact, [
  'role:development/maintainer#1-角色边界', 'procedure:package-adaptation', 'profile:cli', 'overlay:agent-governance',
]);
assertBatchMatches(readaptRoute);
const productionRoute = run([
  'provider', 'resolve', '--target', thin, '--plane', 'production', '--role', 'user', '--mode', 'cli',
], { home: thinHome });
assert.deepEqual(productionRoute.exact, [
  'role:production/user#2-读取入口',
  'role:production/user#3-权限和数据',
  'role:production/user#4-角色转换',
]);
assert.ok(productionRoute.exact_token_estimate <= 330);
assertBatchMatches(productionRoute);
const operatorRoute = run([
  'provider', 'resolve', '--target', thin, '--plane', 'production', '--role', 'operator', '--mode', 'observe-health',
], { home: thinHome });
assert.ok(operatorRoute.exact.every((id) => id.startsWith('role:production/operator#')));
assert.ok(operatorRoute.exact_token_estimate <= 460);
assertBatchMatches(operatorRoute);

const routineRisk = run(['risk', 'classify', '--target', thin], { home: thinHome });
assert.equal(routineRisk.tier, 'R1');
const materialRisk = run(['risk', 'classify', '--target', thin, '--operation', 'public-compatibility'], { home: thinHome });
assert.equal(materialRisk.tier, 'R2');
assert.ok(materialRisk.required_checks.includes('verifier-dynamic-verdict'));
const destructiveRisk = run(['risk', 'classify', '--target', thin, '--runtime', 'destructive'], { home: thinHome });
assert.equal(destructiveRisk.tier, 'R3');

const dsh = run(['dsh', 'report', '--target', thin, '--plane', 'development', '--role', 'developer', '--mode', 'feature'], { home: thinHome });
assert.equal(dsh.adapter, 'dsh');
assert.equal(dsh.resolution.exact_token_estimate, resolution.exact_token_estimate);
assert.ok(dsh.sources.filter((source) => source.id.startsWith('role:')).every((source) => source.activation === 'role route'));
assert.ok(dsh.sources.every((source) => source.intended && source.host_observed === false && source.model_effective === 'unknown'));
const mismatchedEvidence = path.join(temporary, 'dsh-mismatch.json');
writeJson(mismatchedEvidence, { sources: [{ id: dsh.sources[0].id, apg_sha256: `sha256:${'0'.repeat(64)}`, digest: 'sha1:host-observation' }] });
const mismatchedDsh = run(['dsh', 'report', '--target', thin, '--plane', 'development', '--role', 'developer', '--mode', 'feature', '--host-evidence', mismatchedEvidence], { home: thinHome });
assert.equal(mismatchedDsh.sources[0].host_observed, false);
assert.match(mismatchedDsh.sources[0].conflict, /does not match/);
const matchedEvidence = path.join(temporary, 'dsh-match.json');
writeJson(matchedEvidence, { sources: [{ id: dsh.sources[0].id, path: dsh.sources[0].path, apg_sha256: dsh.sources[0].sha256, digest: 'sha1:host-observation' }] });
const matchedDsh = run(['dsh', 'report', '--target', thin, '--plane', 'development', '--role', 'developer', '--mode', 'feature', '--host-evidence', matchedEvidence], { home: thinHome });
assert.equal(matchedDsh.sources[0].host_observed, true);
assert.equal(matchedDsh.sources[0].host_content_match, true);
const unmatchedSibling = matchedDsh.sources.find((source) => source.path === matchedDsh.sources[0].path && source.id !== matchedDsh.sources[0].id);
assert.equal(unmatchedSibling.host_observed, false);
assert.equal(unmatchedSibling.conflict, null);
const staleMemoryInput = path.join(temporary, 'stale-memory.json');
writeJson(staleMemoryInput, {
  id: 'stale.lesson', kind: 'knowledge', scope: 'repo', summary: 'This review must remain revision-bound.',
  evidence: ['test:stale'], owner: 'author-a', confidence: 'medium', applicability: 'test fixture',
  revalidation_trigger: 'descriptor changes',
});
run(['memory', 'propose', '--target', thin, '--input', staleMemoryInput], { home: thinHome });

const exported = run(['provider', 'export', '--target', thin], { home: thinHome });
const snapshot = path.join(temporary, 'portable.json');
writeJson(snapshot, exported.portable);
const imported = run(['provider', 'import', '--target', thin, '--input', snapshot, '--expected-project-digest', exported.revision], { home: thinHome });
assert.equal(imported.dry_run, true);
assert.deepEqual(imported.losses, []);
assert.deepEqual(imported.diff, []);
const mismatchedSnapshot = path.join(temporary, 'portable-provider-mismatch.json');
const mismatchedPortable = structuredClone(exported.portable);
mismatchedPortable.provider.digest = `sha256:${'f'.repeat(64)}`;
writeJson(mismatchedSnapshot, mismatchedPortable);
assert.deepEqual(run(['provider', 'import', '--target', thin, '--input', mismatchedSnapshot, '--expected-project-digest', exported.revision], { home: thinHome }).losses.map((loss) => loss.field), ['provider']);
const descriptorBeforeLoss = fs.readFileSync(path.join(thin, '.agent-project-guides.json'));
assert.equal(run(['provider', 'import', '--target', thin, '--input', mismatchedSnapshot, '--expected-project-digest', exported.revision, '--apply'], { home: thinHome, expect: 2 }).error, 'portable_loss');
assert.deepEqual(fs.readFileSync(path.join(thin, '.agent-project-guides.json')), descriptorBeforeLoss);
exported.portable.protected_effects = ['public-compatibility'];
writeJson(snapshot, exported.portable);
const importPreview = run(['provider', 'import', '--target', thin, '--input', snapshot, '--expected-project-digest', exported.revision], { home: thinHome });
assert.equal(importPreview.diff.length, 1);
const thinStateRoot = path.join(thinHome, 'state', 'projects', 'test.thin');
const thinCloneState = path.join(thinStateRoot, fs.readdirSync(thinStateRoot)[0]);
const thinReceipt = path.join(thinCloneState, 'project-receipt.json');
const thinReceiptBackup = `${thinReceipt}.bak`;
fs.renameSync(thinReceipt, thinReceiptBackup);
const descriptorBeforeFailedImport = fs.readFileSync(path.join(thin, '.agent-project-guides.json'));
assert.equal(run(['provider', 'import', '--target', thin, '--input', snapshot, '--expected-project-digest', exported.revision, '--apply'], { home: thinHome, expect: 2 }).error, 'receipt_missing');
assert.deepEqual(fs.readFileSync(path.join(thin, '.agent-project-guides.json')), descriptorBeforeFailedImport);
fs.renameSync(thinReceiptBackup, thinReceipt);
const mutationLock = path.join(thinCloneState, 'project-mutation.lock');
writeJson(mutationLock, { schema_version: 1, pid: process.pid, host: os.hostname() });
assert.equal(run(['provider', 'import', '--target', thin, '--input', snapshot, '--expected-project-digest', exported.revision, '--apply'], { home: thinHome, expect: 2 }).error, 'mutation_conflict');
assert.deepEqual(fs.readFileSync(path.join(thin, '.agent-project-guides.json')), descriptorBeforeFailedImport);
fs.rmSync(mutationLock);
fs.chmodSync(path.join(thin, '.agent-project-guides.json'), 0o600);
assert.equal(run(['provider', 'import', '--target', thin, '--input', snapshot, '--expected-project-digest', exported.revision, '--apply'], {
  home: thinHome,
  expect: 2,
  extraEnv: { APG_TEST_FAILPOINT: 'after-import-descriptor' },
}).error, 'test_crash');
assert.ok(fs.existsSync(path.join(thinCloneState, 'descriptor-transaction.json')));
status = run(['project', 'validate', '--target', thin], { home: thinHome });
assert.equal(fs.existsSync(path.join(thinCloneState, 'descriptor-transaction.json')), false);
assert.equal(fs.statSync(path.join(thin, '.agent-project-guides.json')).mode & 0o777, 0o600);
assert.notEqual(status.project_digest, exported.revision);
assert.equal(run(['memory', 'review', '--target', thin, '--id', 'stale.lesson', '--reviewer', 'reviewer-b', '--decision', 'accept', '--rationale', 'must fail after descriptor change'], { home: thinHome, expect: 2 }).error, 'cas_conflict');

// Reviewed memory remains local until explicit promotion, then writes only the declared project path.
const memoryInput = path.join(temporary, 'memory.json');
writeJson(memoryInput, {
  id: 'route.lesson', kind: 'knowledge', scope: 'repo', summary: 'Exact routes avoid ambiguous authority.',
  evidence: ['test:v2-route'], owner: 'author-a', confidence: 'high', applicability: 'APG v2',
  revalidation_trigger: 'routing schema changes',
});
run(['memory', 'propose', '--target', thin, '--input', memoryInput], { home: thinHome });
run(['memory', 'review', '--target', thin, '--id', 'route.lesson', '--reviewer', 'reviewer-b', '--decision', 'accept', '--rationale', 'fixture verified'], { home: thinHome });
const promoted = run([
  'memory', 'promote', '--target', thin, '--id', 'route.lesson', '--expected-project-digest', status.project_digest,
], { home: thinHome });
assert.equal(promoted.staged, false);
assert.ok(fs.existsSync(path.join(thin, 'docs', 'memory', 'route.lesson.json')));
assert.equal(gitOutput(thin, ['diff', '--cached', '--name-only']), '');
assert.doesNotMatch(gitOutput(thin, ['status', '--porcelain=v1', '--untracked-files=all']), /\.agent-project-guides\/local/);
const linkRaceInput = path.join(temporary, 'link-race-memory.json');
writeJson(linkRaceInput, {
  id: 'link-race.lesson', kind: 'knowledge', scope: 'repo', summary: 'No-replace publication must preserve a racing target.',
  evidence: ['test:link-race'], owner: 'author-a', confidence: 'high', applicability: 'test fixture', revalidation_trigger: 'publication changes',
});
run(['memory', 'propose', '--target', thin, '--input', linkRaceInput], { home: thinHome });
run(['memory', 'review', '--target', thin, '--id', 'link-race.lesson', '--reviewer', 'reviewer-b', '--decision', 'accept', '--rationale', 'fixture verified'], { home: thinHome });
assert.equal(run(['memory', 'promote', '--target', thin, '--id', 'link-race.lesson', '--expected-project-digest', status.project_digest], {
  home: thinHome,
  expect: 2,
  extraEnv: { APG_TEST_FAILPOINT: 'create-memory-target-before-link' },
}).error, 'cas_conflict');
const linkRaceTarget = path.join(thin, 'docs', 'memory', 'link-race.lesson.json');
assert.equal(fs.readFileSync(linkRaceTarget, 'utf8'), 'external concurrent content\n');
fs.rmSync(linkRaceTarget);
assert.equal(run(['memory', 'promote', '--target', thin, '--id', 'link-race.lesson', '--expected-project-digest', status.project_digest], { home: thinHome }).state, 'promoted');
const raceInput = path.join(temporary, 'race-memory.json');
writeJson(raceInput, {
  id: 'race.lesson', kind: 'knowledge', scope: 'repo', summary: 'Exclusive proposal creation.', evidence: ['test:race'],
  owner: 'author-a', confidence: 'high', applicability: 'test fixture', revalidation_trigger: 'storage changes',
});
const racers = await Promise.all([
  runAsync(['memory', 'propose', '--target', thin, '--input', raceInput], thinHome),
  runAsync(['memory', 'propose', '--target', thin, '--input', raceInput], thinHome),
]);
assert.deepEqual(racers.map((result) => result.status).sort(), [0, 2]);
const forgedSupersession = path.join(temporary, 'forged-supersession.json');
writeJson(forgedSupersession, {
  id: 'forged.lesson', kind: 'knowledge', scope: 'repo', summary: 'Must use dedicated supersession.', evidence: ['test:forged'],
  owner: 'author-a', confidence: 'low', applicability: 'test fixture', revalidation_trigger: 'always', supersedes: 'route.lesson',
});
assert.equal(run(['memory', 'propose', '--target', thin, '--input', forgedSupersession], { home: thinHome, expect: 2 }).error, 'invalid_memory');
const replacementInput = path.join(temporary, 'replacement-memory.json');
writeJson(replacementInput, {
  id: 'route.lesson.v2', kind: 'knowledge', scope: 'repo', summary: 'Reviewed replacement route lesson.', evidence: ['test:replacement'],
  owner: 'author-c', confidence: 'high', applicability: 'APG v2', revalidation_trigger: 'routing changes',
});
const routeTarget = path.join(thin, 'docs', 'memory', 'route.lesson.json');
const routeTargetBefore = fs.readFileSync(routeTarget);
const stalePromoted = JSON.parse(routeTargetBefore);
stalePromoted.project_digest = `sha256:${'0'.repeat(64)}`;
writeJson(routeTarget, stalePromoted);
assert.equal(run(['memory', 'supersede', '--target', thin, '--input', replacementInput, '--replaces', 'route.lesson'], { home: thinHome, expect: 2 }).error, 'invalid_memory');
fs.writeFileSync(routeTarget, routeTargetBefore);
const whitespacePromoted = JSON.parse(routeTargetBefore);
whitespacePromoted.review.reviewer = ' ';
whitespacePromoted.review.rationale = ' ';
writeJson(routeTarget, whitespacePromoted);
assert.equal(run(['memory', 'supersede', '--target', thin, '--input', replacementInput, '--replaces', 'route.lesson'], { home: thinHome, expect: 2 }).error, 'invalid_memory');
fs.writeFileSync(routeTarget, routeTargetBefore);
const truncatedTarget = path.join(thin, 'docs', 'memory', 'truncated.lesson.json');
writeJson(truncatedTarget, { schema_version: 1, state: 'promoted', project_id: 'test.thin', project_digest: status.project_digest, record: { id: 'truncated.lesson' } });
assert.equal(run(['memory', 'supersede', '--target', thin, '--input', replacementInput, '--replaces', 'truncated.lesson'], { home: thinHome, expect: 2 }).error, 'invalid_memory');
assert.equal(run(['memory', 'supersede', '--target', thin, '--input', replacementInput, '--replaces', 'route.lesson'], { home: thinHome }).state, 'proposed');

const uninstalled = run(['project', 'uninstall', '--target', thin], { home: thinHome });
assert.equal(uninstalled.status, 'uninstalled');
assert.deepEqual(fs.readFileSync(path.join(thin, 'AGENTS.md')), originalRoot);
assert.equal(fs.existsSync(path.join(thin, '.agent-project-guides.json')), false);

// Fresh embedded init/uninstall owns its release and exclude bytes; failed init cleans every owned effect.
const embedded = project('embedded');
const embeddedRoot = Buffer.from('# Embedded project\n');
const embeddedExclude = Buffer.from('# Existing excludes without final newline');
fs.writeFileSync(path.join(embedded, 'AGENTS.md'), embeddedRoot);
fs.chmodSync(path.join(embedded, 'AGENTS.md'), 0o600);
fs.mkdirSync(path.join(embedded, '.git', 'info'), { recursive: true });
fs.writeFileSync(path.join(embedded, '.git', 'info', 'exclude'), embeddedExclude);
const embeddedHome = path.join(temporary, 'embedded-home');
const embeddedInit = run(['project', 'init', '--target', embedded, '--project-id', 'test.embedded', '--mode', 'embedded-local', '--source', root, '--facets', 'cli'], { home: embeddedHome });
assert.equal(embeddedInit.provider.mode, 'embedded-local');
assert.match(fs.readFileSync(path.join(embedded, '.git', 'info', 'exclude'), 'utf8'), /\.agent-project-guides\/local/);
assert.ok(fs.existsSync(path.join(embedded, '.agent-project-guides', 'local', 'releases')));
assert.equal(gitOutput(embedded, ['diff', '--cached', '--name-only']), '');
assert.doesNotMatch(gitOutput(embedded, ['status', '--porcelain=v1', '--untracked-files=all']), /\.agent-project-guides\/local/);
const embeddedValidated = runInstalled(embeddedInit.launcher.command, ['project', 'validate', '--target', embedded, '--offline'], embedded, embeddedHome);
assert.equal(embeddedValidated.provider.mode, 'embedded-local');
assert.equal(runInstalled(embeddedInit.launcher.command, ['provider', 'resolve', '--target', embedded, '--role', 'developer', '--mode', 'feature', '--offline'], embedded, embeddedHome).role, 'developer');
assert.match(runInstalled(embeddedInit.launcher.command, ['provider', 'load', '--target', embedded, '--id', 'profile:cli#5-verification-preset', '--offline'], embedded, embeddedHome).content, /Verification preset/);
assert.equal(runInstalled(embeddedInit.launcher.command, ['dsh', 'report', '--target', embedded, '--role', 'developer', '--mode', 'feature', '--offline'], embedded, embeddedHome).adapter, 'dsh');
const embeddedDescriptor = JSON.parse(fs.readFileSync(path.join(embedded, '.agent-project-guides.json'), 'utf8'));
const embeddedRelease = path.join(embedded, '.agent-project-guides', 'local', 'releases', embeddedDescriptor.provider.digest.replace(':', '-'));
const embeddedCore = path.join(embeddedRelease, 'lib', 'core.mjs');
const embeddedCoreBefore = fs.readFileSync(embeddedCore);
const embeddedRootBeforeConflict = fs.readFileSync(path.join(embedded, 'AGENTS.md'));
const embeddedDescriptorBeforeConflict = fs.readFileSync(path.join(embedded, '.agent-project-guides.json'));
fs.appendFileSync(embeddedCore, '\nrelease edit\n');
const embeddedConflict = run(['project', 'uninstall', '--target', embedded], { home: embeddedHome });
assert.equal(embeddedConflict.status, 'conflict');
assert.deepEqual(fs.readFileSync(path.join(embedded, 'AGENTS.md')), embeddedRootBeforeConflict);
assert.deepEqual(fs.readFileSync(path.join(embedded, '.agent-project-guides.json')), embeddedDescriptorBeforeConflict);
fs.writeFileSync(embeddedCore, embeddedCoreBefore);
assert.equal(run(['project', 'uninstall', '--target', embedded], { home: embeddedHome }).status, 'uninstalled');
assert.deepEqual(fs.readFileSync(path.join(embedded, 'AGENTS.md')), embeddedRoot);
assert.equal(fs.statSync(path.join(embedded, 'AGENTS.md')).mode & 0o777, 0o600);
assert.deepEqual(fs.readFileSync(path.join(embedded, '.git', 'info', 'exclude')), embeddedExclude);
assert.equal(fs.existsSync(path.join(embedded, '.agent-project-guides.json')), false);

const failedInit = project('failed-init');
fs.writeFileSync(path.join(failedInit, 'shared.md'), '# Shared\n');
fs.symlinkSync('shared.md', path.join(failedInit, 'AGENTS.md'));
fs.mkdirSync(path.join(failedInit, '.git', 'info'), { recursive: true });
fs.writeFileSync(path.join(failedInit, '.git', 'info', 'exclude'), embeddedExclude);
run(['project', 'init', '--target', failedInit, '--project-id', 'test.failed-init', '--mode', 'embedded-local', '--source', root, '--facets', 'cli'], { home: path.join(temporary, 'failed-home'), expect: 2 });
assert.equal(fs.existsSync(path.join(failedInit, '.agent-project-guides.json')), false);
assert.deepEqual(fs.readFileSync(path.join(failedInit, '.git', 'info', 'exclude')), embeddedExclude);
const failedReleases = path.join(failedInit, '.agent-project-guides', 'local', 'releases');
assert.equal(fs.existsSync(failedReleases) && fs.readdirSync(failedReleases).some((name) => name.startsWith('sha256-')), false);
assert.equal(fs.lstatSync(path.join(failedInit, 'AGENTS.md')).isSymbolicLink(), true);

const orphanMarker = project('orphan-marker');
const orphanBytes = Buffer.from('<!-- agent-project-guides:v2:end -->\n# Project\n');
fs.writeFileSync(path.join(orphanMarker, 'AGENTS.md'), orphanBytes);
assert.equal(run(['project', 'init', '--target', orphanMarker, '--project-id', 'test.orphan', '--mode', 'embedded-local', '--source', root], { home: path.join(temporary, 'orphan-home'), expect: 2 }).error, 'bootstrap_conflict');
assert.deepEqual(fs.readFileSync(path.join(orphanMarker, 'AGENTS.md')), orphanBytes);
assert.equal(fs.existsSync(path.join(orphanMarker, '.agent-project-guides.json')), false);

// Missing exact release is an explicit offline/degraded state; explicit hydration accepts only the pinned source.
const missing = project('missing');
copyTree(path.join(temporary, 'thin', 'docs'), path.join(missing, 'docs'));
// Recreate a project from the descriptor/bootstrap before uninstall using a fresh initialization, then remove its store.
const missingSource = project('missing-source');
const sourceHome = path.join(temporary, 'source-home');
run(['project', 'init', '--target', missingSource, '--project-id', 'test.missing', '--mode', 'thin-bootstrap', '--source', root, '--facets', 'cli'], { home: sourceHome });
fs.copyFileSync(path.join(missingSource, '.agent-project-guides.json'), path.join(missing, '.agent-project-guides.json'));
fs.copyFileSync(path.join(missingSource, 'AGENTS.md'), path.join(missing, 'AGENTS.md'));
const missingDescriptor = JSON.parse(fs.readFileSync(path.join(missing, '.agent-project-guides.json'), 'utf8'));
missingDescriptor.policy.mandatory = ['profile:cli#5-verification-preset'];
missingDescriptor.protected_effects = ['destructive'];
writeJson(path.join(missing, '.agent-project-guides.json'), missingDescriptor);
const emptyHome = path.join(temporary, 'empty-home');
const degraded = run(['project', 'validate', '--target', missing], { home: emptyHome });
assert.equal(degraded.status, 'package_missing');
assert.equal(degraded.valid, false);
assert.deepEqual(degraded.local_policy.mandatory, ['profile:cli#5-verification-preset']);
assert.deepEqual(degraded.local_policy.protected_effects, ['destructive']);
assert.equal(degraded.local_policy.protected_work, 'safe-stop');
assert.equal(degraded.local_policy.ordinary_work, 'degraded');
assert.equal(degraded.local_policy.search_substitution, false);
const offlineHydrate = run(['project', 'hydrate', '--target', missing, '--source', root, '--offline'], { home: emptyHome, expect: 2 });
assert.equal(offlineHydrate.error, 'package_missing');
const missingError = run(['provider', 'resolve', '--target', missing, '--role', 'developer', '--mode', 'feature'], { home: emptyHome, expect: 2 });
assert.equal(missingError.error, 'package_missing');
const hydrated = run(['project', 'hydrate', '--target', missing, '--source', root], { home: emptyHome });
assert.equal(hydrated.implicit_latest, false);
assert.equal(run(['project', 'validate', '--target', missing], { home: emptyHome }).valid, true);
assert.equal(run(['risk', 'classify', '--target', missing], { home: emptyHome }).tier, 'R3');
assert.ok(run(['provider', 'resolve', '--target', missing, '--role', 'developer', '--mode', 'feature'], { home: emptyHome }).exact.includes('profile:cli#5-verification-preset'));

// Source-worktree self-host mode observes mutable source and never claims immutability.
const selfHosted = project('self-hosted');
for (const name of ['bootstrap', 'catalog', 'docs', 'lib', 'procedures', 'profiles', 'roles', 'routing', 'schemas', 'scripts', 'templates']) {
  copyTree(path.join(root, name), path.join(selfHosted, name));
}
for (const name of ['PACKAGE_VERSION', 'PACKAGE_REMOTE.json']) fs.copyFileSync(path.join(root, name), path.join(selfHosted, name));
const self = run([
  'project', 'init', '--target', selfHosted, '--project-id', 'test.self-host', '--mode', 'source-worktree', '--source', selfHosted,
  '--facets', 'content-package', '--overlays', 'agent-governance',
]);
assert.equal(self.provider.mode, 'source-worktree');
const selfStatus = run(['project', 'validate', '--target', selfHosted]);
assert.equal(selfStatus.provider.immutable, false);
assert.match(selfStatus.provider.observed_digest, /^sha256:/);
const selfContextRoutes = path.join(selfHosted, 'routing', 'context-routes.jsonl');
const selfContextRoutesBefore = fs.readFileSync(selfContextRoutes);
const invalidContextRows = selfContextRoutesBefore.toString('utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);
const invalidContentRoute = invalidContextRows.find((record) => record.id === 'profile:content-package');
invalidContentRoute.default = { ids: ['profile:content-package'], budget: 500 };
fs.writeFileSync(selfContextRoutes, `${invalidContextRows.map((record) => JSON.stringify(record)).join('\n')}\n`);
assert.equal(run(['provider', 'capabilities', '--target', selfHosted], { expect: 2 }).error, 'invalid_registry');
assert.equal(run([
  'provider', 'resolve', '--target', selfHosted, '--role', 'developer', '--mode', 'feature',
], { expect: 2 }).error, 'invalid_registry');
assert.equal(run(['project', 'validate', '--target', selfHosted], { expect: 2 }).error, 'invalid_registry');
assert.equal(run(['release', 'install', '--source', selfHosted], { expect: 2 }).error, 'invalid_registry');
fs.writeFileSync(selfContextRoutes, selfContextRoutesBefore);
fs.appendFileSync(path.join(selfHosted, 'profiles', 'CONTENT_PACKAGE.md'), '\nChanged without catalog rebuild.\n');
assert.equal(run(['provider', 'load', '--target', selfHosted, '--id', 'profile:content-package'], { expect: 2 }).error, 'stale_catalog');
assert.equal(run([
  'provider', 'resolve', '--target', selfHosted, '--role', 'developer', '--mode', 'feature',
], { expect: 2 }).error, 'stale_catalog');
assert.equal(run(['project', 'validate', '--target', selfHosted], { expect: 2 }).error, 'catalog_stale');
assert.equal(run(['provider', 'load', '--target', selfHosted, '--id', 'profile:missing'], { expect: 2 }).error, 'catalog_miss');

// Linked worktrees with the same project ID keep provider generations and clone-local state separate.
const worktreeMain = project('worktree-main');
fs.writeFileSync(path.join(worktreeMain, 'README.md'), '# Worktree fixture\n');
gitOutput(worktreeMain, ['config', 'user.name', 'APG Test']);
gitOutput(worktreeMain, ['config', 'user.email', 'apg-test@example.invalid']);
gitOutput(worktreeMain, ['add', 'README.md']);
gitOutput(worktreeMain, ['commit', '-q', '-m', 'fixture']);
const worktreeSecond = path.join(temporary, 'worktree-second');
gitOutput(worktreeMain, ['worktree', 'add', '-q', '-b', 'second', worktreeSecond]);
const alternateSource = path.join(temporary, 'alternate-source');
fs.mkdirSync(alternateSource, { recursive: true });
for (const name of ['bootstrap', 'catalog', 'docs', 'lib', 'procedures', 'profiles', 'roles', 'routing', 'schemas', 'scripts', 'templates']) copyTree(path.join(root, name), path.join(alternateSource, name));
for (const name of ['PACKAGE_VERSION', 'PACKAGE_REMOTE.json']) fs.copyFileSync(path.join(root, name), path.join(alternateSource, name));
fs.appendFileSync(path.join(alternateSource, 'docs', 'V2_CONTRACT.md'), '\nLinked-worktree generation fixture.\n');
const alternateCatalog = spawnSync(process.execPath, [path.join(alternateSource, 'scripts', 'apg.mjs'), 'catalog', 'build'], { cwd: alternateSource, encoding: 'utf8' });
assert.equal(alternateCatalog.status, 0, alternateCatalog.stderr);
const worktreeHome = path.join(temporary, 'worktree-home');
run(['project', 'init', '--target', worktreeMain, '--project-id', 'test.linked', '--mode', 'thin-bootstrap', '--source', root, '--facets', 'cli'], { home: worktreeHome });
const sharedLauncher = path.join(worktreeHome, 'bin', 'apg-launcher.mjs');
const sharedLauncherBeforeSelfHost = fs.readFileSync(sharedLauncher);
run(['project', 'init', '--target', alternateSource, '--project-id', 'test.self-dispatch', '--mode', 'source-worktree', '--source', alternateSource, '--facets', 'content-package'], { home: worktreeHome });
assert.deepEqual(fs.readFileSync(sharedLauncher), sharedLauncherBeforeSelfHost);
run(['project', 'init', '--target', worktreeSecond, '--project-id', 'test.linked', '--mode', 'thin-bootstrap', '--source', alternateSource, '--facets', 'cli'], { home: worktreeHome });
const mainGeneration = run(['project', 'validate', '--target', worktreeMain], { home: worktreeHome });
const secondGeneration = run(['project', 'validate', '--target', worktreeSecond], { home: worktreeHome });
assert.notEqual(mainGeneration.provider.observed_digest, secondGeneration.provider.observed_digest);
const linkedMemory = path.join(temporary, 'linked-memory.json');
writeJson(linkedMemory, {
  id: 'linked.lesson', kind: 'knowledge', scope: 'repo', summary: 'Linked worktree state isolation.', evidence: ['test:linked'],
  owner: 'author-a', confidence: 'high', applicability: 'test fixture', revalidation_trigger: 'worktree changes',
});
run(['memory', 'propose', '--target', worktreeMain, '--input', linkedMemory], { home: worktreeHome });
run(['memory', 'propose', '--target', worktreeSecond, '--input', linkedMemory], { home: worktreeHome });
const linkedStates = path.join(worktreeHome, 'state', 'projects', 'test.linked');
assert.equal(fs.readdirSync(linkedStates).length, 2);
assert.equal(run(['project', 'uninstall', '--target', worktreeMain], { home: worktreeHome }).status, 'uninstalled');
assert.equal(run(['project', 'validate', '--target', worktreeSecond], { home: worktreeHome }).valid, true);
assert.equal(run(['project', 'uninstall', '--target', worktreeSecond], { home: worktreeHome }).status, 'uninstalled');

// Legacy migration captures exact bytes, verifies embedded offline operation, and rolls back atomically.
const migrated = project('migrated');
const legacyBytes = Buffer.from('<!-- agent-project-guides:routing:start -->\r\n## Agent routing\r\nPackage adaptation: status=adapted; package_revision=1.4.3; verified_at=2026-08-24T12:00:00Z; scope=repo; reason=none\r\n<!-- agent-project-guides:routing:end -->\r\n# Original Unicode 规则\r\nNo final newline');
const rootDrift = project('root-drift');
fs.writeFileSync(path.join(rootDrift, 'AGENTS.md'), legacyBytes);
const rootDriftHome = path.join(temporary, 'root-drift-home');
const rootDriftExclude = fs.readFileSync(path.join(rootDrift, '.git', 'info', 'exclude'));
const rootDriftPlan = run(['migrate', 'plan', '--target', rootDrift, '--project-id', 'test.root-drift', '--source', root, '--facets', 'content-package'], { home: rootDriftHome });
fs.appendFileSync(path.join(rootDrift, 'AGENTS.md'), '\npost-plan edit\n');
assert.equal(run(['migrate', 'apply', '--plan', rootDriftPlan.plan, '--digest', rootDriftPlan.digest], { home: rootDriftHome, expect: 2 }).error, 'migration_conflict');
assert.equal(fs.existsSync(path.join(rootDrift, '.agent-project-guides.json')), false);
assert.equal(fs.existsSync(path.join(rootDrift, '.agent-project-guides')), false);
assert.deepEqual(fs.readFileSync(path.join(rootDrift, '.git', 'info', 'exclude')), rootDriftExclude);
fs.writeFileSync(path.join(migrated, 'AGENTS.md'), legacyBytes);
const migrationHome = path.join(temporary, 'migration-home');
const plan = run(['migrate', 'plan', '--target', migrated, '--project-id', 'test.migration', '--source', root, '--facets', 'content-package'], { home: migrationHome });
assert.equal(plan.writes_project, false);
const applied = run(['migrate', 'apply', '--plan', plan.plan, '--digest', plan.digest], { home: migrationHome });
assert.equal(applied.status, 'migrated');
assert.equal(run(['project', 'validate', '--target', migrated], { home: migrationHome }).provider.mode, 'embedded-local');
const rolledBack = run(['migrate', 'rollback', '--target', migrated], { home: migrationHome });
assert.equal(rolledBack.status, 'rolled_back');
assert.deepEqual(fs.readFileSync(path.join(migrated, 'AGENTS.md')), legacyBytes);
assert.equal(fs.existsSync(path.join(migrated, '.agent-project-guides.json')), false);

// A later edit makes rollback a zero-write conflict, preserving both root and descriptor.
const conflicted = project('conflicted');
fs.writeFileSync(path.join(conflicted, 'AGENTS.md'), legacyBytes);
const conflictHome = path.join(temporary, 'conflict-home');
const conflictPlan = run(['migrate', 'plan', '--target', conflicted, '--project-id', 'test.conflict', '--source', root, '--facets', 'content-package'], { home: conflictHome });
run(['migrate', 'apply', '--plan', conflictPlan.plan, '--digest', conflictPlan.digest], { home: conflictHome });
fs.appendFileSync(path.join(conflicted, 'AGENTS.md'), '\nUser edit after migration.\n');
const descriptorBeforeConflict = fs.readFileSync(path.join(conflicted, '.agent-project-guides.json'));
const conflict = run(['migrate', 'rollback', '--target', conflicted], { home: conflictHome });
assert.equal(conflict.status, 'conflict');
assert.ok(conflict.conflicts.some((item) => item.path === 'AGENTS.md'));
assert.deepEqual(fs.readFileSync(path.join(conflicted, '.agent-project-guides.json')), descriptorBeforeConflict);
assert.match(fs.readFileSync(path.join(conflicted, 'AGENTS.md'), 'utf8'), /User edit after migration/);

// An external exclude edit after an interrupted append is never absorbed into migration ownership.
const excludeDrift = project('exclude-drift');
fs.writeFileSync(path.join(excludeDrift, 'AGENTS.md'), legacyBytes);
const excludeDriftHome = path.join(temporary, 'exclude-drift-home');
const excludeDriftPlan = run(['migrate', 'plan', '--target', excludeDrift, '--project-id', 'test.exclude-drift', '--source', root, '--facets', 'content-package'], { home: excludeDriftHome });
assert.equal(run(['migrate', 'apply', '--plan', excludeDriftPlan.plan, '--digest', excludeDriftPlan.digest], {
  home: excludeDriftHome,
  expect: 2,
  extraEnv: { APG_TEST_FAILPOINT: 'after-exclude-write' },
}).error, 'test_failpoint');
const excludeDriftFile = path.join(excludeDrift, '.git', 'info', 'exclude');
fs.appendFileSync(excludeDriftFile, 'external-rule\n');
assert.equal(run(['migrate', 'apply', '--plan', excludeDriftPlan.plan, '--digest', excludeDriftPlan.digest], { home: excludeDriftHome, expect: 2 }).error, 'migration_conflict');
assert.match(fs.readFileSync(excludeDriftFile, 'utf8'), /external-rule/);
assert.deepEqual(fs.readFileSync(path.join(excludeDrift, 'AGENTS.md')), legacyBytes);
assert.equal(fs.existsSync(path.join(excludeDrift, '.agent-project-guides.json')), false);

// Every owned-write interruption is resumable with the same plan and rolls back exact preimages.
for (const failpoint of ['after-embedded-write', 'after-exclude-write', 'after-descriptor-write', 'after-bootstrap-write']) {
  const interrupted = project(`interrupted-${failpoint}`);
  fs.writeFileSync(path.join(interrupted, 'AGENTS.md'), legacyBytes);
  const interruptedHome = path.join(temporary, `home-${failpoint}`);
  const interruptedPlan = run(['migrate', 'plan', '--target', interrupted, '--project-id', `test.${failpoint}`, '--source', root, '--facets', 'content-package'], { home: interruptedHome });
  const failure = run(['migrate', 'apply', '--plan', interruptedPlan.plan, '--digest', interruptedPlan.digest], {
    home: interruptedHome,
    expect: 2,
    extraEnv: { APG_TEST_FAILPOINT: failpoint },
  });
  assert.equal(failure.error, 'test_failpoint');
  const resumed = run(['migrate', 'apply', '--plan', interruptedPlan.plan, '--digest', interruptedPlan.digest], { home: interruptedHome });
  assert.equal(resumed.status, 'migrated');
  if (failpoint === 'after-bootstrap-write') {
    assert.equal(run(['migrate', 'rollback', '--target', interrupted], {
      home: interruptedHome,
      expect: 2,
      extraEnv: { APG_TEST_FAILPOINT: 'after-rollback-descriptor' },
    }).error, 'test_failpoint');
    assert.equal(fs.existsSync(path.join(interrupted, '.agent-project-guides.json')), false);
    assert.equal(run(['migrate', 'rollback', '--target', interrupted, '--project-id', `test.${failpoint}`], { home: interruptedHome }).status, 'rolled_back');
  } else {
    assert.equal(run(['migrate', 'rollback', '--target', interrupted], { home: interruptedHome }).status, 'rolled_back');
  }
  assert.deepEqual(fs.readFileSync(path.join(interrupted, 'AGENTS.md')), legacyBytes);
  assert.equal(fs.existsSync(path.join(interrupted, '.agent-project-guides.json')), false);
}

const foreignDescriptor = project('foreign-descriptor-recovery');
fs.writeFileSync(path.join(foreignDescriptor, 'AGENTS.md'), legacyBytes);
const foreignDescriptorBytes = Buffer.from('{"project_id":"legacy.other"}\n');
fs.writeFileSync(path.join(foreignDescriptor, '.agent-project-guides.json'), foreignDescriptorBytes);
const foreignHome = path.join(temporary, 'foreign-home');
const foreignPlan = run(['migrate', 'plan', '--target', foreignDescriptor, '--project-id', 'test.foreign-recovery', '--source', root, '--facets', 'content-package'], { home: foreignHome });
run(['migrate', 'apply', '--plan', foreignPlan.plan, '--digest', foreignPlan.digest], { home: foreignHome });
assert.equal(run(['migrate', 'rollback', '--target', foreignDescriptor], {
  home: foreignHome,
  expect: 2,
  extraEnv: { APG_TEST_FAILPOINT: 'after-rollback-descriptor' },
}).error, 'test_failpoint');
assert.deepEqual(fs.readFileSync(path.join(foreignDescriptor, '.agent-project-guides.json')), foreignDescriptorBytes);
assert.equal(run(['migrate', 'rollback', '--target', foreignDescriptor, '--project-id', 'test.foreign-recovery'], { home: foreignHome }).status, 'rolled_back');
assert.deepEqual(fs.readFileSync(path.join(foreignDescriptor, '.agent-project-guides.json')), foreignDescriptorBytes);

console.log('PASS: v2 descriptors, immutable providers, self-hosting, exact routing/loading, risk, DSH reporting, memory, offline hydration, and migration rollback');

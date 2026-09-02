#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { canonicalJson, sha256 } from '../lib/core.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'scripts', 'apg.mjs');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'apg-v3-test-'));
process.on('exit', () => fs.rmSync(temporary, { recursive: true, force: true }));

function run(args, { cwd = root, home = path.join(temporary, 'home'), expect = 0, extraEnv = {}, raw = false } = {}) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, AGENT_PROJECT_GUIDES_HOME: home, ...extraEnv },
  });
  assert.equal(result.status, expect, `command failed: apg ${args.join(' ')}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);
  const text = expect === 0 ? result.stdout : result.stderr;
  if (raw) return text;
  return text.trim() ? JSON.parse(text) : undefined;
}

function runCommand(command, args, { cwd, home, expect = 0 } = {}) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', env: { ...process.env, AGENT_PROJECT_GUIDES_HOME: home } });
  assert.equal(result.status, expect, `command failed: ${command} ${args.join(' ')}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);
  const text = expect === 0 ? result.stdout : result.stderr;
  return text.trim() ? JSON.parse(text) : undefined;
}

function project(name) {
  const directory = path.join(temporary, name);
  fs.mkdirSync(directory, { recursive: true });
  const initialized = spawnSync('git', ['init', '-q', directory], { encoding: 'utf8' });
  assert.equal(initialized.status, 0, initialized.stderr);
  fs.writeFileSync(path.join(directory, 'AGENTS.md'), '# Consumer policy\n');
  return directory;
}

function git(directory, args) {
  const result = spawnSync('git', ['-C', directory, ...args], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

function treeSnapshot(directory) {
  const output = new Map();
  function visit(relative = '') {
    for (const entry of fs.readdirSync(path.join(directory, relative), { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      if (entry.name === '.git') continue;
      const child = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) visit(child);
      else if (entry.isFile()) output.set(child, fs.readFileSync(path.join(directory, child)).toString('base64'));
    }
  }
  visit();
  return [...output.entries()];
}

const baseArgs = [
  '--lifecycle', 'maintenance',
  '--profiles', 'content-package',
  '--overlays', 'agent-governance',
  '--mandatory', 'profile:content-package#5-verification-preset',
];

// Preview is pure and exposes only the two implemented variants.
const previewTarget = project('preview');
const previewBefore = treeSnapshot(previewTarget);
const preview = run(['project', 'materialize', '--target', previewTarget, '--project-id', 'test.preview-v3', '--variant', 'selected-inline.none', ...baseArgs]);
assert.equal(preview.dry_run, true);
assert.equal(preview.applicable, true);
assert.ok(['clean', 'dirty', 'unknown'].includes(preview.source_provenance.state));
assert.equal(preview.source_provenance.immutable_release_claim, false);
assert.deepEqual(treeSnapshot(previewTarget), previewBefore);
assert.equal(run(['project', 'materialize', '--target', previewTarget, '--project-id', 'test.preview-v3', '--variant', 'selected-cli.shared', ...baseArgs], { expect: 2 }).error, 'unsupported_variant');
const occupiedTransition = project('occupied-transition');
fs.mkdirSync(path.join(occupiedTransition, '.agent-guides-transition'));
fs.writeFileSync(path.join(occupiedTransition, '.agent-guides-transition', 'user.txt'), 'project-owned\n');
assert.equal(run(['project', 'materialize', '--target', occupiedTransition, '--project-id', 'test.occupied-v3', '--variant', 'selected-inline.none', ...baseArgs, '--apply'], { expect: 2 }).error, 'materialization_conflict');
assert.equal(fs.readFileSync(path.join(occupiedTransition, '.agent-guides-transition', 'user.txt'), 'utf8'), 'project-owned\n');

// Selected inline publishes only the selected whole-document closure and needs no runtime CLI in its root block.
const inline = project('inline');
const inlineHome = path.join(temporary, 'inline-home');
const materializedInline = run([
  'project', 'materialize', '--target', inline, '--project-id', 'test.inline-v3', '--variant', 'selected-inline.none', ...baseArgs, '--apply',
], { home: inlineHome });
assert.equal(materializedInline.status, 'materialized');
const inlineDescriptor = JSON.parse(fs.readFileSync(path.join(inline, '.agent-project-guides.json'), 'utf8'));
assert.equal(inlineDescriptor.schema_version, 2);
assert.equal(inlineDescriptor.variant, 'selected-inline.none');
const inlineStatus = run(['project', 'validate', '--target', inline], { home: inlineHome });
assert.equal(inlineStatus.status, 'ready');
assert.equal(inlineStatus.workspace_containment, 'physical-selected');
assert.ok(fs.existsSync(path.join(inline, '.agent-guides', 'managed', 'roles', 'development', 'MAINTAINER.md')));
assert.equal(fs.existsSync(path.join(inline, '.agent-guides', 'managed', 'roles', 'development', 'DEVELOPER.md')), false);
const inlineManifest = JSON.parse(fs.readFileSync(path.join(inline, '.agent-guides', 'MANIFEST.json'), 'utf8'));
assert.ok(inlineManifest.modules.some((module) => module.id === 'role-development-maintainer'));
assert.ok(inlineManifest.excluded_optional_modules.includes('role-development-developer'));
const inlineManifestFile = path.join(inline, '.agent-guides', 'MANIFEST.json');
const inlineManifestBytes = fs.readFileSync(inlineManifestFile);
const editedManifest = JSON.parse(inlineManifestBytes);
editedManifest.modules = [];
delete editedManifest.manifest_digest;
editedManifest.manifest_digest = `sha256:${sha256(canonicalJson(editedManifest))}`;
fs.writeFileSync(inlineManifestFile, canonicalJson(editedManifest));
assert.equal(run(['project', 'validate', '--target', inline], { home: inlineHome, expect: 2 }).error, 'materialization_conflict');
fs.writeFileSync(inlineManifestFile, inlineManifestBytes);
const unselectedManaged = path.join(inline, '.agent-guides', 'managed', 'roles', 'development', 'DEVELOPER.md');
fs.copyFileSync(path.join(root, 'roles', 'development', 'DEVELOPER.md'), unselectedManaged);
assert.equal(run(['project', 'validate', '--target', inline], { home: inlineHome, expect: 2 }).error, 'containment_conflict');
fs.rmSync(unselectedManaged);
const inlineRoot = fs.readFileSync(path.join(inline, 'AGENTS.md'), 'utf8');
assert.doesNotMatch(inlineRoot, /Before work, run `apg context/);
assert.doesNotMatch(inlineRoot, /BOOTSTRAP\.md/);
assert.match(inlineRoot, /never union-load/i);
assert.match(inlineRoot, /\.agent-guides\/managed\/roles\/development\/MAINTAINER\.md/);
assert.equal(git(inline, ['diff', '--cached', '--name-only']), '');

const inlineContext = run(['context', '--target', inline, '--role', 'maintainer', '--mode', 'code', '--format', 'json'], { home: inlineHome });
assert.equal(inlineContext.status, 'ready');
assert.ok(inlineContext.budgets.aggregate_tokens <= inlineDescriptor.context.max_tokens);
assert.equal(inlineContext.budgets.json_tokens, Math.ceil(Buffer.byteLength(canonicalJson(inlineContext)) / 4));
assert.equal(inlineContext.union_loaded, false);
assert.equal(run(['context', '--target', inline, '--role', 'developer', '--mode', 'feature', '--format', 'json'], { home: inlineHome, expect: 2 }).error, 'route_unresolved');
const cjkContext = run(['context', '--target', inline, '--task', '修复缺陷并保持行为', '--format', 'json'], { home: inlineHome });
assert.equal(cjkContext.role, 'maintainer');
const ambiguous = run(['context', '--target', inline, '--task', 'inspect this work', '--format', 'json'], { home: inlineHome });
assert.equal(ambiguous.status, 'clarification_required');
assert.equal(ambiguous.union_loaded, false);
assert.deepEqual(ambiguous.mandatory_ids, ['profile:content-package#5-verification-preset']);
assert.deepEqual(ambiguous.selected_sources.map((source) => source.id), ambiguous.mandatory_ids);
assert.ok(ambiguous.token_estimate <= inlineDescriptor.context.clarification_max_tokens);
assert.ok(ambiguous.budgets.aggregate_tokens <= inlineDescriptor.context.max_tokens);
const mixed = run(['context', '--target', inline, '--task', 'implement and review this change', '--format', 'json'], { home: inlineHome });
assert.equal(mixed.status, 'clarification_required');
const protectedChoice = run(['context', '--target', inline, '--task', 'deploy this release to production', '--format', 'json'], { home: inlineHome });
assert.equal(protectedChoice.kind, 'protected');
assert.equal(protectedChoice.authority_granted, false);
assert.equal(protectedChoice.union_loaded, false);
const productChoice = run(['context', '--target', inline, '--task', 'use product through public api', '--format', 'json'], { home: inlineHome });
assert.equal(productChoice.kind, 'ordinary-ambiguity');
assert.ok(productChoice.required_expansion.includes('production/user'));

// Real multi-profile projects require more than the original 3072-token aggregate while remaining bounded by 4096.
const wideContextProject = project('wide-context');
const wideHome = path.join(temporary, 'wide-home');
run(['project', 'materialize', '--target', wideContextProject, '--project-id', 'test.wide-context', '--variant', 'shared-runtime.pinned', '--lifecycle', 'active-development', '--profiles', 'mcp,monorepo-composition', '--overlays', 'agent-governance', '--apply'], { home: wideHome });
const wideDescriptor = JSON.parse(fs.readFileSync(path.join(wideContextProject, '.agent-project-guides.json'), 'utf8'));
const wideContext = run(['context', '--target', wideContextProject, '--role', 'maintainer', '--mode', 'code', '--format', 'json'], { home: wideHome });
assert.equal(wideDescriptor.context.max_tokens, 4096);
assert.ok(wideContext.budgets.aggregate_tokens > 3072);
assert.ok(wideContext.budgets.aggregate_tokens <= wideDescriptor.context.max_tokens);

// Shared pinned mode publishes no generic Markdown in the project and routes through one exact packed generation.
const shared = project('shared');
const sharedHome = path.join(temporary, 'shared-home');
const materializedShared = run([
  'project', 'materialize', '--target', shared, '--project-id', 'test.shared-v3', '--variant', 'shared-runtime.pinned', ...baseArgs, '--apply',
], { home: sharedHome });
assert.equal(materializedShared.status, 'materialized');
assert.equal(fs.existsSync(path.join(shared, '.agent-guides', 'managed')), false);
const sharedDescriptor = JSON.parse(fs.readFileSync(path.join(shared, '.agent-project-guides.json'), 'utf8'));
const runtimeRoot = path.join(sharedHome, 'data', 'runtimes', sharedDescriptor.release.digest.replace(':', '-'));
assert.ok(fs.existsSync(path.join(runtimeRoot, 'content', 'content.pack.json')));
assert.equal(fs.readdirSync(runtimeRoot, { recursive: true }).some((name) => String(name).endsWith('.md')), false);
const runtimeManifestFile = path.join(runtimeRoot, 'runtime-manifest.json');
const runtimeCliFile = path.join(runtimeRoot, 'scripts', 'apg.mjs');
const runtimeManifestBytes = fs.readFileSync(runtimeManifestFile);
const runtimeCliBytes = fs.readFileSync(runtimeCliFile);
const forgedCliBytes = Buffer.concat([runtimeCliBytes, Buffer.from('\n// forged\n')]);
fs.writeFileSync(runtimeCliFile, forgedCliBytes);
const forgedRuntimeManifest = JSON.parse(runtimeManifestBytes);
const forgedCliRecord = forgedRuntimeManifest.files.find((record) => record.path === 'scripts/apg.mjs');
forgedCliRecord.bytes = forgedCliBytes.length;
forgedCliRecord.sha256 = sha256(forgedCliBytes);
delete forgedRuntimeManifest.digest;
forgedRuntimeManifest.digest = `sha256:${sha256(canonicalJson(forgedRuntimeManifest))}`;
fs.chmodSync(runtimeManifestFile, 0o644);
fs.writeFileSync(runtimeManifestFile, canonicalJson(forgedRuntimeManifest));
const corruptRuntimeTarget = project('corrupt-runtime-target');
assert.equal(run(['project', 'materialize', '--target', corruptRuntimeTarget, '--project-id', 'test.corrupt-runtime', '--variant', 'shared-runtime.pinned', ...baseArgs, '--apply'], { home: sharedHome, expect: 2 }).error, 'release_mismatch');
assert.equal(fs.existsSync(path.join(corruptRuntimeTarget, '.agent-guides-transition')), false);
const launcher = path.join(sharedHome, 'bin', 'apg');
assert.match(runCommand(launcher, ['context', '--target', shared, '--role', 'maintainer', '--mode', 'code', '--format', 'json'], { cwd: shared, home: sharedHome, expect: 2 }).message, /does not match the descriptor/);
fs.writeFileSync(runtimeCliFile, runtimeCliBytes);
fs.writeFileSync(runtimeManifestFile, runtimeManifestBytes);
fs.chmodSync(runtimeManifestFile, 0o444);
const sharedStatus = run(['project', 'validate', '--target', shared], { home: sharedHome });
assert.equal(sharedStatus.workspace_containment, 'no-generic-corpus');
assert.equal(sharedStatus.runtime_dependency, 'shared-cli');
const sharedRootFile = path.join(shared, 'AGENTS.md');
const sharedRootBytes = fs.readFileSync(sharedRootFile);
fs.writeFileSync(sharedRootFile, sharedRootBytes.toString('utf8').replace('apg context', 'evil-command'));
assert.equal(run(['project', 'validate', '--target', shared], { home: sharedHome, expect: 2 }).error, 'bootstrap_mismatch');
fs.writeFileSync(sharedRootFile, sharedRootBytes);
assert.equal(git(shared, ['diff', '--cached', '--name-only']), '');
const sharedContext = runCommand(launcher, ['context', '--target', shared, '--role', 'maintainer', '--mode', 'code', '--format', 'json'], { cwd: shared, home: sharedHome });
assert.equal(sharedContext.status, 'ready');
assert.deepEqual(sharedContext.selected_ids, inlineContext.selected_ids);
assert.deepEqual(sharedContext.selected_sources.map(({ id, hash }) => ({ id, hash })), inlineContext.selected_sources.map(({ id, hash }) => ({ id, hash })));
assert.equal(sharedContext.source_observation.host_observed, true);
assert.ok(sharedContext.generation);
const sharedChoice = runCommand(launcher, ['context', '--target', shared, '--task', 'deploy release to production', '--format', 'json'], { cwd: shared, home: sharedHome });
assert.equal(sharedChoice.status, 'clarification_required');
assert.ok(sharedChoice.generation);
assert.deepEqual(sharedChoice.mandatory_ids, ['profile:content-package#5-verification-preset']);
const continued = runCommand(launcher, ['context', '--target', shared, '--role', 'maintainer', '--mode', 'code', '--format', 'json', '--generation', sharedContext.generation], { cwd: shared, home: sharedHome });
assert.equal(continued.generation, sharedContext.generation);
const [encodedGeneration] = sharedContext.generation.split('.');
const forgedGenerationPayload = JSON.parse(Buffer.from(encodedGeneration, 'base64url').toString('utf8'));
forgedGenerationPayload.expires_at_ms += 86_400_000;
const forgedGenerationEncoded = Buffer.from(canonicalJson(forgedGenerationPayload)).toString('base64url');
const publiclyResignedGeneration = `${forgedGenerationEncoded}.${sha256(forgedGenerationEncoded)}`;
assert.equal(runCommand(launcher, ['context', '--target', shared, '--role', 'maintainer', '--mode', 'code', '--format', 'json', '--generation', publiclyResignedGeneration], { cwd: shared, home: sharedHome, expect: 2 }).error, 'generation_mismatch');
assert.equal(runCommand(launcher, ['context', '--target', shared, '--role', 'maintainer', '--mode', 'code', '--format', 'json', '--generation', `${sharedContext.generation}x`], { cwd: shared, home: sharedHome, expect: 2 }).error, 'generation_mismatch');
const runtimeBackup = `${runtimeRoot}.missing`;
fs.renameSync(runtimeRoot, runtimeBackup);
assert.match(runCommand(launcher, ['context', '--target', shared, '--role', 'maintainer', '--mode', 'code', '--format', 'json'], { cwd: shared, home: sharedHome, expect: 2 }).message, /packed runtime is missing/);
fs.renameSync(runtimeBackup, runtimeRoot);

// Every transaction boundary leaves transition-blocked or committed state and retry converges.
for (const failpoint of [
  'before-transition-root', 'after-transition-root', 'before-guides-rename', 'after-guides-rename',
  'before-descriptor-rename', 'after-descriptor-rename', 'before-final-root', 'after-final-root',
  'before-journal-commit', 'after-journal-commit',
]) {
  const target = project(`recovery-${failpoint}`);
  const home = path.join(temporary, `home-${failpoint}`);
  const args = ['project', 'materialize', '--target', target, '--project-id', `test.${failpoint}`, '--variant', 'selected-inline.none', ...baseArgs, '--apply'];
  assert.equal(run(args, { home, expect: 2, extraEnv: { APG_TEST_FAILPOINT: failpoint } }).error, 'test_failpoint');
  const retry = run(args, { home });
  assert.ok(['materialized', 'already_materialized'].includes(retry.status));
  assert.equal(run(['project', 'validate', '--target', target], { home }).status, 'ready');
  assert.equal(fs.existsSync(path.join(target, '.agent-guides-transition')), false);
}

for (const hardFailpoint of ['after-receipt-write', 'after-journal-copy', 'after-active-remove']) {
  const target = project(`hard-recovery-${hardFailpoint}`);
  const home = path.join(temporary, `hard-home-${hardFailpoint}`);
  const args = ['project', 'materialize', '--target', target, '--project-id', `test.hard-${hardFailpoint}`, '--variant', 'selected-inline.none', ...baseArgs, '--apply'];
  run(args, { home, expect: 86, extraEnv: { APG_TEST_HARD_FAILPOINT: hardFailpoint } });
  assert.equal(fs.existsSync(path.join(target, '.agent-guides-transition')), true);
  assert.ok(['materialized', 'already_materialized'].includes(run(args, { home }).status));
  assert.equal(fs.existsSync(path.join(target, '.agent-guides-transition')), false);
}

// Schema 1 migration preview is zero-write, transitional, digest-addressed, and self-host migration blocks honestly.
const legacy = project('legacy-v2');
const legacyHome = path.join(temporary, 'legacy-home');
run(['project', 'init', '--target', legacy, '--project-id', 'test.legacy-v2', '--mode', 'thin-bootstrap', '--source', root, '--facets', 'content-package', '--overlays', 'agent-governance'], { home: legacyHome });
assert.equal(run(['project', 'materialize', '--target', legacy, '--project-id', 'test.legacy-v2', '--variant', 'selected-inline.none', ...baseArgs, '--apply'], { home: legacyHome, expect: 2 }).error, 'materialization_conflict');
assert.equal(fs.existsSync(path.join(legacy, '.agent-guides-transition')), false);
fs.mkdirSync(path.join(legacy, '.agent-guides'));
const blockedGuidesPreview = run(['migrate', 'v3-preview', '--target', legacy, '--variant', 'shared-runtime.pinned', '--lifecycle', 'maintenance', '--source', root], { home: legacyHome });
assert.equal(blockedGuidesPreview.applicable, false);
assert.equal(blockedGuidesPreview.blockers[0].code, 'managed-guides-exist');
fs.rmdirSync(path.join(legacy, '.agent-guides'));
const legacyRootFile = path.join(legacy, 'AGENTS.md');
fs.appendFileSync(legacyRootFile, '\nProject-owned dirty suffix.\n');
const legacyBefore = treeSnapshot(legacy);
const migration = run(['migrate', 'v3-preview', '--target', legacy, '--variant', 'selected-inline.none', '--lifecycle', 'maintenance', '--source', root], { home: legacyHome });
assert.equal(run(['migrate', 'v3-preview', '--target', legacy, '--project-id', 'wrong.project', '--variant', 'selected-inline.none', '--lifecycle', 'maintenance', '--source', root], { home: legacyHome, expect: 2 }).error, 'migration_conflict');
assert.equal(migration.dry_run, true);
assert.equal(migration.applicable, true);
assert.equal(migration.proposed_descriptor.schema_version, 2);
assert.equal(migration.proposed_descriptor.containment.workspace, 'transitional');
assert.notEqual(migration.proposed_descriptor.integrity.manifest_digest, `sha256:${'0'.repeat(64)}`);
assert.notEqual(migration.proposed_descriptor.integrity.root_block_hash, `sha256:${'0'.repeat(64)}`);
assert.match(migration.plan_digest, /^sha256:[0-9a-f]{64}$/);
assert.equal(migration.writes_project, false);
assert.deepEqual(treeSnapshot(legacy), legacyBefore);
const sharedMigration = run(['migrate', 'v3-preview', '--target', legacy, '--variant', 'shared-runtime.pinned', '--lifecycle', 'maintenance', '--source', root], { home: legacyHome });
assert.match(sharedMigration.proposed_descriptor.release.runtime_digest, /^sha256:[0-9a-f]{64}$/);
assert.deepEqual(treeSnapshot(legacy), legacyBefore);
const legacyDescriptorFile = path.join(legacy, '.agent-project-guides.json');
const legacyDescriptorBytes = fs.readFileSync(legacyDescriptorFile);
fs.appendFileSync(legacyDescriptorFile, '\n');
assert.equal(run(['migrate', 'v3-apply', '--target', legacy, '--variant', 'shared-runtime.pinned', '--lifecycle', 'maintenance', '--source', root, '--digest', sharedMigration.plan_digest], { home: legacyHome, expect: 2 }).error, 'plan_digest_mismatch');
assert.equal(fs.existsSync(path.join(legacy, '.agent-guides-transition')), false);
fs.writeFileSync(legacyDescriptorFile, legacyDescriptorBytes);
assert.equal(run(['migrate', 'v3-apply', '--target', legacy, '--variant', 'shared-runtime.pinned', '--lifecycle', 'maintenance', '--source', root, '--digest', `sha256:${'f'.repeat(64)}`], { home: legacyHome, expect: 2 }).error, 'plan_digest_mismatch');
assert.deepEqual(treeSnapshot(legacy), legacyBefore);
const migrated = run(['migrate', 'v3-apply', '--target', legacy, '--variant', 'shared-runtime.pinned', '--lifecycle', 'maintenance', '--source', root, '--digest', sharedMigration.plan_digest], { home: legacyHome });
assert.equal(migrated.status, 'migrated');
assert.equal(run(['project', 'validate', '--target', legacy], { home: legacyHome }).workspace_containment, 'transitional');
assert.match(fs.readFileSync(legacyRootFile, 'utf8'), /Project-owned dirty suffix/);
const migratedRootBytes = fs.readFileSync(legacyRootFile);
fs.appendFileSync(legacyRootFile, '\nLater project edit.\n');
assert.equal(run(['migrate', 'v3-rollback', '--target', legacy], { home: legacyHome, expect: 2 }).error, 'migration_conflict');
assert.match(fs.readFileSync(legacyRootFile, 'utf8'), /Later project edit/);
fs.writeFileSync(legacyRootFile, migratedRootBytes);
const unknownGuide = path.join(legacy, '.agent-guides', 'project-owned.txt');
fs.writeFileSync(unknownGuide, 'project-owned\n');
assert.equal(run(['migrate', 'v3-rollback', '--target', legacy], { home: legacyHome, expect: 2 }).error, 'migration_conflict');
assert.equal(fs.existsSync(path.join(legacy, '.agent-guides-rollback')), false);
assert.equal(fs.readFileSync(unknownGuide, 'utf8'), 'project-owned\n');
fs.rmSync(unknownGuide);
const knownGuide = path.join(legacy, '.agent-guides', 'local', 'materialization-journal.jsonl');
const knownGuideBytes = fs.readFileSync(knownGuide);
fs.appendFileSync(knownGuide, '{"project":"edit"}\n');
assert.equal(run(['migrate', 'v3-rollback', '--target', legacy], { home: legacyHome, expect: 2 }).error, 'migration_conflict');
fs.writeFileSync(knownGuide, knownGuideBytes);
const emptyGuideDirectory = path.join(legacy, '.agent-guides', 'project-empty');
fs.mkdirSync(emptyGuideDirectory);
assert.equal(run(['migrate', 'v3-rollback', '--target', legacy], { home: legacyHome, expect: 2 }).error, 'migration_conflict');
fs.rmdirSync(emptyGuideDirectory);
assert.equal(run(['migrate', 'v3-rollback', '--target', legacy], { home: legacyHome }).status, 'rolled_back');
assert.deepEqual(treeSnapshot(legacy), legacyBefore);

const embeddedLegacy = project('legacy-embedded-v2');
const embeddedHome = path.join(temporary, 'embedded-home');
run(['project', 'init', '--target', embeddedLegacy, '--project-id', 'test.embedded-v2', '--mode', 'embedded-local', '--source', root, '--facets', 'mcp', '--overlays', 'agent-governance'], { home: embeddedHome });
const embeddedBefore = treeSnapshot(embeddedLegacy);
const embeddedPreview = run(['migrate', 'v3-preview', '--target', embeddedLegacy, '--variant', 'shared-runtime.pinned', '--lifecycle', 'maintenance', '--source', root], { home: embeddedHome });
assert.equal(run(['migrate', 'v3-apply', '--target', embeddedLegacy, '--variant', 'shared-runtime.pinned', '--lifecycle', 'maintenance', '--source', root, '--digest', embeddedPreview.plan_digest], { home: embeddedHome }).status, 'migrated');
assert.ok(fs.existsSync(path.join(embeddedLegacy, '.agent-project-guides', 'local', 'releases')));
const embeddedReleases = path.join(embeddedLegacy, '.agent-project-guides', 'local', 'releases');
const embeddedReleasesMissing = `${embeddedReleases}.missing`;
fs.renameSync(embeddedReleases, embeddedReleasesMissing);
assert.equal(run(['migrate', 'v3-rollback', '--target', embeddedLegacy], { home: embeddedHome, expect: 2 }).error, 'package_missing');
assert.equal(fs.existsSync(path.join(embeddedLegacy, '.agent-guides-rollback')), false);
fs.renameSync(embeddedReleasesMissing, embeddedReleases);
assert.equal(run(['migrate', 'v3-rollback', '--target', embeddedLegacy], { home: embeddedHome }).status, 'rolled_back');
assert.deepEqual(treeSnapshot(embeddedLegacy), embeddedBefore);

for (const failpoint of ['after-transition-root', 'after-guides-published', 'after-descriptor-published', 'after-final-root', 'after-receipt-write', 'after-journal-copy', 'after-migration-receipt']) {
  const interruptedMigration = project(`legacy-interrupted-${failpoint}`);
  const interruptedHome = path.join(temporary, `interrupted-home-${failpoint}`);
  run(['project', 'init', '--target', interruptedMigration, '--project-id', `test.interrupted-${failpoint}`, '--mode', 'thin-bootstrap', '--source', root, '--facets', 'cli'], { home: interruptedHome });
  const interruptedBefore = treeSnapshot(interruptedMigration);
  const interruptedPreview = run(['migrate', 'v3-preview', '--target', interruptedMigration, '--variant', 'shared-runtime.pinned', '--lifecycle', 'maintenance', '--source', root], { home: interruptedHome });
  const interruptedArgs = ['migrate', 'v3-apply', '--target', interruptedMigration, '--variant', 'shared-runtime.pinned', '--lifecycle', 'maintenance', '--source', root, '--digest', interruptedPreview.plan_digest];
  run(interruptedArgs, { home: interruptedHome, expect: 86, extraEnv: { APG_TEST_HARD_FAILPOINT: failpoint } });
  assert.equal(fs.existsSync(path.join(interruptedMigration, '.agent-guides-transition', 'active.json')), true);
  if (failpoint === 'after-transition-root') {
    const descriptorFile = path.join(interruptedMigration, '.agent-project-guides.json');
    const descriptorBytes = fs.readFileSync(descriptorFile);
    fs.appendFileSync(descriptorFile, '\n');
    assert.equal(run(interruptedArgs, { home: interruptedHome, expect: 2 }).error, 'materialization_conflict');
    assert.equal(fs.existsSync(path.join(interruptedMigration, '.agent-guides')), false);
    fs.writeFileSync(descriptorFile, descriptorBytes);
  }
  if (failpoint === 'after-guides-published') {
    const rootFile = path.join(interruptedMigration, 'AGENTS.md');
    const rootBytes = fs.readFileSync(rootFile);
    fs.appendFileSync(rootFile, '\nProject edit.\n');
    const descriptorBeforeRetry = fs.readFileSync(path.join(interruptedMigration, '.agent-project-guides.json'));
    assert.equal(run(interruptedArgs, { home: interruptedHome, expect: 2 }).error, 'materialization_conflict');
    assert.ok(fs.readFileSync(path.join(interruptedMigration, '.agent-project-guides.json')).equals(descriptorBeforeRetry));
    fs.writeFileSync(rootFile, rootBytes);
  }
  if (failpoint === 'after-descriptor-published') {
    const descriptorFile = path.join(interruptedMigration, '.agent-project-guides.json');
    const descriptorBytes = fs.readFileSync(descriptorFile);
    const rootBeforeRetry = fs.readFileSync(path.join(interruptedMigration, 'AGENTS.md'));
    fs.appendFileSync(descriptorFile, '\n');
    assert.equal(run(interruptedArgs, { home: interruptedHome, expect: 2 }).error, 'materialization_conflict');
    assert.ok(fs.readFileSync(path.join(interruptedMigration, 'AGENTS.md')).equals(rootBeforeRetry));
    fs.writeFileSync(descriptorFile, descriptorBytes);
  }
  if (failpoint === 'after-final-root') {
    const injected = path.join(interruptedMigration, '.agent-guides', 'project-after-crash.txt');
    fs.writeFileSync(injected, 'project-owned\n');
    assert.equal(run(interruptedArgs, { home: interruptedHome, expect: 2 }).error, 'materialization_conflict');
    assert.equal(fs.readFileSync(injected, 'utf8'), 'project-owned\n');
    fs.rmSync(injected);
  }
  assert.ok(['migrated', 'already_migrated'].includes(run(interruptedArgs, { home: interruptedHome }).status));
  assert.equal(fs.existsSync(path.join(interruptedMigration, '.agent-guides-transition')), false);
  assert.equal(run(['migrate', 'v3-rollback', '--target', interruptedMigration], { home: interruptedHome }).status, 'rolled_back');
  assert.deepEqual(treeSnapshot(interruptedMigration), interruptedBefore);
}

for (const failpoint of ['rollback-after-transition-root', 'rollback-after-descriptor-restore', 'rollback-after-root-restore', 'rollback-after-guides-move', 'rollback-after-guides-remove']) {
  const interruptedRollback = project(`rollback-interrupted-${failpoint}`);
  const rollbackHome = path.join(temporary, `rollback-home-${failpoint}`);
  run(['project', 'init', '--target', interruptedRollback, '--project-id', `test.rollback-${failpoint}`, '--mode', 'thin-bootstrap', '--source', root, '--facets', 'cli'], { home: rollbackHome });
  const rollbackBefore = treeSnapshot(interruptedRollback);
  const rollbackPreview = run(['migrate', 'v3-preview', '--target', interruptedRollback, '--variant', 'shared-runtime.pinned', '--lifecycle', 'maintenance', '--source', root], { home: rollbackHome });
  run(['migrate', 'v3-apply', '--target', interruptedRollback, '--variant', 'shared-runtime.pinned', '--lifecycle', 'maintenance', '--source', root, '--digest', rollbackPreview.plan_digest], { home: rollbackHome });
  run(['migrate', 'v3-rollback', '--target', interruptedRollback], { home: rollbackHome, expect: 86, extraEnv: { APG_TEST_HARD_FAILPOINT: failpoint } });
  const rollbackActiveFile = path.join(interruptedRollback, '.agent-guides-rollback', 'active.json');
  if (failpoint === 'rollback-after-descriptor-restore') {
    const activeBytes = fs.readFileSync(rollbackActiveFile);
    const forgedActive = JSON.parse(activeBytes);
    forgedActive.recovery.root.base64 = Buffer.from('forged root\n').toString('base64');
    fs.writeFileSync(rollbackActiveFile, canonicalJson(forgedActive));
    assert.equal(run(['migrate', 'v3-rollback', '--target', interruptedRollback], { home: rollbackHome, expect: 2 }).error, 'migration_conflict');
    fs.writeFileSync(rollbackActiveFile, activeBytes);
  }
  if (failpoint === 'rollback-after-root-restore') {
    const restoredRoot = fs.readFileSync(path.join(interruptedRollback, 'AGENTS.md'));
    fs.appendFileSync(path.join(interruptedRollback, 'AGENTS.md'), '\nProject edit after rollback crash.\n');
    assert.equal(run(['migrate', 'v3-rollback', '--target', interruptedRollback], { home: rollbackHome, expect: 2 }).error, 'migration_conflict');
    fs.writeFileSync(path.join(interruptedRollback, 'AGENTS.md'), restoredRoot);
  }
  if (failpoint === 'rollback-after-guides-move') {
    const backupEdit = path.join(interruptedRollback, '.agent-guides-rollback', 'guides', 'project-after-crash.txt');
    fs.writeFileSync(backupEdit, 'project-owned\n');
    assert.equal(run(['migrate', 'v3-rollback', '--target', interruptedRollback], { home: rollbackHome, expect: 2 }).error, 'migration_conflict');
    assert.equal(fs.readFileSync(backupEdit, 'utf8'), 'project-owned\n');
    fs.rmSync(backupEdit);
  }
  if (failpoint === 'rollback-after-guides-remove') {
    const activeBytes = fs.readFileSync(rollbackActiveFile);
    const reboundActive = JSON.parse(activeBytes);
    reboundActive.recovery.root.base64 = Buffer.from('rebound root\n').toString('base64');
    reboundActive.recovery_digest = `sha256:${sha256(canonicalJson(reboundActive.recovery))}`;
    fs.writeFileSync(rollbackActiveFile, canonicalJson(reboundActive));
    assert.equal(run(['migrate', 'v3-rollback', '--target', interruptedRollback], { home: rollbackHome, expect: 2 }).error, 'migration_conflict');
    fs.writeFileSync(rollbackActiveFile, activeBytes);
  }
  assert.equal(run(['migrate', 'v3-rollback', '--target', interruptedRollback], { home: rollbackHome }).status, 'rolled_back');
  assert.deepEqual(treeSnapshot(interruptedRollback), rollbackBefore);
}

const selfHost = run(['migrate', 'v3-preview', '--target', root, '--variant', 'selected-inline.none', '--lifecycle', 'maintenance', '--source', root]);
assert.equal(selfHost.applicable, false);
assert.equal(selfHost.blockers[0].code, 'source-worktree-full-corpus');

console.log('APG 3.0 minimal vertical slice tests passed.');

#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { canonicalJson, sha256 } from '../lib/core.mjs';
import { installSharedLauncher, createGenerationReference, saveGenerationReference, readGenerationKey } from '../lib/provider.mjs';
import { createHmac } from 'node:crypto';
import { compileContext, renderContext } from '../lib/context.mjs';
import { contextErrorRecord } from '../lib/context-errors.mjs';

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

function runCommand(command, args, { cwd, home, expect = 0, raw = false } = {}) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', env: { ...process.env, AGENT_PROJECT_GUIDES_HOME: home } });
  assert.equal(result.status, expect, `command failed: ${command} ${args.join(' ')}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);
  const text = expect === 0 ? result.stdout : result.stderr;
  if (raw) return text;
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

function assertCompact(text, status) {
  assert.ok(text.startsWith('APG context: '));
  assert.ok(text.includes(`Status: ${status}`));
  assert.match(text, /Authority granted: false/);
  assert.doesNotMatch(text, /^Sources:|^Route resolved:|^Union loaded:/m);
  assert.doesNotMatch(text, /sha256:[0-9a-f]{64}|"route_hash"|"budgets"|eyJ[A-Za-z0-9_-]{100,}/);
}

function assertSourcesPresent(text, result) {
  for (const source of result.selected_sources) assert.ok(text.includes(`[${source.id}]\n${source.content.trimEnd()}`), `missing source: ${source.id}`);
  for (const id of result.mandatory_ids) assert.ok(text.includes(id), `missing mandatory ID: ${id}`);
}

function reportCompactCost(fixture, compact, diagnostic) {
  assert.equal(diagnostic.selected_sources.length, 0, 'cost fixture must exclude canonical content');
  const contextBytes = Buffer.byteLength(compact.trimEnd() + '\n');
  const jsonBytes = Buffer.byteLength(canonicalJson(diagnostic));
  console.log(JSON.stringify({ fixture, choices: diagnostic.choices.length, canonical_content_bytes: 0, context_bytes: contextBytes, json_bytes: jsonBytes,
    context_token_estimate: Math.ceil(contextBytes / 4), json_token_estimate: Math.ceil(jsonBytes / 4), estimator: 'utf8-bytes/4-ceiling',
    reduction_percent: Number((100 * (1 - contextBytes / jsonBytes)).toFixed(1)) }));
}

const baseArgs = [
  '--lifecycle', 'maintenance',
  '--profiles', 'content-package',
  '--overlays', 'agent-governance',
  '--mandatory', 'profile:content-package#5-verification-preset',
];

const errorDigest = `sha256:${'a'.repeat(64)}`;
const errorGeneration = `${'eyJ'.repeat(40)}.${'b'.repeat(64)}`;
const diagnosticError = { code: 'generation_mismatch', message: `Invalid ${errorGeneration} for ${errorDigest}`, details: { failed_field: 'mode', allowed_values: ['deploy', 'restart'], expected: errorDigest, generation: errorGeneration } };
for (const args of [['context'], ['context', '--format', 'context']]) {
  const projected = contextErrorRecord(diagnosticError, args);
  assert.equal(projected.error, diagnosticError.code);
  assert.equal(projected.field, 'mode');
  assert.deepEqual(projected.allowed, ['deploy', 'restart']);
  assert.equal('details' in projected, false);
  assert.ok(projected.next);
  assert.ok(!JSON.stringify(projected).includes(errorDigest));
  assert.ok(!JSON.stringify(projected).includes(errorGeneration));
}
for (const args of [['context', '--format', 'json'], ['project', 'validate']]) {
  assert.deepEqual(contextErrorRecord(diagnosticError, args), { error: diagnosticError.code, message: diagnosticError.message, details: diagnosticError.details });
}

assert.match(run([], { raw: true }), /^Agent Project Guides/m);
assert.match(run(['--help'], { raw: true }), /Usage: apg <command>/);
assert.match(run(['context', '--help'], { raw: true }), /--generation <token>/);
assert.equal(run(['--version'], { raw: true }), `${fs.readFileSync(path.join(root, 'PACKAGE_VERSION'), 'utf8').trim()}\n`);
assert.equal(run(['context'], { expect: 2 }).error, 'invalid_arguments');
const foreignRuntime = path.join(temporary, 'foreign-runtime');
fs.mkdirSync(path.join(foreignRuntime, 'scripts'), { recursive: true });
fs.copyFileSync(path.join(root, 'scripts', 'apg-launcher.mjs'), path.join(foreignRuntime, 'scripts', 'apg-launcher.mjs'));
fs.writeFileSync(path.join(foreignRuntime, 'PACKAGE_VERSION'), '9.9.9\n');
const foreignHome = path.join(temporary, 'foreign-home');
const foreignLauncher = installSharedLauncher(foreignRuntime, { ...process.env, AGENT_PROJECT_GUIDES_HOME: foreignHome }).command;
assert.equal(runCommand(foreignLauncher, ['--version'], { cwd: temporary, home: foreignHome, raw: true }), '9.9.9\n');
const legacyAmbiguity = run(['context', '--target', root, '--task', 'inspect this work', '--format', 'json']);
assert.ok(legacyAmbiguity.token_estimate <= 2048);
assert.ok(legacyAmbiguity.budgets.aggregate_tokens <= 4096);
assert.equal(legacyAmbiguity.choices.every((choice) => choice.plane === choice.route.plane && choice.role === choice.route.role && choice.mode === choice.route.mode), true);
assert.equal(legacyAmbiguity.choices.every((choice) => choice.choice_id && choice.route_hash && choice.next_command), true);
const legacyCostCompact = run(['context', '--target', root, '--task', 'inspect this work'], { raw: true });
assertCompact(legacyCostCompact, 'clarification_required');
reportCompactCost('schema1-four-choice-no-content', legacyCostCompact, legacyAmbiguity);

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
const activeInlinePreview = run(['project', 'materialize', '--target', project('active-inline-preview'), '--project-id', 'test.active-inline-preview', '--variant', 'selected-inline.none', '--lifecycle', 'active-development', '--profiles', 'mcp']);
assert.equal(activeInlinePreview.applicable, true);
assert.equal(activeInlinePreview.descriptor.documents.roles.includes('production/operator'), false);
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
const inlineCompact = run(['context', '--target', inline, '--role', 'maintainer', '--mode', 'code'], { home: inlineHome, raw: true });
assertCompact(inlineCompact, 'ready');
assertSourcesPresent(inlineCompact, inlineContext);
assert.doesNotMatch(inlineCompact, /--generation|g1_[0-9a-f]{32}/);
assert.equal(inlineContext.budgets.context_tokens, Math.ceil(Buffer.byteLength(inlineCompact.trimEnd() + '\n') / 4));
const unavailableRole = run(['context', '--target', inline, '--role', 'developer', '--mode', 'feature', '--format', 'json'], { home: inlineHome, expect: 2 });
assert.equal(unavailableRole.error, 'route_unresolved');
assert.equal(unavailableRole.details.match_count, 0);
assert.equal(unavailableRole.details.registry_match_count, 1);
assert.equal(unavailableRole.details.failed_field, 'role');
assert.deepEqual(unavailableRole.details.matched_routes, [{ plane: 'development', role: 'developer', plane_match: true, available: false, modes: ['feature', 'initialize'] }]);
const compactInvalidRole = run(['context', '--target', inline, '--role', 'developer', '--mode', 'feature'], { home: inlineHome, expect: 2 });
assert.equal(compactInvalidRole.error, unavailableRole.error);
assert.equal(compactInvalidRole.field, 'role');
assert.equal('details' in compactInvalidRole, false);
assert.doesNotMatch(JSON.stringify(compactInvalidRole), /sha256:[0-9a-f]{64}|eyJ[A-Za-z0-9_-]{100,}/);
const wrongPlaneRole = run(['context', '--target', inline, '--plane', 'production', '--role', 'maintainer', '--mode', 'code', '--format', 'json'], { home: inlineHome, expect: 2 });
assert.equal(wrongPlaneRole.error, 'route_unresolved');
assert.deepEqual(wrongPlaneRole.details.matched_routes, [{ plane: 'development', role: 'maintainer', plane_match: false, available: true, modes: ['code', 'readapt'] }]);
const cjkContext = run(['context', '--target', inline, '--task', '修复缺陷并保持行为', '--format', 'json'], { home: inlineHome });
assert.equal(cjkContext.role, 'maintainer');
const ambiguous = run(['context', '--target', inline, '--task', 'inspect this work', '--format', 'json'], { home: inlineHome });
assert.equal(ambiguous.status, 'clarification_required');
assert.equal(ambiguous.union_loaded, false);
assert.equal(ambiguous.choices.every((choice) => choice.conflict_reason === 'no lexical routing rule matched the request'), true);
assert.deepEqual(ambiguous.mandatory_ids, ['profile:content-package#5-verification-preset']);
assert.deepEqual(ambiguous.selected_sources.map((source) => source.id), ambiguous.mandatory_ids);
assert.ok(ambiguous.token_estimate <= inlineDescriptor.context.clarification_max_tokens);
assert.ok(ambiguous.budgets.aggregate_tokens <= inlineDescriptor.context.max_tokens);
const inlineChoiceCompact = run(['context', '--target', inline, '--task', 'inspect this work'], { home: inlineHome, raw: true });
assertCompact(inlineChoiceCompact, 'clarification_required');
assertSourcesPresent(inlineChoiceCompact, ambiguous);
assert.match(inlineChoiceCompact, /Mandatory: profile:content-package#5-verification-preset/);
assert.equal(ambiguous.source_observation.model_effective, 'unknown');
for (const choice of ambiguous.choices) assert.ok(inlineChoiceCompact.includes(choice.next_command));
assert.ok(Buffer.byteLength(inlineChoiceCompact) < Buffer.byteLength(canonicalJson(ambiguous)));
const mixed = run(['context', '--target', inline, '--task', 'implement and review this change', '--format', 'json'], { home: inlineHome });
assert.equal(mixed.status, 'clarification_required');
assert.equal(mixed.choices.flatMap((choice) => choice.matched_rules).some((rule) => rule.startsWith('protected-pattern:')), false);
const protectedChoice = run(['context', '--target', inline, '--task', 'deploy this release to production', '--format', 'json'], { home: inlineHome });
assert.equal(protectedChoice.kind, 'protected');
assert.equal(protectedChoice.authority_granted, false);
assert.equal(protectedChoice.route_resolved, false);
assert.equal(protectedChoice.choices.every((choice) => inlineDescriptor.documents.roles.includes(`${choice.route.plane}/${choice.route.role}`)), true);
assert.ok(protectedChoice.required_expansion.some((route) => route.plane === 'production' && route.role === 'operator'));
assert.equal(protectedChoice.union_loaded, false);
const productChoice = run(['context', '--target', inline, '--task', 'use product through public api', '--format', 'json'], { home: inlineHome });
assert.equal(productChoice.kind, 'ordinary-ambiguity');
assert.ok(productChoice.required_expansion.some((route) => route.plane === 'production' && route.role === 'user'));
assert.equal(productChoice.choices.every((choice) => choice.choice_id && choice.route && choice.route_hash && choice.next_command), true);

// Real multi-profile projects require more than the original 3072-token aggregate while remaining bounded by 4096.
const wideContextProject = project('wide-context');
const wideHome = path.join(temporary, 'wide-home');
run(['project', 'materialize', '--target', wideContextProject, '--project-id', 'test.wide-context', '--variant', 'shared-runtime.pinned', '--lifecycle', 'active-development', '--profiles', 'mcp,monorepo-composition', '--overlays', 'agent-governance', '--apply'], { home: wideHome });
const wideDescriptor = JSON.parse(fs.readFileSync(path.join(wideContextProject, '.agent-project-guides.json'), 'utf8'));
assert.ok(wideDescriptor.documents.roles.includes('production/operator'));
const wideContext = run(['context', '--target', wideContextProject, '--role', 'maintainer', '--mode', 'code', '--format', 'json'], { home: wideHome });
assert.equal(wideDescriptor.context.max_tokens, 4096);
assert.ok(wideContext.budgets.aggregate_tokens > 3072);
assert.ok(wideContext.budgets.aggregate_tokens <= wideDescriptor.context.max_tokens);
const wideOperator = run(['context', '--target', wideContextProject, '--plane', 'production', '--role', 'operator', '--mode', 'deploy', '--format', 'json'], { home: wideHome });
assert.equal(wideOperator.route_resolved, true);
assert.equal(wideOperator.authority_granted, false);
const wideAmbiguous = run(['context', '--target', wideContextProject, '--task', 'inspect this work', '--format', 'json'], { home: wideHome });
assert.equal(wideAmbiguous.choices.length, 4);
assert.equal(wideAmbiguous.choices_truncated, true);
assert.equal(wideAmbiguous.omitted_choice_ids.length, wideDescriptor.documents.roles.length - 4);
assert.ok(wideAmbiguous.token_estimate <= wideDescriptor.context.clarification_max_tokens);
assert.ok(wideAmbiguous.budgets.aggregate_tokens <= wideDescriptor.context.max_tokens);
const wideCompact = run(['context', '--target', wideContextProject, '--task', 'inspect this work'], { home: wideHome, raw: true });
assertCompact(wideCompact, 'clarification_required');
assert.match(wideCompact, /Choices truncated: true/);
for (const omitted of wideAmbiguous.omitted_choice_ids) assert.ok(wideCompact.includes(omitted));
assert.ok(Buffer.byteLength(wideCompact) < Buffer.byteLength(canonicalJson(wideAmbiguous)) / 2, 'compact clarification should halve diagnostic framing size');
const threeChoiceTask = 'deploy this release to production';
const threeChoiceDiagnostic = run(['context', '--target', wideContextProject, '--task', threeChoiceTask, '--format', 'json'], { home: wideHome });
const threeChoiceCompact = run(['context', '--target', wideContextProject, '--task', threeChoiceTask], { home: wideHome, raw: true });
assertCompact(threeChoiceCompact, 'clarification_required');
assert.equal(threeChoiceDiagnostic.choices.length, 3);
reportCompactCost('shared-three-choice-no-content', threeChoiceCompact, threeChoiceDiagnostic);

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
assert.match(runCommand(launcher, [], { cwd: temporary, home: sharedHome, raw: true }), /Usage: apg <command>/);
assert.match(runCommand(launcher, ['--help'], { cwd: temporary, home: sharedHome, raw: true }), /Usage: apg <command>/);
assert.match(runCommand(launcher, ['context', '--help'], { cwd: temporary, home: sharedHome, raw: true }), /--select <choice_id>/);
assert.equal(runCommand(launcher, ['--version'], { cwd: temporary, home: sharedHome, raw: true }), `${fs.readFileSync(path.join(root, 'PACKAGE_VERSION'), 'utf8').trim()}\n`);
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
const sharedAmbiguous = runCommand(launcher, ['context', '--target', shared, '--task', 'inspect this work', '--format', 'json'], { cwd: shared, home: sharedHome });
assert.equal(sharedAmbiguous.choices.length, sharedDescriptor.documents.roles.length);
assert.equal(sharedAmbiguous.choices_truncated, false);
assert.ok(sharedAmbiguous.token_estimate <= sharedDescriptor.context.clarification_max_tokens);
assert.ok(sharedAmbiguous.budgets.aggregate_tokens <= sharedDescriptor.context.max_tokens);
assert.equal(sharedAmbiguous.choices.every((choice) => choice.next_command.includes(sharedAmbiguous.generation)), true);
const sharedStateBeforeCompactReady = treeSnapshot(path.join(sharedHome, 'state'));
const sharedReadyCompact = runCommand(launcher, ['context', '--target', shared, '--role', 'maintainer', '--mode', 'code'], { cwd: temporary, home: sharedHome, raw: true });
assertCompact(sharedReadyCompact, 'ready');
assertSourcesPresent(sharedReadyCompact, sharedContext);
assert.doesNotMatch(sharedReadyCompact, /--generation|g1_[0-9a-f]{32}/);
assert.deepEqual(treeSnapshot(path.join(sharedHome, 'state')), sharedStateBeforeCompactReady, 'ready context must not write state');
const sharedCompact = runCommand(launcher, ['context', '--target', shared, '--task', 'inspect this work'], { cwd: temporary, home: sharedHome, raw: true });
assertCompact(sharedCompact, 'clarification_required');
assertSourcesPresent(sharedCompact, sharedAmbiguous);
assert.ok(sharedCompact.includes(`--target '${shared}'`));
assert.match(sharedCompact, /--generation g3_[A-Za-z0-9_-]{27} --select /);
assert.ok(!sharedCompact.includes(sharedAmbiguous.generation));
const stateBeforeDiagnostic = treeSnapshot(path.join(sharedHome, 'state'));
runCommand(launcher, ['context', '--target', shared, '--task', 'inspect this work', '--format', 'json'], { cwd: shared, home: sharedHome });
assert.deepEqual(treeSnapshot(path.join(sharedHome, 'state')), stateBeforeDiagnostic, 'diagnostic JSON must not write short-reference state');
const compilerRequest = {
  task: 'inspect this work', target: shared, format: 'context',
  generationKey: readGenerationKey({ ...process.env, AGENT_PROJECT_GUIDES_HOME: sharedHome }),
  contextReference: createGenerationReference(),
};
// Multi-profile consumers must fit initialization/readaptation without raising budgets.
for (const profiles of [['cli', 'library'], ['mcp', 'monorepo-composition']]) {
  const combined = structuredClone(sharedDescriptor);
  combined.documents.profiles = profiles;
  combined.documents.roles = ['development/developer', 'development/maintainer', 'development/reviewer', 'development/verifier'];
  combined.documents.overlays = ['agent-governance'];
  combined.policy.mandatory = [];
  for (const [role, mode] of [['developer', 'initialize'], ['maintainer', 'readapt']]) {
    for (const format of ['context', 'json']) {
      const result = compileContext(root, combined, { plane: 'development', role, mode, format, generationKey: compilerRequest.generationKey });
      assert.equal(result.status, 'ready');
      assert.ok(result.budgets.aggregate_tokens <= 4096);
      assert.ok(result.selected_ids.includes('procedure:package-adaptation'));
      for (const profile of profiles) assert.ok(result.selected_ids.includes(`profile:${profile}`));
    }
  }
}
const compilerStateBefore = treeSnapshot(path.join(sharedHome, 'state'));
const compactCompiled = compileContext(root, sharedDescriptor, compilerRequest);
assert.equal(compactCompiled.budgets.context_tokens, Math.ceil(Buffer.byteLength(renderContext(compactCompiled)) / 4));
assert.equal(compactCompiled.budgets.aggregate_tokens, compactCompiled.budgets.context_tokens);
assertSourcesPresent(renderContext(compactCompiled), compactCompiled);
const narrowBudgetDescriptor = structuredClone(sharedDescriptor);
narrowBudgetDescriptor.context.max_tokens = compactCompiled.budgets.context_tokens + 1;
assert.ok(narrowBudgetDescriptor.context.max_tokens < compactCompiled.budgets.json_tokens);
assert.equal(compileContext(root, narrowBudgetDescriptor, compilerRequest).status, 'clarification_required');
assert.throws(() => compileContext(root, narrowBudgetDescriptor, { ...compilerRequest, format: 'json' }), (error) => error.code === 'context_budget_exceeded' && error.details.checked_format === 'json');
const impossibleBudgetDescriptor = structuredClone(sharedDescriptor);
impossibleBudgetDescriptor.context.max_tokens = 256;
assert.ok(compactCompiled.budgets.context_tokens > impossibleBudgetDescriptor.context.max_tokens, 'fixture must exceed the smallest legal context budget');
assert.throws(() => compileContext(root, impossibleBudgetDescriptor, compilerRequest), (error) => error.code === 'context_budget_exceeded');
assert.deepEqual(treeSnapshot(path.join(sharedHome, 'state')), compilerStateBefore, 'successful and over-budget compiler calls must not create state');
const continued = runCommand(launcher, ['context', '--target', shared, '--role', 'maintainer', '--mode', 'code', '--format', 'json', '--generation', sharedContext.generation], { cwd: shared, home: sharedHome });
assert.equal(continued.generation, sharedContext.generation);
const [encodedGeneration] = sharedContext.generation.split('.');
const forgedGenerationPayload = JSON.parse(Buffer.from(encodedGeneration, 'base64url').toString('utf8'));
forgedGenerationPayload.expires_at_ms += 86_400_000;
const forgedGenerationEncoded = Buffer.from(canonicalJson(forgedGenerationPayload)).toString('base64url');
const publiclyResignedGeneration = `${forgedGenerationEncoded}.${sha256(forgedGenerationEncoded)}`;
assert.equal(runCommand(launcher, ['context', '--target', shared, '--role', 'maintainer', '--mode', 'code', '--format', 'json', '--generation', publiclyResignedGeneration], { cwd: shared, home: sharedHome, expect: 2 }).error, 'generation_mismatch');
assert.equal(runCommand(launcher, ['context', '--target', shared, '--role', 'maintainer', '--mode', 'code', '--format', 'json', '--generation', `${sharedContext.generation}x`], { cwd: shared, home: sharedHome, expect: 2 }).error, 'generation_mismatch');

// Operator routes expose six exact modes, remain authority-neutral, and round-trip generation-bound choices.
const operations = project('operations');
const operationsHome = path.join(temporary, 'operations-home');
run(['project', 'materialize', '--target', operations, '--project-id', 'test.operations', '--variant', 'shared-runtime.pinned', '--lifecycle', 'operations-only', '--profiles', 'mcp', '--apply'], { home: operationsHome });
const operationsLauncher = path.join(operationsHome, 'bin', 'apg');
const operatorModes = ['observe-health', 'deploy', 'configure', 'restart', 'recover', 'rollback'];
const legacyOperatorModes = ['deploy-configure', 'incident', 'backup-recovery'];
for (const legacyMode of legacyOperatorModes) {
  const legacyRoute = run(['provider', 'resolve', '--target', root, '--plane', 'production', '--role', 'operator', '--mode', legacyMode]);
  assert.equal(legacyRoute.mode, legacyMode);
}
let stableOperator;
for (const operatorMode of operatorModes) {
  const routed = runCommand(operationsLauncher, ['context', '--target', operations, '--plane', 'production', '--role', 'operator', '--mode', operatorMode, '--task', 'implement source changes instead', '--format', 'json'], { cwd: operations, home: operationsHome });
  assert.equal(routed.status, 'ready');
  assert.equal(routed.route_resolved, true);
  assert.equal(routed.authority_granted, false);
  assert.deepEqual(routed.route, { plane: 'production', role: 'operator', mode: operatorMode });
  if (operatorMode === 'deploy') stableOperator = routed;
}
for (const [task, expectedMode] of [['configure service settings', 'configure'], ['restart service', 'restart']]) {
  const inferredOperator = runCommand(operationsLauncher, ['context', '--target', operations, '--task', task, '--format', 'json'], { cwd: operations, home: operationsHome });
  assert.equal(inferredOperator.status, 'ready');
  assert.equal(inferredOperator.mode, expectedMode);
}
const inferredPlaneOperator = runCommand(operationsLauncher, ['context', '--target', operations, '--role', 'operator', '--mode', 'deploy', '--format', 'json'], { cwd: operations, home: operationsHome });
assert.deepEqual(inferredPlaneOperator.route, { plane: 'production', role: 'operator', mode: 'deploy' });
const canonicalOperator = runCommand(operationsLauncher, ['context', '--target', operations, '--role', 'production/operator', '--mode', 'observe-health', '--format', 'json'], { cwd: operations, home: operationsHome });
assert.deepEqual(canonicalOperator.route, { plane: 'production', role: 'operator', mode: 'observe-health' });
const stableOperatorAgain = runCommand(operationsLauncher, ['context', '--target', operations, '--plane', 'production', '--role', 'operator', '--mode', 'deploy', '--format', 'json'], { cwd: operations, home: operationsHome });
assert.equal(stableOperatorAgain.route_hash, stableOperator.route_hash);
assert.deepEqual(stableOperatorAgain.selected_sources.map(({ id, hash }) => ({ id, hash })), stableOperator.selected_sources.map(({ id, hash }) => ({ id, hash })));
const invalidOperatorMode = runCommand(operationsLauncher, ['context', '--target', operations, '--plane', 'production', '--role', 'operator', '--mode', 'invalid', '--format', 'json'], { cwd: operations, home: operationsHome, expect: 2 });
assert.equal(invalidOperatorMode.error, 'route_unresolved');
assert.equal(invalidOperatorMode.details.failed_field, 'mode');
assert.equal(invalidOperatorMode.details.match_count, 0);
assert.equal(invalidOperatorMode.details.role_match_count, 1);
assert.equal(invalidOperatorMode.details.matched_routes.length, operatorModes.length);
assert.deepEqual(invalidOperatorMode.details.allowed_values, operatorModes);
const compactInvalidMode = runCommand(operationsLauncher, ['context', '--target', operations, '--plane', 'production', '--role', 'operator', '--mode', 'invalid'], { cwd: temporary, home: operationsHome, expect: 2 });
assert.equal(compactInvalidMode.error, invalidOperatorMode.error);
assert.equal(compactInvalidMode.field, 'mode');
assert.deepEqual(compactInvalidMode.allowed, operatorModes);
assert.equal('details' in compactInvalidMode, false);
assert.doesNotMatch(JSON.stringify(compactInvalidMode), /sha256:[0-9a-f]{64}|eyJ[A-Za-z0-9_-]{100,}/);
const legacyModeInV3 = runCommand(operationsLauncher, ['context', '--target', operations, '--plane', 'production', '--role', 'operator', '--mode', 'incident', '--format', 'json'], { cwd: operations, home: operationsHome, expect: 2 });
assert.equal(legacyModeInV3.error, 'route_unresolved');
assert.deepEqual(legacyModeInV3.details.allowed_values, operatorModes);
const operatorChoiceResponse = runCommand(operationsLauncher, ['context', '--target', operations, '--task', 'deploy this release to production', '--format', 'json'], { cwd: operations, home: operationsHome });
const deployChoice = operatorChoiceResponse.choices.find((choice) => choice.choice_id === 'production.operator.deploy');
assert.ok(deployChoice);
assert.equal(deployChoice.route_hash, stableOperator.route_hash);
assert.ok(deployChoice.matched_rules.includes('mode-pattern:deploy'));
const compoundOperatorChoices = runCommand(operationsLauncher, ['context', '--target', operations, '--task', 'rollback this deployment', '--format', 'json'], { cwd: operations, home: operationsHome });
assert.ok(compoundOperatorChoices.choices.some((choice) => choice.choice_id === 'production.operator.deploy'));
assert.ok(compoundOperatorChoices.choices.some((choice) => choice.choice_id === 'production.operator.rollback'));
for (const [task, choiceId] of [['restart production service', 'production.operator.restart'], ['recover production database', 'production.operator.recover']]) {
  const protectedModes = runCommand(operationsLauncher, ['context', '--target', operations, '--task', task, '--format', 'json'], { cwd: operations, home: operationsHome });
  assert.ok(protectedModes.choices.some((choice) => choice.choice_id === choiceId));
}
assert.match(deployChoice.next_command, /--generation \S+ --select production\.operator\.deploy/);
const directChoice = spawnSync('sh', ['-c', deployChoice.next_command], { cwd: operations, encoding: 'utf8', env: { ...process.env, AGENT_PROJECT_GUIDES_HOME: operationsHome, PATH: `${path.join(operationsHome, 'bin')}${path.delimiter}${process.env.PATH || ''}` } });
assert.equal(directChoice.status, 0, directChoice.stderr);
assert.match(directChoice.stdout, /APG context: production\/operator \(deploy\)/);
assert.match(directChoice.stdout, /Authority granted: false/);
const selectedOperator = runCommand(operationsLauncher, ['context', '--target', operations, '--generation', operatorChoiceResponse.generation, '--select', deployChoice.choice_id, '--task', 'review code only', '--format', 'json'], { cwd: operations, home: operationsHome });
assert.equal(selectedOperator.status, 'ready');
assert.equal(selectedOperator.selection_reason.kind, 'generation-choice');
assert.equal(selectedOperator.route_hash, deployChoice.route_hash);
assert.equal(selectedOperator.authority_granted, false);
const wrongChoice = runCommand(operationsLauncher, ['context', '--target', operations, '--generation', operatorChoiceResponse.generation, '--select', 'production.operator.rollback', '--format', 'json'], { cwd: operations, home: operationsHome, expect: 2 });
assert.equal(wrongChoice.error, 'choice_unresolved');
const bypassChoice = runCommand(operationsLauncher, ['context', '--target', operations, '--generation', operatorChoiceResponse.generation, '--plane', 'production', '--role', 'operator', '--mode', 'rollback', '--format', 'json'], { cwd: operations, home: operationsHome, expect: 2 });
assert.equal(bypassChoice.error, 'selection_required');

// Opaque continuations preserve signed choices without exposing payloads in default context.
const operationsEnv = { ...process.env, AGENT_PROJECT_GUIDES_HOME: operationsHome };
const compactOperations = runCommand(operationsLauncher, ['context', '--target', operations, '--task', 'deploy this release to production'], { cwd: temporary, home: operationsHome, raw: true });
assertCompact(compactOperations, 'clarification_required');
const compactTokens = [...compactOperations.matchAll(/--generation (g3_[A-Za-z0-9_-]{27}) --select ([\w.-]+)/g)];
assert.equal(compactTokens.length, operatorChoiceResponse.choices.length);
assert.equal(new Set(compactTokens.map(match => match[1])).size, compactTokens.length, 'each ticket binds one choice');
const compactDeploy = compactTokens.find(match => match[2] === 'production.operator.deploy')[1];
assert.equal(fs.existsSync(path.join(operationsHome, 'state', 'generation-handles')), false, 'context must never create reference storage');
const stateBeforeReadOnly = treeSnapshot(path.join(operationsHome, 'state'));
const readOnlyArgs = ['--permission', '--allow-fs-read=*', path.join(operationsHome, 'bin', 'apg-launcher.mjs')];
const readOnly = spawnSync(process.execPath, [...readOnlyArgs, 'context', '--target', operations, '--task', 'deploy release'], { cwd: temporary, env: operationsEnv, encoding: 'utf8' });
assert.equal(readOnly.status, 0, readOnly.stderr);
assertCompact(readOnly.stdout, 'clarification_required');
const readOnlyMatch = readOnly.stdout.match(/--generation (g3_[A-Za-z0-9_-]{27}) --select ([\w.-]+)/);
const readOnlyContinued = spawnSync(process.execPath, [...readOnlyArgs, 'context', '--target', operations, '--generation', readOnlyMatch[1], '--select', readOnlyMatch[2]], { cwd: temporary, env: operationsEnv, encoding: 'utf8' });
assert.equal(readOnlyContinued.status, 0, readOnlyContinued.stderr);
assertCompact(readOnlyContinued.stdout, 'ready');
assert.deepEqual(treeSnapshot(path.join(operationsHome, 'state')), stateBeforeReadOnly);
// Previously issued g1 references remain readable, but are no longer emitted.
const reference = createGenerationReference();
saveGenerationReference(reference, operatorChoiceResponse.generation, operations, operationsEnv);
const handleDirectory = path.join(operationsHome, 'state', 'generation-handles');
const handleFile = path.join(handleDirectory, `${reference}.json`);
assert.equal(fs.statSync(handleDirectory).mode & 0o777, 0o700);
assert.equal(fs.statSync(handleFile).mode & 0o777, 0o600);
const handleBytes = fs.readFileSync(handleFile);
const handleRecord = JSON.parse(handleBytes);
assert.match(handleRecord.generation, /^[A-Za-z0-9_-]+\.[0-9a-f]{64}$/);
assert.ok(!compactOperations.includes(handleRecord.generation));
const continueReference = (value, { target = operations, choice = 'production.operator.deploy', expect = 0 } = {}) => runCommand(operationsLauncher, ['context', '--target', target, '--generation', value, '--select', choice, '--format', 'json'], { cwd: temporary, home: operationsHome, expect });
assert.equal(continueReference(compactDeploy).status, 'ready');
assert.equal(continueReference(compactDeploy, { choice: 'production.operator.rollback', expect: 2 }).error, 'generation_mismatch');
assert.equal(continueReference(compactDeploy + 'x', { expect: 2 }).error, 'generation_mismatch');
const shortSelected = continueReference(reference);
assert.equal(shortSelected.status, 'ready');
assert.equal(shortSelected.route_hash, deployChoice.route_hash);
assert.equal(shortSelected.authority_granted, false);
assert.equal(continueReference(reference, { choice: 'production.operator.rollback', expect: 2 }).error, 'choice_unresolved');
const compactCommand = compactOperations.split('\n').map((line) => line.trim().replace(/^-\s+/, '')).find((line) => line.startsWith('apg context ') && line.endsWith('--select production.operator.deploy'));
const compactRoundTrip = spawnSync('sh', ['-c', compactCommand], { cwd: temporary, encoding: 'utf8', env: { ...operationsEnv, PATH: `${path.join(operationsHome, 'bin')}${path.delimiter}${process.env.PATH || ''}` } });
assert.equal(compactRoundTrip.status, 0, compactRoundTrip.stderr);
assertCompact(compactRoundTrip.stdout, 'ready');
assert.equal(continueReference('g1_' + '0'.repeat(32), { expect: 2 }).error, 'generation_reference_missing');
assert.equal(continueReference(reference + 'x', { expect: 2 }).error, 'generation_mismatch');
const clonedOperations = project('operations-clone');
fs.cpSync(operations, clonedOperations, { recursive: true });
assert.equal(continueReference(compactDeploy, { target: clonedOperations, expect: 2 }).error, 'generation_mismatch');
assert.equal(continueReference(reference, { target: clonedOperations, expect: 2 }).error, 'generation_mismatch', 'same project descriptor in another root cannot reuse short reference');
fs.writeFileSync(handleFile, JSON.stringify({ ...handleRecord, project_root: clonedOperations }));
assert.equal(continueReference(reference, { expect: 2 }).error, 'generation_mismatch');
fs.writeFileSync(handleFile, handleBytes);
const substitutedReference = createGenerationReference();
const substitutedFile = path.join(handleDirectory, `${substitutedReference}.json`);
fs.copyFileSync(handleFile, substitutedFile);
assert.equal(continueReference(substitutedReference, { expect: 2 }).error, 'generation_mismatch', 'state cannot be replayed under another reference');
fs.rmSync(substitutedFile);
fs.symlinkSync(handleFile, substitutedFile);
assert.equal(continueReference(substitutedReference, { expect: 2 }).error, 'generation_reference_missing');
fs.rmSync(substitutedFile);
fs.chmodSync(handleDirectory, 0o755);
assert.equal(continueReference(reference, { expect: 2 }).error, 'generation_reference_missing');
fs.chmodSync(handleDirectory, 0o700);
fs.chmodSync(handleFile, 0o644);
assert.equal(continueReference(reference, { expect: 2 }).error, 'generation_reference_missing');
fs.chmodSync(handleFile, 0o600);
fs.renameSync(handleFile, `${handleFile}.saved`);
assert.equal(continueReference(reference, { expect: 2 }).error, 'generation_reference_missing');
fs.renameSync(`${handleFile}.saved`, handleFile);

// Synthetic valid signatures isolate expiry/project/view verification from envelope tamper rejection.
const syntheticKey = readGenerationKey(operationsEnv);
for (const [patch, expected] of [
  [{ expires_at_ms: 1 }, 'generation_expired'],
  [{ project_id: 'test.other-project' }, 'generation_mismatch'],
  [{ selected_view_revision: `sha256:${'0'.repeat(64)}` }, 'generation_mismatch'],
]) {
  const payload = JSON.parse(Buffer.from(handleRecord.generation.split('.')[0], 'base64url').toString('utf8'));
  const encoded = Buffer.from(canonicalJson({ ...payload, ...patch })).toString('base64url');
  const signed = `${encoded}.${createHmac('sha256', syntheticKey).update(encoded).digest('hex')}`;
  const syntheticReference = createGenerationReference();
  saveGenerationReference(syntheticReference, signed, operations, operationsEnv);
  assert.equal(continueReference(syntheticReference, { expect: 2 }).error, expected);
}
assert.equal(continueReference(reference).status, 'ready', 'negative fixtures must preserve the original continuation');

const runtimeBackup = `${runtimeRoot}.missing`;
fs.renameSync(runtimeRoot, runtimeBackup);
const diagnosticMissingRuntime = runCommand(launcher, ['context', '--target', shared, '--role', 'maintainer', '--mode', 'code', '--format', 'json'], { cwd: shared, home: sharedHome, expect: 2 });
assert.match(diagnosticMissingRuntime.message, /packed runtime is missing/);
const compactMissingRuntime = runCommand(launcher, ['context', '--target', shared, '--role', 'maintainer', '--mode', 'code'], { cwd: shared, home: sharedHome, expect: 2 });
assert.equal(compactMissingRuntime.error, diagnosticMissingRuntime.error);
assert.match(compactMissingRuntime.message, /packed runtime is missing/);
assert.doesNotMatch(JSON.stringify(compactMissingRuntime), /sha256[:-][0-9a-f]{64}|[0-9a-f]{64}|eyJ[A-Za-z0-9_-]{100,}/);
assert.equal('details' in compactMissingRuntime, false);
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

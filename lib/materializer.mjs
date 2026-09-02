import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  UserError,
  buildFileManifest,
  canonicalJson,
  normalizeRelative,
  readJson,
  sha256,
} from './core.mjs';
import { buildSelectedClosure } from './closure.mjs';
import { defaultV3Descriptor, validateV3Descriptor } from './descriptor-v3.mjs';
import { inspectV3Root, previewV3Root, renderCliBlock, renderInlineBlock, renderTransitionBlock } from './bootstrap-v3.mjs';
import { buildPackedRuntimeArtifact, installPackedRuntime, installSharedLauncher, observeSourceState, openPackedRuntime } from './provider.mjs';

const DESCRIPTOR = '.agent-project-guides.json';
const GUIDES = '.agent-guides';
const TRANSITION = '.agent-guides-transition';

function snapshot(file) {
  const stat = fs.lstatSync(file, { throwIfNoEntry: false });
  if (!stat) return { exists: false, hash: 'missing', base64: '', mode: null };
  if (stat.isSymbolicLink() || !stat.isFile()) throw new UserError(`materializer path is not a regular file: ${file}`, 'materialization_conflict');
  const bytes = fs.readFileSync(file);
  return { exists: true, hash: `sha256:${sha256(bytes)}`, base64: bytes.toString('base64'), mode: stat.mode & 0o777 };
}

function fsyncDirectory(directory) {
  const descriptor = fs.openSync(directory, 'r');
  try { fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
}

function writeBytesDurable(file, bytes, mode = 0o644) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
  const descriptor = fs.openSync(temporary, 'wx', mode);
  try {
    fs.writeFileSync(descriptor, bytes);
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  fs.renameSync(temporary, file);
  fsyncDirectory(path.dirname(file));
}

function writeJsonDurable(file, value, mode = 0o600) {
  writeBytesDurable(file, Buffer.from(canonicalJson(value)), mode);
}

function appendJournal(file, event) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const descriptor = fs.openSync(file, 'a', 0o600);
  try {
    fs.writeSync(descriptor, canonicalJson(event));
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  fsyncDirectory(path.dirname(file));
}

function journalEventCount(file, eventName) {
  if (!fs.existsSync(file)) return 0;
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line)).filter((event) => event.event === eventName).length;
}

function failpoint(env, name) {
  if (env.APG_TEST_FAILPOINT === name) throw new UserError(`materializer failpoint: ${name}`, 'test_failpoint');
}

function hardFailpoint(env, name) {
  if (env.APG_TEST_HARD_FAILPOINT === name) process.exit(86);
}

function localLock(projectRoot, { allowReceiptRecovery = false } = {}) {
  const directory = path.join(projectRoot, TRANSITION);
  let created = false;
  if (!fs.existsSync(directory)) {
    try { fs.mkdirSync(directory); created = true; }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
  if (!created && !fs.existsSync(path.join(directory, 'active.json')) && !allowReceiptRecovery) throw new UserError('transition directory appeared without an APG active record', 'materialization_conflict');
  const file = path.join(directory, 'materializer.lock');
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const descriptor = fs.openSync(file, 'wx', 0o600);
      fs.writeSync(descriptor, canonicalJson({ schema_version: 1, pid: process.pid, host: os.hostname() }));
      fs.fsyncSync(descriptor);
      fs.closeSync(descriptor);
      fsyncDirectory(directory);
      return { file, release: () => fs.rmSync(file, { force: true }) };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let stale = false;
      try {
        const owner = readJson(file, 'materializer lock');
        if (owner.host === os.hostname() && Number.isSafeInteger(owner.pid)) {
          try { process.kill(owner.pid, 0); } catch (probe) { stale = probe.code === 'ESRCH'; }
        }
      } catch {
        stale = false;
      }
      if (!stale || attempt > 0) throw new UserError('another materialization is in progress', 'mutation_conflict');
      fs.rmSync(file, { force: true });
    }
  }
  throw new UserError('cannot acquire materializer lock', 'mutation_conflict');
}

function routeJsonl(routes) {
  return routes.map((route) => canonicalJson(route).trimEnd()).join('\n') + '\n';
}

function fileRecord(relative, bytes, owner) {
  return { path: relative, owner, bytes: bytes.length, sha256: `sha256:${sha256(bytes)}` };
}

export function buildGuideFiles(descriptor, closure, sourceState) {
  const output = new Map();
  if (descriptor.variant === 'selected-inline.none') {
    for (const file of closure.files) output.set(file.installed_path, { bytes: file.content, owner: file.owner });
  }
  output.set('ROUTES.jsonl', { bytes: Buffer.from(routeJsonl(closure.routes)), owner: 'core' });
  const manifest = {
    schema_version: 1,
    variant: descriptor.variant,
    release: descriptor.release,
    source_provenance: { kind: 'source-worktree', state: sourceState, immutable_release_claim: false },
    selected_view: closure.selected_view,
    modules: closure.modules,
    source_files: closure.files.map(({ content, ...file }) => ({ ...file, installed: descriptor.variant === 'selected-inline.none' })),
    excluded_optional_modules: closure.excluded_optional_modules,
    materialized_files: [],
    ownership: { managed: 'apg', project: 'project' },
  };
  output.set('.gitignore', { bytes: Buffer.from('local/\n'), owner: 'core' });
  for (const [relative, value] of output) manifest.materialized_files.push(fileRecord(relative, value.bytes, value.owner));
  manifest.materialized_files.sort((left, right) => left.path.localeCompare(right.path));
  manifest.manifest_digest = `sha256:${sha256(canonicalJson(manifest))}`;
  output.set('MANIFEST.json', { bytes: Buffer.from(canonicalJson(manifest)), owner: 'core' });
  return { output, manifest };
}

function directoryRecords(root) {
  const records = [];
  function visit(relative = '') {
    for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const child = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) throw new UserError(`materialized guide contains a symlink: ${child}`, 'materialization_conflict');
      if (entry.isDirectory()) visit(child);
      else if (entry.isFile()) {
        const bytes = fs.readFileSync(path.join(root, child));
        records.push({ path: child, bytes: bytes.length, sha256: `sha256:${sha256(bytes)}` });
      } else throw new UserError(`materialized guide contains unsupported file: ${child}`, 'materialization_conflict');
    }
  }
  visit();
  return records;
}

function expectedGuideRecords(candidate) {
  return [...candidate.guide_files.entries()].map(([relative, value]) => ({
    path: relative,
    bytes: value.bytes.length,
    sha256: `sha256:${sha256(value.bytes)}`,
  })).sort((left, right) => left.path.localeCompare(right.path));
}

function bytesRecord(relative, bytes) {
  return { path: relative, bytes: bytes.length, sha256: `sha256:${sha256(bytes)}` };
}

function verifyGuideTreeStage(root, candidate, metadata = new Map()) {
  const expected = [...expectedGuideRecords(candidate), ...[...metadata.entries()].map(([relative, bytes]) => bytesRecord(relative, bytes))]
    .sort((left, right) => left.path.localeCompare(right.path));
  const actual = directoryRecords(root);
  if (canonicalJson(actual) !== canonicalJson(expected)) throw new UserError('materialized guide tree contains changed or unowned receipt-stage content', 'materialization_conflict', { expected, actual });
}

function verifyGuideTree(root, candidate) {
  if (!fs.statSync(root, { throwIfNoEntry: false })?.isDirectory()) throw new UserError('materialized guide tree is missing', 'materialization_conflict');
  const actual = directoryRecords(root);
  const expected = expectedGuideRecords(candidate);
  if (canonicalJson(actual) !== canonicalJson(expected)) throw new UserError('materialized guide tree differs from candidate', 'materialization_conflict', { expected, actual });
}

function writeGuideStage(stage, candidate) {
  fs.mkdirSync(stage, { recursive: false });
  for (const [relative, value] of candidate.guide_files) writeBytesDurable(path.join(stage, relative), value.bytes);
  verifyGuideTree(stage, candidate);
  fsyncDirectory(stage);
  fsyncDirectory(path.dirname(stage));
}

function defaultRootName(projectRoot, requested) {
  if (requested) return requested;
  return fs.existsSync(path.join(projectRoot, 'AGENTS.md')) ? 'AGENTS.md' : 'AGENTS.md';
}

export function buildMaterializationCandidate(projectRoot, sourceRoot, options) {
  const sourceManifest = buildFileManifest(sourceRoot);
  const sourceState = observeSourceState(sourceRoot);
  const packedArtifact = options.variant === 'shared-runtime.pinned' ? buildPackedRuntimeArtifact(sourceRoot) : undefined;
  const descriptor = defaultV3Descriptor({
    projectId: options.projectId,
    variant: options.variant,
    version: sourceManifest.package_version,
    digest: sourceManifest.digest,
    runtimeDigest: packedArtifact?.manifest.digest,
    lifecycle: options.lifecycle || 'active-development',
    roles: options.roles,
    profiles: options.profiles || [],
    overlays: options.overlays || [],
    mandatory: options.mandatory || [],
    protectedEffects: options.protectedEffects || [],
    rootName: defaultRootName(projectRoot, options.rootName),
    workspace: options.workspace,
    migration: options.migration,
  });
  validateV3Descriptor(descriptor, projectRoot);
  const closure = buildSelectedClosure(sourceRoot, descriptor, { includeContent: true });
  const { output: guideFiles, manifest } = buildGuideFiles(descriptor, closure, sourceState);
  descriptor.integrity.manifest_digest = manifest.manifest_digest;
  const finalBlock = descriptor.variant === 'selected-inline.none' ? renderInlineBlock(descriptor, closure) : renderCliBlock(descriptor);
  descriptor.integrity.root_block_hash = `sha256:${sha256(finalBlock)}`;
  validateV3Descriptor(descriptor, projectRoot);
  const rootBefore = options.rootBefore || snapshot(path.join(projectRoot, descriptor.policy.root));
  const finalRoot = previewV3Root(projectRoot, descriptor, finalBlock, { before: rootBefore, allowV2: options.allowV2 === true });
  const transitionRoot = previewV3Root(projectRoot, descriptor, renderTransitionBlock(descriptor), { before: rootBefore, allowV2: options.allowV2 === true });
  const descriptorBytes = Buffer.from(canonicalJson(descriptor));
  const guideHashes = expectedGuideRecords({ guide_files: guideFiles });
  const generation = {
    schema_version: 1,
    descriptor,
    descriptor_hash: `sha256:${sha256(descriptorBytes)}`,
    root_hash: finalRoot.after_hash,
    guides: guideHashes,
    source_digest: sourceManifest.digest,
  };
  return {
    descriptor,
    descriptor_bytes: descriptorBytes,
    closure,
    manifest,
    guide_files: guideFiles,
    final_root: finalRoot,
    transition_root: transitionRoot,
    generation_digest: `sha256:${sha256(canonicalJson(generation))}`,
    source_manifest: sourceManifest,
    source_state: sourceState,
  };
}

export function previewMaterialization(projectRoot, sourceRoot, options) {
  const descriptorFile = path.join(projectRoot, DESCRIPTOR);
  const guidesRoot = path.join(projectRoot, GUIDES);
  const candidate = buildMaterializationCandidate(projectRoot, sourceRoot, options);
  const conflicts = [];
  if (fs.existsSync(descriptorFile)) conflicts.push({ path: DESCRIPTOR, reason: 'descriptor already exists; use dry-run migration for schema 1 projects' });
  if (fs.existsSync(guidesRoot)) conflicts.push({ path: GUIDES, reason: 'managed guide tree already exists' });
  return {
    dry_run: true,
    applicable: conflicts.length === 0,
    variant: candidate.descriptor.variant,
    generation_digest: candidate.generation_digest,
    source_provenance: { kind: 'source-worktree', state: candidate.source_state, immutable_release_claim: false },
    descriptor: candidate.descriptor,
    selected_closure: {
      modules: candidate.closure.modules,
      files: candidate.closure.files.map(({ content, ...file }) => file),
      excluded_optional_modules: candidate.closure.excluded_optional_modules,
    },
    writes: [DESCRIPTOR, candidate.descriptor.policy.root, `${GUIDES}/MANIFEST.json`, `${GUIDES}/ROUTES.jsonl`, ...(candidate.descriptor.variant === 'selected-inline.none' ? candidate.closure.files.map((file) => `${GUIDES}/${file.installed_path}`) : [])],
    shared_runtime_install: candidate.descriptor.variant === 'shared-runtime.pinned' ? { digest: candidate.descriptor.release.digest, implicit_latest: false } : null,
    conflicts,
    stages_or_commits: false,
  };
}

function activePaths(projectRoot) {
  const directory = path.join(projectRoot, TRANSITION);
  return {
    directory,
    active: path.join(directory, 'active.json'),
    journal: path.join(directory, 'journal.jsonl'),
  };
}

function cleanupTransition(paths) {
  for (const file of [paths.active, paths.journal, path.join(paths.directory, 'materializer.lock')]) fs.rmSync(file, { force: true });
  try { fs.rmdirSync(paths.directory); }
  catch (error) {
    if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(error.code)) throw error;
    if (error.code !== 'ENOENT') return false;
  }
  return true;
}

function assertOwnedTransition(paths) {
  if (!fs.existsSync(paths.directory)) return;
  const allowed = new Set(['active.json', 'journal.jsonl', 'materializer.lock']);
  const unknown = fs.readdirSync(paths.directory).filter((name) => !allowed.has(name));
  if (unknown.length) throw new UserError(`transition directory contains project-owned files: ${unknown.join(', ')}`, 'materialization_conflict');
}

function createActive(projectRoot, candidate, options) {
  return {
    schema_version: 1,
    operation: 'materialize-v3',
    generation_digest: candidate.generation_digest,
    descriptor_before: options.migrationPreview?.preimages.descriptor || snapshot(path.join(projectRoot, DESCRIPTOR)),
    guides_before_exists: options.migrationPreview?.preimages.guides_exists ?? fs.existsSync(path.join(projectRoot, GUIDES)),
    root_before: options.migrationPreview?.preimages.root || candidate.final_root.before,
    migration_plan_digest: options.migrationPreview?.plan_digest,
    migration_descriptor: options.migrationPreview?.proposed_descriptor,
    migration_preimages: options.migrationPreview?.preimages,
    state: 'planned',
  };
}

function verifyPreimages(projectRoot, active, candidate, { allowExistingDescriptor = false } = {}) {
  const descriptorNow = snapshot(path.join(projectRoot, DESCRIPTOR));
  const rootNow = snapshot(candidate.final_root.file);
  if (active.state === 'planned' && (descriptorNow.hash !== active.descriptor_before.hash || ![active.root_before.hash, candidate.transition_root.after_hash].includes(rootNow.hash) || fs.existsSync(path.join(projectRoot, GUIDES)) !== active.guides_before_exists)) {
    throw new UserError('project changed after materialization planning', 'materialization_conflict');
  }
  if ((!allowExistingDescriptor && active.descriptor_before.exists) || active.guides_before_exists) {
    throw new UserError('materializer preimages do not match the requested lifecycle', 'materialization_conflict');
  }
  if (allowExistingDescriptor && !active.descriptor_before.exists) throw new UserError('migration requires an existing schema 1 descriptor', 'materialization_conflict');
  if (candidate.final_root.before.hash !== active.root_before.hash) throw new UserError('root policy preimage changed before materialization', 'materialization_conflict');
}

function ensureRootState(projectRoot, preview, otherAllowed = []) {
  const current = snapshot(preview.file);
  const allowed = new Set([preview.before.hash, preview.after_hash, ...otherAllowed]);
  if (!allowed.has(current.hash)) throw new UserError('root policy changed during materialization', 'materialization_conflict', { actual: current.hash, expected: [...allowed] });
  return current.hash;
}

export function applyMaterialization(projectRoot, sourceRoot, options, env = process.env) {
  const paths = activePaths(projectRoot);
  const committedReceipt = path.join(projectRoot, GUIDES, 'local', 'materialization-receipt.json');
  const migrationReceipt = path.join(projectRoot, GUIDES, 'local', 'v3-migration-receipt.json');
  if (fs.statSync(committedReceipt, { throwIfNoEntry: false })?.isFile() && !fs.existsSync(paths.active)) {
    const descriptor = readJson(path.join(projectRoot, DESCRIPTOR), DESCRIPTOR);
    const receipt = readJson(committedReceipt, 'materialization receipt');
    if (descriptor.project_id !== options.projectId || descriptor.variant !== options.variant || receipt.source_digest !== buildFileManifest(sourceRoot).digest) {
      throw new UserError('committed materialization differs from requested candidate', 'materialization_conflict');
    }
    if (descriptor.migration && !fs.statSync(migrationReceipt, { throwIfNoEntry: false })?.isFile()) {
      throw new UserError('committed migration receipt is missing', 'migration_conflict');
    }
    validateMaterializedProject(projectRoot, descriptor, env);
    if (fs.existsSync(paths.directory)) {
      assertOwnedTransition(paths);
      const recoveryLock = localLock(projectRoot, { allowReceiptRecovery: true });
      recoveryLock.release();
      cleanupTransition(paths);
    }
    return { status: 'already_materialized', variant: descriptor.variant, generation_digest: receipt.generation_digest, project_root: projectRoot, runtime_dependency: descriptor.router.executable, staged: false };
  }
  if (fs.existsSync(paths.directory) && !fs.existsSync(paths.active)) throw new UserError('preexisting transition directory is not APG-owned', 'materialization_conflict');
  assertOwnedTransition(paths);
  if (!fs.existsSync(paths.active) && fs.existsSync(path.join(projectRoot, GUIDES))) {
    throw new UserError('managed guide tree already exists outside an active materialization', 'materialization_conflict');
  }
  if (!fs.existsSync(paths.active) && fs.existsSync(path.join(projectRoot, DESCRIPTOR)) && !options.migrationPreview) {
    throw new UserError('minimal materializer supports fresh projects only; use migration preview for existing APG state', 'materialization_conflict');
  }
  const existingActive = fs.statSync(paths.active, { throwIfNoEntry: false })?.isFile() ? readJson(paths.active, 'active materialization') : undefined;
  if (options.migrationPreview && !existingActive) {
    const descriptorBefore = snapshot(path.join(projectRoot, DESCRIPTOR));
    const rootBefore = snapshot(path.join(projectRoot, options.rootName));
    if (descriptorBefore.hash !== options.migrationPreview.preimages.descriptor.hash || rootBefore.hash !== options.migrationPreview.preimages.root.hash || fs.existsSync(path.join(projectRoot, GUIDES)) !== options.migrationPreview.preimages.guides_exists) {
      throw new UserError('migration preimages changed after reviewed preview', 'migration_conflict');
    }
  }
  const candidate = buildMaterializationCandidate(projectRoot, sourceRoot, {
    ...options,
    rootBefore: existingActive?.root_before || options.migrationPreview?.preimages.root,
  });
  if (options.migrationPreview && candidate.descriptor.integrity.manifest_digest !== options.migrationPreview.proposed_descriptor.integrity.manifest_digest) {
    throw new UserError('migration candidate differs from reviewed preview', 'migration_conflict');
  }
  let sharedRuntime;
  if (candidate.descriptor.variant === 'shared-runtime.pinned') {
    sharedRuntime = installPackedRuntime(sourceRoot, env);
    installSharedLauncher(sharedRuntime.root, env);
  }
  const lock = localLock(projectRoot);
  try {
    let active = fs.existsSync(paths.active) ? readJson(paths.active, 'active materialization') : createActive(projectRoot, candidate, options);
    if (active.generation_digest !== candidate.generation_digest) throw new UserError('active materialization belongs to another candidate', 'materialization_conflict');
    verifyPreimages(projectRoot, active, candidate, { allowExistingDescriptor: Boolean(options.migrationPreview) });
    if (!fs.existsSync(paths.active)) writeJsonDurable(paths.active, active);
    if (!['receipt-written', 'journal-copied', 'migration-receipt-written'].includes(active.state)) {
      appendJournal(paths.journal, { event: 'apply-start', generation_digest: candidate.generation_digest, state: active.state });
    }

    if (candidate.descriptor.variant === 'shared-runtime.pinned' && active.state === 'planned') {
      appendJournal(paths.journal, { event: 'shared-runtime-ready', digest: candidate.descriptor.release.digest, installed: sharedRuntime.installed });
    }

    if (active.state === 'planned') {
      failpoint(env, 'before-transition-root');
      const currentHash = ensureRootState(projectRoot, candidate.transition_root);
      if (currentHash !== candidate.transition_root.after_hash) writeBytesDurable(candidate.transition_root.file, candidate.transition_root.after, candidate.transition_root.before.mode ?? 0o644);
      failpoint(env, 'after-transition-root');
      active.state = 'transition-blocked';
      writeJsonDurable(paths.active, active);
      appendJournal(paths.journal, { event: 'transition-root-written', hash: candidate.transition_root.after_hash });
      hardFailpoint(env, 'after-transition-root');
    }

    if (active.state === 'transition-blocked') {
      const descriptorNow = snapshot(path.join(projectRoot, DESCRIPTOR));
      const rootNow = snapshot(candidate.transition_root.file);
      if (descriptorNow.hash !== active.descriptor_before.hash || rootNow.hash !== candidate.transition_root.after_hash) throw new UserError('transition-blocked project files changed before guide publication', 'materialization_conflict');
      const guidesRoot = path.join(projectRoot, GUIDES);
      if (fs.existsSync(guidesRoot)) verifyGuideTree(guidesRoot, candidate);
      if (!fs.existsSync(guidesRoot)) {
        const stage = path.join(projectRoot, `${GUIDES}.stage-${candidate.generation_digest.slice(-12)}`);
        if (fs.existsSync(stage)) verifyGuideTree(stage, candidate);
        else writeGuideStage(stage, candidate);
        failpoint(env, 'before-guides-rename');
        fs.renameSync(stage, guidesRoot);
        fsyncDirectory(projectRoot);
        failpoint(env, 'after-guides-rename');
      }
      verifyGuideTree(guidesRoot, candidate);
      active.state = 'guides-published';
      writeJsonDurable(paths.active, active);
      appendJournal(paths.journal, { event: 'guides-published' });
      hardFailpoint(env, 'after-guides-published');
    }

    if (active.state === 'guides-published') {
      const descriptorFile = path.join(projectRoot, DESCRIPTOR);
      const current = snapshot(descriptorFile);
      const expectedHash = `sha256:${sha256(candidate.descriptor_bytes)}`;
      if (![active.descriptor_before.hash, expectedHash].includes(current.hash) || snapshot(candidate.transition_root.file).hash !== candidate.transition_root.after_hash) throw new UserError('guides-published project files changed before descriptor publication', 'materialization_conflict');
      verifyGuideTree(path.join(projectRoot, GUIDES), candidate);
      if (current.hash !== expectedHash) {
        failpoint(env, 'before-descriptor-rename');
        writeBytesDurable(descriptorFile, candidate.descriptor_bytes);
        failpoint(env, 'after-descriptor-rename');
      }
      active.state = 'descriptor-published';
      writeJsonDurable(paths.active, active);
      appendJournal(paths.journal, { event: 'descriptor-published', hash: expectedHash });
      hardFailpoint(env, 'after-descriptor-published');
    }

    if (active.state === 'descriptor-published') {
      const expectedDescriptorHash = `sha256:${sha256(candidate.descriptor_bytes)}`;
      const descriptorNow = snapshot(path.join(projectRoot, DESCRIPTOR));
      const rootNow = snapshot(candidate.final_root.file);
      if (descriptorNow.hash !== expectedDescriptorHash || ![candidate.transition_root.after_hash, candidate.final_root.after_hash].includes(rootNow.hash)) throw new UserError('descriptor-published project files changed before final root publication', 'materialization_conflict');
      verifyGuideTree(path.join(projectRoot, GUIDES), candidate);
      validateV3Descriptor(readJson(path.join(projectRoot, DESCRIPTOR), DESCRIPTOR), projectRoot);
      const rootHash = ensureRootState(projectRoot, candidate.final_root, [candidate.transition_root.after_hash]);
      if (rootHash !== candidate.final_root.after_hash) {
        failpoint(env, 'before-final-root');
        writeBytesDurable(candidate.final_root.file, candidate.final_root.after, candidate.final_root.before.mode ?? 0o644);
        failpoint(env, 'after-final-root');
      }
      inspectV3Root(projectRoot, candidate.descriptor);
      active.state = 'ready';
      writeJsonDurable(paths.active, active);
      appendJournal(paths.journal, { event: 'final-root-written', hash: candidate.final_root.after_hash });
      hardFailpoint(env, 'after-final-root');
    }

    if (!['ready', 'receipt-written', 'journal-copied', 'migration-receipt-written'].includes(active.state)) throw new UserError(`unknown materialization state: ${active.state}`, 'materialization_conflict');
    failpoint(env, 'before-journal-commit');
    const receipt = {
      schema_version: 1,
      operation: 'materialize-v3',
      generation_digest: candidate.generation_digest,
      variant: candidate.descriptor.variant,
      descriptor_hash: `sha256:${sha256(candidate.descriptor_bytes)}`,
      root_hash: candidate.final_root.after_hash,
      source_digest: candidate.source_manifest.digest,
      source_state: candidate.source_state,
    };
    const guidesRoot = path.join(projectRoot, GUIDES);
    const receiptRelative = 'local/materialization-receipt.json';
    const journalRelative = 'local/materialization-journal.jsonl';
    const migrationRelative = 'local/v3-migration-receipt.json';
    const receiptBytes = Buffer.from(canonicalJson(receipt));
    const metadata = new Map();
    if (fs.existsSync(path.join(guidesRoot, receiptRelative))) metadata.set(receiptRelative, receiptBytes);
    if (fs.existsSync(path.join(guidesRoot, journalRelative))) metadata.set(journalRelative, fs.readFileSync(paths.journal));
    let expectedMigrationBytes;
    if (options.migrationPreview && fs.existsSync(path.join(guidesRoot, migrationRelative))) {
      const recovery = {
        schema_version: 1,
        descriptor: options.migrationPreview.preimages.descriptor,
        root: options.migrationPreview.preimages.root,
      };
      const recoveryDigest = `sha256:${sha256(canonicalJson(recovery))}`;
      if (recoveryDigest !== candidate.descriptor.migration.recovery_digest) throw new UserError('migration recovery differs from descriptor anchor', 'migration_conflict');
      const migrationReceipt = {
        schema_version: 1,
        operation: 'migrate-2.0-to-3.0',
        plan_digest: options.migrationPreview.plan_digest,
        recovery,
        recovery_digest: recoveryDigest,
        descriptor_after_hash: receipt.descriptor_hash,
        root_after_hash: receipt.root_hash,
        generation_digest: candidate.generation_digest,
        owned_tree: [...expectedGuideRecords(candidate), ...[...metadata.entries()].filter(([relative]) => relative !== migrationRelative).map(([relative, bytes]) => bytesRecord(relative, bytes))].sort((left, right) => left.path.localeCompare(right.path)),
      };
      migrationReceipt.receipt_digest = `sha256:${sha256(canonicalJson(migrationReceipt))}`;
      expectedMigrationBytes = Buffer.from(canonicalJson(migrationReceipt));
      metadata.set(migrationRelative, expectedMigrationBytes);
    }
    if (snapshot(path.join(projectRoot, DESCRIPTOR)).hash !== receipt.descriptor_hash || snapshot(candidate.final_root.file).hash !== receipt.root_hash) {
      throw new UserError('materialized descriptor or root changed before receipt commit', 'materialization_conflict');
    }
    verifyGuideTreeStage(guidesRoot, candidate, metadata);

    if (active.state === 'ready') {
      if (!metadata.has(receiptRelative)) writeBytesDurable(path.join(guidesRoot, receiptRelative), receiptBytes);
      hardFailpoint(env, 'after-receipt-write');
      active.state = 'receipt-written';
      writeJsonDurable(paths.active, active);
      metadata.set(receiptRelative, receiptBytes);
    }
    if (active.state === 'receipt-written') {
      const completeCount = journalEventCount(paths.journal, 'apply-complete');
      if (completeCount > 1) throw new UserError('materialization journal contains duplicate completion events', 'materialization_conflict');
      if (completeCount === 0) appendJournal(paths.journal, { event: 'apply-complete', generation_digest: candidate.generation_digest });
      const journalBytes = fs.readFileSync(paths.journal);
      const projectJournal = path.join(guidesRoot, journalRelative);
      if (fs.existsSync(projectJournal) && !fs.readFileSync(projectJournal).equals(journalBytes)) throw new UserError('project materialization journal changed during receipt commit', 'materialization_conflict');
      if (!fs.existsSync(projectJournal)) writeBytesDurable(projectJournal, journalBytes, 0o600);
      hardFailpoint(env, 'after-journal-copy');
      active.state = 'journal-copied';
      writeJsonDurable(paths.active, active);
      metadata.set(journalRelative, journalBytes);
    }
    if (active.state === 'journal-copied') {
      if (options.migrationPreview) {
        const recovery = {
          schema_version: 1,
          descriptor: options.migrationPreview.preimages.descriptor,
          root: options.migrationPreview.preimages.root,
        };
        const recoveryDigest = `sha256:${sha256(canonicalJson(recovery))}`;
        if (recoveryDigest !== candidate.descriptor.migration.recovery_digest) throw new UserError('migration recovery differs from descriptor anchor', 'migration_conflict');
        const migrationReceipt = {
          schema_version: 1,
          operation: 'migrate-2.0-to-3.0',
          plan_digest: options.migrationPreview.plan_digest,
          recovery,
          recovery_digest: recoveryDigest,
          descriptor_after_hash: receipt.descriptor_hash,
          root_after_hash: receipt.root_hash,
          generation_digest: candidate.generation_digest,
          owned_tree: [...expectedGuideRecords(candidate), ...[...metadata.entries()].filter(([relative]) => relative !== migrationRelative).map(([relative, bytes]) => bytesRecord(relative, bytes))].sort((left, right) => left.path.localeCompare(right.path)),
        };
        migrationReceipt.receipt_digest = `sha256:${sha256(canonicalJson(migrationReceipt))}`;
        expectedMigrationBytes = Buffer.from(canonicalJson(migrationReceipt));
        const migrationFile = path.join(guidesRoot, migrationRelative);
        if (fs.existsSync(migrationFile) && !fs.readFileSync(migrationFile).equals(expectedMigrationBytes)) throw new UserError('migration receipt changed during commit', 'migration_conflict');
        if (!fs.existsSync(migrationFile)) writeBytesDurable(migrationFile, expectedMigrationBytes, 0o600);
        metadata.set(migrationRelative, expectedMigrationBytes);
        hardFailpoint(env, 'after-migration-receipt');
      }
      active.state = 'migration-receipt-written';
      writeJsonDurable(paths.active, active);
    }
    if (active.state !== 'migration-receipt-written') throw new UserError(`unknown receipt state: ${active.state}`, 'materialization_conflict');
    verifyGuideTreeStage(guidesRoot, candidate, metadata);
    fs.rmSync(paths.active, { force: true });
    hardFailpoint(env, 'after-active-remove');
    failpoint(env, 'after-journal-commit');
    return {
      status: 'materialized',
      variant: candidate.descriptor.variant,
      generation_digest: candidate.generation_digest,
      project_root: projectRoot,
      runtime_dependency: candidate.descriptor.router.executable,
      staged: false,
    };
  } finally {
    lock.release();
    if (!fs.existsSync(paths.active)) cleanupTransition(paths);
  }
}

export function validateMaterializedProject(projectRoot, descriptor, env = process.env) {
  validateV3Descriptor(descriptor, projectRoot);
  const bootstrap = inspectV3Root(projectRoot, descriptor);
  const guidesRoot = path.join(projectRoot, GUIDES);
  const manifest = readJson(path.join(guidesRoot, 'MANIFEST.json'), 'materialized manifest');
  if (manifest.schema_version !== 1 || manifest.variant !== descriptor.variant || canonicalJson(manifest.release) !== canonicalJson(descriptor.release)) throw new UserError('materialized manifest does not match descriptor', 'materialization_conflict');
  const { manifest_digest: storedManifestDigest, ...manifestBody } = manifest;
  if (storedManifestDigest !== `sha256:${sha256(canonicalJson(manifestBody))}` || storedManifestDigest !== descriptor.integrity.manifest_digest) throw new UserError('materialized manifest digest is invalid or unbound', 'materialization_conflict');
  const expectedSelectedView = {
    lifecycle: descriptor.documents.lifecycle,
    roles: descriptor.documents.roles,
    profiles: descriptor.documents.profiles,
    overlays: descriptor.documents.overlays,
    mandatory: descriptor.policy.mandatory,
  };
  if (canonicalJson(manifest.selected_view) !== canonicalJson(expectedSelectedView)) throw new UserError('materialized selected view differs from descriptor', 'materialization_conflict');
  for (const record of manifest.materialized_files || []) {
    const relative = normalizeRelative(record.path, 'manifest materialized path');
    const file = path.join(guidesRoot, relative);
    const current = snapshot(file);
    if (!current.exists || current.hash !== record.sha256) throw new UserError(`materialized file hash mismatch: ${record.path}`, 'materialization_conflict');
  }
  const legacyReleaseRoot = path.join(projectRoot, '.agent-project-guides', 'local', 'releases');
  if (fs.existsSync(legacyReleaseRoot) && descriptor.containment.workspace !== 'transitional') throw new UserError('legacy generic release bytes invalidate fresh workspace containment', 'containment_conflict');
  if (descriptor.variant === 'selected-inline.none') {
    const managed = path.join(guidesRoot, 'managed');
    if (!fs.statSync(managed, { throwIfNoEntry: false })?.isDirectory()) throw new UserError('selected-inline managed corpus is missing', 'materialization_conflict');
    const actualManaged = directoryRecords(managed);
    const expectedManaged = (manifest.source_files || []).filter((record) => record.installed).map((record) => {
      const installedPath = normalizeRelative(record.installed_path, 'manifest installed path');
      if (!installedPath.startsWith('managed/')) throw new UserError(`selected-inline installed path escapes managed corpus: ${installedPath}`, 'materialization_conflict');
      return {
        path: installedPath.slice('managed/'.length),
        bytes: record.bytes,
        sha256: record.sha256,
      };
    }).sort((left, right) => left.path.localeCompare(right.path));
    if (canonicalJson(actualManaged) !== canonicalJson(expectedManaged)) throw new UserError('selected-inline managed corpus contains missing or unselected files', 'containment_conflict');
  } else {
    if (fs.existsSync(path.join(guidesRoot, 'managed'))) throw new UserError('shared-runtime project contains a generic managed corpus', 'materialization_conflict');
    openPackedRuntime(descriptor, env);
  }
  return {
    valid: true,
    status: 'ready',
    schema_version: 2,
    project_id: descriptor.project_id,
    variant: descriptor.variant,
    bootstrap,
    workspace_containment: descriptor.containment.workspace,
    host_corpus_exposure: {
      value: descriptor.containment.host_corpus_exposure,
      observation: descriptor.variant === 'shared-runtime.pinned' ? 'configured-packed-runtime' : 'not-inspected',
      scope: descriptor.variant === 'shared-runtime.pinned' ? 'configured-runtime-generation' : 'none',
    },
    runtime_dependency: descriptor.router.executable,
    source_provenance: manifest.source_provenance,
    selected_modules: manifest.modules.map((module) => module.id),
    model_effective: 'unknown',
  };
}

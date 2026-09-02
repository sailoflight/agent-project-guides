import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { UserError, buildFileManifest, canonicalJson, readJson, sha256 } from './core.mjs';
import { readDescriptor, validateDescriptor } from './descriptor.mjs';
import { defaultV3Descriptor, validateV3Descriptor } from './descriptor-v3.mjs';
import { buildSelectedClosure } from './closure.mjs';
import { applyMaterialization, buildGuideFiles, validateMaterializedProject } from './materializer.mjs';
import { buildPackedRuntimeArtifact, observeSourceState, openProvider } from './provider.mjs';
import { previewV3Root, renderCliBlock, renderInlineBlock, renderTransitionBlock } from './bootstrap-v3.mjs';

function snapshot(file) {
  const stat = fs.lstatSync(file, { throwIfNoEntry: false });
  if (!stat) return { exists: false, hash: 'missing', bytes: 0, base64: '', mode: null };
  const bytes = fs.readFileSync(file);
  return { exists: true, hash: `sha256:${sha256(bytes)}`, bytes: bytes.length, base64: bytes.toString('base64'), mode: stat.mode & 0o777 };
}

export function previewV2ToV3Migration(projectRoot, sourceRoot, options) {
  const { descriptor: legacy } = readDescriptor(projectRoot);
  if (legacy.schema_version !== 1) throw new UserError('v3 migration preview requires a schema 1 descriptor', 'wrong_lifecycle');
  if (options.projectId && options.projectId !== legacy.project_id) throw new UserError('requested project id differs from the schema 1 descriptor', 'migration_conflict');
  if (options.rootName && options.rootName !== legacy.policy.root) throw new UserError('requested policy root differs from the schema 1 descriptor', 'migration_conflict');
  if (options.mandatory && canonicalJson(options.mandatory) !== canonicalJson(legacy.policy.mandatory)) throw new UserError('requested mandatory policy differs from the schema 1 descriptor', 'migration_conflict');
  if (options.protectedEffects && canonicalJson(options.protectedEffects) !== canonicalJson(legacy.protected_effects)) throw new UserError('requested protected effects differ from the schema 1 descriptor', 'migration_conflict');
  const sourceManifest = buildFileManifest(sourceRoot);
  const blockers = [];
  if (fs.existsSync(path.join(projectRoot, '.agent-guides'))) blockers.push({
    code: 'managed-guides-exist',
    message: 'A pre-existing .agent-guides tree must be resolved before schema 1 adoption.',
  });
  if (legacy.provider.mode === 'source-worktree') blockers.push({
    code: 'source-worktree-full-corpus',
    message: 'A self-host workspace containing the full APG source corpus cannot claim either first-slice containment mode; materialize a separate consumer copy.',
  });
  if (blockers.length) return {
    dry_run: true,
    applicable: false,
    from: { schema_version: 1, provider: legacy.provider },
    target_variant: options.variant,
    blockers,
    writes_project: false,
    stages_or_commits: false,
  };

  const rootBefore = snapshot(path.join(projectRoot, legacy.policy.root));
  const descriptorBefore = snapshot(path.join(projectRoot, '.agent-project-guides.json'));
  const recovery = { schema_version: 1, descriptor: descriptorBefore, root: rootBefore };
  const migration = {
    state: 'reversible-transition',
    from_schema_version: 1,
    legacy_provider: legacy.provider.mode,
    recovery_digest: `sha256:${sha256(canonicalJson(recovery))}`,
  };
  const packedArtifact = options.variant === 'shared-runtime.pinned' ? buildPackedRuntimeArtifact(sourceRoot) : undefined;
  const proposed = defaultV3Descriptor({
    projectId: legacy.project_id,
    variant: options.variant,
    version: sourceManifest.package_version,
    digest: sourceManifest.digest,
    runtimeDigest: packedArtifact?.manifest.digest,
    lifecycle: options.lifecycle || 'active-development',
    roles: options.roles,
    profiles: options.profiles || legacy.facets,
    overlays: options.overlays || legacy.overlays || [],
    mandatory: legacy.policy.mandatory,
    protectedEffects: legacy.protected_effects,
    rootName: legacy.policy.root,
    workspace: 'transitional',
    migration,
  });
  proposed.layout.scratch = legacy.layout.scratch;
  proposed.layout.memory = legacy.layout.memory;
  validateV3Descriptor(proposed, projectRoot);
  const closure = buildSelectedClosure(sourceRoot, proposed, { includeContent: true });
  const { manifest } = buildGuideFiles(proposed, closure, observeSourceState(sourceRoot));
  proposed.integrity.manifest_digest = manifest.manifest_digest;
  const finalBlock = proposed.variant === 'selected-inline.none' ? renderInlineBlock(proposed, closure) : renderCliBlock(proposed);
  proposed.integrity.root_block_hash = `sha256:${sha256(finalBlock)}`;
  validateV3Descriptor(proposed, projectRoot);
  const rootPreview = previewV3Root(projectRoot, proposed, finalBlock, { before: rootBefore, allowV2: true });
  const descriptorAfter = Buffer.from(canonicalJson(proposed));
  const retainedExposure = [
    `${legacy.policy.root} v2 preimage`,
    `${path.basename('.agent-project-guides.json')} schema 1 preimage`,
    ...(legacy.provider.mode === 'embedded-local' ? [`.agent-project-guides/local/releases/${legacy.provider.digest.replace(':', '-')}`] : []),
  ];
  const plan = {
    schema_version: 1,
    operation: 'dry-run-migrate-2.0-to-3.0',
    project_id: legacy.project_id,
    from: { schema_version: 1, provider: legacy.provider },
    to: { schema_version: 2, variant: proposed.variant, release: proposed.release },
    proposed_descriptor: proposed,
    selected_closure: {
      modules: closure.modules,
      files: closure.files.map(({ content, ...file }) => file),
      excluded_optional_modules: closure.excluded_optional_modules,
    },
    preimages: {
      descriptor: descriptorBefore,
      root: rootBefore,
      guides_exists: fs.existsSync(path.join(projectRoot, '.agent-guides')),
    },
    postimages: {
      descriptor_hash: `sha256:${sha256(descriptorAfter)}`,
      root_hash: rootPreview.after_hash,
      managed_document_count: proposed.variant === 'selected-inline.none' ? closure.files.length : 0,
    },
    effects: [
      'enter a reversible transition with workspace containment reported as transitional',
      'publish a schema 2 descriptor and v3 root router only after an explicit future apply',
      proposed.variant === 'selected-inline.none' ? 'publish only the selected local document closure' : 'bind the project to one exact shared packed runtime digest',
      'retain exact schema 1 descriptor/root/provider recovery until explicit finalization',
    ],
    retained_workspace_exposure: retainedExposure,
    rollback_boundary: 'before finalization, restore exact recorded descriptor/root/provider bytes; any changed preimage is a zero-write conflict',
    finalization_tradeoff: 'finalization must separately remove unchanged legacy generic recovery bytes before physical selected-local containment can be claimed; offline rollback may then require verified rehydration',
    writes_project: false,
    stages_or_commits: false,
  };
  return { dry_run: true, applicable: true, plan_digest: `sha256:${sha256(canonicalJson(plan))}`, ...plan };
}

function selectionFromPreview(preview) {
  const descriptor = preview.proposed_descriptor;
  return {
    projectId: descriptor.project_id,
    variant: descriptor.variant,
    lifecycle: descriptor.documents.lifecycle,
    roles: descriptor.documents.roles,
    profiles: descriptor.documents.profiles,
    overlays: descriptor.documents.overlays,
    mandatory: descriptor.policy.mandatory,
    protectedEffects: descriptor.protected_effects,
    rootName: descriptor.policy.root,
    workspace: descriptor.containment.workspace,
    migration: descriptor.migration,
    allowV2: true,
    migrationPreview: preview,
  };
}

function assertSelectionMatchesDescriptor(options, descriptor) {
  if (options.projectId && options.projectId !== descriptor.project_id) throw new UserError('requested project id differs from the active migration', 'migration_conflict');
  if (options.variant !== descriptor.variant || (options.lifecycle || 'active-development') !== descriptor.documents.lifecycle) throw new UserError('requested variant or lifecycle differs from the active migration', 'migration_conflict');
  for (const [key, requested] of [['roles', options.roles], ['profiles', options.profiles], ['overlays', options.overlays]]) {
    if (requested && canonicalJson(requested) !== canonicalJson(descriptor.documents[key])) throw new UserError(`requested ${key} differ from the active migration`, 'migration_conflict');
  }
  if (options.rootName && options.rootName !== descriptor.policy.root) throw new UserError('requested policy root differs from the active migration', 'migration_conflict');
  if (options.mandatory && canonicalJson(options.mandatory) !== canonicalJson(descriptor.policy.mandatory)) throw new UserError('requested mandatory policy differs from the active migration', 'migration_conflict');
  if (options.protectedEffects && canonicalJson(options.protectedEffects) !== canonicalJson(descriptor.protected_effects)) throw new UserError('requested protected effects differ from the active migration', 'migration_conflict');
}

export function applyV2ToV3Migration(projectRoot, sourceRoot, options, expectedPlanDigest, env = process.env) {
  if (!/^sha256:[0-9a-f]{64}$/.test(expectedPlanDigest || '')) throw new UserError('v3 migration apply requires the reviewed --digest', 'invalid_arguments');
  const activeFile = path.join(projectRoot, '.agent-guides-transition', 'active.json');
  if (fs.existsSync(activeFile)) {
    const active = readJson(activeFile, 'active v3 migration');
    if (active.migration_plan_digest !== expectedPlanDigest || !active.migration_descriptor || !active.migration_preimages) throw new UserError('active materialization is not the reviewed v3 migration', 'plan_digest_mismatch');
    assertSelectionMatchesDescriptor(options, active.migration_descriptor);
    const resumePreview = {
      applicable: true,
      plan_digest: active.migration_plan_digest,
      proposed_descriptor: active.migration_descriptor,
      preimages: active.migration_preimages,
    };
    const resumed = applyMaterialization(projectRoot, sourceRoot, selectionFromPreview(resumePreview), env);
    return { ...resumed, status: resumed.status === 'already_materialized' ? 'already_migrated' : 'migrated', plan_digest: active.migration_plan_digest, workspace_containment: 'transitional' };
  }
  const current = readDescriptor(projectRoot).descriptor;
  if (current.schema_version === 2 && current.containment.workspace === 'transitional') {
    const receipt = readMigrationReceipt(projectRoot);
    assertSelectionMatchesDescriptor(options, current);
    if (receipt.plan_digest !== expectedPlanDigest || current.variant !== options.variant) throw new UserError('existing v3 migration differs from requested plan', 'plan_digest_mismatch');
    validateMaterializedProject(projectRoot, current, env);
    return { status: 'already_migrated', variant: current.variant, plan_digest: receipt.plan_digest, workspace_containment: 'transitional' };
  }
  const preview = previewV2ToV3Migration(projectRoot, sourceRoot, options);
  if (!preview.applicable) throw new UserError('v3 migration preview is blocked', 'migration_blocked', { blockers: preview.blockers });
  if (preview.plan_digest !== expectedPlanDigest) throw new UserError('v3 migration plan digest differs from the reviewed preview', 'plan_digest_mismatch', {
    expected: expectedPlanDigest,
    actual: preview.plan_digest,
  });
  const result = applyMaterialization(projectRoot, sourceRoot, selectionFromPreview(preview), env);
  return { ...result, status: result.status === 'already_materialized' ? 'already_migrated' : 'migrated', plan_digest: preview.plan_digest, workspace_containment: 'transitional' };
}

function fsyncDirectory(directory) {
  const descriptor = fs.openSync(directory, 'r');
  try { fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
}

function writeBytesAtomic(file, bytes, mode = 0o644) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.apg-v3-rollback-${process.pid}`;
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

function restoreSnapshot(file, before) {
  if (!before.exists) fs.rmSync(file, { force: true });
  else writeBytesAtomic(file, Buffer.from(before.base64, 'base64'), before.mode ?? 0o644);
}

function treeRecords(root) {
  const records = [];
  function visit(relative = '') {
    for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const child = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) throw new UserError(`rollback tree contains a symlink: ${child}`, 'migration_conflict');
      if (entry.isDirectory()) {
        records.push({ path: child, type: 'directory' });
        visit(child);
      } else if (entry.isFile()) {
        const bytes = fs.readFileSync(path.join(root, child));
        records.push({ path: child, type: 'file', bytes: bytes.length, sha256: `sha256:${sha256(bytes)}` });
      } else throw new UserError(`rollback tree contains an unsupported file: ${child}`, 'migration_conflict');
    }
  }
  visit();
  return records;
}

function acquireRollback(projectRoot) {
  const directory = path.join(projectRoot, '.agent-guides-rollback');
  if (!fs.existsSync(directory)) fs.mkdirSync(directory);
  const active = path.join(directory, 'active.json');
  const lock = path.join(directory, 'rollback.lock');
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const descriptor = fs.openSync(lock, 'wx', 0o600);
      fs.writeSync(descriptor, canonicalJson({ schema_version: 1, pid: process.pid, host: os.hostname() }));
      fs.fsyncSync(descriptor);
      fs.closeSync(descriptor);
      fsyncDirectory(directory);
      return {
        directory,
        active,
        anchor: path.join(directory, 'migration-receipt.json'),
        guidesBackup: path.join(directory, 'guides'),
        release() { fs.rmSync(lock, { force: true }); },
        cleanup() {
          fs.rmSync(active, { force: true });
          fs.rmSync(path.join(directory, 'migration-receipt.json'), { force: true });
          fs.rmSync(lock, { force: true });
          try { fs.rmdirSync(directory); } catch (error) { if (error.code !== 'ENOENT') throw error; }
        },
      };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let stale = false;
      try {
        const owner = readJson(lock, 'v3 rollback lock');
        if (owner.host === os.hostname() && Number.isSafeInteger(owner.pid)) {
          try { process.kill(owner.pid, 0); } catch (probe) { stale = probe.code === 'ESRCH'; }
        }
      } catch {
        stale = false;
      }
      if (!stale || attempt > 0) throw new UserError('another v3 rollback is active', 'mutation_conflict');
      fs.rmSync(lock, { force: true });
    }
  }
  throw new UserError('cannot acquire v3 rollback lock', 'mutation_conflict');
}

function readMigrationReceiptFile(file) {
  const receipt = readJson(file, 'v3 migration receipt');
  if (receipt.schema_version !== 1 || receipt.operation !== 'migrate-2.0-to-3.0') throw new UserError('v3 migration receipt is invalid', 'migration_conflict');
  const { receipt_digest: storedDigest, ...body } = receipt;
  if (storedDigest !== `sha256:${sha256(canonicalJson(body))}` || !Array.isArray(receipt.owned_tree)) throw new UserError('v3 migration receipt digest is invalid', 'migration_conflict');
  return receipt;
}

function readMigrationReceipt(projectRoot) {
  return readMigrationReceiptFile(path.join(projectRoot, '.agent-guides', 'local', 'v3-migration-receipt.json'));
}

function writeRollbackActive(file, active) {
  writeBytesAtomic(file, Buffer.from(canonicalJson(active)), 0o600);
}

function hardFailpoint(env, name) {
  if (env.APG_TEST_HARD_FAILPOINT === name) process.exit(86);
}

function verifyRecoveryProvider(projectRoot, recovery, env) {
  const legacy = JSON.parse(Buffer.from(recovery.descriptor.base64, 'base64').toString('utf8'));
  validateDescriptor(legacy, projectRoot);
  if (legacy.schema_version !== 1) throw new UserError('v3 migration recovery descriptor is not schema 1', 'migration_conflict');
  openProvider(projectRoot, legacy, env);
  return legacy;
}

function prepareRollbackActive(projectRoot, env) {
  const { descriptor } = readDescriptor(projectRoot);
  if (descriptor.schema_version !== 2 || descriptor.containment.workspace !== 'transitional' || !descriptor.migration) {
    throw new UserError('v3 rollback requires a transitional schema 2 descriptor', 'wrong_lifecycle');
  }
  const receipt = readMigrationReceipt(projectRoot);
  if (receipt.recovery_digest !== descriptor.migration.recovery_digest || `sha256:${sha256(canonicalJson(receipt.recovery))}` !== receipt.recovery_digest) {
    throw new UserError('v3 migration recovery does not match descriptor anchor', 'migration_conflict');
  }
  verifyRecoveryProvider(projectRoot, receipt.recovery, env);
  const descriptorNow = snapshot(path.join(projectRoot, '.agent-project-guides.json'));
  const rootNow = snapshot(path.join(projectRoot, descriptor.policy.root));
  if (descriptorNow.hash !== receipt.descriptor_after_hash || rootNow.hash !== receipt.root_after_hash) {
    throw new UserError('v3 migration postimages changed; rollback performed zero writes', 'migration_conflict', { descriptor: descriptorNow.hash, root: rootNow.hash });
  }
  validateMaterializedProject(projectRoot, descriptor, env);
  const guidesRoot = path.join(projectRoot, '.agent-guides');
  const guidesFiles = treeRecords(guidesRoot);
  const receiptPath = 'local/v3-migration-receipt.json';
  const actualOwnedTree = guidesFiles.filter((record) => record.type === 'file' && record.path !== receiptPath).map(({ type, ...record }) => record);
  if (canonicalJson(actualOwnedTree) !== canonicalJson(receipt.owned_tree)) throw new UserError('APG-owned migration tree changed; rollback performed zero writes', 'migration_conflict');
  const expectedFiles = new Set([...receipt.owned_tree.map((record) => record.path), receiptPath]);
  const unknownGuideDirectories = guidesFiles.filter((record) => record.type === 'directory' && ![...expectedFiles].some((file) => file.startsWith(`${record.path}/`)));
  if (unknownGuideDirectories.length) throw new UserError('managed guide tree contains project-owned empty directories; rollback performed zero writes', 'migration_conflict', { paths: unknownGuideDirectories.map((record) => record.path) });
  const transitionRootHash = previewV3Root(projectRoot, descriptor, renderTransitionBlock(descriptor)).after_hash;
  return {
    schema_version: 1,
    operation: 'rollback-v3-migration',
    state: 'planned',
    policy_root: descriptor.policy.root,
    descriptor_after_hash: receipt.descriptor_after_hash,
    root_after_hash: receipt.root_after_hash,
    transition_root_hash: transitionRootHash,
    recovery: receipt.recovery,
    recovery_digest: receipt.recovery_digest,
    guides_files: guidesFiles,
  };
}

function verifyRollbackActiveBinding(projectRoot, active, paths, env) {
  if (`sha256:${sha256(canonicalJson(active.recovery))}` !== active.recovery_digest) throw new UserError('active rollback recovery digest is invalid', 'migration_conflict');
  if (!fs.statSync(paths.anchor, { throwIfNoEntry: false })?.isFile()) throw new UserError('rollback recovery anchor is missing', 'migration_conflict');
  const anchorBytes = fs.readFileSync(paths.anchor);
  const receipt = readMigrationReceiptFile(paths.anchor);
  const liveReceipt = path.join(projectRoot, '.agent-guides', 'local', 'v3-migration-receipt.json');
  const backupReceipt = path.join(paths.guidesBackup, 'local', 'v3-migration-receipt.json');
  for (const receiptFile of [liveReceipt, backupReceipt]) {
    if (fs.existsSync(receiptFile) && !fs.readFileSync(receiptFile).equals(anchorBytes)) throw new UserError('rollback migration receipt changed after interruption', 'migration_conflict');
  }
  {
    const receiptFile = paths.anchor;
    if (receipt.recovery_digest !== active.recovery_digest || canonicalJson(receipt.recovery) !== canonicalJson(active.recovery) || receipt.descriptor_after_hash !== active.descriptor_after_hash || receipt.root_after_hash !== active.root_after_hash) {
      throw new UserError('active rollback record differs from the migration receipt', 'migration_conflict');
    }
    const expectedFiles = [...receipt.owned_tree, bytesFileRecord('local/v3-migration-receipt.json', fs.readFileSync(receiptFile))].sort((left, right) => left.path.localeCompare(right.path));
    const actualFiles = active.guides_files.filter((record) => record.type === 'file').map(({ type, ...record }) => record);
    if (canonicalJson(actualFiles) !== canonicalJson(expectedFiles)) throw new UserError('active rollback guide ownership differs from the migration receipt', 'migration_conflict');
  }
  verifyRecoveryProvider(projectRoot, active.recovery, env);
}

function bytesFileRecord(filePath, bytes) {
  return { path: filePath, bytes: bytes.length, sha256: `sha256:${sha256(bytes)}` };
}

export function rollbackV3Migration(projectRoot, env = process.env) {
  const rollbackDirectory = path.join(projectRoot, '.agent-guides-rollback');
  const activeFile = path.join(rollbackDirectory, 'active.json');
  if (fs.existsSync(rollbackDirectory) && !fs.existsSync(activeFile)) throw new UserError('preexisting rollback directory is not APG-owned', 'migration_conflict');
  const prepared = fs.existsSync(activeFile) ? undefined : prepareRollbackActive(projectRoot, env);
  const paths = acquireRollback(projectRoot);
  try {
    const activeExists = fs.existsSync(paths.active);
    const active = activeExists ? readJson(paths.active, 'v3 rollback active record') : prepared;
    if (!activeExists) {
      const receiptBytes = fs.readFileSync(path.join(projectRoot, '.agent-guides', 'local', 'v3-migration-receipt.json'));
      writeBytesAtomic(paths.anchor, receiptBytes, 0o600);
      writeRollbackActive(paths.active, active);
    }
    verifyRollbackActiveBinding(projectRoot, active, paths, env);

    const descriptorFile = path.join(projectRoot, '.agent-project-guides.json');
    const rootFile = path.join(projectRoot, active.policy_root);
    const guidesRoot = path.join(projectRoot, '.agent-guides');
    if (active.state === 'planned') {
      const descriptorNow = snapshot(descriptorFile);
      const rootNow = snapshot(rootFile);
      if (descriptorNow.hash !== active.descriptor_after_hash || ![active.root_after_hash, active.transition_root_hash].includes(rootNow.hash)) throw new UserError('rollback planned-state postimages changed', 'migration_conflict');
      if (rootNow.hash === active.root_after_hash) {
        const descriptor = readJson(descriptorFile, '.agent-project-guides.json');
        const blocked = previewV3Root(projectRoot, descriptor, renderTransitionBlock(descriptor));
        if (blocked.after_hash !== active.transition_root_hash) throw new UserError('rollback transition root differs from active plan', 'migration_conflict');
        writeBytesAtomic(rootFile, blocked.after, blocked.before.mode ?? 0o644);
      }
      hardFailpoint(env, 'rollback-after-transition-root');
      active.state = 'transition-blocked';
      writeRollbackActive(paths.active, active);
    }
    if (active.state === 'transition-blocked') {
      const descriptorNow = snapshot(descriptorFile);
      const rootNow = snapshot(rootFile);
      if (![active.descriptor_after_hash, active.recovery.descriptor.hash].includes(descriptorNow.hash) || rootNow.hash !== active.transition_root_hash) throw new UserError('rollback transition-state postimages changed', 'migration_conflict');
      if (descriptorNow.hash === active.descriptor_after_hash) restoreSnapshot(descriptorFile, active.recovery.descriptor);
      hardFailpoint(env, 'rollback-after-descriptor-restore');
      active.state = 'descriptor-restored';
      writeRollbackActive(paths.active, active);
    }
    if (active.state === 'descriptor-restored') {
      const descriptorNow = snapshot(descriptorFile);
      const rootNow = snapshot(rootFile);
      if (descriptorNow.hash !== active.recovery.descriptor.hash || ![active.transition_root_hash, active.recovery.root.hash].includes(rootNow.hash)) throw new UserError('rollback descriptor-restored postimages changed', 'migration_conflict');
      if (rootNow.hash === active.transition_root_hash) restoreSnapshot(rootFile, active.recovery.root);
      hardFailpoint(env, 'rollback-after-root-restore');
      active.state = 'root-restored';
      writeRollbackActive(paths.active, active);
    }
    if (active.state === 'root-restored') {
      if (snapshot(descriptorFile).hash !== active.recovery.descriptor.hash || snapshot(rootFile).hash !== active.recovery.root.hash) throw new UserError('rollback restored project files changed', 'migration_conflict');
      const guidesExists = fs.existsSync(guidesRoot);
      const backupExists = fs.existsSync(paths.guidesBackup);
      if (guidesExists && backupExists) throw new UserError('rollback guide tree and backup both exist', 'migration_conflict');
      if (guidesExists) {
        const currentFiles = treeRecords(guidesRoot);
        if (canonicalJson(currentFiles) !== canonicalJson(active.guides_files)) throw new UserError('managed guide tree changed; rollback stopped before removal', 'migration_conflict');
        fs.renameSync(guidesRoot, paths.guidesBackup);
        fsyncDirectory(projectRoot);
        fsyncDirectory(paths.directory);
        hardFailpoint(env, 'rollback-after-guides-move');
      }
      if (fs.existsSync(paths.guidesBackup) && canonicalJson(treeRecords(paths.guidesBackup)) !== canonicalJson(active.guides_files)) throw new UserError('rollback guide backup changed after interruption', 'migration_conflict');
      active.state = fs.existsSync(paths.guidesBackup) ? 'guides-moved' : 'guides-removed';
      writeRollbackActive(paths.active, active);
    }
    if (active.state === 'guides-moved') {
      if (snapshot(descriptorFile).hash !== active.recovery.descriptor.hash || snapshot(rootFile).hash !== active.recovery.root.hash) throw new UserError('rollback restored project files changed before cleanup', 'migration_conflict');
      if (fs.existsSync(paths.guidesBackup)) {
        if (canonicalJson(treeRecords(paths.guidesBackup)) !== canonicalJson(active.guides_files)) throw new UserError('rollback guide backup changed before cleanup', 'migration_conflict');
        fs.rmSync(paths.guidesBackup, { recursive: true });
      }
      hardFailpoint(env, 'rollback-after-guides-remove');
      active.state = 'guides-removed';
      writeRollbackActive(paths.active, active);
    }
    if (active.state !== 'guides-removed') throw new UserError(`unknown v3 rollback state: ${active.state}`, 'migration_conflict');
    if (snapshot(descriptorFile).hash !== active.recovery.descriptor.hash || snapshot(rootFile).hash !== active.recovery.root.hash || fs.existsSync(guidesRoot) || fs.existsSync(paths.guidesBackup)) throw new UserError('rollback final postimages differ from recovery plan', 'migration_conflict');
    const restored = readDescriptor(projectRoot).descriptor;
    if (restored.schema_version !== 1) throw new UserError('v3 rollback did not restore schema 1 descriptor', 'migration_conflict');
    paths.cleanup();
    return { status: 'rolled_back', schema_version: 1, project_id: restored.project_id, provider: restored.provider };
  } finally {
    paths.release();
  }
}

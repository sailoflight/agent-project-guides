import fs from 'node:fs';
import path from 'node:path';
import {
  DESCRIPTOR_NAME,
  UserError,
  acquireProjectMutationLock,
  buildFileManifest,
  canonicalJson,
  projectStateDir,
  readJson,
  sha256,
  verifyFileManifest,
  writeJsonAtomic,
} from './core.mjs';
import { catalogJsonl, buildCatalog } from './catalog.mjs';
import { defaultDescriptor, validateDescriptor } from './descriptor.mjs';
import { addEmbeddedExclude, installEmbedded, previewEmbeddedExclude } from './provider.mjs';
import { installBootstrap, previewBootstrap, restoreOwnedFile } from './bootstrap.mjs';

const PROJECT_ID = /^[a-z0-9][a-z0-9._-]{2,127}$/;

function fileSnapshot(file) {
  const stat = fs.lstatSync(file, { throwIfNoEntry: false });
  if (!stat) return { exists: false, hash: 'missing', base64: '', mode: null };
  if (stat.isSymbolicLink() || !stat.isFile()) throw new UserError(`owned path is not a regular file: ${file}`, 'migration_conflict');
  const bytes = fs.readFileSync(file);
  return { exists: true, hash: `sha256:${sha256(bytes)}`, base64: bytes.toString('base64'), mode: stat.mode & 0o777 };
}

function sameSnapshot(file, snapshot) {
  const current = fileSnapshot(file);
  return current.exists === snapshot.exists && current.hash === snapshot.hash;
}

function restoreSnapshot(file, before, afterHash) {
  const current = fileSnapshot(file);
  if (current.exists === before.exists && current.hash === before.hash) return { status: 'already_restored', path: file };
  if (current.hash !== afterHash) return { status: 'conflict', path: file, expected_postimage: afterHash, actual: current.hash };
  if (!before.exists) fs.rmSync(file);
  else {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temporary = `${file}.apg-restore-${process.pid}`;
    fs.writeFileSync(temporary, Buffer.from(before.base64, 'base64'), { mode: before.mode || 0o644 });
    fs.renameSync(temporary, file);
  }
  return { status: 'restored', path: file };
}

function selectedLegacyRoot(projectRoot) {
  const candidates = ['AGENTS.md', 'CLAUDE.md'];
  const managed = candidates.filter((name) => {
    const file = path.join(projectRoot, name);
    return fs.statSync(file, { throwIfNoEntry: false })?.isFile() && fs.readFileSync(file).includes(Buffer.from('<!-- agent-project-guides:routing:start -->'));
  });
  if (managed.length > 1) throw new UserError('legacy routing appears in multiple root files', 'migration_conflict');
  if (managed.length === 1) return managed[0];
  if (fs.existsSync(path.join(projectRoot, 'AGENTS.md'))) return 'AGENTS.md';
  return 'CLAUDE.md';
}

function assertCatalogCurrent(sourceRoot) {
  const file = path.join(sourceRoot, 'catalog', 'catalog.jsonl');
  const expected = catalogJsonl(buildCatalog(sourceRoot));
  if (!fs.statSync(file, { throwIfNoEntry: false })?.isFile() || fs.readFileSync(file, 'utf8') !== expected) {
    throw new UserError('generated catalog is missing or stale; run apg catalog build', 'catalog_stale');
  }
}

function migrationPaths(projectRoot, projectId, env) {
  const state = projectStateDir(projectRoot, projectId, env);
  return {
    state,
    plans: path.join(state, 'migration-plans'),
    active: path.join(state, 'migration-active.json'),
    receipt: path.join(state, 'migration-receipt.json'),
    journal: path.join(state, 'migration-journal.jsonl'),
  };
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
}

export function planMigration(projectRoot, sourceRoot, { projectId, facets = [], overlays = [], mandatory = [], protectedEffects = [] }, env = process.env) {
  assertCatalogCurrent(sourceRoot);
  const rootName = selectedLegacyRoot(projectRoot);
  const release = buildFileManifest(sourceRoot);
  const draftDescriptor = defaultDescriptor({
    projectId,
    mode: 'embedded-local',
    release: release.package_version,
    digest: release.digest,
    rootName,
    facets,
    overlays,
  });
  draftDescriptor.policy.mandatory = mandatory;
  draftDescriptor.protected_effects = protectedEffects;
  const descriptor = validateDescriptor(draftDescriptor, projectRoot);
  const rootFile = path.join(projectRoot, rootName);
  const descriptorFile = path.join(projectRoot, DESCRIPTOR_NAME);
  const plan = {
    schema_version: 1,
    operation: 'migrate-1.x-to-2.0',
    project_root: fs.realpathSync(projectRoot),
    package_source: fs.realpathSync(sourceRoot),
    project_id: projectId,
    release_digest: release.digest,
    root_name: rootName,
    root_before: fileSnapshot(rootFile),
    descriptor_before: fileSnapshot(descriptorFile),
    descriptor,
    effects: [
      `write ${DESCRIPTOR_NAME}`,
      `replace legacy managed blocks in ${rootName} with v2 bootstrap`,
      'install an ignored embedded immutable release',
      'write clone-local receipt and journal',
    ],
    rollback_boundary: 'migration-owned exact preimages only; later changes become conflicts',
  };
  const planDigest = `sha256:${sha256(canonicalJson(plan))}`;
  const paths = migrationPaths(projectRoot, projectId, env);
  fs.mkdirSync(paths.plans, { recursive: true });
  const file = path.join(paths.plans, `${planDigest.replace(':', '-')}.json`);
  writeJsonAtomic(file, { ...plan, plan_digest: planDigest }, 0o600);
  return { plan: file, digest: planDigest, effects: plan.effects, writes_project: false };
}

function loadPlan(file, expectedDigest) {
  const value = readJson(file, 'migration plan');
  const { plan_digest: stored, ...plan } = value;
  const actual = `sha256:${sha256(canonicalJson(plan))}`;
  if (stored !== actual || expectedDigest !== actual) throw new UserError('migration plan digest mismatch', 'plan_mismatch');
  if (!PROJECT_ID.test(value.project_id || '')) throw new UserError('migration plan project_id is invalid', 'plan_mismatch');
  return value;
}

function writeDescriptorOwned(projectRoot, descriptor, before) {
  const file = path.join(projectRoot, DESCRIPTOR_NAME);
  const afterBytes = Buffer.from(canonicalJson(descriptor));
  const afterHash = `sha256:${sha256(afterBytes)}`;
  const current = fileSnapshot(file);
  if (current.hash === afterHash) return { path: DESCRIPTOR_NAME, before, after_hash: afterHash, status: 'already_written' };
  if (current.exists !== before.exists || current.hash !== before.hash) throw new UserError(`${DESCRIPTOR_NAME} changed after migration planning`, 'migration_conflict');
  const temporary = `${file}.apg-${process.pid}`;
  fs.writeFileSync(temporary, afterBytes, { mode: 0o644 });
  fs.renameSync(temporary, file);
  return { path: DESCRIPTOR_NAME, before, after_hash: afterHash, status: 'written' };
}

function testFailpoint(env, name) {
  if (env.APG_TEST_FAILPOINT === name) throw new UserError(`test failpoint: ${name}`, 'test_failpoint');
}

export function applyMigration(planFile, expectedDigest, env = process.env) {
  const plan = loadPlan(planFile, expectedDigest);
  const projectRoot = plan.project_root;
  const paths = migrationPaths(projectRoot, plan.project_id, env);
  const mutationLock = acquireProjectMutationLock(projectRoot, plan.project_id, env);
  try {
  if (fs.existsSync(paths.receipt)) {
    fs.rmSync(paths.active, { force: true });
    const receipt = readJson(paths.receipt, 'migration receipt');
    return { status: 'already_migrated', receipt: paths.receipt, provider: 'embedded-local', digest: receipt.embedded.digest };
  }
  let active = fs.existsSync(paths.active) ? readJson(paths.active, 'active migration') : {
    schema_version: 1,
    plan,
    root_ownership: null,
    descriptor_ownership: null,
    exclude_ownership: null,
    embedded: null,
  };
  if (active.plan.plan_digest !== plan.plan_digest) throw new UserError('another migration plan is active', 'migration_conflict');
  if (!active.root_ownership && !sameSnapshot(path.join(projectRoot, plan.root_name), plan.root_before)) {
    throw new UserError(`${plan.root_name} changed after migration planning`, 'migration_conflict');
  }
  writeJsonAtomic(paths.active, active, 0o600);
  appendJournal(paths.journal, { event: 'apply-start', plan_digest: plan.plan_digest });

  if (!active.embedded) {
    const expectedRoot = path.join(projectRoot, '.agent-project-guides', 'local', 'releases', plan.release_digest.replace(':', '-'));
    active.embedded = { root: expectedRoot, digest: plan.release_digest, created: !fs.existsSync(expectedRoot), state: 'planned' };
    writeJsonAtomic(paths.active, active, 0o600);
  }
  if (active.embedded.state === 'planned') {
    const installed = installEmbedded(plan.package_source, projectRoot);
    if (installed.manifest.digest !== plan.release_digest || installed.root !== active.embedded.root) {
      if (installed.installed) fs.rmSync(installed.root, { recursive: true, force: true });
      throw new UserError('installed release differs from migration plan', 'release_mismatch');
    }
    testFailpoint(env, 'after-embedded-write');
    active.embedded.state = 'installed';
    writeJsonAtomic(paths.active, active, 0o600);
    appendJournal(paths.journal, { event: 'embedded-installed', digest: installed.manifest.digest, created: active.embedded.created });
  }

  if (!active.exclude_ownership) {
    const preview = previewEmbeddedExclude(projectRoot);
    active.exclude_ownership = preview.file
      ? {
          file: preview.file,
          before: fileSnapshot(preview.file),
          after_hash: `sha256:${sha256(preview.after)}`,
          after_base64: preview.after.toString('base64'),
          status: preview.changed ? 'planned' : 'preexisting',
        }
      : { file: null, before: null, after_hash: null, after_base64: '', status: 'no_git_metadata' };
    writeJsonAtomic(paths.active, active, 0o600);
  }
  if (active.exclude_ownership.status === 'planned') {
    const current = fileSnapshot(active.exclude_ownership.file);
    if (current.hash === active.exclude_ownership.after_hash) {
      active.exclude_ownership.status = 'written';
    } else if (current.hash === active.exclude_ownership.before.hash) {
      addEmbeddedExclude(projectRoot);
      testFailpoint(env, 'after-exclude-write');
      const after = fileSnapshot(active.exclude_ownership.file);
      if (after.hash !== active.exclude_ownership.after_hash) throw new UserError('Git exclude postimage differs from migration plan', 'migration_conflict');
      active.exclude_ownership.status = 'written';
    } else {
      throw new UserError('Git exclude changed during migration', 'migration_conflict');
    }
    writeJsonAtomic(paths.active, active, 0o600);
    appendJournal(paths.journal, { event: 'exclude-updated', status: active.exclude_ownership.status });
  }

  if (!active.descriptor_ownership) {
    const afterBytes = Buffer.from(canonicalJson(plan.descriptor));
    active.descriptor_ownership = {
      path: DESCRIPTOR_NAME,
      before: plan.descriptor_before,
      after_hash: `sha256:${sha256(afterBytes)}`,
      status: 'planned',
    };
    writeJsonAtomic(paths.active, active, 0o600);
  }
  if (active.descriptor_ownership.status === 'planned') {
    const current = fileSnapshot(path.join(projectRoot, DESCRIPTOR_NAME));
    if (current.hash === active.descriptor_ownership.after_hash) {
      active.descriptor_ownership.status = 'recovered';
    } else {
      writeDescriptorOwned(projectRoot, plan.descriptor, active.descriptor_ownership.before);
      testFailpoint(env, 'after-descriptor-write');
      active.descriptor_ownership.status = 'written';
    }
    writeJsonAtomic(paths.active, active, 0o600);
    appendJournal(paths.journal, { event: 'descriptor-written', hash: active.descriptor_ownership.after_hash });
  }

  if (!active.root_ownership) {
    const preview = previewBootstrap(projectRoot, active.embedded.root, plan.descriptor, { includeV1: true, beforeSnapshot: plan.root_before });
    active.root_ownership = { ...preview.ownership, status: 'planned' };
    writeJsonAtomic(paths.active, active, 0o600);
  }
  if (active.root_ownership.status === 'planned') {
    const current = fileSnapshot(path.join(projectRoot, plan.root_name));
    const beforeHash = active.root_ownership.before_exists ? active.root_ownership.before_hash : 'missing';
    if (current.hash === active.root_ownership.after_hash) {
      active.root_ownership.status = 'recovered';
    } else if (current.hash === beforeHash) {
      installBootstrap(projectRoot, active.embedded.root, plan.descriptor, { includeV1: true, beforeSnapshot: plan.root_before });
      testFailpoint(env, 'after-bootstrap-write');
      active.root_ownership.status = 'written';
    } else {
      throw new UserError(`${plan.root_name} changed during migration`, 'migration_conflict');
    }
    writeJsonAtomic(paths.active, active, 0o600);
    appendJournal(paths.journal, { event: 'bootstrap-written', hash: active.root_ownership.after_hash });
  }

  const receipt = {
    schema_version: 1,
    operation: plan.operation,
    plan_digest: plan.plan_digest,
    project_id: plan.project_id,
    project_root: projectRoot,
    root_ownership: active.root_ownership,
    descriptor_ownership: active.descriptor_ownership,
    exclude_ownership: active.exclude_ownership,
    embedded: active.embedded,
  };
  writeJsonAtomic(paths.receipt, receipt, 0o600);
  appendJournal(paths.journal, { event: 'apply-complete', plan_digest: plan.plan_digest });
  fs.rmSync(paths.active, { force: true });
  return { status: 'migrated', receipt: paths.receipt, provider: 'embedded-local', digest: plan.release_digest };
  } finally {
    mutationLock.release();
  }
}

export function rollbackMigration(projectRoot, projectId, env = process.env) {
  if (!PROJECT_ID.test(projectId || '')) throw new UserError('rollback project_id is invalid', 'invalid_request');
  const paths = migrationPaths(projectRoot, projectId, env);
  const mutationLock = acquireProjectMutationLock(projectRoot, projectId, env);
  try {
  const receipt = readJson(paths.receipt, 'migration receipt');
  appendJournal(paths.journal, { event: 'rollback-start', plan_digest: receipt.plan_digest });

  const preflight = [];
  const rootFile = path.join(projectRoot, receipt.root_ownership.root);
  const rootCurrent = fileSnapshot(rootFile);
  const rootBeforeExpected = receipt.root_ownership.before_exists ? receipt.root_ownership.before_hash : 'missing';
  if (![rootBeforeExpected, receipt.root_ownership.after_hash].includes(rootCurrent.hash)) {
    preflight.push({ status: 'conflict', path: receipt.root_ownership.root, expected_postimage: receipt.root_ownership.after_hash, actual: rootCurrent.hash });
  }
  const descriptorFile = path.join(projectRoot, receipt.descriptor_ownership.path);
  const descriptorCurrent = fileSnapshot(descriptorFile);
  if (![receipt.descriptor_ownership.before.hash, receipt.descriptor_ownership.after_hash].includes(descriptorCurrent.hash)) {
    preflight.push({ status: 'conflict', path: receipt.descriptor_ownership.path, expected_postimage: receipt.descriptor_ownership.after_hash, actual: descriptorCurrent.hash });
  }
  if (receipt.exclude_ownership?.file && receipt.exclude_ownership.status === 'written') {
    const excludeCurrent = fileSnapshot(receipt.exclude_ownership.file);
    if (![receipt.exclude_ownership.before.hash, receipt.exclude_ownership.after_hash].includes(excludeCurrent.hash)) {
      preflight.push({ status: 'conflict', path: receipt.exclude_ownership.file, expected_postimage: receipt.exclude_ownership.after_hash, actual: excludeCurrent.hash });
    }
  }
  if (receipt.embedded?.created && fs.existsSync(receipt.embedded.root)) {
    try {
      const manifest = readJson(path.join(receipt.embedded.root, 'release-manifest.json'), 'release manifest');
      if (manifest.digest !== receipt.embedded.digest) throw new UserError('release digest changed', 'release_corrupt');
      verifyFileManifest(receipt.embedded.root, manifest);
    } catch (error) {
      preflight.push({ status: 'conflict', path: receipt.embedded.root, reason: `release content changed: ${error.message}` });
    }
  }
  if (preflight.length) {
    appendJournal(paths.journal, { event: 'rollback-conflict', conflicts: preflight.length });
    return { status: 'conflict', results: [], conflicts: preflight };
  }

  const results = [];
  results.push(restoreOwnedFile(projectRoot, receipt.root_ownership));
  if (receipt.exclude_ownership?.file && receipt.exclude_ownership.status === 'written') {
    results.push(restoreSnapshot(receipt.exclude_ownership.file, receipt.exclude_ownership.before, receipt.exclude_ownership.after_hash));
  }
  if (receipt.embedded?.created && fs.existsSync(receipt.embedded.root)) {
    fs.rmSync(receipt.embedded.root, { recursive: true, force: true });
    results.push({ status: 'removed', path: receipt.embedded.root });
  }
  results.push(restoreSnapshot(descriptorFile, receipt.descriptor_ownership.before, receipt.descriptor_ownership.after_hash));
  testFailpoint(env, 'after-rollback-descriptor');
  appendJournal(paths.journal, { event: 'rollback-complete', conflicts: 0 });
  fs.rmSync(paths.receipt);
  return { status: 'rolled_back', results, conflicts: [] };
  } finally {
    mutationLock.release();
  }
}

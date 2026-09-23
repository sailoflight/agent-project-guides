#!/usr/bin/env node
import { writeFileAtomic } from '../lib/files.mjs';
import { compareCanonical } from '../lib/core.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DESCRIPTOR_NAME,
  UserError,
  acquireProjectMutationLock,
  buildFileManifest,
  canonicalJson,
  findProjectRoot,
  platformHomes,
  projectStateDir,
  readJson,
  sha256,
  verifyFileManifest,
  writeJsonAtomic,
} from '../lib/core.mjs';
import { buildCatalog, catalogJsonl, loadCatalogEntry, normalizeCatalogId, readCatalog, resolveRoute, searchCatalog, writeCatalog } from '../lib/catalog.mjs';
import { validateContextRoutes } from '../lib/context-routes.mjs';
import { defaultDescriptor, readDescriptor, validateDescriptor, writeDescriptor } from '../lib/descriptor.mjs';
import { inspectBootstrap, installBootstrap, renderBootstrap, restoreOwnedFile } from '../lib/bootstrap.mjs';
import { addEmbeddedExclude, gitExcludeFile, installEmbedded, installRelease, loadGenerationReference, openPackedRuntime, openProvider, portableSnapshot, readGenerationKey } from '../lib/provider.mjs';
import { applyMigration, planMigration, rollbackMigration } from '../lib/migration.mjs';
import { applyV2ToV3Migration, previewV2ToV3Migration, rollbackV3Migration } from '../lib/migration-v3.mjs';
import { applyMaterialization, previewMaterialization, validateMaterializedProject } from '../lib/materializer.mjs';
import { compileContext, renderContext, validateContextMatrix } from '../lib/context.mjs';
import { contextErrorRecord } from '../lib/context-errors.mjs';
export { contextErrorRecord };
import { composeRisk, parseEffectList } from '../lib/risk.mjs';
import { projectDigest, promoteMemory, proposeMemory, purgeMemoryProposal, readMemoryInput, reviewMemory, supersedeMemory } from '../lib/memory.mjs';
import { observeRootBlocks } from '../lib/observation-ledger.mjs';
import { applyRequirements, checkRequirements, findDuplicateDigests, probeService, readStoreEntryRecords, resolvePackage, resolveService, storeRoot } from '../lib/components.mjs';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = fs.readFileSync(path.join(packageRoot, 'PACKAGE_VERSION'), 'utf8').trim();

function fail(message) {
  throw new UserError(message, 'invalid_arguments');
}

function parseArgs(argv) {
  const positional = [];
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '-h' || value === '-V') {
      options[value === '-h' ? 'help' : 'version'] = true;
      continue;
    }
    if (!value.startsWith('--')) {
      positional.push(value);
      continue;
    }
    const name = value.slice(2);
    if (['apply', 'offline', 'nonbehavioral', 'include-suggested', 'overwrite', 'help', 'version'].includes(name)) {
      options[name] = true;
      continue;
    }
    if (index + 1 >= argv.length || argv[index + 1].startsWith('--')) fail(`--${name} requires a value`);
    options[name] = argv[++index];
  }
  return { positional, options };
}

function splitList(value) {
  return value ? value.split(',').map((item) => item.trim()).filter(Boolean) : [];
}

function targetRoot(options, requireDescriptor = true) {
  const root = options.target ? fs.realpathSync(options.target) : findProjectRoot(process.cwd(), requireDescriptor);
  recoverDescriptorTransactionIfPresent(root);
  return root;
}

function observedTargetRoot(options, requireDescriptor = true) {
  return options.target ? fs.realpathSync(options.target) : findProjectRoot(process.cwd(), requireDescriptor);
}

function helpText(scope) {
  const common = [
    'Agent Project Guides',
    '',
    `Usage: ${scope === 'context' ? 'apg context [options]' : 'apg <command> [options]'}`,
    '',
  ];
  if (scope === 'context') return `${[
    ...common,
    'Resolve and load one exact governance route without granting operational authority.',
    '',
    'Options:',
    '  --task <text>                 Infer a route or return executable choices',
    '  --plane <plane>               production | development',
    '  --role <role>                 Exact role ID or alias',
    '  --mode <mode>                 Exact mode for the selected role',
    '  --generation <token>          Continue a pinned shared-runtime choice set',
    '  --select <choice_id>          Select one generation-bound choice',
    '  --format <context|json>       Output format (default: context)',
    '  --target <path>               Project root',
    '  -h, --help                    Show this help',
  ].join('\n')}\n`;
  return `${[
    ...common,
    'Commands:',
    '  context                      Resolve bounded governance context',
    '  project                      Initialize, validate, reattest, observe, or materialize a project',
    '  catalog                      Build or check the catalog',
    '  release                      Build, install, or verify a release',
    '  provider                     Resolve and load provider content',
    '  migrate                      Plan, apply, or roll back migration',
    '  risk                         Classify effects',
    '  memory                       Manage reviewed project memory',
    '  dsh                          [compat] DSH observation adapter (future: plugins/dsh-apg)',
    '  components                   Verify or probe the shared component store',
    '',
    'Options:',
    '  -h, --help                    Show help',
    '  -V, --version                 Show version',
  ].join('\n')}\n`;
}

function print(value) {
  if (value && value.__apg_text === true) process.stdout.write(value.text);
  else process.stdout.write(canonicalJson(value));
}

function chooseRoot(projectRoot, requested) {
  if (requested) {
    if (!['AGENTS.md', 'CLAUDE.md'].includes(requested)) fail('--root must be AGENTS.md or CLAUDE.md');
    return requested;
  }
  if (fs.existsSync(path.join(projectRoot, 'AGENTS.md'))) return 'AGENTS.md';
  const claude = path.join(projectRoot, 'CLAUDE.md');
  if (fs.statSync(claude, { throwIfNoEntry: false })?.isFile() && fs.statSync(claude).size <= 12_288) return 'CLAUDE.md';
  return 'AGENTS.md';
}

function ensureLauncher(sourceRoot, env = process.env) {
  const homes = platformHomes(env);
  fs.mkdirSync(homes.bin, { recursive: true });
  const launcher = path.join(homes.bin, 'apg-launcher.mjs');
  fs.copyFileSync(path.join(sourceRoot, 'scripts', 'apg-launcher.mjs'), launcher);
  fs.copyFileSync(path.join(sourceRoot, 'PACKAGE_VERSION'), path.join(homes.bin, 'apg-launcher.version'));
  const command = path.join(homes.bin, process.platform === 'win32' ? 'apg.cmd' : 'apg');
  if (process.platform === 'win32') {
    fs.writeFileSync(command, `@echo off\r\nnode "${launcher}" %*\r\n`);
  } else {
    fs.writeFileSync(command, `#!/bin/sh\nexec node "${launcher}" "$@"\n`, { mode: 0o755 });
  }
  return { launcher, command, path_required: !env.PATH?.split(path.delimiter).includes(homes.bin) };
}

function initializationReceipt(projectRoot, descriptorOrId) {
  const projectId = typeof descriptorOrId === 'string' ? descriptorOrId : descriptorOrId.project_id;
  return path.join(projectStateDir(projectRoot, projectId), 'project-receipt.json');
}

function snapshotFile(file) {
  const stat = fs.lstatSync(file, { throwIfNoEntry: false });
  if (!stat) return { exists: false, hash: 'missing', base64: '', mode: null };
  if (stat.isSymbolicLink() || !stat.isFile()) throw new UserError(`owned path is not a regular file: ${file}`, 'lifecycle_conflict');
  const bytes = fs.readFileSync(file);
  return { exists: true, hash: `sha256:${sha256(bytes)}`, base64: bytes.toString('base64'), mode: stat.mode & 0o777 };
}

function restoreSnapshotFile(file, before, afterHash) {
  const current = snapshotFile(file);
  if (current.exists === before.exists && current.hash === before.hash) return { status: 'already_restored', path: file };
  if (current.hash !== afterHash) return { status: 'conflict', path: file, expected_postimage: afterHash, actual: current.hash };
  if (!before.exists) fs.rmSync(file);
  else {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temporary = `${file}.apg-restore-${process.pid}`;
    writeFileAtomic(file, Buffer.from(before.base64, 'base64'), { mode: before.mode ?? 0o644, temporary });
  }
  return { status: 'restored', path: file };
}

function writeBytesAtomic(file, bytes, mode = 0o644) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.apg-bytes-${process.pid}`;
  writeFileAtomic(file, bytes, { mode, temporary });
}

function descriptorTransactionFile(projectRoot, projectId) {
  return path.join(projectStateDir(projectRoot, projectId), 'descriptor-transaction.json');
}

function snapshotMatches(snapshot, expected) {
  return snapshot.exists === expected.exists && snapshot.hash === expected.hash;
}

function recoverDescriptorTransaction(projectRoot, projectId) {
  const transactionFile = descriptorTransactionFile(projectRoot, projectId);
  if (!fs.statSync(transactionFile, { throwIfNoEntry: false })?.isFile()) return false;
  const lock = acquireProjectMutationLock(projectRoot, projectId);
  try {
    const transaction = readJson(transactionFile, 'descriptor transaction');
    const descriptorFile = path.join(projectRoot, DESCRIPTOR_NAME);
    const receiptFile = path.join(projectStateDir(projectRoot, projectId), transaction.receipt.name);
    const descriptorCurrent = snapshotFile(descriptorFile);
    const receiptCurrent = snapshotFile(receiptFile);
    const descriptorBefore = snapshotMatches(descriptorCurrent, transaction.descriptor.before);
    const descriptorAfter = descriptorCurrent.hash === transaction.descriptor.after_hash;
    const receiptBefore = snapshotMatches(receiptCurrent, transaction.receipt.before);
    const receiptAfter = receiptCurrent.hash === transaction.receipt.after_hash;
    if (descriptorBefore && receiptBefore) {
      fs.rmSync(transactionFile);
      return true;
    }
    if ((!descriptorBefore && !descriptorAfter) || (!receiptBefore && !receiptAfter)) {
      throw new UserError('descriptor transaction has an ambiguous external edit', 'transaction_conflict');
    }
    writeBytesAtomic(descriptorFile, Buffer.from(transaction.descriptor.after_base64, 'base64'), transaction.descriptor.after_mode);
    writeBytesAtomic(receiptFile, Buffer.from(transaction.receipt.after_base64, 'base64'), transaction.receipt.after_mode);
    fs.rmSync(transactionFile);
    return true;
  } finally {
    lock.release();
  }
}

function recoverDescriptorTransactionIfPresent(projectRoot) {
  const file = path.join(projectRoot, DESCRIPTOR_NAME);
  if (!fs.statSync(file, { throwIfNoEntry: false })?.isFile()) return false;
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return false;
  }
  if (typeof raw.project_id === 'string') return recoverDescriptorTransaction(projectRoot, raw.project_id);
  return false;
}

function initProject(options) {
  const projectRoot = targetRoot(options, false);
  const mode = options.mode || 'thin-bootstrap';
  const projectId = options['project-id'];
  if (!projectId) fail('project init requires --project-id');
  if (!/^[a-z0-9][a-z0-9._-]{2,127}$/.test(projectId)) fail('project init requires a valid portable --project-id');
  const sourceRoot = fs.realpathSync(options.source || packageRoot);
  const descriptorFile = path.join(projectRoot, DESCRIPTOR_NAME);
  let descriptorBefore;
  let descriptor;
  let provider;
  let installed;
  let excludeOwnership;
  let rootOwnership;
  let receiptFile;
  let mutationLock;
  try {
    mutationLock = acquireProjectMutationLock(projectRoot, projectId);
    if (fs.existsSync(descriptorFile) && !options.overwrite) throw new UserError(`${DESCRIPTOR_NAME} already exists`, 'descriptor_exists');
    descriptorBefore = snapshotFile(descriptorFile);
    if (mode === 'source-worktree') {
      if (sourceRoot !== projectRoot) fail('source-worktree is reserved for a package source governing itself');
      provider = { mode, release: VERSION, digest: 'observe', source: '.' };
    } else if (mode === 'thin-bootstrap') {
      installed = installRelease(sourceRoot);
      provider = { mode, release: installed.manifest.package_version, digest: installed.manifest.digest };
    } else if (mode === 'embedded-local') {
      installed = installEmbedded(sourceRoot, projectRoot);
      const excludeFile = gitExcludeFile(projectRoot);
      const before = excludeFile ? snapshotFile(excludeFile) : null;
      const result = addEmbeddedExclude(projectRoot);
      excludeOwnership = result.file ? { file: result.file, before, after_hash: snapshotFile(result.file).hash, changed: result.changed } : null;
      provider = { mode, release: installed.manifest.package_version, digest: installed.manifest.digest };
    } else fail(`unsupported mode: ${mode}`);

    descriptor = defaultDescriptor({
      projectId,
      mode: provider.mode,
      release: provider.release,
      digest: provider.digest,
      source: provider.source,
      rootName: chooseRoot(projectRoot, options.root),
      facets: splitList(options.facets),
      overlays: splitList(options.overlays),
    });
    const runtimeRoot = mode === 'source-worktree' ? sourceRoot : installed.root;
    // Record the descriptor-side anchor for the v2 block *before* writing either
    // file. The block does not depend on this field, so there is no cycle: render
    // it once, hash it, then write the descriptor and install exactly those bytes.
    descriptor = {
      ...descriptor,
      integrity: { root_block_hash: `sha256:${sha256(renderBootstrap(runtimeRoot, descriptor))}` },
    };
    writeDescriptor(projectRoot, descriptor, { overwrite: Boolean(options.overwrite) });
    rootOwnership = installBootstrap(projectRoot, runtimeRoot, descriptor, { includeV1: false });
    const descriptorAfter = snapshotFile(descriptorFile);
    const receipt = {
      schema_version: 1,
      operation: 'project-init',
      project_id: projectId,
      descriptor: { path: DESCRIPTOR_NAME, before: descriptorBefore, after_hash: descriptorAfter.hash },
      root_ownership: rootOwnership,
      exclude_ownership: excludeOwnership,
      provider: { mode, root: installed?.root, created: installed?.installed || false, digest: provider.digest },
    };
    receiptFile = initializationReceipt(projectRoot, descriptor);
    writeJsonAtomic(receiptFile, receipt, 0o600);
    const launcher = mode === 'source-worktree'
      ? { command: `${process.execPath} ${path.join(sourceRoot, 'scripts', 'apg.mjs')}`, launcher: null, shared: false }
      : ensureLauncher(installed.root);
    return { status: 'initialized', project_root: projectRoot, descriptor: DESCRIPTOR_NAME, provider, launcher, staged: false };
  } catch (error) {
    if (rootOwnership) restoreOwnedFile(projectRoot, rootOwnership);
    const descriptorCurrent = snapshotFile(descriptorFile);
    if (descriptor && descriptorCurrent.hash === `sha256:${sha256(Buffer.from(canonicalJson(descriptor)))}`) {
      restoreSnapshotFile(descriptorFile, descriptorBefore, descriptorCurrent.hash);
    }
    if (excludeOwnership?.changed) restoreSnapshotFile(excludeOwnership.file, excludeOwnership.before, excludeOwnership.after_hash);
    if (installed?.installed && mode === 'embedded-local') fs.rmSync(installed.root, { recursive: true, force: true });
    if (receiptFile) fs.rmSync(receiptFile, { force: true });
    throw error;
  } finally {
    mutationLock?.release();
  }
}

function hydrateProject(options) {
  const projectRoot = targetRoot(options);
  const { descriptor } = readDescriptor(projectRoot);
  if (descriptor.provider.mode !== 'thin-bootstrap') throw new UserError('project hydrate is valid only for thin-bootstrap', 'wrong_lifecycle');
  if (options.offline) throw new UserError('offline mode never hydrates a missing release', 'package_missing', { digest: descriptor.provider.digest, implicit_latest: false });
  if (!options.source) fail('project hydrate requires an explicit --source for the pinned release');
  const installed = installRelease(fs.realpathSync(options.source));
  if (installed.manifest.digest !== descriptor.provider.digest || installed.manifest.package_version !== descriptor.provider.release) {
    if (installed.installed) fs.rmSync(installed.root, { recursive: true, force: true });
    throw new UserError('explicit source does not match the project-pinned release', 'release_mismatch', {
      expected: descriptor.provider.digest,
      actual: installed.manifest.digest,
    });
  }
  return {
    status: installed.installed ? 'hydrated' : 'present',
    digest: installed.manifest.digest,
    source: fs.realpathSync(options.source),
    implicit_latest: false,
    launcher: ensureLauncher(installed.root),
  };
}

// Re-record the descriptor-side anchor for the v2 bootstrap block, and install the
// block those bytes describe.
//
// Needed because the anchor is a hash of a block that legitimately changes: the
// block renders the pinned release and digest, so a release bump invalidates the
// recorded hash by design. Without this command the only way to move the anchor
// would be to hand-edit the descriptor, which is exactly the kind of unverified
// edit the anchor exists to catch. The installed block is verified first, so
// reattest cannot launder a hand-edited block into a fresh anchor.
function observeProject(options) {
  const projectRoot = targetRoot(options);
  const { descriptor } = readDescriptor(projectRoot);
  return observeRootBlocks(projectRoot, descriptor, { root: options.root });
}

// ADR 0009/0010. Read-only by construction: this group verifies what a human or an
// operator already staged, and reports what is missing. It never downloads, installs,
// starts or stops anything, which is why it belongs on the authority side of the
// partition ADR 0007 draws - and why the boundary gate's FORBIDDEN list, which rejects
// naming a mechanism such as `store`, still admits it.
function verifyComponents(options) {
  const root = storeRoot({ store: options.store });
  if (!fs.statSync(root, { throwIfNoEntry: false })?.isDirectory()) {
    return { root, present: false, packages_total: 0, packages: [], reusable_packages: [], missing_packages: [], degraded_packages: [], conflicted_packages: [], services: [] };
  }
  const records = readStoreEntryRecords(root);
  const duplicates = findDuplicateDigests(records.packages);
  const duplicated = new Set(duplicates.map((entry) => entry.id));
  // A duplicated id is resolved to nothing at all: two digests under one id mean the store
  // cannot say which copy is current, so a requirement naming it must not be reported
  // satisfied by a copy nobody chose.
  const singles = records.packages.filter((entry) => !duplicated.has(entry.id));
  const resolved = singles.map((entry) => resolvePackage(entry, root));
  // A requirement naming another component is resolved against all of them at once, so the
  // verdict cannot depend on the order they happen to be walked in.
  const describe = (id) => {
    if (duplicated.has(id)) return null;
    const found = resolved.find((entry) => entry.id === id);
    if (found) return found.state === 'available' ? 'available' : null;
    return records.services.some((entry) => entry.id === id) ? 'declared' : null;
  };
  const packages = [
    ...singles.map((record, index) => applyRequirements(resolved[index], checkRequirements(record.requires ?? [], { describe }))),
    ...duplicates.map((entry) => ({ id: entry.id, state: 'conflict', reusable: false, digests: entry.digests, reason: `the store holds ${entry.digests.length} digests for ${entry.id}; remove the copy it does not name` })),
  ].sort((left, right) => compareCanonical(left.id, right.id));
  // The package command names packages and the service command names services. An earlier
  // shape published a bare `reusable` here and a bare `reusable` there, over two different
  // domains, and the internal capability test read `reusable: []` from `probe` as "nothing
  // is reusable" while nine packages verified as available.
  return {
    root,
    present: true,
    packages_total: packages.length,
    packages,
    services: records.services.map((entry) => ({ id: entry.id, endpoint: entry.endpoint, revision: entry.revision ?? null, delivery: entry.delivery, requires: entry.requires ?? [] })),
    reusable_packages: packages.filter((entry) => entry.reusable).map((entry) => entry.id),
    missing_packages: packages.filter((entry) => entry.state === 'not-installed').map((entry) => entry.id),
    degraded_packages: packages.filter((entry) => entry.state === 'degraded').map((entry) => entry.id),
    conflicted_packages: packages.filter((entry) => entry.state === 'conflict').map((entry) => entry.id),
  };
}

async function probeComponents(options) {
  const root = storeRoot({ store: options.store });
  if (!fs.statSync(root, { throwIfNoEntry: false })?.isDirectory()) {
    return { root, present: false, probed: 0, services: [], reusable_services: [] };
  }
  const records = readStoreEntryRecords(root);
  // Here a required component is resolved to whether its entry exists, not to whether its
  // bytes verify: probe answers questions about services and must not hash every package.
  const describe = (id) => (records.packages.some((entry) => entry.id === id) || records.services.some((entry) => entry.id === id) ? 'present' : null);
  const services = [];
  for (const entry of records.services) {
    const checked = checkRequirements(entry.requires ?? [], { describe });
    services.push(applyRequirements(resolveService(entry, [await probeService(entry)]), checked));
  }
  return {
    root,
    present: true,
    probed: services.length,
    services,
    reusable_services: services.filter((entry) => entry.reusable).map((entry) => entry.id),
  };
}

function reattestProject(options) {
  const projectRoot = targetRoot(options);
  const { descriptor } = readDescriptor(projectRoot);
  const mutationLock = acquireProjectMutationLock(projectRoot, descriptor.project_id);
  try {
    // requireAnchor:false because a missing or stale anchor is precisely what
    // reattest is here to fix; requireDescriptorMatch:false because the block is
    // about to be regenerated for the descriptor's current release and digest. What
    // is still enforced: byte 0, exactly one well-formed marker pair, and the
    // block's own integrity line, so a hand-edited block cannot be laundered into a
    // fresh anchor.
    const before = inspectBootstrap(projectRoot, { ...descriptor, integrity: undefined }, { requireAnchor: false, requireDescriptorMatch: false });
    const provider = openProvider(projectRoot, descriptor);
    const block = renderBootstrap(provider.root, descriptor);
    const rootBlockHash = `sha256:${sha256(block)}`;
    // Block first, descriptor second. A crash in between leaves the block correct
    // and the descriptor pointing at the old hash, which the normal gate reports
    // as a mismatch; re-running reattest finishes the job.
    const ownership = installBootstrap(projectRoot, provider.root, descriptor, { includeV1: false });
    writeDescriptor(projectRoot, { ...descriptor, integrity: { root_block_hash: rootBlockHash } }, { overwrite: true });
    const recordedBefore = descriptor.integrity ? descriptor.integrity.root_block_hash : undefined;
    return {
      status: 'reattested',
      root: descriptor.policy.root,
      root_block_hash: rootBlockHash,
      // What was installed before the repair, reported against the *file* (the
      // pre-check deliberately ignores the descriptor anchor, since a stale one is
      // the reason to run this command): `previous_integrity` is the block's own
      // integrity line, `previous_descriptor_anchor` is how the descriptor's
      // recorded hash compared with the block it was supposed to pin.
      previous_integrity: before.integrity,
      previous_descriptor_anchor: recordedBefore === undefined
        ? 'absent'
        : (recordedBefore === before.root_block_hash ? 'matched' : 'stale'),
      provider_mode: descriptor.provider.mode,
      root_ownership: ownership,
    };
  } finally {
    mutationLock.release();
  }
}

function validateProject(options) {
  const projectRoot = targetRoot(options);
  const { descriptor } = readDescriptor(projectRoot);
  if (descriptor.schema_version === 2) {
    const validation = validateMaterializedProject(projectRoot, descriptor);
    const runningPacked = fs.statSync(path.join(packageRoot, 'content', 'content.pack.json'), { throwIfNoEntry: false })?.isFile();
    let runtimeRoot;
    let packed = false;
    if (runningPacked) {
      runtimeRoot = packageRoot;
      packed = true;
    } else if (descriptor.variant === 'shared-runtime.pinned') {
      runtimeRoot = openPackedRuntime(descriptor).root;
      packed = true;
    } else {
      const sourceManifest = buildFileManifest(packageRoot);
      if (sourceManifest.digest === descriptor.release.digest) runtimeRoot = packageRoot;
      else {
        runtimeRoot = openPackedRuntime(descriptor).root;
        packed = true;
      }
    }
    const contextRoutes = validateContextMatrix(runtimeRoot, descriptor, {
      packed,
      generationKey: descriptor.variant === 'shared-runtime.pinned' ? readGenerationKey() : undefined,
    });
    return { ...validation, context_routes: contextRoutes };
  }
  // Advisory template comparison: report whether the installed block still matches
  // what this package would render. Deliberately never fatal - a consumer pinned to
  // an older release differs from a newer running CLI by design - and a template
  // problem must not mask the real validation result.
  const expectedBootstrap = (() => {
    try {
      return { expectedBlock: renderBootstrap(packageRoot, descriptor) };
    } catch {
      return {};
    }
  })();
  const bootstrap = inspectBootstrap(projectRoot, descriptor, expectedBootstrap);
  let provider;
  try {
    provider = openProvider(projectRoot, descriptor);
  } catch (error) {
    if (error instanceof UserError && error.code === 'package_missing') {
      return {
        valid: false,
        status: 'package_missing',
        project_id: descriptor.project_id,
        descriptor: 'valid',
        bootstrap,
        local_policy: {
          mandatory: descriptor.policy.mandatory,
          protected_effects: descriptor.protected_effects,
          protected_work: 'safe-stop',
          ordinary_work: 'degraded',
          search_substitution: false,
        },
        provider: error.details,
      };
    }
    throw error;
  }
  const catalog = provider.mode === 'source-worktree'
    ? validateSourceCatalog(provider.root)
    : readCatalog(provider.root);
  if (provider.mode !== 'source-worktree') validateContextRoutes(provider.root, catalog);
  for (const id of descriptor.policy.mandatory) {
    const mandatoryId = normalizeCatalogId(id);
    if (!catalog.some((entry) => entry.id === mandatoryId)) throw new UserError(`mandatory catalog entry is missing: ${id}`, 'mandatory_missing');
  }
  const contextRoutes = validateContextMatrix(provider.root, descriptor);
  return {
    valid: true,
    status: provider.mode === 'source-worktree' && provider.source_state === 'dirty' ? 'development-dirty' : 'ready',
    project_id: descriptor.project_id,
    project_digest: projectDigest(descriptor),
    descriptor: 'valid',
    bootstrap,
    context_routes: contextRoutes,
    provider: {
      mode: provider.mode,
      expected_digest: provider.expected_digest,
      observed_digest: provider.observed_digest,
      immutable: provider.immutable,
      source_state: provider.source_state,
      capabilities: provider.capabilities,
    },
    catalog_entries: catalog.length,
  };
}

function uninstallProject(options) {
  const projectRoot = targetRoot(options, false);
  let projectId = options['project-id'];
  if (!projectId && fs.existsSync(path.join(projectRoot, DESCRIPTOR_NAME))) projectId = readDescriptor(projectRoot).descriptor.project_id;
  if (!projectId) fail('project uninstall requires --project-id when the descriptor is unavailable');
  if (!/^[a-z0-9][a-z0-9._-]{2,127}$/.test(projectId)) fail('project uninstall requires a valid portable --project-id');
  const mutationLock = acquireProjectMutationLock(projectRoot, projectId);
  try {
  const receiptFile = initializationReceipt(projectRoot, projectId);
  const receipt = readJson(receiptFile, 'project receipt');
  if (receipt.operation !== 'project-init') throw new UserError('use migrate rollback for a migrated project', 'wrong_lifecycle');
  const descriptorBefore = receipt.descriptor.before || {
    exists: receipt.descriptor.before_exists,
    hash: receipt.descriptor.before_hash,
    base64: receipt.descriptor.before_base64,
    mode: 0o644,
  };
  const conflicts = [];
  const rootCurrent = snapshotFile(path.join(projectRoot, receipt.root_ownership.root));
  const rootBeforeHash = receipt.root_ownership.before_exists ? receipt.root_ownership.before_hash : 'missing';
  if (![rootBeforeHash, receipt.root_ownership.after_hash].includes(rootCurrent.hash)) {
    conflicts.push({ status: 'conflict', path: receipt.root_ownership.root, expected_postimage: receipt.root_ownership.after_hash, actual: rootCurrent.hash });
  }
  const descriptorFile = path.join(projectRoot, receipt.descriptor.path);
  const descriptorCurrent = snapshotFile(descriptorFile);
  if (![descriptorBefore.hash, receipt.descriptor.after_hash].includes(descriptorCurrent.hash)) {
    conflicts.push({ status: 'conflict', path: receipt.descriptor.path, expected_postimage: receipt.descriptor.after_hash, actual: descriptorCurrent.hash });
  }
  if (receipt.exclude_ownership?.changed) {
    const excludeCurrent = snapshotFile(receipt.exclude_ownership.file);
    if (![receipt.exclude_ownership.before.hash, receipt.exclude_ownership.after_hash].includes(excludeCurrent.hash)) {
      conflicts.push({ status: 'conflict', path: receipt.exclude_ownership.file, expected_postimage: receipt.exclude_ownership.after_hash, actual: excludeCurrent.hash });
    }
  }
  if (receipt.provider?.mode === 'embedded-local' && receipt.provider.created && fs.existsSync(receipt.provider.root)) {
    try {
      const manifest = readJson(path.join(receipt.provider.root, 'release-manifest.json'), 'release manifest');
      if (manifest.digest !== receipt.provider.digest) throw new UserError('release digest changed', 'release_corrupt');
      verifyFileManifest(receipt.provider.root, manifest);
    } catch (error) {
      conflicts.push({ status: 'conflict', path: receipt.provider.root, reason: `release content changed: ${error.message}` });
    }
  }
  if (conflicts.length) return { status: 'conflict', results: [], conflicts };

  const results = [restoreOwnedFile(projectRoot, receipt.root_ownership)];
  if (receipt.exclude_ownership?.changed) results.push(restoreSnapshotFile(receipt.exclude_ownership.file, receipt.exclude_ownership.before, receipt.exclude_ownership.after_hash));
  if (receipt.provider?.mode === 'embedded-local' && receipt.provider.created && fs.existsSync(receipt.provider.root)) {
    fs.rmSync(receipt.provider.root, { recursive: true, force: true });
    results.push({ status: 'removed', path: receipt.provider.root });
  }
  results.push(restoreSnapshotFile(descriptorFile, descriptorBefore, receipt.descriptor.after_hash));
  fs.rmSync(receiptFile);
  return { status: 'uninstalled', results, conflicts: [] };
  } finally {
    mutationLock.release();
  }
}

function descriptorReceiptContext(projectRoot, descriptor) {
  const state = projectStateDir(projectRoot, descriptor.project_id);
  const descriptorHash = `sha256:${sha256(fs.readFileSync(path.join(projectRoot, DESCRIPTOR_NAME)))}`;
  for (const name of ['project-receipt.json', 'migration-receipt.json']) {
    const file = path.join(state, name);
    if (!fs.statSync(file, { throwIfNoEntry: false })?.isFile()) continue;
    const receipt = readJson(file, name);
    const expected = receipt.descriptor?.after_hash || receipt.descriptor_ownership?.after_hash;
    if (expected !== descriptorHash) throw new UserError('lifecycle receipt does not own the current descriptor postimage', 'receipt_conflict', { expected, actual: descriptorHash });
    return { file, receipt };
  }
  throw new UserError('no lifecycle receipt can adopt the imported descriptor postimage', 'receipt_missing');
}

function portableImportLosses(current, incoming) {
  const losses = [];
  if (incoming.project_id !== current.project_id) losses.push({ field: 'project_id', reason: 'portable import cannot change project identity' });
  if (canonicalJson(incoming.provider) !== canonicalJson(current.provider)) losses.push({ field: 'provider', reason: '2.0 import cannot install or switch a provider' });
  if (incoming.policy.root !== current.policy.root) losses.push({ field: 'policy.root', reason: '2.0 import cannot move the managed DSH root' });
  return losses;
}

function applyPortableDescriptorImport(projectRoot, currentProjectId, incoming, expectedDigest) {
  const projectId = currentProjectId;
  const mutationLock = acquireProjectMutationLock(projectRoot, projectId);
  try {
    const { descriptor: current } = readDescriptor(projectRoot);
    const currentDigest = projectDigest(current);
    if (currentDigest !== expectedDigest) throw new UserError('project descriptor changed before import', 'cas_conflict');
    const losses = portableImportLosses(current, incoming);
    if (losses.length) throw new UserError('portable import has unsupported identity/provider losses', 'portable_loss', { losses });
    const receiptContext = descriptorReceiptContext(projectRoot, current);
    const descriptorFile = path.join(projectRoot, DESCRIPTOR_NAME);
    const descriptorBefore = snapshotFile(descriptorFile);
    const receiptBefore = snapshotFile(receiptContext.file);
    const descriptorAfterBytes = Buffer.from(canonicalJson(incoming));
    const descriptorAfterHash = `sha256:${sha256(descriptorAfterBytes)}`;
    const receiptAfter = structuredClone(receiptContext.receipt);
    if (receiptAfter.descriptor) receiptAfter.descriptor.after_hash = descriptorAfterHash;
    else receiptAfter.descriptor_ownership.after_hash = descriptorAfterHash;
    const receiptAfterBytes = Buffer.from(canonicalJson(receiptAfter));
    const transaction = {
      schema_version: 1,
      operation: 'portable-import',
      project_id: projectId,
      descriptor: {
        before: descriptorBefore,
        after_hash: descriptorAfterHash,
        after_base64: descriptorAfterBytes.toString('base64'),
        after_mode: descriptorBefore.mode ?? 0o644,
      },
      receipt: {
        name: path.basename(receiptContext.file),
        before: receiptBefore,
        after_hash: `sha256:${sha256(receiptAfterBytes)}`,
        after_base64: receiptAfterBytes.toString('base64'),
        after_mode: receiptBefore.mode ?? 0o600,
      },
    };
    const transactionFile = descriptorTransactionFile(projectRoot, projectId);
    writeJsonAtomic(transactionFile, transaction, 0o600);
    try {
      writeBytesAtomic(descriptorFile, descriptorAfterBytes, transaction.descriptor.after_mode);
      if (process.env.APG_TEST_FAILPOINT === 'after-import-descriptor') throw new UserError('test crash after import descriptor', 'test_crash');
      writeBytesAtomic(receiptContext.file, receiptAfterBytes, transaction.receipt.after_mode);
      fs.rmSync(transactionFile);
      return receiptContext.file;
    } catch (error) {
      if (error.code === 'test_crash') throw error;
      if (descriptorBefore.exists) writeBytesAtomic(descriptorFile, Buffer.from(descriptorBefore.base64, 'base64'), descriptorBefore.mode ?? 0o644);
      else fs.rmSync(descriptorFile, { force: true });
      if (receiptBefore.exists) writeBytesAtomic(receiptContext.file, Buffer.from(receiptBefore.base64, 'base64'), receiptBefore.mode ?? 0o600);
      else fs.rmSync(receiptContext.file, { force: true });
      fs.rmSync(transactionFile, { force: true });
      throw error;
    }
  } finally {
    mutationLock.release();
  }
}

function providerContext(options) {
  const projectRoot = targetRoot(options);
  const { descriptor } = readDescriptor(projectRoot);
  if (descriptor.schema_version !== 1) throw new UserError('provider resolve/load are the schema 1 compatibility API; use apg context for schema 2 projects', 'unsupported_command');
  const provider = openProvider(projectRoot, descriptor);
  return { projectRoot, descriptor, provider, catalog: readCatalog(provider.root) };
}

function providerCommand(action, options) {
  const context = providerContext(options);
  if (action === 'capabilities') return {
    project_id: context.descriptor.project_id,
    mode: context.provider.mode,
    capabilities: [...context.provider.capabilities, 'resolve', 'load', 'batch-load-v1', 'section-routes-v1', 'portable-import-revision-guarded'],
    immutable: context.provider.immutable,
  };
  if (action === 'resolve') return resolveRoute(context.provider.root, context.descriptor, {
    plane: options.plane,
    role: options.role,
    mode: options.mode,
    task: options.task,
    pathHint: options.path,
  });
  if (action === 'search') {
    if (!options.query) fail('provider search requires --query');
    return { query: options.query, results: searchCatalog(context.catalog, options.query, { limit: Number(options.limit || 8), kind: options.kind }) };
  }
  if (action === 'load') {
    if (options.id && options.ids) fail('provider load accepts either --id or --ids, not both');
    const ids = options.ids ? splitList(options.ids) : options.id ? [options.id] : [];
    if (ids.length === 0) fail('provider load requires --id or --ids');
    if (ids.length > 1 && options.hash) fail('provider load --hash is valid only with one ID');
    if (new Set(ids).size !== ids.length) fail('provider load --ids must not contain duplicates');
    const loaded = ids.map((id) => {
      const entry = context.catalog.find((item) => item.id === normalizeCatalogId(id));
      if (!entry) throw new UserError(`catalog entry not found: ${id}`, 'catalog_miss');
      return loadCatalogEntry(context.provider.root, entry, ids.length === 1 ? options.hash : undefined);
    });
    if (options.id) return loaded[0];
    return {
      sources: loaded.map(({ id, content }) => [id, content]),
      exact_token_estimate: loaded.reduce((total, entry) => total + entry.tokens, 0),
      token_estimate_method: 'utf8-bytes/4-ceiling',
    };
  }
  if (action === 'export') return { revision: projectDigest(context.descriptor), portable: portableSnapshot(context.descriptor) };
  if (action === 'import') {
    if (!options.input || !options['expected-project-digest']) fail('provider import requires --input and --expected-project-digest');
    const incomingRaw = validateDescriptor(readJson(options.input, 'portable snapshot'), context.projectRoot);
    // The block anchor is a local installation fact, not a portable project fact: it
    // hashes the installed root block, which renders the local release and digest.
    // portableSnapshot therefore carries none, and importing one must preserve the
    // local anchor rather than read its absence as a change to apply.
    const incoming = incomingRaw.integrity === undefined && context.descriptor.integrity !== undefined
      ? { ...incomingRaw, integrity: context.descriptor.integrity }
      : incomingRaw;
    const currentDigest = projectDigest(context.descriptor);
    if (currentDigest !== options['expected-project-digest']) throw new UserError('project descriptor changed before import', 'cas_conflict');
    const losses = portableImportLosses(context.descriptor, incoming);
    const before = canonicalJson(context.descriptor);
    const after = canonicalJson(incoming);
    const diff = before === after ? [] : [{ field: 'descriptor', action: 'replace-portable-project-facts', before_digest: currentDigest, after_digest: projectDigest(incoming) }];
    let receipt;
    if (options.apply && diff.length) {
      receipt = applyPortableDescriptorImport(context.projectRoot, context.descriptor.project_id, incoming, options['expected-project-digest']);
    }
    return { dry_run: !options.apply, losses, diff, applied: Boolean(options.apply && diff.length), receipt };
  }
  fail(`unknown provider action: ${action}`);
}

function dshReport(options) {
  const context = providerContext(options);
  const resolution = resolveRoute(context.provider.root, context.descriptor, {
    plane: options.plane,
    role: options.role,
    mode: options.mode,
    task: options.task,
    pathHint: options.path,
  });
  const evidence = options['host-evidence'] ? readJson(options['host-evidence'], 'DSH host evidence') : { sources: [] };
  const sources = resolution.exact.map((id, order) => {
    const entry = context.catalog.find((item) => item.id === id);
    const exactHost = (evidence.sources || []).find((item) => item.id === id);
    const pathHost = entry.section ? undefined : (evidence.sources || []).find((item) => !item.id && item.path === entry.path);
    const host = exactHost || pathHost;
    const claimedSha256 = host?.apg_sha256 || (typeof host?.digest === 'string' && host.digest.startsWith('sha256:') ? host.digest : undefined);
    const contentMatch = !host ? false : claimedSha256 ? claimedSha256 === entry.hash : 'unknown';
    const conflict = contentMatch === false && Boolean(host) ? 'host evidence SHA-256 does not match the selected source' : null;
    return {
      id,
      order,
      path: entry.path,
      section: entry.section,
      activation: context.descriptor.policy.mandatory.includes(id) ? 'mandatory policy'
        : id.startsWith('role:') ? 'role route'
          : id.startsWith('procedure:') ? 'mode procedure'
            : id.startsWith('overlay:') ? 'overlay route'
              : 'facet route',
      sha256: entry.hash,
      bytes: entry.bytes,
      token_estimate: entry.tokens,
      token_estimate_method: 'utf8-bytes/4-ceiling',
      project_digest: projectDigest(context.descriptor),
      release_digest: context.provider.observed_digest,
      intended: true,
      host_observed: Boolean(host) && contentMatch !== false,
      host_content_match: contentMatch,
      host_digest: host?.digest,
      host_apg_sha256: claimedSha256,
      conflict,
      omitted: host?.omitted ?? 'unknown',
      truncated: host?.truncated ?? 'unknown',
      model_effective: 'unknown',
    };
  });
  return { adapter: 'dsh', observation: 'bounded', resolution, sources };
}

// Harness observation adapters. APG core is harness-neutral: each entry is a
// compatibility adapter; harness-specific integrations belong in plugins/<harness>-apg/.
const OBSERVATION_ADAPTERS = {
  dsh: { report: dshReport },
};

function validateSourceCatalog(root) {
  const file = path.join(root, 'catalog', 'catalog.jsonl');
  const expected = catalogJsonl(buildCatalog(root));
  if (!fs.statSync(file, { throwIfNoEntry: false })?.isFile() || fs.readFileSync(file, 'utf8') !== expected) {
    throw new UserError('source-worktree catalog is stale; run catalog build', 'catalog_stale');
  }
  const catalog = readCatalog(root);
  validateContextRoutes(root, catalog);
  return catalog;
}

function v3SelectionOptions(options) {
  if (!options.variant) fail('3.0 operation requires --variant');
  if (!['selected-inline.none', 'shared-runtime.pinned'].includes(options.variant)) throw new UserError(`unsupported 3.0 variant: ${options.variant}`, 'unsupported_variant');
  return {
    projectId: options['project-id'],
    variant: options.variant,
    lifecycle: options.lifecycle || 'active-development',
    roles: splitList(options.roles).length ? splitList(options.roles) : undefined,
    profiles: options.profiles === undefined ? undefined : splitList(options.profiles),
    overlays: options.overlays === undefined ? undefined : splitList(options.overlays),
    mandatory: options.mandatory === undefined ? undefined : splitList(options.mandatory),
    protectedEffects: options['protected-effects'] === undefined ? undefined : splitList(options['protected-effects']),
    rootName: options.root,
  };
}

function contextCommand(options) {
  const projectRoot = targetRoot(options);
  const { descriptor } = readDescriptor(projectRoot);
  const format = options.format || 'context';
  if (!['context', 'json'].includes(format)) fail('--format must be context or json');
  let runtimeRoot;
  let packed = false;
  if (descriptor.schema_version === 1) {
    runtimeRoot = openProvider(projectRoot, descriptor).root;
  } else {
    const runningPacked = fs.statSync(path.join(packageRoot, 'content', 'content.pack.json'), { throwIfNoEntry: false })?.isFile();
    if (runningPacked) {
      runtimeRoot = packageRoot;
      packed = true;
    } else if (descriptor.variant === 'shared-runtime.pinned') {
      runtimeRoot = openPackedRuntime(descriptor).root;
      packed = true;
    } else {
      const sourceManifest = buildFileManifest(packageRoot);
      if (sourceManifest.digest === descriptor.release.digest) runtimeRoot = packageRoot;
      else {
        runtimeRoot = openPackedRuntime(descriptor).root;
        packed = true;
      }
    }
  }
  const sharedPinned = descriptor.schema_version === 2 && descriptor.variant === 'shared-runtime.pinned';
  let generation = options.generation;
  if (typeof generation === 'string' && generation.startsWith('g1_')) {
    if (!sharedPinned) throw new UserError('generation reference requires its original shared runtime project', 'generation_mismatch');
    generation = loadGenerationReference(generation, projectRoot);
  }
  const result = compileContext(runtimeRoot, descriptor, {
    plane: options.plane,
    role: options.role,
    mode: options.mode,
    task: options.task || '',
    pathHint: options.path || '',
    generation,
    select: options.select,
    generationKey: sharedPinned ? readGenerationKey() : undefined,
    target: projectRoot,
    format,
    packed,
  });
  if (format === 'context') {
    return { __apg_text: true, text: renderContext(result) };
  }
  return result;
}

export async function main(argv = process.argv.slice(2)) {
  const { positional, options } = parseArgs(argv);
  const [group, action] = positional;
  if (options.version) {
    if (group) fail('--version is a top-level option');
    return { __apg_text: true, text: `${VERSION}\n` };
  }
  if (options.help || !group || ['help', '-h'].includes(group)) return { __apg_text: true, text: helpText(group && group !== 'help' ? group : undefined) };
  if (group === 'context') {
    if (!options.task && !options.role && !options.mode && !options.plane && !options.select) fail('context requires --task, --plane/--role/--mode, or --generation/--select');
    return contextCommand(options);
  }
  if (group === 'catalog') {
    if (action === 'build') return { entries: writeCatalog(options.source ? fs.realpathSync(options.source) : packageRoot).length, status: 'built' };
    if (action === 'check') {
      const root = options.source ? fs.realpathSync(options.source) : packageRoot;
      const expected = catalogJsonl(buildCatalog(root));
      const file = path.join(root, 'catalog', 'catalog.jsonl');
      return { valid: fs.statSync(file, { throwIfNoEntry: false })?.isFile() && fs.readFileSync(file, 'utf8') === expected };
    }
  }
  if (group === 'release') {
    if (action === 'manifest') {
      const root = options.source ? fs.realpathSync(options.source) : packageRoot;
      validateSourceCatalog(root);
      const manifest = buildFileManifest(root);
      writeJsonAtomic(path.join(root, 'PACKAGE_MANIFEST.json'), manifest);
      return { status: 'written', manifest };
    }
    if (action === 'verify-source') {
      const root = options.source ? fs.realpathSync(options.source) : packageRoot;
      validateSourceCatalog(root);
      const expected = readJson(path.join(root, 'PACKAGE_MANIFEST.json'), 'PACKAGE_MANIFEST.json');
      const actual = buildFileManifest(root);
      if (canonicalJson(actual) !== canonicalJson(expected)) throw new UserError('source package manifest is stale', 'release_manifest_stale', { expected: expected.digest, actual: actual.digest });
      return { valid: true, manifest: actual };
    }
    if (action === 'install') {
      const installed = installRelease(options.source || packageRoot);
      return { status: installed.installed ? 'installed' : 'present', root: installed.root, manifest: installed.manifest, launcher: ensureLauncher(installed.root) };
    }
    if (action === 'verify') {
      const root = options.root ? fs.realpathSync(options.root) : fail('release verify requires --root');
      const manifest = readJson(path.join(root, 'release-manifest.json'), 'release manifest');
      const actual = verifyFileManifest(root, manifest);
      validateContextRoutes(root, readCatalog(root));
      return { valid: true, manifest: actual };
    }
  }
  if (group === 'project') {
    if (action === 'init') return initProject(options);
    if (action === 'hydrate') return hydrateProject(options);
    if (action === 'validate' || action === 'status') return validateProject(options);
    if (action === 'reattest') return reattestProject(options);
    if (action === 'observe') return observeProject(options);
    if (action === 'uninstall') return uninstallProject(options);
    if (action === 'materialize') {
      const projectRoot = observedTargetRoot(options, false);
      const selection = v3SelectionOptions(options);
      if (!selection.projectId) fail('project materialize requires --project-id');
      const sourceRoot = fs.realpathSync(options.source || packageRoot);
      return options.apply
        ? applyMaterialization(projectRoot, sourceRoot, selection)
        : previewMaterialization(projectRoot, sourceRoot, selection);
    }
  }
  if (group === 'provider') return providerCommand(action, options);
  if (group === 'migrate') {
    if (action === 'v3-preview') {
      const projectRoot = observedTargetRoot(options);
      const selection = v3SelectionOptions(options);
      return previewV2ToV3Migration(projectRoot, fs.realpathSync(options.source || packageRoot), selection);
    }
    if (action === 'v3-apply') {
      if (!options.digest) fail('migrate v3-apply requires the reviewed --digest');
      const projectRoot = observedTargetRoot(options);
      const selection = v3SelectionOptions(options);
      return applyV2ToV3Migration(projectRoot, fs.realpathSync(options.source || packageRoot), selection, options.digest);
    }
    if (action === 'v3-rollback') {
      return rollbackV3Migration(observedTargetRoot(options));
    }
    if (action === 'plan') {
      const projectRoot = targetRoot(options, false);
      if (!options['project-id']) fail('migrate plan requires --project-id');
      return planMigration(projectRoot, fs.realpathSync(options.source || packageRoot), {
        projectId: options['project-id'],
        facets: splitList(options.facets),
        overlays: splitList(options.overlays),
        mandatory: splitList(options.mandatory),
        protectedEffects: splitList(options['protected-effects']),
      });
    }
    if (action === 'apply') {
      if (!options.plan || !options.digest) fail('migrate apply requires --plan and --digest');
      return applyMigration(fs.realpathSync(options.plan), options.digest);
    }
    if (action === 'rollback') {
      const projectRoot = targetRoot(options, false);
      let projectId = options['project-id'];
      if (!projectId && fs.existsSync(path.join(projectRoot, DESCRIPTOR_NAME))) projectId = readDescriptor(projectRoot).descriptor.project_id;
      if (!projectId) fail('migrate rollback requires --project-id when the descriptor is unavailable');
      return rollbackMigration(projectRoot, projectId);
    }
  }
  if (group === 'risk' && action === 'classify') {
    const context = providerContext(options);
    return composeRisk(context.provider.root, context.descriptor, {
      runtimeEffects: parseEffectList(options.runtime),
      operationEffects: parseEffectList(options.operation),
      taskEffects: parseEffectList(options.task),
      nonbehavioral: Boolean(options.nonbehavioral),
    });
  }
  if (group === 'memory') {
    const projectRoot = targetRoot(options);
    const { descriptor } = readDescriptor(projectRoot);
    if (action === 'propose') {
      if (!options.input) fail('memory propose requires --input');
      return proposeMemory(projectRoot, descriptor, readMemoryInput(options.input));
    }
    if (action === 'review') return reviewMemory(projectRoot, descriptor, options.id, { reviewer: options.reviewer, decision: options.decision, rationale: options.rationale });
    if (action === 'promote') return promoteMemory(projectRoot, descriptor, options.id, { expectedProjectDigest: options['expected-project-digest'], expectedTargetHash: options['expected-target-hash'] || 'missing' });
    if (action === 'supersede') {
      if (!options.input || !options.replaces) fail('memory supersede requires --input and --replaces');
      return supersedeMemory(projectRoot, descriptor, readMemoryInput(options.input), options.replaces);
    }
    if (action === 'purge') return purgeMemoryProposal(projectRoot, descriptor, options.id);
  }
  if (group === 'components') {
    if (action === 'verify') return verifyComponents(options);
    if (action === 'probe') return probeComponents(options);
    return fail(`components requires an action: verify or probe`);
  }
  const observationAdapter = OBSERVATION_ADAPTERS[group];
  if (observationAdapter && action === 'report') return observationAdapter.report(options);
  fail(`unknown command: ${[group, action].filter(Boolean).join(' ')}`);
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  main().then(print).catch((error) => {
    const reported = error instanceof UserError ? error : { message: error.message, stack: error.stack };
    process.stderr.write(canonicalJson(contextErrorRecord(reported)));
    process.exitCode = error instanceof UserError ? 2 : 1;
  });
}

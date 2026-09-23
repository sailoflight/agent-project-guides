import { ensureGenerationKey } from './generation-state.mjs';
export { ensureGenerationKey, readGenerationKey, createGenerationReference, saveGenerationReference, loadGenerationReference } from './generation-state.mjs';
import { writeFileAtomic } from './files.mjs';
import { compareCanonical } from './core.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  UserError,
  buildFileManifest,
  canonicalJson,
  copyDistribution,
  platformHomes,
  readJson,
  resolveInside,
  sha256,
  verifyFileManifest,
  writeJsonAtomic,
} from './core.mjs';
import { loadCatalogEntry, readCatalog, writeCatalog } from './catalog.mjs';
import { validateContextRoutes } from './context-routes.mjs';

function releaseDirectoryName(digest) {
  return digest.replace(':', '-');
}

function manifestFile(releaseRoot) {
  return path.join(releaseRoot, 'release-manifest.json');
}

function verifyRelease(releaseRoot, descriptor) {
  const file = manifestFile(releaseRoot);
  if (!fs.statSync(file, { throwIfNoEntry: false })?.isFile()) throw new UserError(`release manifest is missing: ${releaseRoot}`, 'release_missing');
  const manifest = readJson(file, 'release-manifest.json');
  if (manifest.digest !== descriptor.provider.digest) throw new UserError('release digest differs from project descriptor', 'release_mismatch');
  if (manifest.package_version !== descriptor.provider.release) throw new UserError('release version differs from project descriptor', 'release_mismatch');
  verifyFileManifest(releaseRoot, manifest);
  const catalog = readCatalog(releaseRoot);
  validateContextRoutes(releaseRoot, catalog);
  return manifest;
}

export function observeSourceState(root) {
  const result = spawnSync('git', ['status', '--porcelain=v1', '--untracked-files=normal'], { cwd: root, encoding: 'utf8' });
  if (result.error || result.status !== 0) return 'unknown';
  return result.stdout.trim() ? 'dirty' : 'clean';
}

export function installRelease(sourceRoot, env = process.env) {
  const source = fs.realpathSync(sourceRoot);
  if (!fs.statSync(path.join(source, 'PACKAGE_VERSION'), { throwIfNoEntry: false })?.isFile()) {
    throw new UserError(`${source} is not an Agent Project Guides package source`, 'invalid_distribution');
  }
  const homes = platformHomes(env);
  const releases = path.join(homes.data, 'releases');
  fs.mkdirSync(releases, { recursive: true });
  const stage = path.join(releases, `.stage-${process.pid}-${Date.now()}`);
  try {
    copyDistribution(source, stage);
    const catalog = writeCatalog(stage);
    validateContextRoutes(stage, catalog);
    const manifest = buildFileManifest(stage);
    fs.writeFileSync(manifestFile(stage), canonicalJson(manifest), { mode: 0o444 });
    const destination = path.join(releases, releaseDirectoryName(manifest.digest));
    if (fs.existsSync(destination)) {
      const existing = readJson(manifestFile(destination), 'release-manifest.json');
      if (canonicalJson(existing) !== canonicalJson(manifest)) throw new UserError(`immutable release path collision: ${destination}`, 'release_collision');
      verifyFileManifest(destination, existing);
      fs.rmSync(stage, { recursive: true, force: true });
      return { root: destination, manifest, installed: false };
    }
    fs.renameSync(stage, destination);
    return { root: destination, manifest, installed: true };
  } catch (error) {
    fs.rmSync(stage, { recursive: true, force: true });
    throw error;
  }
}

export function installEmbedded(sourceRoot, projectRoot) {
  const source = fs.realpathSync(sourceRoot);
  const stageBase = path.join(projectRoot, '.agent-project-guides', 'local', 'releases');
  fs.mkdirSync(stageBase, { recursive: true });
  const stage = path.join(stageBase, `.stage-${process.pid}-${Date.now()}`);
  try {
    copyDistribution(source, stage);
    const catalog = writeCatalog(stage);
    validateContextRoutes(stage, catalog);
    const manifest = buildFileManifest(stage);
    fs.writeFileSync(manifestFile(stage), canonicalJson(manifest), { mode: 0o444 });
    const destination = path.join(stageBase, releaseDirectoryName(manifest.digest));
    if (fs.existsSync(destination)) {
      const existing = readJson(manifestFile(destination), 'release-manifest.json');
      if (canonicalJson(existing) !== canonicalJson(manifest)) throw new UserError(`embedded release path collision: ${destination}`, 'release_collision');
      verifyFileManifest(destination, existing);
      fs.rmSync(stage, { recursive: true, force: true });
      return { root: destination, manifest, installed: false };
    }
    fs.renameSync(stage, destination);
    return { root: destination, manifest, installed: true };
  } catch (error) {
    fs.rmSync(stage, { recursive: true, force: true });
    throw error;
  }
}

function collectRuntimeSource(source, relative, output) {
  const absolute = path.join(source, relative);
  const stat = fs.lstatSync(absolute, { throwIfNoEntry: false });
  if (!stat) throw new UserError(`packed runtime source is missing: ${relative}`, 'invalid_distribution');
  if (stat.isSymbolicLink()) throw new UserError(`packed runtime source is a symlink: ${relative}`, 'invalid_distribution');
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true }).sort((left, right) => compareCanonical(left.name, right.name))) {
      collectRuntimeSource(source, `${relative}/${entry.name}`, output);
    }
    return;
  }
  if (!stat.isFile()) throw new UserError(`packed runtime source is not a regular file: ${relative}`, 'invalid_distribution');
  output.set(relative, { bytes: fs.readFileSync(absolute), mode: stat.mode & 0o777 });
}

export function buildPackedRuntimeArtifact(sourceRoot) {
  const source = fs.realpathSync(sourceRoot);
  const sourceManifest = buildFileManifest(source);
  const sourceState = observeSourceState(source);
  const catalog = readCatalog(source);
  validateContextRoutes(source, catalog);
  const entries = catalog.map((entry) => loadCatalogEntry(source, entry));
  const contents = new Map();
  for (const relative of ['PACKAGE_VERSION', 'lib', 'routing', 'catalog', 'scripts/apg.mjs', 'scripts/apg-launcher.mjs']) collectRuntimeSource(source, relative, contents);
  contents.set('content/content.pack.json', {
    bytes: Buffer.from(canonicalJson({ schema_version: 1, source_version: sourceManifest.package_version, source_digest: sourceManifest.digest, entries })),
    mode: 0o444,
  });
  const files = [...contents.entries()].map(([filePath, value]) => ({ path: filePath, bytes: value.bytes.length, sha256: sha256(value.bytes) })).sort((left, right) => compareCanonical(left.path, right.path));
  const portable = { schema_version: 1, source_version: sourceManifest.package_version, source_digest: sourceManifest.digest, files };
  const manifest = { ...portable, digest: `sha256:${sha256(canonicalJson(portable))}` };
  return { source, source_manifest: sourceManifest, source_state: sourceState, contents, manifest };
}

function runtimeFiles(root) {
  const files = [];
  const foldedPaths = new Set();
  function visit(relative = '') {
    for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true }).sort((left, right) => compareCanonical(left.name, right.name))) {
      const child = relative ? `${relative}/${entry.name}` : entry.name;
      if (child === 'runtime-manifest.json') continue;
      if (entry.isSymbolicLink()) throw new UserError(`packed runtime contains a symlink: ${child}`, 'release_corrupt');
      if (entry.isDirectory()) visit(child);
      else if (entry.isFile()) {
        const folded = child.toLocaleLowerCase('und');
        if (foldedPaths.has(folded)) throw new UserError(`packed runtime contains a case-colliding path: ${child}`, 'release_corrupt');
        foldedPaths.add(folded);
        const bytes = fs.readFileSync(path.join(root, child));
        files.push({ path: child, bytes: bytes.length, sha256: sha256(bytes) });
      } else throw new UserError(`packed runtime contains an unsupported file: ${child}`, 'release_corrupt');
    }
  }
  visit();
  return files.sort((left, right) => compareCanonical(left.path, right.path));
}

export function verifyPackedRuntime(runtimeRoot, descriptor) {
  const manifest = readJson(path.join(runtimeRoot, 'runtime-manifest.json'), 'runtime-manifest.json');
  if (manifest.schema_version !== 1 || manifest.source_digest !== descriptor.release.digest || manifest.source_version !== descriptor.release.version || manifest.digest !== descriptor.release.runtime_digest) {
    throw new UserError('packed runtime identity differs from the project descriptor', 'release_mismatch');
  }
  const actualFiles = runtimeFiles(runtimeRoot);
  if (canonicalJson(actualFiles) !== canonicalJson(manifest.files)) throw new UserError('packed runtime file manifest mismatch', 'release_corrupt');
  const { digest, ...portable } = manifest;
  if (`sha256:${sha256(canonicalJson(portable))}` !== digest) throw new UserError('packed runtime manifest digest is invalid', 'release_corrupt');
  const pack = readJson(path.join(runtimeRoot, 'content', 'content.pack.json'), 'content pack');
  if (pack.source_digest !== descriptor.release.digest || !Array.isArray(pack.entries)) throw new UserError('packed content identity differs from the project descriptor', 'release_mismatch');
  validateContextRoutes(runtimeRoot, pack.entries.map(({ content, ...entry }) => entry));
  return manifest;
}

export function installPackedRuntime(sourceRoot, env = process.env) {
  const artifact = buildPackedRuntimeArtifact(sourceRoot);
  ensureGenerationKey(env);
  const { source_manifest: sourceManifest, manifest } = artifact;
  const base = path.join(platformHomes(env).data, 'runtimes');
  fs.mkdirSync(base, { recursive: true });
  const stage = path.join(base, `.stage-${process.pid}-${Date.now()}`);
  try {
    fs.mkdirSync(stage, { recursive: true });
    for (const [relative, value] of artifact.contents) {
      const target = path.join(stage, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, value.bytes, { mode: value.mode });
    }
    writeJsonAtomic(path.join(stage, 'runtime-manifest.json'), manifest, 0o444);
    const destination = path.join(base, releaseDirectoryName(sourceManifest.digest));
    const runtimeDescriptor = { release: { version: sourceManifest.package_version, digest: sourceManifest.digest, runtime_digest: manifest.digest } };
    if (fs.existsSync(destination)) {
      const existingManifest = verifyPackedRuntime(destination, runtimeDescriptor);
      fs.rmSync(stage, { recursive: true, force: true });
      return { root: destination, manifest: existingManifest, source_manifest: sourceManifest, installed: false };
    }
    fs.renameSync(stage, destination);
    return { root: destination, manifest, source_manifest: sourceManifest, installed: true };
  } catch (error) {
    fs.rmSync(stage, { recursive: true, force: true });
    throw error;
  }
}

export function openPackedRuntime(descriptor, env = process.env) {
  const root = path.join(platformHomes(env).data, 'runtimes', releaseDirectoryName(descriptor.release.digest));
  if (!fs.statSync(root, { throwIfNoEntry: false })?.isDirectory()) {
    throw new UserError(`exact shared runtime is not installed: ${descriptor.release.digest}`, 'package_missing', {
      variant: descriptor.variant,
      digest: descriptor.release.digest,
      implicit_latest: false,
    });
  }
  return { root, manifest: verifyPackedRuntime(root, descriptor), mode: 'shared-packed', immutable: true };
}

function writeSharedCommandAtomic(file, bytes, mode = 0o644) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const existing = fs.statSync(file, { throwIfNoEntry: false });
  if (existing?.isFile() && fs.readFileSync(file).equals(bytes)) {
    if ((existing.mode & 0o777) !== mode) fs.chmodSync(file, mode);
    return false;
  }
  writeFileAtomic(file, bytes, { mode, durable: true });
  return true;
}

export function installSharedLauncher(runtimeRoot, env = process.env) {
  const homes = platformHomes(env);
  const launcher = path.join(homes.bin, 'apg-launcher.mjs');
  const launcherChanged = writeSharedCommandAtomic(launcher, fs.readFileSync(path.join(runtimeRoot, 'scripts', 'apg-launcher.mjs')));
  const versionFile = path.join(homes.bin, 'apg-launcher.version');
  const versionChanged = writeSharedCommandAtomic(versionFile, fs.readFileSync(path.join(runtimeRoot, 'PACKAGE_VERSION')));
  const command = path.join(homes.bin, process.platform === 'win32' ? 'apg.cmd' : 'apg');
  const commandBytes = Buffer.from(process.platform === 'win32' ? `@echo off\r\nnode "${launcher}" %*\r\n` : `#!/bin/sh\nexec node "${launcher}" "$@"\n`);
  const commandChanged = writeSharedCommandAtomic(command, commandBytes, process.platform === 'win32' ? 0o644 : 0o755);
  return { launcher, command, changed: launcherChanged || versionChanged || commandChanged, path_required: !env.PATH?.split(path.delimiter).includes(homes.bin) };
}

export function openProvider(projectRoot, descriptor, env = process.env) {
  const mode = descriptor.provider.mode;
  if (mode === 'source-worktree') {
    const sourceRoot = resolveInside(projectRoot, descriptor.provider.source, 'provider.source', true);
    validateContextRoutes(sourceRoot, readCatalog(sourceRoot));
    const manifest = buildFileManifest(sourceRoot);
    return {
      mode,
      capabilities: ['read', 'search', 'portable-export', 'source-observation'],
      root: sourceRoot,
      manifest,
      expected_digest: 'observe',
      observed_digest: manifest.digest,
      source_state: observeSourceState(sourceRoot),
      immutable: false,
    };
  }

  const releaseRoot = mode === 'thin-bootstrap'
    ? path.join(platformHomes(env).data, 'releases', releaseDirectoryName(descriptor.provider.digest))
    : path.join(projectRoot, '.agent-project-guides', 'local', 'releases', releaseDirectoryName(descriptor.provider.digest));
  if (!fs.statSync(releaseRoot, { throwIfNoEntry: false })?.isDirectory()) {
    throw new UserError(`exact release is not installed for ${mode}: ${descriptor.provider.digest}`, 'package_missing', {
      mode,
      digest: descriptor.provider.digest,
      offline_behavior: 'project policy remains readable; protected work must stop; other work is explicitly degraded',
    });
  }
  const manifest = verifyRelease(releaseRoot, descriptor);
  return {
    mode,
    capabilities: ['read', 'search', 'portable-export', 'immutable-release'],
    root: releaseRoot,
    manifest,
    expected_digest: descriptor.provider.digest,
    observed_digest: manifest.digest,
    source_state: 'immutable',
    immutable: true,
  };
}

export function gitExcludeFile(projectRoot) {
  const git = path.join(projectRoot, '.git');
  const stat = fs.lstatSync(git, { throwIfNoEntry: false });
  if (!stat) return undefined;
  const fail = () => { throw new UserError('Git metadata is unsafe or not bound to this checkout', 'invalid_git_metadata'); };
  if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory())) fail();
  let gitDirectory = git;
  if (stat.isFile()) {
    const match = /^gitdir:\s*(.+)$/.exec(fs.readFileSync(git, 'utf8').trim());
    if (!match) fail();
    gitDirectory = path.resolve(projectRoot, match[1]);
    const directoryStat = fs.lstatSync(gitDirectory, { throwIfNoEntry: false });
    if (!directoryStat?.isDirectory() || directoryStat.isSymbolicLink()) fail();
    // Linked worktrees bind back to their own .git file. Submodules bind via
    // core.worktree. No attempt to build a hostile-repository security boundary.
    const backlink = path.join(gitDirectory, 'gitdir');
    let bound = false;
    if (fs.lstatSync(backlink, { throwIfNoEntry: false })?.isFile()) {
      bound = path.resolve(gitDirectory, fs.readFileSync(backlink, 'utf8').trim()) === git;
    }
    if (!bound) {
      const result = spawnSync('git', ['config', '--file', path.join(gitDirectory, 'config'), '--get', 'core.worktree'], { encoding: 'utf8' });
      bound = result.status === 0 && path.resolve(gitDirectory, result.stdout.trim()) === projectRoot;
    }
    if (!bound) fail();
  }
  return resolveInside(gitDirectory, 'info/exclude', 'Git metadata');
}

export function previewEmbeddedExclude(projectRoot) {
  const marker = '/.agent-project-guides/local/';
  const file = gitExcludeFile(projectRoot);
  if (!file) return { changed: false, reason: 'no_git_metadata', file: null, before: Buffer.alloc(0), after: Buffer.alloc(0) };
  const before = fs.statSync(file, { throwIfNoEntry: false })?.isFile() ? fs.readFileSync(file) : Buffer.alloc(0);
  const current = before.toString('utf8');
  if (current.split(/\r?\n/).includes(marker)) return { changed: false, file, before, after: before };
  const prefix = current && !current.endsWith('\n') ? '\n' : '';
  return { changed: true, file, before, after: Buffer.concat([before, Buffer.from(`${prefix}${marker}\n`)]) };
}

export function addEmbeddedExclude(projectRoot) {
  const preview = previewEmbeddedExclude(projectRoot);
  if (!preview.file) return { changed: false, reason: preview.reason };
  if (!preview.changed) return { changed: false, file: preview.file };
  fs.mkdirSync(path.dirname(preview.file), { recursive: true });
  const temporary = `${preview.file}.apg-${process.pid}`;
  writeFileAtomic(preview.file, preview.after, { mode: fs.statSync(preview.file, { throwIfNoEntry: false })?.mode & 0o777 || 0o644, temporary });
  return { changed: true, file: preview.file };
}

export function portableSnapshot(descriptor) {
  return {
    schema_version: 1,
    project_id: descriptor.project_id,
    provider: {
      mode: descriptor.provider.mode,
      release: descriptor.provider.release,
      digest: descriptor.provider.digest,
      ...(descriptor.provider.mode === 'source-worktree' ? { source: descriptor.provider.source } : {}),
    },
    facets: descriptor.facets,
    overlays: descriptor.overlays || [],
    protected_effects: descriptor.protected_effects,
    policy: descriptor.policy,
    layout: descriptor.layout,
  };
}

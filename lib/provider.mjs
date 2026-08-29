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
  verifyFileManifest,
} from './core.mjs';
import { readCatalog, writeCatalog } from './catalog.mjs';
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

function dirtyState(root) {
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
      source_state: dirtyState(sourceRoot),
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
  if (!fs.existsSync(git)) return undefined;
  let gitDirectory = git;
  if (fs.statSync(git).isFile()) {
    const text = fs.readFileSync(git, 'utf8').trim();
    const match = /^gitdir:\s*(.+)$/.exec(text);
    if (!match) throw new UserError('.git file has unsupported format', 'invalid_git_metadata');
    gitDirectory = path.resolve(projectRoot, match[1]);
  }
  return path.join(gitDirectory, 'info', 'exclude');
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
  fs.writeFileSync(temporary, preview.after, { mode: fs.statSync(preview.file, { throwIfNoEntry: false })?.mode & 0o777 || 0o644 });
  fs.renameSync(temporary, preview.file);
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

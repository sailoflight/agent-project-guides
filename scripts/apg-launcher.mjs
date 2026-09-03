#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function fail(message) {
  process.stderr.write(`${JSON.stringify({ error: 'launcher_error', message })}\n`);
  process.exit(2);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  return value;
}

function canonicalJson(value) {
  return `${JSON.stringify(canonicalize(value))}\n`;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function findProject(start) {
  let current = fs.realpathSync(start);
  while (true) {
    const descriptor = path.join(current, '.agent-project-guides.json');
    if (fs.statSync(descriptor, { throwIfNoEntry: false })?.isFile()) return { root: current, descriptor };
    const parent = path.dirname(current);
    if (parent === current) fail('no .agent-project-guides.json found');
    current = parent;
  }
}

function dataHome() {
  if (process.env.AGENT_PROJECT_GUIDES_HOME) return path.join(path.resolve(process.env.AGENT_PROJECT_GUIDES_HOME), 'data');
  if (process.platform === 'win32') return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'AgentProjectGuides', 'data');
  return path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'agent-project-guides');
}

function validateRelease(packageRoot, provider) {
  const manifestPath = path.join(packageRoot, 'release-manifest.json');
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    fail(`exact release manifest is missing or invalid: ${error.message}`);
  }
  if (manifest.digest !== provider.digest || manifest.package_version !== provider.release || manifest.schema_version !== 1 || !Array.isArray(manifest.files)) {
    fail('exact release manifest does not match the descriptor');
  }
  const { digest, ...portable } = manifest;
  if (`sha256:${sha256(canonicalJson(portable))}` !== digest) fail('release manifest digest is invalid');
  const paths = new Set();
  const folded = new Set();
  let hasCli = false;
  for (const entry of manifest.files) {
    if (!entry || typeof entry.path !== 'string' || path.isAbsolute(entry.path) || entry.path.includes('\\') || entry.path.split('/').some((part) => !part || part === '..')) {
      fail('release manifest contains an unsafe path');
    }
    const key = entry.path.toLocaleLowerCase('und');
    if (paths.has(entry.path) || folded.has(key)) fail(`release manifest contains a duplicate/case-colliding path: ${entry.path}`);
    paths.add(entry.path);
    folded.add(key);
    const file = path.resolve(packageRoot, entry.path);
    if (!file.startsWith(`${packageRoot}${path.sep}`)) fail(`release path escapes package root: ${entry.path}`);
    const stat = fs.lstatSync(file, { throwIfNoEntry: false });
    if (!stat?.isFile() || stat.isSymbolicLink()) fail(`release file is missing or unsafe: ${entry.path}`);
    const bytes = fs.readFileSync(file);
    if (bytes.length !== entry.bytes || sha256(bytes) !== entry.sha256) fail(`release file hash mismatch: ${entry.path}`);
    if (entry.path === 'scripts/apg.mjs') hasCli = true;
  }
  if (!hasCli) fail('release manifest does not contain scripts/apg.mjs');
  const observed = [];
  function visit(relative = '') {
    for (const entry of fs.readdirSync(path.join(packageRoot, relative), { withFileTypes: true })) {
      const child = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) fail(`release contains a symlink: ${child}`);
      if (entry.isDirectory()) visit(child);
      else if (entry.isFile()) observed.push(child);
      else fail(`release contains an unsupported file type: ${child}`);
    }
  }
  visit();
  const expected = [...paths, 'release-manifest.json'].sort();
  observed.sort();
  if (JSON.stringify(observed) !== JSON.stringify(expected)) fail('release contains missing or unexpected files');
}

function validatePackedRuntime(runtimeRoot, descriptor) {
  const manifestPath = path.join(runtimeRoot, 'runtime-manifest.json');
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    fail(`exact packed runtime manifest is missing or invalid: ${error.message}`);
  }
  if (manifest.schema_version !== 1 || manifest.source_digest !== descriptor.release.digest || manifest.source_version !== descriptor.release.version || manifest.digest !== descriptor.release.runtime_digest || !Array.isArray(manifest.files)) {
    fail('exact packed runtime does not match the descriptor');
  }
  const { digest, ...portable } = manifest;
  if (digest !== `sha256:${sha256(canonicalJson(portable))}`) fail('packed runtime manifest digest is invalid');
  const expected = new Set();
  const foldedPaths = new Set();
  for (const entry of manifest.files) {
    if (!entry || typeof entry.path !== 'string' || path.isAbsolute(entry.path) || entry.path.includes('\\') || entry.path.split('/').some((part) => !part || part === '..')) fail('packed runtime manifest contains an unsafe path');
    const folded = entry.path.toLocaleLowerCase('und');
    if (expected.has(entry.path) || foldedPaths.has(folded)) fail(`packed runtime manifest contains a duplicate/case-colliding path: ${entry.path}`);
    expected.add(entry.path);
    foldedPaths.add(folded);
    const file = path.resolve(runtimeRoot, entry.path);
    if (!file.startsWith(`${runtimeRoot}${path.sep}`)) fail(`packed runtime path escapes root: ${entry.path}`);
    const stat = fs.lstatSync(file, { throwIfNoEntry: false });
    if (!stat?.isFile() || stat.isSymbolicLink()) fail(`packed runtime file is missing or unsafe: ${entry.path}`);
    const bytes = fs.readFileSync(file);
    if (bytes.length !== entry.bytes || sha256(bytes) !== entry.sha256) fail(`packed runtime file hash mismatch: ${entry.path}`);
  }
  const observed = [];
  function visit(relative = '') {
    for (const entry of fs.readdirSync(path.join(runtimeRoot, relative), { withFileTypes: true })) {
      const child = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) fail(`packed runtime contains a symlink: ${child}`);
      if (entry.isDirectory()) visit(child);
      else if (entry.isFile()) observed.push(child);
      else fail(`packed runtime contains an unsupported file: ${child}`);
    }
  }
  visit();
  const listed = [...expected, 'runtime-manifest.json'].sort();
  observed.sort();
  if (JSON.stringify(observed) !== JSON.stringify(listed)) fail('packed runtime contains missing or unexpected files');
}

function launcherHelp(scope) {
  if (scope === 'context') return `Agent Project Guides\n\nUsage: apg context [options]\n\nOptions:\n  --task <text>\n  --plane <production|development>\n  --role <role>\n  --mode <mode>\n  --generation <token>\n  --select <choice_id>\n  --format <context|json>\n  --target <path>\n  -h, --help\n`;
  return 'Agent Project Guides\n\nUsage: apg <command> [options]\n\nCommands: context, project, catalog, release, provider, migrate, risk, memory, dsh\nOptions: -h, --help; -V, --version\n';
}

function installedVersion() {
  const launcherDirectory = path.dirname(fs.realpathSync(process.argv[1]));
  for (const file of [path.join(launcherDirectory, 'apg-launcher.version'), path.resolve(launcherDirectory, '..', 'PACKAGE_VERSION')]) {
    if (!fs.statSync(file, { throwIfNoEntry: false })?.isFile()) continue;
    const value = fs.readFileSync(file, 'utf8').trim();
    if (/^[A-Za-z0-9._-]+$/.test(value)) return value;
  }
  fail('installed launcher version metadata is missing');
}

const launcherArgs = process.argv.slice(2);
if (launcherArgs.length === 0 || launcherArgs.includes('--help') || launcherArgs.includes('-h')) {
  process.stdout.write(launcherHelp(launcherArgs[0] === 'context' ? 'context' : undefined));
  process.exit(0);
}
if (launcherArgs.length === 1 && ['--version', '-V'].includes(launcherArgs[0])) {
  process.stdout.write(`${installedVersion()}\n`);
  process.exit(0);
}

const targetIndex = process.argv.indexOf('--target');
const start = targetIndex >= 0 && process.argv[targetIndex + 1] ? process.argv[targetIndex + 1] : process.cwd();
const project = findProject(start);
let descriptor;
try {
  descriptor = JSON.parse(fs.readFileSync(project.descriptor, 'utf8'));
} catch (error) {
  fail(`invalid project descriptor: ${error.message}`);
}
if (!descriptor || Array.isArray(descriptor) || ![1, 2].includes(descriptor.schema_version) || !/^[a-z0-9][a-z0-9._-]{2,127}$/.test(descriptor.project_id || '')) {
  fail('project descriptor identity/schema is invalid');
}
let packageRoot;
if (descriptor.schema_version === 2) {
  if (!['selected-inline.none', 'shared-runtime.pinned'].includes(descriptor.variant)) fail(`unsupported 3.0 variant: ${descriptor.variant}`);
  if (!descriptor.release || descriptor.release.policy !== 'pinned' || !/^[A-Za-z0-9._-]+$/.test(descriptor.release.version || '') || !/^sha256:[0-9a-f]{64}$/.test(descriptor.release.digest || '') || (descriptor.variant === 'shared-runtime.pinned' && !/^sha256:[0-9a-f]{64}$/.test(descriptor.release.runtime_digest || ''))) {
    fail('3.0 descriptor release identity is invalid');
  }
  packageRoot = path.resolve(dataHome(), 'runtimes', descriptor.release.digest.replace(':', '-'));
  const runtimeStat = fs.lstatSync(packageRoot, { throwIfNoEntry: false });
  if (!runtimeStat?.isDirectory() || runtimeStat.isSymbolicLink()) fail(`exact packed runtime is missing: ${descriptor.release.digest}`);
  validatePackedRuntime(packageRoot, descriptor);
} else {
  const provider = descriptor.provider;
  if (!provider || Array.isArray(provider) || typeof provider !== 'object' || !/^[A-Za-z0-9._-]+$/.test(provider.release || '')) fail('project provider is invalid');
  const providerKeys = Object.keys(provider).sort().join(',');
  if (provider.mode === 'source-worktree') {
    if (providerKeys !== 'digest,mode,release,source') fail('source-worktree provider fields are invalid');
    if (provider.digest !== 'observe' || provider.source !== '.') fail('source-worktree requires digest=observe and source=.');
    packageRoot = fs.realpathSync(project.root);
  } else if (provider.mode === 'embedded-local' || provider.mode === 'thin-bootstrap') {
    if (providerKeys !== 'digest,mode,release') fail('immutable provider fields are invalid');
    if (!/^sha256:[0-9a-f]{64}$/.test(provider.digest || '')) fail('immutable provider digest is invalid');
    packageRoot = provider.mode === 'embedded-local'
      ? path.join(project.root, '.agent-project-guides', 'local', 'releases', provider.digest.replace(':', '-'))
      : path.join(dataHome(), 'releases', provider.digest.replace(':', '-'));
    packageRoot = path.resolve(packageRoot);
    const packageStat = fs.lstatSync(packageRoot, { throwIfNoEntry: false });
    if (!packageStat?.isDirectory() || packageStat.isSymbolicLink()) fail(`exact package is missing or unsafe: ${provider.digest}; protected work must stop and other work is degraded`);
    validateRelease(packageRoot, provider);
  } else {
    fail(`unsupported provider mode: ${provider.mode}`);
  }
}
const cli = path.join(packageRoot, 'scripts', 'apg.mjs');
const expectedCliIdentity = descriptor.schema_version === 2 ? descriptor.release.runtime_digest : descriptor.provider.digest;
if (!fs.statSync(cli, { throwIfNoEntry: false })?.isFile()) fail(`exact package CLI is missing: ${expectedCliIdentity || 'observe'}`);
const module = await import(pathToFileURL(cli));
try {
  const result = await module.main(process.argv.slice(2));
  if (result && result.__apg_text === true) process.stdout.write(result.text);
  else process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({ error: error.code || 'internal_error', message: error.message, details: error.details })}\n`);
  process.exit(error.code ? 2 : 1);
}

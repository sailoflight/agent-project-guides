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

const targetIndex = process.argv.indexOf('--target');
const start = targetIndex >= 0 && process.argv[targetIndex + 1] ? process.argv[targetIndex + 1] : process.cwd();
const project = findProject(start);
let descriptor;
try {
  descriptor = JSON.parse(fs.readFileSync(project.descriptor, 'utf8'));
} catch (error) {
  fail(`invalid project descriptor: ${error.message}`);
}
if (!descriptor || Array.isArray(descriptor) || descriptor.schema_version !== 1 || !/^[a-z0-9][a-z0-9._-]{2,127}$/.test(descriptor.project_id || '')) {
  fail('project descriptor identity/schema is invalid');
}
const provider = descriptor.provider;
if (!provider || Array.isArray(provider) || typeof provider !== 'object' || !/^[A-Za-z0-9._-]+$/.test(provider.release || '')) fail('project provider is invalid');
const providerKeys = Object.keys(provider).sort().join(',');
let packageRoot;
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
const cli = path.join(packageRoot, 'scripts', 'apg.mjs');
if (!fs.statSync(cli, { throwIfNoEntry: false })?.isFile()) fail(`exact package CLI is missing: ${provider.digest || 'observe'}`);
const module = await import(pathToFileURL(cli));
try {
  const result = await module.main(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({ error: error.code || 'internal_error', message: error.message, details: error.details })}\n`);
  process.exit(error.code ? 2 : 1);
}

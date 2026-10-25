import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const DESCRIPTOR_NAME = '.agent-project-guides.json';
export const V2_START = '<!-- agent-project-guides:v2:start -->';
export const V2_END = '<!-- agent-project-guides:v2:end -->';
export const V3_START = '<!-- agent-project-guides:v3:start -->';
export const V3_END = '<!-- agent-project-guides:v3:end -->';
export const V1_MARKERS = [
  ['<!-- agent-project-guides:routing:start -->', '<!-- agent-project-guides:routing:end -->'],
  ['<!-- agent-project-guides:adapter-trigger:start -->', '<!-- agent-project-guides:adapter-trigger:end -->'],
  ['<!-- agent-project-guides:claude-scope:start -->', '<!-- agent-project-guides:claude-scope:end -->'],
];
export const PORTABLE_FACETS = new Set([
  'mcp', 'library', 'cli', 'service', 'application-ui', 'data-automation',
  'content-package', 'monorepo-composition',
]);
export const PORTABLE_OVERLAYS = new Set([
  'mechanical-modeling', 'agent-governance', 'research-reproducibility',
]);
export const PROVIDER_MODES = new Set(['thin-bootstrap', 'embedded-local', 'source-worktree']);

const DIST_DIRS = new Set(['bootstrap', 'catalog', 'docs', 'lib', 'procedures', 'profiles', 'roles', 'routing', 'schemas', 'templates']);
// RELEASE_LINES.json travels with the package: a consumer that receives a frozen
// release should be able to read which line that release belongs to without reaching
// back into the source repository.
const DIST_FILES = new Set(['PACKAGE_REMOTE.json', 'PACKAGE_VERSION', 'RELEASE_LINES.json']);
const SCRIPT_FILES = new Set(['apg.mjs', 'apg-launcher.mjs', 'check-update.mjs', 'install.sh', 'manage-root-blocks.mjs', 'validate-routing.mjs']);
// Project-owned research/memory records are not generic package content. Shared so that the
// distribution manifest and the catalog cannot drift apart on what they exclude.
export const DIST_EXCLUDED_DIRS = new Set(['docs/memory']);

export class UserError extends Error {
  constructor(message, code = 'invalid_request', details = undefined) {
    super(message);
    this.name = 'UserError';
    this.code = code;
    this.details = details;
  }
}

export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

export function canonicalJson(value) {
  return `${JSON.stringify(canonicalize(value))}\n`;
}

export function readJson(file, label = file) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new UserError(`${label} is not valid JSON: ${error.message}`, 'invalid_json');
  }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new UserError(`${label} must contain one JSON object`, 'invalid_json');
  }
  return parsed;
}

export function writeJsonAtomic(file, value, mode = 0o644) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  fs.writeFileSync(temporary, canonicalJson(value), { mode });
  fs.renameSync(temporary, file);
}

export function normalizeRelative(value, field, allowDot = false) {
  if (
    typeof value !== 'string' || !value || path.isAbsolute(value) || /^[A-Za-z]:/.test(value) ||
    value.includes('\\') || value.includes('\0')
  ) {
    throw new UserError(`${field} must be a non-empty portable project-relative path`, 'invalid_path');
  }
  if (allowDot && value === '.') return value;
  const parts = value.split('/');
  if (parts.some((part) => part === '' || part === '.' || part === '..')) {
    throw new UserError(`${field} must not escape its project root`, 'invalid_path');
  }
  return value;
}

export function resolveInside(root, relative, field, allowDot = false) {
  const normalized = normalizeRelative(relative, field, allowDot);
  const absoluteRoot = fs.realpathSync(root);
  const absolute = path.resolve(absoluteRoot, normalized);
  if (absolute !== absoluteRoot && !absolute.startsWith(`${absoluteRoot}${path.sep}`)) {
    throw new UserError(`${field} escapes its project root`, 'invalid_path');
  }
  const parts = path.relative(absoluteRoot, absolute).split(path.sep).filter(Boolean);
  let cursor = absoluteRoot;
  for (let index = 0; index < parts.length; index += 1) {
    cursor = path.join(cursor, parts[index]);
    const stat = fs.lstatSync(cursor, { throwIfNoEntry: false });
    if (!stat) break;
    if (stat.isSymbolicLink()) throw new UserError(`${field} traverses a symlink: ${path.relative(absoluteRoot, cursor)}`, 'invalid_path');
    if (index < parts.length - 1 && !stat.isDirectory()) throw new UserError(`${field} traverses a non-directory: ${path.relative(absoluteRoot, cursor)}`, 'invalid_path');
  }
  return absolute;
}

export function findProjectRoot(start = process.cwd(), requireDescriptor = false) {
  let current = fs.realpathSync(start);
  while (true) {
    if (fs.existsSync(path.join(current, DESCRIPTOR_NAME))) return current;
    if (!requireDescriptor && fs.existsSync(path.join(current, '.git'))) return current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new UserError(requireDescriptor ? `no ${DESCRIPTOR_NAME} found above ${start}` : `no project root found above ${start}`, 'project_not_found');
}

export function platformHomes(env = process.env) {
  if (env.AGENT_PROJECT_GUIDES_HOME) {
    const base = path.resolve(env.AGENT_PROJECT_GUIDES_HOME);
    return { data: path.join(base, 'data'), state: path.join(base, 'state'), cache: path.join(base, 'cache'), bin: path.join(base, 'bin') };
  }
  if (process.platform === 'win32') {
    const base = path.join(env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'AgentProjectGuides');
    return { data: path.join(base, 'data'), state: path.join(base, 'state'), cache: path.join(base, 'cache'), bin: path.join(base, 'bin') };
  }
  return {
    data: path.join(env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'agent-project-guides'),
    state: path.join(env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state'), 'agent-project-guides'),
    cache: path.join(env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'), 'agent-project-guides'),
    bin: path.join(env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'agent-project-guides', 'bin'),
  };
}

export function projectStateDir(root, projectId, env = process.env) {
  if (!/^[a-z0-9][a-z0-9._-]{2,127}$/.test(projectId || '')) throw new UserError('project_id is invalid for clone-local state', 'invalid_request');
  const realRoot = fs.realpathSync(root);
  const cloneId = sha256(`${projectId}\0${realRoot}`).slice(0, 24);
  return path.join(platformHomes(env).state, 'projects', projectId, cloneId);
}

export function acquireProjectMutationLock(root, projectId, env = process.env) {
  const state = projectStateDir(root, projectId, env);
  const file = path.join(state, 'project-mutation.lock');
  fs.mkdirSync(state, { recursive: true });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const descriptor = fs.openSync(file, 'wx', 0o600);
      fs.writeSync(descriptor, canonicalJson({ schema_version: 1, pid: process.pid, host: os.hostname() }));
      fs.fsyncSync(descriptor);
      fs.closeSync(descriptor);
      return {
        file,
        release() { fs.rmSync(file, { force: true }); },
      };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let stale = false;
      try {
        const owner = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (owner.host === os.hostname() && Number.isSafeInteger(owner.pid)) {
          try { process.kill(owner.pid, 0); } catch (probe) { if (probe.code === 'ESRCH') stale = true; }
        }
      } catch {
        stale = false;
      }
      if (!stale || attempt > 0) throw new UserError('another project mutation is in progress', 'mutation_conflict');
      fs.rmSync(file, { force: true });
    }
  }
  throw new UserError('cannot acquire project mutation lock', 'mutation_conflict');
}

export function listDistributionFiles(root) {
  const result = [];
  function visit(relative) {
    const absolute = path.join(root, relative);
    const entries = fs.readdirSync(absolute, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const child = relative ? `${relative}/${entry.name}` : entry.name;
      if (DIST_EXCLUDED_DIRS.has(child)) continue;
      if (entry.isSymbolicLink()) throw new UserError(`distribution contains a symlink: ${child}`, 'invalid_distribution');
      if (entry.isDirectory()) visit(child);
      else if (entry.isFile()) result.push(child);
      else throw new UserError(`distribution contains an unsupported file type: ${child}`, 'invalid_distribution');
    }
  }
  for (const directory of [...DIST_DIRS].sort()) {
    if (fs.statSync(path.join(root, directory), { throwIfNoEntry: false })?.isDirectory()) visit(directory);
  }
  for (const file of [...DIST_FILES].sort()) {
    if (fs.statSync(path.join(root, file), { throwIfNoEntry: false })?.isFile()) result.push(file);
  }
  const scripts = path.join(root, 'scripts');
  if (fs.statSync(scripts, { throwIfNoEntry: false })?.isDirectory()) {
    for (const file of [...SCRIPT_FILES].sort()) {
      if (fs.statSync(path.join(scripts, file), { throwIfNoEntry: false })?.isFile()) result.push(`scripts/${file}`);
    }
  }
  return [...new Set(result)].sort();
}

// Permission bits are release content, not an installation detail. A lost exec bit
// turns a shim into rc=126; the proj registration measured exactly that
// (2026-10-11). So `files[].mode` is part of the manifest digest from 3.0.11 on, and
// the value is the plain POSIX permission mask in decimal (`420` = 0o644, `493` =
// 0o755), which is what a consumer's file-set record already expects.
//
// Manifests written before that boundary carry no mode. They are still accepted, on
// their own shape, because a release that was valid when it was built did not become
// corrupt; what is refused is a *current* manifest that simply omits the field.
const MANIFEST_MODE_SINCE = '3.0.11';

function versionAtLeast(value, floor) {
  const parse = (text) => String(text).split('.').map((part) => Number.parseInt(part, 10));
  const left = parse(value);
  const right = parse(floor);
  for (let index = 0; index < 3; index += 1) {
    const a = Number.isInteger(left[index]) ? left[index] : 0;
    const b = Number.isInteger(right[index]) ? right[index] : 0;
    if (a !== b) return a > b;
  }
  return true;
}

function manifestShape(manifest, declaresMode) {
  return canonicalJson({
    schema_version: manifest.schema_version,
    package_version: manifest.package_version,
    files: manifest.files.map((entry) => (declaresMode
      ? { path: entry.path, bytes: entry.bytes, mode: entry.mode, sha256: entry.sha256 }
      : { path: entry.path, bytes: entry.bytes, sha256: entry.sha256 })),
  });
}

export function buildFileManifest(root) {
  const files = listDistributionFiles(root).map((relative) => {
    const absolute = path.join(root, relative);
    const content = fs.readFileSync(absolute);
    return { path: relative, bytes: content.length, mode: fs.statSync(absolute).mode & 0o777, sha256: sha256(content) };
  });
  const version = fs.readFileSync(path.join(root, 'PACKAGE_VERSION'), 'utf8').trim();
  const portable = { schema_version: 1, package_version: version, files };
  return { ...portable, digest: `sha256:${sha256(canonicalJson(portable))}` };
}

export function verifyFileManifest(root, manifest) {
  const rootStat = fs.lstatSync(root, { throwIfNoEntry: false });
  if (!rootStat?.isDirectory() || rootStat.isSymbolicLink()) throw new UserError(`release root is missing or unsafe: ${root}`, 'release_corrupt');
  const actual = buildFileManifest(root);
  const declaresMode = manifest.files.some((entry) => Object.prototype.hasOwnProperty.call(entry, 'mode'));
  if (declaresMode) {
    const malformed = manifest.files.find((entry) => !Number.isInteger(entry.mode) || entry.mode < 0 || entry.mode > 0o777);
    if (malformed) throw new UserError(`release manifest at ${root} declares an invalid mode for ${malformed.path}`, 'release_corrupt', { expected: '0..511', actual: malformed.mode });
  } else if (typeof manifest.package_version === 'string' && versionAtLeast(manifest.package_version, MANIFEST_MODE_SINCE)) {
    throw new UserError(`release manifest at ${root} omits files[].mode, required since ${MANIFEST_MODE_SINCE}`, 'release_corrupt', { expected: 'mode', actual: 'absent' });
  }
  if (manifestShape(actual, declaresMode) !== manifestShape(manifest, declaresMode)) {
    throw new UserError(`release manifest mismatch at ${root}`, 'release_corrupt', { expected: manifest.digest, actual: actual.digest });
  }
  const observed = [];
  function visit(relative = '') {
    const directory = path.join(root, relative);
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const child = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) throw new UserError(`release contains a symlink: ${child}`, 'release_corrupt');
      if (entry.isDirectory()) visit(child);
      else if (entry.isFile()) observed.push(child);
      else throw new UserError(`release contains an unsupported file type: ${child}`, 'release_corrupt');
    }
  }
  visit();
  const expectedPaths = [...manifest.files.map((entry) => entry.path), 'release-manifest.json'].sort();
  if (canonicalJson(observed.sort()) !== canonicalJson(expectedPaths)) {
    throw new UserError(`release contains missing or unexpected files at ${root}`, 'release_corrupt', { expected: expectedPaths, actual: observed.sort() });
  }
  return actual;
}

export function copyDistribution(source, destination) {
  fs.mkdirSync(destination, { recursive: true });
  for (const relative of listDistributionFiles(source)) {
    const from = path.join(source, relative);
    const to = path.join(destination, relative);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to, fs.constants.COPYFILE_EXCL);
    fs.chmodSync(to, fs.statSync(from).mode & 0o777);
  }
}

export function gitDirty(root) {
  const git = path.join(root, '.git');
  if (!fs.existsSync(git)) return undefined;
  try {
    const result = fs.readFileSync(path.join(git, 'index'), { flag: 'r' });
    void result;
  } catch {
    // A worktree .git file is valid; dirty state is reported by the CLI using git when available.
  }
  return undefined;
}

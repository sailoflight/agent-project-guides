import { compareCanonical } from './core.mjs';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { UserError, canonicalJson, platformHomes, sha256 } from './core.mjs';

// ADR 0009: one component store per machine, shared by every project on it. ADR 0010
// moves this contract onto the distribution surface, which is why the reference
// implementation lives here rather than in the gate that used to own it.
//
// What this module is: a read-only verifier and discoverer for components that a human
// or an operator staged locally. It verifies what is already there and reports where it
// is; it never downloads, installs, starts, stops or repairs anything. The store is a
// sibling of the release store that `thin-bootstrap` already resolves, under the same
// configuration: there is no second root variable.

export const COMPONENT_MANIFEST = 'component-manifest.json';
export const PACKAGE_KIND = 'package';
export const SERVICE_KIND = 'service';
export const SERVICE_DIR = 'services';
export const DISCOVERY_STATES = ['available', 'degraded', 'not-installed', 'conflict'];
// Which fields of a health response carry the component's identity. The capability test
// started a real service whose health endpoint names itself `service`/`rev`, and the
// shipped probe could only read `id`/`revision`, so that component could never have been
// recorded honestly. A record may now say which fields its own endpoint uses.
export const IDENTITY_FIELDS = ['id_field', 'revision_field'];
export const IDENTITY_DEFAULTS = { id_field: 'id', revision_field: 'revision' };
// What a component needs before it is usable: another component in this store, an
// executable on PATH, or an environment variable that must exist (presence only - the
// store never reads a value). The capability test measured that most of these are real:
// ntm needs tmux, br/bv need a .beads directory, cass needs an API key, ft needs the
// WezTerm mux, sbh's reclamation needs a daemon and root.
export const REQUIREMENT_KINDS = ['component', 'bin', 'env'];
export const STOP_KINDS = ['signal', 'sigkill'];
export const DELIVERY_KINDS = ['staged', 'fetched'];
export const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
// No name resolution: discovery may only address a literal IPv4/IPv6 address or
// localhost, so a record cannot point the probe at an arbitrary destination.
export const LOCAL_ENDPOINT = /^(?:(?:\d{1,3}\.){3}\d{1,3}|\[[0-9a-fA-F:]+\]|localhost):\d{1,5}$/;

export function componentsRoot(env = process.env) {
  return path.join(platformHomes(env).data, 'components');
}

export function storeRoot(options = {}) {
  return options.store ? path.resolve(options.store) : componentsRoot(options.env ?? process.env);
}

export function entryDir(root, id, digest) {
  return path.join(root, id, digest.replace(':', '-'));
}

export function sha256Of(bytes) {
  return `sha256:${sha256(bytes)}`;
}

// The manifest deliberately excludes itself from its own content set: a digest over a
// file that contains the digest cannot exist. `lib/provider.mjs` does the same for the
// packed runtime manifest.
export function packageManifest({ id, version, provenance, requires, files }) {
  const entries = files
    .map((file) => ({ path: file.path, bytes: file.content.length, sha256: sha256Of(file.content) }))
    .sort((left, right) => compareCanonical(left.path, right.path));
  const portable = { schema_version: 1, kind: PACKAGE_KIND, id, version, files: entries };
  if (provenance) portable.provenance = provenance;
  // Declared prerequisites are part of the entry, so they are covered by its digest: an
  // entry that changed what it needs is a different entry.
  if (requires?.length) portable.requires = requires.map((requirement) => validateRequirement(requirement)).map(({ kind, name }) => ({ [kind]: name }));
  return { ...portable, digest: `sha256:${sha256(canonicalJson(portable))}` };
}

export function writePackageEntry(dir, manifest, files, { mode = 0o444 } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  for (const file of files) {
    const target = path.join(dir, file.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, file.content, { mode: 0o644 });
  }
  fs.writeFileSync(path.join(dir, COMPONENT_MANIFEST), canonicalJson(manifest), { mode });
  return manifest;
}

// Verification mirrors the shipped release validator: canonical digest over the
// manifest without its own digest, safe relative paths, no case collisions, a
// read-only manifest, and a file set that matches EXACTLY. The set comparison runs
// before the per-file hashes so that a missing file is reported as a missing file
// rather than as a read error.
export function verifyEntry(dir) {
  const manifestPath = path.join(dir, COMPONENT_MANIFEST);
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    throw new UserError(`component manifest is missing or invalid: ${error.message}`, 'component_corrupt');
  }
  const fail = (message) => { throw new UserError(`${message}: ${dir}`, 'component_corrupt'); };
  const { digest, ...portable } = manifest;
  if (typeof digest !== 'string' || `sha256:${sha256(canonicalJson(portable))}` !== digest) fail('component manifest digest is invalid');
  if (path.basename(dir) !== digest.replace(':', '-')) fail('component directory is not named by its digest');
  if ((fs.statSync(manifestPath).mode & 0o777) !== 0o444) fail('a component manifest must be read-only');
  const declared = new Set();
  const folded = new Set();
  for (const entry of manifest.files) {
    if (typeof entry.path !== 'string' || path.isAbsolute(entry.path) || entry.path.includes('\\') || entry.path.split('/').some((part) => !part || part === '..')) fail(`unsafe component path: ${entry.path}`);
    const key = entry.path.toLocaleLowerCase('und');
    if (declared.has(entry.path) || folded.has(key)) fail(`duplicate or case-colliding component path: ${entry.path}`);
    declared.add(entry.path);
    folded.add(key);
  }
  const observed = [];
  const visit = (relative = '') => {
    for (const item of fs.readdirSync(path.join(dir, relative), { withFileTypes: true })) {
      const child = relative ? `${relative}/${item.name}` : item.name;
      if (item.isSymbolicLink()) fail(`component contains a symlink: ${child}`);
      if (item.isDirectory()) visit(child);
      else observed.push(child);
    }
  };
  visit();
  const expected = [...declared, COMPONENT_MANIFEST].sort();
  if (JSON.stringify(observed.sort()) !== JSON.stringify(expected)) fail('component file set is not exactly its manifest');
  for (const entry of manifest.files) {
    const bytes = fs.readFileSync(path.join(dir, entry.path));
    if (bytes.length !== entry.bytes) fail(`component size mismatch: ${entry.path}`);
    if (sha256Of(bytes) !== entry.sha256) fail(`component hash mismatch: ${entry.path}`);
  }
  return manifest;
}

// A record names an identity, never a location. This is the rule the shipped
// provenance gate already enforces for component records, kept here in its precise
// form: the check is on the KEY, so a value such as kind: "package" cannot trip it.
const FIELD_NAME = /^[A-Za-z_][A-Za-z0-9_.-]*$/;

// A requirement is a single-key object. Single-key is deliberate: `{component: 'am'}`
// cannot be confused with `{bin: 'am'}` or carry a silent second meaning.
function validateRequirement(requirement) {
  if (!requirement || typeof requirement !== 'object' || Array.isArray(requirement)) throw new UserError('a requirement must be an object', 'invalid_component');
  const keys = Object.keys(requirement);
  if (keys.length !== 1 || !REQUIREMENT_KINDS.includes(keys[0])) throw new UserError(`a requirement must name exactly one of ${REQUIREMENT_KINDS.join(', ')}: ${JSON.stringify(requirement)}`, 'invalid_component');
  if (typeof requirement[keys[0]] !== 'string' || !requirement[keys[0]]) throw new UserError(`a requirement must name what it needs: ${JSON.stringify(requirement)}`, 'invalid_component');
  return { kind: keys[0], name: requirement[keys[0]] };
}

function validateCommon(entry) {
  if (entry.requires !== undefined) {
    if (!Array.isArray(entry.requires) || entry.requires.length === 0) throw new UserError('requires must be a non-empty array of requirements', 'invalid_component');
    const seen = new Set();
    for (const requirement of entry.requires) {
      const { kind, name } = validateRequirement(requirement);
      if (seen.has(`${kind}:${name}`)) throw new UserError(`duplicate requirement: ${kind}:${name}`, 'invalid_component');
      seen.add(`${kind}:${name}`);
    }
  }
}

export function validateEntry(entry) {
  if (!entry || typeof entry !== 'object') throw new UserError('a component entry must be an object', 'invalid_component');
  if (entry.kind === SERVICE_KIND) {
    if (entry.delivery !== 'staged') throw new UserError('a service entry cannot be delivery: fetched - an already-running service cannot be downloaded', 'invalid_component');
    if (!LOCAL_ENDPOINT.test(entry.endpoint || '')) throw new UserError(`a service endpoint must be a local host:port literal: ${entry.endpoint}`, 'invalid_component');
    if (typeof entry.singleton !== 'boolean') throw new UserError('a service entry must declare singleton', 'invalid_component');
    if (typeof entry.health !== 'string' || !entry.health.startsWith('/')) throw new UserError('a service entry must declare a health path', 'invalid_component');
    if (!DELIVERY_KINDS.includes(entry.delivery)) throw new UserError(`unknown delivery kind: ${entry.delivery}`, 'invalid_component');
    if (entry.stop !== undefined && !STOP_KINDS.includes(entry.stop)) throw new UserError(`unknown stop kind: ${entry.stop}`, 'invalid_component');
    if (entry.asserted_identity !== undefined && typeof entry.asserted_identity !== 'boolean') throw new UserError('asserted_identity must be a boolean', 'invalid_component');
    if (entry.identity !== undefined) {
      if (entry.asserted_identity) throw new UserError('a service either checks its identity or asserts it, never both', 'invalid_component');
      const keys = Object.keys(entry.identity);
      if (!keys.length || keys.some((key) => !IDENTITY_FIELDS.includes(key))) throw new UserError(`identity may only name ${IDENTITY_FIELDS.join(', ')}`, 'invalid_component');
      for (const key of keys) if (typeof entry.identity[key] !== 'string' || !FIELD_NAME.test(entry.identity[key])) throw new UserError(`identity.${key} must be a field name: ${entry.identity[key]}`, 'invalid_component');
    }
  } else if (entry.kind === PACKAGE_KIND) {
    // A package manifest carries no delivery field: delivery is a property of the
    // record that declares the dependency, not of the artifact in the store.
    if (!DIGEST_PATTERN.test(entry.digest || '')) throw new UserError(`a package entry must carry a digest: ${entry.digest}`, 'invalid_component');
    if ('delivery' in entry && !DELIVERY_KINDS.includes(entry.delivery)) throw new UserError(`unknown delivery kind: ${entry.delivery}`, 'invalid_component');
  } else {
    throw new UserError(`unknown component kind: ${entry.kind}`, 'invalid_component');
  }
  validateCommon(entry);
  const serialized = JSON.stringify(entry);
  if (/"(?:file|path|local)"\s*:/.test(serialized)) throw new UserError('a component record must not name a local file/path', 'invalid_component');
  return entry;
}

export function readStoreEntryRecords(root) {
  const packages = [];
  const services = [];
  for (const item of fs.readdirSync(root, { withFileTypes: true }).sort((left, right) => compareCanonical(left.name, right.name))) {
    if (!item.isDirectory()) continue;
    if (item.name === SERVICE_DIR) {
      for (const service of fs.readdirSync(path.join(root, SERVICE_DIR)).sort()) {
        if (!service.endsWith('.json')) continue;
        let record;
        try {
          record = JSON.parse(fs.readFileSync(path.join(root, SERVICE_DIR, service), 'utf8'));
        } catch (error) {
          throw new UserError(`service entry is invalid: ${service}: ${error.message}`, 'invalid_component');
        }
        services.push(validateEntry({ ...record, kind: SERVICE_KIND }));
      }
      continue;
    }
    for (const version of fs.readdirSync(path.join(root, item.name)).sort()) {
      if (!version.startsWith('sha256-')) continue;
      // What a package needs is declared inside its manifest, which is the only place the
      // digest can cover it. Reading the manifest here is what makes the requirement check
      // reach real entries; an unreadable manifest yields no requirements and is reported
      // as corruption by the verifier that follows, with its own error code.
      let requires;
      try {
        requires = JSON.parse(fs.readFileSync(path.join(root, item.name, version, COMPONENT_MANIFEST), 'utf8')).requires;
      } catch {
        requires = undefined;
      }
      packages.push(validateEntry({ kind: PACKAGE_KIND, id: item.name, digest: version.replace('sha256-', 'sha256:'), requires }));
    }
  }
  return { packages, services };
}

export function resolvePackage(entry, root) {
  const dir = entryDir(root, entry.id, entry.digest);
  if (!fs.existsSync(dir)) return { id: entry.id, state: 'not-installed', reusable: false, action: 'none' };
  const manifest = verifyEntry(dir);
  return { id: entry.id, state: 'available', reusable: true, dir, version: manifest.version ?? null };
}

// One id resolves to one digest. Two digest directories under the same id are a conflict
// and not a choice: nothing in the store can say which copy is current, so resolving the
// id through either one would let a stale copy answer for the component. The store gate
// caught this on a real store - a manifest gained a requirement, a second digest directory
// appeared, and `verify` went on reporting the id as reusable while the summary listed it
// twice. The builder reports the same condition by name as `stale`.
export function findDuplicateDigests(entries) {
  const byId = new Map();
  for (const entry of entries) byId.set(entry.id, [...(byId.get(entry.id) ?? []), entry.digest]);
  return [...byId.entries()]
    .filter(([, digests]) => digests.length > 1)
    .map(([id, digests]) => ({ id, digests: [...digests].sort() }))
    .sort((left, right) => compareCanonical(left.id, right.id));
}

export function probeService(entry, { timeout = 400 } = {}) {
  const identity = { ...IDENTITY_DEFAULTS, ...(entry.identity ?? {}) };
  return new Promise((resolve) => {
    const [host, port] = entry.endpoint.split(':');
    const request = http.get({ host: host.replace(/^\[|\]$/g, ''), port: Number(port), path: entry.health, timeout }, (response) => {
      let body = '';
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        let observed;
        try {
          observed = JSON.parse(body);
        } catch {
          resolve({ id: entry.id, state: 'conflict', reusable: false, reason: 'the endpoint answered with something that is not a component identity' });
          return;
        }
        // A health payload with no identity at all is not a foreign component, it is a
        // component that cannot be identified: the capability test found a real server
        // whose health endpoint answers 200 with only {status, version}, which is
        // liveness masquerading as identity. Both are conflicts, and neither is reusable.
        const observedId = observed[identity.id_field];
        const observedRevision = observed[identity.revision_field];
        // An asserted identity is a record admitting that nobody can check who answers.
        // It may be reachable, but it can never be available: `degraded` is exactly the
        // word for "present, and I cannot verify it".
        if (entry.asserted_identity) resolve({ id: entry.id, state: 'degraded', reusable: false, reason: 'the record asserts its identity instead of checking it, so it can never be available' });
        else if (observedId === undefined) resolve({ id: entry.id, state: 'conflict', reusable: false, reason: `the health response carries no component identity (expected a field named "${identity.id_field}")` });
        else if (observedId !== entry.id) resolve({ id: entry.id, state: 'conflict', reusable: false, reason: `the endpoint belongs to ${observedId}` });
        else if (!entry.revision) resolve({ id: entry.id, state: 'degraded', reusable: true, reason: 'the declaration pins no revision, so the identity is unverified' });
        else if (observedRevision === undefined) resolve({ id: entry.id, state: 'degraded', reusable: true, reason: `the health response carries no revision field "${identity.revision_field}"` });
        else if (observedRevision !== entry.revision) resolve({ id: entry.id, state: 'degraded', reusable: true, reason: `revision ${observedRevision} does not match the pinned ${entry.revision}` });
        else resolve({ id: entry.id, state: 'available', reusable: true });
      });
    });
    request.on('timeout', () => { request.destroy(); resolve({ id: entry.id, state: 'degraded', reusable: false, reason: 'the health probe timed out' }); });
    request.on('error', () => resolve({ id: entry.id, state: 'not-installed', reusable: false, action: 'none' }));
  });
}

// A singleton with two live instances is a conflict, not a choice: picking one would
// silently reintroduce the second deployment this store exists to prevent.
export function resolveService(entry, observations) {
  const available = observations.filter((observation) => observation.state === 'available');
  if (entry.singleton && available.length > 1) return { id: entry.id, state: 'conflict', reusable: false, reason: `${available.length} instances of a singleton are live` };
  if (available.length) return { id: entry.id, state: 'available', reusable: true, instances: available.length };
  const conflicted = observations.find((observation) => observation.state === 'conflict');
  if (conflicted) return { id: entry.id, state: 'conflict', reusable: false, reason: conflicted.reason };
  const degraded = observations.find((observation) => observation.state === 'degraded');
  if (degraded) return { id: entry.id, state: 'degraded', reusable: false, reason: degraded.reason };
  return { id: entry.id, state: 'not-installed', reusable: false, action: 'none' };
}

// Requirements are checked against the best resolution the caller has. The point is not
// to be exhaustive but to be honest about the difference between "the bytes are here" and
// "this thing is usable": a component whose declared dependency is missing is degraded,
// never available, and the verdict names which dependency failed rather than leaving the
// operator to guess.
export function checkRequirements(requires = [], { describe, env = process.env, pathValue = process.env.PATH } = {}) {
  const met = [];
  const unmet = [];
  for (const requirement of requires) {
    const { kind, name } = validateRequirement(requirement);
    if (kind === 'component') {
      const verdict = describe ? describe(name) : null;
      if (verdict) met.push(`component:${name}`);
      else unmet.push({ requirement: `component:${name}`, reason: 'the required component is not in this store' });
    } else if (kind === 'bin') {
      const found = (pathValue ?? '').split(path.delimiter).filter(Boolean).some((directory) => {
        const candidate = path.join(directory, name);
        try {
          fs.accessSync(candidate, fs.constants.X_OK);
          return true;
        } catch {
          return false;
        }
      });
      if (found) met.push(`bin:${name}`);
      else unmet.push({ requirement: `bin:${name}`, reason: 'not found on PATH or not executable' });
    } else {
      // Presence only. The store never reads, compares or records the value of a variable,
      // and `env` must name a variable rather than describe its contents.
      if (env[name]) met.push(`env:${name}`);
      else unmet.push({ requirement: `env:${name}`, reason: 'the environment variable is not set' });
    }
  }
  return { met, unmet };
}

export function applyRequirements(verdict, checked) {
  if (!checked?.unmet?.length) return verdict;
  return {
    ...verdict,
    state: 'degraded',
    reusable: false,
    reason: `unmet requirement: ${checked.unmet.map((item) => `${item.requirement} (${item.reason})`).join('; ')}`,
    unmet: checked.unmet,
  };
}

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
export function packageManifest({ id, version, provenance, files }) {
  const entries = files
    .map((file) => ({ path: file.path, bytes: file.content.length, sha256: sha256Of(file.content) }))
    .sort((left, right) => left.path.localeCompare(right.path));
  const portable = { schema_version: 1, kind: PACKAGE_KIND, id, version, files: entries };
  if (provenance) portable.provenance = provenance;
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
export function validateEntry(entry) {
  if (!entry || typeof entry !== 'object') throw new UserError('a component entry must be an object', 'invalid_component');
  if (entry.kind === SERVICE_KIND) {
    if (entry.delivery !== 'staged') throw new UserError('a service entry cannot be delivery: fetched - an already-running service cannot be downloaded', 'invalid_component');
    if (!LOCAL_ENDPOINT.test(entry.endpoint || '')) throw new UserError(`a service endpoint must be a local host:port literal: ${entry.endpoint}`, 'invalid_component');
    if (typeof entry.singleton !== 'boolean') throw new UserError('a service entry must declare singleton', 'invalid_component');
    if (typeof entry.health !== 'string' || !entry.health.startsWith('/')) throw new UserError('a service entry must declare a health path', 'invalid_component');
    if (!DELIVERY_KINDS.includes(entry.delivery)) throw new UserError(`unknown delivery kind: ${entry.delivery}`, 'invalid_component');
  } else if (entry.kind === PACKAGE_KIND) {
    // A package manifest carries no delivery field: delivery is a property of the
    // record that declares the dependency, not of the artifact in the store.
    if (!DIGEST_PATTERN.test(entry.digest || '')) throw new UserError(`a package entry must carry a digest: ${entry.digest}`, 'invalid_component');
    if ('delivery' in entry && !DELIVERY_KINDS.includes(entry.delivery)) throw new UserError(`unknown delivery kind: ${entry.delivery}`, 'invalid_component');
  } else {
    throw new UserError(`unknown component kind: ${entry.kind}`, 'invalid_component');
  }
  const serialized = JSON.stringify(entry);
  if (/"(?:file|path|local)"\s*:/.test(serialized)) throw new UserError('a component record must not name a local file/path', 'invalid_component');
  return entry;
}

export function readStoreEntryRecords(root) {
  const packages = [];
  const services = [];
  for (const item of fs.readdirSync(root, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
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
      packages.push(validateEntry({ kind: PACKAGE_KIND, id: item.name, digest: version.replace('sha256-', 'sha256:') }));
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

export function probeService(entry, { timeout = 400 } = {}) {
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
        if (observed.id === undefined) resolve({ id: entry.id, state: 'conflict', reusable: false, reason: 'the health response carries no component identity (expected a field named "id")' });
        else if (observed.id !== entry.id) resolve({ id: entry.id, state: 'conflict', reusable: false, reason: `the endpoint belongs to ${observed.id}` });
        else if (!entry.revision) resolve({ id: entry.id, state: 'degraded', reusable: true, reason: 'the declaration pins no revision, so the identity is unverified' });
        else if (observed.revision !== entry.revision) resolve({ id: entry.id, state: 'degraded', reusable: true, reason: `revision ${observed.revision} does not match the pinned ${entry.revision}` });
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

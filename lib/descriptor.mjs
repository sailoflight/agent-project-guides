import fs from 'node:fs';
import path from 'node:path';
import {
  DESCRIPTOR_NAME,
  PORTABLE_FACETS,
  PORTABLE_OVERLAYS,
  PROVIDER_MODES,
  UserError,
  readJson,
  resolveInside,
  writeJsonAtomic,
} from './core.mjs';

const PROJECT_ID = /^[a-z0-9][a-z0-9._-]{2,127}$/;
const RELEASE = /^[A-Za-z0-9._-]+$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const EFFECT = /^[a-z][a-z0-9-]*$/;
const TOP_KEYS = new Set(['schema_version', 'project_id', 'provider', 'facets', 'overlays', 'protected_effects', 'policy', 'layout']);

function exactKeys(value, allowed, field) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new UserError(`${field} contains unsupported field: ${key}`, 'invalid_descriptor');
  }
}

function object(value, field) {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    throw new UserError(`${field} must be an object`, 'invalid_descriptor');
  }
  return value;
}

function uniqueStrings(value, field) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item)) {
    throw new UserError(`${field} must be an array of non-empty strings`, 'invalid_descriptor');
  }
  if (new Set(value).size !== value.length) throw new UserError(`${field} contains duplicates`, 'invalid_descriptor');
  return value;
}

export function validateDescriptor(value, root) {
  object(value, 'descriptor');
  exactKeys(value, TOP_KEYS, 'descriptor');
  if (value.schema_version !== 1) throw new UserError('descriptor.schema_version must be 1', 'unsupported_schema');
  if (typeof value.project_id !== 'string' || !PROJECT_ID.test(value.project_id)) {
    throw new UserError('descriptor.project_id must be a stable lowercase identifier', 'invalid_descriptor');
  }

  const provider = object(value.provider, 'descriptor.provider');
  exactKeys(provider, new Set(['mode', 'release', 'digest', 'source']), 'descriptor.provider');
  if (!PROVIDER_MODES.has(provider.mode)) throw new UserError(`unsupported provider mode: ${provider.mode}`, 'invalid_descriptor');
  if (typeof provider.release !== 'string' || !RELEASE.test(provider.release)) throw new UserError('provider.release is invalid', 'invalid_descriptor');
  if (provider.mode === 'source-worktree') {
    if (provider.digest !== 'observe') throw new UserError('source-worktree requires provider.digest=observe', 'invalid_descriptor');
    if (provider.source !== '.') throw new UserError('source-worktree requires provider.source=.', 'invalid_descriptor');
    const source = resolveInside(root, provider.source, 'provider.source', true);
    const versionFile = path.join(source, 'PACKAGE_VERSION');
    if (!fs.statSync(versionFile, { throwIfNoEntry: false })?.isFile()) {
      throw new UserError('source-worktree does not point to a package source', 'invalid_descriptor');
    }
    const observedVersion = fs.readFileSync(versionFile, 'utf8').trim();
    if (provider.release !== observedVersion) throw new UserError('source-worktree release differs from PACKAGE_VERSION', 'invalid_descriptor');
  } else {
    if (!DIGEST.test(provider.digest || '')) throw new UserError(`${provider.mode} requires an exact sha256 digest`, 'invalid_descriptor');
    if ('source' in provider) throw new UserError('provider.source is valid only for source-worktree', 'invalid_descriptor');
  }

  uniqueStrings(value.facets, 'descriptor.facets');
  for (const facet of value.facets) if (!PORTABLE_FACETS.has(facet)) throw new UserError(`unknown facet: ${facet}`, 'invalid_descriptor');
  const overlays = value.overlays === undefined ? [] : uniqueStrings(value.overlays, 'descriptor.overlays');
  for (const overlay of overlays) if (!PORTABLE_OVERLAYS.has(overlay)) throw new UserError(`unknown overlay: ${overlay}`, 'invalid_descriptor');
  const effects = uniqueStrings(value.protected_effects, 'descriptor.protected_effects');
  for (const effect of effects) if (!EFFECT.test(effect)) throw new UserError(`invalid protected effect: ${effect}`, 'invalid_descriptor');

  const policy = object(value.policy, 'descriptor.policy');
  exactKeys(policy, new Set(['root', 'mandatory']), 'descriptor.policy');
  if (!['AGENTS.md', 'CLAUDE.md'].includes(policy.root)) throw new UserError('policy.root must be AGENTS.md or CLAUDE.md', 'invalid_descriptor');
  uniqueStrings(policy.mandatory, 'descriptor.policy.mandatory');

  const layout = object(value.layout, 'descriptor.layout');
  exactKeys(layout, new Set(['scratch', 'memory']), 'descriptor.layout');
  const scratch = uniqueStrings(layout.scratch, 'descriptor.layout.scratch');
  if (scratch.length === 0) throw new UserError('descriptor.layout.scratch requires at least one binding', 'invalid_descriptor');
  for (const [index, binding] of scratch.entries()) resolveInside(root, binding, `layout.scratch[${index}]`);
  resolveInside(root, layout.memory, 'layout.memory');

  return {
    ...value,
    overlays,
  };
}

export function readDescriptor(root) {
  const file = path.join(root, DESCRIPTOR_NAME);
  if (!fs.statSync(file, { throwIfNoEntry: false })?.isFile()) throw new UserError(`missing ${DESCRIPTOR_NAME}`, 'descriptor_missing');
  if (fs.lstatSync(file).isSymbolicLink()) throw new UserError(`${DESCRIPTOR_NAME} must not be a symlink`, 'invalid_descriptor');
  return { file, descriptor: validateDescriptor(readJson(file, DESCRIPTOR_NAME), root) };
}

export function defaultDescriptor({ projectId, mode, release, digest, source = undefined, rootName = 'AGENTS.md', facets = [], overlays = [] }) {
  const provider = { mode, release, digest };
  if (source !== undefined) provider.source = source;
  return {
    schema_version: 1,
    project_id: projectId,
    provider,
    facets,
    overlays,
    protected_effects: [],
    policy: {
      root: rootName,
      mandatory: [],
    },
    layout: {
      scratch: ['.agent-scratch'],
      memory: 'docs/memory',
    },
  };
}

export function writeDescriptor(root, descriptor, { overwrite = false } = {}) {
  const file = path.join(root, DESCRIPTOR_NAME);
  if (!overwrite && fs.existsSync(file)) throw new UserError(`${DESCRIPTOR_NAME} already exists`, 'descriptor_exists');
  const validated = validateDescriptor(descriptor, root);
  writeJsonAtomic(file, validated);
  return file;
}

import {
  PORTABLE_FACETS,
  PORTABLE_OVERLAYS,
  UserError,
  resolveInside,
} from './core.mjs';

const PROJECT_ID = /^[a-z0-9][a-z0-9._-]{2,127}$/;
const RELEASE = /^[A-Za-z0-9._-]+$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const EFFECT = /^[a-z][a-z0-9-]*$/;
const ROLE = /^(development|production)\/[a-z0-9-]+$/;
const PORTABLE_ROLES = new Set([
  'development/developer', 'development/maintainer', 'development/reviewer', 'development/verifier',
  'development/field-evaluator', 'production/user', 'production/operator',
]);
const HOST_EXPOSURE = new Set(['observed-full', 'unknown']);
const LIFECYCLE_ROLES = new Map([
  ['active-development', ['development/developer', 'development/maintainer', 'development/reviewer', 'development/verifier']],
  ['maintenance', ['development/maintainer', 'development/reviewer', 'development/verifier']],
  ['operations-only', ['production/user', 'production/operator']],
  ['frozen-reference', ['production/user']],
  ['release-build', ['development/developer', 'development/maintainer', 'development/reviewer', 'development/verifier']],
]);
const VARIANTS = new Map([
  ['selected-inline.none', {
    placement: 'selected-local',
    strategy: 'inline-route',
    executable: 'none',
    freshWorkspace: 'physical-selected',
    hostExposure: 'unknown',
  }],
  ['shared-runtime.pinned', {
    placement: 'shared-packed',
    strategy: 'cli-context',
    executable: 'shared-cli',
    freshWorkspace: 'no-generic-corpus',
    hostExposure: 'observed-full',
  }],
]);
const TOP_KEYS = new Set([
  'schema_version', 'project_id', 'variant', 'release', 'documents', 'router', 'context',
  'containment', 'integrity', 'migration', 'protected_effects', 'policy', 'layout',
]);

function object(value, field) {
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new UserError(`${field} must be an object`, 'invalid_descriptor');
  return value;
}

function exactKeys(value, allowed, field) {
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new UserError(`${field} contains unsupported field: ${key}`, 'invalid_descriptor');
}

function uniqueStrings(value, field, { allowEmpty = true } = {}) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item)) {
    throw new UserError(`${field} must be an array of non-empty strings`, 'invalid_descriptor');
  }
  if (!allowEmpty && value.length === 0) throw new UserError(`${field} must not be empty`, 'invalid_descriptor');
  if (new Set(value).size !== value.length) throw new UserError(`${field} contains duplicates`, 'invalid_descriptor');
  return value;
}

function exactObject(value, field, keys) {
  const result = object(value, field);
  exactKeys(result, new Set(keys), field);
  for (const key of keys) if (!(key in result)) throw new UserError(`${field}.${key} is required`, 'invalid_descriptor');
  return result;
}

export function variantContract(variant) {
  const contract = VARIANTS.get(variant);
  if (!contract) throw new UserError(`unsupported 3.0 variant: ${variant}`, 'invalid_descriptor');
  return contract;
}

export function lifecycleRequiredRoles(lifecycle) {
  const roles = LIFECYCLE_ROLES.get(lifecycle);
  if (!roles) throw new UserError(`unsupported lifecycle: ${lifecycle}`, 'invalid_descriptor');
  return [...roles];
}

function lifecycleDefaultRoles(lifecycle, variant) {
  const roles = lifecycleRequiredRoles(lifecycle);
  if (variant === 'shared-runtime.pinned' && ['active-development', 'release-build'].includes(lifecycle)) roles.push('production/user', 'production/operator');
  return roles;
}

export function validateV3Descriptor(value, root) {
  object(value, 'descriptor');
  exactKeys(value, TOP_KEYS, 'descriptor');
  if (value.schema_version !== 2) throw new UserError('3.0 descriptor.schema_version must be 2', 'unsupported_schema');
  if (typeof value.project_id !== 'string' || !PROJECT_ID.test(value.project_id)) throw new UserError('descriptor.project_id must be a stable lowercase identifier', 'invalid_descriptor');
  const variant = variantContract(value.variant);

  const release = object(value.release, 'descriptor.release');
  exactKeys(release, new Set(['policy', 'version', 'digest', 'runtime_digest']), 'descriptor.release');
  for (const key of ['policy', 'version', 'digest']) if (!(key in release)) throw new UserError(`descriptor.release.${key} is required`, 'invalid_descriptor');
  if (release.policy !== 'pinned') throw new UserError('3.0 minimal slice requires release.policy=pinned', 'invalid_descriptor');
  if (typeof release.version !== 'string' || !RELEASE.test(release.version)) throw new UserError('descriptor.release.version is invalid', 'invalid_descriptor');
  if (typeof release.digest !== 'string' || !DIGEST.test(release.digest)) throw new UserError('descriptor.release.digest must be exact sha256', 'invalid_descriptor');
  if (value.variant === 'shared-runtime.pinned') {
    if (typeof release.runtime_digest !== 'string' || !DIGEST.test(release.runtime_digest)) throw new UserError('shared-runtime.pinned requires release.runtime_digest', 'invalid_descriptor');
  } else if ('runtime_digest' in release) throw new UserError('release.runtime_digest is valid only for shared-runtime.pinned', 'invalid_descriptor');

  const documents = exactObject(value.documents, 'descriptor.documents', ['placement', 'lifecycle', 'roles', 'profiles', 'overlays']);
  if (documents.placement !== variant.placement) throw new UserError(`variant ${value.variant} requires documents.placement=${variant.placement}`, 'invalid_descriptor');
  const requiredRoles = lifecycleRequiredRoles(documents.lifecycle);
  const roles = uniqueStrings(documents.roles, 'descriptor.documents.roles', { allowEmpty: false });
  for (const role of roles) {
    if (!ROLE.test(role) || !PORTABLE_ROLES.has(role)) throw new UserError(`invalid or unknown selected role: ${role}`, 'invalid_descriptor');
  }
  for (const required of requiredRoles) if (!roles.includes(required)) throw new UserError(`lifecycle ${documents.lifecycle} requires role ${required}`, 'invalid_descriptor');
  const profiles = uniqueStrings(documents.profiles, 'descriptor.documents.profiles');
  for (const profile of profiles) if (!PORTABLE_FACETS.has(profile)) throw new UserError(`unknown selected profile: ${profile}`, 'invalid_descriptor');
  const overlays = uniqueStrings(documents.overlays, 'descriptor.documents.overlays');
  for (const overlay of overlays) if (!PORTABLE_OVERLAYS.has(overlay)) throw new UserError(`unknown selected overlay: ${overlay}`, 'invalid_descriptor');

  const router = exactObject(value.router, 'descriptor.router', ['strategy', 'executable']);
  if (router.strategy !== variant.strategy || router.executable !== variant.executable) {
    throw new UserError(`variant ${value.variant} requires router ${variant.strategy}/${variant.executable}`, 'invalid_descriptor');
  }

  const context = exactObject(value.context, 'descriptor.context', ['max_tokens', 'clarification_max_tokens']);
  if (!Number.isSafeInteger(context.max_tokens) || context.max_tokens < 256 || context.max_tokens > 4096) throw new UserError('descriptor.context.max_tokens must be 256..4096', 'invalid_descriptor');
  if (!Number.isSafeInteger(context.clarification_max_tokens) || context.clarification_max_tokens < 32 || context.clarification_max_tokens > 2048) throw new UserError('descriptor.context.clarification_max_tokens must be 32..2048', 'invalid_descriptor');

  const containment = exactObject(value.containment, 'descriptor.containment', ['workspace', 'host_corpus_exposure']);
  if (!HOST_EXPOSURE.has(containment.host_corpus_exposure) || containment.host_corpus_exposure !== variant.hostExposure) {
    throw new UserError(`variant ${value.variant} requires host corpus exposure ${variant.hostExposure}`, 'invalid_descriptor');
  }
  const transitional = containment.workspace === 'transitional';
  if (!transitional && containment.workspace !== variant.freshWorkspace) {
    throw new UserError(`variant ${value.variant} requires workspace containment ${variant.freshWorkspace}`, 'invalid_descriptor');
  }
  if (transitional) {
    const migration = exactObject(value.migration, 'descriptor.migration', ['state', 'from_schema_version', 'legacy_provider', 'recovery_digest']);
    if (migration.state !== 'reversible-transition' || migration.from_schema_version !== 1) throw new UserError('descriptor.migration transition is invalid', 'invalid_descriptor');
    if (!['thin-bootstrap', 'embedded-local', 'source-worktree'].includes(migration.legacy_provider)) throw new UserError('descriptor.migration.legacy_provider is invalid', 'invalid_descriptor');
    if (!DIGEST.test(migration.recovery_digest)) throw new UserError('descriptor.migration.recovery_digest must be exact sha256', 'invalid_descriptor');
  } else if (value.migration !== undefined) {
    throw new UserError('descriptor.migration requires transitional containment', 'invalid_descriptor');
  }

  const integrity = exactObject(value.integrity, 'descriptor.integrity', ['manifest_digest', 'root_block_hash']);
  for (const [key, digestValue] of Object.entries(integrity)) if (!DIGEST.test(digestValue)) throw new UserError(`descriptor.integrity.${key} must be exact sha256`, 'invalid_descriptor');

  const effects = uniqueStrings(value.protected_effects, 'descriptor.protected_effects');
  for (const effect of effects) if (!EFFECT.test(effect)) throw new UserError(`invalid protected effect: ${effect}`, 'invalid_descriptor');

  const policy = exactObject(value.policy, 'descriptor.policy', ['root', 'mandatory']);
  if (!['AGENTS.md', 'CLAUDE.md'].includes(policy.root)) throw new UserError('policy.root must be AGENTS.md or CLAUDE.md', 'invalid_descriptor');
  uniqueStrings(policy.mandatory, 'descriptor.policy.mandatory');

  const layout = exactObject(value.layout, 'descriptor.layout', ['guides', 'scratch', 'memory']);
  if (layout.guides !== '.agent-guides') throw new UserError('descriptor.layout.guides must be .agent-guides', 'invalid_descriptor');
  const scratch = uniqueStrings(layout.scratch, 'descriptor.layout.scratch', { allowEmpty: false });
  for (const [index, binding] of scratch.entries()) resolveInside(root, binding, `layout.scratch[${index}]`);
  resolveInside(root, layout.memory, 'layout.memory');
  resolveInside(root, layout.guides, 'layout.guides');

  return value;
}

export function defaultV3Descriptor({
  projectId,
  variant,
  version,
  digest,
  runtimeDigest = undefined,
  integrity = { manifest_digest: `sha256:${'0'.repeat(64)}`, root_block_hash: `sha256:${'0'.repeat(64)}` },
  lifecycle = 'active-development',
  roles = undefined,
  profiles = [],
  overlays = [],
  mandatory = [],
  protectedEffects = [],
  rootName = 'AGENTS.md',
  workspace = undefined,
  migration = undefined,
}) {
  const contract = variantContract(variant);
  return {
    schema_version: 2,
    project_id: projectId,
    variant,
    release: { policy: 'pinned', version, digest, ...(runtimeDigest ? { runtime_digest: runtimeDigest } : {}) },
    documents: {
      placement: contract.placement,
      lifecycle,
      roles: roles || lifecycleDefaultRoles(lifecycle, variant),
      profiles,
      overlays,
    },
    router: { strategy: contract.strategy, executable: contract.executable },
    context: { max_tokens: 4096, clarification_max_tokens: 2048 },
    containment: {
      workspace: workspace || contract.freshWorkspace,
      host_corpus_exposure: contract.hostExposure,
    },
    integrity,
    ...(migration ? { migration } : {}),
    protected_effects: protectedEffects,
    policy: { root: rootName, mandatory },
    layout: { guides: '.agent-guides', scratch: ['.agent-scratch'], memory: 'docs/memory' },
  };
}

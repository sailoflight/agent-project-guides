import fs from 'node:fs';
import path from 'node:path';
import { UserError, buildFileManifest, canonicalJson, sha256 } from './core.mjs';
import { readDescriptor } from './descriptor.mjs';
import { defaultV3Descriptor, validateV3Descriptor } from './descriptor-v3.mjs';
import { buildSelectedClosure } from './closure.mjs';
import { buildGuideFiles } from './materializer.mjs';
import { buildPackedRuntimeArtifact, observeSourceState } from './provider.mjs';
import { previewV3Root, renderCliBlock, renderInlineBlock } from './bootstrap-v3.mjs';

function snapshot(file) {
  const stat = fs.lstatSync(file, { throwIfNoEntry: false });
  if (!stat) return { exists: false, hash: 'missing', bytes: 0, base64: '', mode: null };
  const bytes = fs.readFileSync(file);
  return { exists: true, hash: `sha256:${sha256(bytes)}`, bytes: bytes.length, base64: bytes.toString('base64'), mode: stat.mode & 0o777 };
}

export function previewV2ToV3Migration(projectRoot, sourceRoot, options) {
  const { descriptor: legacy } = readDescriptor(projectRoot);
  if (legacy.schema_version !== 1) throw new UserError('v3 migration preview requires a schema 1 descriptor', 'wrong_lifecycle');
  const sourceManifest = buildFileManifest(sourceRoot);
  const blockers = [];
  if (legacy.provider.mode === 'source-worktree') blockers.push({
    code: 'source-worktree-full-corpus',
    message: 'A self-host workspace containing the full APG source corpus cannot claim either first-slice containment mode; materialize a separate consumer copy.',
  });
  if (blockers.length) return {
    dry_run: true,
    applicable: false,
    from: { schema_version: 1, provider: legacy.provider },
    target_variant: options.variant,
    blockers,
    writes_project: false,
    stages_or_commits: false,
  };

  const migration = { state: 'reversible-transition', from_schema_version: 1, legacy_provider: legacy.provider.mode };
  const packedArtifact = options.variant === 'shared-runtime.pinned' ? buildPackedRuntimeArtifact(sourceRoot) : undefined;
  const proposed = defaultV3Descriptor({
    projectId: legacy.project_id,
    variant: options.variant,
    version: sourceManifest.package_version,
    digest: sourceManifest.digest,
    runtimeDigest: packedArtifact?.manifest.digest,
    lifecycle: options.lifecycle || 'active-development',
    roles: options.roles,
    profiles: options.profiles || legacy.facets,
    overlays: options.overlays || legacy.overlays || [],
    mandatory: legacy.policy.mandatory,
    protectedEffects: legacy.protected_effects,
    rootName: legacy.policy.root,
    workspace: 'transitional',
    migration,
  });
  proposed.layout.scratch = legacy.layout.scratch;
  proposed.layout.memory = legacy.layout.memory;
  validateV3Descriptor(proposed, projectRoot);
  const closure = buildSelectedClosure(sourceRoot, proposed, { includeContent: true });
  const { manifest } = buildGuideFiles(proposed, closure, observeSourceState(sourceRoot));
  proposed.integrity.manifest_digest = manifest.manifest_digest;
  const rootBefore = snapshot(path.join(projectRoot, legacy.policy.root));
  const finalBlock = proposed.variant === 'selected-inline.none' ? renderInlineBlock(proposed, closure) : renderCliBlock(proposed);
  proposed.integrity.root_block_hash = `sha256:${sha256(finalBlock)}`;
  validateV3Descriptor(proposed, projectRoot);
  const rootPreview = previewV3Root(projectRoot, proposed, finalBlock, { before: rootBefore, allowV2: true });
  const descriptorBefore = snapshot(path.join(projectRoot, '.agent-project-guides.json'));
  const descriptorAfter = Buffer.from(canonicalJson(proposed));
  const retainedExposure = [
    `${legacy.policy.root} v2 preimage`,
    `${path.basename('.agent-project-guides.json')} schema 1 preimage`,
    ...(legacy.provider.mode === 'embedded-local' ? [`.agent-project-guides/local/releases/${legacy.provider.digest.replace(':', '-')}`] : []),
  ];
  const plan = {
    schema_version: 1,
    operation: 'dry-run-migrate-2.0-to-3.0',
    project_id: legacy.project_id,
    from: { schema_version: 1, provider: legacy.provider },
    to: { schema_version: 2, variant: proposed.variant, release: proposed.release },
    proposed_descriptor: proposed,
    selected_closure: {
      modules: closure.modules,
      files: closure.files.map(({ content, ...file }) => file),
      excluded_optional_modules: closure.excluded_optional_modules,
    },
    preimages: {
      descriptor: descriptorBefore,
      root: rootBefore,
      guides_exists: fs.existsSync(path.join(projectRoot, '.agent-guides')),
    },
    postimages: {
      descriptor_hash: `sha256:${sha256(descriptorAfter)}`,
      root_hash: rootPreview.after_hash,
      managed_document_count: proposed.variant === 'selected-inline.none' ? closure.files.length : 0,
    },
    effects: [
      'enter a reversible transition with workspace containment reported as transitional',
      'publish a schema 2 descriptor and v3 root router only after an explicit future apply',
      proposed.variant === 'selected-inline.none' ? 'publish only the selected local document closure' : 'bind the project to one exact shared packed runtime digest',
      'retain exact schema 1 descriptor/root/provider recovery until explicit finalization',
    ],
    retained_workspace_exposure: retainedExposure,
    rollback_boundary: 'before finalization, restore exact recorded descriptor/root/provider bytes; any changed preimage is a zero-write conflict',
    finalization_tradeoff: 'finalization must separately remove unchanged legacy generic recovery bytes before physical selected-local containment can be claimed; offline rollback may then require verified rehydration',
    writes_project: false,
    stages_or_commits: false,
  };
  return { dry_run: true, applicable: true, plan_digest: `sha256:${sha256(canonicalJson(plan))}`, ...plan };
}

import fs from 'node:fs';
import path from 'node:path';
import { UserError, V2_END, V2_START, V3_END, V3_START, sha256 } from './core.mjs';

const MAX_ROOT_BYTES = 16_384;
const MAX_INLINE_BLOCK_TOKENS = 1_000;

function markerRange(buffer, startText, endText) {
  const start = Buffer.from(startText);
  const end = Buffer.from(endText);
  const startAt = buffer.indexOf(start);
  const endAt = buffer.indexOf(end);
  if (startAt === -1 && endAt === -1) return undefined;
  if (startAt === -1 || endAt < startAt) throw new UserError(`unbalanced managed marker: ${startText}`, 'bootstrap_conflict');
  if (buffer.indexOf(start, startAt + start.length) !== -1 || buffer.indexOf(end, endAt + end.length) !== -1) throw new UserError(`duplicate managed marker: ${startText}`, 'bootstrap_conflict');
  let after = endAt + end.length;
  if (buffer[after] === 0x0d && buffer[after + 1] === 0x0a) after += 2;
  else if (buffer[after] === 0x0a) after += 1;
  return { startAt, after };
}

function validateRoot(file, bytes) {
  const stat = fs.lstatSync(file, { throwIfNoEntry: false });
  if (stat?.isSymbolicLink()) throw new UserError(`${path.basename(file)} is a symlink`, 'bootstrap_conflict');
  if (stat && !stat.isFile()) throw new UserError(`${path.basename(file)} is not a regular file`, 'bootstrap_conflict');
  if (!Buffer.from(bytes.toString('utf8')).equals(bytes)) throw new UserError(`${path.basename(file)} is not valid UTF-8`, 'bootstrap_conflict');
  if (bytes.length > MAX_ROOT_BYTES) throw new UserError(`${path.basename(file)} exceeds ${MAX_ROOT_BYTES} bytes`, 'bootstrap_too_large');
}

function unmanagedRoot(before, { allowV2 = false } = {}) {
  let result = before;
  const v3 = markerRange(result, V3_START, V3_END);
  if (v3) result = Buffer.concat([result.subarray(0, v3.startAt), result.subarray(v3.after)]);
  const v2 = markerRange(result, V2_START, V2_END);
  if (v2 && !allowV2) throw new UserError('existing v2 bootstrap requires migration preview/adoption', 'bootstrap_conflict');
  if (v2) result = Buffer.concat([result.subarray(0, v2.startAt), result.subarray(v2.after)]);
  return result;
}

function sectionLabel(closure, id) {
  const entry = closure.catalog.find((candidate) => candidate.id === id);
  if (!entry) throw new UserError(`inline route entry is absent from closure: ${id}`, 'closure_escape');
  const localPath = entry.installed_path || `managed/${entry.path}`;
  return `.agent-guides/${localPath}#${entry.section || 'document'}`;
}

export function renderInlineBlock(descriptor, closure) {
  const routeLines = closure.routes.map((route) => {
    const plans = [];
    const ownerModule = closure.modules.find((module) => module.subject === route.id);
    const procedureIds = (ownerModule?.dependencies || []).map((moduleId) => closure.modules.find((module) => module.id === moduleId)?.subject).filter(Boolean);
    if (route.default) plans.push(`default=${route.default.ids.map((id) => sectionLabel(closure, id)).join('+')}`);
    for (const [mode, plan] of Object.entries(route.by_mode || {})) {
      const ids = plan.ids.length ? plan.ids : procedureIds;
      plans.push(`${mode}=${ids.map((id) => sectionLabel(closure, id)).join('+')}`);
    }
    if ((route.full_modes || []).length) plans.push(`${route.full_modes.join('|')}=${sectionLabel(closure, route.id)}`);
    return `- ${route.id}: ${plans.join('; ')}`;
  });
  const mandatory = descriptor.policy.mandatory.length
    ? descriptor.policy.mandatory.map((id) => sectionLabel(closure, id)).join(', ')
    : 'none';
  const text = `${V3_START}\n## Project governance routing\n\nProject ID: \`${descriptor.project_id}\`; variant: \`${descriptor.variant}\`; pinned release: \`${descriptor.release.version}\` / \`${descriptor.release.digest}\`; manifest: \`${descriptor.integrity.manifest_digest}\`.\n\n1. Direct-read \`.agent-project-guides.json\`; project policy and runtime/tool effects remain authoritative.\n2. Select exactly one role and one supported mode for the task. If materially uncertain or protected work is implicated, ask for a compact choice; never union-load candidate roles, profiles, overlays, or generic safety documents.\n3. Read only the exact local sections listed below. Production roles do not load Development profiles or overlays. Do not retrieve missing content or fall back to \`latest\`.\n4. Mandatory authority is loaded first: ${mandatory}. Routing input is intended context only; never claim model-effective context.\n5. No APG executable is required for ordinary routing. Updates and selection expansion are separate reviewed materialization operations.\n\n${routeLines.join('\n')}\n${V3_END}\n`;
  const tokens = Math.ceil(Buffer.byteLength(text) / 4);
  if (tokens > MAX_INLINE_BLOCK_TOKENS) throw new UserError(`inline bootstrap exceeds ${MAX_INLINE_BLOCK_TOKENS} tokens`, 'bootstrap_too_large');
  return Buffer.from(text);
}

export function renderCliBlock(descriptor) {
  return Buffer.from(`${V3_START}\n## Project governance routing\n\nProject ID: \`${descriptor.project_id}\`; variant: \`${descriptor.variant}\`; pinned release: \`${descriptor.release.version}\` / \`${descriptor.release.digest}\`; manifest: \`${descriptor.integrity.manifest_digest}\`.\n\nBefore work, run \`apg context --target . --task <current-task> --format context\` and use only the returned governance content. Resolve any ambiguity before protected work. The shared CLI and exact packed digest are runtime dependencies; missing content fails explicitly and never falls back to \`latest\`. Returned sources are intended context and do not prove model-effective context.\n${V3_END}\n`);
}

export function renderTransitionBlock(descriptor) {
  return Buffer.from(`${V3_START}\n## Project governance transition blocked\n\nAPG materialization for \`${descriptor.project_id}\` is incomplete. Protected, production, migration, release, credential, private-data, destructive, cost, physical, and safety work must stop. Resume the journaled materialization; automatic materializer rollback is not part of this slice.\n${V3_END}\n`);
}

export function previewV3Root(projectRoot, descriptor, block, { before = undefined, allowV2 = false } = {}) {
  const file = path.join(projectRoot, descriptor.policy.root);
  const exists = before ? before.exists : fs.existsSync(file);
  const bytes = before ? Buffer.from(before.base64, 'base64') : exists ? fs.readFileSync(file) : Buffer.alloc(0);
  validateRoot(file, bytes);
  const unmanaged = unmanagedRoot(bytes, { allowV2 });
  const after = Buffer.concat([block, unmanaged]);
  validateRoot(file, after);
  return {
    file,
    after,
    before: {
      exists,
      hash: exists ? `sha256:${sha256(bytes)}` : 'missing',
      base64: bytes.toString('base64'),
      mode: exists ? fs.statSync(file).mode & 0o777 : null,
    },
    after_hash: `sha256:${sha256(after)}`,
  };
}

export function inspectV3Root(projectRoot, descriptor, expectedState = 'ready') {
  const file = path.join(projectRoot, descriptor.policy.root);
  if (!fs.statSync(file, { throwIfNoEntry: false })?.isFile()) throw new UserError(`missing policy root: ${descriptor.policy.root}`, 'bootstrap_missing');
  const bytes = fs.readFileSync(file);
  validateRoot(file, bytes);
  const range = markerRange(bytes, V3_START, V3_END);
  if (!range || range.startAt !== 0) throw new UserError('v3 bootstrap must begin at byte 0', 'bootstrap_invalid');
  const blockBytes = bytes.subarray(range.startAt, range.after);
  const block = blockBytes.toString('utf8');
  if (!block.includes(descriptor.project_id) || !block.includes(descriptor.variant) || !block.includes(descriptor.release.digest) || !block.includes(descriptor.integrity.manifest_digest)) throw new UserError('v3 bootstrap does not match descriptor', 'bootstrap_mismatch');
  const blocked = block.includes('transition blocked');
  const managedBlockHash = `sha256:${sha256(blockBytes)}`;
  if (expectedState === 'ready' && blocked) throw new UserError('v3 materialization is transition-blocked', 'transition_blocked');
  if (expectedState === 'ready' && managedBlockHash !== descriptor.integrity.root_block_hash) throw new UserError('v3 managed root block hash differs from descriptor', 'bootstrap_mismatch');
  return { root: descriptor.policy.root, hash: `sha256:${sha256(bytes)}`, managed_block_hash: managedBlockHash, bytes: bytes.length, state: blocked ? 'transition-blocked' : 'ready' };
}

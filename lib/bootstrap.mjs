import fs from 'node:fs';
import path from 'node:path';
import {
  UserError,
  V1_MARKERS,
  V2_END,
  V2_START,
  sha256,
} from './core.mjs';
import { INTEGRITY_PREFIX, stampBlock, verifyBlock } from './block-integrity.mjs';

/// Governance content of a block, ignoring the integrity line and any trailing
/// blank lines, so a legacy install and a freshly stamped one compare equal on
/// everything that actually governs behaviour.
function governanceLines(text) {
  const lines = text.split('\n').filter((line) => !line.startsWith(INTEGRITY_PREFIX));
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  return JSON.stringify(lines);
}

const MAX_ROOT_BYTES = 16_384;

function markerRange(buffer, startText, endText, required = false) {
  const start = Buffer.from(startText);
  const end = Buffer.from(endText);
  const startAt = buffer.indexOf(start);
  const firstEndAt = buffer.indexOf(end);
  if (startAt === -1) {
    if (firstEndAt !== -1) throw new UserError(`orphan end marker: ${endText}`, 'bootstrap_conflict');
    if (required) throw new UserError(`missing marker: ${startText}`, 'bootstrap_missing');
    return undefined;
  }
  if (buffer.indexOf(start, startAt + start.length) !== -1) throw new UserError(`duplicate marker: ${startText}`, 'bootstrap_conflict');
  if (firstEndAt === -1 || firstEndAt < startAt) throw new UserError(`unbalanced or misordered marker: ${startText}`, 'bootstrap_conflict');
  const endAt = firstEndAt;
  if (buffer.indexOf(end, endAt + end.length) !== -1) throw new UserError(`duplicate marker: ${endText}`, 'bootstrap_conflict');
  let after = endAt + end.length;
  if (buffer[after] === 0x0d && buffer[after + 1] === 0x0a) after += 2;
  else if (buffer[after] === 0x0a) after += 1;
  return { startAt, after };
}

export function stripManaged(buffer, { includeV1 = false, includeV2 = true } = {}) {
  let result = buffer;
  const pairs = [
    ...(includeV2 ? [[V2_START, V2_END]] : []),
    ...(includeV1 ? V1_MARKERS : []),
  ];
  for (const [start, end] of pairs) {
    const range = markerRange(result, start, end);
    if (range) result = Buffer.concat([result.subarray(0, range.startAt), result.subarray(range.after)]);
  }
  return result;
}

export function renderBootstrap(packageRoot, descriptor) {
  const template = fs.readFileSync(path.join(packageRoot, 'bootstrap', 'AGENTS.v2-block.md'), 'utf8');
  const rendered = template
    .replaceAll('{{PROJECT_ID}}', descriptor.project_id)
    .replaceAll('{{PACKAGE_RELEASE}}', descriptor.provider.release)
    .replaceAll('{{PACKAGE_DIGEST}}', descriptor.provider.digest);
  if (rendered.includes('{{')) throw new UserError('v2 bootstrap has unresolved placeholders', 'bootstrap_invalid');
  // decisions/0006 P9, extended to the v2 block. The body hash is recorded inside
  // the block itself, because inspectBootstrap has no package root available and
  // because a self-recorded hash is version-independent: comparing against a
  // freshly rendered template would false-fail whenever the installed release and
  // the running CLI differ.
  const stamped = stampBlock(rendered, V2_START, V2_END);
  if (stamped === rendered) throw new UserError('v2 bootstrap template has no usable markers', 'bootstrap_invalid');
  return Buffer.from(stamped);
}

function validateRootFile(file, bytes) {
  const stat = fs.lstatSync(file, { throwIfNoEntry: false });
  if (stat?.isSymbolicLink()) throw new UserError(`${path.basename(file)} is a symlink`, 'bootstrap_conflict');
  if (stat && !stat.isFile()) throw new UserError(`${path.basename(file)} is not a regular file`, 'bootstrap_conflict');
  if (!Buffer.from(bytes.toString('utf8')).equals(bytes)) throw new UserError(`${path.basename(file)} is not valid UTF-8`, 'bootstrap_conflict');
  if (bytes.length > MAX_ROOT_BYTES) throw new UserError(`${path.basename(file)} exceeds ${MAX_ROOT_BYTES} bytes`, 'bootstrap_too_large');
}

export function previewBootstrap(projectRoot, packageRoot, descriptor, { includeV1 = false, beforeSnapshot = null } = {}) {
  const rootFile = path.join(projectRoot, descriptor.policy.root);
  const beforeExists = beforeSnapshot ? beforeSnapshot.exists : fs.existsSync(rootFile);
  const before = beforeSnapshot ? Buffer.from(beforeSnapshot.base64, 'base64') : beforeExists ? fs.readFileSync(rootFile) : Buffer.alloc(0);
  validateRootFile(rootFile, before);
  const unmanaged = stripManaged(before, { includeV1, includeV2: true });
  const block = renderBootstrap(packageRoot, descriptor);
  const after = Buffer.concat([block, unmanaged]);
  validateRootFile(rootFile, after);
  return {
    rootFile,
    after,
    ownership: {
      root: descriptor.policy.root,
      before_exists: beforeExists,
      before_base64: before.toString('base64'),
      before_hash: `sha256:${sha256(before)}`,
      before_mode: beforeSnapshot ? beforeSnapshot.mode : beforeExists ? fs.statSync(rootFile).mode & 0o777 : null,
      after_hash: `sha256:${sha256(after)}`,
      after_bytes: after.length,
    },
  };
}

export function installBootstrap(projectRoot, packageRoot, descriptor, options = {}) {
  const preview = previewBootstrap(projectRoot, packageRoot, descriptor, options);
  fs.mkdirSync(path.dirname(preview.rootFile), { recursive: true });
  const temporary = `${preview.rootFile}.apg-${process.pid}`;
  fs.writeFileSync(temporary, preview.after, { mode: preview.ownership.before_mode ?? 0o644 });
  fs.renameSync(temporary, preview.rootFile);
  return preview.ownership;
}

export function inspectBootstrap(projectRoot, descriptor, { expectedBlock = null } = {}) {
  const file = path.join(projectRoot, descriptor.policy.root);
  if (!fs.statSync(file, { throwIfNoEntry: false })?.isFile()) throw new UserError(`missing policy root: ${descriptor.policy.root}`, 'bootstrap_missing');
  const bytes = fs.readFileSync(file);
  validateRootFile(file, bytes);
  const range = markerRange(bytes, V2_START, V2_END, true);
  if (range.startAt !== 0) throw new UserError('v2 bootstrap must begin at byte 0', 'bootstrap_invalid');
  const text = bytes.subarray(range.startAt, range.after).toString('utf8');
  for (const value of [descriptor.project_id, descriptor.provider.release, descriptor.provider.digest]) {
    if (!text.includes(value)) throw new UserError(`v2 bootstrap does not match descriptor: ${value}`, 'bootstrap_mismatch');
  }
  // P9 extended to the v2 block. The three checks above all survive a rewrite of
  // everything else in the block, so compare the recorded body hash as well.
  // A block with no integrity line stays accepted as legacy, so pre-P9 installs
  // keep validating; that tolerance is a known downgrade path and is recorded as
  // a residual against finding.h1.bootstrap-token-only-validation.
  const verdict = verifyBlock(text, V2_START, V2_END);
  if (verdict.state === 'malformed') {
    throw new UserError(`v2 bootstrap has a malformed integrity line: ${verdict.line}`, 'bootstrap_invalid');
  }
  if (verdict.state === 'mismatch') {
    throw new UserError(
      `v2 bootstrap integrity mismatch: recorded ${verdict.recorded}, computed ${verdict.actual}`,
      'bootstrap_mismatch',
    );
  }
  return {
    root: descriptor.policy.root,
    hash: `sha256:${sha256(bytes)}`,
    bytes: bytes.length,
    integrity: verdict.state === 'valid' ? 'valid' : 'legacy',
    // Advisory only. A consumer pinned to an older release legitimately differs
    // from a newer running CLI, so a stale block is reported rather than failed;
    // the repository's own gates assert it instead. This is the check that a
    // token-only inspection could never make.
    ...(expectedBlock ? { template_match: governanceLines(text) === governanceLines(expectedBlock.toString('utf8')) } : {}),
  };
}

export function restoreOwnedFile(projectRoot, ownership) {
  const file = path.join(projectRoot, ownership.root);
  const currentExists = fs.existsSync(file);
  const current = currentExists ? fs.readFileSync(file) : Buffer.alloc(0);
  const currentHash = currentExists ? `sha256:${sha256(current)}` : 'missing';
  if (!currentExists && !ownership.before_exists) return { status: 'already_restored', path: ownership.root };
  if (currentExists && currentHash === ownership.before_hash) return { status: 'already_restored', path: ownership.root };
  if (!currentExists || currentHash !== ownership.after_hash) {
    return { status: 'conflict', path: ownership.root, expected_postimage: ownership.after_hash, actual: currentExists ? currentHash : 'missing' };
  }
  if (!ownership.before_exists) {
    fs.rmSync(file);
  } else {
    const before = Buffer.from(ownership.before_base64, 'base64');
    const temporary = `${file}.apg-restore-${process.pid}`;
    fs.writeFileSync(temporary, before, { mode: ownership.before_mode ?? 0o644 });
    fs.renameSync(temporary, file);
  }
  return { status: 'restored', path: ownership.root };
}

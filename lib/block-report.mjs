import fs from 'node:fs';
import path from 'node:path';
import { INTEGRITY_PREFIX, verifyBlock } from './block-integrity.mjs';
import { UserError, V2_END, V2_START, V3_END, V3_START, sha256 } from './core.mjs';
import { readDescriptor } from './descriptor.mjs';
import { lineForRelease, readReleaseLines } from './release-lines.mjs';

// A read-only answer to one question another project asks before it trusts this
// repository's root instruction block: is the block there, does it still agree with
// the descriptor's pinned release, and which release is it claiming?
//
// This deliberately does not reuse inspectBootstrap/inspectV3Root. Those are write-path
// guards: they throw on the first disagreement, because a writer that cannot prove the
// block must not touch it. A caller on the outside wants every disagreement at once,
// with the field and the line, so this module reports instead of throwing. Same
// markers, same hash convention as the guards, so the two can never disagree about
// what "the block" is.
//
// Two write-path rules deliberately do not carry over:
//   * the 16 KiB root limit guards what APG may *write*; a bigger file is still
//     readable, and refusing to report on it would hide the answer;
//   * a second marker after the block is text, not a second block. A project that
//     quotes the marker in its own prose (measured: agent-infra) is warned, not
//     failed, because the block itself is unambiguous.
const SAFETY_MAX_BYTES = 1_048_576;

function markerRange(buffer, startText, endText) {
  const start = Buffer.from(startText);
  const end = Buffer.from(endText);
  const startAt = buffer.indexOf(start);
  const endAt = buffer.indexOf(end);
  if (startAt === -1 && endAt === -1) return undefined;
  if (startAt === -1 || endAt < startAt) return { malformed: 'unbalanced' };
  let after = endAt + end.length;
  if (buffer[after] === 0x0d && buffer[after + 1] === 0x0a) after += 2;
  else if (buffer[after] === 0x0a) after += 1;
  let extra = 0;
  let extraAt;
  let cursor = after;
  for (;;) {
    const next = buffer.indexOf(start, cursor);
    if (next === -1) break;
    extra += 1;
    if (extraAt === undefined) extraAt = next;
    cursor = next + start.length;
  }
  cursor = after;
  for (;;) {
    const next = buffer.indexOf(end, cursor);
    if (next === -1) break;
    extra += 1;
    if (extraAt === undefined) extraAt = next;
    cursor = next + end.length;
  }
  return { startAt, after, extra, extraAt };
}

function lineAt(buffer, offset) {
  let line = 1;
  for (let index = 0; index < offset && index < buffer.length; index += 1) if (buffer[index] === 0x0a) line += 1;
  return line;
}

function capture(expression, text) {
  const match = expression.exec(text);
  return match ? { value: match[1], index: match.index + match[0].indexOf(match[1]) } : {};
}

function observedFromBlock(schema, text) {
  if (schema === 'v3') {
    const project = capture(/Project ID: `([^`]+)`/, text);
    const pinned = /pinned release: `([^`]+)` \/ `(sha256:[0-9a-f]{64})`/.exec(text);
    const manifest = capture(/manifest: `(sha256:[0-9a-f]{64})`/, text);
    return {
      project_id: project.value,
      release: pinned ? pinned[1] : undefined,
      digest: pinned ? pinned[2] : undefined,
      manifest_digest: manifest.value,
      positions: { project_id: project.index, release: pinned ? pinned.index : undefined, manifest_digest: manifest.index },
    };
  }
  const project = capture(/Project ID: `([^`]+)`/, text);
  const release = capture(/release: `([^`]+)`/, text);
  const digest = capture(/expected digest: `([^`]+)`/, text);
  return {
    project_id: project.value,
    release: release.value,
    digest: digest.value,
    manifest_digest: undefined,
    positions: { project_id: project.index, release: release.index, digest: digest.index },
  };
}

function declaredFromDescriptor(descriptor) {
  if (descriptor.schema_version === 2) {
    return {
      project_id: descriptor.project_id,
      release: descriptor.release.version,
      digest: descriptor.release.digest,
      manifest_digest: descriptor.integrity ? descriptor.integrity.manifest_digest : undefined,
      root_block_hash: descriptor.integrity ? descriptor.integrity.root_block_hash : undefined,
    };
  }
  return {
    project_id: descriptor.project_id,
    release: descriptor.provider.release,
    digest: descriptor.provider.digest,
    manifest_digest: undefined,
    root_block_hash: descriptor.integrity ? descriptor.integrity.root_block_hash : undefined,
  };
}

function emptyReport(rootName, status, reason) {
  return {
    root: rootName,
    present: false,
    marker: null,
    block: null,
    declared: null,
    observed: null,
    anchors: null,
    release_line: null,
    checks: [],
    warnings: [],
    mismatches: [],
    status,
    reason,
  };
}

export function inspectRootBlock(projectRoot, { baseDir = undefined } = {}) {
  let descriptor;
  try {
    ({ descriptor } = readDescriptor(projectRoot));
  } catch (error) {
    if (error instanceof UserError) return emptyReport('AGENTS.md', 'unmanaged', `no APG descriptor: ${error.code}`);
    throw error;
  }
  const rootName = descriptor.policy.root;
  const file = path.join(projectRoot, rootName);
  const stat = fs.lstatSync(file, { throwIfNoEntry: false });
  if (!stat) return emptyReport(rootName, 'missing', 'the declared root instruction file does not exist');
  if (stat.isSymbolicLink()) return emptyReport(rootName, 'malformed', 'the root instruction file is a symlink');
  if (!stat.isFile()) return emptyReport(rootName, 'malformed', 'the root instruction file is not a regular file');

  const bytes = fs.readFileSync(file);
  if (!Buffer.from(bytes.toString('utf8'), 'utf8').equals(bytes)) return { ...emptyReport(rootName, 'malformed', 'the root instruction file is not valid UTF-8'), present: true };
  if (bytes.length > SAFETY_MAX_BYTES) return { ...emptyReport(rootName, 'malformed', `the root instruction file exceeds the ${SAFETY_MAX_BYTES}-byte read limit`), present: true };

  const declared = declaredFromDescriptor(descriptor);
  const checks = [];
  const warnings = [];
  const mismatches = [];
  const record = (name, ok, expected, actual, extra = {}) => {
    checks.push({ name, ok });
    if (!ok) mismatches.push({ field: name, expected, actual, ...extra });
  };

  const v3 = markerRange(bytes, V3_START, V3_END);
  const v2 = markerRange(bytes, V2_START, V2_END);
  const candidates = [['v3', v3], ['v2', v2]].filter(([, range]) => range);
  if (candidates.length === 0) return { ...emptyReport(rootName, 'absent', 'the root instruction file carries no APG managed block'), present: true };
  if (candidates.length > 1) return { ...emptyReport(rootName, 'malformed', 'the root instruction file carries both a v2 and a v3 managed block'), present: true };
  const [marker, range] = candidates[0];
  if (range.malformed) return { ...emptyReport(rootName, 'malformed', `the ${marker} managed block is ${range.malformed}`), present: true };
  if (range.extra > 0) {
    warnings.push({
      code: 'extra_markers_after_block',
      detail: `${range.extra} further ${marker} marker(s) appear after the managed block; they are text, not a second block`,
      line: lineAt(bytes, range.extraAt),
    });
  }

  const blockBytes = bytes.subarray(range.startAt, range.after);
  const text = blockBytes.toString('utf8');
  const observed = observedFromBlock(marker, text);
  const computedBlockHash = `sha256:${sha256(blockBytes)}`;

  record('block_starts_at_byte_0', range.startAt === 0, 0, range.startAt);
  record('project_id_matches', observed.project_id === declared.project_id, declared.project_id, observed.project_id ?? null,
    observed.positions.project_id === undefined ? {} : { line: lineAt(bytes, range.startAt + observed.positions.project_id) });
  record('release_matches', observed.release === declared.release, declared.release, observed.release ?? null,
    observed.positions.release === undefined ? {} : { line: lineAt(bytes, range.startAt + observed.positions.release) });
  record('digest_matches', observed.digest === declared.digest, declared.digest, observed.digest ?? null,
    observed.positions.digest === undefined ? {} : { line: lineAt(bytes, range.startAt + observed.positions.digest) });
  if (marker === 'v3') {
    record('manifest_digest_matches', observed.manifest_digest === declared.manifest_digest, declared.manifest_digest, observed.manifest_digest ?? null,
      observed.positions.manifest_digest === undefined ? {} : { line: lineAt(bytes, range.startAt + observed.positions.manifest_digest) });
  }
  if (declared.root_block_hash !== undefined) {
    // The descriptor anchor is the check a hand edit cannot survive: the block's own
    // integrity line only protects the block until whoever edits it edits that line too.
    record('root_block_hash_matches', computedBlockHash === declared.root_block_hash, declared.root_block_hash, computedBlockHash);
  }
  let integrityLine;
  if (marker === 'v2') {
    const verdict = verifyBlock(text, V2_START, V2_END);
    integrityLine = verdict.state === 'valid' ? verdict.recorded : undefined;
    const integrityAt = blockBytes.indexOf(Buffer.from(INTEGRITY_PREFIX));
    record('integrity_line_valid', verdict.state === 'valid', 'an integrity line matching the block bytes', verdict.state,
      integrityAt === -1 ? {} : { line: lineAt(bytes, range.startAt + integrityAt) });
  }

  const lines = readReleaseLines(baseDir ?? projectRoot);
  return {
    root: rootName,
    present: true,
    marker,
    block: {
      start_byte: range.startAt,
      end_byte: range.after,
      bytes: blockBytes.length,
      sha256: computedBlockHash,
    },
    declared,
    observed: {
      project_id: observed.project_id ?? null,
      release: observed.release ?? null,
      digest: observed.digest ?? null,
      manifest_digest: observed.manifest_digest ?? null,
    },
    anchors: {
      descriptor_root_block_hash: declared.root_block_hash ?? null,
      computed_block_sha256: computedBlockHash,
      block_integrity_line: marker === 'v2' ? (integrityLine ?? null) : null,
    },
    release_line: lineForRelease(lines, observed.release),
    checks,
    warnings,
    mismatches,
    status: mismatches.length === 0 ? 'ready' : 'mismatch',
  };
}

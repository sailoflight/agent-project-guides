// Managed-block integrity: one implementation, shared by the block tooling
// (`scripts/manage-root-blocks.mjs`) and the schema-1 bootstrap path
// (`lib/bootstrap.mjs`), so the two can never drift apart on what a block's
// recorded hash means.
//
// Contract (decisions/0006 P9):
//
//   <start marker>                              <- stays line 0, text unchanged
//   <!-- agent-project-guides:integrity sha256=<hex> -->
//   ...body...
//   <end marker>
//
// <hex> is sha256 over the body lines that follow the integrity line, each
// terminated by a single "\n", up to but not including the end marker. The
// integrity line is therefore the block's second line, which keeps every
// existing byte-0 and exactly-once assertion holding.
//
// A block with no integrity line is legacy: `verifyBlock` reports `legacy`
// rather than failing, and `stampBlock` upgrades it on the next write. That
// tolerance is deliberate - it lets pre-P9 installs keep validating - but it is
// also a downgrade path: see the residual noted in
// docs/memory/finding.h1.bootstrap-token-only-validation.json.
//
// Line matching is exact against "\n"-split lines, which is what every APG
// writer produces. A CRLF-converted file does not parse as a block; callers
// that care must treat that as `legacy`, never as `valid`.

import { createHash } from 'node:crypto';

export const INTEGRITY_PREFIX = '<!-- agent-project-guides:integrity sha256=';
export const INTEGRITY_PATTERN = /^<!-- agent-project-guides:integrity sha256=([0-9a-f]{64}) -->$/;

/// Locate a block by its marker lines. Returns undefined when the start or end
/// marker line is absent: this never invents a managed region.
export function blockBounds(text, startText, endText) {
  const lines = text.split('\n');
  const start = lines.indexOf(startText);
  if (start === -1) return undefined;
  const end = lines.indexOf(endText, start + 1);
  if (end === -1) return undefined;
  return { lines, start, end };
}

export function bodyHash(lines, from, to) {
  const hash = createHash('sha256');
  for (let index = from; index < to; index += 1) hash.update(`${lines[index]}\n`);
  return hash.digest('hex');
}

export function integrityIndex(lines, start) {
  const candidate = lines[start + 1];
  return typeof candidate === 'string' && candidate.startsWith(INTEGRITY_PREFIX) ? start + 1 : -1;
}

export function integrityLine(lines, from, to) {
  return `${INTEGRITY_PREFIX}${bodyHash(lines, from, to)} -->`;
}

/// Insert or refresh the integrity line. A block that is absent or has no end
/// marker is returned unchanged.
export function stampBlock(text, startText, endText) {
  const bounds = blockBounds(text, startText, endText);
  if (!bounds) return text;
  const { lines, start, end } = bounds;
  const existing = integrityIndex(lines, start);
  const bodyFrom = existing === -1 ? start + 1 : existing + 1;
  const line = integrityLine(lines, bodyFrom, end);
  if (existing === -1) lines.splice(start + 1, 0, line);
  else lines[existing] = line;
  return lines.join('\n');
}

/// Verdicts: `no-block`, `legacy`, `malformed`, `valid`, `mismatch`.
export function verifyBlock(text, startText, endText) {
  const bounds = blockBounds(text, startText, endText);
  if (!bounds) return { state: 'no-block' };
  const { lines, start, end } = bounds;
  const existing = integrityIndex(lines, start);
  if (existing === -1) return { state: 'legacy' };
  const match = INTEGRITY_PATTERN.exec(lines[existing]);
  if (!match) return { state: 'malformed', line: lines[existing] };
  const actual = bodyHash(lines, existing + 1, end);
  return actual === match[1]
    ? { state: 'valid' }
    : { state: 'mismatch', recorded: match[1], actual };
}

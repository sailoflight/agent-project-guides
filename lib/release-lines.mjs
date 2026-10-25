import fs from 'node:fs';
import path from 'node:path';
import { UserError } from './core.mjs';

// Which release line a consumer is allowed to load, in a form a program can read.
// The question keeps coming back with prose attached ("4.x is not promoted yet"), and
// prose cannot be asserted by a consumer that has to decide before it installs. So the
// answer is one file at a fixed path with three words that each mean one thing:
//
//   default     the line a consumer should load when it has no stronger opinion
//   loadable    content from this line may be resolved and pinned by a consumer
//   promotable  this line may replace the global launcher / become the default
//
// `promotable: false` plus a non-empty `preconditions` is the whole "hold" state: it is
// not a warning, it is the reason a promotion cannot be performed by installing.
export const RELEASE_LINES_FILE = 'RELEASE_LINES.json';

const SEMVER = /^\d+\.\d+\.\d+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function text(value, label, { pattern = undefined, allowEmpty = false } = {}) {
  if (typeof value !== 'string' || (!allowEmpty && value.length === 0)) throw new UserError(`${label} must be a non-empty string`, 'invalid_release_lines');
  if (pattern && !pattern.test(value)) throw new UserError(`${label} is invalid: ${value}`, 'invalid_release_lines');
  return value;
}

export function validateReleaseLines(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new UserError('release lines must be an object', 'invalid_release_lines');
  const keys = Object.keys(value).sort().join(',');
  if (keys !== 'default,lines,schema_version,updated') throw new UserError(`release lines has unexpected keys: ${keys}`, 'invalid_release_lines');
  if (value.schema_version !== 1) throw new UserError('release lines schema_version must be 1', 'invalid_release_lines');
  text(value.updated, 'release lines updated', { pattern: DATE });
  if (!Array.isArray(value.lines) || value.lines.length === 0) throw new UserError('release lines needs at least one line', 'invalid_release_lines');
  const seen = new Set();
  for (const [index, line] of value.lines.entries()) {
    const label = `release lines[${index}]`;
    if (!line || typeof line !== 'object' || Array.isArray(line)) throw new UserError(`${label} must be an object`, 'invalid_release_lines');
    const lineKeys = Object.keys(line).sort().join(',');
    if (lineKeys !== 'id,loadable,maintainer,package_version,preconditions,promotable,ref,status') throw new UserError(`${label} has unexpected keys: ${lineKeys}`, 'invalid_release_lines');
    text(line.id, `${label}.id`);
    if (seen.has(line.id)) throw new UserError(`duplicate release line id: ${line.id}`, 'invalid_release_lines');
    seen.add(line.id);
    text(line.ref, `${label}.ref`);
    text(line.package_version, `${label}.package_version`, { pattern: SEMVER });
    text(line.maintainer, `${label}.maintainer`);
    text(line.status, `${label}.status`);
    if (typeof line.loadable !== 'boolean') throw new UserError(`${label}.loadable must be a boolean`, 'invalid_release_lines');
    if (typeof line.promotable !== 'boolean') throw new UserError(`${label}.promotable must be a boolean`, 'invalid_release_lines');
    if (line.promotable && !line.loadable) throw new UserError(`release line ${line.id} cannot be promotable without being loadable`, 'invalid_release_lines');
    if (!Array.isArray(line.preconditions)) throw new UserError(`${label}.preconditions must be an array`, 'invalid_release_lines');
    for (const [position, condition] of line.preconditions.entries()) text(condition, `${label}.preconditions[${position}]`);
    if (line.promotable && line.preconditions.length !== 0) throw new UserError(`release line ${line.id} is promotable but still lists preconditions`, 'invalid_release_lines');
    if (!line.promotable && line.preconditions.length === 0) throw new UserError(`release line ${line.id} is not promotable but gives no reason`, 'invalid_release_lines');
  }
  const byId = new Map(value.lines.map((line) => [line.id, line]));
  const chosen = byId.get(value.default);
  if (!chosen) throw new UserError(`release lines default points at an unknown line: ${value.default}`, 'invalid_release_lines');
  if (!chosen.loadable || !chosen.promotable) throw new UserError(`the default release line must be loadable and promotable: ${value.default}`, 'invalid_release_lines');
  const promotable = value.lines.filter((line) => line.promotable);
  if (promotable.length !== 1) throw new UserError(`exactly one release line may be promotable, found ${promotable.length}`, 'invalid_release_lines');
  const refs = new Set(value.lines.map((line) => line.ref));
  if (refs.size !== value.lines.length) throw new UserError('release line refs must be unique', 'invalid_release_lines');
  return value;
}

export function readReleaseLines(root) {
  const file = path.join(root, RELEASE_LINES_FILE);
  if (!fs.statSync(file, { throwIfNoEntry: false })?.isFile()) return undefined;
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
  try {
    return validateReleaseLines(parsed);
  } catch {
    return undefined;
  }
}

export function lineForRelease(releaseLines, version) {
  if (!releaseLines || typeof version !== 'string') return null;
  const line = releaseLines.lines.find((candidate) => candidate.package_version === version);
  if (!line) return null;
  return { id: line.id, ref: line.ref, status: line.status, loadable: line.loadable, promotable: line.promotable };
}

import fs from 'node:fs';
import path from 'node:path';
import {
  UserError,
  acquireProjectMutationLock,
  canonicalJson,
  projectStateDir,
  resolveInside,
  sha256,
} from './core.mjs';
import { looksApgMarker, looksForeignMarker } from './root-marker-grammar.mjs';

// P6 (decisions/0006). APG records which instruction blocks it *saw*, so that a
// whole-file rewrite can be attributed after the fact. The census found writers that
// replace the whole root file - `ntm`, `acfs`, `cass` - and when one of them runs,
// nothing left on disk says what used to be there.
//
// What this is: append-only observed state. For every marker line in the root file it
// records the literal text, the marker kind, a best-effort owner name, the version
// token the marker itself carried, the line and byte range, and an approximate token
// count.
//
// What this is not: authority. It never edits, upgrades, removes, or reorders a
// block, it never repairs one, and a block that is missing is never an error. A
// record is a statement about what APG saw, not about what the writer did.
//
// The name and the version are parsed *from the marker text* and are reported as what
// the text said. `am` writes no version token at all, so null is a legitimate value
// and means "this marker named no version" rather than "the version is unknown".

const COMMENT_LINE = /^<!--(.*?)-->$/;
// `\w` rather than an explicit class: `cass` delimits its region with a snake_case
// tag (`<project_rules>`), and a class without `_` silently drops it.
const TAG_LINE = /^<(\/?)([A-Za-z][\w.:-]*)(?:\s[^>]*)?>$/;
const VERSION_TOKEN = /(?:^|[^0-9A-Za-z])(v?\d+(?:\.\d+){0,3})(?![0-9A-Za-z])/;
const END_SHAPED = /(?:\bend\b|<<<|:end$)/i;
const INTEGRITY_LINE = /^<!--\s*agent-project-guides:integrity\s+sha256=([0-9a-f]{64})\s*-->$/;

export function ledgerPath(projectRoot, descriptor, env = process.env) {
  return path.join(projectStateDir(projectRoot, descriptor.project_id, env), 'observation-ledger.jsonl');
}

function parseMarker(text, openers) {
  if (!text) return undefined;
  const integrity = INTEGRITY_LINE.exec(text);
  if (integrity) {
    return {
      kind: 'comment', role: 'integrity', name: 'agent-project-guides',
      version: null, digest: integrity[1], text,
    };
  }
  const apg = looksApgMarker(text);
  const comment = COMMENT_LINE.exec(text);
  if (comment) {
    if (!apg && !looksForeignMarker(text)) return undefined;
    const body = comment[1].trim();
    // `ubs` writes `>>>`/`<<<` inside the comment, so the owner name starts after it.
    const leading = body.replace(/^(?:>>>|<<<)\s*/, '');
    const raw = /^([A-Za-z0-9_.-]+)/.exec(leading)?.[1];
    return {
      kind: 'comment',
      role: END_SHAPED.test(body) ? 'end' : 'start',
      name: raw ? raw.replace(/-agent-instructions-v\d+$/, '') : null,
      version: VERSION_TOKEN.exec(leading)?.[1] ?? null,
      digest: null,
      text,
    };
  }
  const tag = TAG_LINE.exec(text);
  if (tag) {
    const name = tag[2];
    const closing = Boolean(tag[1]);
    // A closing tag is recorded only as the closing half of an opener seen above it in
    // this file; on its own it is somebody's prose, not a block boundary. Testing the
    // opener *form* here instead would admit a stray `</project_rules>` that closed
    // nothing.
    if (closing ? !openers.has(name.toLowerCase()) : !looksForeignMarker(`<${name}>`)) return undefined;
    return { kind: 'tag', role: closing ? 'end' : 'start', name, version: VERSION_TOKEN.exec(text)?.[1] ?? null, digest: null, text };
  }
  return undefined;
}

export function scanRootMarkers(bytes) {
  const lines = bytes.toString('utf8').split('\n');
  const markers = [];
  const openers = new Set();
  let offset = 0;
  for (const [index, rawLine] of lines.entries()) {
    const content = rawLine.replace(/\r$/, '');
    const text = content.trim();
    const lead = content.length - content.replace(/^\s+/, '').length;
    const start = offset + Buffer.byteLength(content.slice(0, lead), 'utf8');
    const size = Buffer.byteLength(text, 'utf8');
    const parsed = parseMarker(text, openers);
    if (parsed) {
      markers.push({
        line: index + 1, byte_start: start, byte_end: start + size, bytes: size,
        token_estimate: Math.ceil(size / 4), ...parsed,
      });
      if (parsed.role === 'start' && parsed.name) openers.add(parsed.name.toLowerCase());
    }
    offset += Buffer.byteLength(rawLine, 'utf8') + 1;
  }
  return markers;
}

export function readLedger(projectRoot, descriptor, env = process.env) {
  const file = ledgerPath(projectRoot, descriptor, env);
  if (!fs.statSync(file, { throwIfNoEntry: false })?.isFile()) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => {
    try { return JSON.parse(line); } catch { throw new UserError('observation ledger contains an unreadable record', 'ledger_corrupt'); }
  });
}

// Attribution: the same marker identity (kind + owner + role) in two observations is
// the same block. A version change is reported as a change rather than as a
// disappearance, so a writer that bumps its marker version is not mistaken for a
// writer that removed its block.
export function compareObservations(previous, current) {
  const base = (marker) => `${marker.kind}|${marker.name ?? ''}|${marker.role}`;
  const group = (markers) => {
    const map = new Map();
    for (const marker of markers) {
      const key = base(marker);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(marker);
    }
    return map;
  };
  const before = group(previous?.markers ?? []);
  const after = group(current.markers ?? []);
  const appeared = [];
  const disappeared = [];
  const versionChanged = [];
  const moved = [];
  for (const [key, list] of after) {
    const priorList = before.get(key);
    if (!priorList) {
      for (const marker of list) appeared.push({ text: marker.text, line: marker.line });
      continue;
    }
    const priorVersions = priorList.map((marker) => marker.version ?? null).sort();
    const versions = list.map((marker) => marker.version ?? null).sort();
    if (priorVersions.join(',') !== versions.join(',')) {
      versionChanged.push({ name: list[0].name, role: list[0].role, from: priorVersions.join(',') || null, to: versions.join(',') || null });
    }
    const priorLines = priorList.map((marker) => marker.line).sort((a, b) => a - b);
    const lines = list.map((marker) => marker.line).sort((a, b) => a - b);
    if (priorVersions.join(',') === versions.join(',') && priorLines.join(',') !== lines.join(',')) {
      moved.push({ text: list[0].text, from_line: priorLines.join(','), to_line: lines.join(',') });
    }
  }
  for (const [key, list] of before) {
    if (!after.has(key)) for (const marker of list) disappeared.push({ text: marker.text, line: marker.line });
  }
  return { appeared, disappeared, version_changed: versionChanged, moved };
}

export function observeRootBlocks(projectRoot, descriptor, { root, env = process.env } = {}) {
  const relative = root || descriptor.policy.root;
  const file = resolveInside(projectRoot, relative, 'root instruction file');
  const stat = fs.statSync(file, { throwIfNoEntry: false });
  if (stat?.isSymbolicLink()) throw new UserError(`${relative} is a symlink`, 'ledger_conflict');
  if (stat && !stat.isFile()) throw new UserError(`${relative} is not a regular file`, 'ledger_conflict');
  const bytes = stat ? fs.readFileSync(file) : Buffer.alloc(0);
  const record = {
    schema_version: 1,
    observed_at: new Date().toISOString(),
    root: relative,
    present: Boolean(stat),
    root_hash: `sha256:${sha256(bytes)}`,
    bytes: bytes.length,
    token_estimate: Math.ceil(bytes.length / 4),
    markers: stat ? scanRootMarkers(bytes) : [],
  };
  const history = readLedger(projectRoot, descriptor, env);
  const previous = history.length ? history[history.length - 1] : undefined;
  const lock = acquireProjectMutationLock(projectRoot, descriptor.project_id, env);
  try {
    const file_ = ledgerPath(projectRoot, descriptor, env);
    fs.mkdirSync(path.dirname(file_), { recursive: true });
    fs.appendFileSync(file_, `${canonicalJson(record)}\n`, { mode: 0o600 });
  } finally {
    lock.release();
  }
  return {
    root: relative,
    present: record.present,
    root_hash: record.root_hash,
    bytes: record.bytes,
    markers: record.markers,
    records: history.length + 1,
    changes: previous ? compareObservations(previous, record) : null,
    ledger: ledgerPath(projectRoot, descriptor, env),
  };
}

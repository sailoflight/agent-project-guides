#!/usr/bin/env node
// Harness-neutral guidance gate.
//
// Scans every markdown guidance surface that ships to consumers (bootstrap,
// docs, procedures, profiles, roles, templates) for harness/client names and
// fails on any occurrence outside explicitly client-specific files or the
// adapter section of the core contract. Also locks the CLI banner annotation
// that keeps the legacy DSH observation adapter visibly non-core.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLIENT_TERM = /\b(dsh|claude|codex|cursor|copilot|gemini|opencode|windsurf|cline)\b/i;
// Legitimate non-coupling occurrences:
// - supported root policy filenames (policy.root enum: AGENTS.md | CLAUDE.md);
// - the documented legacy catalog ID in the migration note (consumers must be
//   able to grep the old identifier to learn the alias mapping).
const ROOT_FILENAME = /\b(dsh|claude|codex|cursor|copilot|gemini|opencode|windsurf|cline)\.md\b/i;
const LEGACY_CATALOG_ID = /\bbootstrap:dsh-v2\b/;

// Client-specific surfaces are allowed to name their own client.
const FILE_ALLOWLIST = new Set([
  'bootstrap/CLAUDE.scope-block.md',
]);
// Adapter sections in reference docs may name the adapter they describe.
const REGION_HEADING = new Map([
  ['docs/V2_CONTRACT.md', '## Harness observation'],
]);

function walkMarkdown(relative) {
  const absolute = path.join(packageRoot, relative);
  if (!fs.statSync(absolute, { throwIfNoEntry: false })?.isDirectory()) return [];
  const output = [];
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
    const child = `${relative}/${entry.name}`;
    if (entry.isSymbolicLink()) throw new Error(`gate source is a symlink: ${child}`);
    if (entry.isDirectory()) output.push(...walkMarkdown(child));
    else if (entry.isFile() && entry.name.endsWith('.md')) output.push(child);
  }
  return output;
}

const guidanceRoots = ['bootstrap', 'docs', 'procedures', 'profiles', 'roles', 'templates'];
const files = guidanceRoots.flatMap(walkMarkdown);
const failures = [];
for (const relative of files) {
  if (FILE_ALLOWLIST.has(relative)) continue;
  const content = fs.readFileSync(path.join(packageRoot, relative), 'utf8');
  const regionHeading = REGION_HEADING.get(relative);
  const lines = content.split(/\r?\n/);
  let inRegion = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (regionHeading && line.trim() === regionHeading) {
      inRegion = true;
      continue;
    }
    if (inRegion && /^## /.test(line)) inRegion = false;
    if (inRegion) continue;
    if (ROOT_FILENAME.test(line) || LEGACY_CATALOG_ID.test(line)) continue;
    if (CLIENT_TERM.test(line)) failures.push(`${relative}:${index + 1}: ${line.trim().slice(0, 140)}`);
  }
}

const apgSource = fs.readFileSync(path.join(packageRoot, 'scripts/apg.mjs'), 'utf8');
if (/' {2}dsh\s+Report DSH integration state/.test(apgSource)) {
  failures.push('scripts/apg.mjs: full-CLI banner presents the DSH adapter as a first-class command');
}
if (!/' {2}dsh\s+\[compat\] DSH observation adapter/.test(apgSource)) {
  failures.push('scripts/apg.mjs: banner dsh line lost its [compat] annotation');
}
if (!/const OBSERVATION_ADAPTERS = \{/.test(apgSource)) {
  failures.push('scripts/apg.mjs: observation adapter registry seam is missing');
}
if (/structured question tool \(DSH:/m.test(fs.readFileSync(path.join(packageRoot, 'bootstrap/AGENTS.routing-block.md'), 'utf8'))) {
  failures.push('bootstrap/AGENTS.routing-block.md: client-branded tool mapping returned');
}

if (failures.length > 0) {
  console.error('FAIL: harness-neutral guidance gate');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`PASS: guidance surfaces are harness-neutral (${files.length} markdown files scanned; adapter annotations verified)`);

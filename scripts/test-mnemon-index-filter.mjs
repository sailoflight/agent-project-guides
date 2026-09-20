#!/usr/bin/env node
// Gate for the `.mnemon/documents/index.json` clean filter (see .gitattributes).
//
// The filter exists to stop a tracked file from going dirty on every read, which
// is a hygiene fix - but it rewrites the bytes that go into the object store, so
// a silent mistake there would corrupt tracked project memory rather than fail
// loudly. Three claims therefore have to be executable, not prose:
//
//   1. The declaration and the implementation stay wired together: .gitattributes
//      must name the filter for exactly this path, and the script it points at
//      must exist.
//   2. The rewrite is narrow: only `lastAccessedAt` changes, and it changes to
//      the record's own `updatedAt`.
//   3. It never invents content: input that is not a documents index comes out
//      byte-identical.
//
// The invariant it normalises *towards* is imposed by the consumer, not by us:
// dsh-mnemon-source-documents/lib/index.js `parseRecord` drops any record whose
// `lastAccessedAt` is not a string, so deleting the field instead of rewriting it
// would silently hide every document. That is why this gate asserts the field is
// present and typed, and why it also checks the real index when one exists.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

const filterPath = 'scripts/git-filter-mnemon-index.mjs';
const indexPath = '.mnemon/documents/index.json';
const filterCommand = path.join(packageRoot, filterPath);
const run = (input) => execFileSync(process.execPath, [filterCommand], { input, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

// 1. Declaration still points at the implementation.
const attributes = fs.readFileSync(path.join(packageRoot, '.gitattributes'), 'utf8');
const declared = attributes.split('\n')
  .filter((line) => line.trim() && !line.trim().startsWith('#'))
  .map((line) => line.trim().split(/\s+/));
check(declared.length === 1 && declared[0][0] === indexPath && declared[0][1] === 'filter=apg-mnemon-index',
  `.gitattributes must declare exactly one filter rule: "${indexPath} filter=apg-mnemon-index"`);
check(fs.existsSync(filterCommand), `.gitattributes names a filter but ${filterPath} is missing`);
check(fs.readFileSync(filterCommand, 'utf8').includes('apg-mnemon-index'),
  `${filterPath} no longer documents the driver name .gitattributes references`);

// 2. The rewrite is narrow and lands on updatedAt.
const record = (id, accessed, updated) => ({
  id, title: `t-${id}`, description: 'd', status: 'active', filename: `${id}.md`, relativePath: `documents/active/${id}.md`,
  sourcePaths: ['a.md'], sessionIds: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: updated,
  lastAccessedAt: accessed, revision: 1, contentHash: 'ff', sizeBytes: 10, memoryBodyIds: [],
});
const input = {
  version: 1,
  documents: [
    record('alpha', '2026-09-20T10:00:00.000Z', '2026-03-03T03:03:03.000Z'),
    record('beta', '2026-09-19T10:00:00.000Z', '2026-04-04T04:04:04.000Z'),
    { ...record('gamma', '2026-09-18T10:00:00.000Z', '2026-05-05T05:05:05.000Z'), updatedAt: undefined },
  ],
};
const output = JSON.parse(run(`${JSON.stringify(input, null, 2)}\n`));
check(output.documents.length === 3, 'filter dropped or added records');
check(output.documents[0].lastAccessedAt === '2026-03-03T03:03:03.000Z' && output.documents[1].lastAccessedAt === '2026-04-04T04:04:04.000Z',
  'filter did not rewrite lastAccessedAt to the record\'s own updatedAt');
check(output.documents[2].lastAccessedAt === '1970-01-01T00:00:00.000Z',
  'filter must fall back to a fixed timestamp when a record has no updatedAt');
check(output.documents.every((entry) => typeof entry.lastAccessedAt === 'string'),
  'filter produced a record the documents plugin would drop (lastAccessedAt must stay a string)');
check(JSON.stringify(output.documents.map(({ lastAccessedAt, ...rest }) => rest)) === JSON.stringify(input.documents.map(({ lastAccessedAt, ...rest }) => rest)),
  'filter changed a field other than lastAccessedAt');
// A second pass over its own output must be a no-op, or `git status` would keep flapping.
check(run(`${JSON.stringify(output, null, 2)}\n`) === `${JSON.stringify(output, null, 2)}\n`, 'filter is not idempotent');

// 3. Anything that is not a documents index passes through untouched.
for (const raw of ['', 'not json at all\n', '{"version":1,"documents":{}}\n', '[]\n']) {
  check(run(raw) === raw, `filter rewrote input that is not a documents index: ${JSON.stringify(raw.slice(0, 24))}`);
}

// 4. When the real index is present, it still satisfies the consumer's contract.
if (fs.existsSync(path.join(packageRoot, indexPath))) {
  const live = JSON.parse(fs.readFileSync(path.join(packageRoot, indexPath), 'utf8'));
  const strings = live.documents.every((entry) => typeof entry.lastAccessedAt === 'string');
  check(strings, `${indexPath} has a record whose lastAccessedAt is not a string; the plugin would drop it`);
}

if (failures.length) {
  for (const failure of failures) process.stderr.write(`FAIL: ${failure}\n`);
  process.exit(1);
}
process.stdout.write(`PASS: clean filter rewrites only lastAccessedAt -> updatedAt, is idempotent, passes non-index input through unchanged, and keeps every live record typed as the plugin requires (${declared[0][0]})\n`);

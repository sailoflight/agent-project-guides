#!/usr/bin/env node
// Git `clean` filter for `.mnemon/documents/index.json` (declared in .gitattributes).
//
// Why this exists
// ---------------
// The Mnemon documents plugin rewrites `lastAccessedAt` on EVERY read of the
// index. That field is a local access cache, but it made the tracked file dirty
// after almost any session, so every commit carried a meaningless timestamp diff
// (plans/MULTI_AGENT_INFRA_INTEGRATION_RESEARCH.md, owner-queue row 17).
//
// Untracking the file is NOT an option: the plugin hard-fails with ENOENT when
// the index is absent, and `parseRecord` in
// dsh-mnemon-source-documents/lib/index.js drops any record whose
// `lastAccessedAt` is not a string, so deleting the field would silently hide
// every document. The field must stay present and be a string in the working
// tree; only its VALUE has to stop being tracked.
//
// What it does
// ------------
// On `git add`/`git status`/`git diff`, rewrite each record's `lastAccessedAt`
// to that record's `updatedAt` (the last meaningful change), which is stable
// across reads. The committed blob therefore carries a real, meaningful recency
// value instead of a bogus constant, while the working tree keeps the true
// access time for the plugin. Re-serialising with `JSON.stringify(_, null, 2)`
// plus a trailing newline reproduces the plugin's own byte format, so a checked
// out index is an ordinary, valid index.
//
// Scope and failure behaviour
// ---------------------------
// - Not distributed: `.gitattributes` and `scripts/*` are outside DIST_DIRS and
//   DIST_FILES, so consumers never see this and the package manifest is unchanged.
// - Configured per clone, never committed: `git config filter.<name>.clean`.
//   A clone that never runs scripts/setup-git-filters.sh simply ignores the
//   attribute and keeps today's noisy-but-correct behaviour. It cannot break.
// - Not valid JSON in => unchanged bytes out: a filter must never invent content
//   or corrupt a commit, so a mid-write read passes through and stays visible as
//   a dirty file rather than being silently rewritten.
//
// Usage (see scripts/setup-git-filters.sh):
//   git config filter.apg-mnemon-index.clean "node <repo>/scripts/git-filter-mnemon-index.mjs"

const FALLBACK = '1970-01-01T00:00:00.000Z';

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  let parsed;
  try {
    parsed = JSON.parse(input);
  } catch {
    process.stdout.write(input);
    return;
  }
  if (!parsed || !Array.isArray(parsed.documents)) {
    process.stdout.write(input);
    return;
  }
  for (const record of parsed.documents) {
    if (!record || typeof record !== 'object') continue;
    const updatedAt = record.updatedAt;
    record.lastAccessedAt = typeof updatedAt === 'string' && updatedAt !== '' ? updatedAt : FALLBACK;
  }
  process.stdout.write(`${JSON.stringify(parsed, null, 2)}\n`);
});

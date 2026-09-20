#!/usr/bin/env node

import fs from 'node:fs';
import { stampBlock, verifyBlock } from '../lib/block-integrity.mjs';

// Marker-level strip/stamp/replace for APG's managed instruction blocks.
//
// P9 (decisions/0006): a managed block carries an integrity line as its second
// line, so a hand edit of APG's own region is detected instead of silently
// overwritten. The format, and the definition of the recorded hash, are
// contract surface and live in one place now - lib/block-integrity.mjs - shared
// with the schema-1 bootstrap path so the two cannot disagree.
//
// This file is deliberately marker-agnostic: START and END arrive as arguments,
// so the same commands serve the routing block and the v2 bootstrap block.

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

function markerRange(buffer, startText, endText, required) {
  const start = Buffer.from(startText);
  const end = Buffer.from(endText);
  const startAt = buffer.indexOf(start);
  if (startAt === -1) {
    if (required) fail(`missing start marker: ${startText}`);
    return undefined;
  }
  if (buffer.indexOf(start, startAt + start.length) !== -1) fail(`duplicate start marker: ${startText}`);

  const endAt = buffer.indexOf(end, startAt + start.length);
  if (endAt === -1) fail(`missing end marker: ${endText}`);
  if (buffer.indexOf(end, endAt + end.length) !== -1) fail(`duplicate end marker: ${endText}`);

  let after = endAt + end.length;
  if (buffer[after] === 0x0d && buffer[after + 1] === 0x0a) after += 2;
  else if (buffer[after] === 0x0a) after += 1;
  return { startAt, after };
}

function strip(buffer, markerPairs) {
  let result = buffer;
  for (const [start, end] of markerPairs) {
    const range = markerRange(result, start, end, false);
    if (range) result = Buffer.concat([result.subarray(0, range.startAt), result.subarray(range.after)]);
  }
  return result;
}

// P3 (decisions/0006, narrow scope). APG never reorders another writer's managed
// block. Once APG's own regions exist, a recognisable foreign marker block above
// them must make the merge refuse and ask for reconciliation rather than be
// silently relocated below APG's prefix - the regression measured by
// test-interop-br.sh case B. Project prose above the prefix is deliberately NOT
// refused: that is the pre-scheme-1 tail-position layout that `merge` still
// migrates (test-install.sh), and it moves no third party's block.
//
// The grammar is ADR 0006 P2's: a delimited region whose owner is not
// `agent-project-guides`. Only start markers count - an end marker with no start
// above it is malformed input for its own writer, not a block APG could reorder.
// The forms are the measured vocabulary of the foreign writers found by the
// field census (decisions/0006 "Writer survey"), not a guess:
//   `br`/`bv`  <!-- br-agent-instructions-v1 -->   (version inside the marker)
//   `ee`       <!-- ee:agentsmd:begin generation=N hash=H -->
//   `slb`      <!-- slb:cursor-rules:start -->
//   `sbh`      <!-- sbh-docs:begin <section> -->
//   `frankenterm` <!-- frankenterm:start -->
//   `am`       <!-- am:blurb -->                   (no version token at all)
//   `ubs`      <!-- >>> Ultimate Bug Scanner quick reference (...) -->
//   `cass`     <!-- Auto-generated rules from cass-memory playbook -->
//              <project_rules>                     (bare container tag)
//   `ntm`      <INSTRUCTIONS>                      (bare container tag)
// The last four were added after the census. Three findings drove them: `am`
// suffixes `:blurb` instead of `:start`/`:begin`; `ubs` writes no namespaced
// marker at all; and two writers delimit their region without an HTML comment -
// `cass` with a spaced sentence marker plus a snake_case tag, `ntm` with an
// upper-case tag. Markers that no writer emits stay allowed on purpose: field
// scan literals such as `<!-- casr-machine-readable-v1 -->`,
// `<!-- BEGIN REOLINK_RAG_WSL_TOOL -->` and `<!-- >>> -->` are project prose, and
// refusing them would be over-refusal (test-install.sh P3 vocabulary).
const FOREIGN_COMMENT_MARKER =
  /^<!--\s*(?:(?:>>>|<<<)\s+[A-Za-z0-9]|auto-generated\b|(?!agent-project-guides:)[a-z0-9_.:-]*(?:[.:-](?:start|begin|blurb)\b|-agent-instructions-v\d+\b))/i;
// Case-sensitive on purpose: a bare `<name>` container tag, either an all-caps
// tag (`<INSTRUCTIONS>`) or a snake_case one (`<project_rules>`). Ordinary HTML
// tags (`<br>`, `<div>`) and link-like text (`<https://x>`) do not qualify.
const FOREIGN_TAG_MARKER = /^<(?:(?:[A-Z][A-Z0-9_]{2,})|(?:[a-z][a-z0-9]*_[a-z0-9_]+))>$/;

function looksForeign(text) {
  return FOREIGN_COMMENT_MARKER.test(text) || FOREIGN_TAG_MARKER.test(text);
}

function foreignBlockAbove(buffer, markerPairs) {
  let first = -1;
  for (const [start] of markerPairs) {
    const at = buffer.indexOf(Buffer.from(start));
    if (at !== -1 && (first === -1 || at < first)) first = at;
  }
  if (first <= 0) return undefined;
  const lines = buffer.subarray(0, first).toString('utf8').split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    const text = line.trim();
    if (looksForeign(text)) return { line: index + 1, text };
  }
  return undefined;
}

const argv = process.argv.slice(2);
const command = argv[0];

if (command === 'guard-prefix') {
  const [file, ...pairs] = argv.slice(1);
  if (!file || pairs.length === 0 || pairs.length % 2 !== 0) {
    fail('usage: manage-root-blocks.mjs guard-prefix FILE START END [START END ...]');
  }
  if (!fs.existsSync(file)) {
    console.error(`note: ${file} does not exist; nothing to guard`);
    process.exit(0);
  }
  const markerPairs = [];
  for (let index = 0; index < pairs.length; index += 2) markerPairs.push([pairs[index], pairs[index + 1]]);
  const foreign = foreignBlockAbove(fs.readFileSync(file), markerPairs);
  if (foreign) {
    console.error(`error: another writer's managed block sits above APG's regions (line ${foreign.line}): ${foreign.text}`);
    console.error('note: APG does not reorder foreign blocks. Move that block below the APG regions, or remove it and let its own tool re-add it, then re-run. The file was not modified.');
    process.exit(1);
  }
  process.exit(0);
}

if (command === 'verify') {
  const [, file, startText, endText] = argv;
  if (!file || !startText || !endText) fail('usage: manage-root-blocks.mjs verify FILE START END');
  if (!fs.existsSync(file)) {
    console.error(`note: ${file} does not exist; nothing to verify`);
    process.exit(0);
  }
  const result = verifyBlock(fs.readFileSync(file, 'utf8'), startText, endText);
  switch (result.state) {
    case 'valid':
      process.exit(0);
    case 'legacy':
      console.error(`note: ${startText} has no integrity line; treating it as a pre-P9 block`);
      process.exit(0);
    case 'no-block':
      console.error(`note: no ${startText} block in ${file}`);
      process.exit(0);
    case 'malformed':
      fail(`malformed integrity line: ${result.line}`);
      break;
    default:
      fail(`managed block integrity mismatch: recorded ${result.recorded}, computed ${result.actual}`);
  }
}

const [inputPath, outputPath, ...args] = argv.slice(1);
if (!command || !inputPath || !outputPath) {
  fail('usage: manage-root-blocks.mjs <strip|stamp|replace> INPUT OUTPUT ... | guard-prefix FILE START END ... | verify FILE START END');
}

const input = fs.readFileSync(inputPath);

if (command === 'strip') {
  if (args.length === 0 || args.length % 2 !== 0) fail('strip requires one or more START END marker pairs');
  const pairs = [];
  for (let index = 0; index < args.length; index += 2) pairs.push([args[index], args[index + 1]]);
  fs.writeFileSync(outputPath, strip(input, pairs));
} else if (command === 'stamp') {
  if (args.length !== 2) fail('stamp requires START END');
  fs.writeFileSync(outputPath, stampBlock(input.toString('utf8'), args[0], args[1]));
} else if (command === 'replace') {
  if (args.length !== 3) fail('replace requires START END REPLACEMENT_FILE');
  const [start, end, replacementPath] = args;
  // P9 (decisions/0006): refuse to overwrite a block whose recorded hash does not
  // match its body. A legacy block (no integrity line) still replaces normally, so
  // pre-P9 installs upgrade on their next write instead of breaking.
  const verdict = verifyBlock(input.toString('utf8'), start, end);
  if (verdict.state === 'mismatch' && process.env.AGENT_PROJECT_GUIDES_FORCE_MANAGED_BLOCK !== '1') {
    fail(`managed block integrity mismatch: recorded ${verdict.recorded}, computed ${verdict.actual}; set AGENT_PROJECT_GUIDES_FORCE_MANAGED_BLOCK=1 to replace it anyway`);
  }
  const range = markerRange(input, start, end, true);
  const replacement = fs.readFileSync(replacementPath);
  fs.writeFileSync(outputPath, Buffer.concat([
    input.subarray(0, range.startAt),
    replacement,
    input.subarray(range.after),
  ]));
} else {
  fail(`unknown command: ${command}`);
}

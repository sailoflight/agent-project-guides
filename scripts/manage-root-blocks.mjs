#!/usr/bin/env node

import fs from 'node:fs';
import { createHash } from 'node:crypto';

// P9 (decisions/0006): a managed block carries an integrity line as its second
// line, so a hand edit of APG's own region is detected instead of silently
// overwritten. Format, and the hash definition, are contract surface:
//
//   <!-- agent-project-guides:routing:start -->
//   <!-- agent-project-guides:integrity sha256=<hex> -->
//   ...body...
//   <!-- agent-project-guides:routing:end -->
//
// <hex> is sha256 over the body lines that follow the integrity line, each
// terminated by a single "\n", up to but not including the end marker. The
// start marker stays the first line and its text is unchanged, so every
// existing byte-0 and exactly-once assertion keeps holding.
//
// A block without an integrity line is legacy: `verify` accepts it and `stamp`
// upgrades it on the next write.

const INTEGRITY_PREFIX = '<!-- agent-project-guides:integrity sha256=';
const INTEGRITY_PATTERN = /^<!-- agent-project-guides:integrity sha256=([0-9a-f]{64}) -->$/;

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

function blockBounds(text, startText, endText) {
  const lines = text.split('\n');
  const start = lines.indexOf(startText);
  if (start === -1) return undefined;
  const end = lines.indexOf(endText, start + 1);
  if (end === -1) return undefined;
  return { lines, start, end };
}

function bodyHash(lines, from, to) {
  const hash = createHash('sha256');
  for (let index = from; index < to; index += 1) hash.update(`${lines[index]}\n`);
  return hash.digest('hex');
}

function integrityIndex(lines, start) {
  const candidate = lines[start + 1];
  return typeof candidate === 'string' && candidate.startsWith(INTEGRITY_PREFIX) ? start + 1 : -1;
}

/// Insert or refresh the integrity line. A block that is absent or has no end
/// marker is returned unchanged: this command never invents a managed region.
function stampBlock(text, startText, endText) {
  const bounds = blockBounds(text, startText, endText);
  if (!bounds) return text;
  const { lines, start, end } = bounds;
  const existing = integrityIndex(lines, start);
  const bodyFrom = existing === -1 ? start + 1 : existing + 1;
  const line = `${INTEGRITY_PREFIX}${bodyHash(lines, bodyFrom, end)} -->`;
  if (existing === -1) lines.splice(start + 1, 0, line);
  else lines[existing] = line;
  return lines.join('\n');
}

function verifyBlock(text, startText, endText) {
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

const argv = process.argv.slice(2);
const command = argv[0];

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
  fail('usage: manage-root-blocks.mjs <strip|stamp|replace> INPUT OUTPUT ... | verify FILE START END');
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

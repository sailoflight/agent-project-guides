#!/usr/bin/env node
// P6 (decisions/0006): the observation ledger records what APG saw and nothing else.
// This gate exists because a ledger is easy to write in a way that looks useful and
// proves nothing: it can record markers it never saw, mutate the file it observes,
// lose its own history, or report a version bump as a clobber. Each assertion below
// targets one of those, and the fixture uses the measured marker forms rather than
// invented ones.
//
// Each scenario gets its own project *and* its own clone-local state home, because the
// ledger's whole purpose is to compare an observation against the previous one - a
// scenario that inherited another scenario's history would be asserting against the
// wrong baseline.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { compareObservations, observeRootBlocks, readLedger, scanRootMarkers } from '../lib/observation-ledger.mjs';
import { looksForeignMarker } from '../lib/root-marker-grammar.mjs';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'apg-ledger-test-'));
process.on('exit', () => fs.rmSync(temporary, { recursive: true, force: true }));

function newProject(name) {
  const root = path.join(temporary, name);
  fs.mkdirSync(root, { recursive: true });
  return {
    root,
    file: path.join(root, 'AGENTS.md'),
    descriptor: { project_id: `test.${name}`, policy: { root: 'AGENTS.md' } },
    env: { ...process.env, AGENT_PROJECT_GUIDES_HOME: path.join(temporary, `${name}-home`) },
  };
}

const INTEGRITY = `<!-- agent-project-guides:integrity sha256=${'a'.repeat(64)} -->`;
const FIXTURE = [
  '<!-- agent-project-guides:v2:start -->',
  INTEGRITY,
  '## Project governance bootstrap',
  '<!-- agent-project-guides:v2:end -->',
  '',
  '<!-- br-agent-instructions-v1 -->',
  '<!-- ee:agentsmd:begin generation=3 hash=deadbeef -->',
  '<!-- am:blurb -->',
  '<!-- >>> Ultimate Bug Scanner quick reference (written by install.sh) -->',
  '<!-- Auto-generated rules from cass-memory playbook -->',
  '<project_rules>',
  'body',
  '</project_rules>',
  '<INSTRUCTIONS>',
  'body',
  '</INSTRUCTIONS>',
  '<!-- plain prose that is not a block marker at all -->',
  '<div>',
  '',
].join('\n');

// 1. The marker vocabulary is the measured one, and it stays shared: everything the
// ledger records as foreign is a form the guard also recognises, so the two cannot
// drift into disagreeing about which blocks exist.
const markers = scanRootMarkers(Buffer.from(FIXTURE));
const byText = (needle) => markers.find((marker) => marker.text.includes(needle));
assert.equal(markers.length, 12, `expected exactly the 12 marker lines, got: ${markers.map((marker) => marker.text).join(' | ')}`);
assert.equal(byText('agent-project-guides:v2:start').role, 'start');
assert.equal(byText('agent-project-guides:v2:start').version, 'v2');
assert.equal(byText('agent-project-guides:integrity').role, 'integrity');
assert.equal(byText('agent-project-guides:integrity').digest, 'a'.repeat(64));
assert.equal(byText('agent-project-guides:v2:end').role, 'end');
assert.equal(byText('br-agent-instructions').name, 'br');
assert.equal(byText('br-agent-instructions').version, 'v1');
assert.equal(byText('ee:agentsmd:begin').name, 'ee');
assert.equal(byText('am:blurb').name, 'am');
assert.equal(byText('am:blurb').version, null, 'am writes no version token; null must be representable');
assert.equal(byText('Ultimate Bug Scanner').name, 'Ultimate');
assert.equal(byText('Auto-generated rules').name, 'Auto-generated');
assert.equal(byText('<project_rules>').kind, 'tag');
assert.equal(byText('<project_rules>').role, 'start');
assert.equal(byText('</project_rules>').role, 'end');
assert.equal(byText('<INSTRUCTIONS>').name, 'INSTRUCTIONS');
assert.equal(byText('</INSTRUCTIONS>').role, 'end');
for (const marker of markers.filter((entry) => entry.name !== 'agent-project-guides')) {
  if (marker.role === 'start') {
    const form = marker.kind === 'tag' ? `<${marker.name}>` : marker.text;
    assert.ok(looksForeignMarker(form), `ledger recorded a start marker the guard does not know: ${marker.text}`);
  } else {
    assert.ok(markers.some((entry) => entry.role === 'start' && entry.name === marker.name), `ledger recorded an unpaired end marker: ${marker.text}`);
  }
}
assert.ok(markers.some((marker) => marker.kind === 'tag' && marker.role === 'end'), 'the fixture must exercise the end-marker path');
// Negative control for that pairing rule: a closing tag whose opener never appeared is
// somebody's prose, and must not enter the ledger at all.
assert.equal(scanRootMarkers(Buffer.from('</project_rules>\n')).length, 0, 'an unpaired closing tag must not be recorded');
assert.equal(scanRootMarkers(Buffer.from('<INSTRUCTIONS>\n</INSTRUCTIONS>\n')).length, 2, 'a paired bare tag must be recorded on both halves');
// Over-collection would make the ledger noise: project prose and ordinary HTML are
// not block markers.
assert.equal(byText('plain prose'), undefined);
assert.equal(byText('<div>'), undefined);
assert.ok(markers.every((marker) => typeof marker.byte_start === 'number' && marker.byte_end > marker.byte_start));
assert.ok(markers.every((marker) => marker.token_estimate >= 1));

// 2. Observing is read-only for the root file and append-only for the ledger. The
// first record is compared byte-for-byte after the second observation, because
// "append-only" is exactly the claim a rewrite would quietly break.
const first = newProject('markers');
fs.writeFileSync(first.file, FIXTURE);
const before = fs.readFileSync(first.file);
const one = observeRootBlocks(first.root, first.descriptor, { env: first.env });
assert.equal(one.records, 1);
assert.equal(one.present, true);
assert.equal(one.changes, null, 'the first observation has nothing to compare against');
assert.deepEqual(fs.readFileSync(first.file), before, 'observation must not modify the root file');
const firstLine = fs.readFileSync(one.ledger, 'utf8').split('\n')[0];
const two = observeRootBlocks(first.root, first.descriptor, { env: first.env });
assert.equal(two.records, 2);
assert.equal(fs.readFileSync(one.ledger, 'utf8').split('\n')[0], firstLine, 'the ledger must not rewrite history');
assert.equal(readLedger(first.root, first.descriptor, first.env).length, 2);
assert.deepEqual(fs.readdirSync(first.root), ['AGENTS.md'], 'observation must not create a backup or a sidecar next to the root');

// 3. Attribution is the point of the ledger, so a clobber has to be visible. The
// whole-file rewrites found by the census leave nothing behind on their own.
fs.writeFileSync(first.file, FIXTURE.replace('<!-- br-agent-instructions-v1 -->\n', '').replace('<!-- am:blurb -->', '<!-- frankenterm:start -->'));
const clobbered = observeRootBlocks(first.root, first.descriptor, { env: first.env });
assert.ok(clobbered.changes.disappeared.some((entry) => entry.text.includes('br-agent-instructions-v1')), 'a removed foreign block must be reported as disappeared');
assert.ok(clobbered.changes.appeared.some((entry) => entry.text.includes('frankenterm:start')), 'a new foreign block must be reported as appeared');

// 4. A version bump is not a clobber. If it were reported as disappeared+appeared, the
// ledger would cry wolf on every upstream release - `beads_viewer` alone ships three
// marker versions at once.
const bumpedProject = newProject('bumped');
fs.writeFileSync(bumpedProject.file, FIXTURE);
observeRootBlocks(bumpedProject.root, bumpedProject.descriptor, { env: bumpedProject.env });
fs.writeFileSync(bumpedProject.file, FIXTURE.replace('br-agent-instructions-v1', 'br-agent-instructions-v2'));
const bumped = observeRootBlocks(bumpedProject.root, bumpedProject.descriptor, { env: bumpedProject.env });
assert.ok(bumped.changes.version_changed.some((entry) => entry.name === 'br' && entry.from === 'v1' && entry.to === 'v2'), `a version change must be reported as a version change, got ${JSON.stringify(bumped.changes)}`);
assert.ok(!bumped.changes.disappeared.some((entry) => entry.text.includes('br-agent-instructions')), 'a version bump must not be reported as disappeared');

// 5. A missing block - and a missing root file - is never an error. This is the line
// between observed state and authority: the ledger may not fail a project because a
// third party removed its own block.
const absent = newProject('absent');
const nothing = observeRootBlocks(absent.root, absent.descriptor, { env: absent.env });
assert.equal(nothing.present, false);
assert.equal(nothing.markers.length, 0);
assert.equal(nothing.bytes, 0);

// 6. A corrupt ledger is refused rather than silently truncated, so history cannot be
// lost without anyone noticing.
fs.appendFileSync(one.ledger, 'not json\n');
assert.throws(() => readLedger(first.root, first.descriptor, first.env), (error) => error.code === 'ledger_corrupt');

// 7. The comparison primitive is exercised directly, including the empty cases, so the
// diff cannot pass only because the fixture happened to exercise one path.
assert.deepEqual(compareObservations({ markers: [] }, { markers: [] }), { appeared: [], disappeared: [], version_changed: [], moved: [] });
assert.equal(compareObservations(undefined, { markers: [] }).appeared.length, 0);
const moved = compareObservations({ markers: [{ kind: 'comment', name: 'br', role: 'start', version: 'v1', text: 'x', line: 3 }] }, { markers: [{ kind: 'comment', name: 'br', role: 'start', version: 'v1', text: 'x', line: 9 }] });
assert.equal(moved.moved.length, 1, 'a block that only moved line must be reported as moved, not as a clobber');

// 8. The CLI path is real, not declared: run it against this repository's own root
// file, which carries a v2 block. An uninvoked command is a failure mode this
// repository already recorded once (ADR 0005's genericity gate sat uninvoked from
// 3.0.7 until 3.0.10), so the ledger's entry point is invoked here.
const cli = spawnSync(process.execPath, [path.join(packageRoot, 'scripts', 'apg.mjs'), 'project', 'observe', '--target', packageRoot], {
  cwd: packageRoot,
  encoding: 'utf8',
  env: { ...process.env, AGENT_PROJECT_GUIDES_HOME: path.join(temporary, 'cli-home') },
});
assert.equal(cli.status, 0, `project observe failed: ${cli.stderr}`);
const observed = JSON.parse(cli.stdout);
assert.equal(observed.present, true);
assert.ok(observed.markers.some((marker) => marker.text.includes('agent-project-guides:v2:start')), 'the CLI must observe the repository root block');
assert.ok(observed.markers.some((marker) => marker.role === 'integrity'), 'the CLI must record the integrity line it saw');

console.log('PASS: observation ledger records measured markers append-only, attributes a clobber, survives a version bump, treats a missing block as non-an-error, refuses a corrupt log, and is reachable through the CLI');

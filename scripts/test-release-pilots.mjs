#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'scripts', 'apg.mjs');
const workspace = fs.realpathSync(process.env.APG_PILOT_ROOT || path.dirname(root));
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'apg-release-pilots-'));
const strict = process.env.APG_PILOT_STRICT === '1';
const fixtures = ['synthetic-cli.json', 'small-cli.json', 'complex-content-package.json'];

function sha256(bytes) {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
}

function run(args, { cwd = root, home } = {}) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, AGENT_PROJECT_GUIDES_HOME: home },
  });
  if (result.status !== 0) throw new Error(`command failed (${result.status}): apg ${args.join(' ')}\n${result.stderr}`);
  return JSON.parse(result.stdout);
}

function git(directory, args, { allowFailure = false } = {}) {
  const result = spawnSync('git', ['-C', directory, ...args], { encoding: 'utf8' });
  if (!allowFailure) assert.equal(result.status, 0, result.stderr);
  return result.status === 0 ? result.stdout : null;
}

function snapshot(file) {
  const stat = fs.lstatSync(file, { throwIfNoEntry: false });
  if (!stat) return { exists: false, hash: 'missing', mode: null, bytes: null };
  assert.ok(stat.isFile(), `${file} must be a regular file`);
  const bytes = fs.readFileSync(file);
  return { exists: true, hash: sha256(bytes), mode: stat.mode & 0o777, bytes };
}

function sameSnapshot(file, before) {
  const after = snapshot(file);
  return after.exists === before.exists && after.hash === before.hash && after.mode === before.mode;
}

function gitExclude(projectRoot) {
  const gitPath = path.join(projectRoot, '.git');
  const stat = fs.lstatSync(gitPath, { throwIfNoEntry: false });
  if (!stat) return null;
  if (stat.isDirectory()) return path.join(gitPath, 'info', 'exclude');
  const match = /^gitdir:\s*(.+)$/m.exec(fs.readFileSync(gitPath, 'utf8'));
  return match ? path.join(path.resolve(projectRoot, match[1]), 'info', 'exclude') : null;
}

// Which root revision a project's entry file declares, for reporting only.
// `v3` means the entry was already migrated; `absent` means there is no entry
// file to migrate at all.
function observedRootRevision(text) {
  if (text === null) return 'absent';
  if (text.includes('<!-- agent-project-guides:v3:start -->')) return 'v3';
  const legacy = /package_revision=([^\s;]+)/.exec(text);
  if (legacy) return legacy[1];
  if (text.includes('<!-- agent-project-guides:routing:start -->')) return 'legacy-unmarked';
  return 'unmarked';
}

function readRootEntry(projectRoot, name) {
  const file = path.join(projectRoot, name);
  if (!fs.statSync(file, { throwIfNoEntry: false })?.isFile()) return null;
  return fs.readFileSync(file, 'utf8');
}

// A synthetic source lives inside this package and is copied verbatim, with its
// legacy root entry materialised under the name a real project would use. An
// external source is copied out of the sibling workspace and may legitimately
// have drifted; that drift is reported, never absorbed.
function materialize(fixture) {
  const base = fixture.source_base === 'package' ? root : workspace;
  const source = path.resolve(base, fixture.source_relative);
  if (!fs.statSync(source, { throwIfNoEntry: false })?.isDirectory()) {
    if (fixture.kind === 'synthetic') throw new Error(`synthetic pilot source is missing: ${source}`);
    return { state: 'skipped', skip_reason: 'source-unavailable', observed_root_revision: 'absent' };
  }
  const project = path.join(temporary, fixture.id);
  fs.cpSync(source, project, { recursive: true, dereference: false, verbatimSymlinks: true });
  if (fixture.kind === 'synthetic') {
    const target = path.join(project, 'AGENTS.md');
    fs.renameSync(path.join(project, fixture.legacy_root_entry), target);
    if (fixture.init_git) {
      git(project, ['init', '-q']);
      git(project, ['add', '-A']);
    }
  }
  const expectation = fixture.source_expectation || {};
  const rootName = expectation.root_entry || 'AGENTS.md';
  const text = readRootEntry(project, rootName) ?? readRootEntry(project, 'CLAUDE.md');
  const revision = observedRootRevision(text);
  if (revision !== (expectation.root_revision || fixture.baseline.governance_release)) {
    if (fixture.kind === 'synthetic') {
      throw new Error(
        `synthetic pilot fixture is not in its declared ${fixture.baseline.governance_release} state: observed ${revision} in ${rootName}`,
      );
    }
    return {
      state: 'skipped',
      skip_reason: text === null ? 'root-entry-missing' : 'root-entry-drifted',
      observed_root_revision: revision,
    };
  }
  return { state: 'ready', project, rootName };
}

function pilotReport(fixture) {
  const materialized = materialize(fixture);
  const kind = fixture.kind || 'external-source-copy';
  const header = {
    schema_version: 1,
    pilot: fixture.id,
    kind,
    source_base: fixture.source_base || 'workspace',
    source_relative: fixture.source_relative,
    baseline: fixture.baseline,
    task: fixture.task,
  };
  if (materialized.state === 'skipped') {
    return {
      ...header,
      status: 'skipped',
      skip_reason: materialized.skip_reason,
      observed_root_revision: materialized.observed_root_revision,
      frozen_baseline: fixture.source_expectation?.frozen_baseline ?? null,
      gates: null,
      passed: null,
    };
  }

  const project = materialized.project;
  const home = path.join(temporary, `${fixture.id}-home`);
  const rootFile = path.join(project, materialized.rootName);
  const rootBefore = snapshot(rootFile);
  assert.ok(rootBefore.exists, `${fixture.id} has no ${materialized.rootName}`);
  const expectedRevision = fixture.baseline.governance_release.replaceAll('.', '\\.');
  assert.match(
    rootBefore.bytes.toString('utf8'),
    new RegExp(`package_revision=${expectedRevision}`),
    `${fixture.id} source must still declare the frozen revision ${fixture.baseline.governance_release}`,
  );
  const descriptorFile = path.join(project, '.agent-project-guides.json');
  const descriptorBefore = snapshot(descriptorFile);
  const excludeFile = gitExclude(project);
  const excludeBefore = excludeFile ? snapshot(excludeFile) : null;
  const stagedBefore = git(project, ['diff', '--cached', '--name-only'], { allowFailure: true });
  const headBefore = git(project, ['rev-parse', '--verify', 'HEAD'], { allowFailure: true });

  const planned = run([
    'migrate', 'plan', '--target', project, '--project-id', fixture.project_id, '--source', root,
    '--facets', fixture.facets.join(','), '--overlays', fixture.overlays.join(','), '--mandatory', fixture.mandatory.join(','),
  ], { home });
  const applied = run(['migrate', 'apply', '--plan', planned.plan, '--digest', planned.digest], { home });
  const validation = run(['project', 'validate', '--target', project], { home });
  const route = run([
    'provider', 'resolve', '--target', project, '--plane', fixture.task.plane, '--role', fixture.task.role,
    '--mode', fixture.task.mode, '--task', fixture.task.text,
  ], { home });
  const stagedAfterApply = git(project, ['diff', '--cached', '--name-only'], { allowFailure: true });
  const genericStaged = (stagedAfterApply || '').split(/\r?\n/).filter((line) => line.includes('.agent-project-guides/local/') || line.startsWith('agent-project-guides/'));
  const rollback = run(['migrate', 'rollback', '--target', project], { home });

  const gates = {
    route_noninferiority: route.role === fixture.task.role && route.mode === fixture.task.mode && JSON.stringify(route.exact) === JSON.stringify(fixture.baseline.required_exact_ids),
    route_token_budget: route.exact_token_estimate <= fixture.baseline.maximum_route_tokens && route.exact_token_estimate < fixture.baseline.legacy_route_token_threshold,
    mandatory_authority_recall: fixture.mandatory.every((id) => route.exact.includes(id)) && validation.valid === true,
    migration_ownership: applied.status === 'migrated' && rollback.status === 'rolled_back' && sameSnapshot(rootFile, rootBefore) && sameSnapshot(descriptorFile, descriptorBefore) && (!excludeFile || sameSnapshot(excludeFile, excludeBefore)),
    no_generic_staging: stagedAfterApply === stagedBefore && genericStaged.length === 0 && git(project, ['rev-parse', '--verify', 'HEAD'], { allowFailure: true }) === headBefore,
  };
  return {
    ...header,
    status: 'ran',
    root_policy_hash: rootBefore.hash,
    route: {
      exact: route.exact,
      suggested: route.suggested,
      exact_token_estimate: route.exact_token_estimate,
      token_estimate_method: route.token_estimate_method,
    },
    provider: validation.provider,
    gates,
    passed: Object.values(gates).every(Boolean),
  };
}

function scopeLine(reports) {
  const ran = reports.filter((report) => report.status === 'ran');
  const skipped = reports.filter((report) => report.status === 'skipped');
  const byKind = (kind) => ran.filter((report) => report.kind === kind).length;
  const detail = skipped.map((report) => `${report.pilot}: ${report.skip_reason} (observed ${report.observed_root_revision})`).join('; ');
  return [
    `release pilots: ran ${ran.length}/${reports.length} (synthetic=${byKind('synthetic')}, external-source-copy=${byKind('external-source-copy')}, real-host-task=0)`,
    `skipped ${skipped.length}${detail ? ` [${detail}]` : ''}`,
  ].join('; ');
}

try {
  const reports = fixtures.map((name) => pilotReport(JSON.parse(fs.readFileSync(path.join(root, 'fixtures', 'pilots', name), 'utf8'))));
  const ran = reports.filter((report) => report.status === 'ran');
  const skipped = reports.filter((report) => report.status === 'skipped');
  const passed = ran.every((report) => report.passed) && !(strict && skipped.length > 0);
  process.stderr.write(`${scopeLine(reports)}\n`);
  if (strict && skipped.length > 0) {
    process.stderr.write(`APG_PILOT_STRICT=1: ${skipped.length} pilot(s) could not run against their frozen source\n`);
  }
  process.stdout.write(`${JSON.stringify({
    schema_version: 1,
    strict,
    coverage: {
      ran: ran.length,
      skipped: skipped.length,
      synthetic: ran.filter((report) => report.kind === 'synthetic').length,
      'external-source-copy': ran.filter((report) => report.kind === 'external-source-copy').length,
      'real-host-task': 0,
    },
    reports,
    passed,
  }, null, 2)}\n`);
  if (!passed) process.exitCode = 1;
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}

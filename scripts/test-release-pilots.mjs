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

function pilotFixture(file) {
  const fixture = JSON.parse(fs.readFileSync(path.join(root, 'fixtures', 'pilots', file), 'utf8'));
  const source = path.resolve(workspace, fixture.source_relative);
  if (!fs.statSync(source, { throwIfNoEntry: false })?.isDirectory()) throw new Error(`pilot source is unavailable: ${source}`);
  const project = path.join(temporary, fixture.id);
  fs.cpSync(source, project, { recursive: true, dereference: false, verbatimSymlinks: true });
  const home = path.join(temporary, `${fixture.id}-home`);
  const rootFile = path.join(project, 'AGENTS.md');
  const rootBefore = snapshot(rootFile);
  assert.ok(rootBefore.exists, `${fixture.id} has no AGENTS.md`);
  assert.match(rootBefore.bytes.toString('utf8'), new RegExp(`package_revision=${fixture.baseline.governance_release.replaceAll('.', '\\.')}`));
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
  const report = {
    schema_version: 1,
    pilot: fixture.id,
    source_relative: fixture.source_relative,
    root_policy_hash: rootBefore.hash,
    baseline: fixture.baseline,
    task: fixture.task,
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
  return report;
}

try {
  const reports = ['small-cli.json', 'complex-content-package.json'].map(pilotFixture);
  process.stdout.write(`${JSON.stringify({ schema_version: 1, reports, passed: reports.every((report) => report.passed) }, null, 2)}\n`);
  if (!reports.every((report) => report.passed)) process.exitCode = 1;
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}

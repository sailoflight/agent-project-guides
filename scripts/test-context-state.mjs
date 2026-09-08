#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { canonicalJson, listDistributionFiles } from '../lib/core.mjs';
import { createGenerationReference, ensureGenerationKey, loadGenerationReference, saveGenerationReference } from '../lib/provider.mjs';

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'apg-context-state-'));
try {
  const env = { ...process.env, AGENT_PROJECT_GUIDES_HOME: path.join(temporary, 'home') };
  const project = path.join(temporary, 'project');
  fs.mkdirSync(project);
  fs.mkdirSync(path.join(project, 'docs', 'memory'), { recursive: true });
  fs.writeFileSync(path.join(project, 'docs', 'memory', 'local-finding.json'), '{}');
  fs.writeFileSync(path.join(project, 'docs', 'CONTRACT.md'), 'public contract');
  assert.deepEqual(listDistributionFiles(project), ['docs/CONTRACT.md'], 'local memory must not enter release artifacts');
  const key = ensureGenerationKey(env);
  const sign = (payload) => {
    const encoded = Buffer.from(canonicalJson(payload)).toString('base64url');
    return `${encoded}.${crypto.createHmac('sha256', key).update(encoded).digest('hex')}`;
  };
  const validGeneration = sign({ expires_at_ms: Date.now() + 900_000 });
  const valid = createGenerationReference();
  saveGenerationReference(valid, validGeneration, project, env);
  const directory = path.join(env.AGENT_PROJECT_GUIDES_HOME, 'state', 'generation-handles');
  const expired = createGenerationReference();
  saveGenerationReference(expired, sign({ expires_at_ms: 1 }), project, env);
  const unrelated = path.join(directory, 'user-notes.txt');
  const unverified = path.join(directory, `${createGenerationReference()}.json`);
  fs.writeFileSync(unrelated, 'preserve unrelated state');
  fs.writeFileSync(unverified, '{"expires_at_ms":1}', { mode: 0o600 });
  const link = path.join(directory, `${createGenerationReference()}.json`);
  fs.symlinkSync(unrelated, link);
  const next = createGenerationReference();
  saveGenerationReference(next, validGeneration, project, env);
  assert.equal(fs.existsSync(path.join(directory, `${expired}.json`)), false, 'authenticated expired reference is reclaimed');
  assert.equal(loadGenerationReference(valid, project, env), validGeneration, 'live reference survives cleanup');
  assert.equal(loadGenerationReference(next, project, env), validGeneration);
  assert.equal(fs.readFileSync(unrelated, 'utf8'), 'preserve unrelated state');
  assert.equal(fs.readFileSync(unverified, 'utf8'), '{"expires_at_ms":1}');
  assert.equal(fs.lstatSync(link).isSymbolicLink(), true);
  console.log('PASS: expired reference reclamation preserves live, unrelated, unverified and symlink state');
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}

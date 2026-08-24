#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = {
  planes: 'routing/planes.jsonl',
  production: 'routing/production.roles.jsonl',
  development: 'routing/development.roles.jsonl',
};

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

function safePath(relativePath, field) {
  if (typeof relativePath !== 'string' || !relativePath || path.isAbsolute(relativePath) || relativePath.split('/').includes('..')) {
    fail(`${field} must be a safe package-relative path`);
  }
  const absolute = path.resolve(packageRoot, relativePath);
  const stat = fs.lstatSync(absolute, { throwIfNoEntry: false });
  if (!absolute.startsWith(`${packageRoot}${path.sep}`) || !stat?.isFile() || stat.isSymbolicLink()) {
    fail(`${field} does not resolve to a package file: ${relativePath}`);
  }
}

function readJsonl(relativePath) {
  const absolute = path.join(packageRoot, relativePath);
  if (!fs.statSync(absolute, { throwIfNoEntry: false })?.isFile()) fail(`missing registry: ${relativePath}`);
  return fs.readFileSync(absolute, 'utf8').split(/\r?\n/).filter(Boolean).map((line, index) => {
    try {
      const value = JSON.parse(line);
      if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('record is not an object');
      return value;
    } catch (error) {
      fail(`${relativePath}:${index + 1}: ${error.message}`);
    }
  });
}

const planes = readJsonl(files.planes);
const production = readJsonl(files.production);
const development = readJsonl(files.development);

const expectedPlanes = new Map([['production', files.production], ['development', files.development]]);
if (planes.length !== expectedPlanes.size) fail('planes registry must contain exactly production and development');
for (const record of planes) {
  if (!expectedPlanes.has(record.id) || record.roles !== expectedPlanes.get(record.id) || typeof record.when !== 'string') {
    fail(`invalid plane record: ${JSON.stringify(record)}`);
  }
  safePath(record.roles, `plane ${record.id}.roles`);
}

const expectedRoles = new Set(['user', 'operator', 'developer', 'maintainer', 'reviewer', 'field-evaluator']);
const seen = new Set();
for (const [plane, records] of [['production', production], ['development', development]]) {
  for (const record of records) {
    if (!expectedRoles.has(record.id) || seen.has(record.id)) fail(`invalid or duplicate role id: ${record.id}`);
    seen.add(record.id);
    if (record.plane !== plane || typeof record.when !== 'string' || !Array.isArray(record.modes) || record.modes.length === 0) {
      fail(`invalid role record: ${JSON.stringify(record)}`);
    }
    if (new Set(record.modes).size !== record.modes.length) fail(`duplicate modes for role: ${record.id}`);
    if (typeof record.guide !== 'string' || !record.guide.startsWith(`roles/${plane}/`)) fail(`role ${record.id} guide is outside its plane directory`);
    safePath(record.guide, `role ${record.id}.guide`);
    for (const [mode, procedure] of Object.entries(record.procedure_by_mode || {})) {
      if (!record.modes.includes(mode)) fail(`procedure references unknown mode ${record.id}.${mode}`);
      if (typeof procedure !== 'string' || !procedure.startsWith('procedures/')) fail(`procedure is outside procedures/: ${procedure}`);
      safePath(procedure, `role ${record.id}.${mode}.procedure`);
    }
  }
}
if (seen.size !== expectedRoles.size) fail(`missing role ids: ${[...expectedRoles].filter(id => !seen.has(id)).join(', ')}`);

console.log('Routing JSONL is valid.');

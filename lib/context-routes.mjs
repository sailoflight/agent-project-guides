import fs from 'node:fs';
import path from 'node:path';
import { UserError, normalizeRelative, resolveInside } from './core.mjs';

function readJsonl(packageRoot, relative) {
  const file = resolveInside(packageRoot, normalizeRelative(relative, 'registry path'), 'registry path');
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map((line, index) => {
    try {
      const value = JSON.parse(line);
      if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('record is not an object');
      return value;
    } catch (error) {
      throw new UserError(`${relative}:${index + 1}: ${error.message}`, 'invalid_registry');
    }
  });
}

function fail(message) {
  throw new UserError(message, 'invalid_registry');
}

function validatePlan(catalogById, subject, owner, plan, label, { allowEmpty = false, allowDocument = false } = {}) {
  if (!plan || Array.isArray(plan) || typeof plan !== 'object' || !Array.isArray(plan.ids) || !Number.isSafeInteger(plan.budget) || plan.budget < 0) {
    fail(`${label} must contain ids and a non-negative integer budget`);
  }
  if (!allowEmpty && plan.ids.length === 0) fail(`${label} must not be empty`);
  if (new Set(plan.ids).size !== plan.ids.length) fail(`${label} contains duplicate IDs`);
  let tokens = 0;
  for (const id of plan.ids) {
    if (typeof id !== 'string' || (id !== subject && !id.startsWith(`${subject}#`))) fail(`${label} contains a cross-owner ID: ${id}`);
    const entry = catalogById.get(id);
    if (!entry || entry.path !== owner.path) fail(`${label} contains a missing or wrong-path catalog ID: ${id}`);
    if (!allowDocument && !entry.section) fail(`${label} must route sections rather than a whole document: ${id}`);
    tokens += entry.tokens;
  }
  if (tokens > plan.budget) fail(`${label} exceeds token budget: ${tokens} > ${plan.budget}`);
}

export function validateContextRoutes(packageRoot, catalog) {
  const production = readJsonl(packageRoot, 'routing/production.roles.jsonl');
  const development = readJsonl(packageRoot, 'routing/development.roles.jsonl');
  const facets = readJsonl(packageRoot, 'routing/facets.jsonl');
  const overlays = readJsonl(packageRoot, 'routing/domain-overlays.jsonl');
  const routes = readJsonl(packageRoot, 'routing/context-routes.jsonl');
  const catalogById = new Map(catalog.map((entry) => [entry.id, entry]));
  const knownModes = new Set([...production, ...development].flatMap((record) => record.modes || []));
  const subjects = new Map();
  for (const record of production) subjects.set(`role:production/${record.id}`, { kind: 'role', path: record.guide, modes: record.modes || [], procedures: record.procedure_by_mode || {} });
  for (const record of development) subjects.set(`role:development/${record.id}`, { kind: 'role', path: record.guide, modes: record.modes || [], procedures: record.procedure_by_mode || {} });
  for (const record of facets) subjects.set(`profile:${record.id}`, { kind: 'profile', path: record.profile, modes: [] });
  for (const record of overlays) subjects.set(`overlay:${record.id}`, { kind: 'overlay', path: record.guide, modes: [] });
  if (routes.length !== subjects.size) fail('context routes must cover every role, facet, and overlay exactly once');

  const seen = new Set();
  for (const record of routes) {
    if (typeof record.id !== 'string' || seen.has(record.id) || !subjects.has(record.id)) fail(`invalid or duplicate context route id: ${record.id}`);
    seen.add(record.id);
    const owner = subjects.get(record.id);
    const allowedKeys = new Set(['id', 'default', 'by_mode', 'full_modes', 'full_budget']);
    for (const key of Object.keys(record)) if (!allowedKeys.has(key)) fail(`context route ${record.id} has unknown field: ${key}`);
    if (record.by_mode !== undefined && (!record.by_mode || Array.isArray(record.by_mode) || typeof record.by_mode !== 'object')) fail(`context route ${record.id}.by_mode must be an object`);
    for (const mode of Object.keys(record.by_mode || {})) {
      if (owner.kind !== 'role' || !owner.modes.includes(mode)) fail(`context route ${record.id} references unsupported mode: ${mode}`);
    }
    const fullModes = record.full_modes || [];
    if (!Array.isArray(fullModes) || new Set(fullModes).size !== fullModes.length) fail(`context route ${record.id}.full_modes must be a unique array`);
    if (fullModes.length && owner.kind !== 'profile') fail(`only profile context routes may declare full_modes: ${record.id}`);
    for (const mode of fullModes) {
      if (!knownModes.has(mode)) fail(`context route ${record.id} references unknown full mode: ${mode}`);
      if (!['initialize', 'readapt'].includes(mode)) fail(`context route ${record.id} uses a whole document outside a lifecycle mode: ${mode}`);
    }
    if (fullModes.length) validatePlan(catalogById, record.id, owner, { ids: [record.id], budget: record.full_budget }, `${record.id}.full_modes`, { allowDocument: true });
    else if (record.full_budget !== undefined) fail(`context route ${record.id} has full_budget without full_modes`);

    if (owner.kind === 'role') {
      for (const mode of owner.modes) {
        const plan = record.by_mode?.[mode] || record.default;
        validatePlan(catalogById, record.id, owner, plan, `${record.id}.${mode}`, { allowEmpty: Object.hasOwn(owner.procedures, mode) });
      }
    } else {
      if (record.by_mode !== undefined) fail(`non-role context route cannot declare by_mode: ${record.id}`);
      validatePlan(catalogById, record.id, owner, record.default, `${record.id}.default`, { allowDocument: owner.kind === 'overlay' });
    }
  }
  for (const subject of subjects.keys()) if (!seen.has(subject)) fail(`missing context route: ${subject}`);
  return { routes, subjects };
}

export function selectContextRoute(records, catalog, subject, mode, { allowEmpty = false } = {}) {
  const matches = records.filter((record) => record.id === subject);
  if (matches.length !== 1) fail(`context route must resolve exactly once: ${subject}`);
  const record = matches[0];
  const lifecycleFull = (record.full_modes || []).includes(mode);
  const selection = lifecycleFull ? { ids: [subject], budget: record.full_budget } : record.by_mode?.[mode] || record.default;
  if (!selection || !Array.isArray(selection.ids) || (!allowEmpty && selection.ids.length === 0)) fail(`context route is incomplete for ${subject}${mode ? ` mode ${mode}` : ''}`);
  let tokens = 0;
  for (const id of selection.ids) {
    const entry = catalog.find((item) => item.id === id);
    if (!entry) fail(`context route entry is missing: ${id}`);
    tokens += entry.tokens;
  }
  if (tokens > selection.budget) throw new UserError(`context route token budget exceeded for ${subject}: ${tokens} > ${selection.budget}`, 'route_budget_exceeded');
  return selection.ids;
}

import fs from 'node:fs';
import path from 'node:path';
import { loadCatalogEntry, readCatalog, resolveRoute } from './catalog.mjs';
import { packedContentView, sourceContentView } from './closure.mjs';
import { UserError, canonicalJson, sha256 } from './core.mjs';
import { hmacSha256 } from './crypto.mjs';

const ESTIMATOR = 'utf8-bytes/4-ceiling';
const HANDLE_TTL_MS = 15 * 60 * 1000;

function readJsonl(root, relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);
}

function roleRecords(root) {
  return [...readJsonl(root, 'routing/development.roles.jsonl'), ...readJsonl(root, 'routing/production.roles.jsonl')];
}

function classifier(root) {
  const value = JSON.parse(fs.readFileSync(path.join(root, 'routing', 'context-classifier.json'), 'utf8'));
  if (value.schema_version !== 1 || !Array.isArray(value.protected_patterns) || !Array.isArray(value.roles)) throw new UserError('context classifier registry is invalid', 'invalid_registry');
  return value;
}

function tokenEstimate(value) {
  return Math.ceil(Buffer.byteLength(value) / 4);
}

function compatibilityDescriptor(descriptor) {
  if (descriptor.schema_version === 1) return descriptor;
  return {
    facets: descriptor.documents.profiles,
    overlays: descriptor.documents.overlays,
    policy: descriptor.policy,
  };
}

function selectedRoles(descriptor, records) {
  if (descriptor.schema_version === 1) return records.map((record) => `${record.plane}/${record.id}`);
  return descriptor.documents.roles;
}

function exactRole(records, allowed, requested, plane) {
  const key = requested.trim().toLocaleLowerCase('und');
  const matches = records.filter((record) => {
    const canonical = `${record.plane}/${record.id}`;
    if (!allowed.has(canonical) || (plane && record.plane !== plane)) return false;
    return [record.id, canonical, ...(record.aliases || [])].some((value) => value.toLocaleLowerCase('und') === key);
  });
  if (matches.length !== 1) throw new UserError(`role must resolve exactly once inside the selected view: ${requested}`, 'route_unresolved');
  return matches[0];
}

function containsPattern(text, pattern) {
  const normalized = pattern.toLocaleLowerCase('und');
  if (/[^\x00-\x7f]/.test(normalized)) return text.includes(normalized);
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, 'u').test(text);
}

function rankRoles(text, allowed, registry) {
  return registry.roles.map((candidate) => {
    const matches = candidate.patterns.filter((pattern) => containsPattern(text, pattern));
    const score = matches.reduce((total, pattern) => total + (pattern.includes(' ') || /[^\x00-\x7f]/.test(pattern) ? 4 : 2), 0);
    return { ...candidate, score, matches, available: allowed.has(candidate.id) };
  }).filter((candidate) => candidate.score > 0).sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
}

function compactChoices(records, ids, registry, limit = 4) {
  return ids.slice(0, limit).map((id) => {
    const role = records.find((record) => `${record.plane}/${record.id}` === id);
    const classified = registry.roles.find((candidate) => candidate.id === id);
    return { plane: role.plane, role: role.id, mode: classified?.default_mode || role.modes[0] };
  });
}

function clarification({ descriptor, kind, signals, records, registry, allowed, ranked = [], mandatory = [], viewKind, generation }) {
  let choiceIds;
  if (kind === 'protected') {
    const production = records.filter((record) => record.plane === 'production').map((record) => `${record.plane}/${record.id}`);
    choiceIds = [...production, 'development/maintainer'].filter((id, index, values) => values.indexOf(id) === index);
  } else if (ranked.length) {
    choiceIds = ranked.map((candidate) => candidate.id);
  } else {
    choiceIds = [...allowed];
  }
  const choices = compactChoices(records, choiceIds, registry);
  const unavailable = choices.filter((choice) => !allowed.has(`${choice.plane}/${choice.role}`)).map((choice) => `${choice.plane}/${choice.role}`);
  const record = {
    status: 'clarification_required',
    kind,
    signals: signals.slice(0, 4),
    choices,
    ...(unavailable.length ? { required_expansion: unavailable } : {}),
    union_loaded: false,
    authority_granted: false,
    token_estimate_method: ESTIMATOR,
  };
  const budget = descriptor.schema_version === 2 ? descriptor.context.clarification_max_tokens : 160;
  record.token_estimate = tokenEstimate(canonicalJson(record));
  if (record.token_estimate > budget) {
    record.signals = record.signals.slice(0, 1);
    record.choices = record.choices.slice(0, 2);
    if (record.required_expansion) record.required_expansion = record.required_expansion.slice(0, 2);
    record.token_estimate = tokenEstimate(canonicalJson(record));
  }
  if (record.token_estimate > budget) throw new UserError('clarification framing exceeds its token budget', 'context_budget_exceeded');
  const contentTokens = mandatory.reduce((total, entry) => total + entry.tokens, 0);
  const enriched = {
    ...record,
    project_id: descriptor.project_id,
    variant: descriptor.schema_version === 2 ? descriptor.variant : 'legacy-v2',
    selected_ids: mandatory.map((entry) => entry.id),
    mandatory_ids: mandatory.map((entry) => entry.id),
    selected_sources: mandatory.map((entry) => ({ id: entry.id, hash: entry.hash, tokens: entry.tokens, content: entry.content })),
    release: descriptor.schema_version === 2 ? descriptor.release : descriptor.provider,
    source_observation: { intended: true, host_observed: viewKind === 'packed', model_effective: 'unknown' },
    ambiguity: true,
    ...(generation ? { generation } : {}),
  };
  const maxTokens = descriptor.schema_version === 2 ? descriptor.context.max_tokens : 2048;
  enriched.budgets = { content_tokens: contentTokens, clarification_tokens: record.token_estimate, context_tokens: 0, json_tokens: 0, aggregate_tokens: 0, max_tokens: maxTokens };
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const exactTokens = tokenEstimate(canonicalJson(enriched));
    enriched.budgets.context_tokens = exactTokens;
    enriched.budgets.json_tokens = exactTokens;
    enriched.budgets.aggregate_tokens = exactTokens;
  }
  const aggregateTokens = enriched.budgets.aggregate_tokens;
  if (aggregateTokens > maxTokens) throw new UserError(`clarification aggregate token budget exceeded: ${aggregateTokens} > ${maxTokens}`, 'context_budget_exceeded', {
    mandatory_tokens: contentTokens,
    clarification_tokens: record.token_estimate,
    max_tokens: maxTokens,
  });
  return enriched;
}

function viewRevision(descriptor) {
  return `sha256:${sha256(canonicalJson({
    project_id: descriptor.project_id,
    release: descriptor.release,
    documents: descriptor.documents,
    policy: descriptor.policy,
  }))}`;
}

function generationHandle(descriptor, key, now = Date.now()) {
  const payload = {
    schema_version: 1,
    project_id: descriptor.project_id,
    digest: descriptor.release.digest,
    selected_view_revision: viewRevision(descriptor),
    created_at_ms: now,
    expires_at_ms: now + HANDLE_TTL_MS,
  };
  const encoded = Buffer.from(canonicalJson(payload)).toString('base64url');
  return `${encoded}.${hmacSha256(key, encoded)}`;
}

function verifyGeneration(handle, descriptor, key, now = Date.now()) {
  const [encoded, checksum, extra] = String(handle || '').split('.');
  if (!encoded || !checksum || extra || hmacSha256(key, encoded) !== checksum) throw new UserError('generation handle is invalid', 'generation_mismatch');
  let payload;
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    throw new UserError('generation handle is invalid', 'generation_mismatch');
  }
  if (payload.project_id !== descriptor.project_id || payload.digest !== descriptor.release.digest || payload.selected_view_revision !== viewRevision(descriptor)) {
    throw new UserError('generation handle belongs to another project or selected view', 'generation_mismatch');
  }
  if (!Number.isSafeInteger(payload.expires_at_ms) || payload.expires_at_ms < now) throw new UserError('generation handle has expired', 'generation_expired');
  return payload;
}

function sourceView(packageRoot, descriptor) {
  if (descriptor.schema_version === 2) return sourceContentView(packageRoot, descriptor);
  const catalog = readCatalog(packageRoot);
  const byId = new Map(catalog.map((entry) => [entry.id, entry]));
  return {
    kind: 'source',
    catalog,
    fullCatalog: catalog,
    allowedIds: new Set(catalog.map((entry) => entry.id)),
    load(id) {
      const entry = byId.get(id);
      if (!entry) throw new UserError(`catalog entry not found: ${id}`, 'catalog_miss');
      return loadCatalogEntry(packageRoot, entry);
    },
  };
}

function mandatoryOnly(descriptor, view) {
  return descriptor.policy.mandatory.map((id) => {
    if (!view.allowedIds.has(id)) throw new UserError(`mandatory ID is outside the selected view: ${id}`, 'selected_view_escape');
    return view.load(id);
  });
}

export function compileContext(packageRoot, descriptor, request = {}) {
  const records = roleRecords(packageRoot);
  const registry = classifier(packageRoot);
  const allowed = new Set(selectedRoles(descriptor, records));
  const view = request.contentView || (request.packed ? packedContentView(packageRoot, descriptor) : sourceView(packageRoot, descriptor));
  const sharedPinned = descriptor.schema_version === 2 && descriptor.variant === 'shared-runtime.pinned';
  if (sharedPinned && !Buffer.isBuffer(request.generationKey)) throw new UserError('shared context requires the installed generation key', 'generation_key_missing');
  if (sharedPinned && request.generation) verifyGeneration(request.generation, descriptor, request.generationKey);
  const generation = sharedPinned
    ? (request.generation || generationHandle(descriptor, request.generationKey))
    : undefined;
  const mandatory = mandatoryOnly(descriptor, view);

  let selected;
  let selectionReason;
  let matchedSignals = [];
  if (request.role || request.mode) {
    if (!request.role || !request.mode) throw new UserError('context requires role and mode together', 'route_conflict');
    selected = exactRole(records, allowed, request.role, request.plane);
    if (!selected.modes.includes(request.mode)) throw new UserError(`unsupported mode ${request.mode} for role ${selected.id}`, 'route_conflict');
    selectionReason = { kind: 'explicit', score: null, matches: [] };
  } else {
    const text = [request.task || '', request.pathHint || ''].join(' ').normalize('NFKC').toLocaleLowerCase('und');
    matchedSignals = registry.protected_patterns.filter((pattern) => containsPattern(text, pattern));
    if (matchedSignals.length) return clarification({ descriptor, kind: 'protected', signals: matchedSignals, records, registry, allowed, mandatory, viewKind: view.kind, generation });
    const ranked = rankRoles(text, allowed, registry);
    if (ranked.length === 0 || !ranked[0].available || (ranked[1] && ranked[0].score - ranked[1].score < 2)) {
      return clarification({ descriptor, kind: 'ordinary-ambiguity', signals: ranked.slice(0, 2).flatMap((candidate) => candidate.matches), records, registry, allowed, ranked, mandatory, viewKind: view.kind, generation });
    }
    selected = exactRole(records, allowed, ranked[0].id);
    request = { ...request, mode: ranked[0].default_mode };
    selectionReason = { kind: 'lexical', score: ranked[0].score, matches: ranked[0].matches };
  }

  const mode = request.mode;
  const resolution = resolveRoute(packageRoot, compatibilityDescriptor(descriptor), {
    plane: selected.plane,
    role: selected.id,
    mode,
    task: '',
    pathHint: '',
    catalog: view.fullCatalog,
    loadEntry: (id) => view.load(id),
    allowedIds: view.allowedIds,
  });
  const loaded = resolution.exact.map((id) => view.load(id));
  const maxTokens = descriptor.schema_version === 2 ? descriptor.context.max_tokens : 2048;
  const mandatoryIds = new Set(descriptor.policy.mandatory);
  const ordered = [];
  const seen = new Set();
  for (const entry of [...mandatory, ...loaded]) {
    if (!seen.has(entry.id)) {
      seen.add(entry.id);
      ordered.push(entry);
    }
  }
  const contentTokens = ordered.reduce((total, entry) => total + entry.tokens, 0);
  const result = {
    status: 'ready',
    project_id: descriptor.project_id,
    variant: descriptor.schema_version === 2 ? descriptor.variant : 'legacy-v2',
    plane: selected.plane,
    role: selected.id,
    mode,
    selection_reason: selectionReason,
    selected_ids: ordered.map((entry) => entry.id),
    mandatory_ids: ordered.filter((entry) => mandatoryIds.has(entry.id)).map((entry) => entry.id),
    token_estimate_method: ESTIMATOR,
    selected_sources: ordered.map((entry) => ({ id: entry.id, hash: entry.hash, tokens: entry.tokens, content: entry.content })),
    budgets: { content_tokens: contentTokens, context_tokens: 0, json_tokens: 0, aggregate_tokens: 0, max_tokens: maxTokens },
    release: descriptor.schema_version === 2 ? descriptor.release : descriptor.provider,
    source_observation: { intended: true, host_observed: view.kind === 'packed', model_effective: 'unknown' },
    ambiguity: false,
    union_loaded: false,
    ...(generation ? { generation } : {}),
  };
  result.budgets.context_tokens = tokenEstimate(renderContext(result));
  for (let iteration = 0; iteration < 3; iteration += 1) {
    result.budgets.json_tokens = tokenEstimate(canonicalJson(result));
    result.budgets.aggregate_tokens = Math.max(result.budgets.context_tokens, result.budgets.json_tokens);
  }
  if (result.budgets.aggregate_tokens > maxTokens) throw new UserError(`context aggregate token budget exceeded: ${result.budgets.aggregate_tokens} > ${maxTokens}`, 'context_budget_exceeded', {
    mandatory_tokens: mandatory.reduce((total, entry) => total + entry.tokens, 0),
    content_tokens: contentTokens,
    context_tokens: result.budgets.context_tokens,
    json_tokens: result.budgets.json_tokens,
    max_tokens: maxTokens,
  });
  return result;
}

export function renderContext(result) {
  if (result.status === 'clarification_required') return `${canonicalJson(result)}`;
  const header = [
    `APG context: ${result.plane}/${result.role} (${result.mode})`,
    `Release: ${result.release.digest}`,
    `Sources: ${result.selected_ids.join(', ')}`,
    '',
  ].join('\n');
  return `${header}${result.selected_sources.map((source) => `[${source.id}]\n${source.content.trimEnd()}`).join('\n\n')}\n`;
}

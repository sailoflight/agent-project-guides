import fs from 'node:fs';
import path from 'node:path';
import { loadCatalogEntry, readCatalog, resolveRoute } from './catalog.mjs';
import { packedContentView, sourceContentView } from './closure.mjs';
import { UserError, canonicalJson, sha256 } from './core.mjs';
import { hmacSha256 } from './crypto.mjs';

const ESTIMATOR = 'utf8-bytes/4-ceiling';
const HANDLE_TTL_MS = 15 * 60 * 1000;
const V3_OPERATOR_MODES = new Set(['observe-health', 'deploy', 'configure', 'restart', 'recover', 'rollback']);

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

function validateClassifier(records, registry) {
  for (const candidate of registry.roles) {
    const role = records.find((record) => `${record.plane}/${record.id}` === candidate.id);
    if (!role || !role.modes.includes(candidate.default_mode)) throw new UserError(`context classifier default mode is invalid: ${candidate.id}/${candidate.default_mode}`, 'invalid_registry');
    for (const [mode, patterns] of Object.entries(candidate.mode_patterns || {})) {
      if (!role.modes.includes(mode) || !Array.isArray(patterns) || patterns.some((pattern) => typeof pattern !== 'string' || !pattern)) throw new UserError(`context classifier mode patterns are invalid: ${candidate.id}/${mode}`, 'invalid_registry');
    }
  }
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

function routeShape(record, mode) {
  return { plane: record.plane, role: record.id, mode };
}

function routeHash(route) {
  return `sha256:${sha256(canonicalJson(route))}`;
}

function routeChoiceId(route) {
  return `${route.plane}.${route.role}.${route.mode}`;
}

function exactRole(records, allowed, requested, plane) {
  const key = requested.trim().toLocaleLowerCase('und');
  const allMatches = records.filter((record) => {
    const canonical = `${record.plane}/${record.id}`;
    return [record.id, canonical, ...(record.aliases || [])].some((value) => value.toLocaleLowerCase('und') === key);
  });
  const planeRecords = plane ? records.filter((record) => record.plane === plane) : records;
  const globalMatches = allMatches.filter((record) => !plane || record.plane === plane);
  const matches = globalMatches.filter((record) => allowed.has(`${record.plane}/${record.id}`));
  if (matches.length !== 1) throw new UserError(`role must resolve exactly once inside the selected view: ${requested}`, 'route_unresolved', {
    match_count: matches.length,
    registry_match_count: allMatches.length,
    matched_routes: allMatches.map((record) => ({ plane: record.plane, role: record.id, plane_match: !plane || record.plane === plane, available: allowed.has(`${record.plane}/${record.id}`), modes: record.modes })),
    failed_field: 'role',
    received: requested,
    allowed_values: planeRecords.filter((record) => allowed.has(`${record.plane}/${record.id}`)).flatMap((record) => [record.id, `${record.plane}/${record.id}`]),
  });
  return matches[0];
}

function allowedModes(selected, schemaVersion) {
  if (schemaVersion === 2 && selected.plane === 'production' && selected.id === 'operator') return selected.modes.filter((mode) => V3_OPERATOR_MODES.has(mode));
  return selected.modes;
}

function assertMode(selected, mode, schemaVersion) {
  const modes = allowedModes(selected, schemaVersion);
  if (!modes.includes(mode)) throw new UserError(`unsupported mode ${mode} for role ${selected.id}`, 'route_unresolved', {
    match_count: 0,
    role_match_count: 1,
    matched_routes: modes.map((candidateMode) => routeShape(selected, candidateMode)),
    failed_field: 'mode',
    received: mode,
    allowed_values: modes,
  });
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

function rankedModes(classified, signals, fallback) {
  const candidates = Object.entries(classified?.mode_patterns || {}).map(([mode, patterns]) => ({
    mode,
    matches: patterns.filter((pattern) => signals.some((signal) => containsPattern(signal, pattern))),
  })).filter((candidate) => candidate.matches.length).sort((left, right) => right.matches.length - left.matches.length || left.mode.localeCompare(right.mode));
  return candidates.length ? candidates : [{ mode: classified?.default_mode || fallback, matches: [] }];
}

function inferredMode(classified, signals, fallback) {
  return rankedModes(classified, signals, fallback)[0].mode;
}

function buildChoices(records, ids, registry, allowed, signals, kind, conflictReason, inferenceText = '') {
  const available = [];
  const unavailable = [];
  for (const id of ids.filter((value, index, values) => values.indexOf(value) === index)) {
    const role = records.find((record) => `${record.plane}/${record.id}` === id);
    if (!role) continue;
    const classified = registry.roles.find((candidate) => candidate.id === id);
    const inferenceSignals = inferenceText ? [inferenceText] : signals;
    const modeCandidates = kind === 'protected' ? rankedModes(classified, inferenceSignals, role.modes[0]) : [{ mode: inferredMode(classified, inferenceSignals, role.modes[0]) }];
    for (const { mode } of modeCandidates) {
      const route = routeShape(role, mode);
      const matchedRules = [
        ...(kind === 'protected' ? signals.map((signal) => `protected-pattern:${signal}`) : []),
        ...(classified?.patterns || []).filter((pattern) => inferenceSignals.some((signal) => containsPattern(signal, pattern))).map((pattern) => `role-pattern:${pattern}`),
        ...((classified?.mode_patterns || {})[mode] || []).filter((pattern) => inferenceSignals.some((signal) => containsPattern(signal, pattern))).map((pattern) => `mode-pattern:${pattern}`),
      ];
      if (!allowed.has(id)) {
        unavailable.push({ ...route, reason: 'role is outside the descriptor selected view' });
        continue;
      }
      available.push({
        choice_id: routeChoiceId(route),
        route,
        route_hash: routeHash(route),
        matched_rules: [...new Set(matchedRules)],
        conflict_reason: conflictReason || (kind === 'protected'
          ? 'protected effects require an explicit production/development route choice; routing does not grant authority'
          : 'multiple lexical routes matched without a decisive score'),
      });
    }
  }
  return { choices: available, unavailable };
}

function legacyClarification({ descriptor, kind, signals, records, registry, allowed, ranked, mandatory, viewKind }) {
  let choiceIds;
  if (kind === 'protected') {
    const production = records.filter((record) => record.plane === 'production').map((record) => `${record.plane}/${record.id}`);
    choiceIds = [...production, 'development/maintainer'];
  } else if (ranked.length) choiceIds = ranked.map((candidate) => candidate.id);
  else choiceIds = [...allowed];
  const choices = choiceIds.slice(0, 4).map((id) => {
    const role = records.find((record) => `${record.plane}/${record.id}` === id);
    const classified = registry.roles.find((candidate) => candidate.id === id);
    return { plane: role.plane, role: role.id, mode: classified?.default_mode || role.modes[0] };
  });
  const record = {
    status: 'clarification_required',
    kind,
    signals: signals.slice(0, 4),
    choices,
    ...(choices.some((choice) => !allowed.has(`${choice.plane}/${choice.role}`)) ? { required_expansion: choices.filter((choice) => !allowed.has(`${choice.plane}/${choice.role}`)).map((choice) => `${choice.plane}/${choice.role}`) } : {}),
    union_loaded: false,
    authority_granted: false,
    token_estimate_method: ESTIMATOR,
  };
  record.token_estimate = tokenEstimate(canonicalJson(record));
  if (record.token_estimate > 160) {
    record.signals = record.signals.slice(0, 1);
    record.choices = record.choices.slice(0, 2);
    if (record.required_expansion) record.required_expansion = record.required_expansion.slice(0, 2);
    record.token_estimate = tokenEstimate(canonicalJson(record));
  }
  if (record.token_estimate > 160) throw new UserError('clarification framing exceeds its token budget', 'context_budget_exceeded');
  const contentTokens = mandatory.reduce((total, entry) => total + entry.tokens, 0);
  const enriched = {
    ...record,
    project_id: descriptor.project_id,
    variant: 'legacy-v2',
    selected_ids: mandatory.map((entry) => entry.id),
    mandatory_ids: mandatory.map((entry) => entry.id),
    selected_sources: mandatory.map((entry) => ({ id: entry.id, hash: entry.hash, tokens: entry.tokens, content: entry.content })),
    release: descriptor.provider,
    source_observation: { intended: true, host_observed: viewKind === 'packed', model_effective: 'unknown' },
    ambiguity: true,
  };
  enriched.budgets = { content_tokens: contentTokens, clarification_tokens: record.token_estimate, context_tokens: 0, json_tokens: 0, aggregate_tokens: 0, max_tokens: 2048 };
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const exactTokens = tokenEstimate(canonicalJson(enriched));
    enriched.budgets.context_tokens = exactTokens;
    enriched.budgets.json_tokens = exactTokens;
    enriched.budgets.aggregate_tokens = exactTokens;
  }
  if (enriched.budgets.aggregate_tokens > 2048) throw new UserError('clarification aggregate token budget exceeded', 'context_budget_exceeded');
  return enriched;
}

function clarification(options) {
  const { descriptor, kind, signals, records, registry, allowed, ranked = [], mandatory = [], viewKind, generationKey, conflictReason, inferenceText = '' } = options;
  if (descriptor.schema_version === 1) return legacyClarification({ descriptor, kind, signals, records, registry, allowed, ranked, mandatory, viewKind });
  let choiceIds;
  if (kind === 'protected') {
    const production = records.filter((record) => record.plane === 'production').map((record) => `${record.plane}/${record.id}`);
    choiceIds = [...production, 'development/maintainer'];
  } else if (ranked.length) {
    choiceIds = ranked.map((candidate) => candidate.id);
  } else {
    choiceIds = [...allowed];
  }
  const built = buildChoices(records, choiceIds, registry, allowed, signals, kind, conflictReason, inferenceText);
  const selectedChoices = built.choices.slice(0, 4);
  const omittedChoiceIds = built.choices.slice(4).map((choice) => choice.choice_id);
  const generation = generationKey && selectedChoices.length ? generationHandle(descriptor, generationKey, selectedChoices) : undefined;
  const choices = selectedChoices.map((choice) => ({
    ...choice,
    next_command: generation
      ? `apg context --generation ${generation} --select ${choice.choice_id}`
      : `apg context --plane ${choice.route.plane} --role ${choice.route.role} --mode ${choice.route.mode}`,
  }));
  const record = {
    status: 'clarification_required',
    route_resolved: false,
    kind,
    signals: signals.slice(0, 4),
    choices,
    choices_truncated: omittedChoiceIds.length > 0,
    ...(omittedChoiceIds.length ? { omitted_choice_ids: omittedChoiceIds } : {}),
    ...(built.unavailable.length ? { required_expansion: built.unavailable } : {}),
    union_loaded: false,
    authority_granted: false,
    token_estimate_method: ESTIMATOR,
  };
  const budget = descriptor.schema_version === 2 ? descriptor.context.clarification_max_tokens : 2048;
  record.token_estimate = tokenEstimate(canonicalJson(record));
  if (record.token_estimate > budget) throw new UserError('clarification framing exceeds its token budget', 'context_budget_exceeded', {
    clarification_tokens: record.token_estimate,
    max_tokens: budget,
    choice_count: record.choices.length,
  });
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
  const maxTokens = descriptor.schema_version === 2 ? descriptor.context.max_tokens : 4096;
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

function generationHandle(descriptor, key, choices = [], now = Date.now()) {
  const payload = {
    schema_version: 2,
    project_id: descriptor.project_id,
    digest: descriptor.release.digest,
    selected_view_revision: viewRevision(descriptor),
    choices: choices.map((choice) => ({ choice_id: choice.choice_id, route: choice.route, route_hash: choice.route_hash })),
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
  validateClassifier(records, registry);
  const allowed = new Set(selectedRoles(descriptor, records));
  const view = request.contentView || (request.packed ? packedContentView(packageRoot, descriptor) : sourceView(packageRoot, descriptor));
  const sharedPinned = descriptor.schema_version === 2 && descriptor.variant === 'shared-runtime.pinned';
  if (sharedPinned && !Buffer.isBuffer(request.generationKey)) throw new UserError('shared context requires the installed generation key', 'generation_key_missing');
  if (request.plane && !['production', 'development'].includes(request.plane)) throw new UserError(`unsupported plane: ${request.plane}`, 'route_unresolved', {
    match_count: 0,
    matched_routes: [],
    failed_field: 'plane',
    received: request.plane,
    allowed_values: ['production', 'development'],
  });
  const verifiedGeneration = sharedPinned && request.generation ? verifyGeneration(request.generation, descriptor, request.generationKey) : undefined;
  const generationChoices = Array.isArray(verifiedGeneration?.choices) ? verifiedGeneration.choices : [];
  if (generationChoices.length && !request.select) throw new UserError('this generation requires --select with one signed choice', 'selection_required', {
    match_count: 0,
    failed_field: 'select',
    received: null,
    allowed_values: generationChoices.map((choice) => choice.choice_id),
  });
  if (request.select) {
    if (!verifiedGeneration) throw new UserError('--select requires a valid --generation', 'selection_requires_generation');
    const choices = generationChoices;
    const matches = choices.filter((choice) => choice.choice_id === request.select);
    if (matches.length !== 1 || routeHash(matches[0].route) !== matches[0].route_hash) throw new UserError('selected choice does not belong to this generation', 'choice_unresolved', {
      match_count: matches.length,
      failed_field: 'select',
      received: request.select,
      allowed_values: choices.map((choice) => choice.choice_id),
    });
    request = { ...request, ...matches[0].route, task: '', pathHint: '' };
  }
  const mandatory = mandatoryOnly(descriptor, view);

  let selected;
  let selectionReason;
  let matchedSignals = [];
  if (request.role || request.mode || request.plane || request.select) {
    if (!request.role || !request.mode) throw new UserError('explicit context requires role and mode together', 'route_conflict', {
      match_count: 0,
      matched_routes: [],
      failed_field: !request.role ? 'role' : 'mode',
      received: !request.role ? request.role : request.mode,
      allowed_values: !request.role ? [...allowed] : [],
    });
    selected = exactRole(records, allowed, request.role, request.plane);
    assertMode(selected, request.mode, descriptor.schema_version);
    selectionReason = { kind: request.select ? 'generation-choice' : 'explicit', score: null, matches: [] };
  } else {
    const text = [request.task || '', request.pathHint || ''].join(' ').normalize('NFKC').toLocaleLowerCase('und');
    matchedSignals = registry.protected_patterns.filter((pattern) => containsPattern(text, pattern));
    if (matchedSignals.length) return clarification({ descriptor, kind: 'protected', signals: matchedSignals, records, registry, allowed, mandatory, viewKind: view.kind, generationKey: sharedPinned ? request.generationKey : undefined, inferenceText: text });
    const ranked = rankRoles(text, allowed, registry);
    if (ranked.length === 0 || !ranked[0].available || (ranked[1] && ranked[0].score - ranked[1].score < 2)) {
      const conflictReason = ranked.length === 0
        ? 'no lexical routing rule matched the request'
        : !ranked[0].available
          ? 'the highest-scoring lexical route is outside the descriptor selected view'
          : 'multiple lexical routes matched within the decisive score threshold';
      return clarification({ descriptor, kind: 'ordinary-ambiguity', signals: ranked.slice(0, 2).flatMap((candidate) => candidate.matches), records, registry, allowed, ranked, mandatory, viewKind: view.kind, generationKey: sharedPinned ? request.generationKey : undefined, conflictReason });
    }
    selected = exactRole(records, allowed, ranked[0].id);
    request = { ...request, mode: inferredMode(ranked[0], ranked[0].matches, ranked[0].default_mode) };
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
  const route = routeShape(selected, mode);
  const generation = sharedPinned ? (request.generation || generationHandle(descriptor, request.generationKey)) : undefined;
  const result = {
    status: 'ready',
    route_resolved: true,
    authority_granted: false,
    project_id: descriptor.project_id,
    variant: descriptor.schema_version === 2 ? descriptor.variant : 'legacy-v2',
    route,
    route_hash: routeHash(route),
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
    `Route resolved: ${result.route_resolved}`,
    `Authority granted: ${result.authority_granted}`,
    `Release: ${result.release.digest}`,
    `Sources: ${result.selected_ids.join(', ')}`,
    '',
  ].join('\n');
  return `${header}${result.selected_sources.map((source) => `[${source.id}]\n${source.content.trimEnd()}`).join('\n\n')}\n`;
}

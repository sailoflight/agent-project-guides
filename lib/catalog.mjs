import fs from 'node:fs';
import path from 'node:path';
import { UserError, canonicalJson, normalizeRelative, resolveInside, sha256 } from './core.mjs';
import { selectContextRoute, validateContextRoutes } from './context-routes.mjs';

const CONTENT_ROOTS = new Map([
  ['bootstrap', 'bootstrap'],
  ['roles', 'role'],
  ['procedures', 'procedure'],
  ['profiles', 'profile'],
  ['templates', 'template'],
  ['docs', 'reference'],
]);

function walkMarkdown(root, relative) {
  const absolute = path.join(root, relative);
  if (!fs.statSync(absolute, { throwIfNoEntry: false })?.isDirectory()) return [];
  const output = [];
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const child = `${relative}/${entry.name}`;
    if (entry.isSymbolicLink()) throw new UserError(`catalog source is a symlink: ${child}`, 'invalid_catalog');
    if (entry.isDirectory()) output.push(...walkMarkdown(root, child));
    else if (entry.isFile() && entry.name.endsWith('.md')) output.push(child);
  }
  return output;
}

function slug(value) {
  const normalized = value.normalize('NFKC').toLocaleLowerCase('und')
    .replace(/[`*_~[\](){}<>:]/g, ' ')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || `section-${sha256(value).slice(0, 10)}`;
}

function readRegistryIfPresent(packageRoot, relative) {
  const file = path.join(packageRoot, relative);
  if (!fs.statSync(file, { throwIfNoEntry: false })?.isFile()) return [];
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);
}

function semanticIds(packageRoot) {
  const ids = new Map();
  for (const relative of ['routing/production.roles.jsonl', 'routing/development.roles.jsonl']) {
    for (const record of readRegistryIfPresent(packageRoot, relative)) {
      ids.set(record.guide, `role:${record.plane}/${record.id}`);
      for (const procedure of Object.values(record.procedure_by_mode || {})) {
        if (!ids.has(procedure)) ids.set(procedure, `procedure:${slug(path.basename(procedure, '.md'))}`);
      }
    }
  }
  for (const record of readRegistryIfPresent(packageRoot, 'routing/facets.jsonl')) ids.set(record.profile, `profile:${record.id}`);
  for (const record of readRegistryIfPresent(packageRoot, 'routing/domain-overlays.jsonl')) ids.set(record.guide, `overlay:${record.id}`);
  for (const record of readRegistryIfPresent(packageRoot, 'routing/mcp-subtypes.jsonl')) ids.set(record.spec, `profile:mcp/${record.id}`);
  ids.set('bootstrap/AGENTS.v2-block.md', 'bootstrap:dsh-v2');
  ids.set('bootstrap/AGENTS.routing-block.md', 'bootstrap:legacy-routing');
  ids.set('bootstrap/AGENTS.adapter-trigger.md', 'bootstrap:legacy-adaptation-trigger');
  ids.set('bootstrap/CLAUDE.scope-block.md', 'bootstrap:legacy-claude-scope');
  return ids;
}

function baseId(kind, relative, overrides) {
  if (overrides.has(relative)) return overrides.get(relative);
  const withoutRoot = relative.split('/').slice(1).join('/').replace(/\.md$/i, '');
  return `${kind}:${withoutRoot.split('/').map(slug).join('/')}`;
}

function firstPurpose(lines, start = 0, end = lines.length) {
  for (let index = start; index < end; index += 1) {
    const line = lines[index].trim();
    if (!line || line.startsWith('#') || line.startsWith('>') || line.startsWith('```') || line.startsWith('|')) continue;
    return line.replace(/^[-*]\s+/, '').slice(0, 240);
  }
  return 'Canonical package guidance.';
}

function sectionRanges(lines) {
  const headings = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(lines[index]);
    if (match) headings.push({ index, level: match[1].length, title: match[2] });
  }
  return headings.map((heading, position) => {
    let end = lines.length;
    for (let next = position + 1; next < headings.length; next += 1) {
      if (headings[next].level <= heading.level) {
        end = headings[next].index;
        break;
      }
    }
    return { ...heading, end };
  });
}

function entryFor({ id, kind, title, purpose, relative, section, content, tags }) {
  const bytes = Buffer.byteLength(content);
  return {
    id,
    kind,
    title,
    purpose,
    path: relative,
    section,
    hash: `sha256:${sha256(content)}`,
    bytes,
    tokens: Math.ceil(bytes / 4),
    tags: [...new Set(tags)].sort(),
  };
}

export function buildCatalog(packageRoot) {
  const entries = [];
  const ids = new Set();
  const overrides = semanticIds(packageRoot);
  for (const [directory, kind] of CONTENT_ROOTS) {
    for (const relative of walkMarkdown(packageRoot, directory)) {
      const content = fs.readFileSync(path.join(packageRoot, relative), 'utf8');
      const lines = content.split(/\r?\n/);
      const ranges = sectionRanges(lines);
      const documentTitle = ranges[0]?.title || path.basename(relative, '.md');
      const id = baseId(kind, relative, overrides);
      const tags = relative.toLocaleLowerCase('und').replace(/\.md$/, '').split('/');
      const document = entryFor({
        id,
        kind,
        title: documentTitle,
        purpose: firstPurpose(lines),
        relative,
        section: '',
        content,
        tags,
      });
      if (ids.has(document.id)) throw new UserError(`duplicate catalog id: ${document.id}`, 'invalid_catalog');
      ids.add(document.id);
      entries.push(document);

      for (const range of ranges.filter((item) => item.level >= 2)) {
        const sectionContent = `${lines.slice(range.index, range.end).join('\n').replace(/\n*$/, '')}\n`;
        const sectionId = `${id}#${slug(range.title)}`;
        const section = entryFor({
          id: sectionId,
          kind,
          title: range.title,
          purpose: firstPurpose(lines, range.index + 1, range.end),
          relative,
          section: range.title,
          content: sectionContent,
          tags: [...tags, slug(range.title)],
        });
        if (ids.has(section.id)) throw new UserError(`duplicate catalog id: ${section.id}`, 'invalid_catalog');
        ids.add(section.id);
        entries.push(section);
      }
    }
  }
  return entries.sort((left, right) => left.id.localeCompare(right.id));
}

export function catalogJsonl(entries) {
  return entries.map((entry) => canonicalJson(entry).trimEnd()).join('\n') + '\n';
}

export function writeCatalog(packageRoot) {
  const entries = buildCatalog(packageRoot);
  const directory = path.join(packageRoot, 'catalog');
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, 'catalog.jsonl');
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporary, catalogJsonl(entries));
  fs.renameSync(temporary, file);
  return entries;
}

export function readCatalog(packageRoot) {
  const file = path.join(packageRoot, 'catalog', 'catalog.jsonl');
  if (!fs.statSync(file, { throwIfNoEntry: false })?.isFile()) return buildCatalog(packageRoot);
  const entries = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new UserError(`catalog/catalog.jsonl:${index + 1}: ${error.message}`, 'invalid_catalog');
    }
  });
  const ids = new Set();
  for (const entry of entries) {
    if (!entry?.id || ids.has(entry.id)) throw new UserError(`invalid or duplicate catalog id: ${entry?.id}`, 'invalid_catalog');
    ids.add(entry.id);
  }
  return entries;
}

function readJsonl(packageRoot, relative) {
  const file = resolveInside(packageRoot, normalizeRelative(relative, 'registry path'), 'registry path');
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new UserError(`${relative}:${index + 1}: ${error.message}`, 'invalid_registry');
    }
  });
}

function exactRecord(records, value, labels, field) {
  if (!value) return undefined;
  const key = value.trim().toLocaleLowerCase('und');
  const matches = records.filter((record) => labels(record).some((label) => String(label).trim().toLocaleLowerCase('und') === key));
  if (matches.length !== 1) throw new UserError(`${field} must resolve exactly once: ${value}`, 'route_unresolved');
  return matches[0];
}

function idForPath(entries, packagePath) {
  const match = entries.find((entry) => entry.path === packagePath && entry.section === '');
  if (!match) throw new UserError(`catalog has no document entry for ${packagePath}`, 'catalog_miss');
  return match.id;
}

export function resolveRoute(packageRoot, descriptor, {
  plane,
  role,
  mode,
  task = '',
  pathHint = '',
  catalog: catalogOverride = undefined,
  loadEntry = undefined,
  allowedIds = undefined,
} = {}) {
  if (mode && !role) throw new UserError('mode requires an exact role', 'route_conflict');
  if (role && !mode) throw new UserError('role requires an exact mode', 'route_conflict');
  const catalog = catalogOverride || readCatalog(packageRoot);
  const { routes: contextRoutes } = validateContextRoutes(packageRoot, catalog);
  const result = [];
  let selectedPlane;
  if (plane) {
    selectedPlane = exactRecord(readJsonl(packageRoot, 'routing/planes.jsonl'), plane, (record) => [record.id], 'plane');
  }
  let selectedRole;
  if (role) {
    const registries = selectedPlane ? [selectedPlane.roles] : ['routing/production.roles.jsonl', 'routing/development.roles.jsonl'];
    const records = registries.flatMap((registry) => readJsonl(packageRoot, registry));
    selectedRole = exactRecord(records, role, (record) => [record.id, ...(record.aliases || [])], 'role');
    if (selectedPlane && selectedRole.plane !== selectedPlane.id) throw new UserError('role does not belong to selected plane', 'route_conflict');
    if (mode && !selectedRole.modes.includes(mode)) throw new UserError(`unsupported mode ${mode} for role ${selectedRole.id}`, 'route_conflict');
    const roleId = idForPath(catalog, selectedRole.guide);
    const procedure = selectedRole.procedure_by_mode?.[mode];
    result.push(...selectContextRoute(contextRoutes, catalog, roleId, mode, { allowEmpty: Boolean(procedure) }));
    if (procedure) result.push(idForPath(catalog, procedure));
  }

  const effectivePlane = selectedRole?.plane || selectedPlane?.id;
  if (effectivePlane !== 'production') {
    const facets = readJsonl(packageRoot, 'routing/facets.jsonl');
    for (const facetId of descriptor.facets) {
      const facet = exactRecord(facets, facetId, (record) => [record.id], 'facet');
      const profileId = idForPath(catalog, facet.profile);
      result.push(...selectContextRoute(contextRoutes, catalog, profileId, mode));
    }
    const overlays = readJsonl(packageRoot, 'routing/domain-overlays.jsonl');
    for (const overlayId of descriptor.overlays || []) {
      const overlay = exactRecord(overlays, overlayId, (record) => [record.id], 'overlay');
      const guideId = idForPath(catalog, overlay.guide);
      result.push(...selectContextRoute(contextRoutes, catalog, guideId, mode));
    }
  }
  for (const mandatory of descriptor.policy.mandatory) {
    if (!catalog.some((entry) => entry.id === mandatory)) throw new UserError(`mandatory catalog entry is missing: ${mandatory}`, 'mandatory_missing');
    result.push(mandatory);
  }

  const exact = [...new Set(result)];
  if (allowedIds) {
    for (const id of exact) if (!allowedIds.has(id)) throw new UserError(`route selected content outside the selected view: ${id}`, 'selected_view_escape');
  }
  const verifyEntry = loadEntry || ((id) => loadCatalogEntry(packageRoot, catalog.find((entry) => entry.id === id)));
  const verifiedExact = exact.map((id) => verifyEntry(id));
  const query = [task, pathHint].filter(Boolean).join(' ');
  const searched = query ? searchCatalog(catalog, query, { limit: 4 }) : [];
  return {
    plane: selectedPlane?.id || selectedRole?.plane,
    role: selectedRole?.id,
    mode,
    exact,
    exact_token_estimate: verifiedExact.reduce((total, entry) => total + entry.tokens, 0),
    token_estimate_method: 'utf8-bytes/4-ceiling',
    suggested: searched.map((entry) => entry.id).filter((id) => !exact.includes(id) && (!allowedIds || allowedIds.has(id))),
  };
}

function queryTerms(query) {
  const normalized = query.normalize('NFKC').toLocaleLowerCase('und').trim();
  if (!normalized) return [];
  const split = normalized.split(/[^\p{Letter}\p{Number}._/-]+/u).filter(Boolean);
  return [...new Set([normalized, ...split])];
}

export function searchCatalog(entries, query, { limit = 8, kind = undefined } = {}) {
  const terms = queryTerms(query);
  if (terms.length === 0) return [];
  const ranked = entries
    .filter((entry) => !kind || entry.kind === kind)
    .map((entry) => {
      const id = entry.id.toLocaleLowerCase('und');
      const title = entry.title.toLocaleLowerCase('und');
      const text = `${id} ${title} ${entry.purpose} ${entry.path} ${(entry.tags || []).join(' ')}`.toLocaleLowerCase('und');
      let score = 0;
      for (const term of terms) {
        if (id === term) score += 100;
        if (id.includes(term)) score += 24;
        if (title.includes(term)) score += 16;
        if (text.includes(term)) score += 4;
      }
      return { entry, score };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.entry.id.localeCompare(right.entry.id));
  const results = [];
  const seenSources = new Set();
  for (const item of ranked) {
    if (seenSources.has(item.entry.path)) continue;
    seenSources.add(item.entry.path);
    results.push(item.entry);
    if (results.length === limit) break;
  }
  return results;
}

export function loadCatalogEntry(packageRoot, entry, expectedHash = undefined) {
  const relative = normalizeRelative(entry.path, 'catalog entry path');
  const file = resolveInside(packageRoot, relative, 'catalog entry path');
  if (!fs.statSync(file, { throwIfNoEntry: false })?.isFile()) throw new UserError(`catalog source disappeared: ${entry.id}`, 'stale_catalog');
  const content = fs.readFileSync(file, 'utf8');
  let loaded = content;
  if (entry.section) {
    const lines = content.split(/\r?\n/);
    const ranges = sectionRanges(lines);
    const range = ranges.find((item) => item.title === entry.section);
    if (!range) throw new UserError(`section disappeared: ${entry.id}`, 'stale_catalog');
    loaded = `${lines.slice(range.index, range.end).join('\n').replace(/\n*$/, '')}\n`;
  }
  const actual = `sha256:${sha256(loaded)}`;
  if (actual !== entry.hash) throw new UserError(`catalog hash is stale for ${entry.id}`, 'stale_catalog', { expected: entry.hash, actual });
  if (expectedHash && expectedHash !== actual) throw new UserError(`expected hash does not match ${entry.id}`, 'hash_mismatch', { expected: expectedHash, actual });
  return { ...entry, content: loaded };
}

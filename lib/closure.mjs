import fs from 'node:fs';
import path from 'node:path';
import { loadCatalogEntry, readCatalog } from './catalog.mjs';
import { validateContextRoutes } from './context-routes.mjs';
import { UserError, normalizeRelative, sha256 } from './core.mjs';
import { validateV3Descriptor } from './descriptor-v3.mjs';

function readJsonl(root, relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8').split(/\r?\n/).filter(Boolean).map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new UserError(`${relative}:${index + 1}: ${error.message}`, 'invalid_registry');
    }
  });
}

function documentEntry(catalog, id) {
  const entry = catalog.find((item) => item.id === id && item.section === '');
  if (!entry) throw new UserError(`catalog document entry is missing: ${id}`, 'catalog_miss');
  return entry;
}

function documentForId(catalog, id) {
  const entry = catalog.find((item) => item.id === id);
  if (!entry) throw new UserError(`catalog entry is missing: ${id}`, 'catalog_miss');
  return documentEntry(catalog, id.split('#')[0]);
}

function addModule(modules, paths, module) {
  if (modules.has(module.id)) throw new UserError(`duplicate closure module: ${module.id}`, 'closure_conflict');
  for (const sourcePath of module.paths) {
    const normalized = normalizeRelative(sourcePath, `module ${module.id} path`);
    const folded = normalized.toLocaleLowerCase('und');
    const existing = paths.get(folded);
    if (existing && existing.path !== normalized) throw new UserError(`closure path case collision: ${existing.path} / ${normalized}`, 'closure_conflict');
    if (existing && existing.owner !== module.id) throw new UserError(`closure path has duplicate ownership: ${normalized}`, 'closure_conflict');
    paths.set(folded, { path: normalized, owner: module.id });
  }
  modules.set(module.id, module);
}

function selectedSubjectIds(descriptor) {
  return new Set([
    ...descriptor.documents.roles.map((role) => `role:${role}`),
    ...descriptor.documents.profiles.map((profile) => `profile:${profile}`),
    ...descriptor.documents.overlays.map((overlay) => `overlay:${overlay}`),
  ]);
}

function subjectForCatalogId(id) {
  const base = id.split('#')[0];
  if (base.startsWith('role:') || base.startsWith('profile:') || base.startsWith('overlay:')) return base;
  return undefined;
}

export function buildSelectedClosure(packageRoot, descriptor, { includeContent = false } = {}) {
  validateV3Descriptor(descriptor, packageRoot);
  const catalog = readCatalog(packageRoot);
  const { routes } = validateContextRoutes(packageRoot, catalog);
  const development = readJsonl(packageRoot, 'routing/development.roles.jsonl');
  const production = readJsonl(packageRoot, 'routing/production.roles.jsonl');
  const profiles = readJsonl(packageRoot, 'routing/facets.jsonl');
  const overlays = readJsonl(packageRoot, 'routing/domain-overlays.jsonl');
  const modules = new Map();
  const ownedPaths = new Map();
  const subjects = selectedSubjectIds(descriptor);

  for (const selected of descriptor.documents.roles) {
    const [plane, roleId] = selected.split('/');
    const registry = plane === 'development' ? development : production;
    const matches = registry.filter((record) => record.id === roleId && record.plane === plane);
    if (matches.length !== 1) throw new UserError(`selected role is not registered exactly once: ${selected}`, 'closure_missing');
    const role = matches[0];
    const dependencies = [...new Set(Object.values(role.procedure_by_mode || {}).map((sourcePath) => {
      const procedure = documentForId(catalog, catalog.find((entry) => entry.path === sourcePath && entry.section === '')?.id || '');
      return `procedure-${procedure.id.replace(/^procedure:/, '')}`;
    }))];
    addModule(modules, ownedPaths, {
      id: `role-${plane}-${roleId}`,
      kind: 'role',
      subject: `role:${selected}`,
      paths: [role.guide],
      dependencies,
      reason: `selected role ${selected}`,
    });
    for (const sourcePath of Object.values(role.procedure_by_mode || {})) {
      const procedure = catalog.find((entry) => entry.path === sourcePath && entry.section === '');
      if (!procedure) throw new UserError(`role ${selected} references a missing procedure: ${sourcePath}`, 'closure_missing');
      const moduleId = `procedure-${procedure.id.replace(/^procedure:/, '')}`;
      if (!modules.has(moduleId)) addModule(modules, ownedPaths, {
        id: moduleId,
        kind: 'procedure',
        subject: procedure.id,
        paths: [sourcePath],
        dependencies: [],
        reason: `declared dependency of role ${selected}`,
      });
    }
  }

  for (const profileId of descriptor.documents.profiles) {
    const matches = profiles.filter((record) => record.id === profileId);
    if (matches.length !== 1) throw new UserError(`selected profile is not registered exactly once: ${profileId}`, 'closure_missing');
    addModule(modules, ownedPaths, {
      id: `profile-${profileId}`,
      kind: 'profile',
      subject: `profile:${profileId}`,
      paths: [matches[0].profile],
      dependencies: [],
      reason: `selected profile ${profileId}`,
    });
  }

  for (const overlayId of descriptor.documents.overlays) {
    const matches = overlays.filter((record) => record.id === overlayId);
    if (matches.length !== 1) throw new UserError(`selected overlay is not registered exactly once: ${overlayId}`, 'closure_missing');
    addModule(modules, ownedPaths, {
      id: `overlay-${overlayId}`,
      kind: 'overlay',
      subject: `overlay:${overlayId}`,
      paths: [matches[0].guide],
      dependencies: [],
      reason: `selected overlay ${overlayId}`,
    });
  }

  for (const mandatory of descriptor.policy.mandatory) {
    const owner = subjectForCatalogId(mandatory);
    if (owner && !subjects.has(owner)) throw new UserError(`mandatory ID escapes the selected view: ${mandatory}`, 'closure_escape');
    const document = documentForId(catalog, mandatory);
    const folded = document.path.toLocaleLowerCase('und');
    if (!ownedPaths.has(folded)) addModule(modules, ownedPaths, {
      id: `core-mandatory-${sha256(mandatory).slice(0, 12)}`,
      kind: 'mandatory',
      subject: mandatory,
      paths: [document.path],
      dependencies: [],
      reason: `project mandatory authority ${mandatory}`,
    });
  }

  const selectedPaths = new Set([...ownedPaths.values()].map((entry) => entry.path));
  const selectedCatalog = catalog.filter((entry) => selectedPaths.has(entry.path));
  for (const entry of selectedCatalog) loadCatalogEntry(packageRoot, entry);
  const allowedIds = new Set(selectedCatalog.map((entry) => entry.id));
  for (const mandatory of descriptor.policy.mandatory) if (!allowedIds.has(mandatory)) throw new UserError(`mandatory ID is outside selected closure: ${mandatory}`, 'closure_escape');

  const selectedRoutes = routes.filter((route) => subjects.has(route.id));
  for (const route of selectedRoutes) {
    const routeIds = [
      ...(route.default?.ids || []),
      ...Object.values(route.by_mode || {}).flatMap((plan) => plan.ids),
      ...((route.full_modes || []).length ? [route.id] : []),
    ];
    for (const id of routeIds) if (!allowedIds.has(id)) throw new UserError(`selected route ${route.id} references uninstalled content: ${id}`, 'closure_escape');
  }
  if (selectedRoutes.length !== subjects.size) {
    const found = new Set(selectedRoutes.map((route) => route.id));
    const missing = [...subjects].filter((subject) => !found.has(subject));
    throw new UserError(`selected view has missing context routes: ${missing.join(', ')}`, 'closure_missing');
  }

  const files = [...ownedPaths.values()].sort((left, right) => left.path.localeCompare(right.path)).map(({ path: sourcePath, owner }) => {
    const bytes = fs.readFileSync(path.join(packageRoot, sourcePath));
    return {
      source_path: sourcePath,
      installed_path: `managed/${sourcePath}`,
      owner,
      bytes: bytes.length,
      sha256: `sha256:${sha256(bytes)}`,
      ...(includeContent ? { content: bytes } : {}),
    };
  });

  const optionalModuleIds = [
    ...development.map((role) => `role-development-${role.id}`),
    ...production.map((role) => `role-production-${role.id}`),
    ...profiles.map((profile) => `profile-${profile.id}`),
    ...overlays.map((overlay) => `overlay-${overlay.id}`),
    ...[...new Set([...development, ...production].flatMap((role) => Object.values(role.procedure_by_mode || {})))].map((sourcePath) => {
      const procedure = catalog.find((entry) => entry.path === sourcePath && entry.section === '');
      if (!procedure) throw new UserError(`registered procedure is missing from catalog: ${sourcePath}`, 'closure_missing');
      return `procedure-${procedure.id.replace(/^procedure:/, '')}`;
    }),
  ];

  return {
    schema_version: 1,
    variant: descriptor.variant,
    release: descriptor.release,
    selected_view: {
      lifecycle: descriptor.documents.lifecycle,
      roles: descriptor.documents.roles,
      profiles: descriptor.documents.profiles,
      overlays: descriptor.documents.overlays,
      mandatory: descriptor.policy.mandatory,
    },
    modules: [...modules.values()].sort((left, right) => left.id.localeCompare(right.id)),
    files,
    routes: selectedRoutes,
    catalog: selectedCatalog,
    allowed_ids: [...allowedIds].sort(),
    excluded_optional_modules: optionalModuleIds.filter((id) => !modules.has(id)).sort(),
  };
}

export function sourceContentView(packageRoot, descriptor) {
  const closure = buildSelectedClosure(packageRoot, descriptor);
  const byId = new Map(closure.catalog.map((entry) => [entry.id, entry]));
  return {
    kind: 'source',
    catalog: closure.catalog,
    fullCatalog: readCatalog(packageRoot),
    allowedIds: new Set(closure.allowed_ids),
    load(id) {
      const entry = byId.get(id);
      if (!entry) throw new UserError(`context ID is outside selected view: ${id}`, 'selected_view_escape');
      return loadCatalogEntry(packageRoot, entry);
    },
  };
}

export function packedContentView(runtimeRoot, descriptor) {
  const file = path.join(runtimeRoot, 'content', 'content.pack.json');
  if (!fs.statSync(file, { throwIfNoEntry: false })?.isFile()) throw new UserError('shared packed content is missing', 'package_missing');
  const pack = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (pack.schema_version !== 1 || pack.source_digest !== descriptor.release.digest || !Array.isArray(pack.entries)) throw new UserError('shared packed content does not match the descriptor', 'release_mismatch');
  const fullCatalog = pack.entries.map(({ content, ...entry }) => entry);
  const selectedSubjects = selectedSubjectIds(descriptor);
  const selectedPaths = new Set();
  const roleRecords = [
    ...readJsonl(runtimeRoot, 'routing/development.roles.jsonl'),
    ...readJsonl(runtimeRoot, 'routing/production.roles.jsonl'),
  ];
  for (const selected of descriptor.documents.roles) {
    const [plane, roleId] = selected.split('/');
    const role = roleRecords.find((record) => record.plane === plane && record.id === roleId);
    if (!role) throw new UserError(`selected role is missing from packed runtime: ${selected}`, 'closure_missing');
    selectedPaths.add(role.guide);
    for (const procedure of Object.values(role.procedure_by_mode || {})) selectedPaths.add(procedure);
  }
  const profileRecords = readJsonl(runtimeRoot, 'routing/facets.jsonl');
  for (const selected of descriptor.documents.profiles) {
    const profile = profileRecords.find((record) => record.id === selected);
    if (!profile) throw new UserError(`selected profile is missing from packed runtime: ${selected}`, 'closure_missing');
    selectedPaths.add(profile.profile);
  }
  const overlayRecords = readJsonl(runtimeRoot, 'routing/domain-overlays.jsonl');
  for (const selected of descriptor.documents.overlays) {
    const overlay = overlayRecords.find((record) => record.id === selected);
    if (!overlay) throw new UserError(`selected overlay is missing from packed runtime: ${selected}`, 'closure_missing');
    selectedPaths.add(overlay.guide);
  }
  for (const mandatory of descriptor.policy.mandatory) {
    const entry = fullCatalog.find((item) => item.id === mandatory);
    if (!entry) throw new UserError(`mandatory catalog entry is missing: ${mandatory}`, 'mandatory_missing');
    const subject = subjectForCatalogId(mandatory);
    if (subject && !selectedSubjects.has(subject)) throw new UserError(`mandatory ID escapes the selected view: ${mandatory}`, 'closure_escape');
    selectedPaths.add(entry.path);
  }
  const selectedCatalog = fullCatalog.filter((entry) => selectedPaths.has(entry.path));
  const allowedIds = new Set(selectedCatalog.map((entry) => entry.id));
  const byId = new Map(pack.entries.filter((entry) => allowedIds.has(entry.id)).map((entry) => [entry.id, entry]));
  return {
    kind: 'packed',
    catalog: selectedCatalog,
    fullCatalog,
    allowedIds,
    load(id) {
      const entry = byId.get(id);
      if (!entry) throw new UserError(`context ID is outside selected view: ${id}`, 'selected_view_escape');
      const { content, ...metadata } = entry;
      if (`sha256:${sha256(content)}` !== metadata.hash) throw new UserError(`packed content hash is stale for ${id}`, 'release_corrupt');
      return { ...metadata, content };
    },
  };
}

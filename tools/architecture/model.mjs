import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const MODEL_PATH = 'docs/architecture/modules.json';
export const GENERATED_PATH = 'docs/architecture/generated';
const EXTENSIONS = new Set(['.mjs', '.sh', '.py']);
const canonical = value => JSON.stringify(value, (_, item) => item && !Array.isArray(item) && typeof item === 'object' ? Object.fromEntries(Object.entries(item).sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0)) : item);
const digest = bytes => `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
const fail = message => { throw new Error(message); };
const parser = fileURLToPath(new URL('./parse-esm.mjs', import.meta.url));

export function inside(root, relative) {
  if (typeof relative !== 'string' || !relative || /[\\\0]/.test(relative) || relative.split('/').some(p => !p || p === '.' || p === '..') || /^[A-Za-z]:/.test(relative)) fail(`unsafe relative path: ${relative}`);
  let cursor = root;
  for (const part of relative.split('/')) {
    cursor = path.join(cursor, part);
    if (fs.lstatSync(cursor, { throwIfNoEntry: false })?.isSymbolicLink()) fail(`symlink is outside the architecture scan contract: ${relative}`);
  }
  return cursor;
}
function glob(pattern, file) {
  const expression = pattern.split('*').map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*');
  return new RegExp(`^${expression}$`).test(file);
}
function sourceFiles(root, scopes) {
  const files = new Set();
  function visit(relative) {
    const absolute = inside(root, relative);
    const stat = fs.statSync(absolute);
    if (stat.isDirectory()) {
      for (const child of fs.readdirSync(absolute).sort()) visit(`${relative}/${child}`);
    } else if (stat.isFile() && EXTENSIONS.has(path.extname(relative))) files.add(relative);
    else if (!stat.isFile()) fail(`unsupported source type: ${relative}`);
  }
  for (const scope of scopes) visit(scope);
  return [...files].sort();
}
function declarationLine(text, symbol, file) {
  if (!/^[A-Za-z_$][\w$]*$/.test(symbol)) fail(`invalid declaration symbol: ${symbol}`);
  // Navigation anchors only, NOT call-graph extraction. Ambiguity is an error.
  const expression = new RegExp(`^\\s*(?:export\\s+)?(?:async\\s+)?(?:function\\s*\\*?\\s+|class\\s+|(?:const|let|var)\\s+)${symbol.replaceAll('$','\\$')}\\b`);
  const matches = text.split('\n').flatMap((line, index) => expression.test(line) ? [index + 1] : []);
  if (matches.length !== 1) fail(`declaration anchor must match exactly once: ${file}#${symbol} (${matches.length})`);
  return matches[0];
}
function assertAcyclic(edges) {
  const active = [], done = new Set();
  function visit(id) {
    if (active.includes(id)) fail(`dependency cycle: ${[...active, id].join(' -> ')}`);
    if (done.has(id)) return;
    active.push(id);
    for (const target of edges.get(id) ?? []) visit(target);
    active.pop(); done.add(id);
  }
  for (const id of edges.keys()) visit(id);
}

export function inspectArchitecture(target, { modelPath = MODEL_PATH } = {}) {
  const root = fs.realpathSync(target);
  const model = JSON.parse(fs.readFileSync(inside(root, modelPath), 'utf8'));
  if (model.schema_version !== 1 || !Array.isArray(model.scope) || !model.scope.length || !Array.isArray(model.modules) || !model.modules.length) fail('invalid architecture model');
  const ids = new Set();
  for (const module of model.modules) {
    if (!/^[a-z][a-z0-9-]*$/.test(module.id) || ids.has(module.id)) fail(`invalid or duplicate module id: ${module.id}`);
    ids.add(module.id);
    for (const field of ['owns','allowed_dependencies','entries','tests']) if (!Array.isArray(module[field])) fail(`${module.id}.${field} must be an array`);
    if (!module.owns.length || !module.entries.length || !module.title || !module.summary || !module.not_owned) fail(`incomplete module declaration: ${module.id}`);
    for (const pattern of module.owns) inside(root, pattern);
  }
  const files = sourceFiles(root, model.scope);
  const owner = new Map();
  const texts = new Map();
  for (const file of files) {
    const matches = model.modules.filter(m => m.owns.some(p => glob(p, file)));
    if (matches.length !== 1) fail(`source must have exactly one owner: ${file} (${matches.length})`);
    owner.set(file, matches[0].id);
    texts.set(file, fs.readFileSync(inside(root, file), 'utf8'));
  }
  const esm = files.filter(file => file.endsWith('.mjs')).map(file => ({file, text: texts.get(file)}));
  const parsed = spawnSync(process.execPath, ['--experimental-vm-modules', '--no-warnings', parser], { input: JSON.stringify(esm), encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 15000 });
  if (parsed.status !== 0) fail(parsed.stderr || parsed.error?.message || 'ESM parser unavailable');
  const imports = new Map(JSON.parse(parsed.stdout).map(item => [item.file, item.imports]));
  const fileEdges = new Map(files.map(file => [file, new Set()]));
  const moduleEdges = new Map(model.modules.map(m => [m.id, new Set()]));
  const facts = files.map(file => {
    const external = [];
    for (const specifier of imports.get(file) ?? []) {
      if (!specifier.startsWith('.')) { external.push(specifier); continue; }
      const dependency = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
      inside(root, dependency);
      if (!owner.has(dependency)) fail(`relative import has no scanned owner: ${file} -> ${dependency}`);
      fileEdges.get(file).add(dependency);
      if (owner.get(file) !== owner.get(dependency)) moduleEdges.get(owner.get(file)).add(owner.get(dependency));
    }
    return { file, owner: owner.get(file), hash: digest(texts.get(file)), imports: [...fileEdges.get(file)].sort(), external_imports: external };
  });
  assertAcyclic(fileEdges);
  assertAcyclic(moduleEdges);
  const modules = model.modules.map(module => {
    for (const id of module.allowed_dependencies) if (!ids.has(id) || id === module.id) fail(`invalid allowed dependency: ${module.id} -> ${id}`);
    for (const dependency of moduleEdges.get(module.id)) if (!module.allowed_dependencies.includes(dependency)) fail(`forbidden dependency: ${module.id} -> ${dependency}`);
    for (const pattern of module.owns) if (!files.some(file => glob(pattern,file))) fail(`ownership pattern matches no source: ${module.id}: ${pattern}`);
    if (module.contract && !fs.statSync(inside(root, module.contract), { throwIfNoEntry: false })?.isFile()) fail(`missing module contract: ${module.id}: ${module.contract}`);
    const entries = module.entries.map(entry => {
      if (owner.get(entry.file) !== module.id) fail(`entry is not owned by ${module.id}: ${entry.file}`);
      return { ...entry, line: entry.symbol ? declarationLine(texts.get(entry.file), entry.symbol, entry.file) : 1 };
    });
    for (const test of module.tests) if (!files.includes(test)) fail(`missing test source: ${module.id}: ${test}`);
    if (!Array.isArray(module.flow?.steps) || !module.flow.steps.length || !Array.isArray(module.flow.edges)) fail(`missing declared flow: ${module.id}`);
    const steps = new Set();
    for (const step of module.flow.steps) {
      if (!/^[a-z][a-z0-9-]*$/.test(step.id) || steps.has(step.id) || typeof step.label !== 'string') fail(`invalid flow step in ${module.id}`);
      steps.add(step.id);
      if (step.entry !== undefined && !entries.some(e => e.symbol === step.entry || e.file === step.entry)) fail(`unbound flow entry: ${module.id}: ${step.entry}`);
    }
    for (const edge of module.flow.edges) if (!steps.has(edge.from) || !steps.has(edge.to)) fail(`unbound flow edge: ${module.id}`);
    return { ...module, entries, files: facts.filter(f => f.owner === module.id).map(f => f.file), dependencies: [...moduleEdges.get(module.id)].sort() };
  }).sort((a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return {
    schema_version: 1,
    evidence_digest: digest(canonical({ model, sources: facts.map(({file,hash}) => ({file,hash})) })),
    analysis: { dependencies: 'Node ESM parser; compile-only, never link/evaluate', anchors: 'unique named declaration lines', flows: 'human-declared, not inferred control flow', limitations: ['dynamic imports and subprocess calls are not dependency edges', 'shell/Python files are inventoried, not parsed', 'conditional/runtime calls are not a call graph', 'JavaScript declaration anchors use a constrained line matcher'] },
    modules, sources: facts,
  };
}

export function locateModules(graph, query) {
  const needle = query.toLocaleLowerCase('und');
  return graph.modules.filter(module => JSON.stringify([module.id,module.title,module.summary,module.tags,module.files,module.entries]).toLocaleLowerCase('und').includes(needle));
}
export function changeImpact(graph, query) {
  const seeds = graph.modules.filter(m => m.id === query || m.files.includes(query));
  if (!seeds.length) fail(`unknown module or source: ${query}`);
  const affected = new Set(seeds.map(m => m.id));
  let changed;
  do {
    changed = false;
    for (const module of graph.modules) if (!affected.has(module.id) && module.dependencies.some(id => affected.has(id))) { affected.add(module.id); changed = true; }
  } while (changed);
  const modules = graph.modules.filter(m => affected.has(m.id));
  return { scope: 'conservative module-level reverse static imports; not runtime proof', direct: seeds.map(m => m.id), affected: modules.map(m => m.id), tests: [...new Set(modules.flatMap(m => m.tests))].sort(), entries: seeds.flatMap(m => m.entries) };
}

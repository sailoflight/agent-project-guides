import fs from 'node:fs';
import { canonicalJson, compareCanonical } from './core.mjs';
import { applyRequirements, checkRequirements, readStoreEntryRecords, resolvePackage, resolveService, storeRoot } from './components.mjs';
import { parseLocalEndpoint, probeService } from './service-probe.mjs';

const conflict = (id, reason, extra = {}) => ({ id, state: 'conflict', reusable: false, reason, ...extra });
function groupById(entries) {
  const groups = new Map();
  for (const entry of entries) groups.set(entry.id, [...(groups.get(entry.id) ?? []), entry]);
  return groups;
}
function packageNodes(records, root, selected = null) {
  return new Map([...groupById(records.packages)].filter(([id]) => !selected || selected.has(id)).map(([id, entries]) => {
    let verdict;
    if (entries.length > 1) verdict = conflict(id, 'the store holds multiple digests for this id', { digests: entries.map(e => e.digest).sort() });
    else {
      try { verdict = resolvePackage(entries[0], root); }
      catch (error) { if (!['component_corrupt', 'invalid_component'].includes(error.code)) throw error; verdict = conflict(id, error.message); }
    }
    return [id, { verdict, requires: entries.length === 1 ? entries[0].requires ?? [] : [] }];
  }));
}

// Resolve from final dependency verdicts, not the preliminary "bytes exist" view.
// A recursion-stack hit makes the entire dependency cycle unusable, order-independently.
export function resolveDependencyGraph(nodes, { env = process.env } = {}) {
  const resolved = new Map();
  const active = new Set();
  function visit(id) {
    if (resolved.has(id)) return resolved.get(id);
    const node = nodes.get(id);
    if (!node) return null;
    if (active.has(id)) return { id, state: 'degraded', reusable: false, reason: 'cyclic component dependency' };
    if (node.verdict.state !== 'available') { resolved.set(id, node.verdict); return node.verdict; }
    active.add(id);
    const checked = checkRequirements(node.requires, { env, pathValue: env.PATH, describe: dependency => visit(dependency)?.state === 'available' });
    const verdict = applyRequirements(node.verdict, checked);
    active.delete(id);
    resolved.set(id, verdict);
    return verdict;
  }
  for (const id of [...nodes.keys()].sort()) visit(id);
  return resolved;
}
function insertNode(nodes, id, node) {
  nodes.set(id, nodes.has(id) ? { verdict: conflict(id, 'an id names both a package and a service'), requires: [] } : node);
}

export function verifyComponents(options = {}) {
  const root = storeRoot(options);
  if (!fs.statSync(root, { throwIfNoEntry: false })?.isDirectory()) return { root, present: false, packages_total: 0, packages: [], reusable_packages: [], missing_packages: [], degraded_packages: [], conflicted_packages: [], services: [] };
  const records = readStoreEntryRecords(root);
  const nodes = packageNodes(records, root);
  for (const [id] of groupById(records.services)) insertNode(nodes, id, { verdict: { id, state: 'degraded', reusable: false, reason: 'service health has not been probed' }, requires: [] });
  const resolved = resolveDependencyGraph(nodes, options);
  const packages = [...new Set(records.packages.map(e => e.id))].sort().map(id => resolved.get(id));
  return {
    root, present: true, packages_total: packages.length, packages,
    services: records.services.map(entry => ({ id: entry.id, endpoint: entry.endpoint, revision: entry.revision ?? null, delivery: entry.delivery, requires: entry.requires ?? [] })),
    reusable_packages: packages.filter(e => e.reusable).map(e => e.id),
    missing_packages: packages.filter(e => e.state === 'not-installed').map(e => e.id),
    degraded_packages: packages.filter(e => e.state === 'degraded').map(e => e.id),
    conflicted_packages: packages.filter(e => e.state === 'conflict').map(e => e.id),
  };
}

export async function probeComponents(options = {}) {
  const root = storeRoot(options);
  if (!fs.statSync(root, { throwIfNoEntry: false })?.isDirectory()) return { root, present: false, probed: 0, services: [], reusable_services: [] };
  const records = readStoreEntryRecords(root);
  // Hash only packages reachable from declared service prerequisites.
  const required = new Set();
  const byPackage = groupById(records.packages);
  function select(requirements) {
    for (const { component: id } of requirements ?? []) {
      if (!id || required.has(id)) continue;
      required.add(id);
      for (const entry of byPackage.get(id) ?? []) select(entry.requires);
    }
  }
  for (const entry of records.services) select(entry.requires);
  const nodes = packageNodes(records, root, required);
  const groups = groupById(records.services);
  let probed = 0;
  for (const [id, entries] of groups) {
    const declaration = entry => canonicalJson({ singleton: entry.singleton, health: entry.health, transport: entry.transport ?? 'http', revision: entry.revision ?? null, asserted_identity: entry.asserted_identity ?? false, identity: { id_field: 'id', revision_field: 'revision', ...entry.identity }, requires: [...(entry.requires ?? [])].sort((a,b) => compareCanonical(canonicalJson(a), canonicalJson(b))) });
    let verdict;
    if (entries.some(entry => declaration(entry) !== declaration(entries[0]))) verdict = conflict(id, 'service records disagree about identity or requirements');
    else {
      const observations = [];
      const seen = new Set();
      for (const entry of entries) {
        const endpoint = parseLocalEndpoint(entry.endpoint, entry.transport);
        const key = `${endpoint.transport}://${endpoint.host}:${endpoint.port}`;
        if (seen.has(key)) continue;
        seen.add(key);
        observations.push(await probeService(entry)); probed += 1;
      }
      verdict = resolveService(entries[0], observations);
      if (verdict.state === 'not-installed') verdict = { id, state: 'degraded', reusable: false, reason: 'the declared service is not reachable' };
    }
    if (byPackage.has(id)) nodes.set(id, { verdict: conflict(id, 'an id names both a package and a service'), requires: [] });
    else insertNode(nodes, id, { verdict, requires: entries[0].requires ?? [] });
  }
  const resolved = resolveDependencyGraph(nodes, options);
  const services = [...groups.keys()].sort().map(id => resolved.get(id));
  return { root, present: true, probed, services, reusable_services: services.filter(e => e.reusable).map(e => e.id) };
}

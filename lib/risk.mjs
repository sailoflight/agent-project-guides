import fs from 'node:fs';
import path from 'node:path';
import { UserError } from './core.mjs';

const TIER = new Map([['R0', 0], ['R1', 1], ['R2', 2], ['R3', 3]]);

function readJsonl(packageRoot, relative) {
  return fs.readFileSync(path.join(packageRoot, relative), 'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);
}

function maximumTier(tiers) {
  return [...tiers].sort((left, right) => TIER.get(right) - TIER.get(left))[0] || 'R0';
}

export function composeRisk(packageRoot, descriptor, {
  runtimeEffects = [],
  operationEffects = [],
  taskEffects = [],
  nonbehavioral = false,
} = {}) {
  const definitions = new Map(readJsonl(packageRoot, 'routing/protected-effects.jsonl').map((record) => [record.id, record]));
  const facets = new Map(readJsonl(packageRoot, 'routing/facets.jsonl').map((record) => [record.id, record]));
  const overlays = new Map(readJsonl(packageRoot, 'routing/domain-overlays.jsonl').map((record) => [record.id, record]));
  const layers = [
    ['runtime', runtimeEffects],
    ['operation', operationEffects],
    ['project', descriptor.protected_effects],
    ['facet', descriptor.facets.flatMap((id) => facets.get(id)?.effects || [])],
    ['overlay', (descriptor.overlays || []).flatMap((id) => overlays.get(id)?.effects || [])],
    ['task', taskEffects],
  ];
  const origins = new Map();
  for (const [layer, effects] of layers) {
    for (const effect of effects) {
      if (!origins.has(effect)) origins.set(effect, []);
      origins.get(effect).push(layer);
    }
  }
  const unknown = [...origins.keys()].filter((effect) => !definitions.has(effect)).sort();
  const known = [...origins.keys()].filter((effect) => definitions.has(effect)).sort();
  const tiers = known.map((effect) => definitions.get(effect).tier);
  for (const facet of descriptor.facets) tiers.push(facets.get(facet)?.risk || 'R1');
  for (const overlay of descriptor.overlays || []) tiers.push(overlays.get(overlay)?.risk || 'R1');
  if (!nonbehavioral) tiers.push('R1');
  if (unknown.length) tiers.push('R1');
  const tier = maximumTier(tiers);
  const checks = new Set();
  if (tier === 'R1') checks.add('author-check');
  if (TIER.get(tier) >= 2) {
    checks.add('author-check');
    checks.add('non-author-verification-contract');
    checks.add('verifier-dynamic-verdict');
  }
  if (tier === 'R3') {
    checks.add('preapproved-independent-verification');
    checks.add('release-or-operation-control');
  }
  return {
    tier,
    effects: known.map((effect) => ({ id: effect, tier: definitions.get(effect).tier, origins: origins.get(effect) })),
    unknown_effects: unknown.map((effect) => ({ id: effect, origins: origins.get(effect), action: 'clarify or apply the smallest conservative gate' })),
    required_checks: [...checks].sort(),
    authorization: 'runtime-defined',
    authority_note: 'APG demands compose monotonically and never manufacture grants.',
  };
}

export function parseEffectList(value) {
  if (!value) return [];
  const items = value.split(',').map((item) => item.trim()).filter(Boolean);
  if (new Set(items).size !== items.length) throw new UserError('effect lists must not contain duplicates', 'invalid_effects');
  return items;
}

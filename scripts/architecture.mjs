#!/usr/bin/env node
// Source-only author tool. Never dispatched by apg or included in its runtime pack.
import path from 'node:path';
import { inspectArchitecture, locateModules, changeImpact } from '../tools/architecture/model.mjs';
import { renderArchitecture, writeArchitecture, checkArchitecture } from '../tools/architecture/render.mjs';

export function main(argv = process.argv.slice(2)) {
  const args = [...argv];
  let target = process.cwd();
  const option = args.indexOf('--target');
  if (option !== -1) { if (!args[option+1]) throw new Error('--target requires a path'); target = path.resolve(args[option+1]); args.splice(option,2); }
  if (!args.length || args[0] === '--help') return 'Usage: node scripts/architecture.mjs build|check|locate <text>|impact <module-or-file> [--target <project>]\nSource-only, offline, compile-only navigation. Only build writes generated views.';
  const [command, query] = args;
  if (!['build','check','locate','impact'].includes(command) || args.length > (['locate','impact'].includes(command) ? 2 : 1)) throw new Error('invalid architecture command; use --help');
  if (['locate','impact'].includes(command) && !query) throw new Error(`${command} requires a query`);
  const graph = inspectArchitecture(target);
  if (command === 'locate') {
    const modules = locateModules(graph,query);
    if (!modules.length) throw new Error(`no architecture module matches: ${query}`);
    return JSON.stringify(modules.map(({id,title,entries,tests}) => ({id,title,entries,tests})),null,2);
  }
  if (command === 'impact') return JSON.stringify(changeImpact(graph,query),null,2);
  const outputs = renderArchitecture(graph);
  if (command === 'build') writeArchitecture(target,outputs);
  else { const errors = checkArchitecture(target,outputs); if (errors.length) throw new Error(errors.join('\n')); }
  return JSON.stringify({status: command === 'build' ? 'built' : 'valid', modules:graph.modules.length, sources:graph.sources.length, evidence_digest:graph.evidence_digest});
}
try { console.log(main()); } catch (error) { console.error(`architecture: ${error.message}`); process.exitCode = 1; }

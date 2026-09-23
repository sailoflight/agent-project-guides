#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectArchitecture, changeImpact, locateModules, MODEL_PATH } from '../tools/architecture/model.mjs';
import { renderArchitecture, writeArchitecture, checkArchitecture } from '../tools/architecture/render.mjs';
import { buildCatalog } from '../lib/catalog.mjs';
import { listDistributionFiles } from '../lib/core.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'apg-architecture-'));
try {
  fs.mkdirSync(path.join(tmp,'src'));fs.mkdirSync(path.join(tmp,'docs/architecture'),{recursive:true});
  const write=(file,text)=>fs.writeFileSync(path.join(tmp,file),text);
  write('src/a.mjs',"import { beta } from './b.mjs';\nthrow new Error('ANALYZED SOURCE MUST NEVER EXECUTE');\nexport function alpha() { return beta(); }\n");
  write('src/b.mjs','export function beta() { return 1; }\n');
  const module=(id,symbol,deps)=>({id,title:id,summary:'fixture',not_owned:'execution',owns:[`src/${id}.mjs`],allowed_dependencies:deps,tests:['src/b.mjs'],entries:[{file:`src/${id}.mjs`,symbol,change:'fixture'}],flow:{steps:[{id:'entry',label:'entry',entry:symbol}],edges:[]}});
  const model={schema_version:1,scope:['src'],modules:[module('a','alpha',['b']),module('b','beta',[])]};
  const save=()=>write(MODEL_PATH,JSON.stringify(model));save();
  const graph=inspectArchitecture(tmp);assert.equal(graph.modules[0].entries[0].line,3);assert.deepEqual(graph.modules[0].dependencies,['b']);
  assert.deepEqual(changeImpact(graph,'src/b.mjs').affected,['a','b']);assert.equal(locateModules(graph,'alpha')[0].id,'a');
  const output=renderArchitecture(graph);assert.ok(checkArchitecture(tmp,output).length);writeArchitecture(tmp,output);assert.deepEqual(checkArchitecture(tmp,output),[]);
  const digest=graph.evidence_digest;write('src/b.mjs','export function beta() { return 2; }\n');const changed=inspectArchitecture(tmp);assert.notEqual(changed.evidence_digest,digest);assert.ok(checkArchitecture(tmp,renderArchitecture(changed)).length);
  write('src/unowned.mjs','export const x=1;');assert.throws(()=>inspectArchitecture(tmp),/exactly one owner/);fs.unlinkSync(path.join(tmp,'src/unowned.mjs'));
  model.modules[0].allowed_dependencies=[];save();assert.throws(()=>inspectArchitecture(tmp),/forbidden dependency/);model.modules[0].allowed_dependencies=['b'];
  model.modules[0].entries[0].symbol='missing';save();assert.throws(()=>inspectArchitecture(tmp),/anchor/);model.modules[0].entries[0].symbol='alpha';save();
  write('src/b.mjs',"import './a.mjs';\nexport function beta() { return 2; }\n");assert.throws(()=>inspectArchitecture(tmp),/cycle/);write('src/b.mjs','export function beta() { return 2; }\n');
  fs.symlinkSync(path.join(tmp,'src/b.mjs'),path.join(tmp,'src/link.mjs'));assert.throws(()=>inspectArchitecture(tmp),/symlink/);fs.unlinkSync(path.join(tmp,'src/link.mjs'));
  const own=inspectArchitecture(root);assert.deepEqual(checkArchitecture(root,renderArchitecture(own)),[],'checked-in views must be current');
  const excluded=/^(?:docs\/(?:INDEX\.md|architecture\/|modules\/|verification\/)|tools\/architecture\/|scripts\/architecture\.mjs)/;
  for(const file of listDistributionFiles(root))assert.ok(!excluded.test(file),`project navigation leaked into distribution: ${file}`);
  for(const entry of buildCatalog(root))assert.ok(!excluded.test(entry.path),`project navigation leaked into governance catalog: ${entry.path}`);
  console.log(`PASS: ${own.modules.length} modules / ${own.sources.length} source files have unique owners, permitted acyclic imports, live anchors and fresh views; parser never evaluates code; navigation stays off the distribution surface`);
} finally { fs.rmSync(tmp,{recursive:true,force:true}); }

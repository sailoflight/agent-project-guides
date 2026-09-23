#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { entryDir, packageManifest, writePackageEntry, validateEntry, probeService } from '../lib/components.mjs';
const cli = fileURLToPath(new URL('./apg.mjs', import.meta.url));
const service = {kind:'service', id:'audit', delivery:'staged', transport:'http', endpoint:'127.0.0.1:1', health:'/health', singleton:true, revision:'1'};
function fixture(t) { const dir=fs.mkdtempSync(path.join(os.tmpdir(),'apg-component-regression-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir; }
function pkg(root,id,requires=[]) { const files=[{path:'payload',content:Buffer.from(id)}];const m=packageManifest({id,version:'1',requires,files});writePackageEntry(entryDir(root,id,m.digest),m,files); }
function record(root,name,entry) { fs.mkdirSync(path.join(root,'services'),{recursive:true});fs.writeFileSync(path.join(root,'services',name+'.json'),JSON.stringify(entry)); }
async function server(t,handler,host='127.0.0.1') {
  const s=http.createServer(handler); await new Promise((resolve,reject)=>{s.once('error',reject);s.listen(0,host,resolve);});
  t.after(()=>new Promise(r=>{s.closeAllConnections();s.close(r);}));return `${host.includes(':')?'['+host+']':host}:${s.address().port}`;
}
async function run(root,action) {return new Promise((resolve,reject)=>{const c=spawn(process.execPath,[cli,'components',action,'--store',root]);let out='',err='';c.stdout.on('data',b=>out+=b);c.stderr.on('data',b=>err+=b);c.on('error',reject);c.on('close',code=>{try{assert.equal(code,0,err);resolve(JSON.parse(out));}catch(e){reject(e);}});});}
const healthy=(req,res)=>res.end(JSON.stringify({id:'audit',revision:'1'}));
test('non-loopback, invalid port and non-path endpoints are rejected without requests',()=>{
  for(const endpoint of ['203.0.113.1:80','10.0.0.1:80','[2001:db8::1]:80','127.0.0.1:0','127.0.0.1:65536','999.1.1.1:80'])assert.throws(()=>validateEntry({...service,endpoint}),/local|loopback|port|endpoint/i);
  for(const health of ['//foreign/health','/health\r\nInjected: yes'])assert.throws(()=>validateEntry({...service,health}));
});
test('503 identity is not health; null and arrays do not crash the process',async t=>{
  for(const [status,body] of [[503,'{"id":"audit","revision":"1"}'],[200,'null'],[200,'[]'],[302,'{"id":"audit","revision":"1"}']]){
    const endpoint=await server(t,(req,res)=>{res.writeHead(status);res.end(body);});
    const result=await probeService({...service,endpoint});assert.notEqual(result.state,'available');assert.equal(result.reusable,false);
  }
});
test('IPv6 and localhost resolve to loopback without DNS',async t=>{
  let endpoint;try{endpoint=await server(t,healthy,'::1');}catch(e){if(['EAFNOSUPPORT','EADDRNOTAVAIL'].includes(e.code)){t.skip('IPv6 loopback unavailable');return;}throw e;}
  assert.equal((await probeService({...service,endpoint})).state,'available');
  const ipv4=await server(t,healthy);assert.equal((await probeService({...service,endpoint:ipv4.replace('127.0.0.1','localhost')})).state,'available');
});
test('bounded body and absolute deadline stop oversized and slow streaming responses',async t=>{
  const large=await server(t,(req,res)=>res.end('x'.repeat(131073)));
  assert.equal((await probeService({...service,endpoint:large})).reusable,false);
  const slow=await server(t,(req,res)=>{res.writeHead(200);const timer=setInterval(()=>res.write(' '),5);res.on('close',()=>clearInterval(timer));});
  const before=Date.now();const result=await probeService({...service,endpoint:slow},{timeout:60});assert.equal(result.reusable,false);assert.ok(Date.now()-before<1500);
});
test('CLI aggregates two singleton instances by identity, not by record',async t=>{
  const root=fixture(t);for(const [i,endpoint]of [await server(t,healthy),await server(t,healthy)].entries())record(root,String(i),{...service,endpoint});
  const result=await run(root,'probe');assert.equal(result.services.length,1);assert.equal(result.services[0].state,'conflict');assert.deepEqual(result.reusable_services,[]);
});
test('dependency failure propagates transitively and cycles never become available',async t=>{
  const root=fixture(t);pkg(root,'dep',[{bin:'apg_absent_fixture_933434'}]);pkg(root,'consumer',[{component:'dep'}]);pkg(root,'top',[{component:'consumer'}]);pkg(root,'cycle-a',[{component:'cycle-b'}]);pkg(root,'cycle-b',[{component:'cycle-a'}]);
  const result=await run(root,'verify');for(const id of ['dep','consumer','top','cycle-a','cycle-b'])assert.equal(result.packages.find(x=>x.id===id).state,'degraded',id);
});
test('probe checks required packages and does not reuse a service with a degraded prerequisite',async t=>{
  const root=fixture(t);pkg(root,'dep',[{bin:'apg_absent_fixture_933434'}]);record(root,'audit',{...service,endpoint:await server(t,healthy),requires:[{component:'dep'}]});
  assert.deepEqual((await run(root,'probe')).reusable_services,[]);
});
test('conflicts take precedence over unmet requirements',async t=>{
  const root=fixture(t);for(const [i,endpoint]of [await server(t,healthy),await server(t,healthy)].entries())record(root,String(i),{...service,endpoint,requires:[{bin:'apg_absent_fixture_933434'}]});
  assert.equal((await run(root,'probe')).services[0].state,'conflict');
});
test('duplicate loopback aliases are one instance, and inconsistent declarations conflict',async t=>{
  const root=fixture(t);const endpoint=await server(t,healthy);
  record(root,'one',{...service,endpoint});record(root,'two',{...service,endpoint:endpoint.replace('127.0.0.1','localhost')});
  const good=await run(root,'probe');assert.equal(good.probed,1);assert.deepEqual(good.reusable_services,['audit']);
  record(root,'two',{...service,endpoint,revision:'2'});assert.equal((await run(root,'probe')).services[0].state,'conflict');
});
test('corrupt or renamed packages are isolated conflicts, not usable dependencies',async t=>{
  const root=fixture(t);pkg(root,'original');fs.renameSync(path.join(root,'original'),path.join(root,'renamed'));pkg(root,'good');pkg(root,'consumer',[{component:'renamed'}]);
  const result=await run(root,'verify');assert.deepEqual(result.conflicted_packages,['renamed']);assert.deepEqual(result.reusable_packages,['good']);assert.ok(result.degraded_packages.includes('consumer'));
});
test('verify never mistakes an unprobed service declaration for satisfied health',async t=>{
  const root=fixture(t);record(root,'audit',service);pkg(root,'consumer',[{component:'audit'}]);assert.deepEqual((await run(root,'verify')).reusable_packages,[]);
});
test('a package and its running service may share an id without a false conflict',async t=>{
  const root=fixture(t);pkg(root,'audit');record(root,'audit',{...service,endpoint:await server(t,healthy)});
  const verified=await run(root,'verify');assert.deepEqual(verified.reusable_packages,['audit']);assert.deepEqual(verified.conflicted_packages,[]);
  const probed=await run(root,'probe');assert.deepEqual(probed.reusable_services,['audit']);
});
test('a same-id service can depend on its package; package failure is not hidden by live health',async t=>{
  const root=fixture(t);pkg(root,'audit',[{bin:'apg_absent_fixture_933434'}]);record(root,'audit',{...service,endpoint:await server(t,healthy),requires:[{component:'audit'}]});
  assert.equal((await run(root,'verify')).packages[0].state,'degraded');
  assert.equal((await run(root,'probe')).services[0].state,'degraded');
});
test('same-id kind separation preserves singleton conflicts without corrupting package verdicts',async t=>{
  const root=fixture(t);pkg(root,'audit');for(const [i,endpoint] of [await server(t,healthy),await server(t,healthy)].entries())record(root,String(i),{...service,endpoint});
  assert.deepEqual((await run(root,'verify')).reusable_packages,['audit']);
  assert.equal((await run(root,'probe')).services[0].state,'conflict');
});
test('same-id service prerequisites resolve the package rather than forming a false self cycle',async t=>{
  const root=fixture(t);pkg(root,'audit');pkg(root,'consumer',[{component:'audit'}]);record(root,'audit',{...service,endpoint:await server(t,healthy),requires:[{component:'audit'}]});
  assert.deepEqual((await run(root,'verify')).reusable_packages,['audit','consumer']);
  assert.deepEqual((await run(root,'probe')).reusable_services,['audit']);
});

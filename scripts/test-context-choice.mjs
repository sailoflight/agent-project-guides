import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createCompactChoice, verifyCompactChoice } from '../lib/context-choice.mjs';
import { contextErrorRecord } from '../lib/context-errors.mjs';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'apg-choice-'));
try {
 const key=crypto.randomBytes(32),descriptor={project_id:'test.choice',release:{version:'3.0.5'},documents:{roles:['production/operator']}};
 const choice='production.operator.deploy',now=1780000000000;
 const token=createCompactChoice(descriptor,root,choice,key,now);
 assert.equal(token.length,57);
 assert.deepEqual(verifyCompactChoice(token,descriptor,root,choice,key,now),{plane:'production',role:'operator',mode:'deploy'});
 const fails=(fn,code)=>assert.throws(fn,e=>e.code===code);
 fails(()=>verifyCompactChoice(token,descriptor,root,choice,key,now+900001),'generation_expired');
 fails(()=>verifyCompactChoice(token,descriptor,root,choice,key,now-1),'generation_mismatch');
 fails(()=>verifyCompactChoice(token,{...descriptor,project_id:'other'},root,choice,key,now),'generation_mismatch');
 fails(()=>verifyCompactChoice(token,{...descriptor,documents:{roles:[]}},root,choice,key,now),'generation_mismatch');
 fails(()=>verifyCompactChoice(token,descriptor,root,'production.operator.rollback',key,now),'generation_mismatch');
 fails(()=>verifyCompactChoice(token,descriptor,root,undefined,key,now),'selection_required');
 fails(()=>verifyCompactChoice(token,descriptor,root,choice,crypto.randomBytes(32),now),'generation_mismatch');
 fails(()=>verifyCompactChoice(token+'x',descriptor,root,choice,key,now),'generation_mismatch');
 const changed=Buffer.from(token.slice(3),'base64url');changed[15]^=1;
 fails(()=>verifyCompactChoice('g2_'+changed.toString('base64url'),descriptor,root,choice,key,now),'generation_mismatch');
 assert.deepEqual(fs.readdirSync(root),[],'issuance and verification must not write');
 for(const code of ['generation_reference_write_failed','generation_key_missing','generation_target_missing']){
  const result=contextErrorRecord({code,message:'fixture'},['context']);
  assert.match(result.next,/Stop:/);assert.doesNotMatch(result.next,/Run the original/);
 }
 console.log('PASS: stateless tickets bind target, view, choice, key and expiry; environment errors stop rather than retry');
} finally {fs.rmSync(root,{recursive:true,force:true});}

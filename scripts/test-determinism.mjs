#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const script = `
import {buildCatalog, catalogJsonl} from './lib/catalog.mjs';
import {buildPackedRuntimeArtifact} from './lib/provider.mjs';
import {sha256, canonicalJson} from './lib/core.mjs';
import {packageManifest} from './lib/components.mjs';
const files = ['禁止', 'feature', '实现', '完成', '文档', '子模式', '最小'].map(path => ({path, content: Buffer.from(path)}));
console.log(canonicalJson({catalog: sha256(catalogJsonl(buildCatalog(process.cwd()))), runtime: buildPackedRuntimeArtifact(process.cwd()).manifest.digest, component: packageManifest({id:'locale-test',version:'1',files}).digest}));
`;
const outputs = ['en_US.UTF-8', 'zh_CN.UTF-8', 'sv_SE.UTF-8'].map(locale => {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {cwd: root, encoding: 'utf8', env: {...process.env, LC_ALL: locale, LANG: locale}});
  assert.equal(result.status, 0, result.stderr);
  return {locale, output: result.stdout};
});
for (const result of outputs) assert.equal(result.output, outputs[0].output, `canonical bytes must not depend on ${result.locale}`);
console.log('PASS: catalog, packed runtime and component digests are identical across English, Chinese and Swedish locales');

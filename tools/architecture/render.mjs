import fs from 'node:fs';
import path from 'node:path';
import { GENERATED_PATH, inside } from './model.mjs';
const label = text => String(text).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('\n',' ');
const codeLink = entry => `[\`${entry.file}${entry.symbol ? '#'+entry.symbol : ''}\`](../../../${entry.file}#L${entry.line})`;
const notice = '> 自动生成；请修改 `docs/architecture/modules.json` 或源码后重新 build。图是导航，不授予权限、不替代契约；声明流程不是自动证明的调用链。';
export function renderArchitecture(graph) {
  const outputs = new Map();
  const overview = ['# APG 架构导航', '', notice, '', `证据摘要：\`${graph.evidence_digest}\``, '', '## 模块地图', '', '```mermaid', 'flowchart TD'];
  for (const module of graph.modules) overview.push(`  ${module.id}["${label(module.title)}"]`);
  for (const module of graph.modules) for (const dependency of module.dependencies) overview.push(`  ${module.id} --> ${dependency}`);
  overview.push('```', '', '箭头表示静态 ESM 依赖，不表示运行顺序。', '', '## 任务入口', '', '| 模块 | 职责 | 导航卡片 |', '|---|---|---|');
  for (const module of graph.modules) {
    overview.push(`| ${module.title} | ${module.summary} | [${module.id}](${module.id}.md) |`);
    const lines = [`# ${module.title}`, '', notice, '', `模块：\`${module.id}\``, '', '## 负责 / 不负责', '', module.summary, '', `不负责：${module.not_owned}`, '', '## 改动入口', '', '| 源码位置 | 适合修改什么 |', '|---|---|'];
    if (module.contract) lines.splice(7, 0, `人工契约：[${module.contract}](../../../${module.contract})`, '');
    for (const entry of module.entries) lines.push(`| ${codeLink(entry)} | ${entry.change} |`);
    lines.push('', '## 声明性主流程', '', '```mermaid', 'flowchart TD');
    for (const step of module.flow.steps) lines.push(`  ${step.id}["${label(step.label)}"]`);
    for (const edge of module.flow.edges) lines.push(`  ${edge.from} -->${edge.label ? `|"${label(edge.label)}"|` : ''} ${edge.to}`);
    lines.push('```', '', '流程依据：人工模块声明；锚点存在性由检查器验证，分支和时序仍需核对实现与测试。');
    for (const step of module.flow.steps.filter(s => s.entry)) { const entry = module.entries.find(e => e.symbol === step.entry || e.file === step.entry); lines.push(`- ${step.label} → ${codeLink(entry)}`); }
    lines.push('', '## 边界与验证', '', `实际依赖：${module.dependencies.map(d => `[${d}](${d}.md)`).join('、') || '无内部静态依赖'}`, '', `允许依赖：${module.allowed_dependencies.map(d => '`'+d+'`').join('、') || '仅 Node 内置模块'}`, '', '建议验证（只显示，不自动执行）：');
    for (const test of module.tests) lines.push(`- [\`${test}\`](../../../${test})`);
    lines.push('', '## 本模块文件', '');
    for (const file of module.files) lines.push(`- [\`${file}\`](../../../${file})`);
    outputs.set(`${module.id}.md`, lines.join('\n')+'\n');
  }
  overview.push('', '## 分析限制', '', ...graph.analysis.limitations.map(x => '- '+x), '');
  outputs.set('INDEX.md', overview.join('\n'));
  outputs.set('graph.json', JSON.stringify(graph,null,2)+'\n');
  return outputs;
}
export function writeArchitecture(root, outputs) {
  const directory = inside(root, GENERATED_PATH);
  fs.mkdirSync(directory, { recursive: true });
  const extras = fs.readdirSync(directory).filter(name => !outputs.has(name));
  if (extras.length) throw new Error(`unexpected generated files; review rather than auto-delete: ${extras.join(', ')}`);
  for (const [name, content] of outputs) {
    const destination = inside(root, `${GENERATED_PATH}/${name}`);
    if (fs.existsSync(destination) && fs.readFileSync(destination,'utf8') === content) continue;
    const temporary = `${destination}.tmp-${process.pid}`;
    fs.writeFileSync(temporary,content,{flag:'wx'});
    try { fs.renameSync(temporary,destination); } finally { fs.rmSync(temporary,{force:true}); }
  }
}
export function checkArchitecture(root, outputs) {
  const directory = inside(root, GENERATED_PATH);
  const errors = [];
  for (const [name, content] of outputs) {
    const file = inside(root,`${GENERATED_PATH}/${name}`);
    if (!fs.existsSync(file) || fs.readFileSync(file,'utf8') !== content) errors.push(`stale or missing: ${name}`);
  }
  if (fs.existsSync(directory)) for (const name of fs.readdirSync(directory)) if (!outputs.has(name)) errors.push(`unexpected generated file: ${name}`);
  return errors;
}

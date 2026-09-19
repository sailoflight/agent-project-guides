---
id: "ed071bbb-84e4-4c43-878b-f584b45ab5bf"
title: "APG context generation 重复载荷浪费：根因与修复交接"
description: "APG context 精简输出已实施并验证；记录 json 接口冗长与否定语境误触发的遗留缺口及严格对照实验设计"
status: "active"
created_at: "2026-09-08T09:04:24.980Z"
updated_at: "2026-09-08T10:04:36.328Z"
content_hash: "bc72b4cb9a73265d76ba884f3bb4c7bbd6adeb3b48d3889c276891b86299ee06"
source_paths:
  - "lib/context.mjs"
  - "lib/provider.mjs"
  - "lib/context-errors.mjs"
  - "docs/V3_MINIMAL_SLICE.md"
  - ".agent-scratch/compact-context-report.md"
  - ".agent-scratch/dsh-context-routing-observation.md"
session_ids:
  - "c455a84b-1fee-4196-9ff4-07210c966049"
  - "13151179-fa58-4af7-863a-a4f2de8d0029"
  - "ce23b7a5-51ca-4e9a-aff7-4f60bbb70699"
memory_body_ids:
  []
---

# APG context generation 重复载荷浪费：修复完成与验证记录

## 根因（保持不变）

用户报告 APG 的 sha256 定位目标"造成极度浪费"。根因不是哈希本身，而是澄清（protected/ambiguous）输出对完整 generation 句柄的重复嵌套：句柄内含每条候选的 route_hash(sha256)、selected_view_revision、过期时间，先作顶层字段输出，又被原样嵌入每个候选的 `next_command`；`--format context` 澄清分支直接返回完整 JSON。完整性链设计上不可截断，节约只能靠去重与精简，不靠削弱 HMAC/过期校验。

## 已实施设计（用户批准完整精简后完成）

- 默认 `--format context` 改为精简文本：仅输出状态、授权中立路由、可执行候选、截断/扩展提示与所选政策正文；SHA256、签名载荷、重复源清单与预算诊断不再进入默认输出。所选政策正文不删改。
- Shared 澄清续接使用 35 字符 `g1_<32hex>` 随机引用；完整签名 generation 存入本机私有安装状态（`state/generation-handles/`，目录 0700、文件 0600，HMAC envelope 绑定引用与真实项目路径）。CLI 仅在 shared 澄清签发后写入；ready、JSON、纯编译不写。签发时最多检查 128 个目录项，只清理签名有效的过期记录；未知/未认证/符号链接项保留。
- 续接校验签名、有效期、项目、selected view 与候选；引用丢失/篡改/跨项目/过期均失败并提示重新请求。
- 默认错误经 `contextErrorRecord` 精简（`lib/context-errors.mjs`）：保留错误码、原因、失败字段与允许值，隐藏 hash/完整 token；launcher 预导入 fail 同样脱敏。显式 `--format json` 保留完整机器诊断。

## 涉及文件

`lib/context.mjs`、`lib/provider.mjs`、`lib/context-errors.mjs`（新增）、`scripts/apg.mjs`、`scripts/apg-launcher.mjs`、`scripts/test-v2.mjs`、`scripts/test-v3.mjs`、`scripts/test-context-state.mjs`（新增）、`scripts/test-release.sh`、`README.md`、`docs/V2_CONTRACT.md`、`docs/V3_MINIMAL_SLICE.md`、`catalog/catalog.jsonl`、`PACKAGE_MANIFEST.json`。发布/运行时消费者（schema 2 shared-runtime.pinned，如 onshapescript 固定 3.0.3）需新版本生效。

## 测量与验证

- 无正文 CLI fixture，utf8-bytes/4-ceiling 估算：schema1 四候选 261 vs 689 tokens（-62.2%）；shared 三候选 230 vs 1865 tokens（-87.7%）。
- 实际服务端 usage（sub2api/gpt-6-astra，4 请求累计）：精简总输入 141915 vs JSON 142750，输出 762 vs 779；读到路由后单步相差 415 输入 token。dsh-context 插件单条 217/612 为固定密度估算，非服务端精确拆分。
- 回归通过：`test-schema.py`、`test-install.sh`、`test-v2.mjs`、`test-v3.mjs`、`test-context-state.mjs`、`project validate`（23 路由，max context 2862 / json 3212）、catalog/release verify、`git diff --check`。
- 双 subagent 隔离观察（schema1）：两种格式均返回 clarification_required，agent 均停下等待用户选路，未自行越权；精简未见路由反应退化。记录见 `.agent-scratch/dsh-context-routing-observation.md`。

## 实测与遗留缺口（评审确认）

- 真实 GUI 记录：同一任务 JSON 工具结果 ≈612 / 2424 B，compact context ≈217 / 824 B（约 -64.5%），compact 已直接生效。
- 遗留 1：`--format json` 仍含 route_hash sha256、同一角色以 plane/role/mode、route、choice_id、next_command 重复表达及预算元数据；隔离实验中 agent 会主动选择读取完整 JSON。对照用户"sha256 等不输出、仅必需字段与 AI 交流"的目标，默认 json 是否同样精简、或要求 AI 一律读取 compact 格式，尚未实施，需用户确认接口范围。
- 遗留 2：否定语境仍误触发澄清——"不修改部署或代码"中的"部署"命中 protected 信号，与输出精简无关，两个 agent 都因此停下等选路；可作为分类修复点。
- 结论分级：体积优化已证实；该样例澄清行为保留仅初步；整体成本下降与跨场景可靠性尚未由严格配对实验证明。

## 回滚与状态

回滚基线按文件当前内容备份于 `.agent-scratch/compact-context-backup-20260908T091648879599Z/`（lib/context.mjs、lib/provider.mjs、scripts/apg.mjs）、`.agent-scratch/compact-context-docs-backup-20260908T091722Z/`（launcher、test-release.sh、README、V2/V3 契约、manifest、catalog）、`.agent-scratch/compact-context-tests-backup-20260908-171645/`（test-v2/v3.mjs）；完整清单与逐文件映射见 `.agent-scratch/compact-context-report.md`。新增文件 `lib/context-errors.mjs`、`scripts/test-context-state.mjs` 完整回滚时需单独移除。状态：工作区内已实现并验证、未提交、未发布。后续严格格式增量对照用 ds4f 等廉价模型时，须固定请求中其他内容、仅替换 APG 输出并比较服务端 usage；行为保留断言建议覆盖 ready/澄清/短续接/过期/截断/否定语境等场景。

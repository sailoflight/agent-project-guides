---
id: "7356145d-1e8f-49cd-bf61-1222a080d7fe"
title: "APG 边界裁定：宿主记忆系统（DSH Mnemon）对位与「只补缺口」原则"
description: "在已完成的 APG × Agent Flywheel 融合研究之上，裁定 APG 与宿主（DSH Mnemon）自带记忆系统的关系：DSH 记忆实测形态（workspace 作用域 / 自动写入 / Memory Spaces 未启用）、三套记忆系统的作用域与担责对照、被外部覆盖后仍残留的 6 项缺口（全属权威/合约/可复现类）、「谁有权/凭什么/合约与证据」归 APG 而「如何检索/记忆/运行」归执行栈的组织原则与自检判据、APG 不做记忆存储只做权威声明的可选项，以及本地部署下的两条本机绕过风险。承接文档 id ef9d12e4。"
status: "active"
created_at: "2026-09-19T04:46:22.985Z"
updated_at: "2026-09-19T04:46:22.985Z"
content_hash: "1e5280cc32c00fcc1c07bc161bbaeb5a8bde56a0619ad4a9079fa488cf556a3e"
source_paths:
  - "plans/MULTI_AGENT_INFRA_INTEGRATION_RESEARCH.md"
  - "plans/DEVELOPMENT_ROADMAP.md"
  - "lib/memory.mjs"
  - ".agent-project-guides.json"
  - "docs/V2_CONTRACT.md"
session_ids:
  - "9082384d-1efb-4d56-9a22-b6924193c509"
memory_body_ids:
  []
---

# APG 边界裁定：宿主记忆系统（DSH Mnemon）对位与「只补缺口」原则

状态：**report-only 裁定记录，未实施、未改任何 schema / 路由 / 分发内容、未提交**。
路线：`development/maintainer/code`。
上游完整取证见文档 `ef9d12e4`（APG × Multi-Agent 生态融合）与其源文件 `plans/MULTI_AGENT_INFRA_INTEGRATION_RESEARCH.md`（现 **753 行**，新增 §10）。本文档只记录**该研究之后新增的一层判断**：APG 与**宿主自带记忆系统**的关系。

## 1. 用户提供并已采纳的新前提（本地部署拓扑）

| 前提 | 影响 |
|---|---|
| 本机 **24GB 内存跑 7 个 agent** | 上游 Flywheel 的 48–64GB 只是作者对 10–20+ agent 的**建议值**，不是硬门槛，**不构成约束**。 |
| **WSL 起 HTTP，客户端直连** | Flywheel 的 MCP 服务本就是 HTTP-only（Mail 为 HTTP-only FastMCP，CM 亦 HTTP-only、无 stdio）。常驻 HTTP + 直连即可，**ACFS 整段可跳过**——与其 FAQ 对本地开发的建议一致（直接用单个工具）。 |
| **本地 only + 限制性 SSH + 外围挡住** | 方向成立，但**挡不住本机权限面**（见第 6 节两条）。 |

## 2. DSH Mnemon 记忆系统实测形态

| 层 | 实测事实 |
|---|---|
| 热记忆 | `.mnemon/runtime/memories.json`，每轮注入；有容量上限与满时自动归档压缩 |
| 作用域 | `mnemon.storageScope: workspace`；`runtimeUserScope: global`（工作区 `USER.md` 为 **0 字节**，真身在全局） |
| Documents | 带 `contentHash` / `revision` / `sourcePaths` / `sessionIds`，分 active / archived |
| **Memory Spaces** | **`total: 0`、`providers: []`——该层当前未启用** |
| 策略 | `auto-capture`（**关**）、`scoped`（开）、`light-context`（开） |
| 行为证据 | `scoped` 策略已自动把上游研究报告抓成 Document `ef9d12e4`（17.6KB）。该系统是**活的且自动的**。 |

## 3. 三套记忆系统：差别不在功能，在**作用域与担责**

| | Agent Flywheel | DSH Mnemon | APG |
|---|---|---|---|
| 写入 | CM 自动 / EE 提案制 | **自动** | **非作者评审** + no-replace promote |
| 作用域 | 单机 | **workspace**（USER 全局） | **项目内，随 clone 走** |
| 跟项目走 | 否 | 否 | **是** |
| 谁担责 | CM 无人 / EE 谁跑谁批 | 无人 | **非作者评审者**，绑 project digest |

**结论：砍掉 APG 记忆 ≠ 被 Mnemon 覆盖，而是「随项目走、有人担保的那一层」消失。** `runtimeUserScope: global` 只是用户级偏好，不是项目契约。二者作用域不同，**不是替代关系**。

## 4. 「只补缺口」之后的残差清单

按 40 工具 + DSH 宿主 + Mnemon 逐一过筛。

**已被外部覆盖（APG 不必做）**：任务与依赖、通信/ACK、lifecycle 与调度、session 检索、热工作记忆、自动知识沉淀、技能/prompt 管理、上下文检索候选。

**仍然残留的 6 项**：

1. 主体权威合成（role → authority；低层不得降低高层 effect）
2. 项目-owned policy 的可复现身份（descriptor digest + managed marker + hash）
3. 证据与验收合同（非作者评审；peer vs formal IV&V；`ready_for_verification`）
4. 观测分级（intended / host-observed / model_effective:unknown）
5. 跨 harness 契约（harness-neutral + pinned release）
6. 随项目走且经评审的事实

**注意：6 项全部同属一类——权威、合约、可复现。** 这提示 APG 的真实身份就是这一层。

## 5. 组织原则（建议写入 ADR）

**风险**：缺口集合本身不自带统一性。照字面做，APG 会退化为一堆互不相干的补丁（一个 policy 文件 + 几条角色说明 + 几个校验），既说不清自己是什么，也守不住边界，下一轮仍会被蚕食。

> 凡属「**谁有权、凭什么、规则与证据的合约**」的缺口 → 归 APG。
> 凡属「**如何检索、如何记忆、如何跑起来**」的 → 归执行栈。
> **判据：该能力是否需要「人的担保」或「跨机器可复现」。需要 → APG；不需要 → 执行栈。**

该原则**可自我检验**：过筛第 4 节的 6 项残差，全部命中；已被覆盖的 8 项，全部排除。判定与上游两条红线一致（APG 只引用外部状态、永不成为其权威）。

## 6. 待定可选项与本机安全提醒

**可选项**：Mnemon 的 Memory Spaces 当前为空（0 spaces / 0 providers），正好可承接「项目事实」存储。即 **APG 不做记忆存储，只做「哪些记忆是权威」的声明**（哪个 space、哪类 insight 算项目事实、必须经什么评审）。存储与检索交 Mnemon，**担保与流程留 APG**；比 APG 自维护一套项目记忆文件更省，且更贴合「只引用、不作权威」红线。尚未决定。

**网络隔离挡不住的两条本机权限风险**：

- ACFS `--mode vibe` 实为**免密 sudo + 危险 agent flag**，属本机权限问题 → **不启用该模式**。
- `DCG_BYPASS=1` 与 guard 的 `--no-verify` 是**本机绕过通道** → 建议列入监控。

## 7. 与其它文档的关系

- `ef9d12e4`（APG × Multi-Agent 生态融合）：上游研究，含 Capability Matrix、Architecture A/B/C 评价、Flywheel 40 工具全景、五档让步方案与 6 项待决 proposal。本文档承接其 §10 之后的判断，**不重复**其内容。
- 临时工作产物（非长期口径）：`.agent-scratch/flywheel-research/flywheel-tools-raw-inventory.md`。

**未决定事项**：6 项 proposal 全部待决；五档让步档位未定；本文第 6 节可选项未定；ADR 尚未起草。

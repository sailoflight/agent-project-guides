---
id: "32c3513d-fa5a-4f97-9e45-7152c8d597dd"
title: "APG 记忆层与注入面：token 审计、检索委托与控制面边界（定稿）"
description: "APG 记忆层与注入面定稿：token 审计实测、检索委托（档位 1）、记忆随项目走、控制面扩权、外源事实源头核实与两处更正、待批准清单"
status: "active"
created_at: "2026-09-19T04:54:42.233Z"
updated_at: "2026-09-19T05:07:52.175Z"
content_hash: "f2ccd7891d34ddb89e4b2281adb98cb088834ab1ce236e779aedd0d34b9b9455"
source_paths:
  - "plans/MULTI_AGENT_INFRA_INTEGRATION_RESEARCH.md"
  - "lib/memory.mjs"
  - "lib/core.mjs"
  - "lib/catalog.mjs"
  - "lib/migration-v3.mjs"
  - "scripts/apg.mjs"
  - "scripts/install.sh"
  - "scripts/manage-root-blocks.mjs"
  - "bootstrap/AGENTS.routing-block.md"
  - "docs/V2_CONTRACT.md"
  - ".agent-project-guides.json"
session_ids:
  - "ecf4a4be-3f0f-41e2-aecc-b95b56be6d5a"
  - "880ad517-c8f4-415d-a9f1-6c5fb762ca3b"
memory_body_ids:
  []
---

# APG 记忆层与注入面：token 审计、检索委托与控制面边界

状态：**report-only 记录，未改任何 APG 公共行为、schema、路由或分发内容；未提交**。
主报告 `plans/MULTI_AGENT_INFRA_INTEGRATION_RESEARCH.md` 第 11–12 节（**1,025 行**，源内不发布）。本文档是该节定稿摘要，**取代本 id 早先由自动抓取产生的中间态**。

## 1. 三条已定边界（用户 2026-09-19 决定）

| # | 决定 | 内容 |
|---|---|---|
| 一 | **检索委托** | APG 保留记忆的**记录 + 评审 + 随项目分发身份**；**检索引擎交给现成外部组件**（CASS/EE），不自己造轮子。这正是主报告 §9.1 **档位 1** 已写好的内容（"让给 Flywheel：… 记忆检索 (CASS/EE) …"），**不是新让步**。分层：历史 session 检索→CASS；检索引擎→EE；热工作记忆→宿主；记录/评审/身份→**留 APG**。落地成本 ≈0（§9.4 第 3 条本就写着"不写 adapter"）。 |
| 二 | **记忆随项目走** | 记忆算开发的一部分 ⇒ `docs/memory/*.json`（进 git、随 clone 分发）是**权威源**；EE/CASS 的一切索引只是**可重建派生物**。这解决了 EE `.ee/ee.db` 是 workspace 本地库、不随项目走的问题：**检索可以在本地，事实必须在 git。** |
| 三 | **控制面扩权** | ① 用 APG 控制外部组件装配，但**只做声明 + 校验 + 漂移检测**（依赖 manifest、pin 版本、sha256），不做包管理器、不代下载；**只发 manifest 不发组件字节**——同时规避 NOASSERTION 许可约束。② 用 APG 控制 `AGENTS.md`，由"只拥有自己那块"扩为**多写入者分区所有权 + 漂移审计**。 |

## 2. 控制面现状：APG 已有半个底盘（是扩权，不是从零造）

| 已有 | 作用 |
|---|---|
| `scripts/install.sh`（32KB；`merge`/`check`/`trigger`） | routing block 置于 root instructions **最前**；校验位置、adaptation 状态、UTF-8、体积 |
| `scripts/manage-root-blocks.mjs` | **marker 级 `strip`/`replace`**；块须始于 byte 0；重复 marker 直接 fail |
| `bootstrap/AGENTS.routing-block.md` · `AGENTS.adapter-trigger.md` · `CLAUDE.scope-block.md` | 受控块模板 |
| `PACKAGE_MANIFEST.json`（逐文件 sha256）+ `PACKAGE_REMOTE.json` + `scripts/check-update.mjs` | APG 自己的版本与内容校验机制 |

**`AGENTS.md` 现有 3 个写入者**：APG managed marker、`br agents --add`、EE `export agentsmd`。

## 3. 每轮固定注入实测

| 来源 | 字节 | est tok/轮 |
|---|---:|---:|
| 工作区 `.mnemon/runtime/MEMORY.md` | 4,527 | ≈1,186 |
| 全局 `~/.mnemon/runtime/USER.md` | 2,170 | ≈626 |
| `AGENTS.md` 块（APG 自身 v2） | 1,706 | ≈448 |
| **合计** | **8,403** | **≈2,260** |

估算法 `CJK × 0.9 + ASCII ÷ 3.8`（本机无 tiktoken，启发式非精确）。对照：APG 单次路由上下文 289–1,632 tokens ⇒ 每轮固定前缀 ≈ maintainer 路由的 1.4 倍。**记忆一变，整个前缀缓存失效。**

**消费者侧实测（13 仓）**：12 个消费者用 **v3 块 731–758 B ≈ 192–199 tok**；**只有 APG 自身用 v2 块 1,706 B ≈ 448 tok**——包源仓注入块比任何消费者大 **2.3 倍**，且**仅它一个仓在用 v2 模板**。

⇒ **`AGENTS.md` 是整套方案里唯一每轮付费的注入面**；上游"块所有权协议"由此获得量化理由。

## 4. 记忆清理的实际结果（与早先估计相反）

**净持平，未省 token**：`MEMORY.md` 4,446 B → **4,527 B（+81 B）**。去掉了 4 条"已完成工作摘要"（该去的），但新增 2 条决定条目（该留的）。**质量提升，成本未降。**

真正的 token 净省点在 **ADR 落地后把决定缩成指针** —— 该步骤需批准。

## 5. 已从源头核实的外源事实（2026-09-19，全部一手）

| 事实 | 来源 | 结论 |
|---|---|---|
| EE trust 阶梯 6 档与权重 | `eidetic_engine_cli/docs/trust-model.md` L35–40 | 逐行吻合（.85/.75/.65/.50/.45/.30） |
| EE 晋升闸门 | 同上 L60–62 | 仅 `human_explicit` / `agent_validated` 可晋升；其余 **exit-7 拒绝** |
| 许可 rider | 3 仓 `LICENSE`（mcp_agent_mail / coding_agent_session_search / eidetic_engine_cli） | **3/3** 为 `MIT License (with OpenAI/Anthropic Rider)`，Restricted Parties 明确列 OpenAI、Anthropic |
| Agent Mail 传输 | `mcp_agent_mail/README.md` L7 | "**HTTP-only** FastMCP server"，HTTP 端口 8765 |
| `bd` 是 `br` 的别名 | 同上 L69/L192 | 安装 `br` 并建 `bd` shell 别名，**替换**既有 `bd`(Go) |
| CASS 定性 | `coding_agent_session_search/README.md` L1004/L1015 | "relevance is not correctness"；trust verdict 为 **advisory only、永不改变排序** |
| `docs/memory/*.md` 会被 catalog 收录 | 探针实测 `apg catalog build --source` | 确证收录为 `kind=reference`（连二级标题也各自成条目） |

## 6. 一处已更正的错误 + 一处被证伪的假设

**① `legacy_import` 不是外来记忆导入通道** —— 它是 EE **自己的 pre-v1 归档桶**。真通道是 `ee import agentsmd`，trust **硬上限 `agent_assertion`(0.50)**；且 EE **只允许 `human_explicit`/`agent_validated` 晋升**，`agent_assertion` / `cass_evidence` / `legacy_import` **一律 exit-7 拒绝**。
⇒ 正确结论是"**EE 保不住 APG 的评审强度**"，而非早先写的"trust 倒挂"。**但因决定二（git 记录为权威源、EE 仅派生），trust class 只影响注意力排序，不影响权威。**

**② APG 停在 `schema_version: 1` 是设计约束，不是滞后。** 只读预览 `apg migrate v3-preview --target . --source . --variant shared-runtime.pinned` 返回 `applicable: false`、blocker `source-worktree-full-corpus`（`lib/migration-v3.mjs:32-35`）：自宿主全量语料仓不能声明 v3 容器模式，**必须另 materialize 一份消费者副本**。

## 7. 排除规则不一致（待修，已实测确证）

| 位置 | 规则 |
|---|---|
| `lib/core.mjs:184` | `if (child === 'docs/memory') continue;` —— **目录级**排除（打包时） |
| `lib/catalog.mjs` `CONTENT_ROOTS` | `walkMarkdown` 只收 **`.md`** —— **扩展名级**筛选 |

⇒ `docs/memory/` 目前全是 `.json`，只是被扩展名挡住；**放入任何 `.md` 都会被 catalog 当作 `reference` 收进上下文**。同一目录既被排除又被收录，行为取决于扩展名。

## 8. Document 根合并（已执行，可回滚）

把全局根里的 3 篇 APG 历史并入工作区根：**全局 7→4、工作区 8→11**；无悬空引用；3 篇 sha256 一致。
备份：`.agent-scratch/mnemon-doc-merge-20260919T130119Z/`（两个 index 原件 + 3 篇正文）。
其余 4 篇全局文档（dsh-bench、Univer clipboard、dsh-rc.2、Mnemon 0.5.5）**保留在全局根**——它们不属 APG。

## 9. 待批准清单（人工离线期间冻结，report-only）

| # | 事项 |
|---|---|
| 1 | **`AGENTS.md` 块所有权协议**（唯一每轮付费面 + 3 个写入者） |
| 2 | **ADR**：组织原则 + 本文三条决定 → 落地后把记忆缩成指针（token 真正净省点） |
| 3 | 修 `docs/memory` 收录不一致（见第 7 节） |
| 4 | APG 自有 v2 块瘦身（1,706 → 粗估 ≈1,100 B，省 ≈150 tok/轮）。**反方**：它是常驻治理契约，且单独瘦身会造出第三次分叉——宜等块所有权协议定稿后 v2/v3 一起收敛 |
| 5 | 其余 5 项缺口：主体权威合成 / policy 可复现身份 / 证据验收合同 / 观测分级 / 跨 harness 契约 |
| 6 | EE trust 映射落档（通道已核实，只差选择） |
| 7 | `.agent-scratch/` 过期归档：20.2 MB / 20 项；前三项发布备份占 19.1 MB、均已验证并在 `origin/main`（须点名删除，不用通配符） |

**未做**：未建 ADR、未改任何 APG 源码、未提交、未安装任何外部组件、未删除任何用户文件。工作区改动仍为 35 项，本轮唯一新增是未跟踪的主报告。

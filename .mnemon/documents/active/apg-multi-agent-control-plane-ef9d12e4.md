---
id: "ef9d12e4-81a3-4c8d-acfb-3c95bdc54f3f"
title: "APG × Multi-Agent 生态融合：边界裁定与 Agent Flywheel 取证（最终态）"
description: "APG × Multi-Agent 生态融合的最终边界裁定：融合（正交）与 Architecture B 推荐、档位 1 认定、三套记忆分层、记忆层 token 实测、用户 11 项决策结果、两条红线与许可证/EE trust 核实结论、组织原则。权威源为已提交的报告 plans/MULTI_AGENT_INFRA_INTEGRATION_RESEARCH.md（1,118 行，6498163）。"
status: "active"
created_at: "2026-09-19T04:26:50.620Z"
updated_at: "2026-09-19T08:35:22.685Z"
content_hash: "ffd8d4473bbe9a7af163124fb582657e78074e271ac3cd1db0a5795f5a5a5236"
source_paths:
  - "plans/MULTI_AGENT_INFRA_INTEGRATION_RESEARCH.md"
  - "plans/DEVELOPMENT_ROADMAP.md"
  - "plans/PROVIDER_RUNTIME_EVOLUTION.md"
  - "schemas/project-v3.schema.json"
  - "bootstrap/AGENTS.routing-block.md"
  - "lib/core.mjs"
  - "lib/catalog.mjs"
  - "lib/migration-v3.mjs"
  - "scripts/manage-root-blocks.mjs"
  - "scripts/test-install.sh"
  - "decisions/0004-threat-model-untrusted-checkouts.md"
  - "decisions/0005-harness-neutral-core.md"
  - "docs/V2_CONTRACT.md"
  - "plans/REVIEW_FINDINGS.md"
session_ids:
  - "6275cb6d-72bf-40ef-bc3d-4d7d7707444d"
  - "b185bd60-197d-4d4d-b687-8d18e0c584f5"
  - "1ae84e51-bed9-4989-b910-ed814975e922"
memory_body_ids:
  []
---

# APG × Multi-Agent 生态融合：边界裁定（最终态）

状态：**研究已收尾并提交**。本文档是**派生路由件**；权威源为 `plans/MULTI_AGENT_INFRA_INTEGRATION_RESEARCH.md`（**1,118 行，提交 `6498163`**，源内不发布）。报告新增 §10–§13 后，本文档的早期快照（680 行 / 未提交）作废。

路线：`development/maintainer/code`。
40 工具底表 + synergy：`.agent-scratch/flywheel-research/flywheel-tools-raw-inventory.md`（**临时产物，非长期口径**）。

## 1. 结论

**融合（Fusion），正交而非覆盖。** Flywheel 是**执行面**（跑起来、强制住、别互踩、记得住），APG 是**权威面**（谁有权、凭什么、规则与证据的合约）。权限挂点不同：Flywheel 挂**工具门**（命令正则 / tracker label / 配额），APG 挂**主体**（plane/role/mode + 项目 policy）。

| 架构 | 裁定 |
|---|---|
| A Full Stack（自实现任务/消息/锁/生命周期/调度） | **Reject**——成本极大，且直接违反 `plans/DEVELOPMENT_ROADMAP.md` §1 既有非目标 |
| B 控制面 | **推荐** |
| C Meta Adapter | **条件性后续，设门槛**——致命问题不是工作量，而是「中立 ABI 会抹平各后端保证强度的差异」：四族原语交集只剩 `{task id, dependency, status, claim, message}`，恰好切掉 worktree 隔离、lease、supervisor 健康态 |

## 2. 让步档位：**认定档位 1**（用户 2026-09-19）

档位 1 = 保留 descriptor · 角色语义 · 权威合成 · 证据/验收合同 · **项目 memory** · context assembly；让掉 任务/依赖(`br`) · 消息(Mail) · lifecycle/调度(NTM) · **记忆检索(CASS/EE)** · 文件协调。**失去项：无不可替代项**——让掉的都是 APG 早已声明不做的，因此这不是让步，是把早该划的线划实。建议序 1 > 3 > 0 > 2 > 4。

## 3. 三套记忆的分层（用户确认的定位变化）

| 层 | 作用域 | 写入 | 担保 | 地位 |
|---|---|---|---|---|
| APG `docs/memory` | **项目内，随 clone 走** | 非作者评审 + `project_digest` 绑定 | **有人** | **权威源** |
| EE / CASS | 本机 workspace | 自动 / 导入 | 无人（trust 仅作排序） | 派生物，可重建 |
| Mnemon / CM | 本机（`runtimeUserScope: global`） | 自动 | 无人 | 热工作记忆 |

**用户决定**：APG **保留**自己的记忆层，不与 DSH Mnemon 合并；**记忆随项目走**（git 记录为权威源，任何检索索引为派生）；**检索引擎交现成外部组件**（CASS/EE），不自己造轮子——即档位 1 的既定内容。

`docs/memory` 从设计起就是**检索式**而非注入式（`docs/V2_CONTRACT.md:31` 只排除发行面；寻址靠 `plans/REVIEW_FINDINGS.md` 第 6 节索引 + `decisions/0004` 交叉引用），但检索面只到**文档级**：CLI 只有 `propose/review/promote/supersede/purge` 五个写动作（`scripts/apg.mjs:866-878`），**无 list / show / search**。

## 4. 记忆层 token 审计（实测）

每轮固定注入 ≈ **2,268 tok**：工作区 `MEMORY.md` 1,194 + 全局 `USER.md` 626 + `AGENTS.md` 块 448。对照：APG 单次路由上下文 289–1,632 tok。

**`AGENTS.md` 是整套里唯一每轮付费的注入面**，而它有 **3 个写入者**：APG managed marker、`br agents --add`、EE `export agentsmd`。

消费者侧实测（13 仓）：12 个用 v3 块 731–758 B（≈192–199 tok）；APG 自身 v2 块 1,706 B（≈448 tok）——**包源仓的块比任何消费者大 2.3 倍**。APG 停在 `schema_version: 1` 是**设计约束而非滞后**：`migrate v3-preview` 返回 `applicable:false`，blocker=`source-worktree-full-corpus`（`lib/migration-v3.mjs:32-35`）。

## 5. 用户已决策（报告 §13，11 项）

1. **认定档位 1**。
2. **暂不开**「项目配置声明外部后端」——今日被 `schemas/project-v3.schema.json` 的 `additionalProperties:false` 挡住；改为在 `.agent-scratch/external-test/`（**非 git**，已在 `.gitignore` 内）拉入外部组件实测。
3. 文档顺序：**先 `decisions/0006` AGENTS.md 块所有权协议，再组织原则 ADR**。
4. `docs/memory` 收录不一致 → 让 catalog 也按**目录**跳过（与 `lib/core.mjs:184` 一致）。已实测确证：放 `.md` 进去会被收为 `kind=reference`。
5. **根块层级假设改拓扑中立——待定范围。** 仅 `bootstrap/AGENTS.routing-block.md:14` 属「全局拓扑」断言（另 5 处是子代理指派语境，升级给指派者本就正确），改它须同步 `scripts/test-install.sh:68` 的断言；**现在改最便宜**——13 仓**无一**使用 `routing:` 块，零 hash 变动、不需 12 仓重适配。
6. 文件/模块互斥与 claim 租约的语义写 **downgrade / 未安装**，而非 "unsupported"（能力状态词表 `available / degraded / not-installed`）——与 APG 既有 `degraded` / `package_missing` 词汇一致，且与决策 2 的声明式 manifest 是同一件事的两面。
7–8. 命名空间命名、EE trust 映射 → **推迟到实测后**。
9. `.agent-scratch` 旧发布备份**已点名删除**（20.2 → 2.6 MB，未用通配符）。
10. 报告**已提交**（`6498163`，仅该文件）。
11. 其余 5 项缺口可做，但**排在外部实测之后**：主体权威合成 / policy 可复现身份 / 证据验收合同 / 观测分级 / 跨 harness 契约。

## 6. 两条红线

1. **APG 只引用外部状态，永不成为外部状态的权威。** 事实源在后端；APG 只在证据/变更记录里写 `task_ref`。
2. **APG 不建 agent 注册表。** 运行时实例身份归 runtime；APG 只拥有声明式角色命名空间。证据：Agent Mail 无 `external_id`、same-user 可冒充、无 token 轮换。

## 7. 门槛与核实结论

- **门槛（建议写进 ADR 的 stop condition）**：**第二个真实后端 + 一个真实消费者**出现前，不写任何 adapter。
- **许可证硬约束**：核心组件 8/8 为 **NOASSERTION**（`MIT License (with OpenAI/Anthropic Rider)`，非 OSI；Restricted Parties 明确列 OpenAI / Anthropic）⇒ 只能作**用户自装外部依赖**，**不得进入 APG 分发面**。（已逐字核实 3 个仓库 LICENSE。）
- **EE trust 映射（已从 `eidetic_engine_cli/docs/trust-model.md` 核实）**：阶梯为 `.85 human_explicit > .75 peer_human_attested > .65 agent_validated > .50 agent_assertion > .45 cass_evidence > .30 legacy_import`。**更正**：`legacy_import` 是 EE 自己的 pre-v1 桶，**非外来导入通道**；真通道 `ee import agentsmd` 上限 `agent_assertion`(.50)，且 EE 只允许 `human_explicit` / `agent_validated` 晋升（其余 exit-7 拒绝）⇒ **EE 保不住 APG 的评审强度**。因权威在 git、EE 仅派生，这只影响**注意力排序**，不影响权威。
- **本机绕过通道**（网络隔离挡不住）：ACFS `--mode vibe` = 免密 sudo + 危险 agent flag；`DCG_BYPASS=1` 与 guard 的 `--no-verify`。

## 8. 组织原则（待入 ADR）

> 「**谁有权 / 凭什么 / 规则与证据的合约**」→ 归 APG；「**如何检索 / 记忆 / 跑起来**」→ 归执行栈。
> 判据：该能力是否**需要人的担保**或**跨机器可复现**。需要 → APG；不需要 → 执行栈。

自检：按此过一遍缺口清单，6 项全部命中；已被外部覆盖的层全部排除。

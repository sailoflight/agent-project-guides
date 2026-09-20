---
id: "ef9d12e4-81a3-4c8d-acfb-3c95bdc54f3f"
title: "APG × Multi-Agent 生态融合：边界裁定与 13 项 owner 裁定收口（2026-09-20）"
description: "APG × 外部多智能体生态的最终边界裁定 + 主人 13 项裁定的落地终态：融合（正交）与 Architecture B 推荐、让步档位 1、三套记忆分层与锚拆分、根块每轮 token 已降至 1,117 B、11 个写入方三档覆盖、新增 P6 观测账本、13 项逐项 commit 落地点，以及\"main ≠ 标签 v3.0.10，下次发布必须先升版本号\"和两封待处理建议信。取代早期 11 项 / 6498163 快照；权威源为 plans/MULTI_AGENT_INFRA_INTEGRATION_RESEARCH.md §13.19 与 decisions/0006、decisions/0008。"
status: "active"
created_at: "2026-09-19T04:26:50.620Z"
updated_at: "2026-09-20T07:32:05.336Z"
content_hash: "a07140010b8e6d7a5a93ace1e07739b7791458e8acd0eaba7e121ad7212a4ee4"
source_paths:
  - "plans/MULTI_AGENT_INFRA_INTEGRATION_RESEARCH.md"
  - "decisions/0006-root-instruction-block-ownership.md"
  - "decisions/0008-external-component-identifiers-and-observation.md"
  - "lib/observation-ledger.mjs"
  - "lib/root-marker-grammar.mjs"
  - "lib/memory.mjs"
  - "bootstrap/AGENTS.v2-block.md"
  - "scripts/test-observation-ledger.mjs"
  - "scripts/test-release.sh"
  - "CHANGELOG.md"
session_ids:
  - "6275cb6d-72bf-40ef-bc3d-4d7d7707444d"
  - "b185bd60-197d-4d4d-b687-8d18e0c584f5"
  - "1ae84e51-bed9-4989-b910-ed814975e922"
  - "eaa15f63-fd6a-44aa-acbd-b0161b77ccda"
memory_body_ids:
  []
---

# APG × Multi-Agent 生态融合：边界裁定与 13 项 owner 裁定收口

状态：**派生路由件，不是权威源**。权威顺序：`plans/MULTI_AGENT_INFRA_INTEGRATION_RESEARCH.md`（约 2,270 行；**§13.19 是 13 项裁定的逐项落地记录**，§13.15 是待拍板清单）→ `decisions/0006-root-instruction-block-ownership.md`（根块所有权 P1–P9）→ `decisions/0008-external-component-identifiers-and-observation.md`（外部组件命名空间）→ 仓内代码与门禁。冲突时以仓内为准。

本文**取代**早期快照（那份记的是 11 项决策、1,118 行报告、提交 `6498163`）。Flywheel 工具底表与逐项取证细节仍在报告 §10–§13，以及 `.agent-scratch/flywheel-research/flywheel-tools-raw-inventory.md`（**临时产物，非长期口径**）；本文不复制它们。

## 1. 结论：融合（正交），不是覆盖

Flywheel 是**执行面**（跑起来、强制住、别互踩、记得住），APG 是**权威面**（谁有权、凭什么、规则与证据的合约）。权限挂点不同：Flywheel 挂**工具门**（命令正则 / tracker label / 配额），APG 挂**主体**（plane/role/mode + 项目 policy）。

| 架构 | 裁定 |
|---|---|
| A Full Stack（自实现任务/消息/锁/生命周期/调度） | **Reject**——成本极大，且违反 `plans/DEVELOPMENT_ROADMAP.md` §1 既有非目标 |
| B 控制面 | **推荐** |
| C Meta Adapter | **条件性后续，设门槛**——中立 ABI 会抹平后端保证强度差异：四族原语交集只剩 `{task id, dependency, status, claim, message}`，恰好切掉 worktree 隔离、lease、supervisor 健康态 |

## 2. 让步档位：认定档位 1（用户 2026-09-19）

保留 descriptor · 角色语义 · 权威合成 · 证据/验收合同 · **项目 memory** · context assembly；让掉 任务/依赖(`br`) · 消息(Mail) · lifecycle/调度(NTM) · **记忆检索(CASS/EE)** · 文件协调。**失去项：无不可替代项**——让掉的都是 APG 早已声明不做的，所以这不是让步，是把早该划的线划实。

## 3. 三套记忆的分层（用户确认的定位变化）

| 层 | 作用域 | 写入 | 担保 | 地位 |
|---|---|---|---|---|
| APG `docs/memory` | **项目内，随 clone 走** | 非作者评审 + `project_digest` 绑定 | **有人** | **权威源** |
| EE / CASS | 本机 workspace | 自动 / 导入 | 无人（trust 仅作排序） | 派生物，可重建 |
| Mnemon / CM | 本机（`runtimeUserScope: global`） | 自动 | 无人 | 热工作记忆 |

**用户决定**：APG **保留**自己的记忆层，不与 DSH Mnemon 合并；**记忆随项目走**（git 记录为权威源，任何检索索引为派生）；**检索引擎交现成外部组件**（CASS/EE），不自己造轮子。`docs/memory` 从设计起就是**检索式**而非注入式，但检索面只到**文档级**：CLI 只有 `propose/review/promote/supersede/purge` 五个写动作，**无 list / show / search**。

**2026-09-20 收口补充（§13.19.6）**：`supersede` 的锚已拆分——历史记录的锚只要求**存在且格式良好**，不再要求等于当前描述符摘要。此前同一个锚同时当并发 CAS 护栏与历史溯源凭据，导致"描述符一变，此后任何 `promoted` 记录都无法再被 supersede"，自托管项目每次升版必中（18/18 记录带着两个历史纪元：16 条 = 3.0.3 提交 `fefd4923` 的描述符摘要，2 条 = 3.0.8 提交 `48a4c5a701`）。**18 条记录一条都没刷新**——就地刷新摘要等于洗白历史，修复只让它们重新可被 supersede。并发 CAS 仍在三处（`propose`/`review`/`promote`）要求当次摘要。

## 4. 每轮 token 面（已复测，早期数字已作废）

- **APG 自身根块：1,117 B ≈ 293 tok**（原 2,063 B ≈ 448 tok）。做法是把 v2 块改用它本就在给消费者发货的 **v3 CLI 段**（383 B），同时保留 v2 marker、标题、描述符行与占位符 schema。实测省 **946 B / 45.9%**，低于估算的 66%：**R7**（"claims cannot lower runtime/tool effects or manufacture … authority"）与建议信回退句必须逐字保留（前者在 v3 段里没有任何对应形式，后者被 `test-install.sh` 钉住路径）。
- 消费者侧：12 个仓用 **v3 块 731–758 B（≈192–199 tok）**；APG 自身曾是它的 2.3 倍。
- 工作区 `MEMORY.md` ≈1,194 tok + 全局 `USER.md` ≈626 tok 属环境侧，不在 APG 分发面。
- 结论不变：**`AGENTS.md` 是整套里唯一每轮付费的注入面**，因此它是唯一值得按字节预算管理的东西。

## 5. 根块写入方与 APG 的角色（11 个写入方，三档）

**Tier A（6，marker-scoped，共存靠构造成立）**：`br` `bv` `ee` `sbh` `frankenterm` `am`。
**Tier B（1，`ubs`）**：先复制再判断，重复运行的 `.backup` 会被已修改文件覆盖。
**Tier C（3，整文件 marker-immune）**：`cass` `ntm` `acfs`——**没有任何文法能保护 APG**。实测：`ntm setup --force` 把 2,140 B 根换成自己的 2,689 B 模板且不留备份；`cass --force` 把同一个根缩到 261 B。

因此边界要这样说：`guard-prefix` 保护的是 APG **插入点**不被搬移，不能阻止整文件写入方在 APG **之后**运行；那时 **P8 备份是唯一回滚点**，`install.sh check` 是唯一事后检测。marker 护栏 ≠ 完整保护。

**新增 P6 观测账本（2026-09-20，最小形态）**：`apg project observe --target <root>` 把"它看见过什么"追加到 clone-local `observation-ledger.jsonl`（0600，持项目锁）。每条记录含根文件存在性/大小/sha256 与每个 marker 行的原文、种类、属主、**marker 自己写的版本令牌**、行号、字节区间、近似 token。**不编辑、不升级、不删除、不修复；块缺失永远不是错误。** 词表与 P3 护栏**共用** `lib/root-marker-grammar.mjs`（一份定义，避免在"哪些块存在"上分叉）。门禁 `scripts/test-observation-ledger.mjs` 已接进 `scripts/test-release.sh`；它在写完之前抓出两个真实缺陷：`<project_rules>` 因字符类漏 `_` **从未入账**，孤立 `</project_rules>` 因"开启形态可识别"分支绕过了配对检查而入账。

## 6. 决策终态：13 项全部落地（2026-09-20 主人"全部按推荐"）

| # | 裁定 | 落地点 |
|---|---|---|
| 1 | 不动（P3 文法不再泛化到人手注释） | 无需改代码；32 行词表双向钉住 |
| 2 | 能力状态词表**不进分发面** | `decisions/0007:55` 早已记载，无需新写 |
| 3 | `declaration-observed` **不进正式词表** | ADR 0008 决策 3 |
| 4 | 外部命名空间**签字落地** | `decisions/0008`（`aada0f4`） |
| 5 | 证据验收合同**不升级**为机器可判 ＋ 措辞纪律 | §13.19.1；审计未发现 formal IV&V 过度声称 |
| 6 | 同 #2（跨 harness 契约维持门禁形态） | 无需改代码 |
| 7 | **批准最小形态**：P6 观测账本 | `lib/observation-ledger.mjs`＋`lib/root-marker-grammar.mjs`＋`apg project observe`＋门禁（`380e1f2`） |
| 8 | **选 A**：v2 块改用 v3 CLI 形态 | `bca360b`；省 946 B／45.9% |
| 9 | **选 A 拆锚**（附带"改名"项经复核**撤销**：前提不成立） | `c9d4f00` |
| 10 | 补打标签 `v3.0.4`–`v3.0.10` | 7 个附注标签已推送并逐个复核 |
| 11 | **不发布**消费者仓 | 12 个真实消费者仓一个都没碰（仍 schema 2 / 3.0.7） |
| 12 | **保留** `.agent-scratch/`，不点名删除 | §13.19.7：保留什么、删除只花重新下载（#13 清单已入库）、以及它**不**意味着什么 |
| 13 | **落库**最小溯源清单（连带 #15） | `ff41099`：11 个写入方的 repo+tag+asset id+双 sha256，2 个脚本件 HEAD，紧凑 1,921 B |

此前已闭合的 14–17：`frankenterm` 源构建实测（`270b0ad`＋`f8ca228`）、沙箱证据保留、默认即驱动真实二进制、`.gitattributes` clean filter 修读取抖动（`687bc6a`）。

**门禁证据（冻结内容上重跑）**：`scripts/test-release.sh` **exit 0**，97 PASS / 0 FAIL，`83 distributed files`、9 个命令组、写入方 `69 passed / 0 failed / 1 gap`（`ft` 发布件未编入该功能，已知且标注）、`template_match: true`、`anchor: both`。

## 7. 仍然是"外部可见"的后果，与两个待处理项

- **版本记账（最重要的一条）**：分发面 81 → **83** 文件，`PACKAGE_MANIFEST.json` 摘要 `6027df75…` → **`148974e8…`**，而 `PACKAGE_VERSION` 仍是 `3.0.10`。所以 **`main` ≠ 标签 `v3.0.10` 所钉的那份**；**下一次发布必须先升 `PACKAGE_VERSION`**（连同 `provider.release` 与随之变化的记忆锚）。在此之前，`3.0.10` 的权威是**标签**。故意不升号：升号会让 `apg` 对消费者宣告一个**无标签**的版本。
- **两封建议信（report-only，未提交，在 `.agent-project-guides/local/suggestions/`）**：① 中文**名词**任务（落地/收口/清单）命中不了任何词法规则——词表有 354 个中文字符，但全是"接在什么动词后面"的交付/否定动词，`收口`/`清单`/`裁定` 一个都没有；② 建议箱在 `templates/SUGGESTION_BOX.md:3` 被声明为 clone-local，但 `.agent-project-guides/local/` **未被 gitignore**，于是**按政策办事就会制造脏树**（`git add -A` 会把它带进发布提交）。两封都需要主人或 Maintainer 定夺。

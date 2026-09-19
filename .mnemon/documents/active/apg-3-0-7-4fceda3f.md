---
id: "4fceda3f-d7c9-46b9-897e-b9e13c60e6ca"
title: "APG 3.0.7 运作方式、角色清单与通用性（DSH 耦合）审查及清理"
description: "APG 3.0.7 公开交付面与治理运行闭环（描述符→context 路由→provider resolve/load）、2 平面 × 7 角色与转换规则、通用性审查的 S1/S2/S3 耦合点（file:line 证据），以及经用户批准的通用性清理实施结果：契约/README/profile/引导块去品牌化、bootstrap:agents-v2 ID 重命名+读别名、观察适配器注册缝、新通用性门禁测试、验证与回滚"
status: "active"
created_at: "2026-09-10T01:26:11.050Z"
updated_at: "2026-09-10T02:45:10.634Z"
content_hash: "4220601029b6a223f63197fc2e600d62ef58313342407490f6f1d75bb09af26f"
source_paths:
  - ".agent-project-guides.json"
  - "docs/V2_CONTRACT.md"
  - "profiles/CONTENT_PACKAGE.md"
  - "README.md"
  - "bootstrap/AGENTS.routing-block.md"
  - "roles/production/USER.md"
  - "lib/catalog.mjs"
  - "lib/core.mjs"
  - "scripts/apg.mjs"
  - "scripts/apg-launcher.mjs"
  - "scripts/test-install.sh"
  - "scripts/test-genericity.mjs"
  - "catalog/catalog.jsonl"
  - "PACKAGE_MANIFEST.json"
  - "plugins/README.md"
  - "plans/DEVELOPMENT_ROADMAP.md"
  - "plans/R6_DESIGN_REVIEW.md"
session_ids:
  - "ff334275-3992-4f99-9669-865727088bf1"
  - "abdc2086-2eeb-4eae-8f31-9cd29c2d9fd6"
  - "f63cc858-5f96-47b6-a62a-160305fec2ba"
memory_body_ids:
  []
---

# APG 3.0.7 运作方式、角色清单与通用性（DSH 耦合）审查及清理

本记录合并三个阶段：(1) `production/user` 只读路由下查明运作方式与角色；(2) `development/reviewer` report-only 通用性审查；(3) 用户批准后的 `development/maintainer` 实施与验证。全程按治理引导先路由后操作，未越角色边界。

## 1. 定位基线（用户明确纠正，不是包内表述）

agent-project-guides 是**通用型** agent 治理项目，**不绑死 DSH**。包内 "DSH-first governance core" 等措辞属长期配用 DSH 造成的偏移，应按通用性标准清理。未来仅有**可选** DSH 插件开发计划（额外开发插件辅助 apg 运作），DSH 适配是附加能力而非核心依赖；插件本身留待未来。

项目自身架构文档与之相符：`plugins/README.md` 宣告 "APG core is harness-neutral"、插件按 harness 独立版本化、"APG must not import the plugin or its host SDK"、发布白名单排除 `plugins/`；`plugins/dsh-apg/` 仅为 design scaffold（无插件代码，独立嵌套 git 仓库）。

## 2. 身份、交付面与运行闭环

本仓是包源仓，自宿主 `source-worktree`：`.agent-project-guides.json` = project_id `agent-project-guides`、release `3.0.7`、digest `observe`、facets `[content-package]`、overlays `[agent-governance]`、`policy.root` `AGENTS.md`、layout `docs/memory` + `.agent-scratch`、`protected_effects` 空。

分发集由 `lib/core.mjs` 定义：`DIST_DIRS` = bootstrap, catalog, docs, lib, procedures, profiles, roles, routing, schemas, templates；`DIST_FILES` = PACKAGE_REMOTE.json, PACKAGE_VERSION；`SCRIPT_FILES` = apg.mjs, apg-launcher.mjs, check-update.mjs, install.sh, manage-root-blocks.mjs, validate-routing.mjs。**runtime 包含 lib/scripts**（早期"仅 37 个 md 文件"的清单只覆盖 `.md`）。`plugins/` 被排除。源内不发布：`plans/`、`decisions/`、`fixtures/`、`docs/memory/`、`docs/V3_MINIMAL_SLICE.md`。

闭环：描述符 → 注入根策略文件的 7 步治理引导（任何仓库操作前必须 `apg context`；仅 `status=ready` 继续；`clarification_required` 必须提一个结构化问题并等待；其他错误停工上报；仅 `package_missing` 允许声明式降级；`intended` ≠ 生效上下文；角色声明不能制造权限）→ `apg context --target --task [--plane --role --mode]`（默认精简 AI 投影，4096/2048 token 闸门；`--format json` 为完整诊断）→ 低层 API `provider capabilities/resolve/search/load/export/import`（resolve 返回哈希校验后的有序 ID + token 预算 `utf8-bytes/4-ceiling`；load 返回 `[id, content]`；搜索建议不能替代强制策略）→ 安装模式 `thin-bootstrap` / `embedded-local` / `source-worktree` / 不可变 `sha256:<64hex>` runtime。

配套契约：互信责任（caller 拥有目标/输入/权威/副作用/成本，callee 负责如实效果披露、有界失败、不伪造成功）；风险 `runtime/admin > operation/tool > project > facet/overlay > task/role/caller`，效果取并集、层级取最大（R0–R3）；观测分级 `intended` / `host_observed` / `host_content_match` / `model_effective: unknown`；记忆草案在 clone-local 排他创建 → 非作者评审 → 绑定 digest 的 no-replace 原子晋升，更新走新 ID，永不 commit/push；`provider import` 修订守卫，拒绝改 project_id/mode/release/digest/policy.root。

## 3. 现有角色清单（2 平面 × 7 角色，与路由选项完全对应）

| 角色 | mode | 职责要点 | 规模 |
|---|---|---|---|
| production/user 产品使用 | `end-user` | 只读公开投递面；不读源码开发指南/内部架构/测试证据/ops runbook；子模式 End User、API/SDK Consumer、CLI User、MCP Consumer 共享同一顶级角色 | 431 tok |
| production/operator 生产运维 | `observe-health` | 部署/运行状态/恢复 | 613 tok |
| development/developer 项目开发 | `feature` | 新增功能、API、命令、服务、UI 行为或有意改变契约 | 797 tok |
| development/maintainer 项目维护 | `code` | 修 Bug/回归、维护测试、行为不变整理、清理过期说明；不扩成新功能，不静默重做整仓治理 | 1393 tok |
| development/reviewer 审查 | `static` | 默认 report-only、不实施修复；静态+隔离动态分析；禁生产环境/真实凭据/未脱敏数据 | 641 tok |
| development/verifier 验证 | `dynamic-verification` | 只对 `ready_for_verification` 候选给 verdict；不因跑测试获得生产/凭据/费用/数据/破坏性权限 | 460 tok |
| development/field-evaluator 实战评估 | `scenario-validation` | 按验收条件与真实路径做 Scenario Validation；不进 production、不维护基础设施、不改产品代码 | 767 tok |

转换规则：User 遇 Bug→Maintainer、提新能力→Developer、需部署/运行/恢复→Operator；Reviewer 遇真实场景→Field Evaluator、需修复→Maintainer/Developer；Field Evaluator 需实施→Developer/Maintainer。显式多角色授权可按序继续，但生产使用权限永不解释为源码/基础设施权限。

## 4. 通用性审查发现（阶段二，report-only）

**S1 核心代码硬编码（与自身 "harness-neutral core" 宣言冲突）**
- `scripts/apg.mjs:111` banner 固定列出 `dsh  Report DSH integration state`；`:621-666` `dshReport()` 位于核心、`:874` `if (group === 'dsh')` 直接 dispatch（无插件注册点）；`:494` 把通用 `policy.root` 称作 "managed DSH root"。
- `lib/catalog.mjs:55` 通用 AGENTS.md v2 引导块被赋予带品牌 ID `bootstrap:dsh-v2`（ID 属契约面）。
- `scripts/apg-launcher.mjs:147` banner 列完整命令表——**修正**：消费者安装下 launcher 确会委托运行时（`test-v2.mjs:473` 断言已装 launcher 执行 `dsh report`），该 banner 在消费侧准确；此前"虚报"观察仅适用 self-host 模式。

**S2 发布内容措辞漂移（进入消费者上下文）**
- `docs/V2_CONTRACT.md:5` "DSH-first governance core"；`:7` "non-DSH parity"（通用成了例外）；`:37` "compact DSH bootstrap"；`:78-89` 核心契约设 "DSH observation" 章节。
- `profiles/CONTENT_PACKAGE.md:31` 冷启动验收主语 "A fresh DSH task"。
- `README.md:3` "DSH 优先的项目治理内核"；`:203` 证据门以 DSH 命名；`:216` 通用 v2 块被称为 "DSH v2 bootstrap"。
- `bootstrap/AGENTS.routing-block.md:8` 内嵌单客户端工具映射 "(DSH: `ask_user_question`)"（`test-install.sh:59` 锁定该 token）。

**S3 源内历史/计划面（不发布，低危）**：`plans/*` 约 90 处 DSH 提法。其中两条约束决定了清理边界：`plans/R6_DESIGN_REVIEW.md:58` "Do not silently reinterpret the legacy `apg dsh report` API or remove it as an unrelated cleanup"、保留 `model_effective: unknown`；`plans/DEVELOPMENT_ROADMAP.md:37`（R6-A）"保留旧 report 语义，不能只改名称就宣称所有 harness 已支持"。

**正面确认（已通用）**：描述符 4 个 schema 零 client/dsh 字段；`routing/*.jsonl` 零客户端词；`AGENTS.v2-block.md`、`AGENTS.adapter-trigger` 本体干净；多客户端对等先例已存在——`policy.root` 枚举 `AGENTS.md|CLAUDE.md`（`lib/descriptor*.mjs`、`apg.mjs:126`）、`CLAUDE.scope-block` + opt-in `--sync-claude-scope` + 块标记 `agent-project-guides:claude-scope` + 幂等/恢复测试。不对称点即越位点：CLAUDE 走"块+选项"，DSH 走"核心子命令+契约章节"。

## 5. 已实施清理（阶段三，用户批准"可以进行通用性修改，插件是未来计划"）

| 文件 | 变更 |
|---|---|
| `docs/V2_CONTRACT.md` | 定位句 → "harness-neutral agent governance core"；"non-DSH parity" → "universal cross-harness parity"；"compact DSH bootstrap" → "compact bootstrap"；"## DSH observation" → "## Harness observation"（DSH 适配器作为当前实例描述）+ 规范句"适配器是附加物，永不扩展路由语义/权威/描述符"；Provider API 段追加 ID 迁移注记 |
| `profiles/CONTENT_PACKAGE.md` | "A fresh DSH task" → "A fresh agent task in a supported client" |
| `README.md` | 定位、证据门、ownership 表三处去品牌化（受 11000 字节预算约束，压到 10989） |
| `bootstrap/AGENTS.routing-block.md` | 移除客户端品牌工具映射 → "the host's structured question tool"；`test-install.sh:59` 断言同步改为 `structured question tool` |
| `lib/catalog.mjs` | 通用块 ID → `bootstrap:agents-v2`；导出 `CATALOG_ID_ALIASES` / `normalizeCatalogId`（旧 `bootstrap:dsh-v2` 永久读别名，沿用 g1_/g2_/g3_ 兼容先例）；`resolveRoute` 的 mandatory 校验与 verifyEntry 接入归一化 |
| `scripts/apg.mjs` | import `normalizeCatalogId`；banner dsh 行 → `[compat] DSH observation adapter (future: plugins/dsh-apg)`；`OBSERVATION_ADAPTERS` 注册缝取代 `group === 'dsh'` 硬编码 dispatch；"managed DSH root" → 通用表述；provider load / mandatory 校验接入别名归一化 |
| `scripts/test-genericity.mjs`（新增） | 通用性门禁：扫描 38 个 md 引导面（bootstrap/docs/procedures/profiles/roles/templates）零客户端词；允许项=客户端专属块（`bootstrap/CLAUDE.scope-block.md`）、`policy.root` 文件名（`*.md`）、旧 ID 迁移注记、`V2_CONTRACT.md` 的 Harness observation 区段；并锁定 banner `[compat]` 标注与注册缝存在 |
| `catalog/catalog.jsonl`、`PACKAGE_MANIFEST.json` | 由 `apg catalog build`（251 entries, valid）+ `apg release manifest` 重新生成（author check 流程） |

## 6. 验证证据（全部本地实测）

- `test-v2.mjs` PASS（含 DSH reporting 回归）· `test-v3.mjs` PASS · `validate-routing.mjs` PASS · `test-schema.py` PASS · `test-install.sh` PASS · `test-genericity.mjs` PASS。
- 别名冒烟：`provider load --id bootstrap:agents-v2` 与 `--id bootstrap:dsh-v2` 均加载并归一化为 `bootstrap:agents-v2`。
- 兼容语义未变：`apg dsh report` 仍返回 `adapter:"dsh"`、`observation:"bounded"`（R6 约束满足，非静默移除/重解释）。
- 自宿主路由复验：`apg context --plane development --role maintainer --mode code` = ready。
- 变更规模：9 个跟踪文件 +1 新文件，+55/−36 行。

## 7. 与原批准方案的三处偏差（均有依据）

1. banner 用 `[compat]` **标注**而非整行删除：`plans/R6_DESIGN_REVIEW.md:58` 禁静默移除旧 API，且消费侧 launcher 真实委托 `dsh report`——标注比隐藏更诚实。
2. 修正阶段二两处误判：launcher banner 在消费安装下准确（委托机制存在）；release runtime 含 `lib/scripts`。
3. adapter seam 为**进程内注册表**而非物理拆文件：插件化本体按用户决定留给未来 `plugins/dsh-apg`。

## 8. 回滚与遗留

- 回滚：备份分支 `backup/pre-genericity-cleanup-20260910T022714Z`（HEAD `560bd8f`）+ 文件副本 `.agent-scratch/genericity-cleanup-20260910T022714Z/backups/`；单文件恢复用 `git checkout backup/… -- <path>`，随后必须重跑 `catalog build` + `release manifest`。
- 遗留（proposal 级，未动）：README 字节预算 11000 仅剩 ~11 字节（HEAD 时仅 6），后续 README 编辑极易顶破，建议单独调整预算或瘦身；`plans/` 的 R6-A 条目未回填完成状态；未新增 ADR。
- 开放决策（等用户）：是否提交（建议单 commit，如 "Generalize harness positioning and demote DSH adapter to compat seam"）、是否 bump 版本（如 3.0.8）。消费者仓库钉住 3.0.7 release digest，本次变更在发版前不影响任何消费者；旧 ID 读别名已保证升级兼容。

## 9. 证据位置

描述符 `.agent-project-guides.json`；契约 `docs/V2_CONTRACT.md`；架构边界 `plugins/README.md`、`plugins/dsh-apg/README.md`；发布白名单 `lib/core.mjs`；目录元数据 `catalog/catalog.jsonl`；清单位 `PACKAGE_MANIFEST.json`；备份分支与 `.agent-scratch/genericity-cleanup-20260910T022714Z/`。

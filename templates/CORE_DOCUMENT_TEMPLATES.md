# 核心项目文档模板

> 仅在角色指南要求实际创建或重构项目文档时读取相应小节。不要整份复制，也不要为不适用的角色创建空文档。
>
> 模板中的 `<...>` 必须用仓库证据替换；无法确定的内容写为 `unknown`，不能保留模糊占位符后声称完成。

## 1. 根 `AGENTS.md` 模板

目标位置：`<project>/AGENTS.md`

这是兼容 harness 在首轮前自动加载的机械入口，不是 README 的重复摘要。包脚本把永久两层角色路由原样追加到现有根文件；适配子模式只在该 managed block 之外合并以下项目专属章节，不得整文件覆盖、移动或重复路由 block。方案二完成后通过脚本只删除 `adapter-trigger`。不要把完整治理包、生产使用提示或运维 runbook 复制进根入口。

```markdown
# Repository agent instructions

## Project

<一句话说明项目提供什么能力及主要运行形态。>

## Project evidence routing

1. 永久 managed block 已选定 plane、role 和 submode 后，将任务映射到：<本项目实际存在的任务类型>。
2. 服从 harness 已按路径注入的最近目录级 `AGENTS.md` 局部覆盖。
3. 再读 `docs/INDEX.md` 中对应入口、一个相关模块契约和命中的实现/测试。
4. 只有局部证据不足时才扩大到完整架构、ADR、经验或原始资料。
5. 收集证据后再计划、修改和验证。

## Global invariants

- <跨所有模块成立的安全、兼容或依赖红线。>
- <生产、网络、秘密、迁移或破坏性操作的默认规则。>
- <生成物、数据和配置的保护规则。>
- 保留用户和其他 agents 的并行修改。

## Source precedence

1. 当前实现和自动化测试定义已实现行为。
2. 公共 schema/契约定义预期接口。
3. 当前架构和模块文档定义边界与不变量。
4. knowledge 记录已验证经验，evidence 保存证据。
5. roadmap 不代表当前能力。

冲突时报告版本和时间范围，不得静默合并。

## Verification

按 `docs/verification/MATRIX.md` 选择验证。不得凭记忆猜测命令。

## Documentation triggers

公共接口、模块边界、部署/配置、安全副作用和可复用经验变化时，更新对应权威文档或生成物；仅内部实现变化通常只需测试。
```

裁剪规则：

- 小项目可以缩短分类和优先级，但不能删除风险、验证和证据顺序。
- MCP 消费说明、完整 API 表、部署教程和 roadmap 不得放入此文件。
- 目录级 `AGENTS.md` 只增加必须在进入目录时生效的局部覆盖，并链接详细模块契约；不得重复根规则。
- 最终根入口必须保留恰好一个永久 routing block 和准确适配状态；不得保留方案二的 `adapter-trigger` 或把 User/Operator 生产提示复制进根入口。

## 2. `docs/INDEX.md` 模板

目标位置：`<project>/docs/INDEX.md`

```markdown
# Documentation index

## Read by role

| Role | Start here | Do not preload |
|---|---|---|
| Developer | `development/START.md` | usage、operations、evidence，除非任务需要 |
| Maintainer | `development/START.md` 或命中模块契约 | production usage、operations |
| Reviewer | `verification/MATRIX.md` 和目标 diff/契约 | production、包适配流程 |
| Field Evaluator | `evaluation/<scenario>.md` 或非生产 usage | production operations、整仓源码 |
| User | `usage/<entry>.md` 或 MCP 公共投递面 | development、内部 architecture、operations |
| Operator | `operations/<runbook>.md` | development、User 长提示、roadmap |

删除项目中不存在的角色行。

## Read by task

| Need | First read | Next exact detail |
|---|---|---|
| 修改源码 | `development/START.md` | 一个 `modules/<module>.md` |
| 理解系统边界 | `architecture/OVERVIEW.md` | 对应模块或 ADR |
| 找测试 | `verification/MATRIX.md` | 匹配测试配置/测试文件 |
| 使用公共能力 | `usage/` 或生成参考 | 精确接口/命令/tool |
| 非生产实战评估 | `evaluation/` | 匹配 usage、环境和数据权限 |
| 部署/恢复 | `operations/` | 精确 runbook 小节 |
| 查已知行为 | `knowledge/` | 链接的 evidence |

## Ownership

| Area | Owns | Does not own |
|---|---|---|
| `architecture/` | 当前边界和不变量 | roadmap、实验日志 |
| `modules/` | 模块职责和变更契约 | 逐文件复述 |
| `verification/` | 修改类型到验证方式 | 历史测试输出 |
| `usage/` | User 可依赖的公共产品契约 | 内部构建细节 |
| `evaluation/` | 非生产动态场景证据和需求发现 | production runbook、未脱敏数据 |
| `operations/` | Operator 的部署、监控、恢复 | 产品 roadmap、User 长提示 |
| `decisions/` | 历史决策原因 | 当前操作步骤 |
| `knowledge/` | 已验证可复用结论 | 未验证猜测 |
| `evidence/` | 原始证据和报告 | 规范性指导 |
| `roadmap/` | 未实现计划 | 当前能力 |
| `generated/` | 派生参考 | 手工权威事实 |
```

只保留项目实际存在的区域。

## 3. `docs/development/START.md` 模板

目标位置：`<project>/docs/development/START.md`

```markdown
# Development start

## Prerequisites

- <语言、运行时和版本>
- <依赖安装命令>
- <平台限制>

## Entrypoints

| Purpose | Entrypoint | Notes |
|---|---|---|
| Run | `<command/path>` | <是否有副作用> |
| Test | `<command/path>` | <默认是否离线> |
| Build | `<command/path>` | <输出目录> |
| Generate | `<command/path>` | <权威来源> |

## Development workflow

1. 从 `docs/INDEX.md` 选择任务入口。
2. 读取相关模块契约和匹配测试。
3. 形成任务卡并确认风险权限。
4. 修改后按验证矩阵执行。
5. 检查文档和生成物触发条件。

## Configuration and data ownership

| Item | Owner module/path | Committed? | Notes |
|---|---|---|---|
| <config/state/cache/secret> | <path> | yes/no | <规则> |

## Common failures

| Symptom | Cheapest check | Exact runbook/detail |
|---|---|---|
| <问题> | <检查> | <链接> |
```

## 4. `docs/architecture/OVERVIEW.md` 模板

目标位置：`<project>/docs/architecture/OVERVIEW.md`

```markdown
# Architecture overview

## Scope and current status

<只描述当前已经实现并由证据支持的系统。未确定项标为 unknown。>

## Runtime topology

<进程、包、服务、浏览器、数据库或外部系统之间的关系。>

## Modules

| Module | Owns | Does not own | Entrypoint | Contract |
|---|---|---|---|---|
| <module> | <职责> | <非职责> | <path/symbol> | `../modules/<module>.md` |

## Dependency direction

```text
<上层> -> <下层> -> <基础设施>
```

- 允许：<依赖规则>
- 禁止：<反向依赖或跨边界调用>

## Data and configuration ownership

| Data/config | Owner | Lifecycle | Safety boundary |
|---|---|---|---|
| <item> | <module> | <runtime/build/persistent> | <规则> |

## Invariants

- <由实现/测试证明的不变量>

## Unknowns

- <尚不能确定的架构事实和所需证据>

## Decisions

- <仅链接 ADR，不在此重复历史讨论。>
```

## 5. 模块契约模板

目标位置：`<project>/docs/modules/<module>.md`

```markdown
# <Module> contract

Status: verified | inferred | mixed

## Owns

- <职责>

## Does not own

- <明确排除的职责及其所有者>

## Entrypoints

| Kind | Path/symbol | Purpose |
|---|---|---|
| Runtime/public/test/generate | `<entry>` | <说明> |

## Contracts and invariants

- <输入、输出、公共行为和不可破坏的不变量>

## Dependencies

- Allowed: <依赖>
- Forbidden: <依赖>

## Data, configuration and generated files

| Item | Owner | Read/write behavior | Source of truth |
|---|---|---|---|
| <item> | <owner> | <行为> | <权威来源> |

## Verification

| Change | Required verification |
|---|---|
| <变化> | `<command/test>` |

## Documentation triggers

- <哪些变化更新 usage/architecture/operations/knowledge/generated>

## Unknowns

- <未确认内容及需要的证据>
```

只有以下信息必须在 agent 第一次触碰模块文件时生效，才同时创建 `<project>/<module>/AGENTS.md`：

```markdown
# <Module> local agent instructions

- Scope: this directory and descendants only.
- Read the authoritative contract: `docs/modules/<module>.md`.
- Must: <进入模块前必须执行的局部红线>。
- Must not: <禁止依赖、写入或副作用>。
- Ownership: <局部数据、配置、生成物所有权摘要>。
- Verify: `<最小必须验证命令或 MATRIX 精确入口>`。
```

局部入口依靠 harness 的目录链注入，不要求根入口提前读取。只保留立即可执行的差异；详细职责、证据、动态接口和解释继续放在模块契约或代码权威来源，避免双份漂移。

## 6. `docs/verification/MATRIX.md` 模板

目标位置：`<project>/docs/verification/MATRIX.md`

```markdown
# Verification matrix

## Defaults

- 默认网络：offline | mocked | live
- 默认生产写入：forbidden
- <项目级验证红线>

| Change type/module | Fast check | Required tests | Broader validation | External cost/risk |
|---|---|---|---|---|
| Documentation only | <link/lint> | <docs test> | <none> | 0 |
| Internal logic | <unit> | <target tests> | <integration condition> | <risk> |
| Public API/tool/CLI | <schema/static> | <contract tests> | <compatibility> | <risk> |
| Data/migration | <dry run> | <fixture/replay> | <approved integration> | <risk> |
| UI | <component> | <interaction> | <visual/manual> | <risk> |
| Deployment/config | <lint> | <smoke> | <staging/approved> | <risk> |

## Live or destructive verification

<审批、预算、dry-run、fixture、停止和回滚规则。>

## When verification cannot run

报告未执行项、原因、剩余风险和人工步骤；不得声称已验证。
```

## 7. 消费者 usage 文档模板

目标位置：按项目实际选择，例如 `docs/usage/API.md`、`docs/usage/CLI.md`。只有项目存在外部消费者时创建。

```markdown
# <Capability> usage

Audience: <API/library/CLI/MCP consumer>

## Contract

<消费者可依赖的公共行为，不包含内部构建细节。>

## Inputs and outputs

<优先链接生成的 schema/command/tool reference。>

## Examples

<最小真实示例。>

## Errors and side effects

<错误、网络、数据修改、成本和幂等性。>

## Versioning and compatibility

<兼容承诺和废弃流程。>
```

MCP 消费者说明优先通过 MCP 协议投递；仓库 usage 文档作为权威说明或生成来源，而不是要求消费者读取开发 `AGENTS.md`。

## 8. 运维 runbook 模板

目标位置：`<project>/docs/operations/<runbook>.md`。只有存在部署或长期运行态时创建。

```markdown
# <System> runbook

Audience: operator

## Preconditions and access

<环境、权限、秘密来源和安全边界。>

## Deploy/start/stop

<可执行步骤和成功信号。>

## Configuration

<配置来源、优先级、秘密和重载行为。>

## Health and observability

<健康检查、日志、指标和告警。>

## Recovery and rollback

<故障诊断顺序、回滚和数据保护。>

## Destructive actions

<确认、备份、审批和停止条件。>
```

初始化或维护 agent 只负责在项目需要时创建并验证该文档；日常开发 agent 和产品消费者不应预读它。

## 9. Field evaluation 记录模板

目标位置：`<project>/docs/evaluation/<scenario>.md`。只有项目实际执行非生产真实场景评估时创建；不得记录秘密或未脱敏生产数据。

```markdown
# <Scenario> field evaluation

Mode: scenario-validation | exploratory-evaluation
Environment: development | test | staging
Data: synthetic | fixture | sanitized-copy | approved-real-data-copy
Evaluated at: <ISO-8601 UTC>
Version/range: <build, commit, schema or data version>

## Permission boundary

<账号、网络、费用、允许写入和禁止动作。>

## Scenario and expected outcome

<真实工作流、验收条件或探索目标。>

## Observations and evidence

<输入、输出、日志/截图引用和副作用；区分 verified 与 inferred。>

## Findings

<product defect | environment issue | data issue | test gap | feature proposal>

## Cleanup and residual risk

<测试数据清理、未执行场景和剩余风险。>
```

## 10. ADR 模板

目标位置：`<project>/docs/decisions/NNNN-<decision>.md`

```markdown
# NNNN: <Decision>

Status: proposed | accepted | superseded
Date: <date>

## Context

<当时的问题和约束。>

## Decision

<作出的选择。>

## Consequences

<收益、代价和后续约束。>

## Alternatives

<被考虑但未采用的方案。>
```

ADR 解释历史选择，不承担当前操作步骤；当前边界仍由 architecture/modules 描述。

## 11. 子 agent 显式授权模板

目标位置：父 agent 发给子 agent 的任务提示，不写入项目根入口。父 agent 必须替换全部字段；角色已经明确时，子 agent 跳过自分类，只读指定角色入口。

```text
Plane: Production | Development
Role: User | Operator | Developer | Maintainer | Reviewer | Field Evaluator
Submode: <精确子模式>
Objective: <一个可验证目标>
Deliverable: <报告、代码、测试证据、运行结果或项目文档>
Read scope: <允许读取的路径/接口>
Write scope: report-only | <允许写入的路径>
Environment: <production/dev/test/sandbox/staging>
Data: <synthetic/fixture/sanitized/approved real data/none>
Network and cost: <允许范围和预算>
Destructive actions: forbidden | <明确批准动作>
Verification: <命令或验收证据>
Role transitions: none | <用户已预先授予的其他角色和顺序>
Escalation: ask parent/captain; do not ask the end user directly
```

子 agent 不继承父 agent 未写入任务卡的角色、凭据、生产权限、数据权限或破坏性授权。分配与实际任务冲突时停止并向 parent/captain 澄清；不得通过读取其他角色指南自行扩权。父 agent 只有在用户已经明确授予时才能传递跨角色或生产权限。

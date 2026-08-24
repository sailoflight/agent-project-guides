# Agent 项目开发治理文档包

> 本目录提供项目角色路由、包适配流程和按项目类型裁剪的文档规范。它不是要求所有 agents 全文预读的总提示词。

## 自动加载边界

DeepSeek Harness 的项目指令加载基于文件名和目录链：

- session 启动时，从 `.git` 项目根到当前工作目录自动加载精确命名的 `AGENTS.md`、`CLAUDE.md` 及 local overlay；
- 已加载 baseline 会在每个 model step 前重新探测，因此运行中追加根 `AGENTS.md` 通常会在下一步投递；
- `README.md`、本包角色指南和 routing 文件不会因为放在项目子目录就自动加载；
- 新出现的后代目录级 `AGENTS.md` 需要 agent 通过文件工具触碰对应路径后按需注入；
- DSH code preset 的自动指令总预算当前为 65,536 bytes，本包把合并后的根入口限制为 16,384 bytes；
- 该机制要求 preset 启用 `dsh-agent-instructions`，minimal preset 不启用该插件。

因此根 `AGENTS.md` 只追加短小的永久路由和适配状态，不放完整角色指南、User 生产使用提示或 Operator runbook。

## 两层角色路由

agent 在读取角色简介前先判断工作平面：

```text
Production plane
  -> User：通过公开 UI/API/SDK/CLI/MCP 使用已部署产品
  -> Operator：部署、配置、观察、事件响应、备份、恢复和回滚

Development plane
  -> Developer：新行为、功能和有意契约变化
  -> Maintainer：Bug、测试、行为保持型整理和已有项目重新适配
  -> Reviewer：静态审查和隔离环境动态分析
  -> Field Evaluator：非生产真实场景动态验证和需求探索
```

平面不明确时，agent 必须询问“这是生产使用/运维还是开发工作”，并在回答前停止读取两个平面的角色索引。进入一个平面后只读：

- Production：`routing/PRODUCTION_ROLES.md`
- Development：`routing/DEVELOPMENT_ROLES.md`

角色仍不明确时再次询问，确认后只读一个角色指南。用户明确授予多个兼容角色或子模式时，无需重复询问；但生产凭据、真实数据、破坏性动作和外部费用仍需要单独明确授权。

## 包适配不是顶级角色

包适配是两个 Development 子模式共享的流程：

- 新或实际上为空的项目：Developer / Project Initializer
- 已有项目：Maintainer / Package Re-adapter

两者读取自己的角色指南和 `PACKAGE_ADAPTATION_PROCEDURE.md`。普通 Feature Developer 和 Code Maintainer 不预读包适配流程。

Package Re-adapter 可以在后期重复执行，用于包版本变化、路由漂移、文档边界失效或局部重新规整。

## 适配状态

永久根路由包含一行短状态：

```text
Package adaptation: status=pending; package_revision=1.0.0; verified_at=never; scope=repo; reason=not_adapted
```

字段含义：

- `status`：`pending`、`partial`、`adapted`、`stale` 或 `blocked`
- `package_revision`：当前合并的 `PACKAGE_VERSION`
- `verified_at`：完整/部分验收的 ISO-8601 UTC 时间；未验收为 `never`
- `scope`：`repo` 或准确的局部适配范围
- `reason`：`adapted` 时为 `none`，其他状态为简短非敏感 reason code

Project Initializer 和 Package Re-adapter 通过 `set-state` 写入 `partial`、`adapted` 或 `blocked` 结果；安装器在初次合并、包版本变化和显式重新适配时管理 `pending`/`stale`。时间字段本身不能证明适配完成，必须通过流程中的证据和冷启动验收。

## 放入目标项目

在目标项目内部放置本包，例如：

```text
<project>/
  agent-project-guides/
  AGENTS.md
```

脚本全部位于包内，不向目标项目投放额外安装程序。独立 clone 作为普通 vendored 目录时应移除内层 `.git`；作为 submodule 时不要从 submodule 内启动针对宿主项目的 agent。

## 方案一：永久路由原样合并，客户显式调用

运行：

```bash
./agent-project-guides/scripts/install.sh merge
```

脚本只执行机械文件迁移：

1. 保留现有根 `AGENTS.md` 的原始字节前缀；
2. 在文件末尾原样追加 `bootstrap/AGENTS.routing-block.md` 的渲染结果；
3. 初始化 `pending` 适配状态；
4. 校验路径、marker、UTF-8、候选冲突和体积；
5. 不启动或调用任何 LLM，不追加适配触发。

随后由客户显式命令 LLM：

```text
新项目：以 Development / Developer / Project Initializer 子模式执行包适配。
已有项目：以 Development / Maintainer / Package Re-adapter 子模式执行包适配。
```

适配 agent 完成后运行 `set-state`。方案一没有临时提示词需要删除。

## 方案二：在现有入口末尾追加一次性触发

运行：

```bash
./agent-project-guides/scripts/install.sh trigger
```

脚本先确保永久路由存在，然后在同一个现有 `AGENTS.md` 末尾追加 `bootstrap/AGENTS.adapter-trigger.md`：

1. 不替换、移动、改名或停用原 `AGENTS.md`；
2. 不创建 `AGENTS_origin.md`；
3. 下一个兼容 agent 先判断新/已有项目，选择 Project Initializer 或 Package Re-adapter；
4. 完成规范和验证后更新状态为 `adapted`；
5. 运行 `remove-trigger`，只删除一次性 trigger，保留原项目内容和永久路由；
6. 重新读取根入口，再处理用户的原始任务。

若状态已经 `adapted` 但 trigger 因中断尚未删除，下一个 agent 只执行清理，不重复适配。无法安全完成时写 `blocked` 和 reason，保留 trigger 并询问用户是否重试、缩小范围、跳过或人工移除，避免无限重入。

## 脚本命令

```bash
./agent-project-guides/scripts/install.sh merge
./agent-project-guides/scripts/install.sh trigger
./agent-project-guides/scripts/install.sh check
./agent-project-guides/scripts/install.sh set-state \
  --status adapted \
  --verified-at 2026-08-24T12:00:00Z \
  --scope repo \
  --reason none
./agent-project-guides/scripts/install.sh remove-trigger
./agent-project-guides/scripts/install.sh unmerge
```

所有命令支持 `--target <project>`。省略时从包父目录向上查找最近 `.git` 文件或目录。

安全约束：

- 发现旧版 root-replacement `handoff` marker 时拒绝继续；先使用对应旧版本回滚或人工恢复原入口，再使用 append-only 安装器；
- `CLAUDE.md`、`AGENTS.local.md` 或 `CLAUDE.local.md` 同时存在时拒绝自动合并，要求客户先协调优先级；
- 根 `AGENTS.md` 是 symlink 时拒绝，避免改变链接语义；
- 无效 UTF-8、marker 冲突和合并后超过 16,384 bytes 时原文件保持不变；
- 同版本重复 `merge`/`trigger` 幂等；
- `PACKAGE_VERSION` 变化后再次 `merge` 会刷新 managed routing 并把状态标记为 `stale`；已有 trigger 会在再次 `trigger` 时同步刷新；
- `remove-trigger` 只接受 `status=adapted`；
- `unmerge` 只删除 managed routing，且要求 trigger 已先移除。

## 角色入口

| 平面/角色 | 必读 | 按需读取 | 不应预读 |
|---|---|---|---|
| Production / User | `USER_AGENT_GUIDE.md` | 项目 `docs/usage/`、公共协议或 MCP 投递面 | 源码开发指南、内部架构、operations |
| Production / Operator | `OPERATOR_AGENT_GUIDE.md` | 项目 operations/runbook 和有限运行时架构 | 开发指南、User 提示、包适配流程 |
| Development / Feature Developer | `DEVELOPER_AGENT_GUIDE.md` 第 9-14 节 | 一个模块契约、验证矩阵、匹配 profile | 包适配流程和生产投递面 |
| Development / Project Initializer | `DEVELOPER_AGENT_GUIDE.md` 第 0-8 节 | `PACKAGE_ADAPTATION_PROCEDURE.md`、匹配 profile 和精确模板小节 | Maintainer、生产投递面 |
| Development / Code Maintainer | `MAINTAINER_AGENT_GUIDE.md` | 一个模块契约、验证矩阵 | 包适配流程、生产投递面 |
| Development / Package Re-adapter | `MAINTAINER_AGENT_GUIDE.md` | `PACKAGE_ADAPTATION_PROCEDURE.md`、匹配 profile 和精确模板小节 | Developer、生产投递面 |
| Development / Reviewer | `REVIEWER_AGENT_GUIDE.md` | 目标 diff、契约和 sandbox 验证 | 生产环境/数据、包适配流程 |
| Development / Field Evaluator | `FIELD_EVALUATOR_AGENT_GUIDE.md` | dev/test/staging 使用入口和获批数据边界 | production、Operator runbook、整仓源码 |

项目 profiles：

- MCP：`profiles/MCP_PROJECT.md`
- library/CLI：`profiles/LIBRARY_AND_CLI_PROJECT.md`
- application/service/GUI/monorepo/data：`profiles/APPLICATION_SERVICE_MONOREPO.md`

只读取匹配 profile。项目组合形态可读取多个匹配文件，但不能预载无关 profile。

## 子 agents 权限

父 agent 必须为每个子 agent 显式传递：

```text
plane
role / submode
objective and deliverable
read scope
writable paths
environment and data permissions
network / cost / destructive permissions
verification
escalation target
```

子 agent 不继承父 agent 的全部角色或权限，不自行切换平面，不读取其他角色指南。分配缺失或冲突时向父 agent/captain 请求澄清，而不是直接扩大权限或绕过用户授权。只有明确分配的 Project Initializer/Package Re-adapter 可以修改适配状态；只有 Operator 可以执行获批生产运维动作。

## 包结构

```text
agent-project-guides/
  PACKAGE_VERSION
  README.md
  DEVELOPER_AGENT_GUIDE.md
  MAINTAINER_AGENT_GUIDE.md
  REVIEWER_AGENT_GUIDE.md
  FIELD_EVALUATOR_AGENT_GUIDE.md
  USER_AGENT_GUIDE.md
  OPERATOR_AGENT_GUIDE.md
  PACKAGE_ADAPTATION_PROCEDURE.md
  routing/
    PRODUCTION_ROLES.md
    DEVELOPMENT_ROLES.md
  bootstrap/
    AGENTS.routing-block.md
    AGENTS.adapter-trigger.md
  scripts/
    install.sh
    test-install.sh
  profiles/
    MCP_PROJECT.md
    LIBRARY_AND_CLI_PROJECT.md
    APPLICATION_SERVICE_MONOREPO.md
  templates/
    CORE_DOCUMENT_TEMPLATES.md
```

bootstrap 模板故意不命名为包内精确 `AGENTS.md`，避免 agent 读取或维护模板目录时被 harness 当作真实目录级指令注入。

## 交付完成标准

没有历史上下文的 agent 应能在不预读本包全文的情况下回答：

1. 当前任务属于 Production 还是 Development？
2. 当前角色和子模式是什么；不明确时应向谁询问？
3. 该角色只应读取哪个入口、允许哪些环境和数据？
4. 修改或操作前有哪些安全、兼容和副作用约束？
5. 应运行哪些验证，结果投递到哪里？
6. 包适配状态、版本、时间、范围和 reason 是否可信？

不能回答这些问题、存在重复 routing block、方案二仍有已完成但未清理的 trigger，或状态与实际证据不一致，说明入口治理尚未完成。

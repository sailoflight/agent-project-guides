# 包适配共享流程

> 这不是独立角色指南，只能由两个 Development 子模式执行：新/空项目使用 Developer / Project Initializer；已有项目使用 Maintainer / Package Re-adapter。
>
> Bug、测试、行为保持型整理和改进建议属于普通 Maintainer；新功能属于 Feature Developer。无法判断项目是新建还是已有时，先询问用户，不得同时预读两个角色指南。
>
> 路径约定：本文中的 `profiles/...`、`templates/...` 等包内路径，以当前治理包目录为基准；`AGENTS.md`、`docs/...` 等交付路径，以目标项目根目录为基准。

## 0. 激活方式和适配状态

包适配是按需、可重复执行的任务族，仅在以下情况激活：

- 用户明确要求初始化、适配、重新适配或按包规范规整项目；
- 方案二的根 `adapter-trigger` 显式要求先完成适配；
- 根适配状态为 `pending`、`partial`、`stale` 或 `blocked`，且用户确认执行或重试；
- 已适配项目发生路由、架构、验证或安全治理漂移，需要重新验收。

方案一由客户运行 `scripts/install.sh merge` 原样追加永久路由，再显式授予 Project Initializer 或 Package Re-adapter 子模式；脚本不调用 LLM。方案二运行 `scripts/install.sh trigger`，在现有根 `AGENTS.md` 末尾追加一次性 `adapter-trigger`；触发先判断新/已有项目，再选择相应子模式，完成后只删除触发块。

Project Initializer 和 Package Re-adapter 只能通过 `scripts/install.sh set-state` 写入结果状态：完整验收为 `adapted`，写入当前 `package_revision`、ISO-8601 UTC `verified_at`、实际 `scope` 和 `reason=none`；分批完成写 `partial`；无法继续写 `blocked` 和非敏感 reason code。安装器在初次合并、包版本变化和显式重新适配时管理 `pending`/`stale`。不得用时间字段代替完成证据。

本文件是执行流程。不能只提交分析或改进建议；必须形成可用的阶段性产物。Project Initializer 同时服从 Developer 指南的新项目规则；Package Re-adapter 同时服从 Maintainer 指南的范围和风险边界。

## 1. 任务目标

在不改变项目主要产品行为和代码架构的前提下，使没有历史上下文的开发 agent 能够：

- 快速识别项目类型、运行形态和风险边界；
- 从根入口路由到一个相关模块，而不是全读仓库；
- 理解模块负责和不负责什么；
- 找到真实的实现入口、测试和验证命令；
- 区分 Development、User、Operator、当前架构、历史证据和未来计划；
- 在修改后知道应同步哪些契约或生成物。

文档数量不是目标。减少猜测、错误定位、无关读取和返工才是目标。

## 2. 开工前的最小任务卡

根据用户请求和低成本仓库证据补全：

```text
目标：本轮要改善的冷启动或文档问题
范围：允许整理的项目、模块和文档
非目标：本轮不修改的产品行为和代码架构
验收：新 agent 应能完成哪些定位和验证任务
约束：兼容性、并行修改、外部系统、秘密和生产副作用
证据入口：构建文件、入口、测试、CI、现有文档
验证：链接、命令、生成一致性和冷启动演练
未决项：必须由负责人决定的产品或架构问题
```

仓库证据能够回答的事实不要询问用户；会改变产品行为、安全边界、部署拓扑、公开接口或治理范围的问题必须集中澄清。

## 3. 强制证据规则

所有架构和目录结论使用以下状态：

- `verified`：代码、测试、构建配置、schema 或运行配置直接证明。
- `inferred`：证据支持该推断，但缺少明确契约或验证。
- `unknown`：无法可靠判断，必须保留并交由负责人确认。

禁止通过目录名、过期 README 或模型常识直接断言模块用途。当前实现和测试优先描述已实现行为；公共 schema/契约描述预期接口；roadmap 只描述未来计划。

## 4. Phase 0：建立基线，不做大范围改写

先读取最便宜的仓库证据：

1. 根目录文件清单和已有入口文档。
2. 包管理、构建和语言配置。
3. 程序、库、CLI、server 或插件注册入口。
4. 测试目录、测试配置和 CI 命令。
5. 部署、容器、环境和运行配置入口。
6. 公共 API、tool schema、命令定义或导出表面。
7. 生成脚本、生成目录、缓存和运行态数据。

不要从第一步开始逐文件全文读取。先形成候选地图，再按模块读取命中的实现和测试。

记录基线：

- 根入口和主要文档的大小；
- Development、User、Operator 内容混合的位置；
- 同一动态事实被手工复制的位置；
- 没有职责说明的高风险模块；
- 无法直接找到验证命令的修改类型；
- 已知失效链接、过期数量或冲突声明。

## 5. Phase 1：识别项目角色和类型

至少判断项目实际需要的平面和角色：

- Production / User：API、CLI、库、插件、UI 或 MCP 的产品使用者；
- Production / Operator：部署、配置、观察、事件响应和恢复；
- Development / Developer：初始化和新行为实现；
- Development / Maintainer：Bug、测试、整理和已有项目重新适配；
- Development / Reviewer：静态审查和隔离环境动态分析；
- Development / Field Evaluator：非生产真实场景动态验证和需求探索。

角色说明必须按投递渠道分离：

- 根 `AGENTS.md` 只保留平面路由、适配状态、项目硬约束和开发证据入口。
- User 使用 usage/API/tool schema/MCP resources，不读取开发入口正文。
- Operator 使用 operations/runbook，不读取 User 长提示或开发流程。
- Reviewer 使用 verification、diff 和 sandbox 入口。
- Field Evaluator 使用 evaluation、非生产 usage 和数据权限说明。

然后只读取匹配的 profile：

- MCP：`profiles/MCP_PROJECT.md`
- 库或 CLI：`profiles/LIBRARY_AND_CLI_PROJECT.md`
- 应用、服务、GUI、monorepo 或数据项目：`profiles/APPLICATION_SERVICE_MONOREPO.md`

组合项目可以读取多个匹配 profile，但不能加载无关 profile。

## 6. Phase 2：建立最小项目内骨架

根 `AGENTS.md` 始终保留原项目内容。方案一已经原样合并永久角色路由；方案二只在末尾额外存在一次性 `adapter-trigger`。当前适配子模式在同一根文件内补全项目专属约束和状态，不得用另一份入口替换或遮蔽原规则。项目至少需要以下能力，但小项目可以合并文件：

```text
AGENTS.md                         harness 自动加载的两层角色路由、状态和跨项目红线
docs/INDEX.md                    按角色和任务类型路由
docs/architecture/OVERVIEW.md    当前架构和模块边界
docs/verification/MATRIX.md      修改类型到验证命令的映射
```

实际创建时读取 `templates/CORE_DOCUMENT_TEMPLATES.md` 中对应小节。不要一次读取模板全文后机械复制。

根 `AGENTS.md` 应：

- 保留跨模块硬约束；
- 规定最小检索顺序；
- 指向文档索引和验证矩阵；
- 避免完整工具目录、生产教程、历史计划和模块细节；
- 建议控制在约 2K tokens 内，为目录级指令和其他 authority instructions 留出预算；
- 包含实际可执行的约束，不能只要求 agent 先读 README；
- 保留永久角色路由和准确的 `Package adaptation:` 状态；
- 方案二完成后只删除 `adapter-trigger` 标记区块，原项目内容和永久路由保持不动。

`docs/INDEX.md` 只负责导航，不复制各文档正文。

## 7. Phase 3：按风险建立模块契约

优先级：

1. 公共接口或工具注册模块；
2. 有生产写入、网络、凭据、配额或数据副作用的模块；
3. 高频修改模块；
4. 跨平台和外部系统集成模块；
5. 数据、迁移、缓存和生成模块；
6. 其他内部模块。

每份模块契约回答：

```text
Owns
Does not own
Entrypoints
Public contracts and invariants
Allowed and forbidden dependencies
Data/config/generated ownership
Verification
Change documentation triggers
```

不要为每个文件写用途。只解释模块边界、非显然文件、生成物和高风险入口。

完整模块契约默认放在 `docs/modules/<module>.md`。只有局部约束必须在 agent 进入目录时立即生效，才增加 `<module>/AGENTS.md`；兼容 harness 会在 agent 读、写或编辑该目录下文件时按路径注入它。局部入口只摘要硬红线、禁止依赖、所有权和验证入口，并链接权威模块契约，不得重复根规则或复制动态清单。

## 8. Phase 4：拆分混合文档

将混合内容按性质归位：

- 当前能力和公共行为 -> product/usage/contract
- 当前模块边界和不变量 -> architecture/modules
- 开发、测试和生成流程 -> development/verification
- 部署、配置、监控和恢复 -> operations
- 历史架构选择 -> decisions/ADR
- 可复用且已验证的结论 -> knowledge
- 实验、日志和报告 -> evidence
- 未实现计划 -> roadmap
- 从代码产生的动态清单 -> generated

旧路径应保留短跳转或兼容入口，避免整理文档导致链接和既有工作流失效。

## 9. Phase 5：建立唯一权威来源

同一事实只允许一个权威来源。例如：

- MCP tool 参数 -> tool schema/注册表
- CLI 参数 -> 命令定义
- API -> OpenAPI/接口定义
- 模块边界 -> architecture/module contract
- 测试命令 -> 构建配置与 verification matrix
- 历史原因 -> ADR
- 实验结果 -> evidence

工具数量、命令表、配置字段、插件列表、版本、API schema 和包清单等动态事实应由权威来源生成。其他文档只链接或提供稳定摘要。

## 10. Phase 6：建立校验和变更触发

至少校验：

- 内部链接和旧入口跳转；
- 根入口体积及 harness 截断风险；
- 根入口只有一个永久角色路由区块，适配状态与实际范围一致；方案二不再包含 `adapter-trigger`；
- 示例命令和验证命令是否存在、是否可执行；
- 生成物与权威来源是否一致；
- 高风险和公共模块是否有契约；
- 当前架构是否混入未实现计划；
- 文档、fixture 和日志是否包含秘密；
- 并行用户或 agent 修改是否被保留。

变更触发矩阵：

| 代码变化 | 同步内容 |
|---|---|
| 公共 API、tool 或 CLI 参数 | User 契约或重新生成参考 |
| 模块边界或依赖方向 | 架构概览、模块契约，必要时 ADR |
| 配置、部署或恢复行为 | operations 和配置参考 |
| 安全、权限、网络成本或副作用 | Development 红线、User 风险元数据、Operator runbook |
| Bug 暴露可复用认知 | knowledge，并链接 evidence |
| 仅内部实现且契约不变 | 通常只需测试 |
| 未来设想 | roadmap，不得写入当前架构 |

## 11. Phase 7：冷启动验收

让没有历史上下文的 agent 在不读取本治理包全文、也不接收额外“先读文档”提示词的情况下：

1. 说明项目定位、入口和项目类型。
2. 定位一个真实功能所属模块。
3. 说明该模块负责和不负责什么。
4. 找到匹配的实现和测试。
5. 判断任务是否涉及生产写入、网络、凭据或不可逆副作用。
6. 完成或模拟一个小修改并选择正确验证命令。
7. 判断哪些文档需要或不需要同步。

记录读取文件数、估算 token、搜索次数、错误假设、澄清轮数和返工。正确性不能下降；目标是在此基础上减少无关读取和错误定位。

## 12. 分批交付和完成定义

项目过大时允许分批治理，但每批必须形成闭环：

- 根入口能路由到已治理模块；
- 已治理模块有真实契约和验证；
- 未治理区域明确标记，不伪装完成；
- 下一批优先级和 `unknown` 清晰；
- 不得让治理长期停留在一份 roadmap。

本轮适配至少交付：

- 证据分级的现状和冲突清单；
- 角色路由表；
- 最小项目内文档骨架、准确适配状态，以及方案二已经删除的临时触发块；
- 至少一个最高风险模块契约；
- 一项最高成本的混合文档拆分；
- 动态事实与权威来源映射；
- 校验结果和冷启动报告；
- 剩余 `unknown` 与下一批顺序。

## 13. 停止和升级条件

只有以下情况需要停止并请求负责人决定：

- 无法从代码、测试、配置或契约判断公共行为；
- 两个权威来源冲突且无法确定版本范围；
- 整理文档需要改变产品行为、公开接口、安全边界或部署拓扑；
- 需要真实凭据、生产数据或不可逆操作；
- 并行修改使迁移无法安全合并。

命名、目录组织、低风险拆分和项目适配由当前执行子模式依据现有惯例自行决定。

## 14. 禁止事项

- 不得只输出一份分析报告后结束。
- 不得一次性整仓全文读取并生成“完整文档”。
- 不得把 `inferred` 或 `unknown` 写成当前事实。
- 不得为模板完整性创建无用的空文档。
- 不得把 User、Operator 和 Development 说明重新塞回同一自动加载入口。
- 不得手工复制可生成的动态事实。
- 不得用文档数量代替冷启动验收。

# 包适配共享流程

> 仅由 Development / Developer `initialize`（新/空项目）或 Maintainer `readapt`（已有项目）执行；它不是独立角色，也不替代命中的项目 profile。

## 0. 激活、新鲜度和状态

只在用户明确适配、active `adapter-trigger`、用户确认处理非 `adapted` 状态，或有证据表明治理漂移时运行。用户只要求确认文档或明确禁止动作时，完成确认后停止，把以下检查报告为获准开工后的第一步，不提前提问。

用户授权执行后自动验证本地关键文件，再运行只读 `scripts/install.sh check-update`，不得先询问是否跳过。`current` 自动继续；仅对 `remote_differs/unavailable` 使用结构化问答，让用户选择同步/重试、明确使用所报告的本地版本继续，或停止。检查不修改包、根入口或状态。

- 安装器管理 `pending/stale`；适配执行者只写 `partial/adapted/blocked`。
- `adapted`：当前 package revision、UTC 验证时间、实际 scope、`reason=none`。
- `partial`：已闭环 scope、UTC 时间和剩余范围 reason。
- `blocked`：安全停止的 scope 和非敏感 reason；trigger 模式下保留 trigger。

## 1. 已解析角色和包路径

进入本流程前必须已精确解析 Developer/`initialize` 或 Maintainer/`readapt`。不要重新读取 plane registry、重新发现角色或同时读取两个角色指南。trigger 对未分配角色先用有界证据判断新/已有项目；显式角色或 literal alias 在任何仓库发现前直接胜出。

角色记录的 `guide`、`procedure_by_mode`、项目类型记录的 `profile` 和条件子类型记录的 `spec` 全部相对治理包根目录解析，不相对 registry 或 cwd。精确读取失败是包完整性错误，禁止用 glob 猜路径。

## 2. 任务卡和事实等级

在修改前形成一张有证据的任务卡：

```text
目标：要消除的冷启动、路由或治理问题
适配 scope：repo root / workspace / package / module，以及 initialize/readapt
范围/非目标：允许规整和明确不改变的行为、模块、架构
主项目类型：mcp / library / cli / service / application-ui / data-automation / monorepo
现有入口：根指令、代码/运行入口、构建、测试、CI、文档
风险：生产、数据、秘密、迁移、网络、费用、发布、破坏性操作
验收：角色路由、模块定位、验证选择和冷启动任务
未知：需要负责人决定的产品、架构、scope 或权限问题
```

事实标记：`verified`（直接证据）、`inferred`（证据支持但未验证）、`unknown`（不能可靠判断）。README、roadmap、文件名或旧文档不能覆盖当前实现、schema、构建配置和自动测试。影响行为、安全、公共契约、项目类型或适配 scope 的冲突必须询问。

确认和完成报告必须与工具轨迹一致，列出实际读取、搜索和失败路径；不得声称未读已经读取的 plane/profile/registry，也不得把失败后发现式搜索包装成首次精确命中。

## 3. 有界仓库证据

1. 保留所有已加载根规则，不重读未变化且已注入的根文件。
2. 做一次有界根清单，识别 workspace/package、构建配置、主要运行或公共入口、测试/CI 和已有文档索引。
3. 只定点读取足以判断当前 scope、主交付形态、权威来源和验证入口的文件；禁止重复目录枚举、整仓全文读取或为了填模板收集无关事实。
4. 并行修改或 dirty worktree 默认保留；无法安全区分时停止，而不是重置或覆盖。

## 4. 精确项目类型

从以下闭合集合为当前适配 scope 选择一个主类型：

| ID | 主判断问题 |
|---|---|
| `mcp` | scope 是否主要交付 MCP server/gateway/tools？ |
| `library` | 主要契约是否是被程序导入的 API/SDK/package？ |
| `cli` | 主要契约是否是命令、参数、输出、退出码和副作用？ |
| `service` | 长期运行、请求/job、部署和运行态是否是主要架构？ |
| `application-ui` | 交互 UI、导航、状态和用户流程是否是主要交付？ |
| `data-automation` | 可复现的数据/批处理/脚本输入到输出是否是主要契约？ |
| `monorepo` | 当前是否为协调多个独立治理 package/project 的仓库根 scope？ |

先按当前 scope，再按主要消费者入口和运行形态判断；不要按语言、框架或目录名判断。CLI 调用 library、UI 依赖 service、MCP 使用内部 package 都不自动构成混合类型。monorepo 根选择 `monorepo`；后续 package-scoped pass 再单独选择该 package 的一个类型。

对 `routing/project-types.jsonl` exact grep 一个 quoted `id`，只读命中 profile，且不得预读多个 profile 比较。没有精确类型，或一个不可拆 scope 实质匹配多个主类型时，使用根结构化问答协议和稳定 ID `project_type`，让用户确认最近类型、缩小/拆分 scope、更新包类型定义或判定不适用，并等待。

命中 `mcp` 后才允许按 profile 指示检查条件架构子类型。只在拓扑证据精确匹配时 exact grep `routing/mcp-subtypes.jsonl` 的一个 quoted `id` 并读取其 `spec`；不匹配时不读 subtype。项目必须把通用 subtype 映射到自己的架构文件，不能复制出另一套冲突规范。

## 5. 产物预设和逐项创建

profile 的 Artifact preset 使用以下闭合决策：

- `required`：必须链接一个已验证的现有权威，或合并/创建该产物。
- `conditional`：只有 profile 所列条件有证据成立时处理，否则记录 omit，不创建空文档。
- `omit`：当前 scope 不建立该投递面；已有权威不因 omit 被删除。
- `existing-authority`：现有文件已完整承担职责，只更新索引/链接，不复制内容。

在读模板前先写紧凑产物计划：`artifact -> decision -> existing authority/evidence -> action -> verification`。以下是通用候选，不代表全部必建；命中 profile 决定 required/conditional/omit：

| 产物 | 精确模板 |
|---|---|
| 根项目约束 | `templates/ROOT_AGENTS.md` |
| 文档/任务路由 | `templates/DOC_INDEX.md` |
| Development 可执行入口 | `templates/DEVELOPMENT_START.md` |
| 当前架构/数据流 | `templates/ARCHITECTURE_OVERVIEW.md` |
| 高风险/公共模块契约和必要 local overlay | `templates/MODULE_CONTRACT.md` |
| 修改类型到真实验证 | `templates/VERIFICATION_MATRIX.md` |
| User 公共投递面 | `templates/USER_USAGE.md` |
| Operator runbook | `templates/OPERATOR_RUNBOOK.md` |
| 非生产实战证据 | `templates/FIELD_EVALUATION.md` |
| 历史架构决策 | `templates/ADR.md` |
| 子 agent 授权卡 | `templates/SUBAGENT_ASSIGNMENT.md` |

只在即将处理一个产物时读取它的一个精确模板，完成合并、链接和验证后再考虑下一个；禁止批量预读模板或枚举 `templates/`。模板是字段预设，不是覆盖目标文件的命令：保留更具体且仍正确的现有内容，删除未证实 placeholder，不为目录美观创建空文件。

## 6. 职责边界和去重

```text
自动根入口      -> 仓库级硬约束、最小项目路由、managed role/state
INDEX           -> role/task 到一个权威入口
Development     -> 可执行开发环境、命令、生成入口
Architecture    -> 当前系统/模块/依赖/信任边界
Module contract -> 一个模块的 owns/does-not-own/invariants/effects
Verification    -> change scope 到检查选择和风险门
Usage           -> 外部消费者可依赖的工作流和契约
Operations      -> 运行态变更、观测、恢复、回滚
ADR             -> 历史决策原因
Evidence        -> 带版本/时间/scope 的原始观察
Roadmap         -> 未实现计划
Generated       -> 从 executable/schema authority 派生的参考
```

同一稳定事实只指定一个权威，其余位置使用链接或面向该角色的短摘要。动态工具、参数、命令、API、schema、package 清单和版本应从可执行来源生成。以下重复可以保留：独立加载上下文所需的安全红线、角色权限边界、指向同一权威的入口；但措辞必须一致且不能形成第二份动态事实。

根项目章节写在 managed block 外，不能重复或移动永久路由。目录级 `AGENTS.md` 只放进入该子树前必须生效的差异并链接模块/package 契约，不能复制根规则。User、Operator、Development、Reviewer 和 Field Evaluator 的完整视图保持分离。

## 7. 验证和冷启动

至少验证：JSONL 语法、ID/profile/spec 唯一性和包根路径，所选根 marker/state/UTF-8/体积，重复 managed 候选，新增/修改链接和命令，generated-source 一致性，秘密扫描，profile required 产物和条件 subtype 的 authority/omit/conformance 决策，公共/高风险模块契约，当前架构真实性，并行修改保留，以及 trigger 模式最终无 trigger。

让无历史上下文 agent 在不读完整治理包时完成：

1. 从根路由得到唯一 plane/role/mode；
2. 从 INDEX 定位一个任务入口而不枚举文档树；
3. 找到一个真实功能的 authority、实现、测试和验证；
4. 说明权限、副作用、generated source 和文档触发；
5. 对 monorepo 先命中一个 package，对生产角色只读取对应投递面；
6. 不明确时在扩大读取或执行副作用前使用结构化问答。

记录实际读取文件/token、搜索、错误假设、澄清和返工；正确性不能为 token 目标让步。

## 8. 完成、分批和停止

大项目允许 `partial`，但完成 scope 必须形成 `root/index -> authority -> implementation/evidence -> verification` 闭环，并列出剩余 scope 和顺序。完整完成后运行：

```text
scripts/install.sh set-state --status adapted --verified-at <UTC> --scope <scope> --reason none
scripts/install.sh remove-trigger   # 仅 trigger 模式
```

无法判断公共行为、权威来源冲突、需要改变产品/架构/安全边界、需要生产/真实数据/不可逆动作，或并行修改无法安全合并时停止，写 `blocked` 并请求负责人决定。

禁止把 inferred/unknown 写成事实、删除仍有效的现有权威、用文档数量代替冷启动验收、把所有角色说明塞入根入口，或在日常任务中重复运行整套包适配。

# 包适配共享流程

> 仅由 Development / Developer `initialize`（新/空项目）或 Maintainer `readapt`（已有项目）执行；这不是独立角色。

## 0. 激活和状态

只在用户明确适配、`adapter-trigger`、用户确认处理非 `adapted` 状态，或治理漂移时运行。开始时必须先按 trigger 协议验证本地包完整性并运行只读 `check-update`；只有远端 `current`，或用户明确接受所报告的本地版本时继续。

- 方案一：客户运行 `scripts/install.sh merge`，再显式指定 `initialize` 或 `readapt`；脚本不调用 LLM。执行者仍需运行 `check-update`。
- 方案二：`trigger` 追加一次性触发；触发检查远端新鲜度、判断新/已有项目并选择子模式，完成后只删除 trigger。
- `set-state` 只写结果：`partial`、`adapted`、`blocked`。安装器管理 `pending/stale`。
- `adapted` 必须包含当前版本、UTC 验证时间、实际 scope、`reason=none`；`partial/blocked` 必须给出范围和非敏感 reason code。

## 1. 任务卡和证据

```text
目标：要消除的冷启动、路由或治理问题
范围/非目标：允许规整和不改变的模块、行为、架构
项目类型：MCP / library / CLI / app / service / GUI / monorepo / data
现有入口：AGENTS/CLAUDE/local overlay、代码入口、构建、测试、CI、文档
风险：生产、数据、秘密、迁移、网络、费用、破坏性操作
验收：角色路由、模块定位、验证命令和冷启动任务
未知：需要负责人决定的产品、架构或权限问题
```

事实分级：`verified`（直接证据）、`inferred`（证据支持但未验证）、`unknown`（不能可靠判断）。不得用 README、roadmap 或命名猜测覆盖实现；影响行为、安全、公开契约或治理范围的冲突询问用户。

## 2. 最小读取顺序

1. 保留所有已加载根候选规则；不要重读已注入且未变化的根文件。安装器只向按 `AGENTS.md` > `CLAUDE.md` 选中的入口追加 managed block。
2. 做一次有界根清单，再定点读取构建/包配置、主要入口、测试配置、CI 和现有文档索引；禁止重复目录枚举或整仓扫描。
3. 从 `routing/project-types.jsonl` 精确 grep 一个主类型，只读命中 profile；不得预读多个 profile 比较。没有精确类型或证据实质匹配多个 ID 时，按根结构化问答协议说明包缺少明确架构，并让用户确认最近类型、更新包定义或判定不适用。
4. 已明确 role/mode 时，从对应 registry 精确 grep 一条完整记录；不得读取 plane 或完整 role registry。未明确时按根路由处理。
5. 只在即将创建一个产物时读取它的一个精确模板；先完成该产物再考虑下一个，禁止批量预读模板。

项目类型注册表：`routing/project-types.jsonl`。其命中记录提供唯一 profile 路径；不要先读 profile 文件再反推类型。

## 3. 最小产物和精确模板

按规模创建或合并，不为不存在的角色建立空文档：

```text
所选根指令文件                 永久 JSONL 路由、适配状态、项目硬约束
项目 docs/INDEX.md               角色/任务到权威入口
项目 architecture/OVERVIEW.md   当前边界和依赖方向
项目 verification/MATRIX.md     修改类型到真实验证
高风险/公共模块契约              owns / does-not-own / invariants / verification
```

| 产物 | 模板 |
|---|---|
| 根项目约束 | `templates/ROOT_AGENTS.md` |
| 文档索引 | `templates/DOC_INDEX.md` |
| 开发入口 | `templates/DEVELOPMENT_START.md` |
| 架构概览 | `templates/ARCHITECTURE_OVERVIEW.md` |
| 模块契约/必要目录 overlay | `templates/MODULE_CONTRACT.md` |
| 验证矩阵 | `templates/VERIFICATION_MATRIX.md` |
| User 投递面 | `templates/USER_USAGE.md` |
| Operator runbook | `templates/OPERATOR_RUNBOOK.md` |
| Field evaluation | `templates/FIELD_EVALUATION.md` |
| 历史决策 | `templates/ADR.md` |
| 子 agent 授权卡 | `templates/SUBAGENT_ASSIGNMENT.md` |

禁止枚举或全文读取 `templates/`；按表只读正在创建的文件。

## 4. 边界和投递面

- 所选根指令文件保留原项目内容和恰好一个 managed routing block；项目约束写在 block 外。
- User 只读 usage/API/schema/MCP 公共投递面。
- Operator 只读 operations/runbook 和必要运行时架构。
- Reviewer 使用 diff、契约、verification 和 sandbox 入口。
- Field Evaluator 使用非生产 usage/evaluation 和明确数据权限。
- Development 使用项目索引、一个模块契约、命中的实现/测试。

优先为公共接口、生产/网络/凭据/数据副作用、高频修改、外部系统、迁移/生成模块建立契约。目录级 `AGENTS.md` 只放进入目录前必须生效的局部红线，并链接完整模块契约。

## 5. 唯一权威来源

```text
当前行为       -> 实现和自动测试
公共接口       -> schema/类型/注册表/命令定义
模块边界       -> architecture/module contract
验证命令       -> 构建配置、CI、verification matrix
历史原因       -> ADR
实验结果       -> evidence
未来计划       -> roadmap
```

动态工具、参数、插件、版本、API 和包清单应生成；其他文档只链接或给稳定摘要。混合文档按 Development、User、Operator、当前架构、历史证据和未来计划拆分。

## 6. 验证和冷启动

至少检查 JSONL 语法/唯一 ID/路径、所选根 marker/状态/UTF-8/体积/重复 managed 候选、链接/命令/生成一致性/秘密、公共与高风险模块契约、当前架构真实性、并行修改保留，以及方案二最终无 trigger。

让无历史上下文 agent 在不读完整治理包时：

1. 判断 Production/Development；
2. 定位唯一 role/mode 和入口；
3. 找到一个真实功能的模块、实现、测试和验证；
4. 说明权限、副作用和文档触发；
5. 不明确时在角色指南前询问。

记录读取文件/token、搜索、错误假设、澄清和返工；正确性不能为 token 目标让步。

## 7. 完成、分批和停止

大项目可以 `partial`，但已完成范围必须形成路由、契约、验证闭环，未适配范围和顺序明确。完整完成后运行：

```text
scripts/install.sh set-state --status adapted --verified-at <UTC> --scope <scope> --reason none
scripts/install.sh remove-trigger   # 仅方案二
```

无法判断公共行为、权威来源冲突、需要改变产品/架构/安全边界、需要生产/真实数据/不可逆操作，或并行修改无法安全合并时停止，写 `blocked` 并请求负责人决定。

禁止整仓全文读取、把 inferred/unknown 写成事实、为空模板创建文档、把所有角色说明塞入根入口、复制可生成动态事实、用文档数量代替冷启动验收。

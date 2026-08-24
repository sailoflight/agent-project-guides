# MCP 项目 Profile

> 只有项目包含 MCP server、MCP gateway 或 MCP tool provider 时读取。与角色指南组合使用，不替代通用规则。

## 1. 必须分离的两个平面

### Development / MCP roles

Developer、Maintainer、Reviewer 和 Field Evaluator 通过仓库 `AGENTS.md`、development、architecture、modules 和 verification 工作。按各自子模式只读取注册、handler、transport、schema 生成、测试或非生产场景评估所需证据。

### Production / User

通过 MCP server 的 `instructions`、tool schema、resources/prompts 和有界发现入口工作。User 不应依赖开发仓库，也不应被要求读取开发内容。

### Production / Operator

通过 operations/runbook 工作，负责部署、进程、transport、凭据、状态、日志、升级和恢复。

这些角色可能使用相同事实，但必须通过各自投递渠道获得适合自身的最小视图。

## 2. 推荐项目文档和投递面

```text
AGENTS.md                              两层角色路由、适配状态和跨项目红线
docs/architecture/MCP.md              注册、dispatch、transport、状态边界
docs/modules/<server-or-module>.md     模块契约
docs/verification/MATRIX.md           协议、schema、offline/sandbox/staging 验证
docs/usage/MCP_CONSUMER.md             User 规范的 authored source
docs/operations/MCP_RUNBOOK.md         部署和恢复
docs/generated/TOOL_REFERENCE.md       从注册表/schema 生成
MCP instructions/resources/prompts     运行时消费者投递面
```

消费者文档可以作为生成 MCP instructions/resource 的权威来源，但不要在多个位置手工复制完整工具列表。

## 3. 工具元数据

每个 tool 建议有结构化元数据：

```text
name
module
submodule/capability
intent
keywords
risk
network: offline | live
estimated_requests
max_requests
mutating
dry_run
confirmation_required
dependencies
schema_ref
```

权威来源应是工具注册表或可执行 schema。工具参考、风险表和发现目录从该来源生成。

## 4. 渐进式工具发现

当工具数量会显著增加每轮上下文时，采用：

```text
固定小入口
  -> module/capability overview
  -> bounded search candidates
  -> open exact tool/schema
  -> execute
```

规则：

- 搜索只返回名称、意图和少量风险摘要；
- 完整 schema 只在工具被选中或暴露时进入上下文；
- 候选数量有默认和硬上限；
- 不无限累积已暴露工具；
- 保留 static/profile/gateway 等兼容路径；
- 动态列表必须验证目标客户端是否真正替换旧 schema。

## 5. 开发架构契约

MCP architecture/module 文档至少说明：

- 注册表、handler、schema 和 tool catalog 的权威关系；
- 外部 `tools/call` 与内部组合调用的边界；
- transport、server process 和持久状态所有者；
- stdout/stderr 或协议流约束；
- 凭据、配置和运行数据归属；
- tool confirmation、dry-run、budget 和 retry 规则；
- 本地、mock、fixture、replay 和 live 测试层次；
- MCP client 兼容性和 capability 协商。

## 6. 安全和成本投递

开发规则和消费者规则不能只存在于同一长文档。推荐一个结构化风险来源生成：

- 开发 agent 的安全红线；
- tool schema/description 中的调用风险；
- 消费者的审批、成本和副作用提示；
- operator runbook 的凭据和恢复规则；
- verification matrix 的 offline/live 门。

真实网络、配额和生产修改必须是显式行为。默认离线、mock、fixture、replay 或 dry-run；live 请求必须有唯一待验证事实、硬预算和停止条件。

## 7. 生成和校验

至少校验：

- 注册 tool 名称唯一；
- handler 与 schema 一一对应；
- tool reference 与注册表一致；
- 风险元数据完整；
- mutating tool 有确认和适用的 dry-run；
- live tool 有预算和 retry 约束；
- MCP 协议输出不混入普通日志；
- 消费者 instructions 不包含内部开发和部署细节；
- operator 文档不依赖工具消费者上下文；
- 静态和动态/profile 模式的兼容路径经过测试。

## 8. MCP 冷启动验收

分别使用三个无历史上下文角色演练：

1. 开发 agent 能定位一个 tool 的 schema、handler、测试和风险规则。
2. 消费 agent 只通过 MCP 投递面找到正确工具并理解副作用，不读取仓库开发文档。
3. operator 只通过 runbook 启动、检查和恢复 server，不加载工具开发细节。

任何一个角色必须读取另一个角色的完整说明才能工作，都说明角色分离尚未完成。

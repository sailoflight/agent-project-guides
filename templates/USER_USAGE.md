# 消费者 usage 文档模板

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

# `docs/development/START.md` 模板

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

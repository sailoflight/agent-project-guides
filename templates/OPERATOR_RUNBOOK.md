# 运维 runbook 模板

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

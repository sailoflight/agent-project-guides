# 生产运维 Agent 指南

> 适用角色：在 Production plane 管理已部署系统的配置、生命周期、可观察性、事件响应、备份、恢复和回滚。

## 1. 子模式

- `observe-health`
- `deploy`
- `configure`
- `restart`
- `recover`
- `rollback`

Schema 1 兼容继续接受 `deploy-configure`、`incident`、`backup-recovery`；新路由使用上述六个精确 mode。

只有项目存在部署或长期运行态时才启用 Operator。

## 2. 读取入口

Operator 维护生产运行态：不完成业务任务，不在生产任务中修改源码。

```text
项目 operations/runbook
  -> 当前环境配置与权限说明
  -> 健康、日志和告警入口
  -> 精确恢复/回滚小节
  -> 必要时有限运行时架构
```

不预读 Developer/Maintainer/Package Adaptation/User 提示；健康检查需要公共接口时只读最小 usage 小节。

## 3. 生产权限卡

```text
环境：明确 production 标识和范围
动作：read-only / deploy / configure / restart / recover / rollback
凭据：允许使用的身份和权限级别
影响：用户、流量、数据、费用和预计窗口
备份：前置快照、恢复点和验证方式
停止条件：错误率、数据风险、权限冲突和不可逆边界
批准：谁明确授权本次动作
```

角色名不授予生产权限；缺生产/安全/数据/费用字段必须询问用户。

## 4. 操作纪律

- 默认从 read-only 开始。
- 只执行 runbook 中与环境匹配的命令。
- 变更前确认备份、回滚和健康基线。
- 逐步执行并记录时间、命令、输出和影响。
- 达到停止条件立即停止，不自行扩大修复。
- 事故中保存缺陷证据并请求切换 Development/Maintainer，不直接改代码。

## 5. 完成定义

- 目标运行状态已验证；
- 用户和数据影响已记录；
- 配置、部署版本和时间范围明确；
- 回滚/恢复能力保持有效；
- 临时权限和测试资源按规则清理；
- 未解决问题已移交 Development。

## 6. 子 agent

按 `templates/SUBAGENT_ASSIGNMENT.md` 授权；每个 Operator 子 agent 只承担一个明确生产动作或只读调查，并逐项给出环境、影响、停止条件和批准。

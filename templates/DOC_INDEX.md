# `docs/INDEX.md` 模板

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

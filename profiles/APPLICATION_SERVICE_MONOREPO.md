# Application、Service、GUI、Monorepo 与数据项目 Profile

> 仅在项目包含相应形态时读取匹配小节。不要因为文件覆盖多种类型就把全部要求机械套用到项目。

## 1. 后端 Service

### 必须说明

- API、消息或任务入口；
- 领域、应用、适配器和基础设施边界；
- 数据模型、事务、迁移和一致性；
- 外部依赖、超时、retry 和降级；
- 配置和秘密；
- 部署拓扑、健康检查、日志、指标和告警；
- 回滚、恢复和生产写入规则。

### 推荐文档

```text
docs/architecture/OVERVIEW.md
docs/architecture/RUNTIME.md
docs/modules/<domain-or-service>.md
docs/usage/API.md 或生成 OpenAPI
docs/operations/DEPLOY.md
docs/operations/INCIDENTS.md
docs/verification/MATRIX.md
```

API schema、迁移定义和配置 schema 是动态事实的权威来源；参考文档从它们生成。

## 2. GUI 或桌面/网页应用

### 必须说明

- 主要用户流程，而不是营销功能列表；
- 页面/视图、状态模型和导航；
- 前端与后端边界；
- 数据加载、错误、空状态和权限状态；
- 可访问性、键盘和响应式约束；
- 浏览器/平台兼容；
- 单元、交互、端到端和视觉验证。

### 推荐文档

```text
docs/product/USER_FLOWS.md
docs/architecture/FRONTEND.md
docs/modules/<feature-or-state>.md
docs/verification/MATRIX.md
docs/evidence/visual/       # 仅证据，不作为规范
docs/operations/            # 仅有部署/发布时
```

截图和测试报告是证据，不应替代可执行组件契约和用户流程。

## 3. Monorepo

### 根级职责

- 根 `AGENTS.md` 只处理跨包路由、共同红线和全仓验证入口；
- 根 architecture 说明包之间的依赖和公共协议；
- 根 INDEX 将任务路由到具体 package；
- 不在根文档复述每个 package 的内部文件。

### package 级职责

只有 package 具有独立构建、公共接口、风险或特殊验证时，增加精简的局部入口和模块契约。局部 `AGENTS.md` 只覆盖差异，不复制根规则。

### 跨包契约

单独记录：

- 允许的依赖方向；
- 共享 schema 和版本；
- 发布和兼容顺序；
- 跨包测试；
- 所有权和变更通知。

每个 package 可以选择自己的 MCP、library、CLI、service 或 GUI profile。

## 4. 数据、脚本和自动化项目

### 必须说明

- 输入来源、格式、版本和许可证；
- 输出位置、格式和覆盖规则；
- 可重复性和随机性；
- 增量、断点续跑和幂等性；
- 数据清理、匿名化和秘密保护；
- 真实环境与 fixture/mock 的边界；
- 失败停止和恢复。

### 推荐文档

```text
docs/architecture/DATA_FLOW.md
docs/modules/<pipeline-or-script>.md
docs/usage/                      # 有外部调用者时
docs/operations/                 # 有定时或生产运行时
docs/verification/MATRIX.md
docs/evidence/                   # 样本和验证报告
docs/generated/                  # schema/字段参考
```

不要让开发 agent 把生产数据当作试错环境。优先使用小样本、fixture、replay、dry-run 和硬预算。

## 5. 角色分离

Application/service 项目常出现四种角色：

- 开发 agent：架构、模块和验证；
- API/产品消费者：usage、API schema、用户流程；
- operator：部署、监控和恢复；
- 最终用户：产品帮助和可观察行为。

即使这些角色由同一个人承担，也不应把所有说明塞进自动加载的开发入口。

## 6. 生成和校验

根据形态选择：

- OpenAPI/schema 与 handler/模型一致性；
- migration 顺序和回滚测试；
- 配置 schema 与示例一致；
- route/view/component 索引生成；
- monorepo 依赖方向检查；
- 数据 schema、fixture 和 pipeline 一致；
- runbook 命令存在并在安全环境冒烟；
- UI 截图、交互和无障碍验证；
- 生产副作用默认关闭。

## 7. 冷启动验收

Service：从 endpoint/job 定位 schema、应用逻辑、数据操作、外部依赖、测试和 runbook 风险。

GUI：从用户流程定位 route/view、状态、后端契约、交互和视觉验证。

Monorepo：从任务先定位 package，再进入局部契约，不读取全部 packages。

数据项目：从一个输出追溯输入、转换、schema、fixture、生产边界和恢复规则。

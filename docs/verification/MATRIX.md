# APG 验证矩阵

## 默认与边界

工作目录是仓库根目录。默认使用临时目录、synthetic/fixture 数据；组件测试只开回环
服务，不使用生产数据、真实凭据或公网。Windows 原生验证不由 Linux/WSL 结果代表。
验证脚本是命令权威；此表负责选择，不保存历史“已通过”状态。

## 变更矩阵

| 变化 | 最小验证 | 扩展门 |
|---|---|---|
| 模块声明、项目文档、导航 | `node scripts/architecture.mjs check`；`node scripts/test-architecture.mjs` | boundary；文档链接人工检查 |
| 规范排序、摘要、catalog | `node scripts/test-determinism.mjs` | v2/v3；catalog check；release verify-source |
| 文件写入、Git 目标 | `node scripts/test-local-write-safety.mjs` | v2/v3 事务与回滚 |
| 组件状态、网络适配器 | `node --test scripts/test-component-regressions.mjs`；`node scripts/test-component-store.mjs` | schema；boundary；v2/v3 |
| 上下文、票据、generation | `node scripts/test-context-choice.mjs`；`node scripts/test-context-state.mjs` | routing；v2/v3 |
| 物化、迁移、descriptor | `node scripts/test-v2.mjs`；`node scripts/test-v3.mjs` | schema；发布聚合 |
| 根块与观察 | `node scripts/test-observation-ledger.mjs`；`./scripts/test-install.sh` | 已批准的外部 interop |
| 任意跨模块依赖 | `node scripts/architecture.mjs check` | 受影响模块测试；必要时 v2/v3 |
| 通用内容或发行集合 | `python3 scripts/test-schema.py`；`node scripts/validate-routing.mjs`；`node scripts/test-boundary.mjs` | catalog / manifest 重建与完整聚合 |

## 生成顺序

```bash
node scripts/architecture.mjs build
node scripts/apg.mjs catalog build
node scripts/apg.mjs release manifest
node scripts/architecture.mjs check
node scripts/apg.mjs release verify-source
```

仅源内容变化才需要相应重建；不以重建掩盖未解释的差异。最后运行 `git diff --check`。
版本发布、tag 和 push 需要另外的显式请求，不由 manifest 重建授权。

## 聚合与外部输入

`./scripts/test-release.sh` 是聚合入口。外部 writer 测试会在输入存在时调用对应工具，
因此本地纯 fixture 验证应给以下变量指定一个新建临时目录中的**不存在路径**：
`APG_EXTERNAL_REPOS`、`APG_EXTERNAL_BIN`、`APG_BR_BIN`；`APG_INTEROP_WORK` 指向临时目录。
这会打印明确 SKIP/GAP，不等于外部互操作通过。

冻结基线和 pilot 细节见 [PILOTS.md](PILOTS.md)。

`APG_RUN_REAL_PILOTS=1`、外部真实组件和任何生产验证另行确认；不把 synthetic 或
external-source-copy 证据写成真实 agent task outcome。

## 结果报告

报告命令、环境、结果和 skip/gap。失败时区分实现、fixture、缺失依赖和平台差异。
新漏洞回归应先在旧实现失败，再在补丁通过；重构应保留同一组行为测试。

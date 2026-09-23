# APG 项目文档入口

本目录索引用于维护 APG **自身**；不随通用治理包发布，不替代 `apg context`。

## 当前权威

| 关切 | 入口 | 权威边界 |
|---|---|---|
| 公共行为 | [V2_CONTRACT.md](V2_CONTRACT.md)、[V3_MINIMAL_SLICE.md](V3_MINIMAL_SLICE.md)、`schemas/` | 契约和预期行为；实现/测试给出当前证据 |
| 系统与职责 | [architecture/OVERVIEW.md](architecture/OVERVIEW.md) | 人工维护的模块边界与不变量 |
| 找代码/看流程 | [architecture/generated/INDEX.md](architecture/generated/INDEX.md) | 派生导航，不是治理权威 |
| 改动与测试 | [verification/MATRIX.md](verification/MATRIX.md) | 选择精确验证范围 |
| 历史决定 | `decisions/` | 历史理由；proposed 不等于已实现 |

## 按任务进入

| 任务 | 先读 | 再定位 |
|---|---|---|
| 修健康状态、组件依赖、单实例 | [组件契约](modules/COMPONENTS.md) | `node scripts/architecture.mjs locate 健康` |
| 改角色路由、上下文展示 | [上下文契约](modules/CONTEXT.md) | `locate 上下文` |
| 改物化、迁移、恢复 | [事务契约](modules/TRANSACTIONS.md) | `impact lib/materializer.mjs` |
| 改文件写入、包、私有状态 | [存储与运行时契约](modules/STORAGE_RUNTIME.md) | `impact lib/files.mjs` |
| 修改架构图或支持新的源码项目 | [导航契约](modules/ARCHITECTURE_NAVIGATION.md) | `locate 架构` |
| 审查一个补丁 | 目标模块契约 + `git diff` | 验证矩阵；不预读整库 |

## 阅读约定

- Developer / Maintainer：一个相关模块契约 → 对应实现/测试 → 验证矩阵。
- Reviewer：目标 diff → 契约和失败分支 → 必要验证；区分事实、推断和建议。
- 只使用公共功能：从根 README 和公共契约进入，不预载内部架构。
- 生产操作、外部组件部署和真实凭据不属于这些作者命令的权限。
- `docs/memory/`、`plans/`、本机 suggestions 是记录或提案，不是当前行为的替代证据。

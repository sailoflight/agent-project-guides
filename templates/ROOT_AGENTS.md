# 根指令模板

目标位置：安装器选中的 `<project>/AGENTS.md` 或 `<project>/CLAUDE.md`

这是兼容 harness 在首轮前自动加载的机械入口，不是 README 的重复摘要。包脚本把永久两层角色路由原样追加到现有根文件；适配子模式只在该 managed block 之外合并以下项目专属章节，不得整文件覆盖、移动或重复路由 block。方案二完成后通过脚本只删除 `adapter-trigger`。不要把完整治理包、生产使用提示或运维 runbook 复制进根入口。

```markdown
# Repository agent instructions

## Project

<一句话说明项目提供什么能力及主要运行形态。>

## Project evidence routing

1. 永久 managed block 已选定 plane、role 和 submode 后，将任务映射到：<本项目实际存在的任务类型>。
2. 服从 harness 已按路径注入的最近目录级 `AGENTS.md` 局部覆盖。
3. 再读 `docs/INDEX.md` 中对应入口、一个相关模块契约和命中的实现/测试。
4. 只有局部证据不足时才扩大到完整架构、ADR、经验或原始资料。
5. 收集证据后再计划、修改和验证。

## Global invariants

- <跨所有模块成立的安全、兼容或依赖红线。>
- <生产、网络、秘密、迁移或破坏性操作的默认规则。>
- <生成物、数据和配置的保护规则。>
- 保留用户和其他 agents 的并行修改。

## Source precedence

1. 当前实现和自动化测试定义已实现行为。
2. 公共 schema/契约定义预期接口。
3. 当前架构和模块文档定义边界与不变量。
4. knowledge 记录已验证经验，evidence 保存证据。
5. roadmap 不代表当前能力。

冲突时报告版本和时间范围，不得静默合并。

## Verification

按 `docs/verification/MATRIX.md` 选择验证。不得凭记忆猜测命令。

## Documentation triggers

公共接口、模块边界、部署/配置、安全副作用和可复用经验变化时，更新对应权威文档或生成物；仅内部实现变化通常只需测试。
```

裁剪规则：

- 小项目可以缩短分类和优先级，但不能删除风险、验证和证据顺序。
- MCP 消费说明、完整 API 表、部署教程和 roadmap 不得放入此文件。
- 目录级 `AGENTS.md` 只增加必须在进入目录时生效的局部覆盖，并链接详细模块契约；不得重复根规则。
- 最终根入口必须保留恰好一个永久 routing block 和准确适配状态；不得保留方案二的 `adapter-trigger` 或把 User/Operator 生产提示复制进根入口。

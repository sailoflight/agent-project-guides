# 物化、迁移与恢复契约

Status: mixed。Architecture parent: `docs/architecture/OVERVIEW.md`。

## Owns / Does not own

`materializer.mjs` 拥有 schema 2 候选、应用、journal 与恢复；`migration*.mjs` 拥有版本间
计划、前后像、恢复锚点和回滚边界。共享文件原语不拥有业务回滚语义。

不负责生产权限、不随意删除用户字节、不把不同版本的事务模型合并成通用黑盒。

## 不变量

- preview 不写目标；apply 必须重新验证审核过的计划与前像。
- 只恢复捕获且仍满足拥有关系的字节或路径缺失；后续用户修改产生显式冲突。
- 持久 journal 与耐久文件替换的顺序不能为减少代码行数而改变。
- 文件替换使用 `files.mjs`；快照、锁、failpoint 和恢复决策仍归各事务所有者。
- 不自动 stage、commit、finalize 或发布；公开生命周期约定见 V2/V3 合同。

## 改动与验证

入口见生成的 materialization/migration 卡片。先写一个失败路径 fixture，再改状态机。
必须运行 `node scripts/test-v2.mjs` 与 `node scripts/test-v3.mjs`；检查 crash/failpoint、
后像冲突、零写入预览和回滚兼容性。文件原语变化再跑 local-write-safety。

未声明保证：敌对并发文件系统隔离、未验证操作系统上的相同 fsync 行为。

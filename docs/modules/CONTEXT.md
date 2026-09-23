# 上下文模块契约

Status: mixed。Architecture parent: `docs/architecture/OVERVIEW.md`。

## Owns / Does not own

负责请求分类、精确选路、可选文档闭包、强制章节、预算和展示。绝不以角色、票据、图或
调用方声明制造生产权限；返回的治理源也不证明模型实际遵循。

## 模块协作

`context.mjs` 编译 → catalog/routes 与 closure 提供证据 → `context-presentation.mjs`
输出人读结果。票据签验在 `context-choice.mjs`，私有引用在 `generation-state.mjs`。
旧的 `context.mjs` 展示导出保留兼容，不要求调用方同时升级内部导入。

## 不变量

- 必须命中 exact release/route；缺失、歧义、预算超限、过期明确报告，不静默加载全库。
- 展示元数据不进入诊断 JSON 或签名内容；签验仍绑定目标、视图、选择和时限。
- JSON 与人读格式都要验证。修改 renderer 不得改变签名载荷或允许的路由。
- 架构导航独立于 context；查询失败不能阻断治理加载，生成图不替代 canonical policy。

## 改动与验证

修改角色行为：先定位 `routing/` 的声明及 `compileContext`。修改展示：定位 renderer，
不要顺手改选路。修改 generation：补跨目标、过期、损坏状态和安全清理测试。

运行 `scripts/test-context-choice.mjs`、`scripts/test-context-state.mjs`、
`node scripts/validate-routing.mjs` 与 v2/v3 路由矩阵。跨语言排序补 determinism。

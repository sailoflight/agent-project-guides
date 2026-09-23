# 架构导航模块契约

Status: mixed — 编译器给出静态 ESM 依赖；主流程是人工声明。
Architecture parent: `docs/architecture/OVERVIEW.md`。

## Owns / Does not own

拥有 `tools/architecture/`、作者 CLI 和可重建导航。只读取显式 scope 内的代码，验证唯一
模块所有权、允许依赖、无循环和声明锚点。只有 build 写 generated 目录。

不执行分析对象、不连接服务、不抓取依赖、不提取 secrets、不成为 APG runtime、
不生成权限、不把声明流程当作经过证明的调用链。

## 输入与输出

- 人维护 `docs/architecture/modules.json`：模块职责、owns、allowed_dependencies、entries、
  tests、flow；新文件必须有人认领。
- 源码事实：文件摘要、静态 import/re-export；使用 Node VM 的 compile-only parser worker。
- 生成：每模块 Markdown/Mermaid 卡片、总览和 graph.json；不手改，不复制到 bootstrap。
- `locate` 重建事实后查询；`impact` 返回模块级保守反向依赖和建议测试，不执行测试。

## 失败行为

源未归属/重复归属、依赖越界或循环、锚点丢失/歧义、源树符号链接、解析器不可用或生成物
过期必须显式失败。未知的动态/跨语言调用写入限制，不伪造覆盖。

## 验证

`node scripts/test-architecture.mjs` 覆盖编译不执行、变更检测、位置、影响、循环、边界和
发行隔离。`node scripts/architecture.mjs check` 是日常漂移门。接口与限制详见
`tools/architecture/README.md`。第二个真实项目和独立发布尚未验收。

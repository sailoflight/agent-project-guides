# Library 与 CLI 项目 Profile

> 只有项目包含公共库、SDK、纯函数包或 CLI 时读取。两类形态可组合，但只保留适用部分。

## 1. Library/SDK 的重点

公共契约应优先描述：

- 稳定导出表面；
- 输入、输出和类型；
- 异常和错误模型；
- 纯度、状态和线程/并发约束；
- 边界条件和不变量；
- 版本和兼容承诺；
- 性能或资源约束；
- 最小真实示例。

纯函数库通常不需要 operations 或 Operator 入口。User 仍通过发布后的公共 API/SDK/CLI 投递面工作；不要为了统一目录结构创建空运维文档。

## 2. Library 推荐入口

```text
AGENTS.md                            两层角色路由、适配状态和项目红线
docs/architecture/OVERVIEW.md       包和层次边界
docs/modules/<package>.md           重要包契约
docs/usage/API.md                   User API/SDK 指南
docs/generated/API_REFERENCE.md     从类型/源码/schema 生成
docs/verification/MATRIX.md         unit/type/compat/perf 验证
```

很小的单包库可以将 architecture、module 和 development 合并，但公共 API、验证和兼容性仍要清楚。

## 3. Library 权威来源

- 导出和签名：源码、类型声明或 schema；
- 行为：测试和公共契约；
- API reference：从权威来源生成；
- 示例：必须在 CI 中编译或运行；
- 兼容承诺：版本策略或专门文档；
- 设计原因：ADR。

不要在 README、API 文档和模块说明中手工复制同一函数列表。

## 4. CLI 的重点

CLI 公共契约包括：

- command/subcommand 和参数；
- 配置文件、环境变量和 CLI 参数的优先级；
- stdout、stderr 和机器可读输出；
- 退出码；
- 当前工作目录和路径解析；
- 网络、文件、进程和远程系统副作用；
- 幂等性、dry-run 和确认行为；
- 交互式与非交互式运行差异。

## 5. CLI 推荐入口

```text
AGENTS.md                              开发 agent 路由
docs/architecture/CLI.md              parser -> command -> domain -> adapter 边界
docs/usage/CLI.md                     消费者工作流和稳定约定
docs/generated/COMMAND_REFERENCE.md   从命令定义生成
docs/operations/                      仅长期服务/安装维护需要
docs/verification/MATRIX.md           parser、snapshot、integration、side-effect 验证
```

## 6. CLI 开发契约

建议保持依赖方向：

```text
argument parsing
  -> command/application layer
  -> domain logic
  -> filesystem/network/process adapters
```

解析、业务逻辑和副作用适配器应可独立测试。不要让 `--help` 文本成为唯一参数定义，也不要维护第二套手写命令表。

## 7. 生成和验证

Library 至少检查：

- 公共导出和生成 API reference 一致；
- 类型、单元和契约测试；
- 示例可运行；
- 废弃和兼容路径；
- 必要的性能或属性测试。

CLI 至少检查：

- command reference 与 parser 一致；
- `--help`、错误消息和退出码；
- 配置优先级；
- stdout/stderr 不混淆；
- dry-run 无副作用；
- 文件和网络操作通过临时目录、mock 或 fixture 测试；
- 破坏性命令具有明确确认和失败停止。

## 8. 冷启动验收

Library 开发 agent 应能从一个公共符号定位实现、测试、兼容约束和生成参考。

CLI 开发 agent 应能从一个命令定位 parser、应用逻辑、副作用 adapter、退出码和验证命令。

User 只读取 usage/generated reference，不应加载内部开发 `AGENTS.md` 正文或模块实现说明。

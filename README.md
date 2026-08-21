# Agent 项目开发治理文档包

> 本目录是交付给项目 agents 的执行规范，不是需要所有角色全文阅读的总报告。

## 只读取与你当前角色匹配的入口

| 当前角色或任务 | 必读 | 按需读取 | 不应预读 |
|---|---|---|---|
| 已有项目的文档/流程维护 agent | `MAINTAINER_AGENT_GUIDE.md` | 与项目类型匹配的 `profiles/*.md`；实际创建文档时读 `templates/CORE_DOCUMENT_TEMPLATES.md` | `DEVELOPER_AGENT_GUIDE.md` 和不匹配的 profiles |
| 新项目初始化的开发 agent | `DEVELOPER_AGENT_GUIDE.md` 的“新项目初始化”部分 | `templates/CORE_DOCUMENT_TEMPLATES.md`；匹配的 profile | 维护迁移指南和不匹配的 profiles |
| 已完成初始化后的日常开发 agent | 项目自身的 `AGENTS.md`，不是本目录全文 | 仅当项目文档明确要求时回查 `DEVELOPER_AGENT_GUIDE.md` | 维护指南、模板和 profiles |
| 代码审查/验证 agent | 项目自身 `AGENTS.md` 与验证矩阵 | 对应模块契约 | 本目录中的迁移和初始化流程 |
| 产品消费者、MCP 调用 agent 或最终用户 | 项目生成的 usage/协议说明 | 项目公开文档 | 本目录全部内容 |
| 部署和运维角色 | 项目生成的 operations/runbook | 架构运行时部分 | 本目录全部内容 |

## 文档包内容

```text
agent-project-guides/
  README.md
  MAINTAINER_AGENT_GUIDE.md
  DEVELOPER_AGENT_GUIDE.md
  templates/
    CORE_DOCUMENT_TEMPLATES.md
  profiles/
    MCP_PROJECT.md
    LIBRARY_AND_CLI_PROJECT.md
    APPLICATION_SERVICE_MONOREPO.md
```

- `MAINTAINER_AGENT_GUIDE.md`：治理已有项目的混合、缺失或失效文档。
- `DEVELOPER_AGENT_GUIDE.md`：新项目初始化和后续日常开发纪律。
- `templates/CORE_DOCUMENT_TEMPLATES.md`：只有实际创建项目文档时才读取；包含应写入项目指定位置的内嵌模板。
- `profiles/*.md`：只有项目类型匹配时才读取。项目可组合 profile，例如 monorepo 中同时存在 MCP server 和 library package。

## 使用规则

1. 先确定角色，再打开一份角色指南；不要把整个目录加入每轮上下文。
2. 角色指南要求创建项目文档时，再读取模板文件中的精确小节。
3. 识别项目类型后，只打开匹配的 profile。
4. 本文档包只指导初始化和治理。项目完成初始化后，日常 agent 应由项目自己的精简 `AGENTS.md` 路由。
5. 生产消费者和运维人员不应直接使用本治理包；初始化或维护 agent 应为他们生成独立的 usage/operations 文档或协议投递面。
6. 任何模板都允许按项目规模裁剪；不得为不适用的角色创建空目录或空文档。
7. 结论只能标记为 `verified`、`inferred` 或 `unknown`；不得将猜测写成当前事实。

## 交付完成的共同标准

无论初始化还是治理，完成后一个没有历史上下文的开发 agent 都应能在不读取本治理包全文的情况下回答：

1. 项目是什么，当前任务应进入哪个模块？
2. 该模块负责和不负责什么？
3. 修改前必须遵守哪些安全、兼容或副作用约束？
4. 修改后运行哪些验证？
5. 哪些变化需要更新公共契约、架构、运行手册或经验？

不能回答上述问题，说明项目内的开发入口仍未完成。

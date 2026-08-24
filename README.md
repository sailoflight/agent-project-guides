# Agent 项目开发治理文档包

> 本目录是交付给项目 agents 的执行规范，不是需要所有角色全文阅读的总报告。

## 自动加载边界

DeepSeek Harness 的项目指令加载基于文件名和目录链，不基于 README 链接：

- session 启动时从 `.git` 项目根到当前工作目录自动加载精确命名的 `AGENTS.md`、`CLAUDE.md` 及其 local overlay；
- 已加载的 baseline 路径会在每个 model step 前重新探测，因此通过 shell 在运行中的 session 创建或修改根 `AGENTS.md`，通常会在下一步自动投递更新；
- `README.md` 不会作为 agent 指令自动加载；
- 将本包仅放进项目子目录不会使包内文档自动进入初始上下文；
- 新出现的后代目录级 `AGENTS.md` 仍需 agent 通过 `read`、`write` 或 `edit` 触碰对应路径后才会按需注入；
- DSH code preset 的自动指令总预算当前为 65,536 bytes，超出后可能截断，因此根入口仍应保持精简；
- 此机制要求 preset 启用 `dsh-agent-instructions`；DSH 自带的 minimal preset 不启用该插件，不能承诺零提示词加载。

所以本包使用“项目根自动入口 + 包内按角色文档”的两层结构。安装后不需要再由用户发送“请先读治理包”之类的提示词；根入口会在第一次请求前完成投递。Harness 仍不能从任意嵌套目录无条件自动加载所有角色文档，根入口只强制 agent 选择并读取一个匹配入口。

## 放入项目并安装

在启动新的 agent session 前，先将本目录放在目标项目内部，例如：

```text
<project>/
  agent-project-guides/
  AGENTS.md                 # 已有或待生成的项目根入口
```

脚本全部位于包内，不在目标项目额外投放安装程序。

### 方式一：人工合并根入口（保守方式）

1. 查看 `bootstrap/AGENTS.merge-block.md`。
2. 将 `{{GUIDES_PATH}}` 替换为本包相对项目根的路径，例如 `agent-project-guides`。
3. 把该临时 block 合并进项目根 `AGENTS.md`，保留原有项目约束。
4. 项目入口治理完成后，从根 `AGENTS.md` 删除整个 `manual-merge` 标记区块。

也可让包内脚本只渲染已替换路径的 block，再人工审阅合并：

```bash
./agent-project-guides/scripts/install.sh render-manual
```

该命令只输出文本，不修改项目文件。人工合并后可运行：

```bash
./agent-project-guides/scripts/install.sh check-manual
```

### 方式二：临时接管并由首个 agent 自行合并（零额外提示词）

在项目内运行：

```bash
./agent-project-guides/scripts/install.sh handoff
```

安装器会：

1. 从包目录的父级向上查找最近的 `.git` 目标项目根；也可显式传入 `--target <project>`。
2. 若项目已有根 `AGENTS.md`，原样移动为 `AGENTS_origin.md`，同时把其内容镜像进临时根入口，使原项目约束在 handoff 期间继续自动生效；已有该备份时拒绝覆盖。
3. 将 `bootstrap/AGENTS.handoff.md` 渲染为临时的项目根 `AGENTS.md`。
4. 首个兼容 agent 自动收到临时入口，先读取原入口和一个匹配角色指南，再生成最终项目 `AGENTS.md`。
5. agent 对比确认原约束已保留后，删除临时 handoff/origin-mirror 指令，保留未修改的 `AGENTS_origin.md` 作为人工复核和回滚依据，重新读取最终入口，再继续原始任务。

安装后可以检查或在合并前回滚：

```bash
./agent-project-guides/scripts/install.sh check
./agent-project-guides/scripts/install.sh restore
```

handoff 仅处理单一根 `AGENTS.md`。若根目录还存在 `CLAUDE.md`、`AGENTS.local.md` 或 `CLAUDE.local.md`，安装器会拒绝接管，避免重复或覆盖优先级不明的指令，此时使用人工合并。临时根入口必须是有效 UTF-8 且不超过 16,384 bytes；超过时同样回退到 `render-manual`，为全局和目录级 authority instructions 保留预算。

`restore` 只在根文件仍包含完整 handoff 标记时执行；一旦 agent 已写成最终项目入口，脚本拒绝覆盖它。`AGENTS_origin.md` 本身不属于 harness 自动加载候选，所以安装器将其内容镜像进临时根入口，并由临时指令要求 agent 显式读取备份后再合并。自动 handoff 不删除该精确备份；由负责人复核最终入口后决定何时清理。

DSH 会在每个 model step 前重探测 baseline，因此在运行中的 session 通过 shell 安装根入口后，下一步通常即可收到新增或更新指令；新 session 仍可用于更干净的冷启动验收，但不是加载前提。其他 harness 或禁用 instruction plugin 的 preset 必须单独验证。包内路径按安装器选定的 `.git` 项目根记录，若 agent 从更深工作目录启动，临时入口要求用 `git rev-parse --show-toplevel` 解析当前 session 的项目根再读取对应文件。嵌套仓库或 submodule 会形成自己的 `.git` 根，需要在实际启动 agent 的仓库中分别安装。

若通过独立 clone 把本包放入目标项目，本包自身的 `.git` 会让“从包目录内部启动”的 session 把治理包识别为另一个项目。作为普通 vendored 目录复制时应去掉内层 `.git`；作为 submodule 使用时则不要从 submodule 内启动针对宿主项目的 agent。

> `bootstrap/AGENTS.handoff.md` 故意不命名为包内的 `AGENTS.md`。否则 agent 维护或读取 bootstrap 目录时，harness 会把模板误当成该目录的真实局部指令。

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
  bootstrap/
    AGENTS.handoff.md
    AGENTS.merge-block.md
  scripts/
    install.sh
    test-install.sh
  templates/
    CORE_DOCUMENT_TEMPLATES.md
  profiles/
    MCP_PROJECT.md
    LIBRARY_AND_CLI_PROJECT.md
    APPLICATION_SERVICE_MONOREPO.md
```

- `bootstrap/AGENTS.handoff.md`：临时接管项目根入口的首轮自合并模板，不应在包内改名为 `AGENTS.md`。
- `bootstrap/AGENTS.merge-block.md`：人工合并进已有根入口的临时 block。
- `scripts/install.sh`：渲染、安装、检查和回滚根入口；不覆盖未完成的备份或已合并的最终入口。
- `scripts/test-install.sh`：验证有/无原入口时的安装、幂等拒绝、检查、回滚和人工 block 渲染。
- `MAINTAINER_AGENT_GUIDE.md`：治理已有项目的混合、缺失或失效文档。
- `DEVELOPER_AGENT_GUIDE.md`：新项目初始化和后续日常开发纪律。
- `templates/CORE_DOCUMENT_TEMPLATES.md`：只有实际创建项目文档时才读取；包含应写入项目指定位置的内嵌模板。
- `profiles/*.md`：只有项目类型匹配时才读取。项目可组合 profile，例如 monorepo 中同时存在 MCP server 和 library package。

## 使用规则

1. 自动入口只负责确定角色和强制最小读取顺序，不把整个治理包复制进根上下文。
2. 先确定角色，再打开一份角色指南；不要把整个目录加入每轮上下文。
3. 角色指南要求创建项目文档时，再读取模板文件中的精确小节。
4. 识别项目类型后，只打开匹配的 profile。
5. 本文档包只指导初始化和治理。项目完成初始化后，删除临时 bootstrap；日常 agent 由项目自己的精简 `AGENTS.md` 路由。
6. 生产消费者和运维人员不应直接使用本治理包；初始化或维护 agent 应为他们生成独立的 usage/operations 文档或协议投递面。
7. 任何模板都允许按项目规模裁剪；不得为不适用的角色创建空目录或空文档。
8. 结论只能标记为 `verified`、`inferred` 或 `unknown`；不得将猜测写成当前事实。

## 交付完成的共同标准

无论初始化还是治理，完成后一个没有历史上下文的开发 agent 都应能在不读取本治理包全文的情况下回答：

1. 项目是什么，当前任务应进入哪个模块？
2. 该模块负责和不负责什么？
3. 修改前必须遵守哪些安全、兼容或副作用约束？
4. 修改后运行哪些验证？
5. 哪些变化需要更新公共契约、架构、运行手册或经验？

不能回答上述问题，或根 `AGENTS.md` 仍包含 `manual-merge`/`handoff`/`origin-mirror` 标记，说明项目内的开发入口仍未完成。

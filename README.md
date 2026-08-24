# Agent 项目开发治理包

> 根入口只提供短路由和状态；agent 通过 JSONL 精确命中一个角色，再读取一个指南。README 不自动加载。

## Harness 边界

DeepSeek Harness 按 `.git` 根到 cwd 的路径链自动加载精确命名的 `AGENTS.md`、`CLAUDE.md` 和 local overlay，并在每个 model step 前重探测 baseline。嵌套 README、JSONL、角色和模板不会自动加载；DSH minimal preset 未启用 instruction plugin。

本包把合并后的根入口限制为 16,384 bytes。永久 routing block 设计为每步重复成本，必须保持短小；角色、流程、profiles 和模板只按需读取。

## JSONL 精确路由

不要列出、glob 或预读 `roles/`。顺序：

1. `adapter-trigger` 只有在当前已注入根上下文含成对 managed trigger block 时才激活；不存在时立即普通路由。禁止通过 glob/search/read `bootstrap/` 模板寻找或激活 trigger。
2. 用户/父 agent 已给 plane/role/mode 时，在 `routing/*.roles.jsonl` 精确 grep quoted `id` 或 literal alias，直接读唯一命中记录；不再判断 plane/role。
3. 未指定时只读 `routing/planes.jsonl` 的两行；Production/Development 不明确时调用可用的结构化问答工具（DSH 为 `ask_user_question`），在收到回答前停止。
4. 确定 plane 后只搜索对应 registry；role/mode 不明确时使用同一问答工具，并在角色指南前停止。
5. 适配 trigger 另外从 `routing/project-types.jsonl` 精确 grep 一个主项目类型；不允许通过预读多个 profile 反推类型。未定义或证据实质匹配多个类型时，必须使用结构化问答说明包内没有明确匹配架构，让用户确认最近类型、更新包定义或判定不适用。
6. 阻塞性问题不能只在正文列出：使用稳定 question ID、2–4 个互斥选项和每项一行影响；选项会误导时才使用自由文本。没有问答工具时才直接提问。角色指南和适配流程中的“询问用户”都继承此协议。
7. 只读命中记录的 `guide`、当前 mode 的 `procedure_by_mode` 和一个命中 profile。

注册表：

```text
routing/planes.jsonl
routing/production.roles.jsonl
routing/development.roles.jsonl
routing/project-types.jsonl
```

每行都是完整 JSON object，角色记录包含全局唯一 `aliases`。例如 `grep -F '"仓库维护者"' routing/development.roles.jsonl` 直接返回 Maintainer；明确标签时禁止 Read/cat 整个 registry，也不读取 plane registry。`scripts/validate-routing.mjs` 使用 JSON parser 校验语法、唯一 ID/alias、plane、role、project type、mode、profile 和包内路径。

## Plane、角色和子模式

| Plane | Role | Modes | Guide |
|---|---|---|---|
| Production | User | end-user、api-sdk、cli、mcp | `roles/production/USER.md` |
| Production | Operator | deploy/configure、observe、incident、backup/recovery、rollback | `roles/production/OPERATOR.md` |
| Development | Developer | feature、initialize | `roles/development/DEVELOPER.md` |
| Development | Maintainer | code、readapt | `roles/development/MAINTAINER.md` |
| Development | Reviewer | static、sandbox-dynamic | `roles/development/REVIEWER.md` |
| Development | Field Evaluator | scenario-validation、exploratory-evaluation | `roles/development/FIELD_EVALUATOR.md` |

包适配不是顶级角色：

- 新或实际上为空的项目：Developer / `initialize`
- 已有项目：Maintainer / `readapt`

两者额外读取 `procedures/PACKAGE_ADAPTATION.md`。普通 feature/code 任务不读适配流程。

用户明确授予多个兼容角色时不重复询问；生产凭据、真实数据、费用和破坏性动作仍需单独授权。

## 子 agents

父 agent 先读 `templates/SUBAGENT_ASSIGNMENT.md`，逐项给出 plane、role/mode、目标、读写路径、环境/数据、网络/费用、破坏性权限、验证和升级对象。子 agent 不继承未传递权限；分配冲突时询问 parent/captain，不自行读其他角色。

## 适配状态

永久根 block 包含：

```text
Package adaptation: status=pending; package_revision=1.3.1; verified_at=never; scope=repo; reason=not_adapted
```

- `pending/stale`：安装器管理。
- `partial/adapted/blocked`：initialize/readapt 通过 `set-state` 记录。
- `adapted`：当前版本、UTC 时间、实际 scope、`reason=none`。
- `partial/blocked`：精确范围和非敏感 reason code。

时间不能替代适配证据。

## 云端新鲜度与缺包

`PACKAGE_REMOTE.json` 固定受信 GitHub 仓库、Contents API path 和远端 `PACKAGE_VERSION` URL。`scripts/install.sh check-update` 通过 Node 做一次只读探测并输出 JSON。private 仓库依次使用 `GH_TOKEN/GITHUB_TOKEN`、已登录的 `gh api`，最后才尝试匿名 raw URL；无可用凭据时明确返回 `unavailable`，不伪装成最新版：

- `current`：本地与云端 revision 相同，可以继续。
- `remote_differs`：云端 revision 不同；必须通过结构化问答选择同步包、明确继续所报告的本地版本或停止。
- `unavailable`：网络、HTTP 或元数据校验失败；不得误报 current，必须选择重试、明确离线继续或停止。

命令不修改包、根指令或状态。trigger 在读取任何包指南前检查本地关键文件；缺失时使用 `package_missing` 问题，让用户选择从 trigger 中渲染的 Source 恢复 vendored 包、移除 managed blocks 或停止。不存在的包绝不能被当作已是最新版。

## 安装位置

```text
<project>/
  agent-project-guides/
  AGENTS.md 或 CLAUDE.md
```

包必须位于目标项目内部。安装器按 `AGENTS.md` > `CLAUDE.md` 选择根入口：已有 `AGENTS.md` 时始终写入它；仅有且不超过预留空间的 `CLAUDE.md` 时原地追加；仅有但过大的 `CLAUDE.md` 保持不变，另建短 `AGENTS.md`。无根文件时创建 `AGENTS.md`。local overlay 和未选中的根文件保持不变；若多个候选已含包 managed marker，则拒绝重复安装。vendored clone 应移除内层 `.git`；submodule 场景不要从 submodule 内启动宿主项目 agent。

## 方案一：只合并永久路由

```bash
./agent-project-guides/scripts/install.sh merge
```

脚本保留所选根指令文件的原始字节前缀，只在末尾追加渲染后的永久 routing/state；不调用 LLM、不追加 trigger、不创建或改名 `AGENTS_origin.md`。

客户随后显式指定；执行适配的 agent 仍先运行 `check-update`：

```text
新项目：Development / Developer / initialize
已有项目：Development / Maintainer / readapt
```

完成后运行 `set-state`。方案一没有临时提示需要删除。

## 方案二：追加一次性 trigger

```bash
./agent-project-guides/scripts/install.sh trigger
```

脚本先确保永久路由存在，再在同一个所选根指令文件末尾追加 `bootstrap/AGENTS.adapter-trigger.md`。下一个 agent 先验证本地包并对比云端 revision，再判断 initialize/readapt 和一个固定项目类型；完成后更新 `adapted` 并运行 `remove-trigger`。只删除 trigger，原项目内容和永久路由保留。

中断恢复：

- 当前版本已经 `adapted`：只清理 trigger，不重复适配。
- `partial`：只继续未验证 scope/reason。
- `blocked`：保留 trigger，询问重试、缩小、跳过或人工移除，不循环。

## 脚本命令

```bash
scripts/install.sh merge
scripts/install.sh trigger
scripts/install.sh check
scripts/install.sh check-update
scripts/install.sh set-state --status adapted --verified-at <UTC> --scope repo --reason none
scripts/install.sh remove-trigger
scripts/install.sh unmerge
node scripts/validate-routing.mjs
```

所有 install 命令支持 `--target <project>`；省略时从包父目录向上寻找最近 `.git`。

## 安全和回归约束

- 根选择固定为 `AGENTS.md` > `CLAUDE.md`；未选中的普通根候选和 local overlay 原样保留，多个候选中出现重复 managed marker 时拒绝继续。
- 所选根文件是 symlink、无效 UTF-8、marker 冲突或合并后超限时保持原文件不变。
- 旧 root-replacement handoff marker 必须先按旧版本恢复。
- 同版本 `merge/trigger` 幂等；版本变化刷新 routing 并标记 `stale`。
- `remove-trigger` 只接受 `adapted`；`unmerge` 要求 trigger 已删除。
- `check-update` 只读云端版本，不自动下载或覆盖；`remote_differs/unavailable` 不能静默继续。
- 测试强制 routing/trigger/JSONL/Developer/适配流程 byte budgets，并断言精确 grep、单 profile 和逐个模板规则。

运行：

```bash
./scripts/test-install.sh
```

## 精确模板

模板物理拆分，禁止全文枚举：

```text
templates/ROOT_AGENTS.md
templates/DOC_INDEX.md
templates/DEVELOPMENT_START.md
templates/ARCHITECTURE_OVERVIEW.md
templates/MODULE_CONTRACT.md
templates/VERIFICATION_MATRIX.md
templates/USER_USAGE.md
templates/OPERATOR_RUNBOOK.md
templates/FIELD_EVALUATION.md
templates/ADR.md
templates/SUBAGENT_ASSIGNMENT.md
```

`procedures/PACKAGE_ADAPTATION.md` 只在即将创建一个产物时点名并读取一个模板；完成该产物后才考虑下一个。禁止批量预读模板或枚举目录。

## Profiles

- `profiles/MCP_PROJECT.md`
- `profiles/LIBRARY_AND_CLI_PROJECT.md`
- `profiles/APPLICATION_SERVICE_MONOREPO.md`

项目类型由 `routing/project-types.jsonl` 固定定义并给出唯一 profile 路径。分类后精确 grep 一条记录，只读取命中 profile；组合或未定义项目不能靠预读多个 profile 猜测，必须请求用户确认最近类型、更新包定义或判定不适用。

## 包结构

```text
agent-project-guides/
  PACKAGE_VERSION
  PACKAGE_REMOTE.json
  README.md
  bootstrap/
  routing/
  roles/
    production/
    development/
  procedures/
  profiles/
  templates/
  scripts/
```

包内 bootstrap 故意不使用精确文件名 `AGENTS.md`，避免进入目录时被 harness 当作真实局部指令。角色放入二级目录并由 JSONL 给出精确路径；目录布局是上下文软隔离，不是安全权限边界。

## Token 目标

当前回归上限：

- 永久 routing template：不超过 1,600 bytes
- 临时 trigger：不超过 2,850 bytes
- plane 和 role JSONL 合计：不超过 2,200 bytes
- project type JSONL：不超过 700 bytes
- Developer guide：不超过 4,000 bytes
- Package adaptation procedure：不超过 7,000 bytes

README 是人类权威说明，不自动加载，不为 token 目标牺牲完整性。

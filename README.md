# Agent Project Guides 2.0

> DSH 优先的项目治理内核：项目只提交最小 descriptor 和 DSH bootstrap，通用角色、流程、profile、schema 与 catalog 存在内容寻址发行包中，按精确 ID/section 加载。

当前版本：`2.0.0`。Linux/WSL 的 deterministic core 和 immutable release 已通过完整套件与独立复核；真实项目采用数据继续进入 2.0.x 测量，不改变本版本契约。边界见 [`plans/AGENT_PROJECT_GUIDES_2.0.md`](plans/AGENT_PROJECT_GUIDES_2.0.md)，决策见 [`decisions/`](decisions/)。

## 1. 互信与责任

2.0 初期采用互信调用责任模型，不先建设企业级安全控制面：

- 调用方负责目标、输入、声称的权限、预期外部效果、费用和结果使用，并承担被调用能力已经披露的调用后果。
- 被调用实现负责准确披露效果、按契约执行、限制失败范围，并如实报告错误和不确定性。
- 互信不允许隐藏副作用、虚假成功、静默扩大范围或掩盖实现缺陷。
- Production、凭据、私密数据、费用、破坏、release 和物理/安全影响仍使用其 runtime 已定义的权限；角色、prompt、memory 或 descriptor 不制造授权。

身份、ACL、审计、签名供应链、隔离和对抗防护在真实部署边界或失败证明需要时再按最小有效范围增加。完整合同见 [`docs/V2_CONTRACT.md`](docs/V2_CONTRACT.md)。

## 2. 项目文件

项目提交 `.agent-project-guides.json`：

```json
{
  "schema_version": 1,
  "project_id": "example.project",
  "provider": {
    "mode": "thin-bootstrap",
    "release": "2.0.0",
    "digest": "sha256:<64 lowercase hex>"
  },
  "facets": ["cli"],
  "overlays": [],
  "protected_effects": [],
  "policy": {"root": "AGENTS.md", "mandatory": []},
  "layout": {"scratch": [".agent-scratch"], "memory": "docs/memory"}
}
```

该文件只有项目事实，不包含机器路径、命令、凭据、generic package bytes、cache、receipt、journal 或 ACL/audit 状态。`AGENTS.md`/`CLAUDE.md` 只保留紧凑的 managed DSH bootstrap 和项目自有规则。

## 3. Provider 模式

| Mode | 用途 | Package 位置 |
|---|---|---|
| `thin-bootstrap` | 默认消费者模式 | XDG/Windows 外部 immutable store |
| `embedded-local` | 1.x 迁移和离线兼容 | `.agent-project-guides/local/releases/`，clone-local ignore |
| `source-worktree` | 本包源码仓库自举开发 | 当前源码树，动态 observed digest |

`source-worktree` 只允许 package source 以 `source: "."` 给自己使用。它报告 mutable/dirty 状态，不能冒充 immutable release evidence，也不会覆盖供其他 pinned consumer 使用的共享 launcher。

XDG 默认位置：

```text
$XDG_DATA_HOME/agent-project-guides/releases/
$XDG_STATE_HOME/agent-project-guides/projects/
$XDG_CACHE_HOME/agent-project-guides/
```

测试或明确运维可用 `AGENT_PROJECT_GUIDES_HOME` 覆盖。Windows 路径映射已实现为 `%LOCALAPPDATA%\AgentProjectGuides`；正式 Windows 支持仍以 P0 smoke 为门。

## 4. 2.0 CLI

CLI 为无第三方依赖的 Node ESM：

```bash
node scripts/apg.mjs help
node scripts/apg.mjs catalog check
node scripts/apg.mjs release install --source /path/to/agent-project-guides
```

初始化新项目：

```bash
node scripts/apg.mjs project init \
  --target /path/to/project \
  --project-id example.project \
  --mode thin-bootstrap \
  --source /path/to/agent-project-guides \
  --facets cli

node scripts/apg.mjs project validate --target /path/to/project
```

`project init` 报告 launcher 路径，不修改 `PATH`，不运行 LLM，不执行 `git add/commit`。

主要接口：

```text
project init|hydrate|validate|uninstall
catalog build|check
release install|verify
provider capabilities|resolve|search|load|export|import
migrate plan|apply|rollback
risk classify
memory propose|review|promote|supersede|purge
dsh report
```

普通结果为 JSON stdout，诊断为 JSON stderr。`resolve` 返回预算内 section IDs、token 估算和 suggestions；`load --ids <csv>` 批量返回精简的 `[id, content]` pairs。`hydrate` 只接受 pinned version/digest。`provider import` 在 mutation lock 内重检 revision，以可恢复 transaction 更新 portable facts；不能改变项目/provider identity 或 `policy.root`。

Immutable release digest 覆盖 runtime distribution manifest；launcher 在导入 CLI 前验证 manifest、每个文件 hash、case-collision 和意外文件。源码测试、pilot fixture、roadmap 与 decision 记录属于 source release evidence，不作为 consumer runtime bytes 安装。

## 5. 精确路由和 catalog

语义 ID 由 registry 拥有，路径只是位置。`routing/context-routes.jsonl` 声明日常 mode/profile/overlay 的 owner-bound entries/sections 和预算；`initialize/readapt` 才加载完整 profile，Production 不继承 Development profile/overlay。

```text
exact role/mode + project facts
  -> budgeted section route + mandatory IDs
  -> bounded lexical suggestions
  -> exact hash-checked load
```

`search` 只提供候选，不能满足 mandatory policy。`load` 重新计算 source/section SHA-256，stale catalog 或 expected hash 不匹配直接失败。不得用 fuzzy role 推断、全包预读或失败后的 glob 猜 authority。

禁止 profile 复述 subtype 章节；同一动态事实只保留一个 executable/schema authority。

## 6. 角色和验证

| Plane | Role | 责任 |
|---|---|---|
| Production | User | 在 runtime authority 内消费公开能力 |
| Production | Operator | 部署、观测、恢复、rollback、精确产物 promotion |
| Development | Developer | 有意新增行为和 bounded Author Check |
| Development | Maintainer | 行为保持型修复、维护和 bounded Author Check |
| Development | Reviewer | 非作者静态/设计/diff/test-adequacy finding |
| Development | Verifier/Test Engineer | 挑战验证合同、执行动态验证并给出 verdict |
| Development | Field Evaluator | 代表性非生产 fit-for-use evidence |

Developer/Maintainer 只能声明 `ready_for_verification`。R2/R3 最低验证合同由非作者批准；Verifier 可增强但不能自行降低。第二个 Agent 若使用相同身份/环境，只是 peer challenge，不声称 formal IV&V。

风险按单调需求合成：

```text
runtime/admin > operation/tool > project > facet/overlay > task/role/caller
```

低层不能删除高层 effect 或降低 tier。普通工作为 R1；真正非行为型可为 R0；material protected effect 为 R2；destructive/safety-critical 为 R3。

## 7. Facets、overlays 和布局

2.0 facets：

```text
mcp library cli service application-ui data-automation
content-package monorepo-composition
```

Overlays：

```text
mechanical-modeling agent-governance research-reproducibility
```

Facet/overlay 选择验收视图，不自动授予权限，也不因项目类型本身把所有任务提升到 R2。真实 operation effect 决定风险升级。

项目保留生态原生 source/test/output 布局。Descriptor 只映射容易产生漂移的 scratch、memory、policy 和必要 authority。一个逻辑 scratch class 可以有多个 package/CI/Windows-WSL 物理 binding；默认不提交。

## 8. Memory

`memory propose` 以独占创建把 draft 写入 checkout-local state，不进入 catalog/Git。`review` 要求非作者并绑定 project digest。`promote` 在共享 mutation lock 内重读 descriptor，只以 atomic no-replace 创建项目 memory；更新必须使用新 ID 和 `supersede`。它不 stage/commit。`purge` 只删除 local proposal。

改变当前行为的经验应更新 test、runbook、contract 或 ADR；experience 只保留 provenance，不自动变成 instruction。

## 9. 迁移、降级和恢复

从 1.x 迁移使用独立的 `plan -> apply -> rollback`，不把旧 `unmerge` 伪装成 2.0 rollback：

```bash
node scripts/apg.mjs migrate plan --target /project --project-id example.project --source . --facets content-package
node scripts/apg.mjs migrate apply --plan <plan-file> --digest <plan-digest>
node scripts/apg.mjs migrate rollback --target /project
# descriptor 已在中断点恢复/删除时：
node scripts/apg.mjs migrate rollback --target /project --project-id example.project
```

Rollback 先 preflight 所有 receipt-owned postimage；有任一 later/ambiguous edit 时执行零恢复写入并报告 conflict。没有冲突时只恢复 migration 捕获和拥有的 bytes/path absence。它不删除 tracked legacy package、无关外部状态或 Git history。

离线行为：

- exact release 已安装：完整 core 可用；
- exact release 缺失但有显式 source：`project hydrate` 只安装 pinned digest；
- exact release 缺失且离线：descriptor/bootstrap 可读，protected work safe-stop，其他工作显式 degraded。

详见 [`docs/V2_MIGRATION.md`](docs/V2_MIGRATION.md)。

## 10. 1.x 兼容入口

`scripts/install.sh` 保留原命令和 byte-preserving managed-prefix 行为，用于现有 vendored 安装的检查和迁移准备：

```text
merge trigger check check-update set-state remove-trigger unmerge
```

它仍要求 package 位于 target 内部。2.0 新项目不要把它当默认安装器。`check-update` 仍是 legacy 版本可用性比较，不负责 digest 安装。

## 11. 验证

```bash
./scripts/test-release.sh
APG_RUN_REAL_PILOTS=1 ./scripts/test-release.sh
```

聚合套件覆盖 schema/routing、1.x compatibility、2.0 lifecycle/concurrency、catalog/self-host/manifest 和 diff。`APG_RUN_REAL_PILOTS=1` 在临时副本运行两个 route/migration pilot。

Pilot 自动门为 route noninferiority/token budget、mandatory recall、migration ownership 和 no staging。真实 DSH task outcome 是独立发布证据门，基础设施脚本不伪造它。

基础设施命令不调用 LLM，也不自动 stage、commit、付款、使用生产凭据或执行破坏性动作。

## 12. Ownership

| 路径 | 职责 |
|---|---|
| `scripts/apg.mjs`, `lib/` | 2.0 CLI 和 deterministic core |
| `schemas/` | portable public schema |
| `catalog/` | 由 canonical package sources 生成的索引 |
| `routing/` | semantic role/facet/overlay/effect 和 context-budget registry |
| `roles/`, `procedures/`, `profiles/`, `templates/` | canonical generic guidance |
| `bootstrap/` | DSH v2 bootstrap 和 1.x compatibility blocks |
| `docs/` | 当前 2.0 使用、迁移和恢复合同 |
| `decisions/` | 已接受架构决策 |
| `plans/` | 路线图和实施边界，不覆盖当前代码事实 |

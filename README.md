# Agent Project Guides 3.0

> DSH 优先的项目治理内核：3.0 首个纵向切片支持项目内 selected inline 文档和系统级 pinned packed runtime，同时保留 2.0 descriptor/CLI 行为。

当前版本：`3.0.2`。仅 `selected-inline.none` 与 `shared-runtime.pinned` 可运行；其他模式未实现。合同见 [`docs/V3_MINIMAL_SLICE.md`](docs/V3_MINIMAL_SLICE.md)；2.0 兼容边界见 [`docs/V2_CONTRACT.md`](docs/V2_CONTRACT.md)。

## 1. 互信与责任

2.0 初期采用互信调用责任模型，不先建设企业级安全控制面：

- 调用方负责目标、输入、权限、外部效果、费用和结果使用。
- 实现负责准确披露效果、按契约执行、限制失败范围并如实报告。
- 互信不允许隐藏副作用、虚假成功、静默扩大范围或掩盖缺陷。
- Production、凭据、私密数据、费用、破坏、release 和物理/安全影响仍使用其 runtime 已定义的权限；角色、prompt、memory 或 descriptor 不制造授权。

身份、ACL、审计、签名和隔离在真实边界需要时再增加。完整合同见 [`docs/V2_CONTRACT.md`](docs/V2_CONTRACT.md)。

## 2. 项目文件

3.0 项目提交 schema 2 的 `.agent-project-guides.json`，variant 和各轴必须一致：

```json
{
  "schema_version": 2,
  "project_id": "example.project",
  "variant": "selected-inline.none",
  "release": {"policy": "pinned", "version": "3.0.2", "digest": "sha256:<64 lowercase hex>"},
  "documents": {
    "placement": "selected-local",
    "lifecycle": "maintenance",
    "roles": ["development/maintainer", "development/reviewer", "development/verifier"],
    "profiles": ["cli"],
    "overlays": []
  },
  "router": {"strategy": "inline-route", "executable": "none"},
  "context": {"max_tokens": 4096, "clarification_max_tokens": 160},
  "containment": {"workspace": "physical-selected", "host_corpus_exposure": "unknown"},
  "integrity": {"manifest_digest": "sha256:<64 hex>", "root_block_hash": "sha256:<64 hex>"},
  "protected_effects": [],
  "policy": {"root": "AGENTS.md", "mandatory": []},
  "layout": {"guides": ".agent-guides", "scratch": [".agent-scratch"], "memory": "docs/memory"}
}
```

Schema 1 descriptor 继续按 2.0 解释，不自动重写。Descriptor 不含机器路径、凭据、generic bytes、cache、receipt 或 journal。

## 3. Runtime 模式

| Variant / legacy mode | 文档位置 | 普通路由依赖 |
|---|---|---|
| `selected-inline.none` | `.agent-guides/managed/` 的精确 selected closure | 无 CLI |
| `shared-runtime.pinned` | XDG/Windows 外部 digest-addressed content pack | shared CLI |
| schema 1 `thin-bootstrap` | 2.0 外部 immutable release | 2.0 launcher |
| schema 1 `embedded-local` | 2.0 clone-local ignored release | 2.0 launcher |
| schema 1 `source-worktree` | 当前 APG 源码树 | source CLI |

`shared-runtime.pinned` 的 host containment 是 soft，不是同用户文件系统安全边界；项目内不含 generic Markdown。`source-worktree` 继续只允许 package source 给自己使用，并报告 mutable/dirty 状态。

共享 pack 在 `$XDG_DATA_HOME/agent-project-guides/runtimes/`；测试可用 `AGENT_PROJECT_GUIDES_HOME` 隔离。

## 4. CLI

CLI 为无依赖 Node ESM。fresh consumer 先 preview，再显式 apply：

```bash
node scripts/apg.mjs project materialize \
  --target /path/to/project \
  --project-id example.project \
  --variant selected-inline.none \
  --lifecycle maintenance \
  --profiles cli
```

Preview 通过后，对同一命令增加 `--apply` 才会写入。随后直接获取 bounded context：

```bash
apg context --target /path/to/project --task "fix login recovery" --format context
```

Schema 1 项目先生成零写入预览，再以相同选项和 exact plan digest 迁移：

```bash
node scripts/apg.mjs migrate v3-preview \
  --target /existing-project \
  --variant shared-runtime.pinned \
  --lifecycle maintenance \
  --source /path/to/agent-project-guides
node scripts/apg.mjs migrate v3-apply \
  --target /existing-project \
  --variant shared-runtime.pinned \
  --lifecycle maintenance \
  --source /path/to/agent-project-guides \
  --digest sha256:<reviewed-plan-digest>
```

`help` 列出 `context`、project/provider/release、migration、risk、memory 和 DSH 接口。`context --format context` 直接输出 bounded governance 内容。命令不运行 LLM，不自动 `git add/commit`，不解析 `latest`；launcher 导入 CLI 前验证精确 manifest 与 hashes。

## 5. 精确路由和 context

语义 ID 由 registry 拥有，路径只是位置。`routing/context-routes.jsonl` 保留 per-subject section budget；`routing/context-classifier.json` 只做 deterministic role recommendation，不制造权限。

```text
explicit role/mode or bounded lexical classification
  -> protected/ambiguous choice, or exactly one selected role
  -> mandatory IDs + budgeted role/profile/overlay sections
  -> selected-view allowlist + exact hash checked content
```

不确定时返回不超过 descriptor clarification budget 的 compact choice，不并集加载候选 roles/profiles/security docs。Production 仍不继承 Development profile/overlay。Schema 1 的 `search` 继续只是候选，不能满足 mandatory policy；`provider resolve/load` 行为保持兼容。禁止 profile 复述 subtype 章节；同一动态事实只保留一个 executable/schema authority。

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

## 7. Profiles、overlays 和布局

3.0 profiles（schema 1 中名为 facets）：

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

Schema 1 → 2 的 `v3-preview` 输出 closure、前后像和 plan digest；`v3-apply` 只接受相同选项及 reviewed digest，以 transitional containment 保留 2.0 恢复边界。`v3-rollback` 先验证 recovery anchor 和全部 postimage；冲突时零写入。Finalization 尚未实现。

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

聚合套件覆盖 schema/routing、1.x compatibility、完整 2.0 regression，以及 3.0 两个 variant 的 closure/context/packed runtime/materializer failpoints/zero-write migration preview。`APG_RUN_REAL_PILOTS=1` 仍运行既有 2.0 route/migration pilots。

Pilot 自动门为 route noninferiority/token budget、mandatory recall、migration ownership 和 no staging。真实 DSH task outcome 是独立发布证据门，基础设施脚本不伪造它。

基础设施命令不调用 LLM，也不自动 stage、commit、付款、使用生产凭据或执行破坏性动作。

## 12. Ownership

| 路径 | 职责 |
|---|---|
| `scripts/apg.mjs`, `lib/` | schema 1 compatibility 与 3.0 deterministic core |
| `schemas/` | schema 1 与 schema 2 portable public contracts |
| `catalog/` | 由 canonical package sources 生成的索引 |
| `routing/` | semantic role/profile/overlay、classifier 和 context-budget registry |
| `roles/`, `procedures/`, `profiles/`, `templates/` | canonical generic guidance |
| `bootstrap/` | DSH v2 bootstrap 和 1.x compatibility blocks |
| `docs/` | 2.0 compatibility 与 3.0 minimal-slice contracts |
| `decisions/` | 已接受架构决策 |
| `plans/` | 路线图和实施边界，不覆盖当前代码事实 |

# Review findings register — release 3.0.3

Status: unified（合并完成 2026-09-03；追加现场路由逃逸审计）
来源：Reviewer(claude) 静态审查 + 执行 agent(deepseek) 审查 + Codex 真实 DSH 会话复现；按写入位置方案 §6.2 由合并者（claude-merger）合并，路由补充见 §8。
原草稿 `plans/draft-review-deepseek.md` 已全文并入本文件后移除；执行阶段方案 `.agent-scratch/write-location-plan.md` 已随 `.agent-scratch/` 一并 gitignore，不影响本文件自洽。
诚实边界：除注明"实测"者外，并发/崩溃一致性类结论（deepseek §2、§4.4 及 memory h1 项）均为**静态审查**，未做故障注入复现；定级为 provisional（见 §4.4 裁定）。
编号说明：memory 记录 id 前缀 `finding.m1.*` 中的 "m1" 是 deepseek 的 medium 级标记，与本章编号 M1（token 估计器）属不同编号空间；docs/memory 内 id 全局唯一，无冲突。

## 1. 总览与落点

| 编号 | 主题 | 定级 | 落点 |
|---|---|---|---|
| H1 | Windows fsync + 权限位（win32 支持） | **低优先级**（用户裁定；未在 Windows 主机验证） | §5 |
| H2 | 无 CI，门禁仅本机手工 | 高（路线） | §2 R2/R3、§4.1 |
| H3 | CLI 静默忽略未知选项 | 高（修复任务） | docs/memory/finding.h1.presence-only-flags 等 |
| H4 | DSH 路由 fail-open：模型可在未加载 APG context 时开始仓库操作（真实会话复现） | 高（治理有效性） | §8、§2 R6 |
| H5 | schema 1 self-host context 超预算但 `project validate` 仍报 `ready`（真实 CLI 复现） | 高（修复任务） | §8、§2 R5 |
| M1 | 中文 token 低估 ~25-33%（estimator 语义） | 中（合同级决策，**ADR 未起草，Open**） | §7 |
| M2 | 自宿主 doc index / CONTRIBUTING 缺失（自举缺口） | 中 | §7 |
| M3 | launcher/lib 完整性校验双实现 + 双轨原语漂移 | 中 | ADR-0004 相关、§2 R4 |
| M4 | materializer 收据构建复制粘贴（497-519 / 546-572） | 中 | docs/memory/finding.m1.*（同族） |
| M5 | 死代码：gitDirty / defaultRootName 恒等分支 / 不可达 EEXIST | 低 | docs/memory/ |
| M6 | 无 LICENSE / package.json / engines 声明 | 中（LICENSE 选型待 ADR） | §7 |
| M7 | schema 1 ambiguity 只有 role 对象，无 `choice_id` / `next_command` / stop protocol | 中（兼容性设计） | §8、§2 R5 |
| M8 | 中文 assessment / plan-only 意图缺少分类规则，`修复方案` 会被 `修复` 子串主导 | 中（路由质量） | §8、§2 R5 |
| M9 | APG 自身仍使用 schema 1 source-worktree，未 dogfood schema 2 可执行路由 | 中（已知延期放大为现场缺陷） | §8、§2 R6 |
| R1–R6 | 统一路线图（R1–R4 来自 deepseek；R5–R6 来自现场路由复现） | — | §2 |
| D-16 | deepseek 新发现 16 条（9 高 / 6 中 / 1 低） | provisional | §6、docs/memory/ |
| L1–L8 | claude 低严重度清单（CLI 值语法、HMAC 常时比较、锁竞态窗口、review 无锁、全量重 hash、catalog 静默回退、closure 错误路径、缩进） | 低 | docs/memory/（随 D-16 同批） |

## 2. 路线图（R1–R6）

- **R1（release 身份门禁）**：`PACKAGE_MANIFEST.json` 新鲜度有 `release verify-source` 兜底，但 git tag ↔ PACKAGE_VERSION ↔ README 版本 ↔ HEAD=release commit 无任何门禁。建议 release 脚本校验三者一致并拒绝非 release commit 打 tag。
- **R2（门禁退出码不可靠）**：`catalog check` 陈旧时返回 `{valid:false}` 且退出 0（scripts/apg.mjs:721-728），`test-release.sh:19` 因此独立无效；rollback/uninstall 的 conflict 同样退出 0。建议结构化冲突统一非零退出或显式 `--strict`；**修 exit 语义应先于或同步于 CI 引入**（§4.1）。
- **R3（测试工程现代化）**：① test-v2/v3 单文件"首断言失败即中止"，无独立用例与回归计数；② 多处 oracle 复用生产 `canonicalJson`/`sha256`（test-v3.mjs:8,128-149,221-230）；③ test-v2.mjs:69-70 在源树内跑 `catalog build` 改写 `catalog/catalog.jsonl`，非幂等；④ `APG_RUN_REAL_PILOTS=1` 默认静默跳过且依赖本机兄弟 checkout——真实发布门缺公开证据。建议：拆独立用例、独立实现 oracle、移除源树写副作用、pilot 基线固化为版本化 fixture。
- **R4（双轨安全语义漂移对策）**：symlink/fsync/`wx` 语义在 schema 1 与 v3 各一份且不一致。对策并入 M3：抽取统一 durable/atomic/restore 原语后两轨共用，并各留一致性测试。
- **R5（3.0.4 路由可靠性热修）**：修复当前 schema 1/self-host 的 bootstrap 状态机、context aggregate budget、可执行澄清协议、中文 assessment/plan-only 分类和全 route 预算预检。兼容性约束：底层 `provider resolve/load` 保持不变；若 schema 1 `apg context` 的 choice shape 不能做 additive 扩展，则增加显式版本化 protocol 并让新 bootstrap 使用它，不以静默破坏 3.0.3 解析器换取修复。
- **R6（3.1 DSH 强制适配与 self-host 对齐）**：新增受信 DSH 适配器，在首个模型调用前以结构化 argv 执行 APG route、注入 exact IDs/hashes/content，并在 route 未 `ready` 时限制普通仓库工具；实现 schema 2 source-worktree，使 APG 自身 dogfood 与消费者相同的可执行选择协议。不得把任意 checkout 的 `AGENTS.md` 提升为系统权限，适配器必须验证 managed marker、descriptor 与 runtime identity。

## 3. 去重对照（deepseek §1，保留备查）

| 已知清单项 | deepseek 对应结论 | 处理 |
|---|---|---|
| H1 Windows（降级） | 目录 fsync Windows 上 EPERM；`chmod --reference` 回退降权限 | 对齐，不重复建档 |
| H2 无 CI | 无 workflows/package.json/lint；全套门禁仅本机手工 | 对齐；失效细节见 R2、§4.1 |
| M1 中文 token 低估 | 认可存在（estimator 语义决策） | 对齐，ADR 待起草（Open） |
| M2 自宿主缺口 | 角色硬编码 `docs/INDEX.md`、模块契约、`docs/verification/MATRIX.md`，本仓 docs/ 均无；定性为**自举缺口** | 对齐 |
| M3 双实现 | 相同原语在 v2/v3 复制且安全性质漂移 | 对齐；可观察后果见 §4.3 |
| M6 元数据缺失 | 确认缺失；对"注入消费者仓库"的产品是采纳阻塞 | 对齐（LICENSE 选型待定） |
| H3 未知选项静默忽略 | `parseArgs` 无命令级 allowlist、多余 positional 忽略（实测确认） | 对齐 |
| M4 materializer 复制 | `applyMaterialization` >250 行，receipt 构造两处复制 | 对齐 |
| M5 死代码 | `gitDirty` 零引用、`defaultRootName` 恒同值、EEXIST 分支仅 memory promote 覆盖 | 对齐 |
| L1–L8 | 清单未给主题，无法逐条对照 | deepseek 新条目如撞主题由本合并去重（已核对：16 条 id 均为新增主题，无撞名） |

## 4. 异议与合并裁定

- **4.1（补充 R2/H2）** 结构化失败（validate `package_missing`、rollback/uninstall `conflict`、catalog check `valid:false`）全部退出 0，是同一 CLI 的系统性 exit 语义缺口；加了 CI 也会被 exit 0 架空。→ **裁定：采纳**，并入 R2 为前置项。
- **4.2（对互信模型范围的异议）** ADR-0001 把 hostile 安全推迟，但 materializer 核心场景是消费**第三方维护的 checkout**——symlink 预置、`.git` 指针、predictable temp 写入正是该场景的现实触发面；建议按场景分级而非整体推迟。→ **裁定：采纳为 ADR-0004（decisions/0004-threat-model-untrusted-checkouts.md，Status: proposed）**，范围与定级留维护者裁定。
- **4.3（补充 M3，launcher 双入口）** docs 用裸 `apg project materialize`（fresh 项目无 descriptor），而全局 launcher 对所有非 help/version 命令先 `findProject`——fresh 项目经 launcher 必然失败；且 launcher 将所有 schema 2 项目映射到 shared `$DATA/runtimes/<digest>`，`selected-inline.none` 无法经 launcher 使用，与 README "materialize 后 `apg context`" 示例矛盾。→ **裁定：采纳**，已建 `finding.h1.launcher-inline-and-fresh-unreachable`（docs/memory/）；README/文档修正列入 §7。
- **4.4（定级纪律）** 并发/崩溃一致性类高严重度结论目前均为静态审查、未做故障注入复现。→ **裁定：采纳**。本批 promote 的 deepseek h1/m1 记录 review rationale 均注明 severity provisional；正式定级待逐项注入复现（列入 §7）。

## 5. Windows 已知限制（低优先级，未在 Windows 主机验证）

用户已裁定 Windows 端功能整体低优先级。以下按事实记录：

- `fs.openSync(dir)+fsyncSync` 目录持久化在 Windows 通常 EPERM，materialize/rollback/launcher install 首处 durable 操作即可能命中（lib/materializer.mjs:29-45、lib/provider.mjs:255-258、lib/core.mjs:125-134）。
- `readGenerationKey` 权限位检查 `(mode & 0o077) !== 0` 在 Windows（文件 mode 恒 0o666）恒失败 → shared-runtime context 不可用（lib/provider.mjs:234）。
- 生成的 `.cmd` launcher 未处理 `%` 等展开字符；`AGENT_PROJECT_GUIDES_HOME` 含引号/换行时转义不足（lib/core.mjs:120-134、scripts/apg.mjs:133-144）。
- `platformHomes` Windows 分支与 Windows launcher 生成路径零测试（测试恒注入 `AGENT_PROJECT_GUIDES_HOME`）。
- profiles/mcp/WINDOWS_WSL_BRIDGE.md 的双主机桥接未在任何 Windows/WSL 主机实跑。
- 建议：先加 Windows CI job（可用 WSL2 runner）跑 `./scripts/test-release.sh`，再决定降级为文档化限制。

## 6. memory 记录索引（已 promote 至 `docs/memory/`）

owner=deepseek（执行 agent），reviewer=claude-merger（合并阶段验收，peer review，非 formal IV&V）。文件：`docs/memory/<id>.json`。

高（provisional，未故障注入）：`finding.h1.conflict-exit-zero`、`finding.h1.presence-only-flags`、`finding.h1.launcher-inline-and-fresh-unreachable`、`finding.h1.rollback-conflict-masked`、`finding.h1.apply-source-toctou`、`finding.h1.bootstrap-token-only-validation`、`finding.h1.memory-review-no-lock`、`finding.h1.schema1-init-not-transactional`、`finding.h1.v3-rollback-early-restore`
中：`finding.m1.no-fsync-durability`、`finding.m1.lock-domain-split`、`finding.m1.temp-file-symlink-writes`、`finding.m1.target-parse-divergence`、`finding.m1.ambient-token-check-update`、`finding.m1.readjson-error-masking`
低：`finding.l1.operator-runbook-approval-gap`
另批（claude 静态审查）：H3/M4/M5/L1–L8 对应记录（见 §1 落点列）。

## 7. 遗留动作（Open）

1. M1 ADR：token 估计器 CJK 偏差的合同语义（估计 vs 双报告）— 待起草。
2. M6 ADR：LICENSE 选型（影响 PACKAGE_REMOTE 仓库对外可用性）；package.json/engines 声明。
3. M2：补 docs/INDEX.md、docs/verification/MATRIX.md、CONTRIBUTING（或修角色硬编码路径，二选一需裁定）。
4. 4.3 文档修正：launcher 双入口语义（`project materialize`/`migrate v3-*` 放行或文档标注不等价）。
5. 4.4 落实：对 9 条 h1 逐项故障注入复现后正式定级。
6. R1–R4 排期；Windows 项按 §5 建议先 CI 后定级。
7. R5：先修 schema 1/self-host 的 route 可用性，并把本节两条现场请求加入 frozen corpus；在修复前不得把 `project validate: ready` 等同于“所有 context route 可用”。
8. R6：起草 DSH 受信适配器与 schema 2 source-worktree ADR；没有宿主前置执行和工具门时，只能声明 prompt-level guidance，不能声明 fail-closed routing。
9. §8 新发现尚未写入 promoted memory；需要持久化时按“新 proposal → 非作者 review → promote”处理，不原地扩写现有 16 条记录。

## 8. 现场路由逃逸审计与修复设计（2026-09-03）

### 8.1 结论与影响边界

本次真实 DSH 会话不是 production authority 被授予或工具权限被绕过，而是 **APG 治理加载 fail-open**：模型完整看到了根 `AGENTS.md`，但在未运行 APG route、未加载 Reviewer/Maintainer context 的情况下准备开始通用仓库探索。底层 runtime/tool policy 仍然有效，`authority_granted` 没有被改为 true；受影响的是角色边界、最小读取顺序、验证合同和用户澄清流程。

DSH 当前把 workspace instructions 渲染为 user-role synthetic message，包装语义为 “may be relevant / use as guidance”；APG 没有宿主插件在首个模型调用前自动运行 `apg context`，也没有在 route 未 ready 时阻止 `pwd/list/glob/read/bash`。因此仅修改 prompt 可以降低发生概率，不能提供机制保证。

### 8.2 已复现事实

1. 当前 descriptor 为 schema 1 `source-worktree`；`apg project validate --target .` 返回 `valid:true,status:ready`。
2. `apg context --task '分析当前项目的缺点和不足' --format json` 返回 `ordinary-ambiguity`，四个 choice 仅有 `{plane,role,mode}`，没有 `choice_id`、`route_hash`、`conflict_reason` 或 `next_command`。
3. `apg context --task '分析此模型逃逸路由的原因和准备修复方案' --format json` 被 `修复` 子串确定为 `maintainer/code`，随后报 `context_budget_exceeded`：`content_tokens=1656`、`context_tokens=2019`、`json_tokens=2656`、`max_tokens=2048`。
4. 显式 `reviewer/static` 在同一项目可用，aggregate 为 1499；显式 `maintainer/code` 仍失败（2655/2048）。这证明问题不是 provider/package 缺失，而是 assembled route budget 与 legacy output 协议。
5. `apg dsh report` 对应 Reviewer/Profile/Overlay sources 均为 `host_observed:false,model_effective:unknown`。
6. `node scripts/test-v2.mjs` 与 `node scripts/test-v3.mjs` 均通过，但没有覆盖当前 self-host descriptor 的全 role/mode context matrix，也没有真实 DSH 首次工具轨迹门。

### 8.3 根因分解

- **宿主执行缺口（H4）**：workspace instruction 是建议性 user-role context，不是可信前置执行器；模型遵循失败后没有第二道门（`@deepseek-ai/dsh-agent-instructions/lib/index.js:112,755-783`）。
- **bootstrap 协议缺口（H4/M7）**：schema 1 根块没有精确的 before-work 状态机，也未规定 ambiguity/context error 必须停止；“resolve exact role/task/path sources”不能告诉未分配角色的模型如何继续（`AGENTS.md:6-10`、`bootstrap/AGENTS.v2-block.md:6-10`）。
- **legacy compiler 缺口（H5/M7）**：schema 1 clarification 被有意保持为不可执行旧 shape；ready context 又使用固定 2048 aggregate，并以 JSON/context 较大值判定，即使请求 direct-context 也会被 JSON metadata 拖失败（`lib/context.mjs:164-214,433-480`）。
- **分类质量缺口（M8）**：Reviewer patterns 没有“分析/缺点/不足”等 assessment 词；CJK 使用子串匹配，无法区分“实施修复”与“仅提出修复方案”（`routing/context-classifier.json:13-21`、`lib/context.mjs:103-115`）。
- **验证门缺口（H5）**：`project validate` 只验证 descriptor/bootstrap/provider/catalog/registry，没有 compile 每个 selected role/mode；发布测试只检查一个小型 legacy ambiguity fixture，所以结构 `ready` 与运行时 route-ready 被混为一谈（`scripts/apg.mjs:335-386`、`scripts/test-v3.mjs:84-87`）。
- **自宿主代差（M9）**：ADR-0003 明确延期 schema 2 source-worktree，导致 APG 自身使用的路由能力弱于已部署 consumer；已知延期现已产生真实 cold-start failure，应重新排期（`decisions/0003-v3-minimal-vertical-slice.md:27`）。

### 8.4 R5：3.0.4 热修设计

1. 统一 bootstrap 状态机：direct-read descriptor → 在任何仓库发现/操作前运行 exact `apg context` → 仅 `status=ready` 后继续；`clarification_required` 使用结构化问题并等待；任何 context/compiler error 停止并报告。只有真正 `package_missing` 可进入已声明的 ordinary degraded 路径。
2. 修复 schema 1/self-host aggregate：采用经 route matrix 验证的 4096 上限，或按实际请求格式执行预算；若仍承诺 JSON/context 双形态都可用，则两者都必须独立通过，不允许未请求的序列化形态使另一形态失败。
3. 为 schema 1 context 提供 executable choices。优先采用 additive fields；若兼容性测试要求保持精确旧 shape，则新增显式 versioned protocol，保留旧默认和 `provider resolve/load`，新 bootstrap 固定请求新 protocol。
4. 分类器增加 assessment/plan-only corpus，并以交付意图区分 review、repair plan 和 implementation。最低要求：两条 §8.2 中文现场请求分别得到 `reviewer/static ready` 或可执行 ambiguity，不能 silent Maintainer misroute，也不能 budget error。
5. `project validate` 和 release gate 对 descriptor selected view 的每个 role/mode 编译 `context`/`json` 两种结果，校验 budget、hash、mandatory recall、`union_loaded:false` 和 `authority_granted:false`。
6. 同步 `AGENTS.v2-block.md`、README、V2/V3 contract、classifier/catalog/manifest；先临时 self-host fixture，再当前 APG 项目，再 consumer migration preview。R5 不宣称解决模型强制遵循。

### 8.5 R6：3.1 宿主强制设计

1. DSH 受信适配器在 turn start 获取 direct human task 和 project root，以非 shell、结构化 argv 调用 exact installed APG runtime。
2. `ready` 时在首个模型调用前注入 selected IDs、hash、content、route hash 和 source observation；`clarification_required` 时只暴露结构化提问/route continuation；错误时进入显式 blocked，而不是让模型自行降级。
3. 在 route ready 前，工具策略只允许 descriptor 读取、APG route/诊断和结构化提问；普通 repository discovery、写入、network/production 工具保持不可用。单纯注册一个 `apg_context` 工具不足以关闭逃逸，必须有前置执行或调度门。
4. 适配器只信任已验证 APG marker/descriptor/runtime，不提升任意 repository prose 的权限；route selection 与 operation authority 继续分离。
5. 实现 schema 2 source-worktree，保留 mutable/dirty observation，不伪装 immutable release；APG 源仓使用与 consumer 相同的 generation/executable-choice 语义。

### 8.6 验收与停止条件

- Frozen CLI corpus 至少覆盖两条 §8.2 中文请求、混合 review+implementation、negation、quoted/untrusted protected words 和每个 Operator mode。
- 当前 descriptor 及每个 materialized fixture 的全部 selected role/mode 都能在 declared aggregate budget 内生成两种输出；任一路由失败即 `project validate` 非 ready。
- ambiguity 每个可选项都有稳定 ID、完整 route、hash、原因和可执行 continuation；始终 `union_loaded:false`。
- 成功治理加载始终 `route_resolved:true,authority_granted:false`；宿主适配器不得制造 production/credential/data/cost/destructive authority。
- 新建真实 DSH session，对每个受支持 provider/model/版本至少重复三次；首个 repository-observing tool 必须发生在 route ready 之后。只跑 CLI fixture 不得宣称 DSH cold-start 已修复。
- `apg dsh report` 应能把适配器实际注入的 sources 标为 `host_observed:true`，同时诚实保留 `model_effective:unknown`。
- 任一测试仍允许未路由工具调用、任一 selected route 超预算、或 ambiguity 无 continuation，R5/R6 不得标记完成。

### 8.7 新 agent 接手顺序

1. Maintainer：先为 H5/M7/M8 写失败测试，修 context/compiler/classifier/validate；不同时改 DSH。
2. Reviewer：独立检查 schema 1 兼容策略、bootstrap fail-closed 文案与 README/contract 一致性。
3. Verifier：运行全 route matrix、两套现有 regression、临时 materialize/migration smoke；给 R5 verdict。
4. Developer/架构负责人：单独起草 R6 的 DSH adapter + schema 2 source-worktree ADR，明确跨仓修改、工具门和回滚边界。
5. Field evaluator：R6 实现后执行真实 fresh-session 重复试验；结果只作为 host/provider/model/version 绑定的观察证据。

§8 的发现目前只写入统一清单，未伪装为 promoted memory。后续若需要单条持久 provenance，必须创建新 ID 并由非作者 review；不得修改现有 16 条 promoted 记录。

### 8.8 R5 审查与验证交接

R5 / 3.0.4 候选的 Reviewer verdict 为 `approved`，Verifier verdict 为 `pass`，均限定于 runtime digest `sha256:deacad2bbc59057ad72516ceeb48c52b38e74d381f9dcc390fece9c1a2fa2325`。H5/M7/M8 的实现、审查期间修正、完整回归与独立补充验证详见 [R5_VERIFICATION.md](R5_VERIFICATION.md)。报告保留失败 fixture 校准和临时副本 Git index 差异等证据限制。

这是未提交 source-worktree 的 R5 交接，不是已发布版本或全部历史问题关闭。H4/M9、R6 的 DSH 受信适配器与 schema 2 source-worktree、真实 fresh-session 多模型重复试验仍未完成；下一步按 §8.7 由 Developer 单独立项。

### 8.9 R6 设计校准与插件边界

用户进一步明确：APG 核心保持 harness-neutral；DSH adapter 本质为 DSH 插件，位于 `plugins/dsh-apg/` 独立子目录和独立 Git 仓库，未来其他 harness 各自拥有插件。父仓仅管理插件索引和通用设计，不引入宿主 SDK、插件实现或 gitlink。

§8.5 是待校准的原始方案，不是批准实现或宿主全局强制保证。继续开发前先看 [R6_DESIGN_REVIEW.md](R6_DESIGN_REVIEW.md)：结合 GitHub 成熟格式、插件及 guardrail 例子，将 APG 通用接口/provider 演进与 DSH 插件分开，列出 source-worktree 执行信任、context 恢复写入、跨 turn/child 状态、注入证据、schema-2 耦合和仓库隔离六项设计风险。

本轮只建立插件文档骨架与子 Git、父仓忽略规则和分析报告；未实现插件、未迁移 descriptor、未修改当前 DSH。R6/H4/M9 仍未关闭，不要求为一个插件先搭建多宿主框架。

### 8.10 融合后的开发入口

后续任务选择与依赖顺序以 [DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md) 为规划入口；本清单继续保存原发现、编号、证据和裁定，不因路线调整更改历史结论。路线图融合 [大型项目治理研究](LARGE_PROJECT_GOVERNANCE_REVIEW.md) 与 R6 校准，先落实自宿主治理/失败语义/验证基础，再分别推进 APG 通用接口、schema-2 source-worktree 和独立 DSH 插件。

路线图的 P0–P5 是阶段标签，R6-A/B/C 是工作包，不新增缺陷计数，不授予部署或发布权限。结合既有实现/项目记录复核后，下一轮收紧为 P0 + P1a（最小索引/矩阵），P1b 按实际变更补模块说明，然后修 P2 失败语义；旧 §8.7 的“R5 后直接进入 R6”顺序按此规划细化。路线图 §1.1–1.2 明确已实现能力、两份既有 pilot 定义与仅候选项目；复用现有风险/记忆/测试入口，不把历史计划或外部 checkout 记录当作当前通过证据。该规划交付不表示任一待办已实现或 H4/M9 已关闭。

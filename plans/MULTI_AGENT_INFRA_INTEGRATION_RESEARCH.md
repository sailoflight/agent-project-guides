# APG 与现有 Multi-Agent 基础设施融合调研

日期：2026-09-19
状态：**研究报告 + proposal**（report-only，未实施；不改变任何公共行为、schema、路由或分发内容）
责任：development/maintainer（调查并给出有证据的改进建议），依据 `roles/development/MAINTAINER.md` §7 的 verified / inferred / proposal 三分
范围：APG 九层能力边界盘点、外部生态取证、Capability Matrix、三套候选架构与推荐边界（第二轮已扩展为：Jeffrey Emanuel 整套 Agent Flywheel，40 工具）
非目标：不实现 ABI、不改 schema、不安装 br/bd/bv/cass/Agent Mail、不发布、不访问外部 pilot 仓库

## 0. 结论摘要

**先回答范围问题**（第二轮）：本次深入的是 **Jeffrey Emanuel 的整套 Agentic Coding Flywheel**（40 个工具，≈16,881★，`agent-flywheel.com`）。结论是 **融合（Fusion）**——APG 既不该覆盖它，也不会被它覆盖；两者**正交**：Flywheel 是**执行面**（跑起来、强制住、别互踩、记得住），APG 是**权威面**（谁有权、凭什么、规则与证据的合约）。逐层对位见 §8，全景见 §7。


1. **不是重大转向，主要是显式化。** 任务书设想的 Architecture B/C 与 APG 已接受的决定（ADR-0005 harness-neutral、`plans/DEVELOPMENT_ROADMAP.md` §1/§2/§8）方向一致。推荐 **Architecture B（APG 作为项目控制面）**；**Architecture A（Full Stack）判 Reject**（成本 + 直接违反既有非目标）；**Architecture C（Meta Adapter）保留为北向目标但设门槛**——因为"中立 ABI"会把各后端**保证强度的差异抹平**（详见 §5）。
2. **唯一真正的方向性决策**：是否允许项目**声明**外部后端。今天被封闭 schema 挡住（`schemas/project-v3.schema.json` 的 `base.additionalProperties === false`），需要 schema 变更 + ADR。这是一个小决策，不是重构。
3. **两条红线**：APG 只**引用**外部状态、永不成为其权威；APG **不建 agent 注册表**（运行时实例身份归 runtime）——证据是 Agent Mail 无 `external_id`、可冒充、无 token 轮换，不该在其上建立身份权威。
4. **反直觉发现**：生态里被寄予厚望的两层恰好最弱——**claim 无 lease**（`br` 与原生 `bd` 都靠人工/启发式回收）、**文件锁是 advisory 且对代码文件不生效**（Agent Mail）。任务书 §5 问的两类冲突**在现成生态中未被真正解决**，因此建议把"文件/模块互斥"写成 **unsupported** 而不是承诺。
5. **最该做的三件小事**：新增**声明式 Capability Schema**（Native，最便宜、最有价值）、把 unsupported 的层**写成 unsupported**、把注入面的**层级假设改为拓扑中立**（`bootstrap/AGENTS.routing-block.md` **第 14 行**写死 parent/captain）。
6. **门槛**：在第二个真实后端 + 一个真实消费者出现前，**不写 adapter**。

调研方法披露：6 路外部调研由子代理并行完成；子代理侧 `web_search` 通道故障（`No available channel for model deepseek-v4-flash`），改用**只读** GitHub API / raw 原文取证，因此**无第三方交叉验证**，所有外部事实均为一手仓库/issue 证据。本报告未安装、未运行任何外部工具，未改动任何 APG 公共行为。

**已更正**：初版把 `bd` 与 `br` 并列成两个候选后端。经用户指出并核实（Agent Mail README "Important: Beads Rust (br) Replaces Beads Go (bd)"），**Flywheel 里的 `bd` 是 `br` 的向后兼容 shell alias**；`bd` 的"原生形式"是 Yegge 的 Go+Dolt 实现。详见 §3.1。
---

## 1. APG 现状九层盘点（证据优先）

判据：本节只写**当前代码/文档事实**，不写愿景。每条给出可核验位置。

| # | 层 | APG 当前 | 证据 | 判定 |
|---|---|---|---|---|
| 1 | Project Constitution | **有，且是核心** | `README.md` §2/§5/§7；`policy.root` / `policy.mandatory`（`.agent-project-guides.json`）；`roles/`、`procedures/`、`profiles/`、`overlays/`、`templates/`；单调优先级 `runtime/admin > operation/tool > project > facet/overlay > task/role/caller` | Native |
| 2 | Agent Identity & Role | **有"路由主体"，无"运行时身份"** | `routing/development.roles.jsonl`（5 role）、`routing/production.roles.jsonl`（2 role）；role 是 `(plane, role, mode)` 注册项。无 agent 实例 ID、无 agent 注册表、无 per-agent 状态；`plans/DEVELOPMENT_ROADMAP.md` §2 明确"不伪造人员身份""没有真实独立身份就只声称 peer review" | 语义层 Native / 实例层 无 |
| 3 | Capability Registry | **概念被占用，语义不同** | `apg provider capabilities` 返回的是 **provider 自身能力**：`["read","search","portable-export","source-observation","resolve","load","batch-load-v1","section-routes-v1","portable-import-revision-guarded"]`（实测）。这是"内容包读取能力 ABI"，**不是** MCP/CLI/Skill/API 的外部能力发现。`catalog/catalog.jsonl`（253 条）是**指导内容索引**，不是工具目录 | 名义冲突 / 实质无 |
| 4 | Task Management | **无，且是明示非目标** | `plans/DEVELOPMENT_ROADMAP.md` §1："APG 不成为通用项目管理平台、构建系统或多 Agent 编排器"；§5："普通 R0/R1 的任务状态保留在已有会话/issue/PR，不要求持久化新治理文件" | Reject（现状） |
| 5 | Communication | **无** | 全仓无 message/thread/channel/broker 代码；`templates/SUBAGENT_ASSIGNMENT.md` 只定义**父→子一次性提示词字段**（Plane/Role/Submode/.../Return format），且注明 "never write it into root instructions"，不是 agent 间通信协议 | Reject（现状） |
| 6 | Coordination | **无多 Agent 协调；只有自身协作式单写锁** | `docs/V2_CONTRACT.md` §Portable provider API：`provider import` 获取 shared project mutation lock；`lib/memory.mjs` promote 用 no-replace 原子创建。这是**APG 保护自己 descriptor/memory 不被并发写坏**的锁，不是给 agent 抢占源文件的机制 | Reject（现状） |
| 7 | Memory | **有，但窄且"评审制"** | `lib/memory.mjs`：`proposeMemory`（clone-local 排他创建）→ `reviewMemory`（要求非作者，绑定 project digest）→ `promoteMemory`（锁内重读 + atomic no-replace）→ `supersedeMemory`（新 ID）→ `purgeMemoryProposal`。`README.md` §8："机器日志不是 promoted memory"；更新必须新 ID | Native（窄定义） |
| 8 | Agent Lifecycle | **无，显式交给宿主插件** | `plugins/README.md`："Each plugin owns host API bindings, trusted loading, context placement, host-side readiness state, clarification UI, tool dispatch hooks, child/resume behavior"；`plans/DEVELOPMENT_ROADMAP.md` §2 同上 | Reject（现状） |
| 9 | Scheduling / Orchestration | **无，显式非目标** | `plans/DEVELOPMENT_ROADMAP.md` §1/§8："不搭建 ... 通用 adapter SDK"；调度/找活儿不在任何命令面 | Reject（现状） |

### 1.1 APG 真正拥有、且别家没有的东西（跨界能力）

九层之外，APG 的差异化在这五项：**context 装配**（bounded、budgeted、hash 校验、per-route）、**权威优先级与风险合成**（单调，R0–R3）、**证据与验证合同**（ready_for_verification / 非作者 / peer vs formal IV&V）、**内容身份**（digest / generation / manifest）、**延续性**（continuation 票据）。这五项都不依赖 agent 数量，且是任何 runtime 都不提供的。

### 1.2 量化的现状成本（用于后面的规模论证）

实测 `provider resolve`，每路由治理成本（`utf8-bytes/4` 上限估计）：

| 路由 | token 上限 | 载入 ID 数 |
|---|---|---|
| production/user `end-user` | 289 | 3 |
| production/operator `observe-health` | 390 | 4 |
| development/reviewer `static` | 812 | 9 |
| development/verifier `dynamic-verification` | 810 | 10 |
| development/field-evaluator `scenario-validation` | 915 | 10 |
| development/developer `feature` | 982 | 11 |
| development/maintainer `code` | 1632 | 15 |

即：**APG 的每轮治理开销是 0.3k–1.6k token 量级**。这个数字在 §5/§8 里是关键论据——它说明 APG 这一层**不是**多 Agent 场景的 context 瓶颈。

### 1.3 结构性约束（决定能不能"只声明外部后端"）

| 约束 | 事实 | 对融合含义 |
|---|---|---|
| descriptor 是**封闭** schema | `schemas/project-v3.schema.json`：`$defs.base.additionalProperties === false` | **今天无法**写 `communication_backend = agent-mail`；策略 C 需要 schema 变更 + ADR，不是纯配置 |
| `project:` authority registry **未实现** | `plans/PROVIDER_RUNTIME_EVOLUTION.md` §5.1 有完整设计（`project:` 命名空间、expected/observed hash、refresh-authority）；`plans/DEVELOPMENT_ROADMAP.md` §1.1 明确"继续待设计" | 外部后端声明最自然的落点是一个**尚未实现**的机制 |
| 对外接口极窄 | 外部 runtime 能调用的只有：`apg context --target --task [--plane --role --mode]`、`provider capabilities/resolve/search/load/export/import` | Architecture C 的"协议层"接口面**已经存在且很小**，这是有利事实 |
| 初始假设是"互信调用" | `README.md` §1：调用方负责目标/输入/权限/效果；"身份、ACL、审计、签名和隔离在真实边界需要时再增加" | 多 Agent 身份鉴权**不在当前承诺内**；跨机器/跨信任域的多 agent 协调超出 APG 当前信任模型 |

---

## 2. 四种策略与判据（先定规则，再套到具体项目）

| 策略 | 含义 | 采用条件 | APG 现有检验方式 |
|---|---|---|---|
| A. Native | APG 自己实现 | 属核心抽象 + 与项目语义强绑定 + 外部无法稳定表达 + 替换成本极高 | 有独立 oracle 与回归测试；行为改变走 Developer + ADR |
| B. Adapter | APG 定义统一 ABI，外部实现 | **优先考虑**；但必须有 ≥2 个真实后端或 ≥1 个真实消费者，否则 ABI 是按想象设计的 | 需要 fail-closed 负例（后端缺失/版本不符/半可用） |
| C. External | 完全不实现，只声明 | 该层与本项目语义正交，且失败可安全降级 | 声明必须进 schema；缺后端时行为必须显式 degraded，不能静默 |
| D. Reject | 明确不支持 | 与定位冲突，或收益不足 | 写进非目标，避免反复重新讨论 |

**关键补充判据（本报告新增）**：一个能力即使"外部有现成的"，也不自动变成 C。
因为把层交出去会产生三类**APG 独有的**新问题，必须一起回答，否则是伪解耦：

1. **权威性**：外部状态（如 issue tracker 里的 task）是"事实"还是"输入"？APG 的风险合成/验收门要不要读它？
2. **降级**：外部后端不可用（离线、版本漂移、agent 没装 CLI）时，受保护工作是否 fail closed？
3. **身份**：APG 的 `(plane, role, mode)` 是*路由主体*，外部系统的 agent id 是*运行时实例*。两者不是同一个东西，映射方向必须单向（APG 只做引用，不复制身份）。

---

## 3. 外部生态取证

### 3.0 一手证据：本机已部署的 AgentTeams 契约（非网络来源）

本次会话的 runtime 自身暴露 `agent_teams_*` 工具族，可直接读出**已落地**的契约，优先级高于公开文档：

| 机制 | 已部署事实 |
|---|---|
| 拓扑 | `agent_teams_create` 后**调用者成为 captain**，且"a captain leads **one team at a time**"——顶层有唯一中心 |
| 成员 | `agent_teams_add_member`：持久化可续跑成员，**snapshot 队长当前 LLM 路由**；成员默认等待消息、收到消息后工作一整轮 |
| 任务 | `create_task` 支持 **dependencies**："a task is only claimable once every dependency is completed"；未分配任务进 shared pool，"scheduler automatically claims one ready task for each truly idle member" |
| 认领租约 | `claim_task` 返回 **attempt_id**；"required for that member's updates and becomes stale after retry/reassignment" —— 即 **lease/CAS 语义**，防止迟到结果覆盖新 owner |
| 抢占 | `reassign_task`："The old attempt is revoked **before** its member is interrupted, so late updates cannot overwrite the new owner" |
| 通信 | 直接进收件箱（mailbox）；captain 在线时插件调度实时投递；"**No relay is involved**" |
| 身份 | 成员名在 team 内唯一；**无跨 team 全局身份**，也无文件/模块占用 |
| 隔离 | `reassign_task` 用 `assignee="captain"` 表示队长接管，而非新建 agent |

**判定**：AgentTeams 是**中心化编排**（captain + 自动 scheduler），不是 peer 网络。它提供了 Task / Dependency / Claim-lease / Messaging(mailbox) / 成员生命周期，**不提供** 文件锁、模块占用、项目宪法、记忆、跨团队身份。它是 APG **通信/任务层最接近的可复用现成实现**，但它的"中心"与任务书 §5 要求的扁平 peer 拓扑是**两种不同形状**。

**上游 vs 本机（必须区分的证据等级）**：公开文档（Claude Code Agent Teams，实验性）确认的是——lead 就是主 session 且**不可转让**；teammate **不能再生成 teammate**；一 session 一团队、无嵌套；官方唯一强制的并发原语是 **task 级 file locking** + 明确要求"**每个 teammate 拥有不同文件集**"（官方直接承认两个 teammate 改同一文件会 **overwrite**），并行会话用 **git worktree** 隔离。

**因此 `attempt_id` 不是上游概念**——它是本机宿主/插件的实现，属 **plugin-level、不可移植**，引用时必须标明。

### 3.1 br / bd — 任务后端（关键更正：Flywheel 里 `bd` 是 `br` 的别名）

**更正（用户指出，已核实）**：任务书把 `br` 与 `bd` 并列成两个候选后端，这在 **Jeffrey Emanuel 的 Agent Flywheel 语境下不成立**。Agent Mail README 原文：

> **"Important: Beads Rust (br) Replaces Beads Go (bd)"**
> "The installer automatically replaces `bd` (the original Go-based Beads CLI) with `br` (Beads Rust)… **creates a shell alias so that `bd` commands continue to work by redirecting to `br`**"
> "Both implementations use the same `.beads/issues.jsonl` format"

即 **Flywheel 装完之后敲的 `bd` 就是 `br`**；`bd` 只是向后兼容的 shell alias。真实的两份实现是：

| 路线 | 实现 | 语言 / 存储 | 状态 |
|---|---|---|---|
| **Yegge 原生**（即"原生形式"） | `gastownhall/beads`（原 `steveyegge/beads`） | Go + **Dolt**（v1.0 起） | 27.3k★，今日仍在推送 |
| **Jeffrey 冻结版**（Flywheel 实际使用的） | `Dicklesworthstone/beads_rust`，命令 `br` | Rust + **SQLite WAL + JSONL** | 1.1k★；作者自述**刻意冻结 "classic beads" 架构** |

**为什么会有这一份（作者原话，是理解两条路线的关键）**：

> "my **Agent Flywheel** System is built around beads operating in a specific way. As Steve continues evolving beads toward GasTown… our use cases have naturally diverged. The **hybrid SQLite + JSONL-git architecture** that I built my tooling around… is being replaced with approaches better suited to Steve's vision. Rather than ask Steve to maintain a legacy mode for my niche use case, I created this Rust port that **freezes the 'classic beads' architecture** I depend on. The command is `br` to distinguish it from the original `bd`."

→ **两条路线不是"两个可选后端"，而是已经分叉的架构**：Jeffrey 冻结 SQLite+JSONL 版本，Yegge 走向 Dolt / Gas Town。

**证据冲突（必须标注，不要据单一 README 下结论）**：
- Agent Mail README 称 "the original Go version is **no longer actively maintained**"，但 `gastownhall/beads` 今日仍在推送、27.3k★ —— **该说法不成立**（陈旧或营销表述）。
- Agent Mail README 称两者共享 `.beads/issues.jsonl` 且数据完全兼容；另一路取证却发现 `br` 与 `bd` v0.46 存在 schema/哈希分歧 → **互操作程度标为 unknown**。

**两份实现的具体事实**（保留前次取证，列头已按上面重新对应）：

| | **`br`**（Flywheel 的 `bd`） | **`bd` 原生**（Go + Dolt） |
|---|---|---|
| 存储 | Rust + **SQLite WAL**（FrankenSQLite）+ `issues.jsonl` | Go + **Dolt**（`.beads/embeddeddolt/`，默认单写者；或 server 模式多写） |
| 同步 | 源码级保证**不执行 git**；`sync --flush-only/--import-only/--merge/--reconcile`，pull 后自动导入 → **事实上的 git 原生** | `bd dolt push/pull` 到 git remote 的 `refs/dolt/data`，**cell 级三方合并** → **不是纯 git 原生**，可 `--stealth` 完全脱 git |
| 数据模型 | 近似字段集，纯本地 | type = bug/feature/task/epic/chore/**decision**；status = open/in_progress/blocked/deferred/closed；id = 哈希 `bd-a1b2`；epic 层级 `bd-a3f8e9.1`（≤3 层）；**依赖类型最丰富**（blocks/tracks/related/parent-child/discovered-from/until/caused-by/validates/relates-to/supersedes） |
| **claim** | `update --claim` 原子幂等；`claim_exclusive` 拒他人持有；**无 lease 字段**；reclaim 是**启发式**（updated_at 旧 + **查 Agent Mail 预约**，阈值 2h/1 天），要求**先写审计 comment 再 claim**；`coordination status` 只读、**永不自动回收** | `update <id> --claim`（= assignee + in_progress）**原子**；`ready --claim` 抢首条。**无 lease/TTL**；**assignee 是纯字符串，无 agent 注册表**（官方原话）；另有 merge-slot 独占锁；**回收靠人工** |
| ready / blocked | 本地计算（SQLite blocked cache）；`policy.yaml` 可自定义 ready 状态组 | 本地计算；`ready --explain`、`dep cycles`、mermaid |
| 可编程性 | 全命令 `--json`；**文档化退出码 0–8**；`br schema all --format json`；`--robot` 信封；可选 `br serve`（MCP stdio） | 全命令 `--json`；`BD_JSON_ENVELOPE` 带 `schema_version`；**无官方退出码表（unknown）** |
| agent 集成 | `agents --add` 写 AGENTS.md；**官方推荐工作流 = br 管任务状态 + MCP Agent Mail 管文件预约** | `init` 自动写 AGENTS.md + `setup codex/claude/cursor` + hooks；官方 `beads-mcp` |
| 规模 / 失败 | 已知（均已 closed）：`dep tree` 共享依赖图指数爆炸/内存耗尽（#392）、parent-child 制造假环（#391）、WAL-index 中毒需 `doctor migrate-schema recover`（#507）；仓库仅 2 open issues（**作者不收外部 PR**）；`SWARM_SCALE_TUNING` 面向 64 核/256GB | 设计文档自承 branch-per-worker："50 并发写者 100% 成功但**并发收益是幻觉**"，正迁事务化 shared main；1216 open issues（约 28 条 concurrency 相关） |

**对 APG 的含义**：
- Task / Dependency = **两者都是原生强项**；作为 APG Task Backend 的**可编程性足够**（全命令 `--json`，adapter 只读 status/assignee/deps，**无需碰内部 DB schema**）。
- **选型不是"选两个产品"，而是选一条已经分叉的架构路线**：要**冻结的经典架构 + 零 git 副作用 + 稳定退出码 + 单机** → `br`（也就是 Flywheel 里的 `bd`）；要**多机并发写 + 丰富依赖类型 + 工作流门禁 + 可服务化** → 原生 `bd`（Go+Dolt）。四条决策轴：① 是否允许常驻服务 ② 是否多机并发写 ③ 是否需要版本化 JSON schema 契约 ④ 能否接受自动 git hooks 与 Dolt 运维。
- **claim 只是"勉强"**：两者都**没有 lease/TTL**，回收靠人工或启发式——这一层外部并没有解决（解释了为什么 Agent Teams 要用 `attempt_id`）。
- **注意耦合**：`br` 的 reclaim 启发式**会读 Agent Mail 的预约**；所谓 "Jeffrey Flywheel" 不是可选插件集，而是**互相耦合的一组**（另有 `agentic_coding_flywheel_setup`、`beads_for_cass*` 等配套仓库）。


### 3.2 MCP Agent Mail — 传输层，不是身份权威

仓库 `Dicklesworthstone/mcp_agent_mail`（Python/FastMCP，**2150★，v0.3.4**，自述 "Under active development"）。**重要前提**：作者在 issue #242 明确 **Python 仓库是旧实现，维护主线是 Rust 版 `mcp_agent_mail_rust`**；PyPI 的 `mcp-agent-mail` 只有 0.1.0（约落后一年）。

| 维度 | 事实 |
|---|---|
| **身份** | 身份 = `project_key + name`（`Agent` 表唯一约束 `(project_id, name)`）。name 可显式指定稳定 ID（正则 `[A-Za-z0-9][A-Za-z0-9._-]{0,127}`），也可自动生成。**无 `external_id` 字段**——外部 ID 映射只能旁路（`WindowIdentity(project_id+window_uuid→display_name, TTL 30d)` 或 `IDENTITY_CONTRACT.md` 的 sha256(project)/tmux_pane 文本文件）。 |
| **消息** | `send_message(project_key, sender_name, to[], subject, body_md, cc?, bcc?, ack_required?, thread_id?, broadcast?, topic?)`。`thread_id` **可选、非强制**；`reply_to` 存直接父边；**subject 必填**；`broadcast=true` 展开全项目但 **best-effort**（跳过 retired/block_all，写入 `broadcast_skipped`）。 |
| **存储** | 双写：Git 可读 Markdown 归档 + SQLite FTS5 索引。这带来 **Git 审计性**，也带来**每请求约 120ms 的 libgit2 归档读**（作者确认未修）。 |
| **ACK** | 有但很轻：`ack_required` 布尔 + `acknowledge_message`（幂等，置 read_ts+ack_ts）。**逾期 ACK 扫描默认关闭**（`ACK_TTL_ENABLED=false`）。**无"已处理"语义、无送达保证**；README 建议用 Beads label 补偿。`fetch_inbox` 不改已读状态，`unread_only=true` 用于省 token。 |
| **文件预留** | `file_reservation_paths(project_key, agent_name, paths[], ttl_seconds=3600, exclusive=true, reason)`。粒度 = project-relative 路径或 glob（`fnmatchcase` 双向对称）；TTL 默认 3600s、最小 60s、过期自动释放。**冲突不阻塞**：文档原话 "reservations are still granted; conflicts are returned alongside grants"。**本质是 advisory**——服务端强制只覆盖**邮件归档路径**，**代码仓库文件不强制**，只能靠可选的 pre-commit/pre-push guard 补强。 |
| **项目隔离** | `ensure_project(human_key)`（绝对路径样 key → slug）；隔离是**逻辑级**：按 `project_id` 分行 + 每项目独立 Git archive，但**共用同一服务器进程与同一 SQLite 文件**。跨项目通信需 `AgentLink` 联系人审批（`CONTACT_ENFORCEMENT_ENABLED` 默认 true）。 |
| **规模** | 官方 benchmark：`send_message` 均值 **118.6ms**、P99 190.6ms、**8.4 ops/s**；`fetch_inbox` 39.3ms；`search_messages` 12.3ms；**`list_outbox` 3.83s**（作者标注待优化）。并发测试规模只到 **5/8/10/15 agents，且断言只要求 ≥70% 成功**——说明作者预期高并发会失败。10–35 agents 仅见于 Rust 线 issue #242。**100 agents 无任何实测**。 |
| **交互模型** | **主路径是轮询**（`fetch_inbox` + `since_ts`/`unread_only`，文档建议"每步 poll"）。可选文件信号通知（inotify/FSEvents）属 OS 文件层，不是 MCP 原生 push。 |
| **失败模式** | advisory 锁、conflicts 不阻塞、broadcast best-effort、非实时、无送达保证；**身份可冒充**（same-user 进程可读 `registration_token`，对已存在身份返回同一 token、**无轮换**、默认无 strict session 绑定，issue #259 请求被关闭）；`fetch_inbox` 在身份行重建后**静默返回 `[]`**；reconstruct 会重编号 agent id 使旧邮件静默孤儿（#247/#248）；SQLite 损坏 + reconstruct 循环（#242/#246）。 |
| **运维** | 单进程 FastMCP HTTP 服务（默认端口 8765，亦可 stdio），**需常驻**（提供 systemd/Docker 样例）；默认 SQLite，**无需额外 DB**；离线可用、无云依赖；Redis 仅可选限流。许可 = **"MIT License (with OpenAI/Anthropic Rider)"**——带附加限制，非纯 MIT。 |

**对 APG 的含义**：
- 可承担 **Communication Provider（传输层）**：异步消息、线程/reply_to、广播、FTS5 检索、附件、Git 审计归档、联系人 consent gate 都是**原生强项**。
- **`APG Agent ID ↔ Agent Mail ID` 映射可行，但只能单向引用**：Agent Mail 允许显式稳定 name，可把 APG ID 规范化后直接当 `name`、用 `project_key` 作命名空间；但它**没有 `external_id` 字段**，且**身份可冒充、无 token 轮换** → **身份权威必须留在 APG**，映射表由 APG 侧持有。
- **它不解决 Coordination**：文件预留是 advisory，且对代码文件不强制。这是任务书 §5"文件修改是否冲突"的核心答案——**Agent Mail 的 reservation 不能当作互斥锁**。
- ACK 强度不足（默认关闭逾期扫描、无"已处理"语义），所以 **ACK 不能作为验收门的基础**。

### 3.3 Gas Town / Gas City — 已发布代码，不是设计文章

- **关系（verified）**：`Beads`/`bd`（2025-10 发布，**跑在 Dolt 上的图 issue tracker**）是共同底座 → **Gas Town**（Yegge 2026-01-01 开源，Go/MIT，v1.0 已发布，**现已进维护模式**）= 跑在上面的多 agent 工作区管理器 → **Gas City**（同团队于 2026-04 抽出原语 `agent/bead/formula/rig/pack/event` 成为**编排构建器 SDK**，Gas Town 变成跑在它上面的默认 pack）。跨 town 联邦 = Wasteland（DoltHub）。
- **哲学（verified，作者自述）**：**中心编排 + lifecycle 管理**。Gas City 自称 **supervisor plane**，orchestrator 负责 spawn/stop/restart/**reconcile**；源码声明 **"hardcodes zero roles — no built-in manager"**。peer coordination 只出现在最上层的 Wasteland 联邦。
- **机制（verified）**：角色 Mayor（协调 + 人类接口）、Deacon（跨 rig 巡检）、Witness（每 rig 生命周期）、Dogs、**Polecats（临时 worker）**、Crew、Refinery（Bors 式合并队列）、Convoy（bead 分组）、Scheduler（并发闸）、Escalation（P0–P2）。指派 `gt sling` / bead claim；**Hooks = git worktree 持久化**（即工作隔离用 worktree）；**tmux 是默认且必需后端**（另有 subprocess/exec/ACP/k8s/herdr）；健康态 GUPP Violation / Stalled / Zombie / Working / Idle + nudge/handoff 恢复。
- **规模（作者声称，无独立实测）**：Gas Town README "20–30 agents"；yegge.ai 称 Gas City "hundreds of concurrent agents"；作者自述个人跑 50–60 agents、21 个 Claude Max 账号、约 **$122k/月**。
- **成熟度（verified）**：可真装——Go/MIT，`brew install gascity`；beads 有 install.sh/npm/PyPI。
- **失败模式**：中心单点（作者自述 Deacon 曾"连环杀害 worker"、Mayor 数据丢失的 "22-nose Clown Show"）；token 成本（"The AI Vampire"）；**沙箱不在范围内**；主要绑 Claude Code；**硬依赖 tmux + Dolt**。
- **与 "Agent Mail + br" 路线的关系**：属不同栈。`br` = Jeffrey Emanuel 的 Rust 移植 `beads_rust`；Agent Mail 亦有 Rust 版 `mcp_agent_mail_rust`；Yegge 栈内**自带 bead-based mail**。作者是否表态过 peer 路线：**unknown**（未找到原文）。

**对 APG 的含义**：**Architecture C 在技术上不是空想**——Gas City 有真实的 provider 抽象（subprocess/exec/ACP/k8s/herdr）可作为对接层，但它带来 **tmux 会话模型 + Dolt 依赖 + 中心 supervisor** 三项硬约束，且"hundreds of agents"只是声称。把它当"可适配后端"是**可行但高耦合**的选择。

### 3.4 beads_viewer (`bv`) — 图感知分诊 sidecar

- **形态**：**Go**（非 Rust）单二进制，TUI（Bubble Tea）+ CLI，**不是库**。输入 `.beads/` 下的 Beads JSONL（`issues.jsonl` 等）或 SQLite；输出 TUI / Markdown / 单文件 HTML / `--robot-*` JSON。
- **能力**：PageRank、Betweenness（Brandes，大图采样）、HITS、Critical Path（**最长依赖链的节点计数，不是工期**）、Eigenvector、k-core、割点、Slack、Tarjan SCC；复合 Impact 分（PR .22 + Betw .20 + BlockerRatio .13 + …）；Union-Find 并行 track + unblocks；`--robot-blocker-chain`。
- **机器可读性是设计核心**：`--robot-triage/plan/insights/next/priority/blocker-chain`，stdout 纯 JSON、stderr 诊断；`--robot-schema` 出 JSON Schema、`--robot-capabilities` 自描述；信封含 `data_hash`、`analysis_config`、**逐指标 `status(computed|timeout|skipped)`**、`source_authority.claim_safe`。
- **它自己划的边界**（重要）：README 明确 **bv 只决定"做什么"；创建/认领/关闭由 bd/br 负责**。即它是 triage engine，不是调度器，**不检测文件冲突、不分配 agent、不预留工作**。
- **锁的是数据格式而非 CLI**：同时支持 Go `bd` 与 Rust `br`，但换一个非 Beads 任务后端则完全不可用。同作者另有 Rust 端口 `bvr`（成熟度 unknown）。
- 成熟度：1690★/145 fork，近 30 天约 583 commits，MIT + OpenAI/Anthropic Rider。
- 限制：大图自动降级（≥500 节点 betweenness 采样；密度 ≥0.01 跳过；≥2000 节点跳过环检测），**必须查 `.status`**，否则会把 timeout 的空结果当成"已算出"。10k issue 单次峰值 RSS ≈1.9GB。

**对 APG 的含义**：作为 **Planning Provider 是可行的**（critical path / 排序 / blocker 分析 = 原生强项，接口形态就是机器读 JSON CLI），但"并行工作发现"只是**分组**而非调度。**关键警告**：它是 Beads 数据格式的 sidecar，**不能独立接入**——采用它等于同时采用 Beads 作为任务后端，这不是插件式可替换关系。

### 3.5 CASS = Coding Agent Session Search — 纯 transcript 索引

- **身份**：`Dicklesworthstone/coding_agent_session_search`，**Rust，alpha，v0.9.0，1136★**，当日仍活跃。（不是 "Session Server"。）
- **索引对象**：26 家 agent 的 session 存储（Claude Code `~/.claude/projects`、Codex `~/.codex/sessions`、Cursor、Gemini、Aider、Copilot、Goose 等），归一为 Conversation→Message→Snippet。
- **检索**：词法 BM25（Tantivy/自研）+ SQLite FTS5 影子回退；语义为**本地 MiniLM 384 维向量**（FSVI，默认暴力精确）；RRF 融合 + cross-encoder 重排。粒度为 message/snippet。
- **接口**：CLI `--robot/--json`（含 `--robot-schema` 式自描述与 golden JSON 契约）；**核心不含 MCP server**（README 里的 MCP 指同作者另一个项目 mcp_agent_mail）。
- **不碰项目事实**（决定性的正面证据）：纯 transcript 索引；"SQLite 是被索引会话与消息的 source of truth"，一切派生资产可重建、都不权威。作者把"事实/程序性记忆"放在**另外两个项目**（`cass_memory_system`、`eidetic_engine_cli`）。
- 隐私：本地优先、查询不联网、索引期默认脱敏，但**原始 session 与 raw-mirror 仍明文落盘**。
- **风险（影响采纳判断）**：已知 issue 集中在自研存储层 `fsqlite`——大 archive 卡死在 preparing、索引死锁、FTS5 全量入内存导致 wedge、**OOM（967k 消息 ≈13.4G RSS/16GB）**、btree 反复损坏；README 警告 agent **绝不裸跑 `cass`**（会启 TUI）。

**对 APG 的含义**：可承担 **Historical Memory Provider（证据层）**，且正好补上 APG 明确不做的"session 全文检索"。但它是 **alpha 且有存储层稳定性问题**，只能作为**可替换的只读证据源**接入，绝不能成为项目事实/spec/decision 的权威源——这与 APG 现有 `lib/memory.mjs` 的"评审制 + 不把机器日志当 promoted memory"完全一致，属于**语义兼容而非冲突**。

### 3.6 peer 规模证据（10 / 30 / 100）

*（外部校准已并入：第 6 路调研已完成。以下为六路一手取证 + 本报告自有模型；§1.2 实测数字作基线。）*

**已取证的实际规模证据**：

| 来源 | 规模事实 | 证据强度 |
|---|---|---|
| Agent Mail（官方 benchmark） | `send_message` 均值 118.6ms、**8.4 ops/s**；`list_outbox` 3.83s | verified |
| Agent Mail（官方并发测试） | 只覆盖 **5/8/10/15 agents**，且断言**只要求 ≥70% 成功**——作者预期高并发会失败 | verified |
| Agent Mail（社区真实负载） | **10–35 agents**（仅见于 Rust 线 issue #242） | verified（单点） |
| Agent Mail | **100 agents 无任何实测** | unknown |
| 原生 `bd`（官方设计文档） | 自承 branch-per-worker："**50 并发写者 100% 成功但并发收益是幻觉**"，正迁事务化 shared main | verified |
| `br` | `SWARM_SCALE_TUNING` 面向 **64 核 / 256GB** 单机 | verified |
| Gas City | 声称 "hundreds of concurrent agents"（**无独立实测**）；Gas Town README 写 20–30 | 声称，未验证 |
| Yegge 个人 | 50–60 agents、21 个 Claude Max、约 **$122k/月** | 自述 |
| Agent Teams（本机已部署） | 一个 captain 领**一个** team；任务 claim 带 `attempt_id`（**plugin-level，非上游概念**） | verified（一手） |

**读法**：**10–30 agents 是有旁证的现实区间；100 agents 在本次取证范围内没有任何实现给出实测**，只有声称。这直接支持 §6.4 的"先别建 ABI"门槛。

**自有模型**：n 个 peer agent 每轮各产生 p 条消息，每条 t token。

- 广播式：每轮消息数 `n(n-1)`；n=10 → 90，n=30 → 870，n=100 → **9900**。无向链路数 `n(n-1)/2` → 45 / 435 / **4950**。
- 每 agent 每轮收件箱读取成本 `(n-1)·t`；取 t=200：n=10 → 1.8k，n=30 → 5.8k，n=100 → **19.8k token/轮**。
- 累计 R 轮：`R·(n-1)·t`。n=100、t=200、R=10 → **每 agent 仅"读消息"就 198k token**，工作上下文之外。

**但这只证明"广播"会崩，不证明"peer"会崩。** 改为定点点对点后，每 agent 每轮成本 `k·t`（k 常数）——**与 n 无关**。再改为"共享状态 + 拉取"：每 agent 只读**自己的投影**（我的 ready 任务、我的阻塞），成本 O(1)，产生 O(1) 次写入。

**结论（分层判断，按危险性排序）**：

| 顺序 | 层 | 崩的原因 | 真正的解法 | 是否靠消息解决 |
|---|---|---|---|---|
| 1 | 文件/模块冲突 | 多 agent 改同一文件，冲突随交集增长 | **工作分区**（模块所有权 / 每 agent worktree） | **不能**——消息再多也不解决写冲突 |
| 2 | context/消息成本 | 广播式 fan-out O(n²) | 点对点 + 共享状态拉取 + 摘要聚合 | 部分 |
| 3 | task claim 冲突 | 并发 claim 同一任务（lost update） | **lease/CAS + fencing token** | 不能，要存储层支持 |
| 4 | 隐性中心节点 | 只有"存在 hub **agent**"时才崩；star 拓扑下 lead 是状态化、有 context 上限的瓶颈 | 用**无状态共享状态**替代 hub agent | 不能 |

**关键量化对照**：APG 的每轮治理成本实测 **0.3k–1.6k token**（§1.2），**低于 n≥10 广播式的一轮收件箱成本（1.8k）**。即在多 Agent 场景里，**"读项目规则"比"读同伴消息"更便宜**——APG 这一层不是 context 瓶颈，瓶颈在传输拓扑与写冲突。

**newcomer / 崩溃恢复**：peer agent 是易失的，恢复靠**持久且自描述的共享状态**。newcomer 需要的三样是 (1) 角色/规则路由、(2) 任务状态、(3) 近期历史。(1) 已被 APG 解决——`profiles/CONTENT_PACKAGE.md` §6 cold-start acceptance 明确要求"fresh agent 任务必须找到 descriptor、exact release、一条权威 route 和一个相关 section，且不加载全量语料"；这本质上就是治理层的 newcomer 协议。(2)(3) 分别落在任务后端与历史检索层。官方证据也指向同一结论：新 teammate 会加载 CLAUDE.md/MCP/skills，但**不继承 lead 历史**。

**外部校准（一手文档 + 论文）**：

| 结论 | 证据 |
|---|---|
| **10 agents 能跑，先崩 context/成本与 claim**，不是消息量 | Claude Code 官方承认同文件会 overwrite |
| **30 agents 先崩 context 成本**，次崩 claim/文件冲突 | agent ≈ **4×** chat token、多 agent ≈ **15×**；token 单独解释某基准 **80%** 性能方差；请求落在主对话 cache TTL 桶外（默认 5 分钟）→ 缓存复用下降 |
| **100 agents 扁平全连接不可行**（4950 链路） | MacNet 千级改用 DAG、OASIS 百万级靠推荐筛消息 |
| 裁拓扑确有收益（实测） | 稀疏拓扑性能持平或更好且成本更低；分组合议 token ↓51.7%；AgentPrune $43.7→$5.6、token ↓28.1–72.8% |
| **只有租约不够，必须配 fencing token** | 进程被 GC 暂停超过租约即出现两个写入者（Kleppmann） |
| **多 Agent 系统普遍脆弱** | MAST：1600+ trace、7 个 SOTA MAS 失败率 **41%–86.7%**（不读他人输入、隐瞒信息、任务脱轨）；责任 agent 定位仅 **53.5%**、责任步 14.2% |
| 大团队倾向涌现 lead | Guimerà 2005 *Science*：以团队规模/新人比例/重复合作为参，大团队趋向 lead 结构 |
| 实践侧共识 | Anthropic："**3 个专注队友胜过 5 个分散的**"、反对全文广播、改用**文件产物 + 轻量引用**；Cognition：多 agent 协作只会得到 fragile 系统 |

**两套排序要分开说**（本报告与外部证据唯一需要调和处）：

- **按"多快先出问题"**：`context 成本 ≥ 消息量 > 文件冲突 > 中心节点`。context 先爆，但它**可观测、可定价、可缓解**（裁拓扑即省 28–79% token）。
- **按"多危险 / 多难恢复"**：**文件冲突第一**。它是**最早的确定性静默损坏**，也是官方唯一证实的 overwrite 模式；再叠加"租约过期 + 无 fencing token ⇒ 两个写入者"。
- 上面分层表用的是第二种判据（危险性），此处补第一种判据（发生顺序）。

### 3.7 其他明显相关的 peer-agent 基础设施

| 项目 | 中心 / 扁平 | 任务后端 | 消息后端 | 成熟度 |
|---|---|---|---|---|
| **A2A**（Google Agent2Agent） | **扁平 peer** | 有：9 状态 Task、`tasks/get`、resubscribe | 有：Message + SSE | 高，25.8k★ |
| **AGNTCY ACP + SLIM** | **扁平 peer** | 有：`/runs`、`/threads` | 有：SLIM | 中，168★ **停滞** |
| LangGraph supervisor / swarm | 中心 / 扁平但 handoff 串行 | 无 | 无 | 高，41.9k★ |
| AutoGen GroupChat | 混合：pub/sub + Manager 排定轮次 → 名义扁平**实质中心** | 无 | 有：topic/subscription | 高，61k★ |
| OpenAI Agents SDK（含 Swarm） | 中心：单 active agent + 整段历史 handoff | 无 | 无 | 高，29.5k★，**Swarm 停更** |
| claude-flow / Ruflo | 名义 swarm，实为 Router + queen | 有：MCP + memory DB | 有：federation | **低**，改名频繁 |
| MCP Tasks 扩展 | 非 agent 拓扑 | 有：状态机 + TTL（过期可删，恢复有界） | 无 | 高 |
| MCP Agent Mail | 扁平 | 无 | 有 | 中（见 §3.2） |
| Beads（`br` / 原生 `bd`） | 扁平（**无状态共享状态**） | **有** | 无 | 高（见 §3.1） |
| Claude Code Agent Teams | 控制 star + 消息 mesh | 有：task list（file locking claim） | 有：mailbox | 实验性（见 §3.0） |

**要点**：**A2A / AGNTCY ACP 提供了协议级的"扁平 peer + 任务状态"，但和 Beads 一样都只给 task 状态，不给 claim/租约** —— 与 §3.1 结论一致：**"带 fencing 的租约"是整个生态的共同空白**。对 APG 是好坏各半：好消息是不必急着绑定某个实现；坏消息是这一层没有现成件可复用，**谁做调度谁就得自己解**。

---

## 4. Capability Matrix

图例：**原生** = 该层是该项目的核心强项；**勉强** = 能做但有明确缺口；**无** = 不提供；**只读** = 只给分析不给状态变更。

| Capability | APG 当前 | `br`（Flywheel 的 `bd`） | `bd` 原生 Go+Dolt | bv | Agent Mail | CASS | Gas City | 建议 |
|---|---|---|---|---|---|---|---|---|
| **Task** | 无（明示非目标） | **原生** | **原生** | 只读（明确不建/不认领） | 无 | 无 | **原生**（bead） | **External**：选的是**架构路线**（Jeffrey 冻结版 vs Yegge 演进版），不是两个产品 |
| **Dependency** | 无 | **原生** | **原生**（类型最丰富） | **原生**（图分析） | 无 | 无 | 原生 | **External** |
| **Messaging** | 无 | 无（仅 task comment/审计） | 无 | 无 | **原生** | 无 | 自带 bead-based mail | **External**（Agent Mail 或 runtime mailbox） |
| **Identity** | 仅 `(plane,role,mode)` **路由主体**，无实例 | `assignee` 纯字符串，**无 agent 注册表** | 同左（官方明说无注册表） | 无 | `project_key + name`，**无 external_id、可冒充、无 token 轮换** | 无 | 有实例（生命周期管理） | **分层**：角色/主体命名空间 = APG Native；**运行时实例身份 = runtime**，APG 不建注册表 |
| **File Lock** | 仅保护自身 descriptor/memory 的协作锁 | 无 | 无（有 merge-slot 独占，非文件锁） | **明确不检测文件冲突** | **advisory 预留，代码文件不强制** | 无 | git **worktree 隔离**（不是锁） | **Reject**：不假装有锁；用 worktree/模块分区替代，APG 显式声明 unsupported |
| **Memory** | **原生**（窄：propose→非作者 review→no-replace promote） | 任务历史/audit | 任务历史 | 无 | 逐项目 Git 归档（消息历史） | **原生**（26 家 session，BM25+本地向量） | 无 | **分层**：项目事实 = APG Native；session 历史 = CASS External（只读证据）；消息历史 = Agent Mail |
| **Capability Registry** | **无**（`provider capabilities` 是*内容包读取能力*，语义不同） | `schema all --format json` / `capabilities` | JSON envelope + schema_version | `--robot-capabilities` | MCP tool list（协议自带） | `--robot` 自描述 | provider 抽象（subprocess/exec/ACP/k8s/herdr） | **APG Native** —— 新增、最便宜、最该做；但**必须用独立命名空间**（勿与既有 `provider capabilities` 撞名） |
| **Lifecycle** | 无（显式交宿主插件） | 无 | 无 | 无 | 仅 MCP session 绑定 TTL 24h | 无 | **原生**（spawn/stop/restart/reconcile + 健康态 + nudge/handoff） | **External**（runtime）；AgentTeams 亦有 member/interrupt/reassign |
| **Scheduling** | 无（明示非目标） | `ready` 计算 + `ready --claim` | 同左 + molecule/swarm/capacity | 排序/关键路径（**只建议，不预留**） | 无 | 无 | **原生**（Scheduler 并发闸 + `gt sling`） | **External**：APG 不实现；bv 只能当 advisor |
| **Project Rules** | **原生强项** | `init` **会写 AGENTS.md** | `init` **会写 AGENTS.md** + hooks | 无 | 无 | 无 | pack/formula | **APG Native**，但**必须处理写入冲突**（见 §6.3） |

**矩阵读出的三个反直觉结论**：

1. **"外部的"并不都成熟**。被寄予厚望的两层恰好是最弱的：**claim 无 lease**（br/bd 都靠人工或启发式回收）、**文件锁是 advisory 且对代码文件不生效**（Agent Mail）。任务书 §5 问的"task claim 冲突 / 文件修改冲突"**在现成生态里没有被真正解决**。
2. **CASS 与 APG 不是竞争而是互补**，且方向明确：CASS 索引 transcript、明确可重建、不主张权威；APG 的 memory 是评审制项目事实、明确拒绝把机器日志当权威。两者边界天然吻合。
3. **bv 不是可插拔的**：它锁的是 Beads **数据格式**而非某个 CLI。选它 ⇒ 必须选 Beads 系任务后端。这是"格式级 vendor lock-in"，比 CLI 级更难换。

---

## 5. 三套候选架构

评价维度按任务书 §8。**"规模"一节引用 §1.2 实测**：APG 每轮治理成本 0.3k–1.6k token。

### Architecture A — APG Full Stack

APG 自己实现任务库、依赖图、消息、线程、ACK、文件锁、lifecycle、调度，并把 memory 扩成 session 全文检索。

| 维度 | 评价 |
|---|---|
| 实现量 | **极大**。相当于在 34MB / ~3k 行 Node 核心之上，重建 beads + agent-mail + supervisor + session index 四套系统。参照：**只做消息+预留**的 Agent Mail 已到 v0.3.4 仍有 SQLite 损坏、`list_outbox` 3.8s；**只做索引**的 CASS 仍有 OOM 与 btree 损坏。 |
| 长期维护成本 | **无上限**。协调层 bug 本质是分布式 bug（时序、并发、恢复），是最难维护的一类。 |
| vendor lock-in | 最差——自造 lock-in，且无外部生态分担。 |
| 可替换性 | 最差（无处可换）。 |
| Agent 数量扩展 | **未验证**，且要自己实现 lease/CAS/锁——而外部实现这一层也只是"勉强"。 |
| 多 CLI / 多模型兼容 | 理论最好（无宿主绑定），但工作量大到会拖垮其它价值。 |
| offline 能力 | 最好（完全自包含）。 |
| distributed 能力 | 需自建同步协议（Dolt 级难度）。 |
| debug 能力 | 最难。 |
| **判定** | **Reject**。除成本外，还**直接违反已接受的项目决定**：`plans/DEVELOPMENT_ROADMAP.md` §1「APG 不成为通用项目管理平台、构建系统或多 Agent 编排器」。 |

### Architecture B — APG Control Plane（推荐）

APG 只保留 **项目语义 / 角色语义 / 能力声明 / Context Assembly / 策略与证据**；任务、消息、历史检索、lifecycle、调度全部外部。

| 维度 | 评价 |
|---|---|
| 实现量 | **小**：一段声明式 schema + 校验 + fail-closed 负例 + 文档。**无新运行时**。 |
| 长期维护成本 | **低**，但需跟踪后端版本漂移（bd 刚迁 Dolt + 仓转移；br 不收外部 PR；CASS 仍 alpha）。 |
| vendor lock-in | **低**：APG 只**引用**，不依赖后端内部 schema（br/bd 均可只读 `--json` 的 status/assignee/deps）。 |
| 可替换性 | **高**：后端可换，只要 JSON CLI 面稳定。 |
| Agent 数量扩展 | **APG 不是瓶颈**（实测每轮 0.3–1.6k token，低于 n≥10 广播式一轮收件箱成本）；上限由所选后端决定。 |
| 多 CLI / 多模型兼容 | **好**：保持 ADR-0005 的 harness-neutral。 |
| offline 能力 | **好**：APG 自身离线可用；外部后端缺失时按既有 `package_missing` 惯例显式降级 / fail closed。 |
| distributed 能力 | **不在 APG 范围**（显式声明，交给后端或 runtime）。 |
| debug 能力 | **好**：APG 层是确定性的、可哈希、可 diff。 |
| **判定** | **推荐**。且注意：这**不是转向**，而是把 `README.md` §1/§5/§7 与 roadmap §2 已经写下的边界**显式化**，再补一个声明式面。 |

### Architecture C — APG Meta Adapter

APG 几乎成为纯协议层，同时接 Jeffrey stack（br+bv+Agent Mail+CASS）、Gas City、Claude Agent Teams 与未来 runtime。

| 维度 | 评价 |
|---|---|
| 实现量 | **中→大**：N 个 adapter + N 套 fail-closed 契约测试，且要**持续跟** 4–6 个快速演进的上游。 |
| 长期维护成本 | **高且被动**：上游破坏性变更直接砸到 APG 的 ABI 表面。 |
| vendor lock-in | 名义最低。**实质风险更高**：见下方"隐藏差异"问题。 |
| 可替换性 | 名义最高，实质最低（容易退化成 union type / 最低公分母）。 |
| Agent 数量扩展 | 与 B 同级，但多一层抽象与不确定语义。 |
| 多 CLI / 多模型兼容 | 好。 |
| offline 能力 | 中（取决于后端）。 |
| distributed 能力 | 中（Gas City 有 Wasteland）。 |
| debug 能力 | **差**：多一层 adapter，故障归因变难。 |
| **判定** | **条件性后续**，保留为北向目标，现在不建设。 |

**C 的致命问题——"中立 ABI"会隐藏保证强度差异**。三个族的原语集并不兼容：

```text
Beads 族      : 持久图存储 + 原子 claim（无 lease）+ 人工/启发式回收
Agent Mail 族 : advisory 文件预留（代码文件不强制）+ 无任务概念
Agent Teams   : 中心 captain + 自动 scheduler + attempt_id lease + mailbox
Gas City      : supervisor plane + git worktree 隔离 + 硬依赖 tmux/Dolt
```

交集只有 `{task id, dependency, status, claim, message}` —— **恰好把各方最有价值的部分（worktree 隔离、lease、supervisor 健康态）切掉了**。于是选 Gas City 的项目与选 Agent Mail 的项目会得到**保证强度完全不同**的协调能力，而统一 ABI 会把这种差异**抹平成同一个接口**。这比"显式声明差异"更危险。而且外部证据显示这种差异是真实存在的：Gas City 有 worktree 隔离，Agent Mail 只有 advisory。

### 附：Peer 拓扑（任务书 §5）的独立判定

- **目标形态 `A ↔ B ↔ C + 共享项目` 与现有生态的形状不匹配**：官方先例 Claude Code Agent Teams 是 **控制层 star + 消息层 mesh**（lead 固定不可转让、teammate 不能再生 teammate、一 session 一团队）；Gas City 是 supervisor plane；Agent Mail 是 peer 传输但没有共享任务权威；**Beads 提供无状态的共享状态，是唯一真正贴合 peer 形状的组件**。
- **规模**：10–35 agents 有旁证；**100 agents 无任何实测**（见 §3.6）。扁平全连接在 100 级不可行（4950 链路）。
- **消息不会爆炸，除非广播**：点对点 + 共享状态拉取后每 agent 成本与 n 无关；裁拓扑实测可省 28–79% token。
- **最早确定性静默损坏的是写冲突**，而写冲突**不能靠消息解决**；官方给出的答案是"每个 agent 拥有不同文件集"与 git worktree，**不是锁**。
- **两个排序要分开**：按发生顺序 context 先爆（可观测、可缓解）；按危险度写冲突第一（静默、不可逆）。见 §3.6。
- **claim/租约是生态共同空白**：A2A/ACP 只给 task 状态；`br` / 原生 `bd` 都无 lease；Agent Teams 上游也没有——**谁做调度谁就得自己解，且必须带 fencing token**。
- **APG 现有一个 peer 障碍**：注入到每个消费者根文件的 `bootstrap/AGENTS.routing-block.md` 第 14 行写死 "missing/conflicting authority goes to **parent/captain**"——这是**层级假设**。扁平拓扑下可能不存在 parent/captain。（见 §6.3 proposal 5）


## 6. 推荐架构边界

### 6.1 边界（推荐）

APG 拥有（Native）：

```text
Project Schema        descriptor + 封闭 schema + digest 身份        （已有）
Agent Role Schema     (plane, role, mode) 路由主体                  （已有）
Project Policy        单调优先级 + 风险合成 + protected effects      （已有）
Context Assembly      bounded / budgeted / hash 校验 / per-route     （已有，护城河）
Evidence & Contract   ready_for_verification / 非作者 / peer vs IV&V（已有）
Continuation          续接票据与 generation                         （已有）
Capability Schema     ★ 新增：声明"外部能力 + 后端绑定"（声明式）    （新，小）
Backend Reference ABI ★ 新增：极小的引用面，只够"指认"不够"操作"     （新，小）
```

交给外部 / runtime（不实现）：

```text
Task / Dependency 存储   → `br`（Flywheel，其 `bd` 是它的别名）或原生 `bd`（Go+Dolt）；按架构路线二选一
消息 / 线程 / 广播        → Agent Mail，或 runtime 自带 mailbox
session 历史检索          → CASS（只读证据层）
Agent lifecycle / 调度    → runtime（Gas City / Agent Teams / harness）
文件与模块互斥            → ★ 不交给 Agent Mail（advisory，对代码文件不强制）；
                             用 worktree 隔离或模块分区，APG 显式声明 unsupported
                             带 fencing token 的 claim 租约同属生态空白，一并声明 unsupported
```

**两条不可越界的红线**：
1. **APG 只引用外部状态，永不成为外部状态的权威。** 任务状态的事实源在后端；APG 只在证据/变更记录里写 `task_ref`。
2. **APG 不建 agent 注册表。** 运行时实例身份归 runtime；APG 只拥有"角色/主体"这一**声明式命名空间**。理由有直接证据：Agent Mail 无 `external_id`、可冒充、无 token 轮换，**任何**中间层都不该把身份权威建立在它上面。

### 6.2 最小 ABI 面（如果采用 B）

不要做成插件 SDK（roadmap §8 已明确"不搭建通用 adapter SDK"）。只需要够"指认 + 失败可控"：

```text
backends[] {
  id            命名空间化标识（避开既有 provider capabilities 语义）
  kind          task | messaging | session-history | runtime
  requires      CLI/版本/服务可用性前提
  availability  声明 vs 观测（沿用 APG 既有 intended / host-observed 区分）
  fail_closed   缺后端时是否阻断受保护工作
}
refs            仅三种引用：task_ref / agent_ref / session_ref
```

即：**APG 需要的是"引用"和"降级策略"，不是"生命周期钩子"。**

### 6.3 需要用户决策的点（proposal，均未实施）

| # | Proposal | 为什么需要你定 |
|---|---|---|
| 1 | **是否允许在项目配置中声明外部后端**（今天不可能：`schemas/project-v3.schema.json` 的 `base.additionalProperties === false`） | 这是**唯一真正的方向性决策**。它需要 schema 变更 + ADR，属于公共契约变化 |
| 2 | 落点选在**尚未实现**的 `project:` authority 机制（`PROVIDER_RUNTIME_EVOLUTION.md` §5.1），还是另开字段 | 影响既有未实现规划的收敛方式 |
| 3 | 命名空间用什么（避免与既有 `provider capabilities` 撞名） | 契约面命名，改名成本高（APG 有读别名惯例） |
| 4 | 是否接受"文件/模块互斥"作为**显式 unsupported** | 决定要不要承诺一个生态里根本没解决的能力 |
| 5 | 是否把 `bootstrap/AGENTS.routing-block.md` 第 14 行的 **parent/captain 层级假设改为拓扑中立** | 小改动，但直接影响 peer 模式能否成立；且分发给所有消费者，走发布流程 |
| 6 | `br`/`bd` 的 `init` **会写 AGENTS.md**（APG 的 `policy.root`）——谁拥有哪个 block | 不定义就会互相覆写；`bootstrap/` 已有 managed block 惯例可复用 |

### 6.4 门槛（建议写进 ADR 的 stop condition）

**在出现第二个真实后端 + 一个真实消费者之前，不写任何 adapter。** 否则 ABI 是按想象设计的——而本次调研显示想象与现实的差距很大（例如"Agent Mail 有文件锁"的流行说法，实际是 advisory 且对代码文件不生效）。

### 6.5 对"是否重大思路变化"的回答

**不是重大转向，主要是显式化。** 任务书设想的 Architecture B/C 与 APG 已接受的决定（ADR-0005 harness-neutral、roadmap §1/§2/§8）**方向一致**，差别只在"是否允许项目**声明**外部后端"这一点上——而这一点今天被封闭 schema 挡住，是**一个需要 ADR 的小决策，不是一次重构**。

真正值得调整的是三件小事：**新增一个声明式 Capability Schema（Native）**、**把 unsupported 的层写成 unsupported 而不是留白**、**把注入面的层级假设改成拓扑中立**。


## 7. Agent Flywheel 全景（Jeffrey Emanuel 整套 AI 运行方案）

本章是应"研究范围应为这位作者的全套方案"而新增。**权威来源**：`https://agent-flywheel.com/tldr`（自述 "16 core tools and 24 supporting utilities"）+ 各仓库 README + GitHub API，2026-09-19 只读抓取。原始 40 工具清单与 84 条 synergy 已存 `.agent-scratch/flywheel-research/flywheel-tools-raw-inventory.md`（**临时工作产物，非长期口径**）。

### 7.1 规模与前提（决定"能不能融合"的硬约束）

| 项 | 事实 |
|---|---|
| 工具数 | **40**（16 core + 24 supporting），全部在 `Dicklesworthstone` 组织下 |
| 真实体量 | **≈16,881★** 合计。**页面自述 "5,600+" 严重过期**；页面 per-tool 星数亦不可用（DCG 页 89 vs 实际 6005；ACFS 234 vs 1645；且 9 个支持工具页星数**全是 156**，属占位/渲染错误） |
| 目标环境 | **全新 Ubuntu VPS**（≥22.04，安装器自动升到 25.10；亦支持 Arch/Omarchy；**明确不支持 macOS/Windows**），**tmux 为硬依赖** |
| 硬件 | 最低 32GB/250GB/12 vCPU；推荐 **48–64GB/300GB+/16 vCPU**（每 agent ≈2GB） |
| 成本 | 自述 **$440–656/月**（VPS $43 + Claude Max $200 + ChatGPT Pro $200…） |
| 凭据 | Claude API key、Codex 登录、Antigravity、`gh auth`、云 CLI——**多个付费订阅（含 6 个 agent CLI）** |
| 命名漂移 | `wezterm_automata` → **`frankenterm`**；`simultaneous_launch_button` → **`slb`** |

### 7.2 分层（40 工具归位）

| 层 | 工具 |
|---|---|
| 会话管理 | NTM、CASS、CASR、PFR、frankenterm |
| 通讯协调 | **Mail**、Brenner |
| 任务依赖 | **BV**、**BR** |
| 静态分析 | UBS |
| 记忆检索 | **CM**、**EE**、**MS**、XF、FrankenSearch |
| 上下文/压缩 | TRU、**S2P**、PCR、MDWB、CSCTF、FMD、AADC |
| 安全审批 | **DCG**、**SLB** |
| 多仓同步 | RU、RCH |
| 安装运维 | **ACFS**、ASB、SBH、SRPS、PT、DSR |
| 生命周期/调度 | **CAAM**、PI |
| 可观测/其它 | RP、RANO、CAUT、APR、JFP、GIIL |

（**加粗** = 与 APG 有实质对位关系的 11 个；其余 29 个是纯运维/工具，与治理无关。）

### 7.3 运行模型（一条任务的完整流转，均出自 README，verified）

```text
ACFS 装好 35+ 工具 + 6 个 agent CLI
  → NTM 在 tmux pane 里 spawn agent（子进程，非容器；cc/cod/agy/grok/omp）
  → agent 自动注册 Agent Mail（NTM 预分配身份 + canonical identity file + AGENT_NAME）
        人类有专属身份 "HumanOverseer"
  → br ready --json                    # 看可做的活
  → bv --robot-triage                  # 图论排序：先解瓶颈
  → br update <id> --claim --json      # 领取（原子，但无 lease）
  → file_reservation_paths(reason="br-123")   # 预留文件
  → send_message(thread_id="br-123", subject="[br-123] Start: …", ack_required=true)
  → 干活：命令先过 DCG 拦截；危险命令走 SLB 双人审批
  → 提交：pre-commit guard 校验预留（可 fail-closed exit 2）
  → br close + release_file_reservations
  → CASS 索引本次 session → CM/EE 沉淀记忆 → BV 更新瓶颈视图
```

### 7.4 关键机制（与 APG 对位时最要紧的几条）

- **NTM（运行时）**：`[resilience]` auto_restart / max_restarts / health_check_seconds / crash_threshold；指数退避；`ntm health/kill/scale`；checkpoint/restore；rate-limit 退避；`ntm coordinator enable auto-assign` 常驻 daemon；`--stagger` 默认 **90s** 错峰（因为 `read→claim` **非原子**会撞车）；`--worktrees` **opt-in**（默认共享同一目录）。
- **SLB（风险分级 + 审批）**：四级 SAFE / CAUTION（30s 自动）/ DANGEROUS（1 批准）/ **CRITICAL（≥2 批准、永不自动）**；40+ 正则；**解析失败升一级**；批准绑定**命令 SHA-256 哈希 + TTL**；`min_approvals`/dynamic_quorum；守护进程是 **NOTARY 而非执行者**（命令在调用方 shell 跑）；**不可用时危险命令 fail-closed**；默认禁自批。
- **DCG（命令守卫）**：各 CLI 原生 PreToolUse hook，50+ packs/17 类，allowlist + 审计，逃生口 `DCG_BYPASS=1`。
- **EE（记忆，全套里最成熟的一件）**：每 workspace 一个 `.ee/ee.db`；typed memory（fact/decision/rule/anti-pattern/evidence_span）；**trust class 阶梯** `.85 human_explicit > .75 peer_human_attested > .65 agent_validated > .50 agent_assertion > .45 cass_evidence > .30 legacy_import`；**提案制** `curate apply/accept/reject/snooze/merge` + **No Silent Memory Mutation**；`--max-tokens` / adaptive_budget / **task lens** / `--memory-scope` 六档 + `--strict-scope` / `--redaction` 五档 / `--as-of`；`pack` 确定性 hash（Lean4 证 `pack_determinism`）+ `ee pack replay`；**`ee export agentsmd` 只写 marker 限定的 managed block、改前备份、`ee diag agentsmd-drift` 做漂移审计**。
- **CM（记忆，自动沉淀）**：episodic(借 CASS) → working(diary) → procedural(playbook + 置信度 + **90 天半衰期**)；MCP 5 工具（agent **可写** feedback/outcome/reflect）；**无人工审批门**，去重与失效全自动；**已知架构性 bug #76：`cm reflect` 曾把自己子进程 transcript 当工作 session 摄入 → 自我评分回路**。
- **MS / CASS 的"包契约"**：MS `ms load --pack 800 --contract <name>`（required groups / weights / max-per-group + progressive disclosure）；CASS `pack --max-tokens/--max-evidence/--max-sessions/--max-freshness`；CASS 明确 "relevance is not correctness"、trust 只作 advisory **不改排序**。

### 7.5 它**没有**的东西（与 APG 对位的决定性缺口）

调研结论（子代理原话可核）：**"有项目级规则，但没有角色/权威模型——persona 只是 per-pane system prompt 与座位标签，不携带权限；所有权限都落在工具门（审批、守卫、label 白名单、agent 配额），不挂在主体身份上。"**

具体缺失：
1. **无 role → authority**：没有"某角色不得降低某 effect"这类单调约束。
2. **无签名者身份 / 无 quorum 的身份绑定**：EE 的 review 是"谁跑 CLI 谁批"；`peer_human_attested` 只证明"某成员声明过"。
3. **无证明链**：没有 APG 那种 `intended / host-observed / model_effective` 的观测分级。
4. **宪法是提示而非约束**：全栈把记忆当 advisory context；唯一"强制"是 DCG（命令级安全）与 guard（预留冲突），**都不是项目规则强制**。
5. **无跨 harness 契约**：绑 Ubuntu + tmux + 特定 CLI；APG 是 harness-neutral。
6. **标签当授权边界**：`[assign] operator_gated_labels` 把 tracker label 当权限门——这是**用工具产物承载权威决策**的权宜做法。

---

## 8. APG ↔ Flywheel：能不能融合或覆盖

### 8.1 先定性：两者是**正交**的，不是同一层的竞争者

| | Agent Flywheel | APG |
|---|---|---|
| 本体 | **运维/执行栈** | **声明式项目治理契约** |
| 设计单位 | 「我 + 我的机器 + 我的 agents」 | 「任意项目 + 任意 harness + 任意 agent」 |
| 交付形态 | 往一台全新 Ubuntu VPS 上装 40 个工具 | 一个 pinned 内容包 + 一条只读 context 路由 |
| 治理观 | **工具门（capability）**：权限挂在**命令/标签/配额**上 | **主体权威（authority）**：权限挂在 **plane/role/mode + 项目 policy** 上 |
| 强制力 | 有（DCG/SLB/guard 能 fail-closed） | **无**（纯声明，不拦截任何东西） |

**一句话**：Flywheel 解决"**怎么把很多 agent 高效跑起来、少互相踩**"；APG 解决"**谁有权做什么、凭什么、规则改了什么、证据够不够**"。两者不是竞品，而是同一条流水线的前后两半。

### 8.2 逐层对位

| APG 层 | Flywheel 对应 | 关系 | 判定 |
|---|---|---|---|
| 1 Project Constitution | AGENTS.md（人/agent 显式写）+ `policy.yaml` + **PCR 压缩后强制重读 AGENTS.md** + **EE `agentsmd` managed block + drift 审计** | **冲突点**：至少 3 个写入者 | **融合**，但必须先定块所有权（见 8.4-①） |
| 2 Agent Identity & Role | NTM pane/agent 类型（cc/cod/agy）、persona、CAAM 账号、Mail 自动注册名、**HumanOverseer** | 它是**运行时实例身份**，APG 是**角色语义** | **融合**（APG 定角色/读取范围；NTM 管实例；自动注册是它的强项，APG 不建注册表） |
| 3 Capability Registry | **MS**（技能：SQLite+Git、BM25+语义、UCB bandit）、JFP（远端 prompt）、MCP tool list | 形态重叠、语义不同 | **并存**：APG 只**声明**（且用独立命名空间），不实现 |
| 4 Task Management | **br**（`bd` 是它的别名） | APG 明示非目标 | **交给它**，APG 只引用 `br-*` |
| 5 Communication | **Mail**（Rust v0.3.36、45 tools、ACK 已增强：`acks pending/remind/overdue`、delivery receipt） | APG 完全没有 | **交给它** |
| 6 Coordination | Mail **advisory** 预留 + pre-commit guard（可 fail-closed，但 `--no-verify` 可绕、archive 缺失时 fail-open）+ NTM 文件冲突检测 + 90s stagger + opt-in worktree | **它也承认没根治** | **双方都不假装**：APG 显式 unsupported |
| 7 Memory | **CASS**（只读索引）/ **CM**（自动沉淀、无审批门）/ **EE**（提案制 + trust ladder）/ MS | **EE 与 APG 语义兼容**；CM 相反 | **分层融合**：项目事实/评审 = APG；历史检索/注意力 = CASS/EE；**不采纳 CM 作权威** |
| 8 Agent Lifecycle | **NTM**（spawn/restart/health/checkpoint）+ frankenterm + CAAM + PFR/CASR | APG 明示不做 | **交给它** |
| 9 Scheduling | NTM `coordinator auto-assign` + `ntm work triage` + BV robot-plan + **label 授权门** | 它用 label 权宜地承载了授权 | **交给它**；但"label 作授权边界"正是 APG 角色/风险语义该补的缺口 → **融合点** |
| ★ Context Assembly | EE `pack`/task lens/adaptive_budget、CASS `pack`、MS `--pack/--contract`、S2P、TRU、FMD、FrankenSearch | **最大重叠区** | **融合且必须定权威**（见 8.3） |
| ★ Risk / Authority | **SLB 四级 + DCG**（命令级、可 fail-closed） | 互补：APG 定**要求**，SLB 做**执行期强制** | **融合**（见 8.3） |

### 8.3 三个重叠热区，各自的归属裁定

1. **Context Assembly（最像、也最容易打架）**
   - Flywheel 的 `pack`/`lens`/`--max-tokens`/`pack contract` 与 APG 的 `route + section budget` **形式同族**。
   - 但目标不同：**EE/MS 解决"哪些历史与技能可能相关"（检索 + 注意力经济）**；**APG 解决"哪些权威内容必须进、且可复现"（强制 + 身份）**。
   - **裁定**：APG 决定 **mandatory / 权威 / 预算上限 / hash**；EE/MS 在其**之外**补检索候选。二者可串联，但**不得互相替代**。
2. **Risk / Authority（分层最干净）**
   - SLB 是**命令正则的 4 级**；APG 是**项目 effect 的单调合成 R0–R3**。
   - **裁定**：**APG 产出"要求"（哪些 effect 需要几方批准），SLB/DCG/NTM 是唯一能"强制"执行的地方**。注意 SLB 用的是哈希绑定命令、而 APG 的分类是"需求而非授权"——两者语义天然吻合。
3. **Memory（语义兼容 vs 语义相反）**
   - **EE 与 APG 同源**：提案制（`curate accept/reject` ≈ review）、trust ladder（≈ 来源等级）、managed block + drift 审计（≈ 宪法一致性）、确定性 pack hash（≈ 内容身份）。**EE 是全套里最接近 APG 记忆哲学的一件**。
   - **CM 与 APG 相反**：自动沉淀、无审批门、agent 可写、且已知自我评分回路 bug。
   - **裁定**：**APG 保留"项目事实 + 评审 + 不把机器日志当权威"**；CM 一类只作提示性上下文；CASS/EE 出候选与溯源。

### 8.4 融合的三个具体接缝 + 四条不要做

**融合接缝（都很小，且多数不需要新代码）**：

1. **AGENTS.md 块所有权协议**（最紧迫，已有 3 个写入者：APG 的 managed marker、`br agents --add`、EE 的 `export agentsmd`）。EE 的模型最接近 APG（marker 限定 + 改前备份 + `--force-managed-block` + `diag agentsmd-drift`），可直接作为协商基础。
2. **APG context 路由作为 Agent 的第一读**：NTM 已经要求 agent 先 ack AGENTS.md/plan/Beads 再动代码，PCR 还会在压缩后强制重读 AGENTS.md——这里是**天然插槽**，且 APG 的 bootstrap 本就是 prompt-level，无需插件。
3. **最小引用面（`task_ref` / `session_ref`）**：Flywheel 自己就用 `[br-123]` 当邮件主题与预留 reason，APG 的证据/变更记录引用同一编号即可，无需 adapter。

**不要做**：

1. **不要用 APG 覆盖 Flywheel 的运维/运行时**（NTM/ACFS/CAAM/RCH/RU/UBS/DCG/…30 个工具）。那等于把 APG 变成 VPS 运维平台，与 `plans/DEVELOPMENT_ROADMAP.md` 的非目标直接冲突。
2. **不要让 CM 式自动记忆进入 APG 的项目事实层**（无审批门 + 自我评分回路）。
3. **不要把 SLB 的命令级四级当作项目风险策略**（正则无法表达"项目 effect 不得被降低"）。
4. **不要现在写 adapter**：门槛不变——第二个真实后端 + 一个真实消费者。

### 8.5 结论：**融合（Fusion），不是覆盖，也不会被覆盖**

- **覆盖（APG 取代整套 Flywheel）→ 否**。40 个工具里 29 个是纯运维/执行，与治理无关；APG 覆盖它们＝放弃自己的定位。
- **被覆盖（Flywheel 取代 APG）→ 否**。Flywheel **没有主体权威模型**：权限全挂工具门，无 role→authority、无签名者身份、无观测分级、宪法只是提示。这正是 APG 唯一的、且已被市场验证过的空地。
- **融合 → 是，且是"窄接缝融合"**：
  ```text
  Flywheel = 执行面（跑起来、强制住、别互踩、记得住）
  APG      = 权威面（谁有权、凭什么、规则与证据的合约）
  接缝      = AGENTS.md 块所有权 · context 首读插槽 · task_ref/session_ref 引用
  ```
- **对 APG 的净行动**：不需要新增运行时，也不需要现在做 ABI。真正该做的是**把 §6.3 的 6 项 proposal 收敛**——其中第 6 项（AGENTS.md 块所有权）因为 Flywheel 的 3 个写入者而**从"小问题"升级为"最紧迫"**。


---

## 9. 让步方案对比（未决策，供选择）

> 用户提出"我们可以为此放弃 APG 为其让步"。本节把"让步"拆成 5 个可独立决策的档位做对比。**全部未实施**，不删任何东西。

### 9.0 先更正成本口径（依据用户质疑）

**更正**：初稿引用的 "$440–656/月" 是**作者个人的总开销**，不是这套工具的门槛。拆开看：

| 项 | 真实成本 |
|---|---|
| 40 个工具本体 | **$0，全部开源免费**（无 license 费） |
| 云主机 | $29–43/月 —— **只在租云主机时才发生**；本地部署 = $0 |
| AI 订阅 | 作者自述 "Don't bottleneck a **$400+/month AI investment** to save $20 on hosting" —— 那是**他自己买 Claude Max/ChatGPT Pro 的钱**，不是工具要求 |

**本地部署的真实构成**：工具 $0 + 主机 $0 + 模型访问**取决于你自己的路由**（你已有 sub2api/gpt-6-astra，可以不自建订阅）。**所以"付费订阅"这条不成立，我的转述不严谨。**

**但本地部署有三个真门槛（不是钱的问题）**：

1. **内存**：每 agent ≈2GB，10–20+ agent 需 **48GB+**（作者推荐 48–64GB）。这是本地化的真正瓶颈。
2. **ACFS 安装器不支持 Windows/macOS**。FAQ 原文："*It's not designed for macOS or Windows… **For local development, use the individual tools directly**.*" —— 即**本地部署的正路是不用 ACFS，逐个装工具**（ACFS 检测到 `is_wsl()`，WSL 会被识别但不是设计目标）。
3. **tmux 是硬依赖**（NTM 的核心；索引器跑在 tmux 会话里）。

**两条安全提示**：
- ACFS `--mode vibe` = **免密 sudo + 危险 agent flag**，作者的理由是"$5 一次性 VPS 上没什么可保护的"。**在自己机器上绝对不要用 vibe 模式。**
- NTM 支持 `~/.config/ntm/agents/*.toml` 自定义 agent 类型并可传 `--model/--thinking/--append-system-prompt` → **接你自己的模型路由是正路**，"必须买订阅"不是技术约束。

### 9.1 五个档位对比

| 维度 | **0 不动** | **1 最小让步**（只让非核心层） | **2 中档**（降为薄适配层） | **3 冻结/归档** | **4 全面转向 Flywheel** |
|---|---|---|---|---|---|
| APG 保留 | 全部现状 | descriptor · 角色语义 · **权威合成** · 证据/验收合同 · 项目 memory · context assembly | descriptor · 角色语义 · 外部引用面（**让掉 context assembly 与记忆**） | 只读存在，不演进 | 无（停用） |
| 让给 Flywheel | 无 | 任务/依赖(br) · 消息(Mail) · lifecycle/调度(NTM) · 记忆检索(CASS/EE) · 文件协调 | 再加上 **context assembly(EE/MS)** 与 **项目记忆** | — | 全部 |
| **失去什么** | 无 | **无不可替代项**——让掉的都是 APG 早已声明不做的 | ★ **护城河**：bounded/hash 可复现的 context 装配；评审制项目事实 | 演进能力（仍可用） | ★★ **权威面全部无人承接**（Flywheel 无 role→authority、无签名者身份、无观测分级） |
| 得到什么 | 无 | 与 Flywheel 的对接面清晰；9 消费者零迁移 | 与 EE/MS 不再重叠；维护面最小 | 维护成本归零 | 直接吃下 40 工具的执行力 |
| 落地成本（一次） | 0 | 低：**一份块所有权协议 + 文档** | 中：要重写 context/记忆相关契约与测试 | 低：打 tag + 冻结说明 | **高**：9 个消费者全部重做治理；且要换运行平台 |
| 持续成本 | 现状 | 低 | 低 | ~0 | 高：跟 40 个高速演进的上游 + tmux/VPS 运维 |
| 对 9 个消费者 | 无影响 | **无影响**（pinned 3.0.7 继续） | 需重新适配（治理面缩小） | 保持 pinned，**不升级** | 全部迁移，且**迁移目标缺少权威层** |
| 可逆性 | — | **最高**（什么都没删） | 中（契约改了） | **高**（不删仓，可复活） | **低**（消费者已迁走） |
| 主要风险 | 继续维护一个无外部采用的系统 | 几乎无 | 丢掉唯一差异化 | 沉没投入被冻结 | 环境迁移 + 非 OSI 许可 + 权威空洞 |
| 该选的触发条件 | 还想继续演进 | **想降低重叠、但保留差异化** | 已确认要长期靠 Flywheel 且接受失护城河 | 已决定不做，但想留退路 | 已决定全面押注 Flywheel 且接受权威层空缺 |

### 9.2 一条与档位无关的硬约束（许可证）

上一轮已核实：核心组件 8/8 是 **NOASSERTION = "MIT License (with OpenAI/Anthropic Rider)"**（非 OSI；rider 把"代表 OpenAI/Anthropic 行事者"列为 Restricted Party，并把 benchmarking/evaluation harness 也纳入 "use" 定义）。

**无论选哪档（0 除外），都必须遵守**：Flywheel 组件**不能进入 APG 的分发面**（APG 现在向 9 个仓库分发内容包）。它们只能是**用户自行安装的外部依赖**。这条约束反过来**支持档位 1**（只声明、不捆绑），**反对档位 4**（全面转向会把非 OSI 许可靠进消费者）。

### 9.3 我的判断（明确给出，但决定权在你）

- **档位 4 目前没有证据支持**：放弃 APG 换不到它现在提供的东西，而且 9 个消费者会落到一个**没有权威层**的平台上。
- **档位 2 是"看起来折中、实则最亏"**：让掉 context assembly 与记忆，等于把 APG 唯一被验证过的差异化（bounded/hash 可复现的上下文 + 评审制事实）交出去，而 EE/MS 解决的是**检索与注意力**，不是**权威与可复现**——那两件事交出去就**没人做**。
- **档位 1 有证据支持**，而且证据来自 APG 自己：这些层它早就声明不做（`plans/DEVELOPMENT_ROADMAP.md` §1/§2/§8）。所以档位 1 **不是让步，是把早该划的线划实**。
- **档位 3 是合理的退路**，不是失败：若你判断"权威面"暂时没有真实需求，冻结比硬撑更诚实；且**可随时复活**。
- 若一定要给建议排序：**1 > 3 > 0 > 2 > 4**。

### 9.4 若选档位 1，落地只需要三件事（都不改运行时）

1. **AGENTS.md 块所有权协议**（最紧迫：现有 3 个写入者——APG managed marker、`br agents --add`、EE `export agentsmd`）。
2. **明确 unsupported 清单**：文件/模块互斥、claim 租约、lifecycle、调度——写进文档，不再留白。
3. **最小引用面**：`task_ref`(`br-*`) / `session_ref` 进证据与变更记录；**不写 adapter**。


---

## 10. 三方对照：Flywheel × DSH 插件记忆 × APG，以及"只补缺口"的可行边界

> 用户提出两个新前提与一个新方向：① 已在 **24GB 上跑 7 个 agent**（内存不是门槛）；② **WSL 里服务走 HTTP 直接接**，本地部署；③ 安全靠**本地 only + 限制性 SSH + 外围 SSH 挡住**；④ **"让 APG 只提供这套成熟方案中没有覆盖的地方"**。本节据此重算边界。

### 10.1 DSH 插件记忆（Mnemon）的实际形态（本机只读实测）

| 层 | 事实 | 作用域 |
|---|---|---|
| **热记忆** | `.mnemon/runtime/memories.json` → 投影为 `MEMORY.md` / `USER.md`，**每轮注入**；容量管理（user 4096B / memory 10240B），满时自动归档+压缩 | `storageScope: workspace`；**`runtimeUserScope: global`**（实测：工作区 `USER.md` 为 **0 字节**，真身在全局） |
| **Documents** | `.mnemon/documents/`，字段含 `id/title/description/status/contentHash/revision/sourcePaths/sessionIds/memoryBodyIds/lastAccessedAt`，有 active/archived | workspace |
| **Memory Spaces** | provider-backed 持久洞察 + 图关系 + recall/forget/link | **当前 `total: 0`、`providers: []` —— 该层未启用** |
| 策略 | `auto-capture`（**关闭**）、`scoped`（开）、`light-context`（开） | settings.yaml |
| 记忆任务模型 | `newapi / deepseek-flash`（廉价模型） | settings.yaml |

**实测证据**：本研究进行中，Mnemon 的 `scoped` 策略**自动把本报告抓成了一篇 Document**（`apg-multi-agent-control-plane-ef9d12e4.md`，17.6KB，`sourcePaths` 含本报告与 scratch 清单，created 12:26 / updated 12:40）。说明该层**是活的且自动**。

### 10.2 三套记忆的真正差别不在功能，在**作用域与担责**

| | Flywheel（CASS / CM / EE / MS） | DSH Mnemon | APG（`lib/memory.mjs`） |
|---|---|---|---|
| 写入方式 | CM **自动沉淀**；EE **提案制**（`curate accept/reject`） | **自动**（scoped 策略实测自动建文档） | **评审制**：propose → **非作者** review → no-replace promote → supersede 用新 ID |
| 作用域 | 单机（EE 有 workspace/swarm/team 信任边界） | **workspace**（+ USER 全局） | **项目内，随 clone 走** |
| 能否跟着项目走 | ✗ 绑机器/账号 | ✗ 只在这台机器的这个工作区 | **✓ 是项目产物的一部分**（无机器路径，不含 generic Markdown） |
| 谁担责 | CM：无人（自动）；EE：**谁跑 CLI 谁批** | 无人（自动） | **非作者评审者**，且绑定 project digest |
| 权威地位 | 一律 advisory context（CASS 明说 "relevance is not correctness"） | 工作记忆 | **项目事实**（且明确"机器日志不是 promoted memory"） |

**结论**：DSH 记忆与 Flywheel 记忆覆盖的是**"我在这台机器上的工作记忆与检索"**；APG 记忆覆盖的是**"这个项目的事实，且有人担保、能随项目分发"**。**两者不是替代关系，是作用域不同的两层。** 砍掉 APG 记忆 ≠ 被 Mnemon 覆盖，而是**"随项目走的那一层"消失**（`runtimeUserScope: global` 只是用户级偏好，不是项目契约）。

### 10.3 "只补缺口"的缺口清单（能力 × 覆盖方）

| 能力 | Flywheel | DSH / Mnemon | APG | 缺口？ |
|---|---|---|---|---|
| 任务 / 依赖 / claim | **br + bv**（claim 无 lease） | 宿主有 attempt_id | — | 已覆盖（租约仍空） |
| 通信 / 线程 / ACK | **Mail** | 宿主 mailbox | — | 已覆盖 |
| Lifecycle / 调度 | **NTM** | 宿主 subagent/teams | — | 已覆盖 |
| 历史 session 检索 | **CASS / EE** | — | — | 已覆盖 |
| 热工作记忆 | CM | **Mnemon 热记忆（每轮注入）** | — | 已覆盖 |
| 自动知识沉淀 | CM / EE | **Mnemon Documents（自动）** | — | 已覆盖 |
| 技能 / prompt 管理 | **MS / JFP** | 宿主 skill 目录 | — | 已覆盖 |
| 上下文**检索候选** | EE pack/lens、MS pack contract | `light-context` 策略 | — | 已覆盖 |
| **主体权威合成**（role→authority，低层不得降低高层 effect） | ✗ persona 不携带权限；SLB 是命令正则 | ✗ | **✓ R0–R3 单调合成** | ★ **缺口** |
| **项目-owned policy 的可复现身份**（descriptor digest + managed marker + 内容 hash） | △ EE 有 managed block/drift，但无跨界分发身份 | ✗ | **✓** | ★ **缺口**（部分） |
| **证据与验收合同**（非作者评审 / peer vs formal IV&V / ready_for_verification） | ✗"谁跑 CLI 谁批" | ✗ | **✓** | ★ **缺口** |
| **观测分级**（intended / host-observed / model_effective） | ✗ | ✗ | **✓** | ★ **缺口** |
| **跨 harness 契约**（harness-neutral + pinned release） | ✗ 绑 Ubuntu+tmux+特定 CLI | ✗ 绑 DSH | **✓** | ★ **缺口** |
| **随项目走、经评审的事实** | ✗ | ✗（workspace 级） | **✓** | ★ **缺口** |
| 文件/模块互斥 · claim 租约 | advisory（可 `--no-verify` 绕 / fail-open） | — | ✗ | **三方都没解决** → APG 声明 unsupported，不假装 |

→ **"只补缺口"后 APG 的剩余范围就是表格下半部分那 6 项**，且它们**全部属于同一类**：权威、合约、可复现身份。

### 10.4 但"只补缺口"有一个结构性风险，必须先立组织原则

**风险**：缺口集合本身**不自带内在统一性**——照字面执行，APG 会退化成一堆互不相干的补丁（一个 policy 文件 + 几条角色说明 + 几个校验 + 一份证据模板），既说不清"我是什么"，也守不住边界，下一轮很容易被再次蚕食。

**建议原则（可写进 ADR）**：

> **接口不变式**：凡是"**谁有权、凭什么、规则与证据的合约**"的缺口 → 归 APG；
> 凡是"**如何检索、如何记忆、如何跑起来**"的 → 归执行栈（Flywheel / 宿主）。
> 判据：**该能力是否需要"人的担保"或"跨机器可复现"。需要 → APG；不需要 → 执行栈。**

这条原则的价值是可**自我检验**：按它过一遍 10.3 的表，下半部分 6 项全部命中（都是担保或可复现），上半部分全部排除。且它能解释为什么这 6 项不是巧合，而是**同一件事的六个侧面**。

### 10.5 对用户三点前提的回应

| 你的前提 | 我的核对 |
|---|---|
| 24GB 跑 7 个 | **接受**。48–64GB 是作者对"10–20+ agent"的推荐值，不是硬门槛；非官方实测（Agent Mail 社区 10–35 agents）。你说 7 个已在跑，那内存不构成约束。 |
| WSL HTTP 直接接 | **成立且更省事**。Flywheel 的 MCP 服务本来就是 **HTTP-only**（Mail 为 HTTP-only FastMCP；CM 也是 HTTP-only、无 stdio），在 WSL 上起常驻 HTTP 服务、客户端直连，比走 ACFS 更贴合——而且作者对本地部署的原话就是"**直接用单个工具**"。ACFS 可整段跳过。 |
| 安全靠本地 only + 限制性 SSH + 外围挡住 | **方向对，但有两条网络隔离挡不住**：① ACFS `--mode vibe` 做的是**免密 sudo + 危险 agent flag**，这是本机权限问题，不依赖网络；② `DCG_BYPASS=1` 与 guard 的 `--no-verify` 是**本机绕过通道**。网络隔离能挡外部，挡不住本机误操作。建议：**不装 ACFS 的 vibe 模式**，并在 policy 里把这两个逃生口列为受监控项。 |

---

## 11. 记忆层 token 审计，与随之确定的三条边界（2026-09-19）

> 本节回应两件事：用户要求「审计重复 token 消耗，特别是记忆」；以及随后的三条决定——检索引擎交给现成外部组件、记忆必须随项目走、APG 应掌握外部组件装配与 AGENTS.md 的控制。

### 11.1 审计口径

- 只对 **每轮注入** 计费。可搜索、按需加载的不计入——不调用就不花钱，这是公平口径。
- token 为 **启发式估计**：CJK × 0.9 + ASCII ÷ 3.8（本机无 tiktoken）。字节与字符数为实测值。
- 会话总账按 S 个模型步数展开；缓存命中按约 1/10 作敏感性假设，**非实测**。

### 11.2 每轮固定前缀（实测）

| 来源 | 字节 | CJK 字 | est tokens/轮 |
|---|---:|---:|---:|
| 工作区 `.mnemon/runtime/MEMORY.md` | 4,446 | 839 | ≈1,194 |
| 全局 `~/.mnemon/runtime/USER.md` | 2,170 | 493 | ≈626 |
| `AGENTS.md` v2 注入块 | 1,706 | 0 | ≈448 |
| **合计** | **8,322** | | **≈2,268** |

对照：APG 单次路由上下文 289–1,632 tokens ⇒ **每轮固定前缀 ≈ maintainer 路由（1,632）的 1.4 倍**。

**消费者侧实测（13 个仓）**：12 个消费者用 **v3 块**，块大小 **731–758 B ≈ 192–199 tok**；只有 APG 自身用 **v2 块，1,705 B ≈ 448 tok**——**包源仓的注入块比任何消费者大 2.3 倍**。全仓合计每轮 ≈ **2,784 tok**（各会话各付一次，不是并发叠加）。

| 会话步数 S | 无缓存 | 缓存 ≈1/10（假设） |
|---:|---:|---:|
| 20 | ≈45k | ≈6.6k |
| 50 | ≈113k | ≈13.3k |
| 100 | ≈227k | ≈24.9k |

缓存救不了全部：前缀每轮重发，且 **记忆一变，整个前缀缓存失效**。

### 11.3 重复面盘点（下表为**清理前**状态，即被审计的对象）

| 事实 | 仓库权威原文 | 每轮注入的副本 | 重复 |
|---|---|---|---|
| 3.0.7 精简发布/票据 | README + `.agent-scratch/ticket64-release/` | MEMORY 条目 1 | **是** |
| harness-neutral 核心 | `decisions/0005-harness-neutral-core.md` | MEMORY 条目 2 | **是** |
| 建议箱机制 | `templates/SUGGESTION_BOX.md` + PACKAGE_ADAPTATION 第 8 节 | MEMORY 条目 3 | **是** |
| 文案语言约定 | roles/procedures | MEMORY 条目 4 | **是** |
| 40 工具融合调研 | 本报告 | MEMORY 条目 5 + Mnemon Document | 部分 |
| Flywheel 本地部署前提 | 无 | MEMORY 条目 6 | 否 |

6 条里 **4 条是"已完成工作的摘要"**，正是记忆协议自己列明不该存的 `completed-work log`。已按此清理（见 11.10），但**新增的决定条目把释放的空间又占了回去**——真正的净省在于：把决定落成 ADR 后，记忆只留一行指针。

### 11.4 关键更正：`docs/memory` 是**检索式**，不是注入式

上一轮本报告曾说 APG 记忆"写有读无"，方向不准确。用户更正：`docs/memory` 从设计起就是**检索**。核实成立：

| 证据 | 说明 |
|---|---|
| `docs/V2_CONTRACT.md:31` | 只声明 "excluded from **release distribution files**"——说的是**打包面**，不是不可读 |
| `plans/REVIEW_FINDINGS.md:73` | 有"§6 memory 记录索引"，设计上靠**索引**寻址 |
| `decisions/0004:59` | ADR 正文直接引用 `docs/memory/finding.h1.*` ⇒ 靠**交叉引用**寻址 |

准确表述：**检索面只到"文档级"，没到"工具级"。** CLI 只有 5 个写动作（`scripts/apg.mjs:866-878`），**无 `list` / `show` / `search`**。

**顺带发现的不一致（已实测确证，非推断）**：排除规则有两条且不相同——`lib/core.mjs:184` 按**目录**排除 `docs/memory`（打包面），而 `lib/catalog.mjs` 的 `CONTENT_ROOTS` 只按**扩展名**收 `.md`。

实测：在探针目录放入 `docs/memory/probe-memory-record.md` 后执行 `apg catalog build --source <dir>`，该文件**被收录**为 `kind=reference`、id `reference:memory/probe-memory-record`（连其二级标题也各自成条目）。即：**同一个目录，既被排除又被收录，取决于扩展名。**

复现（30 秒）：

```bash
P=$(mktemp -d); mkdir -p "$P/docs/memory"
printf '# Probe\n\n## S\n' > "$P/docs/memory/probe.md"
node scripts/apg.mjs catalog build --source "$P"
python3 -c "import json;[print(json.loads(l)['path']) for l in open('$P/catalog/catalog.jsonl')]"
```

补检索面前必须先钉死这条。

### 11.5 Flywheel 四件记忆：只有一件是注入，且只有一个受控小块

| 组件 | 模式 | 证据 |
|---|---|---|
| **CASS** | **纯检索** | transcript 索引，可重建、不权威；"relevance is not correctness"，trust 只作 advisory 不改排序 |
| **CM** | **纯检索** | episodic→working→procedural，90 天半衰期；MCP 5 工具按需调用；无审批门；bug #76 自我评分回路 |
| **EE** | **检索 + 一个受控注入块** | `--max-tokens` / task lens / `--memory-scope` 六档 / `--strict-scope` / `--as-of` / 确定性 `pack` hash + `pack replay` ⇒ 检索；**唯一注入是 `ee export agentsmd`——只写 marker 限定的 managed block**，改前备份 + `diag agentsmd-drift` 漂移审计 |
| **MS** | **纯检索** | `ms load --pack 800 --contract <name>`，progressive disclosure |

⇒ **CASS / CM / MS 三件全检索；EE 也只有一个小块注入。** 所以"APG 不整表注入记忆"**不是 APG 自创的约束，而是整套生态的共同形状**。

**对位结论**：APG 的 `docs/memory` 与 EE **同形**（提案/评审 + 检索 + 极小受控块），差别在**强度**——EE 的 review 是"谁跑 CLI 谁批"，APG 要求**声明的非作者 + project digest 绑定**，APG 是更严的那一版。缺的只是 EE 那张**检索控制面**。

### 11.6 决定一：检索引擎交给现成外部组件（不造轮子）

这条**正是 §9.1 档位 1 已写好的内容**：档位 1「APG 保留」含 **项目 memory**（记录 + 非作者评审 + digest 绑定）；档位 1「让给 Flywheel」含 **记忆检索（CASS/EE）**。所以不是新让步，是把早该划的线划实。

| 层 | 归属 |
|---|---|
| 历史 session 检索 | ✅ CASS |
| 检索引擎（token 预算 / task lens / scope / 确定性 pack） | ✅ EE |
| 热工作记忆 / 自动沉淀 | ✅ 宿主（Mnemon / CM） |
| **记录 + 评审 + 随项目分发身份** | ❌ **留 APG** |

落地成本 ≈ 0：§9.4 第 3 条本来就写着"**不写 adapter**"。

### 11.7 决定二：记忆随项目走 ⇒ git 记录权威、索引派生

用户指出："记忆这个东西应该随着项目走（毕竟算是开发的一部分）"。这给出一条**硬边界**：

> `docs/memory/*.json`（进 git、随 clone 分发）= **权威源**；
> EE / CASS 的一切索引 = **可重建的派生物**，永远不是权威。

这同时解决了 EE 的 `.ee/ee.db` 是 workspace 本地库、不随项目走的问题：**检索可以在本地，事实必须在 git。** 它与 CASS 自己"SQLite 只是被索引会话的 source of truth、派生资产可重建"的哲学同构，只是把权威源换成了项目仓。

### 11.8 决定三：APG 掌握控制面（外部组件装配 + AGENTS.md）

**这条 APG 已经有半个底盘**，不是从零造：

| 已有 | 作用 |
|---|---|
| `scripts/install.sh`（32KB；`merge` / `check` / `trigger`） | 把 routing block 放到 root instructions 的**最前**；校验位置、adaptation 状态、UTF-8、root 体积 |
| `scripts/manage-root-blocks.mjs` | **marker 级 `strip` / `replace`**；块必须始于 byte 0；重复 marker 直接 fail |
| `bootstrap/AGENTS.routing-block.md` · `AGENTS.adapter-trigger.md` · `CLAUDE.scope-block.md` | 受控块模板 |
| `PACKAGE_MANIFEST.json`（逐文件 sha256）+ `PACKAGE_REMOTE.json` + `scripts/check-update.mjs` | **APG 自己的**版本与内容校验机制 |

⇒ 需要的是**扩权**，不是新系统：

1. **外部组件装配控制**：把 PACKAGE_MANIFEST 的形状推广成**外部依赖 manifest**——id / 来源 / pin 版本 / 期望 sha256 / 校验命令 / 安装命令（交回用户或外部安装器执行）。
   **红线**：只做**声明 + 校验 + 漂移检测**，不做包管理器、不代下载执行；**只发 manifest，不发组件字节**——这同时满足 §9.2 的许可约束（NOASSERTION 组件不得进入 APG 分发面）。
2. **AGENTS.md 全域所有权**：今天 APG 只拥有**自己那一块**。扩为**多写入者分区所有权 + 漂移审计**。另两个写入者：`br agents --add`、EE `export agentsmd`。EE 的模型最接近（marker 限定 + 改前备份 + `--force-managed-block` + `diag agentsmd-drift`），可直接作为协商基础。

**为什么这条值得做（量化理由）**：AGENTS.md 是整套里**唯一每轮付费的注入面**（见 11.2），而它现在有 **3 个写入者**。§8.4-① 的"块所有权协议"因此不是学术问题。

### 11.9 必须同时钉住的两个条件

| # | 条件 | 状态 |
|---|---|---|
| A | **EE trust 映射**（见 11.9.1，已从源头核实并更正） | 待定 |
| B | **许可证与降级**——EE 等为 NOASSERTION（MIT + OpenAI/Anthropic Rider，非 OSI）⇒ 只能作**用户自装外部依赖**，不得进 APG 分发面。推论：**未装 EE 的消费者检索面为 0**（即现状），必须在 APG 侧**显式标 degraded**，不能默默无闻。 | 已定 |

#### 11.9.1 条件 A 已从源头核实——并推翻本报告早先的假设

直接读 `eidetic_engine_cli/docs/trust-model.md`（2026-09-19 拉取），阶梯、含义、权重逐行吻合：

| trust class | 含义 | 权重 | 可晋升 |
|---|---|---:|---|
| `human_explicit` | **人**直接执行 `ee remember` | 0.85 | ✅ |
| `peer_human_attested` | 某**已签名活跃成员**声明源行为 human_explicit（只证明"成员声明过"，不证明是人手打） | 0.75 | ✅ |
| `agent_validated` | agent 断言 + 结果证据 + 验证 | 0.65 | ✅ |
| `agent_assertion` | agent 断言，无已验证结果证据 | 0.50 | ❌ |
| `cass_evidence` | 从 `coding_agent_session_search` 导入的片段 | 0.45 | ❌ |
| `legacy_import` | **EE 自己的 pre-v1 遗留产物** | 0.30 | ❌ |

**两处更正**：

1. **`legacy_import` 不是"外来记忆导入通道"**，它是 EE 自己 pre-v1 数据的归档桶。本报告早先说"APG 记录会以 `legacy_import` 进入 EE"**不成立**，予以更正。
2. **真正的导入通道是 `ee import agentsmd`**（README：解析 ee marker 之外的 rule-like 句子为 curation 候选），其 trust **硬上限 = `agent_assertion`（0.50）**。

**晋升闸门（决定性）**：EE 明确只允许 `human_explicit` 与 `agent_validated` 晋升；**`agent_assertion` / `cass_evidence` / `legacy_import` 一律拒绝，返回 typed exit-7**。

⇒ 推论：**APG 的评审事实在 EE 里没有能保住其评审强度的通道。**

- 走 `import agentsmd` → 0.50，且**永不可晋升**；
- 要 0.85 → 必须**人**逐条执行 `ee remember`（把人工变成转录路径，不可扩展）；
- 0.75 `peer_human_attested` → 只由**已签名活跃成员**赋值，命令无法制造。

**但这不阻塞**，因为 §11.7 已定：`docs/memory` 的 git 记录是**权威源**，EE 只是**派生物**。EE 的 trust class 因而是**注意力排序**问题，不是权威问题。映射仍需决定，但依据已从推测变为实测。

### 11.10 本轮已执行（全部可回滚）

| 动作 | 结果 | 回滚 |
|---|---|---|
| 压缩记忆条目（完成态摘要 → 指针/合并） | 6 条 条；文件字节 → 5,248 B | 原文见本报告 §11.3 与 git 历史 |
| 合并两个 Mnemon Document 根 | 全局 7→4 条、工作区 8→11 条；**无悬空引用**；3 篇 sha256 一致 | `.agent-scratch/mnemon-doc-merge-20260919T130119Z/`（两个 index 原件 + 3 篇正文） |

**未做（保持未决）**：未创建 ADR、未改任何 APG 源码、未提交、未安装任何外部组件。

### 11.11 本轮独立核实的外源事实（全部一手来源，2026-09-19）

调研早期的事实由子代理取证，本节对**承重项**做了逐条复核，并据此更正了两处错误。

| 事实 | 一手来源 | 结论 |
|---|---|---|
| EE trust 阶梯 6 档与权重 | `eidetic_engine_cli/docs/trust-model.md` L35–40 | 逐行吻合；**并更正** `legacy_import` 的含义（见 11.9.1） |
| EE 晋升闸门 | 同上 L60–62 | 仅 `human_explicit` / `agent_validated` 可晋升，其余 **exit-7 拒绝** ✓ |
| EE `--memory-scope` 六档 | EE README L789 | `self, team, global, workspace, verified, swarm` 六档 ✓ |
| 许可 rider | 3 个仓库 `LICENSE`（mcp_agent_mail / coding_agent_session_search / eidetic_engine_cli） | **3/3** 为 `MIT License (with OpenAI/Anthropic Rider)`，Restricted Parties 明确列 OpenAI、Anthropic ✓ |
| Agent Mail 传输方式 | `mcp_agent_mail/README.md` L7 | "**HTTP-only** FastMCP server"，HTTP 端口 8765 ✓ |
| `bd` 是 `br` 的别名 | 同上 L69 / L192 | 安装 `br` 并建 `bd` shell 别名，**替换**既有 `bd`(Go) ✓（用户更正在先） |
| CASS 的权威定性 | `coding_agent_session_search/README.md` L1004 / L1015 | "relevance is not correctness"；trust verdict 为 **advisory metadata only，永不改变结果排序** ✓ |
| `docs/memory/*.md` 会被 catalog 收录 | 探针实测（`apg catalog build --source`） | 确证收录为 `kind=reference` ✓（见 11.4） |
| 消费者注入块体积 | 13 个仓实测 | 12 个 v3 块 731–758 B；APG 自身 v2 块 1,705 B ✓（见 11.2） |
| 跨文件引用有效性 | `bootstrap/AGENTS.routing-block.md` 第 14 行、`plans/PROVIDER_RUNTIME_EVOLUTION.md` §5.1、`plans/DEVELOPMENT_ROADMAP.md` §1.1 | 三处引用均成立 ✓ |

**本节更正的两处错误**（均已在上文改掉）：
1. "APG 记录会以 `legacy_import` 进入 EE" —— 错。`legacy_import` 是 EE 自己的 pre-v1 桶。
2. "`bootstrap/AGENTS.routing-block.md` §14" —— 该文件无 §14 编号，实为**第 14 行**。

### 11.12 下一步（按优先级）

1. **AGENTS.md 块所有权协议**（唯一每轮付费面 + 3 个写入者）。
2. **ADR**：把 §10.4 的组织原则 + 本节三条决定落成决策记录；随后把记忆条目缩成指针——这才是 token 净省的地方。
3. **修 `docs/memory` 收录不一致**（目录级 vs 扩展名级）。
4. 其余 5 项缺口：主体权威合成 / policy 可复现身份 / 证据验收合同 / 观测分级 / 跨 harness 契约。
5. **EE trust 映射**：通道已核实（见 11.9.1）——待决定 APG 记录落哪一档。

---

## 12. 人工离线期间的免批准工作，与待批准清单（2026-09-19）

> 用户说明：人工离线，凡需批准者一律挂起；先做不需要批准的，直到没有可做/可优化项。本节是这次"清理到底"的记录与冻结清单。

### 12.1 免批准已完成（全部可回滚）

| # | 动作 | 结果 | 回滚 |
|---|---|---|---|
| 1 | 实测确证 `docs/memory/*.md` 会被 catalog 收录 | 从"代码推断"升级为"探针实测"（见 11.4） | 探针已点名删除 |
| 2 | 逐条复核承重外源事实 | EE trust 阶梯 / 晋升闸门 / memory-scope 六档 / 许可 rider / Agent Mail HTTP-only / `bd`=`br` 别名 / CASS 定性 全部一手证实（见 11.11） | 只读，无副作用 |
| 3 | **更正两处报告错误** | ① `legacy_import` 非外来导入通道；② routing-block 是"第 14 行"非"§14" | 已改，git 历史可回 |
| 4 | 量测消费者注入面 | 13 仓：12 个 v3 块 731–758 B；APG 自身 v2 块 1,706 B | 只读 |
| 5 | 报告结构校验 | 23 处内部引用全部有效；无重复编号；表格列数一致；`git diff --check` clean | — |
| 6 | 合并两个 Mnemon Document 根 | 全局 7→4、工作区 8→11；无悬空引用；sha256 一致 | `.agent-scratch/mnemon-doc-merge-20260919T130119Z/` |
| 7 | 压缩记忆条目 + 更正 1 条错误事实 | 记忆 5,456 B → **4,527 B**（6 条；去掉 4 条完成态摘要、合并为指针，另新增 2 条决定）；修掉"legacy_import 倒挂"的错误结论 | 原文见 git 历史与本报告 |
| 8 | 给临时产物补生命周期标注 | `.agent-scratch/flywheel-research/*` 已标注创建/失效条件/点名删除方式 | — |

### 12.2 一个被证伪的假设（值得记下，避免重提）

**假设**："APG 自己停在 `schema_version: 1` / v2 块，是包源仓没吃自己的 v3 迁移，属滞后。"

**证伪**（只读预览 `apg migrate v3-preview --target . --source . --variant shared-runtime.pinned`）：

```
applicable: false
blockers: [{ code: "source-worktree-full-corpus",
  message: "A self-host workspace containing the full APG source corpus cannot claim
            either first-slice containment mode; materialize a separate consumer copy." }]
writes_project: false, stages_or_commits: false
```

⇒ **这是设计约束，不是滞后。** v3 迁移对 `provider.mode: source-worktree` **按设计不适用**——包源仓必须另 materialize 一份消费者副本。`lib/migration-v3.mjs:32-35` 即该分支。

### 12.3 待批准清单（离线期间冻结，按优先级）

| # | 事项 | 依据 / 收益 | 风险 |
|---|---|---|---|
| 1 | **AGENTS.md 块所有权协议**（可入 `decisions/0006-*`） | AGENTS.md 是**唯一每轮付费注入面**，现有 **3 个写入者**（APG managed marker、`br agents --add`、EE `export agentsmd`） | 需与 EE/`br` 协商块边界 |
| 2 | **ADR**：§10.4 组织原则 + §11 三条决定 | 落地后记忆条目可缩成指针——**这才是 token 净省点** | 无（纯新增文档） |
| 3 | **修 `docs/memory` 收录不一致** | 已实测确证：`lib/core.mjs:184` 按目录排除 vs `lib/catalog.mjs` 只按扩展名收 | 触发布局校验，需回归 |
| 4 | **APG 自有 v2 块瘦身**（见 12.4） | 省 ≈150 tok/轮 | 它是**常驻治理契约**，瘦身即削弱 |
| 5 | **其余 5 项缺口** | 主体权威合成 / policy 可复现身份 / 证据验收合同 / 观测分级 / 跨 harness 契约 | 均需设计与回归 |
| 6 | **EE trust 映射落档** | 通道已核实（11.9.1），只差选择 | 仅影响注意力排序，不影响权威 |

### 12.4 提案详情：APG 自有注入块瘦身（待批准，未实施）

| 项 | 数值 |
|---|---|
| APG 自身 AGENTS.md 块（v2） | **1,706 B ≈ 448 tok/轮** |
| 12 个消费者 v3 块 | 731–758 B ≈ **192–199 tok/轮** |
| 差值 | **≈ 950 B ≈ 250 tok/轮**（2.3 倍） |
| 该 v2 块模板 | `bootstrap/AGENTS.v2-block.md`，1,969 B |
| **使用该模板的仓数量** | **1 个（仅 APG 自身）**——13 个仓里其余全为 schema 2 / v3 |

**可裁的地方（初判）**：第 3 条的"建议箱"整句（≈230 字符）可改为一行引用，正文留在 `templates/SUGGESTION_BOX.md` 与 `PACKAGE_ADAPTATION`；第 1 条的"互信"表述可压缩。粗估可降到 **≈1,100 B（省 ≈150 tok/轮）**。

**反方论点（必须一并考虑）**：该块是**常驻治理契约**，7 条每条都在防一类越权；瘦身省下的是 token，削弱的是"每次都在场"的约束力。**建议：不急着改，等 §11 的 ADR 落地、块所有权协议定稿后，把 v2/v3 两块一起收敛**——单独瘦身会制造第三次分叉。

### 12.5 另一个待批准项：`.agent-scratch/` 过期内容归档

只读盘点（2026-09-19）：`.agent-scratch/` 共 **20.2 MB / 20 项**，其中前三项就占 **19.1 MB**，全部是 10 天前**已完成工作**的发布/同步备份：

| 条目 | 大小 | 龄(天) | 性质 |
|---|---:|---:|---|
| `final-context-release-20260908T101815Z/` | 7.7 MB | 10.2 | 3.0.7 发布源备份（已完成） |
| `ticket64-release/` | 6.1 MB | 9.8 | 票据 64 发布备份（已完成） |
| `short-ticket-20260909T014306Z/` | 5.3 MB | 10.1 | 短票据发布备份（已完成） |
| 其余 17 项 | 1.0 MB | — | 各次操作备份与探针 |

**建议（需批准）**：前三项对应的发布均已验证并在 `origin/main`，可点名删除或移出仓外归档。**不自动执行**——删除是破坏性操作，且按用户规则须**逐个点名、不用通配符**。

---

## 13. 用户决策结果（2026-09-19）

| # | 决定 | 结果 | 状态 |
|---|---|---|---|
| 1 | 让步档位 | **认定档位 1**——三套记忆各自的定位变化已在 13.1 说明完毕 | **已定** |
| 2 | 声明外部后端 | **暂不开**。改为：现在就在 APG 内建一个**非 git 试验区**，把外部组件拉进来实测 | 已执行（见 13.2） |
| 3 | 文档顺序 | **先 `decisions/0006`（AGENTS.md 块所有权协议），再组织原则 ADR** | 已定 |
| 4 | `docs/memory` 收录不一致 | **(a)** 让 catalog 也按**目录**跳过——已实现为两端共享 `DIST_EXCLUDED_DIRS`（`lib/core.mjs` 导出，`listDistributionFiles` 与 `lib/catalog.mjs:22` 同读），并有回归断言与负向验证（见 13.8） | **已完成** |
| 5 | 根块层级假设 | **全改**：7 处 `parent`/`captain` 改为 `assigner`（拓扑中立），并新增 4 条反向断言，`test-install.sh` PASS（见 13.6） | **已完成** |
| 6 | 互斥 / claim 租约 | 语义改为 **downgrade / 未安装**，而非"不支持"（见 13.4） | 已定方向 |
| 7 | 命名空间命名 | 实测完成，建议 `agent-project-guides:external:<command-name>`（版本作字段 / 完整性作三元组 / 词法定界，见 13.12） | **建议已出，待签字** |
| 8 | EE trust 映射 | 实测完成，结论：**只做注意力排序、永不作为权威**；4 档 → `intended`，`peer_human_attested` 只映射"声明"层（见 13.12） | **建议已出，待签字** |
| 9 | `.agent-scratch` 前 3 项（19.1 MB） | **删除**——已逐个点名执行 | **已完成** |
| 10 | 报告 | **已提交**（6498163，其后继续增补第 13 节） | **已完成** |
| 11 | 其余 5 项缺口 | 可做，但**必须排在外部实测之后**（顺序见 13.5） | 待排期 |

### 13.1 三套记忆的定位变化（决策 1 的前置说明）

| 记忆系统 | 调研**之前**的定位 | 现在（决策后）的定位 | 变化性质 |
|---|---|---|---|
| **APG `docs/memory`** | 候选：既是"项目事实记录"，也隐含"要补检索面" | **只保留「记录 + 非作者评审 + 随项目分发身份」**；检索引擎交出去；`git` 记录是**权威源** | **收窄**——让掉检索，守住权威 |
| **DSH Mnemon** | 候选：可能替代/合并 APG 记忆层 | **明确不合并**。它是 **workspace 级、自动、每轮注入**的**热工作记忆**，不是项目契约 | **归位**——退回"宿主工作记忆" |
| **Flywheel（CASS / CM / EE / MS）** | 候选：融合对象或竞争者 | 成为**检索执行面**：CASS=会话历史检索、EE=检索引擎、CM=热工作记忆（与 Mnemon 同槽）、MS=技能。EE 的 trust 阶梯**保不住 APG 的评审强度**，故只作**注意力排序** | **换位**——从"竞争者"变成"被委托的执行面" |

**一句话**：三套记忆的分工从"谁替代谁"变成了**三层不同作用域**——

1. **APG `docs/memory`** = 项目事实，**随 clone 走**，**有人担保**（权威源）
2. **EE / CASS** = 本地索引，**可重建**，**无人担保**（派生物、注意力）
3. **Mnemon / CM** = 本机工作记忆，**自动、每轮注入**（宿主层）

### 13.2 外部组件试验区（决策 2 的落地）

| 项 | 值 |
|---|---|
| 位置 | `.agent-scratch/external-test/` |
| 是否受 git 管辖 | **否**——`.gitignore` 已含 `.agent-scratch/` |
| 是否进 APG 分发面 | **永不**——NOASSERTION 组件字节不得随 APG 发布 |
| 拉取方式 | 逐个 `git clone --depth 1`（**不走 ACFS 安装器**） |
| 明确不用 | `--mode vibe`（免密 sudo + 危险 agent flag） |
| 删除方式 | 点名删除 `.agent-scratch/external-test`，不用通配符 |

### 13.3 决策 5 的含义（待用户确认范围）

`bootstrap/AGENTS.routing-block.md` 第 14 行现在写的是：

> Subagents get explicit role/mode, …; **missing/conflicting authority goes to parent/captain**, never end user or self-expansion.

**问题**：这句把"缺失/冲突的权威去找上级"当成**全局拓扑**。于是**平级 peer 模式无法成立**——peer 之间没有 parent/captain 可找，规则却没给它们出路。

**"拓扑中立"的含义**：把它从"**必须**找上级"改成"**按已声明的拓扑**决定升级目标"——即 peer 网格里升级到对等方/协调者，层级里升级到上级，两者都不是硬编码。

**影响面（已查清）**：`parent/captain` 共 **6 处**——

| 位置 | 是否属"全局拓扑"断言 |
|---|---|
| `bootstrap/AGENTS.routing-block.md:14` | ✅ 是（根块，**就是它**破坏 peer） |
| `templates/SUBAGENT_ASSIGNMENT.md` ×3 | ❌ 否（子代理指派语境，升级给"指派者"本来就对） |
| `roles/development/REVIEWER.md:64`、`FIELD_EVALUATOR.md:68` | ❌ 否（同上） |
| `scripts/test-install.sh:68` | 断言把旧字符串**钉死**，改根块必须同步改它 |

**且现在改最便宜**：13 个仓**无一**使用 `routing:` 块 ⇒ 改它**零影响**，不触发消费者 `integrity.root_block_hash` 变更、不需 12 仓重适配。

**待你定的只是范围**：(i) 只改根块那 1 处 + 同步测试断言（推荐）(ii) 6 处全改 (iii) 不改。

### 13.4 决策 6 的措辞修正（用户提出）

原先的表述是"写成显式 **unsupported**"。用户更正为：应写 **downgrade（降级）** 或 **未安装（not-installed）**，而不是"不支持"。

**这个修正更准确**，理由：

- 文件/模块互斥**不是"不存在"**——Agent Mail 有 `voluntary` 文件预留（advisory，对代码文件不强制）；`br` 有原子 claim（但**无租约**）。
- 准确的状态是：**能力依赖于某个可装可不装的外部组件，且即便装上也是降级形态**。
- 这与 APG 既有词汇天然一致：`intended / host-observed`、`degraded`、`package_missing` —— APG 早就有"降级"语义，不需要新造"unsupported"。

⇒ 因此应引入**能力状态词表**（如 `available` / `degraded` / `not-installed`），而不是二值"支持/不支持"。**这与决策 2 的"声明式 manifest"是同一件事的两面**：manifest 声明"装了没有、什么版本、校验过没有"，能力状态声明"因此现在是可用/降级/未装"。

### 13.5 决策 11 的顺序建议

用户要求：其余 5 项缺口"可做，但要安排在和外部测试的相对顺序"。

| 顺序 | 事项 | 为什么在这个位置 |
|---|---|---|
| **第 0 步（并行）** | 外部组件拉取进试验区（进行中） | 决策 7、8 都在等它 |
| **第 1 步** | `decisions/0006` AGENTS.md 块所有权协议 | 唯一每轮付费面 + 3 个写入者；与测试无依赖 |
| **第 2 步** | 组织原则 ADR（§10.4 + §11 三条决定） | 落地后记忆可缩成指针——**token 净省点**；**已完成**，即 `decisions/0007-authority-plane-and-execution-plane.md`（见 13.8） |
| **第 3 步** | 修 `docs/memory` 收录一致性（决策 4） | **已完成**：共享 `DIST_EXCLUDED_DIRS` + 回归断言，见 13.8 |
| **第 4 步** | 试验区实测：EE trust 映射 / CASS 检索 / 互斥与租约的真实形态 | 决策 7、8 的前置——**已完成，见 13.12** |
| **第 5 步** | 按实测结果定能力状态词表（决策 6 的落地） | 观测输入已就绪（第 4 步完成，13.12）；但词表的**落地面**就是决策 2 的声明式 manifest，而决策 2 主人裁定「暂不开」，故暂缓——现在把它写进哪个分发文件都会变成没有消费者的空话 |
| **第 6 步** | 其余 5 项缺口（主体权威合成 / policy 可复现身份 / 证据验收合同 / 观测分级 / 跨 harness 契约） | 依赖第 2 步的边界与第 4 步的观测 |
| **贯穿** | 决策 5 的根块拓扑中立（范围确认后随时可做，**越早越便宜**） | 现在零成本，一旦有仓使用该模板就要走发布 |

### 13.6 决策 5 的执行记录（**全改**，7 处）

| 文件 | 改动 |
|---|---|
| `bootstrap/AGENTS.routing-block.md`（末行） | "goes to **parent/captain**" → "**escalates to the assigning agent**, never to the end user or through self-expansion. **The assigning agent owns any end-user approval, whatever the topology.**" |
| `templates/SUBAGENT_ASSIGNMENT.md:3` | "the parent/captain prompt" → "the assignment prompt the **assigner** sends" |
| `templates/SUBAGENT_ASSIGNMENT.md:23` | "ask parent/captain" → "ask the **assigner** … (the assigner owns end-user approval)" |
| `templates/SUBAGENT_ASSIGNMENT.md:26` | "returns to the parent/captain" → "returns to the **assigner**" |
| `roles/development/REVIEWER.md` §6 | "其他权限向 parent/captain 请求。" → "其他权限向**指派方（assigner）**请求；需要用户级批准时由指派方取得。" |
| `roles/development/FIELD_EVALUATOR.md` §7 | 同上句式 |
| `scripts/test-install.sh:68` | 正向断言改为新措辞，并新增 **4 条 `assert_not_contains`**，防止 `parent/captain` 回归 |

**为什么用 "assigner"**：它在**层级与 peer 两种拓扑下都成立**——层级里 assigner 就是上级，peer 网格里 assigner 就是发起协作的对等方。

**这一改同时闭合了一条已记录的冲突**：`docs/memory/finding.l1.operator-runbook-approval-gap.json` 的 `attempts` 里写着——"grep 全部角色正文确认同类『问用户 vs 找 parent』冲突存在于 Reviewer/Field Evaluator/Maintainer/Operator"。新措辞把升级目标统一为 **assigner**，并明确 **assigner 承担取得用户批准的责任**，冲突即解。

**验证证据（全部通过）**：

| 检查 | 结果 |
|---|---|
| `bash -n scripts/test-install.sh` | 语法 OK |
| `node scripts/validate-routing.mjs` | routing JSONL / MCP 子类型 / 远端元数据 均有效 |
| `node scripts/apg.mjs catalog build` | 253 条 |
| `node scripts/apg.mjs catalog check` | `valid: true` |
| `node scripts/apg.mjs release manifest` | digest `sha256:334d16be835af9564d8dee93d52f997045c70e4a355194b6d756632013d7673c`，80 文件 |
| `node scripts/apg.mjs release verify-source` | `valid: true` |
| **`bash scripts/test-install.sh`** | **PASS**（exit 0）："managed-prefix routing, recoverable CLAUDE scope transactions, exact aliases, project profiles, MCP subtypes, cloud freshness, state lifecycle, and safety guards" |

### 13.7 提交范围问题（**需用户决定**）

`git diff HEAD` 显示：我改的 5 个文件里 **4 个本来就在用户未提交的改动中**（语言统一 / 压缩轮次）。

| 文件 | 总改动 | 其中属本次决策 5 |
|---|---|---|
| `bootstrap/AGENTS.routing-block.md` | 4+/5- | 1+/1- |
| `roles/development/REVIEWER.md` | 8+/8- | 1+/1- |
| `roles/development/FIELD_EVALUATOR.md` | 6+/6- | 1+/1- |
| `templates/SUBAGENT_ASSIGNMENT.md` | 3+/3- | 3+/3-（此文件原本干净） |
| `scripts/test-install.sh` | 10+/1- | 6+/1- |

且 `PACKAGE_MANIFEST.json` / `catalog/catalog.jsonl` 是**整个工作区**的派生，**必然**把用户未提交的改动一并纳入——证据：HEAD 的 catalog 是 **251** 条，重建后 **253** 条，多出的正是**未跟踪**的 `templates/SUGGESTION_BOX.md`。

> 附带说明：这意味着在我动手之前，manifest/catalog **已经**与工作区不一致（stale）。重建后二者恢复自洽。

⇒ **无法只提交"决策 5"而不带上用户其余约 25 个改动文件。** 三个选项：

| 选项 | 结果 |
|---|---|
| (a) 一起提交 | 得到一次自洽的提交，但把用户未提交的工作一并提交 |
| **(b) 暂不提交**（建议） | 改动已在工作区、已通过测试；由用户决定提交粒度 |
| (c) 部分暂存我的 hunk | 生成物无法同步隔离，会留下不一致状态 |

### 13.8 决策 3 / 4a 执行记录（已完成）

**决策 4a —— `docs/memory` 收录不一致（已修 + 已加回归断言）**

问题性质：**潜在**，非现行。`docs/memory/` 下现有 16 个 finding，全部是 `.json`，而 catalog 只收 `.md`，所以今天 catalog 里 `docs/memory` 命中数为 **0**。但只要将来有人把 finding 写成 `.md`，`lib/catalog.mjs` 的 `walkMarkdown` 会把它收成 `kind=reference`，而 `lib/core.mjs:184` 的分发清单按**目录**跳过 `docs/memory` —— 于是 catalog 会引用不随包分发的文件。

探针实测（旧模块 vs 新模块）：探针 `.md` 在旧逻辑下进入 catalog **2 条**（文档条目 + 小节条目），新逻辑 **0 条**；总数 255 → 253（253 即基线）。

修法选择：不写死两处字面量，而是让两端**共享同一份排除清单**。`lib/core.mjs` 新增导出 `DIST_EXCLUDED_DIRS = new Set(['docs/memory'])`，`listDistributionFiles` 与 `catalog.mjs` 都读它，从结构上消除漂移。

回归断言：`scripts/validate-routing.mjs` 在 `buildCatalog` 之后断言没有任何条目落在分发排除目录内。**负向验证**：临时还原旧 `catalog.mjs` 并放入探针 `.md`，断言如约触发 ——

```
error: catalog must not collect distribution-excluded content: docs/memory/__probe_guard.md
exit=1
```

还原修复版后通过。探针已按显式文件名删除，`docs/memory` 仍为 16 个文件。

**决策 3 —— 文档顺序（进行中）**

- `decisions/0006-root-instruction-block-ownership.md` ✅ 已写（见下）
- `decisions/0007-authority-plane-and-execution-plane.md` ✅ 已写（权威面/执行面边界）
- 组织原则 ADR 即 0007

### 13.9 ADR 0006：三个 AGENTS.md 写入方全部取证完成

写 0006 时发现原假设不完整：**第三个写入方 `ee` 此前未验证**。40 仓浅克隆到 `eidetic_engine_cli` 后，另从 raw 直取其源码与自带 ADR 完成取证。

| 写入方 | 标记 | 关键行为 | 备份 | 块完整性 |
|---|---|---|---|---|
| APG | `agent-project-guides:routing` / `:adapter-trigger` | 字节级 `strip`/`replace`；`install.sh:324` 断言路由块在**字节 0**；标记对必须恰好 1 次 | **无** | **无**（手改会被静默覆盖） |
| `br` (beads_rust) | `br-agent-instructions-v{n}` / `end-br-agent-instructions` | `append_blurb` 原样保留已有内容再追加 → **与 APG 的字节 0 前缀天然兼容**；`update_blurb` 把块挪到末尾；`create_new(true)` 拒覆盖；有 `--dry-run` | 无 | 无 |
| `ee` (eidetic_engine) | `ee:agentsmd:begin generation=N hash=H` / `ee:agentsmd:end` | 只在标记内编辑；`--create` 才建文件；`--dry-run` 打 diff；幂等到字节相同 | **`<file>.ee-backup`** | **标记内带内容哈希 + generation**；手改块用哈希检出后拒绝（`agentsmd_unmanaged_edit_detected`，除非 `--force-managed-block`） |

外加一个**已在野外存在的 legacy 命名空间**：`bv-agent-instructions-v{n}`（`br` 仍能识别并删除，但已不再写入）。

**结论**：三个独立开发的项目在同一压力下收敛到**同一套协议** —— 每个写入方一个标记圈定的管理区、绝不碰标记外的字节、有歧义就拒绝而不是猜、幂等、能检出手改自己的区。差别同样有信息量：`ee` 的标记里带**哈希与 generation**、且**写前备份**，而 APG 两样都没有。

这直接产出 ADR 0006 的两条新增条款：**P8 首次改写前必须备份**、**P9 管理块完整性（APG 自己的标记加内容哈希/修订令牌，`replace` 在不匹配时拒绝）**。AS-IS 事实：`grep -n 'backup\|\.bak\|cp -' scripts/install.sh scripts/manage-root-blocks.mjs` 无任何命中 —— 根指令文件是本工具链里**唯一没有恢复点的被改写面**。

`ee` 的桥接 ADR 上游状态仍为 **proposed**，其实际行为须在测试区实测，不能从源码推断（已写入 0006 的 P5）。

**许可红线复核**：`eidetic_engine_cli` 为 `NOASSERTION`（MIT + OpenAI/Anthropic Rider）。取证副本放在**已被 gitignore** 的 `.agent-scratch/ee-agentsmd/`（带 `README-TEMP.md` 生命周期与许可标签），字节不进 APG 分发面；ADR 0006 只以 APG 自己的措辞记录**事实**。

### 13.10 P5 互操作实测：已用真二进制跑通（13 通过 / 0 失败 / 2 个确认缺口）

测试脚本 `scripts/test-interop-br.sh`（已入库；无二进制时明确 SKIP，不算失败），用**真实 `br` v0.6.0**（预编译二进制，SHA256 已对上上游发布的 `.sha256` 并与 `checksums.sha256` 交叉核对）在带自己 `.git` 的目标目录里产出真实 blurb（2,086 字节 / 66 行），再按 `rebuild_root_prefix` 的完全相同方式合成根文件。

| 检查项 | 结果 |
|---|---|
| `br --add` 之后 APG 路由块仍在**字节 0** | 通过 |
| `br` 区块逐字节不变、块数恰好 1、无重复 | 通过 |
| APG routing / adapter-trigger 标记各仍恰好出现 1 次 | 通过 |
| 连续合成两次逐字节相同（幂等） | 通过 |
| **P3 缺口**：写在 APG 前缀**之前**的第三方块被静默从第 1 行挪到第 29 行 | **确认**（后已闭合，见下） |
| **P9 缺口**：`replace` 把手改过的管理块**静默覆盖**，无哈希校验、无拒绝 | **确认** |

**最重要的正面结论**：在**现实顺序**下（先装 APG，`br` 后来追加），两者的共存**今天就成立**——APG 占字节 0，`br` 追加在尾部，双方字节零损失。ADR 0006 的 P1/P2/P4 因此从「设计意图」升为「已实测」。P3 / P8 / P9 则从推测升为**确证的活缺口**；三者此后均已闭合（P8/P9 见 ADR 0006 的对应小节，P3 见下方「P3 后续」）。

**实测中发现的第三条隐患（原 ADR 未覆盖）**：`br` 的发现逻辑 `detect_agent_file_in_project`（:377-400）只向上走到 `find_agent_search_root`（:348-368）认定的「项目根」——即含 `.git` / `.beads/` / `_beads/` 的最近目录。因此**嵌在被管理仓库内部的临时目录对 `br` 而言不是独立项目**：在那种目录里跑 `br agents --add`，它会去改**外层仓库**的根指令文件。本仓库 2026-09-19 实测中即触发了这一行为（改动了根 `AGENTS.md` 并生成 `AGENTS.md.bak`）。已即时恢复（与 HEAD 逐字节一致）并点名删除 `.bak`。

> 这也是 P5 harness 必须给目标目录自己的 `.git`、且在写入前先用 `br agents --check` 确认路径落在工作目录内才继续的原因——**安全校验已固化进脚本**，不靠人记得。

**未验证项（如实记录）**：本机没有 `minisign`，所以只验了 SHA256，**签名未验**。`br` 的源码引用来自 `main` 分支，而二进制是 v0.6.0 —— 两者可能有细节差异，行为结论以二进制实测为准，行号引用以 `main` 为准。

### 13.11 P8 + P9 已实施并验证（ADR 0006 的两条缺口）

**P8 —— 改写前先写恢复点**

新增 `backup_file_before_write`（定义在 `scripts/install.sh:24`），并在**全部 4 个**改写指令文件的 `mv -f` 之前调用：

| 落点 | 目标文件 |
|---|---|
| `sync_claude_scope` | `CLAUDE.md` |
| `rebuild_root_prefix` | 选定的根指令文件 |
| `replace_marked_block` | 选定的根指令文件 |
| `remove_marked_block_from_file` | 根指令文件或 `CLAUDE.md` |

备份后缀 `AGENTS.md.agent-project-guides.bak` —— **刻意**与 `br` 的 `.md.bak`、`ee` 的 `.ee-backup` 区分，避免三个写入方抢同一个备份路径。创建文件不算改写，所以文件不存在时不产生备份。

证据：`scripts/test-install.sh` 断言备份存在且 `cmp` 等于 merge 前的根文件；**负向验证**——注释掉备份调用后套件报 `FAIL: P8: root was rewritten with no recovery point`（exit 1），还原后逐字节一致。

**P9 —— 管理块完整性**

标记行**不动**（`routing:start` 仍是第 1 行、字节 0 不变），完整性作为**第 2 行**进入块内：

```
<!-- agent-project-guides:routing:start -->
<!-- agent-project-guides:integrity sha256=<hex> -->
```

`<hex>` = 对完整性行之后、结束标记之前的正文行逐行 `\n` 结尾做 sha256。这样 `install.sh:324` 的字节 0 断言、`count_marker` 的"恰好一次"断言、`sed` 区间提取全部继续成立。

`scripts/manage-root-blocks.mjs` 新增 `stamp` 与 `verify`（`strip`/`replace` 字节行为不变）。安装器在**每次**写路由块时戳记（`render_routing_block`），并在 `merge_routing` 与 `validate_routing` 处设门禁；`replace` 自身也拒绝不匹配的块。逃生开关是环境变量 `AGENT_PROJECT_GUIDES_FORCE_MANAGED_BLOCK=1`。**P9 之前的块（无完整性行）视为 legacy：接受，并在下次写入时升级** —— 所以已装的消费者项目不会因为这次改动而坏掉。

实测（`scripts/test-install.sh` + 手工复现）：

| 场景 | 结果 |
|---|---|
| 首次安装 | 块内第 2 行出现 integrity 行；`check` 通过 |
| 手改块正文 | `check` 与 `merge` 均报 `managed block integrity mismatch: recorded …, computed …`，exit 1 |
| 带 override | 成功（exit 0），且块重新校验通过 |
| 无完整性行的 legacy 块 | `verify` 报 legacy 并 exit 0；`replace` 照常工作 |
| `replace` 单独面对篡改块 | exit 1；带 override exit 0 |

**override 语义与 `ee` 刻意不同**：`ee` 重建自己的块，所以 `--force-managed-block` 是**覆盖**手改（手改留在备份里）。APG 的块承载**活的适配状态**（status / revision / verified-at / scope / reason），重建就会把这些状态清零，所以 APG 的更新路径复用已安装的块而不重渲染。带 override 时 APG 是**接受并重新背书**（re-attest）手改内容——因为 P8 已经保证改动前的文件有备份，所以这个取舍是显式的：不静默丢数据，代价是手改在被主人同意后会被保留。

**P5 结果更新**：`scripts/test-interop-br.sh` 从 **13 通过 / 0 失败 / 2 缺口** 变为 **18 通过 / 0 失败 / 1 缺口** —— P9 缺口闭合，只剩 P3（内容被静默挪位，不在本次批准范围）。

**P3 后续（已闭合，口径经主人裁定收窄）**：P3 已实现，harness 现为 **19 通过 / 0 失败 / 0 缺口**。实现时发现 ADR 原文与既有测试冲突：P3 字面要求「区域之上有任何内容就 fail」，而 `scripts/test-install.sh:230-239` 有意把「项目自撰正文在 routing 块之上」的 pre-scheme-1 尾置布局**迁移到前缀**并断言成功——两者不能同时成立。经主人裁定取**窄口径**：只有当区域之上存在**其他写入方的受管 marker 块**（命名空间非 `agent-project-guides`，即 `br-agent-instructions-v{n}`、legacy `bv-agent-instructions-v{n}`、`ee:agentsmd:begin`）时才拒绝并请求人工 reconcile；项目自撰正文仍照旧迁移。新增原语 `manage-root-blocks.mjs guard-prefix`（由 `install.sh` 与 harness 共用），`rebuild_root_prefix` 在 strip 之前前置调用它，拒绝时不落盘。**已记录的边界**：guard 只在 APG 区域已存在时生效；根上还没有 APG 区域时仍按 P1 抢占字节 0，把既有内容整体下移（字节与顺序无损），属前缀保留而非搬移外部块。非空证明两条：harness 用 pre-P3 算法对同一输入复现 1→30 行的真实搬移；`test-install.sh` 中把 `guard-prefix` 调用置空会使套件以 `FAIL: P3: merge relocated a foreign block above the prefix instead of refusing` 失败，恢复即通过。完整证据见 `decisions/0006` 的「P3: implemented and measured」。

**一处必须说清的边界（已闭合）**：`docs/memory/finding.h1.bootstrap-token-only-validation.json`（confidence=high）记录的是**另一个块**——`lib/bootstrap.mjs` 的 `inspectBootstrap` 对 schema-1 的 **v2 bootstrap 块**只做「字节 0 + 三个 `includes`」校验，**完全不比 hash**，所以块内其余治理指令可被改写而 `project validate` 仍报 ready。schema 2 用 `integrity.root_block_hash`（`schemas/project-v3.schema.json`，与 `manifest_digest` 同为必填）在设计上回答了这个问题，而 schema-1 路径当时仍是 token-only。

**该残余现已闭合，分两步**：① 把 P9 的机制用到 v2 块上（`renderBootstrap` 每次写入都戳记，`inspectBootstrap` 校验记录行）——这只挡住了此后的篡改，**无完整性行的旧块仍被当作 legacy 接受**，这是当时的残余；② schema 1 获得与 schema 2 同形的**描述符侧锚**：`integrity.root_block_hash` 成为受校验的描述符字段（`schemas/project.schema.json`、`lib/descriptor.mjs`），由 `project init` 记录、由新增的 `project reattest` 刷新，`inspectBootstrap` 据此比对，**两个锚都没有的块直接以 `bootstrap_unverifiable` 拒绝**，不再有「当作 legacy 放过」这条路。哈希口径与 schema 2 刻意一致：对 marker 区间内的块字节取 sha256。

**为什么描述符侧锚才是关键**：写在块**内部**的 hash 挡不住能改写整个文件的写入方——重写正文的人顺手就能把记录行一起改掉；锚放在**另一个文件**里才切断这个循环。

**ADR 0006 中仍未闭合的**：P6（观测账本未实现）、P7（APG 自身块仍 2,062 B，消费者用的是 731–758 B）。P3 已按上述收窄口径闭合；v2 残余已按主人「现在就改 schema 1」的裁定闭合。

### 13.12 决策 7 / 8：实测完成，给出签字建议

试验区 39 个 checkout（`repos.txt` 里的 `jeffreysprompts` 上游不存在）已全部拉取完毕，决策 7、8 的前置条件满足。以下每条结论都标了可复核的落点。

#### 决策 8：EE trust 阶梯 → APG 观测层级的映射

**阶梯本体**（`eidetic_engine_cli/src/models/trust.rs:92-101`，`TrustClass::initial_confidence()`，固定 `const fn` 先验表，不是评分函数）：

| TrustClass | 先验 | EE 自己的 posture（`src/models/query.rs:1440-1447`） | 建议映射到 APG |
|---|---|---|---|
| `human_explicit` | 0.85 | `authoritative` | `intended` |
| `peer_human_attested` | 0.75 | `authoritative` | 见下（仅"声明"可映射） |
| `agent_validated` | 0.65 | `authoritative` | `intended` |
| `agent_assertion` | 0.50 | `advisory` | `intended` |
| `cass_evidence` | 0.45 | `advisory` | `intended` |
| `legacy_import` | 0.30 | `legacy_evidence` | `intended` |

**为什么这个阶梯不能当权威输入**（每一条都是读源码得到的，不是推断）：

1. 最高档是 `ee remember` 的**默认值**。`src/core/memory.rs:1519-1532` 的 `trust_class` 只在「attempt-family 写入且已有注册 agent 身份」时才降到 `agent_assertion`，其余一律以 `human_explicit` 落库——没有 flag、没有 TTY 检查、没有签名。
2. 同一条路可以走 MCP：`ee remember` 的 MCP 工具默认 dry-run，但 `allowWrite=true` 即持久化（`src/mcp.rs:394`，`requires_allow_write_when_dry_run_false` 在 `:205-264` 逐工具声明）。
3. 也可以走"提升"到达：`human_explicit` 是**调用方自填**的 `--source-type`（`src/core/outcome.rs:360-368` 的 `ALLOWED_SOURCE_TYPES`），走 outcome 路径提升的准入条件是「非空 `actor` + 非空 `reason`」（`src/core/outcome.rs:1019-1026`）——即**调用方自称加一句理由**，不是身份认证。
4. 严格校验器 `validate_trust_promotion_evidence`（`src/policy/mod.rs:1365`）**不在 outcome 路径上**：它的调用点只有 `src/curate/mod.rs:7522`、`src/core/backup.rs:7247`、`src/core/learn.rs:3039/6090`。
5. 唯一有真正认证入口的等级是 `peer_human_attested`（`src/mesh/team.rs:2567/2595/5662/6267`），而它被排除在写入白名单之外。
6. 能把等级翻译成权威的那个构造**零生产调用点**：`TrustClass::requires_local_signature_for_validated_procedural`（`src/models/trust.rs:119-124`）在自己的文件之外没有任何调用者，`evaluate_local_signing_key_policy`（`:264-272`）的调用者也全在本文件的 `#[cfg(test)]` 里。
7. `cass_evidence` 由外部导入的 header **自报**。

**结论**：EE 的 trust 数字只能作为**注意力排序（attention ranking）**，永远不能作为 authority 输入。EE 自己已经用 `posture_for_trust_class` 标了 `agent_assertion`/`cass_evidence` 是 `advisory`，但把 `human_explicit` 标成 `authoritative`——而正是这一档可以不被认证地拿到。这个错配就是"排序可用、权威不可用"的全部理由。

**建议映射（在 APG 侧的表达）**：

- `agent_validated` / `agent_assertion` / `cass_evidence` / `legacy_import` → **`intended`**。它们是 EE 自报的先验，没有进入 APG 的观测管线。
- `peer_human_attested` → 只有当**"EE 声明了该等级"这件事本身被宿主记录下来**时才映射为 `host-observed`；映射对象是那句声明，不是等级为真。
- 建议在能力/观测词表里新增 **`declaration-observed`**：在宿主上真实观测到"某外部系统声明了 X"，但 X 本身未验证。这是为了不让"观测到声明"被读成"观测到事实"——与 §6 的 `intended`/`host-observed` 纪律一致。**该词进入正式词汇表需要主人签字。**

**附带发现（必须记录）**：EE 内部**至少 4 套互不兼容的数值阶梯**，同一个数字在不同子系统里含义不同——
`initial_confidence` 0.85…0.30（`src/models/trust.rs:92-101`）；ask 的 trust tilt 1.00 / 0.92 / 0.85 / 0.70 / 0.55 / 0.40（`src/core/ask.rs:458-468`）；pack rank 6000…1000（`src/pack/mod.rs:2132-2141`）；hotset 1000…300（`src/cache/hotset.rs:835-844`）。
所以 APG 一旦引用 EE 的等级，**必须同时写明 scale 名**（例如 `ee.trust.initial_confidence`），否则该数字不可解释。

#### 决策 7：外部组件命名空间

**建议约定**：`agent-project-guides:external:<command-name>`

| 规则 | 内容 | 实测依据 |
|---|---|---|
| `<command-name>` | 二进制的**调用名**，不是仓库目录名 | `ee`（`eidetic_engine_cli/Cargo.toml` 的 `[[bin]] name = "ee"`）、`cass`（`coding_agent_session_search/Cargo.toml:243`）、`sbh`（`storage_ballast_helper/Cargo.toml:14`）、`cm`（`cass_memory_system/package.json` 的 `bin.cm`）与仓库名全都不一致 |
| 版本**不进**命名空间段 | 版本是字段 | 实测一个工具跨三个标记版本：`beads_viewer` 代码发 `v7`（`pkg/agents/blurb.go:14/19/21`）、它自己的 `README.md` 是 `v7`、它自己的 `AGENTS.md` 却是 `v5`；而 39 个 checkout 里 **31 个**的 `AGENTS.md` 仍是 `bv-agent-instructions-v1` |
| 命名空间按**词法定界**匹配 | `...:external:br` 不得匹配 `brx` | `br`（`beads_rust`）与 `bv`（`beads_viewer`）都是**前缀匹配自己的名字**来识别已安装块 |
| 完整性写成三元组 | `{state, algo, digest, scope}`，不是裸 hex | 各写入方的完整性/备份约定互不相同：`br` 用 `.md.bak`、`ee` 用 `.ee-backup`、`ubs` 用 `.backup`、`bv` **没有备份** |

**被否掉的方案**（都因为上面的实测）：

- 用仓库目录名 → `mcp_agent_mail_rust` / `coding_agent_session_search` 这类名字既长又与调用名不一致。
- 用版本号做命名空间段 → 上游一升版就换命名空间；`bv` 有 3 个标记版本同时在路上。
- 用 dot-dir 名 → **`.cass/` 已被两个互不相关的组件同时占用**：`cass_memory_system` 用 `.cass/playbook.yaml`、`.cass/blocked.log`、`.cass/config.yaml`、`.cass/traumas.jsonl`；`coding_agent_session_search` 用 `.cass/proofs/proof-manifest.jsonl`（`src/lib.rs:9916`）。它们的命令名分别是 `cm` 和 `cass`。

项目本地 dot-dir 实测清单（供后续命名参考）：`.beads .bv .ee .cass .slb .ntm .ms .ft .dcg .pi .rch .sbh .caam .mcp-agent-mail .acfs`。

#### 对 ADR 0006 的两处修正 + 写入方普查从 3 个扩到 5 个

> **本节已被 §13.13 取代**：第三次（系统性）普查把写入方从 5 个扩到 **11 个**，并另外推翻了本节的两条记录。保留原文以便看演进过程。

实测推翻了 ADR 0006 的两处先行记录：

- `bv` **不做备份**就改写 `AGENTS.md`（`pkg/agents/file_lock_unix.go:195` 的原子 `os.Rename`；`--rollback` 是它**自升级**的路径，不是文件回滚）。
- `ntm` 写 `AGENTS.md` **完全不带标记**（整文件模板，且只在文件不存在时写）。

ADR 0006 断言"三个 AGENTS.md 写入方"，实测至少 **5 个**，新增两个都是这次普查才看到的：

- **`am`（`mcp_agent_mail_rust`）——风险最高**：标记 `<!-- am:blurb -->` / `<!-- am:blurb:end -->`，**没有版本 token**，裸 `std::fs::write`（`crates/mcp-agent-mail-cli/src/lib.rs:89815`、`:89838`），**没有备份**；对**任何 `.md`**，只要见着孤儿 start 标记就填内容；对**没有标记的 `AGENTS.md`/`CLAUDE.md`** 直接追加整块；并且**递归**（默认 `max_depth = 3`，`:89638`）——即根目录往下三层的每个 `AGENTS.md` 都会被改。
- **`ubs`（`ultimate_bug_scanner`）**：标记 `<!-- >>> Ultimate Bug Scanner quick reference (written by install.sh; removed by install.sh --uninstall) -->` / `<!-- <<< End Ultimate Bug Scanner quick reference -->`，按内容 grep 识别（`install.sh:2378`、`:3989-4010`），写前 `cp` 出 `.backup`。

**这直接影响 P3 的实现完整性**：`guard-prefix` 的 marker 文法必须覆盖 `am:blurb` 和 `ubs` 的 `>>>`/`<<<` 形式，否则这两个写入方落在 APG 前缀之上的块**仍会被静默搬移**——那正是 P3 要防的事。这是一条已经定位到行的后续修正项，不是设计问题。

#### 两项的拍板建议（各一句）

- **决策 8**：EE trust 阶梯只做注意力排序，映射到 APG 时 4 档 → `intended`，`peer_human_attested` 只映射"声明"这一层并建议新增 `declaration-observed`；引用时必须写明 scale 名。
- **决策 7**：命名约定 `agent-project-guides:external:<command-name>`，版本作字段、完整性作三元组、命名空间按词法定界。

---

## 13.13 外部拓展验证（2026-09-20）

> 这一节回答一个问题：**APG 关于外部组件的主张，有几个是真的？** 判据不是"读源码觉得对"，而是**真文件、真安装、真二进制、真消费者仓**。凡是只从源码读出来的结论，都在表里标 `scan`，不与实跑混写。

### 13.13.1 三个被验证的主张与结论

| 主张 | 验证方式 | 结论 |
|---|---|---|
| "APG 的 `guard-prefix` 认识全部外部写入方的块" | 39 个 checkout 的根指令文件（`AGENTS.md`/`CLAUDE.md`/`AGENTS.local.md`）逐注释行扫描 + 真实写入方 marker 字面量逐条过 `guard-prefix` | **原来不成立**：写入方 marker 100% 命中（37/37 个"写入方发出的 start marker"），但**系统普查又找出 3 个此前不可见的真实写入方形态**，已补（见 13.13.4） |
| "外部组件的写入在 APG 这里可共存" | 真跑 `br` v0.6.0 二进制、真跑 `ubs` 的写入路径、真跑 `acfs` 的生成器 | **成立**：`test-interop-br.sh` 19/19；三条真跑路径的写入语义与 ADR 记录一致，并另发现 `ubs` 备份会被幂等重跑覆盖（见 13.13.3） |
| "已安装的消费者仓不会被新的严格闸门打断" | 直接读 12 个真实消费者仓的 descriptor + root 块 + `project validate` | **成立**：12/12 已是 schema 2 且带 `integrity.root_block_hash`，全部 `state: ready`；唯一 schema 1 的仓是 APG 自己（`anchor: both`） |

### 13.13.2 写入方全量普查：11 个有写入方，28 个明确没有

39 个 checkout、**17 条写入记录**、**11 个组件带根指令写入方**、**28 个组件经字面量 grep + 写 API 站点复核确认为"无写入方"**。原始证据 `.agent-scratch/external-verify/census.json` + `evidence/`（含 SHA256SUMS）。

完整写入方表已进 `decisions/0006`（"Writer survey: the full census"），本节只放**这次才出现的判断**：

1. **`ubs` 的"有备份"只在第一次成立。** `install.sh:4007` 的 `cp` 早于 `:4012` 的"已存在"检查，所以幂等重跑会用**已修改后**的内容覆盖原始备份（实测 sha `142c1e29…`(36 B) → `9b49d91a…`(2147 B)，证据 `evidence/ubs-backup-clobber-proof.txt`）。⇒ 对 APG 的含义：**不能把"对方有备份"当作恢复点来依赖**，P8 的自备份是必需的，不是冗余。
2. **`acfs` 与 `ntm` 是"整文件改写"型**：真跑 `acfs` 的 `--output` 把 39 B 手写文件整文件覆盖为 4244 B、**无备份**；`ntm` 的块边界是 `<INSTRUCTIONS>`/`</INSTRUCTIONS>`（无 HTML 注释）。⇒ 结论：**任何基于 marker 的守卫都不可能完全防住整文件改写方**；对它们，`check` 的漂移检测才是唯一防线。这是一条**能力边界**，应写进 ADR 的 open items。
3. **`cass` 只在 `--force` 下改写已存在文件**，否则拒绝——这是十一个写入方里唯一"默认拒绝"的，与 APG 自己的 fail-closed 同向。
4. **`slb` 默认只预览**；`bv` 的 marker 版本号是数据（代码发 `v7`，现场有 `v1`/`v5`）。⇒ 文法**不能钉版本号**，只能钉形状。

### 13.13.3 真跑证据（不是源码阅读）

| 组件 | 真跑了什么 | 结果 |
|---|---|---|
| `br` v0.6.0（预编译二进制） | `agents --add --dry-run` / `--add --force` / 重跑 / 空目录 / 子目录 | dry-run 零写入；`--force` 写 2126 B 并生成 `AGENTS.md.bak`(39 B=原文)；重跑幂等（"already contains current … (v1)"，字节不变）；空目录**自动创建**且无备份；子目录里沿父目录向上写 |
| `ubs`（Python+shell） | `--help`/`--info`/`--dry-run --easy-mode` + 逐字抽取 `add_to_agents_md` 等函数做定向实跑 | dry-run 零写入（假 HOME 与工程目录 sha 均不变）；`--version` **不是有效选项**，会落入完整安装流程（含下载二进制、改 rc、装 cron）——**不可在无人值守下跑**；定向实跑：39 B → 2150 B，首行/末行即 ADR 记录的两个 `>>>`/`<<<` marker，并生成 `AGENTS.md.backup` |
| `acfs`（shell） | `generate-root-agents-md.sh --output` + `deploy --project`（`ACFS_TARGET_HOME` 隔离） | `--output` 整文件覆盖且无备份；`deploy` 目标不存在→`created`、一致→`up to date`、分歧→`REFUSED … was NOT modified` 并另写 `AGENTS.md.acfs-new`、exit 3 |

一律：`HOME` 指向新建临时目录、cwd 为新建临时工程、**无 sudo**、结束后 `git status --porcelain` 为空、39 个 checkout 的 mtime 保持在 9月19日。

### 13.13.4 语法覆盖实测：4 个真缺口闭合，1 类过度匹配收紧

**现场扫描**（39 个根指令文件、78 条注释行）：37 行命中"写入方形态"，6 个**互异**的不命中形态。逐条判定后只有 3 条是**真缺口**（另有 1 条是过度匹配）： 

| 现场字面量 | 谁写 | 旧文法 | 判定 |
|---|---|---|---|
| `<!-- Auto-generated rules from cass-memory playbook -->` | `cass` | **allow（漏）** | **真缺口**——含空格，`[a-z0-9_.:-]*` 跨不过去 |
| `<project_rules>` / `</project_rules>` | `cass` | **allow（漏）** | **真缺口**——不是 HTML 注释 |
| `<INSTRUCTIONS>` / `</INSTRUCTIONS>` | `ntm` | **allow（漏）** | **真缺口**——同上 |
| `<!-- >>> -->`（空箭头） | 无（合成探针） | **refuse（误拒）** | **过度匹配**——`>>>`/`<<<` 分支过宽，正文引用 UBS marker 也会被拒 |
| `<!-- casr-machine-readable-v1 -->`、`<!-- dcg-machine-readable-v1 -->` | 无写入方 | allow | **正确**：两个组件的文档小节标题（人工提交，无生成器；已核对全仓无写它的代码） |
| `<!-- BEGIN/END REOLINK_RAG_WSL_TOOL -->` | 无写入方 | allow | **正确**：本机 `~/.codex/AGENTS.md` 的人工分节 |
| `<!-- end-bv-agent-instructions -->`、`<!-- sbh-docs:end -->` | 是 end marker | allow | **正确**：设计只看 start marker（其 start 必在其上方，已被同一条规则覆盖） |
| `<!--count:…-->47<!--/count-->` | `frankenterm` | allow | **正确**：行内数值戳，位置无关的替换，不构成可搬移区域 |

**已闭合**：`FOREIGN_COMMENT_MARKER` 增加 `auto-generated\b`，并新增**区分大小写**的 `FOREIGN_TAG_MARKER`（全大写 tag 或 snake_case tag，且必须独占一行）；`>>>`/`<<<` 分支要求箭头后**有真实文本**。回归落点是 `test-install.sh` 的 P3 词表：**14 refuse / 18 allow = 32 行**，其中含 7 条**现场扫到的"无写入方"字面量**与 5 条"永不命中"形态——即**两个方向都钉住了**（既钉"必须认识的写入方 marker"，也钉"不许误拒的人工形态"）。

**负向验证（证明新行是承重的，不是装饰）**：把文法回退到 pass-2 版本，`cass` 句marker / `<project_rules>` / `<INSTRUCTIONS>` 三条都变 `allow`（实测），而 `<!-- >>> -->` 仍被误拒 ⇒ 新行确实堵住了两个方向。

### 13.13.5 本机"安装面"扩展扫描（是否还有第 12 个写入方）

| 检查 | 结果 |
|---|---|
| PATH 上的外部 agent 工具 | 只有 `claude`、`codex`（`~/.local/bin`）——`br`/`bv`/`ee`/`ntm`/`dcg`/`am`/`ubs` 等**一个都没装** |
| 家目录工具配置 | 只有 `~/.claude`、`~/.codex`；`~/.claude` 下**没有** `CLAUDE.md`；`~/.codex/AGENTS.md`(2403 B) 是**人工**个人规则（`BEGIN/END` 分节），不是写入方产物 |
| 继承面 | **无** `~/AGENTS.md`、**无** `~/code/AGENTS.md` ⇒ 13 个消费者仓之上**没有**父目录继承的根指令，APG 的"byte 0 所有权"假设在本机不被继承规则破坏 |
| APG marker 是否泄漏进家目录 | 只在 codex 的 **session 转录**（`.jsonl`）里出现，不在任何指令文件里 |

⇒ **本机没有未记录的第 12 个写入方**。这条是负面结论，但它是"扩展验证"必须给出的那种结论。

### 13.13.6 这次**没有**验证的（明确不确定性）

1. **8 个 go/rust 组件未真跑**（`bv`、`slb`、`sbh`、`am`、`ntm`、`ee`、`frankenterm`、`meta_skill`）：本机**无 go、无 cargo/rustc、无 bun**，它们的操作/备份/递归语义**全部来自源码阅读**（标 `scan`）。
2. **`ubs` 的真跑是"逐字抽取写入函数"**，不是上游入口：上游没有"只写 AGENTS.md"的入口，而完整安装器会下载二进制、改 rc、装 cron——按红线不允许执行。
3. **`pi_agent_rust` 的 5 个写入方在 vendored fixtures 里**，是否被上游 CI 真实使用未验证。
4. **`no writer found` 的边界**是"所列扩展名 + 写 API 站点"的字面量复核；若某组件从配置数据拼文件名则可能逃逸（未发现此类间接路径）。
5. **`cass` 未端到端真跑**（缺 bun），其 marker 字面量来自源码。

### 13.13.7 仍然待批/待定的两项（与本次验证直接相关）

| 事项 | 为什么没直接做 |
|---|---|
| 把版本号族从 `-agent-instructions-v\d+` 泛化为任意 `-[a-z-]+-v\d+`、并把 `BEGIN <NAME>` 也纳入 | **与主人已裁定的"窄口径"冲突**：现场这两种形态都**没有写入方**（人工提交），纳入就是为人工注释拒绝迁移。收益（防将来某组件改用这种形态）小于代价（误拒人工分节），故只把证据记进本节 + ADR，**不动文法** |
| **P6 观测账本**：记录"APG 见过哪些外来块" | 未批准；但本次普查正好提供了它的输入（11 个写入方 + 各自 marker + 是否备份）。整文件改写型（`ntm`/`acfs`）**没有账本就不可能事后归因**，P6 的价值因此比原判断更高 |
| **P7 块体积**：APG 自身块 2062 B vs 消费者 731–758 B | 未批准（ADR 0006 open item 原样保留） |

### 13.13.8 临时产物的生命周期

| 路径 | 内容 | 失效条件 / 删除方式 |
|---|---|---|
| `.agent-scratch/external-verify/census.json`、`evidence/` | 本次普查的原始证据（17 写入记录 / 51 语法结果 / 28 无写入方 + SHA256SUMS） | 已在 `decisions/0006` 与本节落成可读记录；**当 `.agent-scratch/external-test/repos/` 被删除时同步失效**；点名删除 `rm -rf .agent-scratch/external-verify`（不用通配符） |
| `.agent-scratch/external-test/repos/`（39 checkout，约 2.9 G） | 只读普查输入 | 与上同批；点名删除 |
| `.agent-scratch/consumer-gate/` | 现场语法扫描脚本 + 结果 | 结论已进 13.13.4；点名删除三个文件各自的名字 |

---

## 13.14 决策 11 第 6 步：五项合同的"有无承重"审计（2026-09-20）

§13.5 把"其余 5 项缺口"排在第 6 步（外部实测**之后**）。外部实测已完成（§13.13），故第 6 步开工。

第一步**不是造东西，而是核对链路**：§10.3 的表已经把结论写在"APG"这一列——五项**全部是 ✓**。所以这里的"缺口"指**生态缺口**（别人没有、只有 APG 有），不是"APG 没做"。真正值得查的是这五项各自那条链是否完整：

> **声明点（文档/ADR）→ 强制点（代码）→ 覆盖测试（断言）→ 被某个 runner 调用**

四项都能走通，**第五项断在最后一环**。

| 合同 | 强制点（代码） | 覆盖测试（具体断言） | 挂到 runner？ | 判定 |
|---|---|---|---|---|
| ① 主体权威合成（role→authority，低层不得降低高层 effect） | `lib/risk.mjs` 的 `composeRisk` / `maximumTier`（单调取最大）+ `routing/protected-effects.jsonl` + descriptor 的 `protected_effects` | `test-v2.mjs:373-378`（routine / material / destructive 三级合成）、`:615`（缺 descriptor → 直接 R3 fail-closed） | ✓ `test-release.sh` | **承重** |
| ② 项目 policy 的可复现身份（digest + 受管 marker + 内容 hash） | `lib/descriptor.mjs`（digest 字段校验）、`lib/block-integrity.mjs` + `lib/bootstrap.mjs`（锚）、`release manifest` / `verify-source`（逐文件 sha256） | `test-v2.mjs`（schema-1 锚三条：篡改 / 删 integrity 行 / 连锚一起删）、`test-install.sh`（guard 与 integrity）、`release verify-source` | ✓ | **承重**（3.0.9 加锚、3.0.10 加文法，两轮都在加固它） |
| ③ 证据与验收合同（非作者评审 / peer vs formal IV&V / `ready_for_verification`） | `lib/memory.mjs:89`（评审人必须非作者 → `memory_independence`）、`:112` 与 `:169`（评审绑定 digest、supersede 不可换锚） | `test-v2.mjs:451`（描述符变化后 `memory review` → `cas_conflict`） | ✓ | **承重** |
| ④ 观测分级（intended / host-observed / model_effective） | `lib/context.mjs:241`、`:315`、`:557`（`source_observation` 三元组，`model_effective` 恒为 `unknown`） | `test-v2.mjs:194`、`:385`（所有 dsh 源必须 `intended && !host_observed && model_effective==='unknown'`） | ✓ | **承重** |
| ⑤ 跨 harness 契约（harness-neutral + pinned release） | `scripts/test-genericity.mjs`（扫 39 个分发引导面找客户端词）+ `decisions/0005` | `test-genericity.mjs` 自身 | **✗ 没有** → **已修** | **承重，但此前空转** |

### 13.14.1 本轮唯一真发现：一份"有测试、没跑者"的合同

`scripts/test-genericity.mjs` 是 `decisions/0005-harness-neutral-core.md` 明文写的 gate（"a new genericity gate keeps guidance surfaces client-neutral"），`plans/DEVELOPMENT_ROADMAP.md` 也把它列为 R6-A 的交付物，历史交接记录甚至写着"每次改动后均跑"。但——**仓库里唯一枚举 gate 的入口 `scripts/test-release.sh` 从未调用它**，仓内也没有 `.github/workflows`。

⇒ 这个测试**当前 PASS**，但**没有任何机制会在回归时跑它**。合同 ⑤ 的"声明点"与"强制点"都在、"覆盖测试"也在，唯独**最后一环断**：测试不会被跑，所以合同会静默腐烂（这正是 ADR 0005 立它时要防的事）。

**已修**：`scripts/test-release.sh` 增加两行——

- `node scripts/test-genericity.mjs`（补上缺失的一环）；
- `./scripts/test-interop-br.sh`（P5 互操作；无 `br` 二进制时干净 SKIP，不需网络、不需工具链，所以对全新 clone 无副作用）。

修复本身**不进分发面**（`scripts/test-*` 不在 `SCRIPT_FILES`），因此**不需要升版本号、不动 manifest**：`sh scripts/test-release.sh` 全绿（含新挂的两道，P5 = 19/19）。

**教训（可复用判据）**："有覆盖测试"与"覆盖测试会被跑"是两件事。对**声明式合同**（本项目这五张底牌全是声明式的）尤其容易退化：文档里写着 gate，runner 里没有它。一个合同只有在**声明点、强制点、被调用的测试**三者同时成立时才算承重。

### 13.14.2 第 6 步仍未做（如实列出）

- **五项合同本身没有被改**：审计结论是四项承重、一项补挂载，所以本轮**没有**为它们新增任何公共契约面（也就不需要主人签字）。
- 剩下的"设计与回归"候选都**需要公共契约变更或主人裁定**，故停在门口：
  - ④ 是否引入新术语 **`declaration-observed`**（决策 8 已给建议，明确标注"进正式词表需主人签字"）；
  - ③ 是否把"peer review vs formal IV&V"从角色文档升级为**机器可判**的形态；
  - ⑤ 是否把 "harness-neutral" 从**门禁**升级为**声明式清单**（与决策 6 的能力词表同源，落地面仍卡在决策 2——主人已裁定"暂不开"）。
- **P6**（观测账本）与 **P7**（APG 自身块 2,062 B vs 消费者 731–758 B）仍未批准。

---

## 13.15 合并版待拍板清单（人工离线期间冻结，2026-09-20）

> 本节把 §11.12、§12.3、§13.5、§13.12、§13.13.7、§13.14.2 里散落的"等你拍板"合并成一份，供离线回来后一次过。**每行都写明"我因此没有做什么"**，避免把"没做"误读成"忘了"。
>
> **2026-09-20 更新：本表 1–13 项已由主人一次裁定为"全部按推荐"，逐项裁定与落地状态见 §13.19。** 14–17 项此前已闭合（各行末已标注）。
>
> 本轮（离线期间）已经**做完并推送**的不在此列：`decisions/0006` 写入方普查从 5 扩到 11 并闭合 P3 文法（3.0.10，`9ca96e0`）、外部拓展验证全记录（`fd8e2a3`）、五项合同审计 + 补挂 ADR 0005 的 genericity gate（`25cf2fa`）。仓内 `git status` 干净，全部在 `origin/main`。

| # | 事项 | 现状与证据 | 需要你定的 | 我因此没做 |
|---|---|---|---|---|
| 1 | P3 文法是否再泛化到 `-<word>-v{n}` 与 `<!-- BEGIN <NAME> -->` | 现场确有这两种形态，但**没有任何写入方发出**（`casr`/`dcg` 的文档小节、本机 `~/.codex/AGENTS.md` 的人工分节），全是人工提交（§13.13.4） | 确认"**不动**"（我的建议，理由=泛化即开始拒绝人工注释） | 未动文法；只把证据记档并用 32 行词表把边界钉住 |
| 2 | 决策 6 的**能力状态词表**写进哪个分发文件 | 观测输入已就绪（§13.12），但落地面=决策 2 的声明式 manifest，而决策 2 你已裁定"暂不开" | 是否开决策 2；或接受先只写进**非分发**的 ADR | **已确立：不进分发面**。复核时实测发现 `decisions/0007:55` 早已在**非分发**文档里记载 `available / degraded / not-installed`，所以本项**无需新写一份词表**（§13.19.1） |
| 3 | 新术语 `declaration-observed` | 决策 8 的映射要求："EE 声明了某等级"与"该等级为真"必须分开（§13.12） | 是否进正式词表（进词表=公共契约） | **未进正式词表**（按裁定）；已落进 **ADR 0008 决策 3**，明写"只在本记录内使用"，并连带写下"引用 ladder 必须写明 scale 名"（§13.19.1） |
| 4 | 决策 7 命名空间 `agent-project-guides:external:<command-name>` | 实测建议已成文（版本作字段、完整性作三元组、词法定界，§13.12） | 签字 | **已落地** `decisions/0008-external-component-identifiers-and-observation.md`：四条规则逐条附实测依据，并记录三个被否方案及其实测理由（§13.19.1） |
| 5 | 证据验收合同是否升级为**机器可判**（peer review vs formal IV&V） | 现状靠角色文档 + `lib/memory.mjs` 的非作者评审约束（§13.14 审计：承重） | 是否要机器可判形态（公共契约变更） | **未升级**（按裁定）；另做了一次实际审计：分发内容里唯一提及 formal IV&V 的 `roles/development/VERIFIER.md:21` **本身就是正确表述**，未发现过度声称（§13.19.1） |
| 6 | 跨 harness 契约是否升级为**声明式清单** | 现状=门禁（`test-genericity.mjs`，3.0.10 才挂进 runner）+ ADR 0005 | 同 #2 | 未改 |
| 7 | **P6 观测账本** | 未实现。普查把它的价值抬高了：`ntm`/`acfs`/`cass` 是整文件改写方，**没有账本就无法事后归因**（§13.13.7） | 是否批准 | → **已裁定：批准（最小形态）并已落地**：账本＋共用的标记词表＋`apg project observe`＋门禁（§13.19.4） |
| 8 | **P7 APG 自身块瘦身** | 2,063 B（3.0.10 后）vs 消费者 731–758 B；**已补逐条字节预算**（R3 单条占 24%，七条共 1,758 B），并**更正了这条比较**：消费者那 731–758 B 是 **v3 CLI 形态**（模板 647 B，用 383 B 的一段话覆盖了 v2 用 1,758 B 七条规则在做的事）——目标形态本仓**已在给消费方发货**（§13.18.10） | 三选一：**A** 只搬文字、保留 v2 marker 与 schema（预计省 ~1,360 B ≈ 66%，属**公共契约变更**）／**B** 接受不对称并写清（免批准）／**C** 真做 v3 自迁移（被 §12.2 实测的 `applicable: false` 挡住） | **已落地 A**：模板 1,969 → 1,023 B、安装后 2,063 → **1,117 B**（省 946 B／45.9%，低于估算，因 **R7** 与建议信句实测必须保留）；`reattest` 重盖章、catalog/manifest 重算、`test-v2.mjs` 三处同步。见 §13.19.5 |
| 9 | `docs/memory` 记录内嵌 `project_digest` 全面变旧 | **已量化：不是 18 次腐坏，是两个批次**，且两个批次**精确对应两个描述符纪元**：16 条 = 3.0.3 提交 `fefd4923` 的描述符摘要（`770fb1d4…`）、2 条 = 3.0.8 提交 `48a4c5a701` 的（`ffd693a0…`）；18/18 `state=promoted`，0 条与当前锚相符。根因由仓内既有记录定位到行号：**同一个锚被同时当作并发 CAS 护栏与历史溯源凭据**，于是描述符一动，此后**没有任何 promoted 记录还能被 supersede**（自托管项目每次升版必中）。（原写的"`project validate` 同名不同值"陷阱 **2026-09-20 复核撤销**：两者是同一函数同一值，见 §13.18.11） | 三选一：**A** 拆锚（唯一能让 supersede 恢复可用，属公共契约变更）／**B** 就地刷新摘要（**已定性为洗白历史，建议拒绝**）／**C** 加「纪元」字段让其可读。原附带的"给 `project validate` 同名字段改名"小项**已撤销**（前提不成立） | **已落地 A**：`lib/memory.mjs` 拆锚 ＋ `test-v2.mjs` 换成"畸形锚必拒／陈旧锚必通" ＋ `docs/V2_CONTRACT.md` 措辞；连带 `catalog`／`PACKAGE_MANIFEST` 重算。见 §13.19.6 |
| 10 | git tag | 只有 `v3.0.3`；`3.0.4`–`3.0.10` 未打标签（判据见 CHANGELOG 原文） | 是否补打标签（会影响远端） | **已补打并推送** `v3.0.4`–`v3.0.10`（7 个附注标签，逐个复核）。见 §13.19.3 |
| 11 | 消费者仓是否升到 3.0.10 | 12 个真实消费者仓仍是 schema 2 / 固定 3.0.7，全部 `state: ready`（§13.13.1） | 是否发布（**按既有纪律，消费者仓的治理更新不自动 commit/push**） | 未触碰任何消费者仓 |
| 12 | `.agent-scratch/` 外部试验区的去留 | `.agent-scratch/external-test/repos`（39 checkout，约 2.9 G）+ `external-verify`（普查原始证据，含 SHA256SUMS）已有生命周期标注（§13.13.8） | 是否点名删除（我保留原始证据以便复核） | **已裁定：保留，不点名删除**；含义与边界见 §13.19.7（未删任何东西） |
| 13 | 新 harness 的**长期证据**怎么保住 | `scripts/test-interop-writers.sh` 的输入是 gitignored 的 39 个 checkout，缺失时**干净 SKIP** ⇒ scratch 一删它就静默不跑了（§13.16.5） | 是否固定**最小子集**的获取方式：提交"从哪来/什么版本/sha256"清单，**不提交组件字节**（NOASSERTION 红线） | **清单已算好，只差一个签字**：11 个写入方全部来自 `github.com/Dicklesworthstone/`，9 个发布件的 repo+tag+asset id+归档/二进制双 sha256、2 个脚本件的 HEAD commit 全部在案，紧凑形式 **1,921 B**，替代 554 MiB 暂存件 + 2.9 GB checkout（§13.18.12）。落库即新增一个被跟踪文件，故仍待批准 |
| 14 | `frankenterm` 这一行是否值得换成"可观测" | 发布的 v0.15.1 根本没编进 agent 检测功能（二进制内 `ft-agent-config-`/`frankenterm:start` 出现 0 次，`robot agents configure` 返回 `feature_not_available`）；要测只能换构建（§13.17.3） | 是否批准装 Rust 工具链 + 大幅构建去测这一行；不批就让它**永久保持"未观测"标注** | 未构建；ADR 里已标成"未观测行，不得当作已测负例" → **已裁定：构建**；源构建 `0.15.6-rc.40` 已实测完成，ADR 该行升级为「源构建 RC 证据」（§13.18.4 / §13.18.8） |
| 15 | 沙箱证据与 287.5 MiB 发布件归档的去留 | `external-test/bin/`（9 件归档 + 解包件 + `install-manifest.json`）、`/tmp/apg-external-sandbox/`（暂存二进制 + 运行窗口）。scratch 一删，section D 就只剩一条 GAP（§13.17.5） | 与 #13 是同一问题的两面：固定"从哪来/版本/sha256"清单，还是接受这些断言退化为 SKIP；以及是否点名清理 | 未清；获取与校验流程已脚本化（重跑即可再生） → **已裁定：保留**，交给系统清理（§13.18.3）。另：清单本身已算好（§13.18.12），所以本行与 #13 可以**一次签字**解决 |
| 16 | `APG_EXTERNAL_BIN` 是否纳入 `test-release.sh` 默认 | 现在默认**不带**，`test-release.sh` 保持无网、无大件也能跑；真实二进制断言要显式给环境变量（§13.17.4） | 是否让默认 runner 也驱动真实二进制（会让 CI 依赖 287.5 MiB 本地件） | 未改默认；section D 缺输入时只报 1 条 GAP → **已改：默认即驱动**；并更正为「每缺一件记一条 GAP」（§13.18.2） |
| 17 | 被 git 跟踪的 `.mnemon/documents/index.json` 每次**读取**都会改（`lastAccessedAt`） | 本轮只是读了一次托管文档，`git status` 就多出一份纯时间戳 diff（内容 hash 与 `revision` 都没变）。每读一次脏一次，是台 treadmill | 二选一：把 `lastAccessedAt` 从跟踪面里去掉（改 `.gitignore` 或让工具别写它），或接受每次读完要提交一次纯时间戳 diff | 本轮按第二选项提交了（否则树不干净），但**没有改跟踪策略**——那是契约变更 → **已修**：`.gitattributes` + 每 clone opt-in 的 clean filter（§13.18.1） |

---

## 13.16 第 6 步续（第二轮）：把"声明的验证"变成可执行的门禁（2026-09-20）

本轮两类目标：(A) 把外部实测并入 `scripts/test-interop-*.sh`；(B) 落实决策 4 与"组织原则 ADR"。结论是 **(B) 的两项在仓内早已完成**（不是"已批准未实施"）——本节给出核验证据；真正缺的是 (A)，以及**两条"只写在散文里、没有跑者"的验证条款**。

### 13.16.1 (B) 核验：两项早已落地，逐条证据

| 项 | 落地位置（本轮亲验） | 门禁状态 | 本轮新鲜复核 |
|---|---|---|---|
| **决策 4**：catalog 也按**目录**跳过 `docs/memory` | `lib/core.mjs:30` 导出 `DIST_EXCLUDED_DIRS = new Set(['docs/memory'])`；`lib/core.mjs:186`（`listDistributionFiles`）与 `lib/catalog.mjs:3/:22`（`walkMarkdown`）**同读这一份**；`lib/catalog.mjs:21` 的注释明写"Same exclusion set as listDistributionFiles" | 回归断言在 `scripts/validate-routing.mjs:160`（`catalog must not collect distribution-excluded content`），且该文件由 `test-release.sh:15` 每次发布都跑 | **探针复核**：在 `docs/memory/__probe_guard.md` 放假 finding → `validate-routing` PASS、`catalog.jsonl` 内 `docs/memory` 命中 0；**负向**：注释掉 `lib/catalog.mjs:22` 的排除 → `error: catalog must not collect distribution-excluded content: docs/memory/__probe_guard.md`、exit 1；还原后 PASS。探针已按显式文件名删除 |
| **组织原则 ADR**（§10.4 + §11 三条决定） | `decisions/0007-authority-plane-and-execution-plane.md`（78 行，Status: accepted）：§10.4 的接口不变式＝"两个问题按序判定"（谁有权/凭什么/按什么合约 → APG；怎么找到/怎么记住/怎么跑起来 → 执行栈）＋四类结论（Native/Adapter/External/Reject）；§11 三条决定分别落在"External: retrieval and session search"、"Project memory is APG's, git-tracked, indexes derived and unattested"、"Adapter: harness integration, observation adapters, the managed root-instruction block protocol (ADR 0006), capability-state reporting"；决策 6 的词表（`available`/`degraded`/`not-installed`）落在"Honest capability state" | 其 Validation 段落此前**是纯散文** → 见 13.16.3（本轮补门禁） | 逐条对照 §10.4/§11 读完全文；英文行文符合仓内"decisions 用英文"的既有惯例（0006 同样） |

### 13.16.2 (A) 新增 `scripts/test-interop-writers.sh`：39 通过 / 0 失败 / 0 缺口

`test-interop-br.sh` 只回答"APG 与**一个**真实写入方共存吗"。新 harness 回答普查引出的更大问题：**ADR 记录的写入方事实，今天对着真组件还成立吗**——以及 APG 的守卫拒绝的是不是**写入方自己的字节**，而不是本仓手打的字面量。

| 段落 | 断言 | 为什么这样设计 |
|---|---|---|
| **A 字面量漂移** | 普查记录的 **20 条** marker 字面量，必须仍存在于自己所属的组件里（`grep -F` 全仓，允许文件移动但不允许字面量消失） | 普查是**主张**不是记忆。上游改了 marker，这里必须红，并提示"update decisions/0006" |
| **B 安全真跑** | `ubs --dry-run --easy-mode`：exit 0、输出含 `Would append scanner documentation to AGENTS.md.`、AGENTS.md 字节不变、无 `.backup`、**HOME 零写入**；`acfs --output`：产 4244 B 且**整文件替换**、无备份；`acfs deploy --project` 目标分歧时 exit 3、报 `REFUSED`、目标字节不变、写出 `AGENTS.md.acfs-new` | 全部是"会真写但只写在临时目录/fake HOME"的路径；`--dry-run` 用来钉**零写入**这条主张 |
| **C 真字节过守卫** | 从 ubs `install.sh` 的 heredoc（`quick_reference_block`）**逐字**抽出 2110 B 的块 → 置于 APG 区域**之上必须拒绝且文件不被改**；置于**之下必须放行** | "above 拒绝 / below 放行"是一对控制：单看非零退出无法排除"因无关原因失败" |

**它刻意不做的事**：不跑任何组件的完整安装器。`ubs --version` **不是标志**，会落入完整安装流程（下载二进制、改 rc、装 cron）——harness 头部把这条写死了。

**安全性**：无 sudo、无网络；每次外部调用都 `HOME` + `ACFS_TARGET_HOME` 指向一次性目录、cwd 不在任何仓库内；组件 checkout 只读；`SKIP` 条件=checkout 缺失（组件不随 APG 分发）。**负向证明**：把 `APG_EXTERNAL_REPOS` 指向把字面量抽掉的假 checkout → A 段按名失败、harness exit 1（假 fixture 已按名删除）。

### 13.16.3 同一判据用在 ADR 0007：`scripts/test-boundary.mjs`

ADR 0007 的 Validation 段写着"shipped CLI surface must contain no command that indexes, schedules, executes, or stores derived state"与"catalog/manifest regeneration confirms no external bytes entered the distribution surface"——**两句都只是散文，没有任何测试跑过它们**。这与 3.0.10 记下的教训（"有覆盖测试"≠"覆盖测试会被跑"）是同一类问题，所以本轮把它做成可执行的窄门禁：

- 从 `apg --help` 解析顶层命令组，与**钉死的 9 组**（`context/project/catalog/release/provider/migrate/risk/memory/dsh`）逐一比对——新增命令必须**刻意**改这个列表，从而被迫对着 ADR 0007 的"权威面/执行面"重新审视；
- 对"实际存在的组 ∪ 钉死的组"再做一次禁用名检查（`index|search|retriev|schedule|queue|job|run|execute|worker|daemon|serve|store|vector|cache|crawl|scrape`）——这样**钉死列表本身写错**也会被同一条规则抓住；
- 断言 `PACKAGE_MANIFEST.json` 的路径集合**等于**打包器自己的白名单 `listDistributionFiles()`（手塞一条路径进 manifest 会立刻红），且没有任何分发路径命中被普查组件的名字（防止 NOASSERTION 字节被 vendoring）。

**负向证明（两条，都实测）**：① 往钉死列表加 `search` → exit 1，报"names a mechanism ADR 0007 assigns to the execution stack"；② 往 manifest 塞 `lib/external_vendored_thing.mjs` → exit 1，报"does not match the packer allowlist"。还原后 PASS（9 命令组 / 81 分发文件）。

### 13.16.4 分发面与版本号

本轮新增/改动的是 `scripts/test-*`（不在 `SCRIPT_FILES` 白名单）、`decisions/`、`plans/`、`CHANGELOG.md`（均不在 `DIST_*`）——**没有一条落在分发面**，因此**不升版本号、不重建 manifest**：`PACKAGE_VERSION` 仍 3.0.10，manifest 仍 `sha256:9c768b73…`（81 文件），`release verify-source` 绿。两条新门禁已挂进 `scripts/test-release.sh`，与 3.0.10 补挂的 genericity gate 并列。

### 13.16.5 本轮新增的一条待拍板项（并入 §13.15）

新 harness 的输入是 `.agent-scratch/external-test/repos/` 的 39 个 checkout（**gitignored**）。checkout 缺失时它**干净 SKIP**——这意味着**它本身不构成长期证据**：scratch 一删，A/B/C 三段就静默不跑了。若要让这条证据长期活着，需要你定一件事：是否把**最小子集**（`ultimate_bug_scanner`、`agentic_coding_flywheel_setup`，加上已有 `br` 二进制）的获取方式固定下来（提交一份"从哪来、什么版本、sha256 是多少"的清单，而不是提交组件字节——后者违反 NOASSERTION 红线）。

## 13.17 第三轮：用**真实预编译发布件**跑完 8 个写入方 + 安装安全性检查（2026-09-20）

人工放行的口径是「装，并且看看 GitHub 有没有编好的，记得安全性检查」。结论先行：**GitHub 上九个组件全都有官方预编译的 linux/x86_64 发布件，所以 Go/Rust/bun 一个都不必装**——之前判定"需要工具链所以只能读源码"的八个写入方，这一轮全部用**它们自己的发布二进制**跑完了。

### 13.17.1 安装与安全性检查（fail-closed，全程落证据）

流水线按顺序、任一关不过就拒绝该组件并且**不落盘、不执行**：

1. **按 asset id 下载**（认证 `gh`，5000/h；匿名 API 60/h 在第一轮探测时就被打满）。逐件比对 GitHub 公布的字节数。发布件走的是**带签名、有时效的 CDN 链接**，九个里有三个第一次就断在这里（TLS handshake timeout / CDN 报错）——**被正确拒绝**，加退避重试后才取到。
2. **四路 SHA-256 必须一致**：`.sha256` 侧车、聚合 `checksums.txt`/`SHA256SUMS`、GitHub API 的 `digest` 字段、本地实算。实测一致源数 **3–5**（`cass` 只发侧车所以是 3，`bv`/`slb` 两个聚合文件都给所以是 5）。
3. **离线 minisign 验证**（机器上没有 `minisign`）：`minisign_verify.py` 直接实现格式（Ed25519 用 `cryptography`，Blake2b-512 用标准库）。**先自证再用**：真 `br` 归档 VALID、翻转一字节 REJECTED、换错公钥 REJECTED。结果：`br` 用 `D0A0A51BD147B836`，`slb`/`sbh`/`am` **共用 `D018F78BB279BD1B`**，四件全部 VALID（`sbh` 签的是 manifest，非归档本身）。
4. **解包前卫生扫描**：绝对路径 / `..` / 越界符号或硬链接 / setuid / 设备与 FIFO 成员——九件全清；解包用 `tarfile` 的 `filter="data"`（PEP 706）做第二道。
5. **只在沙箱里执行**（`unshare -rmn` 无特权 user+mount+net 命名空间）：真实 home 被影子目录 bind 覆盖（**实测 `/home/lijq` 与影子目录 inode 相同 = 1069620**，且往 `$HOME` 写的探针文件在真实 home 里不存在）；网络命名空间里 DNS 不通，**沙箱在跑之前先自检，不自检不过就拒绝执行**；`HOME`/`TMPDIR`/`XDG_*`/cwd 全部改道。因为本仓就在真实 home 下，沙箱内**连仓库都看不见**——比只读更强。

**如实报缺口**：`bv`/`ntm`/`ee`/`ft`/`cass` **一个签名都没有**；`slb`/`sbh`/`am` 共用一把钥匙（一把泄漏覆盖三个组件）；发布公钥与产物**同在作者自己的 GitHub 账号**上，账号被攻破则签名与校验和一起失效——签名挡的是 CDN 与构建机，不是账号；`gh` 是 2.45.0 没有 `attestation` 子命令，**本次没有做任何构建来源证明校验**（记为 GAP）；`ee` 的发布说明自述"在 GitHub Actions 之外构建、未签名、无 Sigstore"。

总量 **287.5 MiB**（9 件），全量报告在 `.agent-scratch/external-test/SECURITY-REPORT.md`（由 `write-security-report.py` 从 `install-manifest.json` 生成，不手写数字）。

### 13.17.2 沙箱本身的三次自我证伪（这里最花时间，也最值得记）

- **第一次**：沙箱根放在仓里 → 影子 home 把**沙箱自己**盖住了，`cd` 失败、探针跑错目录。挪到 `/tmp` 并说明为什么必须挪。
- **第二次**：`grep -v` 无匹配 → `pipefail` + `set -e` 让脚本在写 `result.json` 前退出，于是"全部 exit=1 无输出"。修掉，并把**原始事实**（全盘 mtime 扫描）与**归因**（对照窗口相减）拆成两步。
- **第三次（最重要）**：全盘扫描**永远不干净**——它抓到的是我自己的 harness session 日志、编辑器日志、MCP bridge 的 sqlite。**单次扫描不能定罪**。所以每个案例都配一个**对照窗口**（同沙箱、空命令）做集合相减（`attribute-escapes.py`）；减完之后，**所有组件在沙箱外都没有不可解释的写入**。
- 另有**负向对照**证明机制真的能抓：故意往 `$HOME/.config`、`$HOME/.local/share` 写文件 → `home_files` 立刻出现。所以"某组件无 HOME 写入"是真观察，不是盲区。

### 13.17.3 实测结果：8 个写入方，其中两个**推翻**了普查

`ntm quick` 根本不写 AGENTS.md（它写到 `~/ntm_Dev/<name>`），真正的写入方是 `ntm setup`（默认**跳过已存在**的文件）。用真实二进制逐条驱动后：

| 写入方 | 真实观测（不是源码） |
|---|---|
| `br` | `agents --add -f` exit 0；生成 `AGENTS.md.bak`；写 v1 标记；只动根文件 |
| `bv` | `--agents-add` exit 0；**写的是 v6**，而 checkouts 里源码写的是 v7；无备份；只动根文件 |
| `slb` | `integrations cursor-rules --install` 写的是 **`.cursorrules`**；`AGENTS.md` **字节不变**——它根本不是 AGENTS.md 写入方 |
| `ntm` | `setup --force` 把种子根文件（2140 B，含 APG 区块与手写正文）整份换成 2689 B 的 `<INSTRUCTIONS>` 模板，**无备份**；`quick` 不写 AGENTS.md |
| `ee` | `export agentsmd --create` 写 `ee:agentsmd:begin generation=0 hash=blake3:4e31560a725ff7c0`；`AGENTS.md.ee-backup` **与写入前逐字节相同**；`ee init` 本身在已有 AGENTS.md 时**要求 `--force`**；不递归 |
| `sbh` | `docs --render` 只重写已存在的标记区；`--check` 漂移时 exit 1 |
| `am` | 正好一对 `<!-- am:blurb -->`/`<!-- am:blurb:end -->`；无备份；**默认扫到深度 3（4 个文件），深度 4 不动**，`--max-depth 10` 可够到——`max_depth = 3` 由实测确认 |
| `cass` | 不给 `--force` 时 **exit 2 且文件不动**；给了之后根文件从 2140 B 缩到 261 B（APG 区块与手写正文全丢），无备份 |
| `ft` | **发布的 v0.15.1 里根本没有这个功能**：二进制中 `ft-agent-config-`/`frankenterm:start`/模板模块**出现 0 次**，`robot agents configure` 返回 `robot.feature_not_available`。此行只能算"源码测量"，**不能算观测** |

**两条真修正**（这就是"必须跑真货"的理由）：**① `bv` 的发布版是 v6，源码 HEAD 是 v7**——语法用 `v\d+` 所以不需要改代码，但任何把 v7 钉成"那就是版本"的测试，测的都是用户装不到的字符串；**② `slb` 行写错了**，它只写 `.cursorrules`。另有两条把"推测"升级成"实测"：`ntm` 的整文件**覆盖且无备份**、`cass` 的**先拒绝后覆盖**。`ft` 从"scan"降级为**明确缺口**（换一个构建才可能测，需要 Rust 工具链与大幅构建，属于待批）。

### 13.17.4 并入仓内的可复现证据

`scripts/test-interop-writers.sh` 新增 **section D**：驱动各组件的**发布二进制**并断言上表的观测事实（`APG_EXTERNAL_BIN` 指向解包目录，缺了就整段 SKIP 成一条 GAP，不影响其余）。实测 **65 通过 / 0 失败 / 1 缺口**（缺口即 `ft`）。section A/B/C 的 39 条在无二进制时照常跑（39 通过 / 0 失败 / 1 GAP）。ADR 0006 的普查表、修正块、Validation 与 Open items 已按实测改写。

### 13.17.5 本轮新增待拍板项（并入 §13.15）

- **`ft` 是否值得换构建再测**：需要 Rust 工具链 + 大幅构建，才能把这一行从"源码测量"变成"观测"。不做也行，但那一行必须保持"未观测"的标注。
- **沙箱证据的长期存活**：`/tmp/apg-external-sandbox/`（`_bin` 暂存 + run 窗口）与 `.agent-scratch/external-test/`（287.5 MiB 归档 + 解包件）都是**临时物**。scratch 一删，section D 就只剩一条 GAP。与 §13.16.5 是同一个问题的两面：要么固定"从哪来、什么版本、sha256 多少"的清单，要么接受这些断言会静默退化为 SKIP。
- **是否把 `APG_EXTERNAL_BIN` 纳入 `scripts/test-release.sh` 的默认路径**：现在默认 `test-release.sh` 不带它（保持 CI 无网、无大件可跑），要跑真实二进制得显式给环境变量。

---

## 13.18 第四轮：读取抖动修掉 + 第 14–17 行的裁定落地（2026-09-20）

放行口径原文：「（ft）后者就装……副本留着等系统自己删吧，默认驱动，去掉跟踪，然后继续你的计划」。§13.15 的第 14–17 行因此全部有了裁定。本节记实施证据；第 14 行因需要一次源码构建而单列，进度见 §13.18.4。

### 13.18.1 第 17 行：`lastAccessedAt` 的读取抖动（已修，带回滚点）

**问题**：`.mnemon/documents/index.json` 被 git 跟踪，而 Mnemon 的 documents 插件在**每次读取**时都会重写每条记录的 `lastAccessedAt`。于是「读一次托管文档」就让工作树变脏，提交里全是无意义的时间戳 diff。这是台 treadmill，不是配置问题。

**先排除的两条显然修法**（都实测过，都不行）：

| 想法 | 实测结果 | 结论 |
|---|---|---|
| 把 index.json 移出跟踪（`.gitignore`） | 移动文件后立刻 `mnemon_document_search` → `Error: ENOENT: no such file or directory, stat '.../.mnemon/documents/index.json'`，而且**索引不会被重建** | 索引是权威件，不能移出跟踪 |
| 让过滤器**删掉** `lastAccessedAt` 字段 | 读插件源码 `dsh-mnemon-source-documents/lib/index.js:157`：`parseRecord` 在 `typeof value.lastAccessedAt !== "string"` 时 `return void 0`，调用方把 undefined 当「这条不是文档」直接丢弃 | 删字段 = **静默丢掉全部 14 篇文档** |

**落地方案**：保留字段、只在**进入对象库的那条路径上**把它的值改写成该记录自己的 `updatedAt`。

- `.gitattributes`：恰好一条规则 `.mnemon/documents/index.json filter=apg-mnemon-index`；
- `scripts/git-filter-mnemon-index.mjs`：clean 过滤器。`JSON.parse` 失败、或顶层没有 `documents` 数组 → **逐字节原样透传**（不猜、不改）；否则把每条记录的 `lastAccessedAt` 设成自己的 `updatedAt`（缺失时退回固定哨兵 `1970-01-01T00:00:00.000Z`），再以 `JSON.stringify(parsed, null, 2) + "\n"` 写回；
- `scripts/setup-git-filters.sh`：git 没有随 clone 走的仓级配置，所以过滤器**天生是每 clone 自行 opt-in**。不跑这个脚本的 clone 会忽略该 attribute，行为与改动前完全一致——这是**去抖动**，不是正确性要求。

**验证链**：暂存 blob 与「过滤器作用于工作树文件」的输出**逐字节同哈希**（`ad317d40…8f84b`）；`git status` 对 index.json 显示 `M `（已暂存、工作树无差异），即真实访问时间留在盘上、进库的是归一化值。

**新鲜 clone 五步实测**（把一个 `git clone` 到 `/tmp` 的副本当真 clone 用，opt-in 设计的正反两面都验；副本已按显式名删除）：

| 步 | 动作 | 观测 |
|---|---|---|
| 1 | 克隆本仓 | `git config --get filter.apg-mnemon-index.clean` **为空** ⇒ 过滤配置确实不随 clone 走 |
| 2 | 未装过滤器时把 `lastAccessedAt` 全改成 2099 哨兵值 | `git status` → `M .mnemon/documents/index.json`（**脏**）⇒ 不装 = 旧行为，没改变任何已有 clone 的现状 |
| 3 | 跑 `sh scripts/setup-git-filters.sh` | 注册成功（脚本会打印校验命令） |
| 4 | 装好后再改成另一个哨兵值 | `git status` → **无输出**（干净）⇒ 在真 clone 里生效，不只是本仓 |
| 5 | 在该 clone 跑 `node scripts/test-mnemon-index-filter.mjs` | PASS |

**不破坏可复现性**：`.gitattributes` 不在分发面（`DIST_DIRS`/`DIST_FILES` 都不含它）；`test-boundary.mjs` 仍报 81 个分发文件 / 9 个命令组 PASS。

**门禁**：新增 `scripts/test-mnemon-index-filter.mjs`，并挂进 `scripts/test-release.sh`（`test-boundary.mjs` 与 `test-interop-writers.sh` 之间）。断言：attribute 恰好一条且指向本过滤器；`lastAccessedAt`→`updatedAt` 的改写；`updatedAt` 缺失时的哨兵；输出中每条 `lastAccessedAt` 仍是字符串（插件硬要求）；其余字段不变；**幂等**；`''`、`'not json at all\n'`、`'{"version":1,"documents":{}}'`、`'[]'` 四种非目标输入逐字节透传；当 `.mnemon/documents/index.json` 存在时每条记录的 `lastAccessedAt` 必须是字符串。

**回滚点**：`git config --unset filter.apg-mnemon-index.clean`（`setup-git-filters.sh` 内亦写明）。撤销后工作树立刻回到改动前行为。

**序列化细节（踩过，值得记）**：过滤器必须与插件用同一种序列化。第一次用 Python 默认 `ensure_ascii=True` 重写，中文被转义成 `\uXXXX`，`git status` 仍显示脏（`MM`）；改成 `ensure_ascii=False` 后 A/B 对照才干净（`-c filter.apg-mnemon-index.clean=cat` → `MM`，装过滤器 → `M `）。故过滤器用 Node 的 `JSON.stringify`，与插件同源。

### 13.18.2 第 16 行：默认驱动真实二进制（已改，含一处旧认知更正）

口径是「默认驱动」。核验后：`test-release.sh` **本来就**默认驱动 section D——`scripts/test-interop-writers.sh` 内 `EXT="${APG_EXTERNAL_BIN:-$ROOT/.agent-scratch/external-test/bin}"`，环境变量缺省时回落到仓内已暂存的解包目录。§13.15 第 16 行原来那句「现在默认不带」以及 `test-release.sh` 里的对应注释都是**写反了的旧认知**，本轮按实际行为改正。

同时把「缺件」语义写准。section D 的结构是 `if [ ! -d "$EXT" ]` 提前退出，因此有**两种**缺件形态，不能混为一谈：

| 缺什么 | 记多少 GAP | 后果 |
|---|---|---|
| 暂存目录 `$EXT` 本身不存在 | **一条** section 级 GAP（`D/*: no APG_EXTERNAL_BIN at …`） | 逐组件断言**全部不跑** |
| `$EXT` 在、但某个组件的二进制缺 | 该组件**一条** GAP，其余照跑 | 每组件是独立子块，互相不牵连 |

所以准确说法是「**目录在、单件缺** → 一件一条 GAP」，而不是「缺几件就报几条」。两种形态都**不会静默跳过**，这正是「断言退化为 SKIP 必须看得见」的要求（§13.16.5）。本节初稿曾把两种形态写成一句，是过度概括，已按源码改正。

**两次实测**（不是推理）：

| 运行 | 结果 | 说明 |
|---|---|---|
| `sh scripts/test-release.sh`（暂存件在） | exit 0，`== writers result: 65 passed, 0 failed, 1 gaps ==` | 那 1 条 GAP 就是第 14 行的 ft |
| `APG_EXTERNAL_BIN=/tmp/apg-nonexistent-dir sh scripts/test-interop-writers.sh` | exit 0，`== writers result: 39 passed, 0 failed, 1 gaps ==` | A/B/C 的 39 条照跑，D 只留 1 条 section 级 GAP |

### 13.18.3 第 15 行：暂存副本保留（已裁定）

口径是「副本留着等系统自己删吧」。因此 `.agent-scratch/external-test/bin/`（9 件归档 + 解包件 + `install-manifest.json`）、`.agent-scratch/external-test/repos/`（39 个 checkout）、`/tmp/apg-external-sandbox/` 与 `/tmp/apg-ft-build/` **都不点名清理**。获取与校验流程已脚本化（`probe-releases.py` / `install-components.py` / `minisign_verify.py` / `sandbox-run.sh`），真删了也能再生。

**一个必须说清的区别**（否则「等系统自己删」会被误读成两处都会自动消失）：

| 位置 | 会不会被自动回收 | 因此 |
|---|---|---|
| `/tmp/apg-external-sandbox/`、`/tmp/apg-ft-build/` | **会**——本机有清理规则 `/usr/lib/tmpfiles.d/tmp.conf:11` = `D /tmp 1777 root root 30d`，即 `systemd-tmpfiles` 定期清掉**30 天未被访问/修改**的内容 | 不需要任何后续动作（约 30 天无活动后自然消失） |
| `.agent-scratch/`（仓内、已 gitignore） | **不会**——它在工作区里，不在 `/tmp`，没有任何机制会动它 | 保留是**无限期**的；将来若要清，仍是一次显式的点名删除（并入第 12 行） |

代价照旧记账：这些目录一旦消失，section D 的相应断言就会变成 GAP（见 §13.16.5 与第 13 行）。这是被接受的取舍，不是遗漏。

### 13.18.4 第 14 行：ft 换构建（构建已完成；实测结论见 §13.18.8）

预编译件路线对 ft **确认无效**，证据如下表。因此这一行只能从源码构建，构建与实测进度在本小节续写。

| 检查 | 结果 |
|---|---|
| release 列表 | `v0.15.1` 为最新（2026-08-21），无更新 |
| linux/amd64 资产 | 仅 `ft-linux-amd64.tar.xz`（19,789,208 B），已下载并验过 |
| 是否有第二个构建变体（full / all-features） | **无**；资产表只有 darwin-arm64 / linux-amd64 / linux-arm64 / windows-amd64 |
| 源码仓 CI 产物 | **无**；clone 内不存在 `.github/workflows/`（单条压扁提交） |
| 该发布件的 feature 状态 | `agent-detection` 未编入；`robot agents list/detect/configure` 全部返回 `robot.feature_not_available`，hint 明写 "Rebuild ft with filesystem agent detection enabled." |

源码侧已确认的事实（供实测对照，仍属 scan 而非 observed）：marker 常量 `<!-- frankenterm:start -->` / `<!-- frankenterm:end -->`；`codex`/`gemini`/`cline`/`windsurf`/`opencode` → `AGENTS.md`，`claude` → `CLAUDE.md`，`cursor` → `.cursorrules`，`aider` → `CONVENTIONS.md`，`github_copilot` → `.github/copilot-instructions.md`；备份族前缀 `.ft-agent-config-`、后缀 `.backup`，并带 claim/ack 事务协议；`--scope` 默认 `Project`；`--agent` 省略时解析为**全部** inventory slug。

**构建的资源教训（值得留在仓内）**：这不是"加个 `-j` 就行"的问题，四轮才收敛。

| 轮次 | 配置 | 观测 | 结论 |
|---|---|---|---|
| 1 | `-j 16` | 23 GB 内存只剩 1 GB 可用，swap 吃掉 5–7 GB，两个 rustc 各 7.7 GB，load 17.3 | 直接威胁同机其他 agent，**不可接受** |
| 2 | `-j 1` + `nice -n 19` | 单 rustc（`asupersync`）仍爬到 **6.5 GB 且还在涨**，可用内存每 20 秒掉约 200 MB | 并行度不是唯一变量 |
| 3 | 同上 + `OPENSSL_NO_VENDOR=1` | 不再从源码编 OpenSSL（原本在跑 `make build_libs`） | 去掉一整块纯构建开销 |
| 4 | 再 + `CARGO_PROFILE_DEV_DEBUG=0` + `RUSTFLAGS=-Zthreads=1` | 中途快照读到 4.05 GB，随后同一进程涨到 7.42 GB；**全程峰值采样（每 10 秒）最终给出真实高水位**：单个 rustc **13,551,040 KB ≈ 12.9 GiB**，`MemAvailable` 最低 **4,619 MB** | 方向对，但**远不足以单独保证安全**——真正兜住的是看门狗 |

**最终验收（本轮构建的实测收尾）**：`Finished \`dev\` profile [unoptimized] target(s) in 28m 10s`；产物 `/tmp/apg-ft-build/target/debug/ft` = **307,854,936 B (293.6 MiB)**；看门狗阈值 3500 MB **未触发**，但最低可用内存只到 **4,619 MB**，距闸门 **1.1 GB**。也就是说：这轮"低占用配置"把并发压到了 1 个 rustc，可**单个 rustc 的峰值仍有 ~12.9 GiB**（dev profile 默认 `codegen-units=256`，`-Zthreads=1` 只压前端并行度，不压 codegen）。结论要写准：**限流降低了同时占用，但没有降低单进程峰值；安全边际来自看门狗，不是来自参数**。

> **一条自己的教训（必须留）**：我在本节初稿里写「降到 4.05 GB，可用内存稳定在 13–18 GB」，依据是**一次 `ps` 快照**。几分钟后同一个 rustc 就涨到 7.42 GB，那句话被自己的后续观测推翻；最终峰值（12.9 GiB）比我最初写的高出三倍。**单次快照不能支撑「降到 X」这类结论**。附带一个自己的小 bug 也该记：采样器把 `ps` 的 RSS（单位 KB）当 MB 打印，于是输出成 `13551040 MB (13233.44 GB)`——数字本身是真的，**单位是错的**（正确读数是 13,551,040 KB）。凡是用 `ps` 采样，先确认单位。

吃内存的主要是 **codegen 与调试信息**，而不是 `-j` 本身——但要注意两者的作用点不同：`-j 1` 管的是**同时有几个 rustc**，`CARGO_PROFILE_DEV_DEBUG=0` 与 `-Zthreads=1` 管的是**单个 rustc 内部**。实测下来前者效果确定（峰值从"两个 7.7 GB 并存"变成"一个最高 12.9 GiB"），后者的效果没有我最初以为的那么大（同一个 crate 从 6.5 GB 只压到 7.4 GB 量级，随后其他 crate 还是冲到 12.9 GiB）。**dev profile 默认 `codegen-units=256` 才是单进程峰值的主要来源**，这一轮没有去动它，留给下次。另外两条：`nice -n 19` + 内存看门狗（`MemAvailable` 低于阈值即中止）把"应该会轻一点"变成**强制上限**；以及 **cargo 被中断后下一轮会从头重编**（三次中断都观察到了，本轮的 `Compiling` 计数每次都从 0 重新开始），所以限流构建不能靠反复打断来"省资源"——打断反而是最费资源的操作。

#### 13.18.4.1 可复现的构建配方（**必须在仓内，因为 `/tmp` 会被清**）

上面那份配方原先只存在于 `/tmp/apg-ft-build/build5.sh`。`/tmp` 在本机由 `/usr/lib/tmpfiles.d/tmp.conf:11`（`D /tmp 1777 root root 30d`）按**年龄**清理，30 天后脚本与二进制一起消失，而 §13.18.8 的实测就再也复现不了。所以配方落进本节，`/tmp` 只作为缓存。

工具链来源（已验）：`.agent-scratch/external-test/toolchain/rust`，rustc 1.100.0-nightly（commit `908501772`，2026-08-30），`SHA256_MATCH b6ac13b4…0c65`，`VALIDSIG 108F66205EAEB0AAA8DD5E1C85AB96E6FA1BE5FE`。源码来源：`github.com` 上 frankenterm 仓的 clone，**HEAD = `31f255d56ff3c701475365cc9d4f369641b0251a`**（`0.15.6-rc.40`）。源码侧**没有做签名校验**（该仓没有可用的 tag 签名证据），这一点与九个预编译件的 `GAP` 记法一致，属**已知缺口而非已验通过**。

```bash
# 语义：只为"跑得起来"而构建，不为发布。内存是这里的约束，不是墙钟。
ROOT=/home/lijq/code/agent-project-guides/.agent-scratch/external-test
export PATH="$ROOT/toolchain/rust/bin:$PATH"      # 系统 cargo/rustc 不存在，必须显式给工具链
export CARGO_HOME="$ROOT/toolchain/cargo"
export CARGO_TARGET_DIR=/tmp/apg-ft-build/target  # 中间件放 /tmp，随系统清理，不进仓
export CARGO_NET_GIT_FETCH_WITH_CLI=true          # 关键：否则 libgit2 会走 HTTPS 代理去取 git 依赖而挂死
export OPENSSL_NO_VENDOR=1                        # 用系统 OpenSSL 3.0.13，别从源码编
export MAKEFLAGS=-j2                              # 兜住 build script 里 `make` 的默认并行度
export CARGO_PROFILE_DEV_DEBUG=0                  # dev profile 默认全量 DWARF，是单进程峰值主因
export RUSTFLAGS="-Zthreads=1"                    # 覆盖仓内 .cargo/config.toml 的 -Zthreads=4（故意的）
cd "$ROOT/repos/frankenterm"
nice -n 19 cargo build -p frankenterm -j 1        # 一次只跑一个 rustc
# 配套：一个每 10 秒采样 MemAvailable 的看门狗，低于阈值即中止（本轮阈值 3500 MB，实际最低 4,619 MB）
```

**收尾时怎么做才不会把配方也一起删掉**（本轮实际做法，值得照抄）：先 `cp target/debug/ft ./ft-0.15.6-rc.40` 并**验证副本能跑**（`--version` 输出与构建一致），再按**显式名**删掉 `target/`（那是 17 GB 的纯中间件）。结果：磁盘从 **10 GB 可用 / 90% 满** 变成 **27 GB 可用 / 72%**，而 293.6 MiB 的二进制仍在，形如 `APG_FT_SOURCE_BIN=/tmp/apg-ft-build/ft-0.15.6-rc.40`。删除**只**用显式名，不用通配符——这是本仓一贯的纪律。

### 13.18.5 顺带做的 runner 完整性审计（结论：无缺陷）

等编译时做的一次只读审计，回答「仓里还有没有第二个 `test-genericity.mjs`」（即**已写好、文档也说要跑、但没有任何 runner 调用**的测试）。这个问题在 3.0.10 才第一次被问，当时抓出一个摆设了三个版本的门。

| 检查 | 方法 | 结果 |
|---|---|---|
| 有没有孤儿门禁 | `ls scripts/test-*` 与 `test-release.sh` 里实际调用的脚本做集合差 | **0 个孤儿**（差集里只剩 `test-release.sh` 自己，那是 runner 不是门禁） |
| 会不会引用了不存在的门禁 | 把 runner 里出现的每个文件名逐个 `test -f` | **12/12 全部存在** |
| 有没有绕过 `test-release.sh` 的第二个入口 | 查 `.github/`、`Makefile`、`package.json`、`.gitlab-ci.yml`、`justfile`、`Taskfile.yml` | **一个都没有**（本仓无 CI 配置） |
| runner 里除 `test-*` 之外还调了什么 | 枚举 `node|sh|bash|./|python3` 开头的行 | `scripts/validate-routing.mjs`、`apg catalog check`、`apg project validate`、`apg release verify-source`、两个内联 `node -e` 探针、以及可选的真实 pilot（`APG_RUN_REAL_PILOTS=1` 才跑） |

也就是说：**`scripts/test-release.sh` 是唯一入口，且它引用的东西全部存在**。这条不是新发现，是把「runner 是否完整」从"看着像完整"变成"逐项验过"。

### 13.18.6 写入方证据的三档（把「observed」再分细一次）

§13.17 写的是「8 个写入方用**发布二进制**驱动」。读者会立刻问：普查有 11 行，为什么只驱动 8 个？这里有**三档**证据，不是两档，差别是实质性的：

| 档 | 写入方 | 怎么观测的 | 为什么不是"发布二进制" |
|---|---|---|---|
| **① 发布二进制真跑** | `br`、`bv`、`slb`、`ntm`、`am`、`cass`、`ee`、`sbh`（8 个） | 按 asset id 下载官方预编译件 → 四路 SHA-256 → 沙箱内驱动 | ——（这就是最理想的形态） |
| **② 组件自己的脚本真跑** | `ubs`、`acfs` | 从 checkout 里**执行它自己的脚本**：`install.sh --dry-run --easy-mode`（断言零写入、无 `.backup`）、`generate-root-agents-md.sh --output`（断言整份替换、无备份）、`deploy --project`（断言拒绝并留 `.acfs-new` 合并候选） | 这**两个组件的写入方本来就是安装脚本，不是 CLI 二进制**——`ubs` 的 marker 字面里就写着 `written by install.sh; removed by install.sh --uninstall`。跑二进制根本碰不到写入路径，所以"驱动二进制"对它们是错的方法，不是遗漏 |
| **③ 仅源码（未跑）** | *目前为空* | —— | 这一档的语义是"只读了源码、没有任何执行证据"。它**曾经**装着 `frankenterm`，ft 换构建后已升到 ④；保留该档的定义，是为了以后有人再往表里加行时有地方放"只读源码"这个真实状态，而不是被迫冒充成真跑 |
| **④ 组件源码构建后真跑** | `frankenterm`（`ft`） | 从源码构建 `0.15.6-rc.40`，再在沙箱里驱动（§13.18.4、§13.18.8） | 唯一发布件把 `agent-detection` 编掉了，换构建是唯一路径。它比 ①②弱的地方**不在"是不是真跑"**（是真跑），而在**"跑的不是用户会装到的那个件"**——所以 ADR 里该行始终标注为"源构建 RC 证据" |

**现在 11 行全部有真跑证据**（①8 + ②2 + ④1），③ 为空。这个 11/11 是 §13.18.9 覆盖判定能够定稿的前提。

所以 ADR 0006 每行的 `Evidence` 列写「scan + real run」时，**real run 指的是哪一档**必须能对上号：①②④都是真跑，但**只有①是"用户装到的东西"**，②是"组件自己的脚本"、④是"我们自己构建的件"。这条对得上当前 **69** 条 section D 断言：其中 `D/*` 是①（`ft` 那 12 条要显式给 `APG_FT_SOURCE_BIN` 才跑，否则记一条 GAP），`B/*` 是②。（§13.17.4 当时记的 65 条是 ft 换构建之前、且本轮的 P8 生存断言尚未加入时的数；两个变化见 §13.18.8 与 §13.18.9。）

### 13.18.7 沙箱隔离的**静默降级**（本轮真正意外抓到的一个缺陷，已修）

准备 ft 实测前先做沙箱自检（不想等构建完才发现跑不起来），结果沙箱**拒绝启动**。这本身是 fail-closed 的正确行为，但顺着查下去发现了一个更值得修的东西。

**诊断链**（每一步都是实跑，不是推断）：

| 测试 | 结果 | 说明 |
|---|---|---|
| `unshare -U true` | **rc=0** | 创建 user namespace 本身**允许**——所以不是"内核禁了 userns" |
| `unshare -r true` | `打不开 /proc/self/uid_map: 权限不够`（EACCES） | 卡在**写 uid_map**这一步 |
| `unshare -m true` / `unshare -n true`（不带 userns） | EPERM | **正常现象**，不是证据——无 userns 就没有 `CAP_SYS_ADMIN`，这正是要用 `-rmn` 组合的原因 |
| `/proc/self/status` | `Seccomp: 2`，`Seccomp_filters: 1` | 会话沙箱在给子进程下 seccomp |
| 会话文件策略 | 本会话为 **workspace-write**（此前那轮是 danger-full-access） | 与 111 次历史沙箱运行的环境差异就在这里 |
| 同命令换 `danger-full-access` 重试 | `unshare -rmn OK` | **确证**根因是文件沙箱（Landlock）拒绝了 `/proc/self/uid_map` 的写入 |

**两个后果，一个是正确的，一个是缺陷**：

1. `sandbox-run.sh` 在真正跑之前先自检 `unshare -rmn true`，不过就 **REFUSED** 退出——**正确**，它宁可不跑也不降级。所以上一轮那 111 次带 escape 计数的沙箱运行，是在更宽的文件策略下完成的（记录在 `/tmp/apg-external-sandbox/run/`）。
2. `scripts/test-interop-writers.sh` 的 section D 只写了 `if unshare -rn true 2>/dev/null; then NET="unshare -rmn"; fi`——**失败了就静默把隔离降成空**，然后照常打印 `0 failed`。也就是说：**今天跑的两次门禁（各 65 passed / 0 failed / 1 gap）其实是在没有网络隔离的条件下得到的**，而输出里一个字都没提。这违反了本仓自己反复强调的原则（"断言退化为 SKIP 必须看得见"，§13.16.5）。数字本身仍然成立（断言确实都跑了），但**它们不是在该 harness 声称的收容条件下取得的**。

**修法**（只加可见性，不改断言、不改计数）：新增 `note_warn`，隔离拿不到时打印一条 `WARN` 并说明原因；收尾多打一行 `section D isolation: …`。`65 passed / 0 failed / 1 gaps` 的格式**故意不动**，这样此前各处引用过的数字继续有效。

**为什么是 WARN 而不是 GAP**：断言全部跑到了，只是条件更弱；`GAP` 语义是"这条断言做不了"。两者都不该静默，但不是一个东西。

**两条分支都验过**（不用申请权限就能验）：真环境下跑 → 出现 `WARN`，收尾显示 `NOT network-isolated`；把一个**空操作 `unshare`** 放进 PATH 再跑 → 无 `WARN`，收尾显示 `network-isolated`。两次都是 `65 passed, 0 failed, 1 gaps`。

### 13.18.8 第 14 行收尾：ft 实测完成，并修掉三处**空洞 PASS**

源构建（`ft 0.15.6-rc.40 (31f255d…)`）拿到后补跑 13 个探针，结论如下。**所有数字都来自实跑**，且明确标为"源构建 RC 证据"，不是"发布件证据"——发布件根本执行不了这个写入。

| 观测项 | 结果 |
|---|---|
| 默认作用域 | `--scope project` 只重写 `./AGENTS.md`；摆在 `a/`、`a/b/`、`a/b/c/`、`a/b/c/d/` 的**四个字节相同的副本一个都没动** |
| 写入方式 | `action: append`，**纯追加**：既有 2094 B 全部作为精确前缀存活（`cmp -n` 比对） |
| 区块相对位置 | APG 区块 0–2031 B，ft 区块起于 **2100 B**——在 APG **下方** |
| replace 路径 | 预置过期 `frankenterm:start` 区块 → `action: replace`，过期文本清零，**APG 区块逐字节不变**（哈希比对） |
| 幂等 | 同一目录连跑两次：第 1 次改、第 2 次**逐字节不变**；两轮后 `frankenterm:start` 恰好 **1** 个、`end` 恰好 1 个 |
| 探测门槛 | `configure --agent codex` 需要 `$HOME/.codex/sessions` 存在，否则 `robot.invalid_args`（"not currently detected"）；探测本身只是 `root.exists()` |
| 根目录残留 | **6 项**：`.ft-agent-config-<32hex>.{backup,candidate,claim.json,ack.json}` + 空 `.ft-atomic-transition.lock` + `.ft/`（内含空 `crash/ diag/ logs/`）。只有 `.backup` 算恢复点 |

**一条旧认知要更正**：我此前按源码里的显式文件清单推断 ft 可能像 `am` 一样递归；实测是**不递归**，默认只碰项目根那一个文件。这正是"scan 不等于 observed"的又一例。

**安全性收尾（这一轮最要紧的一条）**：ft 每次启动都会把 4 个内置 `.ttf` 装进 `$HOME/.local/share/fonts` 并跑 `fc-cache -f`。13 个探针全在影子 home 下运行，收尾核对 **真 `/home/lijq/.local/share/fonts` 是空的**——字体与缓存全部落在沙箱内。escape 计数每轮 9 条，逐条核对后全部是环境噪声（`.dsh/sessions`、`.vscode-server/data/logs`），没有一条属于 ft。**但对照窗口并不能独立证明这一点**：某轮里 `agent-project-guides/plans/…` 也出现在 escape 列表里，那是**我自己在探针运行期间编辑计划文件**。对照窗口只能提示"有新写入"，归属仍需人知道自己在干什么——这条限制必须如实写，不能报成"干净"。

**门禁落地**：`scripts/test-interop-writers.sh` 的 ft 段重写为三段式——
1. `APG_FT_SOURCE_BIN` 指向源构建时，跑 **12 条**断言（append / 纯前缀 / 区块相对位置 / 不递归 / 幂等 / 单区块 / 4 个事务件 / replace 三连 / APG 区块哈希）；
2. 只暂存了发布件时，维持原来的 `feature_not_available` **GAP**；
3. 两者都没有时，GAP 文案改成"请设 `APG_FT_SOURCE_BIN`"。

三态各跑一次，全部符合预期：

| 运行 | 结果 |
|---|---|
| `APG_FT_SOURCE_BIN=<源构建>` | **77 passed, 0 failed, 0 gaps**（65 + 新增 12 条，原 ft GAP 消失），exit 0 |
| 不设该变量（默认） | **65 passed, 0 failed, 1 gaps**，exit 0 —— 数字与已引用过的完全一致 |
| `APG_FT_SOURCE_BIN=/bin/true`（负控制） | **9 FAIL**，exit 1 —— 证明这些断言会咬人，不是摆设 |

**为什么专门跑第 3 行**：改这一轮时我自己连续造出**三处空洞 PASS**，都是"断言在什么都没发生的情况下也会通过"：

| 空洞 PASS | 怎么被发现的 | 修法 |
|---|---|---|
| 我用 `mkdir -p "$FTD/home" …` 却漏了 `"$FTD/cwd"`，于是 `seed_root` 的 `cp` 目标目录不存在直接失败；ft 于是 `action: create` 新建文件，而我那条"区块位置"断言读到 `APG end=''` 才算暴露 | 断言真的 FAIL 了 | 补 `mkdir -p "$FTD/cwd"` |
| 同一个漏目录让 `sed` 在**不存在的文件**上取 APG 区块，前后两次都取到空串，于是"APG 区块逐字节不变"**通过** | 顺着上一条查文件才发现 `agents.before` 根本不存在 | 先要求 `agents.before` 里真能取到区块，取不到就判 FAIL 并说明"这条比对是空洞的" |
| 深递归快照把 `seed/a` 先写成**文件**、再想把它当**目录**用（`seed/a/b`），后三级快照静默没生成，"不递归"断言于是拿三个不存在的路径去比 | 计数是 `got '3', want '0'` 而不是 `0`——**数字不对才露出来** | 快照名改用扁平化（`seed-a`、`seed-a-b`…），并要求快照确实存在，否则判 FAIL |
| 幂等 / 不递归 / replace 后区块不变这三条都是"文件**没有**变化"型断言，用 `/bin/true` 替换 ft 时**全部空过** | 负控制跑出来的 | 用一个 `ft_wrote` 标志把这三条绑到"第一次写入确实发生且文件确实变长"，`/bin/true` 下三条全部 FAIL |

教训：**"没有变化"型断言必须绑定一个"变化确实发生过"的前置条件**，否则任何"静默什么都没干"的实现都能拿满分——而"静默什么都没干"恰好是插件、封装脚本、feature 未编入最常见的行为。这个负控制（`APG_FT_SOURCE_BIN=/bin/true`）现在是这条经验的**可执行形式**，可随时重跑。

**一条顺带的交叉验证**：本条 replace 断言里用 `sed` 抽出的 APG 区块，哈希是 `sha256:101cee60678964792bf626e6fea622cb27d9f9a350284bd9f01d3e2810c6bb62`；全量门禁 `project validate` 独立报出的 `bootstrap.root_block_hash` **是同一个值**。两边算的是不同东西（一边是我手写的正则在文件里截取，一边是规范定义的"marker 包裹区块的 sha256"），值相同说明 **harness 抽到的确实是规范区块字节**，而不是我正则凑巧匹配到的一段相似文本。这类"两条独立路径给出同一常量"的巧合值得记一笔，它是免费的正确性证据。

### 13.18.9 普查收口：11/11 全观测后的覆盖判定（映射不再等实测）

ft 一测完，写入方普查就是**全部 11 行都有实测**：8 行用各自的发布二进制驱动、2 行用各自的安装/生成脚本驱动（`ubs install.sh --dry-run`、`acfs generate-root-agents-md.sh`）、1 行（`ft`）用源构建驱动。此前"映射得等实测"等的就是这个输入，现在可以定稿。判定表写进 ADR 0006 的 **Coverage verdict** 小节（那是权威位置），这里只记推导方式与结论。

**三档不是按"有没有 marker"分的，而是按"marker 守卫能不能救"分的**：

| 档 | 写入方 | 对根文件的实测动作 | 起作用的防线 | 剩余缺口 |
|---|---|---|---|---|
| A 标记作用域内（6） | `br` `bv` `ee` `sbh` `frankenterm` `am` | 只动自己那对 marker，无人抢 byte 0 | P1 前缀 / P2 命名空间 / P4 恰好一次 / P9 完整性；`br` 另有 P5 端到端 | 无 |
| B 只追加、但恢复点不稳（1） | `ubs` | 追加；拷贝发生在"已存在"检查**之前**，二次运行会用改过的文件覆盖原始 `.backup` | P1/P2/P4 仍成立 | "ubs 有备份"不等于"能恢复首次运行前的状态" |
| C 整文件改写、marker 免疫（3） | `cass` `ntm` `acfs` | 从不读 marker，整文件替换 | **P3 在此档不可能生效**；只剩事后检测 + P8 恢复 | 见下 |

C 档的三条要点（都有实测支撑）：`install.sh check`（`validate_routing`/`validate_trigger`）**只在事后**发现；P8 备份是唯一退路，而它之所以还在，是因为 APG 的备份后缀 `.agent-project-guides.bak` 与所有写入方自己的备份名都不同；**顺序决定结果**——写入方在前、APG 在后，APG 重新占住前缀并把既有内容按字节与顺序下移（P1 的既定边界）；APG 在前、写入方在后，则 APG 区块被毁，只能靠 P8 还原。

**这一轮顺手把一个"靠命名推断"改成了实测。** 我原先写的是"因为没有任何写入方用这个名字，所以整文件改写不会覆盖 P8 备份"——**这是从命名推出的，不是观测**。而 C 档唯一的退路全靠这一条，推断撑不住。于是给 section D 加断言：先按 `install.sh` 的真实后缀埋一份 sibling 备份，跑完整文件改写，再断言它**逐字节不变**。`ntm setup --force` 与 `cass project --force` 两条都通过（cass 那条实测根文件 2,094 B → 261 B、APG 区块清零，而备份完好）。`acfs` **没有**这样测，它靠的是"shell `>` 只指向一个目标路径"这一机制性论据，所以在 ADR 里被明确标为**推断而非实测**——三行里测了两行，这个"2/3"必须写出来，不能让读者以为三行都测了。

**顺带更正一个旧计数。** ADR 里原有一句"十一个写入方里有四个完全没有恢复点"。普查补齐后不成立：在**会改动根指令文件的 10 个**写入方中，**3 个有稳定恢复点**（`br` `.md.bak`、`ee` `.ee-backup`、`frankenterm` `.ft-agent-config-*.backup`），**1 个的恢复点会被二次运行毁掉**（`ubs`），**6 个完全没有**（`bv`、`sbh`、`am`、`cass`、`ntm`、`acfs`）。旧数字是三个还没被二进制驱动时写下的。ADR 里那句原文**故意保留**，让"当时的数"和"补齐后的数"同时可见——这比悄悄改掉更诚实，也是本仓一贯做法。

**门禁计数变化**：新增 4 条断言（`ntm` +1、`cass` +3），`65 passed / 0 failed / 1 gaps` → **69 passed / 0 failed / 1 gaps**（那 1 条 GAP 仍是 ft，因为默认只暂存发布件、无法执行该写入）。

### 13.18.10 第 8 行（P7）的免批准准备：逐条字节预算 + 一个把问题问错的更正

第 8 行一直只有一句"APG 自身块 2,063 B vs 消费者 731–758 B"。主人没法据此判断该砍哪条，因为**没有逐条预算，也没有把两个块放在同一坐标系里**。这一轮补齐两者，结论是：**这个比较此前是错位的**。

**先量自己的块**（`bootstrap/AGENTS.v2-block.md`，模板 1,969 B；安装后替换占位符得 2,063 B）：

| 组成 | 字节 | 占模板 | 估算 tokens |
|---|---|---|---|
| marker + 标题 + 描述符行 | 211 B | 10% | ~53 |
| R1 直读 `.agent-project-guides.json` + 互信 | 227 B | 11% | ~57 |
| R2 跑精确的 `apg context` 路由 | 251 B | 12% | ~63 |
| **R3 `status=ready` / 澄清 / 报错即停 / 建议信** | **483 B** | **24%** | **~121** |
| R4 只用精确选中的源 / 禁 `latest` / 禁 glob | 287 B | 14% | ~72 |
| R5 `package_missing` 回退 | 206 B | 10% | ~52 |
| R6 `intended` 与 `host-observed` 不可混 | 118 B | 5% | ~30 |
| R7 声明不得降低效果或凭空产生权威 | 186 B | 9% | ~47 |
| 七条小计 | 1,758 B | 89% | ~442 |

单条最大的 R3 独占近四分之一——它其实捆了**四件事**：只在 `ready` 继续、`clarification_required` 问一个结构化问题、其他错误即停并上报、以及"没有合适选项时按最近的路由继续并**按 `templates/SUGGESTION_BOX.md` 写一封建议信到 `.agent-project-guides/local/suggestions/`**"。最后那件是一套**带落盘路径的流程**，而它自己的模板文件就在包内。

**更正：两个块用的不是同一套模板。** 我去读了 `lib/bootstrap-v3.mjs`，消费方那 731–758 B 是 **v3 CLI 形态**（`renderCliBlock`）：

| 形态 | 模板字节 | 结构 |
|---|---|---|
| APG 自己的 **v2** 块 | 1,969 B（装后 2,063） | 描述符行 + **7 条教义**，无路由表（路由靠 R2 一句话） |
| 消费方 **v3 CLI** 块 | **647 B** | 描述符行 + **一段 383 B 的话**：跑 `apg context`、只用其返回内容、受保护工作前先消除歧义、返回源是 intended 而非 model-effective、内容缺失显式失败且绝不回退 `latest` |
| 消费方 **v3 inline** 块 | 描述符行 ~242 B + 5 条规则 778 B + 内联路由表 | 另一条路线，规则压缩到 5 条后仍比 v2 的 7 条少 **980 B** |

647 B 模板加上真实 `project_id`/`variant`/版本/摘要替换后的增量，落在已记录的 731–758 B 区间内。（这个增量我是**估算**的：本次没有渲染真实 v3 描述符，因为那要读消费方仓；要精确到每个消费者，得对真描述符渲染一次。）

**这条更正为什么重要**：v3 CLI 块用 **383 B 的一段话**完成了 v2 用 **1,758 B 的七条规则**在做的事，而且它**已经在给消费方发货**。也就是说 P7 的目标形态不是假想，是**本仓已经在生产的形态**。v2 的七条里，每一条要么被那 383 B 覆盖（直读描述符 → "跑 `apg context`"；只用精确源 → "只用返回的治理内容"；禁 `latest` → 明写；观测分级 → "intended 且不证明 model-effective"；权威边界 → "受保护工作前先消除歧义"），要么本就由工具链强制而非靠散文（P4 恰好一次、P5 fail-closed、`package_missing` 是启动器会吐的错误码）。

**于是 P7 的真正可行域是三条，而不是"要不要精简文字"**：

| 选项 | 内容 | 实测/估算代价 | 性质 |
|---|---|---|---|
| **A 只搬文字，保留 v2 marker 与 schema** | 把 v2 的 7 条换成 v3 CLI 那段 383 B（v2 无内联路由表，需保留"跑 `apg context`"这句） | 预计 **~1,360 B（约 66%）**；不迁移、不改描述符、不动 schema | **公共契约变更**（分发模板 + `bootstrap.bytes` + `integrity` 哈希 + `test-install.sh` 的钉值），**需主人签字** |
| **B 接受不对称并写清** | 承认这是 APG 自托管的**已实测后果**，不是缺陷 | 0 | 文档，免批准 |
| **C 真做 v3 自迁移** | 让 APG 自己用 v3 形态 | 被 §12.2 实测的 `applicable: false`（`source-worktree-full-corpus`）挡住 | 需主人先解该 blocker |

**A 的风险必须写出来**：被删掉的 R6/R7 是目前**唯一常驻**的观测分级与权威边界表述。v3 CLI 那段以压缩形式覆盖了两者，但"压缩覆盖"与"逐条列举"不是一回事——这正是主人该拍的那个点，而不是我该替他拍的。

**2026-09-20 落地与一处更正**：主人选了 A，已实施，见 §13.19.5。但实施时的实测**推翻了上面那句话**——v3 CLI 段覆盖 **R6** 成立（逐字），覆盖 **R7** **不成立**（它只在 `docs/V2_CONTRACT.md:16` 有一句英文对应，`roles/*.md` 里没有）。于是 R7 逐字保留，代价 186 B。**最终省 946 B（45.9%），不是本节估算的 1,360 B（66%）**。

**我因此没做**：没有改任何分发模板、没有动 `bootstrap.bytes` 与 `integrity` 哈希、没有碰 `test-install.sh` 的钉值。第 8 行现在从"一句总量对比"变成"逐条预算 + 三条带价选项"，主人回来时只需选 A/B/C 之一。

### 13.18.11 第 9 行（`project_digest` 全面变旧）的免批准准备：它不是一个 18 次的腐坏，是**两个批次**

第 9 行原来写"18/18 全部落后于当前描述符"。这读起来像 18 处独立的文档腐烂，于是"要不要修"看起来很大。量化之后形状完全不同：

| 观测 | 结果 |
|---|---|
| 记录总数 | 18（`docs/memory/*.json`） |
| `project_digest` 与**当前锚**相符 | **0 条** |
| 不同的历史摘要值 | **只有 2 个**：`sha256:770fb1d4…d766` × **16** 条、`sha256:ffd693a0…0324` × **2** 条 |
| `state` | 18/18 全是 `promoted` |

也就是说：**16 条是同一个 3.0.3 时代的快照，2 条是较晚的一批**。这不是"每条记录各自变旧"，而是"整个记忆库被一次升版整体甩下"。

**先纠一个我自己踩的坑——但纠出来的结论与我先前写的相反。** 我第一版怀疑「有两个不同的东西都叫 `project_digest`」，并据此写下两个值（记忆锚 `8ffb102c…`、`project validate` 的 `e4ca3608…`）和一个"命名陷阱"。2026-09-20 在第 9 行落地前按实测重做，**这三样都不成立**：

| 复核项 | 实测 |
|---|---|
| `apg project validate` 的 `project_digest` 从哪来 | `scripts/apg.mjs:471` = `projectDigest(descriptor)` —— **就是记忆子系统的同一个函数** |
| 当前 `projectDigest(readDescriptor())` | `sha256:e4ca36081ba293fc43396ba3f8b9612d075a66bd9a278343e240d90092b66b1a` |
| `apg project validate` 输出里的同名字段 | `sha256:e4ca36081ba293fc43396ba3f8b9612d075a66bd9a278343e240d90092b66b1a` —— **逐字符相同** |
| 那么有同名冲突吗 | **没有**。没有陷阱，也没有那个"独立小项" |
| 先前写的 `8ffb102c…` 是什么 | **复现不出来**：扫遍 12 个曾改动描述符的提交（每个发布提交对应一个状态）不含它；再试 11 种派生（`schema_version:2`、去掉 `integrity`／去掉 `provider`、`provider.digest=observed`、`raw+\n`、各子对象…）也全不命中。它是我上一轮写下的**错数字** |

**但真正的证据在这次复核里变强了，而且强得多：把 18 条记录的锚拿去比对描述符*历史*，而不是只比当前值。**

| 记录里的锚 | 条数 | 对应的描述符状态 |
|---|---|---|
| `sha256:770fb1d4…d766` | **16** | 3.0.3 提交 `fefd4923` 的描述符摘要 |
| `sha256:ffd693a0…0324` | **2** | 3.0.8 提交 `48a4c5a701` 的描述符摘要 |
| 当前（3.0.10）`sha256:e4ca3608…` | —— | **0 条相符** |

锚**精确等于"记录被 promote 那一刻的描述符摘要"**，(16 + 2) 恰好解释全部 18 条、无剩余。这比原来那句"0 条相符"有力：变旧不是随机漂移，而是**每次升版把整个记忆库整体甩下**。所以这一节从此不再需要"用哪个参照"的免责声明——只有一个锚。

**机制不是我推断的，是记录自己写着的。** 仓里有一条 `finding.m1.memory-supersede-anchor-frozen-by-descriptor-drift.json`（属于那 2 条较新的一批）已经把根因定位到行号，现摘其要点：

- `projectDigest(descriptor)` 覆盖**整个 descriptor**，不是只覆盖 release（`lib/memory.mjs:50-52`）。
- `supersede` 的前置校验要求**历史记录**的 `project_digest` 等于**当前**摘要，否则抛 `invalid_memory`（`lib/memory.mjs:166-173`，判定在 `:168`）。
- `promoted` 记录**不能** purge，只能 supersede（`:177-183`，拒绝码 `memory_state`）。
- 同一锚还被用于校验**当次**提案（`:102`、`:110`，两处都抛 `cas_conflict`）——**对短命提案这是正确的并发 CAS**。

**所以真正的缺陷是一句话：同一个锚（当前摘要）被同时当作「并发 CAS 的护栏」和「历史记录的溯源凭据」。** 前者必须随当前描述符变化，后者**必须不随**。把后者绑到前者上，就得到一个逻辑后果：**一旦描述符动过一次，此后没有任何 `promoted` 记录还能被 supersede**——而 `release` 在摘要内、`lib/descriptor.mjs:56-64` 又强制 `release === PACKAGE_VERSION`，所以自托管项目**每次升版必然命中**。本仓正是这种项目。

**三条候选，代价与性质**：

| 选项 | 内容 | 代价 / 爆炸半径 | 性质 |
|---|---|---|---|
| **A 拆锚（把并发 CAS 与历史溯源分开）** | `supersede` 不再要求历史记录携带当前摘要；改为校验：prior 确为 `promoted`、链条单步（无二次 supersede）、prior 的溯源信息自洽；**提案本身仍必须携带当前摘要**，从而保住新内容的 CAS 性质 | 改 `lib/memory.mjs`（**分发文件**）+ 记录形状 + `test-v2.mjs:506-521` 的同步义务（把旧语义钉死的那条断言） + 可能的记录 schema | **公共契约变更**，需签字。这是唯一能让 supersede 恢复可用的选项 |
| **B 就地刷新 18 条摘要** | 把旧值改成当前值 | 表面零代码 | **拒绝**：那等于声称这 18 条都在当前描述符下被评审过——是**洗白历史**而非修复，且每次升版都要重做一遍 |
| **C 接受并让其可读** | 加一个机器可读的「纪元」字段，让"已冻结的旧锚"看起来是**正常状态**而不是损坏 | 只加字段 | 文档/形状变更；不解决 supersede 不可用 |

**那个"独立的小项"撤销，因为它的前提是错的。** 我先前提议给 `project validate` 报的 `project_digest` 改名，理由是它与记忆锚"同名不同值"。复核后**该前提不成立**：两者是同一个函数的同一个值。改名不会消除任何歧义，只会凭空制造一次没有收益的公共契约变更。**所以第 9 行只剩"拆锚"这一件事**，落地见 §13.19.6。

**一个可直接测的后果**：这件事有一个**具体的受害者**，不是抽象风险——`finding.h1.bootstrap-token-only-validation` 仍是 `state: promoted`、trigger/residual 是旧文本，**按上述机制它永远无法被 supersede**。也就是说"知道它过时"与"能把它标成过时"之间被这段代码切断了。

**我因此没做**：没有改 `lib/memory.mjs`（分发件）、没有刷新任何记录的摘要、没有动 `test-v2.mjs` 的同步义务、没有 supersede 任何记录。本轮也**没有**现场复现 supersede 失败——那需要一个提案文件且属写操作；上述机制来自**源码行号 + 仓内既有记录**，我标明它是"读取所得"而不是"本轮实测"。第 9 行现在只需选 A/B/C。

### 13.18.12 第 13/15 行：最小子集溯源清单（**已经生成过，只差"是否落库"**）

第 13 行问的是"是否提交一份'从哪来/什么版本/sha256'清单，不提交组件字节"。查证结果：**这份清单已经存在且完整**，只是躺在 gitignored 的 `.agent-scratch/external-test/bin/install-manifest.json` 里，随 scratch 一起消失。所以这一行不是"要不要去做清单"，而是"**要不要把已经算好的清单搬进仓内**"。

**11 个写入方全部来自同一个账号** `github.com/Dicklesworthstone/`。九个用发布件驱动的：

| # | 组件 | 仓（`github.com/` 下） | tag | asset id | 归档 sha256 | 二进制 sha256 | 二进制字节 | 一致性来源数 |
|---|---|---|---|---|---|---|---|---|
| 1 | `am` | `Dicklesworthstone/mcp_agent_mail_rust` | `v0.3.36` | `567702786` | `6b1cfa177894a12bd69675d837cb08756f52028cdeddc6f9412c14f04f01bf18` | `e6cf98a365fae0d569d865e3f43e1068153191bb18641d663fbf4803705e77a7` | 108,625,408 | 4 |
| 2 | `br` | `Dicklesworthstone/beads_rust` | `v0.6.0` | `558566073` | `f6f9a1663bae31e94d2dcfec62163f15b17f822711c486e860183a654784829b` | `21b967c1ae68df1a2e8eb2256d13b8e57d293d89e331933919076104832ddbc0` | 27,772,512 | 4 |
| 3 | `bv` | `Dicklesworthstone/beads_viewer` | `v0.25.0` | `559836215` | `ea756bfadd165b66368b512cf3d7e036e5757df5d7c8f8e2b43a12e0a51b6429` | `9b994d14f0027ed0c7e5b3a0e9bfea262a85cb1c198ec0e38256aebb4bd68249` | 44,675,234 | 5 |
| 4 | `cass` | `Dicklesworthstone/cass_memory_system` | `v0.2.14` | `528595802` | `6c24c455921e4dba8a6aa298c24a5065d3717e0a44e6fbab28922b87a324c100` | `6c24c455921e4dba8a6aa298c24a5065d3717e0a44e6fbab28922b87a324c100` | 136,325,248 | 3 |
| 5 | `ee` | `Dicklesworthstone/eidetic_engine_cli` | `v0.15.2` | `559768412` | `b70c2deaed56b3154e204de6d16c473c50e82fd2d1aa636ecf92d22da0bde46c` | `a8a89f62d2b764c85b3d53c70a1413bbc967ac1f6bf0b040979e912c10097438` | 129,261,472 | 4 |
| 6 | `ft` | `Dicklesworthstone/frankenterm` | `v0.15.1` | `524396067` | `f063460275836799fa887a2765616c87109b410b9ebef1febbfee106376de12f` | `f8b04bfd3bcd144889d2e0f1a6ec21823857734be507a477928a6fed460e2bea` | 60,556,280 | 4 |
| 7 | `ntm` | `Dicklesworthstone/ntm` | `v1.35.1` | `564088481` | `910712dff11770d2f0858e168a73d43228ec625b7f68d4ea9be61685c0c8ed44` | `7907cc6b0ad8e0826c5699fc01120db3c52992c120a9ee26c530a60da78941e8` | 52,564,130 | 4 |
| 8 | `sbh` | `Dicklesworthstone/storage_ballast_helper` | `v0.6.2` | `554680556` | `f8dc4a9fb0c5ab4cce94827c7b30d3dc06b285b76197ea2d8da073807a6d7be9` | `357098c4fdf0584eceb4723d643f127df412c2b84adfab1794a2257fe8d0babc` | 6,534,632 | 4 |
| 9 | `slb` | `Dicklesworthstone/slb` | `v0.4.1` | `548265196` | `9c398fb7f8d3bdaca8ad4e70497e84451609993eb5ba4e9b7cea52a8a7247972` | `3781e330a06ca15ba137551b375eb2a93795cc5077d7d14ea2dd87be042651c9` | 14,934,178 | 5 |

两个用**它们自己的脚本**驱动（写入方就是安装/生成脚本，不是 CLI，所以只能这样驱动）：

| 组件 | 仓 | 驱动方式 | 记录到的 commit |
|---|---|---|---|
| `ubs` | `github.com/Dicklesworthstone/ultimate_bug_scanner.git` | 它自己的脚本 | `862357b201f60b859caa271c56bd1894dd7d5fd2` |
| `acfs` | `github.com/Dicklesworthstone/agentic_coding_flywheel_setup.git` | 它自己的脚本 | `b042ffba3b6f874db0608c8171a42c577bdc2f1f` |

两处需要说明，否则这张表会被读错：

- **`am` 的归档里有 2 个二进制**：`am`（108,625,408, `e6cf98a365fae0d569d865e3f43e1068153191bb18641d663fbf4803705e77a7`）与 `mcp-agent-mail`（108,842,688, `0334724c8704579e…`）。表里列的是普查与 section D **实际驱动的那个 `am`**，不是归档里更大的那个。
- **`cass` 的"归档摘要"与"二进制摘要"相同**，因为它的发布资产**就是裸二进制**（`cass-memory-linux-x64`），没有外层归档。这不是复制粘贴错误。

**规模账**（这才是决策的要害）：上面这张表的**紧凑形式只有 1,921 B**，而它替代的是 **581,249,094 B ≈ 554 MiB** 的暂存二进制、加上 39 个 checkout 约 **2.9 GB**。也就是说：**约 1.9 KB 的仓内清单，可以把"section D 的断言能否复现"从"取决于 gitignored scratch 还在不在"变成"任何人照清单重跑即可"**——而按 NOASSERTION 红线，组件字节本身**不**入库。

**校验状态**（每个都有多来源交叉，不是单点）：九个组件的归档摘要各有 **3–5 个独立来源一致**（`am`/`br`/`ee`/`ft`/`ntm`/`sbh` 为 4，`bv`/`slb` 为 5，`cass` 为 3）。`br` 的 `verify_skipped_signatures` 列出的是**其它平台**的归档（darwin/windows/musl/arm64），本轮实际使用的 linux/amd64 件不在此列，且另有 `scripts/test-interop-br.sh` 对其做发布资产级 SHA256 校验。**仍然没有做构建溯源（build provenance）**——这一条在九个组件上都是明确缺口，不应被上面这些数字掩盖。

**清单自带一个更强的用处**：它是第 15 行（暂存件与 287.5 MiB 归档的去留）的**前提**。有了它，删 scratch 就不再等于"section D 静默退化"，而只是"下次要跑时照清单重新拉一次"。两行是同一个问题的两面，可以**一次签字解决**。

**我因此没做**：没有把清单落库（那是第 13 行要主人点头的事——它新增一个被跟踪文件），没有删任何 scratch，没有重新下载任何组件。清单内容在上面，主人若点头，落库即照此写入。

## 13.19 主人裁定（2026-09-20）：13 项一次过，全部按推荐

主人回复"全部按推荐处理"。本表把**裁定**、**建议理由**与**落地状态**钉在一起，避免日后有人把"裁定不动"读成"忘了做"，也避免把"已签字但尚未实施"冒充成"已完成"。

| # | 裁定 | 落地状态 |
|---|---|---|
| 1 | **不动** —— P3 文法不再泛化到 `-<word>-v{n}` 与 `<!-- BEGIN NAME -->` | 无需改代码。边界已由 `scripts/test-install.sh` 的 32 行词表**双向**钉住（14 形必须拒、18 形必须放） |
| 2 | **只写进非分发的 ADR** —— 能力状态词表不进分发面 | **无需新写即已成立**：`decisions/0007:55` 早已在非分发文档里记载该词表。见 §13.19.1 |
| 3 | **暂不进正式词表** —— `declaration-observed` 先在 ADR 内使用 | **已落地** ADR 0008 决策 3，并明写"只在本记录内使用"。见 §13.19.1 |
| 4 | **签字落地** —— 命名空间 `agent-project-guides:external:<command-name>` | **已写** `decisions/0008-external-component-identifiers-and-observation.md`；因落地面（决策 2 的声明式 manifest）仍未开，它与 #2 一致地**不进分发面**。见 §13.19.1 |
| 5 | **暂不升级为机器可判** —— 但对外措辞不得声称 formal IV&V | 见 §13.19.1 的措辞纪律 |
| 6 | **同 #2** —— 跨 harness 契约维持门禁 + ADR 0005 形态 | 无需改代码 |
| 7 | **批准，限定最小形态** —— 观测账本只记 APG *看到*了什么，不编辑、不升级、不删除 | **已落地**：`lib/observation-ledger.mjs`＋`lib/root-marker-grammar.mjs`＋`apg project observe`＋门禁；分发面 81 → 83，摘要 → `sha256:148974e8…`。见 §13.19.4 |
| 8 | **选 A** —— 只搬文字、保留 v2 marker 与 schema | 见 §13.19.5（实测省 946 B／45.9%，低于估算的 66%，因 R7 与建议信句被保留） |
| 9 | **选 A 拆锚**（原附带的"给 `project validate` 同名字段改名"**经复核撤销**：前提不成立，两者本就同值） | 见 §13.19.6 |
| 10 | **补打标签** `v3.0.4`–`v3.0.10` | 见 §13.19.3（§13.19.2 只覆盖 #13） |
| 11 | **暂不发布**消费者仓（12 仓维持 schema 2 / 3.0.7） | 未触碰任何消费者仓 |
| 12 | **保留** `.agent-scratch/`，不点名删除 | 未删任何东西。裁定的具体含义（保留什么、删除的真实代价、它不意味着什么）见 §13.19.7 |
| 13 | **落库**最小子集溯源清单（连带 #15 一并解决） | 见 §13.19.2 |

### 13.19.1 纯维度裁定（#1/#2/#3/#4/#5/#6）与它们共同的一条纪律

这六项的共同点是：它们都在**新增或修改公共词汇面**，而主人在同一批里同时选择了"**不开决策 2**"。于是裁定自然分成两类：

- **#1 / #6**：改的是**门禁与既有 ADR**，不新增词汇 → 维持现状即可，无需改代码。
- **#2 / #3 / #4**：都是新词汇面，而它们的**落地面是同一个**（决策 2 的声明式 manifest）。决策 2 不开，于是三者的落点统一为**非分发的 ADR**。这样设计不丢失、可复核，也不会给一个"没有消费者"的契约增加表面积。

**#4 的裁定是"签字"，但签字不等于进分发面。** 把这条写清很重要：`agent-project-guides:external:<command-name>` 现在是**本仓内的约定**（ADR 0008），四条规则（调用名而非仓库名、版本作字段、词法定界、完整性作三元组）都可复核；等决策 2 打开时，它是**现成的落库内容**，而不是要重新研究的题目。

**#5 附带一条措辞纪律**（这是本次裁定的一个实质后果，值得单独记）：既然证据验收合同**不**升级为机器可判，那么 APG 在任何对外文字里**不得**声称自己做 formal IV&V。现状的准确说法是"角色文档 + `lib/memory.mjs` 的非作者评审约束"，它在 §13.14 的审计里被判为**承重**，但它是**程序约束**，不是机器可判的形式验证。两者混用会让"承重"这个词看起来比实际更强。

**2026-09-20 落地：ADR 0008 已写；而 #2 比预想的更早就位。**

- **#4 落成 `decisions/0008-external-component-identifiers-and-observation.md`**：四条规则（调用名而非仓库名、版本作字段、词法定界、完整性作三元组）逐条对上实测依据，并附三个被否方案及其实测理由（仓库目录名、版本进命名空间、dot-dir 名——后者有 `.cass/` 被两个互不相关组件同时占用的硬证据）。`decisions/` 不在 `DIST_DIRS` 内，所以它**确实是非分发**的；`scripts/test-boundary.mjs` 同时断言分发路径不得出现被普查的第三方组件名。
- **#2 无需新写一份词表。** 落地前复核发现 `decisions/0007` 第 55 行**已经**写着 `available / degraded / not-installed`（"诚实能力状态…never as supported"），而 0007 本来就是非分发文档。也就是说裁定 #2"只写进非分发的 ADR"**在裁定当天就已经成立**。本轮只把它记明确，不造第二份同义词表——重复写一份反而会让两处将来不同步。
- **#3 `declaration-observed` 落进 ADR 0008 决策 3**：明写"只在本文档内使用、不进正式词表"，并连带记下两条来自实测的约束——该组件的 trust 阶梯**只做注意力排序、永不作为权威**；引用其数字**必须同时写明 scale 名**（实测它至少有 4 套数值区间重叠且互不兼容的阶梯，任取一个数字都不可解释）。
- **#5 的措辞纪律做了一次实际审计，结论是"当前无违规"**：在 `docs roles routing procedures bootstrap templates profiles catalog` 内搜 `IV&V` / `independent verification` / `formal verification` / `formally verified`，唯一命中是 `roles/development/VERIFIER.md:21`，而它本身**就是正确表述**——"同身份、工作树和权限的第二个 Agent 只能提供 peer challenge，不能声称 formal IV&V"。`profiles/CONTENT_PACKAGE.md:27` 的 "Independent verification" 是一个验证预设的**名称**，不是独立性声称。所以这条纪律是一条"以后别写错"的约束，不是一处待修的过度声称；本轮不据此改任何分发文字。

### 13.19.2 #13 落地：溯源清单已入库（含一处尺寸更正），#10 见 §13.19.3

新文件 `scripts/external-components.json`，配一个新门禁 `scripts/test-external-provenance.mjs`，已挂进 `scripts/test-release.sh`。

**更正一个我自己的数字**：我此前写"紧凑形式 **1,921 B**"。那是按 `[repo, tag, asset_id, 归档 sha256, 二进制 sha256, 字节数]` 六元组算的**理论下界**；实际落库的文件是 **7,330 B**（缩进 JSON，含 purpose / not_distributed / verification 三段说明），其中六元组载荷 **2,015 B**。1,921 → 7,330 是**同一件事的两种口径**，不该混用。结论不变（7.3 KB 换回 554 MiB + 2.9 GB 的可复现性），但数字要写对。

**文件里刻意保留的三段"防误读"文字**（不是装饰，是门禁会检查的内容）：

- `verification.build_provenance` 以 **`NOT PERFORMED`** 开头。这是最容易被后人删掉的一段，因为上面那排"3–5 个来源一致"看起来像个安全结论——而它**不是**：一致的校验和只能证明"下载到的与上游发布的一致"，**不能**证明谁构建的、从什么源码构建的。门禁断言这行必须以 `NOT PERFORMED` 开头。
- `not_distributed` 明写它不在分发面上（`lib/materializer.mjs` 的 `DIST_DIRS`/`DIST_FILES` 都不覆盖它），并说明为什么必须如此。
- 每个组件的 `checksum_sources_agreeing` 随行记录，3–5 不等。

**门禁做什么**（六类断言，全部可执行）：① 不在分发面上；② 结构与 9+2 的计数；③ repo 是 github https clone url、tag 形如版本、`asset.id` 是数字、两个 sha256 都是 64 位小写 hex、字节数是正整数、`checksum_sources_agreeing >= 3`；④ **不与它描述的 harness 漂移**——每个发布件必须在 `scripts/test-interop-writers.sh` 里出现对应的 `<id>-<去掉 v 的 tag>` 暂存目录，两个 checkout 目录也必须被引用；⑤ 组件记录里**不得出现任何本地文件/路径字段**（避免有人顺手把组件字节塞进来）；⑥ 构建溯源的缺口语义仍在。

**这个门禁当场抓出了我自己的两个错**，值得记一笔：第一版把 commit 校验写成了 64 位 hex（git commit 是 **40** 位），并把暂存目录名拼成 `${id}-${tag}` 即 `br-v0.6.0`，而 harness 里实际是 `br-0.6.0`（**tag 去了 `v` 前缀**）。两个错都是它跑第一遍就报出来的，而不是等到某次真跑 section D 才发现"清单和 harness 对不上"。

**负控制**（各跑一次，确认真会咬人，同时确认恢复后回到通过）：

| 控制 | 结果 |
|---|---|
| 删掉 `NOT PERFORMED` 那段（改成 "All nine components verified."） | **FAIL**：`verification.build_provenance must still begin with "NOT PERFORMED"`，退出码 **1** |
| 把首个组件的 tag 改成 `v9.9.9`（指向 harness 从不驱动的目录） | **FAIL**：`never references a staged "am-9.9.9" directory` |
| 恢复原文件 | **PASS**，退出码 **0** |

**这个门禁与 section D 的一个结构性区别**：它**没有任何外部输入**，所以在无网、无大件的环境里也照跑不 SKIP；section D 缺件时只报 GAP。这正是这一行的目的——把"断言能否复现"从"取决于 gitignored scratch 还在不在"变成"清单在仓里，门禁天天跑"。

**#15 因此一并解决**：现在删除 scratch 不再等于 section D 静默退化，而只是"下次要跑时照清单重拉"。主人裁定的 #12（保留 scratch、不点名删除）仍然有效——**本轮没有删除任何东西**。

### 13.19.3 #10 落地：`v3.0.4`–`v3.0.10` 七个标签已补打并推送

标签是**发布元数据**，所以本轮不靠"看起来像发布提交"来挑目标，而是先把惯例**测出来**再套用。

**惯例是从四个既有标签反推的，三件事都被证实**：

| 问题 | 实测答案 |
|---|---|
| 标签指向哪个提交？ | **把 `PACKAGE_VERSION` 提升到该版本的那个提交**。`v3.0.0`/`v3.0.1`/`v3.0.2`/`v3.0.3` 四个标签**全部**等于其版本的"首次 bump 提交"，4/4 无例外 |
| 标签消息里的 digest 是什么？ | 该提交 `PACKAGE_MANIFEST.json` 的 `digest` 字段，即 `sha256(canonicalJson(manifest 去掉 digest))`。四个既有标签**逐值吻合** |
| 标签是轻量还是附注？ | 附注（`cat-file -t` = `tag`），消息形如 `Agent Project Guides X.Y.Z` + 空行 + 一行 digest |

**顺带发现一处标签措辞漂移**（不改历史，只记录）：`v3.0.0`–`v3.0.2` 写的是 `Runtime digest:`，`v3.0.3` 起改成 `Release digest:`，而**四个值指向的是同一个字段**。新标签沿用最近的形态（`Release digest:`），因为它与 `v3.0.3` 一致。这个字段本身是可交叉验证的：3.0.10 的标签 digest `9c768b73…` 正是 `apg project validate` 报的 `provider.observed_digest`。

**七个新标签逐个复核（不是抽样）**，三类独立校验：

1. 标签对象剥离后指向的提交 == 预期的 bump 提交；
2. 消息里的 digest == 该提交 manifest 重算值 == manifest 自报值；
3. `manifest.files` 里**每个文件的 blob 大小与 sha256** 都与该提交树相符（78–81 个文件，0 个不符），且 manifest 的文件集**等于**该树的分发文件集（用当前 `listDistributionFiles` 对 `git archive` 出来的树求集合，0 缺失 0 多余）。第 3 类另拿 **`v3.0.3` 作对照**（已知其标签与提交吻合），它也报 0/0 —— 说明这个跨版本比较本身是有效的，不是恒真。

推送后复核远端标签对象与本地**是同一个对象**（7/7 相同哈希），`refs/tags/v3.0.10^{}` 正确剥离到 `9ca96e06`。**回滚点**：标签是可撤销的本地引用，`git tag -d <tag>` + `git push origin :refs/tags/<tag>` 即可回到补打之前的状态。

**未做**：没有改任何历史标签，没有改 tagger 身份（新标签用当前仓库身份，与近期提交一致；既有四个标签带的是更早的账号 id，保留原样）。

### 13.19.4 #7 落地（选"最小形态"）：P6 观测账本，以及门禁在写完之前就抓出的两个真实缺陷

**做的是什么。** 两个新库文件 + 一处 CLI 入口 + 一道门禁：

| 文件 | 角色 | 在分发面？ |
|---|---|---|
| `lib/root-marker-grammar.mjs` | 从 `scripts/manage-root-blocks.mjs` 里**抽出来的**外来标记词表——P3 护栏与 P6 账本共用**同一个**定义 | 是 |
| `lib/observation-ledger.mjs` | 账本本体：`scanRootMarkers` / `readLedger` / `compareObservations` / `observeRootBlocks` | 是 |
| `scripts/apg.mjs` | 新命令 `apg project observe --target <root>`（并加进 `project` 的帮助行） | 是（改动） |
| `scripts/test-observation-ledger.mjs` | 门禁，已接进 `scripts/test-release.sh`（排在 `test-external-provenance.mjs` 之后） | 否——`scripts/test-*.mjs` 从来不在分发面 |

**为什么词表必须只留一份，而不是各写一份。** 两个消费者对"哪些块存在"必须给出同一个答案；否则账本会记录护栏拒绝承认的块，或反过来。这不是洁癖：P3 的语法**已经改过三遍**，每一遍都发现真实写入方此前不可见（第三遍才补上 `cass` 的句子标记与两个裸容器标签）。两份定义迟早会在**正是普查要抓的那类情形**上分叉，所以护栏原来那份本地正则被删掉，两边都改成 import。

**账本记什么、不记什么。** 每次观测向**克隆本地状态目录**追加一行 JSON（`projectStateDir(...)/observation-ledger.jsonl`，mode 0600，追加时持 `projectMutationLock`）：根文件是否存在、整体 sha256、字节数，以及**每个 marker 行**的原文、种类（`comment`/`tag`）、尽力而为的属主名、marker 自己写的版本令牌、行号、字节区间、近似 token 数。`am` 不写任何版本令牌，所以 `null` 是**合法值**，含义是"这个 marker 没写版本"，而不是"版本未知"——这两件事被刻意分开。

**仓库里没有任何文件、也没有任何已安装根目录的磁盘格式被改**：账本写在 clone-local 状态目录，所以 §13.19.6 里那条回滚说明（P1–P7 不改已安装根的磁盘格式）仍然成立。

**归因就是这个账本唯一的存在理由。** 三个整文件写入方跑完之后盘上**什么都不剩**——`ntm setup --force` 把 2,140 B 的根换成自己的 2,689 B 模板且不留备份，这是实测的。账本给出的只是**它看见过什么**，仅此而已：它从不编辑、升级、删除或修复任何块，块缺失永远不是错误。

| 断言 | 证据（`scripts/test-observation-ledger.mjs`） |
|---|---|
| 记录的词表是实测那一份，不是子集 | 普查 fixture 的 **12** 个 marker 行全部经 `scanRootMarkers` 过一遍，并断言**确切条数**：APG `v2:start`、其 integrity 行、`v2:end`、`br-agent-instructions-v1`、`ee:agentsmd:begin`、`am:blurb`、`ubs` 的 `>>>` 句子、`cass` 的句子标记、`<project_rules>` 开/闭、`<INSTRUCTIONS>` 开/闭。项目散文（`<!-- plain prose … -->`）与普通 HTML（`<div>`）**不得**出现 |
| 账本与护栏不会对"哪些块存在"给出不同答案 | 双方都 import `lib/root-marker-grammar.mjs`；门禁断言账本记下的每个**开始**标记都是 P3 语法认得的形态，并断言 tag 分支**只把闭合标签当"上面已见开启标签的后半截"**接受——负控制：`scanRootMarkers('</project_rules>\n')` 为空，而配对时两半都在 |
| 观测对根文件只读、对账本只追加 | 根文件观测前后**逐字节**比较；第二次观测后**第一行账本逐字节**比较（"追加"恰恰是"重写"会悄悄破坏的那条声明）；`readdirSync` 断言根文件所在目录仍只有根文件——没有 `.bak`、没有 sidecar |
| clobber 会被归因 | 删掉一个外来块、新增另一个之后，diff 里被删的那个进 `disappeared`、新增的进 `appeared` |
| 版本升级不算 clobber | `br-agent-instructions-v1` → `-v2` 必须产生 `version_changed`，且**不得**产生 `disappeared`。`beads_viewer` 一家就同时发三个 marker 版本，把升级报成"消失"会让账本在每次上游发版时喊狼来了 |
| 块缺失、根文件缺失都不是错误 | 记录里 `present: false`、无 marker、0 字节，命令退出码 0 |
| 历史不会静默丢失 | 不是合法 JSON 的一行会让 `readLedger` 以 `ledger_corrupt` 失败，而不是被截断；只是换了行号的块报 `moved`，不报 clobber |
| 命令是**被调用过的**，不是只声明过 | 门禁拿一个一次性状态 home 真跑 `scripts/apg.mjs project observe --target <本仓库>`，断言本仓库自己的根块与 integrity 行被观测到。未接进 runner 的命令是本仓库已经记过一次的失败形态：ADR 0005 的 genericity 门禁 3.0.7 写好、到 3.0.10 才接进 runner |

**门禁在它自己算完之前就抓出两个真实缺陷。** 这是"它不空洞"的最硬证据，比任何论证都硬：

| # | 症状 | 根因 | 处置 |
|---|---|---|---|
| 1 | "恰好 12 个 marker 行"返回 **11** | `TAG_LINE` 的字符类是 `[A-Za-z0-9._:-]`，**漏了下划线**，于是 `<project_rules>` 根本解析不出来——`cass` 用这个标签划自己的区域，它此前**完全不在账本里** | 字符类改用 `\w`，并在 `lib/observation-ledger.mjs` 里注明原因 |
| 2 | 负控制"孤立的 `</project_rules>` 不得入账"返回 **1 !== 0** | 配对检查被一个"开启**形态**可识别"的分支**绕过**了：注释写的是"只有配上本文件里已见的开启标签才记录"，代码却在 `looksForeignMarker('<project_rules>')` 为真时直接放行 | 闭合标签只走配对检查；代码现在与它自己的注释一致 |

第 2 条属于"注释描述了一条规则、代码没实现它"这一类。没有这道门禁，它会**以注释的形式看起来已经被实现**地发出去；而它恰好落在 P6 最要紧的那个词表上（第 1 条落在 `cass` 身上，正是普查把 P6 的价值抬起来的三家之一）。

**故意保持最小，以及因此留下什么。** 账本只在有人跑 `apg project observe` 时记录，**没有**从 `install`/`merge`/`reattest` 自动调用——那会给两个目前对 clone-local 状态只读的命令加上写行为，超出本次裁定的授权。两个限制写在这里而不是藏起来：`changes` 只与**紧邻的上一条**记录比较（记录本身都留着，可以离线做更宽的比较），`token_estimate` 是 `bytes / 4`，是给每轮预算用的近似值，不是分词器实测。

**分发面因此再动一次**：`apg catalog build` → 253 项；`apg release manifest` → **83** 个分发文件（原 81），摘要 `sha256:148974e8…`。`apg catalog check`、`apg release verify-source`、`scripts/test-boundary.mjs`（自报 `83 distributed files`）三项均通过。ADR 0006 的状态行、P6 条目、新增的 "P6: implemented and measured" 小节，以及"未关闭项"里 P6 那一条的移除，都已同步。



### 13.19.5 #8 落地（选 A：v2 块改用 v3 CLI 形态），含一处执行时被推翻的前提

**改了什么**：`bootstrap/AGENTS.v2-block.md` 的 7 条编号规则 → v3 CLI 段（`lib/bootstrap-v3.mjs:70` 那段 383 B 的文字，**逐字搬**），保留 v2 marker、标题、描述符行与 `{{...}}` 占位符 schema。

字节是实测，不是估算：

| | 改前 | 改后 |
|---|---|---|
| 模板 `bootstrap/AGENTS.v2-block.md` | 1,969 B | **1,023 B** |
| 安装后 `AGENTS.md` | 2,063 B | **1,117 B** |

省 **946 B（45.9%）**。低于预算的 "~1,360 B ≈ 66%"，差额来自两处保留（下面第一处正是前提被推翻的结果，第二处是门禁钉死的）。

**保留之一：R7 逐字保留。这是执行时实测推翻批准前提的结果。** 我先前写给主人的风险提示是"被删掉的 R6/R7……v3 CLI 那段以压缩形式覆盖了两者"。实测：

| 规则 | 义务 | v3 CLI 段里有吗 | 分发内容的别处有吗 |
|---|---|---|---|
| R6 观测分级 | `intended` ≠ model-effective | **逐字有** | 无（v3 段就是它的常驻地） |
| R7 权威边界 | 声明不得降低效果或凭空产生权威 | **没有** | 英文对应只有 `docs/V2_CONTRACT.md:16`（"APG does not manufacture grants"）；`roles/*.md` 是中文，grep `权威` 命中的全是"权威文档"义，不是防升级条款 |

批准所依据的前提对 R7 不成立，而保留它的代价是 186 B，所以**取安全的一侧**：留着，并把更正写清。若主人看过证据后决定删，改动只有一行模板加一次重盖章。

**同一条判据我没有用于 R1 的互信句与 R3 的协议句**：它们**在 v3 段里同样没有**，也就是**v3 消费方早就在没有它们的形态下运行**——删掉是"向已发货形态看齐"，不是新增缺口。R1 那句互信表述（`Mutual trust assigns disclosed call consequences to the caller…`）是唯一一条"只在 v2 块里、v3 形态也没有"的文字，记录在此备查。

**保留之二：R3 的建议信回退句**（`templates/SUGGESTION_BOX.md` → `.agent-project-guides/local/suggestions/`），因为 `scripts/test-install.sh:74` 直接钉住这个路径。

**同步义务比我预想的多两条，其中一条是门禁抓出来的**：

| 位置 | 原来钉什么 | 现在钉什么 |
|---|---|---|
| `scripts/test-v2.mjs:95-98` | 安装后 v2 块的 `Before any repository discovery…`、`status=ready`、`clarification_required…wait`、`Any other context/compiler error…stop` —— 全部落在被删的 R2/R3 上 | 压缩后仍在根块里的承重句：精确路由、只用返回内容、受保护工作前消除歧义、绝不回退 `latest`、不证明 model-effective、建议信回退，外加 **R7** |
| `scripts/test-v2.mjs:124-127` | 防篡改夹具把 `'7. Role, task, memory'` 替换成注入串 | 编号没了，夹具的 `assert.notEqual` 报 `tamper fixture did not apply`；改成替换 `'Role, task, memory'` |
| `scripts/test-install.sh:74` | `local/suggestions` | **无需改动**（因保留建议信句） |

**这条夹具的教训值得单记**：压缩散文会打断"以文本片段为锚"的测试夹具，而这类夹具**不会**被"文件是否存在/是否非空"类断言提醒——它只在真的替换不上时报错。这次是门禁第二次跑抓出来的（第一次停在 `test-v2.mjs:95`），不是我预读出来的。

**分发面与自托管**：改的是分发模板，所以 `catalog`（253 项）与 `PACKAGE_MANIFEST.json` 都重算，摘要走 `9c768b73…` → `0b5f6149…` → `53440f70…` → **`6027df75…`**（中间值来自本轮 #9-A 与两次模板迭代）；自托管根块用 `apg project reattest` 重新盖章：`integrity.root_block_hash` `101cee60…` → `5a63a929…` → **`c05a7a6e…`**，`apg project validate` 报 `template_match: true`、`anchor: both`、`bytes: 1117`。

**顺带被这次落地现场演示出来的事实**：`reattest` 只改了根块与描述符，**完全没碰记忆**，但记忆锚 `projectDigest(descriptor)` 立刻从 `sha256:e4ca3608…` 变成 `sha256:9dee6911…`，加上 R7 之后是 `sha256:c1c0de9b…`。这正是 §13.18.11 那个机制的复现：锚随描述符动，而记录里的锚不动。**这次无害，只是因为 #9-A 先落地了**——否则 `reattest` 这一下就等于再冻结一批记录。两件事的先后顺序在这里恰好救了一次，值得记下来：同一个会话里先后落地的两个改动，其顺序会决定对方是"缺陷"还是"无害"。

### 13.19.6 #9 落地（选 A：拆锚），以及一项被撤销的附带项

**改的是什么。** `lib/memory.mjs` 的 `supersede` 里，历史记录的锚不再与当前摘要比较：

- **删掉**：`priorRecord.project_digest !== projectDigest(descriptor)` 这个条件。
- **换上**：锚必须**存在且格式良好**（`/^sha256:[0-9a-f]{64}$/`）。原来那条错误信息写的"不是有效的**当前**项目记忆"也一并改掉——修完之后这句话本身就不成立了。
- **保留不动**：`schema_version`、`state === 'promoted'`、`project_id` 相符、记录溯源自洽、评审是非作者且有理据。**并发 CAS 仍在原位**：`proposeMemory`／`reviewMemory`／`promoteMemory` 三处仍要求携带**当次**当前摘要。

**测试义务的落点与我先前写的不一样。** 我在 §13.18.11 里写的是"`test-v2.mjs:469-471`"，实测真正把旧语义钉死的是 **`test-v2.mjs:506-511`**：它把已 promote 记录的锚改成全零，然后断言 supersede 必须报 `invalid_memory` —— 这就是"锚必须等于当前摘要"的化身。改法不是删掉它，而是**一分为二**：

| 断言 | 语义 |
|---|---|
| 锚改成 `'not-a-digest'` → 必报 `invalid_memory` | 锚**仍被要求**且必须格式良好（原来那条负例的**意图**保住了） |
| 锚改成 `exported.revision`（本 fixture 里**真实存在**的更早描述符摘要）→ 必须 `state: 'proposed'` | **这就是回归本身**：拆锚之前，任何一次描述符变更都会让这条 supersede 永久失败 |

第二条用的是 fixture 里现成的历史锚（`provider export` 的 `revision`，`test-v2.mjs:450` 已断言它与当前摘要不同），不是构造值。

**负控制（两轮，第一轮是空洞的，值得记下来）。**

| 轮次 | 做法 | 结果 |
|---|---|---|
| 第 1 轮 | 带修复跑 A，塞回等式检查跑 B | **A 也失败了，B 也失败了** —— 两者都停在 `test-v2.mjs:67` 的 `catalog check`。原因是我改了 `docs/V2_CONTRACT.md`（分发文件），`catalog/catalog.jsonl` 因此变旧。**这一轮的 B 什么都没证明** |
| 第 2 轮（重新生成 catalog/manifest 之后） | 同上 | **A 退出码 0**；**B 退出码 1**，且失败的正是新断言那条命令：`apg memory supersede … --input …/stale-anchor-memory.json --replaces route.lesson`，stderr `invalid_memory`。恢复后文件哈希与改前一致 |

**我第一版判定第 2 轮负控制也"空洞"，判据是错的。** 我拿 JS 栈帧行号去比断言行号，结果栈帧永远是 `test-v2.mjs:20`——那是 `run` 辅助函数自己 `assert.equal(result.status, expect)` 的地方。**正确的判据是"哪一条 apg 命令失败"**，不是 JS 在哪一行炸。这条记在这里，因为它是同一个陷阱的第二种形态：负控制的判据本身也可能选错，而选错时会给出**看起来严谨的假结论**。

**分发面因此动了，两个生成物必须重算**（这是选 A 的真实代价，不是附注）：`apg catalog build` → 253 项；`apg release manifest` → 分发文件 81 个、摘要由 `sha256:9c768b73…` 变为 **`sha256:0b5f6149…`**。`apg catalog check`、`apg release verify-source`、`scripts/test-boundary.mjs` 三项均通过。

**没有做的事**（这是裁定的一部分，不是遗漏）：**一条记录都没刷新**。18 条 `promoted` 记录仍带着各自的历史锚——选 B（就地刷新摘要）被定性为洗白历史，所以修复只让它们**重新可被 supersede**，不改写它们声称的评审历史。本轮也没有真的去 supersede 任何记录。

**版本记账（留给下一步的明确后果）**：`lib/memory.mjs` 与 `docs/V2_CONTRACT.md` 都是分发文件，所以 `main` 的分发面**已经不等于**标签 `v3.0.10` 所钉的那份，而 `PACKAGE_VERSION` 仍是 `3.0.10`。本轮**故意不升版本号**：升号会让 `main` 对消费者宣告一个尚未存在、也无标签的版本，那是带用户可见副作用的发布动作，超出本批裁定的范围。因此：**下一次发布必须先升 `PACKAGE_VERSION`**（连同 `provider.release` 与随之变化的记忆锚）；在此之前，`3.0.10` 的权威是**标签**，不是 `main`。

### 13.19.7 #12 落地（选"保留"）与 §13.15 清单的收口

**#12：保留 `.agent-scratch/`，我不点名删除。** 这条裁定的具体含义写在这里，以免被读成"永久的存储承诺"，或被读成"清理被否决"。

| 维度 | 含义 |
|---|---|
| 保留的是什么 | `.agent-scratch/external-test/repos`（39 个 checkout，约 2.9 G）、`external-test/bin`（9 个发布件归档＋解包件，287.5 MiB，含 `install-manifest.json`）、`/tmp/apg-external-sandbox/`（暂存二进制与运行窗口）。前两者是 `test-interop-writers.sh` section A/D 的输入 |
| 为什么按推荐保留 | 删掉之后 section A/D 各自从"断言"退化为 1 条 GAP（干净 SKIP，不是失败），普查原始证据（含 `SHA256SUMS`）一并消失——而**那是本轮全部结论的底稿** |
| 它与 #13 的关系 | #13 的最小溯源清单**已经落库**（§13.19.2）：11 个写入方的 repo＋tag＋asset id＋归档/二进制双 sha256，2 个脚本件的 HEAD commit，紧凑 **1,921 B**。所以现在删除的代价是**重新下载**，不是**丢失知识**——这正是把 #13 排在 #12 之前落地的原因：先让证据可复原，再谈清理 |
| 它**不**意味着什么 | 不是"永远不许删"，也不是"清理被否"。它只表示**我不动作**：不 `rm -rf`、不移动、不改 §13.13.8 的生命周期标注。真要清理时由主人单独点名，且先确认 `test-interop-writers.sh` 缺输入时报 **GAP 而不是 PASS**（§13.18.2 已把这条记数规则更正） |
| 边界 | scratch 没有任何进入 git 的路径；本轮 `git status` 里它一个字节都没出现，且 `test-external-provenance.mjs` 会断言溯源清单本身不在分发面 |

**§13.15 清单收口：17 行全部有终态**，1–13 由主人一次裁定（§13.19），14–17 此前已闭合。下表是"终态 → 落地点"的索引，用来回答"这一条到底做没做"：

| 行 | 终态 | 落地点 |
|---|---|---|
| 1 | 不动（P3 文法不再泛化） | 无需改代码；32 行词表双向钉住 |
| 2 | 不进分发面（能力状态词表） | `decisions/0007:55` 早已记载，无需新写 |
| 3 | 不进正式词表（`declaration-observed`） | ADR 0008 决策 3 |
| 4 | 签字落地（外部命名空间） | `decisions/0008`（`aada0f4`） |
| 5 | 不升级为机器可判 ＋ 措辞纪律 | §13.19.1；审计未发现过度声称 |
| 6 | 同 #2（跨 harness 契约） | 无需改代码 |
| 7 | 批准最小形态（P6 观测账本） | §13.19.4：`lib/observation-ledger.mjs`＋`lib/root-marker-grammar.mjs`＋`apg project observe`＋门禁 |
| 8 | 选 A（v2 块改用 v3 CLI 形态） | `bca360b`；实测省 946 B／45.9%，见 §13.19.5 |
| 9 | 选 A 拆锚（附带改名项撤销） | `c9d4f00`；见 §13.19.6 |
| 10 | 补打标签 `v3.0.4`–`v3.0.10` | 7 个附注标签已推送并逐个复核，见 §13.19.3 |
| 11 | 不发布消费者仓 | 12 个真实消费者仓一个都未触碰 |
| 12 | 保留 scratch | 本节；未删任何东西 |
| 13 | 落库最小溯源清单（连带 #15） | `ff41099`；见 §13.19.2 |
| 14 | 构建 `frankenterm`（源构建 RC 证据） | `270b0ad`＋`f8ca228`；见 §13.18.4／§13.18.8 |
| 15 | 保留沙箱证据 | §13.18.3；与 #13 一次签字解决 |
| 16 | 默认即驱动真实二进制 | §13.18.2 |
| 17 | 修掉读取抖动（clean filter） | `687bc6a`；见 §13.18.1 |

**分发摘要的完整链条（更正 §13.19.6 里那一处时报）**：§13.19.6 写的是 `9c768b73…` → `0b5f6149…`，那是**当时**的值。它此后又随每次分发面改动继续前移：`0b5f6149…`（拆锚）→ `6027df75…`（#8 的 v2 块，81 个文件）→ **`148974e8…`**（#7 的两个新库文件，83 个文件）。所以"当前摘要"要看 `PACKAGE_MANIFEST.json`，不要引用本节之前任何一处历史值。

**这一批之后唯一仍然外部可见的后果**：`main` 的分发面与标签 `v3.0.10` 所钉的那份**不相等**，而 `PACKAGE_VERSION` 仍是 `3.0.10`。下一次发布**必须先**升 `PACKAGE_VERSION`（连同 `provider.release` 与随之变化的记忆锚）；在此之前 `3.0.10` 的权威是**标签**。这条在 §13.19.4、§13.19.6、CHANGELOG 三处都写了同一个结论，不是重复，而是让单独读到任何一处的人都不会误以为 `main` 就是 3.0.10。

**顺带的政策动作：两封建议信（`.agent-project-guides/local/suggestions/`）。** 本批工作全程按 `AGENTS.md` 的要求先跑 `apg context`，任务串"落地主人裁定的13项并收口owner queue"返回 `clarification_required`（`no lexical routing rule matched the request`，4 个平级选项 + 省略 3 个），于是按政策继续走最接近的允许路线 `development/maintainer/code`（`ready`）并在事后写信：

- **`0001-routing-gap-chinese-task-nouns.md`**：中文**名词**描述的任务一条规则都不命中。词表不是纯英文（`routing/context-classifier.json` 有 354 个中文字符），但中文条目清一色是"接在什么动词后面"的交付/否定动词（`只修复`/`并实现`/`落地修复方案`/`不要修复`），`收口`/`清单`/`裁定` 一个都没有——`落地` 也只作为固定串的一部分存在。提议**只加词、不动状态机**。
- **`0002-other-suggestion-box-not-ignored.md`**：写信这个动作本身暴露的第二个问题，所以单独一封（一封信一个关注点）。`templates/SUGGESTION_BOX.md:3` 声明建议箱是 clone-local 状态，但 `git check-ignore` 对 `.agent-project-guides/local/...` **退出码 1（不忽略）**，`.gitignore` 里只有 `.agent-scratch/`。于是**按政策办事就会制造脏树**：本仓写信前 `git status` 干净，写完多出未跟踪目录，`git add -A` 会把它带进发布提交。提议 `.gitignore` 增一行 `.agent-project-guides/local/`（非分发文件，两个生成物都不受影响），或反过来改文档措辞——两者必须有一个改。

两封都是 **report-only**：不改变路由、不授予权限、也不构成任何已批准的改动。本轮的提交不含 `.agent-project-guides/`（显式点名添加文件，不用 `git add -A`）。

## 13.20 "都做"：储藏库契约上分发面 ＋ 第一个真实实例（2026-09-20）

§13.19 收口后只剩两个开口，都是 ADR 0009 明确留给主人的：**decision 2**（把契约放上分发面）和**第一个真实实例**。主人只回了两个字：**都做**。这一节两件都落地，并且都留了可复核的实测证据——dry run 与实际运行的数字、第二次运行的幂等结果、以及一次把门禁打红的反证。

### 13.20.1 契约上分发面（ADR 0010，改 ADR 0009 D7）

| 落地物 | 性质 | 说明 |
|---|---|---|
| `lib/components.mjs` | **分发** | 校验＋发现＋探测的唯一实现；`storeRoot`/`entryDir`/`packageManifest`/`writePackageEntry`/`verifyEntry`/`validateEntry`/`readStoreEntryRecords`/`resolvePackage`/`probeService`/`resolveService` |
| `schemas/component-entry.schema.json` | **分发** | `oneOf` package/service；package 必填 `[schema_version,kind,id,version,files,digest]`，service 必填 `[kind,id,endpoint,transport,health,singleton,delivery]`，`delivery: const "staged"`，endpoint 只允许字面量 |
| `apg components verify\|probe` | **分发** | 只读；store 不存在不是错误（`present:false`）；`probe` 只发一条 `GET`（声明的 health 路径） |
| `scripts/build-component-store.mjs` | **不分发** | 采集路径：读已入库的采集记录，把已就位的字节物化进 digest 命名目录。故意不上分发面 |

三条决定性的**否决/更名**证据，都写进了 ADR 0010：

1. **组名只能是 `components`，不能是 `store`**——`scripts/test-boundary.mjs:33` 的 `FORBIDDEN` 正则明确匹配 `store`，其判据是 ADR 0007 的"组名不得指称归执行栈的机制"。门禁在这一条上是对的：这个组只**核对产品**，不跑服务。
2. **校验器搬进 `lib/` 之后，门禁才算在测真东西**——旧版门禁自带一份私有 `verify`/`validate`/`probe` 实现（`HEAD` 那份，41 条断言）；新版 import `lib/components.mjs`，断言从 41 条增到 55 条，并新增"schema 与代码字段互相对齐"（多一个字段、少一个字段都红）。
3. **采集器不上分发面**——它会读采集记录、写机器级根目录；`lib/` 上的是"核对/发现"契约，采集是维护者程序，分开正是 ADR 0007 的分区。

分发面因此从 83 → **85** 个文件，摘要链条继续前移：`148974e8…`（83）→ **`293959867428afd08fea66b5e878c81a1afde5d94c939eefaf71e656a40d344f`**（85）。`apg catalog build`＝253 条、`apg catalog check`＝`valid`、`apg release verify-source`＝`valid`、`apg project validate`＝`valid`。

### 13.20.2 第一个真实实例：9 个包，全部 `link`，全部 `available`

根目录就是默认根 `/home/lijq/.local/share/agent-project-guides/components`（`<data>/components`，`releases/` 的兄弟，沿用既有变量，**没有新变量**）。`--dry-run` 先跑一遍确认记录与字节一致，再真跑：

| 组件 | 版本 | 字节 | 方式 |
|---|---|---|---|
| `am` | `am-0.3.36` | 61,488,784 | link |
| `br` | `br-0.6.0` | 11,732,979 | link |
| `bv` | `bv-0.25.0` | 14,536,865 | link |
| `cass` | `cass-0.2.14` | 136,325,248 | link |
| `ee` | `ee-0.15.2` | 30,947,660 | link |
| `ft` | `ft-0.15.1` | 19,789,208 | link |
| `ntm` | `ntm-1.35.1` | 18,206,430 | link |
| `sbh` | `sbh-0.6.2` | 2,329,948 | link |
| `slb` | `slb-0.4.1` | 6,100,785 | link |

- dry run：`materialised 0, not_staged [], record_mismatch []`，9 条全 `planned`，**不写一个字节**。
- 真跑：`materialised 9, present 0, not_staged [], record_mismatch []`，9 条全 `mode: link`——源与目标同一文件系统时硬链接，所以 287.5 MiB **没有复制第二份**；硬链接意味着通过任一路径改动都会被 digest 抓到，但两者共享 inode，"不是隔离副本"，这一点在 `build-component-store.mjs` 头部就写明。
- 第二次运行：`materialised 0, present 9`——幂等，且每条都过了 `verifyEntry`（不是"目录在就算在"）。
- `apg components verify`：`present:true`、`reusable` 9 个、`missing:[]`，每个包 `state: available` 并带 `version`。

### 13.20.3 门禁与反证

- `scripts/test-component-store.mjs`：55 条断言，11 组（兄弟根／两份引用一份拷贝／文件集必须精确——多一个、少一个、被改一个字节、manifest 可写、目录名不符 digest 各自红／缺失即 `not-installed`＋`action:none`／服务身份规则／schema 与代码对齐／储藏库遍历／采集器（含 `--dry-run` 不写、第二次幂等、记录与字节不符时 `record_mismatch` 且退出码 1）／CLI／四状态＋singleton 双实例＝`conflict`／探测只发 `GET` 到声明路径）。
- **反证（先跑再记）**：把 `lib/components.mjs` 里的文件集比较那行注释掉，门禁**变红**（`operator: 'throws'` 的 assert 失败）；恢复后**变绿**。所以门禁是因为它声称的那条规则而红，不是顺带红。
- `scripts/test-boundary.mjs`：`PASS: product boundary holds (10 command groups, 85 distributed files, ...)`。
- `scripts/test-release.sh`：新增 `schemas/component-entry.schema.json` 的 JSON 解析行，并在 `test-observation-ledger.mjs` 之后接上本门禁。

### 13.20.4 没做的，以及为什么

- **没写任何服务条目。** 服务这一 kind 存在、也有真实 loopback 服务器覆盖，但这台机器上没有一个组件同时暴露"可核对的 identity"和"只读 health 端点"（`bridge_control status` 给的是 `onshape`/`taobao` 两个 id 与 generation，走的是它自己的协议，profile 里也没有 HTTP 端点或 health 路径）。硬写一条就是**编一个端点**，那正是四状态词表要防的事。第一条真实服务条目等一个自己声明身份的服务。
- **没有铺开到消费者仓。** §13.19 的 #11 决定照旧：12 个真实消费者仓一个都没碰。ADR 0010 只是让能力可得，不等于采用。
- **没有动版本号。** `main` 的分发面现在（85）超过标签 `v3.0.10` 钉的那份（83），而 `PACKAGE_VERSION` 仍是 `3.0.10`。`3.0.10` 的权威仍是**标签**；下一次发布必须先升 `PACKAGE_VERSION`（连带 `provider.release` 与记忆锚）。这条不擅自做。
- **没有加删除/修复路径。** 储藏库不自愈：条目坏了就报 `component_corrupt`，删是人的动作。

## 13.21 版本抬到 4.0.0，以及推广前对外部能力的内部实测（2026-09-20）

主人先给了一句「新的版本可以变成 4.0 开头了」，随后把推广前的动作定死为**对外部能力做实测**（不是评审）。

### 13.21.1 4.0.0 的版本抬升

上一节记下的后果在这一节被清掉：`main` 的分发面（85）曾超过标签 `v3.0.10` 钉的（83），而 `PACKAGE_VERSION` 仍是 `3.0.10`。现在四处**一起**动，不留「宣告了一个没有标签的版本」的缝：

| 落点 | 变化 |
|---|---|
| `PACKAGE_VERSION` | `3.0.10` → **`4.0.0`** |
| `.agent-project-guides.json` `provider.release` | `3.0.10` → **`4.0.0`**（`lib/descriptor.mjs:56-64` 强制它与 `PACKAGE_VERSION` 相等） |
| 根块 `AGENTS.md` | `apg project reattest` 重盖章：`release: 4.0.0`，integrity `430f646f…` → **`24366bf1…`**，块 1,117 → 1,116 B |
| `PACKAGE_MANIFEST.json` | `package_version` → `4.0.0`，摘要 `29395986…` → **`156b8c66d504b3764d6bb205ae8a8028b70aedf63125e865f529cea87b147b63`**（仍是 85 文件） |
| `CHANGELOG.md` | 新增 `## 4.0.0` 段；`## 3.0.10` 段**逐字节还原为标签 v3.0.10 所钉的内容**（原先被误加在 3.0.10 名下的四个块——组件库、P6 账本、v2 块瘦身、记忆锚拆分——按其真实归属移入 4.0.0） |

实测（全绿）：`./scripts/test-release.sh` → **EXIT=0**；`test-boundary.mjs` → `PASS: product boundary holds (10 command groups, 85 distributed files, …)`；`catalog check` / `release verify-source` / `project validate` 全 `valid`（253 条 catalog）；writers `69 passed / 0 failed / 1 gaps`；`project_digest` 随档案前移到 `sha256:e3b9ac87…`（`docs/memory` 里那 18 条历史锚因此再度变旧——这正是记忆锚拆分所接受的语义，本轮**一条记录都没重写**）。

**标签 `v4.0.0` 故意还没打。** 版本号是给消费者看的宣告，标签才是权威；按主人「先内部实测、再正式推广」的顺序，标签要等 §13.21.2 的实测与之后的推广空跑都通过再打——打早了万一实测要改分发面，就又把 `main` 和标签拆开了。打标签本身是一条命令（`git tag -a v4.0.0` + `git push origin v4.0.0`），随时可做。

### 13.21.2 对外部能力的内部实测（三个 agent，只读优先）

做法：开一个 AgentTeams 团队 `apg-4.0.0-external-capability-test`，三个成员分头**用真命令去用**这些能力并交证据（命令 → 退出码 → 原始输出），产出写进 `.agent-scratch/capability-test-4.0.0/`（该目录被 `.gitignore` 忽略）：

| 成员 | 角色 | 被测能力 | 边界 |
|---|---|---|---|
| `cli-probe` | verifier | `br` `bv` `ntm` `slb` `sbh` `cass`：字节与采集记录比对 + 自报（`--version`/`--help`），只跑「帮助里明确只读」的子命令 | 不安装、不联网、不 sudo、不碰消费者仓 |
| `service-probe` | operator | `am` `ee` `ft`：能否以服务形态在 127.0.0.1 起来、起来后回什么、跑完是否收干净；并回答「谁够格成为一条真实 `service` 条目」 | 只绑回环、只在自己 scratch 目录内、跑完 kill 并用 `pgrep` 证明无残留 |
| `mcp-probe` | verifier | Bridge 控制面背后的 `onshape` / `taobao` 服务现状（只读 `bridge_control status` + `bridge_diagnostics`），以及本会话真实可达的产品面 | 策略明令：不改模型、不购物车/结算/付款、不发卖家消息、不处理验证码、不导出私有数据 |

**这次不写成「评审」**：没有一条任务是去读 APG 的源码挑毛病，任务全是「拿命令去用外部能力，看它到底能不能用、缺什么」。这也顺带把 §13.20 的 store 契约束在实战里过一遍：实测结论出来后，能构成真实 `service` 条目的组件才会被写成条目（ADR 0010 D6 留的那个缺口）。

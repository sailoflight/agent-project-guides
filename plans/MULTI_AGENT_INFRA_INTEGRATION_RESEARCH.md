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
| 1 | 让步档位 | **认定档位 1**——但要求先说明"三套记忆各自发生了什么定位变化"（见 13.1） | 待正式落定 |
| 2 | 声明外部后端 | **暂不开**。改为：现在就在 APG 内建一个**非 git 试验区**，把外部组件拉进来实测 | 已执行（见 13.2） |
| 3 | 文档顺序 | **先 `decisions/0006`（AGENTS.md 块所有权协议），再组织原则 ADR** | 已定 |
| 4 | `docs/memory` 收录不一致 | **(a)** 让 catalog 也按**目录**跳过（与 `lib/core.mjs:184` 一致） | 已定，待实施 |
| 5 | 根块层级假设 | **需先解释含义**；影响面已查清（6 处 + 一处测试断言，见 13.3） | 待定 |
| 6 | 互斥 / claim 租约 | 语义改为 **downgrade / 未安装**，而非"不支持"（见 13.4） | 已定方向 |
| 7 | 命名空间命名 | 与 2 一起——**测试就位后再大改** | 推迟 |
| 8 | EE trust 映射 | 与 2 一起——**测试再说** | 推迟 |
| 9 | `.agent-scratch` 前 3 项（19.1 MB） | **删除**——已逐个点名执行 | **已完成** |
| 10 | 报告 | **提交** | 执行中 |
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
| **第 2 步** | 组织原则 ADR（§10.4 + §11 三条决定） | 落地后记忆可缩成指针——**token 净省点** |
| **第 3 步** | 修 `docs/memory` 收录一致性（决策 4） | 小改动，但需跑回归；放在 ADR 后更稳 |
| **第 4 步** | 试验区实测：EE trust 映射 / CASS 检索 / 互斥与租约的真实形态 | 决策 7、8 的前置 |
| **第 5 步** | 按实测结果定能力状态词表（决策 6 的落地） | 依赖第 4 步的观测 |
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

**一处必须说清的边界**：`docs/memory/finding.h1.bootstrap-token-only-validation.json`（confidence=high）记录的是**另一个块**——`lib/bootstrap.mjs` 的 `inspectBootstrap`（:97-108）对 schema-1 的 **v2 bootstrap 块**只做「字节 0 + 三个 `includes`」校验，**完全不比 hash**，所以块内其余治理指令可被改写而 `project validate` 仍报 ready。schema 2 用 `integrity.root_block_hash`（`schemas/project-v3.schema.json`，与 `manifest_digest` 同为必填）在设计上回答了这个问题，但 **schema-1 路径仍是 token-only**。

**P9 没有闭合那条 finding**——它管的是 `install.sh` 写进消费者根的 `routing:start|end` 块，不是 `inspectBootstrap` 检查的 `v2:start|end` 块。但 P9 给出了**已经测过的机制**：把 `stamp`/`verify` 用到 `V2_START`/`V2_END` 上、让 `inspectBootstrap` 比对记录的 hash，现在是一个小改动而不是设计问题。这是一条明确的后续项。

**ADR 0006 中仍未闭合的**：P6（观测账本未实现）、P7（APG 自身块仍 1,706 B，消费者用的是 731–758 B）。P3 已按上述收窄口径闭合。

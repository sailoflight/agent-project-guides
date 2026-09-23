# APG 4.x：模块、外部能力与多项目拆分审查

日期：2026-09-23。审查基线：`bd11649`。状态：**研究建议，不是已实施的新契约**。

本轮仅做静态调查、上游文档核对和架构检查，不安装或执行第三方程序，不改变全局入口、其它项目或 3.x 固定运行时。本报告不随治理包分发。

## 1. 结论与需要纠正的前提

1. APG 应成为治理与集成入口，不应重新实现所有执行机制。“APG 使用外部能力”与“APG 拥有外部调度器/检索引擎”不是一回事。
2. **反对现在把每个模块拆成一个仓库。** 模块化、独立包、独立进程、独立项目、独立仓库是不同决定。多仓不能自动解耦，可能把原子修改变成版本矩阵、迁移与发布协调。
3. 优先建立能力管理的可替换边界；架构导航技术上最容易独立，但尚不需要立即另建仓库。角色路由先在仓内提炼纯决策层，不宜现在独立发行整套 context。
4. CODE 母目录管理属于独立的 workspace/portfolio 应用边界，不应进入 APG 治理核心；但应先验证 `repo_updater + bv + ntm` 的覆盖，**不先批准重造完整多项目调度器**。
5. 外部测试清单的 9 个发布件、2 个脚本型源码入口全部属于 `Dicklesworthstone` 命名空间，是显著的单一生态集中，而不是多供应方组合。这不证明只有一个贡献者，也不证明这些工具组成一个不可拆的框架。
6. “全局需要 cass / WezTerm”过于粗糙。固定版本文档已经提供反例：cass-memory 可在没有 cass 检索时降级；ft 的原生 mux 路线不统一要求外部 wezterm CLI。必须按版本、构建、操作建立依赖。

## 2. 重要发现（条件、影响、验证边界）

### F1：预期的能力调用面尚未落地（高优先级产品缺口）

证据：`scripts/apg.mjs:972–975`，`docs/modules/COMPONENTS.md`，`lib/components.mjs:9–17`。

当前公开接口仅 `components verify|probe`，没有通用配置补全、调用、安装接口。若把验证通过当成完整接入，就会对可执行路径、工作目录、输出协议、取消和副作用作出没有证据的承诺。

建议：先定义操作级 adapter 协议，再实现少量真实闭环；不得将所有组件的 `available` 直接翻译为 `task-ready`。本轮没有新增调用能力。

### F2：旧产品边界与用户批准的新方向需要正式协调

证据：`decisions/0007-authority-plane-and-execution-plane.md`、`scripts/test-boundary.mjs`。

现行 ADR/门禁排除执行类扩展；用户现在允许 APG 检查、补全配置、使用外部能力。直接添加命令会造成代码、契约、分发边界相互冲突。

建议：新增/修订 ADR，区分“受约束地调用外部后端”和“APG 自建执行引擎”，同步契约及反例测试。不把历史 ADR 当作拒绝用户新方向的依据，也不静默绕过门禁。

### F3：组件级一刀切前提会混淆部分可用与操作不可用

证据：`scripts/external-components.json` 的 cass/ft 前提；固定版本 cass-memory v0.2.14 README 的 Graceful Degradation；ft v0.15.1 README 的 mux/prerequisites 说明。

条件：仅需 playbook 操作、doctor 或原生 mux，但统一要求 PATH 上有 cass/wezterm。
影响：可能将可用子能力整体标记 degraded；反过来，仅有 CLI 也不能证明 mux 可达。

建议：保留现有四态兼容，另增加逐操作 readiness/原因与后端变体。当前 APG 对声明前提的解析未必有错，需要修正的是依赖建模与声明粒度。文档反例不等于本机二进制该路线已跑通。

### F4：供应来源集中且许可证不能当作普通 MIT

证据：外部来源清单；本轮在线读取的 cass-memory v0.2.14、ft v0.15.1、ntm v1.35.1、bv v0.25.0 的 LICENSE，及 repo_updater 上游快照 LICENSE。

这些核对样本包含针对 OpenAI/Anthropic 的附加限制，范围涉及执行、测试、分析等活动。这里只记录文本事实，不作“当前用户一定可以/不可以使用”的法律结论。用户是个人使用者、调用路径是否涉及限制对象，需要单独确认。

风险：若只根据标题中的 MIT 或免责声明自动安装/分发，许可判断可能失真；同一生态也意味着关联升级和接口漂移风险。外部清单还明确记录九个发布件未完成 build provenance 核验，校验和一致不等于可复现构建证明。

建议：授权范围未明确的后端不要默认启用安装/执行；许可证核验绑定确切版本，必要时由用户取得权利人澄清。维持第三方字节不进入 APG 发行包。不要把本轮核对的五份许可证推广为全部版本/仓库的最终法律判定。

## 3. 全部内部模块的职责与拆分判断

依据：`docs/architecture/modules.json`、源码导入与 `docs/architecture/generated/INDEX.md`。
本轮 `node scripts/architecture.mjs check`：20 个模块、60 个源码文件，检查通过。这证明声明/静态导航约束满足，不证明业务已完全解耦。

| 模块 | 当前拥有 | 不应误认为拥有 / 拆分建议 |
|---|---|---|
| files | 原子/排他文件写入 | 不是完整事务或安全沙箱；保持私有基础设施 |
| foundation | 错误、摘要、路径、发行集合 | 混合通用原语与 APG 路径；先收窄，勿发布万能 common 包 |
| descriptor | schema 兼容与项目描述符 | APG 核心版本契约，留核心 |
| root-policy | 根指令块与完整性 | 与安装迁移一致性绑定，留核心 |
| catalog | 治理章节、精确路由与预算 | 与内容注册表绑定；先拆内部接口 |
| closure | 选择文档闭包 | 非一般 RAG；留 context/治理核心 |
| generation | 选择票据、本机私有状态 | 非任务调度；凭据与目标绑定必须保持 |
| runtime | 精确发行包提供、校验与安装 | **不是 AI worker runtime**；留发行核心 |
| context | 分类、编译、选路、预算、展示 | 非独立角色分类器；先提炼决策与 IO 边界 |
| materialization | 预览、应用、journal、恢复 | 与 descriptor/root/runtime 保持事务一致性 |
| migration | 迁移计划、字节所有权与回滚 | 不与物化任意拆发行；留核心 |
| components | 文件验证、服务探测、依赖最终状态 | 最值得优先建立独立包边界；并非已实现 manager 全栈 |
| memory | 提案、审查、晋升与替代 | 正式项目知识，不是会话数据库或向量引擎；留治理侧 |
| observation | 根指令观察账本 | **不是所有项目/进程的监控系统**；留核心 |
| risk | 效果与风险要求组合 | **不授予也不实施 OS 权限**；留治理侧，输出供后端消费 |
| cli | 分派、冷启动 | 组合根；依赖多不自动构成错误，重点防止业务继续堆积 |
| legacy | 旧安装器与兼容工具 | 保护 3.x，独立维护边界而非抢先删除/迁移 |
| author-tools | 路由校验、组件暂存、索引过滤 | 作者工具，不自动全部提升为公共 runtime API |
| architecture | 声明与静态源码导航、流程图 | 无其它 APG 模块依赖；独立工具候选 |
| verification | fixture 与发行门禁 | 按契约分层；拆包后仍需顶层集成/兼容验证 |

### 3.1 角色路由：可以提炼，不建议现在独立项目

证据：`lib/context.mjs:23,391–396`，`lib/context-routes.mjs`，`docs/modules/CONTEXT.md`。

- `context.mjs` 629 行，catalog/routes 合计 461 行；行数不是拆仓理由。
- 当前逻辑读取 APG 固定 routing 文件，依赖目录章节、descriptor 内容视图、强制章节、预算以及选择票据。
- 提取一个 `task -> role` 小函数并没有带走这些约束；把整套约束带走又接近复制 APG 治理核心。
- 建议先内部化 `RouteRegistry / RouteRequest / RouteDecision`，让纯决策层不读磁盘；内容编译、目标绑定、票据与权限要求仍在 APG。
- APG 项目角色路由和外部工具的“选择哪个 agent/model 执行任务”不是同一能力，不应合并成万能 router。
- 出现第二个真实消费者、清晰的数据协议和独立升级理由后，再评估包/仓库。缺失内容或预算约束不能在抽离后静默降级。

### 3.2 能力管理：优先建立可独立边界，但不是移动三个文件就完成

证据：`lib/components.mjs`、`lib/component-resolution.mjs`、`lib/service-probe.mjs`，共 504 行。

静态依赖只指向 foundation，较浅；然而 `storeRoot()` 依赖 `platformHomes()`，后者绑定 APG 的 HOME、目录及状态约定（`lib/core.mjs:130–145`）。状态、schema、CLI、调用效果仍需梳理。

建议边界（未来，不是现状）：

- 能力宿主拥有：provider 登记、版本/制品绑定、操作描述、readiness、有限调用、结果归一化。
- APG 拥有：项目所需能力、治理上下文、效果要求、项目兼容与最终用户入口。
- 外部后端拥有：检索、邮件、任务数据库、终端、审批执行机制。
- 注入 store/path/process/network 接口；外部工具无论直接调用还是被 NTM 包装，都通过 provider 标识去重。
- 不在能力宿主再写一套任务调度器或把“配置修复”默认为可随意改 shell、system service 和真实凭据。

先同仓独立边界及合约测试，再决定是否独立发行。若拆仓，APG 保持兼容 façade，不要求用户换一套命令。

### 3.3 架构导航：最易抽离，但也要避免过早产品化

现有四个源码文件合计 244 行，模块图中不依赖 APG 其它模块；已接受项目目录/声明输入，是最干净的候选。

限制：当前解析/检查能力面向静态 ESM；人工声明流程不能宣传为自动证明的完整调用图。只有 APG 一个实用消费者时，保留工具目录即可；在第二个异构仓库试用后再独立包/项目。无需仅为“多几个仓库”发布维护负担。

## 4. 外部能力覆盖、重叠与责任归属

清单中九个发布件为 am、br、bv、cass-memory（本地 ID 为 cass）、ee、ft、ntm、sbh、slb；另外两个源码入口为 UBS、ACFS。

| 能力 / 后端 | 后端应拥有 | APG 应拥有 / 避免重复 |
|---|---|---|
| am | 消息、线程、身份与协作预留 | 项目身份映射、调用策略；advisory 预留不是硬文件隔离 |
| br | issue、状态与依赖事实 | 接入与验证要求；不另建第二套任务事实库 |
| bv | 图分析、优先级建议、多仓任务视图 | 消费建议；推荐/claim 命令不等于已获执行许可 |
| cass-memory | playbook、经验候选与上下文建议 | 正式知识仍经 APG 审查晋升，禁止双向无审查覆盖 |
| cass 检索（另一个项目） | 会话历史索引与检索 | 按需独立 provider；不是 cass-memory 的同一个程序 |
| ee | 持久本地记忆/检索层 | 与 cass-memory 重叠时指定主后端，不双写相同真相 |
| ntm | tmux/agent 会话编排，及其已声明的集成工作流 | APG 提供治理与效果要求；不要复制其整套编排 |
| ft | mux/终端观察、控制及相关运行机制 | 与 ntm 部分重叠；按 session 明确唯一生命周期 owner |
| slb | 危险命令审批及受控执行 | risk 输出要求，宿主保留真实授权；peer 票不自动等于人类批准 |
| UBS | 静态扫描结果 | 组织验证、解释证据；扫描通过不是整项任务通过 |
| sbh | 磁盘压力观测及获准后的恢复措施 | 资源状态消费；清理不是只读，不作为任意删除授权 |
| ACFS | 机器/环境引导与工具栈铺设 | 不把整机安装器当每项目初始化；不要重复接管安装 |
| repo_updater（候选） | 多仓发现、Git 同步/状态及声明的 agent 工作流 | 先验证可复用范围，不因存在该工具就自动执行同步或提交 |

版本与证据级别：前四个重新核对版本的文档，以及 ntm/bv 的操作声明，不等于本机端到端通过。其余后端职责同时参考缓存 README 与已有历史实测报告；历史报告的成功/失败不代表本轮重新验证。`repo_updater` 当前未成为 APG 已支持组件。

### 4.1 单一作者生态：应借鉴协议，不应照抄仓库数量

`agentic_coding_flywheel_setup` 的本地固定 checkout 说明其组合工具栈，许可证署名 Jeffrey Emanuel；当前清单所有入口归属同一 GitHub 命名空间。`beads_rust` README 又明确其与 Steve Yegge 原始 Beads 的来源关系，因此不能说所有技术都由同一个人原创。

这些项目是可组合的 CLI 生态，且存在大量集成、重叠和共享假设，不是一份强制统一依赖。NTM 自己就是较宽的控制面，故“作者拆了很多仓库，所以 APG 每个模块也该拆仓”并不成立。

借鉴：有边界的 CLI/数据格式、后端替换、明确副作用、独立使用价值。
不照搬：仓库数量、整栈默认安装、共享状态目录假设、所有后端同时管理同一会话。

### 4.2 完整运行基础设施还缺的是接线与验收，不是再列更多工具名

APG 尚未建立统一、已验收的：

- executable 绑定、参数/JSON 协议、project/cwd、精确版本与能力协商；
- 操作效果、dry-run 的真实性、配置补全计划与确认边界；
- job/attempt、超时/取消、幂等、恢复后所有权、失败与 unknown 的区分；
- workspace/worktree 隔离、租约与并发写入责任；
- 预算/凭据路由/真实批准的对接与逐项验证证据；
- 从 artifact present、executable、healthy、configured、authorized 到 task-ready 的分层状态。

这不意味着外部工具完全没有上述机制。先核验已有后端，再由集成层补协议和缺口；不在 APG 再造一套全部机制。

## 5. CODE 母目录：独立应用边界，先复用后决定是否新项目

`repo_updater` 上游 README 声明本地状态/同步、review、agent-sweep、经 ntm 的 ai-sync；bv v0.25.0 声明 workspace 配置；NTM v1.35.1 声明会话、审批、checkpoint/pipeline。因此“没有工具覆盖多项目”这一前提不成立。但它们是否满足我们的混合 APG 版本、非 Git 项目、治理状态和可靠推进需求，尚未完成端到端验证。

建议三个层次，禁止混为一个自动化开关：

1. **观察**：显式登记/发现项目，显示 Git、APG 固定版本、任务、能力与运行状态；只读默认，不自动 fetch、不读取全部私密文件。
2. **初始化**：项目骨架/Git/工具环境由对应 provider 处理；APG 仅承担治理物化 preview/apply。不得扫描到目录便自动接管。
3. **推进**：具名任务、预算、操作许可、lease/worktree、退出条件明确后委派已选后端。脏工作树不自动提交；人工离线不增加授权。

多项目应用必须处理 canonical path、git common-dir/worktree、项目 ID 和实例身份，防止 symlink 重复扫描；状态携带时间及证据，未知/过期/未安装与失败分开。

**当前裁定建议**：先做只读 portfolio 适配验证。若现有组合足够，只开发薄适配/视图，不新增通用调度项目；若缺口稳定，再建独立 workspace supervisor。即使最终提供 `apg workspace` 入口，也应委派独立应用，APG 单项目功能不依赖它启动。

## 6. 推荐目标结构与独立化准入

```text
独立的 workspace/portfolio 应用（可选）
  ├─ 每项目 pinned APG：治理、context、记忆审查、项目物化
  └─ 能力宿主/适配层（先同仓边界；满足条件再独立）
       └─ 可替换的 br/bv/am/ntm/ft/检索等后端
架构导航工具：旁路人机理解工具，失效不得阻断治理
```

图不表示 workspace 可以绕过单项目治理，也不表示当前已存在这些独立产品。

独立化应满足：

- 非 APG 消费者或明确独立生命周期，拆出后有独立价值；
- 输入/输出/效果/错误/版本协议明确，不穿透另一个包私有文件和状态；
- 能独立测试，坏版本可以回退，核心不需要 lockstep 升级；
- 省下的维护成本超过新 CI、发行、安全/许可维护及兼容矩阵成本；
- 无强制新守护进程、网络依赖或浮动 latest 冷启动。

建议顺序：

1. 先收敛本报告边界，修订 ADR/契约；保持当前运行行为不变。
2. 仓内能力管理接口与操作级 readiness；建立一个真实低风险后端闭环及反例。
3. 路由纯决策/IO 边界、foundation 职责收窄；不抢先拆发行事务。
4. 多项目只读验证；架构导航用第二个仓库证明复用价值。
5. 有证据再独立包，最后才决定仓库分离。每阶段独立 commit 与兼容测试。

## 7. 3.x/4.x 兼容红线与本轮验证

- 不覆盖全局 `apg`，不广播迁移，不改变其它仓库 descriptor/根指令。
- 开发入口与写入状态隔离；稳定制品可在验证后只读复用，但不借共享 store 偷改 3.x 记录或 schema。
- 多项目应用逐项目调用其 pinned APG；缺失运行时明确报告，不回退 latest，不统一强制 4.x。
- 独立包不会自动独立安全：适配失败必须可观察，并保留 APG 现有 CLI/发行契约。

本轮运行：治理 Reviewer/static；静态文件/依赖调查；在线读取固定版本说明/许可证；架构 check 与 `node scripts/test-architecture.mjs` 通过（包括模块归属、无环导入、锚点、派生视图及分发隔离）。未运行外部程序、没有重新验证全部第三方服务或构建来源、未跑全量 release suite。没有据此宣布完整 AI runtime 已完成。

## 8. 证据定位

本地权威：

- `docs/modules/{CONTEXT,COMPONENTS,STORAGE_RUNTIME,ARCHITECTURE_NAVIGATION}.md`
- `docs/architecture/modules.json` 与 `docs/architecture/generated/INDEX.md`
- `lib/{context,context-routes,components,component-resolution,service-probe,core,risk,memory}.mjs`
- `scripts/{apg.mjs,external-components.json,test-boundary.mjs}`
- `decisions/0007-authority-plane-and-execution-plane.md`
- `plans/MULTI_AGENT_INFRA_INTEGRATION_RESEARCH.md` §13.21–13.22（历史证据）

缓存源码基线（仅说明调查对象，不冒充 upstream latest）：ACFS `b042ffb`、repo_updater `b5fe013`、NTM `2ac3c15`、ft `31f255d`；路径均为 `.agent-scratch/external-test/repos/<repo>/`。

在线主源通过 GitHub raw/API 只读获取（web 检索接口未返回可用正文，故改用直接 HTTP）；10 份文档均已重新按不可变提交下载并确认内容哈希一致；来源及响应内容 SHA-256 见附属 `APG_V4_BOUNDARY_UPSTREAM_SOURCES.json`。不收录第三方正文。标签可移动，后续验收应按记录的提交/内容哈希重新确认；repo_updater 是当日 main 快照，不是 APG 支持的发行承诺。

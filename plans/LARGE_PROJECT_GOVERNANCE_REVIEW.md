# APG 大型项目治理对照研究

日期：2026-09-08。范围：APG 的项目治理能力，而非 DSH 插件钩子设计。本报告补充 `R6_DESIGN_REVIEW.md`，不批准 R6 实现，不安装任何参考工具。

## 1. 结论

最值得组合借鉴的是：**OpenSpec 的增量变更组织 + Spec Kit 的原则与一致性检查 + Kubernetes 的分域责任和分级验收 + Backstage 的组件关系 + Nx 的可执行边界**。BMAD 可补充按任务复杂度调整流程的思路。

这不是推荐把六套系统安装到 APG，也不是称它们功能等同。APG 应继续作为轻量、宿主无关的治理上下文与契约工具，衔接使用者已有的代码托管、构建、CI 和责任目录，不扩张成开发者门户、构建系统或通用多 Agent 编排器。

APG 的优势是精确路由、来源/hash、加载预算、mandatory 内容、权限不随角色增加以及迁移验证。大型项目能力的下一步重点应是让这些能力能定位到真实模块和真实变更，并提供可追溯的验证依据。只增加角色说明或强制加载插件，不能完成这一点。

## 2. 来源与成熟度判断

本次搜索服务遇到额度限制；随后通过工具的本地只读回退直接读取已知项目的官方 GitHub 文件和文档。没有克隆、执行或安装上游项目，也没有购买服务。以下 URL 多为 main/master 或动态文档，属于当日观察，不是某个固定 release 的验收依据。

“成熟”按机制区分：Kubernetes 的大规模协作与发布治理具有长期实际使用背景；Backstage/Nx 是大型工程使用的领域工具；Spec Kit、OpenSpec、BMAD 属于功能更接近 APG、但变化更快的 AI 开发生态。本次未核实其企业部署数、成功率或收益，不引用 star 数来证明治理有效性。OpenSpec Stores 官方标记 beta，不能当成已验证的跨仓稳定基础设施。

| 项目 | 实际定位 | 对 APG 的相关性 | 已读官方证据 |
| --- | --- | --- | --- |
| [GitHub Spec Kit](https://github.com/github/spec-kit) | Spec-driven 开发工具；原则、规格、计划、任务及一致性检查；多 coding-agent 集成 | 功能接近：把项目原则与每次变更联系起来 | [README](https://github.com/github/spec-kit/blob/main/README.md)、[plan template](https://github.com/github/spec-kit/blob/main/templates/plan-template.md) |
| [OpenSpec](https://github.com/Fission-AI/OpenSpec) | 面向已有项目的增量规格与变更工作流 | 功能接近：维护现行规范与在途变更的明确区分 | [README](https://github.com/Fission-AI/OpenSpec/blob/main/README.md)、[concepts](https://github.com/Fission-AI/OpenSpec/blob/main/docs/concepts.md) |
| [BMAD Method](https://github.com/bmad-code-org/BMAD-METHOD) | 由澄清、规划到实施验证的 AI 协作方法；按复杂度调整流程 | 借鉴流程裁剪和专业视角，避免每件事走同一重流程 | [README](https://github.com/bmad-code-org/BMAD-METHOD/blob/main/README.md)；本次仅核对概览，未验证运行时流程 |
| [Kubernetes community](https://github.com/kubernetes/community)、[enhancements](https://github.com/kubernetes/enhancements) | 大型开源项目的责任归属、技术提案、发布验收机制 | 大型项目治理的主要基准，非 APG 同类产品 | [OWNERS](https://github.com/kubernetes/community/blob/master/contributors/guide/owners.md)、[KEP 模板](https://github.com/kubernetes/enhancements/blob/master/keps/NNNN-kep-template/README.md) |
| [Backstage](https://github.com/backstage/backstage) | 开发者门户与软件目录 | 借鉴组件、系统、责任与关系建模 | [Catalog descriptor](https://backstage.io/docs/features/software-catalog/descriptor-format/)；本次读取前部实体/元数据/关系内容，长页被截断，未完整审计实现 |
| [Nx](https://github.com/nrwl/nx) | Monorepo 工程与依赖图、任务工具 | 借鉴模块边界的机器检查，而不是仅写文档 | [Enforce Module Boundaries](https://nx.dev/docs/features/enforce-module-boundaries) |

## 3. 逐项借鉴

### 3.1 OpenSpec：把当前规范与变更提案分开

已读机制：`specs/` 表示当前约定行为，`changes/<change>/` 保存 proposal、design、tasks 和增量 specs；增量使用 ADDED/MODIFIED/REMOVED；archive 更新主规格并保留变更历史。concepts 文档还区分 Lite 与高风险 Full spec，工作流依赖不是通用的权限门。

APG 可借鉴：

- 一个重要变更有一个稳定入口，链接目标、非目标、涉及契约、任务、验证与最终交接。
- 提案描述计划，模块契约描述现状，ADR 保留决定理由；不让同一文档承担所有职能。
- 跨仓变更可拥有同一个变更标识，但每仓保留独立提交、验证和发布。先用链接与版本引用，不建设中央规划服务。
- 小修复沿用简短任务记录，不强制建立五份文件。

避免：把 archive 或勾完任务当作发布验收；把 OpenSpec 文档中的产品比较当作客观评测；照搬 beta Stores；用新 specs 目录复制 APG 已有权威模块契约。

对当前 APG：R5 和 R6 已有独立交接/审查文件，方向正确，但长 `REVIEW_FINDINGS.md` 应保持问题索引，不继续承载每项功能的全部设计与实施历史。

### 3.2 Spec Kit：项目原则需要在计划和产物间复核

已读机制：项目 constitution；specify → plan → tasks → implement 等流程；analyze 检查跨产物一致性。实际 plan 模板含 Constitution Check，要求研究前检查、设计后复查；有 Complexity Tracking，仅在违反原则时说明必要性和放弃的简单替代。

APG 可借鉴：

- 对公共接口、高风险或跨仓变更，计划中列出本次实际命中的原则及满足/例外证据，而非复制全部治理文档。
- 让需求、计划、任务与检查相互可追溯：有任务不代表满足需求，有测试不代表覆盖原始问题。
- 将异常和复杂度引入写成可审查的决定。例如 APG 为何新增协议、为何需要新 provider，而不是默认为某个宿主改造核心。

避免：把模板里的 GATE 误称为宿主执行权限；为所有修复强制完整工作流；直接引入多层 preset/override 系统改变 APG 现有优先级。Spec Kit 当前演进较快，集成时应另行固定版本验证。

### 3.3 Kubernetes：角色、责任范围、技术审批与测试是不同东西

已读机制：分目录 OWNERS，reviewers 与 approvers 分开，支持父级继承与 `no_parent_owners`；Prow 消费这些规则。`/lgtm`、`/approve`、阻塞标签及测试结果共同影响合并，文档也诚实记录流程中的例外与不足。

APG 可借鉴：

- `Reviewer` 只是工作视角，不等于这个模块的真实负责人或有权审批的人。
- 跨模块变更需要识别每个受影响模块的责任范围，明确谁提供技术判断、谁批准兼容性/边界变更。
- 已有 CODEOWNERS/OWNERS 应优先作为项目责任来源，不在 APG 中再手工维护一套相同人员名单。
- 核对规则覆盖范围与实际身份；未知责任人就报告未知，不能通过创建更多 agent 名称伪造独立性。

避免：为 APG 当前规模安装全套 Prow/Tide；假定 OWNERS 与 GitHub CODEOWNERS 有完全相同的继承语义；把技术 APPROVE 当作生产写权限。

### 3.4 Kubernetes KEP：按风险和生命周期收集证据

已读机制：明确 Goals/Non-Goals、风险、测试计划、毕业标准、升级/降级、版本偏差与生产就绪问卷。模板明确：提案合并不表示完整或批准；进入 implementable 需要相应审批。发布签核另有测试、文档、生产就绪等条件。

APG 可借鉴：

- 明确 proposed、可实施、已实现、已验证、已发布的区别；定义所需证据，避免把一个 `pass` 扩张为全部状态。
- 跨仓插件必须有 APG/插件/宿主版本兼容矩阵、启用与回退方案。
- 迁移和持久状态变更必须检查降级与恢复，而不只有正常路径。
- 关键验收应绑定候选版本/提交或内容摘要，并区分本次运行、旧证据复用和未运行项。

避免：复制整份 Kubernetes 生产问卷到每个文档修复；把 alpha/beta/GA 字样当作已经通过规模测试。APG 已有的风险分级应优先复用，不另造一套相近等级。

### 3.5 Backstage：让 agent 知道“改的是哪个系统的哪个组件”

已读机制：组件描述包含 type、lifecycle、owner、system；目录实体有带版本的 envelope、名称/命名空间和关系。派生 relations 与输入 spec 分开，关系可能来自配置处理器或附近 CODEOWNERS。官方还指出持久引用应使用实体引用，不应依赖可变化的内部 uid。

APG 可借鉴：

- 根级架构索引链接到具体模块契约：组件负责什么、依赖谁、属于哪个系统、由谁负责。
- 对变更定位受影响组件，读取相关契约与接口，而非把全仓架构文档塞入上下文。
- 对已有 Backstage catalog 的项目，只引用或转换所需字段并记录来源；不要创建另一份需要人工同步的权威数据。

避免：把 APG 改成有数据库和 Web 门户的软件目录；自动拉取目录中任意 URL；把 owner 字段解释为执行授权。Backstage 派生关系的权威规则属于其目录处理模型，不能直接覆盖 APG“索引不是强制规则权威来源”的边界。

### 3.6 Nx：把重要架构约束变成构建检查

已读机制：project tags 与 dependency constraints；JS/TS 的 `@nx/enforce-module-boundaries` 检查导入和 package.json 依赖；跨语言图检查通过 Conformance，当前文档标为 Enterprise 功能。不是所有 Nx 能力都是无条件免费的。

APG 可借鉴：

- 模块契约中的 Allowed/Forbidden 依赖，对应一个可执行检查入口。
- 验证矩阵说明哪些变更触发哪些检查，并引用既有构建工具的配置。
- 对 APG 自身，核心不能导入 `plugins/` 或宿主 SDK，插件内容不能进入核心分发，宜成为自动回归断言。
- 对大 monorepo，优先消费现有依赖图与 affected 工具；关键公共治理、schema 和发布变更仍需要完整相关验证，不能盲信局部选择。

避免：仅为 APG 当前项目引入 Nx；自行编写跨语言依赖图引擎；将付费 Conformance 当作必需依赖；把 lint 检查当作运行时隔离。

### 3.7 BMAD：按问题复杂度选择流程深度

README 声明小变更可直接 build，大变更加深澄清与规划，支持已有代码的上下文建立和不同专业视角。可借鉴的是裁剪原则，而非照搬角色人数、编排方式或假定框架能自主完成全部治理。本次未深入核验其内部实现，故不将其作为强制行为/可靠性的证据。

APG 的 Developer/Reviewer/Verifier 等角色和模板触发条件已经支持相近方向。先让既有角色交接和验证有效，再决定是否缺新角色。

## 4. APG 已有基础与真正的缺口

本次直接读取了以下模板，不把已有能力重新描述成待发明功能：

| APG 当前依据 | 已有正确设计 | 下一步应补强 |
| --- | --- | --- |
| `templates/MODULE_CONTRACT.md:3,12-51` | 按高风险/公共/跨边界需求建契约；职责、依赖、状态、副作用和检查齐全，不是一目录一模板 | 在 APG 自身实例化关键模块契约，并把规则连到可执行检查 |
| `templates/ARCHITECTURE_OVERVIEW.md:12-60` | 系统上下文、拓扑、模块和信任边界；标记 verified/inferred/unknown | 根索引能指向真实模块与当前证据，避免只有模板没有落地 |
| `templates/VERIFICATION_MATRIX.md:3,16-44` | 矩阵选择当前命令，不伪装历史结果；按变更风险扩大检查 | 自宿主落地矩阵，修复已登记的退出码问题后接 CI，不重写测试框架 |
| `templates/ADR.md:8-44` | 责任范围、状态、替代方案、验证和回退 | 大变更关联需求与验证证据；ADR 不取代当前规范 |
| `plans/REVIEW_FINDINGS.md` 的 H2、M2、R2/R3 | 已记录 CI、自宿主索引/矩阵与验证工程问题 | 与本报告建议去重，仍沿用原任务编号，不能把本报告算作问题已关闭 |
| `plans/R5_VERIFICATION.md` | 已有候选 digest、审查与验证分离、证据与例外 | 后续证据需要稳定可取得的位置；仅依赖 `/tmp` locator 不足以支撑长期发布追溯 |
| `plugins/README.md` | 插件独立 Git/依赖/发布，APG 不依赖 DSH | 增加可重复边界检查；父仓 clone 不包含子仓的事实必须持续明确 |

这里的主要不足是**实例化、关系和自动执行**，不只是文档数量。尤其不能通过写更多模板掩盖既有退出码、CI 和长期证据问题。

## 5. 建议优先级：先在 APG 自身证明治理有效

这些是建议，不是本轮新增实现承诺，也不覆盖用户要求的独立插件边界。

1. **先落实已有自宿主入口与检查选择。** 处理已登记 M2：文档索引、核心模块契约、验证矩阵。处理 R2 的失败退出码后再接 H2/CI；不先搭建新平台。
2. **对下一项高风险变更试行最小追溯。** 一个变更入口列出需求/场景标识、模块契约、责任来源、检查标识、候选与结果。能放一个文件就不要拆五个文件。沿用当前目录体系，不默认安装 OpenSpec/Spec Kit。
3. **将重要边界变成执行断言。** 先覆盖核心↔插件依赖方向、打包排除、路由/预算、兼容与恢复写入；真实运行结果由 CI/验证器提供。
4. **按模块扩展，不按角色无限扩展。** 当真实消费项目出现多组件/跨团队需求时，复用其 OWNERS/CODEOWNERS/catalog；在 fixture 中验证覆盖和冲突，再考虑通用机器可读关系层。
5. **R6 仍保持独立设计。** APG 只读预检查/运行时信任、source-worktree 演进与 DSH 插件各自验收。不能因为此次研究就把这些与全部历史重构混为一项大任务。

建议的最小追溯记录示意（不是新 schema）：

| 需求/场景 | 当前契约 | 受影响模块与责任来源 | 验证命令/测试 | 候选与证据 | 状态 |
| --- | --- | --- | --- | --- | --- |
| 路由预检查遇到待恢复事务时零写入 | 待设计的 observational 接口 | APG CLI/恢复模块；真实 owner 待确定 | pending-recovery fixture + 前后快照，尚未实施 | 无本项通过证据 | proposed |
| APG 分发不包含 DSH 插件 | `plugins/README.md` 与核心分发白名单 | APG packaging / 独立插件仓 | 本轮之前已有一次本地边界检查；持久回归待补 | 见 R6 设计审查，不等同于新插件验收 | scaffold verified |

大项目治理验收应问：能否知道改动影响谁、找到适用规则、检出违反边界、追溯需求到检查，并在失败时正确阻止合并或发布。文档多、agent 多、工具多，都不是这些能力的替代指标。

## 6. 范围与证据限制

本轮是资料研究和有界本地对照，没有测试参考项目的实现，也没有正式比较其性能、可靠性或商业适用性。Kubernetes 文档描述的治理过程是证据；其他项目的“企业级”“规模适用”自述仅是定位。所有兼容或实施决策还需要固定具体版本和可执行测试。

没有修改 APG runtime/schema/catalog、DSH 或独立插件。报告放在 source-only `plans/`，不会进入当前运行时白名单。没有升级依赖、部署平台或改变已有审批政策。

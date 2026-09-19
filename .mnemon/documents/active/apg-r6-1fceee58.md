---
id: "1fceee58-86cb-4e41-a187-07d4bebd345a"
title: "APG 增量开发路线与 R6 独立插件设计边界"
description: "APG 最终增量开发规划：复用已有 core/tests/profiles/pilots，P0/P1a/P2 优先序，R6 三工作包及六项信任/副作用风险，独立插件 Git 边界和候选/证据纪律。"
status: "active"
created_at: "2026-09-08T06:55:17.383Z"
updated_at: "2026-09-19T09:05:32.591Z"
content_hash: "7b213c1b5884dd53773499c5d0920f3fd4a98a7e4b46c4d73608387f59e250b0"
source_paths:
  - "plans/DEVELOPMENT_ROADMAP.md"
  - "plans/REVIEW_FINDINGS.md"
  - "plans/LARGE_PROJECT_GOVERNANCE_REVIEW.md"
  - "plans/R6_DESIGN_REVIEW.md"
  - "plans/R5_VERIFICATION.md"
  - "plans/AGENT_PROJECT_GUIDES_2.0.md"
  - "plans/PROVIDER_RUNTIME_EVOLUTION.md"
  - "docs/V2_CONTRACT.md"
  - "docs/V3_MINIMAL_SLICE.md"
  - "plugins/README.md"
  - "fixtures/pilots/small-cli.json"
  - "fixtures/pilots/complex-content-package.json"
  - "scripts/test-release.sh"
  - "scripts/test-release-pilots.mjs"
session_ids:
  - "a15d271f-2cbe-4f55-b75d-b95e9686569b"
memory_body_ids:
  []
---

# APG 增量开发路线与 R6 设计边界

## 文档定位

本记录凝练已完成的研究与规划交付，本仓库中的 `plans/DEVELOPMENT_ROADMAP.md` 为后续规划入口，`plans/REVIEW_FINDINGS.md` 为原发现/编号/证据权威。规划不是实施或发布记录；重新开工须核对当前源码、候选和契约。

## 产品方向与研究融合

APG 核心保持 harness-neutral，负责 portable descriptor、精确路由、内容选择、hash/预算和兼容 continuation。宿主实现各自放在 `plugins/<harness>-apg/` 独立目录及独立 Git 仓库。当前 `plugins/dsh-apg/` 只有 README/.gitignore 和真实子 `.git/`；父仓忽略 `/plugins/*/`，无 gitlink/submodule，父仓 clone 不含插件源码。尚无可加载插件、远程或发布。

借鉴机制而非安装整套工具：
- [OpenSpec](https://github.com/Fission-AI/OpenSpec/blob/main/docs/concepts.md)：当前规范与变更增量分离。
- [Spec Kit](https://github.com/github/spec-kit/blob/main/templates/plan-template.md)：原则检查、需求/计划/任务一致性与复杂度例外。
- [Kubernetes OWNERS](https://github.com/kubernetes/community/blob/master/contributors/guide/owners.md) 与 [KEP](https://github.com/kubernetes/enhancements/blob/master/keps/NNNN-kep-template/README.md)：责任范围、技术审批、成熟度、兼容与回退证据。
- [Backstage](https://backstage.io/docs/features/software-catalog/descriptor-format/)：组件/系统/责任关系；[Nx](https://nx.dev/docs/features/enforce-module-boundaries)：可执行依赖边界；[BMAD](https://github.com/bmad-code-org/BMAD-METHOD)：按复杂度裁剪流程。

研究主要读取官方文档及模板，未验证企业成效；上游 main/master 链接可变。不要由宣传、star 数或模板里的 gate 推断真实执行保证。APG 不扩张成门户、构建图引擎、通用 adapter SDK、中央证据/记忆服务或多 Agent 编排平台。

## 应复用的 APG 资产

- `lib/catalog.mjs`、`lib/context.mjs` 与 `routing/context-routes.jsonl` 已有 exact resolve/load、compiler、section 预算、hash 与全 route 双格式验证；R6 不另写 classifier。
- `lib/closure.mjs` 已有 selected closure、sourceContentView/packedContentView；schema 2 当前只支持 `selected-inline.none` 和 `shared-runtime.pinned`。schema 1 的 thin/embedded/source-worktree 兼容保留。
- `lib/risk.mjs` 已有单调 tier/effects/origins/required_checks；它们是要求，不是权限或 verdict。风险 R0–R3 与路线 R1–R6 是不同编号空间。
- `lib/memory.mjs` 已有 propose/review/promote/supersede/purge。稳定经验优先进入 test/contract/runbook/ADR；日志不自动 promote。
- `templates/` 和 `profiles/CONTENT_PACKAGE.md`、`profiles/MONOREPO_PROJECT.md` 已有权威分工和根/包作用域规范。缺口主要是自宿主索引/矩阵实例化与执行检查，不是模板不足。普通 R0/R1 工作保持零新增治理文件。
- `scripts/test-release.sh` 已组合 schema、routing、install、V2/V3、catalog、validate、manifest；依赖 Node、Python3、POSIX shell/Git。改进现有脚本而非新建测试引擎。`test-v2.mjs` 在源树 build catalog 是待修隔离缺口；真实 pilots 默认不执行，CI 须明确 skip。
- 旧 `PROVIDER_RUNTIME_EVOLUTION.md` 的全部模式、`project:` authority registry/expected-observed hash、refresh、选择集扩缩容/uninstall、channel、finalization 均不能从设想直接认作已支持。

## 最终收紧后的开发顺序

1. **P0 基线与证据保护**：记录实际 dirty 候选、字节/模式/index；保留用户修改。从 HEAD 新建 worktree 不能自动带上 dirty R5。保存仍可取得的原始证据及 hash；缺失 `/tmp` 证据只记录缺口或重跑，不能重建假日志。
2. **P1a 最小自宿主入口**：docs/INDEX、verification/MATRIX、简短 CONTRIBUTING，引用已有 V2/V3/迁移合同与 release 脚本。**P1b** 模块/架构说明随 P2/R6 实际变更补齐，不先要求三份完整模块文档。
3. **P2 工程可靠性**：先 R2/H3 的 CLI 参数与失败退出码、launcher/direct CLI 负例；再修现有测试隔离/独立 oracle/报告；接 CI；补 R1 发布身份与 M6 元数据。CI 不能先于可靠退出语义。许可由权利人选择。docs/ 属于分发白名单，未来 P1 docs 变化需新 catalog/manifest/候选，不能沿用 R5 digest 批准。
4. **P3 拆分 R6**：R6-A 通用可信调用与 observational 接口；R6-B 独立 schema-2 source-worktree；R6-C 独立 DSH 插件。插件设计/mock 可提前，自动真实 APG 集成必须等待 R6-A；R6-B 不是插件首版强制前置。
5. **P4 隔离集成、现场验证、分别发布**：core、插件、现场三层验收；声明支持的 host/plugin/APG/provider/model/version 各至少三次 fresh-session，包含澄清、负例、child/resume。部署/发布单独授权，不修改活跃 GUI 冒充测试。
6. **P5 增量大型项目试点**：先复用既有 pilot 场景和指标，再补一个可表达多组件及跨 Git 根失效模式的最小 fixture；只有独立失败模式需要时才拆第二个。先文档/责任映射，原生项目 authority 进入 compiler 要单独注册契约，不绕过 allowlist。

近期首批为 **P0 + P1a → P2 失败语义/测试隔离 → CI**，P1b 按需跟进。M3/R4/M4 原语维护、M1 token 语义 ADR、D-16/L 问题保留原编号，按复现风险分批。Windows 维持低优先级；WSL/Linux 证据不等于原生 Windows 支持。

## R6 六项关键设计风险

1. **执行信任**：`scripts/apg-launcher.mjs:188-209` 的 source-worktree 路径会导入 checkout CLI。安装 launcher、结构化 argv、marker/descriptor 都不足以授予源码执行信任。宿主独立选受信 runtime，或明确 canonical-root developer opt-in；测试恶意顶层 sentinel 在 import 前被拒绝。
2. **隐藏写入**：`scripts/apg.mjs` 的 `contextCommand → targetRoot → recoverDescriptorTransactionIfPresent` 可写 descriptor/receipt/事务。自动预检查需真零写入，待恢复时非 ready；旧恢复合同不得静默改变。
3. **生命周期**：APG generation 不是 host turn/child 工具租约。插件状态绑定 canonical root、agent/turn/attempt、任务来源、route/source observation；取消、晚到结果、同 ID clone、source edit、fork/resume/reassignment 须测试。schema 1 无 generation 的 exact-target continuation 与 shared-pinned 签名 generation 保留各自语义。
4. **观察证据**：compiler-loaded、plugin-assembled、host-request-observed 分开；旧 `host_observed` 或 `dsh report` 不证明新插件实际注入，`model_effective` 始终 unknown。
5. **provider 耦合**：schema-2 source-worktree 不只是增加 enum；当前 schema2 launcher/validation/materializer 依赖 pinned/packed/materialized 假设。复用 loader/closure，设计真正 mutable/observational 路径，不虚构 immutable artifact 或自动迁移。
6. **宿主/分发边界**：插件 owns SDK、hooks、UI、child/resume、版本兼容与发布；APG core 不导入插件。原生 ToolRuntime gate 不等于所有 Node/plugin/remote worker 副作用都受控。

DSH rc.2 静态调查提示已有 pre-step/monotonic tools.guard 可覆盖标准模型和受管工具路径，但 prompt assembly 在 pre-step 前，且 continuable setup 不覆盖全部 one-shot children；不能承诺零仓库预读取或宿主全局强制。尚未做插件运行时验收，不修改全局 npm 安装。

## 既有项目证据分层

`fixtures/pilots/small-cli.json` 指向 cc-teamwatch（1.4.3 基线、1650 token 上限）；`complex-content-package.json` 指向 MSP/Core（content-package + agent-governance、1660 上限）。定义版本化，但 `test-release-pilots.mjs` 仍从 APG_PILOT_ROOT/父目录读取外部源码并复制到临时目录，要求旧根标记。未确认外部项目今天可用、已迁移或通过。

CadQ、dsh-bench、cc_switch_tiny_switch、dsh-vision-toolkit-windows-edge、onshapescript、taobao-mcp 仅是旧 2.0 §19 候选池。只有缺少特定失效模式时选取；先确认 owner、源 revision/dirty 状态、输入范围及允许干预。不要因列表存在就扫描/迁移/复制敏感内容或调用业务工具。

保留四个已有硬 gate：exact route/non-inferiority、mandatory recall、migration byte ownership、no generic staging；route success 不等于 task success。synthetic、真实源码副本、实际宿主任务和 skipped 分别报告。

## 验收和证据纪律

重要变更在既有任务/PR/计划中链接需求/场景→模块契约→责任来源→检查→候选/结果；未知 owner 不伪造。风险 R2/R3 最低合同由非作者批准。复用确定性机器结果须可识别候选、检查实现、相关输入、producer 与适用性；live/security/migration/stochastic/physical/field/human evidence 默认 fresh，机器缓存不继承旧人工批准。无需通用 attestation schema。

R5 基线限定为 3.0.4、H5/M7/M8，digest `sha256:deacad2bbc59057ad72516ceeb48c52b38e74d381f9dcc390fece9c1a2fa2325`，记录 Reviewer approved 与 Verifier pass，但未提交/发布。R6/H4/M9 保持 open。最终规划修订的有界审查提出六项复用建议并确认实质落实；随后两处文案（历史检查归属、未支持 variant 数量）由作者修正。作者重新检查 8 个本地链接、whitespace、release manifest，R5 runtime digest 不变；仅规划文件变化。没有本轮全套回归、外部项目检查或宿主现场通过证据。

# 包适配共享流程

仅 Developer/initialize（新项目）、Maintainer/readapt（已有项目）执行。本文件只拥有适配算法；日常规则/类型差异归 guide/profile/spec。

## 0. 激活、新鲜度和状态

激活须明确请求、active trigger、获准处理非 adapted 状态或治理漂移证据。确认-only/禁止动作：确认即停，不提前提问；检查留到获准后。

获准后验证本地关键文件，自动只读执行 `scripts/install.sh check-update`，不得先询问是否跳过。current 继续；remote_differs/unavailable 须结构化选择同步/重试、明确使用报告的本地版本或停止。

installer 写 pending/stale；适配写 partial/adapted/blocked。记录 revision/UTC/scope；adapted reason=none；partial 列剩余范围；blocked 记非敏感原因、保留 trigger。

## 1. 已解析角色和包路径

先精确选 initialize/readapt；显式 role/mode/literal alias 先于仓库发现。未分配 trigger 仅有界判断新/已有；不重读 registry 或同时读两份 guide。

`guide/procedure_by_mode/profile/spec` 相对治理包根目录解析；读取失败是完整性错误，禁止用 glob 猜路径。

## 2. 任务卡和事实

任务卡：目标；repo/workspace/package/module scope+模式；范围/非目标；主类型；根/runtime/build/test/CI/docs 证据；production/data/secrets/migration/network/cost/release/destructive 风险；路由/authority/验证/cold-start 验收；待决定项。

标 verified/inferred/unknown。实现/schema/build/tests 优于 README/roadmap/名称/旧文档；行为/安全/契约/类型/scope 冲突须问。报告必须与工具轨迹一致：列读取/搜索/失败，不隐瞒预读或把搜索补救说成首次命中。

## 3. 有界证据

不重读未变根规则；一次有界根清单，再定点读交付/authority/verification 证据。不重复枚举、全文扫仓、为模板搜集无关事实。保留 dirty/并行修改；分不清即停，禁止 reset/overwrite。

## 4. 主类型和条件子类型

按消费者契约/运行形态 exact grep `routing/project-types.jsonl` 一个 quoted id；不得预读多个 profile 比较，不按语言/框架/目录名分类。monorepo 根选 monorepo，包级另选非 monorepo 类型。

类型缺失或不可拆多义：以 `project_type` 结构化选择最近类型/拆分/更新定义/不适用并等待。仅 mcp profile 指示且拓扑匹配时 exact grep `routing/mcp-subtypes.jsonl` 一个 ID、读 spec；否则不读。架构只映射实体，不复制规范。

## 5. Artifact plan 和 template

`artifact -> decision -> authority/evidence -> action -> verification`：required 链接已验证 authority 或 merge/create；conditional 有证据才处理；omit 不新建、不删已有；existing-authority 只修索引/链接。

Exact files under `templates/`:

| Artifact | File |
|---|---|
| root | ROOT_AGENTS.md |
| role/task index | DOC_INDEX.md |
| development | DEVELOPMENT_START.md |
| architecture/data flow | ARCHITECTURE_OVERVIEW.md |
| module/local overlay | MODULE_CONTRACT.md |
| verification | VERIFICATION_MATRIX.md |
| user | USER_USAGE.md |
| operator | OPERATOR_RUNBOOK.md |
| field evidence | FIELD_EVALUATION.md |
| historical decision | ADR.md |
| subagent | SUBAGENT_ASSIGNMENT.md |

每项处理前只读一个模板，merge/link/verify 后再继续。禁止批量预读模板、枚举目录、覆盖具体内容或建空文档。

## 6. Authority 和去重

root=预读约束/最小路由/managed state；INDEX=task→一个 authority；Development=可执行入口；Architecture=当前边界/依赖；Module=ownership/invariants/effects；Verification=变更→检查；Usage/Operations=使用/运行恢复；ADR/Evidence/Roadmap/Generated=历史/观测/计划/派生物。

动态事实仅一个 executable/schema authority，其他链接或必要一行摘要。仅安全红线/权限边界/权威入口可重复。根不复制 managed routing；local AGENTS 仅预读差异并链接 contract；角色视图分离。

## 7. 验证和 cold start

检查 JSONL/path/ID 唯一性、root marker/state/UTF-8/size、重复 managed 候选、links/commands/generated drift/secrets、artifact decisions、subtype、公共/高风险契约、架构真实性、并行修改保留、trigger 移除。

无历史 agent：唯一选角色；INDEX→task authority；定位真实功能的实现/证据/tests/verification；说明 authority/permission/effects/文档触发；monorepo 先选包、Production 仅 delivery surface；不明确先结构化询问再扩读/副作用。记录 reads/tokens/searches/误判/澄清/返工，正确性优先。

## 8. 完成和停止

partial 也须闭合 root/index→authority→implementation/evidence→verification，列剩余顺序。完成：

```text
scripts/install.sh set-state --status adapted --verified-at <UTC> --scope <scope> --reason none
scripts/install.sh remove-trigger
```

公共行为不明、authority 冲突、需改变产品/架构/安全边界、涉及 production/real data/irreversible action 或并行修改不可合并：写 blocked，请负责人决定。不把推测当事实、不删 authority、不以文档数量代验收、不把所有角色塞入 root、不在日常任务重复本流程。

---
id: "dabe62f1-e048-458a-b2e6-c69609e54d4a"
title: "APG 3.0.7 新消费者首装记录：fresh materialization 路径与三仓库部署证据"
description: "APG 3.0.7 对三个全新仓库（pythonpubliclib、pid_tuning、dsh-bench-reports）的首装部署证据、配置选择、首装路径与迁移路径的差异、坑与回滚语义；并记录 MSP/ipc/libbase 的排除理由"
status: "active"
created_at: "2026-09-14T04:23:20.272Z"
updated_at: "2026-09-19T09:05:32.591Z"
content_hash: "2e5112f61ebf71ea3aeaa3c44de75dfc37a2ea4344e39e827f37cdc14b237936"
source_paths:
  - ".agent-scratch/new-consumers-20260914T035828Z/RESULT.md"
  - ".agent-scratch/new-consumers-20260914T035828Z/deployment-runbook.md"
  - ".agent-scratch/new-consumers-20260914T035828Z/deploy.py"
  - ".agent-scratch/new-consumers-20260914T035828Z/summary.json"
  - ".agent-scratch/new-consumers-20260914T035828Z/baseline.json"
session_ids:
  - "330844db-48fb-4432-8482-272da892a391"
memory_body_ids:
  []
---

# APG 3.0.7 新消费者 fresh materialization 部署记录（pythonpubliclib / pid_tuning / dsh-bench-reports）

日期：2026-09-14（UTC）。身份：本地开发者，WSL 本地仓库。本文与 `5bf8222a`（九仓库迁移升级记录）互补：那篇记录已有消费者的 schema 1 → 3.0.7 **迁移**路径；本文记录**全新仓库的首装（fresh materialization）**路径，两者不可互相套用。消费者总数由此达到 12 个（9 迁移 + 3 首装）。

## 范围与用户批准

用户逐项批准 `pythonpubliclib`、`pid_tuning`、`dsh-bench-reports` 的备份、治理安装与验证。用户明确排除 `ipc_20220921_V21.6`、`libbase`；`MSP` 仅当 Core 已装 APG 时才处理，现场 `Core/` 与 `Core/MSP_Core_0.7_r3/` 顶层均无 APG 入口，故跳过。三个排除目标零写入。MSP 的处置是任务级条件判断，不是已建立的 MSP 常设规则。

持续约定不变：此类部署的提交/推送仅限 APG 本仓；消费者治理更新留工作区，不提交不推送，已有业务修改保留。

## 版本与固定来源

- release 3.0.7；source digest `sha256:50852ae9…a8e5e24`；runtime digest `sha256:16e002d5…6107d467c`。
- 来源为已保留的 `.agent-scratch/ticket64-release/release-source`；CLI 报告 `source-worktree`/clean，**不宣称**签名或发布来源认证。
- 同摘要 shared runtime 安装前已存在且校验通过；共享 launcher 三个文件与 `~/.local/bin/apg` 链接和备份逐字节一致（本轮未改动共享入口）。

## 逐仓库配置与验证

| 仓库 | 生命周期 | Profiles / Overlay | 路由 | 最高 JSON / context（估算 tokens） |
|---|---|---|---:|---:|
| pythonpubliclib | active-development | library, monorepo-composition | 18 | 3581 / 3090 |
| pid_tuning | active-development | mcp, data-automation | 18 | 4045 / 3556 |
| dsh-bench-reports | maintenance | content-package / research-reproducibility | 6 | 2801 / 1932 |

- 三者 `project validate` 均 valid=true / status=ready；**42 条所选路由**同时校验 `context` 与 `json`，预算上限 4096，route hashes 通过，`authority_granted=false`。
- 每仓库用已安装 launcher 实测 maintainer/code 的 context 返回 ready；pythonpubliclib、pid_tuning 额外实测 production/operator/deploy 返回 ready。
- `pid_tuning` 最紧的 JSON 路由为 4045/4096，余量约 51 估算 tokens：后续任何指导内容扩充都必须重新验证预算。
- 该估算为 APG 的 `utf8-bytes/4-ceiling`，不是模型计费。validation 返回 `model_effective=unknown`：证明的是文件、runtime、路由与实际 CLI 输出有效，**不证明**未来每个 Agent 已自动消费这些上下文。
- `pid_tuning` 描述符声明 `protected_effects: physical-interface, production-action`（串口/设备写入/重启属真实效果）；`dsh-bench-reports` 采用最小角色集（维护/评审/验证），与其只读报告性质一致。

## 文件与数据影响

每仓库写入：`.agent-project-guides.json`、根 `AGENTS.md` 的 managed bootstrap、`.agent-guides/{MANIFEST.json,ROUTES.jsonl,.gitignore,local/materialization-receipt.json,local/materialization-journal.jsonl}`。shared-runtime 消费者不落 generic Markdown 全包；临时 `.agent-guides-transition/` 已清理。

`pythonpubliclib` 原有 AGENTS.md 全部字节被保留；`pid_tuning`、`dsh-bench-reports` 为新建根入口，文本与审阅副本 `project-entries/*.md` 一致，materialize 后再次验证完整保留。Git 索引原像、原有 tracked 文件的字节与权限均未变；Git status 集合仅增加预期治理条目。未运行目标仓库业务程序；无串口/设备/浏览器/Windows MCP 操作；无消费者 stage/commit/push；未改动 APG 主工作树既有源码改动。

## 首装路径的关键差异与坑（复用价值最高的部分）

1. **全新仓库必须用 Node CLI，而不是系统 `apg`**：系统 launcher 对无 `.agent-project-guides.json` 的目标返回 `launcher_error` / `no .agent-project-guides.json found`；首装应走 `node <release-source>/scripts/apg.mjs project materialize …`（先默认零写入 preview，通过后再加 `--apply`）。迁移路径（`migrate v3-preview/v3-apply`）仅适用于已有 schema 1 描述符的仓库。
2. **首装没有对称的自动卸载**：新安装不能拿 `v3-rollback` 当回滚（它恢复的是 schema 1 恢复态）。回滚必须基于本轮自建的原像/后像备份，见下节。
3. **共享 runtime 安装需要工作区外写入**：`installPackedRuntime` 会写 `$XDG_DATA_HOME/agent-project-guides/runtimes/.stage-*`，在 workspace-write 沙箱下以 EACCES 失败；需按 DSH 审批机制以**原命令**重试，而不是绕过沙箱或伪造回执。获批前失败是零写入的，目标未受影响。
4. **备份脚本要显式处理符号链接**：`~/.local/bin/apg` 是指向共享 launcher 的 symlink，需以 `follow_symlinks=False` 记录与复制，否则原像捕获会误判为异常路径。
5. **先备份后安装，并以 preimage 重验**：apply 前重查 Git 索引/既有 tracked 文件未变、治理路径原本不存在、根入口文本与审阅副本一致；成功验证后才进入下一个仓库。

## 证据与恢复

证据根目录 `.agent-scratch/new-consumers-20260914T035828Z/`：

- `RESULT.md`、`deployment-runbook.md`（已执行的有界操作与停止条件）、`deploy.py`（capture/apply/verify/rollback/seal 入口）、`summary.json`（verified_projects、launcher_unchanged=true、excluded、release、digest、consumer_commits_or_pushes=false）。
- `baseline.json`、`backups/<repo>/`：部署前治理路径字节/权限/不存在状态、Git 状态与索引证据。
- `launcher-preimages.json`、`launcher-backup/`、`launcher-postimages.json`：共享启动器原像与最终对比（无需恢复共享入口）。
- 逐仓库：`preview-*.json`、`apply-*.json`、`validate-*.json`、`context-*.json`、`install-preimages-*.json`、`installed-*.json`、`postimages-*.json`、`git-after-*.json`、`verified-*.json`。

回滚语义：`python3 deploy.py rollback <repo>` 为只读预检（核对现场完整后像 + 备份完整性，`writes=false`）；三仓库预检结果均为 `rollback_preflight=ready`。需真正恢复时经授权加 `--apply`，先全量比对后像与备份，无冲突才恢复原字节/权限与“路径原本不存在”状态；存在后续修改或缺少完整后像时拒绝恢复。**未执行实际恢复演练**，只做了预检。共享 runtime 保留不动，以免影响现有消费者。

## 遗留事项

- 三仓库的回滚仅有预检证据，无真实恢复演练记录。
- MSP 仍未接入 APG；若将来其 Core 装上 APG，需重新评估 MSP 的特殊接入要求。
- `ipc_20220921_V21.6`、`libbase` 按用户决定保持未接入；二者有历史/遗留治理痕迹，重新纳入前需先核实现有状态。

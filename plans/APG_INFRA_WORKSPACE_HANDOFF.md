# 基础设施工作区与独立管理项目首次落地

日期：2026-09-23。APG 原路径保持不变。本记录不随治理包发行。

用户已授权在 `/home/lijq/code` 新建项目目录；本轮仅创建新工作区和只读管理器，没有迁移 APG、安装第三方程序或广播版本更新。

## 独立仓库

| 仓库 | 本机位置 | 初始提交 | 当前职责 |
|---|---|---|---|
| Agent Infrastructure Workspace | `/home/lijq/code/agent-infra` | `25bb699` | 中性组合目录、示例布局与上游采用决策 |
| Infrastructure Manager | `/home/lijq/code/agent-infra/infra-manager` | `a21f2e6` | 无 APG 运行依赖的只读成员/存储目录检查 |
| APG | `/home/lijq/code/agent-project-guides` | 本仓库原历史延续 | 独立项目治理 CLI；现行组件入口未移除 |

工作名分别为 `agent-infra`、`infra-manager`；APG 展示定位为 Project Governance CLI，而非整个基础设施系统的品牌。不更改 `apg` 命令、project ID、descriptor、根 bootstrap 或任何历史运行时身份。工作名尚未完成公开商标/包名唯一性审查。

组合仓库忽略子仓库、`artifacts/`、`cache/`、`state/` 及本机登记；没有添加远端或推送。两个新仓库仅本地复用了 APG 现有 Git 提交身份，没有修改全局 Git 配置。

## 已有行为

```sh
node /home/lijq/code/agent-infra/infra-manager/bin/infra-manager.mjs \
  workspace inspect \
  --file /home/lijq/code/agent-infra/workspace.local.json --json
```

- 输入显式成员路径；相对路径相对 manifest，而非 cwd。
- APG 仍通过 `../agent-project-guides` 登记，不创建第二份 checkout 或 symlink。
- 只读 JSON 和路径元数据；无项目内容扫描、子进程、网络或自动创建目标目录。
- `present` 只说明目录存在，不等于工具健康、版本验证、许可批准或 APG 已接入。
- 重复目录、符号链接别名以及 storage/project 交叠被拒绝；新增加的缺失子路径经符号链接落入项目的反例先失败、修复后通过。
- 0 为目录检查完整，2 为登记路径缺失/非目录/不可读，1 为输入或命令错误。
- 测试中不需要 APG 存在；帮助和版本不加载治理运行时。新管理项目尚未安装 APG bootstrap，不伪造其治理接入状态。

## Fork 或包装的决定

决定的详细证据与边界位于新工作区：`docs/0001-layout-and-upstream-strategy.md`、`docs/acfs-source-evidence.json`。

- 不直接 Fork ACFS 改名成为管理器，也不复制其脚本来“摆脱”上游许可。
- 独立实现我们需要的薄管理核心，未来将许可明确后的 ACFS 作为可选 provider，通过公开 CLI/输出对接，不导入其私有 shell 库。
- 包装调用不是许可豁免。固定提交的 rider 与个人用户/组织、AI 辅助开发和运行方式是否相容仍需澄清；本轮不执行上游程序或再分发其源码。
- ACFS 已有选择/依赖/计划、诊断、更新、hold、部分恢复/服务管理；优先复用，不复制一套通用包管理器。
- ACFS 整机部署假设、版本 hold 和部分恢复不等于我们的用户级、精确版本、跨项目兼容与完整事务保证。adapter 必须按实际验收限定支持范围。

## 制品位置与迁移

新工作区下已建立空的 `artifacts/`、`cache/`、`state/`；它们与将来的 `apg/`、现有 `infra-manager/` 同级，而非藏在 APG 仓库内部。

现有 `.agent-scratch/external-test` 与用户级共享组件 store **没有搬动**。之后按版本/平台/摘要登记、复制核验、切开发引用、验证旧消费者、最后获准清理的顺序迁移。正式分发的数据根不硬编码到开发目录。

## 验证及限制

- Node v22.23.1；Linux/WSL 本机。
- 管理器 16 项隔离测试通过；含无 APG、错误输入、命令拒绝、目录别名及缺失目录不创建。
- 本机实际 workspace inspect 完成；只验证 APG、管理器和三个存储目录存在。
- 新仓库 staged diff 空白检查通过，受忽略的本机配置/制品未进入 Git。
- 未实现安装/更新/卸载/服务控制、ACFS 调用、APG 目录迁移或管理命令退出；未验证 Windows 原生、外部后端与许可证最终适用性。

下一切片应为 provider 描述、逐操作检查与只读计划；实际安装选择许可明确且作用域受控的后端，不能用本轮骨架的通过结果宣称完整基础设施已就绪。

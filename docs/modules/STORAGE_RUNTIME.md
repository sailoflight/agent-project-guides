# 文件、发行与本机状态契约

Status: mixed。Architecture parent: `docs/architecture/OVERVIEW.md`。

## 所有权

- `files.mjs`：排他临时文件、原子替换、可选 fsync 和仅清理本调用拥有的临时文件。
- `core.mjs`：规范数据、项目路径、发行边界和共用基础类型。
- `provider.mjs`：精确发行与 packed runtime 安装/校验、launcher、Git 排除位置。
- `generation-state.mjs`：私有 HMAC key 和 generation 引用；provider 保留旧导出。

不建立 ACL、签名供应链、敌对多租户隔离或新的自动更新服务。

## 不变量

- 规范字节排序不依赖机器 locale；摘要不包含机器路径。
- 已存在的临时路径不能被跟随或删除；失败不能被报告为成功。
- 项目自身文档、派生导航和源码作者工具不进入通用发行包或 catalog。
- 运行时只接受固定版本与摘要；source-worktree 不伪装为不可变发行证据。
- Git 文件指针须通过 worktree backlink 或 core.worktree 与目标关联；不可信布局显式失败。

## 验证

文件修改：local-write-safety + v2/v3。私有状态修改：context-state + context-choice + v3。
发行或排序修改：determinism + boundary + architecture + release verify-source。

为保持本地可信模型，低成本检查不承诺解决恶意并发 TOCTOU；非标准 unbound gitdir 布局需
显式配置 checkout 绑定，不自动猜测。Windows 原生语义需要单独平台证据。

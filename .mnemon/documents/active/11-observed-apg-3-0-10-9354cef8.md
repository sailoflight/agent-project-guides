---
id: "9354cef8-58e0-4223-a765-dd59eeafb964"
title: "外部组件预编译件：失败即拒的安全校验规程与 11 写入方 observed 实测（APG 3.0.10）"
description: "APG 3.0.10 外部写入方组件的官方预编译件安装与 fail-closed 安全校验规程：多源校验和比对、离线 minisign 实现、unshare 沙箱与对照窗口逃逸检测、9/9 组件的签名覆盖实情与诚实 GAP（无构建来源证明），以及 11 个根指令写入方由 scan 升级为 observed 的实测事实、两处纠正与被实测确认的能力边界。取代 7a28fea8 中写入方的 scan 等级与 a39ab3d6 的 5 写入方口径。"
status: "active"
created_at: "2026-09-20T03:06:31.783Z"
updated_at: "2026-09-20T03:06:31.783Z"
content_hash: "dc2437ef9266814a98c7aec501fd70d78d8a30c0517960b70e412ab7977ad922"
source_paths:
  - "decisions/0006-root-instruction-block-ownership.md"
  - "plans/MULTI_AGENT_INFRA_INTEGRATION_RESEARCH.md"
  - "scripts/test-interop-writers.sh"
  - "scripts/test-release.sh"
  - "scripts/manage-root-blocks.mjs"
session_ids:
  - "0c90706f-5bf9-4175-b3e0-8f135ebd5f22"
memory_body_ids:
  []
---

# 外部组件预编译件：失败即拒的安全校验与 11 写入方 observed 实测（APG 3.0.10）

**这是派生路由件，不是权威源。** 权威顺序：`decisions/0006-root-instruction-block-ownership.md`（块所有权与写入方实测）→ `plans/MULTI_AGENT_INFRA_INTEGRATION_RESEARCH.md` §13.17（取证、安全结论、待决项）→ 仓内代码与测试。冲突时以仓内为准。

## 1. 与既有派生件的关系

- `7a28fea8`（11 写入方普查 / 3.0.10）仍是对的口径，但它记录的写入方证据等级是 **`scan`**，且证据指向 `.agent-scratch/external-verify/census.json`（已失效）。本轮把其中 8 个写入方升级为 **`observed`**（真实发布二进制驱动），并新增 2 处纠正、1 处实测确认；`scan` 类结论以本文与 ADR 0006 的 `observed:` 行为准。
- `a39ab3d6`（3.0.9）的"5 个写入方"与 P3 覆盖面同样已被 3.0.10 取代。

## 2. 为什么不装工具链

9 个组件全部在官方 GitHub Release 发布 linux/x86_64 预编译资产 ⇒ **无需 Go/Rust/bun 工具链**（本机 `go`/`cargo`/`rustc`/`bun` 至今 missing，不影响任何事）。按 **asset id** 经认证的 `gh` 拉取：匿名 API 上限 60/h 会被瞬间打爆，认证后 5000/h。

## 3. 校验规程（fail-closed，五步）

1. **来源**：只取官方仓库 release 的 `browser_download_url`，记录 asset id / 官方 size / `published_at` / API `asset.digest`。
2. **多源校验和必须一致**：`.sha256` 侧车、聚合 `checksums.txt`/`SHA256SUMS`、GitHub API digest、本地实算 —— 任一不一致即拒绝，不降级放行。
3. **minisign 离线校验**（见 §4）；无签名者如实记为无签名，不记为"已验证"。
4. **解包前静态体检**：成员清单、绝对路径、`..`、越界符号链接、setuid 位一律拒绝。
5. **解包后记录**：`file` 类型、是否动态链接、sha256、大小；执行只在沙箱内（§5）。

失败即拒的真实实例：首轮 3/9 因 CDN（`release-assets.githubusercontent.com`）TLS 握手超时失败，管线**拒绝**而非降级放行，加重试后仅重下 `bv ntm ee`，全部通过。

## 4. minisign 的离线实现

本机没有 `minisign`/`cosign`，用 `cryptography`（Ed25519）+ 标准库 `hashlib.blake2b(digest_size=64)` 实现，可离线复核：

- 签名体 74 B = alg(2) + keyid(8) + sig(64)；公钥 42 B = alg(2) + keyid(8) + key(32)。
- `ED` = 预哈希，签 `Blake2b-512(file)`；`Ed` = 旧式，签原始字节。
- trusted comment 的全局签名覆盖 `sig || trusted_text`。

**已自测**（不是"看起来过了"）：真 `br` → VALID；改 1 字节 → REJECTED；换错公钥 → REJECTED。

## 5. 运行时隔离

无特权 `unshare -rmn`（内部 uid 0、mount + net namespace、DNS 断）。把 scratch home 绑到**真实 home 路径**上 ⇒ 真实 home 与整个仓库在沙箱内不可见；用 inode 相同（1069620）验证过。

逃逸检测 = `find / -xdev -newer marker` + 显式 `/tmp`、`/dev/shm`、`/run/shm`，**必须配一个对照窗口做集合相减**，因为 `~/.dsh/`、`~/.vscode-server/`、win-wsl-mcp-bridge 状态目录在环境中一直在写，不减去就必然假阳性。

负向对照：故意写 `$HOME/.config`、`$HOME/.local/share` → `home_files` 确实抓得到；篡改签名必拒；沙箱见到已存在 label 目录会拒跑。

## 6. 实测结果与诚实 GAP

9/9 安装成功，归档合计 **287.5 MiB**：

| 组件 | 版本 | 校验来源 | minisign |
|---|---|---|---|
| br | 0.6.0 | 4 | VALID（keyid `D0A0A51BD147B836`） |
| bv | 0.25.0 | 5 | 无签名 |
| slb | 0.4.1 | 5 | VALID（共享密钥 `D018F78BB279BD1B`） |
| ntm | 1.35.1 | 4 | 无签名 |
| ee | 0.15.2 | 4 | 无签名 |
| sbh | 0.6.2 | 4 | VALID（同一共享密钥；只覆盖 manifest，不覆盖归档） |
| ft | 0.15.1 | 4 | 无签名 |
| am | 0.3.36 | 4 | VALID（同一共享密钥） |
| cass | 0.2.14 | **3** | 无签名、无聚合文件 |

**必须与上表一起看的削弱项**：

- `bv`/`ntm`/`ee`/`ft`/`cass` 完全不发签名。
- `slb`/`sbh`/`am` 共用同一把密钥 ⇒ 一把泄露覆盖三个。
- 两把公钥都来自**发布产物的同一个 GitHub 账号** ⇒ 账号被攻破时签名与校验和一起失效；签名挡住的是 CDN/构建主机被劫持，挡不住账号被劫持。
- "多源"校验和并不独立：所有来源都在同一个 release 内。
- `ee` 自述产物在 GitHub Actions 之外构建、无签名、无 Sigstore。
- **GAP：未做构建来源证明。** `gh` 2.45.0 无 `attestation` 子命令，REST attestations 端点返回 404 ⇒ 该项为**未执行**，不是"通过"。

## 7. 11 写入方：`scan` → `observed`

真实二进制 + fake HOME + 临时 cwd 观测（节选，完整表见 ADR 0006）：

- `br agents --add -f` → `AGENTS.md.bak`、v1 marker、仅根目录。
- `bv --agents-add` → **实际发 v6**（源码 HEAD 声明 v7）⇒ 文法只能钉形状、不能钉版本号；无备份、仅根。
- `slb integrations cursor-rules --install -C .` → 写 `.cursorrules`，AGENTS.md 字节不变。
- `ntm setup --force` → **整文件替换**（2140 B → 2689 B `<INSTRUCTIONS>` 模板，无备份，APG 区域消失）；`setup` 默认遇已存在文件会跳过；`ntm quick` 不写 AGENTS.md。
- `ee export agentsmd --create` → `<!-- ee:agentsmd:begin … -->`，`AGENTS.md.ee-backup` 与原文件字节相同、仅根；`ee init` 无 `--force` 会拒。
- `sbh docs --render AGENTS.md` → 重写既有 `sbh-docs:begin` 区域；`--check` 漂移退出 1。
- `am docs insert-blurbs --scan-dir . --yes` → 恰好一对 `<!-- am:blurb -->`，无备份，**默认只扫深度 0–3**，深度 4 不动（`--max-depth 10` 才够到）⇒ 纠正源码阅读阶段的判断。
- `cass project --format agents.md --output AGENTS.md` → 无 `--force` 退出 2 且文件不动；加 `--force` 根文件 2140 B → **261 B**。
- `ft robot agents configure` → `robot.feature_not_available`；二进制内 `ft-agent-config-`、`frankenterm:start`、模板模块出现 **0** 次 ⇒ 记为 GAP（未测），不是"不支持"。

## 8. 被实测确认的能力边界

`ntm`/`acfs`/`cass` 是整文件改写型 ⇒ **marker 守卫只保护 APG 的插入不搬移他人区域，防不住整文件改写**；改写在 APG 之后发生时，只有 `install.sh check` 的漂移检测能发现。这条已进 ADR 0006 的 open items —— 本轮由实测确认，不再只是源码推断。

## 9. 回归落点

- `scripts/test-interop-writers.sh` **section D** 直接驱动真实发布二进制并断言观测事实：装有二进制 **65 passed / 0 failed / 1 gap**；没有则 **39 / 0 / 1**（自动 SKIP + 1 GAP，不假装通过）。
- `APG_EXTERNAL_BIN` 指定二进制目录；`scripts/test-release.sh` 的注释已说明接线方式。
- `decisions/0006-root-instruction-block-ownership.md` 的 11 行表格已全部换成 `observed:` 事实。

## 10. 证据生命周期

- `.agent-scratch/external-test/SECURITY-REPORT.md`（186 行，逐组件结论 + 拒绝项 + GAP）、`bin/`（归档 948 MB）与 `bin/sums/`（校验侧车，用于复现）都在**非 git 区**：`.agent-scratch` 一旦清理，本节证据全部失效，section D 会退化为单个 GAP（对应待决项"归档集与 /tmp 副本的处置"）。
- `/tmp/apg-external-sandbox/_bin`（660 MB）是已校验二进制的**副本**（故意不用硬链接，免得某个组件污染归档）。

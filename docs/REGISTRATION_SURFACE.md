# 注册为受管能力：机器可读面

本页面向要把本仓注册成 managed capability 的外部项目。它只描述**机器可读**的契约：
每个问题都有一个非散文答案，且都能被程序判真伪。

## 1. 发布清单 `PACKAGE_MANIFEST.json`

```text
{schema_version: 1, package_version, files: [{path, bytes, mode, sha256}], digest}
digest = sha256(canonicalJson({schema_version, package_version, files}))
```

- **清单描述的是「包」，不是「仓」。** `files[]` 就是包的完整内容，是仓库树的真子集
  （实测 217 个受控文件里 95 个进包）。分发集 = 10 个 `DIST_DIRS` 目录 + `DIST_FILES`
  （`PACKAGE_REMOTE.json`、`PACKAGE_VERSION`、`RELEASE_LINES.json`）+ `SCRIPT_FILES`，
  再扣除 `DIST_EXCLUDED_DIRS`（`docs/memory`、`docs/INDEX.md`、`docs/architecture`、
  `docs/modules`、`docs/verification`）。其余是作者侧资产：`decisions/`、`plans/`、
  `AGENTS.md`、`README.md`、`CHANGELOG.md`、`tools/`、`scripts/test-*`、`.mnemon/`、
  `.agent-project-guides/`。**安装必须按清单逐个取文件**；按整棵树铺会得到
  `unexpected_files` / `unexpected_directories`。
- `mode` 是十进制权限掩码（`420` = 0o644，`493` = 0o755），自引入该字段的版本起（3.0 线 3.0.11、4.x 线 4.0.1）**纳入 digest**：
  丢掉一个执行位会改变发布摘要，而不是悄悄装出一份跑不起来的副本。
- 契约见 `schemas/package-manifest.schema.json`。
- 边界版本之前的清单没有 `mode`，仍按其自身形状校验；边界版本及之后的清单缺 `mode`
  判 `release_corrupt`，因为那意味着字段是被删掉的，不是从未存在。
- 校验已安装副本：`apg release verify --root <release-root>`。任一文件的字节或权限位改变
  都报 `release_corrupt`；`apg release verify-source` 校验源码树与清单一致。

## 2. 发布线状态 `RELEASE_LINES.json`

固定路径、随发布更新，回答"现在允许加载哪条线"：

| 字段 | 含义 |
|---|---|
| `default` | 没有更强意见时应加载的线（必须同时 `loadable` 且 `promotable`） |
| `loadable` | 该线的确切内容可被消费方解析并钉住 |
| `promotable` | 该线可替换全局 launcher / 成为默认 |
| `preconditions` | `promotable: false` 的线必须给出非空前提；空的视为错误 |

全局约束：恰好一条线 `promotable`；`ref` 唯一；当前分支必须在表内且 `package_version`
等于 `PACKAGE_VERSION`。校验：`node scripts/check-release-lines.mjs`。

该文件随包发布，因此冻结的 release 也能自述它属于哪条线。

## 3. 根块校验 `apg project block-verify`

```bash
apg project block-verify --target /path/to/project
```

只读：不取 mutation lock、不写任何文件、不改块。输出要点：

- `status`：`ready` / `mismatch` / `absent`（无块）/ `missing`（无根文件）/
  `malformed` / `unmanaged`（无描述符）
- `block`：`start_byte`、`end_byte`、`bytes`、`sha256`
- `declared`（描述符钉住的）与 `observed`（块里写的）并排
- `checks` 每项 `{name, ok}`；`mismatches` 每项 `{field, expected, actual, line?}`
- `release_line`：块声明的版本命中的发布线（来自 `RELEASE_LINES.json`）

判定依据是两条互相独立的见证：块的完整性行（v2）或 `manifest_digest`（v3），以及
描述符里位于块之外的 `integrity.root_block_hash`。改动块内任意一个字符都会让后者失配，
并给出 `line`。

块之后的重复 marker 视为正文引用，只进 `warnings`，不影响 `status`：本仓不把"有人
在散文里引用了 marker"当成第二个块。

## 4. 边界

- `block-verify` 证明"文件字节与描述符声明一致"，不证明行为正确、也不证明角色权限。
- 它也不证明"跟得上上游"。实测一个消费方：块 status=`ready`，但块和描述符都停在两代之前的摘要。`ready`
  的含义是块与描述符自洽，新鲜度只能靠钉住的 tag/摘要判断。
- `mode` 取自构建平台；发布清单在 Linux/WSL 上构建，macOS/Windows 的文件权限模型不同，
  不要跨平台比较同一份清单的 `mode`。
- 本仓不声明 LLM 能力，不执行模型，也没有网络动作。

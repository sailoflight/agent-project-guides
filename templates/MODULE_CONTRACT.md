# 模块契约模板

目标位置：`<project>/docs/modules/<module>.md`

```markdown
# <Module> contract

Status: verified | inferred | mixed

## Owns

- <职责>

## Does not own

- <明确排除的职责及其所有者>

## Entrypoints

| Kind | Path/symbol | Purpose |
|---|---|---|
| Runtime/public/test/generate | `<entry>` | <说明> |

## Contracts and invariants

- <输入、输出、公共行为和不可破坏的不变量>

## Dependencies

- Allowed: <依赖>
- Forbidden: <依赖>

## Data, configuration and generated files

| Item | Owner | Read/write behavior | Source of truth |
|---|---|---|---|
| <item> | <owner> | <行为> | <权威来源> |

## Verification

| Change | Required verification |
|---|---|
| <变化> | `<command/test>` |

## Documentation triggers

- <哪些变化更新 usage/architecture/operations/knowledge/generated>

## Unknowns

- <未确认内容及需要的证据>
```

只有以下信息必须在 agent 第一次触碰模块文件时生效，才同时创建 `<project>/<module>/AGENTS.md`：

```markdown
# <Module> local agent instructions

- Scope: this directory and descendants only.
- Read the authoritative contract: `docs/modules/<module>.md`.
- Must: <进入模块前必须执行的局部红线>。
- Must not: <禁止依赖、写入或副作用>。
- Ownership: <局部数据、配置、生成物所有权摘要>。
- Verify: `<最小必须验证命令或 MATRIX 精确入口>`。
```

局部入口依靠 harness 的目录链注入，不要求根入口提前读取。只保留立即可执行的差异；详细职责、证据、动态接口和解释继续放在模块契约或代码权威来源，避免双份漂移。

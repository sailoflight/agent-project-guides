# `docs/architecture/OVERVIEW.md` 模板

目标位置：`<project>/docs/architecture/OVERVIEW.md`

```markdown
# Architecture overview

## Scope and current status

<只描述当前已经实现并由证据支持的系统。未确定项标为 unknown。>

## Runtime topology

<进程、包、服务、浏览器、数据库或外部系统之间的关系。>

## Modules

| Module | Owns | Does not own | Entrypoint | Contract |
|---|---|---|---|---|
| <module> | <职责> | <非职责> | <path/symbol> | `../modules/<module>.md` |

## Dependency direction

```text
<上层> -> <下层> -> <基础设施>
```

- 允许：<依赖规则>
- 禁止：<反向依赖或跨边界调用>

## Data and configuration ownership

| Data/config | Owner | Lifecycle | Safety boundary |
|---|---|---|---|
| <item> | <module> | <runtime/build/persistent> | <规则> |

## Invariants

- <由实现/测试证明的不变量>

## Unknowns

- <尚不能确定的架构事实和所需证据>

## Decisions

- <仅链接 ADR，不在此重复历史讨论。>
```

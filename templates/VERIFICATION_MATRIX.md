# `docs/verification/MATRIX.md` 模板

目标位置：`<project>/docs/verification/MATRIX.md`

```markdown
# Verification matrix

## Defaults

- 默认网络：offline | mocked | live
- 默认生产写入：forbidden
- <项目级验证红线>

| Change type/module | Fast check | Required tests | Broader validation | External cost/risk |
|---|---|---|---|---|
| Documentation only | <link/lint> | <docs test> | <none> | 0 |
| Internal logic | <unit> | <target tests> | <integration condition> | <risk> |
| Public API/tool/CLI | <schema/static> | <contract tests> | <compatibility> | <risk> |
| Data/migration | <dry run> | <fixture/replay> | <approved integration> | <risk> |
| UI | <component> | <interaction> | <visual/manual> | <risk> |
| Deployment/config | <lint> | <smoke> | <staging/approved> | <risk> |

## Live or destructive verification

<审批、预算、dry-run、fixture、停止和回滚规则。>

## When verification cannot run

报告未执行项、原因、剩余风险和人工步骤；不得声称已验证。
```

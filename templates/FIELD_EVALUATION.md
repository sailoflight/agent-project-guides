# Field evaluation 记录模板

目标位置：`<project>/docs/evaluation/<scenario>.md`。只有项目实际执行非生产真实场景评估时创建；不得记录秘密或未脱敏生产数据。

```markdown
# <Scenario> field evaluation

Mode: scenario-validation | exploratory-evaluation
Environment: development | test | staging
Data: synthetic | fixture | sanitized-copy | approved-real-data-copy
Evaluated at: <ISO-8601 UTC>
Version/range: <build, commit, schema or data version>

## Permission boundary

<账号、网络、费用、允许写入和禁止动作。>

## Scenario and expected outcome

<真实工作流、验收条件或探索目标。>

## Observations and evidence

<输入、输出、日志/截图引用和副作用；区分 verified 与 inferred。>

## Findings

<product defect | environment issue | data issue | test gap | feature proposal>

## Cleanup and residual risk

<测试数据清理、未执行场景和剩余风险。>
```

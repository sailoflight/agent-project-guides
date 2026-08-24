# 子 agent 显式授权模板

目标位置：父 agent 发给子 agent 的任务提示，不写入项目根入口。父 agent 必须替换全部字段；角色已经明确时，子 agent 跳过自分类，只读指定角色入口。

```text
Plane: Production | Development
Role: User | Operator | Developer | Maintainer | Reviewer | Field Evaluator
Submode: <精确子模式>
Objective: <一个可验证目标>
Deliverable: <报告、代码、测试证据、运行结果或项目文档>
Read scope: <允许读取的路径/接口>
Write scope: report-only | <允许写入的路径>
Environment: <production/dev/test/sandbox/staging>
Data: <synthetic/fixture/sanitized/approved real data/none>
Network and cost: <允许范围和预算>
Destructive actions: forbidden | <明确批准动作>
Verification: <命令或验收证据>
Role transitions: none | <用户已预先授予的其他角色和顺序>
Escalation: ask parent/captain; do not ask the end user directly
```

子 agent 不继承父 agent 未写入任务卡的角色、凭据、生产权限、数据权限或破坏性授权。分配与实际任务冲突时停止并向 parent/captain 澄清；不得通过读取其他角色指南自行扩权。父 agent 只有在用户已经明确授予时才能传递跨角色或生产权限。

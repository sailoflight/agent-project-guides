# Release pilot 边界

默认不跑时打印显式 skip 与范围。每条报 `status=ran|skipped`、`kind=synthetic|external-source-copy|real-host-task`；stderr 汇总 `ran n/m` 与各 skip 原因。`real-host-task` 恒为 0，属独立证据。

- **synthetic**（`fixtures/pilots/synthetic-cli.json`）：源树在包内，无需外部 checkout；`baseline` 逐字复用 `small-cli.json` 的冻结阈值与 required ids。
- **external-source-copy**（`small-cli.json`、`complex-content-package.json`）：阈值冻结，源在包外（`APG_PILOT_ROOT`，默认本仓上一级）。缺 `package_revision=1.4.3` 根入口时按 `root-entry-drifted`/`root-entry-missing`/`source-unavailable` 报 skip，并输出冻结基准的位置与恢复路径。

1.4.3 根入口从未进入任何提交，故冻结基准**不可再生**；其位置、恢复路径与「不得重录 v3 根入口为基线」的禁则见 `fixtures/pilots/sources/synthetic-cli/README.md`。

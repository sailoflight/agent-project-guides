# 组件模块契约

Status: verified（已执行的 Node/Linux fixture）；真实组件部署不由这些测试证明。
Architecture parent: `docs/architecture/OVERVIEW.md`。

## Owns / Does not own

负责已暂存文件验证、服务身份观察、单实例汇总和最终依赖状态。不下载、安装、启动、
重启、停止或修复第三方组件；`available` 不授予调用权限。

## 边界与入口

- `lib/components.mjs`：记录、manifest、文件集和基础状态规则。
- `lib/service-probe.mjs`：地址/health path 校验与单个有界 HTTP(S) 请求。
- `lib/component-resolution.mjs`：CLI 用例、按 ID 汇总、传递依赖与环处理。
- 公共命令保持 `apg components verify|probe`；字段定义与支持边界见 `docs/V2_CONTRACT.md`
  和 `schemas/component-entry.schema.json`，这里不复制字段表。

## 不变量

1. 身份不匹配、同 ID 多 digest、声明冲突、单实例多可用实例均不可复用。
2. 依赖使用最终状态，不能把字节存在或服务声明当作可用证据；环不满足依赖。
3. `verify` 无网络；`probe` 仅校验被服务依赖引用的包，并探测本机回环。
4. localhost 映射到回环而不解析 DNS；HTTPS 不禁用证书检查，不跟随重定向。
5. 健康失败、匿名/错误对象、响应超限或总时限到期不产生 available。
6. 冲突优先于缺失前提；坏包不掩盖其它正常包的评估。
7. 同 ID 的包和服务分开判定，不因共存而冲突；未限定的 component 依赖优先选包，
   包失败不回退为服务健康。服务可显式依赖同名包。

## 修改方式与验证

修改记录字段时同步 schema、记录校验、公共契约与对应反例。修改单实例或依赖行为时
通过真实 CLI 驱动多条记录，不能只测试工具函数。

最小验证：`node --test scripts/test-component-regressions.mjs`、
`node scripts/test-component-store.mjs`。发行/分派变化补 v2/v3 和 boundary；详见验证矩阵。

未知：外部服务真实业务健康是否能用其身份端点充分表达，需要独立现场证据，不能从 2xx 推出。

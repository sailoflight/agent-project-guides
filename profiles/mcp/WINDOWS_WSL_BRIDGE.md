# WIN-WSL 桥接 MCP 架构子类型规范

> 子类型 ID：`windows-wsl-bridge`。
> 本文件复制并规范化自通用 `bridge/ARCHITECTURE.md`，适用于任何需要在 Windows 与 WSL 之间建立连接的 MCP 服务器。
> 本规范规定双端职责、运行时生产角色提示和不可破坏的不变量；具体项目在自己的 `bridge/ARCHITECTURE.md` 中填写实例映射，不得另写一套相冲突的通用规则。

## 1. 适用场景

- MCP 的工具实现必须依赖 **Windows 本机资源**（可见 GUI、浏览器内核、驱动、注册表、仅 Windows 的 SDK/服务、持久登录态等）。
- MCP 的客户端/agents 运行在 **WSL/Linux**，通过标准 MCP 协议调用工具。
- 目标：WSL 端保持极薄、无重依赖；Windows 端承载主体、运行时生产角色提示和原生资源。

只有主项目类型已经精确选为 `mcp` 且上述拓扑有直接证据时才读取本规范。普通 stdio/HTTP MCP、全 Windows MCP 或全 Linux MCP 不适用。

## 2. 角色与职责（核心契约）

| 端/组件 | 角色 | 职责 | 禁止 |
|---|---|---|---|
| **WSL 端** | **MCP 门面（Facade）** | 对 agents 提供标准 MCP 接口；把请求转发给 Windows；把完整响应、capabilities、instructions、tools、results、errors 和 notifications 转发给客户端 | 不实现工具业务、不装 Windows 专属依赖、不持有 Windows 资源/会话状态、不改写生产角色提示 |
| **Windows 端** | **MCP 主体（Engine）** | 实现工具、初始化和运行时提示；持有 Windows 专属资源、持久会话、凭据和运行态 | 不参与开发仓库演化、不把内层服务暴露公网、不依赖 WSL 根指令提供生产角色提示 |
| **客户端 adapter** | **MCP 消费与模型投递层** | 注册工具，并把受信的 MCP 运行时生产角色提示投递到模型提示 | 不得只注册工具而丢弃 instructions；不得用 MCP 简介或工具 description 代替角色提示 |
| **Operator 集成** | **安装与恢复层** | 安装 adapter、验证提示投递、观察、重启、恢复和回滚 | 不因运维身份获得产品业务调用或云端修改授权 |

一句话：**WSL 端保证“看到的是完整 MCP”，Windows 端保证“工具和运行时角色提示是真实部署版本”，客户端保证“模型实际收到角色提示”。**

## 3. 数据方案（自由选择，双端协商）

- 对外（agents ↔ WSL 端）：固定为 MCP 协议。这是唯一不可变的部分。
- 对内（WSL 端 ↔ Windows 端）：项目自选最佳本地方案，可选：
  - loopback TCP（WSL2 镜像网络共享 `127.0.0.1`）；
  - Windows Named Pipe；
  - 本地 HTTP / WebSocket；
  - 共享文件 + 事件 / 共享内存等。
- 内层方案必须仅本机可达、连接可重入，并在需要时有握手/认证。
- 内层传输不得丢失、截断或自行解释 MCP initialize response，尤其是 capabilities 和 runtime instructions。

## 4. 双生产角色运行时提示（强制）

每个符合本子类型的 MCP 主体必须提供一段有界、无秘密、带 revision 的运行时提示，其中同时包含两个 Production 角色。这是客户端连接 MCP 后供模型执行的操作提示，**不是 MCP 产品简介、README 摘要、工具清单、开发 AGENTS 或部署广告**。

提示至少包含四块：

1. **角色路由**：公共能力/业务结果使用 `Production / User`；安装、配置、可用性恢复、观察、备份/恢复、回滚使用 `Production / Operator`。存在实质歧义时，在执行工具前使用客户端的结构化问答机制。
2. **User 契约**：只使用公开 MCP capabilities 和 runtime schemas；优先最低成本、只读、dry-run 路径；mutation 必须满足 schema confirmation；不得自行获得凭据、生产数据、额度、费用或破坏性权限；运行时/部署失败转交 Operator，不通过读取源码、DSH 配置或内部架构自行扩权。
3. **Operator 契约**：从只读健康证据开始；只使用匹配环境的 runbook；生产动作必须明确环境、身份、影响、备份/回滚、停止条件和批准；不得以 Operator 身份完成产品业务任务或直接修改源码。
4. **转换与授权**：角色名称不授予凭据、真实数据、生产写入、重启、费用或不可逆权限；角色转换必须显式、保留证据且不合并权限。

动态工具名称、参数、当前版本、端口、环境状态和完整清单继续由 tools/schema/state/生成物负责，不手工复制进角色提示。

## 5. 运行时提示的权威和投递路径

Windows Engine 拥有与已部署 handlers 同版本的 canonical production-role prompt，并通过 MCP 初始化结果提供（标准路径通常为 `initialize.instructions`）。WSL Facade 必须原样转发，不得维护第二份手写提示，也不得替换为本地 MCP 简介。

每个受支持客户端必须完成：

```text
initialize
  -> 取得双生产角色 runtime prompt
  -> 注册或原子替换 namespaced model-prompt section
  -> 暴露 tools/schema
  -> 才允许第一次任务判断或工具调用
```

仅完成 `tools/list -> register tools` 的 adapter 不符合本规范。工具 description 只解释一个工具，不能承担 User/Operator 路由和权限边界。

若客户端不能消费 MCP runtime instructions，安装流程必须附带 companion prompt layer；它必须由同一个 canonical prompt source 和 revision 生成，禁止维护手工客户端变体。项目 compatibility matrix 必须记录每个客户端使用 native instructions 还是 generated companion，并实际验证模型可见。

## 6. 提示信任、隔离和生命周期

- 只有显式受信 MCP 安装可以把 runtime instructions 提升为模型 system/context prompt；未知远程 MCP 不得默认获得该权限。
- 每个 MCP server 使用 namespaced prompt section，不能覆盖其他 server 或通用 persona。
- 提示只约束该 MCP 的使用与运行，不把无关聊天或仓库任务强制改成 MCP User/Operator。
- reconnect/reinitialize 原子替换旧 revision，不累积多份提示；最终 disconnect/dispose 同步删除提示。
- 客户端保留 last-known-good tools 时，prompt 的保留/失效策略必须明确且一致，不能出现旧提示控制新工具或新提示配旧工具。
- diagnostics 可以报告 server/prompt revision 和投递模式，但不得输出凭据、cookie、token 或秘密配置。

## 7. 硬约束（不变量）

1. **agents 看到的是完整 MCP**：WSL 端必须是合法 MCP server，内层传输与客户端无关。
2. **生产角色提示不依赖仓库预读取**：在其他项目、空目录或纯聊天环境中也必须投递 User/Operator 提示。
3. **WSL 端零/最小依赖**：任何 Windows 专属对象不出现在 WSL runtime。
4. **Windows 端拥有状态**：持久会话、凭据、GUI 资源和 canonical runtime prompt 归 Windows 部署版本所有；客户端重连不得破坏状态。
5. **共享资源单属主**：一个持久资源同一时刻只有一个进程 owner，除非有已验证的锁/隔离。
6. **仅本机通信**：内层通道默认 loopback/本机，不监听公网。
7. **主体懒加载重依赖**：Windows Engine 只在具体执行路径加载 GUI/内核依赖。
8. **开发在 WSL，运行在 Windows**：WSL 是开发仓库与离线测试场所；Windows 是部署副本与运行场所。
9. **协议纯净**：stdout 仅含 MCP；诊断进入 stderr 或 Engine-owned log。
10. **提示与工具同版本**：部署、回滚和重连不能让 prompt revision 与 handler/schema generation 静默错配。

## 8. 项目实例映射（必填）

具体仓库的 `bridge/ARCHITECTURE.md` 必须填写：

| 规范角色 | 项目实体 |
|---|---|
| WSL Facade | `<entrypoint and dependency boundary>` |
| 内层数据方案 | `<local transport, address/name, local-only enforcement>` |
| Windows Engine | `<entrypoint and deployment location>` |
| 工具本体 | `<registry/handler authority>` |
| Windows 专属资源 | `<GUI/browser/driver/session and owner>` |
| Canonical production prompt | `<single authored source and revision>` |
| Initialize implementation | `<where runtime instructions are returned>` |
| Client adapters | `<client -> native instructions/generated companion -> prompt section>` |
| Operator runbook | `<health/restart/recovery authority>` |
| Verification | `<offline/protocol/bridge/external-client tests>` |

项目端口、路径、selector、SDK 和恢复命令属于项目映射或 Operator runbook，不进入本通用规范。

## 9. 验收检查清单（通用）

- [ ] WSL Facade 能作为 MCP server 被 client 启动，initialize/tools/list/tools/call 正常。
- [ ] Windows Engine initialize response 包含当前 revision 的双生产角色提示。
- [ ] WSL Facade 对 runtime prompt 做 byte-faithful 或明确 canonical encoding 的透明转发。
- [ ] 每个受支持客户端在第一次模型工具决策前投递提示；只显示工具但丢提示必须判失败。
- [ ] 无项目 `AGENTS.md` 的外部 cwd/聊天环境仍能看到 User 与 Operator 契约。
- [ ] User 可用性检查成功后停止配置/源码调查；失败时转 Operator。
- [ ] Operator 恢复动作不获得产品 mutation authority。
- [ ] reconnect 不重复提示，rollback 后 prompt/schema/handler revision 一致。
- [ ] WSL 不引入 Windows 专属依赖，不残留凭据、profile、日志或重运行态。
- [ ] 主体顶层不强拉重依赖，内层通道不暴露公网。

工具可调用但任一受支持客户端看不到 runtime production-role prompt 时，本子类型适配不得标记完成。

## 10. 维护规则

- 改 WSL Facade：保持最小依赖，验证完整 initialize 转发和本地冒烟。
- 改 Windows Engine、工具或 runtime prompt：离线测试 → 同步 Windows 部署副本 → 单次重启 → 验证工具与提示 revision。
- 改 client adapter：验证 tool generation 与 namespaced prompt generation 同步注册、替换和 dispose。
- 改端口/管道/握手/提示 envelope：同步更新双端架构、client compatibility matrix、安装配置和 Operator runbook。
- 具体选择器、会话、iframe 和产品工作流进入项目经验/模块文档，不在本规范展开。

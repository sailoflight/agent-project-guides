# MCP project profile

> Read only after the `mcp` record is selected. This profile adds MCP-specific artifact decisions to the shared adaptation procedure.

## 1. Selection boundary

Select `mcp` when the adapted scope primarily delivers an MCP server, gateway, or tool provider. A library used internally by an MCP server remains part of this type. Select another type when MCP is only a secondary adapter around a primarily CLI, service, or application deliverable.

## 2. Artifact preset

`required` means an authoritative existing artifact must be linked or the template must be merged/created. `conditional` means create nothing unless the condition is evidenced.

| Artifact | Decision | Target or template | Condition |
|---|---|---|---|
| Project constraints | required | `templates/ROOT_AGENTS.md` | Keep MCP protocol and side-effect red lines in the selected root outside managed blocks |
| Documentation routing | required | `templates/DOC_INDEX.md` | May be merged with development start only for a very small server |
| Development start | required | `templates/DEVELOPMENT_START.md` | Record server, schema generation, test, and transport entrypoints |
| MCP architecture | required | `templates/ARCHITECTURE_OVERVIEW.md` -> `docs/architecture/MCP.md` | Cover registry, dispatch, transport, state, and client boundary |
| Verification matrix | required | `templates/VERIFICATION_MATRIX.md` | Separate offline protocol checks from approved live calls |
| Module contract | conditional | `templates/MODULE_CONTRACT.md` | For registry, transport, state, or high-risk tool modules |
| Consumer usage | conditional | `templates/USER_USAGE.md` -> `docs/usage/MCP_CONSUMER.md` | External consumer exists: authoritative source for runtime instructions/resources, not a copied tool list |
| Operator runbook | conditional | `templates/OPERATOR_RUNBOOK.md` -> `docs/operations/MCP_RUNBOOK.md` | Required for deployed or long-running servers |
| Field evaluation | conditional | `templates/FIELD_EVALUATION.md` | Only for approved non-production client workflows |

## 3. Evidence map

| Decision | Preferred evidence | Derived view |
|---|---|---|
| Tool identity and schema | executable registry/schema | generated tool reference and MCP discovery output |
| Handler ownership | registration plus implementation/tests | module contract summary |
| Runtime consumer guidance | authored usage source plus schema | MCP instructions/resources/prompts |
| Risk and side effects | structured tool metadata plus tests | consumer warning, verification gate, operator note |
| Transport/capabilities | server initialization and protocol tests | architecture compatibility table |

Never hand-maintain a complete tool list in README, usage, architecture, and runtime instructions at the same time.

## 4. MCP contract

The architecture or module authority must identify:

- registry, handler, schema, and catalog ownership;
- external `tools/call` versus internal composition boundaries;
- transport process, protocol stream, session, and persistent-state ownership;
- client capability negotiation and static/dynamic discovery compatibility;
- credential, network, confirmation, dry-run, request-budget, retry, and idempotency rules.

When tool volume materially affects context, use bounded discovery:

```text
small stable entry -> capability search -> bounded candidates -> exact schema -> execute
```

Search results contain only identity, intent, and compact risk; full schemas enter context only for selected tools.

## 5. Verification preset

At minimum verify unique tool names, registry/schema/handler correspondence, generated reference consistency, protocol-clean stdout, capability negotiation, and consumer instructions that exclude internal development/operations details. Mutating tools require confirmation and an applicable dry-run or explicit reason it is impossible; live tools require a hard request budget and stop condition.

## 6. Cold-start acceptance

1. A Development agent can locate one tool's schema, handler, tests, and risk rule without loading the full catalog.
2. A User can select and call the tool through MCP delivery surfaces without reading repository development docs.
3. An Operator can start, observe, and recover the server from the runbook without loading tool implementation guidance.

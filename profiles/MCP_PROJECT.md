# MCP project profile

> Read only after the `mcp` record is selected. This profile adds MCP-specific artifact decisions to the shared adaptation procedure.

## 1. Selection boundary

Select `mcp` when the adapted scope primarily delivers an MCP server, gateway, or tool provider. A library used internally by an MCP server remains part of this type. Select another type when MCP is only a secondary adapter around a primarily CLI, service, or application deliverable.

### Conditional architecture subtype

After selecting `mcp`, exact-grep one subtype only when bounded architecture evidence matches it. Do not enumerate or preload subtype specifications. The current closed subtype registry is `routing/mcp-subtypes.jsonl`.

`windows-wsl-bridge` applies when clients run in WSL/Linux and a Windows engine owns native resources or persistent runtime state. Read its exact `spec` path and require the project `bridge/ARCHITECTURE.md` to map the generic contract to concrete entrypoints, transports, prompt delivery, state owners, and verification. Projects without that topology read no MCP subtype.

## 2. Artifact preset

`required` means an authoritative existing artifact must be linked or the template must be merged/created. `conditional` means create nothing unless the condition is evidenced.

| Artifact | Decision | Target or template | Condition |
|---|---|---|---|
| Project constraints | required | `templates/ROOT_AGENTS.md` | Keep MCP protocol and side-effect red lines in the selected root outside managed blocks |
| Documentation routing | required | `templates/DOC_INDEX.md` | May be merged with development start only for a very small server |
| Development start | required | `templates/DEVELOPMENT_START.md` | Record server, schema generation, test, and transport entrypoints |
| MCP architecture | required | `templates/ARCHITECTURE_OVERVIEW.md` -> `docs/architecture/MCP.md` | Cover registry, dispatch, transport, state, runtime production-role prompt, and client boundary |
| MCP architecture subtype | conditional | exact `spec` from `routing/mcp-subtypes.jsonl` | Read one only when the deployed topology exactly matches; project architecture maps conformance |
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
| Runtime production guidance | one canonical dual-role prompt source plus initialization/client tests | MCP runtime instructions or generated companion prompt |
| Risk and side effects | structured tool metadata plus tests | consumer warning, verification gate, operator note |
| Transport/capabilities | server initialization and protocol tests | architecture compatibility table |

Never hand-maintain a complete tool list in README, usage, architecture, and runtime instructions at the same time.

## 4. MCP contract

The architecture or module authority must identify:

- registry, handler, schema, and catalog ownership;
- external `tools/call` versus internal composition boundaries;
- transport process, protocol stream, session, and persistent-state ownership;
- client capability negotiation and static/dynamic discovery compatibility;
- credential, network, confirmation, dry-run, request-budget, retry, and idempotency rules;
- one canonical runtime prompt that contains actionable `Production / User` and `Production / Operator` routing, boundaries, transitions, and authority rules;
- how every supported client projects that runtime prompt into model context after MCP initialization and before its first tool decision.

The runtime production-role prompt is not an MCP introduction, README excerpt, tool description, or development root instruction. It must work from an external project or chat environment with no repository `AGENTS.md`. A client that exposes tools but discards the required prompt is incompatible until its adapter consumes MCP runtime instructions or its installation adds a generated companion prompt from the same source/revision.

When tool volume materially affects context, use bounded discovery:

```text
small stable entry -> capability search -> bounded candidates -> exact schema -> execute
```

Search results contain only identity, intent, and compact risk; full schemas enter context only for selected tools.

## 5. Verification preset

At minimum verify unique tool names, registry/schema/handler correspondence, generated reference consistency, protocol-clean stdout, capability negotiation, and consumer instructions that exclude internal development details. Verify that initialization returns the current dual-production-role prompt and that every supported client makes it model-visible before tool selection; tool descriptions alone do not pass. Mutating tools require confirmation and an applicable dry-run or explicit reason it is impossible; live tools require a hard request budget and stop condition.

## 6. Cold-start acceptance

1. A Development agent can locate one tool's schema, handler, tests, and risk rule without loading the full catalog.
2. In an external cwd/chat with no project instructions, a User receives the runtime User contract, can select/call a public tool, and does not inspect repository or deployment internals.
3. In the same external context, an availability/deployment/recovery task receives the Operator contract and does not inherit product mutation authority.
4. Every supported client proves prompt delivery independently; a working `tools/list` with missing production-role prompt is a failed acceptance.
5. A matching architecture subtype, when selected, passes its own conformance checklist without preloading unrelated subtype specs.

# Production plane roles

Read this index only after the root router selects the Production plane. Choose one primary role; if User and Operator are both plausible, ask whether the goal is product use or production lifecycle maintenance before reading either guide.

## User

Choose User when the goal is to use a deployed product capability through its public UI, API, SDK, CLI, or MCP surface and obtain a business/user result.

- Read: `USER_AGENT_GUIDE.md`, then only the project's public usage/protocol entry.
- Do not read: source-development guides, internal architecture, tests, evidence, or operations runbooks.
- Do not perform: deployment, production configuration, recovery, or code changes.

## Operator

Choose Operator when the goal is to manage a production system's lifecycle or reliability: deploy, configure, start/stop, observe, respond to incidents, back up, recover, or roll back.

- Read: `OPERATOR_AGENT_GUIDE.md`, then only the matching project operations/runbook entry and necessary runtime architecture.
- Do not read: product-development guides or User prompts unless a health check explicitly uses a public interface.
- Production mutations, credentials, destructive actions, and external cost require explicit permission.

## Boundary examples

- Call an API or MCP tool to complete a business task -> User.
- Export data through a supported CLI command -> User.
- Deploy or restart the service behind that API/CLI -> Operator.
- Investigate production health, logs, recovery, or rollback -> Operator.
- If a production observation indicates a code defect, report it and request a switch to Development/Maintainer; do not edit code under a Production role.

<!-- agent-project-guides:routing:start -->
## Agent plane and role routing

Package adaptation: status={{ADAPTATION_STATUS}}; package_revision={{PACKAGE_REVISION}}; verified_at={{VERIFIED_AT}}; scope={{ADAPTATION_SCOPE}}; reason={{ADAPTATION_REASON}}

Do not preload every role description. Route in two stages before reading role-specific guides or project documents.

### Stage 1: select one work plane

- **Production plane**: use the deployed product for a real task, or manage a production system's deployment, configuration, health, recovery, or rollback.
- **Development plane**: initialize, change, maintain, review, or evaluate code and project documentation in development, test, sandbox, or staging environments.

If the plane is unclear, ask the user whether this is production use/operations or development work. Stop before reading either plane's role index.

### Stage 2: select roles inside that plane

- Production plane: read only `{{GUIDES_PATH}}/routing/PRODUCTION_ROLES.md`, then choose User or Operator.
- Development plane: read only `{{GUIDES_PATH}}/routing/DEVELOPMENT_ROLES.md`, then choose Developer, Maintainer, Reviewer, or Field Evaluator.

Role rules:

1. A package `adapter-trigger` is the strongest signal and explicitly selects Development/package-adaptation work; follow the trigger before ordinary routing.
2. Explicit user-assigned compatible roles or submodes win. If the user grants multiple roles, do not ask again within that granted scope; keep a primary deliverable and observe each role's information and permission boundary.
3. Without explicit assignment, select one primary role from the requested outcome. Supporting activities such as writing tests or reading a diff do not by themselves change the role.
4. If no single role fits, multiple roles remain plausible, or the role conflicts with the requested outcome, ask the user to choose or clarify. Stop before reading role guides or expanding repository context.
5. If adaptation status is not `adapted` and no adapter trigger exists, report the state and ask whether to run package adaptation now or continue the requested role without it. Do not silently switch into adaptation.
6. Developer/Project Initializer and Maintainer/Package Re-adapter may record only outcome states `partial`, `adapted`, or `blocked` through `set-state`. The installer owns `pending` and `stale` during initial merge, package revision changes, and explicit re-adaptation.
7. Production access, real credentials, destructive actions, external cost, and unredacted production data always require explicit permission; a role label or multi-role grant alone does not supply it.

Subagents do not inherit all parent roles or permissions. The parent must assign each subagent an exact plane, role/submode, scope, writable paths, environment/data permissions, and deliverable. A subagent with missing or conflicting assignment asks its parent/captain before reading another role guide; it does not broaden its own role or production permissions.
<!-- agent-project-guides:routing:end -->

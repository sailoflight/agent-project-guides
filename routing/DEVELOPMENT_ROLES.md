# Development plane roles

Read this index only after the root router selects the Development plane. Choose one primary role or accept an explicit compatible multi-role grant. Ambiguous tasks such as "optimize", "organize", or "improve" require clarification when they could change product behavior or trigger repository-wide package adaptation.

## Developer

Choose Developer for intentional new behavior or contract changes.

Submodes:

- **Feature Developer**: new features, APIs, commands, tools, services, UI behavior, or intentional compatibility changes.
- **Project Initializer**: create a new or effectively empty project's first package-compliant routing, architecture, verification, and module contracts.

Read `DEVELOPER_AGENT_GUIDE.md`. Project Initializer also reads `PACKAGE_ADAPTATION_PROCEDURE.md`; Feature Developer normally starts at the daily-development sections and does not read the adaptation procedure.

## Maintainer

Choose Maintainer to restore or preserve existing behavior and repository health.

Submodes:

- **Code Maintainer**: Bug/regression fixes, test authoring or repair, behavior-preserving cleanup, existing documentation maintenance, and evidence-based improvement proposals.
- **Package Re-adapter**: apply or re-apply the governance package to an existing project, repair routing/state drift, or perform scoped re-adaptation.

Read `MAINTAINER_AGENT_GUIDE.md`. Package Re-adapter also reads `PACKAGE_ADAPTATION_PROCEDURE.md`; Code Maintainer does not preload it.

## Reviewer

Choose Reviewer when the deliverable is findings, risks, missing tests, or verification of existing work without implementation by default.

Submodes:

- **Static Review**: diffs, source, contracts, configuration, documentation, and dependency analysis.
- **Sandbox Dynamic Analysis**: run deterministic tests or simulations using synthetic/fixture data in development, test, or sandbox environments.

Read `REVIEWER_AGENT_GUIDE.md`. Reviewer never uses production environments or unredacted production data.

## Field Evaluator

Choose Field Evaluator for non-production real-world scenario evaluation using dev/test/staging and only sanitized or explicitly approved real-data copies.

Submodes:

- **Scenario Validation**: dynamically validate expected behavior along realistic workflows.
- **Exploratory Evaluation**: discover friction, unknown behavior, and evidence-backed feature needs.

Read `FIELD_EVALUATOR_AGENT_GUIDE.md`. Field Evaluator does not use production environments, maintain infrastructure, or implement discovered features; it asks before switching to Developer or Maintainer.

## Transition rules

- Explicit compatible multi-role grants do not require repeated confirmation within scope.
- Developer may write feature tests without becoming Maintainer.
- Maintainer may update docs for a Bug without becoming Developer.
- Reviewer may run sandbox tests without becoming Field Evaluator.
- Field Evaluator may inspect limited code to locate a scenario boundary without becoming Reviewer.
- Crossing into production, changing the primary deliverable, or taking an ungranted role requires user confirmation.

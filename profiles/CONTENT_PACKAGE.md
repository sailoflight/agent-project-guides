# Content package profile

## 1. Selection boundary

Use when the primary deliverable is a versioned documentation, instruction, policy, schema, template, prompt, or governance distribution whose loading and migration behavior are part of the product contract.

## 2. Artifact preset

| Artifact | Decision | Authority |
|---|---|---|
| Project constraints | required | `templates/ROOT_AGENTS.md` or existing root authority |
| Content/source ownership map | required | `templates/DOC_INDEX.md` or existing index |
| Installation and migration contract | conditional | `templates/OPERATOR_RUNBOOK.md` when installation mutates project state |
| Verification map | required | `templates/VERIFICATION_MATRIX.md` or executable suite |
| Per-task plan | omit | Session/task state unless persistence rules trigger |

## 3. Evidence map

Verify canonical-source ownership, exact routing, rendered/source consistency, links and snippets, install/update/uninstall, byte preservation, missing-package behavior, token/loading cost, and generated catalog drift.

## 4. Contract triggers

Update project-owned contracts when public loading semantics, IDs, precedence, package layout, migration ownership, or supported clients change. Internal wording changes normally require only targeted routing and budget checks.

## 5. Verification preset

Author Checks cover parser/schema validation, affected catalog generation, direct route/load fixtures, and one migration smoke test. Independent verification challenges cold start, stale/missing content, rollback, client observation limits, and accidental consumer staging.

## 6. Cold-start acceptance

A fresh DSH task must find the descriptor, exact release, one authority route, and one relevant section without loading the full corpus. Missing release and unsupported client behavior must be explicit rather than silently degraded.

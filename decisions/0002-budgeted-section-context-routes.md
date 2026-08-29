# ADR 0002: Budgeted section context routes

Status: accepted
Date: 2026-08-29
Plan: `plans/AGENT_PROJECT_GUIDES_2.0.md`

## Context

The 2.0 catalog generated hash-checked section entries, but `resolveRoute` still returned complete role and profile documents. This contradicted the bounded exact-section contract, duplicated mandatory profile sections, loaded Development profiles for Production roles, and left token cost as an observation rather than a release-checked boundary.

Aggressive role slicing would save more tokens but can omit task-specific Bug, test, refactor, authority, or independence constraints. Free-text search is suggestion-only and cannot safely select those required sections.

## Decision

1. `routing/context-routes.jsonl` is the canonical runtime-entrypoint registry for roles, facets, and overlays. It does not replace their canonical documents.
2. Each daily role mode resolves to an ordered owner-bound section set with a release-validated `utf8-bytes/4-ceiling` budget. Every role and mode must be covered exactly once.
3. Development facets resolve to evidence, contract, verification, and explicitly selected cold-start sections. `initialize` and `readapt` resolve the complete selected profile because adaptation needs its artifact preset and selection boundary.
4. Production roles resolve only their role sections. They do not inherit Development facet or overlay guidance.
5. Mandatory IDs are appended and exact-ID deduplicated. Search remains optional and cannot satisfy authority.
6. `resolve` reports `exact_token_estimate` and the estimate method, and revalidates each exact hash before returning. `load --ids` batch-loads the ordered route as compact `[id, content]` pairs after internal hash verification; single-ID output remains compatible. `section-routes-v1` and `batch-load-v1` advertise these capabilities.
7. Role section reduction must preserve current authority recall. Further Maintainer reduction requires an explicit, registry-validated task kind rather than inference from free text.

## Consequences

- Common routes no longer load whole profiles or duplicate their mandatory verification section.
- Heading-derived routed IDs are public within a release. A heading change must update the context registry and catalog atomically or fail validation.
- The byte/4 estimate is deterministic and useful for release budgets, but it is not a provider tokenizer or billing claim.
- Full-document role/profile IDs remain loadable for explicit discovery and lifecycle routes.
- The pilot scripts prove route noninferiority and token budgets only. They do not claim actual DSH task-outcome noninferiority.

## Validation and reversal

The routing validator checks complete subject/mode coverage, owner/path membership, section granularity, unique IDs, lifecycle-only full documents, and token ceilings against a freshly built catalog. Schema fixtures validate every context-route and catalog row. Lifecycle tests load every returned ID, verify summed tokens, reject mode/role ambiguity, exercise lifecycle full-profile routing, and prove Production isolation. Pilot budgets retain the complete Maintainer authority set.

Reversal removes the registry and restores whole-document resolution in a new release. It must also restore pilot baselines and document the context-cost regression; silent fallback inside an existing immutable release is not allowed.

# ADR 0003: APG 3.0 minimal vertical slice

Status: accepted for implementation

## Context

The 2.0 provider modes conflate document placement, routing, and executable placement. The planned 3.0 design separates those axes, but implementing all eleven planned variants at once would make descriptor, context, closure, and migration failures difficult to isolate.

The first implementation must prove two opposite but high-value paths:

- `selected-inline.none`: selected generic documents are project-local and ordinary routing has no runtime executable dependency.
- `shared-runtime.pinned`: generic documents stay in one pinned shared release and the project uses the shared CLI for context.

Version 2 descriptors must remain readable and operational until an owner explicitly adopts 3.0.

## Decision

1. APG 3.0 uses descriptor `schema_version: 2`. Runtime validation accepts both descriptor schema versions; only the two variants above are valid for schema 2 in this slice.
2. A schema 2 descriptor records and cross-validates stable variant, pinned source/runtime identities, independently anchored manifest/root integrity, document placement, lifecycle, selected roles/profiles/overlays, router strategy, executable placement, context budgets, workspace containment, host exposure, project policy, and layout.
3. Natural-language `apg context` is deterministic and LLM-free. Explicit role/mode inputs win. Recognized protected work and materially ambiguous ordinary routing return one bounded clarification record. They never union-load candidate roles, profiles, or generic safety documents.
4. Context includes mandatory authority before optional route content and fails if the larger exact JSON/direct-context estimate exceeds the aggregate budget. Existing per-subject section budgets remain authoritative. Shared generation continuity uses an installation-state HMAC rather than a caller-recomputable checksum.
5. The selected-document builder copies whole role, profile, overlay, and required procedure documents. Dependencies come only from routing registries. It emits selected route data and a hash/ownership manifest; it rejects missing, escaping, case-colliding, or duplicate-owned paths.
6. The materializer supports fresh consumer projects only in this slice. It previews by default and mutates only with `--apply`. Apply uses a project mutation lock, durable journal, transition-blocked root marker, staged guide tree, ordered descriptor/tree/root publication, final validation, and an immutable receipt.
7. Migration from descriptor schema 1 is dry-run only. It emits the proposed schema 2 descriptor, selected closure, effects, rollback/finalization boundary, and honest transitional containment where legacy local bytes remain. It never applies or removes 2.0 bytes.
8. `selected-inline.none` publishes selected documents under `.agent-guides/managed/` and a direct inline root block. No CLI is required after materialization.
9. `shared-runtime.pinned` publishes no generic Markdown under the project and installs/uses one exact shared release plus a compact CLI dispatcher block. Host containment is reported as soft/unknown unless evidence proves more.
10. Compatible channels, generation leases, selected CLI, project CLI, self-contained, source-worktree schema 2, full-local dangerous, migration apply/finalize, and deployment of existing repositories are deferred.

## Consequences

- The vertical slice tests schema invariants and both ends of the placement/runtime tradeoff without claiming the remaining matrix.
- Existing schema 1 projects retain their 2.0 behavior and lower-level `provider resolve/load` commands.
- A selected-inline project can be routed from a clean clone without APG installed, but maintenance and future updates still require a verified materializer source.
- Shared runtime provides behavioral filtering, not a host security boundary.
- Physical selected-local containment is claimed only for fresh materialization or after a later explicit migration finalization implementation.

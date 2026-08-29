# ADR 0001: Version 2 core contract

Status: accepted
Date: 2026-08-29
Plan: `plans/AGENT_PROJECT_GUIDES_2.0.md`

## Context

Version 2 needs one DSH-first vertical slice without turning the package into an enterprise control plane. The first implementation must work with the repository's dependency-free Node and POSIX shell toolchain, preserve 1.x project-authored bytes, keep generic distribution content out of new consumer staging operations, and allow the package source repository to govern its own development.

## Decision

1. The committed project descriptor is `.agent-project-guides.json`. It contains project facts and release identity, not machine paths or copied generic package bytes.
2. Descriptor and portable records use UTF-8 JSON. Hashes use recursively key-sorted JSON for objects, with arrays remaining ordered. Release identity is SHA-256 over a sorted manifest of package-relative file paths, sizes, and file SHA-256 values.
3. `AGENT_PROJECT_GUIDES_HOME` is the test/operator override. Otherwise Linux uses XDG data/state/cache homes; Windows uses `LOCALAPPDATA`. Releases are immutable under `releases/sha256-<digest>`.
4. `project_id` is stable across ordinary clones. Clone/worktree state is isolated by hashing `project_id` with the canonical real path of the current Git/worktree root. Fork identity is explicit and is not inferred from a remote URL in 2.0.0.
5. `thin-bootstrap` is the consumer default. `embedded-local` stores the exact release below `.agent-project-guides/local/releases/` and excludes only that generic local path through per-clone Git metadata when available.
6. `source-worktree` is a self-host/development provider for the governance package's own source repository. It observes the current source digest on each invocation, reports dirty/unreleased state, and cannot satisfy immutable-release or release-evidence gates.
7. A compact managed DSH bootstrap points to the descriptor and portable CLI command. Reports distinguish intended inputs, host observation, APG content-hash match/conflict, and unknown effective model context.
8. Mutual trust is package behavior, not a descriptor field. The caller owns the declared target, inputs, authority, cost, and intended consequences. The callee owns truthful effect disclosure, contract-correct execution, bounded failure, and error reporting.
9. Risk composition is a monotonic union of runtime/operation effects, project constraints, facet/overlay defaults, and task claims. Lower layers cannot remove higher-layer effects. Unknown high-impact effects require clarification; unknown ordinary development does not start a security project.
10. The minimal memory workflow stores exclusively created drafts in clone-local state and publishes revision-bound, independently reviewed records only as new descriptor-bound targets under the shared project mutation lock. Replacement uses a new ID plus supersession provenance, not a claimed filesystem compare-and-swap.
11. Migration records write-ahead ownership before every project mutation. Rollback guarantees exact restoration only for complete postimages captured and owned by the migration; later, unexpected, or ambiguous changes are zero-write conflicts.

## Consequences

- `2.0.0` supports DSH, thin bootstrap, embedded-local migration, source-worktree self-hosting, deterministic catalog/search/load, risk composition, and minimal reviewed memory.
- Workspace authority, non-DSH adapters, signed update channels, semantic retrieval, generalized evidence reuse, and hostile multi-tenant security remain later 2.x work.
- Existing `scripts/install.sh` remains the 1.x-compatible managed-prefix entry while `scripts/apg.mjs` owns the 2.0 lifecycle.

## Validation and reversal

The decision is validated by schema fixtures, release digest reproducibility, self-host dirty-state reporting, clean/missing/offline provider tests, byte-preserving migration rollback, concurrent worktree state isolation, exact routing tests, and memory lifecycle tests. A later ADR may replace a choice only after export/rollback compatibility is defined.

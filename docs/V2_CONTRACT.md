# Version 2 core contract

## Release boundary

Agent Project Guides 2.0 is a DSH-first governance core. It provides a project descriptor, exact content-addressed package selection, deterministic catalog/search/section loading, project-native layout bindings, monotonic risk classification, reviewed memory promotion, byte-owned migration, and explicit degraded behavior.

It does not claim an authoritative remote workspace, non-DSH parity, semantic retrieval, general evidence reuse, signed update infrastructure, or hostile multi-tenant security. Those remain capability-declared later 2.x work.

## Mutual-trust responsibility

The caller and called component initially treat one another as acting in good faith.

- The caller owns the target, inputs, claimed authority, intended external effects, cost, and use of results. The caller accepts the consequences that the called capability disclosed.
- The called implementation owns accurate effect disclosure, contract-correct execution, bounded failure, and honest error/uncertainty reporting.
- Mutual trust never permits hidden side effects, fabricated success, silent scope expansion, or concealed defects.
- Production, credentials, private data, material cost, destructive actions, releases, and physical/safety effects still require the authority defined by their runtime. APG does not manufacture grants.

Security hardening is added when an actual boundary requires it, not as a prerequisite to the core workflow.

## Project descriptor

A project commits `.agent-project-guides.json`. It contains only portable project facts:

- stable `project_id`;
- provider mode, release version, and exact digest;
- delivery facets and domain overlays;
- declared protected effects;
- selected root policy file and mandatory catalog IDs;
- project-native scratch and memory bindings.

Machine paths, caches, receipts, journals, ACL/audit metadata, generic package bytes, and generated search state remain outside the descriptor.

## Provider modes

### `thin-bootstrap`

The default consumer mode. Generic bytes live in the XDG/Windows package store. The project contains only its descriptor and compact DSH bootstrap.

### `embedded-local`

The 1.x migration/offline compatibility mode. The exact release lives under `.agent-project-guides/local/releases/` and is excluded through clone-local Git metadata. Package operations never stage or commit it.

### `source-worktree`

The package source repository's self-host mode. It requires `source: "."`, observes the current digest and Git state on each call, and never overwrites the shared consumer launcher. It is mutable and cannot satisfy immutable-release evidence.

### Immutable runtime release

Thin and embedded modes resolve only `sha256:<64 lowercase hex>` directories. Before importing the package CLI, the standalone launcher validates the canonical runtime manifest, every listed file hash/size, path/case uniqueness, and absence of unexpected files. The runtime digest intentionally excludes source-only tests, pilot fixtures, roadmap, and decision records.

## Portable provider API

The CLI exposes:

```text
provider capabilities
provider resolve
provider search
provider load
provider export
provider import
```

Roles, facets, overlays, procedures, and subtypes route through semantic catalog IDs. File paths are current locations, not authority IDs. `routing/context-routes.jsonl` owns the runtime entrypoints: daily role modes and Development facets resolve to owner-bound sections under declared per-subject token budgets; `initialize/readapt` may select a whole profile; Production roles do not inherit Development facet/overlay guidance. `resolve` revalidates every exact entry hash before reporting the ordered IDs and total `utf8-bytes/4-ceiling` estimate. `load --ids <csv>` revalidates the entries and returns ordered compact `[id, content]` pairs; single `--id` retains the detailed compatible result. Search suggestions cannot satisfy mandatory policy.

`provider import` is a lifecycle-receipt-backed, revision-guarded update for portable project facts. Apply acquires the shared project mutation lock, rereads the revision, and records a recoverable descriptor/receipt write-ahead transaction. It may update facets, overlays, protected effects, mandatory IDs, and layout. It reports/refuses changes to `project_id`, provider mode/release/digest, or `policy.root`; it never installs a provider as an import side effect. Raw writers that ignore the cooperative lock are outside the 2.0 mutual-trust concurrency contract.

## DSH observation

`dsh report` distinguishes:

- `intended`: selected by APG;
- `host_observed`: correlated with supplied DSH host evidence and not contradicted by an APG SHA-256;
- `host_content_match`: `true`, `false`, or `unknown` depending on supplied content-hash evidence;
- `model_effective: unknown`: effective model context is not provable.

A matching path/ID with a mismatched APG SHA-256 is reported as a conflict and is not host-observed. A host-native digest with no APG content hash may prove that the host saw an item, but content identity remains `unknown`.

The adapter never converts intended input into an effective-context claim.

## Risk composition

Risk inputs are demands, never grants:

```text
runtime/admin > operation/tool > project > facet/overlay > task/role/caller
```

Effects and required checks combine by union; tier combines by maximum. Lower layers cannot delete an effect or lower the minimum tier. Ordinary work is R1, genuinely nonbehavioral work can be R0, material protected effects are R2, and destructive/safety-critical effects are R3.

## Memory lifecycle

Draft proposals use exclusive creation in clone-local state. A declared non-author reviews them, and review/promotion remain bound to the proposal's project digest. Promotion acquires the shared project mutation lock, rereads the descriptor, and atomically publishes only a missing, descriptor-bound, non-symlink memory target through no-replace linking; existing records are never conditionally overwritten. Updates use a new ID with fully validated current-project supersession provenance. Promotion never stages or commits, and purge removes local proposals only.

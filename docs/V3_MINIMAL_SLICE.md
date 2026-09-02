# APG 3.0 minimal vertical slice contract

## Scope

APG 3.0 introduces descriptor `schema_version: 2` while preserving schema 1 behavior. This release operationalizes exactly two variants:

- `selected-inline.none`
- `shared-runtime.pinned`

Every other planned variant and compatible channels remain unsupported. Version 2 projects continue to use `thin-bootstrap`, `embedded-local`, or `source-worktree` until an owner explicitly adopts schema 2.

## Descriptor

The schema 2 descriptor is portable project policy. It contains no machine path, generic package bytes, journal, receipt, cache, or credential. `schemas/project-v3.schema.json` and runtime validation require consistent axes:

| Variant | Documents | Router | Executable | Release | Fresh workspace containment |
|---|---|---|---|---|---|
| `selected-inline.none` | `selected-local` | `inline-route` | `none` | exact pinned digest | `physical-selected` |
| `shared-runtime.pinned` | `shared-packed` | `cli-context` | `shared-cli` | exact source and runtime-artifact digests | `no-generic-corpus` |

A reversible migration preview uses `workspace: transitional` plus an explicit schema 1 legacy-provider record. Portable descriptors use only `unknown` for selected-inline and `observed-full` for shared-runtime's configured full pack; stronger host-wide claims such as `host-enforced-none` are not descriptor input. Validation reports the observation source and scope separately.

The selected view declares lifecycle, exact roles, profiles, overlays, mandatory IDs, protected effects, and aggregate/clarification context budgets. Lifecycle-required roles cannot be removed. Descriptor integrity fields independently pin the materialized manifest and exact managed root-block hash; shared mode additionally pins the prepared runtime artifact digest.

## Context compiler

`apg context` is deterministic and invokes no LLM. It returns final content in one call:

```bash
apg context --target /project --task "fix parser recovery" --format context
apg context --target /project --role maintainer --mode code --format json
```

Explicit role and mode resolve first. Without them, the compiler screens protected signals and then applies bounded lexical classification. Recognized protected work, an unavailable high-scoring role, no confident match, or a material score tie returns one compact clarification record. No candidate role/profile/overlay union is loaded.

Mandatory IDs are ordered before route content and are never dropped to meet a budget. Existing per-subject section budgets remain authoritative; schema 2 also caps the larger of the exact serialized JSON and direct-context estimates at 3072 tokens, with clarification-choice framing capped at 160 tokens, using `utf8-bytes/4-ceiling`. Hashes are revalidated before content is returned.

A shared pinned context result includes a 15-minute generation handle bound to project ID, exact release digest, and selected-view revision. Handles use an installation-state HMAC key created during runtime installation; a supplied expired, modified, cross-project, or publicly re-signed handle fails instead of mixing generations. Pinned context is read-only and never activates a channel or mutates the project.

## Selected closure

`lib/closure.mjs` is the common selected-view oracle for materialization and context allowlisting. It builds whole-document modules at role, profile, overlay, and procedure granularity from declared registries and context routes. It rejects:

- missing or cross-view route IDs;
- mandatory IDs that introduce an unselected role/profile/overlay;
- unsafe, case-colliding, or duplicate-owned paths;
- missing declared procedures;
- selected subjects without exactly one context route.

`.agent-guides/MANIFEST.json` records module ownership, dependency reasons, source/installed paths and hashes, the selected view, and excluded optional modules. Section IDs optimize token loading but never narrow the physical exposure of an installed Markdown document.

## Materialization

Preview is the default and performs no target write:

```bash
apg project materialize \
  --target /project \
  --project-id example.project \
  --variant selected-inline.none \
  --lifecycle maintenance \
  --profiles cli
```

Apply requires `--apply`. The minimal materializer accepts fresh consumer projects only. Existing schema 1 projects use migration preview instead.

```bash
apg project materialize \
  --target /project \
  --project-id example.project \
  --variant shared-runtime.pinned \
  --lifecycle maintenance \
  --profiles cli \
  --apply
```

The materializer builds and validates a complete candidate before activation. Source-checkout inputs record clean/dirty/unknown observation and never claim published immutable-release provenance. Apply uses an exclusively owned project-local transition directory, lock, and durable journal, writes a `transition-blocked` root marker, publishes the staged guide tree, publishes the descriptor, revalidates the active view, writes the final root block last, and commits a local ignored receipt. Expected preimage/postimage checks make retries idempotent; an unrelated edit returns a conflict. Receipt-window hard-crash recovery resumes and cleans only APG-owned transition files. Automatic materializer rollback is not part of this slice. It never stages or commits Git changes.

`selected-inline.none` installs selected generic documents under `.agent-guides/managed/` and renders direct routes into the root block. Ordinary work has no APG executable or `BOOTSTRAP.md` dependency.

`shared-runtime.pinned` installs one immutable generation under the configured shared data home. Runtime code and registries are separate from one `content.pack.json`; consumer projects contain no generic Markdown tree. This is soft same-user containment, not a host security boundary.

## Migration preview

Schema 1 adoption is dry-run only in this slice:

```bash
apg migrate v3-preview \
  --target /existing-project \
  --variant selected-inline.none \
  --lifecycle maintenance \
  --source /verified/agent-project-guides
```

The result includes the exact proposed descriptor, selected/excluded closure, descriptor/root preimages, postimage hashes, effects, rollback boundary, retained legacy exposure, and finalization tradeoff. It writes neither the project nor a plan file.

`thin-bootstrap` and `embedded-local` previews report reversible transitional containment. A same-workspace `source-worktree` preview returns a blocker because the full APG source corpus remains present and neither first-slice containment claim would be truthful. Migration apply, rollback, and finalization are deferred.

## Validation

```bash
./scripts/test-release.sh
node scripts/test-v3.mjs
```

The 3.0 fixture covers variant-axis rejection, role/profile/overlay closure, inline/shared route parity, CJK and mixed-task ambiguity, protected clarification, selected-view escape, aggregate budgets, packed runtime absence, generation continuity, every materializer failpoint, retry convergence, and zero-write schema 1 migration preview. The unchanged 2.0 suite remains a required regression gate.

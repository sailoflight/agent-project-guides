# APG 3.0 minimal vertical slice contract

## Scope

APG 3.0 introduces descriptor `schema_version: 2` while preserving schema 1 provider and descriptor behavior. Release 3.0.4 makes an additive schema 1 context-protocol correction described in `docs/V2_CONTRACT.md`. This release operationalizes exactly two variants:

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

The selected view declares lifecycle, exact roles, profiles, overlays, mandatory IDs, protected effects, and aggregate/clarification context budgets. Lifecycle-required roles cannot be removed. Shared-runtime active-development and release-build defaults also select Production User and Operator so one project can route development and operational governance without union loading; selected-inline keeps the smaller lifecycle minimum unless callers explicitly add roles. Descriptor integrity fields independently pin the materialized manifest and exact managed root-block hash; shared mode additionally pins the prepared runtime artifact digest.

## Context compiler

`apg context` is deterministic and invokes no LLM. It returns final content in one call:

```bash
apg context --target /project --task "fix parser recovery" --format context
apg context --target /project --plane production --role operator --mode deploy --format json
apg context --target /project --generation <token> --select production.operator.deploy --format json
```

Explicit plane, role, and mode bypass lexical inference and are validated as one exact route. Without them, the compiler screens protected signals and then applies bounded lexical classification. Protected or ambiguous work returns only executable selected-view choices; unavailable roles are reported separately as required expansion. The default `context` format is minimal AI-facing text: status, authority-neutral routing, semantic choices with executable continuations, any truncation/required expansion, and selected canonical content. Transport SHA256 values, signed payloads, source-observation diagnostics, redundant route/union flags, duplicate choice/source inventories, and diagnostic budget records remain internal to this projection. Canonical content is not redacted or shortened. Explicit `--format json` retains the detailed machine contract: every choice has a stable ID, full route, route hash, matched rules, conflict reason, and next command. Responses expose `choices_truncated` and `omitted_choice_ids` when the four-choice bound omits valid routes. No candidate role/profile/overlay union is loaded.

Mandatory IDs are ordered before route content and are never dropped to meet a budget. Existing per-subject section budgets remain authoritative; schema 2 independently gates exact serialized JSON and direct-context output at 4096 tokens, with rich clarification framing capped at 2048 tokens, using `utf8-bytes/4-ceiling`. Project validation requires both promised formats even though an individual request is gated only by its selected format. Hashes are revalidated before content is returned.

A shared pinned clarification internally retains a 15-minute signed generation bound to project ID, exact release digest, selected-view revision, and its choice IDs/routes/hashes. `--generation <token> --select <choice_id>` can round-trip only one member of that set. Default AI text uses a short random reference instead of the full generation; each continuation explicitly preserves the real project target. The CLI stores the signed generation in an installation-state `generation-handles` directory (0700 directory, 0600 records), with a signed envelope binding the reference and real project root. This local state write occurs only when issuing a shared compact clarification; it does not mutate project files. Issuance also examines at most 128 directory entries to reclaim authenticated expired APG records; unknown, unsafe, or unverified files remain untouched. Cleanup is best-effort, so expiration remains enforced by verification even when an expired record has not yet been reclaimed. Normal ready results, explicit JSON queries, and pure compiler validation do not issue reference records. Missing, unsafe, modified, expired, cross-project, or changed-view references fail closed and require a fresh context request. Diagnostic JSON retains full self-contained generation tokens. Both forms use the installation-state HMAC key, and publicly re-signed tokens fail. `route_resolved=true` reports governance loading only: context always returns `authority_granted=false` and never activates a channel.

Schema 1 clarification uses the same executable choice metadata without generation handles while retaining its legacy top-level `plane`, `role`, and `mode` fields. Its continuations preserve the resolved project target. Each output format has a 4096-token limit and clarification framing has a 2048-token limit; `provider resolve/load` remains unchanged.

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

## Migration adoption

Schema 1 adoption starts with a zero-write preview and requires its exact reviewed digest:

```bash
apg migrate v3-preview \
  --target /existing-project \
  --variant shared-runtime.pinned \
  --lifecycle maintenance \
  --source /verified/agent-project-guides
apg migrate v3-apply \
  --target /existing-project \
  --variant shared-runtime.pinned \
  --lifecycle maintenance \
  --source /verified/agent-project-guides \
  --digest sha256:<reviewed-plan-digest>
```

The preview includes the exact proposed descriptor, selected/excluded closure, descriptor/root preimages, postimage hashes, effects, rollback boundary, retained legacy exposure, and finalization tradeoff. Apply rebuilds the candidate, requires unchanged preimages and the exact plan digest, then uses the materializer journal. It records a descriptor-bound recovery digest and remains `transitional` while legacy recovery bytes are retained.

`apg migrate v3-rollback --target /existing-project` preflights the recovery anchor, descriptor/root postimages, manifest, runtime, and every APG-owned guide-tree file before writing. Unknown or later-edited content returns a zero-write conflict. `thin-bootstrap` and `embedded-local` are supported; same-workspace `source-worktree` remains blocked. Finalization is deferred.

## Validation

```bash
./scripts/test-release.sh
node scripts/test-v3.mjs
```

The 3.0 fixture covers variant-axis rejection, role/profile/overlay closure, inline/shared route parity, CJK and mixed-task ambiguity, protected clarification, selected-view escape, aggregate budgets, packed runtime absence, generation continuity, every materializer failpoint, retry convergence, schema 1 thin/embedded apply and exact rollback, dirty root preservation, unknown-guide conflict, receipt-window recovery, and zero-write migration preview/conflicts. `project validate` compiles every selected role/mode and verifies both direct-context and JSON budgets plus authority-neutral invariants before reporting ready. The 2.0 regression suite remains a required gate and includes schema 1 executable choices, Chinese assessment/plan-only routing, and an over-budget fail-closed fixture.

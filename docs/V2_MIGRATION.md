# Version 2 migration and recovery

## Before migration

Keep the 1.x vendored package and root instructions unchanged. Run the current 1.x tests when available, then generate a no-project-write plan:

```bash
node /path/to/agent-project-guides/scripts/apg.mjs catalog check
node /path/to/agent-project-guides/scripts/apg.mjs migrate plan \
  --target /path/to/project \
  --project-id <stable-id> \
  --source /path/to/agent-project-guides \
  --facets <comma-separated-facets>
```

The plan records disclosed effects, selected legacy root, exact preimage hashes/bytes, descriptor preimage, source release digest, and rollback boundary. Review its JSON output before applying it.

## Apply

```bash
node /path/to/agent-project-guides/scripts/apg.mjs migrate apply \
  --plan <reported-plan-path> \
  --digest <reported-plan-digest>
```

Apply acquires the shared project mutation lock and uses write-ahead ownership before every project mutation. It rejects any root drift from the reviewed plan, persists the exact Git-exclude/bootstrap postimages before writing, and accepts on retry only the recorded preimage or exact postimage. It then installs the embedded release, writes the descriptor, and replaces only legacy managed root blocks. Project-authored suffix bytes remain unchanged.

Validate the exact result:

```bash
node /path/to/agent-project-guides/scripts/apg.mjs project validate --target /path/to/project
```

Do not delete the 1.x vendored tree automatically. It may be tracked, user-edited, referenced by automation, or already present in Git history. Inventory and remove it only through a separate reviewed project change.

## Rollback

```bash
node /path/to/agent-project-guides/scripts/apg.mjs migrate rollback --target /path/to/project
# If an interruption already restored/removed the descriptor:
node /path/to/agent-project-guides/scripts/apg.mjs migrate rollback \
  --target /path/to/project --project-id <stable-id>
```

Rollback first preflights every receipt-owned postimage, including the complete embedded release tree. If any postimage was edited or gained an unexpected file, it performs zero restoration writes and reports conflicts. Otherwise it restores the captured legacy root, clone-local exclude and created release first, restores descriptor bytes/path absence last, and retains the journal. Receipt lookup by verified project ID makes a retry possible even if an interruption occurred immediately after descriptor restoration.

Rollback does not rewind unrelated external state, delete ambiguous files, modify staged content, or rewrite Git history.

## Thin conversion and hydration

New projects normally initialize directly in thin mode:

```bash
node scripts/apg.mjs project init \
  --target /path/to/project \
  --project-id <stable-id> \
  --mode thin-bootstrap \
  --source /path/to/exact-package-source \
  --facets <facets>
```

When a clean clone has the descriptor/bootstrap but lacks the pinned release:

```bash
node /path/to/apg.mjs project hydrate \
  --target /path/to/project \
  --source /path/to/explicit-package-source
```

Hydration accepts only a source whose generated version and digest equal the descriptor. It never resolves `latest`.

## Offline states

| State | Behavior |
|---|---|
| Exact release installed, offline | Full supported core works. |
| Exact release missing, explicit source available | `project hydrate` verifies and installs only the pinned digest. |
| Exact release missing, offline | Descriptor/bootstrap remain readable; protected work stops; ordinary work is explicitly degraded. |

The third state is not reported as successful offline operation.

## Uninstall of a fresh v2 project

```bash
node scripts/apg.mjs project uninstall --target /path/to/project
```

Uninstall is separate from migration rollback. It preflights and removes/restores only exact init-receipt-owned descriptor, bootstrap, clone-local exclude, and init-created embedded release bytes. Conflicts remain untouched; a missing descriptor can be resumed with `--project-id <stable-id>`. Shared external release garbage collection is intentionally separate.

## Source repository self-hosting

The package repository may initialize with `--mode source-worktree --source <same-root>`. The descriptor uses `source: "."` and `digest: observe`; each validation reports the current observed digest and mutable source state. Source self-host initialization returns a local command and does not replace the shared consumer launcher. Before publication, build/install an immutable release and run all suites against that exact digest.

# Architecture navigation author module

A source-only, dependency-free Node author tool. It is **not** an `apg` subcommand,
policy authority, renderer server or runtime prerequisite. Tested with Node 22 on
Linux/WSL; other hosts require their own validation.

## Use

```sh
node scripts/architecture.mjs build
node scripts/architecture.mjs check
node scripts/architecture.mjs locate 健康
node scripts/architecture.mjs impact lib/service-probe.mjs
```

Only `build` writes `docs/architecture/generated/`. `check`, `locate` and `impact`
read current sources each time. A missing match or stale view exits nonzero.
No command executes proposed tests, evaluated code, downloads or service calls.

## Human-owned model

`docs/architecture/modules.json` has `schema_version: 1`, explicit `scope` paths and
`modules`. Each module supplies:

- `id`, `title`, `summary`, `not_owned`, optional search `tags` and existing `contract` path;
- `owns`: relative paths / single-segment `*` patterns (not recursive globs);
- `allowed_dependencies`: reviewed module IDs, not an auto-expanded allowlist;
- `entries`: owned `file`, optional unique named-declaration `symbol`, and `change` hint;
- `tests`: existing source files, displayed but never invoked;
- `flow.steps`: stable `id`, `label`, optional entry symbol or entry file;
- `flow.edges`: `from`, `to`, optional `label`.

Every `.mjs`, `.sh` and `.py` file in scope must have exactly one owner. Keep scope
narrow: do not include credentials, private datasets, dependencies or generated views.
Unknown ownership, cycles, forbidden edges and stale anchors fail explicitly.

## Evidence, not invented understanding

The parser worker uses Node's **experimental** `vm.SourceTextModule` only to compile
ESM and read static `dependencySpecifiers`; it never links or evaluates the modules.
The flag is isolated to that child process. A missing parser is an explicit failure,
not a regex fallback. Named navigation anchors use a constrained declaration-line
matcher: a missing/ambiguous match fails, and this is not an AST symbol/call graph.

Static ESM imports/re-exports and source hashes are code facts. Shell/Python are only
inventoried. Dynamic imports, child processes, runtime dispatch and conditional data
flow are not inferred. Mermaid flows are human-declared intent and visibly labelled
as such. Generated `graph.json` preserves these limitations and an evidence digest;
there are no timestamps or machine-local paths in portable generated output.

`impact` follows reverse module-level static imports, conservatively, and names suggested
tests. It does not prove complete impact coverage. Source links and textual cards still
work when the Markdown viewer cannot render Mermaid.

## Another project / future extraction

Invoke the script from this checkout with `--target /path/to/project`. The target must
supply the same model file and supported sources; no APG descriptor or installed runtime
is needed. The isolated fixtures prove that mechanism, **not** a second real-project
acceptance. Keep the tool in this repository until that acceptance justifies packaging
or a separate repository. Do not copy generated graphs into governance/bootstrap.

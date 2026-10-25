# Changelog

Notable changes to Agent Project Guides, newest first. Versions before 3.0.4 are
recorded in `git log` and the release tags (`v3.0.0` … `v3.0.3`); this file starts
at 3.0.4, which is the first release after the last tag.

APG is a harness-neutral governance core: it decides *what* a project commits to,
*which* exact package content is selected, and *who* has authority — it is not a
runtime and it never executes a model. Entries below are grouped by the surface
they change.

## 3.0.12

**Published permission bits are deterministic, and a group-writable file stops the
release.**

- 3.0.11's manifest declared `catalog/catalog.jsonl` as `0o664`. The cause was
  `writeCatalog`: it wrote its temporary file without an explicit mode, so
  `0o666 & ~umask` decided what got published. A maintainer building under umask 002
  shipped the group-writable bit, and git could not show it — git records `100644`
  because it only tracks the exec bit. An external consumer with a hard rule against
  `mode & 0o022` therefore could not register 3.0.11 at all. It is the only writer in
  `lib/` that omitted the mode; every other temp-then-rename site already passes one.
- `writeCatalog` now writes `{ mode: 0o644 }`.
- `apg release manifest` refuses to publish any file with `mode & 0o022` and names it.
  A group-writable bit in a distribution is a packaging accident rather than a
  decision, and it makes the package unregistrable, so it is a build error now instead
  of a comment in a review.
- Regression in `scripts/test-registration-surface.mjs`: rebuilds the catalog under
  umask 002 and asserts `0o644`; flips that file to `0o664` and asserts the manifest
  command refuses it by name.
- **3.0.11 is superseded.** Its manifest misstates that one mode, so its digest must
  not be used for registration; the line's manifest is `3.0.12`.

## 3.0.11

**Registration surface — three questions an external project asks before it registers
this repository now have machine-checkable answers.**

- `PACKAGE_MANIFEST.json` `files[]` carries `mode` (decimal permission mask) and the
  field is covered by `digest`, so a lost exec bit changes the release digest instead
  of producing an install that exits 126. Contract: `schemas/package-manifest.schema.json`.
  A changed permission bit on an installed release is `release_corrupt`. Manifests
  published before this release carry no mode and stay verifiable on their own shape;
  a current manifest that omits the field is refused, because that means it was
  removed rather than never written.
- `RELEASE_LINES.json` answers "which line may be loaded now" with three words:
  `default` (what to load), `loadable` (content may be resolved and pinned),
  `promotable` (may replace the global launcher). A held line must state its
  `preconditions`. The file ships with the package, so a frozen release describes its
  own line, and `scripts/check-release-lines.mjs` holds the checked-out branch to
  `PACKAGE_VERSION`.
- `apg project block-verify --target <project>` is read-only and reports in one pass
  whether the root block exists, still matches the descriptor's pin, and which release
  it claims — `{field, expected, actual, line}` per disagreement instead of the first
  exception. Markers and hash conventions are shared with the write-path guards.
- Two write-path rules deliberately do not carry over to that report: the 16 KiB root
  limit guards what APG may write, and a duplicate marker after the block is text, not
  a second block. Both were measured on a real 4.x consumer whose root file exceeds
  16 KiB and quotes its own marker in prose.
- Regression: `scripts/test-registration-surface.mjs` builds a package fixture from the
  published manifest, flips one permission bit on an installed release, edits one
  character inside a root block, and asserts each is red; it also pins the legacy
  manifest shape and the release-line invariants.

## 3.0.10

**Root-block guard — the marker grammar now covers the measured field, and stops
over-refusing.**

- `scripts/manage-root-blocks.mjs` recognizes a foreign managed block by a marker
  grammar, and `install.sh` refuses to merge when one sits above APG's regions.
  A systematic census of 39 external checkouts found **three real writers that
  grammar could not see**: `cass`'s spaced sentence marker
  (`<!-- Auto-generated rules from cass-memory playbook -->`), its
  `<project_rules>` tag, and `ntm`'s `<INSTRUCTIONS>` tag. A block from any of
  them would have been silently relocated; they now refuse.
- The `>>>`/`<<<` branch (`ubs`) was wide enough to refuse **any** comment
  starting with those characters. It now requires real text after the arrows, so
  `<!-- >>> -->` and prose quoting a scanner marker migrate normally.
- The census also corrected the writer count, from 3 to **11** components with
  root-instruction writers — with three findings that change what APG may rely
  on: `ubs`'s `.backup` is overwritten by an idempotent re-run (it copies before
  checking), and `ntm`/`acfs`/`cass` rewrite the whole file, so no marker guard
  can protect against them. Details in `decisions/0006`.
- Regression: `scripts/test-install.sh` drives a **32-row** vocabulary (14 marker
  forms that must refuse, 18 benign forms that must not) through the shipped
  `guard-prefix`. The `allow` rows include seven field-scan literals that **no
  writer emits**, so the narrow scope is pinned in both directions.
- The census measured four real grammar gaps and one over-refusal; reverting to
  the previous grammar makes exactly those five rows fail.

## 3.0.9

**Bootstrap integrity — the schema-1 residual is closed.**

- The v2 bootstrap block is now verified against an anchor that lives outside the
  file it protects. `integrity.root_block_hash` is a validated descriptor field
  (`schemas/project.schema.json`, `lib/descriptor.mjs`) using schema 2's exact hash
  convention (sha256 over the marker-delimited block bytes), recorded at
  `project init`. A block that carries neither this anchor nor its own integrity
  line is refused with `bootstrap_unverifiable` instead of being accepted as
  legacy.
- A hash recorded *inside* the block was not a defence against a writer who can
  edit the whole file, since rewriting the body also rewrites its recorded line.
  The anchor in a separate file breaks that loop.
- New `project reattest` re-renders the block for the descriptor's release and
  records the new hash. It verifies the installed block first (byte 0, one
  well-formed marker pair, the block's own integrity line), so it cannot launder a
  hand edit into a fresh anchor. It works for source-worktree, thin-bootstrap and
  embedded-local, and is idempotent.
- `provider import` preserves the local anchor: it is an installation fact, not a
  portable project fact, so importing a snapshot no longer reads its absence as a
  change to apply.
- `project validate` reports `bootstrap.anchor` (`block` | `descriptor` | `both`)
  and `bootstrap.root_block_hash`.

**Upgrade note.** A schema-1 project installed by any release up to and including
3.0.8 has neither anchor, so it now fails `project validate` with
`bootstrap_unverifiable` where it used to pass. `project reattest --target <dir>` is
the repair: it verifies the block that is installed, installs a stamped one for the
descriptor's release, and records the anchor. Schema-2 projects
(`shared-runtime.pinned`, `selected-inline.none`) take a different path and are
unaffected.

**Root instruction-block ownership (ADR 0006) — P3 widened to the measured vocabulary.**

- The census over the external checkouts found **two more writers** than the ADR's
  original three: `am` (`mcp_agent_mail_rust`), which appends to any marker-less
  `AGENTS.md`/`CLAUDE.md`, recurses three levels, and takes no backup; and `ubs`
  (`ultimate_bug_scanner`), which writes a non-namespaced comment. Two prior
  records were also corrected: `bv` does **not** back up before mutating
  `AGENTS.md`, and `ntm` writes a marker-less whole-file template.
- `guard-prefix`'s marker grammar now covers all ten measured marker forms,
  including `am`'s `:blurb` suffix and `ubs`'s `>>>`/`<<<` form. Both previously
  fell outside the grammar, so a block from either writer above APG's regions would
  still have been silently relocated.

**Research and decisions.**

- `plans/MULTI_AGENT_INFRA_INTEGRATION_RESEARCH.md` §13.12 records the two
  remaining measurements with recommendations: EE's trust ladder is an attention
  ranking and never an authority input (its top rung is the unauthenticated default
  for `ee remember`, reachable over MCP with `allowWrite=true`, and reachable by a
  caller-supplied `--source-type`), and the external-component namespace convention
  is `agent-project-guides:external:<command-name>` with the version as a field and
  integrity as a `{state, algo, digest, scope}` triple.

Gates: catalog check valid; `validate-routing` ok; `release verify-source` valid;
`project validate` valid; `test-v2.mjs`, `test-install.sh`, `test-interop-br.sh`
(19 passed / 0 failed / 0 gaps) and the full `test-release.sh` all exit 0.

## 3.0.8

**Managed-prefix safety (ADR 0006 P8, P9).**

- Every rewrite of an instruction file is preceded by a recovery point
  (`AGENTS.md.agent-project-guides.bak`, deliberately distinct from `br`'s `.md.bak`
  and `ee`'s `.ee-backup`).
- A managed block carries `<!-- agent-project-guides:integrity sha256=<hex> -->` as
  its second line, so the start marker stays at byte 0 and every existing byte-0 /
  exactly-once assertion keeps holding. `manage-root-blocks.mjs` gained `stamp` and
  `verify`; `replace`, `merge` and `validate_routing` refuse a block whose recorded
  hash does not match its body. Escape hatch:
  `AGENT_PROJECT_GUIDES_FORCE_MANAGED_BLOCK=1`.
- Interop is measured against the real `br` v0.6.0 binary rather than argued:
  `scripts/test-interop-br.sh` composes a root exactly the way
  `rebuild_root_prefix` does. It reported 13 passed / 0 failed / 2 open gaps when
  it was introduced, 18 passed / 0 failed / 1 open gap once P8 and P9 landed, and
  19 passed / 0 failed / 0 gaps once P3 landed in 3.0.9.

**Multi-agent infrastructure study.**

- `plans/MULTI_AGENT_INFRA_INTEGRATION_RESEARCH.md` records the APG ↔ Flywheel
  layering decision (APG is the authority/control plane, not the execution plane),
  the three memory layers, the writer survey behind ADR 0006, and the user's eleven
  decisions. `decisions/0006` states the block-ownership protocol; ADR 0005 records
  the harness-neutral positioning.
- The DSH adapter is demoted to an explicit compatibility seam (future
  `plugins/dsh-apg`) rather than a positioning claim.

**Governance wording.**

- Role, profile and escalation wording is topology-neutral: escalation no longer
  assumes a particular subagent mechanism. A project suggestion box
  (`templates/SUGGESTION_BOX.md`) was added so a wrong or insufficient routed role
  has a declared outlet.

## 3.0.7

- Stateless routing tickets use 64 bits.

## 3.0.6

- Stateless continuation tickets shortened to 30 characters.

## 3.0.5

- Sandboxed `context` resolution fixed with stateless signed continuations:
  `lib/context-choice.mjs` (generation-bound choice sets), an explicit
  `context-errors.mjs` surface, and `scripts/test-context-choice.mjs` asserting that
  issuance and verification write nothing.
- Multi-profile adaptation routes were fitted to the existing context budgets by
  condensing `procedures/PACKAGE_ADAPTATION.md` and `profiles/MONOREPO_PROJECT.md`
  rather than raising them.

## 3.0.4

- Compact `context` output with guarded continuations: bounded aggregate tokens,
  per-format budgets, a context classifier that can return executable choices, and
  `scripts/test-context-state.mjs` plus `scripts/test-v2.mjs` coverage. Runtime
  errors are reported through one explicit error surface.

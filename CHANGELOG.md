# Changelog

Notable changes to Agent Project Guides, newest first. Versions before 3.0.4 are
recorded in `git log` and the release tags (`v3.0.0` … `v3.0.3`); this file starts
at 3.0.4, which is the first release after the last tag.

APG is a harness-neutral governance core: it decides *what* a project commits to,
*which* exact package content is selected, and *who* has authority — it is not a
runtime and it never executes a model. Entries below are grouped by the surface
they change.

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
- Repository-side (not distributed): `scripts/test-release.sh` now invokes
  `test-genericity.mjs` and `test-interop-br.sh`. ADR 0005's genericity gate had
  existed since 3.0.7 with no runner calling it, so the cross-harness contract had
  a covering test that nothing invoked.
- Repository-side (not distributed): two more declared validations became
  executable. `scripts/test-boundary.mjs` pins ADR 0007's boundary - the exact
  top-level command set, the absence of any retrieval/scheduling/execution/store
  mechanism, the manifest equalling the packer allowlist, and no third-party
  component path in the distribution surface. `scripts/test-interop-writers.sh`
  re-checks ADR 0006's census against the real components: all 20 recorded marker
  literals, the two safe real write paths (`ubs --dry-run` zero writes; `acfs
  --output`/`deploy`), and the UBS block extracted verbatim from its own heredoc
  driven through the shipped `guard-prefix`. Both SKIP when their third-party
  inputs are absent; both have measured negative proofs.
- Repository-side (not distributed): the census's eight source-only rows were
  driven with the writers' **own released binaries**. Every component publishes a
  prebuilt linux/x86_64 release artifact, so no Go/Rust/bun toolchain was needed;
  each was fetched by GitHub asset id and admitted only after four agreeing
  SHA-256 sources, an offline minisign check where a public key exists, an
  archive hygiene scan, and execution restricted to an unprivileged
  user+mount+network namespace with a shadowed home. Two rows changed as a
  result: `bv`'s **shipped** binary emits `bv-agent-instructions-v6` while its
  source at HEAD declares `v7`, and `slb` writes `.cursorrules`, not `AGENTS.md`.
  `frankenterm`'s released v0.15.1 was built without the agent-config feature at
  all, so that row could not be exercised from the artifact. `scripts/test-interop-writers.sh`
  gained section D asserting the observed facts against those binaries. Section D
  is driven by default - it falls back to `.agent-scratch/external-test/bin` when
  `APG_EXTERNAL_BIN` is unset. Inside it each component is an independent
  sub-block, so one absent binary costs one GAP rather than the whole section
  (measured with the payloads staged: 65 passed, 0 failed, 1 gap); and when the
  staged directory itself is absent the section still reports a GAP instead of
  passing silently. Record and security posture:
  `.agent-scratch/external-test/SECURITY-REPORT.md`.
- Repository-side (not distributed): the project-memory index stops churning on
  reads. `.mnemon/documents/index.json` records `lastAccessedAt` for every
  document, so merely recalling a document dirtied the working tree. A
  `.gitattributes` rule plus a per-clone opt-in clean filter
  (`scripts/git-filter-mnemon-index.mjs`, registered by
  `scripts/setup-git-filters.sh`) rewrites that one field to the record's own
  `updatedAt` on the way into git, leaving the on-disk file untouched and the
  field still a string - the runtime silently drops any document whose
  `lastAccessedAt` is not a string, so the field is normalized rather than
  removed. `scripts/test-mnemon-index-filter.mjs` pins the rewrite, the fallback
  sentinel, byte-identical passthrough for anything that is not the expected
  shape, and idempotence. The filter is opt-in: a clone without it behaves
  exactly as before.
- Repository-side (not distributed): the writers harness no longer degrades its
  isolation silently. `scripts/test-interop-writers.sh` runs each component in an
  unprivileged user+mount+network namespace when the kernel allows it and falls
  back to a fake HOME alone when it does not - but the fallback printed nothing,
  so a run without the network namespace reported the same `0 failed` as an
  isolated one. A `WARN` line and a closing `section D isolation:` line now say
  which one happened. The cause is worth recording because it is easy to
  misdiagnose: `unshare -U` succeeds while `unshare -r` fails with EACCES on
  `/proc/self/uid_map` when a file sandbox restricts writes outside the worktree
  - the user namespace is permitted, the identity mapping is not. Assertions and
  counts are unchanged.
- Repository-side (not distributed): the census's last unmeasured row is now
  measured, from source. `frankenterm` publishes exactly one linux/amd64 asset
  (v0.15.1) and it is built with the `agent-detection` cargo feature off, so every
  released binary answers `robot.feature_not_available` and its root-file writer is
  unreachable; no second build variant exists. Building `0.15.6-rc.40` from source
  made the writer observable, and it turned out to be the mildest writer in the
  census: with the default `--scope project` it rewrites only `./AGENTS.md` (four
  byte-identical copies at depth 1-4 are untouched, so it does **not** recurse),
  it **appends** rather than rewrites - every pre-existing byte survives as an
  exact prefix and its region lands *below* APG's - a stale region of its own is
  replaced in place with APG's region left byte-identical, and a repeat run is a
  byte-level no-op that never produces a second marker pair. What it does leave
  behind is **six** root entries per run: `.backup`, `.candidate`, `.claim.json`,
  `.ack.json`, an empty `.ft-atomic-transition.lock`, and a `.ft/` directory.
  `scripts/test-interop-writers.sh` now drives ft from `APG_FT_SOURCE_BIN` and adds
  12 assertions there (77 passed, 0 failed, 0 gaps with the build supplied). The
  default run, which has only the released binary, stays at the previously cited
  **65 passed, 0 failed, 1 gap**, and the row is labelled source-built-RC evidence
  rather than released-artifact evidence.
- Repository-side (not distributed): three vacuous assertions were caught in that
  harness before they shipped, and the fix is the point rather than the bug. Each
  was a "the file did not change" claim that a binary doing nothing at all would
  satisfy - a superset test, an idempotence check, and a region-preservation
  comparison - and one of them hashed a `sed` extraction from a file that did not
  exist, so two empty strings compared equal. They are now gated on the write
  actually having happened, and `APG_FT_SOURCE_BIN=/bin/true` is kept as an
  executable negative control that must produce 9 failures. A silently no-op
  implementation or a feature that was never compiled in is the common case, not a
  corner case.
- Repository-side (not distributed): the writer census is now fully observed, so
  `decisions/0006` gains the table it existed for - each of the 11 writers mapped
  to the defence that actually fires, measured rather than projected. Three tiers
  fall out of the observations, and they are not "markers vs no markers": six
  writers are marker-scoped and coexist by construction (`br`, `bv`, `ee`, `sbh`,
  `frankenterm`, `am`); `ubs` appends but its recovery point is destroyed by a
  re-run; and three rewrite the whole file (`cass`, `ntm`, `acfs`), where no
  grammar can help and only after-the-fact detection plus P8 remain. The P8
  recovery path stops being an inference here: the whole-file tier's only way back
  is the sibling `<root>.agent-project-guides.bak`, and "no writer shares that
  name" was an argument from naming. Section D now seeds that exact sibling, runs
  the clobber, and asserts the copy is still **byte-identical** - passing for
  `ntm setup --force` and `cass project --force` (2,094 B to 261 B, APG's region
  gone, backup intact). `acfs` is labelled inferred rather than measured, because
  two of three is not three of three. The census's earlier "four writers keep no
  recovery point" is corrected to three stable, one unstable, six none, recorded
  next to the original number rather than quietly replacing it.

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

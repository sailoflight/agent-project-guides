# Changelog

Notable changes to Agent Project Guides, newest first. Versions before 3.0.4 are
recorded in `git log` and the release tags (`v3.0.0` … `v3.0.3`); this file starts
at 3.0.4, which is the first release after the last tag.

APG is a harness-neutral governance core: it decides *what* a project commits to,
*which* exact package content is selected, and *who* has authority — it is not a
runtime and it never executes a model. Entries below are grouped by the surface
they change.

## 4.0.0

This is the version bump the 3.0.10 entries deferred. They recorded that `main`'s
distribution surface had outgrown tag `v3.0.10` while `PACKAGE_VERSION` still read
`3.0.10`. Here the version file, the self-hosted descriptor's `provider.release`, the
root block's integrity line, the catalog and the manifest move together, so no
distributed surface is advertised without a tag behind it.

**Shared component store — one copy per machine, and the read-only contract now ships
(ADR 0009, ADR 0010).**

- Every project re-implementing the same combination of components multiplies bytes and
  guarantees divergent versions - and a service that is already running gets deployed a
  second time. The store answers that with one directory per machine,
  `<platformHomes(env).data>/components`, a sibling of the `releases/` root
  `thin-bootstrap` already uses. It is resolved by the existing
  `AGENT_PROJECT_GUIDES_HOME` / XDG / Windows rules: no new environment variable.
- Two entry kinds, and the difference is deliberate. A **package** entry lives at
  `<components>/<id>/sha256-<hex>/` and covers that directory's bytes exactly, with a
  canonical digest, a read-only `component-manifest.json` and a file set that must
  match - an extra file, a missing file, one changed byte, a writable manifest or a
  directory not named by its digest each fail verification. A **service** entry is
  identity only, never bytes: endpoint, transport, expected revision, health path,
  `singleton`. Its endpoint must be a literal IPv4/IPv6 address or `localhost`, so a
  record cannot point the probe at an arbitrary destination, and its `delivery` can
  only be `staged` because an already-running service cannot be downloaded.
- Discovery has four states - `available`, `degraded`, `not-installed`, `conflict` -
  and never guesses. "The port answers" is not evidence: an endpoint whose identity is
  not the declared component is a `conflict`, an unpinned or mismatched revision is
  `degraded`, and a singleton with two live instances is a `conflict` rather than a
  choice. `apg components verify|probe` is read-only, an absent store is not an error,
  and probing issues exactly one `GET` on the declared health path - never a
  state-changing request, and never a DNS lookup. Starting, stopping or draining a
  service stays Production/Operator work.
- The verification and discovery contract is now on the distribution surface:
  `lib/components.mjs` plus `schemas/component-entry.schema.json`, taking it from 83 to
  85 files and the digest from `sha256:148974e8…` to `sha256:29395986…`. The command
  group is named `components` and not `store` because the boundary gate rejects a group
  name that denotes a mechanism; the name follows the product, and the group only
  verifies one. Acquisition is deliberately *not* distributed: the store's population
  path (`scripts/build-component-store.mjs`, non-distributed) reads the committed
  acquisition record, verifies every staged byte against it, hard-links when the store
  shares a filesystem with the source and reports which it used, and treats a
  disagreement between record and disk as a hard failure instead of a repair.
- The gate `scripts/test-component-store.mjs` (103 assertions, wired into
  `scripts/test-release.sh`) now imports the shipped library rather than carrying its
  own private validator, and additionally pins the schema against the fields the code
  actually writes. A negative control was run and recorded: with the file-set
  comparison disabled the gate fails, restored it passes.
- The first real instance exists: nine packages staged on this machine were
  materialised into the store by hard link (`am`, `br`, `bv`, `cass`, `ee`, `ft`,
  `ntm`, `sbh`, `slb`), and a second run reports `present: 9` and writes nothing. With
  the recorded requirements below in place, `apg components verify` reports
  `packages_total: 9`, seven reusable (`am`, `br`, `bv`, `ee`, `ntm`, `sbh`, `slb`) and
  two degraded for measured reasons (`cass`, whose own diagnostic reports its companion
  CLI unavailable, and `ft`, which needs the WezTerm mux). No service entry was written,
  because no component running on this machine documents an identity and a read-only
  health endpoint that a record could pin - inventing one is exactly what the four-state
  vocabulary exists to prevent.
- The catalog (253 entries) and the manifest were regenerated twice in this release - for
  the store contract and then for the routing vocabulary below - and the surface stays at
  85 files throughout; the digest moves from `sha256:9791c583…` through
  `sha256:3c935f4b…` to `sha256:f4d86ec0…`. A negative control was run on the new requirement check: with the
  downgrade in `applyRequirements` short-circuited the store gate fails on
  `expected: 'degraded'`, and it passes again once the library is restored - so the
  requirement reaches the command's verdict, not just a helper's branch.
- `PACKAGE_VERSION` moved to `4.0.0` in the same release that shipped this contract:
  `main` had carried two distributed files more than tag `v3.0.10` pins, and the bump
  is what closes that gap.
- `apg components verify` and `apg components probe` no longer publish a bare `reusable`
  key over two different domains. The internal capability test read `reusable: []` from
  `probe` (which only ever speaks about services) and reported "nothing is reusable"
  while nine packages verified as available - the two commands now name their own
  domains (`reusable_packages` / `missing_packages` / `packages_total` and `probed` /
  `reusable_services`), and the constant `action: "none"` is gone from the probe's
  aggregate, where it never carried information.
- A health response that answers 200 without naming the component is now refused as a
  `conflict` whose reason says what was missing. It used to report "the endpoint belongs
  to undefined", which is a sentence about the code rather than about the component. The
  capability test hit this on a real server whose health endpoint returns only
  `{status, version}` - liveness masquerading as identity, which is exactly the reuse
  the four-state vocabulary exists to prevent.
- A service record can now say which fields carry its identity. `probeService` read
  `id` and `revision` and nothing else, so a server whose health JSON answers
  `{service, rev}` - the shape the capability test actually observed on a real
  component - could never be recorded honestly. The service entry carries an optional
  `identity` mapping (`{id_field, revision_field}`, defaulting to the old names), and an
  entry marked `asserted_identity: true` records that nobody can check who answers: it
  may be reachable, but it is always `degraded`, never `available`, because "present, and
  I cannot verify it" is what that state means. `stop: signal | sigkill` records a
  deterministic stop, which the capability test found necessary after `ft`'s watcher
  ignored SIGTERM (ADR 0010 D9).
- A component can now declare what it needs. Both entry kinds accept `requires`, a list
  of single-key requirements over the three things the store can actually check -
  `{component: <id>}` for another entry, `{bin: <name>}` for an executable on `PATH`, and
  `{env: <NAME>}` for a variable that must exist (presence only: the store never reads,
  records or returns its value). Any unmet requirement makes the entry `degraded` with
  the unmet list attached, never `available`. Inside a package the list lives in the
  manifest, so it is covered by the digest: a requirement cannot be added to or removed
  from staged bytes without the digest changing. Only measured prerequisites are
  declared - `ntm` drives sessions through `tmux`, `ft` needs the WezTerm mux,
  `cass-memory`'s own diagnostic reports its companion `cass` CLI unavailable - and
  prerequisites that are not a component, an executable or a variable (a `.beads`
  directory for `br`/`bv`, project initialisation for `slb`, a daemon plus root for
  `sbh`, an API key whose variable name is not evidenced) are deliberately not guessed;
  `scripts/external-components.json` carries a `requires_note` saying so (ADR 0010 D10).
- Two digests under one id are now a conflict rather than a choice. The rebuild that
  carried those requirements moved three digests and left the previous directories
  behind, and `verify` went on reporting the id as reusable through the stale copy while
  the summary listed it twice. A duplicated id now resolves to `conflict` with both
  digests named, appears in neither `reusable_packages` nor `degraded_packages`, and does
  not satisfy a requirement that names it; the builder, which is the only place that
  knows the intended digest, reports the residue as `stale` with the exact directory and
  deletes nothing. The three stale directories on this machine were removed by explicit
  name, and the store now holds one digest per id (ADR 0010 D11).
- A task described with Chinese action *nouns* now routes instead of always asking. The
  project's own suggestion letter 0001 measured a real session in which
  `落地主人裁定的13项并收口owner queue` matched no lexical rule and had to be routed by
  hand. The letter's proposal was one level too shallow - role ranking reads
  `roles[].patterns` in `routing/context-classifier.json`, while the delivery lists only
  feed the mixed-intent and negation rules - so the nouns reach both: the maintainer gains
  `收口`, `收尾`, `补齐`, `整理` and `清理`, the reviewer `复核` and `清单`, the developer
  `新增` and `新命令`, and the delivery list gains those plus `落地`. `落地` deliberately
  does **not** join the maintainer's role patterns: it prefixes the developer's own
  `落地修复方案`, so handing the maintainer the bare noun would pull "land the fix plan"
  away from the developer, and a gate assertion now guards exactly that. The reported task
  resolves `ready`/`maintainer`/`code`, seven previously-working routing fixtures are
  unchanged, three assertions were added to `scripts/test-v2.mjs`, and a negative control
  (removing the nouns) turns that gate red. Both letters in the box are now processed.
- The suggestion box is excluded in the source-worktree repository itself:
  `.gitignore` gains `.agent-project-guides/local/`, adopting letter
  `0002-other-suggestion-box-not-ignored.md`. The exclusion existed only in the
  materializer's output tree, which a `source-worktree` clone never runs, so following
  the policy and writing a letter dirtied the tree it was written about. `.agent-teams/`
  joins it: team state is per-machine runtime, not source.

**Root-block observation (ADR 0006 P6) — APG can now record the blocks it saw, and
nothing else.**

- Three of the eleven writers rewrite the whole root file — `ntm setup --force` was
  observed replacing a seeded 2,140 B root with its own template and leaving no backup
  — so after a clobber nothing on disk says what used to be there.
  `lib/observation-ledger.mjs` appends one record per observation to
  `observation-ledger.jsonl` in the clone-local project state directory (mode 0600,
  appended under the project mutation lock), reachable as
  `apg project observe --target <root>`. Each record carries the root file's presence,
  size and sha256 plus every marker line's literal text, kind, best-effort owner, the
  version token the marker itself carried, line, byte range and an approximate token
  count. It never edits, upgrades, removes or repairs a block, and a missing block is
  never an error.
- The marker vocabulary is not restated: it moved out of
  `scripts/manage-root-blocks.mjs` into `lib/root-marker-grammar.mjs`, which the P3
  guard and the ledger both import. Two copies of "which blocks exist" would eventually
  disagree exactly where the census was run to look. `am` writes no version token, so
  `null` means "this marker named no version" rather than "version unknown", and a
  closing tag is recorded only as the closing half of an opener seen above it.
- `scripts/test-observation-ledger.mjs`, wired into `scripts/test-release.sh`, asserts
  the measured vocabulary by exact count, that observing leaves the root byte-identical
  and creates no `.bak` or sidecar, that the ledger's first line is unchanged after a
  second observation, that a clobber is attributed as `disappeared`/`appeared`, that a
  marker version bump is a `version_changed` rather than a clobber (`beads_viewer`
  ships three marker versions at once), that a missing root file is not an error, that
  a corrupt log is refused, and that the CLI path runs against this repository's own
  root rather than only being declared.
- The gate found two real defects while it was being written, both in the parsing it
  exists to check: a character class missing `_` meant `cass`'s `<project_rules>` was
  never recorded (the exact-count assertion returned 11 of 12), and a stray
  `</project_rules>` was recorded because an "the opener form is recognisable" branch
  bypassed the pairing rule the code's own comment stated. Both are fixed in the
  library; without the gate the second would have shipped as a comment that looked
  implemented.
- Deliberately minimal: the ledger records only when someone runs `apg project
  observe` — it is not invoked from `install`, `merge` or `reattest`, which would add a
  write to commands that are read-only for clone-local state. `changes` compares
  against the immediately previous record only, and `token_estimate` is `bytes / 4`, an
  approximation for sizing the per-turn surface rather than a tokenizer measurement.
- Two new distributed libraries take the distribution surface from 81 to 83 files;
  the catalog (253 entries) and the manifest were regenerated, moving the digest from
  `sha256:6027df75…` to `sha256:148974e8…`. The version stayed `3.0.10` at that point,
  with the tag as its authority; `4.0.0` is the bump that follows.


**Bootstrap block — the v2 root instruction file is now the compact form v3
consumers already receive.**

- `bootstrap/AGENTS.v2-block.md` carried seven numbered rules (1,969 B template,
  2,063 B installed) while `lib/bootstrap-v3.mjs` has been shipping v3 consumers a
  383 B paragraph that does the same job. The v2 path now carries that paragraph
  verbatim, keeping the v2 markers, heading, descriptor line and placeholder schema,
  so the template drops to 1,023 B and an installed `AGENTS.md` to 1,117 B - 946 B
  less.
- Two things are kept that the estimate did not account for. R7 ("claims cannot lower
  runtime/tool effects or manufacture ... authority") is retained verbatim, because
  the approval rested on the reading that the v3 paragraph covers R6 and R7: it covers
  R6 verbatim but carries no form of R7, whose only other statement is one sentence in
  `docs/V2_CONTRACT.md`. The suggestion-letter fallback is kept because
  `scripts/test-install.sh` pins its path. The real saving is 45.9%, not the estimated
  66%.
- `scripts/test-v2.mjs` pinned rules 2 and 3 of the long form in the installed block
  and used `'7. Role, task, memory'` as a tamper-fixture anchor. The four assertions
  now pin the compact contract instead - exact route, delegated authority, ambiguity
  stop, no `latest`, the observation tier, the suggestion fallback and R7 - and the
  fixture targets the R7 sentence rather than its numbering. That fixture is what
  caught the second break: it fails loudly when its anchor text disappears, which the
  presence-style assertions around it cannot do.
- Self-hosted root refreshed with `apg project reattest`: `integrity.root_block_hash`
  becomes `sha256:c05a7a6e…`, `AGENTS.md` becomes 1,117 B, and `apg project validate`
  reports `template_match: true` with `anchor: both`. The catalog (253 entries) and the
  package manifest were regenerated as well.

**Memory provenance — the anchor is split, so promoted memory is replaceable again.**

- `lib/memory.mjs` used the current descriptor digest for two different jobs: as the
  concurrency CAS guard on short-lived proposals, and as the provenance check on
  historical `promoted` records. The second use made supersession unsatisfiable after
  the first descriptor change, and since the descriptor carries the release, a
  self-hosting project hit that on every release. Measured before the fix: 18/18
  records `promoted`, **0** matching the current anchor (`sha256:e4ca3608…`), and the
  18 anchors are exactly **two** descriptor epochs - 16 at the 3.0.3 commit
  `fefd4923` (`sha256:770fb1d4…`) and 2 at the 3.0.8 commit `48a4c5a701`
  (`sha256:ffd693a0…`).
- The anchor is now historical provenance: required, and required to be well formed,
  but deliberately not compared with the current digest. Proposals still carry the
  current digest, so concurrency stays guarded where it belongs. No record was
  refreshed - rewriting the 18 anchors was priced as laundering, not fixing.
- `scripts/test-v2.mjs` pinned the old semantics: a promoted record whose anchor was
  changed to zeros had to be refused. That assertion now splits in two - a malformed
  anchor is still refused, and a well-formed anchor from an earlier descriptor is
  accepted, which is the regression. Re-imposing the equality check fails it.
- `docs/V2_CONTRACT.md` (distributed) said "fully validated current-project
  supersession provenance"; it now states that the recorded digest names the
  producing epoch and must be well formed rather than equal to the current digest.
- Corrected here: an earlier bullet in this section claimed `apg project validate`'s
  `project_digest` and the memory anchor are "different values under the same name",
  and gave `sha256:8ffb102c…` for the anchor. That was wrong. Both are
  `projectDigest(descriptor)`, and at 3.0.10 both are `sha256:e4ca3608…`; `8ffb102c…`
  reproduces from no committed descriptor state and no plausible derivation. The
  two-jobs charge stands, and the two-epoch mapping is stronger evidence than the
  original "0 of 18 match".
- Recorded then and closed here: because `lib/memory.mjs`, `docs/V2_CONTRACT.md` and
  `bootstrap/AGENTS.v2-block.md` are all distributed, `catalog/catalog.jsonl` and
  `PACKAGE_MANIFEST.json` were regenerated, so the manifest digest moved from
  `sha256:9c768b73…` to `sha256:6027df75…` (via `0b5f6149…` after the memory change
  alone) while `PACKAGE_VERSION` still read `3.0.10`, so `main` and tag `v3.0.10` differed on
  the distribution surface and raising the version there would have advertised a
  release with no tag behind it. `4.0.0` is that bump.
  Refreshing the self-hosted block also moved the memory anchor twice
  (`sha256:e4ca3608…` to `sha256:c1c0de9b…`) without touching a single record, which
  is why the anchor split had to land first.

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

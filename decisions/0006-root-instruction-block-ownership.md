# 0006: Root instruction-file block ownership protocol

Status: accepted — P1, P2, P3, P4, P5, P8, P9 implemented and verified, and the schema-1 bootstrap residual closed; P6, P7 remain follow-up work
Date: 2026-09-19
Scope: `AGENTS.md` / `CLAUDE.md` root instruction files, the managed-prefix merge, third-party block interop, per-turn token budget
Deciders/owner: project owner with development/maintainer
Supersedes: none
Superseded by: none

## Context and evidence

The root instruction file is the only surface APG pays for on **every** turn of every session, and it has several independent writers released separately from APG. All writers below were verified from source on 2026-09-19.

### Writer 1 — APG (this repository)

Markers are `<!-- agent-project-guides:routing:start|end -->` and `<!-- agent-project-guides:adapter-trigger:start|end -->`, with legacy pairs recorded in `lib/core.mjs` (`V2_START/V2_END`, `V3_START/V3_END`, and the three `V1_MARKERS`).

- `scripts/manage-root-blocks.mjs` is a byte-level `Buffer.indexOf` `strip`/`replace`. It preserves every byte it does not own, consumes exactly one trailing CRLF/LF (:25-26), and fails on duplicate or missing markers (:18, :22).
- `scripts/install.sh:324` asserts the routing block begins at byte 0 of the selected root (`[ "$(sed -n '1p' ...)" = "$ROUTING_START" ]`); `:322-323` require the routing marker pair to appear exactly once; `:540-543` refuse multiple routing blocks or a trigger without routing; `:391` applies the same byte-0 rule to the CLAUDE scope block.
- `scripts/install.sh:284-295` (`reject_conflicting_managed_roots`) refuses a sibling root file (`CLAUDE.md`, `AGENTS.local.md`, `CLAUDE.local.md`) that carries package-managed markers.
- `scripts/install.sh:507-540` (`rebuild_root_prefix`) runs `manage-root-blocks.mjs guard-prefix` over the existing root (P3), then strips all four APG regions into `$unmanaged`, concatenates routing + trigger + `$unmanaged`, and `mv -f`s the result.
- **There is no backup** (closed by P8, below): `grep -n 'backup\|\.bak\|cp -' scripts/install.sh` and the same search in `manage-root-blocks.mjs` returned nothing at the time of the survey. A bad merge overwrote the previous root file. Both external writers *do* back up (writer 2 and writer 3 below), so APG was the only writer that did not.
- **APG's markers carry no integrity data** (closed by P9, below) — only a namespace and a version — so at the time of the survey a hand-edited routing block was silently replaced, not detected.

### Writer 2 — beads_rust `br`

Source: `.agent-scratch/external-test/repos/beads_rust/src/cli/commands/agents.rs`.

- `BLURB_VERSION: u8 = 1` (:16); start marker `<!-- br-agent-instructions-v1 -->` (:19) with the version encoded **in** the marker; end marker `<!-- end-br-agent-instructions -->` (:22); detection matches the marker *prefix* `<!-- br-agent-instructions-v`, so any version is recognized (:183).
- `SUPPORTED_AGENT_FILES = [AGENTS.md, CLAUDE.md, agents.md, claude.md]` (:25).
- `append_blurb` (:404-417) copies existing content verbatim and appends; `update_blurb` (:450-455) removes then re-appends, relocating the blurb to the end.
- `write_agent_file_atomically` (:615) with `create_new(true)` (:551, :569) refuses to clobber an existing file.
- **It does back up**: `backup_agent_file` (:659-660) writes `<file>.md.bak` (via `with_extension("md.bak")`) and is called before mutating an existing file (:1143-1145). Verified live — a real run printed `Backup created: .../AGENTS.md.bak`.
- **Discovery is bounded by the nearest project root.** `detect_agent_file_in_project` (:377-400) walks up only as far as `find_agent_search_root` (:348-368), which stops at the first directory containing `.git`, `.beads/`, or `_beads/`. A scratch directory nested inside a managed repo is therefore **not** its own project to `br`: running `br agents --add` there edits the **outer** repo's root instruction file. Witnessed live in this repository on 2026-09-19, and the reason the P5 harness below gives its target its own `.git` and refuses to run unless `br agents --check` reports a path inside the work directory.
- `--dry-run` is supported (`src/main.rs:1321` classifies a mutation as `!args.dry_run && (args.add || args.remove || args.update)`).

**A legacy `bv` namespace already exists in the wild**: `remove_legacy_blurb` (:433-448) recognizes and removes `<!-- bv-agent-instructions-v{n} -->` (:438) / `<!-- end-bv-agent-instructions -->` (:439) blocks, but no longer writes them.

### Writer 3 — eidetic_engine `ee`

Source: `src/core/agentsmd.rs` plus that repository's own `docs/adr/0065-workspace-primer-and-agentsmd-bridge.md` (upstream status: *proposed*).

- Markers: `MARKER_BEGIN_PREFIX = "<!-- ee:agentsmd:begin"` (:76) with attributes `generation={db_generation} hash={body_hash}`, and `MARKER_END = "<!-- ee:agentsmd:end -->"` (:78). `render_managed_block` (:327) emits `"{begin} generation=N hash=H -->\n{body}{end}"`; the hash is `managed_block_body_hash(body)` (:279).
- Backup: `AGENTSMD_BACKUP_SUFFIX = ".ee-backup"` (:74), written before any mutation of an existing file (`.ee-backup` sibling, :1391); a hand edit lands in the backup.
- Its ADR §5 (upstream :73-106) states the contract in terms APG can hold it to: "It NEVER edits outside its markers"; creates files only with explicit `--create`; `--dry-run` prints the diff; "Idempotent: unchanged memory ⇒ byte-identical block"; a hand-edited managed block "is detected by content hash and refused with `agentsmd_unmanaged_edit_detected`" unless `--force-managed-block` is passed. Import parses only **outside** ee markers. On boundaries: "The two never fight because the bridge refuses unmarked territory." (:103-106)
- Degradation vocabulary (:110-117): `agentsmd_file_missing` (info), `agentsmd_markers_missing` (info, code at `agentsmd.rs:58`), `agentsmd_unmanaged_edit_detected` (warning).

### The convergence

Three independently developed tools arrived at the **same** protocol from the same pressure: one marker-delimited managed region per writer, never touch bytes outside it, refuse rather than guess, be idempotent, and detect hand edits of your own region. The differences are equally informative: **both external writers back up before mutating** (`br` writes `<file>.md.bak`, `ee` writes `<file>.ee-backup`) and **only `ee` carries integrity data inside its marker** — APG did neither, which made the root instruction file the one guarded surface in this toolchain with no recovery point and no hand-edit detection. P8 and P9 close both gaps.

### Writer survey corrected: 3 writers → 5 (second-pass measurement, 2026-09-19)

A wider census over the 39 external checkouts in `.agent-scratch/external-test/repos/` found **two more root-instruction writers**, and corrected two prior records. The survey above is *not* wrong about `br` and `ee`; it is incomplete about the field.

| Writer | Markers | Backup before mutating | Notes |
|---|---|---|---|
| `am` (`mcp_agent_mail_rust`) | `<!-- am:blurb -->` / `<!-- am:blurb:end -->`, **no version token** | **no** — raw `std::fs::write` (`crates/mcp-agent-mail-cli/src/lib.rs:89815`, `:89838`) | Appends a full block to any marker-less `AGENTS.md`/`CLAUDE.md`, fills any orphaned `am:blurb` start marker in *any* `.md`, and **recurses three levels** (`max_depth = 3`, `:89638`). Highest-risk writer observed. |
| `ubs` (`ultimate_bug_scanner`) | `<!-- >>> Ultimate Bug Scanner quick reference (written by install.sh; removed by install.sh --uninstall) -->` / `<!-- <<< End Ultimate Bug Scanner quick reference -->` | **yes** — `cp "$agents_file" "${agents_file}.backup"` (`install.sh:4009`) | Detected by content grep, not by a namespaced marker (`install.sh:2378`). Only writes when `AGENTS.md` already exists (`:3989-4001`). |
| `bv` (`beads_viewer`) | `<!-- bv-agent-instructions-v{n} -->` / `<!-- end-bv-agent-instructions -->`, code emits **v7** (`pkg/agents/blurb.go:14-21`) | **no** — atomic `os.Rename` replace (`pkg/agents/file_lock_unix.go:195`) | **Corrects the prior**: `--rollback` is its *self-upgrade* path, not a file rollback. Legacy namespace, still live: 31 of 39 checkouts carry `v1`, `beads_viewer`'s own `AGENTS.md` carries `v5` while its `README.md` and its code carry `v7`. |
| `ntm` | **none** | n/a | Writes a whole-file `AGENTS.md` template, and only when the file does not exist. Marker-based ownership cannot see it at all. |

So "both external writers back up" holds for `br` and `ee` only. Across the five known writers, three distinct backup conventions coexist (`.md.bak`, `.ee-backup`, `.backup`), two writers keep none, and two use no namespaced version token at all.

**Consequence for P3**: `guard-prefix` recognizes a foreign managed block by a marker grammar. The first implementation covered the namespaced `…:start|…:begin|…-agent-instructions-v{n}` forms — that is, `br`, `bv`, `ee`, `slb`, `sbh`, `frankenterm` — but **not** `am:blurb` or the `ubs` `>>>`/`<<<` form, so a block from either of those writers sitting above APG's regions would still have been silently relocated. The grammar was extended for exactly those two shapes (see "P3: implemented and measured").

### P5: measured against the real binary

`scripts/test-interop-br.sh` (committed; it SKIPs when no binary is present) runs `br` v0.6.0 (SHA256 verified against the upstream release asset) in a target with its own `.git`, captures its real 2,086-byte blurb, and then composes the root file exactly the way `rebuild_root_prefix` does, calling the same `guard-prefix` primitive `install.sh` calls. Result on 2026-09-19, before P8/P9: **13 checks passed, 0 failed, 2 gaps confirmed.** After P8 and P9 landed: **18 passed, 0 failed, 1 open gap.** After P3 landed: **19 passed, 0 failed, 0 open gaps.**

| Check | Result |
|---|---|
| APG routing block still at byte 0 after `br --add` | pass |
| `br` region byte-identical, exactly one block, no duplication | pass |
| APG routing/trigger markers still appear exactly once | pass |
| Composing twice is byte-identical (idempotence) | pass |
| **P3**: a third-party block written *above* the prefix is refused, and the refusal leaves the root untouched | **pass** (was: silently relocated from line 1 to line 30) |
| **P3 control**: the pre-P3 algorithm really does relocate that same input | **pass** — a measured 1 → 30 move, so the refusal above is not vacuous |
| **P3 over-refusal control**: project prose above the prefix is still migrated | **pass** |
| **P9 gap** (closed): `replace` silently overwrote a hand-edited managed block, with no hash check and no refusal | **confirmed**, then fixed by P9 |

This is the empirical basis for P3, P8 and P9 being real work rather than theory, and it also downgrades the risk of P1/P2/P4: coexistence between APG and `br` **already works today** in the realistic ordering (APG installed first, `br` appends later).

Two facts make the problem concrete:

- APG owns byte 0 (`install.sh:324`), and `rebuild_root_prefix` preserved foreign **bytes** but not foreign **position** — anything a third party wrote above APG's block was silently relocated below it on the next install. Closed by P3, for another writer's marker block only; the pre-scheme-1 tail-position prose migration is deliberately retained (see P3's narrowed scope).
- Every byte in the file is re-paid on every turn. APG's own block is 1,706 B (≈448 tok) while the v3 blocks observed across 13 checked consumer repositories are 731–758 B (≈192–199 tok): APG's own contribution is 2.3× larger than the template its consumers actually use.

## Constraints and decision drivers

- `manage-root-blocks.mjs` must stay byte-exact; it is the only mechanism that edits APG's regions without disturbing foreign bytes.
- APG must not become the authority for external tools' blocks. The standing red line is that APG *references* external state and never owns it.
- The other writers are independently released binaries. APG cannot change their behaviour and must not fork them.
- Fail-closed is already house style across `install.sh`, and the project's standing rule is that every mutation is backed up and reversible. The root file is currently the one guarded surface with no backup.
- Reordering foreign content is a real regression even when not a single byte changes.

## Decision

Adopt a **managed-prefix ownership protocol** for root instruction files:

- **P1 — Prefix reservation.** APG's routing block is the first byte of the selected root file, followed by the optional adapter-trigger block. No other writer may claim byte 0; external writers append after APG's regions or edit strictly inside their own markers. (`br` satisfies this by construction — it appends.)
- **P2 — Namespaced, versioned markers.** Each writer owns exactly one start/end marker pair whose text carries a namespace and a version: `agent-project-guides:routing`, `agent-project-guides:adapter-trigger`, `br-agent-instructions-v{n}`, legacy `bv-agent-instructions-v{n}`, `ee:agentsmd:begin|end` with `generation=`/`hash=`. Regions are disjoint and no writer touches bytes outside its own pair.
- **P3 — Verbatim preservation, including position (implemented, narrowed by owner arbitration).** All non-owned bytes are preserved exactly, CRLF included. Content already below APG's regions keeps its position; content that sits **above** them must not be silently relocated — the merge fails and asks for reconciliation. **Scope narrowing (owner decision, this revision).** Taken literally, "content above the regions" also forbids the pre-scheme-1 tail-position layout that `merge` deliberately migrates (project prose above APG's block) and that `scripts/test-install.sh` pins as intended behaviour. The two readings cannot both hold, so the owner chose the narrow one: the merge refuses only when a **foreign managed marker block** — a namespaced start marker whose namespace is not `agent-project-guides`, per P2's grammar (`br-agent-instructions-v{n}`, legacy `bv-agent-instructions-v{n}`, `ee:agentsmd:begin`) — sits above APG's regions. Project prose above the prefix is still migrated. **Documented boundary:** the guard fires only once APG's regions exist. On a root with no APG region yet, P1 still prefixed APG's block and moves existing content below it, byte-for-byte and order-preserving; that is prefix reservation, not the reordering of a foreign block out of a managed layout.
- **P4 — Exactly once, fail closed.** A marker pair that is missing, duplicated, or unmatched aborts the operation. This is implemented for APG's own pair and is the required contract for any external writer APG invokes on the user's behalf.
- **P5 — Interop is verified, never assumed.** `scripts/test-interop-br.sh` runs the repeatable sequence (APG prefix, foreign add, APG re-compose, hand-edit probe) and asserts: APG's block is still at byte 0, each marker pair appears exactly once, the foreign region is byte-identical, nothing is duplicated, and the file does not grow without bound. Until it passes, an external writer is reported as `degraded` or `not-installed`, never as supported. `ee`'s bridge is designed in an upstream ADR marked *proposed*; its shipped behaviour must be measured, not inferred from source.
- **P6 — Observation ledger, not authority.** APG may record which foreign blocks it observed (marker, version, byte range, approximate tokens) as *observed* state. It never edits, upgrades, or removes a foreign block, and a missing foreign block is never an APG error.
- **P7 — Budget.** APG's own contribution to the per-turn surface is capped, and the current 1,706 B v2 block is treated as a regression to shrink rather than a baseline to defend.
- **P8 — Back up before the first mutation (implemented).** Any APG operation that rewrites an existing root instruction file writes a recoverable copy first, then mutates. This closes the only unbacked mutation surface in the toolchain and matches the external writers' practice (`br`'s `.md.bak`, `ee`'s `.ee-backup`) and this project's own "every change backed up and rollback-capable" rule.
- **P9 — Managed-block integrity (implemented).** A managed block carries `<!-- agent-project-guides:integrity sha256=<hex> -->` as its **second line**, so the start marker stays the first byte and every byte-0 / exactly-once assertion keeps holding. `<hex>` is sha256 over the body lines after the integrity line, each `\n`-terminated, up to but not including the end marker. `manage-root-blocks.mjs` gains `stamp` and `verify`; `replace` refuses on mismatch; the installer stamps every routing block it writes and gates `merge` and `validate_routing` on `verify`. A block with no integrity line is a pre-P9 install: accepted, and upgraded on its next write. This remains true for the **routing** block. For the **v2 bootstrap** block it was only a first step: the descriptor-side anchor below removed the tolerance, so a bootstrap block with no anchor of any kind is refused rather than accepted. The override is the environment variable `AGENT_PROJECT_GUIDES_FORCE_MANAGED_BLOCK=1`.

## Alternatives considered

| Alternative | Benefit | Rejection/tradeoff reason |
|---|---|---|
| APG owns the whole root file and rewrites it on install | Simplest single-writer model | Destroys third-party blocks, and `br`'s blurb is the normal case; contradicts the reference-don't-own red line |
| APG requires an otherwise unmanaged root file | Trivially safe | Unusable: the root file is exactly where every tool wants to write |
| Detect foreign blocks and move them above APG's prefix | Preserves their position | Breaks `install.sh:324` (routing must be byte 0) and inverts P1 for no benefit |
| Keep today's silent relocation of content above the prefix | No code change | Silent regression: the file the user wrote is not the file they get back |
| Keep the unbacked `mv -f` merge | No new files on disk | The root file is the one guarded surface with no recovery point; contradicts the project's own backup rule |
| Adopt `ee`'s exact marker grammar (`generation=`/`hash=`) for APG's markers | Literal format convergence | APG has no database generation and no body hash today; adopting the attribute *semantics* (P9) without inventing a fake generation is honest, copying the grammar is not |

## Consequences

- Positive: the coexistence mechanism APG already has becomes a stated contract; foreign blocks survive install and update; `br agents --add` is structurally compatible with APG's byte-0 prefix precisely because it appends; the three-writer convergence is now documented rather than rediscovered; P5 turns "probably fine" into a gate; P8/P9 close the two gaps `ee` had already closed and APG had not.
- Negative/risk: P3 introduces a refusal path where content above the prefix used to be silently absorbed; the owner narrowed it to foreign marker blocks so the legacy tail-position migration survives, which means project prose above the prefix is still relocated (and a fresh install onto a foreign-first root still moves that block below APG's regions — P1 prefix reservation, documented as P3's boundary). P8 adds a backup file next to the root file; P9 changes APG's marker grammar, which is contract surface and therefore needs a read alias for the old form; the observation ledger is additional state that must stay honest; `br` and `ee` may change their behaviour in future releases, so the P5 sequence must be re-run when their versions change, and P3's foreign-marker grammar must be re-checked against them when it does.

## Validation and reversal

Validation: `scripts/test-install.sh` (managed-prefix routing including the P3 refusal and its untouched-file guarantee, recoverable CLAUDE scope transactions, exact aliases, project profiles, MCP subtypes, cloud freshness, state lifecycle, safety guards), `scripts/validate-routing.mjs`, `scripts/test-interop-br.sh`, and catalog/manifest regeneration after any change to shipped content. Signals for review: an external writer that stops appending, an install that relocates content found above the prefix, an install that refuses plain project prose above the prefix (over-refusal), a root file mutation without a backup, or the root block exceeding its budget.

Reversal: P1–P7 are additive policy; reverting P3 means deleting the `guard-prefix` call in `rebuild_root_prefix`, the `FOREIGN_MARKER`/`foreignBlockAbove` primitive in `manage-root-blocks.mjs`, the case-B/over-refusal checks in `scripts/test-interop-br.sh`, and the P3 block in `scripts/test-install.sh`. Reverting P1–P7 overall means dropping the P3 refusal path, the P5 test, and the P6 ledger. P8 and P9 touch behavior and must be reverted as a unit with their tests. Installed roots are unaffected by P1–P7 because the protocol introduces no new on-disk format; P9 changes marker grammar and therefore requires the same migration discipline as ADR 0005's catalog-ID aliasing.

### P8 and P9: implemented and measured

Both landed on 2026-09-19; the full evidence is in the commit that introduces them.

| Claim | Evidence |
|---|---|
| Every rewrite of an instruction file is preceded by a recovery point | `backup_file_before_write` is called immediately before all four `mv -f` sites that write `AGENTS.md` or `CLAUDE.md`; `scripts/test-install.sh` asserts the recovery point exists and `cmp`s it against the pre-merge root |
| The P8 test is not vacuous | disabling the call makes the suite fail with `FAIL: P8: root was rewritten with no recovery point` |
| A hand edit of APG's routing block is detected | tampering with the block body makes both `install.sh check` and `install.sh merge` fail with `managed block integrity mismatch: recorded ..., computed ...`, exit 1 |
| The override is a real escape hatch | the same tampered root proceeds under `AGENT_PROJECT_GUIDES_FORCE_MANAGED_BLOCK=1`, and the block verifies again afterwards |
| Pre-P9 installs do not break | for the routing block, a block with no integrity line verifies as `legacy` (exit 0) and `replace` still works on it; the next write stamps it. The v2 bootstrap block instead gets the descriptor anchor via `project reattest`, which is the sanctioned repair for exactly this state |
| `replace` self-protects | with a mismatching block it exits 1; with the override it exits 0 |
| The primitive's other modes are unchanged | `strip` and `replace` byte behaviour is unchanged, covered by the existing suite |

**Override semantics differ from `ee` deliberately.** `ee` re-renders its block, so `--force-managed-block` *overwrites* the hand edit (it survives in the backup). APG's block carries live adaptation state - status, revision, verified-at, scope, reason - that must never be reset, so APG's update path reuses the installed block rather than re-rendering it. With the override, APG therefore **accepts the hand-edited block and re-attests it** by recomputing the hash, and the pre-change file is in the P8 backup. The trade is explicit: no silent data loss, at the cost that a hand edit survives once its owner has consented to it.

### Relationship to the recorded finding `finding.h1.bootstrap-token-only-validation`

That finding is about a **different block** from P9's. It records that `lib/bootstrap.mjs`'s `inspectBootstrap` validated the schema-1 **v2 bootstrap block** (`<!-- agent-project-guides:v2:start -->`) by requiring byte 0 plus three `includes` checks (`project_id`, `provider.release`, `provider.digest`) and comparing no hash at all, so the rest of the block's governance instructions could be rewritten while `project validate` still reported ready. Schema 2 answered this by design with `integrity.root_block_hash` (`schemas/project-v3.schema.json`, required alongside `manifest_digest`); the schema-1 path was token-only.

**That residual is now closed, in two steps.**

1. P9's mechanism was applied to the v2 block: `renderBootstrap` stamps `V2_START`/`V2_END` on every write, and `inspectBootstrap` verifies the recorded line. This closed tampering with a block written after that change, but left a tolerance: a block with **no** integrity line was still accepted as `legacy`, so a pre-existing install stayed unverifiable.
2. Schema 1 gained the same descriptor-side anchor schema 2 has: `integrity.root_block_hash` is a validated descriptor field (`schemas/project.schema.json`, `lib/descriptor.mjs`), recorded by `project init` and refreshed by the new `project reattest`. `inspectBootstrap` now compares the block against it, and a block that carries **neither** anchor is refused with `bootstrap_unverifiable` instead of being accepted as legacy. The hash convention is deliberately the same as schema 2's: sha256 over the marker-delimited block bytes.

Why the descriptor anchor is the one that matters: a hash recorded *inside* the block is not a defence against a writer who can edit the whole file, because whoever rewrites the body can rewrite its recorded hash too. An anchor in a different file breaks that loop.

The `legacy` verdict still exists in `lib/block-integrity.mjs` and is still used by the routing-block path and by `reattest`'s pre-check, but it is no longer a way to pass validation with no anchor.

Evidence (all in `scripts/test-v2.mjs`): a block tampered while keeping all three descriptor tokens fails with `bootstrap_mismatch`; deleting the integrity line fails against the descriptor anchor; deleting the descriptor anchor *and* the line fails with `bootstrap_unverifiable`; `project reattest` verifies the installed block first (so it cannot launder a hand edit), installs a stamped block, records the new hash, and is idempotent — driven from the worst case (a block with no line and a stale descriptor anchor).

### P3: implemented and measured

Landed with the narrowed scope above; the full evidence is in the commit that introduces it.

| Claim | Evidence |
|---|---|
| A foreign block above APG's prefix is refused instead of relocated | `scripts/test-interop-br.sh` case B: `compose` exits non-zero with `another writer's managed block sits above APG's regions (line 1)`; the pre-P3 algorithm moves that same input from line 1 to line 30 |
| The refusal is not vacuous | case B's control composes the identical input with the pre-P3 algorithm and asserts the relocation still happens; the harness reports `19 passed, 0 failed, 0 open gaps` |
| The refusal is measured at the install level too, not just the harness | `scripts/test-install.sh` crafts a root with `br`'s block above APG's regions and requires `merge` to exit non-zero with that message, `check` to reject the layout first, and the root file to be byte-identical afterwards |
| The install-level test is not vacuous | neutralising the `guard-prefix` call makes the suite fail with `FAIL: P3: merge relocated a foreign block above the prefix instead of refusing`; restoring it passes |
| The guard does not over-refuse | the legacy tail-position migration in `scripts/test-install.sh` (project prose above the routing block) still succeeds and still preserves the original bytes as the suffix, and `test-interop-br.sh` case B2 asserts the same |
| Only foreign namespaces are recognised | probe: `br-agent-instructions-v1`, legacy `bv-agent-instructions-v2` and `ee:agentsmd:begin …` refuse; APG's own `v2:start`, plain prose, a leading blank line, a foreign block below the regions, and a root with no regions at all all proceed |
| The grammar covers the whole measured writer vocabulary, not a subset | `scripts/test-install.sh` drives a 15-row table through the shipped `guard-prefix`: 10 marker forms from the five writers (`br`, `bv`, `ee`, `slb`, `sbh`, `frankenterm`, `am` incl. its `:blurb` end form, `ubs` incl. its `<<<` end form) must refuse; 5 benign lines (project prose, APG's own integrity line, markdownlint's `<!-- end list -->`, `<!-- TODO: end -->`, a copyright comment) must proceed |
| That table is not vacuous | reverting `FOREIGN_MARKER` to the first-pass grammar (no `:blurb`, no `>>>`/`<<<`) makes the suite fail with `FAIL: P3: guard did not recognise the am foreign marker block`; restoring it passes |

**Why the grammar needed a second pass.** The first implementation was written from `br`/`bv`/`ee` and matched `…:start`, `…:begin`, and `…-agent-instructions-v{n}`. The wider census (see "Writer survey corrected" above) found two writers outside that shape, so their blocks above APG's regions would still have been relocated — precisely the failure P3 exists to prevent. `am` is the sharpest case: it recurses three levels deep and takes no backup, so a relocated `am` block would be the least recoverable of the five.

### Open items this ADR does not close

- **P6** — the observation ledger is not implemented; nothing yet records which foreign blocks APG saw.
- **P7** — APG's own block is still 2,062 B against the 731-758 B its consumers use.

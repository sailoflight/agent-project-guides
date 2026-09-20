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

Three independently developed tools arrived at the **same** protocol from the same pressure: one marker-delimited managed region per writer, never touch bytes outside it, refuse rather than guess, be idempotent, and detect hand edits of your own region. The differences are equally informative: **both of the writers surveyed here back up before mutating** (`br` writes `<file>.md.bak`, `ee` writes `<file>.ee-backup`) — though the full census below shows that this is the exception, not the rule — and **only `ee` carries integrity data inside its marker** — APG did neither, which made the root instruction file the one guarded surface in this toolchain with no recovery point and no hand-edit detection. P8 and P9 close both gaps.

### Writer survey: the full census — 11 writers, 28 negatives (2026-09-20)

The survey above is *not* wrong about `br` and `ee`; it is incomplete about the field. **Three passes** took it from 3 writers to 5 and then to 11:

| Pass | Scope | Found |
|---|---|---|
| 1 | the two writers APG already collided with | `br`, `ee` |
| 2 | hand scan while implementing P3 | + `am`, `ubs`, `bv`, `ntm` (and 2 corrections) |
| 3 | systematic census: every checkout in `.agent-scratch/external-test/repos/` searched for write sites into root instruction files | **11 components with writers**, 28 confirmed negatives |

Pass 3 (`census.json`, 17 writer records, 28 "no writer found", raw evidence with SHA256SUMS in `.agent-scratch/external-verify/`) also produced **real runs** for the three writers that are runnable on this machine (`ubs` Python/shell, `br` prebuilt binary, `acfs` shell) — the rest need a Go or Rust toolchain that is not installed, so their rows are source-measured and labelled as such (`source: scan`). `bun` is also absent, which is why `cass` was not run end to end.

**Pass 4 (2026-09-20) removed that excuse entirely.** Every one of the eleven publishes an **official prebuilt linux/x86_64 release artifact**, so no Go, Rust or bun toolchain is needed to measure them: the eight `scan`-only rows were driven with their real released binaries. The install was fail-closed (fetch by GitHub asset id, four agreeing SHA-256 sources per artifact, offline minisign verification where a public key is published, archive hygiene scan, extraction with `tarfile` `filter="data"`, execution only inside an unprivileged user+mount+network namespace with a shadowed home). Full record: `.agent-scratch/external-test/SECURITY-REPORT.md`. The re-check is committed as section D of `scripts/test-interop-writers.sh`, which SKIPs when no binary is present.

Two results from that pass are **corrections, not confirmations**, and they are the point of doing it: a checkout is not an artifact. `bv`'s source at HEAD declares `v7` while the released v0.25.0 binary emits `v6`; and `frankenterm`'s writer is present in source but **compiled out of the released binary**, so the artifact a user installs cannot perform the write this table attributes to it.

| Writer | Markers | Backup before mutating | Recursion / preconditions | Evidence |
|---|---|---|---|---|
| `br` (`beads_rust`) | `<!-- br-agent-instructions-v1 -->` / `<!-- end-br-agent-instructions -->` | **yes** — `AGENTS.md.bak` (`src/cli/commands/agents.rs:660`); **observed**: `AGENTS.md.bak` present after `br agents --add -f` | walks upward to `.git`/`.beads` (`:348-399`); root file only, depth 1-4 untouched | scan + **real run** |
| `bv` (`beads_viewer`) | `<!-- bv-agent-instructions-v{n} -->` / `<!-- end-bv-agent-instructions -->`; source at HEAD declares **v7** (`pkg/agents/blurb.go:18-23`), the **released v0.25.0 binary emits v6** | **no** — atomic `os.Rename`; **observed**: no sibling file after `--agents-add` | append/update/remove need an existing file; create does not; **observed**: root file only, no recursion | scan + **real run** (values differ) |
| `ee` (`eidetic_engine_cli`) | `<!-- ee:agentsmd:begin generation=N hash=H -->` / `<!-- ee:agentsmd:end -->`; **observed**: `generation=0 hash=blake3:4e31560a725ff7c0` | **yes** — `AGENTS.md.ee-backup` (`src/core/agentsmd.rs:1391`); **observed**: backup byte-identical to the pre-write file | in-place region rewrite; `--create` to make the file; **observed**: `ee init` itself refuses without `--force` ("Existing agent guidance requires explicit initialization intent"), and the writer does not recurse | scan + **real run** |
| `slb` | `<!-- slb:cursor-rules:start -->` / `<!-- slb:cursor-rules:end -->` (`internal/cli/integrations.go:73`) | **no** | **observed**: `slb integrations cursor-rules --install -C .` writes **`.cursorrules`** and leaves `AGENTS.md` byte-identical. `slb` is not an AGENTS.md writer at all | scan + **real run** (row corrected) |
| `sbh` (`storage_ballast_helper`) | `<!-- sbh-docs:begin <section> -->` / `<!-- sbh-docs:end -->` (`src/cli/docs.rs:2450`) | **no** | rewrites an existing region only; **observed**: `sbh docs --render AGENTS.md` rewrites the marked region in place and `--check` exits 1 on drift | scan + **real run** |
| `frankenterm` | `<!-- frankenterm:start -->` / `<!-- frankenterm:end -->`; plus inline `<!--count:{NAME}-->VALUE<!--/count-->` (`scripts/stamp-readme-counts.sh:140`) | **yes** for the config writer — `.ft-agent-config-<32hex>.backup`; **no** for the count stamper | explicit file list. **The released v0.15.1 binary contains none of this**: zero occurrences of `ft-agent-config-`, `frankenterm:start` or the template module, and `ft robot agents configure` returns `robot.feature_not_available` ("Rebuild ft with filesystem agent detection enabled"). The row is source-only for this release | scan; **released artifact cannot perform the write** |
| `am` (`mcp_agent_mail_rust`) | `<!-- am:blurb -->` / `<!-- am:blurb:end -->`, **no version token**; **observed**: exactly one pair, appended | **no** — raw `std::fs::write` (`crates/mcp-agent-mail-cli/src/lib.rs:89815`, `:89838`); **observed**: no sibling file | **recurses three levels** (`max_depth = 3`, `:89638`); needs the file to exist. **observed**: default scans depth 0-3 and leaves depth 4 untouched; `--max-depth 10` reaches depth 4 | scan + **real run** |
| `ubs` (`ultimate_bug_scanner`) | `<!-- >>> Ultimate Bug Scanner quick reference (written by install.sh; removed by install.sh --uninstall) -->` / `<!-- <<< End Ultimate Bug Scanner quick reference -->` | **yes, first run only** — `install.sh:4007`; see the clobber note below | content-grep detection; only writes when `AGENTS.md` already exists | scan + **real run** |
| `cass` (`cass_memory_system`) | `<!-- Auto-generated rules from cass-memory playbook -->` **and** `<project_rules>` / `</project_rules>` (`playbook.ts:665-686`) | **no** (`.tmp.<hex>` only); **observed**: no sibling file | rewrites the whole file, refuses if it exists without `--force`. **observed**: without `--force` exit 2 and the file is untouched; with `--force` the root shrank from the seeded 2,140 B to 261 B, losing APG's region and the hand-written prose | scan + **real run** |
| `ntm` | **no HTML comment** — region is `<INSTRUCTIONS>` / `</INSTRUCTIONS>` (`internal/cli/agents_template.go:28,95`) | **no**; **observed**: no backup before a full clobber | whole-file template; creates only. **observed**: `ntm quick` writes no AGENTS.md at all (its target is `~/ntm_Dev/<name>`); the writer is `ntm setup`, which **skips an existing file** and, under `--force`, replaces the whole root with its 2,689 B `<INSTRUCTIONS>` template | scan + **real run** |
| `acfs` (`agentic_coding_flywheel_setup`) | reuses `br`'s two markers in `newproj.sh`; its other writers carry **no marker at all** | **no** — shell `>` semantics; `deploy` refuses and writes `<dest>.acfs-new` instead | whole-file create/rewrite, three parallel generators | scan + **real run** |

**Corrections this pass** (each one changes what APG must do):

- **`ubs`'s backup survives only the first run.** The real run showed the copy at `install.sh:4007` happens *before* the already-present check at `:4012`, so a second invocation overwrites the pristine `AGENTS.md.backup` with the already-modified content (`evidence/ubs-backup-clobber-proof.txt`: `142c1e29…` 36 B → `9b49d91a…` 2,147 B). Recorded because it means "`ubs` backs up" is only true while the block is absent.
- **`sbh`'s root-instruction marker is `sbh-docs:begin`, not `sbh-census:begin`.** The latter writes a non-root document (`docs/testing-and-logging.md`). The grammar covers both because it keys on the `:begin` shape, but the survey row above is the root-instruction truth.
- **`bv`'s version digits are data, not a contract**: code emits `v7`, the field carries `v1` (31 checkouts) and `v5` (1). A grammar that pinned a version number would be wrong.
- **`cass` and `ntm` delimit their region without an HTML comment.** This is the finding that forced the third grammar shape (below).
- **`acfs` overwrites whole files with no backup** (real run: a 39 B handwritten `AGENTS.md` was replaced by 4,244 B). Of the eleven writers, four keep no recovery point at all.

**Corrections pass 4 added** (source reading is not a measurement):

- **`bv`'s shipped version is `v6`, not `v7`.** The checkout's `BlurbStartMarker` is `…-v7`, but the released v0.25.0 binary writes `…-v6`. The grammar keys on `v\d+` and already covers both, so no code change follows — but any test that froze `v7` as "the" version would have been testing a string no user's binary emits. `scripts/test-interop-writers.sh` section D now asserts the **shipped** v6.
- **`slb` does not write `AGENTS.md`.** Its only writer emits `.cursorrules` (`--install -C .`) and leaves the root file byte-identical. The grammar still needs its marker shape because `.cursorrules` is sometimes the same guarded surface, but the census row claiming an AGENTS.md writer was wrong.
- **`ntm`'s `quick` path writes no `AGENTS.md`.** The writer is `ntm setup`, which by default **skips** an existing root file and creates one only when absent; under `--force` it replaces the whole file with its template, **silently discarding APG's region with no backup**. This is the sharpest case in the census: no marker grammar can protect APG here, because the writer never looks for a marker. Only `install.sh check` drift detection sees it afterwards.
- **`frankenterm`'s writer is not in the released artifact.** The published v0.15.1 for linux/x86_64 was built without the filesystem agent-detection feature; `ft robot agents configure` answers `robot.feature_not_available`. Counted as an open gap, not as a negative: a differently-built `ft` may well write the recorded markers.
- **`am`'s depth-3 default is measured, not inferred.** Four markdown files scanned by default (depth 0-3), depth 4 untouched; `--max-depth 10` reaches it.
- **`cass` refuses before it clobbers.** Exit 2 and an untouched file without `--force`; with `--force` the whole-file rewrite is confirmed and loses everything outside its own output.
- **`ee` gates on explicit intent.** `ee init` itself refuses on a project with an existing `AGENTS.md` unless `--force` is given, and says the existing file will be preserved; the observed `AGENTS.md.ee-backup` is byte-identical to the pre-write file, so this is a genuine recovery point.


So "both external writers back up" holds for `br` and `ee` only. Across the eleven writers, five distinct backup conventions coexist (`.md.bak`, `.ee-backup`, `.backup`, `.ft-agent-config-<hex>.backup`, none), three writers recurse or walk directories, and three use no namespaced version token.

**Consequence for P3**: `guard-prefix` recognizes a foreign managed block by a marker grammar, so the grammar is only as good as the census. Pass 2's implementation covered the namespaced `…:start|…:begin|…-agent-instructions-v{n}` forms plus `am:blurb` and the `ubs` `>>>`/`<<<` form; the pass-3 census then found that **three real writers were still invisible** to it — `cass`'s spaced sentence marker, and the bare container tags `<project_rules>` (`cass`) and `<INSTRUCTIONS>` (`ntm`). A block from any of them sitting above APG's regions would have been silently relocated, which is the exact failure P3 exists to prevent. The grammar was extended for those shapes, and *tightened* where the census found over-refusal (see "P3: implemented and measured").

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

Validation: `scripts/test-install.sh` (managed-prefix routing including the P3 refusal and its untouched-file guarantee, recoverable CLAUDE scope transactions, exact aliases, project profiles, MCP subtypes, cloud freshness, state lifecycle, safety guards), `scripts/validate-routing.mjs`, `scripts/test-interop-br.sh`, `scripts/test-interop-writers.sh`, and catalog/manifest regeneration after any change to shipped content.

`scripts/test-interop-writers.sh` is the census's executable form and has three parts that run wherever their inputs exist and SKIP otherwise: section A re-checks that all 20 recorded marker literals are still present in the components that emit them (so a renamed marker fails rather than silently invalidating the table), sections B/C drive the safe real paths and the writer's own heredoc bytes through APG's guard, and **section D drives the eleven writers' own released binaries** and asserts the observed facts this table records — including the `bv` v6/v7 drift, `slb`'s `.cursorrules` target, `ntm`'s backup-free clobber, `am`'s depth-3 default, `ee`'s byte-identical `.ee-backup`, and `cass`'s refusal. Section D needs `APG_EXTERNAL_BIN` pointing at extracted release payloads; without it the section reports one GAP and the rest still runs.

Signals for review: an external writer that stops appending, an install that relocates content found above the prefix, an install that refuses plain project prose above the prefix (over-refusal), a root file mutation without a backup, or the root block exceeding its budget.

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

**Checked against the real installations on this machine, not only fixtures.** Every consumer project under the developer's `code/` directory was inspected with the shipping code (`validateDescriptor` plus `inspectBootstrap` / `inspectV3Root`, called directly so nothing could write): **12 of 12 are schema 2** (`shared-runtime.pinned`, pinned release 3.0.7), each already carries `integrity.root_block_hash`, and each returns `state: ready`. So the stricter schema-1 gate cannot break an installed consumer here. The only schema-1 project on the machine is this repository itself, which reports `anchor: both`. Schema 1 is in practice the self-hosting/source-worktree and test-fixture path; a schema-1 project installed by a release up to 3.0.8 would need `project reattest`, which is what the 3.0.9 upgrade note in `CHANGELOG.md` records.

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
| The grammar covers the whole measured writer vocabulary, not a subset | `scripts/test-install.sh` drives a **32-row** table through the shipped `guard-prefix`: **14** marker forms from the eleven writers (`br`, `bv` incl. a versioned `v7`, `ee`, `slb`, `sbh-docs`, `frankenterm`, `am` incl. its `:blurb` end form, `ubs` incl. its `<<<` end form, `cass`'s sentence marker, `cass`'s `<project_rules>` tag, `ntm`'s `<INSTRUCTIONS>` tag) must refuse; **18** benign lines must proceed — six generic benign forms (project prose, APG's own integrity line, APG's `v2:start`, markdownlint's `<!-- end list -->`, `<!-- TODO: end -->`, a copyright comment), **seven field-scan literals that no writer emits** (`casr-machine-readable-v1`, `dcg-machine-readable-v1`, `BEGIN`/`END REOLINK_RAG_WSL_TOOL` from `~/.codex/AGENTS.md`, an orphan `end-bv-agent-instructions`, `sbh-docs:end`, the inline `<!--count:…-->` stamp), and **five shapes that must never qualify** (`<!-- >>> -->`, `<br>`, `<div>`, `<https://…>`, `<AGENTS.md>`) |
| That table is not vacuous | reverting `FOREIGN_MARKER` to the first-pass grammar (no `:blurb`, no `>>>`/`<<<`) makes the suite fail with `FAIL: P3: guard did not recognise the am foreign marker block`; reverting to the **pass-2** grammar makes the three pass-3 rows fail instead (measured: `cass`'s sentence marker, `<project_rules>` and `<INSTRUCTIONS>` are all `allow` under the pass-2 regex) and `<!-- >>> -->` over-refuses. Restoring the current grammar passes |
| The vocabulary is field-derived, not invented | the `allow` rows are literals found by scanning every comment line of the 39 checkouts' root instruction files (78 comment lines, 6 distinct marker-shaped forms that no writer emits) and this machine's home-level tool files (`~/.codex/AGENTS.md`, user-authored, `<!-- BEGIN/END … -->`) |
| The guard also holds against a writer's **real bytes**, not a literal this repository typed | `scripts/test-interop-writers.sh` extracts the UBS block verbatim from its own `install.sh` heredoc (2,110 B, `quick_reference_block`) and drives the shipped `guard-prefix`: refused above APG's regions, allowed below them, and the file is byte-identical after the refusal. A synthetic literal would not catch a heredoc whose shape changed |
| The census itself is re-checked, not remembered | the same harness asserts all 20 marker literals the census recorded are still present in the components that emit them (fails with "upstream changed its marker; update decisions/0006"), and re-runs the two safe real paths: `ubs --dry-run` (exits 0, advertises the AGENTS.md append, leaves the file byte-identical, creates no `.backup`, writes nothing into HOME) and `acfs` (`--output` replaces the whole file with no backup; `deploy --project` on a diverging file exits 3, leaves the destination byte-identical and writes `<dest>.acfs-new`). Negative proof: pointing it at checkouts stripped of their literals makes section A fail and the harness exit 1 |

**Why the grammar needed three passes.** The first implementation was written from `br`/`bv`/`ee` and matched `…:start`, `…:begin`, and `…-agent-instructions-v{n}`. The second pass added `am:blurb` and `ubs`'s un-namespaced arrows. The third pass — the systematic census — found that **three more real writers were still invisible**: `cass`'s spaced sentence marker and the bare container tags `<project_rules>` (`cass`) and `<INSTRUCTIONS>` (`ntm`). Every one of them would have had its block silently relocated on the next `apg` install, which is precisely the failure P3 exists to prevent. `am` remains the sharpest case — it recurses three levels deep and takes no backup — but `ntm` and `acfs` are worse in kind: they rewrite the **whole file**, so no marker-based guard can fully protect APG against them, and only the `check` path detects the result.

The census also produced the opposite finding, which is why the third pass was not only a widening: the `>>>`/`<<<` branch was wide enough to refuse **any** comment beginning with those characters, so a line like `<!-- >>> -->` or prose quoting a UBS marker would have been misread as a foreign block. The branch now requires real text after the arrows, and the added `allow` rows pin that boundary.

### Open items this ADR does not close

- **P6** — the observation ledger is not implemented; nothing yet records which foreign blocks APG saw. The census raises the value of this item: for the three writers that rewrite the **whole file** (below), an after-the-fact ledger is the only possible attribution.
- **P7** — APG's own block is still 2,062 B against the 731-758 B its consumers use.
- **New, and a capability boundary rather than a task: three writers cannot be guarded by markers at all.** `ntm` rewrites the file from an `<INSTRUCTIONS>` template, `cass` rewrites it wholesale (unless the file exists without `--force`), and `acfs` has generators that carry no marker at all. Marker-based `guard-prefix` protects APG's *insertion* from relocating someone else's region; it cannot stop a whole-file writer that runs *after* APG, and P8's backup is then the only recovery point. `install.sh check` (drift detection on APG's own region) is the only defence in that ordering. This is stated as a boundary so no later reader mistakes the marker guard for complete protection.
- **Deliberately not widened**: a generic `-<word>-v{n}` family and `<!-- BEGIN <NAME> -->` both occur in real files, but the field scan shows **no writer emits either** — they are hand-authored sections (`casr`, `dcg`, this machine's `~/.codex/AGENTS.md`). Widening the grammar to them would refuse to migrate human prose; the evidence is recorded in `plans/MULTI_AGENT_INFRA_INTEGRATION_RESEARCH.md` §13.13.4 instead, and the `allow` rows in `test-install.sh` pin the current boundary in both directions.
- **`frankenterm` is an unmeasured row, not a measured negative.** The released v0.15.1 linux/x86_64 artifact was built without the filesystem agent-detection feature, so its AGENTS.md writer cannot be exercised from the shipped binary (`robot.feature_not_available`). The row above is therefore source-measured and must not be cited as observed. Re-measuring needs a differently-built `ft`, which means a Rust toolchain and a large build; that is a deliberate owner decision, not an oversight.
- **The whole-file clobber is now measured, not projected.** `ntm setup --force` was observed replacing a seeded 2,140 B root — APG's region and the author's prose included — with its own 2,689 B template and leaving **no backup**. `cass project --force` was observed shrinking the same root to 261 B. The capability-boundary bullet above is therefore a measured boundary.

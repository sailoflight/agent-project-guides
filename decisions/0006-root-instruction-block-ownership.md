# 0006: Root instruction-file block ownership protocol

Status: accepted — P1, P2, P4 are implemented today; P3, P5, P6, P7, P8, P9 are follow-up work
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
- `scripts/install.sh:439-465` (`rebuild_root_prefix`) strips all four APG regions into `$unmanaged`, concatenates routing + trigger + `$unmanaged`, and `mv -f`s the result.
- **There is no backup**: `grep -n 'backup\|\.bak\|cp -' scripts/install.sh` and the same search in `manage-root-blocks.mjs` return nothing. A bad merge overwrites the previous root file. Both external writers *do* back up (writer 2 and writer 3 below), so APG is the only writer that does not.
- **APG's markers carry no integrity data** — only a namespace and a version — so a hand-edited routing block is silently replaced, not detected.

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

Three independently developed tools arrived at the **same** protocol from the same pressure: one marker-delimited managed region per writer, never touch bytes outside it, refuse rather than guess, be idempotent, and detect hand edits of your own region. The differences are equally informative: **both external writers back up before mutating** (`br` writes `<file>.md.bak`, `ee` writes `<file>.ee-backup`) and **only `ee` carries integrity data inside its marker** — APG does neither, and the root instruction file is consequently the one guarded surface in this toolchain with no recovery point and no hand-edit detection.

### P5: measured against the real binary

`scripts/test-interop-br.sh` (committed; it SKIPs when no binary is present) runs `br` v0.6.0 (SHA256 verified against the upstream release asset) in a target with its own `.git`, captures its real 2,086-byte blurb, and then composes the root file exactly the way `rebuild_root_prefix` does. Result on 2026-09-19: **13 checks passed, 0 failed, 2 gaps confirmed.**

| Check | Result |
|---|---|
| APG routing block still at byte 0 after `br --add` | pass |
| `br` region byte-identical, exactly one block, no duplication | pass |
| APG routing/trigger markers still appear exactly once | pass |
| Composing twice is byte-identical (idempotence) | pass |
| **P3 gap**: a third-party block written *above* the prefix was silently relocated from line 1 to line 29 | **confirmed** |
| **P9 gap**: `replace` silently overwrote a hand-edited managed block, with no hash check and no refusal | **confirmed** |

This is the empirical basis for P3, P8 and P9 being real work rather than theory, and it also downgrades the risk of P1/P2/P4: coexistence between APG and `br` **already works today** in the realistic ordering (APG installed first, `br` appends later).

Two facts make the problem concrete:

- APG owns byte 0 (`install.sh:324`), and `rebuild_root_prefix` preserves foreign **bytes** but not foreign **position** — anything a third party writes above APG's block is silently relocated below it on the next install.
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
- **P3 — Verbatim preservation, including position.** All non-owned bytes are preserved exactly, CRLF included. Content already below APG's regions keeps its position; content that sits **above** them must not be silently relocated — the merge fails and asks for reconciliation.
- **P4 — Exactly once, fail closed.** A marker pair that is missing, duplicated, or unmatched aborts the operation. This is implemented for APG's own pair and is the required contract for any external writer APG invokes on the user's behalf.
- **P5 — Interop is verified, never assumed.** `scripts/test-interop-br.sh` runs the repeatable sequence (APG prefix, foreign add, APG re-compose, hand-edit probe) and asserts: APG's block is still at byte 0, each marker pair appears exactly once, the foreign region is byte-identical, nothing is duplicated, and the file does not grow without bound. Until it passes, an external writer is reported as `degraded` or `not-installed`, never as supported. `ee`'s bridge is designed in an upstream ADR marked *proposed*; its shipped behaviour must be measured, not inferred from source.
- **P6 — Observation ledger, not authority.** APG may record which foreign blocks it observed (marker, version, byte range, approximate tokens) as *observed* state. It never edits, upgrades, or removes a foreign block, and a missing foreign block is never an APG error.
- **P7 — Budget.** APG's own contribution to the per-turn surface is capped, and the current 1,706 B v2 block is treated as a regression to shrink rather than a baseline to defend.
- **P8 — Back up before the first mutation.** Any APG operation that rewrites an existing root instruction file writes a recoverable copy first, then mutates. This closes the only unbacked mutation surface in the toolchain and matches the external writers' practice (`br`'s `.md.bak`, `ee`'s `.ee-backup`) and this project's own "every change backed up and rollback-capable" rule.
- **P9 — Managed-block integrity.** APG's own markers gain an integrity attribute (content hash, and a generation or revision token) so that a hand-edited APG block is *detected* rather than silently overwritten. `manage-root-blocks.mjs replace` refuses on mismatch and requires an explicit override, mirroring `ee`'s `agentsmd_unmanaged_edit_detected` / `--force-managed-block` pair.

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
- Negative/risk: P3 introduces a refusal path where today content above the prefix is silently absorbed; P8 adds a backup file next to the root file; P9 changes APG's marker grammar, which is contract surface and therefore needs a read alias for the old form; the observation ledger is additional state that must stay honest; `br` and `ee` may change their behaviour in future releases, so the P5 sequence must be re-run when their versions change.

## Validation and reversal

Validation: `scripts/test-install.sh` (managed-prefix routing, recoverable CLAUDE scope transactions, exact aliases, project profiles, MCP subtypes, cloud freshness, state lifecycle, safety guards), `scripts/validate-routing.mjs`, `scripts/test-interop-br.sh`, and catalog/manifest regeneration after any change to shipped content. Signals for review: an external writer that stops appending, an install that relocates content found above the prefix, a root file mutation without a backup, or the root block exceeding its budget.

Reversal: P1–P7 are additive policy; reverting them means dropping the P3 refusal path, the P5 test, and the P6 ledger. P8 and P9 touch behavior and must be reverted as a unit with their tests. Installed roots are unaffected by P1–P7 because the protocol introduces no new on-disk format; P9 changes marker grammar and therefore requires the same migration discipline as ADR 0005's catalog-ID aliasing.

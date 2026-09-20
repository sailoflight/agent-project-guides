#!/usr/bin/env bash
# P5b interop test for ADR 0006 (decisions/0006-root-instruction-block-ownership.md).
#
# test-interop-br.sh answers "does APG coexist with ONE real writer's block?".
# This script answers the wider question the writer census raised: **are the facts
# the ADR records about third-party root-instruction writers still true against the
# real components** - and does APG's guard reject their REAL bytes, not a literal
# this repository typed by hand?
#
# Three kinds of check, cheapest and most durable first:
#
#   A. literal drift   every marker literal the ADR records must still be present
#                      in the component that supposedly emits it. If a component
#                      changes its marker, this fails and the ADR must be updated;
#                      the census is a claim, not a memory.
#   B. safe real runs  `ubs --dry-run` must advertise the AGENTS.md append and write
#                      NOTHING (the zero-write claim); `acfs --output` must replace
#                      the whole file with no backup; `acfs deploy --project` on a
#                      diverging file must refuse (exit 3), leave the destination
#                      byte-identical and write `<dest>.acfs-new` instead.
#   C. real bytes      the UBS block is extracted verbatim from its install.sh
#                      heredoc and handed to APG's own guard-prefix: above APG's
#                      regions it must be refused; below them it must be allowed.
#
# What this script deliberately does NOT do: run a component's full installer.
# `ubs --version` is not a flag - it falls through into the full install path,
# which downloads binaries, edits rc files and installs cron. The writer functions
# are exercised only through `--dry-run` and through extracting their own heredoc.
#
# SAFETY: no sudo, no network, every external invocation gets HOME and
# ACFS_TARGET_HOME pointed at a throwaway directory and a cwd that is not inside
# any repository. The checkouts are read-only inputs.
#
# The components are third-party (NOASSERTION licence) and are NOT shipped with
# APG, so every section SKIPS when its checkout is absent. Point APG_EXTERNAL_REPOS
# at a directory of clones to run them.
#
# Environment:
#   APG_EXTERNAL_REPOS   default .agent-scratch/external-test/repos
#   APG_EXTERNAL_BIN     default .agent-scratch/external-test/bin (staged components)
#   APG_INTEROP_WORK     default .agent-scratch/external-test/writers
#   APG_FT_SOURCE_BIN    optional path to a FrankenTerm built from source. Upstream's
#                        only linux/amd64 asset is built without the agent-detection
#                        feature, so its AGENTS.md writer is unreachable in every
#                        released artifact; without this variable ft contributes a
#                        GAP and its writer is never exercised.

set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPOS="${APG_EXTERNAL_REPOS:-$ROOT/.agent-scratch/external-test/repos}"
WORK="${APG_INTEROP_WORK:-$ROOT/.agent-scratch/external-test/writers}"
HELPER="$ROOT/scripts/manage-root-blocks.mjs"

ROUTING_START='<!-- agent-project-guides:routing:start -->'
ROUTING_END='<!-- agent-project-guides:routing:end -->'

if [ ! -d "$REPOS" ]; then
  printf 'SKIP: no external checkouts at %s\n' "$REPOS"
  printf '      set APG_EXTERNAL_REPOS, or clone the components listed in decisions/0006\n'
  exit 0
fi

pass=0; fail=0; gap=0
ok()   { printf '  PASS  %s\n' "$1"; pass=$((pass+1)); }
no()   { printf '  FAIL  %s\n' "$1"; fail=$((fail+1)); }
note_gap() { printf '  GAP   %s\n' "$1"; gap=$((gap+1)); }
# A warning is neither a failure nor a gap: every assertion still ran, but it ran
# under weaker conditions than this harness intends. Saying so is the whole point -
# a silently weaker run prints the same "0 failed" as a properly isolated one.
note_warn(){ printf '  WARN  %s\n' "$1"; }
check(){ if [ "$2" = "$3" ]; then ok "$1 ($2)"; else no "$1 (got '$2', want '$3')"; fi; }

rm -rf "$WORK"; mkdir -p "$WORK/home" "$WORK/tmp" "$WORK/cwd"
FAKE_HOME="$WORK/home"
cd "$WORK/cwd" || exit 2

# ---------------------------------------------------------------------------
echo "== A. the ADR's marker literals are still in the components that emit them =="
# component|literal|label. One row per marker the census recorded; `grep -F` over
# the checkout, because a moved file is not a changed marker, but a vanished
# literal is.
literal_rows() {
  cat <<'ROWS'
beads_rust|<!-- br-agent-instructions-v1 -->|br-start
beads_rust|<!-- end-br-agent-instructions -->|br-end
beads_viewer|<!-- bv-agent-instructions-v|bv-start
beads_viewer|<!-- end-bv-agent-instructions -->|bv-end
eidetic_engine_cli|<!-- ee:agentsmd:begin|ee-start
eidetic_engine_cli|<!-- ee:agentsmd:end -->|ee-end
slb|<!-- slb:cursor-rules:start -->|slb-start
slb|<!-- slb:cursor-rules:end -->|slb-end
storage_ballast_helper|<!-- sbh-docs:begin|sbh-start
storage_ballast_helper|<!-- sbh-docs:end -->|sbh-end
frankenterm|<!-- frankenterm:start -->|frankenterm-start
frankenterm|<!-- frankenterm:end -->|frankenterm-end
mcp_agent_mail_rust|<!-- am:blurb -->|am-start
mcp_agent_mail_rust|<!-- am:blurb:end -->|am-end
ultimate_bug_scanner|<!-- >>> Ultimate Bug Scanner quick reference|ubs-start
ultimate_bug_scanner|<!-- <<< End Ultimate Bug Scanner quick reference -->|ubs-end
cass_memory_system|<!-- Auto-generated rules from cass-memory|auto-generated-start
cass_memory_system|<project_rules>|cass-container-tag
ntm|<INSTRUCTIONS>|ntm-container-tag
agentic_coding_flywheel_setup|<!-- br-agent-instructions-v1 -->|acfs-reuses-br-marker
ROWS
}

while IFS='|' read -r component literal label; do
  [ -n "${component:-}" ] || continue
  if [ ! -d "$REPOS/$component" ]; then
    note_gap "A/$label: no checkout for $component"
    continue
  fi
  hit="$(grep -rF --exclude-dir=.git -l -- "$literal" "$REPOS/$component" 2>/dev/null | head -1)"
  if [ -n "$hit" ]; then
    ok "A/$label literal present (${hit#"$REPOS/"})"
  else
    no "A/$label literal gone from $component - upstream changed its marker; update decisions/0006"
  fi
done < <(literal_rows)

# ---------------------------------------------------------------------------
echo "== B. safe real runs =="
UBS="$REPOS/ultimate_bug_scanner/install.sh"
ACFS="$REPOS/agentic_coding_flywheel_setup/scripts/generate-root-agents-md.sh"

if [ -f "$UBS" ]; then
  mkdir -p "$WORK/ubs-dry"
  printf 'original hand-written rules\n' > "$WORK/ubs-dry/AGENTS.md"
  before_sha="$(sha256sum "$WORK/ubs-dry/AGENTS.md" | cut -d' ' -f1)"
  ( cd "$WORK/ubs-dry" && HOME="$FAKE_HOME" bash "$UBS" --dry-run --easy-mode --no-color ) \
    > "$WORK/ubs-dry.log" 2>&1
  rc=$?
  check "B/ubs dry-run exits 0" "$rc" "0"
  if grep -qF 'Would append scanner documentation to AGENTS.md.' "$WORK/ubs-dry.log"; then
    ok "B/ubs dry-run advertises the AGENTS.md append"
  else
    no "B/ubs dry-run said nothing about AGENTS.md (see $WORK/ubs-dry.log)"
  fi
  check "B/ubs dry-run left AGENTS.md byte-identical" \
    "$(sha256sum "$WORK/ubs-dry/AGENTS.md" | cut -d' ' -f1)" "$before_sha"
  check "B/ubs dry-run created no .backup" \
    "$([ -e "$WORK/ubs-dry/AGENTS.md.backup" ] && echo present || echo absent)" "absent"
  check "B/ubs dry-run wrote nothing into HOME" \
    "$(find "$FAKE_HOME" -mindepth 1 2>/dev/null | wc -l | tr -d ' ')" "0"
else
  note_gap "B/ubs: no checkout at ultimate_bug_scanner"
fi

if [ -f "$ACFS" ]; then
  mkdir -p "$WORK/acfs-out" "$WORK/acfs-home"
  printf 'hand-written, must be replaced wholesale\n' > "$WORK/acfs-out/AGENTS.md"
  out_rc=0
  ( cd "$WORK/tmp" && HOME="$FAKE_HOME" ACFS_TARGET_HOME="$WORK/acfs-home" \
      bash "$ACFS" --output "$WORK/acfs-out/AGENTS.md" ) > "$WORK/acfs-out.log" 2>&1 || out_rc=$?
  check "B/acfs --output exits 0" "$out_rc" "0"
  if [ -s "$WORK/acfs-out/AGENTS.md" ]; then
    ok "B/acfs --output produced a guide ($(wc -c < "$WORK/acfs-out/AGENTS.md" | tr -d ' ') bytes)"
  else
    no "B/acfs --output produced nothing"
  fi
  if grep -qF 'hand-written, must be replaced wholesale' "$WORK/acfs-out/AGENTS.md"; then
    no "B/acfs --output kept the previous content (whole-file replace expected)"
  else
    ok "B/acfs --output replaced the file wholesale"
  fi
  check "B/acfs --output wrote no backup" \
    "$([ -e "$WORK/acfs-out/AGENTS.md.backup" ] || [ -e "$WORK/acfs-out/AGENTS.md.bak" ] && echo present || echo absent)" "absent"

  mkdir -p "$WORK/acfs-proj"
  printf 'user-authored rules that must survive\n' > "$WORK/acfs-proj/AGENTS.md"
  proj_sha="$(sha256sum "$WORK/acfs-proj/AGENTS.md" | cut -d' ' -f1)"
  dep_rc=0
  ( cd "$WORK/tmp" && HOME="$FAKE_HOME" ACFS_TARGET_HOME="$WORK/acfs-home" \
      bash "$ACFS" deploy --project "$WORK/acfs-proj" ) > "$WORK/acfs-deploy.log" 2>&1 || dep_rc=$?
  check "B/acfs deploy refuses a diverging destination (exit 3)" "$dep_rc" "3"
  if grep -qF 'REFUSED' "$WORK/acfs-deploy.log"; then
    ok "B/acfs deploy said REFUSED"
  else
    no "B/acfs deploy did not report REFUSED (see $WORK/acfs-deploy.log)"
  fi
  check "B/acfs deploy left the destination untouched" \
    "$(sha256sum "$WORK/acfs-proj/AGENTS.md" | cut -d' ' -f1)" "$proj_sha"
  check "B/acfs deploy wrote a merge candidate" \
    "$([ -f "$WORK/acfs-proj/AGENTS.md.acfs-new" ] && echo present || echo absent)" "present"
else
  note_gap "B/acfs: no checkout at agentic_coding_flywheel_setup"
fi

# ---------------------------------------------------------------------------
echo "== C. APG's guard against the writer's REAL bytes =="
if [ -f "$UBS" ]; then
  # The block comes out of install.sh's own heredoc (quick_reference_block), so
  # nothing here depends on a literal typed into APG.
  # Start after the `cat <<'QUICK_REF'` opener: the appended bytes are what the
  # heredoc expands to, so the first line must be the writer's start marker.
  awk '/^quick_reference_block\(\) \{/{f=1;next} f&&/^QUICK_REF$/{exit} f&&/^cat <</{next} f{print}' "$UBS" > "$WORK/ubs-block.md"
  if [ -s "$WORK/ubs-block.md" ]; then
    ok "C/ubs block extracted from install.sh ($(wc -c < "$WORK/ubs-block.md" | tr -d ' ') bytes)"
  else
    no "C/ubs block could not be extracted from install.sh (heredoc shape changed?)"
  fi
  check "C/ubs block starts with the start marker" \
    "$(head -1 "$WORK/ubs-block.md")" \
    '<!-- >>> Ultimate Bug Scanner quick reference (written by install.sh; removed by install.sh --uninstall) -->'
  check "C/ubs block ends with the end marker" \
    "$(tail -1 "$WORK/ubs-block.md")" \
    '<!-- <<< End Ultimate Bug Scanner quick reference -->'

  # Above APG's regions: refuse.
  { cat "$WORK/ubs-block.md"; printf '\n'; cat <<EOF
$ROUTING_START
body
$ROUTING_END
EOF
  } > "$WORK/ubs-above.md"
  cp "$WORK/ubs-above.md" "$WORK/ubs-above.before"
  gp_rc=0
  node "$HELPER" guard-prefix "$WORK/ubs-above.md" "$ROUTING_START" "$ROUTING_END" \
    > "$WORK/ubs-guard.log" 2>&1 || gp_rc=$?
  if [ "$gp_rc" -ne 0 ]; then
    ok "C/guard refuses the real ubs block above APG's regions"
  else
    no "C/guard accepted the real ubs block above APG's regions"
  fi
  check "C/the refusal did not modify the file" "$(sha256sum "$WORK/ubs-above.md" | cut -d' ' -f1)" \
    "$(sha256sum "$WORK/ubs-above.before" | cut -d' ' -f1)"

  # Below APG's regions: allowed (the guard protects position, not existence).
  { cat <<EOF
$ROUTING_START
body
$ROUTING_END
EOF
    cat "$WORK/ubs-block.md"
  } > "$WORK/ubs-below.md"
  gp_rc=0
  node "$HELPER" guard-prefix "$WORK/ubs-below.md" "$ROUTING_START" "$ROUTING_END" \
    > "$WORK/ubs-guard-below.log" 2>&1 || gp_rc=$?
  check "C/guard allows the same block below APG's regions" "$gp_rc" "0"
else
  note_gap "C/ubs: no checkout, so the real bytes could not be obtained"
fi

# ---------------------------------------------------------------------------
echo "== D. the writers' OWN RELEASED BINARIES, driven for real =="
# Sections A-C read the checkouts. A checkout is not an artifact: source at HEAD
# can be ahead of, or behind, the binary a user actually installs. This section
# runs the official prebuilt release binaries and asserts what they DO.
#
# Measured drift this section exists to catch: beads_viewer's source declares
# `bv-agent-instructions-v7` while the released v0.25.0 binary emits v6.
#
# SKIPs entirely unless APG_EXTERNAL_BIN points at a directory of extracted
# release payloads (fetch them with the verified pipeline documented in
# .agent-scratch/external-test/SECURITY-REPORT.md). One sub-block per component,
# each independent, so a missing binary costs one GAP and not the whole section.
EXT="${APG_EXTERNAL_BIN:-$ROOT/.agent-scratch/external-test/bin}"
ISO="section D skipped, so its isolation level does not apply"
if [ ! -d "$EXT" ]; then
  note_gap "D/*: no APG_EXTERNAL_BIN at $EXT, so no released binary could be driven"
else
  # Every case runs in its own throwaway project with a fake HOME. `unshare -rn`
  # is used when the kernel allows it, so the component cannot reach the network;
  # the fake HOME is what the zero-write claims are measured against either way.
  NET=""
  ISO="network-isolated (unprivileged user+mount+net namespace)"
  if unshare -rn true 2>/dev/null; then
    NET="unshare -rmn"
  else
    # Degradation must be visible. Without the namespace the components still run
    # against a fake HOME and a throwaway cwd, but they can reach the network and
    # nothing stops them from writing to an absolute path outside the throwaway
    # tree. Measured cause in one real environment: a file sandbox that denies the
    # /proc/self/uid_map write makes `unshare -r` fail with EACCES, which is easy
    # to mistake for "the kernel does not allow namespaces at all".
    ISO="NOT network-isolated: unshare is unavailable, so these components could reach the network"
    note_warn "D: $ISO"
  fi
  ext_run() { # <name> <cmd...>   (cwd = $WORK/d/<name>/cwd, HOME = .../home)
    local name="$1"; shift
    local dir="$WORK/d/$name"
    mkdir -p "$dir/cwd" "$dir/home"
    ( cd "$dir/cwd" && \
      HOME="$dir/home" TMPDIR="$dir/cwd/.tmp" \
      PATH="$(dirname "$1"):$PATH" \
      $NET timeout 180 "$@" >"$dir/stdout" 2>"$dir/stderr" )
    printf '%s' "$?" > "$dir/rc"
  }
  seed_root() { # <dir>  a root file carrying APG's own v2 region
    cp "$ROOT/AGENTS.md" "$1/AGENTS.md"
    printf '\n## Hand-written project notes\n' >> "$1/AGENTS.md"
  }
  seed_depths() { # <dir>  the same file at depth 1..4 for recursion probing
    local d="$1"
    seed_root "$d"
    mkdir -p "$d/a" "$d/a/b" "$d/a/b/c" "$d/a/b/c/d"
    for x in a a/b a/b/c a/b/c/d; do cp "$d/AGENTS.md" "$d/$x/AGENTS.md"; done
  }
  rc_of() { cat "$WORK/d/$1/rc" 2>/dev/null || echo 127; }
  has() { grep -qF -- "$2" "$1" 2>/dev/null; }

  # --- br: the writer APG already collided with ----------------------------
  BR="$EXT/br-0.6.0/br"
  if [ -x "$BR" ]; then
    mkdir -p "$WORK/d/br/cwd"; seed_root "$WORK/d/br/cwd"
    ext_run br "$BR" agents --add -f --no-db --no-color
    check "D/br agents --add exits 0" "$(rc_of br)" "0"
    if [ -f "$WORK/d/br/cwd/AGENTS.md.bak" ]; then
      ok "D/br leaves a real recovery point (AGENTS.md.bak)"
    else
      no "D/br wrote AGENTS.md with no AGENTS.md.bak"
    fi
    if has "$WORK/d/br/cwd/AGENTS.md" '<!-- br-agent-instructions-v1 -->'; then
      ok "D/br emits its recorded v1 marker"
    else
      no "D/br marker changed; update decisions/0006"
    fi
  else
    note_gap "D/br: released binary absent"
  fi

  # --- bv: source says v7, the shipped binary says v6 ----------------------
  BV="$EXT/bv-0.25.0/bv"
  if [ -x "$BV" ]; then
    mkdir -p "$WORK/d/bv/cwd"; seed_root "$WORK/d/bv/cwd"
    ext_run bv "$BV" --agents-add --agents-force
    check "D/bv --agents-add exits 0" "$(rc_of bv)" "0"
    if has "$WORK/d/bv/cwd/AGENTS.md" '<!-- bv-agent-instructions-v6 -->'; then
      ok "D/bv emits the SHIPPED v6 marker (source at HEAD declares v7)"
    else
      no "D/bv no longer emits v6; re-measure the source/shipped drift"
    fi
    if ls "$WORK/d/bv/cwd"/AGENTS.md.* >/dev/null 2>&1; then
      no "D/bv created a backup file, contradicting the census"
    else
      ok "D/bv creates no backup (atomic rename), as recorded"
    fi
  else
    note_gap "D/bv: released binary absent"
  fi

  # --- slb: writes .cursorrules, NOT AGENTS.md -----------------------------
  SLB="$EXT/slb-0.4.1/slb"
  if [ -x "$SLB" ]; then
    mkdir -p "$WORK/d/slb/cwd"; seed_root "$WORK/d/slb/cwd"
    cp "$WORK/d/slb/cwd/AGENTS.md" "$WORK/d/slb/agents.before"
    ext_run slb "$SLB" integrations cursor-rules --install -C .
    check "D/slb cursor-rules --install exits 0" "$(rc_of slb)" "0"
    if [ -f "$WORK/d/slb/cwd/.cursorrules" ]; then
      ok "D/slb writes .cursorrules"
    else
      no "D/slb did not write .cursorrules"
    fi
    if cmp -s "$WORK/d/slb/cwd/AGENTS.md" "$WORK/d/slb/agents.before"; then
      ok "D/slb leaves AGENTS.md byte-identical (it is not an AGENTS.md writer)"
    else
      no "D/slb modified AGENTS.md, contradicting the corrected census row"
    fi
  else
    note_gap "D/slb: released binary absent"
  fi

  # --- ntm: whole-file replace; --force clobbers an existing root ----------
  NTM="$EXT/ntm-1.35.1/ntm"
  if [ -x "$NTM" ]; then
    mkdir -p "$WORK/d/ntm/cwd"; seed_root "$WORK/d/ntm/cwd"
    ext_run ntm "$NTM" setup --force --no-color
    check "D/ntm setup --force exits 0" "$(rc_of ntm)" "0"
    if has "$WORK/d/ntm/cwd/AGENTS.md" '<INSTRUCTIONS>'; then
      ok "D/ntm setup --force replaces the whole root with its <INSTRUCTIONS> template"
    else
      no "D/ntm setup --force did not write its template"
    fi
    if has "$WORK/d/ntm/cwd/AGENTS.md" 'agent-project-guides:v2:start'; then
      no "D/ntm preserved APG's region; the census records a whole-file clobber"
    else
      ok "D/ntm clobbered APG's region entirely (no marker guard can see this)"
    fi
    if ls "$WORK/d/ntm/cwd"/AGENTS.md.* >/dev/null 2>&1; then
      no "D/ntm created a backup, contradicting the census"
    else
      ok "D/ntm creates no backup before the clobber, as recorded"
    fi
  else
    note_gap "D/ntm: released binary absent"
  fi

  # --- am: marker pair, no backup, depth-3 default recursion ---------------
  AM="$EXT/am-0.3.36/am"
  if [ -x "$AM" ]; then
    mkdir -p "$WORK/d/am/cwd"; seed_depths "$WORK/d/am/cwd"
    ext_run am "$AM" docs insert-blurbs --scan-dir . --yes
    check "D/am insert-blurbs exits 0" "$(rc_of am)" "0"
    check "D/am writes exactly one blurb start marker" \
      "$(grep -cF '<!-- am:blurb -->' "$WORK/d/am/cwd/AGENTS.md" 2>/dev/null || echo 0)" "1"
    check "D/am writes exactly one blurb end marker" \
      "$(grep -cF '<!-- am:blurb:end -->' "$WORK/d/am/cwd/AGENTS.md" 2>/dev/null || echo 0)" "1"
    if has "$WORK/d/am/cwd/a/b/c/AGENTS.md" '<!-- am:blurb -->'; then
      ok "D/am reaches depth 3, as the census records (max_depth = 3)"
    else
      no "D/am no longer reaches depth 3"
    fi
    if has "$WORK/d/am/cwd/a/b/c/d/AGENTS.md" '<!-- am:blurb -->'; then
      no "D/am reached depth 4 by default; the recorded max_depth is wrong"
    else
      ok "D/am stops before depth 4 by default"
    fi
  else
    note_gap "D/am: released binary absent"
  fi

  # --- cass: refuses to overwrite ------------------------------------------
  CASS="$EXT/cass-0.2.14/cass-memory-linux-x64"
  if [ -x "$CASS" ]; then
    mkdir -p "$WORK/d/cass/cwd"; seed_root "$WORK/d/cass/cwd"
    ext_run cass "$CASS" project --format agents.md --output AGENTS.md
    check "D/cass refuses to overwrite without --force" "$(rc_of cass)" "2"
    if has "$WORK/d/cass/cwd/AGENTS.md" 'agent-project-guides:v2:start'; then
      ok "D/cass left the refused file untouched"
    else
      no "D/cass rewrote the file it claimed to refuse"
    fi
  else
    note_gap "D/cass: released binary absent"
  fi

  # --- ee: managed block + a byte-identical .ee-backup ---------------------
  EE="$EXT/ee-0.15.2/ee"
  if [ -x "$EE" ]; then
    mkdir -p "$WORK/d/ee/cwd"; seed_root "$WORK/d/ee/cwd"
    cp "$WORK/d/ee/cwd/AGENTS.md" "$WORK/d/ee/agents.before"
    # Absolute paths inside the shell: PATH is derived from the command name,
    # and this case's command is `sh`, not `ee`.
    ext_run ee sh -c "\"$EE\" init --workspace . --force >/dev/null 2>&1; \"$EE\" export agentsmd --workspace . --file AGENTS.md --create --no-color"
    check "D/ee export agentsmd exits 0 after init" "$(rc_of ee)" "0"
    if has "$WORK/d/ee/cwd/AGENTS.md" '<!-- ee:agentsmd:begin generation='; then
      ok "D/ee emits its generation/hash marker"
    else
      no "D/ee marker changed; update decisions/0006"
    fi
    if cmp -s "$WORK/d/ee/cwd/AGENTS.md.ee-backup" "$WORK/d/ee/agents.before"; then
      ok "D/ee's .ee-backup is byte-identical to the pre-write file"
    else
      no "D/ee's .ee-backup is missing or differs from the pre-write file"
    fi
  else
    note_gap "D/ee: released binary absent"
  fi

  # --- sbh: rewrites only an existing marked region ------------------------
  SBH="$EXT/sbh-0.6.2/sbh"
  if [ -x "$SBH" ]; then
    mkdir -p "$WORK/d/sbh/cwd"; seed_root "$WORK/d/sbh/cwd"
    printf '\n<!-- sbh-docs:begin commands -->\nstale\n<!-- sbh-docs:end -->\n' >> "$WORK/d/sbh/cwd/AGENTS.md"
    cp "$WORK/d/sbh/cwd/AGENTS.md" "$WORK/d/sbh/agents.before"
    ext_run sbh "$SBH" docs --render AGENTS.md --no-color
    check "D/sbh docs --render exits 0" "$(rc_of sbh)" "0"
    if has "$WORK/d/sbh/cwd/AGENTS.md" '<!-- sbh-docs:begin commands -->'; then
      ok "D/sbh keeps the marked region in place"
    else
      no "D/sbh lost its own region marker"
    fi
    if cmp -s "$WORK/d/sbh/cwd/AGENTS.md" "$WORK/d/sbh/agents.before"; then
      no "D/sbh --render changed nothing; the region rewrite is no longer exercised"
    else
      ok "D/sbh actually rewrote the region (stale content replaced)"
    fi
  else
    note_gap "D/sbh: released binary absent"
  fi

  # --- ft: only a SOURCE build can reach the writer ------------------------
  # Upstream publishes exactly one linux/amd64 asset (v0.15.1) and it is built
  # with the `agent-detection` cargo feature OFF, so `robot agents configure`
  # answers robot.feature_not_available: the root-file writer exists in the
  # source and is unreachable in every artifact upstream ships. The assertions
  # below therefore need a source build, supplied through APG_FT_SOURCE_BIN, and
  # the results are source-code evidence, not released-binary evidence.
  FTSRC="${APG_FT_SOURCE_BIN:-}"
  FT="$EXT/ft-0.15.1/ft"
  if [ -n "$FTSRC" ] && [ -x "$FTSRC" ]; then
    FTD="$WORK/d/ft"
    # `configure --agent codex` refuses a slug it does not consider detected, and
    # detection is a plain `root.exists()` probe on $HOME/.codex/sessions (or
    # $CODEX_HOME/sessions). Seeding that empty directory is what makes the
    # writer reachable at all; without it ft exits with robot.invalid_args.
    mkdir -p "$FTD/cwd" "$FTD/home" "$FTD/tmp" "$FTD/home/.codex/sessions"; seed_depths "$FTD/cwd"
    # Snapshot with `/` flattened: a per-depth directory tree would collide with
    # its own parent (`seed/a` as a file vs `seed/a` as a directory), silently
    # leaving later depths unsnapshotted and every comparison against them wrong.
    for x in a a/b a/b/c a/b/c/d; do
      cp "$FTD/cwd/$x/AGENTS.md" "$FTD/seed-$(printf '%s' "$x" | tr / -)"
    done
    cp "$FTD/cwd/AGENTS.md" "$FTD/agents.before"
    ft_run() { # <tag> <args...>  in $FTD/cwd, HOME redirected, network wrapped if $NET
      local tag="$1"; shift
      ( cd "$FTD/cwd" && HOME="$FTD/home" TMPDIR="$FTD/tmp" \
        $NET timeout 180 "$FTSRC" "$@" ) >"$FTD/$tag.log" 2>&1
    }
    note_warn "D/ft: asserting against a SOURCE build ($("$FTSRC" --version 2>/dev/null | head -1)), not a released artifact"
    ft_run append robot agents configure --agent codex
    check "D/ft configure --agent codex exits 0" "$?" "0"
    if has "$FTD/append.log" '"action": "append"'; then
      ok "D/ft reports action=append on a root file with no FrankenTerm region"
    else
      no "D/ft did not report action=append; its plan model changed"
    fi
    before_n="$(wc -c < "$FTD/agents.before")"
    after_n="$(wc -c < "$FTD/cwd/AGENTS.md" 2>/dev/null || echo 0)"
    ft_wrote=0
    if [ "$after_n" -gt "$before_n" ] && cmp -s -n "$before_n" "$FTD/agents.before" "$FTD/cwd/AGENTS.md"; then
      ft_wrote=1
      ok "D/ft is a pure append: all $before_n pre-existing bytes survive as an exact prefix"
    else
      no "D/ft did not preserve the pre-existing bytes as a prefix (before=$before_n, after=$after_n)"
    fi
    ft_off="$(grep -bo 'frankenterm:start' "$FTD/cwd/AGENTS.md" | head -1 | cut -d: -f1)"
    apg_off="$(grep -bo 'agent-project-guides:v2:end' "$FTD/cwd/AGENTS.md" | head -1 | cut -d: -f1)"
    if [ -n "$ft_off" ] && [ -n "$apg_off" ] && [ "$ft_off" -gt "$apg_off" ]; then
      ok "D/ft's region lands below APG's (APG ends at byte $apg_off, ft starts at $ft_off)"
    else
      no "D/ft's region does not land below APG's (APG end='$apg_off', ft start='$ft_off')"
    fi
    # The next three assertions are all "the file did NOT change" claims. Each one
    # is trivially true if ft wrote nothing at all, so each is gated on $ft_wrote:
    # a binary that silently does nothing must not read as three quiet successes.
    drifted=0
    for x in a a/b a/b/c a/b/c/d; do
      cmp -s "$FTD/cwd/$x/AGENTS.md" "$FTD/seed-$(printf '%s' "$x" | tr / -)" || drifted=$((drifted + 1))
    done
    if [ "$ft_wrote" -ne 1 ]; then
      no "D/ft recursion probe is vacuous: the first configure never wrote the root file"
    elif [ ! -f "$FTD/seed-a" ] || [ ! -f "$FTD/seed-a-b-c-d" ]; then
      no "D/ft recursion probe is vacuous: its snapshots were not written"
    else
      check "D/ft default scope rewrites only ./AGENTS.md, not the 4 identical copies below it" "$drifted" "0"
    fi
    cp "$FTD/cwd/AGENTS.md" "$FTD/agents.after1"
    ft_run again robot agents configure --agent codex
    if [ "$ft_wrote" -ne 1 ]; then
      no "D/ft idempotence probe is vacuous: there was no first write to repeat"
    elif cmp -s "$FTD/agents.after1" "$FTD/cwd/AGENTS.md"; then
      ok "D/ft is idempotent: a second configure in the same project is byte-identical"
    else
      no "D/ft's second configure changed the root file again"
    fi
    check "D/ft leaves exactly one frankenterm:start region after two runs" \
          "$(grep -c 'frankenterm:start' "$FTD/cwd/AGENTS.md")" "1"
    arts="$(find "$FTD/cwd" -maxdepth 1 -name '.ft-agent-config-*' | wc -l)"
    if [ "$arts" -ge 4 ]; then
      ok "D/ft leaves $arts transaction artifacts in the project root (APG must ignore them)"
    else
      note_gap "D/ft left only $arts transaction artifacts; its claim/ack protocol may have changed"
    fi
    if [ -e "$FTD/cwd/.ft-atomic-transition.lock" ] || [ -d "$FTD/cwd/.ft" ]; then
      note_warn "D/ft also leaves .ft/ (crash, diag, logs) and an empty .ft-atomic-transition.lock in the project root"
    fi
    # Replace-in-place: the path that matters for APG, whose region sits beside it.
    FTR="$WORK/d/ft-replace"
    mkdir -p "$FTR/cwd" "$FTR/home" "$FTR/tmp" "$FTR/home/.codex/sessions"; seed_root "$FTR/cwd"
    printf '\n<!-- frankenterm:start -->\nSTALE FRANKENTERN SECTION\n<!-- frankenterm:end -->\n' >> "$FTR/cwd/AGENTS.md"
    cp "$FTR/cwd/AGENTS.md" "$FTR/agents.before"
    ( cd "$FTR/cwd" && HOME="$FTR/home" TMPDIR="$FTR/tmp" \
      $NET timeout 180 "$FTSRC" robot agents configure --agent codex ) >"$FTR/replace.log" 2>&1
    check "D/ft configure over a pre-existing stale region exits 0" "$?" "0"
    if has "$FTR/replace.log" '"action": "replace"'; then
      ok "D/ft reports action=replace when its own region already exists"
    else
      no "D/ft did not report action=replace; the in-place path changed"
    fi
    if has "$FTR/cwd/AGENTS.md" 'STALE FRANKENTERN SECTION'; then
      replaced=0
      no "D/ft left the stale region text in place"
    else
      replaced=1
      ok "D/ft replaced the stale region text in place"
    fi
    # Guard against the vacuous version of this comparison: two absent or
    # region-less files both hash to the empty string and would "pass", and a
    # rewrite that never happened leaves the region identical for free.
    apg_before="$(sed -n '/agent-project-guides:v2:start/,/agent-project-guides:v2:end/p' "$FTR/agents.before")"
    apg_after="$(sed -n '/agent-project-guides:v2:start/,/agent-project-guides:v2:end/p' "$FTR/cwd/AGENTS.md")"
    if [ -z "$apg_before" ]; then
      no "D/ft replace probe seeded no APG region, so the rewrite comparison is vacuous"
    elif [ "$replaced" -ne 1 ]; then
      no "D/ft's region-identity check is vacuous: no in-place rewrite happened to compare"
    else
      check "D/ft's in-place rewrite leaves APG's region byte-identical" \
            "$(printf '%s' "$apg_after" | sha256sum | cut -d' ' -f1)" \
            "$(printf '%s' "$apg_before" | sha256sum | cut -d' ' -f1)"
    fi
  elif [ -x "$FT" ]; then
    mkdir -p "$WORK/d/ft/cwd"; seed_root "$WORK/d/ft/cwd"
    cp "$WORK/d/ft/cwd/AGENTS.md" "$WORK/d/ft/agents.before"
    ext_run ft "$FT" robot agents configure --workspace .
    if has "$WORK/d/ft/stdout" 'robot.feature_not_available'; then
      note_gap "D/ft: released v0.15.1 reports feature_not_available, so its AGENTS.md writer is unreachable in the shipped artifact"
    elif cmp -s "$WORK/d/ft/cwd/AGENTS.md" "$WORK/d/ft/agents.before"; then
      note_gap "D/ft: released binary neither wrote nor reported a feature gap"
    else
      ok "D/ft released binary did write agent config"
    fi
  else
    note_gap "D/ft: no source build (set APG_FT_SOURCE_BIN) and no released binary staged"
  fi
fi

# ---------------------------------------------------------------------------
printf '\n== writers result: %s passed, %s failed, %s gaps ==\n' "$pass" "$fail" "$gap"
printf '   section D isolation: %s\n' "$ISO"
printf '   work directory: %s (delete by name when the evidence is no longer needed)\n' "$WORK"
[ "$fail" -eq 0 ] || exit 1
exit 0

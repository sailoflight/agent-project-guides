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
#   APG_INTEROP_WORK     default .agent-scratch/external-test/writers

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
printf '\n== writers result: %s passed, %s failed, %s gaps ==\n' "$pass" "$fail" "$gap"
printf '   work directory: %s (delete by name when the evidence is no longer needed)\n' "$WORK"
[ "$fail" -eq 0 ] || exit 1
exit 0

#!/usr/bin/env bash
# P5 interop test for ADR 0006 (decisions/0006-root-instruction-block-ownership.md).
#
# Question: do APG's managed prefix and a third party's marker-delimited block
# coexist without either losing bytes, gaining duplicates, or being relocated?
#
# Uses a real `br` binary and APG's own scripts/manage-root-blocks.mjs, composing
# the root file exactly the way install.sh's rebuild_root_prefix() does.
#
# The br binary is NOT shipped with APG (third-party, NOASSERTION licence), so
# this test SKIPS when it is absent. Provide one via APG_BR_BIN, or download the
# release asset into the default path. br v0.6.0 is the verified baseline.
#
# SAFETY: br locates AGENTS.md by walking up to the nearest project root (.git,
# .beads, _beads) and then searching up to it. A scratch directory nested inside
# a repo is therefore NOT its own project to br, and running br there edits the
# OUTER repo's AGENTS.md. This test gives its target its own .git and refuses to
# continue unless br's own --check reports a path inside the work directory.

set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BR="${APG_BR_BIN:-$ROOT/.agent-scratch/external-test/bin/br-0.6.0/br}"
WORK="${APG_INTEROP_WORK:-$ROOT/.agent-scratch/external-test/p5}"
HELPER="$ROOT/scripts/manage-root-blocks.mjs"

ROUTING_START='<!-- agent-project-guides:routing:start -->'
ROUTING_END='<!-- agent-project-guides:routing:end -->'
TRIGGER_START='<!-- agent-project-guides:adapter-trigger:start -->'
TRIGGER_END='<!-- agent-project-guides:adapter-trigger:end -->'
BR_START_PREFIX='<!-- br-agent-instructions-v'
BR_END='<!-- end-br-agent-instructions -->'

if [ ! -x "$BR" ]; then
  printf 'SKIP: no br binary at %s\n' "$BR"
  printf '      set APG_BR_BIN, or fetch br v0.6.0 (br-0.6.0-linux_amd64.tar.gz)\n'
  printf '      from https://github.com/Dicklesworthstone/beads_rust/releases\n'
  exit 0
fi

pass=0; fail=0; gap=0
ok()  { printf '  PASS  %s\n' "$1"; pass=$((pass+1)); }
no()  { printf '  FAIL  %s\n' "$1"; fail=$((fail+1)); }
note_gap(){ printf '  GAP   %s\n' "$1"; gap=$((gap+1)); }
check(){ if [ "$2" = "$3" ]; then ok "$1 ($2)"; else no "$1 (got '$2', want '$3')"; fi; }

rm -rf "$WORK"; mkdir -p "$WORK/target"
cd "$WORK/target" || exit 2
git init -q .

echo "== 0. br discovery boundary =="
check_out="$( "$BR" agents --check 2>&1 )"
reported="$( printf '%s\n' "$check_out" | sed -n 's/^Found: .* at \(.*\)$/\1/p' )"
[ -n "$reported" ] || reported="$( printf '%s\n' "$check_out" | sed -n 's/^No AGENTS\.md or CLAUDE\.md found in \(.*\)\.$/\1/p' )"
case "$reported" in
  "$WORK/target"|"$WORK/target/AGENTS.md") ok "br bounds its search at the local .git" ;;
  *) echo "  ABORT: br reported '$reported', outside $WORK/target"; exit 3 ;;
esac

"$BR" agents --add -f >/dev/null 2>&1
[ -f AGENTS.md ] || { echo "  ABORT: br did not create a local AGENTS.md"; exit 3; }
cp AGENTS.md "$WORK/br-only.md"
awk -v s="$BR_START_PREFIX" -v e="$BR_END" 'index($0,s)==1{f=1} f{print} f&&index($0,e)==1{exit}' \
  AGENTS.md > "$WORK/br-blurb.txt"
printf '  info  br blurb captured: %s bytes, %s lines\n' \
  "$(wc -c < "$WORK/br-blurb.txt" | tr -d ' ')" "$(wc -l < "$WORK/br-blurb.txt" | tr -d ' ')"
check "br blurb ends with its end marker" "$(tail -1 "$WORK/br-blurb.txt")" "$BR_END"

# The routing block APG installs is stamped on the way in (P9, install.sh
# render_routing_block), so compose from a stamped copy to model a real install.
INTEGRITY_PREFIX='<!-- agent-project-guides:integrity sha256='
if node "$HELPER" stamp "$ROOT/bootstrap/AGENTS.routing-block.md" "$WORK/routing-stamped.md" \
     "$ROUTING_START" "$ROUTING_END"; then
  ok "installer-shaped routing block stamped"
else
  no "could not stamp the routing block"
fi
check "stamped block carries exactly one integrity line" \
  "$(grep -cF "$INTEGRITY_PREFIX" "$WORK/routing-stamped.md")" "1"
check "start marker is still the first line" "$(head -1 "$WORK/routing-stamped.md")" "$ROUTING_START"

compose() {
  local in="$1" out="$2" unmanaged tmp
  unmanaged="$(mktemp)"; tmp="$(mktemp)"
  node "$HELPER" strip "$in" "$unmanaged" \
    "$ROUTING_START" "$ROUTING_END" "$TRIGGER_START" "$TRIGGER_END" || return 1
  cat "$WORK/routing-stamped.md"                  >  "$tmp"
  cat "$ROOT/bootstrap/AGENTS.adapter-trigger.md" >> "$tmp"
  cat "$unmanaged" >> "$tmp"
  cp "$tmp" "$out"; rm -f "$unmanaged" "$tmp"
}

extract_br() {
  awk -v s="$BR_START_PREFIX" -v e="$BR_END" 'index($0,s)==1{f=1} f{print} f&&index($0,e)==1{exit}' "$1"
}

lineno() { grep -nF "$1" "$2" | head -1 | cut -d: -f1; }

# ---------------------------------------------------------------- Case A
# APG installed first, then br appends. The realistic order.
echo
echo "== A. APG prefix first, br appended after =="
cat "$WORK/routing-stamped.md" \
    "$ROOT/bootstrap/AGENTS.adapter-trigger.md" \
    "$WORK/br-blurb.txt" > "$WORK/caseA-in.md"
compose "$WORK/caseA-in.md" "$WORK/caseA-out.md" || no "compose A"
check "A: APG routing block still at byte 0" "$(head -1 "$WORK/caseA-out.md")" "$ROUTING_START"
check "A: exactly one br block"          "$(grep -cF "$BR_START_PREFIX" "$WORK/caseA-out.md")" "1"
check "A: exactly one APG routing start" "$(grep -cF "$ROUTING_START" "$WORK/caseA-out.md")" "1"
check "A: exactly one APG routing end"   "$(grep -cF "$ROUTING_END" "$WORK/caseA-out.md")" "1"
check "A: exactly one trigger pair start" "$(grep -cF "$TRIGGER_START" "$WORK/caseA-out.md")" "1"
if extract_br "$WORK/caseA-out.md" | cmp -s - "$WORK/br-blurb.txt"; then
  ok "A: br region byte-identical"
else
  no "A: br region was altered"
fi
if [ "$(lineno "$BR_START_PREFIX" "$WORK/caseA-out.md")" -gt "$(lineno "$ROUTING_END" "$WORK/caseA-out.md")" ]; then
  ok "A: br region stayed after the APG regions"
else
  no "A: br region moved above the APG regions"
fi

# ---------------------------------------------------------------- Case B
# A third party wrote above APG's prefix before APG ever ran.
echo
echo "== B. third-party block ABOVE the APG prefix =="
cat "$WORK/br-blurb.txt" \
    "$WORK/routing-stamped.md" \
    "$ROOT/bootstrap/AGENTS.adapter-trigger.md" > "$WORK/caseB-in.md"
compose "$WORK/caseB-in.md" "$WORK/caseB-out.md" || no "compose B"
check "B: APG routing block at byte 0 after merge" "$(head -1 "$WORK/caseB-out.md")" "$ROUTING_START"
check "B: no duplicated br block"     "$(grep -cF "$BR_START_PREFIX" "$WORK/caseB-out.md")" "1"
if extract_br "$WORK/caseB-out.md" | cmp -s - "$WORK/br-blurb.txt"; then
  ok "B: br bytes preserved"
else
  no "B: br bytes were altered"
fi
b_in_br="$(lineno "$BR_START_PREFIX" "$WORK/caseB-in.md")"
b_out_br="$(lineno "$BR_START_PREFIX" "$WORK/caseB-out.md")"
b_out_routing_end="$(lineno "$ROUTING_END" "$WORK/caseB-out.md")"
printf '  info  input: br at line %s; output: br at line %s (APG routing ends line %s)\n' \
  "$b_in_br" "$b_out_br" "$b_out_routing_end"
if [ "$b_out_br" -gt "$b_out_routing_end" ]; then
  note_gap "P3: content that sat ABOVE the prefix was silently relocated BELOW it"
else
  ok "B: position preserved (P3 holds)"
fi

# ---------------------------------------------------------------- idempotence
echo
echo "== C. idempotence =="
compose "$WORK/caseA-out.md" "$WORK/caseA-out2.md" || no "compose A2"
if cmp -s "$WORK/caseA-out.md" "$WORK/caseA-out2.md"; then
  ok "C: composing twice is byte-identical"
else
  no "C: composing twice changed the file"
fi

# ---------------------------------------------------------------- P9
echo
echo "== D. hand-edited APG block: is it detected? =="
sed 's/^Package adaptation:.*/Package adaptation: HAND EDITED BY A HUMAN/' \
  "$WORK/caseA-out.md" > "$WORK/caseD-in.md"
grep -qF 'HAND EDITED BY A HUMAN' "$WORK/caseD-in.md" \
  || no "D: probe did not land inside the routing block (test setup)"
if node "$HELPER" replace "$WORK/caseD-in.md" "$WORK/caseD-out.md" \
     "$ROUTING_START" "$ROUTING_END" "$WORK/routing-stamped.md" 2>"$WORK/caseD.err"; then
  no "D: replace overwrote a hand-edited managed block (P9 regression)"
elif grep -qF 'integrity mismatch' "$WORK/caseD.err"; then
  ok "D: replace refused a hand-edited managed block"
else
  no "D: replace failed for an unexpected reason: $(head -1 "$WORK/caseD.err")"
fi
if AGENT_PROJECT_GUIDES_FORCE_MANAGED_BLOCK=1 node "$HELPER" replace "$WORK/caseD-in.md" "$WORK/caseD-out.md" \
     "$ROUTING_START" "$ROUTING_END" "$WORK/routing-stamped.md" 2>/dev/null; then
  ok "D: the documented override still lets the owner replace it"
else
  no "D: the override did not allow the replace"
fi

echo
printf '== P5 result: %s passed, %s failed, %s open gaps ==\n' "$pass" "$fail" "$gap"
[ "$fail" -eq 0 ]

#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)
TMP=$(mktemp -d "${TMPDIR:-/tmp}/agent-project-guides-test.XXXXXX")
trap 'rm -rf "$TMP"' EXIT HUP INT TERM

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}

assert_contains() {
  file=$1
  text=$2
  grep -Fq -- "$text" "$file" || fail "$file does not contain: $text"
}

copy_package() {
  destination=$1
  mkdir -p "$destination"
  cp -R "$ROOT/bootstrap" "$ROOT/scripts" "$ROOT/profiles" "$ROOT/templates" "$destination/"
  cp "$ROOT/README.md" "$ROOT/DEVELOPER_AGENT_GUIDE.md" "$ROOT/MAINTAINER_AGENT_GUIDE.md" "$destination/"
}

"$ROOT/scripts/install.sh" --help >/dev/null

# Existing instructions are preserved byte-for-byte through install and restore.
PROJECT_ONE="$TMP/existing project"
PACKAGE_ONE="$PROJECT_ONE/tools/agent project guides"
mkdir -p "$PROJECT_ONE/.git" "$PROJECT_ONE/tools"
copy_package "$PACKAGE_ONE"
printf '# Existing instructions\n\n- Preserve this rule.\n' > "$PROJECT_ONE/AGENTS.md"
cp "$PROJECT_ONE/AGENTS.md" "$TMP/original-agents.md"

"$PACKAGE_ONE/scripts/install.sh" handoff
[ -f "$PROJECT_ONE/AGENTS_origin.md" ] || fail 'original instructions were not preserved'
cmp "$PROJECT_ONE/AGENTS_origin.md" "$TMP/original-agents.md" || fail 'preserved instructions changed'
assert_contains "$PROJECT_ONE/AGENTS.md" '<!-- agent-project-guides:handoff:start -->'
assert_contains "$PROJECT_ONE/AGENTS.md" '<!-- agent-project-guides:origin-mirror:start -->'
assert_contains "$PROJECT_ONE/AGENTS.md" '- Preserve this rule.'
assert_contains "$PROJECT_ONE/AGENTS.md" 'tools/agent project guides/'
handoff_line=$(grep -nF '<!-- agent-project-guides:handoff:start -->' "$PROJECT_ONE/AGENTS.md" | cut -d: -f1)
mirror_line=$(grep -nF '<!-- agent-project-guides:origin-mirror:start -->' "$PROJECT_ONE/AGENTS.md" | cut -d: -f1)
[ "$handoff_line" -lt "$mirror_line" ] || fail 'handoff instructions do not precede the original mirror'
"$PACKAGE_ONE/scripts/install.sh" check
if "$PACKAGE_ONE/scripts/install.sh" handoff >/dev/null 2>&1; then
  fail 'duplicate handoff unexpectedly succeeded'
fi
"$PACKAGE_ONE/scripts/install.sh" restore
cmp "$PROJECT_ONE/AGENTS.md" "$TMP/original-agents.md" || fail 'restore did not reproduce original instructions'
[ ! -e "$PROJECT_ONE/AGENTS_origin.md" ] || fail 'origin backup remained after restore'

# A dangling origin backup also blocks installation instead of being overwritten.
ln -s missing-origin "$PROJECT_ONE/AGENTS_origin.md"
if "$PACKAGE_ONE/scripts/install.sh" handoff >/dev/null 2>&1; then
  fail 'handoff overwrote a dangling origin backup'
fi
cmp "$PROJECT_ONE/AGENTS.md" "$TMP/original-agents.md" || fail 'failed handoff changed original instructions'
rm "$PROJECT_ONE/AGENTS_origin.md"

# A project without instructions gets a temporary entry that can be removed cleanly.
PROJECT_TWO="$TMP/new-project"
PACKAGE_TWO="$PROJECT_TWO/agent-project-guides"
mkdir -p "$PROJECT_TWO/.git"
copy_package "$PACKAGE_TWO"
"$PACKAGE_TWO/scripts/install.sh" handoff
[ ! -e "$PROJECT_TWO/AGENTS_origin.md" ] || fail 'unexpected origin backup for new project'
"$PACKAGE_TWO/scripts/install.sh" restore
[ ! -e "$PROJECT_TWO/AGENTS.md" ] || fail 'temporary entry remained after restore'

# A regular-file symlink is preserved as a symlink through handoff and restore.
PROJECT_THREE="$TMP/symlink-project"
PACKAGE_THREE="$PROJECT_THREE/agent-project-guides"
mkdir -p "$PROJECT_THREE/.git"
copy_package "$PACKAGE_THREE"
printf '# Shared instructions\n' > "$PROJECT_THREE/shared-agents.md"
ln -s shared-agents.md "$PROJECT_THREE/AGENTS.md"
"$PACKAGE_THREE/scripts/install.sh" handoff >/dev/null
[ -L "$PROJECT_THREE/AGENTS_origin.md" ] || fail 'original AGENTS.md symlink was not preserved'
assert_contains "$PROJECT_THREE/AGENTS.md" '# Shared instructions'
"$PACKAGE_THREE/scripts/install.sh" restore >/dev/null
[ -L "$PROJECT_THREE/AGENTS.md" ] || fail 'AGENTS.md symlink was not restored'
[ "$(readlink "$PROJECT_THREE/AGENTS.md")" = 'shared-agents.md' ] || fail 'restored symlink target changed'

# Other auto-loaded root candidates make automatic handoff ambiguous and are refused.
PROJECT_FOUR="$TMP/sibling-project"
PACKAGE_FOUR="$PROJECT_FOUR/agent-project-guides"
mkdir -p "$PROJECT_FOUR"
printf 'gitdir: elsewhere\n' > "$PROJECT_FOUR/.git"
copy_package "$PACKAGE_FOUR"
printf '# Existing instructions\n' > "$PROJECT_FOUR/AGENTS.md"
for candidate in CLAUDE.md AGENTS.local.md CLAUDE.local.md; do
  printf '# Sibling instructions\n' > "$PROJECT_FOUR/$candidate"
  if "$PACKAGE_FOUR/scripts/install.sh" handoff >/dev/null 2>&1; then
    fail "handoff ignored sibling candidate $candidate"
  fi
  [ ! -e "$PROJECT_FOUR/AGENTS_origin.md" ] || fail 'failed sibling check created an origin backup'
  rm "$PROJECT_FOUR/$candidate"
done

# A handoff that cannot leave shared budget headroom refuses with the original intact.
PROJECT_FIVE="$TMP/large-project"
PACKAGE_FIVE="$PROJECT_FIVE/agent-project-guides"
mkdir -p "$PROJECT_FIVE/.git"
copy_package "$PACKAGE_FIVE"
dd if=/dev/zero bs=15000 count=1 2>/dev/null | tr '\000' x > "$PROJECT_FIVE/AGENTS.md"
if "$PACKAGE_FIVE/scripts/install.sh" handoff >/dev/null 2>&1; then
  fail 'oversized temporary handoff unexpectedly succeeded'
fi
[ "$(wc -c < "$PROJECT_FIVE/AGENTS.md" | tr -d '[:space:]')" -eq 15000 ] || fail 'size refusal changed original instructions'
[ ! -e "$PROJECT_FIVE/AGENTS_origin.md" ] || fail 'size refusal created an origin backup'

# Invalid UTF-8 is rejected before any root instruction file is moved.
PROJECT_SIX="$TMP/invalid-utf8-project"
PACKAGE_SIX="$PROJECT_SIX/agent-project-guides"
mkdir -p "$PROJECT_SIX/.git"
copy_package "$PACKAGE_SIX"
printf '\377' > "$PROJECT_SIX/AGENTS.md"
if "$PACKAGE_SIX/scripts/install.sh" handoff >/dev/null 2>&1; then
  fail 'invalid UTF-8 handoff unexpectedly succeeded'
fi
[ -f "$PROJECT_SIX/AGENTS.md" ] || fail 'UTF-8 refusal moved original instructions'
[ ! -e "$PROJECT_SIX/AGENTS_origin.md" ] || fail 'UTF-8 refusal created an origin backup'

# Legacy temporary manual prompts cannot be nested into a handoff.
printf '\n<!-- agent-project-guides:manual-merge:start -->\n' >> "$PROJECT_ONE/AGENTS.md"
if "$PACKAGE_ONE/scripts/install.sh" handoff >/dev/null 2>&1; then
  fail 'handoff nested itself inside a legacy manual-merge block'
fi

printf 'PASS: handoff safety, restore, candidate refusal, encoding, and budget cap\n'

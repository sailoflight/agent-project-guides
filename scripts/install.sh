#!/bin/sh
set -eu

START_MARKER='<!-- agent-project-guides:handoff:start -->'
END_MARKER='<!-- agent-project-guides:handoff:end -->'
MANUAL_START_MARKER='<!-- agent-project-guides:manual-merge:start -->'
MANUAL_END_MARKER='<!-- agent-project-guides:manual-merge:end -->'
ORIGIN_MIRROR_START='<!-- agent-project-guides:origin-mirror:start -->'
ORIGIN_MIRROR_END='<!-- agent-project-guides:origin-mirror:end -->'
ORIGIN_NAME='AGENTS_origin.md'
MAX_HANDOFF_BYTES=16384

fail() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Usage: scripts/install.sh <command> [--target DIR]

Commands:
  handoff       Save root AGENTS.md as AGENTS_origin.md and install the temporary handoff entry.
  restore       Restore AGENTS_origin.md while the temporary handoff entry is still present.
  check         Verify that the temporary handoff entry is installed correctly.
  check-manual  Verify a rendered manual-merge block in root AGENTS.md.
  render-manual Render the manual-merge block with the package-relative path substituted.

When --target is omitted, the script walks upward from the package parent to the nearest .git marker.
EOF
}

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
PACKAGE_DIR=$(dirname -- "$SCRIPT_DIR")
COMMAND=${1:-}
[ -n "$COMMAND" ] || {
  usage
  exit 2
}
shift

TARGET=''
while [ "$#" -gt 0 ]; do
  case "$1" in
    --target)
      [ "$#" -ge 2 ] || fail '--target requires a directory'
      TARGET=$2
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "unknown argument: $1"
      ;;
  esac
done

find_target_root() {
  current=$(dirname -- "$PACKAGE_DIR")
  while :; do
    if [ -e "$current/.git" ]; then
      printf '%s\n' "$current"
      return 0
    fi
    parent=$(dirname -- "$current")
    [ "$parent" != "$current" ] || return 1
    current=$parent
  done
}

if [ -n "$TARGET" ]; then
  [ -d "$TARGET" ] || fail "target directory does not exist: $TARGET"
  TARGET=$(CDPATH= cd -- "$TARGET" && pwd -P)
else
  TARGET=$(find_target_root) || fail 'no target project root found; pass --target DIR'
fi

case "$PACKAGE_DIR" in
  "$TARGET"/*) GUIDES_PATH=${PACKAGE_DIR#"$TARGET"/} ;;
  *) fail 'the package must be located inside the target project' ;;
esac

HANDOFF_TEMPLATE="$PACKAGE_DIR/bootstrap/AGENTS.handoff.md"
MANUAL_TEMPLATE="$PACKAGE_DIR/bootstrap/AGENTS.merge-block.md"
AGENTS_FILE="$TARGET/AGENTS.md"
ORIGIN_FILE="$TARGET/$ORIGIN_NAME"

[ -f "$HANDOFF_TEMPLATE" ] || fail "missing template: $HANDOFF_TEMPLATE"
[ -f "$MANUAL_TEMPLATE" ] || fail "missing template: $MANUAL_TEMPLATE"

render_template() {
  template=$1
  escaped=$(printf '%s' "$GUIDES_PATH" | sed 's/[\\&|]/\\&/g')
  sed "s|{{GUIDES_PATH}}|$escaped|g" "$template"
}

install_handoff() {
  if [ -e "$ORIGIN_FILE" ] || [ -L "$ORIGIN_FILE" ]; then
    fail "$ORIGIN_NAME already exists; finish or restore the previous handoff"
  fi
  if [ -f "$AGENTS_FILE" ] && grep -Fq "$START_MARKER" "$AGENTS_FILE"; then
    fail 'temporary handoff is already installed'
  fi
  if [ -f "$AGENTS_FILE" ] && grep -Fq "$MANUAL_START_MARKER" "$AGENTS_FILE"; then
    fail 'manual-merge bootstrap is already installed; finish or remove it before handoff'
  fi
  for sibling_name in CLAUDE.md AGENTS.local.md CLAUDE.local.md; do
    sibling="$TARGET/$sibling_name"
    if [ -e "$sibling" ] || [ -L "$sibling" ]; then
      fail "$sibling_name is another auto-loaded root candidate; use render-manual and reconcile candidates explicitly"
    fi
  done

  has_original=0
  if [ -e "$AGENTS_FILE" ] || [ -L "$AGENTS_FILE" ]; then
    [ -f "$AGENTS_FILE" ] || fail 'root AGENTS.md exists but is not a regular file or regular-file symlink'
    has_original=1
  fi

  tmp=$(mktemp "$TARGET/.AGENTS.md.handoff.XXXXXX")
  moved_original=0
  cleanup_install() {
    status=$?
    trap - EXIT HUP INT TERM
    rm -f "$tmp"
    if [ "$moved_original" -eq 1 ] && [ ! -e "$AGENTS_FILE" ] && [ ! -L "$AGENTS_FILE" ] && { [ -e "$ORIGIN_FILE" ] || [ -L "$ORIGIN_FILE" ]; }; then
      mv -- "$ORIGIN_FILE" "$AGENTS_FILE"
    fi
    exit "$status"
  }
  trap cleanup_install EXIT HUP INT TERM

  render_template "$HANDOFF_TEMPLATE" > "$tmp"
  if [ "$has_original" -eq 1 ]; then
    printf '\n%s\n## Preserved original instructions (temporary mirror)\n\n' "$ORIGIN_MIRROR_START" >> "$tmp"
    cat -- "$AGENTS_FILE" >> "$tmp"
    printf '\n%s\n' "$ORIGIN_MIRROR_END" >> "$tmp"
  fi

  command -v iconv >/dev/null 2>&1 || fail 'iconv is required to validate UTF-8 instruction files'
  iconv -f UTF-8 -t UTF-8 "$tmp" >/dev/null 2>&1 || fail 'temporary root AGENTS.md is not valid UTF-8'
  handoff_bytes=$(wc -c < "$tmp" | tr -d '[:space:]')
  [ "$handoff_bytes" -le "$MAX_HANDOFF_BYTES" ] || fail "temporary root AGENTS.md would exceed $MAX_HANDOFF_BYTES bytes; use render-manual instead"
  chmod 0644 "$tmp"

  if [ "$has_original" -eq 1 ]; then
    mv -- "$AGENTS_FILE" "$ORIGIN_FILE"
    moved_original=1
  fi

  if ! mv -- "$tmp" "$AGENTS_FILE"; then
    if [ "$moved_original" -eq 1 ]; then
      mv -- "$ORIGIN_FILE" "$AGENTS_FILE"
    fi
    fail 'failed to install temporary root AGENTS.md'
  fi
  trap - EXIT HUP INT TERM

  printf 'Installed temporary handoff: %s\n' "$AGENTS_FILE"
  if [ "$moved_original" -eq 1 ]; then
    printf 'Preserved original instructions: %s\n' "$ORIGIN_FILE"
    printf 'Mirrored original instructions in the temporary root entry.\n'
  fi
  printf 'Package path recorded as: %s/\n' "$GUIDES_PATH"
}

restore_handoff() {
  [ -f "$AGENTS_FILE" ] || fail 'root AGENTS.md does not exist'
  grep -Fq "$START_MARKER" "$AGENTS_FILE" || fail 'root AGENTS.md is no longer the temporary handoff; refusing to overwrite merged instructions'
  grep -Fq "$END_MARKER" "$AGENTS_FILE" || fail 'temporary handoff end marker is missing; refusing destructive restore'

  if [ -e "$ORIGIN_FILE" ] || [ -L "$ORIGIN_FILE" ]; then
    mv -f -- "$ORIGIN_FILE" "$AGENTS_FILE"
    printf 'Restored original instructions: %s\n' "$AGENTS_FILE"
  else
    rm -- "$AGENTS_FILE"
    printf 'Removed temporary handoff; no original AGENTS.md existed.\n'
  fi
}

check_handoff() {
  [ -f "$AGENTS_FILE" ] || fail 'root AGENTS.md does not exist'
  [ "$(grep -Fc "$START_MARKER" "$AGENTS_FILE")" -eq 1 ] || fail 'handoff start marker must appear exactly once'
  [ "$(grep -Fc "$END_MARKER" "$AGENTS_FILE")" -eq 1 ] || fail 'handoff end marker must appear exactly once'
  grep -Fq "Governance package: \`$GUIDES_PATH/\`" "$AGENTS_FILE" || fail 'root AGENTS.md points to a different package path'
  iconv -f UTF-8 -t UTF-8 "$AGENTS_FILE" >/dev/null 2>&1 || fail 'root AGENTS.md is not valid UTF-8'
  handoff_bytes=$(wc -c < "$AGENTS_FILE" | tr -d '[:space:]')
  [ "$handoff_bytes" -le "$MAX_HANDOFF_BYTES" ] || fail "root AGENTS.md exceeds the $MAX_HANDOFF_BYTES-byte handoff cap"
  for sibling_name in CLAUDE.md AGENTS.local.md CLAUDE.local.md; do
    sibling="$TARGET/$sibling_name"
    if [ -e "$sibling" ] || [ -L "$sibling" ]; then
      fail "$sibling_name appeared after handoff and may override or duplicate root instructions"
    fi
  done
  if [ -e "$ORIGIN_FILE" ] || [ -L "$ORIGIN_FILE" ]; then
    grep -Fq "$ORIGIN_MIRROR_START" "$AGENTS_FILE" || fail 'original instructions exist only in the non-loaded backup; mirror start marker is missing'
    grep -Fq "$ORIGIN_MIRROR_END" "$AGENTS_FILE" || fail 'original instruction mirror end marker is missing'
  elif grep -Fq "$ORIGIN_MIRROR_START" "$AGENTS_FILE"; then
    fail 'temporary root contains an original mirror but AGENTS_origin.md is missing'
  fi
  printf 'Handoff entry is valid: %s\n' "$AGENTS_FILE"
}

check_manual() {
  [ -f "$AGENTS_FILE" ] || fail 'root AGENTS.md does not exist'
  [ "$(grep -Fc "$MANUAL_START_MARKER" "$AGENTS_FILE")" -eq 1 ] || fail 'manual-merge start marker must appear exactly once'
  [ "$(grep -Fc "$MANUAL_END_MARKER" "$AGENTS_FILE")" -eq 1 ] || fail 'manual-merge end marker must appear exactly once'
  grep -Fq "$GUIDES_PATH/DEVELOPER_AGENT_GUIDE.md" "$AGENTS_FILE" || fail 'manual-merge block points to a different package path'
  grep -Fq "$GUIDES_PATH/MAINTAINER_AGENT_GUIDE.md" "$AGENTS_FILE" || fail 'manual-merge block is incomplete'
  printf 'Manual-merge block is valid: %s\n' "$AGENTS_FILE"
}

case "$COMMAND" in
  handoff) install_handoff ;;
  restore) restore_handoff ;;
  check) check_handoff ;;
  check-manual) check_manual ;;
  render-manual) render_template "$MANUAL_TEMPLATE" ;;
  -h|--help|help) usage ;;
  *) usage >&2; fail "unknown command: $COMMAND" ;;
esac

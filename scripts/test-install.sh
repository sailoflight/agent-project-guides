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

assert_not_contains() {
  file=$1
  text=$2
  if grep -Fq -- "$text" "$file"; then
    fail "$file unexpectedly contains: $text"
  fi
}

copy_package() {
  destination=$1
  mkdir -p "$destination"
  cp -R "$ROOT/bootstrap" "$ROOT/routing" "$ROOT/scripts" "$ROOT/profiles" "$ROOT/templates" "$ROOT/roles" "$ROOT/procedures" "$destination/"
  cp "$ROOT/PACKAGE_VERSION" "$destination/"
}

assert_original_prefix() {
  original=$1
  merged=$2
  bytes=$(wc -c < "$original" | tr -d '[:space:]')
  dd if="$merged" bs=1 count="$bytes" 2>/dev/null | cmp - "$original" >/dev/null || fail 'original AGENTS.md prefix changed'
}

"$ROOT/scripts/install.sh" --help >/dev/null
node "$ROOT/scripts/validate-routing.mjs" >/dev/null
for obsolete in \
  DEVELOPER_AGENT_GUIDE.md MAINTAINER_AGENT_GUIDE.md REVIEWER_AGENT_GUIDE.md \
  FIELD_EVALUATOR_AGENT_GUIDE.md USER_AGENT_GUIDE.md OPERATOR_AGENT_GUIDE.md \
  PACKAGE_ADAPTATION_PROCEDURE.md routing/PRODUCTION_ROLES.md routing/DEVELOPMENT_ROLES.md \
  templates/CORE_DOCUMENT_TEMPLATES.md
do
  [ ! -e "$ROOT/$obsolete" ] || fail "obsolete preload-prone path remains: $obsolete"
done
[ "$(wc -c < "$ROOT/bootstrap/AGENTS.routing-block.md" | tr -d '[:space:]')" -le 1600 ] || fail 'per-step routing block exceeded token-oriented byte budget'
[ "$(wc -c < "$ROOT/bootstrap/AGENTS.adapter-trigger.md" | tr -d '[:space:]')" -le 1600 ] || fail 'temporary trigger exceeded token-oriented byte budget'
routing_bytes=$(wc -c < "$ROOT/routing/planes.jsonl")
routing_bytes=$((routing_bytes + $(wc -c < "$ROOT/routing/production.roles.jsonl") + $(wc -c < "$ROOT/routing/development.roles.jsonl")))
[ "$routing_bytes" -le 2200 ] || fail 'JSONL registries exceeded token-oriented byte budget'
[ "$(wc -c < "$ROOT/roles/development/DEVELOPER.md" | tr -d '[:space:]')" -le 4000 ] || fail 'Developer guide regained initializer duplication'
[ "$(wc -c < "$ROOT/procedures/PACKAGE_ADAPTATION.md" | tr -d '[:space:]')" -le 7000 ] || fail 'adaptation procedure exceeded compact budget'
if grep -Eq '(^|[[:space:]])(dsh|claude|codex)([[:space:]]|$)' "$ROOT/scripts/install.sh"; then
  fail 'installer appears to invoke an LLM runner'
fi

# Scheme 1 appends only permanent routing and preserves the original byte prefix.
PROJECT_ONE="$TMP/scheme one"
PACKAGE_ONE="$PROJECT_ONE/tools/agent project guides"
mkdir -p "$PROJECT_ONE/.git" "$PROJECT_ONE/tools"
copy_package "$PACKAGE_ONE"
printf '# Original project rules\n\n- Preserve this exact rule.\n' > "$PROJECT_ONE/AGENTS.md"
cp "$PROJECT_ONE/AGENTS.md" "$TMP/original-one.md"

"$PACKAGE_ONE/scripts/install.sh" merge
assert_original_prefix "$TMP/original-one.md" "$PROJECT_ONE/AGENTS.md"
assert_contains "$PROJECT_ONE/AGENTS.md" '<!-- agent-project-guides:routing:start -->'
assert_contains "$PROJECT_ONE/AGENTS.md" 'status=pending; package_revision=1.1.0; verified_at=never; scope=repo; reason=not_adapted'
assert_not_contains "$PROJECT_ONE/AGENTS.md" '<!-- agent-project-guides:adapter-trigger:start -->'
[ ! -e "$PROJECT_ONE/AGENTS_origin.md" ] || fail 'scheme 1 renamed or backed up original AGENTS.md'
"$PACKAGE_ONE/scripts/install.sh" check
before=$(sha256sum "$PROJECT_ONE/AGENTS.md" | cut -d' ' -f1)
"$PACKAGE_ONE/scripts/install.sh" merge >/dev/null
after=$(sha256sum "$PROJECT_ONE/AGENTS.md" | cut -d' ' -f1)
[ "$before" = "$after" ] || fail 'scheme 1 merge is not idempotent'

# Scheme 2 appends routing then one temporary trigger; it never renames the root file.
PROJECT_TWO="$TMP/scheme-two"
PACKAGE_TWO="$PROJECT_TWO/agent-project-guides"
mkdir -p "$PROJECT_TWO/.git"
copy_package "$PACKAGE_TWO"
printf '# Existing safety rules\n\n- Production writes require approval.\n' > "$PROJECT_TWO/AGENTS.md"
cp "$PROJECT_TWO/AGENTS.md" "$TMP/original-two.md"

"$PACKAGE_TWO/scripts/install.sh" trigger
assert_original_prefix "$TMP/original-two.md" "$PROJECT_TWO/AGENTS.md"
[ ! -e "$PROJECT_TWO/AGENTS_origin.md" ] || fail 'scheme 2 renamed original AGENTS.md'
routing_line=$(grep -nF '<!-- agent-project-guides:routing:start -->' "$PROJECT_TWO/AGENTS.md" | cut -d: -f1)
trigger_line=$(grep -nF '<!-- agent-project-guides:adapter-trigger:start -->' "$PROJECT_TWO/AGENTS.md" | cut -d: -f1)
[ "$routing_line" -lt "$trigger_line" ] || fail 'temporary trigger does not follow permanent routing'
"$PACKAGE_TWO/scripts/install.sh" check
before=$(sha256sum "$PROJECT_TWO/AGENTS.md" | cut -d' ' -f1)
"$PACKAGE_TWO/scripts/install.sh" trigger >/dev/null
after=$(sha256sum "$PROJECT_TWO/AGENTS.md" | cut -d' ' -f1)
[ "$before" = "$after" ] || fail 'scheme 2 trigger is not idempotent'
if "$PACKAGE_TWO/scripts/install.sh" remove-trigger >/dev/null 2>&1; then
  fail 'pending trigger was removed before adaptation completed'
fi
before=$(sha256sum "$PROJECT_TWO/AGENTS.md" | cut -d' ' -f1)
if "$PACKAGE_TWO/scripts/install.sh" set-state --status adapted --verified-at never --scope repo --reason none >/dev/null 2>&1; then
  fail 'adapted state accepted an invalid timestamp'
fi
if "$PACKAGE_TWO/scripts/install.sh" set-state --status adapted --verified-at 2026-0x-24T12:00:00Z --scope repo --reason none >/dev/null 2>&1; then
  fail 'state accepted a non-digit timestamp'
fi
if "$PACKAGE_TWO/scripts/install.sh" set-state --status blocked --verified-at never --scope repo --reason 'secret;detail' >/dev/null 2>&1; then
  fail 'state accepted a non-compact reason'
fi
after=$(sha256sum "$PROJECT_TWO/AGENTS.md" | cut -d' ' -f1)
[ "$before" = "$after" ] || fail 'invalid state arguments changed root instructions'

# A partial result requires verified scope/time and a reason; blocked runs require explicit retry.
"$PACKAGE_TWO/scripts/install.sh" set-state --status partial --verified-at 2026-08-24T11:30:00Z --scope docs/api --reason remaining_modules >/dev/null
"$PACKAGE_TWO/scripts/install.sh" check
assert_contains "$PROJECT_TWO/AGENTS.md" 'status=partial; package_revision=1.1.0; verified_at=2026-08-24T11:30:00Z; scope=docs/api; reason=remaining_modules'
"$PACKAGE_TWO/scripts/install.sh" set-state --status blocked --verified-at never --scope repo --reason missing_owner_decision
assert_contains "$PROJECT_TWO/AGENTS.md" 'status=blocked; package_revision=1.1.0; verified_at=never; scope=repo; reason=missing_owner_decision'
"$PACKAGE_TWO/scripts/install.sh" check
"$PACKAGE_TWO/scripts/install.sh" trigger >/dev/null
assert_contains "$PROJECT_TWO/AGENTS.md" 'status=pending; package_revision=1.1.0; verified_at=never; scope=repo; reason=retry_requested'

# Crash recovery: adapted state may coexist briefly with the trigger, then cleanup removes only the trigger.
"$PACKAGE_TWO/scripts/install.sh" set-state --status adapted --verified-at 2026-08-24T12:00:00Z --scope repo --reason none
"$PACKAGE_TWO/scripts/install.sh" check
before=$(sha256sum "$PROJECT_TWO/AGENTS.md" | cut -d' ' -f1)
"$PACKAGE_TWO/scripts/install.sh" trigger >/dev/null
after=$(sha256sum "$PROJECT_TWO/AGENTS.md" | cut -d' ' -f1)
[ "$before" = "$after" ] || fail 'adapted crash recovery repeated or changed adaptation'
"$PACKAGE_TWO/scripts/install.sh" remove-trigger
assert_not_contains "$PROJECT_TWO/AGENTS.md" '<!-- agent-project-guides:adapter-trigger:start -->'
[ "$(tail -n 1 "$PROJECT_TWO/AGENTS.md")" = '<!-- agent-project-guides:routing:end -->' ] || fail 'trigger removal left trailing blank lines'
assert_contains "$PROJECT_TWO/AGENTS.md" '<!-- agent-project-guides:routing:start -->'
assert_original_prefix "$TMP/original-two.md" "$PROJECT_TWO/AGENTS.md"
"$PACKAGE_TWO/scripts/install.sh" check

# Explicit later trigger marks an adapted project stale for re-adaptation.
"$PACKAGE_TWO/scripts/install.sh" trigger >/dev/null
assert_contains "$PROJECT_TWO/AGENTS.md" 'status=stale; package_revision=1.1.0; verified_at=2026-08-24T12:00:00Z; scope=repo; reason=explicit_readaptation'
"$PACKAGE_TWO/scripts/install.sh" set-state --status adapted --verified-at 2026-08-24T13:00:00Z --scope repo --reason none >/dev/null
"$PACKAGE_TWO/scripts/install.sh" remove-trigger >/dev/null
[ "$(tail -n 1 "$PROJECT_TWO/AGENTS.md")" = '<!-- agent-project-guides:routing:end -->' ] || fail 'repeated trigger cycle accumulated trailing blank lines'
"$PACKAGE_TWO/scripts/install.sh" unmerge
assert_not_contains "$PROJECT_TWO/AGENTS.md" '<!-- agent-project-guides:routing:start -->'
assert_original_prefix "$TMP/original-two.md" "$PROJECT_TWO/AGENTS.md"

# Other auto-loaded root candidates are refused rather than creating ambiguous precedence.
PROJECT_THREE="$TMP/sibling-project"
PACKAGE_THREE="$PROJECT_THREE/agent-project-guides"
mkdir -p "$PROJECT_THREE"
printf 'gitdir: elsewhere\n' > "$PROJECT_THREE/.git"
copy_package "$PACKAGE_THREE"
if "$PACKAGE_THREE/scripts/install.sh" check 2> "$TMP/missing-root.err"; then
  fail 'check accepted a missing root AGENTS.md'
fi
assert_contains "$TMP/missing-root.err" 'root AGENTS.md does not exist'
for candidate in CLAUDE.md AGENTS.local.md CLAUDE.local.md; do
  printf '# Sibling instructions\n' > "$PROJECT_THREE/$candidate"
  if "$PACKAGE_THREE/scripts/install.sh" merge >/dev/null 2>&1; then
    fail "merge ignored sibling candidate $candidate"
  fi
  [ ! -e "$PROJECT_THREE/AGENTS.md" ] || fail 'failed sibling check created AGENTS.md'
  rm "$PROJECT_THREE/$candidate"
done

# Legacy root-replacement handoff markers require explicit old-version recovery.
printf '# Legacy\n<!-- agent-project-guides:handoff:start -->\n' > "$PROJECT_THREE/AGENTS.md"
cp "$PROJECT_THREE/AGENTS.md" "$TMP/legacy-root.md"
if "$PACKAGE_THREE/scripts/install.sh" merge >/dev/null 2>&1; then
  fail 'append-only merge accepted a legacy root-replacement handoff'
fi
cmp "$PROJECT_THREE/AGENTS.md" "$TMP/legacy-root.md" >/dev/null || fail 'legacy refusal changed root instructions'
rm "$PROJECT_THREE/AGENTS.md"

# Root symlinks are refused so append-only merge cannot change their semantics.
printf '# Shared instructions\n' > "$PROJECT_THREE/shared-agents.md"
ln -s shared-agents.md "$PROJECT_THREE/AGENTS.md"
if "$PACKAGE_THREE/scripts/install.sh" merge >/dev/null 2>&1; then
  fail 'merge replaced or followed a root AGENTS.md symlink'
fi
[ -L "$PROJECT_THREE/AGENTS.md" ] || fail 'failed symlink check changed root AGENTS.md'
rm "$PROJECT_THREE/AGENTS.md"

# Invalid UTF-8 and oversized roots fail before the original file is replaced.
printf '\377' > "$PROJECT_THREE/AGENTS.md"
if "$PACKAGE_THREE/scripts/install.sh" merge >/dev/null 2>&1; then
  fail 'invalid UTF-8 merge unexpectedly succeeded'
fi
[ "$(wc -c < "$PROJECT_THREE/AGENTS.md" | tr -d '[:space:]')" -eq 1 ] || fail 'UTF-8 refusal changed original instructions'
rm "$PROJECT_THREE/AGENTS.md"
dd if=/dev/zero bs=16000 count=1 2>/dev/null | tr '\000' x > "$PROJECT_THREE/AGENTS.md"
if "$PACKAGE_THREE/scripts/install.sh" merge >/dev/null 2>&1; then
  fail 'oversized root merge unexpectedly succeeded'
fi
[ "$(wc -c < "$PROJECT_THREE/AGENTS.md" | tr -d '[:space:]')" -eq 16000 ] || fail 'size refusal changed original instructions'

# Updating the package revision marks an existing adaptation stale without adding a trigger.
PROJECT_FOUR="$TMP/version-project"
PACKAGE_FOUR="$PROJECT_FOUR/agent-project-guides"
mkdir -p "$PROJECT_FOUR/.git"
copy_package "$PACKAGE_FOUR"
"$PACKAGE_FOUR/scripts/install.sh" merge >/dev/null
"$PACKAGE_FOUR/scripts/install.sh" set-state --status adapted --verified-at 2026-08-24T14:00:00Z --scope repo --reason none >/dev/null
printf '1.2.0\n' > "$PACKAGE_FOUR/PACKAGE_VERSION"
"$PACKAGE_FOUR/scripts/install.sh" merge >/dev/null
assert_contains "$PROJECT_FOUR/AGENTS.md" 'status=stale; package_revision=1.2.0; verified_at=2026-08-24T14:00:00Z; scope=repo; reason=package_revision_changed'
assert_not_contains "$PROJECT_FOUR/AGENTS.md" '<!-- agent-project-guides:adapter-trigger:start -->'
"$PACKAGE_FOUR/scripts/install.sh" check
"$PACKAGE_FOUR/scripts/install.sh" trigger >/dev/null
assert_contains "$PROJECT_FOUR/AGENTS.md" 'Trigger revision: 1.2.0'
assert_contains "$PROJECT_FOUR/AGENTS.md" 'status=stale; package_revision=1.2.0'
[ "$(grep -Fc '<!-- agent-project-guides:adapter-trigger:start -->' "$PROJECT_FOUR/AGENTS.md")" -eq 1 ] || fail 'version refresh duplicated the trigger'
"$PACKAGE_FOUR/scripts/install.sh" check

# Invalid JSONL or unresolved registry paths fail before root instructions change.
PROJECT_FIVE="$TMP/jsonl-project"
PACKAGE_FIVE="$PROJECT_FIVE/agent-project-guides"
mkdir -p "$PROJECT_FIVE/.git"
copy_package "$PACKAGE_FIVE"
printf '{invalid-json}\n' >> "$PACKAGE_FIVE/routing/planes.jsonl"
if "$PACKAGE_FIVE/scripts/install.sh" merge >/dev/null 2>&1; then
  fail 'installer accepted invalid routing JSONL'
fi
[ ! -e "$PROJECT_FIVE/AGENTS.md" ] || fail 'invalid JSONL failure created root instructions'

printf 'PASS: append-only schemes, JSONL routing, token budgets, state lifecycle, and safety guards\n'

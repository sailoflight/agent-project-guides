#!/bin/sh
# Configure this clone's git filters. See .gitattributes for what they do.
#
# Git has no repo-level config file that travels with a clone, so a filter is
# always a per-clone opt-in. Running this is what removes the `lastAccessedAt`
# churn for THIS working copy; not running it leaves the previous behaviour
# (a dirty .mnemon/documents/index.json after most sessions) with no breakage.
#
# The command embeds this clone's absolute path, so re-run this script if the
# checkout moves. To undo:  git config --unset filter.apg-mnemon-index.clean
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

git -C "$ROOT" config filter.apg-mnemon-index.clean "node $ROOT/scripts/git-filter-mnemon-index.mjs"

printf '%s\n' "configured filter.apg-mnemon-index.clean -> node $ROOT/scripts/git-filter-mnemon-index.mjs"
printf '%s\n' "verify with: git -C $ROOT status --short .mnemon"

# Release checklist

Author-side only: this file is not in `DIST_FILES`, so editing it never changes a
release digest. The rule behind every line: **a consumer only sees pushed refs.** A
gate that passes in a working tree nobody pushed has not passed for anyone.

1. Bump `PACKAGE_VERSION`; sync the descriptor's release (`provider.release` on
   schema 1, `release.version` on schema 2); `project reattest --target .`.
2. Normalize file modes from the git index (`100755` → `0755`, else `0644`). A branch
   switch rewrites files under the current umask, so a umask-002 shell silently turns
   them into `0o664`; `release manifest` refuses to publish those, and `verify-source`
   reports the drift.
3. `catalog build`, then `release manifest`.
4. `./scripts/test-release.sh`, `release verify-source`, `check-release-lines`.
5. **Push, then repeat step 4 against the pushed ref.** Re-run it from a fresh clone or
   `git ls-remote` checkout, not from the tree that produced the manifest. Local green
   does not count: on 2026-10-25 a fix passed every local gate and the consumer
   reproduced the old behaviour, because origin still pointed at the previous commit.
6. Fast-forward the line branch, tag the merged commit, push the tag.
7. Verify the tag is the manifest tree: `git show <tag>:PACKAGE_MANIFEST.json` must
   report the digest and file count you published. This is the one check a consumer
   can repeat without trusting anyone.
8. Never move a published tag, and never rebuild a published version. New content is a
   new version.

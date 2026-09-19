# Synthetic pilot source: `synthetic-cli`

Self-contained source tree for the release pilot gates described in
`plans/DEVELOPMENT_ROADMAP.md` P2 item 2 and P5a. It replaces the coverage that
`fixtures/pilots/small-cli.json` lost when its external source drifted.

## Why this exists

`fixtures/pilots/small-cli.json` and `fixtures/pilots/complex-content-package.json`
are **frozen** definitions measured against the 1.4.3 external baseline. Their
sources live outside this package and have moved on:

- `cc-teamwatch`'s root entry was migrated from the 1.4.3 routing block to the v3
  block, so the frozen `package_revision=1.4.3` precondition can no longer hold.
- `MSP/Core` belongs to the `MSP` worktree and never had a root entry at all.

Re-recording either source as a new baseline is forbidden
(`plans/DEVELOPMENT_ROADMAP.md` P5a: drift must be analysed, never auto-recorded
as a passing baseline). Instead those two definitions stay untouched and are
reported as unavailable, and this synthetic tree carries the same gate
definitions so the gate still runs with no external checkout.

## What is here

| Path | Role |
|---|---|
| `legacy-root-entry.md` | The 1.4.3-era root entry, materialised as `AGENTS.md` in the pilot's temporary project copy. |
| `src/main.js` | Inert content so the project has a plausible small-CLI shape. |

`legacy-root-entry.md` is **not** named `AGENTS.md` on purpose: this package is
itself a git worktree, and a nested live `AGENTS.md` would be picked up as
instructions by host agents reading this repository.

The root entry is the `bootstrap/AGENTS.routing-block.md` template of the frozen
1.4.3 package (a sibling checkout of this package pinned at `PACKAGE_VERSION=1.4.3`,
42 files, tracked by the `cc-teamwatch` worktree) with the five placeholders
substituted:

```text
{{ADAPTATION_STATUS}} -> adapted
{{PACKAGE_REVISION}}  -> 1.4.3
{{VERIFIED_AT}}       -> 2026-08-25
{{ADAPTATION_SCOPE}}  -> full
{{ADAPTATION_REASON}} -> initial-adaptation
```

Only `{{GUIDES_PATH}}` is intentionally left unsubstituted: the installer path is
resolved per environment at adaptation time and the pilot never reads it.

## Fixture integrity

`fixtures/pilots/synthetic-cli.json` reuses the `baseline` block of
`small-cli.json` verbatim — same `maximum_route_tokens`,
`legacy_route_token_threshold`, `token_estimate_method` and `required_exact_ids`
— because route composition depends on plane/role/mode/facets/overlays and the
task text, not on project content. Nothing here re-records a threshold.

If `legacy-root-entry.md` ever stops carrying `package_revision=1.4.3`, the pilot
fails hard rather than skipping: that marker describes this repository's own
fixture, not an external source that may legitimately drift.

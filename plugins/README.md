# Harness Plugin Repositories

APG core is harness-neutral. Harness-specific integrations are independently versioned plugin repositories placed directly under this directory for local development convenience.

| Directory | Kind | Current state |
| --- | --- | --- |
| `dsh-apg/` | Independent DSH plugin Git repository | Design scaffold only; no executable plugin, dependency installation or deployment |

Future supported harnesses may have their own `<harness>-apg/` repositories after their lifecycle and tool-enforcement capabilities are investigated. Directory presence is not a support claim.

## Ownership

- APG owns descriptors, exact routing/content/hash semantics, CLI compatibility and a future portable integration contract.
- Each plugin owns host API bindings, trusted loading, context placement, host-side readiness state, clarification UI, tool dispatch hooks, child/resume behavior, dependency lockfile and host compatibility tests.
- A plugin may depend on a supported APG protocol/runtime; APG must not import the plugin or its host SDK.
- Host hooks do not replace OS sandboxing or grant operation authority.

## Git and release boundary

The APG parent ignores `/plugins/*/`, but keeps this index. Each child owns a real `.git/` directory. These are plain nested repositories, NOT Git submodules; no `.gitmodules` or parent gitlink is used.

A parent clone does not recreate plugin code. Each plugin will need its own reviewed commit, remote, version/release, license and backup policy before distribution. No remote or package name is reserved by this scaffold; do not imply publication. Never force-add a plugin directory to the parent repository.

Run Git commands with an explicit working directory:

```sh
git -C plugins/dsh-apg status --short
git -C plugins/dsh-apg rev-parse --show-toplevel
```

APG's runtime distribution whitelist (`lib/core.mjs`) excludes `plugins/`; plugin files, `.git`, dependencies and build outputs must remain absent from its catalog and release manifest. A future change to packaging must retain this boundary.

Before plugin implementation, review [the R6 design calibration](../plans/R6_DESIGN_REVIEW.md). Current DSH global installation is a read-only compatibility reference, not a development target.

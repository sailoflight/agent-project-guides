<!-- agent-project-guides:manual-merge:start -->
## Agent governance bootstrap

This temporary block is in the repository-root `AGENTS.md`, so compatible harnesses load it before the first request. Existing project-specific instructions in this file remain applicable. All package paths below are relative to the session's project root (the nearest ancestor `.git` selected by the harness); when the current working directory is deeper, resolve it with `git rev-parse --show-toplevel` before reading package files.

Before changing project files:

1. Classify the request as ordinary project work, new-project initialization, or existing-project governance.
2. For existing-project governance, read `{{GUIDES_PATH}}/MAINTAINER_AGENT_GUIDE.md` before editing.
3. For a new/empty project or missing project-specific route, read sections 0-8 of `{{GUIDES_PATH}}/DEVELOPER_AGENT_GUIDE.md` before editing.
4. Read only one role guide, only matching `{{GUIDES_PATH}}/profiles/*.md`, and only exact template sections needed for files being written.
5. For ordinary work when a verified project-specific route, architecture boundary, and verification entry already exist, follow the project instructions without loading the governance package. Do not modify this block as an unrelated side effect.
6. During an initialization or governance task, remove this entire bootstrap block after producing and re-reading a verified project-specific route that no longer depends on this package.

Do not treat the root README as an agent instruction entry. Do not start product changes while a required role guide from steps 2-3 remains unread.
<!-- agent-project-guides:manual-merge:end -->

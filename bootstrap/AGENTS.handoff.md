# Repository agent instructions

<!-- agent-project-guides:handoff:start -->
## Mandatory first-run handoff

This temporary file is the repository-root `AGENTS.md`; compatible harnesses load it before the first request. Complete this handoff before planning, editing project files, or answering a substantive repository question.

Paths below are relative to the session's project root (the nearest ancestor `.git` selected by the harness). If the current working directory is deeper, resolve it with `git rev-parse --show-toplevel` instead of treating paths as cwd-relative.

Paths:

- Governance package: `{{GUIDES_PATH}}/`
- Preserved original instructions: `AGENTS_origin.md` (optional exact backup; when present, its content is also mirrored in this temporary root file so project constraints remain active)

Required sequence:

1. If `AGENTS_origin.md` exists, read it first. Its instructions are mirrored in this temporary root entry and remain active throughout the handoff; preserve every project-specific constraint that is still applicable. Do not edit or delete the exact backup.
2. Inspect only low-cost project evidence needed to decide whether this is a new/empty project or an existing project and to identify its project profile.
3. For a new/empty project, read sections 0-8 of `{{GUIDES_PATH}}/DEVELOPER_AGENT_GUIDE.md`. For an existing project, read `{{GUIDES_PATH}}/MAINTAINER_AGENT_GUIDE.md`. Read exactly one role guide.
4. Read only the matching file or files under `{{GUIDES_PATH}}/profiles/`. Read only the exact sections of `{{GUIDES_PATH}}/templates/CORE_DOCUMENT_TEMPLATES.md` needed for files being created or changed.
5. Create the final project-specific root `AGENTS.md`. Merge applicable original constraints with verified project evidence and the package's minimal routing rules. Do not copy the governance guides, full API/tool lists, usage manuals, operations manuals, roadmap, or dynamic generated facts into the final file.
6. If `AGENTS_origin.md` exists, compare the final instructions against it. Resolve conflicts using current implementation and tests as evidence, preserve stricter safety constraints, and mark unresolved project facts `unknown` instead of guessing.
7. Replace this entire temporary file with the final project-specific `AGENTS.md`, so no handoff or `origin-mirror` marker remains. Keep `AGENTS_origin.md` unchanged as a rollback artifact and report its path for human review; automated handoff must not delete the only exact backup.
8. Read the final root `AGENTS.md` again, then continue the user's original task under the merged instructions.

Completion gate:

- Do not change product code before steps 1-7 are complete.
- Do not report the handoff complete while any `handoff` or `origin-mirror` marker remains in root `AGENTS.md`.
- Never overwrite, edit, or delete `AGENTS_origin.md` during automated handoff.
- If safe merging is impossible, leave both files intact and report the concrete conflict.
<!-- agent-project-guides:handoff:end -->

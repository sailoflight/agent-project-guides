<!-- agent-project-guides:adapter-trigger:start -->
## Required package adaptation

This trigger overrides ordinary routing and selects Development adaptation. Trigger revision: {{PACKAGE_REVISION}}.

0. Compare managed state with `{{GUIDES_PATH}}/PACKAGE_VERSION`. On mismatch run `{{GUIDES_PATH}}/scripts/install.sh trigger --target <project-root>` and re-read this block. If already `adapted`, run `remove-trigger` and continue the original task; if `partial`, resume only its unverified scope/reason.
1. From low-cost evidence choose one mode: new/effectively empty -> Developer/`initialize`; existing -> Maintainer/`readapt`. If unclear, use the root routing's structured question tool and wait before role guides.
2. Search that role in `{{GUIDES_PATH}}/routing/development.roles.jsonl`; read only its `guide`, selected `procedure_by_mode`, matching profiles, and exact template files.
3. Apply the procedure without replacing, renaming, or weakening existing root instructions.
4. After full verification run `set-state --status adapted --verified-at <UTC> --scope <scope> --reason none`, then `remove-trigger`. Re-read root `{{ROOT_INSTRUCTIONS}}` and route the original task again.

If unsafe to complete, record `blocked` with `verified_at=never`, attempted scope, and a non-secret reason code. Keep this trigger; use the structured question tool for retry/narrow/skip/remove and never loop without an answer.
<!-- agent-project-guides:adapter-trigger:end -->

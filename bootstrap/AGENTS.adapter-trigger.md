<!-- agent-project-guides:adapter-trigger:start -->
## Required package adaptation

This one-time trigger is the strongest routing signal and selects Development/package-adaptation work before the user's substantive repository task. It does not replace or weaken any existing root instruction.

Package trigger revision: {{PACKAGE_REVISION}}

0. Read the managed `Package adaptation:` state and `{{GUIDES_PATH}}/PACKAGE_VERSION`. If their revisions differ, run `{{GUIDES_PATH}}/scripts/install.sh trigger --target <project-root>` to refresh routing/state/trigger, then re-read this block. If the state is already `status=adapted` at the current package version, do not repeat adaptation: run `remove-trigger`, re-read root `AGENTS.md`, and continue the original task. If it is `partial`, resume only the unverified scope and reason instead of restarting completed work.
1. Determine the adaptation submode from low-cost project evidence before reading a role guide:
   - new or effectively empty project -> Developer / Project Initializer;
   - existing project -> Maintainer / Package Re-adapter;
   - if this distinction is unclear, ask the user and stop before reading either role guide.
2. Read only the selected role guide plus `{{GUIDES_PATH}}/PACKAGE_ADAPTATION_PROCEDURE.md`, matching profiles, and exact template sections required by the procedure.
3. Apply the package while preserving all pre-existing root instructions and unrelated user changes. The package script never invokes an LLM and never renames the original `AGENTS.md`.
4. After full verification, run `{{GUIDES_PATH}}/scripts/install.sh set-state --target <project-root> --status adapted --verified-at <UTC-ISO-8601> --scope <verified-scope> --reason none`.
5. Then run `{{GUIDES_PATH}}/scripts/install.sh remove-trigger --target <project-root>`. Remove only this trigger; permanent routing and all original instructions remain.
6. Re-read the resulting root `AGENTS.md`, classify the user's original task again, and continue under its selected plane/role.

If adaptation cannot complete safely, run `set-state` with `status=blocked`, `verified_at=never`, the attempted scope, and a short non-secret reason code. Keep this trigger, report the blocker, and ask the user whether to retry, narrow scope, continue without adaptation, or remove the trigger manually. Do not loop into adaptation again without that answer.
<!-- agent-project-guides:adapter-trigger:end -->

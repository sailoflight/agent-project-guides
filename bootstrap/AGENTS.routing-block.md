<!-- agent-project-guides:routing:start -->
## Agent routing

Package adaptation: status={{ADAPTATION_STATUS}}; package_revision={{PACKAGE_REVISION}}; verified_at={{VERIFIED_AT}}; scope={{ADAPTATION_SCOPE}}; reason={{ADAPTATION_REASON}}

1. Trigger is active iff this injected root contains its managed block. Otherwise route now; never glob/search/read package files for one.
2. Assigned compatible role/mode: grep its exact quoted `id` or literal label in `{{GUIDES_PATH}}/routing/*.roles.jsonl`; use one record. Skip plane/full registries, role lists, re-asking and rediscovery.
3. Otherwise read only two-line `{{GUIDES_PATH}}/routing/planes.jsonl`; if unclear use the structured question tool (DSH: `ask_user_question`) and wait.
4. In that registry grep one exact role. If unclear, use the same tool and wait before its guide.
5. Blocking questions use stable IDs, 2–4 exclusive choices and one-line impacts, never prose lists; free text only if choices mislead. Ask directly only without a tool.
6. Read only the record's `guide` and mode `procedure_by_mode`; never list/glob/preload `roles/`.
7. Without a trigger, ask adapt-now vs continue when state is not `adapted`. Installer owns `pending/stale`; initialize/readapt records `partial/adapted/blocked`.
8. Roles never grant production credentials, real data, cost or destructive actions.

Subagents receive explicit plane, role/mode, scope, writable paths, environment/data permissions and deliverable; missing/conflicting authority goes to parent/captain, never the end user or self-expansion.
<!-- agent-project-guides:routing:end -->

<!-- agent-project-guides:routing:start -->
## Agent routing

Package adaptation: status={{ADAPTATION_STATUS}}; package_revision={{PACKAGE_REVISION}}; verified_at={{VERIFIED_AT}}; scope={{ADAPTATION_SCOPE}}; reason={{ADAPTATION_REASON}}

1. An `adapter-trigger` wins over ordinary routing.
2. Assigned compatible role(s): grep each exact `"id":"..."` in `{{GUIDES_PATH}}/routing/*.roles.jsonl`; never Read/cat a role registry or re-ask. Plane-only skips plane lookup.
3. Otherwise read only the two-line `{{GUIDES_PATH}}/routing/planes.jsonl`; if unclear call the structured question tool (DSH: `ask_user_question`) and wait.
4. In that plane registry grep one exact role record. If role/mode is unclear, use the same tool and wait before its guide.
5. Never just list blocking questions in prose: use stable IDs and 2–4 exclusive choices with one-line impacts; use free text only when choices mislead. Ask directly only without a question tool.
6. Read only the selected record's `guide` and mode-specific `procedure_by_mode`; never list/glob/preload `roles/`.
7. Without a trigger, use the question rule to choose adapt-now vs continue when state is not `adapted`. Installer owns `pending/stale`; initialize/readapt records `partial/adapted/blocked`.
8. Role labels never grant production credentials, real data, cost or destructive actions.

Subagents receive explicit plane, role/mode, scope, writable paths, environment/data permissions, and deliverable; missing/conflicting authority goes to parent/captain, never the end user or self-expansion.
<!-- agent-project-guides:routing:end -->

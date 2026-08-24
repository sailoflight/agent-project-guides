<!-- agent-project-guides:routing:start -->
## Agent routing

Package adaptation: status={{ADAPTATION_STATUS}}; package_revision={{PACKAGE_REVISION}}; verified_at={{VERIFIED_AT}}; scope={{ADAPTATION_SCOPE}}; reason={{ADAPTATION_REASON}}

1. An `adapter-trigger` wins over ordinary routing.
2. If user/parent assigns compatible role(s), exact-search each `id` in `{{GUIDES_PATH}}/routing/*.roles.jsonl`; do not re-ask. If only plane is assigned, skip plane lookup and search that plane registry.
3. Otherwise read only the two lines in `{{GUIDES_PATH}}/routing/planes.jsonl`. If Production vs Development is unclear, ask the user and stop before role data/guides.
4. Search only that plane's JSONL registry. If one role/mode is not clear, ask and stop before its guide.
5. Read only the selected record's `guide` and mode-specific `procedure_by_mode`. Do not list, glob, or preload `roles/`.
6. Without a trigger, report non-`adapted` state and ask whether to adapt now or continue without it. The installer owns `pending/stale`; initializer/re-adapter records `partial/adapted/blocked` via `set-state`.
7. Role labels never grant production credentials, real data, cost, or destructive actions.

Subagents receive explicit plane, role/mode, scope, writable paths, environment/data permissions, and deliverable; missing/conflicting authority is escalated to parent/captain, never self-expanded.
<!-- agent-project-guides:routing:end -->

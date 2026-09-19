# R6 Design Calibration: Portable APG and Independent Harness Plugins

Date: 2026-09-08
Status: design review and repository-boundary scaffold; runtime implementation not approved by this report.
Scope: current APG 3.0.4 dirty candidate, proposed R6, and selected upstream integration examples. This is not a re-audit or closure of all 38 historical register entries.

## 1. Verdict and user boundary

**Do not implement R6 directly from the earlier paragraph-level DSH adapter plan.** Keep the R5 fixes, but separate the next work into APG's portable provider/context contract and an independently owned DSH plugin. No generic adapter framework or executable prototype is needed before these boundaries are reviewed.

The user explicitly established:

- APG core must remain harness-neutral.
- The DSH adapter is a DSH plugin, with its own directory and Git repository under `plugins/`.
- Other supported harnesses may get their own plugins, not new host-specific branches inside APG core.
- Analyze mature GitHub examples before further implementation to avoid architectural drift.

This turn creates `plugins/dsh-apg/` as a plain nested repository and records this analysis. It does not implement an adapter, install dependencies, migrate the APG descriptor, upgrade/restart DSH, or claim R6 completion.

## 2. Findings, ordered by risk

These are static findings about using current behavior in the proposed R6 design. They are not reproduced exploits, new incident counts, or reasons to invalidate the scoped R5 verdict.

### C1 / High: The installed launcher can execute checkout-controlled code

Evidence: `scripts/apg-launcher.mjs:188-191` selects the project root for schema-1 source-worktree; `:206-209` imports its `scripts/apg.mjs`. Descriptor checks in `lib/descriptor.mjs:55-64` cannot establish trust before that import. The launcher path being installed, structured argv, a managed marker and a matching descriptor are insufficient: repository metadata is controlled by the checkout.

Trigger/risk: an automatic pre-model plugin runs the ordinary launcher on an untrusted checkout, executing its module before the proposed tool gate.

Required boundary: executable trust belongs to host-owned configuration outside the checkout. Prefer an independently selected compiler/runtime that reads project content as data; source execution needs explicit canonical-root-bound developer opt-in and a documented revocation policy. Never select a plugin or executable from `AGENTS.md` or descriptor prose. No shell string evaluation of `next_command`.

Missing test: a copied marker/descriptor plus a sentinel-writing top-level CLI is rejected before import; trusted runtime replacement, path alias/symlink and unsupported version cases fail closed. This does not solve general same-user TOCTOU or hostile process isolation; ADR-0004 remains proposed and separate.

### C2 / High: `apg context` is not universally observational

Evidence: `scripts/apg.mjs:694-695` invokes `targetRoot`; `:66-69` invokes recovery. `recoverDescriptorTransaction` at `:190-216` acquires a lock, can rewrite descriptor/receipt, and removes transaction state.

Trigger/risk: a plugin treats context as read-only bootstrap and performs recovery writes before normal operation authorization. This behavior was not induced in the current review.

Required boundary: a future automatic-route path must detect pending recovery and return a non-ready diagnostic without repairing it. Recovery remains an explicit authorized lifecycle action. Preserve existing CLI behavior unless a separately reviewed compatibility change is chosen; do not silently add recovery bypasses to legacy commands.

Missing test: each pending/ambiguous recovery state, project and APG state byte snapshots, no writable state capability, and no lock/state creation during the observational path.

### C3 / High: APG generation is not a host readiness credential

Evidence: `lib/context.mjs:333-359` signs project ID, release digest, selected-view revision, choices and expiry; `:325-330` does not bind canonical root, session, task or attempt. Ready generations at `:516` need not contain signed choices. Stable project IDs across clones are intentional. `templates/SUBAGENT_ASSIGNMENT.md` requires child-specific scope rather than inherited authority.

Trigger/risk: a plugin uses a generation or cached `ready` as a permission token across clones, revised tasks, resumed/forked children, or stale asynchronous completions. Mutable source contents cannot be identified by a constant release label. Additionally, `lib/core.mjs:108-117` can search above a nested Git root when a descriptor is required; a child plugin checkout without its own descriptor must not silently acquire the parent's project identity.

Required boundary: preserve portable APG continuation semantics. The plugin owns separate host-local readiness state bound to its exact project/agent/turn/attempt and assignment provenance, selected route and observed content. Cancellation, source changes, new human requests, reassignment and child activation need explicit invalidation/reconciliation. Route readiness AND existing host approval/sandbox policy must hold; readiness never converts denial into allowance.

Missing test: same-ID clones, nested repositories, mismatched explicit target, no-descriptor child, concurrent starts, stale completion after cancel, source edits, task changes, resume/fork, child-specific assignment, expiry and every claimed tool-dispatch path.

### C4 / Medium-High: Current observation fields are not proof of plugin injection

Evidence: `lib/context.mjs:535` uses packed content selection to set `host_observed`; `scripts/test-v3.mjs:253-258` checks this via CLI. Legacy `scripts/apg.mjs:628-655` accepts supplied source evidence and can report observation with unknown hash match. These existing meanings do not establish the proposed R6 actual-request injection claim.

Required boundary: distinguish compiler-loaded, plugin-assembled and host-request-observed content, with omission/truncation and exact hashes. A plugin receipt identifies host/plugin version, session/turn/attempt and observation point. Do not silently reinterpret the legacy `apg dsh report` API or remove it as an unrelated cleanup. Preserve `model_effective: unknown` even after host-request observation.

Missing test: CLI-only evidence cannot pass host injection; late/omitted content, wrong hashes, prior-turn receipts and missing host observation are explicit failures or unknowns.

### C5 / Medium: Schema-2 source-worktree is a separate provider project

Evidence: ADR-0003 `:18,27` explicitly limits schema 2 to two variants. `lib/descriptor-v3.mjs:25-40,96-104` assumes pinned variants; `scripts/apg.mjs:338-339` validates schema 2 through materialization. `lib/materializer.mjs:596-603` requires a materialized manifest and `:634-636` treats non-inline as packed runtime. Launcher `:175-183` also assumes packed schema-2 runtime.

Required boundary: do not add one enum value and fabricate pinned identity or materialization artifacts. Source-worktree needs its own descriptor/provider ADR, observational validation, mutable-source revisions, invalidation and rollback tests. A DSH plugin should negotiate supported APG outputs or clearly reject unsupported modes, not force schema migration on activation. Plugin feasibility can be tested against an approved existing APG mode before the new provider exists, once C1/C2 are addressed.

Missing test: read-only source view with no `.agent-guides`/store dependency, dirty provenance, changed-source continuation rejection and existing schema-1/two-variant regression coverage.

### C6 / Medium: Plugin independence requires Git, packaging and release boundaries

Evidence: `lib/core.mjs:25-27,176-201` positively allowlists runtime files and already excludes `plugins/`; putting new DSH code under `lib/` or the existing `scripts/apg.mjs:619` reporting path would instead distribute it to every APG consumer. Before this turn, the parent had no plugin ignore rule.

Boundary now established: `plugins/dsh-apg/` owns its real `.git/`; the parent ignores `/plugins/*/` and owns only the index/report. No gitlink, submodule, remote, package identifier or release is created. Parent clones do not contain plugin source; this must be stated rather than concealed. Future remotes and child commits are separate work.

Missing future test: APG operates without host packages, plugin-only changes preserve APG runtime digest, packed releases/materialized consumers exclude plugin code/dependencies, and plugin version support is tested independently. This turn checks the existing distribution list/manifest and Git boundary, not a new packed plugin release.

## 3. GitHub examples and what they actually support

Examples were selected for relevant, inspectable contracts or source, not star counts. Public reads used the web reader; no upstream repository was cloned or executed, and no code was copied into this project. Mutable references are explicitly marked. These examples are design evidence, not proof that DSH shares their API or security guarantees.

| Example and inspected source | Useful lesson | Do not infer or copy |
| --- | --- | --- |
| [Agent Skills README at 69ef37e](https://github.com/agentskills/agentskills/blob/69ef37e9424c0a7ea9dd2293b559e43ec8176379/README.md) | Portable content format, progressive disclosure, client-independent reuse. APG's exact loading and small root should remain portable. | A skills format is not a tool-authorization system. No need to replace APG governance with skills or clone the whole ecosystem. |
| [Pi permission-gate at aa23e78](https://github.com/earendil-works/pi/blob/aa23e784c647d713e775a8adcaf3c219e84f5068/packages/coding-agent/examples/extensions/permission-gate.ts) | A separately loaded extension uses `tool_call`; its dangerous-command path blocks when there is no UI. Host bindings live in the extension. | Its three command regexes are a demonstration, not a shell security parser, readiness protocol or OS sandbox. Do not port those patterns into APG. |
| [Pi project-trust at the same revision](https://github.com/earendil-works/pi/blob/aa23e784c647d713e775a8adcaf3c219e84f5068/packages/coding-agent/examples/extensions/project-trust.ts) and [examples index](https://github.com/earendil-works/pi/blob/aa23e784c647d713e775a8adcaf3c219e84f5068/packages/coding-agent/examples/extensions/README.md) | Project trust is distinct from session/tool handling; examples describe global/explicit extension installation and separate sandbox examples. | The project-trust example returns `undecided` without UI, not automatic trust or a demonstrated universal deny. Do not claim every extension is sandboxed. |
| [OpenAI Agents guardrails guide](https://openai.github.io/openai-agents-python/guardrails/) and [guardrail.py on main](https://github.com/openai/openai-agents-python/blob/main/src/agents/guardrail.py) | Blocking and parallel checks are explicitly different. Default parallel checks can lose the race to tools; blocking input checks finish before the agent. Tool guards and agent guards cover different workflow points. | Agent-level input guards cover only the initial agent, and custom function-tool guards are not every host effect. Do not infer universal delegated-agent coverage. Both links are mutable; read on 2026-09-08. |
| [goose tool-permissions guide](https://goose-docs.ai/docs/guides/managing-tools/tool-permissions/) and [repository](https://github.com/aaif-goose/goose) | Extensions expose tools; tool permissions compose with host permission modes. Keep route readiness separate from operation approval. | A guide is not source-level proof of a mandatory monotonic readiness gate. Permission modes are not APG roles. Documentation read only, mutable reference. |
| [DSH README at c389f96](https://github.com/deepseek-ai/deepseek-harness/blob/c389f96bf3a9b6807cb71ed6bdad5849be0df6d8/README.md) | Explicit everything-is-a-plugin architecture and external plugin repositories; upstream warns of compatibility-breaking changes. | Current upstream master is not installed `0.1.1-rc.2`. Do not upgrade current DSH or code against newer hooks without a compatibility target. |

Source provenance: the former `badlogic/pi-mono` link redirected to `earendil-works/pi`; the former goose documentation URL redirected to `goose-docs.ai`. The pinned Pi and DSH revisions above came from the observed GitHub pages. One search request failed and was replaced with direct upstream reading; failed search output is not evidence.

## 4. DSH-specific feasibility, kept outside the APG contract

Static installed-code investigation used Node resolution rooted at `/home/lijq/.npm-global/lib/node_modules/@deepseek-ai/dsh/package.json`, version `0.1.1-rc.2`. It did not inspect user settings/secrets/session logs or execute a deployed plugin. Paths below are under its `node_modules/@deepseek-ai/` directory.

- `dsh-agent-loop/lib/index.js:492-513,534-555,606-617`: async pre-step can prevent the model request, but system-prompt assembly precedes it. Late context registration/injection is insufficient for that already assembled step; actual request delivery needs a tested integration point.
- `dsh-tools/lib/index.js:2795-2819,3094-3137`: a monotonic `tools.guard` denies normal ToolRuntime dispatch, after pre-policy/approval. It is not a sandbox for direct Node/plugin effects. `tools.restrict` has scope exemptions and is not an equivalent gate.
- `dsh-subagent/lib/index.js:1225-1246` versus `dsh-subagent-in-process-driver/lib/index.js:160-186`: continuable setup does not cover every one-shot child creation path. Parent readiness cannot simply transfer. Remote coverage was not inspected.
- `dsh-agent-instructions/lib/index.js:1271-1279`: workspace instruction composition can occur even after downstream pre-step rejection. Therefore a plugin-only result must not claim zero repository reads before ready.

A trusted plugin can plausibly gate the standard model/tool paths with existing hooks; runtime testing is still required. Mandatory plugin loading, safe unload/HMR behavior and every receiver/process boundary need explicit host support or an unsupported capability report. Do not broaden this into a DSH-core rewrite or a new multi-host framework without a separate decision.

## 5. Calibrated ownership and implementation order

| Unit | Owns | Does not own |
| --- | --- | --- |
| APG core | Portable descriptors, selected content, routing, budgets/hashes, compatible JSON/context and continuation semantics; a minimal versioned observational interface if current one is insufficient | DSH event names, session objects, plugin discovery, GUI/approval controls, host tool name lists, model configuration |
| `plugins/dsh-apg` | DSH API bindings, trusted-runtime configuration, per-attempt state, clarification UI, model input observation, tool hooks, child/resume tests, host-version support and independent releases | A duplicate APG classifier, automatic source execution/migration, production permissions, APG release lifecycle |
| Future harness plugin | That host's actual lifecycle and capability mapping | Pretending it has DSH hooks, or requiring APG core to import a new SDK |

Recommended next work, not implemented here:

1. Approve separate APG interface/provider and DSH-plugin design records. Reuse the existing JSON context contract where valid; do not create a generic adapter SDK speculatively. Freeze meanings and compatibility before adding fields.
2. Resolve C1/C2 for automatic execution with failing negative fixtures first. Separate compiler/runtime trust from mutable content trust; add a genuinely observational route path without silently changing recovery behavior.
3. Specify the plugin state machine and host coverage: uninitialized/resolving/clarification/ready/blocked, task retention, cancellation and stale-result rejection. State labels are a proposal, not new APG statuses. Test with a fake host and the target DSH version without touching the live GUI.
4. Develop schema-2 source-worktree as independent APG work, not a dependency forcing consumers to migrate for plugin use. Do not combine it with R1-R4 cleanup or ADR-0004 hardening scope.
5. Only after local contract tests and independent review/verification, approve installation separately. Field evaluation then runs real fresh sessions, at least three trials for each supported host/provider/model/version, with negative and child/resume cases.

Release acceptance must be split: APG core regressions; plugin host conformance; and field evidence. CLI fixtures alone close neither H4 nor a host-wide pre-route access guarantee. This analysis does not add DSH to APG's dependency graph.

## 6. Current scope and verification

The R5 runtime digest remains the preservation target: `sha256:deacad2bbc59057ad72516ceeb48c52b38e74d381f9dcc390fece9c1a2fa2325`. Only planning/index files, parent ignore rules and nested-plugin scaffolding are changed in this task. No catalog/manifest regeneration is necessary for source-only files.

Executed boundary checks passed: the child resolves to its own Git root with a real `.git/` and branch `main`; it has no remote and only untracked README/ignore scaffolding. The parent's tracked index contains no child entry/gitlink and `git check-ignore` confirms exclusion. `listDistributionFiles` contains no `plugins/` path. `release verify-source` returned `valid: true` with the exact R5 digest above. Parent `git diff --check` passed. No commits or staging were performed.

A separate Reviewer checked this report and the plugin index against the six local findings and returned a bounded consistency pass, with no corrections. That pass did not independently re-verify upstream sources, installed DSH hooks or scaffold/digest execution and does not authorize runtime implementation.

Review limits: same-host peer review, static local code and upstream documentation/examples; no runtime exploit tests, installed-plugin acceptance, full fresh regression rerun or field trials. Historical `docs/INDEX.md` and `docs/verification/MATRIX.md` gaps remain; review used the existing findings register and V2/V3/ADR contracts instead. The review does not choose a license or claim the independent plugin has been committed, backed up or published.

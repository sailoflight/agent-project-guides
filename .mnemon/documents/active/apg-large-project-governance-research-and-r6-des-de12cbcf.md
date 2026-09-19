---
id: "de12cbcf-b552-4198-bf2a-5556563f7ac9"
title: "APG Large-Project Governance Research and R6 Design Boundaries"
description: "APG large-project governance comparison and R6 calibration: Kubernetes/OpenSpec/Spec Kit/Backstage/Nx lessons, existing-template gaps, independent plugin ownership, trust/recovery/lifecycle risks and source-backed limits."
status: "active"
created_at: "2026-09-08T06:24:34.662Z"
updated_at: "2026-09-08T06:24:34.662Z"
content_hash: "7cc17a9b3cd246840a0a8ef93576554bf4f63a6dd1194259a48181e2ccc629e9"
source_paths:
  - "plans/LARGE_PROJECT_GOVERNANCE_REVIEW.md"
  - "plans/R6_DESIGN_REVIEW.md"
  - "plans/REVIEW_FINDINGS.md"
  - "plugins/README.md"
  - "templates/MODULE_CONTRACT.md"
  - "templates/ARCHITECTURE_OVERVIEW.md"
  - "templates/VERIFICATION_MATRIX.md"
  - "templates/ADR.md"
  - "scripts/apg-launcher.mjs"
  - "scripts/apg.mjs"
  - "lib/context.mjs"
  - "lib/core.mjs"
session_ids:
  - "3ae7b73f-ef0a-4607-8a6e-02dee62530bc"
memory_body_ids:
  []
---

# APG governance research and R6 design calibration

## Scope and authority

Research recorded on 2026-09-08 in `plans/LARGE_PROJECT_GOVERNANCE_REVIEW.md` and `plans/R6_DESIGN_REVIEW.md`, with register links in `plans/REVIEW_FINDINGS.md` §§8.8–8.9. These are design evidence and recommendations, not implementation approval or closure of R6/H4/M9. Repository contracts remain authoritative for current behavior.

APG remains harness-neutral. DSH integration belongs to an independent plugin repository under `plugins/dsh-apg/`; other harnesses may have separate plugins. The child scaffold has its own `.git/`, branch `main`, README and ignore file, no remote or committed release. Parent ignores `/plugins/*/` and manages `plugins/README.md`; it is not a submodule or gitlink, and parent clones do not retrieve plugin code. No host SDK dependency or plugin runtime was added to APG.

## Large-project governance comparison

The researched combination is **OpenSpec change organization + Spec Kit principle/consistency checks + Kubernetes ownership and staged acceptance + Backstage component relationships + Nx executable dependency constraints**. BMAD supplies a complementary principle of sizing process to task complexity. This is selective borrowing, not a proposal to install all frameworks or build an enterprise portal.

| Reference | Useful mechanism | APG application and limits |
| --- | --- | --- |
| [Kubernetes OWNERS](https://github.com/kubernetes/community/blob/master/contributors/guide/owners.md) | Scoped ownership, reviewers versus approvers, inheritance, automation | Identify real module responsibility and affected owners. APG role names do not confer approval authority or independent identity. Reuse existing OWNERS/CODEOWNERS without assuming identical semantics. No need to adopt Prow/Tide wholesale. |
| [Kubernetes KEP template](https://github.com/kubernetes/enhancements/blob/master/keps/NNNN-kep-template/README.md) | Goals/non-goals, test plans, graduation, version skew, upgrade/rollback, production readiness | Distinguish proposed, implementable, implemented, verified and released states with candidate-bound evidence. A merged proposal or test PASS does not establish all states. Apply depth according to risk. |
| [OpenSpec concepts](https://github.com/Fission-AI/OpenSpec/blob/main/docs/concepts.md) | Current specs separate from change folders; ADDED/MODIFIED/REMOVED deltas; preserved history | Give substantial changes stable entrypoints linking intent, contracts, tasks and evidence. Keep current contracts separate from plans and ADR rationale; small fixes need minimal records. Archive is not release acceptance. Cross-repo Stores was marked beta. |
| [Spec Kit](https://github.com/github/spec-kit), [plan template](https://github.com/github/spec-kit/blob/main/templates/plan-template.md) | Constitution checks before research and after design; cross-artifact analysis; justified complexity | Link applicable principles to concrete changes and check requirements→tasks→validation coverage. Template gates are not host enforcement; avoid importing an override framework or full process for routine edits. |
| [Backstage catalog](https://backstage.io/docs/features/software-catalog/descriptor-format/) | Components, systems, lifecycle, ownership and sourced relations | Locate affected modules and relevant contracts without loading all architecture text. Reuse existing catalog/ownership sources, not duplicate authority. Owner metadata does not authorize execution; APG need not become a portal/database. |
| [Nx boundaries](https://nx.dev/docs/features/enforce-module-boundaries) | Tags and dependency constraints checked through tooling | Connect allowed/forbidden dependencies to existing executable checks. Core must not import plugins/host SDKs. Do not build a new dependency graph engine or assume cross-language Conformance is free; documentation marks it Enterprise. Lint is not runtime isolation. |
| [BMAD](https://github.com/bmad-code-org/BMAD-METHOD) | Right-sized planning and professional perspectives | Reuse APG's existing role/trigger design before adding roles or orchestration. Only README-level claims were inspected; no runtime efficacy established. |

Kubernetes provides the strongest large-scale governance practice baseline in this comparison; AI specification frameworks are functionally closer but evolving faster. Enterprise adoption counts, reliability and benefits were not independently measured. References are mostly mutable main/master or documentation pages observed that day. Official files were read directly after search quota failure; no upstream code was installed or executed.

## APG's existing foundation and practical gaps

The checkpoint directly inspected `templates/MODULE_CONTRACT.md`, `templates/ARCHITECTURE_OVERVIEW.md`, `templates/VERIFICATION_MATRIX.md` and `templates/ADR.md`. They already cover responsibilities/exclusions, dependency directions, side effects, verified/inferred/unknown statements, risk-based check selection and decision rationale. The next need is **instantiation, links and executable verification**, not more templates.

Recommended sequence, not yet implemented:

1. Instantiate APG's own document index, key module contracts and verification matrix (existing M2). Address already registered R2 failure exit-code semantics before or alongside H2 CI adoption; do not duplicate those issue IDs.
2. Trial minimal traceability for the next high-risk change: requirement/scenario → affected module and contract → real responsibility source → check → candidate and evidence → status. One file can suffice.
3. Add durable boundary assertions for core/plugin dependency direction, packaging exclusion, route/budget compatibility and recovery effects. Consume existing build/CI authorities.
4. Extend per-module ownership/relationships when actual multi-component consumers require it, using existing catalogs and ownership files.
5. Keep APG interface evolution, schema-2 source-worktree and the DSH plugin separately scoped and verified. Do not combine them with all historical cleanup.

`plans/REVIEW_FINDINGS.md` should remain an issue index, not accumulate every feature's full design and history. R5's candidate-bound report is useful, but temporary `/tmp` raw evidence is insufficient as the sole long-term release provenance.

## R6 pre-implementation risks preserved by independent static review

These are design risks of automatic integration, not dynamically reproduced exploits or new R5 failures.

- **Executable trust:** `scripts/apg-launcher.mjs:188–209` selects source-worktree checkout code and imports its CLI. Installed launcher + structured argv + checkout marker/descriptor do not establish executable trust. Host-owned configuration must select approved runtime independently; a sentinel-writing checkout CLI negative fixture must be rejected before import.
- **Unexpected writes:** `scripts/apg.mjs:694–695` calls `targetRoot`, whose recovery path (`:66–69`, `:190–216`) may rewrite descriptor/receipt and remove transaction state. Automatic preflight needs a genuinely observational path that reports recovery required; authorized recovery is separate. Preserve legacy compatibility deliberately.
- **Lifecycle state:** `lib/context.mjs:333–359` generations bind project/release/selected view/expiry, not canonical root, session, turn or attempt. Plugin readiness must be separate, invalidate stale/cancelled/changed-task/source/child state and retain host approvals. Nested Git roots must not silently inherit parent project identity through upward descriptor discovery (`lib/core.mjs:108–117`).
- **Observation semantics:** `lib/context.mjs:535` derives legacy `host_observed` from packed selection, and `scripts/apg.mjs:628–655` accepts supplied evidence with potentially unknown content match. Neither proves actual model-request injection. Distinguish compiler loading, plugin assembly and host request observation with exact hashes and omission/truncation; retain `model_effective: unknown` and legacy compatibility.
- **Provider coupling:** schema-2 validation/launcher/materializer assume pinned/materialized variants (`lib/descriptor-v3.mjs`, `lib/materializer.mjs:596–636`, `scripts/apg-launcher.mjs:175–183`). Source-worktree requires independent mutable-provenance/read-only validation design, not an enum addition or automatic migration prerequisite for plugin use.
- **Packaging:** `lib/core.mjs:25–27,176–201` already excludes `plugins/` via positive distribution allowlists. Keep new host hooks outside packed core paths; assert APG runs without host packages and plugin edits cannot affect core release identity.

Installed DSH rc.2 static evidence supports narrow standard-loop gating via async `agent/pre-step` and monotonic `tools.guard`, but assembly precedes pre-step, child paths differ, and instruction providers can read the checkout despite downstream rejection. A plugin cannot claim zero pre-ready repository access, universal process coverage or mandatory loading from these hooks alone. No live deployment or runtime acceptance was performed.

## Evidence limits and preservation

A separate Reviewer confirmed the R6 report's consistency with six local findings, not upstream source accuracy or deployed behavior. Executed local checks established child Git isolation, no parent gitlink/tracking, distribution exclusion, and valid unchanged R5 digest `sha256:deacad2bbc59057ad72516ceeb48c52b38e74d381f9dcc390fece9c1a2fa2325`. Governance report addition likewise left that runtime digest unchanged. No plugin implementation, descriptor migration, DSH modification, dependency installation or publication occurred in the research/scaffold tasks.

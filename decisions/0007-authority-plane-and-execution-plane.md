# 0007: Authority plane and execution plane — the APG product boundary

Status: accepted
Date: 2026-09-19
Scope: APG's product boundary; for any capability, whether APG implements it, adapts to it, references it externally, or rejects it
Deciders/owner: project owner with development/maintainer
Supersedes: none
Superseded by: none

## Context and evidence

ADR 0005 established that APG is a harness-neutral governance core, not a runtime. The open question this ADR closes is the *product boundary*: with a mature external agent stack available, which capabilities must APG keep, and which must it refuse to own?

Evidence is the 2026-09-19 survey in `plans/MULTI_AGENT_INFRA_INTEGRATION_RESEARCH.md`, whose component inventory is a 40-tool external stack (16 core + 24 supporting; raw inventory in `.agent-scratch/flywheel-research/flywheel-tools-raw-inventory.md`). Three verified asymmetries decided the boundary:

- **Authority is gated differently.** The external stack gates authority by **tool**: a destructive-command guard matching command text, a tracker whose labels encode permission, resource quotas, reserved files. APG gates authority by **subject**: plane, role, mode, risk tier R0–R3, and project policy, with the precedence `runtime/admin > operation/tool > project > facet/overlay > task/role/caller`.
- **The external stack has no authority model to borrow.** It has no role→authority mapping, no signer identity, and no observation grading. APG's observation tiers — `intended`, `host-observed`, `model_content_match`, `model_effective:unknown` — have no counterpart there.
- **APG has no execution mechanism to defend.** No retrieval index, no job runner, no work queue, no scheduler.

The memory question resolved the same way. Three memory layers exist with genuinely different scopes, and only one of them is APG's:

| Layer | Scope | Durability | Attestation |
|---|---|---|---|
| APG `docs/memory` reviewed facts | project, travels with the clone | git-tracked | human-guaranteed |
| external index (session-search / memory-engine) | local machine | rebuildable | unattested — derived, attention only |
| host runtime memory | per host, per turn | automatic | none |

## Constraints and decision drivers

- APG must stay harness-neutral (ADR 0005); binding to one host's memory or job system would reverse that decision.
- Authority claims must remain auditable. A capability that gates authority by matching a command string cannot express "who is entitled to do this", so it cannot substitute for the authority plane even when it looks stricter.
- Project memory must survive a fresh clone, because memory is part of development, not a local cache.
- External components are separately released and, in the surveyed stack, carry a `NOASSERTION` licence (MIT *with OpenAI/Anthropic Rider*, Restricted Parties = OpenAI, Anthropic). APG cannot vendor them.
- The project's standing rule is that the reference is never the authority: APG may *point at* external state, never *be* it.

## Decision

**APG owns authority. The execution stack owns mechanism.**

The partition is decided by two questions, applied in order:

1. **Does the artifact answer 谁有权做这件事 / 凭什么 / 按什么合约?** Authority, justification, contract, and the evidence grading that makes them auditable → **APG's plane**. This is the authority plane.
2. **Does the artifact answer 怎么找到 / 怎么记住 / 怎么跑起来?** Retrieval, memory mechanics, scheduling, execution, resource control → **the execution stack's plane**. APG references it and never becomes its authority.

Corollaries:

- **Native (APG implements):** authority, role/plane/mode grants, risk tiers, precedence, protected-effect classification, contract and acceptance vocabulary, evidence grading, project-scoped reviewed memory, the governance kernel and its gates.
- **Adapter (APG defines the seam, an external component implements behind it):** harness integration, observation adapters, the managed root-instruction block protocol (ADR 0006), capability-state reporting.
- **External (APG references, never owns):** retrieval and session search, memory indexing, job execution, work queues, trackers, resource quotas, command guards, model routing.
- **Reject (APG builds none of these):** an agent registry, a retrieval index, a job runner, a scheduler, a work queue, a vector store, a vendor-specific memory store, or any vendored `NOASSERTION` bytes in the distribution surface.

Additional standing rules:

- **Reference, not authority.** APG records *observed* facts about external state (which block exists, which component is installed, which version) and never edits, upgrades, or removes external state. A missing external component is never an APG error.
- **Honest capability state.** A referenced capability is reported as `available`, `degraded`, or `not-installed` — never as "supported". Degradation is stated when a mechanism exists only in weakened form (for example, mutual exclusion without leasing), not rounded up to present.
- **Project memory is APG's.** Reviewed project facts live in git and travel with the clone. Indexes and working memory are derived, rebuildable, and explicitly unattested; losing them costs attention, not authority.
- **The kernel does not grow a runtime.** A capability that APG needs in order to function must be expressed as a *contract over* an external mechanism, or it does not belong in APG.

## Alternatives considered

| Alternative | Benefit | Rejection/tradeoff reason |
|---|---|---|
| APG becomes the full stack (implement retrieval, queues, execution too) | One coherent product; no interop surface to maintain | Duplicates mature, separately released tooling; binds APG to hosts; reversing ADR 0005; unbounded maintenance surface |
| APG adopts the external stack's tool-gated authority model | Reuses a working guard implementation | It cannot express subject entitlements, so it would replace an authority plane with a pattern matcher — strictly weaker for APG's purpose |
| APG stays purely advisory and owns no memory | Smallest surface | Project memory is part of development; if it is not git-tracked and human-guaranteed, a fresh clone loses the project's reasoning |
| APG references external components without a stated contract | Zero ceremony | Exactly the state that produced the current stale-markers/duplicate-block failures; ADR 0006 shows a contract plus a test is what makes interop real |
| Vendor the surveyed components into APG's distribution to guarantee availability | No installation step | `NOASSERTION` licence and Restricted Parties make this a legal and a maintenance dead end; also guarantees lock-in |

## Consequences

- Positive: the boundary is now decidable per capability instead of per taste; ADR 0006 and the capability-state vocabulary have a home; project memory keeps a single authoritative location; APG's maintenance surface stops growing with every external tool it integrates.
- Negative/risk: APG depends on external components it does not control, so interop must be *verified* (ADR 0006 P5) rather than assumed; users get a boundary they must understand, and "APG does not do that" is a real product answer; the observation ledger is new state that must stay honest and must never drift into being an authority.

## Validation and reversal

Validation: a proposed capability is checked against the two questions in "Decision" before it is designed; the shipped CLI surface must contain no command that indexes, schedules, executes, or stores derived state; `plans/MULTI_AGENT_INFRA_INTEGRATION_RESEARCH.md` §9–§10 record the concession tiers this ADR ratifies; catalog/manifest regeneration confirms no external bytes entered the distribution surface.

The first and last of those clauses are now executable rather than prose: `scripts/test-boundary.mjs` (run by `scripts/test-release.sh`) pins the exact set of top-level command groups, fails if any of them - or any group added to the pinned list - names a retrieval, scheduling, execution or derived-store mechanism, asserts `PACKAGE_MANIFEST.json` equals the packer's own allowlist, and rejects any distributed path naming a surveyed third-party component. It was written after 3.0.10 recorded the general lesson that a declared-but-uninvoked gate rots; ADR 0005's genericity gate had been in that state since 3.0.7.

Signals for review: a request to add a retrieval, queue, or execution command to APG; an external component whose licence changes; an interop test that starts passing only because APG took over the mechanism.

Reversal: this ADR constrains what APG builds, so reverting it means reopening the product boundary rather than undoing a change. Any reversal must re-run the survey that produced the three asymmetries above, because a changed asymmetry is the only legitimate reason to move a capability across the boundary.

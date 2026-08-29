# Agent Project Guides 2.0 architecture and development plan

Status: implemented release candidate
Target: `2.0.0`
Reviewed through: 2026-08-29
Current implementation: `2.0.0`; current runtime contracts live in `README.md`, `docs/`, schemas, and tests
Authority: retained roadmap and release-boundary rationale; ADR 0001 owns resolved core decisions
Release boundary: DSH-first governance core; later 2.x capabilities are marked explicitly
Initial trust posture: declared mutual-trust collaboration with progressive hardening

## 1. Purpose

`agent-project-guides` exists to reduce long-running AI-agent drift, keep multiple agents aligned with project truth, and make role, evidence, verification, memory, and authority boundaries discoverable without loading an entire documentation corpus.

Version 2.0 must not become a larger collection of always-loaded Markdown or an enterprise control plane. It must deliver one usable DSH-first governance core with:

- a compact, inspectable project contract;
- progressive, section-level guide retrieval;
- project-native but bounded layout rules;
- risk-based implementation and independent verification;
- a minimal reviewed project-memory and experience lifecycle;
- deterministic validation, migration, and recovery;
- `embedded-local` and `thin-bootstrap` implementations of one portable data core, plus package-source-only `source-worktree` self-hosting;
- no new generic package content staged or committed by package-managed operations in consumer repositories.

Authoritative workspace services, non-DSH client adapters, semantic retrieval, enterprise attestations, and hardened multi-principal controls are later 2.x capabilities. They do not block the `2.0.0` core.

## 2. Scope and non-goals

### 2.1 In scope for `2.0.0`

- The DSH governance core: roles, procedures, profiles, domain overlays, traits, schemas, templates, adapters, validators, migrations, examples, and compatibility fixtures required by the shipped vertical slice.
- Project-owned governance assets: root constraints, logical layout bindings, current contracts, selected documentation, reviewed memory, and reviewed experience.
- Development work across software, MCP, CLI, service, UI, data, mechanical/CAD, content/document, research, and mixed repositories, without requiring every domain preset to be complete before release.
- `embedded-local` migration, the default `thin-bootstrap` path, and `source-worktree` self-hosting for this package source only.
- DeepSeek Harness as the only required client adapter.

### 2.2 Later 2.x scope

- Authoritative multi-user workspace service and remote shared-memory control plane.
- Non-DSH client adapters after each client exposes enough observable behavior for honest conformance reporting.
- Optional SQLite/semantic retrieval, reusable evidence backends, enterprise attestations, and hardened multi-principal security profiles when pilots demonstrate the need.

### 2.3 Non-goals

- Do not use prompts as a substitute for sandboxing, credentials, tool authorization, branch protection, CI, or human approval.
- Do not force every ecosystem into a universal `src/`, `tests/`, `generated/`, or `artifacts/` tree.
- Do not create a governance file for every task, module, decision, test run, or experience.
- Do not make a semantic index, embedding, generated summary, repo map, or MCP memory database the truth source for code-derived facts.
- Do not claim formal independent verification and validation merely because a second Agent reviewed the change.
- Do not make enterprise-grade adversarial security, multi-principal identity, remote ACL/audit, cryptographic release signing, or formal attestation prerequisites for the mutual-trust `2.0.0` core. Add them only when a named deployment boundary requires them.
- Do not treat mutual trust as permission to use production systems, credentials, private data, money, destructive actions, or irreversible effects without the separate authority those operations require.

## 3. Research basis

The plan synthesizes mechanisms rather than copying any framework wholesale:

- Scoped instructions and client differences: [AGENTS.md](https://agents.md/), [Claude Code memory/rules](https://code.claude.com/docs/en/memory), [GitHub Copilot custom instructions](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/add-custom-instructions/add-repository-instructions), [Cursor rules](https://cursor.com/docs/rules.md), [Continue rules](https://docs.continue.dev/customize/deep-dives/rules), and [OpenHands Skills](https://docs.openhands.dev/overview/skills).
- Progressive context and structural search: [Agent Skills](https://agentskills.io/client-implementation/adding-skills-support.md), [Anthropic context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents), [Aider repo map](https://aider.chat/docs/repomap.html), and [SQLite FTS5](https://www.sqlite.org/fts5.html).
- Documentation and architecture: [Diataxis](https://diataxis.fr/start-here/), [arc42](https://arc42.org/overview), [C4](https://c4model.com/), [MADR](https://adr.github.io/madr/), and [Backstage descriptors](https://backstage.io/docs/features/software-catalog/descriptor-format/).
- Specifications and long-running work: [GitHub Spec Kit](https://github.com/github/spec-kit), [OpenSpec](https://github.com/Fission-AI/OpenSpec), [Codex execution plans](https://developers.openai.com/cookbook/articles/codex_exec_plans), and [Anthropic long-running harnesses](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents).
- Verification and evidence: [NIST SSDF](https://csrc.nist.gov/Projects/ssdf), [Google test sizes](https://testing.googleblog.com/2010/12/test-sizes.html), [Bazel remote caching](https://bazel.build/remote/caching), [Nx affected selection](https://nx.dev/docs/features/ci-features/affected), [SLSA](https://slsa.dev/), and [in-toto attestations](https://github.com/in-toto/attestation).
- Distribution and migration: [XDG Base Directory](https://specifications.freedesktop.org/basedir/0.8/), [Git ignore semantics](https://git-scm.com/docs/gitignore), [Copier updates](https://copier.readthedocs.io/en/v9.11.2/updating/), and [TUF](https://theupdateframework.io/about/).
- MCP workspace storage: [MCP resources](https://modelcontextprotocol.io/specification/2025-11-25/server/resources), [prompts](https://modelcontextprotocol.io/specification/2025-11-25/server/prompts), [roots](https://modelcontextprotocol.io/specification/2025-11-25/client/roots), [authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization), [Serena memories](https://github.com/oraios/serena/blob/7fcbca7e62555ec2287ddb2f083caee805848ea6/docs/02-usage/045_memories.md), and [Basic Memory projects](https://docs.basicmemory.com/concepts/projects-and-folders).

These sources are design evidence, not imported normative text. The implementation must maintain its own explicit contracts and tests.

## 4. Governing principles

1. **Canonical sources are authored once.** Catalogs, indexes, summaries, rendered docs, repo maps, embeddings, and LLM routing views are deterministic, provenance-bearing projections.
2. **Progressive disclosure is the default.** Startup receives only mandatory policy and bounded catalog metadata. Full bodies load only by exact role, task, path, item, and section.
3. **Package and project assets are different trust/storage domains.** Package-managed operations never add new generic distribution bytes to consumer staging or commits. Existing legacy history is reported, not rewritten.
4. **Mutual trust is the starting collaboration posture.** Participants initially treat one another as good-faith callers/callees and allocate responsibility by control, without requiring enterprise identity, attestation, ACL, or hostile multi-tenant defenses. Security work grows only when a named boundary or observed failure requires it.
5. **Prompts advise; enforcement gates.** Production, credentials, spending, private data, destructive behavior, and other protected effects remain controlled by tools, host policy, CI, and human authority even under mutual trust.
6. **Routine work creates no governance files.** A new persistent artifact must control a named failure mode or preserve reusable, reviewed knowledge.
7. **Risk controls assurance depth.** Author checks are always bounded; independent evidence and field/production gates scale with impact.
8. **Indexes accelerate discovery only.** Mandatory policy and final evidence are read from canonical sources with hash/provenance checks.
9. **Memory is promoted, never accumulated automatically.** Raw transcripts, tool output, and provisional findings do not become project truth.
10. **Native project layouts remain valid.** The package standardizes logical artifact classes, default paths, lifecycle, and validation, then maps them to ecosystem-native locations.
11. **Providers share a portable core, not identical capabilities.** Portable records round-trip without loss; provider-specific ACL, audit, multiwriter, retention, or service metadata requires declared capabilities and an explicit loss report or refusal.

### 4.1 Mutual-trust protocol

The initial protocol is a responsibility model, not a claim that the environment is secure:

- Each participant treats the counterpart as acting in good faith. A called Agent, tool, provider, or service may initially assume that the caller has the authority it claims and accepts the disclosed consequences of the requested call.
- Responsibility follows control. The caller owns the choice of target, inputs, granted authority, intended external effects, cost, and use of returned results. The called implementation owns accurate effect disclosure, faithful execution of the declared contract, bounded failure behavior, and disclosure of errors or uncertainty.
- Mutual trust never permits hidden side effects, fabricated success, silent scope expansion, misleading safety claims, or concealment of implementation defects.
- Either party may challenge an assumption, request evidence, narrow scope, pause work, or escalate a boundary without treating the challenge as distrust.
- Initial development favors clear contracts, inspectable diffs, reversible package-owned mutations, and explicit confirmation for already-known high-impact operations. It does not require enterprise identity, attestation, ACL, audit infrastructure, or hostile multi-tenant defenses before the core workflow exists.

Hardening is incremental. Identity verification, fine-grained authorization, stronger isolation, signed provenance, audit, rate/cost controls, and adversarial defenses are added after the core works and when a real deployment boundary, repeated failure, or exposure justifies them. Production/customer systems, credentials, private or regulated data, irreversible/destructive effects, material spending, and safety/physical operations still require whatever separate authority their runtime defines; the mutual-trust protocol does not manufacture that authority.

## 5. Layered architecture

### 5.1 Distribution layer

One versioned and compatibility-locked release contains:

- roles, procedures, presets, overlays, and skills needed by the shipped core;
- schemas, validators, migrations, and deterministic catalog generation;
- the DSH adapter and portable project/catalog/context schemas;
- a release manifest and content digests; dependency and third-party notices are included only when applicable.

The release is immutable and content-addressed. A running session pins one exact release digest; a global update must not change an active session or another worktree. Signed provenance, SBOM publication, freshness/rollback metadata, and hardened distribution channels are later hardening capabilities unless the chosen deployment already requires them.

### 5.2 Project contract layer

A compact project descriptor owns only project-specific intent:

- stable project/workspace and optional component IDs;
- repository identity and package/subpath scopes;
- provider mode and pinned governance release/schema;
- project facets and declared protected effects;
- canonical project policy and documentation entrypoints;
- logical layout bindings for governance-sensitive paths;
- storage, commit, cache, offline, and failure policy.

The mutual-trust protocol is the default `2.0.0` collaboration philosophy, not a project manifest field, credential, or authorization token. Projects record concrete effects, targets, storage, and runtime requirements only. Later hardened profiles may add principals, ACLs, attestations, audit, and retention without changing portable project facts.

It must not contain package bytes, registry commands, executable install scripts, signer keys, transitive dependency inventories, machine paths, embeddings, or generated search data.

### 5.3 Provider layer

Every provider exposes a portable core:

```text
capabilities(project)
resolve(project, role, task, path)
search(project, query, filters, budget)
load(project, entry_id, section, expected_hash)
export_portable(project, revision)
import_portable(project, snapshot, expected_revision)
```

Optional capabilities are declared rather than simulated:

```text
proposals
verification-records
memory-lifecycle
multiwriter-cas
acl-audit
backup-retention
```

A provider that cannot preserve required fields or semantics must refuse the operation or enumerate the loss before it occurs. Provider-specific ACL, audit, retention, and service history are not part of the portable hash unless a later common schema explicitly promotes them.

The provider supplies storage and transport. It does not redefine role, profile, memory, or SDLC semantics.

### 5.4 Enforcement and responsibility layer

The `2.0.0` core records and reports role, intended effects, selected target, trust posture, and runtime confirmation requirements. It relies on the caller-responsibility protocol for ordinary trusted development and integrates with host/platform controls that already exist.

When a deployment supplies them, host and platform controls may own:

- filesystem/process/network sandboxing;
- credential and production-data separation;
- tool mutation confirmations and destructive gates;
- trusted runner and cache-writer identity;
- protected branches, code owners, required checks, and merge rules;
- release provenance verification and deployment authorization.

The package does not have to build these controls before the core is useful. It must accurately report which controls are present, absent, assumed, or required by a protected runtime. A model-visible sentence never substitutes for a control that the deployment claims to enforce.

## 6. Distribution and storage profiles

### 6.1 `embedded-local`

Purpose: migration, offline-first use, and clients that require repository-relative content.

- A full generic release mirror may exist under a dedicated local-only worktree path.
- Generic mirror and project-specific assets remain separate.
- Installer writes per-clone exclusions and a receipt; a local staged-content check reports accidental package additions.
- Updates replace only receipt-owned, hash-matching generic files.
- The provider remains usable with no network after exact release installation.
- CI rejection of package paths is an optional team hardening step, not a prerequisite for the local core.

This is the safest migration target from 1.x, not the preferred long-term collaboration model.

### 6.2 `thin-bootstrap`

Purpose: default `2.0.0` mode.

- The project contains only its reviewed policy/manifest and optional client-native project shim.
- The generic distribution lives outside the worktree in an immutable package store.
- The host advertises a small first-hop catalog and loads exact sections by verified ID/digest.
- Required profiles may be prefetched for offline use without copying them into the project.
- Missing runtime never causes an implicit `latest` fetch.

Offline claims are state-specific:

| State | Required behavior |
|---|---|
| exact release installed, offline | full supported core works |
| exact release missing, online retrieval allowed | fetch only the pinned release, then verify its digest |
| exact release missing, offline | project policy remains readable; protected work safe-stops; other work is explicitly degraded |

The third state is not called a usable offline start.

### 6.3 `source-worktree`

Purpose: the governance package source repository uses its own current implementation while developing the next release.

- This mode is valid only when the project and package source are the same worktree; it is not a consumer installation mode.
- The provider observes a fresh content digest and Git state on every invocation and reports `clean`, `dirty`, or `unknown`.
- A mutable/dirty source digest cannot satisfy immutable-release, migration-source, cache-reuse, or release-evidence gates.
- Self-host development exercises the same descriptor, resolver, catalog, risk, memory, and DSH adapter code as consumers; release acceptance still rebuilds and verifies an immutable package.

### 6.4 `workspace-service`

Purpose: later 2.x managed teams, remote catalogs, shared experience, and separated storage.

In `2.0.0`, MCP or another remote service may be a non-authoritative catalog/cache only. Making it sole authority is deferred until a real multi-user deployment requires and validates branch/revision binding, identity/ACL, CAS, audit, review/promotion, export, recovery, retention/deletion, and offline behavior.

Those controls are not built speculatively under the mutual-trust protocol. When introduced, the service must declare its additional capabilities and preserve or explicitly report loss of the portable core.

### 6.5 Default recommendation

1. `thin-bootstrap` is the default `2.0.0` collaboration mode.
2. `embedded-local` is the migration/offline compatibility mode.
3. `source-worktree` is the package's self-host development mode only.
4. `workspace-service` authority is a later 2.x feature, not a `2.0.0` release gate.

## 7. Upload and retention classes

| Class | Default authority | Commit policy | Examples |
|---|---|---|---|
| Generic distribution | Package release | forbidden in consumer Git | roles, templates, adapters, schemas, dependencies |
| Project normative assets | Git in `2.0.0`; later qualified workspace service | reviewed | project policy, structure binding, contracts, current runbooks |
| Curated project memory | Git in `2.0.0`; later qualified workspace service | reviewed, bounded | stable facts, accepted decisions, reusable knowledge |
| Curated experience | Git in `2.0.0`; later qualified workspace service | explicit promotion only | generalized lesson, applicability and evidence |
| Task state | Local/XDG or task service | forbidden by default | objective, queue, hypotheses, handoff |
| Raw evidence | CI/object/evidence store | forbidden by default | logs, traces, screenshots, reports, model exports |
| Derived context | Cache | forbidden | index, repo map, embedding, summary, rendered preview |

Promotion never stages or commits automatically. It creates a reviewable proposal. Secrets, PII, raw transcripts, chain-of-thought, unlicensed material, and mutable external content must not knowingly enter shared storage. The mutual-trust core relies on explicit human/Agent review and disclosure; automated secret/PII scanners or policy engines are later hardening when repository exposure requires them.

## 8. Project layout contract

### 8.1 Logical areas

The project contract recognizes these logical areas:

- shared architecture and terminology;
- Production/User documentation;
- Production/Operator documentation;
- Development setup, design, and module contracts;
- verification strategy and acceptance specifications;
- field-evaluation scenarios;
- decisions and proposals;
- project memory, experience, and history;
- native development tools, tests, fixtures, generated output, evidence, and scratch.

### 8.2 Canonical defaults

A project without a stronger native convention may use:

```text
docs/
  shared/
  production/user/
  production/operator/
  development/
  verification/
  evaluation/
  memory/knowledge/
  memory/experience/
  memory/history/
```

These are defaults, not compulsory empty directories. Diataxis tutorial/how-to/reference/explanation is applied inside a real audience/ownership boundary when useful; it is not repeated mechanically under every directory.

### 8.3 Native mapping

- Maven/Gradle, Cargo, Go, Python, Node, CMake, Bazel, Terraform, CAD/PDM, data catalogs, and documentation systems retain their native source/test/output conventions.
- The manifest maps existing paths only where agents need an unambiguous destination or role boundary.
- The package does not require approval for every new source directory.
- It must define one logical scratch class and may bind one or more scope-specific physical roots, such as repository, package, CI, or Windows/WSL scratch. All bindings share the same generated/temporary lifecycle and default no-commit policy, so agents do not invent unclassified top-level `tmp`, `sandbox`, `debug`, or `agent-output` trees.
- Physical Production/Development/Verification separation becomes required only when audience, access, owner, publication, version, or release boundaries differ materially.

## 9. Project facets, domain overlays, and protected effects

### 9.1 Descriptive facets

A scope may declare multiple delivery facets:

```text
mcp
library
cli
service
application-ui
data-automation
content-package
monorepo-composition
```

Facets select useful defaults. They are not authorization gates and need not be forced into one mutually exclusive primary label.

### 9.2 Domain overlays

Domain overlays add evidence and acceptance semantics only when the domain differs materially:

```text
mechanical-modeling
agent-governance
research-reproducibility
```

Additional overlays require repeated evidence across independent projects, a named failure mode, an owner, cost analysis, and a retirement/review condition. Project-local overlays derive from a base schema and cannot weaken protected effects.

### 9.3 Protected effects

The following effects automatically strengthen gates regardless of project type:

- production or customer-visible action;
- credentials, secrets, identity, or authorization;
- persistent user, production, or shared data mutation; migration across durable schemas or stores;
- security, privacy, safety, legal, or regulatory impact;
- irreversible/destructive behavior;
- public/contractual compatibility or release;
- material real cost, external quota, or long-running shared resource;
- physical interface, tolerance, manufacturability, or field-use impact;
- weak observability/rollback/evidence combined with material consequence or high novelty.

Local fixtures, disposable scratch, ordinary cache refresh, and reversible development-state changes are not protected merely because they mutate state.

### 9.4 Monotonic authority and composition

Risk and authority compose in one direction:

```text
runtime/administrator hard boundary
  > tool- or operation-declared effects
  > project strengthening constraints
  > package defaults and facet/overlay presets
  > task, role, memory, and caller claims
```

- A lower layer cannot weaken a higher layer.
- Facets and overlays union their required checks; duplicate checks collapse by stable ID; incompatible requirements are reported rather than resolved by order.
- A project may declare additional protected effects but omission cannot erase an effect observed from the actual operation, target, or runtime.
- Under mutual trust, the called component may accept the caller's authority claim for ordinary development. It still reports disclosed effects and relies on the caller to own those consequences.
- Unknown classification does not trigger a universal security project. It causes a concise clarification or the smallest conservative gate appropriate to the already-known effect.

The host/CI controls protected-effect policy when such controls exist. The package records intended classification and cannot claim enforcement that the runtime does not provide.

## 10. Roles and assurance separation

### 10.1 Role decisions

- **Developer:** intentional new behavior and Author Checks.
- **Maintainer:** behavior-preserving fixes, maintenance, test maintenance, and Author Checks.
- **Reviewer:** author-independent design/static/diff/test-adequacy review; may run diagnostics but does not inherit the verification verdict.
- **Verifier/Test Engineer:** challenges the verification contract and owns trusted execution, oracle challenge, and the dynamic verification verdict; may strengthen but not silently reduce required checks.
- **Field Evaluator:** owns representative non-production fit-for-use evidence.
- **Production/User:** consumes public capabilities within runtime authority.
- **Production/Operator:** owns deployment, observation, recovery, rollback, and exact-artifact promotion.

A role label is not an independent principal. The mutual-trust core records the actual author/reviewer/verifier arrangement and uses distinct non-author actors or existing trusted runners where the selected tier requires them; it does not build a new identity or ACL system. A second Agent using the same authority may provide peer challenge but is not formal IV&V. R3 or externally regulated independence relies on existing platform/human identities or remains explicitly unsupported until a hardened profile exists.

### 10.2 Risk tiers

- **R0 Minimal:** non-behavioral or consequence-free, reversible, no protected effect. Author check and deterministic policy may suffice.
- **R1 Routine:** localized, known pattern, low consequence. Author fast checks plus existing trusted automation or lightweight non-author evidence; a separate human verifier and persistent contract are not required by default.
- **R2 Material:** shared/public contract, consequential durable state, security/privacy, consequential data/CAD/content, or a material protected effect. A verification contract selected from requirements and project policy plus a distinct verifier are required; the verifier may add challenges but cannot lower the contract alone.
- **R3 Critical:** safety, regulated, irreversible, high-value, broad exposure, weak recovery, or high uncertainty. Pre-approved independent verification, field evaluation where applicable, stronger release controls, and formal IV&V when required externally.

The highest triggered tier wins. Downgrades require an accountable rationale and an authorized non-author decision. Before freezing tier presets, two independent raters classify a representative sample of recent changes; low agreement or an excessive R2 rate requires narrowing definitions and adding counterexamples.

## 11. Risk-based SDLC

### 11.1 Base flow

```text
outcome and scope
  -> effect/risk classification
  -> change and Author Check
  -> required review/verification evidence
  -> acceptance decision
  -> release/operation when applicable
```

### 11.2 Persistence rule

- R0/R1 work should normally create zero governance files.
- Task state lives in the session/task system or local provider.
- Persist a spec, design, plan, verification contract, ADR, or experience only when the change is R2/R3, crosses sessions/teams, changes a durable contract, or preserves reviewed reusable knowledge.
- A persistent artifact must state the failure mode it controls, owner, consumers, and retirement/supersession condition.

### 11.3 Type/domain acceptance presets

Profiles add checks rather than duplicate the base SDLC:

- Library: export/API compatibility, types, examples, deprecation, package build.
- CLI: arguments, exit codes, stdout/stderr, install, scripting compatibility.
- Service: state, health, migration, observability, deploy/rollback.
- UI: interaction, accessibility, visual/platform behavior.
- Data: lineage, schema/semantic contract, snapshots, replay, drift, privacy/licensing.
- MCP: tool/resource/prompt schemas, client visibility, runtime policy, side effects.
- Content package: source/rendered consistency, links, snippets, loading/index behavior, migration, install/uninstall, cold-start.
- Mechanical/CAD: units, constraints, interfaces/tolerances, topology/mass properties, neutral export, assembly/DFM, drawing/BOM consistency, physical validation.
- Agent governance: routing, precedence, DSH loading correctness, token/context budget, prompt visibility, migration/uninstall, and drift scenarios; later adapters add their own observation limits.

## 12. Author Checks, verification, and evidence reuse

### 12.1 Author Check

Developer/Maintainer checks answer only: is this candidate coherent enough for independent review/verification?

Typical checks:

- parse/build/type/static checks;
- directly affected small/unit/component checks;
- one bounded smoke or deterministic generator drift check;
- risk and impact declaration.

The output state is `ready_for_verification`, never an independent pass verdict.

### 12.2 Independent verification

Required checks originate in executable contracts, project policy, accepted requirements, and risk presets. For R2/R3, a non-author approves the minimum verification contract. The Verifier challenges requirements, failure modes, oracles, negative cases, compatibility, and representative environments, and may add checks; the Verifier cannot lower the approved minimum alone.

Reviewer and Verifier decisions remain conceptually distinct. R1 may use an existing trusted CI runner or lightweight non-author acceptance without creating two permanent records or scheduling a separate human. A second Agent using the same identity/environment is peer challenge, not formal independence.

### 12.3 Minimal evidence references

`2.0.0` does not require a universal attestation graph or a new evidence database. It carries the smallest references needed for the selected gate:

- **candidate reference:** source state or artifact digest plus relevant configuration;
- **verification reference:** requirement/check identity, result, producer, environment summary, and raw-evidence locator when one exists;
- **decision reference:** accepted/rejected/exception outcome and accountable actor when a durable gate requires it.

Plain CI URLs, local report paths, Git references, or project-native records are valid when they are sufficient and reviewed. Typed candidate/contract/evidence schemas, transparency logs, OSCAL, in-toto, and SLSA predicates are later capabilities justified by repeated cross-project need.

### 12.4 Reuse policy

General-purpose verification-result reuse is not a `2.0.0` deliverable. Existing build/test systems may reuse their own hermetic deterministic caches under their native keys. Governance accepts a reused result only when the underlying system exposes the candidate, check implementation, relevant inputs, producer, and applicability clearly enough for the selected risk tier.

Live, security, migration, stochastic, physical, field, and human-review evidence defaults to fresh execution. Cached machine results never preserve stale human approval.

### 12.5 Cadence

- Author loop: small checks at coherent checkpoints, not every edit.
- Pull request: affected target/dependent checks and review.
- Merge queue: required checks on the exact integration candidate.
- Scheduled: broad regression, flake detection, security/performance/compatibility sampling.
- Release: build/export once, verify exact digest, promote without rebuild.
- Deployment: provenance/config/readiness/health/canary/rollback checks, not the whole product suite.

## 13. Documentation authority and memory

### 13.1 Fact-class authorities

Use one canonical owner per enforceable fact class, not one document for every reader:

- code/schema/config for executable contracts;
- current architecture/module docs for boundaries and invariants;
- ADR for historical accepted decisions;
- RFC/plan for unimplemented proposals;
- runbook for current operational procedure;
- verification contract/evidence for assurance;
- experience/postmortem for event learning and provenance;
- generated catalog/index for discovery only.

Contextual restatement is allowed. Conflicting normative rules are not.

### 13.2 Memory classes

- **Durable project memory:** reviewed, scoped, current team knowledge.
- **Ephemeral task state:** objective, plan, queue, hypotheses, worktree, and handoff.
- **Raw evidence:** tool results, logs, traces, test output, screenshots, source snapshots.
- **Derived context:** index, repo map, condensed history, summary, embedding, graph.

Derived context is not memory authority. Raw evidence proves claims but is not injected wholesale.

### 13.3 Experience lifecycle

```text
captured
  -> triaged
  -> validated
  -> promoted
  -> superseded/archived
```

A validated experience includes context, observed version/environment, what was tried, evidence, conclusion, applicability limits, confidence, owner, revalidation trigger, and follow-up. Promotion normally updates a test, runbook, ADR, contract, or reference. The experience record remains provenance and is never automatically injected as instruction.

Placement rule: if a lesson changes what people must do now, update the current runbook, contract, test, or reference and keep the experience only as provenance. If it records why a past decision occurred, use an ADR/history record. Durable memory is reserved for stable facts that have no better executable or operational owner. A project may use existing native documentation paths instead of creating the default directory tree.

## 14. Search, indexing, token, and package-size control

### 14.1 Progressive retrieval

`2.0.0` uses the smallest deterministic DSH path:

```text
exact role/task/path route
  -> bounded lexical catalog/search
  -> canonical-ID dedup
  -> stable rerank
  -> bounded exact-section load
```

Mandatory policy IDs/hashes come from the project bootstrap and are direct-read or fail explicitly; search never determines authority. Ordinary file search remains valid for small projects. SQLite FTS5, AST/graph retrieval, embeddings, and semantic reranking are later optimizations activated only after measured gold-query failures justify their cost.

### 14.2 Catalog schema

Each discoverable item has bounded generated metadata matching `schemas/catalog-entry.schema.json`:

- stable ID and kind;
- title, one-sentence purpose, and tags;
- canonical source path and exact section title;
- content hash, byte count, and deterministic token estimate.

Activation comes from routing registries, not duplicated catalog fields. Aliases, outlines, line ranges, version, and supersession metadata are added only with a named consumer and schema migration. Full bodies are never globally concatenated.

### 14.3 Deduplication

- Exact hash duplicates share one canonical body and retain all provenance aliases.
- Near-duplicate detection produces review clusters only.
- Policies, schemas, commands, examples, and evidence are never auto-merged.
- Chunking preserves heading/section provenance; overlap is disabled by default and measured when enabled.

### 14.4 Budget policy

Hard-zero integrity failures:

- broken internal route/anchor;
- duplicate IDs or unresolved aliases;
- stale source hash;
- mandatory source hidden by truncation;
- package-managed operation newly stages or commits generated/index/evidence/package files outside an approved exception;
- summary-only completion or memory promotion without evidence.

Soft growth budgets requiring owner, reason, and expiry:

- bootstrap/catalog/retrieval token cost;
- canonical corpus growth and duplicate-text ratio;
- untriaged memory count/age;
- index size/build time and evidence retention;
- exceptions, overlays, mandatory artifacts, and profiles.

Initial experiment ranges, not release promises:

- catalog entries should remain short enough for bounded first-hop routing;
- startup and retrieval cost are measured with the DSH tokenizer/context actually in use;
- hit and section limits are calibrated from complete-task results, not fixed in advance;
- task success and mandatory-authority recall take priority over token reduction.

A blind comparison against `1.4.3` must show that token reduction does not increase wrong-authority reads or user intervention. No universal numeric threshold becomes normative until preregistered cross-project tasks justify it.

### 14.5 Index integrity

- Deterministic sorted output and stable tie-breaking.
- Index key includes project/release/content/index-schema digests.
- Rename/delete/update removes old entries and rejects stale hashes.
- The 2.0 smoke corpus covers deterministic ordering, one bounded query, path deduplication, stale hashes, and explicit misses. The CJK/filename/identifier/heading/phrase/short-substring/alias benchmark is the P1 entry gate, not a completed 2.0 claim.
- Missed, omitted, truncated, or degraded results are explicit.
- Mandatory policy is direct-read or fails closed; an index cannot satisfy conformance.

## 15. Trust, safety, and progressive hardening

### 15.1 `2.0.0` mutual-trust baseline

The initial implementation assumes good-faith callers and avoids building an enterprise security platform. Its baseline is limited to correctness and already-known high-impact boundaries:

- disclose operation effects, target, cost/remote impact, and known irreversibility before the call;
- keep package-owned writes scoped, inspectable, and recoverable;
- use exact project-relative paths and content digests for package identity and migration ownership;
- never silently expand scope, fetch `latest`, fabricate success, or promote raw memory automatically;
- reject malformed inputs and obvious traversal/symlink escapes in package-owned filesystem operations;
- preserve existing runtime confirmation for production, credentials, spending, destructive effects, and private data rather than recreating those controls in prompts.

The caller is responsible for invoking a disclosed capability with suitable authority and for the intended consequences. The implementation remains responsible for honest disclosure and contract-correct behavior.

### 15.2 Hardening triggers

A hardening increment requires a named trigger such as:

- untrusted or anonymous callers;
- multi-user remote writes or cross-project storage;
- public package distribution or third-party update channels;
- production credentials, private/regulated data, material cost, destructive migration, or safety impact;
- an observed exploit, repeated misuse, audit requirement, or inability to recover.

The response is the smallest control that addresses the trigger, measured against its maintenance and context cost.

### 15.3 Later 2.x hardened capabilities

Depending on the trigger, later releases may add principal identity, ACLs, isolated namespaces, server-side CAS/idempotency, signed freshness/rollback metadata, SBOM/provenance, trusted runners, audit trails, retention/deletion policy, rate/cost limits, backup/restore, and hostile-input defenses. Established package, TUF, OCI, Sigstore, SLSA, or platform mechanisms are preferred over custom security infrastructure.

Hardened features remain capability-declared. Their absence in the mutual-trust core is reported honestly and does not prevent trusted collaboration.

## 16. Client adapters

DeepSeek Harness is the only required `2.0.0` adapter. It must report the ordered sources it controls, scope/activation reason, content hash, byte/token estimate, pinned distribution/project digest, and known conflicts or truncation.

Adapter observations use explicit confidence labels:

- `intended`: content the adapter attempted to deliver;
- `host-observed`: content the host can prove it selected or injected;
- `model-effective-unknown`: hidden system instructions, undocumented truncation, or client behavior that cannot be observed.

An adapter must not turn intended input into a claim about effective model context. Claude Code, Codex, GitHub Copilot, Cursor, Continue, and OpenHands remain later compatibility targets and do not block `2.0.0`. Each is added only after executable fixtures characterize its real loading semantics and unsupported observations remain explicit.

## 17. Migration from 1.4.3

### 17.1 Required properties

- Dry-run inventory of package files, managed blocks, project-authored bytes, client rules, state, and dirty/untracked changes.
- Delete only exact receipt-owned or known generated hashes.
- User-edited or ambiguous managed content becomes a conflict, never an automatic deletion.
- Stage the new provider, project contract, adapter, and catalog before switching.
- Verify cold-start and the shipped provider's portable core before removing 1.x routing.
- Package and migrated package-owned state switch as one recoverable generation.
- A durable journal records every phase; retry and rollback are idempotent for package-owned state.
- `unmigrate` restores bytes captured and owned by the migration exactly. Later user/external changes are preserved or reported as conflicts; the tool does not promise to rewind unrelated external state or rewrite existing Git history.

### 17.2 Mode mapping

- Existing vendored installs first migrate to `embedded-local` without semantic change.
- After the portable-core acceptance passes they may move to `thin-bootstrap` by exporting the same project contract and deleting only receipt-owned generic mirror bytes.
- Import to a later workspace service is opt-in, capability-checked, and requires a portable-core round-trip comparison plus an explicit report for provider-specific fields.

### 17.3 Failure fixtures

The `2.0.0` core covers dirty trees, CRLF/no-final-newline/Unicode, symlink refusal, ambiguous markers, interruption at owned-write boundaries, missing local state, and concurrent worktrees. Full-disk, hostile filesystem, decompression-bomb, exhaustive crash-point, and cross-service concurrency matrices are added when the corresponding deployment or observed failure justifies them.

## 18. Delivery phases

### Phase 0: release contract and one executable slice (implemented)

- Resolve only the decisions required by the first slice: descriptor location, portable record/hash rules, project identity for one repository/worktree, and package-store mapping on the pilot platform.
- Define the mutual-trust caller/callee responsibility contract and monotonic authority composition.
- Freeze one real `1.4.3` pilot task and its baseline before implementation.
- Build only project-contract and catalog schemas needed by the slice.

Exit: one fixture can parse a descriptor, select an exact package release, resolve one mandatory route, and describe package-missing behavior without an LLM.

### Phase 1: `embedded-local` DSH deterministic vertical slice (implemented)

- Implement the portable provider core and DSH adapter.
- Migrate one real-repository copy to `embedded-local` with inventory, receipt ownership, exact section load, local catalog, and journaled rollback.
- Exercise role selection, exact guide loading, report shapes, and byte ownership without claiming a completed agent-task outcome.

Exit: the repository copy migrates and unmigrates package-owned bytes byte-for-byte; later/ambiguous changes become conflicts; required route IDs remain present.

### Phase 2: `thin-bootstrap` default path (implemented)

- Add the immutable external package store and pinned session selection.
- Keep project policy and protected-effect declarations readable in a clean clone.
- Implement all three online/offline states from section 6.2.
- Verify concurrent worktrees and package generations do not collide.

Exit: exact-release installed/offline works; exact-release missing/offline safe-stops honestly; no package-managed operation stages generic package bytes.

### Phase 3: governance semantics and minimal memory (implemented)

- Add logical layout bindings, scoped scratch roots, facets/overlays, and monotonic risk composition.
- Add Verifier/Test Engineer with the R0-R3 independence rules.
- Support reviewed memory/experience proposal, promotion, supersession, and purge using project-native files or provider capabilities already available.
- Add only the domain presets needed by preregistered pilot tasks.

Exit: routine R0/R1 work creates zero governance files; R2 classification selects the required independent-evidence checks without pretending that a classifier fixture is an independent verdict; memory lifecycle fixtures pass without an evidence service.

### Phase 4: measurement, simplification, and `2.0.0` release (implemented)

- Deterministic pilots compare `1.4.3` and the 2.0 slice on exact route recall, route tokens, migration ownership, rollback, and staging.
- The exact immutable candidate passes schema/routing/lifecycle/migration suites, independent adversarial review, install, launcher pre-import verification, and source/installed manifest verification.
- Infrastructure scripts do not invoke an LLM or proxy route success as task success; fresh DSH task outcomes are adoption measurements for 2.0.x rather than fabricated release evidence.
- Linux/WSL is the verified initial platform boundary. Windows path mapping exists, but Windows support requires a later real smoke run.

Exit: the hard integrity gates in section 21 pass against one exact immutable candidate and the narrowed Definition of Done is satisfied.

### Later 2.x: evidence, retrieval, hardening, workspace, and clients

Only measured need may introduce:

- typed evidence/attestation and cross-system result reuse;
- SQLite/semantic/graph retrieval;
- signed distribution and enterprise supply-chain evidence;
- authoritative multi-user workspace service with identity, ACL, CAS, audit, retention, and recovery;
- non-DSH adapters with honest observation labels.

Each addition has its own acceptance boundary and cannot retroactively become a prerequisite for the mutual-trust `2.0.0` workflow.

## 19. Pilot matrix

| Project | Purpose |
|---|---|
| MSP/Core | `content-package` + `agent-governance`; minimal module engineering system |
| CadQ | CLI/library facets + `mechanical-modeling` |
| dsh-bench | data/research reproducibility and evidence retention |
| cc-teamwatch | small CLI and R0/R1 zero-file behavior |
| cc_switch_tiny_switch | service, state, privileged boundaries, field/Operator gates |
| dsh-vision-toolkit-windows-edge | non-MCP Windows/WSL service topology |
| onshapescript | MCP + Windows/WSL + large catalog/index behavior |
| taobao-mcp | MCP, browser/user data, protected effects, prompt/client compatibility |

The table is a candidate pool, not eight release obligations. Before a pilot changes, freeze its owner-approved task, starting revision, `1.4.3` baseline, expected authority sources, success oracle, allowed intervention, and failure threshold. `2.0.0` requires at least one small and one complex DSH pilot; later domain coverage expands only when it tests a distinct failure mode.

No pilot repository is modified until its owner approves the migration mode and dry-run diff.

## 20. Non-negotiable `2.0.0` acceptance corpus

1. **Mutual-trust responsibility:** the caller sees declared effects and owns target/input/authority/intended consequence; the called implementation exposes failure and never hides or expands effects.
2. **No new consumer vendoring:** package-managed operations do not newly stage or commit generic package bytes, dependencies, catalogs, caches, reports, embeddings, or client bundles. Existing legacy history is reported, not rewritten.
3. **Exact offline states:** installed/offline, missing/online, and missing/offline behaviors match section 6.2; only the first is called full offline operation.
4. **DSH observability:** intended, host-observed, and model-effective-unknown inputs are distinguished; hidden client behavior is not reported as proven context.
5. **Monotonic authority:** role, facet, task, memory, caller, or manifest changes cannot lower runtime/tool effects or manufacture production, credential, spending, destructive, or data authority.
6. **Concurrent generations:** branches/worktrees pin different releases and package-owned state without collision.
7. **Scoped migration safety:** ambiguous content is never deleted; interruption is detectable; retry/rollback exactly restores migration-owned captured bytes and preserves later external changes as conflicts.
8. **Catalog integrity:** stale/deleted/renamed content cannot satisfy routing; mandatory bootstrap IDs are direct-read; explicit misses remain visible.
9. **Memory discipline:** raw transcripts, secrets, PII, false/stale conclusions, and unreviewed experience do not auto-promote or gain instruction authority.
10. **Native cross-domain fit:** selected pilot fixtures express layout and acceptance without irrelevant directories, schemas, or stages.
11. **Anti-bloat:** routine R0/R1 work creates zero governance files; added artifacts and controls name the failure mode they address.
12. **No LLM in infrastructure:** installer, updater, migrator, validator, catalog generator, and deterministic retrieval do not invoke an LLM.

Enterprise identity, ACL, signed provenance, hostile multi-tenant defense, authoritative workspace service, semantic retrieval, and non-DSH parity are explicitly outside this `2.0.0` corpus. Their later acceptance suites begin only when those capabilities are proposed.

## 21. Measures and release gates

Preregister route authority, denominator, token method, and allowed filesystem effects before each deterministic pilot. `2.0.0` has four hard gates:

1. **Route non-inferiority:** the ordered exact route contains the complete frozen authority set and remains within its preregistered token threshold.
2. **Mandatory-authority recall:** no accepted pilot result omits a mandatory authority source identified in the frozen oracle.
3. **Migration ownership:** all migration-owned captured bytes restore exactly in supported fixtures; ambiguous/later changes are retained and reported.
4. **No package-managed staging:** package operations create zero new staged generic-distribution paths in the pilot set.

Fresh DSH task outcomes, human interventions, classification disagreements, and host observation remain required adoption measurements before a 2.0.x change claims outcome improvement. They do not become synthetic release evidence: route success alone is never reported as task success.

Secondary diagnostics guide later work but do not independently block the core release:

- startup/task governance tokens and retrieval misses;
- search precision/recall on gold queries;
- risk-tier disagreement and excessive R2 classification;
- untriaged memory age, promotion yield, and stale retrieval;
- migration conflicts, rollback duration, and concurrent-worktree failures;
- controls, overlays, exceptions, and mandatory artifacts added or retired.

Do not optimize raw document count, test count, approval count, coverage, cache-hit rate, token count, security-control count, or completion speed in isolation.

## 22. Decisions before dependent implementation

Only decisions required by the next vertical slice block that slice.

### 22.1 Resolved `2.0.0` core decisions

ADR [`decisions/0001-v2-core-contract.md`](../decisions/0001-v2-core-contract.md) is accepted and owns the descriptor filename/root relationship, canonical hashing, ordinary-clone and linked-worktree identity, XDG/Windows mapping, immutable store format, Provider modes including source self-hosting, monotonic risk composition, clean-clone minimum policy, mutual-trust responsibility boundary, minimal reviewed memory, and migration ownership. ADR [`decisions/0002-budgeted-section-context-routes.md`](../decisions/0002-budgeted-section-context-routes.md) owns section entrypoints, token budgets, lifecycle full-profile routing, and Production context isolation. Runtime schemas and executable acceptance suites enforce those decisions; this roadmap no longer presents them as open choices.

### 22.2 Later 2.x decisions

- SQLite/semantic-index activation thresholds and token benchmarks.
- Typed evidence storage, retention, attestations, and cross-system reuse.
- Enforceable multi-principal independence beyond existing CI/human identities.
- Workspace-service IDs, ACL, CAS, audit, backup, deletion, and authority scope.
- Signed supply-chain channel, trust roots, freshness/revocation, and offline expiry.
- Non-DSH adapter observation and compatibility policies.

An accepted ADR owns its decision. This roadmap links that ADR and updates the affected phase/status so proposal text and accepted architecture do not compete as normative sources.

### 22.3 Evidence-gated development order

**P0 - release `2.0.0` (completed).** Every intended file is tracked in one reviewed release commit; the manifest/tag/installed artifact agree; launcher pre-import verification and the deterministic schema/routing/lifecycle/migration/pilot suites pass; independent review has no remaining blocker or medium finding. The verified initial platform is Linux/WSL, and observation preserves `model_effective: unknown`.

**P1 - measurement-led `2.0.x`.** Run fresh DSH tasks in the first adopters and record task outcome, mandatory misses, intervention, host observation, and a two-rater risk sample before claiming outcome or tier-calibration improvement. Add a real Windows smoke before advertising Windows support. Build a gold query/context benchmark before changing retrieval: at least 30 real queries across two projects, including CJK, identifiers, filenames, headings, aliases, phrases, short substrings, and explicit misses. Tune lexical metadata/aliases first; target deterministic top-8 recall of at least 95% and 100% for preregistered required targets. Add at most one distinct R2 or host-observation pilot and measure memory yield before expanding storage.

**P2 - at most one independently gated `2.1` capability.** Select it only from measured demand and accept a new ADR first. Semantic/SQLite retrieval requires persistent lexical failures causing task failure in at least two projects. Typed evidence requires repeated cross-system applicability/invalidation joins or material rerun cost. Signed distribution requires an untrusted/public channel or audit boundary. A workspace service requires named multi-user writers, an owner/SLO, data classification, CAS/ACL/audit/backup/deletion requirements, and a recovery drill. A non-DSH adapter requires a committed adopter and observable loading semantics. Broad adapter parity, a universal evidence database, and workspace/security infrastructure remain rejected without those triggers.

## 23. Definition of done for `2.0.0`

`2.0.0` is complete only when:

- the mutual-trust caller/callee responsibility model and its authority limits are documented as package behavior and reflected in runtime effect reporting without requiring a per-project trust file;
- one default `thin-bootstrap` path, one migration-compatible `embedded-local` path, and package-source-only `source-worktree` self-hosting work in DSH;
- project policy, mandatory authority IDs, protected-effect declarations, and package-missing behavior remain readable in a clean clone;
- an installed exact release works offline, while a missing exact release offline degrades or safe-stops without claiming success;
- selected real `1.4.3` pilots migrate and roll back package-owned bytes exactly, preserving ambiguous/later changes as conflicts;
- package-managed operations add no generic distribution content to consumer staging or commits;
- exact routing, bounded lexical discovery, section loading, layout mapping, risk composition, and minimal reviewed memory pass the narrowed acceptance corpus;
- routine R0/R1 work creates no governance files and does not require enterprise security or evidence infrastructure;
- the preregistered small CLI and complex content-package pilots pass ordered route noninferiority/token-budget, mandatory-authority recall, exact migration ownership, and no-generic-staging gates;
- migration, degradation, uninstall, recovery, caller responsibility, and known unsupported/hardening boundaries are documented and tested.

Authoritative workspace service, non-DSH adapters, semantic retrieval, general evidence reuse, signed supply-chain infrastructure, and multi-principal hostile-environment security are later 2.x work. Their absence does not block `2.0.0`, and the implementation must not claim those guarantees prematurely.

The implementation must prefer deleting or simplifying a control over retaining one that does not prevent a named, measured failure mode. Security hardening follows the same rule: add the smallest effective control after a real boundary or failure justifies it.

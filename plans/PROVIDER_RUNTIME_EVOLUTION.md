# APG Deployment and Runtime Modes Evolution

Status: development plan after `2.0.0`. This document authorizes planning only. It does not change the released runtime, descriptors, installed projects, manifest, or provider behavior.

The complete mode redesign is contract-significant and is assumed to require a next-major descriptor/bootstrap boundary. Additive CLI work may land earlier only when it leaves every `2.0.0` behavior unchanged.

## 1. Confirmed goals

APG must support both centralized reuse and project-local containment:

- Project-specific policy, memory, specialization, and promoted experience exist only inside the project.
- No APG workspace service, XDG project database, MCP store, or APG source directory owns project-specific content.
- Selective document installation primarily bounds damage when an Agent eventually ignores routing and reads the whole workspace; disk saving is secondary.
- A shared runtime remains valid for users who prefer one centrally updated copy of generic APG content and accept a persistent CLI dependency.
- APG itself retains a source-worktree mode.
- A deliberately dangerous full-local mode remains available for research, debugging, and complete archives.
- Inline routing and CLI-mediated routing are both supported because they have different runtime-dependency and containment properties.
- The CLI becomes a deterministic context compiler that accepts natural-language task input and returns the selected governance content directly.

## 2. Fundamental containment limit

Without a host sandbox or separate operating-system identity, these three properties cannot all be guaranteed simultaneously:

1. the system stores only one complete generic APG corpus;
2. unselected documents are physically unreadable to a project Agent;
3. the Agent has broad filesystem/process access as the same user that owns APG.

A shared CLI can provide strong normal-path filtering and useful behavioral friction: Agents commonly scan the current workspace when instructions decay but do not usually locate a launcher, trace its store, and unpack hidden resources. This is **soft containment**, not an authorization boundary.

The modes report two separate facts:

```text
selected-local    workspace corpus: physical bound; uninstalled documents absent from project tree
shared-packed     host corpus exposure: soft; full corpus exists outside project
source-worktree   workspace/host corpus exposure: full source corpus readable
full-local        workspace corpus exposure: full corpus readable
```

`selected-local` never claims that the whole host lacks another APG corpus. A project using `selected-cli` with a shared executable still reports any configured or bounded-scan-observed shared corpus as host exposure, even though recursive reads of that project cannot reach uninstalled local modules without leaving the workspace. Validation emits separate `workspace_containment` and evidence-qualified `host_corpus_exposure` fields.

`host_corpus_exposure` is not a universal filesystem claim. Allowed observations include `observed-full`, `observed-selected`, `not-observed-bounded-scan`, `unknown`, and `host-enforced-none`; the report includes the observation source/scope. Alternate checkouts, archives, or stores outside configured paths keep the result `unknown` or bounded-not-observed. Only a host sandbox or authoritative inventory may report `host-enforced-none`. The parent roadmap uses “physical” only for the project-workspace claim.

A deployment that requires stronger host-wide shared-runtime isolation must add host sandboxing or a distinct service identity; prompt wording alone cannot provide it.

## 3. Orthogonal architecture axes

### 3.1 Document placement

```text
selected-local    deterministic selected closure inside the project
shared-packed     one content-addressed generic corpus outside projects
full-local        complete generic corpus inside the project
source-worktree   current APG source tree is the corpus
```

### 3.2 Routing strategy

```text
inline-route      managed AGENTS block performs direct local routing
cli-context       managed AGENTS block invokes `apg context`
```

### 3.3 Executable placement

```text
none              no executable required after materialization
shared-cli        one user/system installation serves multiple projects
project-cli       one pinned executable is stored for a project
source-cli        executable is run from the APG source checkout
```

The implementation does not expose an unrestricted Cartesian product. The plan defines six preset families with declared defaults, dependencies, containment, and explicitly enumerated router variants. They remain planned until their fixtures pass. Every permitted variant receives its own fixture; an optional cell does not authorize an untested combination.

## 4. Supported preset families

| Preset family | Documents | Default router | Executable | Workspace containment | Host exposure | Intended use |
|---|---|---|---|---|---|---|
| `selected-inline` | selected local closure | inline | none; shared CLI is maintenance-only | physical after migration finalization | separately reported | default high-containment project |
| `selected-cli` | selected local closure | CLI context | shared or project CLI, required at runtime | physical after migration finalization | separately reported | centralized matching with project slicing |
| `shared-runtime` | shared packed full corpus plus project binding | CLI context | shared CLI, required at runtime | project contains no generic corpus | soft/full corpus on host | many projects, one centrally updated generic corpus |
| `self-contained` | selected local closure | inline; explicit CLI variant allowed | project CLI required only by CLI variant | physical after migration finalization | selected corpus only unless another store exists | fully offline, pinned CI, independent recovery |
| `source-worktree` | current APG source | CLI context | source CLI, required at runtime | none | full source corpus | APG self-development and unreleased testing |
| `full-local-dangerous` | complete local corpus | inline; explicit CLI variant allowed | required only by CLI variant | none | full project corpus | research, debugging, complete archive |

Every project descriptor reports document placement, router, executable dependency, release policy, selected lifecycle/modules, `workspace_containment`, and `host_corpus_exposure` honestly.

Stable planned variant IDs and validity constraints are:

| Variant ID | Required combination |
|---|---|
| `selected-inline.none` | selected-local + inline + no runtime executable |
| `selected-cli.shared` | selected-local + cli-context + shared CLI |
| `selected-cli.project` | selected-local + cli-context + project CLI |
| `shared-runtime.pinned` | shared-packed + cli-context + shared CLI + pinned digest |
| `shared-runtime.channel` | shared-packed + cli-context + shared CLI + compatible channel |
| `self-contained.inline` | selected-local + inline + project CLI retained for offline maintenance, not routing |
| `self-contained.cli` | selected-local + cli-context + project CLI |
| `source-worktree.cli` | source-worktree + cli-context + source CLI |
| `full-local-dangerous.inline` | full-local + inline + no required runtime executable |
| `full-local-dangerous.cli-shared` | full-local + cli-context + shared CLI |
| `full-local-dangerous.cli-project` | full-local + cli-context + project CLI |

All other combinations are schema-invalid unless a later ADR adds a stable variant and fixtures. These variants are **planned**, not tested capabilities, until Phase A freezes fixtures and the applicable implementation phase passes them.

## 5. Project-local ownership

For local-document presets, generic and project-specific documents are collocated in the project but retain a machine-readable overwrite boundary:

```text
AGENTS.md                              # project-owned file with one managed routing block
.agent-guides/
  MANIFEST.json                       # selected-set provenance, ownership, dependencies, hashes
  ROUTES.jsonl                        # optional generated local route data
  managed/                            # APG-owned selected or full generic documents
  project/                            # optional project-owned governance documents
```

Existing native project documentation may remain elsewhere and be referenced by routes.

This is not independent project storage: all files are inside the project. The ownership distinction exists only so update, shrink, uninstall, and rollback cannot overwrite project-owned bytes. Directly merging APG and project content without per-file ownership is rejected.

The project owner reviews and commits materialized documents. APG never stages or commits them.

### 5.1 Project authority contract

Project-owned governance is first-class authority, not an unindexed supplement:

- Project route IDs use a reserved `project:` namespace; generic APG release IDs cannot use it, and project entries cannot shadow package IDs.
- The project manifest registers every project-owned authority path, stable ID, owner/scope, optional section boundaries, mandatory modes, and current content hash. Native docs outside `.agent-guides/project/` participate only through such an exact record.
- Project policy may specialize or strengthen generic guidance within the project's authority. It cannot lower runtime/tool effects, remove package mandatory authority, manufacture Production/credential/data/cost/destructive authority, or silently redefine package role IDs.
- Precedence is monotonic: runtime/tool effects and explicit host authority remain highest; project protected-effect and mandatory policy are added before generic optional context; conflicts that cannot be composed stop protected work.
- Project manifests distinguish `expected_hash` (last explicitly reviewed/recorded bytes) from `observed_hash` (current CLI observation). Project-owned files remain current project authority when edited; a mismatch is reported as `project-authority-dirty`, not silently rejected or auto-rewritten.
- Ordinary CLI and inline routing both load the current project bytes and include the same mandatory IDs. CLI can attach the observed mismatch; inline reports freshness as unobserved unless the host supplied evidence. Neither may claim reviewed/clean provenance from the stale expected hash.
- Formal release/evidence operations that require reviewed project authority fail until an explicit `apg project refresh-authority`-type operation previews the hash diff and the owner records the new expected hashes. Normal `context` never refreshes them as a hidden mutation.
- Inline/CLI drift fixtures cover edited bytes with stale manifest, reviewed refresh, clean checkout, missing file, and changed mandatory IDs; they compare included authority while preserving the intended/observed/effective distinction.
- `apg context`, inline routes, update validation, and lifecycle shrink share one frozen oracle proving that mandatory project authority is included exactly and cannot be displaced by generic ranking or token budgets.

A project file absent from this registry is ordinary documentation, not silently promoted governance authority.

## 6. Selective document closure

Selective installation is a containment control. If routing instructions decay and an Agent recursively reads the project, the maximum available APG corpus is still the selected closure.

Selection is deterministic, not LLM-guessed. Inputs are:

- mandatory core authority and failure behavior;
- lifecycle preset;
- required planes and roles;
- project profile/facets;
- overlays;
- protected-effect guidance;
- explicit project mandatory IDs;
- transitive document dependencies.

The generated manifest records source IDs, release/source hash, installed path/hash, ownership, dependency reason, and excluded optional modules. The builder rejects undeclared dependencies and route references to uninstalled content.

Distribution-asset granularity and installed closure granularity are distinct only where doing so cannot pull an excluded role/profile/overlay. A core archive may pack several independently addressed mandatory core entries, but role, profile, overlay, and optional procedure assets remain separately downloadable. The manifest permits extraction and verification at file or ID granularity, and installed lifecycle closure proves excluded roles are absent.

Canonical module identities include:

```text
core
role-development-<role>
role-production-<role>
profile-<type>
overlay-<domain>
procedure-<capability>
lifecycle-<preset>
```

Core assets may contain multiple mandatory core files; installing `maintenance` still downloads and publishes only its declared role/profile/overlay/procedure closure and does not download or publish Developer content. Section routing remains a context-loading optimization inside an installed module.

### 6.1 Lifecycle presets

| Preset | Included authority | Typical use |
|---|---|---|
| `active-development` | Developer, Maintainer, Reviewer, Verifier, selected Production roles and project profile | evolving project |
| `maintenance` | Maintainer, Reviewer, Verifier, release/recovery and selected Production roles | released project accepting fixes |
| `operations-only` | User, Operator, recovery and protected-effect guidance | separately operated artifact/service |
| `frozen-reference` | read-only provenance, usage, integrity and archive policy | deliberately immutable archive |
| `release-build` | Developer/Maintainer, Reviewer, Verifier and release authority; Production only when selected | formal release preparation |

A release tag or published artifact does not imply `operations-only` or `frozen-reference`. Maintenance, security fixes, compatibility work, and preparation of a later release still require Development authority. Lifecycle reduction is explicit, reviewed, reversible, and recorded in the project manifest.

### 6.2 Missing content

If a task requires an uninstalled role/profile/module:

- do not substitute another role or retrieve `latest`;
- report the exact missing module and required lifecycle/profile expansion;
- ordinary inspection continues only when project policy permits degraded operation;
- protected, production, migration, or release work stops;
- a human authorizes materialization of the expanded closure;
- the resulting project diff is reviewed and committed.

Task-time silent network retrieval is not selective installation; it reintroduces an unrecorded runtime dependency and is rejected.

## 7. Deployment channels for project-local presets

All channels must produce byte-identical project output for identical release/source content, descriptor inputs, lifecycle, roles, facets, and overlays.

### 7.1 Prepared GitHub Release document assets

This is the docs-only `embedded-local` deployment intent: download ready-to-use document modules without fetching the APG source repository or installing a persistent APG runtime.

Candidate assets:

```text
apg-docs-core-<version>.tar.gz
apg-role-development-<role>-<version>.tar.gz
apg-role-production-<role>-<version>.tar.gz
apg-procedure-<capability>-<version>.tar.gz
apg-profile-<profile>-<version>.tar.gz
apg-overlay-<overlay>-<version>.tar.gz
apg-bootstrap-inline-<version>.md
apg-docs-manifest-<version>.json
```

Modules avoid combinatorial per-project assets while allowing only relevant content to be downloaded. The release manifest owns module dependency edges and named lifecycle/profile closure recipes; an Agent must not infer a closure from prose, filenames, or remembered APG structure.

The docs-only channel has two safe forms:

- an exact published closure recipe whose modules, hashes, target paths, and generated routing inputs are completely declared by the release manifest; or
- a separately downloaded minimal one-shot materializer whose hash is pinned by that manifest and whose only purpose is verification, closure assembly, managed-block merge, and atomic publish.

If the requested combination has neither an exact recipe nor the verified materializer, deployment stops. It never asks the LLM to synthesize the closure or project manifest.

First-install trust does not come from hashes contained only in the downloaded manifest. Before download, the expected release-manifest digest must arrive through one owner-approved trust anchor: an explicit digest in the direct human request/project binding, a digest embedded in an already trusted APG CLI, or a separately authenticated release channel defined by a later signing ADR. A Git tag, release name, URL, or downloaded checksum file alone is locator metadata, not identity. Without an expected digest, deployment may preview metadata but cannot publish or claim verified content.

Closure recipes use a versioned schema with canonical UTF-8/LF byte rules, normalized relative paths, fixed archive metadata, declared merge inputs, and a reference interpreter/materializer behavior. The fixture corpus runs both recipe-only and one-shot-materializer paths where both are supported and requires byte-identical project output, including manifest and managed block.

A manual Agent may use `curl` as transport only:

1. download the pinned manifest, its exact closure recipe, the listed document assets, and the one-shot materializer only when the recipe requires it;
2. verify the expected release/digest and every downloaded SHA-256 locally;
3. validate that the recipe exactly matches the requested lifecycle, roles, facets, overlays, router variant, and target layout;
4. extract and assemble into a temporary project tree using declared paths;
5. compute and verify the selected project manifest with the verified materializer or the recipe's deterministic local procedure;
6. merge the managed `AGENTS.md` block with normal file-edit capability or the verified one-shot materializer;
7. atomically publish the selected documents;
8. delete temporary downloads.

Never use `curl | sh`, `curl | node`, execute unverified network content, or fetch `latest`.

### 7.2 Shared one-time CLI

A human may tell an Agent once to run `apg help`, discover the explicit deployment command, and materialize `selected-inline`, `selected-cli`, `self-contained`, or `full-local-dangerous` output.

`help` remains read-only. Deployment uses a separate explicit mutating command. For inline output, the shared CLI may be removed afterward; later verification/update/expansion then requires reinstalling it or using prepared assets.

### 7.3 Source-checkout one-time CLI

A human may tell an Agent to inspect help from an APG source checkout and materialize a consumer project. The source command records revision, observed digest, and dirty state. Dirty source output is development-only provenance and cannot claim immutable release identity.

After consumer materialization, ordinary routing uses consumer files. Consumer-specific content is never written into APG source.

## 8. CLI context compiler

The CLI must provide the routing capability that an inline LLM router would otherwise perform. It accepts natural-language task text and optional explicit facts, then returns the final selected content in one call.

Conceptual interface:

```text
apg context --target . --task "fix login recovery" --path src/session/recovery.ts
apg context --target . --role maintainer --mode code \
  --task "fix login recovery" --path src/session/recovery.ts
```

`context` replaces the Agent-facing `resolve -> parse IDs -> load` sequence. Lower-level commands may remain for tooling and diagnostics.

### 8.1 Deterministic matching order

The CLI does not invoke an LLM.

1. Validate the project binding, runtime/source identity, lifecycle, selected modules, project authority registry, and containment policy.
2. Classify declared project/runtime protected effects before role recommendation using local deterministic metadata and bounded lexical signals. This screening consumes no LLM context. Lexical matching may recommend ordinary Development routes but cannot itself grant authorization or lower runtime/tool effects.
3. When declared effects or strong deterministic signals identify Production, destructive, durable migration, release/promotion, credential, private-data, material-cost, physical, or safety-critical work, require explicit plane/role/mode or return one compact structured choice. A high lexical score never bypasses a known gate.
4. Accept that natural language can still be misclassified, including a false negative that looks ordinary. Routing is context selection, not authorization: credentials, data, cost, destructive actions, Production writes, and other protected effects remain gated by the host/tool/runtime even when the wrong role was loaded. Do not compensate by loading every possibly relevant safety or role document.
5. Apply explicit plane/role/mode/task-kind inputs, while preserving monotonic runtime/tool effects.
6. Match exact project/package IDs and aliases with namespace and precedence validation.
7. Match changed/current path to registered project owners and package module contracts.
8. Score ordinary task text using normalized tokens, identifiers, filenames, headings, phrases, CJK n-grams, and bounded BM25-style lexical ranking.
9. Add project mandatory authority, package mandatory authority, and transitive dependencies.
10. Deduplicate exact IDs while preserving declared precedence/order.
11. Apply per-subject and aggregate context budgets without removing mandatory authority.
12. If the top ordinary classifications remain materially ambiguous, return a compact structured choice instead of guessing or union-loading roles.
13. Revalidate package and project hashes before returning content.

The project lifecycle/selected view is a hard CLI allowlist. Normal `context`, `search`, and `load` do not expose documents outside it. Expansion is a separate explicit mutating operation.

### 8.2 Output formats

For an Agent:

```text
apg context --format context
```

Return compact directly readable content with minimal ID/provenance framing and no redundant source envelopes.

For CI, verification, and audit:

```text
apg context --format json
```

Return selected IDs, hashes, matching reasons/scores, budgets, release/source observation, ambiguity, and content.

Both outputs report intended sources. They do not claim model-effective context.

### 8.3 Shared-store soft containment

For `shared-runtime`, generic documents should be stored outside consumer workspaces in a content-addressed packed archive, database, or executable resource rather than a browseable Markdown tree. Normal help/output does not reveal the storage path; wildcard/empty-query full output is unavailable; full export is a separate clearly dangerous management command.

This reduces accidental full-corpus reads when Agent routing memory degrades. It does not stop a same-user Agent with unrestricted filesystem/process access from deliberately locating and extracting the store. Reports must call this soft containment.

### 8.4 Inline/CLI authority parity

Inline and CLI routers consume the same canonical role/mode IDs, aliases, path ownership, mandatory sets, lifecycle/module allowlist, and context budgets. They do not promise identical natural-language classification: inline selection is performed by the host LLM and may vary, while CLI matching is deterministic.

A shared frozen task corpus compares both strategies on the properties that must agree:

- every explicit role/mode/ID/path case selects the same mandatory authority;
- neither route escapes the selected module/lifecycle view;
- protected or ambiguous cases stop or ask rather than silently choosing a weaker route;
- both satisfy the exact mandatory-recall oracle and report intended sources without claiming model effectiveness;
- differences in optional ranked context are recorded and evaluated against token budgets and task evidence rather than hidden.

CLI routing cannot be described as equivalent to inline routing until these gates pass; byte-identical context is not required unless the inputs already specify exact IDs.

The frozen corpus includes ordinary tasks, explicit roles, CJK/identifier/path cases, misleading high-score phrases, negation, quoted untrusted text, mixed Development/Production language, and every protected-effect class. Deterministic gates require zero mandatory project/package misses for exact cases, zero selected-view escapes, and zero auto-selection after a declared/recognized protected-effect gate fires. They also set preregistered bounds for ordinary false-positive selection, protected false negatives, and clarification rate. The plan makes no universal claim that arbitrary natural language cannot be assigned the wrong role; observed high-confidence protected misses block the candidate corpus gate, while runtime/tool effects remain the ultimate consequence boundary.

Inline evaluation is observational, not deterministic proof. Each pilot freezes host/provider/model/version, complete prompt/bootstrap, project revision, task corpus and denominator, temperature/effort where controllable, repetition count (at least three per task), source-observation method, mandatory/ambiguity oracle, and pass thresholds before execution. Results distinguish intended, host-observed, and model-effective-unknown inputs. A different model or host requires a new observation set; it does not inherit equivalence from the prior one.

### 8.5 Token-budget discipline

Safety routing must not defeat the context budget:

- protected-effect screening and lexical ranking run inside the CLI and add no LLM tokens;
- ambiguity returns one compact choice record with a preregistered maximum size instead of loading multiple role guides;
- uncertainty never causes union-loading of roles, profiles, or generic security documents “just in case”;
- common effect/authority invariants live in one compact mandatory core and are not duplicated across every role;
- `context` framing has its own byte/token cap, and mandatory content growth requires a named failure mode plus before/after measurement;
- every preset records cold-start, ordinary-route, protected-clarification, and worst-case allowed context estimates using the declared estimator, plus actual host usage only when observable;
- a candidate fails if P95 or maximum context exceeds its preregistered budget; it must reduce optional context or explicitly revise and re-review the declared budget before rerun. Mandatory project/package authority is never traded away to meet a token target.

The objective is bounded consequence and measured routing quality, not impossible proof that an LLM never chooses the wrong role.

## 9. Permanent `AGENTS.md` strategies

### 9.1 Inline router

Used by `selected-inline` and optionally `self-contained`/`full-local-dangerous`.

The managed block directly contains the smallest stable route/classification instructions and local paths. It does not add a mandatory `BOOTSTRAP.md` hop when the same routing bytes would immediately enter context; this avoids one instruction line, one read, and tool-output overhead.

Large route data may remain in `ROUTES.jsonl` for verification or exceptional lookup, but normal small-project routing should not require loading it wholesale.

### 9.2 CLI dispatcher

Used by `selected-cli`, `shared-runtime`, `source-worktree`, and optionally `self-contained`/`full-local-dangerous`.

The managed block is intentionally short, conceptually:

```text
Before work, run `apg context --target . --task <current task> --format context`
and use only the returned governance content. Resolve ambiguity before protected work.
```

This prompt declares a persistent runtime dependency. Missing or incompatible CLI behavior is explicit; it cannot silently fall back to unrelated local docs or `latest`.

The router strategy determines runtime dependency and therefore belongs in the project descriptor and validation output.

## 10. Executable placement

| Placement | Purpose | Runtime dependency |
|---|---|---|
| none after deployment | selected inline documents route directly | none |
| shared CLI | deploy/update many projects or power CLI-routing modes | required only by CLI-routing projects |
| project CLI | fully offline pinned routing/update/CI/recovery | required when project selects CLI routing |
| source CLI | APG self-development and source-mode evaluation | required by source-worktree |

Do not copy a CLI into every project merely because documents are local. Project-local executable placement requires an explicit offline, CI reproducibility, recovery, or self-contained-runtime requirement.

## 11. Shared runtime

`shared-runtime` provides one generic corpus and one CLI for many projects. A project retains only project-specific policy/binding and its selected-view declaration. It does not copy or update generic APG documents.

Two release policies are allowed:

```text
pinned digest          reproducible; project explicitly adopts another release
compatible channel     central stable update within a declared compatibility major
```

A compatible-channel release publishes machine-readable compatibility edges from each still-supported prior digest. Each edge covers descriptor schema, route/section IDs and hashes, aliases, module/lifecycle names, mandatory-set additions/removals, context-output schema, declared semantic changes, and required migrations. Full semantic equivalence is not machine-decidable; the publisher owns the declaration, while executable checks enforce structural compatibility, mandatory-set monotonicity, protected-route invariants, and replay of frozen route oracles.

There is no central project registry and no global “all projects activated” pointer. The shared store may install multiple immutable candidate generations and generic channel metadata, but each project lazily evaluates a candidate on its first later `context` call. The CLI reads that project's binding/selected view, follows an exact compatibility edge from its last accepted/base digest, and replays the selected-view and route oracles. Offline, moved, unmounted, or unknown projects require no enumeration and keep their last accepted/base digest. Failure retains that project’s prior digest and never falls back to `latest` or affects other projects.

Compatible-channel acceptance uses an explicitly declared project-local ignored state file such as `.agent-guides/local/channel-state.json`; it is project-specific, never centralized or committed, and its location/ownership is part of the descriptor contract. Publication takes a project-local lock, compares the expected prior receipt revision/digest, writes and fsyncs a temporary receipt, then atomically renames it. Stale concurrent writers retry validation against the winner or stop. Interruption before rename leaves the previous receipt valid; malformed receipts fail closed to the descriptor’s base/last valid digest.

A read-only project never mutates during `context`: it uses its last valid receipt/base digest, reports a compatible candidate as pending, and requires an explicit later activation in a writable project. Receipt writes are disclosed in CLI effects, never touch tracked files, and fixtures require clean Git status. Project initialization owns the ignore rule; if ignore coverage is absent or untrusted, automatic receipt publication stops instead of dirtying the worktree.

Every `context` invocation resolves exactly one digest and returns content from only that digest plus a generation handle. A workflow needing later APG calls passes `--generation <handle>` (or equivalent opaque lease) to lower-level calls and includes it in subagent assignments; calls without the required handle or against another generation fail rather than mix releases. Handles bind digest, project identity, selected-view revision, creation time, and bounded expiry. Crash cleanup may expire handles but never rebind them. Atomic store publication retains referenced digests until leases expire, then garbage-collects only unreferenced verified generations.

Candidate installation occurs in generic quarantine: download/import, manifest/hash validation, compatibility-edge checks, freshness/downgrade policy, and generic smoke tests complete before it becomes an available immutable generation. It does not activate any project. Per-project lazy activation then runs the selected-view checks above; failure leaves that project's previous receipt/base digest untouched and records rejection only in the project. Automatic downgrade is forbidden unless an explicit recovery policy authorizes the exact prior digest. Breaking compatibility always requires explicit project adoption and a dry-run migration.

The CLI enforces the project selected view, but physical containment depends on host isolation as described in section 2.

## 12. Source-worktree

This is a real runtime preset for APG itself, not only a deployment channel.

- The APG source checkout must remain present.
- Source CLI and canonical source documents are used directly.
- Every invocation observes revision, content digest, and Git clean/dirty/unknown state.
- Mutable/dirty source cannot satisfy immutable release or cache-evidence gates.
- The same deterministic `context` matcher is exercised against source content.
- Project-specific APG self-policy remains in the APG project; consumer-specific data never enters this source tree.
- Corpus containment is none because the full source corpus is locally readable.

A source CLI may also materialize consumers, but those consumers do not become source-worktree runtimes.

## 13. Full-local dangerous mode

`full-local-dangerous` copies the complete generic document corpus into the project. It supports inline or CLI routing but intentionally provides no corpus containment.

The descriptor and validation output must expose this state explicitly, for example:

```json
{
  "document_set": "full-local",
  "containment": "none",
  "risk": "all-governance-documents-readable"
}
```

Use cases include APG research, routing/debug work, complete offline archives, and experiments that genuinely require many profiles. It is never the default and cannot claim that unused documents are unavailable when routing constraints fail.

Full-local still uses manifest ownership, exact release/source provenance, route budgets, update conflict retention, and no automatic staging/commit.

## 14. Update, shrink, rollback, and reproducibility

- Replace only manifest-owned generic files whose installed hash matches the previous receipt.
- Preserve project-owned and edited managed files as explicit conflicts.
- Any ownership/hash/merge conflict aborts generation activation. New routes and new documents remain quarantined together; the complete old generation remains active. Protected work cannot route through a mixed or conflicted generation.
- Use exact managed markers and byte-preserving merge/rollback for `AGENTS.md`.
- Remove only unchanged receipt-owned files when lifecycle/profile/role selection shrinks.
- Build descriptor/routes/index/documents as one quarantined candidate generation and validate every cross-reference and authority oracle before touching active files.
- Do not claim one filesystem rename can atomically replace root `AGENTS.md`, a root descriptor, and `.agent-guides`. Activation uses a journaled two-phase transaction with project-local lock, expected-hash compare-and-swap, durable backups, and idempotent recovery.
- Phase 1 writes a compact managed `transition-blocked` marker to the root instruction block so new Agents safe-stop protected work, then publishes the candidate document tree/routes/descriptor through ordered fsynced renames. Phase 2 revalidates the complete active view and writes the final inline/CLI managed block last. The journal becomes committed only after final verification.
- Interruption at any write leaves either the old valid generation or an explicit transition-blocked state; the next invocation must complete or roll back before normal routing. No partial state may claim ready.
- Restore prior descriptor, router, selected set, managed block, and docs on rollback before migration finalization.
- Never silently change a router from inline to CLI or vice versa.
- Never silently change selected-local to shared/full/source placement.

Migration from a provider that retained a full local corpus has two explicit states:

1. **reversible transition:** old provider bytes and exact rollback remain available inside a declared project recovery area; `workspace_containment` is `transitional`, and recursive/exhaustive exposure reports include legacy mirrors, archives, caches, receipts, ignored trees, and recovery bytes;
2. **finalized selected-local:** after owner review and successful new-generation evidence, an explicit finalize operation removes unchanged package-owned legacy generic bytes. Only then may validation claim selected-local workspace physical containment.

Finalization does not delete project-owned prior policy. After finalization, restoring the old generic provider requires rehydrating its pinned digest from a verified source; offline exact rollback of removed generic bytes is no longer claimed unless the owner retains an archive, in which case containment remains transitional. This tradeoff is shown before finalization.

## 15. Compatibility and version boundary

`2.0.0` remains immutable and all deployed modes continue as released.

The new matrix changes project-content ownership, router/runtime dependencies, and provider semantics. Therefore:

- accept a new ADR before implementation;
- assume a next-major descriptor/bootstrap boundary for the complete redesign;
- allow an additive `apg context` command earlier only if it changes no existing command or descriptor behavior;
- provide dry-run migration from current embedded, thin, and self-host descriptors;
- preserve exact rollback to the old descriptor/bootstrap/provider bytes during the declared reversible transition, then require explicit owner finalization before dropping old generic bytes and the offline rollback claim;
- keep existing projects operational until explicit owner adoption.

## 16. Development phases

### Phase A: ADR, evidence, and fixed fixtures only

1. Inventory canonical documents, source/runtime-only files, current provider imports, project-authority inputs, role/profile dependencies, and token costs.
2. Define descriptor fields and schema constraints for stable variant ID, document placement, router, executable dependency, lifecycle, selected view, release policy, `workspace_containment`, and `host_corpus_exposure`.
3. Define project authority namespace/precedence, manifest ownership, exact mandatory behavior, and deterministic role-granular module closure.
4. Specify `apg context` classification, protected-effect recommendation boundary, ambiguity, project/package precedence, output, generation handle, token budgets, and selected-view enforcement.
5. Freeze fixtures for every stable variant, lifecycle, project-authority case, prepared-asset trust path, migration state, and conflict state.
6. Define compatible-channel edges, per-project lazy activation, route-oracle replay, digest lease/retention/GC, candidate quarantine, freshness/downgrade, rejection, and mixed-generation behavior.
7. Freeze the deterministic CLI corpus and the host/model-specific observational inline protocol; decide additive CLI versus next-major implementation boundaries.

Exit: reviewed ADR, paper schemas, compatibility matrix, fixed fixtures, and acceptance oracle. No runtime implementation.

### Phase B: deterministic context compiler

1. Implement matching and direct context output in reusable libraries without invoking an LLM.
2. Preserve lower-level resolve/load behavior for compatibility.
3. Test explicit role/mode, project authority, natural-language tasks, paths, aliases, CJK, identifiers, adversarial/negated protected language, ambiguity, no-union behavior, budgets, mandatory recall, and hash drift.
4. Enforce that recognized protected routing yields a compact explicit choice while residual role error cannot lower runtime/tool effects.
5. Exercise shared and source corpora without changing deployed provider semantics.

Exit: additive context command is proven within preregistered token/recall/error bounds or deferred to the next major; no consumer migration.

### Phase C: selected-document builder

1. Build role-granular modular document assets and deterministic selected closures.
2. Reject undeclared references, source-only leakage, path traversal, case collisions, duplicate ownership, missing dependencies, and assets that bundle excluded optional roles/profiles/overlays.
3. Produce inline bootstrap, route data, project-authority registry inputs, project manifest, versioned closure recipes, independently anchored release manifest, prepared assets, and full-local manifest.
4. Prove recipe-only and verified one-shot-materializer output parity.
5. Measure downloaded bytes, published workspace corpus, host exposure, and permanent bootstrap tokens for each lifecycle/variant.

Exit: reproducible assets exist; no project mutation is enabled.

### Phase D: one materializer, multiple inputs

1. Accept verified prepared assets, shared installed content, or source-checkout content.
2. Produce byte-identical selected/full project trees for identical inputs.
3. Implement dry-run diff, apply, expansion, shrink, all-or-nothing conflict quarantine, uninstall, pre-finalization rollback, explicit migration finalization, and journaled two-phase cross-file activation.
4. Inject interruption before/after every root-block write, descriptor/tree rename, fsync boundary, and final journal commit; retry must complete or restore exact prior bytes.
5. Validate project/package authority and every route/document cross-reference before final activation.
6. Keep help read-only and all mutations explicit.

Exit: selected-inline and self-contained clean clones route without external APG; no existing project is changed automatically.

### Phase E: runtime preset pilots

1. Pilot every stable variant ID on temporary project copies.
2. Exercise `source-worktree.cli` on APG itself.
3. Exercise both full-local dangerous router variants with explicit exposure reporting.
4. Simulate instruction decay by recursive workspace reads and separate host-store discovery; measure maximum available corpus per mode.
5. Test per-project lazy shared updates, compatibility-edge/oracle rejection, generation-handle propagation to subagents/lower-level calls, abandoned-lease cleanup, CLI removal, missing CLI, expansion, lifecycle reduction, conflict quarantine, reversible migration, finalization, rehydrated rollback, and legacy-corpus exposure.

Exit: each preset's dependency and containment claim matches observed behavior; owner-approved adoption may begin.

## 17. Acceptance matrix

| Scenario | Required result |
|---|---|
| finalized selected-local recursive workspace read | unselected APG modules, legacy mirrors, rollback archives, caches, and ignored generic releases are absent |
| reversible migration recursive/exhaustive read | containment reports transitional and enumerates all retained legacy/recovery exposure |
| stable variant validation | every listed variant passes schema fixtures; every unlisted combination is rejected |
| shared-runtime normal context request | only selected-view content is returned within budget |
| shared store directly readable by same-user Agent | report observed soft exposure, never physical host isolation |
| host exposure bounded scan finds nothing | report `not-observed-bounded-scan` or `unknown`, never unproven `none` |
| source-worktree | fresh revision/digest/dirty state; no immutable claim for dirty source |
| full-local-dangerous | full corpus present and explicit no-containment warning |
| inline normal task | no CLI or mandatory bootstrap-file hop |
| CLI normal task | one context call returns final bounded content |
| ordinary natural-language ambiguous task | compact structured choice; no guessed or union-loaded route |
| natural-language recognized protected task | compact explicit role/plane choice; no role union or autonomous protected authorization |
| protected false-negative corpus | measured against preregistered bound; runtime/tool effects still cannot be lowered |
| context token budgets | cold/P95/worst-case and clarification outputs remain within frozen per-variant caps |
| project mandatory authority | inline and CLI include exact project IDs before generic optional context; collisions/conflicts fail closed |
| edited project authority with stale expected hash | both load current mandatory bytes; CLI reports dirty, inline freshness unobserved, formal release evidence blocks until explicit refresh |
| explicit project-authority refresh | previews/records expected hashes; normal context never performs hidden refresh |
| prepared assets | only selected role/profile/overlay/procedure modules downloaded; all bytes verified before extraction |
| prepared docs first-install trust | expected manifest digest comes from an independent owner-approved anchor, not the downloaded checksum file |
| prepared docs-only combination | versioned exact closure recipe or verified one-shot materializer; LLM never invents dependencies/manifests |
| recipe/materializer parity | canonical paths/bytes and complete materialized project tree are byte-identical |
| deployment channels, same inputs | byte-identical materialized output |
| inline versus CLI explicit route cases | identical mandatory authority and selected-view containment |
| inline versus CLI natural-language cases | both pass mandatory/ambiguity oracle; optional context differences reported |
| fresh selected-inline clone, no CLI | direct routing and selected loading pass |
| selected-cli missing CLI | explicit runtime-missing failure |
| shared compatible-channel update | project lazily validates an exact compatibility edge/oracles, then records the new accepted digest only in that project |
| offline/moved/unmounted shared project | requires no central registry and retains its last accepted/base digest |
| concurrent first compatible-channel use | one CAS receipt wins; stale writer revalidates/retries without mixed generation or dirty Git |
| read-only compatible-channel project | uses last valid/base digest and reports candidate pending without mutation |
| interrupted receipt publication | previous receipt remains valid; temp/lock recovery is deterministic |
| shared compatible-channel candidate changes mandatory semantics | publisher diff plus route-oracle replay fails closed when invariants do not pass |
| shared compatible-channel candidate removes required ID | activation fails closed and prior digest remains active |
| shared update during multi-call/subagent workflow | returned generation handle keeps every call on one digest |
| abandoned/expired generation lease | cleanup never rebinds it; referenced generations retained, unreferenced candidates safely collected |
| pinned shared project | central update does not change selected digest |
| maintenance lifecycle | Developer/feature files and catalog IDs absent; maintenance/release/recovery retained |
| operations-only lifecycle | every Development file/ID absent; User/Operator/recovery present |
| frozen-reference lifecycle | mutation roles absent; provenance/read-only policy present |
| released but maintained project | maintenance roles remain available |
| missing unselected role | explicit expansion required; no silent retrieval/substitution |
| update edited managed/project file | entire candidate generation remains quarantined; old generation routes unchanged and project bytes preserved |
| cross-file activation kill points | every pre/post rename, root-block write, fsync and journal-commit interruption recovers to old ready or explicit transition-blocked state |
| transition-blocked project | normal/protected routing cannot claim ready until idempotent complete/rollback succeeds |
| lifecycle shrink | only unchanged receipt-owned files removed; resulting file/ID closure revalidated |
| pre-finalization rollback | prior descriptor/router/manifest/managed block/docs restored exactly |
| migration finalization | explicit tradeoff accepted; legacy generic recovery corpus removed before physical workspace containment claim |
| post-finalization old-provider rollback | requires verified pinned rehydration or reports unavailable offline; no hidden archive |
| project Git status | no automatic staging/commit or unrelated changes |
| Windows support claim | blocked until real install/context/update/rollback smoke passes for the relevant presets |

Record selected document bytes, physically available corpus bytes, permanent bootstrap tokens, CLI output tokens, matching misses, ambiguity, and mandatory recall. Optimize none in isolation.

## 18. Stop conditions

Stop and return to design if implementation would:

- call soft containment a security or physical boundary;
- make `selected-inline` depend on an undocumented CLI;
- make every inline Agent read another bootstrap file without measured benefit;
- let normal CLI commands list/export the entire corpus or escape the selected view;
- use `curl | sh`, execute unverified downloads, or fetch `latest`;
- store project-specific content outside the project;
- merge managed and project-owned bytes without machine-readable ownership;
- let an Agent infer prepared-asset dependency closure or synthesize a project manifest from prose;
- require a central registry of consumer projects for compatible-channel activation;
- claim natural-language role selection is infallible or compensate for uncertainty by loading multiple roles/security corpora beyond budget;
- activate a compatible-channel release without declared prior-digest edges, per-project route-oracle checks, generation isolation, and fail-closed rejection;
- retain hidden full-corpus rollback bytes while claiming finalized selected-local workspace containment;
- claim inline and CLI natural-language routing are equivalent without shared mandatory/ambiguity evidence;
- infer lifecycle reduction from release state alone;
- silently switch document placement, router, executable dependency, or release policy;
- combine mode redesign with MCP, external workspace state, semantic retrieval, or unrelated evidence infrastructure;
- mutate existing `2.0.0` projects without explicit dry-run adoption and tested rollback.

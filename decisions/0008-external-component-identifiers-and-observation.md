# 0008: External component identifiers, capability states, and declaration observation

Status: accepted
Date: 2026-09-20
Scope: how APG names an external component, how it states that component's capability, and how it grades a declaration it observed
Deciders/owner: project owner with development/maintainer
Supersedes: none
Superseded by: none

## Context and evidence

ADR 0007 fixed the product boundary: APG owns authority, the execution stack owns mechanism; external components are *referenced, never owned*; a missing external component is never an APG error; and a referenced capability is reported as `available`, `degraded`, or `not-installed`, never as "supported". What 0007 did **not** settle is what to *call* an external component and how to grade a claim made by one.

The 2026-09-20 writer census supplied the evidence. Eleven root-instruction writers were driven with their own released binaries or their own scripts (28 confirmed negatives), all from `github.com/Dicklesworthstone/`; measurement records live in `plans/MULTI_AGENT_INFRA_INTEGRATION_RESEARCH.md` §13.12–§13.18 and, for the minimal external subset, in `scripts/external-components.json`. Four measured asymmetries decide this ADR:

| Measured fact | Evidence |
|---|---|
| The invocation name is **not** the repository directory name | `ee` (`eidetic_engine_cli/Cargo.toml` `[[bin]] name = "ee"`), `cass` (`coding_agent_session_search/Cargo.toml:243`), `sbh` (`storage_ballast_helper/Cargo.toml:14`), `cm` (`cass_memory_system/package.json` `bin.cm`) |
| One tool ships **several marker versions at once**, so a version cannot be part of the identifier | `beads_viewer` emits `v7` in code (`pkg/agents/blurb.go:14/19/21`) and its own `README.md` is `v7`, while its own `AGENTS.md` is `v5`; 31 of 39 surveyed checkouts still carry `bv-agent-instructions-v1` |
| Two writers identify their own block by **prefix** match, so prefix comparison is unsafe | `br` (`beads_rust`) and `bv` (`beads_viewer`) both match their own name as a prefix, which would let `...:external:br` match `brx` |
| Integrity and backup conventions are **mutually different**, so a bare hex digest carries no meaning | `br` uses `.md.bak`, `ee` uses `.ee-backup`, `ubs` uses `.backup`, `bv` takes **no backup at all** |
| Dot-directories collide across unrelated components | `.cass/` is used by `cass_memory_system` (`.cass/playbook.yaml`, `.cass/config.yaml`, …) and independently by `coding_agent_session_search` (`.cass/proofs/proof-manifest.jsonl`, `src/lib.rs:9916`); their command names are `cm` and `cass` |

The observation question comes from the other direction. The external memory component's trust ladder (`.85 human_explicit > .75 peer_human_attested > .65 agent_validated > .50 agent_assertion > .45 cass_evidence > .30 legacy_import`) has no signer identity and no quorum: `peer_human_attested` proves that "a member declared it", not that a human typed it. And that component carries **at least four mutually incompatible numeric ladders** — `initial_confidence` 0.85…0.30 (`src/models/trust.rs:92-101`), the `ask` trust tilt 1.00…0.40 (`src/core/ask.rs:458-468`), pack rank 6000…1000 (`src/pack/mod.rs:2132-2141`), hotset 1000…300 (`src/cache/hotset.rs:835-844`) — so a bare number from it is uninterpretable.

## Constraints and decision drivers

- **Non-distributed by construction.** `decisions/` is not part of the distribution surface (`lib/materializer.mjs` `DIST_DIRS`), so nothing here reaches a consumer's contract until decision 2 (a declarative capability manifest) is opened. That is deliberate: the rules are recorded, reviewable, and ready to publish, without adding surface area for a contract that has no consumer.
- **Reference, not authority (ADR 0007).** These are identifiers and observation grades. None of them is a permission, and none may be read as one.
- **A declaration is not a fact.** APG must never round "observed a claim" up to "observed the claim to be true" — the same discipline that separates `intended` from `host-observed` in ADR 0007.
- **No new dependency.** Nothing in this ADR may make an external component's presence a precondition for APG to function.

## Decision

**1. Namespace convention (signed by the owner, 2026-09-20).** APG refers to an external component as `agent-project-guides:external:<command-name>`, subject to four rules:

| Rule | Content | Why it is not optional |
|---|---|---|
| `<command-name>` is the **binary invocation name** | not the repository directory name | `ee`/`eidetic_engine_cli`, `cass`/`coding_agent_session_search`, `sbh`/`storage_ballast_helper`, `cm`/`cass_memory_system` all differ |
| The **version is a field, not a namespace segment** | version travels with the reference | one tool emits three marker versions at once; a namespace that embeds a version changes whenever upstream moves |
| Namespace matching is **lexically bounded** | `…:external:br` never matches `brx` | both surveyed prefix-matching writers would otherwise be confused with each other |
| Integrity is the **triple `{state, algo, digest, scope}`** | never a bare hex digest | `.md.bak` / `.ee-backup` / `.backup` / no-backup are not comparable as a single field |

Rejected: repository directory names (long and inconsistent with the invocation name); version-as-namespace-segment (renames the namespace on every upstream release); dot-directory names (`.cass/` is already claimed by two unrelated components).

**2. Capability state stays `available` / `degraded` / `not-installed` (ADR 0007) and stays out of the distribution surface.** The previous owner item "should the capability vocabulary enter the distribution surface" is answered **no** for now: the vocabulary is already recorded in a non-distributed decision record (ADR 0007), which is where it belongs until decision 2 opens. Degradation is stated when a mechanism exists only in weakened form — for example mutual exclusion without leasing — never rounded up to present.

**3. `declaration-observed` is introduced, and used in this record only.** It names the grade: the host observed that an external system *declared* X, while X itself is unverified. Consequences that follow from it:

- The external trust ladder remains **attention-ranking only, never authority**; no tier grants a capability.
- Four of its tiers map to `intended`. `peer_human_attested` maps the **declaration** — hence `declaration-observed` — never the tier's truth.
- Citing a ladder number **requires the scale name** (for example `ee.trust.initial_confidence`), because at least four incompatible ladders use the same numeric range.
- The term does **not** enter the formal vocabulary yet. The owner withheld that signature because entering the vocabulary is a public-contract change; it is carried here so that the distinction cannot be lost, and it is a ready-made entry for decision 2.

## Alternatives considered

| Alternative | Benefit | Rejection/tradeoff reason |
|---|---|---|
| Identify components by repository directory name | Directly greppable against a checkout | Long, unstable, and inconsistent with the invocation name the user actually types; measured on four components |
| Put the version in the namespace (`…:external:ee:v3`) | Version becomes visible in the identifier | Renames the namespace on every upstream release; one surveyed tool already ships three marker versions simultaneously |
| Name by dot-directory (`.beads`, `.ee`, `.cass`) | Matches on-disk state | `.cass/` is claimed by two unrelated components, so the name does not identify one thing |
| Record integrity as a bare digest | Simplest to compare | The surveyed writers disagree on what a digest even covers, and one takes no backup; a bare digest cannot express "what this hash is a hash of" |
| Add `declaration-observed` to the formal vocabulary now | Cheaper than revisiting it | It is a public-contract change with no current consumer; ADR 0007 already sets the rule that contract vocabulary is published deliberately |
| Treat `peer_human_attested` as a real attestation | Simpler mapping | It has no signer identity and no quorum; it proves a member declared something, which is exactly the distinction this ADR draws |

## Consequences

- Positive: external references are now unambiguous and comparable across components; the capability vocabulary has an explicit, non-distributed home instead of drifting into the distribution surface; the "declaration is not a fact" distinction has a name; and the four rules are reviewable against a measured table rather than argued from taste.
- Negative/risk: the convention is **not yet visible to consumers**, so an integrator who wants to reference an external component has to read a non-distributed record; `declaration-observed` is a term without a formal home, so it can be lost if this record is not kept; and the whole vocabulary presumes the component list stays honest — the identifiers are only useful if `scripts/external-components.json` and the census harness stay in sync with what is actually installed and driven.

## Validation and reversal

Validation: `scripts/test-boundary.mjs` (invoked by `scripts/test-release.sh`) asserts that the package manifest equals the packer's allowlist and that no distributed path names a surveyed third-party component, so this vocabulary cannot leak onto the distribution surface by accident. `scripts/test-external-provenance.mjs` pins the component inventory that the identifiers describe — its ids must match the staged directories the census harness actually drives. Lexical-boundary matching and "invocation name, not repository name" are checkable against the measured table in `plans/MULTI_AGENT_INFRA_INTEGRATION_RESEARCH.md` §13.12, which cites file and line for each entry. The owner's 2026-09-20 arbitration for these items is recorded in that plan's §13.19.

Signals for review: decision 2 (the declarative capability manifest) being opened, at which point rule 1 and `declaration-observed` become publishable content; a component changing its invocation name; a new component whose dot-directory collides with an existing one; a component that introduces signer identity or quorum, which would make `peer_human_attested` mean something stronger than a declaration.

Reversal: reversing rule 1 requires re-running the census that produced the table above, because each rule was chosen to make a measured failure impossible rather than on preference. Reversing rule 3's restraint (publishing `declaration-observed` and the capability vocabulary) is a decision-2 act, not an edit to this record.

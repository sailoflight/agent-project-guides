# 0010: The component store contract on the distribution surface

Status: accepted — implemented and measured: `lib/components.mjs` and `schemas/component-entry.schema.json` ship, the read-only `components` CLI group verifies and probes, and the first real store instance exists on this machine; the version moved to `4.0.0` in the same release
Date: 2026-09-20
Scope: opening decision 2 of ADR 0009 — what of the component store ships to consumers, what stays a maintainer procedure, and what the first real instance contains
Deciders/owner: the owner, verbatim 「都做」, after delegating both open choices (「你来决定吧 我希望各个项目都尽量使用现成的 别到处都是」)
Supersedes: none
Revises: ADR 0009 D7 (nothing on the distribution surface) and its follow-up items "lift the reference implementation" and "first real instance"
Superseded by: none

## Context and evidence

ADR 0009 recorded the store's contract and deliberately left two things out: the contract was pinned by a non-distributed gate that carried its own private copy of the validator, and no real store existed. Both were named as follow-up work. The owner then instructed 「都做」, which opens decision 2 and asks for the first real instance in the same step.

The evidence this record rests on:

| Fact | Evidence |
|---|---|
| The distribution surface is an explicit allowlist, not a directory walk | `DIST_DIRS` / `DIST_FILES` / `SCRIPT_FILES` in `lib/core.mjs`; `scripts/test-boundary.mjs:59` asserts the manifest equals `listDistributionFiles()` |
| `lib/` ships, and a new module under it ships with it | the manifest already lists `lib/observation-ledger.mjs` and `lib/root-marker-grammar.mjs`; `lib/components.mjs` joins them |
| A gate's own copy of a validator tests a helper no consumer runs | the pre-`0010` `scripts/test-component-store.mjs` carried its own `verify`, `validate` and `probe` implementations; the record at `HEAD` is the reference for what was duplicated |
| The command-group vocabulary is gated | `scripts/test-boundary.mjs:29-32` pins the group list and `:33` rejects a group that names a mechanism ADR 0007 assigns to the execution stack |
| `store` is a forbidden group name | `FORBIDDEN` in `scripts/test-boundary.mjs:33` — the name had to be `components` |
| The surface before this record | 83 files, digest `sha256:148974e8036a2551fd5cc8efcf3ae13f0febe13d7beec157fb9bb50ab10bb34f` (`bf6bafa`) |
| The staged bytes and the acquisition record | `.agent-scratch/external-test/bin/` (9 released artifacts) and the committed `scripts/external-components.json` |

## Constraints and decision drivers

- **Ship the contract, not a package manager.** ADR 0004 and ADR 0007 keep third-party bytes out of the package; a store that can fetch would re-import the boundary this project rejected.
- **A declaration without a shipped enforcement point is not a capability.** If the schema and the validator exist only in this repository, a consumer cannot act on the contract at all.
- **Acquisition is a maintainer procedure, not a product feature.** How bytes arrive (a release asset, a recorded digest, a human's approval) is not something a governance kernel should own.
- **Measured, not asserted.** The first instance has to exist and verify, or this record is a plan.

## Decision

**D1 — The contract ships; the acquisition does not.** `lib/components.mjs` and `schemas/component-entry.schema.json` join the distribution surface, which moves from 83 to 85 files. ADR 0009 D7 ("nothing enters the distribution surface in this step") is revised to: the *verification and discovery* contract is distributed, and every acquisition path remains outside it.

**D2 — The CLI group is named `components`, not `store`.** The boundary gate rejects a group name that denotes a mechanism (`FORBIDDEN` matches `store`), and the name should denote the product rather than the mechanism. The group offers exactly two read-only actions, `verify` and `probe`; an absent store is not an error and reports `present: false`.

**D2a — The two commands name their own domains.** `verify` reports `packages`,
`packages_total`, `reusable_packages`, `missing_packages`, `degraded_packages` and
`conflicted_packages`; `probe` reports `probed`, `services` and `reusable_services`. Neither publishes a bare `reusable`, and the probe's
aggregate no longer carries the constant `action: "none"`. The reason is a measured
misreading, not taste: the internal capability test read `reusable: []` from `probe` -
which only ever speaks about services - and concluded that nothing in the store was
reusable while nine packages verified as available. Found by testing, fixed before the
tag.

**D3 — The state vocabulary is unchanged.** `available` / `degraded` / `not-installed` / `conflict`, with `action: "none"` for anything not reusable. ADR 0009 D5 stands verbatim; no word is added for the shipped path.

**D4 — The builder is the acquisition path, and it stays non-distributed.** `scripts/build-component-store.mjs` consumes the committed acquisition record and materialises staged bytes into the digest-named layout. It never downloads, never repairs a broken entry, and treats a disagreement between the record and the bytes on disk as a hard failure (`record_mismatch`, exit 1) — that discrepancy is exactly what the record exists to catch. It hard-links when the store and the source share a filesystem and reports which it used (`link` / `copy`), because a hard-linked entry shares its inode with the staged copy.

**D5 — The first real instance is packages-only, and its contents were verified.** Nine entries were materialised into the default root, all by `link`, and every one of them verified as `available` at the moment it was staged:

| Component | Version | Reference in the record |
|---|---|---|
| `am` | `am-0.3.36` | `scripts/external-components.json` |
| `br` | `br-0.6.0` | " |
| `bv` | `bv-0.25.0` | " |
| `cass` | `cass-0.2.14` | " |
| `ee` | `ee-0.15.2` | " |
| `ft` | `ft-0.15.1` | " |
| `ntm` | `ntm-1.35.1` | " |
| `sbh` | `sbh-0.6.2` | " |
| `slb` | `slb-0.4.1` | " |

A second builder run reports `materialised: 0, present: 9`, so the operation is idempotent.
Once the recorded requirements of D10 reached the manifests, `apg components verify` reported
`packages_total: 9`, `reusable_packages: [am, br, bv, ee, ntm, sbh, slb]`,
`degraded_packages: [cass, ft]`, `missing_packages: []`, `conflicted_packages: []` — bytes in
place, and two components whose measured prerequisites are absent on this machine. The digest
change that carried the requirements also left the three previous digest directories behind;
they were removed by explicit name, and the store now holds one digest per id, which is what
D11 makes the verifier enforce.

**D6 — No service entry was written, because no real service could be described honestly.** The store's service kind exists and is gate-covered against real loopback servers, but no component running on this machine exposes a documented identity plus a read-only health endpoint that a record could pin. Writing one anyway would fabricate an endpoint, which is the failure the four-state vocabulary exists to prevent. The first service entry waits for a service that documents its own identity; until then the kind has synthetic coverage only.

**D8 — A service entry requires an identity a read-only `GET` can return.** The internal
capability test (plan §13.21.3) started the components that document a service mode and
measured them against what the store actually does. The criterion that falls out, and
that this record adopts: the declared health path must answer a read-only `GET` (the
store sends nothing else) **and** the response must carry the component's identity; the
endpoint must be reachable without credentials, or identity cannot be checked and every
probe reports `conflict`; the process must stop on a signal, because a service that
ignores SIGTERM cannot be handed an Operator lifecycle; and `degraded` is never
`available`.

Measured against that criterion: `am` answers `/healthz` with `{status: alive}` and
`/health` with `{status, version}` - liveness, not identity - so its identity is only
provable through the MCP handshake, which is not a read-only `GET`; `ee` does serve the
identity but requires a 256-bit bearer token; `ft` answers `/metrics` (not identity) and
starts `degraded` without a WezTerm peer, and its watcher ignores SIGTERM. **No service
entry was written and the store remains packages-only.**

The gap this exposes is in the contract, not in the components: `probeService` reads
`id` and `revision` out of the health JSON with no way to record a differently shaped
response, so a component that names itself some other way can never reach `available`.
Extending the service record with an identity mapping is the next decision; **D9 takes
it**, and D8's criterion is what D9's fields are shaped to satisfy.

**D9 — A service record declares which fields carry its identity, and an asserted identity is never `available`.** D8 ended with the gap it opened: the probe could only read `id` and `revision`, so a real server whose health JSON answers `{service, rev}` - the shape the capability test actually observed - could never be recorded honestly. The service entry now carries an optional `identity` mapping, `{id_field, revision_field}`, defaulting to the old names, and the probe reads exactly those fields and nothing else. Two further fields make the honest cases expressible rather than silently wrong: `asserted_identity: true` records that nobody can check who answers - a component behind a token or a proxy - and such an entry may be reachable but is always `degraded`, because "present, and I cannot verify it" is exactly what that state means; and `stop: signal | sigkill` records a deterministic stop, which the capability test found necessary after `ft`'s watcher ignored SIGTERM. The record still cannot name a file, a path or a destination, still cannot resolve a name, and still issues one `GET`.

**D10 — What a component needs is declared, and an unmet requirement is `degraded`, never `available`.** A package or service entry may carry `requires`, a list of single-key requirements: `{component: <id>}` (another entry in this store), `{bin: <name>}` (an executable on `PATH` that must be executable), or `{env: <NAME>}` (an environment variable that must exist - presence only; the store never reads, records or returns its value). `checkRequirements` resolves each against the store and the machine, and `applyRequirements` downgrades any entry with an unmet requirement to `degraded` with the unmet list attached. Both kinds carry it, and `requires` lives *inside* the manifest, so it is covered by the package digest: a requirement cannot be added to or removed from a staged entry without the digest changing. Only measured prerequisites are declared - the capability test measured `ntm` driving sessions through `tmux`, `ft` needing the WezTerm mux ("WezTerm bridge CLI not found in PATH" in its own status), and `cass-memory`'s own diagnostic reporting its companion `cass` CLI unavailable. Prerequisites that are not a component, an executable or a variable - a `.beads` directory for `br`/`bv`, project initialisation for `slb`, a daemon plus root for `sbh`'s reclamation, an API key whose variable name is not evidenced for `cass` - are deliberately *not* guessed; `scripts/external-components.json` carries a `requires_note` saying so. `ee`'s `EE_SERVE_TOKEN` is a requirement of its serve mode and belongs on a future service entry, not on the package. On the first real instance that is what the check reports: `cass` and `ft` degraded with their named unmet requirements, the other seven reusable.

**D11 — Two digests under one id are a conflict, not a choice, and the builder names the stale directory instead of deleting it.** Changing a manifest moves its digest and leaves the previous `<id>/sha256-<hex>/` directory behind. The rebuild that carried D10's requirements did exactly that, and `verify` went on reporting the id as reusable through the stale copy while the summary listed it twice - so a stale entry could answer for a component nobody had chosen. The verifier now resolves a duplicated id to `conflict` with both digests named (`conflicted_packages`), a requirement naming it is not satisfied, and the id appears in neither `reusable_packages` nor `degraded_packages`: the ambiguity is the finding. The builder, which is the only place that knows the intended digest, reports the residue as `stale` with the exact directory - and removes nothing, because deleting a directory is a human's decision, not a repair path's.

**D7 — No authority moves.** Discovery, verification and health remain read-only Production/User work; nothing in the shipped path starts, stops, restarts or drains anything, resolves a DNS name, or issues a request other than the declared health path. ADR 0009 D6 stands.

## Alternatives considered

| Alternative | Benefit | Rejection/tradeoff reason |
|---|---|---|
| Ship `scripts/build-component-store.mjs` too | A consumer could materialise its own store | It reads a committed acquisition record and writes into the machine root: that is an acquisition mechanism, and distributing it would make APG the installer ADR 0007 keeps out of the authority plane |
| Name the CLI group `store` | Says what it is | The boundary gate rejects the name, and correctly: the group verifies a product, it does not run a store service |
| Keep the validator in the gate (ADR 0009 D7 unchanged) | Smallest surface | The gate would keep testing a private copy; the shipped schema would document a contract nothing enforces |
| Add `available-unverified` for a service whose revision is unpinned | Distinguishes "identity unknown" from "degraded" | Unnecessary vocabulary: `degraded` already means "present but not safely reusable", and ADR 0009 D5's four states are the decided set |
| Write a service entry for the bridge control servers | A real service entry today | The control plane exposes ids and generations over its own protocol, not a documented HTTP endpoint and health path; an entry would have to invent both |

## Consequences

- **Positive:** the contract is now enforced by shipped code rather than by a test-local copy; the gate verifies the implementation consumers actually get; one machine holds one copy of each component; and the first instance is real and measured rather than projected.
- **Positive:** the schema and the code are pinned to each other by the gate, so a manifest field the schema omits — or a schema field the code never writes — fails the gate instead of shipping as a declaration.
- **Negative/risk:** `lib/components.mjs` is the only distributed module that opens an outbound HTTP connection. It is bounded (literal IPv4/IPv6 or `localhost`, one `GET` on the declared health path, no redirects followed, no DNS) and gate-pinned, but it is a real network reach and belongs in any future review of the authority plane.
- **Negative/risk:** the reference implementation lives on the surface while the builder that populates the store does not, so a consumer can verify and discover but cannot create. That asymmetry is deliberate, and it is the thing a future record should revisit if consumers need to stage their own components.
- **Release accounting:** this contract carried `main`'s distribution surface past tag `v3.0.10` (85 files versus 83) while `PACKAGE_VERSION` still read `3.0.10`. The owner then authorised the bump, and 4.0.0 moves the version file, the self-hosted descriptor's `provider.release`, the root block's integrity line, the catalog and the manifest together, so no distributed surface is advertised without a tag behind it. The tag is cut after the internal capability test, not before.

## Validation and reversal

Three gates hold this record, and all three pass:

| Gate | What it pins |
|---|---|
| `scripts/test-component-store.mjs` (103 assertions) | The contract end to end: sibling root under the existing variable alone; one copy for two projects; exact file set (extra, missing, tampered, writable manifest, misnamed directory each fail); schema-versus-code field agreement; absent store is `not-installed` with `action: none`; service identity rules (no fetch, no resolvable name, no location field); the store walk over both kinds; the builder against a synthetic record including `--dry-run` writing nothing and a mismatch exiting 1; the CLI, including that neither command publishes a bare `reusable`; the four discovery states against real loopback servers; that a 200 which names no component is a `conflict` whose reason says so (D8); that an `identity` mapping reaches `available` only through the fields it declares, that an asserted identity is never `available` and that `stop` accepts only a deterministic signal (D9); that requirements validate as single-key objects of the three kinds, that an absent executable degrades an entry and that `requires` travels from the acquisition record into the manifest and therefore into the digest (D10); that a second digest under one id is a `conflict` the builder reports by name and never deletes (D11); and that discovery issues only `GET` on the declared health path |
| `scripts/test-boundary.mjs` | 10 command groups (the group name is checked against `FORBIDDEN`), and the manifest equal to the packer allowlist at 85 files |
| `scripts/test-release.sh` | Runs both, plus the JSON parse of the new schema |

Negative control, run and recorded: with the file-set comparison in `lib/components.mjs` disabled, `scripts/test-component-store.mjs` fails; restored, it passes. The gate therefore fails for the reason it claims, not incidentally.

Reversal: delete `lib/components.mjs`, `schemas/component-entry.schema.json` and `scripts/build-component-store.mjs`, drop the `components` group from `scripts/apg.mjs`, restore `EXPECTED_GROUPS` to 9, then `apg release manifest` — the surface returns to 83 files. The store on disk is untouched by reversal and can simply be removed; no descriptor, installed root or project state changes.

## Follow-up

- **Maintainer, next release:** done — `PACKAGE_VERSION` and `provider.release` read `4.0.0`; the `v4.0.0` tag is cut once the internal capability test and the rollout dry run pass.
- **Maintainer, first service entry:** D8 states the criterion. None of the three components measured against it qualifies today, so the kind still has synthetic loopback coverage only; the next decision is whether the record may declare which fields carry identity, which is what would let a real third-party service be recorded honestly.
- **Owner, consumer rollout:** deliberately not started. No consumer repository was touched; ADR 0010 makes the capability available, it does not adopt it.
- **Maintainer, store lifecycle:** nothing prunes or repairs the store. A stale entry is verified, fails its digest if the bytes changed underneath it, and is otherwise left alone; removal is a human action.

# 0010: The component store contract on the distribution surface

Status: accepted — implemented and measured: `lib/components.mjs` and `schemas/component-entry.schema.json` ship, the read-only `components` CLI group verifies and probes, and the first real store instance exists on this machine
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

**D3 — The state vocabulary is unchanged.** `available` / `degraded` / `not-installed` / `conflict`, with `action: "none"` for anything not reusable. ADR 0009 D5 stands verbatim; no word is added for the shipped path.

**D4 — The builder is the acquisition path, and it stays non-distributed.** `scripts/build-component-store.mjs` consumes the committed acquisition record and materialises staged bytes into the digest-named layout. It never downloads, never repairs a broken entry, and treats a disagreement between the record and the bytes on disk as a hard failure (`record_mismatch`, exit 1) — that discrepancy is exactly what the record exists to catch. It hard-links when the store and the source share a filesystem and reports which it used (`link` / `copy`), because a hard-linked entry shares its inode with the staged copy.

**D5 — The first real instance is packages-only, and its contents were verified.** Nine entries were materialised into the default root, all by `link`, and all nine verify as `available`:

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

`apg components verify` reports `present: true`, `reusable: [9 ids]`, `missing: []`; a second builder run reports `materialised: 0, present: 9`, so the operation is idempotent.

**D6 — No service entry was written, because no real service could be described honestly.** The store's service kind exists and is gate-covered against real loopback servers, but no component running on this machine exposes a documented identity plus a read-only health endpoint that a record could pin. Writing one anyway would fabricate an endpoint, which is the failure the four-state vocabulary exists to prevent. The first service entry waits for a service that documents its own identity; until then the kind has synthetic coverage only.

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
- **Release accounting:** `main`'s distribution surface now exceeds tag `v3.0.10` (85 files versus 83) while `PACKAGE_VERSION` still reads `3.0.10`. The tag remains authoritative for `3.0.10`; the next release must bump the version. This is recorded, not acted on — the version is not bumped unilaterally here.

## Validation and reversal

Three gates hold this record, and all three pass:

| Gate | What it pins |
|---|---|
| `scripts/test-component-store.mjs` (55 assertions) | The contract end to end: sibling root under the existing variable alone; one copy for two projects; exact file set (extra, missing, tampered, writable manifest, misnamed directory each fail); schema-versus-code field agreement; absent store is `not-installed` with `action: none`; service identity rules (no fetch, no resolvable name, no location field); the store walk over both kinds; the builder against a synthetic record including `--dry-run` writing nothing and a mismatch exiting 1; the CLI; the four discovery states against real loopback servers; and that discovery issues only `GET` on the declared health path |
| `scripts/test-boundary.mjs` | 10 command groups (the group name is checked against `FORBIDDEN`), and the manifest equal to the packer allowlist at 85 files |
| `scripts/test-release.sh` | Runs both, plus the JSON parse of the new schema |

Negative control, run and recorded: with the file-set comparison in `lib/components.mjs` disabled, `scripts/test-component-store.mjs` fails; restored, it passes. The gate therefore fails for the reason it claims, not incidentally.

Reversal: delete `lib/components.mjs`, `schemas/component-entry.schema.json` and `scripts/build-component-store.mjs`, drop the `components` group from `scripts/apg.mjs`, restore `EXPECTED_GROUPS` to 9, then `apg release manifest` — the surface returns to 83 files. The store on disk is untouched by reversal and can simply be removed; no descriptor, installed root or project state changes.

## Follow-up

- **Maintainer, next release:** bump `PACKAGE_VERSION` when the next release is cut; `main` is ahead of tag `v3.0.10` by two distributed files.
- **Maintainer, first service entry:** record one when a component running locally documents an identity and a read-only health endpoint. Until then the kind is covered by synthetic loopback servers only.
- **Owner, consumer rollout:** deliberately not started. No consumer repository was touched; ADR 0010 makes the capability available, it does not adopt it.
- **Maintainer, store lifecycle:** nothing prunes or repairs the store. A stale entry is verified, fails its digest if the bytes changed underneath it, and is otherwise left alone; removal is a human action.

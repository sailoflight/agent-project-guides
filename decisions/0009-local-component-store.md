# 0009: Local component store for shared third-party components

Status: accepted — contract, layout and a non-distributed gate landed; the distribution surface is deliberately unchanged and decision 2 remains unopened
Date: 2026-09-20
Scope: how one machine shares third-party multi-agent components (file packages and running services) across projects without vendoring a copy per project
Deciders/owner: the owner delegated the two open choices to development/maintainer ("你来决定吧 我希望各个项目都尽量使用现成的 别到处都是")
Supersedes: none
Superseded by: none

## Context and evidence

The owner's requirement, verbatim: every project should reuse what already exists and copies must not end up scattered everywhere; specifically, a service that is already running must not be deployed a second time (「有些东西不用部署第二遍(HTTP) 这种找已经有的」), and the store is to be laid out in advance in one local place, following how APG itself deploys (「提前本地单独找个地方摆好文件包+HTTP服务器 这种参考APG的部署方式」).

APG's own deployment already separates content from project. This record generalises that separation instead of inventing a parallel one:

| Fact | Evidence |
|---|---|
| Three provider modes | `lib/core.mjs:23` — `thin-bootstrap` / `embedded-local` / `source-worktree` |
| `thin-bootstrap` keeps generic bytes in the machine package store | `docs/V2_CONTRACT.md:38`; the release root is `<platformHomes(env).data>/releases/<digest>` (`lib/provider.mjs:411-412`) |
| `embedded-local` keeps the exact release inside the project | `docs/V2_CONTRACT.md:42`; `<project>/.agent-project-guides/local/releases/<digest>` (`lib/provider.mjs:413`), excluded through an owned `.gitignore` written by the materializer (`lib/materializer.mjs:138`) and reconciled by hash in `lib/migration.mjs:205` |
| Digest directories are named `sha256-<hex>` | `lib/provider.mjs:20-22`; only such directories resolve (`docs/V2_CONTRACT.md:50`) |
| Machine paths and generic package bytes stay outside the descriptor | `docs/V2_CONTRACT.md:32` |
| A manifest is not part of its own content set, and is read-only on disk | `lib/provider.mjs:144` skips `runtime-manifest.json`; `lib/provider.mjs:189` writes it `0o444` |
| A first real instance of a component store already exists | `.agent-scratch/external-test/bin/` (9 released artifacts + `install-manifest.json`) with the committed acquisition record `scripts/external-components.json` |
| Local paths are already forbidden in component records | `scripts/test-external-provenance.mjs:56` |

Two things are already decided and are not reopened here: rows 2 and 6 of the owner arbitration keep the capability vocabulary and the declarative manifest out of the distribution surface, and decision 2 (that manifest) remains unopened.

## Constraints and decision drivers

- **Reuse over installation.** The cheapest component is the one already present.
- **One copy per machine.** Per-project vendoring multiplies bytes and guarantees divergent versions and duplicate services.
- **Discovery must be falsifiable.** A port that answers is not evidence that it is the declared component.
- **The byte boundary stands.** APG ships a manifest, never third-party bytes (ADR 0004, ADR 0007, `decisions/0008`), so nothing here may download.
- **No new configuration surface.** A second root variable would be one more thing to keep consistent.

## Decision

**D1 — One store per machine, at the root APG already uses.** The store is `<platformHomes(env).data>/components/`: a sibling of the `releases/` directory that `thin-bootstrap` already uses, resolved by the existing `AGENT_PROJECT_GUIDES_HOME` / XDG / Windows rules. **No new environment variable is introduced.** `embedded-local` remains the offline exception, unchanged.

**D2 — Projects hold references, never copies.** A project records `{ id, version }` for a file entry and `{ id, endpoint_revision }` for a service. The descriptor is unchanged (machine paths stay outside it), the root block is unchanged, and the per-turn injection surface does not grow.

**D3 — Two entry kinds.** A file entry lives at `<components>/<id>/sha256-<hex>/` and carries `component-manifest.json` with a canonical digest, a file set that must match exactly, and mode `0444`. A service entry lives at `<components>/services/<id>.json` and carries identity only — endpoint, transport, expected revision, health path, `singleton` — never bytes.

**D4 — Two delivery semantics, both passive.** `staged` means the component must already be present; APG verifies, discovers and reuses it, and reports `not-installed` when it is absent. `fetched` means the recorded acquisition coordinates may be used by the documented procedure; APG itself still does not fetch. **Services are always `staged`** — "already running" cannot be downloaded.

**D5 — Discovery has four states, and a singleton conflict is fail-closed.** `available` / `degraded` / `not-installed` / **`conflict`**. `conflict` covers both "something is answering but it is not the declared component" and "a second instance of a singleton exists". Reusing a plausible-looking endpoint is worse than not reusing it, so the store never guesses, and a singleton with two live instances is a conflict rather than a choice.

**D6 — Reuse is not authority.** Discovery, verification and health are read-only and belong to Production/User. Starting, stopping, restarting or draining a service is Production/Operator work and additionally requires confirmation and generation validation. This mirrors `profiles/mcp/WINDOWS_WSL_BRIDGE.md`, which already assigns install, health, restart, recovery and rollback to the operator integration and forbids the facade from owning persistent state.

**D7 — Nothing enters the distribution surface in this step.** No new distributed file and no code in `lib/`. The contract is enforced by a non-distributed gate; lifting the validator into the shipped package is exactly what decision 2 would decide, and decision 2 stays closed.

## Alternatives considered

| Alternative | Benefit | Rejection/tradeoff reason |
|---|---|---|
| A copy of each component per project | No shared failure domain | The owner's stated rejection (「别到处都是」): N projects × M components of duplicated bytes, divergent versions, and services deployed once per project |
| A new `APG_COMPONENTS_HOME` variable | Independent lifecycle | A second root outside the already-documented package-store rule, and one more setting to keep consistent with `AGENT_PROJECT_GUIDES_HOME` |
| The three-state vocabulary (`available`/`degraded`/`not-installed`) | Reuses existing words | Cannot express "another program owns port 8765", which is the most likely real outcome of a naive probe |
| A probe that trusts "the port answers" | Cheapest detection | Unfalsifiable: it would silently bind a project to an unrelated service |
| Ship the validator in `lib/` now | Consumers get it immediately | Contradicts rows 2/6 (vocabulary and landing surface stay non-distributed) and would advertise a decision the owner has not opened |
| Let the store fetch components | One-command setup | Violates the recorded byte boundary and the NOASSERTION constraint |

## Consequences

- **Positive:** one copy of each component per machine, shared by every project on it; already-running services are reused rather than redeployed; the store's location is already documented and already overridable, so no new configuration surface appears; and the split is the one APG already uses for its own bytes.
- **Negative/risk:** a shared store is a shared failure domain — one corrupted component affects every project that references it. Mitigation: content-addressed directories, so a corrupted copy fails its digest instead of silently serving, and the store is never the authority for a project's own policy.
- **Negative/risk:** discovery is only as strong as its identity check. An entry that pins no revision cannot be verified, so it reports `degraded` rather than `available`.

## Validation and reversal

`scripts/test-component-store.mjs` is the enforcement point (non-distributed; wired into `scripts/test-release.sh`). It pins: the root resolves to `<data>/components` beside `<data>/releases` under the existing variable alone; digest-directory naming; manifest self-exclusion, exact file set and `0444`; that no record names a local path; that two projects referencing one entry resolve to the same directory with exactly one copy on disk; that `staged` plus absence reports `not-installed` with no fetch action; that a service entry declaring `fetched` is rejected; and the four discovery states against real loopback servers, including that probing issues only the declared read-only health request and never a state-changing one, and that two live instances of a singleton resolve to `conflict`.

**What this record does not claim.** Because the gate is non-distributed, the contract is pinned for this repository only: it is a declaration plus an invoked test *without* a shipped enforcement point, and nothing here should be read as a consumer-facing capability. The third leg arrives with decision 2.

Reversal: delete this record, `scripts/test-component-store.mjs` and its runner line. No distribution surface, installed root, project state or descriptor changes, so reversal is a no-op for every consumer.

## Follow-up

- **Owner, decision 2** (declarative manifest on the distribution surface): opening it is what turns this store into a consumer-facing capability. Tracked in `plans/MULTI_AGENT_INFRA_INTEGRATION_RESEARCH.md` §13.19 row 2.
- **Maintainer, lift the reference implementation:** the probe and validator logic currently live in the gate and move into `lib/` only when decision 2 opens.
- **Maintainer, first real instance:** carry the 9 artifacts under `.agent-scratch/external-test/bin/` into the store layout and confirm the committed acquisition record in `scripts/external-components.json` still matches.

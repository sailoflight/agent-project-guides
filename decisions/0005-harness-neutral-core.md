# 0005: Harness-neutral governance core

Status: accepted
Date: 2026-09-10
Scope: shipped guidance surfaces, V2 contract wording, CLI command surface, catalog IDs, verification gates
Deciders/owner: project owner with development/maintainer
Supersedes: ADR-0001 (DSH-first positioning wording only; all other 0001 decisions remain in force)
Superseded by: none

## Context and evidence

Long daily use against one host (DSH) produced client-first drift inside a project whose own `plugins/README.md` already declares the core "harness-neutral". Verified by the 2026-09-10 static audit: shipped wording ("DSH-first governance core", "non-DSH parity", "compact DSH bootstrap", "A fresh DSH task"), a client command presented as first-class in the generic CLI banner with a hardcoded `dshReport()` dispatch, the generic AGENTS.md v2 bootstrap block carrying the catalog ID `bootstrap:dsh-v2`, and a client-branded tool mapping inside `bootstrap/AGENTS.routing-block.md`. `plans/R6_DESIGN_REVIEW.md` already forbade silently removing or reinterpreting the legacy `apg dsh report` API.

## Constraints and decision drivers

- `apg dsh report` semantics are frozen compatibility API (R6-A); the installed launcher delegates to it for consumers.
- Catalog IDs are contract surface; renames require read aliases.
- Guidance surfaces reach consumer contexts verbatim, so client names there read as support claims.
- Harness-specific integration code belongs to independent plugin repositories (`plugins/<harness>-apg/`), not to APG core.

## Decision

APG is a harness-neutral governance core; harness integrations are optional adapters/plugins. Concretely: harness-neutral wording across shipped content; `dsh` demoted to an annotated `[compat]` observation adapter behind an `OBSERVATION_ADAPTERS` registry seam with unchanged output semantics; `bootstrap:agents-v2` replaces `bootstrap:dsh-v2` with a permanent read alias; the legacy routing block names capabilities, not client tools; a new genericity gate (`scripts/test-genericity.mjs`) keeps guidance surfaces client-neutral (allowing client-specific blocks, root policy filenames, the contract adapter section, and documented legacy IDs).

## Alternatives considered

| Alternative | Benefit | Rejection/tradeoff reason |
|---|---|---|
| Keep DSH-first wording as-is | Zero migration cost | Contradicts the declared generic positioning; leaks client names into every consumer context |
| Remove `dsh report` from the CLI now | Cleanest core | Violates the frozen-API constraint and breaks installed-launcher consumers (delegation test in `scripts/test-v2.mjs`) |
| Rename the catalog ID without an alias | Simpler catalog | Breaks any external reference to the old ID; read aliases are established house style (g1/g2/g3 tickets) |

## Consequences

- Positive: generic positioning matches the implementation; the plugin boundary is enforceable by a test gate; future harnesses integrate without core dispatch changes.
- Negative/risk: two catalog IDs coexist (mitigated by the permanent alias and the contract migration note); ownership budgets tighten — the README raw-byte budget is raised 11000 → 12000 alongside this ADR because the neutral rewording consumed the last bytes of headroom.

## Validation and reversal

Validation: `scripts/test-genericity.mjs` (gate), `scripts/test-install.sh` (including its installer LLM-runner check), the v2/v3/routing/schema suites, catalog/manifest regeneration, and alias smoke tests through `apg provider load`. Signals for review: any gate failure, a second harness integration landing, or the `plugins/dsh-apg` plugin shipping a host-side observation adapter (then the compat adapter can be scheduled for deprecation). Reversal: revert commit cd0aa52 and this ADR from backup branch `backup/pre-genericity-cleanup-20260910T022714Z`, then regenerate catalog and manifest.

# Monorepo project profile

> Repository-level composition only after `monorepo` selection; package scopes use their own primary-type profile.

## 1. Selection boundary

Select for a root containing independently built, released, operated or contracted packages, not merely multiple directories. For package scope select only its mcp/library/cli/service/application-ui/data-automation profile.

## 2. Artifact preset

Templates below are exact files under `templates/`.

| Artifact | Decision | Template | Scope |
|---|---|---|---|
| Root constraints | required | `templates/ROOT_AGENTS.md` | Cross-package routing, red lines, workspace commands |
| Task index | required | DOC_INDEX.md | Select package before local detail |
| Development | required | DEVELOPMENT_START.md | Bootstrap, selection, orchestration, generation, root checks |
| Architecture | required | ARCHITECTURE_OVERVIEW.md | Packages, dependencies, shared contracts, release coupling |
| Package/module contract | conditional | MODULE_CONTRACT.md | Independent ownership, risk, public or special verification |
| Verification | required | VERIFICATION_MATRIX.md | Changed packages and shared contracts |
| Root usage | omit | USER_USAGE.md at package scope | Never aggregate unrelated package usage |
| Root operations | conditional | OPERATOR_RUNBOOK.md | Actual shared orchestration/runtime duties |
| Local instructions | conditional | MODULE_CONTRACT.md local section | Only package rules needed before reading files |

## 3. Evidence map

| Decision | Authority | Derived view |
|---|---|---|
| Package boundaries | workspace/build config | task routing |
| Dependencies | manifests/build graph/imports | architecture |
| Shared protocols | schemas/compatibility tests | contract links |
| Build/test impact | task graph/CI | verification matrix |
| Release coupling | release config/history | release order |

Generate package inventories when tooling supports it; maintain only stable ownership/routing annotations.

## 4. Monorepo contract

Root owns cross-package dependencies, schemas, workspace commands, routing, compatibility/release order and shared risk. Packages own internal entrypoints, implementation, tests and type-specific delivery. Local AGENTS contain only pre-read differences and contract links.

Do not preload all package profiles/source trees. Adapt high-risk packages one scope at a time; report partial scope when the repository is not fully verified.

## 5. Verification preset

Verify graph validity, forbidden dependencies, shared-schema compatibility, affected tests, root/package commands, generated indexes and coupled release order. Report skipped affected packages; a root check is not proof of their verification.

## 6. Cold-start acceptance

Development maps a task to one package, local authority and applicable type without reading unrelated packages. Cross-package changes expose dependencies, compatibility, affected tests and release order before implementation.

# ADR-0004: Third-party checkout threat model and materializer hardening scope

Status: proposed
Date: 2026-09-03（起草：deepseek review agent；合并入库：claude-merger，范围/定级待维护者裁定）
Scope: lib/materializer.mjs, lib/migration*.mjs, lib/bootstrap*.mjs, lib/provider.mjs, scripts/apg.mjs (schema 1 + v3)
Deciders/owner: maintainer (open) — draft authored by deepseek review agent
Supersedes: none
Superseded by: none

## Context and evidence

APG's central consumer scenario is applying governance to a project the operator did not author (a cloned third-party repository). Review 3.0.3 found a family of local-file weaknesses that only matter under that scenario:

- schema 1 "atomic" temporary paths are PID-predictable and written without `wx`/`O_NOFOLLOW`; a pre-seeded symlink can redirect writes outside the workspace (`lib/bootstrap.mjs:88-94,125-127`, `lib/migration.mjs:42-45,152-154`, `scripts/apg.mjs:168-179`, `lib/provider.mjs:343-345`).
- materialization accepts a symlink pre-seeded as stage root or `.agent-guides` (`verifyGuideTree` follows `statSync` symlinks; `lib/materializer.mjs:182-193,423-433,596-637`); validation does not `lstat` the guides root.
- a crafted Git `.git` pointer (`gitdir:` value or symlink) selects where `info/exclude` is written, without authenticity or scope checks (`lib/provider.mjs:314-346`).
- launcher verifies files by path then `import()`s the same path; the digest check and execution are not bound to the same bytes (`scripts/apg-launcher.mjs:44-90,174-209`).

ADR-0001 explicitly defers identity/ACL/audit/signature/isolation and the README adopts a mutual-trust model, so hostile multi-tenant hardening is out of scope for now. The gap: mutual trust was framed for caller/callee responsibility, but it silently also covers the *repository bytes being operated on*, which is precisely the untrusted input in the main use case.

## Constraints and decision drivers

- Compatibility: schema 1 behavior and byte-preserving migration must not regress.
- Cost: a full security control plane is out of scope (ADR-0001); only the cheapest fail-closed checks that block the realistic third-party-repo attacks are candidates.
- Determinism: tool behavior must remain previewable and conflict-reporting.
- Effort: 3.0.x patch discipline is high; anything large belongs to 3.1/4.x.

## Decision (proposed, for maintainer adjudication)

Introduce a **scoped hardening rule without changing the trust model's wording**: when the materializer/migration target is not verified to be operator-authored, treat repository bytes as untrusted input. Minimum concrete checks, in priority order:

1. Refuse symlinks at managed-root and transition/stage roots (use `lstat`), and open every schema 1 temporary/restore file with `flag: 'wx'` (or `O_NOFOLLOW` where available) instead of plain `writeFileSync`.
2. Validate `.git` gitdir pointers against the checkout's own canonical path before composing `info/exclude`; reject symlink `.git`.
3. Document that "immutable release" and launcher verify-then-import are same-user integrity conventions, not security boundaries (README §3 wording), until fd/inode-bound loading exists.

Everything else (signing, ACL, per-user runtimes) remains deferred per ADR-0001.

## Alternatives considered

| Alternative | Benefit | Rejection/tradeoff reason |
|---|---|---|
| Defer all of it (status quo) | Zero effort, honors ADR-0001 literally | Leaves the primary third-party-checkout scenario unprotected; findings would have to be re-filed later at higher cost |
| Full hostile control plane now | Closes the whole class | Contradicts ADR-0001 scope and 3.0.x patch discipline |
| Agent-side usage rule only (always trust repo) | No code change | Governance text alone cannot stop symlink/temp attacks; code-level fail-closed is cheap here |

## Consequences

- Positive: the cheap checks (wx temp files, lstat roots, .git validation) close the realistic third-party-repo write-redirection paths without changing the mutual-trust framing.
- Negative/risk: rejects some previously accepted layouts (e.g., symlinked guides dirs); needs regression tests for rejection branches (see test coverage gaps in `plans/REVIEW_FINDINGS.md` §2 R3).

## Validation and reversal

- Validation: negative fixtures for symlinked stage/root/temp and hostile `.git` pointer must assert zero-write conflict; existing materializer failpoint suite must stay green.
- Reversal: remove the checks in a later release and restore the negative fixtures' expectations; record the context-cost regression.

## Follow-up

- Maintainer: adjudicate scope and severity (3.0.x hardening vs 4.x).
- Tracked in promoted project memory: `docs/memory/finding.h1.temp-file-symlink-writes.json` and `docs/memory/finding.h1.apply-source-toctou.json` (severity provisional pending fault-injection reproduction, see `plans/REVIEW_FINDINGS.md` §4.4).

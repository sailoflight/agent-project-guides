---
id: "3359b33d-279a-401a-8848-2f84865b9333"
title: "APG R5 3.0.4: Reviewed Fixes and Verification Handoff"
description: "Digest-bound APG 3.0.4 R5 handoff: H5/M7/M8 fixes, closed Reviewer findings, final PASS evidence, source report paths, verification exceptions and explicit R6/DSH boundaries."
status: "active"
created_at: "2026-09-08T03:48:25.264Z"
updated_at: "2026-09-08T03:48:25.264Z"
content_hash: "2f4af14f35a87925ff79fdcc7e43f192a4b0c581a4bb9d4533567fd80c1946d1"
source_paths:
  - "plans/R5_VERIFICATION.md"
  - "plans/REVIEW_FINDINGS.md"
  - "lib/context.mjs"
  - "scripts/apg.mjs"
  - "routing/context-classifier.json"
  - "scripts/test-v2.mjs"
  - "scripts/test-v3.mjs"
  - "bootstrap/AGENTS.v2-block.md"
  - "docs/V2_CONTRACT.md"
  - "docs/V3_MINIMAL_SLICE.md"
  - "decisions/0004-threat-model-untrusted-checkouts.md"
session_ids:
  - "01b01657-67bd-4f62-832e-c8641db9a793"
memory_body_ids:
  []
---

# APG R5 / 3.0.4 Review and Verification Handoff

## Authority and Candidate
The completed checkpoint delivered a substantial implementation and verification handoff for **H5, M7 and M8**, following `plans/REVIEW_FINDINGS.md` sections 8.4, 8.6 and 8.7. The durable workspace report is `plans/R5_VERIFICATION.md`; the findings register links it in section 8.8. Those files are the detailed project record; this document is a routing summary.

Candidate: APG **3.0.4**, runtime manifest digest `sha256:deacad2bbc59057ad72516ceeb48c52b38e74d381f9dcc390fece9c1a2fa2325`. This was an **uncommitted dirty source worktree**, not a published immutable release. Source-only handoff additions preserved that digest, verified after writing the report.

Final independent-context Reviewer verdict: **approved** within R5 scope. Final Verifier verdict: **PASS**, superseding interruption-induced incomplete/BLOCKED reports that had not established candidate defects. Same host/runtime and permissions mean peer challenge, not formal IV&V.

## Implementation and Rationale
- `lib/context.mjs` gives schema 1 a 4096-token per-output limit and 2048-token clarification framing limit. Requested direct-context delivery is not rejected solely because unrequested JSON exceeds its limit.
- `scripts/apg.mjs` project validation separately compiles all selected role/mode routes in context and JSON, checking hashes, byte estimates, mandatory recall and authority-neutral/no-union invariants. Either promised format failing prevents ready validation.
- Schema 1 choices preserve flat `plane`, `role`, `mode` for additive compatibility and add choice ID, full route/hash, matched rules, reason and executable continuation. Continuation binds the resolved absolute target with shell quoting. Lower-level `provider resolve/load` contracts remain unchanged; schema 1 does not acquire generation handles.
- `routing/context-classifier.json` and compiler logic distinguish bounded assessment/plan-only signals, mixed delivery, feature negation and affirmative maintenance. This remains lexical routing, not a proof of arbitrary natural-language intent.
- `bootstrap/AGENTS.v2-block.md` and `AGENTS.md` require ready before work, structured clarification with waiting, and stopping on compiler errors. Only genuine `package_missing` enables the declared degraded fallback. Direct context exposes `Status: ready`.
- Version, V2/V3 contracts, catalog and manifest were synchronized. No DSH source edits occurred.

## Review Findings Closed
The first review identified three P2 issues, followed by two classifier refinements; all were closed on the final digest:
1. `不要实现修复方案` incorrectly selected Developer, and mixed assessment plus implementation silently selected Reviewer. Final behavior is Reviewer for the negated plan and executable ambiguity for mixed delivery.
2. Schema 1 continuation omitted `--target`, failing or selecting another project from a foreign cwd. All four generic continuations now run unchanged and preserve target identity.
3. Context and JSON budgets remained coupled. Per-request format gating now coexists with both-format project validation.
4. `分析并准备修复方案后实施修复` silently selected Reviewer. It now offers executable Reviewer/Maintainer clarification.
5. `不要实现新功能，只修复缺陷` wrongly suppressed maintenance. It now selects Maintainer/code.

Regression coverage is in `scripts/test-v2.mjs` and `scripts/test-v3.mjs`. Tests were added before the associated corrections, with observed failures. Reviewer final approval does not approve all historical register findings or R6.

## Verification Evidence
Linux, Node **v22.23.1**; mutation-capable checks used temporary copies and isolated APG homes.

- Complete `scripts/test-release.sh` passed: schema, routing, install lifecycle, V2/V3 suites, catalog, project validation, source manifest and whitespace.
- Earlier independent Verifier checked all **93** manifest file sizes/SHA-256 values and the complete release gate. Final supplemental verification reused that explicitly identified prior evidence rather than claiming a fresh rerun.
- Fresh supplemental CLI oracle covered **23** schema 1 routes in both formats, repeated with mandatory content; independent sorted-JSON route hashes, source hashes, UTF8 byte counts, mandatory-first recall and authority/union invariants passed. Consolidated record reports **117 fresh CLI commands**.
- Current route maxima: context **2874**, JSON **3212**, limit **4096**.
- All **4** generic ambiguity continuations passed from foreign cwd, including an apostrophe-containing absolute target; **11** language cases passed including negation, mixed intent and quoted protected words.
- Both schema boundary tests delivered context **15799 bytes / 3950 tokens**. Independently reconstructed rejected JSON was **17358 bytes / 4340 tokens** for schema 1 and **17363 bytes / 4341 tokens** for schema 2. JSON requests and project validation returned exit 2 with `context_budget_exceeded`, `checked_format=json`, without target writes.
- Selected-inline preview/apply/validate and thin-bootstrap to selected-inline migration preview/apply/validate/rollback/revalidate passed. Pre-staged sentinel, index, exact byte/mode/directory/exclude snapshots and dirty root suffix were preserved.
- Original candidate full byte/mode and Git-status comparison passed before source-only handoff reporting.

## Evidence Locators and Exceptions
Durable summary: `plans/R5_VERIFICATION.md`. Temporary raw evidence may disappear during cleanup:
- `/tmp/apg-r5-verifier-nyTyB5/FINAL-R5-VERDICT.md`
- `/tmp/apg-r5-verifier-nyTyB5/commands.jsonl` (inherited gate/manifest evidence)
- `/tmp/apg-r5-verifier-nyTyB5/fresh-r5-OpQE2G/routes-results.json`
- `/tmp/apg-r5-verifier-nyTyB5/fresh-r5-bGqSeP/commands.jsonl` (transactions/snapshots)
- `/tmp/apg-r5-verifier-nyTyB5/fresh-r5-8jxftx/boundaries-results.json`
- `/tmp/apg-r5-verifier-nyTyB5/fresh-r5-9m8vKl/final-results.json`

An initial budget fixture stayed below the limit and failed its harness precondition; it was replaced with fresh passing boundary tests, not counted as a pass. Temporary candidate-copy `.git/index` binary differed from its inherited baseline at unknown timing; all other copied bytes/modes and staged entries matched. Original-candidate and transaction-fixture preservation checks passed. Rejected JSON sizes are independent reconstructions, not emitted successful stdout.

## Remaining Boundary and Next Handoff
No commit, tag, published release, network/real-pilot evaluation, production operation, fresh DSH session or multi-model field experiment was performed. Intended/host-observed content does not establish model-effective context.

**H4/M9 and R6 remain open.** Developer must separately plan the trusted DSH adapter and schema 2 source-worktree across APG and DSH, with explicit pre-ready tool gating, trust/identity and rollback boundaries. Do not treat arbitrary checkout prose as elevated authority. Field Evaluator follows R6 implementation with actual fresh-session/model/version-bound repetitions. ADR-0004 remains a separate proposed untrusted-checkout threat-model/hardening record, not an extra R5 completion claim.

# R5 / APG 3.0.4 Review and Verification Handoff

## Candidate and verdict

- Scope: H5, M7, M8 and the R5 acceptance contract in `REVIEW_FINDINGS.md` sections 8.4, 8.6 and 8.7. Host enforcement and field experiments belong to R6, not this verdict.
- Candidate version: `3.0.4`.
- Runtime manifest digest: `sha256:deacad2bbc59057ad72516ceeb48c52b38e74d381f9dcc390fece9c1a2fa2325`.
- Candidate is an uncommitted dirty source worktree, not an immutable published release. This report and its register link are source-only handoff additions after verification; they do not change the runtime digest.
- Independent-context Reviewer verdict: **approved** for this R5 scope and digest.
- Independent-context Verifier verdict: **pass** for the completed R5 verification contract. This supersedes the earlier interruption-induced incomplete/BLOCKED report; that report did not identify a candidate defect.
- Independence limit: same host/runtime and permission identity; peer challenge, not formal IV&V.

## Implemented changes

- Schema 1 context uses a 4096-token per-output limit and a 2048-token clarification framing limit. A requested context response is not rejected solely because its unrequested JSON representation exceeds the limit.
- `project validate` compiles every selected role/mode in both formats and checks route hashes, reported byte estimates, mandatory IDs, no union loading, and no authority grant. Failure of either promised format prevents a ready verdict.
- Schema 1 choices preserve legacy flat `plane`, `role`, `mode` fields and add stable choice ID, complete route/hash, matched rules, conflict reason and executable continuation. CLI continuations preserve the resolved absolute target, including shell quoting. The lower-level `provider resolve/load` contracts remain unchanged.
- Assessment, plan-only, mixed delivery, feature negation and affirmative repair cases have regression coverage. Classification remains a bounded lexical router, not a general natural-language intent proof.
- Bootstrap requires ready before work, structured clarification and waiting on ambiguity, and stopping on compiler errors. Only `package_missing` permits the declared degraded fallback. Direct context exposes `Status: ready`.
- Version, root bootstrap, V2/V3 contracts, catalog and manifest were synchronized. No DSH source changes were made.

## Reviewer findings closed

All findings below were P2/medium and were reproduced before correction:

| Finding | Failure | Final evidence |
| --- | --- | --- |
| F1 | Negated implementation selected Developer; mixed assessment and implementation selected Reviewer silently | Negated plan request selects Reviewer; mixed request returns executable clarification |
| F2 | Schema 1 continuation omitted the original target and failed from foreign cwd | All four returned generic choices run unchanged from foreign cwd and preserve project identity |
| F3 | Requested context was rejected by oversized unrequested JSON | Schema 1 and schema 2 split-format checks pass; JSON and full project validation still fail closed |
| F1 follow-up | Plan followed by affirmative repair selected only Reviewer | `分析并准备修复方案后实施修复` returns clarification with Reviewer and Maintainer |
| F1 follow-up | Feature negation suppressed separately requested maintenance | `不要实现新功能，只修复缺陷` selects Maintainer/code |

Focused regression additions are in `scripts/test-v2.mjs`; legacy shape expectations were updated in `scripts/test-v3.mjs`. The Reviewer reported no remaining established findings in the requested scope after the final fixes.

## Verification evidence

Environment: Linux, Node `v22.23.1`. Mutation-capable verification used temporary copies and isolated APG homes. Original candidate files and Git status were compared against the initial verifier snapshot and were unchanged at verifier completion.

| Check | Result |
| --- | --- |
| Complete `scripts/test-release.sh` | Passed: schema, routing, install lifecycle, V2, V3, catalog, project validation, source manifest, whitespace |
| Independently checked manifest | All 93 runtime manifest files matched their sizes and SHA-256 values |
| Fresh schema 1 route oracle | All 23 routes in both CLI formats; repeated with mandatory content; independent route/source SHA-256 and actual UTF8 byte counts |
| Current route maxima | Context 2874; JSON 3212; limit 4096 |
| Generic ambiguity | All 4 continuations executed from foreign cwd, including an apostrophe-containing target |
| Language corpus | 11 cases passed, including negation, mixed delivery and quoted protected language |
| Schema 1 split budget | Context 15799 bytes / 3950 tokens succeeds; reconstructed JSON 17358 bytes / 4340 tokens exceeds limit |
| Schema 2 split budget | Context 15799 bytes / 3950 tokens succeeds; reconstructed JSON 17363 bytes / 4341 tokens exceeds limit |
| JSON / project validation negative cases | Exit 2, `context_budget_exceeded`, `checked_format=json`; no target writes |
| Selected-inline materialization | Zero-write preview, apply and validate passed; pre-staged sentinel and index preserved |
| Thin to selected-inline migration | Preview/apply/validate/rollback/revalidate passed; exact bytes, modes, directories, index and exclude restored; dirty root suffix preserved |

The full release gate and manifest file verification were completed by the earlier independent Verifier round and reused as prior evidence. The final supplemental route, boundary and transaction checks were fresh executions; they are not cached replays.

## Evidence locators

These are local temporary artifacts and may disappear during system cleanup. The results above are retained here, but this summary is not a replacement for raw evidence when revalidating a later candidate.

- Final verifier report: `/tmp/apg-r5-verifier-nyTyB5/FINAL-R5-VERDICT.md`.
- Inherited gate and manifest evidence: `/tmp/apg-r5-verifier-nyTyB5/commands.jsonl`.
- Fresh routes and language: `/tmp/apg-r5-verifier-nyTyB5/fresh-r5-OpQE2G/routes-results.json` and `commands.jsonl`.
- Transactions and snapshots: `/tmp/apg-r5-verifier-nyTyB5/fresh-r5-bGqSeP/commands.jsonl` and associated before/after JSON snapshots.
- Split boundaries: `/tmp/apg-r5-verifier-nyTyB5/fresh-r5-8jxftx/boundaries-results.json` and raw context/error/expected-JSON files.
- Consolidated results and original preservation: `/tmp/apg-r5-verifier-nyTyB5/fresh-r5-9m8vKl/final-results.json` and `original-snapshot-check.json`.

## Exceptions and remaining scope

- One temporary budget fixture initially stayed under the limit and failed its harness precondition. It was replaced by a fresh CLI-profile boundary test for both schemas. The failed calibration is retained and is not counted as a passing test.
- The temporary candidate copy's `.git/index` binary differed from its inherited baseline; timing is unknown. All other copied bytes/modes and staged entries matched. The original candidate's full byte/mode and Git-status comparison passed; transaction fixture index/sentinel checks also passed.
- Rejected JSON sizes were independently reconstructed; they are not claimed to be emitted successful JSON responses.
- No real-pilot sibling checkouts, network-dependent field evaluation, production operations, fresh DSH sessions, or multi-model repetitions were executed.
- H4/M9 and R6 remain open. This report does not establish host-enforced routing or model-effective context and grants no production, data, credential, spending or release authority.
- Next handoff: Developer separately plans R6 trusted DSH adapter and schema 2 source-worktree, with explicit cross-repository changes, tool-gate and rollback boundaries. Field Evaluator follows R6 implementation. No commit, tag or published release was created by this work.

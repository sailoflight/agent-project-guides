# ADR 0011: Source-only architecture navigation and project-doc isolation

Status: accepted for the local MVP; independent distribution deferred
Date: 2026-09-23
Scope: source author tools, module contracts and derived human views
Decision authority: user approved the review's non-security improvements and incremental commits

## Decision

Keep APG's authority/runtime surface unchanged. Implement human navigation as a source-only
module, with a separate author command and a portable declared model. Do not add an `apg`
index/serve/search command, database, agent registry or runtime dependency.

Humans own responsibilities, allowed dependencies and conceptual flows. A compile-only ESM
adapter owns static dependency facts; a constrained matcher validates declaration anchors.
Derived views must label these evidence levels rather than present generated prose as policy.

Exclude this repository's documentation index, architecture, module contracts and verification
matrix from BOTH the distribution file set and generic governance catalog. Generic templates
and public V2/V3 contracts still ship. No change to role routing or per-turn context is required.

## Acceptance and limits

Every scoped source file has one module owner; forbidden dependencies, cycles, stale anchors
and stale generated output fail. Every declared module has a readable card and primary-flow
view, with change entrypoints and tests. locate/impact are read-only and rebuild facts from the
current tree. No analyzed source is linked/evaluated, no real service is contacted.

Verification: `scripts/test-architecture.mjs`, architecture check, boundary gate and release
aggregate. Initial coverage is APG and synthetic cross-project fixtures, not a second real
consumer. Dynamic/subprocess/cross-language call graphs and a standalone release are deferred.

## Reversal

Remove the source-only tool/model/generated views without changing consumer runtime behavior.
Keep project-native documentation out of generic distribution even if the visual tool is removed.

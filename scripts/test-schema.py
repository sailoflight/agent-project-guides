#!/usr/bin/env python3
import json
from pathlib import Path

from jsonschema import Draft202012Validator
from jsonschema.exceptions import ValidationError

ROOT = Path(__file__).resolve().parent.parent
SCHEMA = json.loads((ROOT / "schemas/project.schema.json").read_text(encoding="utf-8"))
Draft202012Validator.check_schema(SCHEMA)
VALIDATOR = Draft202012Validator(SCHEMA)

BASE = {
    "schema_version": 1,
    "project_id": "test.schema",
    "provider": {
        "mode": "thin-bootstrap",
        "release": "2.0.0",
        "digest": "sha256:" + "0" * 64,
    },
    "facets": ["cli"],
    "protected_effects": [],
    "policy": {"root": "AGENTS.md", "mandatory": []},
    "layout": {"scratch": [".agent-scratch"], "memory": "docs/memory"},
}

VALIDATOR.validate(BASE)
VALIDATOR.validate({**BASE, "overlays": []})

invalid = [
    {**BASE, "overlays": None},
    {**BASE, "layout": {"scratch": ["/tmp/outside"], "memory": "docs/memory"}},
    {**BASE, "layout": {"scratch": ["../outside"], "memory": "docs/memory"}},
    {**BASE, "layout": {"scratch": ["dir\\outside"], "memory": "docs/memory"}},
    {**BASE, "layout": {"scratch": ["C:/outside"], "memory": "docs/memory"}},
    {**BASE, "layout": {"scratch": ["./scratch"], "memory": "docs/memory"}},
    {**BASE, "layout": {"scratch": ["scratch/"], "memory": "docs/memory"}},
    {**BASE, "layout": {"scratch": [".agent-scratch"], "memory": "docs/../outside"}},
    {**BASE, "provider": {**BASE["provider"], "source": "."}},
]
for candidate in invalid:
    try:
        VALIDATOR.validate(candidate)
    except ValidationError:
        continue
    raise AssertionError(f"schema accepted invalid descriptor: {candidate}")

V3_SCHEMA = json.loads((ROOT / "schemas/project-v3.schema.json").read_text(encoding="utf-8"))
Draft202012Validator.check_schema(V3_SCHEMA)
V3_VALIDATOR = Draft202012Validator(V3_SCHEMA)
V3_BASE = {
    "schema_version": 2,
    "project_id": "test.schema-v3",
    "variant": "selected-inline.none",
    "release": {"policy": "pinned", "version": "3.0.0", "digest": "sha256:" + "1" * 64},
    "documents": {
        "placement": "selected-local",
        "lifecycle": "maintenance",
        "roles": ["development/maintainer", "development/reviewer", "development/verifier"],
        "profiles": ["content-package"],
        "overlays": ["agent-governance"],
    },
    "router": {"strategy": "inline-route", "executable": "none"},
    "context": {"max_tokens": 3072, "clarification_max_tokens": 160},
    "containment": {"workspace": "physical-selected", "host_corpus_exposure": "unknown"},
    "integrity": {"manifest_digest": "sha256:" + "2" * 64, "root_block_hash": "sha256:" + "3" * 64},
    "protected_effects": [],
    "policy": {"root": "AGENTS.md", "mandatory": []},
    "layout": {"guides": ".agent-guides", "scratch": [".agent-scratch"], "memory": "docs/memory"},
}
V3_VALIDATOR.validate(V3_BASE)
V3_VALIDATOR.validate({
    **V3_BASE,
    "release": {**V3_BASE["release"], "runtime_digest": "sha256:" + "4" * 64},
    "variant": "shared-runtime.pinned",
    "documents": {**V3_BASE["documents"], "placement": "shared-packed"},
    "router": {"strategy": "cli-context", "executable": "shared-cli"},
    "containment": {"workspace": "no-generic-corpus", "host_corpus_exposure": "observed-full"},
})
V3_VALIDATOR.validate({
    **V3_BASE,
    "containment": {"workspace": "transitional", "host_corpus_exposure": "unknown"},
    "migration": {"state": "reversible-transition", "from_schema_version": 1, "legacy_provider": "embedded-local"},
})
for candidate in [
    {**V3_BASE, "variant": "selected-cli.shared"},
    {**V3_BASE, "release": {**V3_BASE["release"], "runtime_digest": "sha256:" + "4" * 64}},
    {**V3_BASE, "context": {"max_tokens": 256, "clarification_max_tokens": 256}},
    {**V3_BASE, "containment": {"workspace": "physical-selected", "host_corpus_exposure": "host-enforced-none"}},
    {**V3_BASE, "documents": {**V3_BASE["documents"], "roles": ["development/maintainer", "development/reviewer", "development/verifier", "development/unknown"]}},
    {**V3_BASE, "documents": {**V3_BASE["documents"], "profiles": ["unknown-profile"]}},
    {**V3_BASE, "documents": {**V3_BASE["documents"], "placement": "shared-packed"}},
    {**V3_BASE, "variant": "shared-runtime.pinned", "documents": {**V3_BASE["documents"], "placement": "shared-packed"}, "router": {"strategy": "cli-context", "executable": "shared-cli"}, "containment": {"workspace": "no-generic-corpus", "host_corpus_exposure": "observed-full"}},
    {**V3_BASE, "router": {"strategy": "cli-context", "executable": "shared-cli"}},
    {**V3_BASE, "containment": {"workspace": "transitional", "host_corpus_exposure": "unknown"}},
    {**V3_BASE, "migration": {"state": "reversible-transition", "from_schema_version": 1, "legacy_provider": "thin-bootstrap"}},
]:
    try:
        V3_VALIDATOR.validate(candidate)
    except ValidationError:
        continue
    raise AssertionError(f"v3 schema accepted invalid descriptor: {candidate}")

for schema_name, data_name in [
    ("catalog-entry.schema.json", "catalog/catalog.jsonl"),
    ("context-route.schema.json", "routing/context-routes.jsonl"),
]:
    schema = json.loads((ROOT / "schemas" / schema_name).read_text(encoding="utf-8"))
    Draft202012Validator.check_schema(schema)
    validator = Draft202012Validator(schema)
    for line_number, line in enumerate((ROOT / data_name).read_text(encoding="utf-8").splitlines(), start=1):
        if line:
            try:
                validator.validate(json.loads(line))
            except (ValidationError, json.JSONDecodeError) as error:
                raise AssertionError(f"{data_name}:{line_number}: {error}") from error

print("Project v1/v2, catalog, and context-route JSON Schema acceptance fixtures are valid.")

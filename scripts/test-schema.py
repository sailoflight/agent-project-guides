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

print("Project, catalog, and context-route JSON Schema acceptance fixtures are valid.")

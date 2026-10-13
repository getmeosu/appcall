#!/usr/bin/env python3
"""Validate every checked-in Composio coverage artifact against its manifest.

Severity model (see docs/parity/FULL-DEPTH-CONTRACT.md):

- ``core`` findings always fail: identity sum, mapped-operation evidence,
  duplicate tools across lists, empty reasons, incomplete ``missing_http``
  entries.
- ``advisories`` describe legacy shape: non-canonical key set or entry
  shapes, mapped-as-dict instead of a list, free-form ``why`` syntax,
  missing canonical ``notes``/``full_depth``/``slug``/``composio_tools``.
  They never fail unless ``--strict`` is passed.

Mapped-operation evidence is classified three ways:

- ``mapped_declarative``: the manifest operation declares a concrete
  ``request`` with a non-empty method and path (machine-provable).
- ``mapped_handwritten``: no declarative ``request``, but the literal
  operation key occurs at least once in a file under
  ``runner/connectors/<key>/src/**`` (plain substring search), or — for
  ``kind: "webhook"`` operations — the connector has a registered webhook
  parser.
- ``mapped_unimplemented``: neither of the above; a core violation.

Trigger certification is a distinct pass (see the contract's Trigger
certification section). A mapped ``kind: "webhook"`` operation with no
declarative request and no registered parser is therefore ``trigger_pending``:
an always-reported advisory, never a core failure. A parser counts as
registered when the connector key appears in the ``webhooks`` map in
``runner/bun/src/registry.ts`` or the operation key appears under the
connector's ``src/**``.

Both heuristics (``src/**`` substring search and the ``webhooks`` map scan)
are gate heuristics, not proofs. They can report false positives (the key in
a comment or dead code) and false negatives (generated handlers, generic
dispatch, or registrations living outside the scanned files). A
``mapped_handwritten`` or non-pending webhook classification keeps the default
gate green but is not certification evidence; canonical artifacts remain the
contract surface.
"""

import argparse
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CANONICAL_KEYS = ("key", "slug", "composio_tools", "mapped", "missing_http",
                  "missing_still", "full_depth", "notes")
MAPPED_ENTRY_KEYS = {"tool", "operation"}
MISSING_HTTP_KEYS = {"tool", "method", "path", "docs", "notes"}
MISSING_STILL_KEYS = {"tool", "why"}

WHY_RE = re.compile(
    r"^reason=(no_public_json_route|non_json_success|client_only_projection|"
    r"privileged_dashboard_only_scope|deprecated_product); "
    r"evidence=https?://\S+(,https?://\S+)*; fetched=\d{4}-\d{2}-\d{2}$"
)
NOTES_RE = re.compile(r"^source=https?://\S+; fetched=\d{4}-\d{2}-\d{2}(; dual_mapped=.*)?$")
PLACEHOLDER_REASONS = {"todo", "tbd", "unknown", "n/a", "na", "none", "?"}

CORE_ARTIFACT_UNREADABLE = "core.artifact_unreadable"
CORE_IDENTITY = "core.identity"
CORE_MANIFEST_UNREADABLE = "core.manifest_unreadable"
CORE_MAPPED_OPERATION_MISSING = "core.mapped_operation_missing"
CORE_MAPPED_OPERATION_UNIMPLEMENTED = "core.mapped_operation_unimplemented"
CORE_DUPLICATE_TOOL = "core.duplicate_tool"
CORE_EMPTY_REASON = "core.empty_reason"
CORE_MISSING_HTTP_INCOMPLETE = "core.missing_http_incomplete"

ADV_MAPPED_SHAPE = "legacy.mapped_shape"
ADV_MISSING_STILL_SHAPE = "legacy.missing_still_shape"
ADV_WHY_SYNTAX = "legacy.why_syntax"
ADV_NOTES_PREFIX = "legacy.notes_prefix"
ADV_FULL_DEPTH_MISSING = "legacy.full_depth_missing"
ADV_SLUG_MISSING = "legacy.slug_missing"
ADV_TOTAL_MISSING = "legacy.composio_tools_missing"
ADV_MISSING_HTTP_SHAPE = "legacy.missing_http_shape"
ADV_KEY_SET = "legacy.key_set"
TRIGGER_PENDING = "trigger_pending"

CORE_RULES = (CORE_ARTIFACT_UNREADABLE, CORE_IDENTITY, CORE_MANIFEST_UNREADABLE, CORE_MAPPED_OPERATION_MISSING,
              CORE_MAPPED_OPERATION_UNIMPLEMENTED, CORE_DUPLICATE_TOOL, CORE_EMPTY_REASON,
              CORE_MISSING_HTTP_INCOMPLETE)
ADVISORY_RULES = (ADV_MAPPED_SHAPE, ADV_MISSING_STILL_SHAPE, ADV_WHY_SYNTAX, ADV_NOTES_PREFIX,
                  ADV_FULL_DEPTH_MISSING, ADV_SLUG_MISSING, ADV_TOTAL_MISSING,
                  ADV_MISSING_HTTP_SHAPE, ADV_KEY_SET)


def discover_artifacts(connectors_root):
    patterns = ("*.coverage.json", "*/composio-cover.json", "*/test/composio-cover.json",
                "*/fixtures/composio-coverage.json")
    return sorted({path for pattern in patterns for path in connectors_root.glob(pattern)})


def _connector_key(path, connectors_root, artifact):
    if isinstance(artifact, dict) and isinstance(artifact.get("key"), str) and artifact["key"].strip():
        return artifact["key"]
    relative = path.relative_to(connectors_root)
    if relative.name.endswith(".coverage.json"):
        return relative.name.removesuffix(".coverage.json")
    return relative.parts[0]


def _is_flat_legacy_map(artifact):
    return (isinstance(artifact, dict) and not any(key in artifact for key in CANONICAL_KEYS)
            and artifact and all(isinstance(value, str) for value in artifact.values()))


def _normalize_mapped(artifact, advisories):
    """Return mapped rows [{tool, operation}] and flag non-canonical shapes."""
    mapped = artifact.get("mapped")
    if isinstance(mapped, list):
        rows = []
        for entry in mapped:
            if isinstance(entry, dict) and set(entry) == MAPPED_ENTRY_KEYS:
                rows.append({"tool": entry.get("tool"), "operation": entry.get("operation")})
            elif isinstance(entry, dict):
                rows.append({"tool": entry.get("tool"), "operation": entry.get("operation")})
                advisories.append((ADV_MAPPED_SHAPE, f"mapped entry {entry!r} is not {{tool, operation}}"))
            else:
                rows.append({"tool": None, "operation": None})
                advisories.append((ADV_MAPPED_SHAPE, f"mapped entry {entry!r} is not an object"))
        return rows
    if isinstance(mapped, dict):
        advisories.append((ADV_MAPPED_SHAPE, "mapped is a slug->operation dict instead of a list"))
        return [{"tool": tool, "operation": operation} for tool, operation in mapped.items()]
    dual = artifact.get("dual_mapped")
    if isinstance(dual, dict):
        advisories.append((ADV_MAPPED_SHAPE, "dual_mapped dict instead of a canonical mapped list"))
        rows = []
        for operation, tools in dual.items():
            for tool in tools if isinstance(tools, list) else []:
                rows.append({"tool": tool, "operation": operation})
        return rows
    if _is_flat_legacy_map(artifact):
        advisories.append((ADV_MAPPED_SHAPE, "flat tool->operation dict instead of a canonical mapped list"))
        return [{"tool": tool, "operation": operation} for tool, operation in artifact.items()]
    return []


def _normalize_missing_still(artifact, advisories):
    """Return reason rows and flag non-canonical entries or free-form syntax."""
    entries = artifact.get("missing_still", [])
    if entries is None:
        entries = []
    if not isinstance(entries, list):
        advisories.append((ADV_MISSING_STILL_SHAPE, "missing_still is not a list"))
        return []
    rows = []
    for entry in entries:
        if isinstance(entry, dict) and set(entry) == MISSING_STILL_KEYS:
            rows.append({"tool": entry.get("tool"), "reason": entry.get("why")})
            continue
        if isinstance(entry, dict):
            tool = entry.get("tool", entry.get("slug"))
            reason = entry.get("why", entry.get("reason"))
            rows.append({"tool": tool, "reason": reason})
            advisories.append((ADV_MISSING_STILL_SHAPE,
                               f"missing_still entry {tool!r} is not {{tool, why}}"))
        elif isinstance(entry, str):
            rows.append({"tool": None, "reason": entry})
            advisories.append((ADV_MISSING_STILL_SHAPE, f"string-form missing_still entry {entry!r}"))
        else:
            rows.append({"tool": None, "reason": None})
            advisories.append((ADV_MISSING_STILL_SHAPE, f"missing_still entry {entry!r} is not an object"))
    for row in rows:
        reason = row["reason"]
        if isinstance(reason, str) and reason.strip() and not WHY_RE.match(reason.strip()):
            advisories.append((ADV_WHY_SYNTAX, f"why for {row['tool']!r} is not canonical enum syntax"))
    return rows


def _normalize_missing_http(artifact, advisories):
    entries = artifact.get("missing_http", [])
    if entries is None:
        entries = []
    if not isinstance(entries, list):
        advisories.append((ADV_MISSING_HTTP_SHAPE, "missing_http is not a list"))
        return []
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        if any(not isinstance(entry.get(field), str) or not entry[field].strip()
               for field in ("docs", "notes")):
            advisories.append((ADV_MISSING_HTTP_SHAPE,
                               f"missing_http entry {entry.get('tool')!r} lacks canonical docs/notes"))
    return entries


def _src_text(connectors_root, key, cache):
    """Concatenated UTF-8 text of runner/connectors/<key>/src/** (cached per key)."""
    cache_key = ("src", key)
    if cache_key not in cache:
        parts = []
        src_dir = connectors_root / key / "src"
        if src_dir.is_dir():
            for file in sorted(src_dir.rglob("*")):
                if file.is_file():
                    try:
                        parts.append(file.read_text(encoding="utf-8", errors="ignore"))
                    except OSError:
                        continue
        cache[cache_key] = "\n".join(parts)
    return cache[cache_key]


WEBHOOKS_BLOCK_RE = re.compile(r"^\s*webhooks:\s*\{\s*$")
WEBHOOK_KEY_RE = re.compile(r"^\s*([A-Za-z_][A-Za-z0-9_.-]*|\"[^\"]+\"|'[^']+')\s*:")


def _registered_webhook_connectors(connectors_root, cache):
    """Connector keys registered in the ``webhooks`` map of runner/bun/src/registry.ts."""
    registry_path = connectors_root.parent.parent / "runner/bun/src/registry.ts"
    cache_key = ("registry", str(registry_path))
    if cache_key not in cache:
        keys = set()
        try:
            lines = registry_path.read_text(encoding="utf-8", errors="ignore").splitlines()
        except OSError:
            lines = []
        inside = False
        for line in lines:
            stripped = line.strip()
            if not inside:
                inside = bool(WEBHOOKS_BLOCK_RE.match(line))
                continue
            if stripped.startswith("}"):
                break
            if not stripped or stripped.startswith("//") or stripped.startswith("/*"):
                continue
            match = WEBHOOK_KEY_RE.match(line)
            if match:
                keys.add(match.group(1).strip("\"'"))
        cache[cache_key] = keys
    return cache[cache_key]


def validate_artifact(path, connectors_root, cache=None):
    path = Path(path)
    connectors_root = Path(connectors_root)
    relative = path.relative_to(connectors_root.parent.parent).as_posix()
    try:
        artifact = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        return {"path": relative, "key": None, "format": "legacy", "mapped_count": 0,
                "composio_tools": 0, "full_depth": False,
                "mapped_declarative": 0, "mapped_handwritten": 0, "mapped_unimplemented": 0,
                "trigger_pending": 0,
                "core": [{"rule": CORE_ARTIFACT_UNREADABLE, "message": f"cannot read valid JSON: {error}"}],
                "advisories": []}
    if not isinstance(artifact, dict):
        return {"path": relative, "key": None, "format": "legacy", "mapped_count": 0,
                "composio_tools": 0, "full_depth": False,
                "mapped_declarative": 0, "mapped_handwritten": 0, "mapped_unimplemented": 0,
                "trigger_pending": 0,
                "core": [{"rule": CORE_ARTIFACT_UNREADABLE, "message": "artifact must be a JSON object"}],
                "advisories": []}

    key = _connector_key(path, connectors_root, artifact)
    advisories = []
    mapped = _normalize_mapped(artifact, advisories)
    reasons = _normalize_missing_still(artifact, advisories)
    missing_http = _normalize_missing_http(artifact, advisories)

    if set(artifact) != set(CANONICAL_KEYS):
        missing = sorted(set(CANONICAL_KEYS) - set(artifact))
        extra = sorted(set(artifact) - set(CANONICAL_KEYS))
        detail = ", ".join(filter(None, [f"missing {missing}" if missing else "",
                                         f"extra {extra}" if extra else ""]))
        advisories.append((ADV_KEY_SET, f"top-level key set is not canonical ({detail})"))
    if not isinstance(artifact.get("slug"), str) or not artifact["slug"].strip():
        advisories.append((ADV_SLUG_MISSING, "no canonical slug"))
    if not isinstance(artifact.get("full_depth"), bool):
        advisories.append((ADV_FULL_DEPTH_MISSING, "full_depth is absent or not a boolean"))
    notes = artifact.get("notes")
    if not isinstance(notes, str) or not NOTES_RE.match(notes.strip()):
        advisories.append((ADV_NOTES_PREFIX, "notes is absent or lacks the canonical source/fetched prefix"))

    core = []
    cache = {} if cache is None else cache
    mapped_declarative = mapped_handwritten = mapped_unimplemented = 0
    trigger_pending = 0
    declared = artifact.get("composio_tools")
    total = len(mapped) + len(missing_http) + len(reasons)
    if isinstance(declared, int) and not isinstance(declared, bool):
        if declared != total:
            core.append({"rule": CORE_IDENTITY,
                         "message": f"identity mismatch: mapped {len(mapped)} + missing_http "
                                    f"{len(missing_http)} + missing_still {len(reasons)} != "
                                    f"composio_tools {declared}"})
    else:
        advisories.append((ADV_TOTAL_MISSING, "composio_tools is absent or not an integer"))

    manifest_path = connectors_root / key / "manifest.json"
    operations = {}
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        operations = manifest.get("operations", {})
        if not isinstance(operations, dict):
            raise ValueError("manifest operations must be an object")
    except (OSError, UnicodeError, json.JSONDecodeError, ValueError) as error:
        core.append({"rule": CORE_MANIFEST_UNREADABLE,
                     "message": f"cannot load connector manifest {manifest_path}: {error}"})

    seen_tools = Counter()
    for row in mapped:
        tool, operation = row["tool"], row["operation"]
        if not isinstance(tool, str) or not tool.strip():
            core.append({"rule": CORE_MAPPED_OPERATION_MISSING,
                         "message": f"mapped entry {row!r} has no tool"})
            continue
        seen_tools[tool] += 1
        if not isinstance(operation, str) or not operation.strip():
            core.append({"rule": CORE_MAPPED_OPERATION_MISSING,
                         "message": f"mapped tool {tool!r} has no operation"})
            continue
        definition = operations.get(operation)
        if not isinstance(definition, dict):
            core.append({"rule": CORE_MAPPED_OPERATION_MISSING,
                         "message": f"mapped operation {operation!r} does not exist in manifest"})
            continue
        request = definition.get("request")
        if (isinstance(request, dict) and request
                and str(request.get("method", "")).strip()
                and str(request.get("path", "")).strip()):
            mapped_declarative += 1
        elif definition.get("kind") == "webhook":
            registered = _registered_webhook_connectors(connectors_root, cache)
            if key in registered or operation in _src_text(connectors_root, key, cache):
                mapped_handwritten += 1
            else:
                trigger_pending += 1
                advisories.append((TRIGGER_PENDING,
                                   f"mapped webhook operation {operation!r} has no registered parser "
                                   f"(trigger certification pass pending)"))
        elif operation in _src_text(connectors_root, key, cache):
            mapped_handwritten += 1
        else:
            mapped_unimplemented += 1
            core.append({"rule": CORE_MAPPED_OPERATION_UNIMPLEMENTED,
                         "message": f"mapped operation {operation!r} has no declarative request "
                                    f"and no runner/connectors/{key}/src/** reference"})
    for row in missing_http:
        tool = row.get("tool") if isinstance(row, dict) else None
        if isinstance(tool, str) and tool.strip():
            seen_tools[tool] += 1
        if not isinstance(row, dict) or not str(row.get("method", "")).strip() \
                or not str(row.get("path", "")).strip():
            label = tool if isinstance(tool, str) else row
            core.append({"rule": CORE_MISSING_HTTP_INCOMPLETE,
                         "message": f"missing_http entry {label!r} lacks method or path"})
    for row in reasons:
        tool = row["tool"]
        if isinstance(tool, str) and tool.strip():
            seen_tools[tool] += 1
        reason = row["reason"]
        if not isinstance(reason, str) or not reason.strip() or reason.strip().casefold() in PLACEHOLDER_REASONS:
            core.append({"rule": CORE_EMPTY_REASON,
                         "message": f"missing_still entry {tool!r} has no usable reason"})
    for tool, count in sorted(seen_tools.items()):
        if count > 1:
            core.append({"rule": CORE_DUPLICATE_TOOL,
                         "message": f"tool {tool!r} appears {count} times across lists"})

    artifact_format = "canonical" if not advisories else "legacy"
    return {"path": relative, "key": key, "format": artifact_format,
            "mapped_count": len(mapped), "composio_tools": declared if isinstance(declared, int) else total,
            "mapped_declarative": mapped_declarative, "mapped_handwritten": mapped_handwritten,
            "mapped_unimplemented": mapped_unimplemented, "trigger_pending": trigger_pending,
            "full_depth": artifact.get("full_depth") is True,
            "core": core,
            "advisories": [{"rule": rule, "message": message} for rule, message in advisories]}


def validate_all(connectors_root):
    connectors_root = Path(connectors_root)
    cache = {}
    results = [validate_artifact(path, connectors_root, cache)
               for path in discover_artifacts(connectors_root)]
    rules = defaultdict(lambda: {"severity": None, "count": 0, "artifacts": set()})
    for result in results:
        for finding in result["core"]:
            entry = rules[finding["rule"]]
            entry["severity"] = "core"
            entry["count"] += 1
            entry["artifacts"].add(result["path"])
        for finding in result["advisories"]:
            entry = rules[finding["rule"]]
            entry["severity"] = "advisory"
            entry["count"] += 1
            entry["artifacts"].add(result["path"])
    ordered = sorted(rules.items(), key=lambda item: (item[1]["severity"] != "core", item[0]))
    return {
        "coverage_stats": {
            "certified_count": len(results),
            "canonical_count": sum(result["format"] == "canonical" for result in results),
            "legacy_count": sum(result["format"] == "legacy" for result in results),
            "full_depth_count": sum(result["full_depth"] for result in results),
            "valid_artifact_count": sum(not result["core"] for result in results),
            "core_violations": sum(len(result["core"]) for result in results),
            "advisories": sum(len(result["advisories"]) for result in results),
            "mapped_declarative": sum(result["mapped_declarative"] for result in results),
            "mapped_handwritten": sum(result["mapped_handwritten"] for result in results),
            "mapped_unimplemented": sum(result["mapped_unimplemented"] for result in results),
            "trigger_pending": sum(result["trigger_pending"] for result in results),
        },
        "rules": [{"rule": rule, "severity": data["severity"], "count": data["count"],
                   "artifacts": sorted(data["artifacts"])} for rule, data in ordered],
        "artifacts": results,
    }


def _print_report(report, strict):
    stats = report["coverage_stats"]
    print("Composio coverage validation")
    print(f"Artifacts scanned: {stats['certified_count']} "
          f"(canonical {stats['canonical_count']}, legacy {stats['legacy_count']}); "
          f"full_depth {stats['full_depth_count']}")
    print(f"Core violations: {stats['core_violations']} | Advisories: {stats['advisories']}")
    print(f"Mapped evidence: declarative {stats['mapped_declarative']} | "
          f"handwritten {stats['mapped_handwritten']} | unimplemented {stats['mapped_unimplemented']} | "
          f"trigger_pending {stats['trigger_pending']}")
    flagged = [result for result in report["artifacts"]
               if result["mapped_handwritten"] or result["mapped_unimplemented"]
               or result["trigger_pending"]]
    if flagged:
        print()
        print("Mapped evidence by artifact (handwritten, unimplemented, or trigger_pending > 0):")
        for result in flagged:
            print(f"  {result['path']} declarative={result['mapped_declarative']} "
                  f"handwritten={result['mapped_handwritten']} "
                  f"unimplemented={result['mapped_unimplemented']} "
                  f"trigger_pending={result['trigger_pending']}")
    if report["rules"]:
        print()
        print(f"{'rule':<38} {'severity':<9} {'count':>6}  artifacts")
        for entry in report["rules"]:
            paths = ", ".join(entry["artifacts"])
            print(f"{entry['rule']:<38} {entry['severity']:<9} {entry['count']:>6}  {paths}")
    if stats["core_violations"]:
        print("\nExit 1: core violations present.")
    elif strict and stats["advisories"]:
        print("\nExit 1 (--strict): advisories present.")
    else:
        print("\nExit 0: no blocking violations.")
    return 1 if stats["core_violations"] or (strict and stats["advisories"]) else 0


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT, help="repository root")
    parser.add_argument("--json", action="store_true", help="write the full report as JSON to stdout")
    parser.add_argument("--strict", action="store_true", help="fail on legacy advisories as well as core")
    args = parser.parse_args(argv)
    report = validate_all(args.root / "runner/connectors")
    if args.json:
        stats = report["coverage_stats"]
        status = 1 if stats["core_violations"] or (args.strict and stats["advisories"]) else 0
        report["exit_code"] = status
        print(json.dumps(report, indent=2, ensure_ascii=False))
        return status
    return _print_report(report, args.strict)


if __name__ == "__main__":
    raise SystemExit(main())

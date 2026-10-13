#!/usr/bin/env python3
"""Join AppCall manifests and depth evidence to a Composio toolkit index."""

import argparse
import datetime as dt
import json
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def normalize_slug(value):
    return re.sub(r"[^A-Z0-9]", "", value.upper())


def _false_match_pairs(aliases):
    """(appcall_key, composio_slug) pairs that must never be joined.

    Same-name products can be unrelated (for example Breeze ChMS vs the
    Composio BREEZE project-management toolkit); a declared pair is excluded
    from both the alias table and name normalization.
    """
    pairs = set()
    for entry in aliases.get("false_matches", []):
        if not isinstance(entry, dict):
            continue
        key = entry.get("appcall_key")
        slug = entry.get("composio_slug")
        if isinstance(key, str) and key.strip() and isinstance(slug, str) and slug.strip():
            pairs.add((key, slug))
    return pairs


def resolve_slug(key, index_slugs, alias_table, false_pairs=()):
    forbidden = {slug for appcall_key, slug in false_pairs if appcall_key == key}
    if key in alias_table and alias_table[key] in index_slugs and alias_table[key] not in forbidden:
        return alias_table[key]
    normalized = normalize_slug(key)
    matches = [slug for slug in index_slugs
               if normalize_slug(slug) == normalized and slug not in forbidden]
    return matches[0] if len(matches) == 1 else None


def _load_optional_baseline(path):
    """Read the historical parity report when present; never required for a run."""
    try:
        source = json.loads(path.read_text(encoding="utf-8"))
        return {row["appcall_key"]: row["composio_slug"] for row in source.get("rows", [])}
    except (OSError, UnicodeError, json.JSONDecodeError, KeyError, TypeError):
        return {}


def _alias_table(aliases, baseline):
    """Verified pairs: aliases.json is the committed source of truth.

    The optional historical baseline only fills keys the committed data does
    not already cover, so a fresh checkout resolves every verified pair.
    """
    table = dict(aliases.get("verified_pairs", {}))
    table.update(aliases.get("corrections", {}))
    for key, slug in (baseline or {}).items():
        table.setdefault(key, slug)
    for group in aliases.get("many_to_one", []):
        for key in group.get("keys", []):
            table.setdefault(key, group["slug"])
    for key, slug in _false_match_pairs(aliases):
        if table.get(key) == slug:
            del table[key]
    return table


def _coverage_paths(connectors_root, key):
    candidates = [
        connectors_root / f"{key}.coverage.json",
        connectors_root / key / "test/composio-cover.json",
        connectors_root / key / "composio-cover.json",
        connectors_root / key / "fixtures/composio-coverage.json",
    ]
    return [path for path in candidates if path.is_file()]


def build_exclusions(index, aliases):
    composites = set(aliases.get("composite_toolkits", []))
    composite_rows = [row for row in index["toolkits"] if row["slug"] in composites]
    excluded = []
    for toolkit in index["toolkits"]:
        auth_classes = {part.strip().upper() for part in toolkit["auth"].split(",")}
        if toolkit["slug"].endswith("_MCP") or "DCR_OAUTH" in auth_classes:
            excluded.append({"slug": toolkit["slug"], "name": toolkit["name"],
                             "reason": "Composio-hosted MCP bridge"})
        elif toolkit["slug"] in composites:
            excluded.append({"slug": toolkit["slug"], "name": toolkit["name"],
                             "reason": "composite; components tracked separately"})
    return {
        "source": index["source"],
        "fetched_at": index["fetched_at"],
        "excluded_toolkits": excluded,
        "auth_unportable_classes": [
            {"auth": "OAUTH1", "reason": "placeholder: assess portability before implementation"},
            {"auth": "SAML", "reason": "placeholder: assess portability before implementation"},
        ],
        "composite_components": aliases.get("components_not_aliases", {}),
        "composite_toolkit_slugs_present": sorted(row["slug"] for row in composite_rows),
    }


def build_map_data(repo_root, index, aliases, baseline=None):
    repo_root = Path(repo_root)
    connectors_root = repo_root / "runner/connectors"
    alias_table = _alias_table(aliases, baseline)
    false_pairs = _false_match_pairs(aliases)
    rows_by_slug = {row["slug"]: row for row in index["toolkits"]}
    connector_rows = []
    for manifest_path in sorted(connectors_root.glob("*/manifest.json")):
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        key = manifest.get("key", manifest_path.parent.name)
        slug = resolve_slug(key, set(rows_by_slug), alias_table, false_pairs)
        toolkit = rows_by_slug.get(slug) if slug else None
        operations = manifest.get("operations", {})
        kinds = [operation.get("kind") for operation in operations.values() if isinstance(operation, dict)]
        artifacts = _coverage_paths(connectors_root, key)
        artifact_path = artifacts[0].relative_to(repo_root).as_posix() if artifacts else None
        app_action = kinds.count("action")
        app_webhook = kinds.count("webhook")
        app_sync = kinds.count("sync")
        tools = toolkit["tools"] if toolkit else None
        ratio = round(app_action / tools, 4) if tools else (None if tools is None else 0.0)
        connector_rows.append({
            "key": key,
            "slug": slug,
            "appcall_version": manifest.get("version"),
            "app_action_ops": app_action,
            "app_webhook_ops": app_webhook,
            "app_sync_ops": app_sync,
            "composio_tools": tools,
            "composio_triggers": toolkit["triggers"] if toolkit else None,
            "gap": tools - app_action if tools is not None else None,
            "ratio": ratio,
            "certified": bool(artifacts),
            "artifact_path": artifact_path,
            "composio_name": toolkit["name"] if toolkit else None,
        })
    connector_rows.sort(key=lambda row: row["key"])
    matched_slugs = {row["slug"] for row in connector_rows if row["slug"]}
    exclusions = build_exclusions(index, aliases)
    excluded_slugs = {row["slug"] for row in exclusions["excluded_toolkits"]}
    breadth = [row for row in index["toolkits"] if row["slug"] not in matched_slugs | excluded_slugs]
    breadth.sort(key=lambda row: (-row["tools"], row["slug"]))
    shortlist = [row for row in connector_rows if row["slug"] and not row["certified"]]
    shortlist.sort(key=lambda row: (-row["gap"], row["key"]))
    triggers = [row for row in connector_rows if row["slug"] and row["app_webhook_ops"] < row["composio_triggers"]]
    triggers.sort(key=lambda row: (-(row["composio_triggers"] - row["app_webhook_ops"]), row["key"]))
    totals = {
        **index["totals"],
        "appcall_connectors": len(connector_rows),
        "matched": sum(row["slug"] is not None for row in connector_rows),
        "certified": sum(row["certified"] for row in connector_rows),
        "uncertified_matched": sum(row["slug"] is not None and not row["certified"] for row in connector_rows),
        "breadth_pool": len(breadth),
        "excluded": len(exclusions["excluded_toolkits"]),
    }
    return {
        "generated_at": index["fetched_at"],
        "source": index["source"],
        "index_fetched_at": index["fetched_at"],
        "totals": totals,
        "rows": connector_rows,
        "depth_shortlist": shortlist[:100],
        "breadth_pool": breadth[:300],
        "trigger_shortlist": triggers,
        "exclusions": exclusions,
    }


def render_markdown(data):
    totals = data["totals"]
    lines = [
        "# Composio parity map",
        "",
        f"Source: {data['source']} (fetched {data['index_fetched_at']})",
        "",
        "## Totals",
        "",
        f"- Composio: {totals['toolkits']} toolkits, {totals['tools']:,} tools, {totals['triggers']:,} triggers",
        f"- AppCall: {totals['appcall_connectors']} connectors; {totals['matched']} matched; {totals['certified']} certified; {totals['uncertified_matched']} matched uncertified",
        f"- Unmatched breadth pool: {totals['breadth_pool']} (after exclusions)",
        "",
        "## Connector rows",
        "",
        "| Key | Slug | Version | Actions | Webhooks | Syncs | Composio tools | Triggers | Gap | Ratio | Certified | Artifact |",
        "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | :---: | --- |",
    ]
    for row in data["rows"]:
        cells = [row["key"], row["slug"] or "—", row["appcall_version"] or "—", row["app_action_ops"],
                 row["app_webhook_ops"], row["app_sync_ops"], row["composio_tools"] if row["composio_tools"] is not None else "—",
                 row["composio_triggers"] if row["composio_triggers"] is not None else "—",
                 row["gap"] if row["gap"] is not None else "—", row["ratio"] if row["ratio"] is not None else "—",
                 "yes" if row["certified"] else "no", row["artifact_path"] or "—"]
        lines.append("| " + " | ".join(map(str, cells)) + " |")
    for heading, key in [("Depth shortlist (uncertified; largest gaps first)", "depth_shortlist"),
                         ("Breadth pool (unmatched; largest toolkits first)", "breadth_pool"),
                         ("Trigger shortlist (AppCall webhooks below Composio triggers)", "trigger_shortlist")]:
        lines.extend(["", f"## {heading}", ""])
        if key == "breadth_pool":
            lines.extend(["| Slug | Toolkit | Tools | Triggers | Auth |", "| --- | --- | ---: | ---: | --- |"])
            for row in data[key]:
                lines.append(f"| {row['slug']} | {row['name']} | {row['tools']} | {row['triggers']} | {row['auth']} |")
        else:
            lines.extend(["| Key | Slug | Gap | Actions | Webhooks | Composio triggers | Artifact |", "| --- | --- | ---: | ---: | ---: | ---: | --- |"])
            for row in data[key]:
                lines.append(f"| {row['key']} | {row['slug']} | {row['gap']} | {row['app_action_ops']} | {row['app_webhook_ops']} | {row['composio_triggers']} | {row['artifact_path'] or '—'} |")
    lines.append("")
    return "\n".join(lines)


def _latest_index(directory):
    candidates = sorted(directory.glob("composio-20??-??-??.json"))
    if not candidates:
        raise FileNotFoundError("no dated parity/composio-YYYY-MM-DD.json index found; run fetch_composio_index.py first")
    return candidates[-1]


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--index", type=Path, help="index JSON (default newest dated file in parity/)")
    parser.add_argument("--root", type=Path, default=ROOT, help="repository root")
    parser.add_argument("--date", help="output date suffix (default UTC today)")
    args = parser.parse_args(argv)
    try:
        root = args.root.resolve()
        parity = root / "parity"
        index_path = args.index.resolve() if args.index else _latest_index(parity)
        index = json.loads(index_path.read_text(encoding="utf-8"))
        alias_data = json.loads((Path(__file__).parent / "aliases.json").read_text(encoding="utf-8"))
        baseline = _load_optional_baseline(parity / "composio-full-parity.json")
        data = build_map_data(root, index, alias_data, baseline)
        date = args.date or dt.datetime.now().astimezone().date().isoformat()
        json_path = parity / f"composio-map-{date}.json"
        markdown_path = parity / f"composio-map-{date}.md"
        json_path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        markdown_path.write_text(render_markdown(data), encoding="utf-8")
        exclusions_path = parity / "exclusions.json"
        exclusions_path.write_text(json.dumps(build_exclusions(index, alias_data), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        totals = data["totals"]
        print(f"{json_path}: matched {totals['matched']}/{totals['appcall_connectors']}; "
              f"certified {totals['certified']}; uncertified {totals['uncertified_matched']}; "
              f"breadth pool {totals['breadth_pool']}")
    except (OSError, ValueError, KeyError, json.JSONDecodeError) as error:
        print(f"build_map: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

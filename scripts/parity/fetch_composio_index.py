#!/usr/bin/env python3
"""Fetch and deterministically parse Composio's public toolkit index."""

import argparse
import datetime as dt
import json
import re
import sys
import urllib.request
from pathlib import Path


SOURCE = "https://docs.composio.dev/toolkits"
MINIMUM_ROWS = 1500
ROW_RE = re.compile(
    r"^\|\s*\[(?P<name>.*?)\]\((?P<page>[^)]*)\)\s*\|\s*"
    r"`(?P<slug>[^`]+)`\s*\|\s*(?P<tools>[^|]+)\|\s*"
    r"(?P<triggers>[^|]+)\|\s*(?P<auth>[^|]+)\|\s*(?P<managed>[^|]+)\|\s*$"
)


class IndexParseError(ValueError):
    """The source page did not match the expected complete table format."""


def _integer(value, line_number, field):
    try:
        return int(value.strip().replace(",", ""))
    except ValueError as error:
        raise IndexParseError(f"line {line_number}: invalid {field}: {value!r}") from error


def parse_index(text, minimum_rows=MINIMUM_ROWS):
    rows = []
    seen_slugs = set()
    table_started = False
    for line_number, raw_line in enumerate(text.splitlines(), 1):
        line = raw_line.strip()
        if "| Toolkit | Slug | Tools | Triggers | Auth | Managed App |" in line:
            table_started = True
            continue
        if not table_started or not line.startswith("|"):
            continue
        if re.fullmatch(r"\|[\s:|-]+\|", line):
            continue
        match = ROW_RE.fullmatch(line)
        if not match:
            raise IndexParseError(f"line {line_number}: unparsable toolkit row: {line[:180]}")
        fields = match.groupdict()
        slug = fields["slug"].strip()
        if slug in seen_slugs:
            raise IndexParseError(f"line {line_number}: duplicate slug {slug!r}")
        seen_slugs.add(slug)
        managed_value = fields["managed"].strip().strip("`")
        if managed_value.casefold() in {"yes", "true", "✓", "✔", "managed"}:
            managed_app = True
        elif managed_value.casefold() in {"no", "false", "—", "-", "none", ""}:
            managed_app = False
        else:
            raise IndexParseError(f"line {line_number}: unknown managed-app value {managed_value!r}")
        rows.append({
            "name": fields["name"].strip(),
            "slug": slug,
            "page": fields["page"].strip(),
            "tools": _integer(fields["tools"], line_number, "tools"),
            "triggers": _integer(fields["triggers"], line_number, "triggers"),
            "auth": fields["auth"].strip().strip("`").strip(),
            "managed_app": managed_app,
        })
    if not table_started:
        raise IndexParseError("toolkit table header was not found")
    if len(rows) < minimum_rows:
        raise IndexParseError(f"toolkit row count {len(rows)} is below minimum {minimum_rows}")
    return {
        "totals": {
            "toolkits": len(rows),
            "tools": sum(row["tools"] for row in rows),
            "triggers": sum(row["triggers"] for row in rows),
        },
        "toolkits": rows,
    }


def fetch_index():
    request = urllib.request.Request(SOURCE, headers={
        "Accept": "text/markdown",
        "User-Agent": "appcall-parity-index/1.0",
    })
    with urllib.request.urlopen(request, timeout=30) as response:
        content = response.read().decode("utf-8")
    fetched_at = dt.datetime.now(dt.timezone.utc).replace(microsecond=0)
    parsed = parse_index(content)
    return {
        "fetched_at": fetched_at.isoformat().replace("+00:00", "Z"),
        "source": SOURCE,
        **parsed,
    }, fetched_at.date().isoformat()


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, help="output JSON path (default parity/composio-<UTC-date>.json)")
    args = parser.parse_args(argv)
    try:
        payload, date = fetch_index()
        output = args.out or Path("parity") / f"composio-{date}.json"
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"{output}: {payload['totals']['toolkits']} toolkits, "
              f"{payload['totals']['tools']} tools, {payload['totals']['triggers']} triggers")
    except (OSError, UnicodeError, IndexParseError) as error:
        print(f"fetch_composio_index: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

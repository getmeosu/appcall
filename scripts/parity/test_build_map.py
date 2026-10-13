import json
import tempfile
import unittest
from pathlib import Path

from build_map import (_alias_table, _false_match_pairs, _load_optional_baseline,
                       build_map_data, normalize_slug, resolve_slug)


def index_fixture(*slugs):
    return {
        "source": "fixture", "fetched_at": "2026-10-14T00:00:00Z",
        "totals": {"toolkits": len(slugs), "tools": 4, "triggers": 0},
        "toolkits": [
            {"name": slug.title(), "slug": slug, "page": f"/toolkits/{slug.lower()}.md",
             "tools": 4, "triggers": 0, "auth": "API_KEY", "managed_app": False}
            for slug in slugs
        ],
    }


class BuildMapTests(unittest.TestCase):
    def test_normalization_and_alias_resolution(self):
        self.assertEqual(normalize_slug("Google Workspace"), "GOOGLEWORKSPACE")
        slugs = {"IMAGEKIT_IO", "INSTAGRAM", "BLAZEMETER"}
        self.assertEqual(resolve_slug("imagekit", slugs, {"imagekit": "IMAGEKIT_IO"}), "IMAGEKIT_IO")
        self.assertIsNone(resolve_slug("instagram-standalone", slugs, {}))
        self.assertEqual(resolve_slug("blaze-meter-functional", slugs, {
            "blaze-meter-functional": "BLAZEMETER",
        }), "BLAZEMETER")

    def test_committed_aliases_are_self_contained(self):
        aliases = json.loads((Path(__file__).parent / "aliases.json").read_text(encoding="utf-8"))
        self.assertEqual(len(aliases["verified_pairs"]), 301)
        table = _alias_table(aliases, {})
        self.assertEqual(table["github"], "GITHUB")
        self.assertEqual(table["imagekit"], "IMAGEKIT_IO")
        self.assertEqual(table["blaze-meter-functional"], "BLAZEMETER")

    def test_false_matches_are_never_resolved(self):
        aliases = json.loads((Path(__file__).parent / "aliases.json").read_text(encoding="utf-8"))
        false_pairs = _false_match_pairs(aliases)
        self.assertIn(("breeze", "BREEZE"), false_pairs)
        # A false pair never survives into the alias table, from any source.
        self.assertNotIn("breeze", _alias_table(aliases, {}))
        self.assertNotIn("breeze", _alias_table(aliases, {"breeze": "BREEZE"}))
        slugs = {"BREEZE"}
        # Neither the alias table nor name normalization may re-join the pair.
        self.assertIsNone(resolve_slug("breeze", slugs, {"breeze": "BREEZE"}, false_pairs))
        self.assertIsNone(resolve_slug("breeze", slugs, {}, false_pairs))
        # A neighboring key is unaffected by the false-match guard.
        self.assertEqual(resolve_slug("breezy-hr", slugs | {"BREEZY_HR"},
                                     _alias_table(aliases, {}), false_pairs), "BREEZY_HR")

    def test_map_leaves_false_matched_pair_unmatched(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            connector = root / "runner/connectors/breeze"
            connector.mkdir(parents=True)
            (connector / "manifest.json").write_text(json.dumps({
                "key": "breeze", "version": "0.2.0", "operations": {},
            }))
            aliases = json.loads((Path(__file__).parent / "aliases.json").read_text(encoding="utf-8"))
            data = build_map_data(root, index_fixture("BREEZE", "OTHER"), aliases)
            row = next(row for row in data["rows"] if row["key"] == "breeze")
            self.assertIsNone(row["slug"])
            self.assertIsNone(row["composio_tools"])
            self.assertEqual(data["totals"]["matched"], 0)
            self.assertIn("BREEZE", [pool_row["slug"] for pool_row in data["breadth_pool"]])

    def test_optional_baseline_is_absent_safe(self):
        with tempfile.TemporaryDirectory() as temp:
            missing = Path(temp) / "parity/composio-full-parity.json"
            self.assertEqual(_load_optional_baseline(missing), {})
            corrupt = Path(temp) / "corrupt.json"
            corrupt.write_text("{not json")
            self.assertEqual(_load_optional_baseline(corrupt), {})

    def test_map_resolves_aliases_with_baseline_file_absent(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            connector = root / "runner/connectors/example"
            connector.mkdir(parents=True)
            (connector / "manifest.json").write_text(json.dumps({
                "key": "example", "version": "0.1.0", "operations": {},
            }))
            # No parity/composio-full-parity.json exists anywhere in this tree.
            self.assertFalse((root / "parity/composio-full-parity.json").exists())
            aliases = {"verified_pairs": {"example": "EXAMPLE_IO"}, "corrections": {}}
            data = build_map_data(root, index_fixture("EXAMPLE_IO"), aliases)
            row = data["rows"][0]
            self.assertEqual(row["slug"], "EXAMPLE_IO")
            self.assertEqual(data["totals"]["matched"], 1)

    def test_map_has_versioned_operation_counts_and_certification(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            connector = root / "runner/connectors/example"
            connector.mkdir(parents=True)
            (connector / "manifest.json").write_text(json.dumps({
                "key": "example", "version": "1.2.3", "operations": {
                    "do": {"kind": "action", "request": {"method": "GET", "path": "/"}},
                    "hook": {"kind": "webhook", "request": {"method": "POST", "path": "/hook"}},
                    "sync": {"kind": "sync"},
                },
            }))
            cert = root / "runner/connectors/example.coverage.json"
            cert.write_text(json.dumps({
                "key": "example", "slug": "EXAMPLE", "composio_tools": 2,
                "mapped": [{"tool": "ONE", "operation": "do"}],
                "missing_http": [], "missing_still": [{"tool": "TWO", "why": "No public route."}],
            }))
            data = build_map_data(root, index_fixture("EXAMPLE"), {"verified_pairs": {"example": "EXAMPLE"}})
            row = data["rows"][0]
            self.assertEqual((row["appcall_version"], row["app_action_ops"], row["app_webhook_ops"], row["app_sync_ops"]),
                             ("1.2.3", 1, 1, 1))
            self.assertEqual((row["composio_tools"], row["gap"], row["ratio"]), (4, 3, 0.25))
            self.assertTrue(row["certified"])
            self.assertEqual(data["totals"]["matched"], 1)


if __name__ == "__main__":
    unittest.main()

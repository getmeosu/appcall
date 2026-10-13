import json
import tempfile
import unittest
from pathlib import Path

from build_map import build_map_data, normalize_slug, resolve_slug


class BuildMapTests(unittest.TestCase):
    def test_normalization_and_alias_resolution(self):
        self.assertEqual(normalize_slug("Google Workspace"), "GOOGLEWORKSPACE")
        slugs = {"IMAGEKIT_IO", "INSTAGRAM", "BLAZEMETER"}
        self.assertEqual(resolve_slug("imagekit", slugs, {}, {"imagekit": "IMAGEKIT_IO"}), "IMAGEKIT_IO")
        self.assertIsNone(resolve_slug("instagram-standalone", slugs, {}, {}))
        self.assertEqual(resolve_slug("blaze-meter-functional", slugs, {}, {
            "blaze-meter-functional": "BLAZEMETER",
        }), "BLAZEMETER")

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
            index = {"source": "fixture", "fetched_at": "2026-10-14T00:00:00Z",
                     "totals": {"toolkits": 1, "tools": 4, "triggers": 0}, "toolkits": [
                {"name": "Example", "slug": "EXAMPLE", "page": "/toolkits/example.md", "tools": 4,
                 "triggers": 0, "auth": "API_KEY", "managed_app": False},
            ]}
            data = build_map_data(root, index, {"example": "EXAMPLE"}, {})
            row = data["rows"][0]
            self.assertEqual((row["appcall_version"], row["app_action_ops"], row["app_webhook_ops"], row["app_sync_ops"]),
                             ("1.2.3", 1, 1, 1))
            self.assertEqual((row["composio_tools"], row["gap"], row["ratio"]), (4, 3, 0.25))
            self.assertTrue(row["certified"])
            self.assertEqual(data["totals"]["matched"], 1)


if __name__ == "__main__":
    unittest.main()

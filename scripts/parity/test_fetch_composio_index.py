import unittest

from fetch_composio_index import IndexParseError, parse_index


ROW = "| [Alpha](/toolkits/alpha.md) | `ALPHA` | 3 | 2 | API_KEY | ✓ |"
HEADER = "| Toolkit | Slug | Tools | Triggers | Auth | Managed App |\n|---|---|---|---|---|---|"


class ParseIndexTests(unittest.TestCase):
    def test_parses_table_fields_and_totals(self):
        parsed = parse_index("# Toolkits\n\n" + HEADER + "\n" + ROW, minimum_rows=1)
        self.assertEqual(parsed["totals"], {"toolkits": 1, "tools": 3, "triggers": 2})
        self.assertEqual(parsed["toolkits"][0], {
            "name": "Alpha", "slug": "ALPHA", "page": "/toolkits/alpha.md",
            "tools": 3, "triggers": 2, "auth": "API_KEY", "managed_app": True,
        })

    def test_missing_cells_are_not_silently_dropped(self):
        with self.assertRaisesRegex(IndexParseError, "unparsable"):
            parse_index(HEADER + "\n| [Alpha](/toolkits/alpha.md) | `ALPHA` | 3 |", minimum_rows=1)

    def test_duplicate_slug_is_rejected(self):
        with self.assertRaisesRegex(IndexParseError, "duplicate slug"):
            parse_index(HEADER + "\n" + ROW + "\n" + ROW, minimum_rows=1)

    def test_small_page_is_rejected_at_default_threshold(self):
        with self.assertRaisesRegex(IndexParseError, "minimum"):
            parse_index(HEADER + "\n" + ROW)


if __name__ == "__main__":
    unittest.main()

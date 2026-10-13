import io
import json
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

from validate_coverage import main, validate_artifact


def manifest(operations):
    return json.dumps({"key": "demo", "operations": operations})


def registry_stub(connector_keys):
    entries = "\n".join(f"    {key}: {{ parse: {key.replace('-', '_')}ParseWebhook }},"
                        for key in connector_keys)
    return ("export const builtin = createConnectorRegistry({\n"
            "  manifests: [],\n"
            "  webhooks: {\n" + entries + "\n  },\n});\n")


GET_OP = {"get": {"request": {"method": "GET", "path": "/v1/get"}}}
CANONICAL_WHY = ("reason=no_public_json_route; evidence=https://docs.example/legacy; "
                 "fetched=2026-10-14")
CANONICAL_NOTES = "source=https://docs.composio.dev/toolkits/demo; fetched=2026-10-14"


class ValidatorTestCase(unittest.TestCase):
    def make_repo(self, artifact, operations, artifact_path="demo.coverage.json", src_files=None,
                  registry_webhooks=None):
        temp = tempfile.TemporaryDirectory()
        root = Path(temp.name)
        connector = root / "runner/connectors/demo"
        connector.mkdir(parents=True)
        (connector / "manifest.json").write_text(manifest(operations))
        for name, content in (src_files or {}).items():
            src_path = connector / "src" / name
            src_path.parent.mkdir(parents=True, exist_ok=True)
            src_path.write_text(content)
        if registry_webhooks is not None:
            registry_path = root / "runner/bun/src/registry.ts"
            registry_path.parent.mkdir(parents=True, exist_ok=True)
            registry_path.write_text(registry_stub(registry_webhooks))
        path = root / "runner/connectors" / artifact_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(artifact))
        self.addCleanup(temp.cleanup)
        return path, root / "runner/connectors", root

    def assert_clean(self, result):
        self.assertEqual(result["core"], [])
        self.assertEqual(result["advisories"], [])

    def run_main(self, *argv):
        with redirect_stdout(io.StringIO()):
            return main(list(argv))


class CanonicalFormatTests(ValidatorTestCase):
    def test_canonical_artifact_is_clean_and_exits_zero(self):
        artifact = {
            "key": "demo", "slug": "DEMO", "composio_tools": 3,
            "mapped": [{"tool": "DEMO_GET", "operation": "get"}],
            "missing_http": [{"tool": "DEMO_LIST", "method": "GET", "path": "/v1/list",
                              "docs": "https://docs.example/list", "notes": "status=200; body=object"}],
            "missing_still": [{"tool": "DEMO_LEGACY", "why": CANONICAL_WHY}],
            "full_depth": True, "notes": CANONICAL_NOTES,
        }
        _, connectors, root = self.make_repo(artifact, GET_OP)
        result = validate_artifact(root / "runner/connectors/demo.coverage.json", connectors)
        self.assertEqual(result["format"], "canonical")
        self.assert_clean(result)
        self.assertEqual(result["mapped_declarative"], 1)
        self.assertEqual(self.run_main("--root", str(root)), 0)
        self.assertEqual(self.run_main("--root", str(root), "--strict"), 0)

    def test_canonical_identity_mismatch_is_core(self):
        artifact = {
            "key": "demo", "slug": "DEMO", "composio_tools": 5,
            "mapped": [{"tool": "DEMO_GET", "operation": "get"}],
            "missing_http": [], "missing_still": [{"tool": "DEMO_LEGACY", "why": CANONICAL_WHY}],
            "full_depth": True, "notes": CANONICAL_NOTES,
        }
        _, connectors, root = self.make_repo(artifact, GET_OP)
        result = validate_artifact(root / "runner/connectors/demo.coverage.json", connectors)
        self.assertEqual([finding["rule"] for finding in result["core"]], ["core.identity"])
        self.assertEqual(self.run_main("--root", str(root)), 1)


class LegacyFormatTests(ValidatorTestCase):
    LEGACY_GITHUB_LIKE = {
        "mapped": {"DEMO_GET": "get", "DEMO_NOREQ": "handwritten"},
        "missing_still": [{"slug": "DEMO_LEGACY", "reason": "Classic API was removed."}],
        "added": ["demo.extra"],
    }

    def test_legacy_dict_mapping_yields_advisories_only_and_exit_semantics(self):
        artifact = {
            "mapped": {"DEMO_GET": "get"},
            "missing_still": [{"slug": "DEMO_LEGACY", "reason": "Classic API was removed."}],
            "added": ["demo.extra"],
        }
        _, connectors, root = self.make_repo(artifact, GET_OP)
        result = validate_artifact(root / "runner/connectors/demo.coverage.json", connectors)
        self.assertEqual(result["format"], "legacy")
        self.assertEqual(result["core"], [])
        rules = {entry["rule"] for entry in result["advisories"]}
        self.assertLessEqual({"legacy.mapped_shape", "legacy.missing_still_shape", "legacy.why_syntax",
                              "legacy.notes_prefix", "legacy.full_depth_missing", "legacy.slug_missing",
                              "legacy.composio_tools_missing", "legacy.key_set"}, rules)
        self.assertEqual(self.run_main("--root", str(root)), 0)
        self.assertEqual(self.run_main("--root", str(root), "--strict"), 1)

    def test_legacy_mapped_operation_without_request_or_src_is_core(self):
        _, connectors, root = self.make_repo(dict(self.LEGACY_GITHUB_LIKE),
                                             {"get": {"request": {"method": "GET", "path": "/v1/get"}},
                                              "handwritten": {"kind": "action", "timeoutMs": 1000}})
        result = validate_artifact(root / "runner/connectors/demo.coverage.json", connectors)
        self.assertEqual(result["format"], "legacy")
        core_rules = [finding["rule"] for finding in result["core"]]
        self.assertIn("core.mapped_operation_unimplemented", core_rules)
        self.assertEqual(result["mapped_handwritten"], 0)
        self.assertEqual(result["mapped_unimplemented"], 1)
        self.assertEqual(self.run_main("--root", str(root)), 1)

    def test_mapped_operation_with_src_reference_is_handwritten_not_core(self):
        artifact = {
            "mapped": {"DEMO_GET": "get", "DEMO_NOREQ": "handwritten"},
            "missing_still": [{"slug": "DEMO_LEGACY", "reason": "Classic API was removed."}],
        }
        _, connectors, root = self.make_repo(
            artifact,
            {"get": {"request": {"method": "GET", "path": "/v1/get"}},
             "handwritten": {"kind": "action", "timeoutMs": 1000}},
            src_files={"handlers.ts": "export const ops = { 'handwritten': async () => 1 };"})
        result = validate_artifact(root / "runner/connectors/demo.coverage.json", connectors)
        self.assertEqual(result["core"], [])
        self.assertEqual(result["mapped_declarative"], 1)
        self.assertEqual(result["mapped_handwritten"], 1)
        self.assertEqual(result["mapped_unimplemented"], 0)
        self.assertEqual(self.run_main("--root", str(root)), 0)

    def test_mapped_evidence_counters_split(self):
        artifact = {
            "mapped": {"DEMO_GET": "get", "DEMO_HAND": "handwritten", "DEMO_GONE": "missing_op"},
        }
        _, connectors, root = self.make_repo(
            artifact,
            {"get": {"request": {"method": "GET", "path": "/v1/get"}},
             "handwritten": {"kind": "action", "timeoutMs": 1000}},
            src_files={"handlers.ts": "register('handwritten');"})
        result = validate_artifact(root / "runner/connectors/demo.coverage.json", connectors)
        self.assertEqual(result["mapped_declarative"], 1)
        self.assertEqual(result["mapped_handwritten"], 1)
        self.assertEqual(result["mapped_unimplemented"], 0)
        self.assertEqual([finding["rule"] for finding in result["core"]],
                         ["core.mapped_operation_missing"])

    def test_flat_legacy_map_is_advisory_only(self):
        artifact = {"DEMO_GET": "get"}
        _, connectors, root = self.make_repo(artifact, GET_OP)
        result = validate_artifact(root / "runner/connectors/demo.coverage.json", connectors)
        self.assertEqual(result["core"], [])
        self.assertIn("legacy.mapped_shape", {entry["rule"] for entry in result["advisories"]})
        self.assertEqual(self.run_main("--root", str(root)), 0)

    def test_legacy_test_path_artifact_is_discovered(self):
        artifact = {"DEMO_GET": "get"}
        _, connectors, root = self.make_repo(artifact, GET_OP, artifact_path="demo/test/composio-cover.json")
        result = validate_artifact(root / "runner/connectors/demo/test/composio-cover.json", connectors)
        self.assertEqual(result["key"], "demo")
        self.assertEqual(result["core"], [])


class TriggerPendingTests(ValidatorTestCase):
    WEBHOOK_MANIFEST = {"hook": {"kind": "webhook", "timeoutMs": 1000}}

    def test_webhook_op_without_registered_parser_is_trigger_pending_advisory(self):
        artifact = {"DEMO_HOOK": "hook"}
        _, connectors, root = self.make_repo(artifact, self.WEBHOOK_MANIFEST,
                                             registry_webhooks=["other"])
        result = validate_artifact(root / "runner/connectors/demo.coverage.json", connectors)
        self.assertEqual(result["core"], [])
        self.assertEqual(result["trigger_pending"], 1)
        self.assertEqual(result["mapped_unimplemented"], 0)
        self.assertIn("trigger_pending", {entry["rule"] for entry in result["advisories"]})
        self.assertEqual(self.run_main("--root", str(root)), 0)

    def test_webhook_op_with_registered_parser_has_no_finding(self):
        artifact = {"DEMO_HOOK": "hook"}
        _, connectors, root = self.make_repo(artifact, self.WEBHOOK_MANIFEST,
                                             registry_webhooks=["demo"])
        result = validate_artifact(root / "runner/connectors/demo.coverage.json", connectors)
        self.assertEqual(result["core"], [])
        self.assertEqual(result["trigger_pending"], 0)
        self.assertEqual(result["mapped_handwritten"], 1)
        self.assertNotIn("trigger_pending", {entry["rule"] for entry in result["advisories"]})

    def test_webhook_op_with_src_reference_has_no_finding(self):
        artifact = {"DEMO_HOOK": "hook"}
        _, connectors, root = self.make_repo(artifact, self.WEBHOOK_MANIFEST,
                                             registry_webhooks=["other"],
                                             src_files={"webhook.ts": "parse('hook');"})
        result = validate_artifact(root / "runner/connectors/demo.coverage.json", connectors)
        self.assertEqual(result["core"], [])
        self.assertEqual(result["trigger_pending"], 0)
        self.assertEqual(result["mapped_handwritten"], 1)


class CoreRuleTests(ValidatorTestCase):
    def test_missing_operation_empty_reason_and_duplicate_tool_are_core(self):
        artifact = {
            "key": "demo", "slug": "DEMO", "composio_tools": 3,
            "mapped": [{"tool": "DUP", "operation": "nope"}],
            "missing_http": [], "missing_still": [{"tool": "DUP", "why": ""}],
            "full_depth": False, "notes": CANONICAL_NOTES,
        }
        _, connectors, root = self.make_repo(artifact, GET_OP)
        result = validate_artifact(root / "runner/connectors/demo.coverage.json", connectors)
        core_rules = {finding["rule"] for finding in result["core"]}
        self.assertIn("core.mapped_operation_missing", core_rules)
        self.assertIn("core.empty_reason", core_rules)
        self.assertIn("core.duplicate_tool", core_rules)
        self.assertEqual(self.run_main("--root", str(root)), 1)

    def test_placeholder_reason_is_core(self):
        artifact = {
            "key": "demo", "slug": "DEMO", "composio_tools": 1,
            "mapped": [], "missing_http": [],
            "missing_still": [{"tool": "DEMO_LEGACY", "why": "TODO"}],
            "full_depth": False, "notes": CANONICAL_NOTES,
        }
        _, connectors, root = self.make_repo(artifact, GET_OP)
        result = validate_artifact(root / "runner/connectors/demo.coverage.json", connectors)
        self.assertEqual([finding["rule"] for finding in result["core"]], ["core.empty_reason"])

    def test_missing_http_without_method_or_path_is_core(self):
        artifact = {
            "key": "demo", "slug": "DEMO", "composio_tools": 1,
            "mapped": [], "missing_http": [{"tool": "DEMO_LIST", "method": "GET"}],
            "missing_still": [], "full_depth": False, "notes": CANONICAL_NOTES,
        }
        _, connectors, root = self.make_repo(artifact, GET_OP)
        result = validate_artifact(root / "runner/connectors/demo.coverage.json", connectors)
        core_rules = [finding["rule"] for finding in result["core"]]
        self.assertIn("core.missing_http_incomplete", core_rules)
        adv_rules = [finding["rule"] for finding in result["advisories"]]
        self.assertIn("legacy.missing_http_shape", adv_rules)
        self.assertEqual(self.run_main("--root", str(root)), 1)

    def test_report_prints_rule_breakdown_and_totals(self):
        artifact = {
            "key": "demo", "slug": "DEMO", "composio_tools": 1,
            "mapped": [{"tool": "DEMO_GET", "operation": "nope"}],
            "missing_http": [], "missing_still": [], "full_depth": False, "notes": CANONICAL_NOTES,
        }
        _, _, root = self.make_repo(artifact, GET_OP)
        output = io.StringIO()
        with redirect_stdout(output):
            self.assertEqual(main(["--root", str(root)]), 1)
        text = output.getvalue()
        self.assertIn("Artifacts scanned: 1", text)
        self.assertIn("core.mapped_operation_missing", text)
        self.assertIn("Core violations: 1", text)


if __name__ == "__main__":
    unittest.main()

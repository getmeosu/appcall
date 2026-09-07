import hashlib
import json
import os
import shutil
import tomllib
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).with_name('public-release.py')


class ReleaseGateTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve() / 'source'
        self.root.mkdir()

    def put(self, path, content='safe source\n'):
        target = self.root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content)

    def run_gate(self, *args):
        return subprocess.run(['python3', str(SCRIPT), *args, '--source', str(self.root)], capture_output=True, text=True)

    def legal(self):
        self.put('LICENSE', (SCRIPT.parent.parent / 'LICENSE').read_text())
        self.put('NOTICE', 'AppCall by Meosu\nCopyright 2026 Example Corporation\nUnder section 7(b), preserve attribution.\n')
        self.put('LICENSING', 'AGPL-3.0-only\n')
        self.put('README.md', 'AppCall\n')
        self.put('Cargo.toml', '[workspace.package]\nlicense = "AGPL-3.0-only"\n')
        self.put('package.json', '{"license":"AGPL-3.0-only"}')
        self.put('third_party/NOTICE', 'Third party provenance')
        self.put('third_party/anusa-sdk-go-NOTICE', 'Upstream provenance')
        for name in ('anusa-sdk-go', 'datastar', 'tailwindcss', 'activepieces'):
            self.put('third_party/licenses/' + name + '-LICENSE', 'Upstream license text')

    def test_export_omits_private_paths_and_hashes_exact_bytes(self):
        self.legal()
        self.put('docs/private.md', 'private')
        self.put('.env', 'PRIVATE_VALUE')
        self.put('crates/demo/src/lib.rs')
        destination = Path(self.temp.name).resolve() / 'export'
        result = self.run_gate('export', '--destination', str(destination))
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertFalse((destination / 'docs').exists())
        manifest = json.loads((destination / 'PUBLIC-RELEASE-MANIFEST.json').read_text())
        self.assertIn('crates/demo/src/lib.rs', manifest['files'])
        self.assertEqual(self.run_gate('check').returncode, 1)

    def test_gitleaks_config_exported_only_at_root(self):
        self.legal()
        self.put('.gitleaks.toml', '[extend]\nuseDefault = true\n')
        destination = Path(self.temp.name).resolve() / 'export'
        result = self.run_gate('export', '--destination', str(destination))
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertTrue((destination / '.gitleaks.toml').is_file())
        self.put('runner/.gitleaks.toml', '[extend]\nuseDefault = true\n')
        self.assertNotEqual(self.run_gate('check').returncode, 0)

    def test_gitleaks_exceptions_require_path_and_exact_content(self):
        config = tomllib.loads((SCRIPT.parent.parent / '.gitleaks.toml').read_text())
        self.assertEqual(config['extend'], {'useDefault': True})
        for entry in config['allowlists']:
            self.assertEqual(entry['condition'], 'AND')
            self.assertEqual(len(entry['paths']), 1)
            self.assertTrue(entry['targetRules'])
            self.assertTrue(all(r.startswith('^') and r.endswith('$') for r in entry['regexes']))

    def test_gitleaks_known_fixture_and_new_same_file_secret(self):
        binary = os.environ.get('GITLEAKS_BIN') or shutil.which('gitleaks')
        if not binary:
            self.skipTest('set GITLEAKS_BIN for real scanner integration')
        config = SCRIPT.parent.parent / '.gitleaks.toml'
        path = 'runner/connectors/clickup/test/actions.test.ts'
        self.put(path, (SCRIPT.parent.parent / path).read_text())
        def scan():
            return subprocess.run([binary, 'dir', str(self.root), '--config', str(config),
                                   '--redact', '--no-banner', '--exit-code', '1'],
                                  capture_output=True, text=True)
        self.assertEqual(scan().returncode, 0)
        candidate = 'ghp_' + hashlib.sha256(b'new unreviewed synthetic scanner regression').hexdigest()[:36]
        with (self.root / path).open('a') as output:
            output.write('\nconst credential = "' + candidate + '";\n')
        self.assertEqual(scan().returncode, 1)
        self.put(path, (SCRIPT.parent.parent / path).read_text())
        # Even sharing a known fixture line does not exempt a newly added credential.
        target = self.root / path
        lines = target.read_text().splitlines()
        lines[45] += ' const credential = "' + candidate + '";'
        target.write_text('\n'.join(lines) + '\n')
        self.assertEqual(scan().returncode, 1)

    def test_nested_destination_refused(self):
        result = self.run_gate('export', '--destination', str(self.root / 'export'))
        self.assertNotEqual(result.returncode, 0)

    def test_existing_destination_refused(self):
        destination = Path(self.temp.name).resolve() / 'export'
        destination.mkdir()
        self.assertNotEqual(self.run_gate('export', '--destination', str(destination)).returncode, 0)

    def test_symlink_refused(self):
        self.legal()
        (self.root / 'crates').symlink_to('/tmp', target_is_directory=True)
        result = self.run_gate('export', '--destination', str(Path(self.temp.name).resolve() / 'out'))
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('symlink', result.stdout)

    def test_case_variant_and_agent_file_denied(self):
        self.legal()
        self.put('crates/demo/SECRET.MD')
        self.put('runner/AGENTS.md')
        result = self.run_gate('check')
        self.assertEqual(result.returncode, 1)
        self.assertIn('path-not-allowed', result.stdout)

    def test_secret_diagnostic_does_not_print_value(self):
        self.legal()
        secret = 'ghp_' + 'a' * 36
        self.put('runner/fixture.json', json.dumps({'token': secret}))
        result = self.run_gate('check')
        self.assertEqual(result.returncode, 1)
        self.assertNotIn(secret, result.stdout + result.stderr)
        self.assertIn('credential-token', result.stdout)

    def test_index_ignores_gitignore_and_scans_staged_blob(self):
        self.legal()
        subprocess.run(['git', 'init', '-q', str(self.root)], check=True)
        self.put('.gitignore', 'docs/\n')
        self.put('docs/private.txt')
        subprocess.run(['git', '-C', str(self.root), 'add', '-f', '.'], check=True)
        (self.root / 'docs/private.txt').unlink()
        result = self.run_gate('check', '--index')
        self.assertEqual(result.returncode, 1)
        self.assertIn('docs/private.txt', result.stdout)

    def test_legal_placeholder_and_ai_credit_fail(self):
        self.legal()
        self.put('NOTICE', 'Copyright [YEAR] [OWNER]\n')
        self.put('runner/index.ts', '// Generated by ' + 'ChatGPT\n')
        result = self.run_gate('check')
        self.assertIn('legal-placeholder', result.stdout)
        self.assertIn('ai-attribution', result.stdout)

    def test_generic_ai_product_terms_allowed(self):
        self.legal()
        self.put('runner/index.ts', '// AI integration using OpenAI and Claude APIs\n')
        self.assertEqual(self.run_gate('check').returncode, 0)

    def test_manifest_detects_mutation(self):
        self.legal()
        destination = Path(self.temp.name).resolve() / 'export'
        self.assertEqual(self.run_gate('export', '--destination', str(destination)).returncode, 0)
        (destination / 'README.md').write_text('Changed')
        result = subprocess.run(['python3', str(SCRIPT), 'check', '--source', str(destination)], capture_output=True, text=True)
        self.assertEqual(result.returncode, 1)
        self.assertIn('manifest-mismatch', result.stdout)

    def test_reviewed_fixture_exception_requires_exact_hash(self):
        self.legal()
        path = 'runner/test/fixture.json'
        content = json.dumps({'token': 'ghp_' + 'b' * 36})
        self.put(path, content)
        self.put('.github/public-release-policy.json', json.dumps({
            'version': 1, 'reviewed_fixture_exceptions': [{
                'path': path, 'sha256': hashlib.sha256(content.encode()).hexdigest(),
                'rules': ['credential-token'], 'reason': 'Unit test synthetic token',
            }],
        }))
        self.assertEqual(self.run_gate('check').returncode, 0)
        self.put(path, content + ' ')
        result = self.run_gate('check')
        self.assertEqual(result.returncode, 1)
        self.assertIn('fixture-exception-hash-mismatch', result.stdout)
        self.assertIn('credential-token', result.stdout)

    def test_binary_and_traversal_paths_rejected(self):
        self.legal()
        self.put('runner/binary.json', 'hello\x00world')
        result = self.run_gate('check')
        self.assertIn('binary-content', result.stdout)

    def test_index_symlink_rejected(self):
        self.legal()
        subprocess.run(['git', 'init', '-q', str(self.root)], check=True)
        (self.root / 'runner').mkdir()
        (self.root / 'runner/link.ts').symlink_to('/etc/passwd')
        subprocess.run(['git', '-C', str(self.root), 'add', '.'], check=True)
        result = self.run_gate('check', '--index')
        self.assertIn('non-regular-index-entry', result.stdout)

    def test_enterprise_contents_require_separate_license_review(self):
        self.legal()
        self.put('enterprise/src/lib.rs')
        destination = Path(self.temp.name).resolve() / 'export'
        result = self.run_gate('export', '--destination', str(destination))
        self.assertEqual(result.returncode, 1)
        self.assertIn('enterprise-license-review-required', result.stdout)
        self.assertFalse(destination.exists())
        self.assertEqual(self.run_gate('check').returncode, 1)

    def test_exact_provenance_exported_and_atlas_checksum_excluded(self):
        self.legal()
        self.put('third_party/anusa-sdk-go-NOTICE', 'Upstream copyright and provenance')
        self.put('migrations/atlas.sum', 'h1:example')
        destination = Path(self.temp.name).resolve() / 'export'
        result = self.run_gate('export', '--destination', str(destination))
        self.assertEqual(result.returncode, 0, result.stdout)
        manifest = json.loads((destination / 'PUBLIC-RELEASE-MANIFEST.json').read_text())
        self.assertNotIn('migrations/atlas.sum', manifest['files'])
        self.assertIn('third_party/anusa-sdk-go-NOTICE', manifest['files'])
        self.assertNotIn('PUBLIC-RELEASE-MANIFEST.json', manifest['files'])

    def test_redistributed_licenses_are_required_and_exported(self):
        self.legal()
        destination = Path(self.temp.name).resolve() / 'export'
        result = self.run_gate('export', '--destination', str(destination))
        self.assertEqual(result.returncode, 0, result.stdout)
        for name in ('anusa-sdk-go', 'datastar', 'tailwindcss', 'activepieces'):
            self.assertTrue((destination / ('third_party/licenses/' + name + '-LICENSE')).is_file())
        (self.root / 'third_party/licenses/datastar-LICENSE').unlink()
        result = self.run_gate('check')
        self.assertEqual(result.returncode, 1)
        self.assertIn('third-party-license-missing', result.stdout)

    def test_atlas_standard_and_unpinned_community_fail(self):
        self.legal()
        for reference in ('arigaio/atlas:1.3.2@sha256:' + 'a' * 64,
                          'arigaio/atlas:1.3.2-community',
                          'arigaio/atlas:latest', '${ATLAS_IMAGE}'):
            self.put('Dockerfile.api', 'FROM ' + reference + ' AS atlas\nCOPY --from=atlas /atlas /atlas\n')
            result = self.run_gate('check')
            self.assertEqual(result.returncode, 1, reference)
            self.assertIn('atlas-dependency-forbidden', result.stdout)

    def test_atlas_pinned_community_reference_blocked(self):
        self.legal()
        self.put('Dockerfile.api', 'FROM arigaio/atlas:1.3.2-community@sha256:' + 'a' * 64 + ' AS atlas\nCOPY --from=atlas /atlas /atlas\n')
        result = self.run_gate('check')
        self.assertEqual(result.returncode, 1, result.stdout)
        self.put('Dockerfile.api', 'FROM arigaio/atlas:1.3.2-community@sha256:' + 'a' * 64 + ' AS atlas\nCOPY --from=arigaio/atlas:latest /atlas /atlas\n')
        result = self.run_gate('check')
        self.assertIn('atlas-dependency-forbidden', result.stdout)

    def test_truncated_license_and_missing_attribution_fail(self):
        self.legal()
        self.put('LICENSE', 'GNU AFFERO GENERAL PUBLIC LICENSE')
        self.put('NOTICE', 'Copyright 2026 Example Corporation')
        result = self.run_gate('check')
        self.assertIn('agpl-license-hash-mismatch', result.stdout)
        self.assertIn('required-attribution-missing', result.stdout)

    def test_ci_standard_and_pinned_community_atlas_blocked(self):
        self.legal()
        self.put('.github/workflows/ci.yml', 'run: docker create arigaio/atlas:1.3.2@sha256:' + 'a' * 64)
        result = self.run_gate('check')
        self.assertIn('atlas-dependency-forbidden', result.stdout)
        self.put('.github/workflows/ci.yml', 'run: docker create arigaio/atlas:1.3.2-community@sha256:' + 'a' * 64)
        self.assertEqual(self.run_gate('check').returncode, 1)

    def test_go_workspace_artifacts_denied_in_final_tree(self):
        self.legal()
        for name in ('go.mod', 'go.sum', 'go.work', 'go.work.sum'):
            self.put('crates/' + name + '/nested/' + name, 'module example')
        result = self.run_gate('check')
        self.assertEqual(result.returncode, 1)
        for name in ('go.mod', 'go.sum', 'go.work', 'go.work.sum'):
            self.assertIn('crates/' + name + '/nested/' + name, result.stdout)

    def test_atlas_import_in_runtime_source_denied(self):
        self.legal()
        self.put('crates/demo/src/lib.rs', 'Command::new("atlas").arg("migrate");')
        self.assertIn('atlas-dependency-forbidden', self.run_gate('check').stdout)

    def test_atlas_historical_compatibility_hashes_allowed(self):
        self.legal()
        self.put('crates/demo/src/lib.rs', '// Historical Atlas checksum for Rust migration compatibility\nconst HASH: &str = "12345";')
        self.assertEqual(self.run_gate('check').returncode, 0)


if __name__ == '__main__':
    unittest.main()

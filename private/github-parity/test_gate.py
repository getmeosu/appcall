#!/usr/bin/env python3
"""Tests for the GitHub parity gate: python3 private/github-parity/test_gate.py"""
import importlib.util
from pathlib import Path
import sys
import unittest

sys.dont_write_bytecode = True

_spec = importlib.util.spec_from_file_location('gate', Path(__file__).with_name('gate.py'))
gate = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(gate)

ROWS = [
    {'slug': 'GITHUB_LIST_COMMITS', 'status': 'covered', 'op': 'commits.list'},
    {'slug': 'GITHUB_GET_A_COMMIT', 'status': 'covered', 'op': 'commits.get'},
    {'slug': 'GITHUB_PUSH_HOOK', 'status': 'covered', 'op': 'webhook.push'},
    {'slug': 'GITHUB_FOLLOW_USER_GRAPHQL', 'status': 'uncovered', 'restSibling': 'user.following.follow'},
    {'slug': 'GITHUB_RUN_GRAPH_QL_RELAY_QUERY', 'status': 'uncovered', 'restSibling': None},
    {'slug': 'GITHUB_GONE', 'status': 'covered', 'op': 'nope.list'},
]
OPS = {
    'commits.list': {'kind': 'sync'}, 'commits.get': {'kind': 'action'}, 'webhook.push': {'kind': 'webhook'},
    'user.following.follow': {'kind': 'action'}, 'graphql.query': {'kind': 'action'},
}


def old_evaluate(rows, ops):
    """The pre-D1 rule (any existing key counts), kept only to prove the tests catch it."""
    return sum(1 for r in rows if gate.gate_op(r) in ops)


class GateRuleTests(unittest.TestCase):
    def test_sync_and_webhook_ops_never_count(self):
        ok, missing, not_action, _ = gate.evaluate(ROWS, OPS, {})
        self.assertEqual(ok, 3)  # commits.get, REST sibling, RELAY -> graphql.query
        self.assertIn(('GITHUB_LIST_COMMITS', 'commits.list', 'sync'), not_action)
        self.assertIn(('GITHUB_PUSH_HOOK', 'webhook.push', 'webhook'), not_action)
        self.assertEqual(missing, [('GITHUB_GONE', 'nope.list')])

    def test_old_rule_would_overcount(self):
        # Fails on the old behaviour: the old rule counts the sync and webhook keys (5, not 3).
        self.assertEqual(old_evaluate(ROWS, OPS), 5)
        self.assertNotEqual(gate.evaluate(ROWS, OPS, {})[0], old_evaluate(ROWS, OPS))

    def test_disagreement_reported(self):
        *_, disagree = gate.evaluate(ROWS, OPS, {'GITHUB_GET_A_COMMIT': 'repos.commits.get'})
        self.assertEqual(disagree, [('GITHUB_GET_A_COMMIT', 'commits.get', 'repos.commits.get')])


class RepoGateTests(unittest.TestCase):
    """The real audit data against this tree's manifest and composio-coverage.json."""

    def setUp(self):
        self.rows, self.drops = gate.load_audit()
        self.ops = gate.read(None, gate.MANIFEST)['operations']
        self.mapped = gate.read(None, gate.COVERAGE)['mapped']

    def test_audit_partitions_the_846_named_slugs(self):
        self.assertEqual(len(self.rows) + len(self.drops), gate.TOTAL)
        self.assertEqual((len(self.rows), len(self.drops)), (793, 53))

    def test_every_gate_row_is_an_action_and_math_is_846(self):
        ok, missing, not_action, _ = gate.evaluate(self.rows, self.ops, self.mapped)
        self.assertEqual((ok, missing, not_action), (793, [], []))
        self.assertEqual(ok + len(self.drops), gate.TOTAL)

    def test_gate_and_coverage_json_agree_on_every_slug(self):
        *_, disagree = gate.evaluate(self.rows, self.ops, self.mapped)
        self.assertEqual(disagree, [])

    def test_paths_are_repo_relative(self):
        for name in ('gate.py', 'test_gate.py', 'gate-audit-a1549a6d.json', 'composio-github-tools.txt'):
            text = Path(__file__).with_name(name).read_text()
            self.assertNotIn('/' + 'workspace', text, name)


if __name__ == '__main__':
    unittest.main()

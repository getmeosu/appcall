#!/usr/bin/env python3
"""GitHub 846 parity gate: per-slug Composio coverage at a git rev or the working tree.

usage: python3 private/github-parity/gate.py [REV ...]   (default: the working tree)

The 846 Composio-named GitHub slugs (composio-github-tools.txt) are partitioned by the gate
audit (gate-audit-a1549a6d.json) into gate rows and cited drops. A gate row counts as covered
only when its op exists in the manifest AND is kind=action: sync and webhook ops are tool=false
and never cover a slug. Every gate row must also agree with fixtures/composio-coverage.json.
Exit status is 0 only when all rows are covered, nothing disagrees, and covered + drops = 846.
"""
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
AUDIT = HERE / 'gate-audit-a1549a6d.json'
TOOLS = HERE / 'composio-github-tools.txt'
MANIFEST = 'runner/connectors/github/manifest.json'
COVERAGE = 'runner/connectors/github/fixtures/composio-coverage.json'
RELAY = 'GITHUB_RUN_GRAPH_QL_RELAY_QUERY'
TOTAL = 846


def gate_op(row):
    """The op serving a gate row: its covered op, else the accepted REST sibling / RELAY mapping."""
    if row['status'] == 'covered':
        return row.get('op')
    return row.get('restSibling') or ('graphql.query' if row['slug'] == RELAY else None)


def evaluate(rows, ops, mapped):
    """Return (ok, missing, not_action, disagree); the lists hold (slug, op[, kind|mapped]) tuples."""
    ok, missing, not_action, disagree = 0, [], [], []
    for row in rows:
        op = gate_op(row)
        kind = ops.get(op, {}).get('kind') if op else None
        if kind == 'action':
            ok += 1
        elif kind is None:
            missing.append((row['slug'], op))
        else:
            not_action.append((row['slug'], op, kind))
        if mapped.get(row['slug']) not in (None, op):
            disagree.append((row['slug'], op, mapped.get(row['slug'])))
    return ok, missing, not_action, disagree


def load_audit():
    """Gate rows and drops, checked to partition the 846 named slugs exactly."""
    audit = json.loads(AUDIT.read_text())
    rows, drops = audit['slugs'], audit['drops']
    tools = [line.strip() for line in TOOLS.read_text().splitlines() if line.strip()]
    names = [r['slug'] for r in rows] + list(drops)
    if len(tools) != TOTAL or len(set(tools)) != TOTAL:
        raise SystemExit(f'{TOOLS.name}: expected {TOTAL} unique slugs, got {len(set(tools))}/{len(tools)}')
    if len(names) != len(set(names)) or set(names) != set(tools):
        raise SystemExit('gate rows + drops do not partition the 846 named slugs')
    return rows, drops


def read(rev, path):
    """A repo file at REV, or from the working tree when REV is None."""
    if rev is None:
        return json.loads((ROOT / path).read_text())
    return json.loads(subprocess.check_output(['git', '-C', str(ROOT), 'show', f'{rev}:{path}']))


def run(rev, rows, drops):
    ops = read(rev, MANIFEST)['operations']
    mapped = read(rev, COVERAGE)['mapped']
    ok, missing, not_action, disagree = evaluate(rows, ops, mapped)
    label = rev or 'worktree'
    print(label, 'gate', ok, '/', len(rows), 'missing', missing, 'not-action', not_action,
          'coverage-json disagrees', len(disagree), disagree[:8])
    print(' 846 math: covered', ok, '+ cited drops', len(drops), '=', ok + len(drops),
          '(gate rows + drops =', len(rows) + len(drops), ')')
    return ok == len(rows) and not disagree and ok + len(drops) == TOTAL


def main(revs):
    rows, drops = load_audit()
    results = [run(rev, rows, drops) for rev in (revs or [None])]
    return 0 if all(results) else 1


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))

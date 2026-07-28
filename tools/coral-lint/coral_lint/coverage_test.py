"""The test that stops this tool from silently over- or under-claiming.

Reads the [auto] rules out of the Coral docs and asserts the coverage map
accounts for every one of them. Without this, adding an [auto] rule to the docs
would leave a rule nobody checks and nobody knows is unchecked — which is the
failure the docs' own Enforcement section used to have.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from coral_lint import coverage
from coral_lint.app import IMPLEMENTED

# tools/coral-lint/coral_lint/ -> repo root
DOCS_ROOT = Path(__file__).resolve().parents[3]
DEF_RE = re.compile(r"^(?:- \*\*|\*\*|- )`\[([A-Z][A-Z-]*-\d+)\]`(.*)$")


def _auto_rules() -> set[str]:
    found: set[str] = set()
    seen: set[str] = set()
    for path in sorted(DOCS_ROOT.rglob("*.md")):
        if any(part in {"node_modules", ".vitepress", "dist"} for part in path.parts):
            continue
        for line in path.read_text(encoding="utf-8").split("\n"):
            match = DEF_RE.match(line)
            if not match:
                continue
            rule, rest = match.group(1), match.group(2)
            if rule in seen:
                continue
            seen.add(rule)
            if "`[auto]`" in rest:
                found.add(rule)
    return found


@pytest.fixture(scope="module")
def auto_rules() -> set[str]:
    rules = _auto_rules()
    if not rules:
        pytest.skip("Coral docs not found next to this tool")
    return rules


def test_every_auto_rule_is_either_implemented_or_explained(auto_rules):
    accounted = set(IMPLEMENTED) | set(coverage.UNIMPLEMENTED)
    missing = auto_rules - accounted
    assert not missing, (
        f"[auto] rule(s) {sorted(missing)} exist in the docs but are neither implemented "
        f"nor listed in coverage.UNIMPLEMENTED with a reason."
    )


def test_the_coverage_map_invents_no_rules(auto_rules):
    accounted = set(IMPLEMENTED) | set(coverage.UNIMPLEMENTED)
    phantom = accounted - auto_rules
    assert not phantom, (
        f"coverage claims rule(s) {sorted(phantom)} that are not `[auto]` in the docs — "
        f"either the rule was reclassified or the ID is a typo."
    )


def test_no_rule_is_both_implemented_and_excused():
    assert not (set(IMPLEMENTED) & set(coverage.UNIMPLEMENTED))


def test_every_unimplemented_rule_carries_a_reason():
    blank = [rule for rule, why in coverage.UNIMPLEMENTED.items() if len(why.strip()) < 20]
    assert not blank, f"unimplemented rules with no real reason: {blank}"

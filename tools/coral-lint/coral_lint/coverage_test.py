"""The test that stops this tool from silently over- or under-claiming.

Reads the `[auto]` rules out of `rules.lock` and asserts the coverage map accounts
for every one of them. Without this, adding an `[auto]` rule to the docs would
leave a rule nobody checks and nobody knows is unchecked — which is the failure
the docs' own Enforcement section used to have.

Why the lock rather than the markdown: this file used to carry its own copy of the
definition-line regex from `scripts/rules.mjs`. That is precisely the duplicated
must-not-diverge invariant `[XCUT-1]` and `[DUP-3]` forbid, and it fails in the one
direction a checker cannot survive — a drifted parser recognises *fewer* lines as
definitions, so the rules it stops seeing are the rules it stops demanding coverage
for, and this file goes green while the gap it exists to catch opens up.

`rules.lock` is the artifact `scripts/rules.mjs` already publishes for exactly this:
one parser, one record, many consumers. It is checked in, and the site build fails
when it disagrees with the docs — so a stale lock is *loud*, where a drifted regex
was silent.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from coral_lint import coverage
from coral_lint.app import IMPLEMENTED

# tools/coral-lint/coral_lint/ -> repo root
DOCS_ROOT = Path(__file__).resolve().parents[3]
LOCK = DOCS_ROOT / "rules.lock"


def _auto_rules() -> set[str]:
    """Every rule ID the docs classify `[auto]`, per `rules.lock` (`ID<TAB>class<TAB>page`)."""
    if not LOCK.exists():
        return set()
    found: set[str] = set()
    for line in LOCK.read_text(encoding="utf-8").split("\n"):
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        fields = stripped.split("\t")
        if len(fields) >= 2 and fields[1] == "auto":
            found.add(fields[0])
    return found


@pytest.fixture(scope="module")
def auto_rules() -> set[str]:
    rules = _auto_rules()
    if not rules:
        pytest.skip(f"{LOCK.name} not found next to this tool")
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
        f"coverage claims rule(s) {sorted(phantom)} that rules.lock does not classify "
        f"`[auto]` — either the rule was reclassified or the ID is a typo."
    )


def test_no_rule_is_both_implemented_and_excused():
    assert not (set(IMPLEMENTED) & set(coverage.UNIMPLEMENTED))


def test_every_unimplemented_rule_carries_a_reason():
    blank = [rule for rule, why in coverage.UNIMPLEMENTED.items() if len(why.strip()) < 20]
    assert not blank, f"unimplemented rules with no real reason: {blank}"

"""[IDEM-2] — a read-named slice contains no write or mutation call.

Read-named-ness comes from either the slice or its feature package, because both
spellings occur: `expense/list` and `summary/month` are both reads.

Deliberately one-hop, matching the rule's own wording: SQL write literals and
unambiguous write calls in the slice's own source. Mutation reached through
several indirections is a `[review]` concern, and pretending otherwise here would
mean guessing.
"""

from __future__ import annotations

import re

from ..findings import CheckResult, Finding
from ..layout import Layout, Unit
from .. import pysource

RULE = "IDEM-2"
TITLE = "read-named slices do not mutate"

_TOKENS = re.compile(r"[^a-z0-9]+")


def _tokens(name: str) -> set[str]:
    return {t for t in _TOKENS.split(name.lower()) if t}


def _is_read_named(unit: Unit, read_verbs: frozenset[str]) -> bool:
    names = _tokens(unit.name) | _tokens(unit.path.parent.name)
    return bool(names & read_verbs)


def run(layout: Layout) -> CheckResult:
    if not layout.config.declares_slices:
        return CheckResult(rule=RULE, skipped="needs [coral].feature_dirs in coral.toml")

    read_verbs = frozenset(layout.config.read_verbs)
    findings: list[Finding] = []
    unanalyzed = 0
    checked = 0

    for unit in layout.slices:
        if not _is_read_named(unit, read_verbs):
            continue
        checked += 1
        for path in unit.source_files():
            if path.suffix != ".py":
                unanalyzed += 1
                continue
            tree = pysource.parse(path)
            if tree is None:
                unanalyzed += 1
                continue
            for hit in pysource.write_evidence(tree):
                findings.append(
                    Finding(
                        rule=RULE,
                        path=layout.rel(path),
                        line=hit.line,
                        message=f"read-named slice {unit.name!r} performs a write ({hit.label})",
                        remedy=(
                            "A read must not mutate, including writing a cache. Route the write to a "
                            "set- or event-named handler — a `refresh`/`recompute` slice or an "
                            "`on_change` handler ([STATE-4]) — or rename this slice to signal its real "
                            "effect ([IDEM-1], [IDEM-3])."
                        ),
                    )
                )

    notes: list[str] = [f"{checked} of {len(layout.slices)} slice(s) are read-named"]
    if unanalyzed:
        notes.append(f"{unanalyzed} non-Python or unparseable slice file(s) not analyzed")
    return CheckResult(
        rule=RULE,
        findings=tuple(sorted(findings, key=lambda f: f.sort_key)),
        notes=tuple(notes),
    )

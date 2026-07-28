"""[CONC-1] — a slice holds no mutable state between triggers.

This is the rule that makes every other concurrency question tractable, so it is
worth gating. It is also the check most at risk of false positives, which is why
`pysource.module_level_state` requires evidence of *mutation* and not merely a
mutable literal.
"""

from __future__ import annotations

from ..findings import CheckResult, Finding
from ..layout import Layout
from .. import pysource

RULE = "CONC-1"
TITLE = "no mutable module-level state in a slice"


def run(layout: Layout) -> CheckResult:
    if not layout.config.declares_slices:
        return CheckResult(rule=RULE, skipped="needs [coral].feature_dirs in coral.toml")

    findings: list[Finding] = []
    unanalyzed = 0
    for unit in layout.slices:
        for path in unit.source_files():
            if path.suffix != ".py":
                unanalyzed += 1
                continue
            tree = pysource.parse(path)
            if tree is None:
                unanalyzed += 1
                continue
            for hit in pysource.module_level_state(tree):
                findings.append(
                    Finding(
                        rule=RULE,
                        path=layout.rel(path),
                        line=hit.line,
                        message=f"module-level mutable state {hit.label!r} survives between triggers",
                        remedy=(
                            "Move it into the trigger's own scope. If it is genuinely shared, it is a "
                            "horizontal — construct it at the root, declare whether it is "
                            "concurrency-safe or per-trigger, and inject it ([CONC-2], [XCUT-1]). "
                            "If it is a cache, it needs an owner and an invalidation strategy "
                            "([STATE-6], [STATE-7])."
                        ),
                    )
                )
    notes = ()
    if unanalyzed:
        notes = (f"{unanalyzed} non-Python or unparseable slice file(s) not analyzed",)
    return CheckResult(
        rule=RULE,
        findings=tuple(sorted(findings, key=lambda f: f.sort_key)),
        notes=notes,
    )

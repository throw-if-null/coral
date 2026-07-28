"""[CONFIG-2] — no slice reads the environment or a config file directly.

One `os.getenv` inside a slice defeats the property the whole architecture is
built on: that a slice's world fits in one place. It also makes the slice
untestable without ambient setup, which is why this is a gate and not advice.
"""

from __future__ import annotations

from ..findings import CheckResult, Finding
from ..layout import Layout
from .. import pysource

RULE = "CONFIG-2"
TITLE = "no ambient config reads in a slice"


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
            for hit in pysource.ambient_config_uses(tree):
                findings.append(
                    Finding(
                        rule=RULE,
                        path=layout.rel(path),
                        line=hit.line,
                        message=f"slice reads configuration directly via {hit.label}",
                        remedy=(
                            "Resolve and validate this setting once at the composition root and "
                            "inject it ([CONFIG-1], [CONFIG-3]). The slice should receive the value, "
                            "not go looking for it."
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

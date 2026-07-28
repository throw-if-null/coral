"""[ERR-2] — raised errors use the taxonomy, not ad-hoc types.

Needs the repo to name its taxonomy, because the type is repo-specific. Without
that declaration the check cannot distinguish a taxonomy error from a bespoke
exception, so it skips rather than guessing.
"""

from __future__ import annotations

from ..findings import CheckResult, Finding
from ..layout import Layout
from .. import pysource

RULE = "ERR-2"
TITLE = "raised errors use the taxonomy"


def run(layout: Layout) -> CheckResult:
    config = layout.config
    if not config.declares_slices:
        return CheckResult(rule=RULE, skipped="needs [coral].feature_dirs in coral.toml")
    if not config.error_types:
        return CheckResult(
            rule=RULE,
            skipped="needs [coral].error_types naming this repo's taxonomy constructors",
        )

    allowed = config.error_types
    # Match on the final segment in both directions, so one declaration of
    # `errors.validation` accepts both `errors.validation(...)` and a
    # from-imported `validation(...)`.
    allowed_tails = {name.rsplit(".", 1)[-1] for name in allowed}
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
            for hit in pysource.raised_types(tree):
                if hit.label in allowed or hit.label.rsplit(".", 1)[-1] in allowed_tails:
                    continue
                findings.append(
                    Finding(
                        rule=RULE,
                        path=layout.rel(path),
                        line=hit.line,
                        message=f"raises {hit.label!r}, which is not in the declared taxonomy",
                        remedy=(
                            "Raise the taxonomy error instead: one of the six categories, a stable "
                            "`code` string owned by this slice, and a human-readable message "
                            "([ERR-1], [ERR-2]). The root renders it; the slice never does ([ERR-3])."
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

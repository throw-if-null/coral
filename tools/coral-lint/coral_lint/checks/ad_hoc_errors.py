"""[ERR-2] — raised errors use the project's declared taxonomy, not ad-hoc types.

Needs the repo to name its taxonomy, because the type is repo-specific. Without
that declaration the check cannot distinguish a taxonomy error from a bespoke
exception, so it skips rather than guessing.

[ERR-1] requires the taxonomy to exist and to be declared once; it fixes neither
the number of categories nor their names. So this check reads the constructors
the repo declared in `coral.toml` and never a category list of its own. A repo
with three categories and a repo with Coral's recommended six ([ERR-5]) are both
checked the same way: raise through what you declared, or it is a finding.
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
                            "Raise through this project's declared taxonomy instead: a category from "
                            "the error model the project declared once ([ERR-1]), a stable `code` "
                            "string owned by this slice, and a human-readable message ([ERR-2]). If no "
                            "declared category fits, that is an architectural change to the taxonomy, "
                            "not a new error type here ([AGENT-2], [AGENT-4]). The root renders it; "
                            "the slice never does ([ERR-3])."
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

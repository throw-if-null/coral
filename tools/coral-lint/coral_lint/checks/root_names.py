"""[XCUT-2] / [STRUCT-3] — top-level modules are few and precisely named.

Implemented as an allowlist rather than a denylist. `[BUCKET-1]` catches names
that are known-bad; this catches the horizontal nobody declared — which is how a
bucket arrives under a name no denylist anticipated.
"""

from __future__ import annotations

from ..findings import CheckResult, Finding

RULE = "XCUT-2"
TITLE = "top-level modules are declared horizontals"


def run(layout) -> CheckResult:
    config = layout.config
    if not config.declares_horizontals:
        return CheckResult(
            rule=RULE,
            skipped="needs [coral].app_dirs and [coral].horizontals in coral.toml",
        )

    findings = [
        Finding(
            rule=RULE,
            path=unit.rel,
            message=f"top-level module {unit.name!r} is not a declared horizontal",
            remedy=(
                "Either it is a real horizontal — add it to [coral].horizontals and give it a "
                "precise, domain- or infrastructure-oriented name ([XCUT-2]) — or it is not "
                "cross-cutting and belongs inside the slice that uses it ([STATE-1], [DUP-1])."
            ),
        )
        for unit in layout.top_level
        if unit.name not in config.horizontals
    ]
    return CheckResult(rule=RULE, findings=tuple(sorted(findings, key=lambda f: f.sort_key)))

"""[LIB-3] — a library has no ambient state and no import-time side effects.

The property this protects is concrete: *the library must be constructible more
than once in one process, with two independent configurations, without
interference.* It is the single thing that most often makes a library untestable
for its consumers, and a consumer cannot work around it from outside.

Two exact signals, and the second is the one people forget. Hidden singletons are
familiar; work performed by a plain `import` is not, and it is worse — every
consumer pays for it whether or not they use the feature.
"""

from __future__ import annotations

from ..findings import CheckResult, Finding
from ..layout import Layout
from .. import pysource

RULE = "LIB-3"
TITLE = "no ambient state or import-time side effects in a library"


def run(layout: Layout) -> CheckResult:
    if not layout.config.declares_library:
        return CheckResult(rule=RULE, skipped="needs [coral].library_dirs in coral.toml")

    findings: list[Finding] = []
    unanalyzed = 0

    for path in layout.library_files:
        if path.suffix != ".py":
            unanalyzed += 1
            continue
        tree = pysource.parse(path)
        if tree is None:
            unanalyzed += 1
            continue
        rel = layout.rel(path)

        for hit in pysource.module_level_state(tree):
            findings.append(
                Finding(
                    rule=RULE,
                    path=rel,
                    line=hit.line,
                    message=f"package-level mutable state {hit.label!r} is a hidden singleton",
                    remedy=(
                        "Hold it on an object the consumer constructs, so two instances with "
                        "different configuration cannot interfere ([LIB-3]). A lazily-assigned "
                        "module global is the classic form: return a new instance, or let the "
                        "consumer keep the one it wants ([ROOT-3])."
                    ),
                )
            )

        for hit in pysource.import_time_effects(tree):
            findings.append(
                Finding(
                    rule=RULE,
                    path=rel,
                    line=hit.line,
                    message=f"import performs work: {hit.label}",
                    remedy=(
                        "Move it into a function the consumer calls. Importing a module must do "
                        "nothing but define names — otherwise every consumer pays for this whether "
                        "or not it uses the feature, and cannot opt out ([LIB-3], [EFFECT-2])."
                    ),
                )
            )

    notes = ()
    if unanalyzed:
        notes = (f"{unanalyzed} non-Python or unparseable library file(s) not analyzed",)
    return CheckResult(
        rule=RULE,
        findings=tuple(sorted(findings, key=lambda f: f.sort_key)),
        notes=notes,
    )

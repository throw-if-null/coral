"""[ROOT-2] — the root imports no persistence or domain-internal module.

Implemented as an allowlist over the root's first-party imports, because the root
has exactly three legitimate reasons to import anything local: to construct a
horizontal, to register a slice, or to reach another root. Anything else it
imports is something it operates *on*, and business logic in the root almost
always announces itself that way.

Plus SQL in the root, which is state access wherever it appears.
"""

from __future__ import annotations

from pathlib import Path

from ..findings import CheckResult, Finding
from ..layout import Layout
from .. import pysource

RULE = "ROOT-2"
TITLE = "the root imports no persistence or domain internals"


def _allowed(layout: Layout) -> set[Path]:
    """Horizontals it constructs, slices it registers, roots it composes with."""
    allowed = {
        unit.path for unit in layout.top_level if unit.name in layout.config.horizontals
    }
    allowed |= {unit.path for unit in layout.slices}
    allowed |= set(layout.roots)
    # The app package itself: `from . import x` resolves to the package when `x` is
    # a symbol rather than a submodule, and that is not a reach into anything.
    allowed |= {(layout.repo / d).resolve() for d in layout.config.app_dirs}
    allowed |= {(layout.repo / d).resolve() for d in layout.config.library_dirs}
    return allowed


def run(layout: Layout) -> CheckResult:
    config = layout.config
    if not config.roots:
        return CheckResult(rule=RULE, skipped="needs [coral].roots in coral.toml")
    if not (config.declares_slices and config.declares_horizontals):
        return CheckResult(
            rule=RULE,
            skipped="needs [coral].feature_dirs plus app_dirs/horizontals to classify what the "
                    "root may import",
        )

    allowed = _allowed(layout)
    slice_paths = [unit.path for unit in layout.slices]
    findings: list[Finding] = []
    unanalyzed = 0

    for root in layout.roots:
        if root.suffix != ".py" or not root.is_file():
            unanalyzed += 1
            continue
        tree = pysource.parse(root)
        if tree is None:
            unanalyzed += 1
            continue
        rel = layout.rel(root)

        for hit in pysource.sql_literals(tree):
            findings.append(
                Finding(
                    rule=RULE,
                    path=rel,
                    line=hit.line,
                    message=f"root performs state access ({hit.label})",
                    remedy=(
                        "Move the query into the slice that owns the capability ([STATE-1]); the "
                        "root only constructs the connection horizontal and injects it ([ROOT-1])."
                    ),
                )
            )

        for ref in pysource.imports(tree):
            for target in layout.resolve_import(root, ref):
                if target in allowed:
                    continue
                inside = next((s for s in slice_paths if s in target.parents), None)
                if inside is not None:
                    message = (
                        f"root reaches into slice internals: "
                        f"{layout.rel(target)} inside slice {inside.name!r}"
                    )
                    remedy = (
                        "Import the slice's entry point and let it own its internals "
                        "([COMPOSE-1]). The root registers a capability; it never assembles one."
                    )
                else:
                    message = (
                        f"root imports {layout.rel(target)}, which is neither a declared "
                        f"horizontal nor a slice"
                    )
                    remedy = (
                        "The root may import a horizontal (to construct it), a slice (to register "
                        "it), or another root. If this is a horizontal, declare it in "
                        "[coral].horizontals; if it is persistence or domain logic, the root has "
                        "no business importing it ([ROOT-1], [ROOT-2])."
                    )
                findings.append(
                    Finding(rule=RULE, path=rel, line=ref.line, message=message, remedy=remedy)
                )

    notes = ()
    if unanalyzed:
        notes = (f"{unanalyzed} non-Python or unparseable root file(s) not analyzed",)
    return CheckResult(
        rule=RULE,
        findings=tuple(sorted(findings, key=lambda f: f.sort_key)),
        notes=notes,
    )

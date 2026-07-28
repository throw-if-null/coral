"""[STATE-2] — no shared repository or data-access layer.

The hard part of this rule is that a forbidden repository and a legitimate adapter
can hold identical code. `[STATE-2]`'s own test is *interface ownership*: if a
shared package **defines** the data-access API and slices consume whatever it
offers, it is a repository layer; if the **slice declares** the interface and a
shared package merely implements it, it is an adapter.

Import direction is the observable form of that. A repository is imported **by**
slices. An adapter **imports** slices, to implement their interfaces — the arrow
runs adapter → slice, and no slice mentions it. So the check is: a module holding
SQL that two or more slices import is a shared data-access layer; the same module
holding the same SQL, imported by none of them, is an adapter and passes.

That is why the Go example's generated `store` package is not a finding.
"""

from __future__ import annotations

from ..findings import CheckResult, Finding
from ..layout import Layout, Unit
from .. import pysource

RULE = "STATE-2"
TITLE = "no shared repository or data-access layer"


def _has_sql(unit: Unit) -> bool:
    for path in unit.source_files():
        if path.suffix != ".py":
            continue
        tree = pysource.parse(path)
        if tree is not None and pysource.sql_literals(tree):
            return True
    return False


def _importing_slices(layout: Layout, unit: Unit) -> list[str]:
    names: list[str] = []
    for sl in layout.slices:
        for path in sl.source_files():
            if path.suffix != ".py":
                continue
            tree = pysource.parse(path)
            if tree is None:
                continue
            hit = False
            for ref in pysource.imports(tree):
                for target in layout.resolve_import(path, ref):
                    if target == unit.path or unit.path in target.parents:
                        hit = True
                        break
                if hit:
                    break
            if hit:
                names.append(sl.name)
                break
    return sorted(set(names))


def run(layout: Layout) -> CheckResult:
    config = layout.config
    if not (config.declares_slices and config.app_dirs):
        return CheckResult(
            rule=RULE,
            skipped="needs [coral].feature_dirs and [coral].app_dirs in coral.toml",
        )

    findings: list[Finding] = []
    for unit in layout.top_level:
        if not _has_sql(unit):
            continue
        importers = _importing_slices(layout, unit)
        if len(importers) < 2:
            continue
        findings.append(
            Finding(
                rule=RULE,
                path=unit.rel,
                message=(
                    f"{unit.name!r} holds SQL and is imported by {len(importers)} slices "
                    f"({', '.join(importers)}) — a shared data-access layer"
                ),
                remedy=(
                    "Move each query into the slice that needs it ([STATE-1]); repeated query "
                    "patterns across slices are cheap to generate and are the architecture "
                    "working. If this must stay shared, invert the interface: let each slice "
                    "declare the operations it needs and have this module implement them, so the "
                    "dependency runs adapter → slice and no slice imports it. Connection and "
                    "transaction management may stay here as a `db` horizontal, but without "
                    "queries."
                ),
            )
        )
    return CheckResult(rule=RULE, findings=tuple(sorted(findings, key=lambda f: f.sort_key)))

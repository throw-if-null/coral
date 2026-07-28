"""[STRUCT-1] — every slice ships its tests, colocated or mirrored.

Accepts either arrangement, because the rule does: colocation where the language
allows it, an exact mirror where it does not. The check owns its own matching
logic rather than pushing it into the layout horizontal — that logic is needed by
exactly one check, so `[STATE-1]` says keep it here.
"""

from __future__ import annotations

from pathlib import Path

from ..findings import CheckResult, Finding
from ..layout import Layout, SOURCE_SUFFIXES, Unit

RULE = "STRUCT-1"
TITLE = "every slice ships its tests"


def _test_stems(name: str) -> frozenset[str]:
    return frozenset({f"{name}_test", f"test_{name}", f"{name}_tests", f"{name}.test", f"{name}.spec"})


def _has_test(layout: Layout, unit: Unit) -> bool:
    wanted = _test_stems(unit.name)
    for path in layout.paths:
        if not path.is_file() or path.suffix not in SOURCE_SUFFIXES:
            continue
        # Colocated or mirrored: a matching test stem anywhere in the repo counts,
        # because a mirror is by definition somewhere else.
        if Path(path.name).stem in wanted:
            return True
        # A directory slice may hold differently-named tests inside itself.
        if unit.is_dir and unit.contains(path):
            stem = Path(path.name).stem
            if stem.startswith("test_") or stem.endswith(("_test", "_tests")):
                return True
    return False


def run(layout: Layout) -> CheckResult:
    if not layout.config.declares_slices:
        return CheckResult(rule=RULE, skipped="needs [coral].feature_dirs in coral.toml")

    findings = [
        Finding(
            rule=RULE,
            path=unit.rel,
            message=f"slice {unit.name!r} has no test file",
            remedy=(
                f"Add a behavior test beside it (`{unit.name}_test`) that exercises the slice's "
                f"entry point and asserts its observable contract ([TEST-1]). If the language "
                f"forbids colocation, mirror the package structure exactly."
            ),
        )
        for unit in layout.slices
        if not _has_test(layout, unit)
    ]
    return CheckResult(rule=RULE, findings=tuple(sorted(findings, key=lambda f: f.sort_key)))

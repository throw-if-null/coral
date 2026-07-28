"""[BUCKET-1] — no generic catch-all packages or modules.

The flagship check, and the only one that needs no configuration: a forbidden
bucket is identifiable from its name alone, in any language, which is exactly
why the rule is `[auto]`.
"""

from __future__ import annotations

from ..findings import CheckResult, Finding
from ..layout import Layout, SOURCE_SUFFIXES

RULE = "BUCKET-1"
TITLE = "no generic catch-all packages"

# Unambiguous: these names carry no information about what the code owns.
_FORBIDDEN = ("utils", "util", "helpers", "helper", "shared", "common",
              "services", "repository", "repositories", "misc", "stuff")

# Judgment calls the rule itself hedges on. `models` may be two cohesive domain
# types rather than a grab-bag, and a pre-existing `core` that denotes one
# bounded concept is explicitly grandfathered — so these warn rather than fail.
_SUSPECT = ("models", "core", "base", "lib")


def _remedy(name: str) -> str:
    if name in _SUSPECT:
        return (
            f"If {name!r} holds one cohesive concept, rename it for that concept "
            f"(`pricing`, `scoring`) or grandfather it via [coral].grandfathered. "
            f"If it is a grab-bag, split it: a real horizontal per [XCUT-1], or "
            f"leave the code duplicated per [DUP-1]."
        )
    return (
        f"Give it a precise name for the capability or concern it owns ([MODEL-2]), "
        f"promote its contents to a named horizontal if they carry a must-not-diverge "
        f"invariant ([XCUT-1]), or leave them duplicated in the slices that use them ([DUP-1])."
    )


def run(layout: Layout) -> CheckResult:
    findings: list[Finding] = []
    for path in layout.paths:
        if path.is_file() and path.suffix not in SOURCE_SUFFIXES:
            continue
        name = path.stem if path.is_file() else path.name
        name = name.lower()
        if name not in _FORBIDDEN and name not in _SUSPECT:
            continue
        rel = layout.rel(path)
        if rel in layout.config.grandfathered:
            continue
        kind = "module" if path.is_file() else "package"
        findings.append(
            Finding(
                rule=RULE,
                path=rel,
                message=f"forbidden bucket {kind} {name!r}",
                remedy=_remedy(name),
                severity="warning" if name in _SUSPECT else "error",
            )
        )
    return CheckResult(rule=RULE, findings=tuple(sorted(findings, key=lambda f: f.sort_key)))

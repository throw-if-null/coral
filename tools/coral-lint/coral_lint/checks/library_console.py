"""[LIB-5] — a library never writes to the console or installs a global handler.

Both halves are decisions that belong to the consumer's composition root, and a
library taking them silently overrides an application it cannot see. The console
half is not merely untidy: a library that prints will corrupt the machine-readable
`--json` output of any CLI that depends on it ([OBS-3]), and the CLI author has no
way to find out except from a bug report.

Declared composition roots are exempt — a library that also ships a CLI renders at
that root by design ([ERR-3]).
"""

from __future__ import annotations

from ..findings import CheckResult, Finding
from ..layout import Layout
from .. import pysource

RULE = "LIB-5"
TITLE = "no console writes or global handlers in a library"

_HANDLER_HINTS = ("logging", "signal", "atexit", "warnings", "sys.excepthook",
                  "sys.unraisablehook", "sys.displayhook", "sys.set", "faulthandler",
                  "locale")


def _is_handler(label: str) -> bool:
    return any(label.startswith(hint) for hint in _HANDLER_HINTS)


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

        for hit in pysource.console_and_global_handlers(tree):
            handler = _is_handler(hit.label)
            findings.append(
                Finding(
                    rule=RULE,
                    path=layout.rel(path),
                    line=hit.line,
                    message=(
                        f"library installs a process-wide handler via {hit.label}"
                        if handler
                        else f"library writes to the console via {hit.label}"
                    ),
                    remedy=(
                        "Accept an injected logger or hook and default it to a no-op; never "
                        "configure logging, signals, or hooks for the whole process — that is the "
                        "consumer's root to own ([LIB-5], [LIB-9], [OBS-2])."
                        if handler
                        else "Accept an injected logger or hook interface and default it to "
                        "silence, not to the console. Printing steals a presentation decision "
                        "from the consumer's root and corrupts any CLI's machine contract "
                        "([LIB-5], [LIB-9], [OBS-3])."
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

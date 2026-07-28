"""Horizontal: what this tool does and does not check.

The architecture's own rule is "no silent caps": if a gate bounds its coverage,
it must say what it dropped. A linter that reports "0 findings" for 25 `[auto]`
rules while implementing 7 of them is worse than no linter, because it converts
absence of evidence into a passing gate. So the coverage map is data here, the
tool reports it in every run, and a test asserts it stays in sync with the docs.
"""

from __future__ import annotations

# Every [auto] rule in the Coral docs, and this tool's honest status for it.
# UNIMPLEMENTED entries carry the reason, so the gap is a decision on the record
# rather than an oversight.
UNIMPLEMENTED: dict[str, str] = {
    "CONFIG-4": "secret detection is better served by a dedicated scanner (gitleaks, trufflehog) "
                "than by a second-rate regex here",
    "BUS-3": "system-scale: needs each app's connection config, not one repo's tree",
    "CLI-3": "app-type check: needs the CLI's command registry, which is framework-specific",
    "CLI-6": "app-type check: framework-specific prompt APIs",
    "CLI-8": "app-type check: needs the root's exit-code map",
    "CLI-10": "app-type check: framework-specific flag registry",
    "CLI-11": "app-type check: needs channel analysis of the logging horizontal",
    "BE-5": "app-type check: framework-specific response API",
    "WEB-4": "app-type check: needs the panel/bundle graph",
    "WEB-8": "app-type check: framework-specific routing table",
    "WEB-9": "app-type check: framework-specific response API",
    "GHA-3": "needs action.yml parsing alongside the source",
    "GHA-10": "needs the platform's annotation/output APIs",
    "STRUCT-3": "covered in practice by XCUT-2, which uses the same allowlist",
}


def summarize(implemented: tuple[str, ...]) -> dict[str, object]:
    total = len(implemented) + len(UNIMPLEMENTED)
    return {
        "implemented": list(implemented),
        "unimplemented": dict(sorted(UNIMPLEMENTED.items())),
        "implemented_count": len(implemented),
        "auto_rule_count": total,
    }

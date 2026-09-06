"""Crosscut: what this tool does and does not check.

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
    "CHAN-3": "system-scale: needs each app's connection config, not one repo's tree",
    "CLI-3": "app-type check: needs the CLI's command registry, which is framework-specific",
    "CLI-6": "app-type check: framework-specific prompt APIs",
    "CLI-8": "app-type check: needs the root's exit-code map",
    "CLI-10": "app-type check: framework-specific flag registry",
    "CLI-11": "app-type check: needs stream analysis of the logging crosscut",
    "BE-5": "app-type check: framework-specific response API",
    "WEB-4": "app-type check: needs the import graph, plus the project's own declaration of whether "
             "runtime isolation is claimed — the no-import-edge half of the rule only binds for "
             "microfrontends, and a typed import is correct in an integrated frontend",
    "WEB-8": "app-type check: framework-specific routing table",
    "WEB-9": "app-type check: framework-specific response API",
    "GHA-3": "needs action.yml parsing alongside the source",
    "GHA-10": "needs the platform's annotation/output APIs",
    "STRUCT-3": "covered in practice by XCUT-2, which uses the same allowlist",
    "VER-1": "not applicable to an audited application repo — it governs the Coral documents "
             "themselves, and the Coral repo's own build enforces it against rules.lock",
    "VER-4": "candidate: would mean parsing the audited repo's CORAL.md and checking its extension "
             "IDs against Coral's family names. Worth doing once CORAL.md files exist in the wild",
    "VER-5": "candidate, and the highest-value one left: parse the audited repo's CORAL.md machine "
             "block, resolve each entry's rule ID against rules.lock and each path against the tree, "
             "then suppress findings the project has an exception for. Until this lands, an approved "
             "exception is re-reported on every run",
    "VER-6": "candidate, and the one that would decide which of these checks run at all: parse the "
             "audited repo's CORAL.md adoption block and resolve it against the target version's "
             "ownership and scale registries, then report an undeclared normative surface instead of "
             "guessing. The Coral repo publishes that resolver already (scripts/applicability.mjs); "
             "this tool cannot use it directly because it reads only rules.lock, which carries no "
             "ownership or scale column",
}


def summarize(implemented: tuple[str, ...]) -> dict[str, object]:
    total = len(implemented) + len(UNIMPLEMENTED)
    return {
        "implemented": list(implemented),
        "unimplemented": dict(sorted(UNIMPLEMENTED.items())),
        "implemented_count": len(implemented),
        "auto_rule_count": total,
    }

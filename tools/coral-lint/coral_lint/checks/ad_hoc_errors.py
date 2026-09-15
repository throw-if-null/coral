"""[ERR-2] — raised errors use the owning app or package's taxonomy, not ad-hoc types.

Needs the repo to name its taxonomy, because the type is repo-specific. Without
that declaration the check cannot distinguish a taxonomy error from a bespoke
exception, so it skips rather than guessing.

[ERR-1] requires the taxonomy to exist and to be declared once **for each app or
package**; it fixes neither the number of categories nor their names. So this
check reads the constructors the repo declared in `coral.toml` and never a
category list of its own. A repo with three categories and a repo with Coral's
recommended six ([ERR-5]) are both checked the same way: raise through what your
unit declared, or it is a finding.

The per-unit half is the part that is easy to get wrong. A repository may hold a
backend and a CLI with different taxonomies, and unioning both into one allowlist
would pass a backend slice that raised the CLI's constructor — a real [ERR-1]
boundary violation reported as clean. `[[coral.error_models]]` is how a repo
declares which constructors belong to which unit. The flat `error_types` form
still means "one model for everything here", which is true of a single-unit repo
and false of a multi-unit one, so this check refuses to run on the second rather
than producing that false pass.
"""

from __future__ import annotations

from ..findings import CheckResult, Finding
from ..layout import Layout
from .. import pysource

RULE = "ERR-2"
TITLE = "raised errors use the taxonomy"


def _tails(names: frozenset[str]) -> set[str]:
    """Match on the final segment in both directions, so one declaration of
    `errors.validation` accepts both `errors.validation(...)` and a from-imported
    `validation(...)`."""
    return {name.rsplit(".", 1)[-1] for name in names}


def run(layout: Layout) -> CheckResult:
    config = layout.config
    if not config.declares_slices:
        return CheckResult(rule=RULE, skipped="needs [coral].feature_dirs in coral.toml")
    if not config.error_types and not config.error_models:
        return CheckResult(
            rule=RULE,
            skipped=(
                "needs [coral].error_types, or [[coral.error_models]] when the repo holds more "
                "than one app or package, naming this repo's taxonomy constructors"
            ),
        )
    # The flat form declares one model for the whole repo. That is a true statement
    # about a single-unit repo and a false one about a multi-unit repo, where it
    # would let a slice in one app raise another app's constructor and call it a
    # pass. Skip rather than guess which unit a slice belongs to.  [ERR-1]
    if config.error_types and len(config.declared_units) > 1:
        units = ", ".join(sorted(config.declared_units))
        return CheckResult(
            rule=RULE,
            skipped=(
                f"[coral].error_types declares one repo-wide taxonomy, but this repo declares "
                f"{len(config.declared_units)} app/package units ({units}). [ERR-1] scopes the "
                f"error model to each unit, so one allowlist cannot decide whether a slice raised "
                f"its OWN unit's constructor. Declare [[coral.error_models]] with a `path` and "
                f"`types` per unit"
            ),
        )

    scoped = bool(config.error_models)
    flat_allowed = config.error_types
    flat_tails = _tails(flat_allowed)

    findings: list[Finding] = []
    unanalyzed = 0
    unowned: list[str] = []

    for unit in layout.slices:
        if scoped:
            model = config.error_model_for(unit.rel)
            if model is None:
                # No declared model owns this slice. Saying nothing here would be the
                # same false pass the multi-unit skip above prevents, one slice at a
                # time, so it is reported rather than swallowed.
                unowned.append(unit.rel)
                continue
            allowed, allowed_tails = model.types, _tails(model.types)
        else:
            allowed, allowed_tails = flat_allowed, flat_tails

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
                        message=(
                            f"raises {hit.label!r}, which is not in the taxonomy declared for "
                            f"this app or package"
                        ),
                        remedy=(
                            "Raise through the error model this app or package declared: a "
                            "category from that model ([ERR-1]), a stable `code` string owned by "
                            "this slice, and a human-readable message ([ERR-2]). Another unit's "
                            "constructor does not count. If no declared category fits, changing "
                            "the taxonomy is a change to that shared declaration, not a new error "
                            "type here; flag it if the right category is unclear ([AGENT-2]). "
                            "Presentation belongs to the owning boundary, never to this slice "
                            "([ERR-1])."
                        ),
                    )
                )

    notes: list[str] = []
    if unanalyzed:
        notes.append(f"{unanalyzed} non-Python or unparseable slice file(s) not analyzed")
    if unowned:
        shown = ", ".join(sorted(unowned)[:3])
        more = f", +{len(unowned) - 3} more" if len(unowned) > 3 else ""
        notes.append(
            f"{len(unowned)} slice(s) sit outside every [[coral.error_models]] path and were "
            f"not analyzed ({shown}{more})"
        )
    return CheckResult(
        rule=RULE,
        findings=tuple(sorted(findings, key=lambda f: f.sort_key)),
        notes=tuple(notes),
    )

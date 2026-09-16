"""[ERR-2] — raised errors use the owning app or published package's taxonomy, not ad-hoc types.

Needs the repo to name its taxonomy, because the type is repo-specific. Without
that declaration the check cannot distinguish a taxonomy error from a bespoke
exception, so it skips rather than guessing.

[ERR-1] requires the taxonomy to exist and to be declared once **for each app or
published package**; it fixes neither the number of categories nor their names.
So this check reads the constructors the repo declared in `coral.toml` and never
a category list of its own. A repo with three categories and a repo with Coral's
recommended six ([ERR-5]) are both checked the same way: raise through what your
unit declared, or it is a finding.

The per-unit half is the part that is easy to get wrong, and it fails in three
ways that all look like a clean run:

  * unioning every unit's constructors into one allowlist, which passes a backend
    slice that raised the CLI's constructor. `[[coral.error_models]]` is how a repo
    says which constructors belong to which unit, and config.py refuses a path that
    is not a declared app or published package so a feature package cannot acquire
    a taxonomy of its own;
  * comparing a QUALIFIED raise by its final segment, which passes
    `b_errors.validation` inside app A because A declared `a_errors.validation`.
    Two units naming one category the same thing is ordinary, so the module part is
    compared when the raise site has one. See _declared();
  * analyzing only the slices some model happens to cover and reporting the rest as
    a note. A note does not change the outcome, so the run still exits clean with
    slices nobody checked. Unowned slices skip the whole check instead.

The flat `error_types` form still means "one model for everything here", which is
true of a single-unit repo and false of a multi-unit one, so this check refuses to
run on the second rather than producing that false pass.
"""

from __future__ import annotations

from ..findings import CheckResult, Finding
from ..layout import Layout
from .. import pysource

RULE = "ERR-2"
TITLE = "raised errors use the taxonomy"


def _bare_names(names: frozenset[str]) -> set[str]:
    """The final segment of each declared constructor.

    Used for ONE case: a raise site that names no module, which is what
    `from errors import validation` then `raise validation(...)` produces. The
    module is not in the AST there, so the final segment is all the information
    the raise site carries.
    """
    return {name.rsplit(".", 1)[-1] for name in names}


def _declared(label: str, allowed: frozenset[str], bare: set[str]) -> bool:
    """Is `label` a constructor THIS unit declared?

    A qualified label carries its own module, so it must match a declared
    qualified constructor exactly. Matching it by final segment instead is how a
    slice in app A passes while raising app B's `b_errors.validation`, when A
    declared `a_errors.validation`: two different constructors from two different
    units sharing one tail. That is the cross-unit false pass this check exists to
    prevent ([ERR-1]), so the tail is consulted only when there is no module to
    compare.
    """
    if label in allowed:
        return True
    return "." not in label and label in bare


def run(layout: Layout) -> CheckResult:
    config = layout.config
    if not config.declares_slices:
        return CheckResult(rule=RULE, skipped="needs [coral].feature_dirs in coral.toml")
    if not config.error_types and not config.error_models:
        return CheckResult(
            rule=RULE,
            skipped=(
                "needs [coral].error_types, or [[coral.error_models]] when the repo holds more "
                "than one app or published package, naming this repo's taxonomy constructors"
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
                f"{len(config.declared_units)} app/published-package units ({units}). [ERR-1] "
                f"scopes the error model to each unit, so one allowlist cannot decide whether a "
                f"slice raised its OWN unit's constructor. Declare [[coral.error_models]] with a "
                f"`path` and `types` per unit"
            ),
        )

    # Ownership is resolved for EVERY slice before anything is analyzed, and the
    # resolved pair is what the loop below reads. A slice no declared model owns
    # cannot be decided, and a note beside an otherwise clean result is not a
    # verdict: the run would still report `ran` with zero findings and exit 0, which
    # is the silent pass this check exists to prevent. So an unowned slice skips the
    # check, the same answer the multi-unit case gets, for the same reason.
    flat = (config.error_types, _bare_names(config.error_types))
    owner: dict[str, tuple[frozenset[str], set[str]]] = {}
    unowned: list[str] = []
    for unit in layout.slices:
        if not config.error_models:
            owner[unit.rel] = flat
            continue
        model = config.error_model_for(unit.rel)
        if model is None:
            unowned.append(unit.rel)
        else:
            owner[unit.rel] = (model.types, _bare_names(model.types))

    if unowned:
        shown = ", ".join(sorted(unowned)[:3])
        more = f", +{len(unowned) - 3} more" if len(unowned) > 3 else ""
        return CheckResult(
            rule=RULE,
            skipped=(
                f"{len(unowned)} slice(s) sit outside every [[coral.error_models]] path, so "
                f"which taxonomy owns them is undeclared and [ERR-2] cannot be decided for "
                f"them ({shown}{more}). Give each app or published package holding slices "
                f"an [[coral.error_models]] entry"
            ),
        )

    findings: list[Finding] = []
    unanalyzed = 0

    for unit in layout.slices:
        allowed, bare = owner[unit.rel]

        for path in unit.source_files():
            if path.suffix != ".py":
                unanalyzed += 1
                continue
            tree = pysource.parse(path)
            if tree is None:
                unanalyzed += 1
                continue
            for hit in pysource.raised_types(tree):
                if _declared(hit.label, allowed, bare):
                    continue
                findings.append(
                    Finding(
                        rule=RULE,
                        path=layout.rel(path),
                        line=hit.line,
                        message=(
                            f"raises {hit.label!r}, which is not in the taxonomy declared for "
                            f"this app or published package"
                        ),
                        remedy=(
                            "Raise through the error model this app or published package "
                            "declared: a category from that model ([ERR-1]), a stable `code` "
                            "string owned by this slice, and a human-readable message "
                            "([ERR-2]). Another unit's "
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
    return CheckResult(
        rule=RULE,
        findings=tuple(sorted(findings, key=lambda f: f.sort_key)),
        notes=tuple(notes),
    )

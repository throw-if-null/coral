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
  * comparing a raise by its final segment, which passes `b_errors.validation`
    inside app A because A declared `a_errors.validation`, and passes a locally
    defined `validation()` for the same reason. Two units naming one category the
    same thing is ordinary. Raise sites are resolved to a constructor IDENTITY
    through the module's own imports instead. See _verdict();
  * analyzing only the slices some model happens to cover and reporting the rest as
    a note. A note does not change the outcome, so the run still exits clean with
    slices nobody checked. Unowned slices skip the whole check instead.

The flat `error_types` form still means "one model for everything here", which is
true of a single-unit repo and false of a multi-unit one, so this check refuses to
run on the second rather than producing that false pass.
"""

from __future__ import annotations

from pathlib import Path

from ..findings import CheckResult, Finding
from ..layout import Layout
from .. import pysource

RULE = "ERR-2"
TITLE = "raised errors use the taxonomy"


ACCEPT = "accept"
REJECT = "reject"
UNKNOWN = "unknown"


def _inside(rel: str, unit: str) -> bool:
    """Is the repo-relative path `rel` inside the unit directory `unit`?"""
    return rel == unit or rel.startswith(f"{unit}/")


class _Ref:
    """The shape `Layout.resolve_import` reads. One relative import, one name."""

    __slots__ = ("module", "level", "names")

    def __init__(self, module: str | None, level: int, name: str | None) -> None:
        self.module = module
        self.level = level
        self.names = (name,) if name else ()


def _verdict(
    ctor: pysource.Constructor,
    allowed: frozenset[str],
    layout: Layout,
    source: Path,
    unit: str | None,
) -> str:
    """Did THIS unit declare the constructor this raise site names?

    Identity, never spelling, and the identity has two halves.

    **What the name resolves to.** `raise validation(...)` after
    `from b_errors import validation` is `b_errors.validation`, a finding inside an
    app that declared `a_errors.validation`. A local `def validation` shadows the
    import and is an ad-hoc error type, which is what this rule forbids. Anything
    that is not one definite binding at the raise — a parameter, an assignment, two
    branches importing different modules, a star import that could have replaced
    the name — is UNKNOWN rather than guessed either way.

    **Where it lives.** A relative import spells the same canonical name at any
    depth: `from .errors import validation` and `from ...errors import validation`
    are both `errors.validation`, and two units may legitimately each call their
    own constructor that. So the module is resolved against the repository and
    required to sit inside the unit that owns the raising slice. Climbing out of a
    published package into its host app is a finding, not a match.

    The literal fallback covers a QUALIFIED label whose head this module did not
    import — a package-level or re-exported binding the tool cannot see. The label
    carries its own module there, so accepting only the exact declared dotted name
    stays exact. A bare label never reaches it.
    """
    if ctor.origin == pysource.LOCAL_DEF:
        return REJECT
    if ctor.origin in (pysource.REBOUND, pysource.AMBIGUOUS):
        return UNKNOWN
    if ctor.origin == pysource.UNBOUND:
        if ctor.star:
            return UNKNOWN
        if "." in ctor.label:
            return ACCEPT if ctor.label in allowed else REJECT
        return REJECT

    if ctor.level > 0 and unit is not None:
        targets = layout.resolve_import(source, _Ref(ctor.module, ctor.level, ctor.attr))
        if not targets:
            return UNKNOWN
        for target in targets:
            if not _inside(layout.rel(target), unit):
                return REJECT
    return ACCEPT if ctor.target in allowed else REJECT


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
    # The flat form declares one taxonomy for everything here, which is only true
    # while everything here IS the one unit the config declared. A repo naming
    # `app_dirs = ["a"]` and a slice in `b/feat` has stated an ownership boundary
    # that slice sits outside, and handing it `a`'s taxonomy is the same false pass
    # the scoped form gets for an unowned slice. Where the config declares no unit
    # at all there is no boundary to contradict, and the legacy behavior stands.
    sole = next(iter(config.declared_units)) if len(config.declared_units) == 1 else None

    owner: dict[str, frozenset[str]] = {}
    unowned: list[str] = []
    for unit in layout.slices:
        if not config.error_models:
            if sole is not None and not _inside(unit.rel, sole):
                unowned.append(unit.rel)
            else:
                owner[unit.rel] = config.error_types
            continue
        model = config.error_model_for(unit.rel)
        if model is None:
            unowned.append(unit.rel)
        else:
            owner[unit.rel] = model.types

    if unowned:
        shown = ", ".join(sorted(unowned)[:3])
        more = f", +{len(unowned) - 3} more" if len(unowned) > 3 else ""
        where = (
            f"the one app or published package this config declares ({sole})"
            if config.error_types
            else "every [[coral.error_models]] path"
        )
        return CheckResult(
            rule=RULE,
            skipped=(
                f"{len(unowned)} slice(s) sit outside {where}, so which taxonomy owns them is "
                f"undeclared and [ERR-2] cannot be decided for them ({shown}{more}). Declare "
                f"an error model for each app or published package that holds slices"
            ),
        )

    findings: list[Finding] = []
    unanalyzed = 0
    unresolved: list[str] = []

    for slice_unit in layout.slices:
        unit_rel = slice_unit.rel
        allowed = owner[unit_rel]

        for path in slice_unit.source_files():
            if path.suffix != ".py":
                unanalyzed += 1
                continue
            tree = pysource.parse(path)
            if tree is None:
                unanalyzed += 1
                continue
            unit = config.error_model_for(unit_rel).path if config.error_models else None
            for hit in pysource.raised_constructors(tree):
                verdict = _verdict(hit, allowed, layout, path, unit)
                if verdict == ACCEPT:
                    continue
                if verdict == UNKNOWN:
                    unresolved.append(f"{layout.rel(path)}:{hit.line} ({hit.label})")
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

    # A raise whose constructor cannot be bound exactly leaves the check unable to
    # decide that file, and a note beside an otherwise clean result is not a
    # verdict: the run would still report `ran` with zero findings. Same answer as
    # an unowned slice, for the same reason.
    if unresolved:
        shown = ", ".join(unresolved[:3])
        more = f", +{len(unresolved) - 3} more" if len(unresolved) > 3 else ""
        return CheckResult(
            rule=RULE,
            skipped=(
                f"{len(unresolved)} raise(s) name a constructor this tool cannot bind to a "
                f"declaration — a star import, a rebound name, or a relative import it could "
                f"not resolve — so [ERR-2] cannot be decided for them ({shown}{more}). Import "
                f"the constructor directly in the raising module"
            ),
        )

    notes: list[str] = []
    if unanalyzed:
        notes.append(f"{unanalyzed} non-Python or unparseable slice file(s) not analyzed")
    return CheckResult(
        rule=RULE,
        findings=tuple(sorted(findings, key=lambda f: f.sort_key)),
        notes=tuple(notes),
    )

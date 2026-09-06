"""Crosscut: whether this tool may present its findings as Coral conformance.

`[VER-6]` makes a Coral rule applicable to a project through kernel membership or
through that project's own `CORAL.md` declaration, and through nothing else. Every
rule this tool checks — `[BUCKET-1]`, `[CONFIG-2]`, `[CONC-1]`, the `[LIB-*]` pair —
is a production-baseline or app-profile rule, which means **none of them applies
until the project adopts the layer it belongs to**.

A linter that runs its whole static registry regardless is therefore doing the exact
thing `[VER-6]` forbids: making a rule effective because the tool happens to contain
a check for it. A project declaring

    scales: [app]
    adopts: {}

is explicitly kernel-only and owes none of these rules; failing it on `[BUCKET-1]`
is a finding against a rule nobody adopted.

So the tool fails closed. Until it can resolve a project's declaration it refuses to
produce a conformance verdict at all, and says why. That is worse than resolving the
declaration and better than the alternative, which is a tool that is confidently
wrong about what a project owes.

**Why it cannot resolve one yet**, stated plainly so the gap is not mistaken for an
oversight:

  * the declaration is YAML, and this tool has no dependencies by design. Coral's own
    guidance is to take a YAML library rather than hand-roll a parser, and taking one
    here is a dependency-policy change with its own trade-off to weigh;
  * resolving `adopts` into rule IDs needs each rule's ownership kind, profile and
    scale. This tool reads `rules.lock`, which carries an ID, a class and a page —
    and deliberately not ownership, so that an ownership reshuffle does not churn the
    file `[VER-1]` depends on.

Both are real design decisions, not missing code, and both belong to the task that
gives this tool a resolved surface to work from — most likely a generated
applicability export it consumes, alongside `scripts/applicability.mjs` in the Coral
repository, which already implements the resolver.

This module is the seam that task fills in.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

ADHERENCE_FILE = "CORAL.md"

# The one escape hatch, named here because two modules mention it: the flag a caller
# passes to run the checks anyway, accepting that the output is not a conformance
# verdict. Kept as a constant so the flag and the message that explains it cannot
# drift apart.
OVERRIDE_FLAG = "--ignore-applicability"


@dataclass(frozen=True)
class Unresolved:
    """Why the project's adopted Coral surface could not be determined."""

    code: str
    message: str


def resolve(root: Path) -> Unresolved:
    """The project's adopted Coral surface — or, always today, why there is none.

    The return type is the seam: when this tool can resolve a declaration, this
    function returns the surface and `Unresolved` becomes one branch of a union. Until
    then it has exactly one outcome, and the caller must not run checks on it.

    Two distinct situations, because the fix differs. A project with no readable
    record has an **undeclared normative surface** and a human has to record one
    (`[VER-6]`). A project that has declared one is fine, and the limitation is this
    tool's.
    """
    record = root / ADHERENCE_FILE
    if not record.is_file():
        return Unresolved(
            "undeclared_applicability",
            f"no {ADHERENCE_FILE}: this project has not declared which Coral scopes it "
            f"adopts, so which rules bind it is undefined and no conformance verdict is "
            f"available ([VER-6]). Record the declaration — a human decides it "
            f"([AGENT-4]) — or re-run with {OVERRIDE_FLAG} for advisory output that is "
            f"explicitly not a conformance verdict.",
        )
    return Unresolved(
        "unsupported_applicability",
        f"{ADHERENCE_FILE} declares an adopted Coral surface, and this tool cannot yet "
        f"resolve it, so it will not claim its findings are Coral conformance ([VER-6]). "
        f"Every rule it checks is production-baseline or app-profile, and none of them "
        f"applies unless the project adopted that layer. Re-run with {OVERRIDE_FLAG} for "
        f"advisory output that is explicitly not a conformance verdict.",
    )


# The banner every advisory run carries, on both channels and in the JSON. One string,
# because a caveat that appears in one output format and not another is a caveat the
# other format's consumer never sees.
ADVISORY_NOTICE = (
    "ADVISORY ONLY — not a Coral conformance verdict. No [VER-6] declaration was "
    "resolved, so these checks ran against every rule this tool implements rather than "
    "against the rules this project has adopted. Some of them may not apply here."
)

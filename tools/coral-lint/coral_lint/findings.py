"""Horizontal: what every check produces.

A Finding is *data*, not output. It carries no formatting and no colour: the
composition root decides whether it becomes a text line or a JSON object, which
is the same [ERR-3] discipline applied to the success path.
"""

from dataclasses import dataclass
from typing import Any, Literal

Severity = Literal["error", "warning"]


@dataclass(frozen=True)
class Finding:
    """One rule violation at one place."""

    rule: str  # the Coral rule ID, e.g. "BUCKET-1"
    path: str  # repo-relative, posix separators
    message: str  # what is wrong, in one line
    remedy: str  # what the Coral form looks like
    line: int | None = None
    severity: Severity = "error"

    def as_dict(self) -> dict[str, Any]:
        """Pure shaping. The stable --json element shape.  [CLI-4]"""
        return {
            "rule": self.rule,
            "severity": self.severity,
            "path": self.path,
            "line": self.line,
            "message": self.message,
            "remedy": self.remedy,
        }

    @property
    def sort_key(self) -> tuple[Any, ...]:
        return (self.path, self.line or 0, self.rule)


@dataclass(frozen=True)
class CheckResult:
    """What one check returns: its findings, or the reason it could not run.

    A check that cannot run must say so. Reporting "0 findings" when the check
    never executed is exactly the silent-cap failure the architecture warns
    about, so `skipped` is a first-class outcome rather than an empty list.
    """

    rule: str
    findings: tuple[Finding, ...] = ()
    skipped: str | None = None  # why, if it did not run
    notes: tuple[str, ...] = ()  # what it could not see, e.g. non-Python sources

    @property
    def ran(self) -> bool:
        return self.skipped is None

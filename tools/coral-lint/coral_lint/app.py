"""The composition root: register checks, inject the layout, render, exit.

Holds no check logic of its own — it is the only module that knows about argv,
output channels, and exit codes, which is `[ROOT-1]` and `[ERR-3]` in one file.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Sequence, TextIO

from . import config as config_module, coverage, errors, layout as layout_module
from .checks import (
    ad_hoc_errors,
    ambient_config,
    ambient_library_state,
    buckets,
    colocation,
    library_console,
    read_only,
    root_imports,
    root_names,
    shared_data_access,
    slice_state,
)
from .findings import CheckResult

EXIT_OK, EXIT_FINDINGS, EXIT_USAGE = 0, 1, 2  # [CLI-8]

# The registry. A new check is one module and one line here.
CHECKS = (
    buckets,
    root_names,
    root_imports,
    colocation,
    ambient_config,
    slice_state,
    read_only,
    shared_data_access,
    ad_hoc_errors,
    ambient_library_state,
    library_console,
)
IMPLEMENTED = tuple(check.RULE for check in CHECKS)


def _parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="coral-lint",
        description="Check a repository against Coral Architecture's [auto] rules.",
    )
    p.add_argument("path", nargs="?", default=".", help="repository root (default: .)")
    p.add_argument("--json", action="store_true", help="machine-readable output on stdout")
    p.add_argument("--rule", action="append", default=[], metavar="ID",
                   help="run only this rule (repeatable), e.g. --rule BUCKET-1")
    p.add_argument("--coverage", action="store_true",
                   help="print which [auto] rules are implemented, and why the rest are not")
    p.add_argument("--warnings-as-errors", action="store_true",
                   help="fail on warnings too")
    return p


def _select(rules: Sequence[str]) -> tuple:
    if not rules:
        return CHECKS
    wanted = {r.strip().upper().strip("[]") for r in rules}
    unknown = wanted - set(IMPLEMENTED)
    if unknown:
        raise errors.usage(
            "unknown_rule",
            f"no check implements {', '.join(sorted(unknown))}; "
            f"implemented: {', '.join(IMPLEMENTED)}",
        )
    return tuple(c for c in CHECKS if c.RULE in wanted)


def _render_text(results: Sequence[CheckResult], out: TextIO, err: TextIO) -> None:
    findings = [f for r in results for f in r.findings]
    for finding in sorted(findings, key=lambda f: f.sort_key):
        where = f"{finding.path}:{finding.line}" if finding.line else finding.path
        print(f"{where}: {finding.severity}: [{finding.rule}] {finding.message}", file=out)
        print(f"    → {finding.remedy}", file=out)

    errs = sum(1 for f in findings if f.severity == "error")
    warns = len(findings) - errs
    ran = [r for r in results if r.ran]
    print(f"\n{errs} error(s), {warns} warning(s) from {len(ran)} check(s).", file=out)

    # No silent caps: say what did not run and what is not covered.
    for result in results:
        if not result.ran:
            print(f"  skipped [{result.rule}]: {result.skipped}", file=err)
        for note in result.notes:
            print(f"  note [{result.rule}]: {note}", file=err)
    covered = coverage.summarize(IMPLEMENTED)
    print(
        f"  coverage: {covered['implemented_count']} of {covered['auto_rule_count']} "
        f"[auto] rules implemented — run --coverage for the rest.",
        file=err,
    )


def _render_coverage(out: TextIO) -> None:
    covered = coverage.summarize(IMPLEMENTED)
    print("implemented:", file=out)
    for rule in sorted(covered["implemented"]):  # type: ignore[arg-type]
        print(f"  [{rule}]", file=out)
    print("\nnot implemented:", file=out)
    for rule, why in covered["unimplemented"].items():  # type: ignore[union-attr]
        print(f"  [{rule}] — {why}", file=out)


def main(argv: Sequence[str], out: TextIO | None = None, err: TextIO | None = None) -> int:
    out = out or sys.stdout
    err = err or sys.stderr
    parser = _parser()
    try:
        args = parser.parse_args(list(argv))
    except SystemExit as exc:
        return EXIT_USAGE if exc.code else EXIT_OK

    try:
        if args.coverage:
            if args.json:
                json.dump(coverage.summarize(IMPLEMENTED), out, indent=2)
                out.write("\n")
            else:
                _render_coverage(out)
            return EXIT_OK

        repo = Path(args.path)
        if not repo.is_dir():
            # `usage`, not `not_found`: a path argument pointing nowhere is a
            # malformed invocation, and [CLI-8] gives usage its own exit code.
            raise errors.usage("path_not_found", f"not a directory: {args.path}")

        checks = _select(args.rule)
        cfg = config_module.load(repo)
        lay = layout_module.discover(repo, cfg)
        results = [check.run(lay) for check in checks]
    except errors.CoralError as exc:
        # Checks raise; the root renders. Nothing else renders.  [ERR-3]
        print(f"{exc.code}: {exc.message}", file=err)
        return EXIT_USAGE if exc.category in {"usage", "validation"} else EXIT_FINDINGS

    if args.json:
        payload = {
            "config_source": cfg.source,
            "findings": [f.as_dict() for r in results for f in sorted(r.findings, key=lambda x: x.sort_key)],
            "checks": [
                {"rule": r.rule, "ran": r.ran, "skipped": r.skipped, "notes": list(r.notes)}
                for r in results
            ],
            "coverage": coverage.summarize(IMPLEMENTED),
        }
        json.dump(payload, out, indent=2)
        out.write("\n")
    else:
        _render_text(results, out, err)

    findings = [f for r in results for f in r.findings]
    failing = [f for f in findings if f.severity == "error" or args.warnings_as_errors]
    return EXIT_FINDINGS if failing else EXIT_OK

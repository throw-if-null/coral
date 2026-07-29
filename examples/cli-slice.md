# Worked example: a CLI capability slice (two commands, end to end)

> Written against **Coral 0.2.0**.

The [Go example](./go-api-slice) shows a slice in a language that *forces* a capability across several
packages. This one shows the opposite: **a CLI in Python, where nothing forces banding, so a slice is one
file.** Same architecture, different shape — which is the point of `[MODEL-2]`.

It also walks two commands rather than one, because the second is what makes three rules concrete: the
mandatory `--json` read contract (`[CLI-3]`), read-never-mutates (`[IDEM-2]`), and the moment a second
consumer promotes inline logic to a horizontal (`[XCUT-1]`).

The capability: **record an expense, and list a month's expenses.** `expenses add` and `expenses list`.

## The shape

```text
expenses/
  __main__.py        entry point — argv in, exit code out
  app.py             the composition root: registers commands, injects, renders errors
  errors.py          horizontal: the error taxonomy
  money.py           horizontal: the money parse/format invariant
  period.py          horizontal: the YYYY-MM format invariant
  db.py              horizontal: connection, transaction, migration execution
  expense/
    add.py           the slice — definition + validation + behavior + its schema
    add_test.py      colocated behavior test
    list.py          the read slice
    list_test.py
    conftest.py      one fixture: exercise the real entry point
pyproject.toml
```

One file per slice, tests beside them. Python has no import-cycle rule and no code generator dictating
package layout, so there is nothing to band around — and `[GROW-1]` says start there. When `add.py` gets
hard to navigate, `[GROW-2]` splits it into `expense/add/` with `cli.py`, `behavior.py`, `sql.py`, never
into a global `handlers/` or `services/`.

Colocated tests need one line of configuration, because pytest's default naming convention assumes a
separate tests directory:

```toml
# pyproject.toml
[tool.pytest.ini_options]
python_files = ["*_test.py"]   # so a test can sit beside the code it verifies  [STRUCT-1]
```

## The horizontals

Four of them, each precisely named, each carrying an invariant that would be a bug if it drifted
(`[XCUT-1]`). None is called `utils`.

The error taxonomy first. Slices raise it; exactly one place renders it (`[ERR-1]`, `[ERR-3]`):

```python
# errors.py
from typing import Literal

Category = Literal[
    "usage", "validation", "not_found", "conflict", "infrastructure", "internal",
]


class CoralError(Exception):
    """What a slice raises. The root renders it; nothing else does."""

    def __init__(self, category: Category, code: str, message: str) -> None:
        super().__init__(message)
        self.category = category
        self.code = code
        self.message = message


# The category enum and the type are this horizontal's published surface.
# The `code` strings are owned by the slice that raises them.  [ERR-2]
def validation(code: str, message: str) -> CoralError:
    return CoralError("validation", code, message)


def not_found(code: str, message: str) -> CoralError:
    return CoralError("not_found", code, message)
```

Money is the classic invariant-bearing horizontal — one place where a string becomes an amount, so two
slices cannot disagree about what `"12.5"` means:

```python
# money.py
from decimal import Decimal, InvalidOperation

from . import errors


def parse(text: str) -> Decimal:
    """The one place a money string becomes a number."""
    try:
        amount = Decimal(text)
    except InvalidOperation:
        raise errors.validation("invalid_amount", f"not a valid amount: {text!r}")
    # Decimal("nan") and Decimal("inf") parse cleanly, then poison every
    # comparison downstream — reject them here, once, rather than in each slice.
    if not amount.is_finite():
        raise errors.validation("invalid_amount", f"not a valid amount: {text!r}")
    if amount <= 0:
        raise errors.validation("invalid_amount", "amount must be positive")
    if amount.as_tuple().exponent < -2:
        raise errors.validation("invalid_amount", "amount has more than two decimal places")
    return amount


def format(amount: Decimal) -> str:
    """The one place an amount becomes a string. Storage and output agree by construction."""
    return f"{amount:.2f}"
```

`period` is the same idea for dates — and it is worth noticing **why it exists**. With only `add`, this
function lives inline in `add.py` and `[DUP-4]` says leave it there. `list --month` is the *second*
consumer, and that is the trigger `[XCUT-1]` names: two consumers, plus an invariant (one date format)
that would be a bug if the two commands disagreed. Promoting it now, and editing `add.py` to use it, is
the expected move — flagged per `[AGENT-2]`, not done silently.

```python
# period.py
from datetime import datetime

from . import errors


def parse_month(text: str) -> str:
    """YYYY-MM, validated and normalized. One format, one place."""
    try:
        return datetime.strptime(text, "%Y-%m").strftime("%Y-%m")
    except ValueError:
        raise errors.validation("invalid_month", f"expected YYYY-MM, got {text!r}")
```

And `db` — connection, transaction, and migration *execution*. Note what it does **not** do: it holds no
queries and knows what no table means. That is the line between a `db` horizontal and the shared
data-access layer `[STATE-2]` forbids:

```python
# db.py
import sqlite3
from contextlib import contextmanager


class Db:
    """Connection + transaction + migration execution. Not a data-access layer:
    it holds no queries and defines no schema of its own."""

    def __init__(self, path: str) -> None:
        self._path = path

    @contextmanager
    def tx(self):
        conn = sqlite3.connect(self._path)
        conn.row_factory = sqlite3.Row
        try:
            with conn:  # commits on clean exit, rolls back on exception
                yield conn
        finally:
            conn.close()

    def migrate(self, *schemas: str) -> None:
        """Runs migrations it did not write: each slice defines its own.  [STATE-5]"""
        with self.tx() as conn:
            for schema in schemas:
                conn.executescript(schema)
```

## What gets injected, and what gets imported

`add.py` below imports `money`, `period`, and `errors` directly, but receives `db` as a parameter. That is
deliberate, and it is the practical reading of `[XCUT-3]`:

- **Import a horizontal that is pure and stateless.** `money.parse` has no configuration, no connection,
  and no per-trigger state. Importing it *is* consuming its published surface — the thing `[XCUT-3]`
  forbids is reaching past a horizontal's surface into its internals, not the `import` statement.
- **Inject a horizontal that holds configuration, a connection, or per-trigger state.** `db` knows a file
  path that comes from config. If `add.py` constructed its own `Db`, the slice could not be tested without
  ambient setup and `[CONFIG-2]` would be violated.

The test is not ceremony, it is *testability*: could you exercise this slice against a temporary database
without setting an environment variable or patching a module? Wrapping `money` in a dependency container
buys nothing and costs a layer.

## The slice

Everything for one capability: the command definition, validation, behavior, and — per `[STATE-5]` — the
schema of the table it owns.

```python
# expense/add.py
from typing import Any

from .. import errors, money, period

# This slice owns the `expenses` table, so its schema lives here. The db
# horizontal runs it; nobody else defines it.  [STATE-5]
SCHEMA = """
CREATE TABLE IF NOT EXISTS expenses (
  id       INTEGER PRIMARY KEY,
  amount   TEXT NOT NULL,
  category TEXT NOT NULL,
  spent_on TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS expenses_by_month ON expenses (spent_on);
"""


def register(sub, db) -> None:
    """Definition lives with behavior, not in a central command registry."""
    p = sub.add_parser("add", help="record an expense")
    p.add_argument("--amount", required=True)
    p.add_argument("--category", required=True)
    p.add_argument("--date", required=True, metavar="YYYY-MM")
    p.set_defaults(run=lambda args: run(args, db))


def run(args, db) -> dict[str, Any]:
    # 1. validate — pure, fail fast, invariants owned by horizontals  [EFFECT-1] [TRUST-1]
    amount = money.parse(args.amount)
    spent_on = period.parse_month(args.date)
    category = args.category.strip()
    if not category:
        raise errors.validation("missing_category", "category is required")

    # 2. persist — the one effect, at the edge. `add` is non-idempotent,
    #    so it is never auto-retried.  [EFFECT-2] [IDEM-4]
    with db.tx() as conn:
        cur = conn.execute(
            "INSERT INTO expenses (amount, category, spent_on) VALUES (?, ?, ?)",
            (money.format(amount), category, spent_on),
        )
        new_id = cur.lastrowid

    # 3. return the result. The root decides whether it becomes text or JSON.  [ERR-3] [OBS-3]
    return {
        "id": new_id,
        "amount": money.format(amount),
        "category": category,
        "date": spent_on,
    }
```

The read slice is shorter and carries one hard constraint: it must support `--json` (`[CLI-3]`) and it must
not mutate anything, including a cache (`[IDEM-2]`, `[STATE-4]`).

```python
# expense/list.py
from decimal import Decimal
from typing import Any

from .. import money, period


def register(sub, db) -> None:
    p = sub.add_parser("list", help="list a month's expenses")
    p.add_argument("--month", required=True, metavar="YYYY-MM")
    p.set_defaults(run=lambda args: run(args, db))


def run(args, db) -> dict[str, Any]:
    month = period.parse_month(args.month)

    # Read-only: no INSERT, UPDATE, DELETE anywhere in this slice, and no cache
    # write either. That is what makes [IDEM-2] statically checkable.
    with db.tx() as conn:
        rows = conn.execute(
            "SELECT id, amount, category, spent_on FROM expenses "
            "WHERE spent_on = ? ORDER BY id",
            (month,),
        ).fetchall()

    total = sum((Decimal(r["amount"]) for r in rows), Decimal(0))
    return {
        "month": month,
        "total": money.format(total),
        "expenses": [dict(r) for r in rows],
    }
```

`list` owns its own query against a table `add` owns. That is `[STATE-1]` working as intended, not a gap
waiting for a repository: the *schema* has one owner (`[STATE-5]`), the *queries* live with the slices that
need them, and neither slice reaches into the other.

## The composition root

The only place that knows about exit codes, output channels, and rendering. It registers, injects, and
renders — and holds no business logic (`[ROOT-1]`):

```python
# app.py
import argparse
import json
import sys

from . import db as db_module, errors
from .expense import add, list as list_cmd

EXIT_OK, EXIT_FAIL, EXIT_USAGE = 0, 1, 2  # [CLI-8]


def build(db_path: str) -> argparse.ArgumentParser:
    db = db_module.Db(db_path)
    db.migrate(add.SCHEMA)  # each slice ships its own schema  [STATE-5]

    parser = argparse.ArgumentParser(prog="expenses")
    parser.add_argument("--json", action="store_true", help="machine-readable output on stdout")
    parser.add_argument("--debug", action="store_true", help="diagnostics on stderr")
    sub = parser.add_subparsers(dest="command", required=True)
    add.register(sub, db)
    list_cmd.register(sub, db)
    return parser


def main(argv: list[str], db_path: str) -> int:
    parser = build(db_path)
    try:
        args = parser.parse_args(argv)
    except SystemExit as exc:  # argparse already wrote its message to stderr
        return EXIT_USAGE if exc.code else EXIT_OK

    try:
        result = args.run(args)
    except errors.CoralError as err:
        # Slices raise; the root renders. Nothing else renders.  [ERR-3]
        print(f"{err.code}: {err.message}", file=sys.stderr)
        if args.debug:
            import traceback

            traceback.print_exc(file=sys.stderr)  # diagnostics to stderr only  [CLI-11]
        return EXIT_USAGE if err.category == "usage" else EXIT_FAIL
    except Exception as err:  # unexpected == internal  [ERR-1]
        print(f"internal: {err}", file=sys.stderr)
        return EXIT_FAIL

    if args.json:
        json.dump(result, sys.stdout)  # stable, typed, undecorated  [CLI-4]
        sys.stdout.write("\n")
    else:
        _render(result)
    return EXIT_OK
```

Three things to notice:

- **`category` → exit code happens once**, in one expression. `[CLI-8]` keeps the matrix at three values
  and `[CLI-9]` puts the precision in the stable `code` string on `stderr`, so a script greps
  `invalid_amount` rather than switching on exit code 17.
- **`--debug` is a single global flag** defined at the root (`[CLI-10]`); no slice configures tracing, and
  its output goes to `stderr` so it can never corrupt `--json` on `stdout` (`[CLI-11]`, `[OBS-3]`).
- **`main` takes `argv` and `db_path` as parameters.** `__main__.py` is the only code that touches the real
  process — `sys.exit(main(sys.argv[1:], db_path=os.environ.get("EXPENSES_DB", "expenses.db")))`. That one
  choice is what makes the whole CLI testable in-process, and it keeps the environment read at the root
  (`[CONFIG-1]`, `[CONFIG-2]`).

One honest wrinkle: with argparse, a global flag must precede the subcommand (`expenses --json add …`, not
`expenses add --json`). If that ordering matters to your users, declare the flag on each subparser via a
shared parent parser instead — a `[CLI-5]` script-friendliness call worth making deliberately rather than
discovering.

## The test

Behavior-first: exercise the real entry point, assert the observable contract — exit code,
`stdout`/`stderr` separation, and `--json` — against a real temporary database (`[TEST-1]`). No mocks.

One fixture does the whole setup, and it is the *only* shared test code. Note what it shares: not a
factory of pre-built objects, but the convention "call the real entry point and capture the real
channels." That convention must not diverge between slices, which is exactly `[XCUT-1]`, and pytest
already gives it a precise, framework-mandated name:

```python
# expense/conftest.py
import contextlib
import io

import pytest

from expenses import app


@pytest.fixture
def run_cli(tmp_path):
    """Exercise the actual entry point and capture the real contract."""

    def _run(argv):
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = app.main(argv, db_path=str(tmp_path / "expenses.db"))
        return code, out.getvalue(), err.getvalue()

    return _run
```

```python
# expense/add_test.py
import json


def test_add_records_and_is_observable(run_cli):
    code, out, err = run_cli(
        ["--json", "add", "--amount", "12.50", "--category", "food", "--date", "2026-06"]
    )

    assert code == 0
    assert err == ""  # diagnostics stay off the machine contract  [OBS-3]
    assert json.loads(out) == {
        "id": 1,
        "amount": "12.50",
        "category": "food",
        "date": "2026-06",
    }


def test_add_rejects_a_bad_amount_without_polluting_stdout(run_cli):
    code, out, err = run_cli(
        ["add", "--amount", "twelve", "--category", "food", "--date", "2026-06"]
    )

    assert code == 1  # a validation failure, not a usage error: the flags were well-formed
    assert out == ""
    assert "invalid_amount" in err  # the stable code a script can branch on  [CLI-9]


def test_add_normalizes_the_stored_amount(run_cli):
    # The money horizontal is the reason "12.5" and "12.50" cannot diverge.  [XCUT-1]
    _, out, _ = run_cli(
        ["--json", "add", "--amount", "12.5", "--category", "food", "--date", "2026-06"]
    )
    assert json.loads(out)["amount"] == "12.50"


def test_missing_required_flag_is_a_usage_error(run_cli):
    # A malformed invocation is `usage`, and usage is the one category with its own
    # exit code. Here argparse itself detects it before any slice runs.  [CLI-8] [ERR-1]
    code, out, _ = run_cli(["add", "--amount", "12.50"])
    assert code == 2
    assert out == ""
```

And the round trip, which verifies two slices compose through their observable contracts and nothing else:

```python
# expense/list_test.py
import json


def test_list_reads_back_what_add_wrote(run_cli):
    run_cli(["add", "--amount", "12.50", "--category", "food", "--date", "2026-06"])
    run_cli(["add", "--amount", "3.00", "--category", "coffee", "--date", "2026-06"])
    run_cli(["add", "--amount", "99.00", "--category", "rent", "--date", "2026-05"])

    code, out, err = run_cli(["--json", "list", "--month", "2026-06"])

    assert code == 0
    assert err == ""
    payload = json.loads(out)
    assert payload["total"] == "15.50"  # May's rent is not in June
    assert [e["category"] for e in payload["expenses"]] == ["food", "coffee"]


def test_list_rejects_a_malformed_month(run_cli):
    code, _, err = run_cli(["list", "--month", "June 2026"])
    assert code == 1
    assert "invalid_month" in err  # the period horizontal, raising once for both commands


def test_list_of_an_empty_month_is_zero_not_an_error(run_cli):
    # An empty result is a successful read, not `not_found`. Stating that in a test
    # is what makes it part of the contract rather than an accident.  [CONTRACT-1]
    code, out, _ = run_cli(["--json", "list", "--month", "2026-01"])
    assert code == 0
    assert json.loads(out) == {"month": "2026-01", "total": "0.00", "expenses": []}
```

Nothing here is a unit test, and that is `[TEST-2]` working: these tests survive moving `_parse_month` into
`period.py`, splitting `add.py` into a directory, or swapping SQLite for Postgres. A unit test on
`add.run`'s internals would have broken on all three. `[TEST-3]`'s scalpel is still available — `money.parse`
has enough branches (non-numeric, NaN, negative, three decimals) to earn a direct table-driven test — but it
is an addition, not the foundation.

## Mapping to the four categories  → `[MODEL-1]`

| Category | Here |
|---|---|
| **slices** | `expense/add.py`, `expense/list.py` — one command each, definition through behavior |
| **horizontals** | `errors`, `money`, `period` (pure, imported), `db` (stateful, injected) |
| **composition root** | `app.py` + `__main__.py` — register, inject, render, exit; no logic |
| **published contract** | exit code + `stdout`/`stderr` separation + the `--json` payload shape |

## What this avoids

- A `commands/` package of thin handlers delegating to a `services/` package of logic — the layered CLI
  shape, and the `[BUCKET-1]` failure.
- Error rendering scattered through the commands: each printing its own message and picking its own exit
  code, which is how a CLI ends up with eleven exit codes and no documented meaning for any of them.
- `sys.exit()` inside a slice, which is the CLI equivalent of a slice rendering its own HTTP response —
  it steals the root's job (`[ERR-3]`) and makes the slice untestable in-process.
- A shared `queries.py`, added the first time two commands touch `expenses`. Both slices keep their own
  SQL; only the *schema* has a single owner (`[STATE-1]`, `[STATE-5]`).
- Reading `os.environ` inside a command, which is the fastest way to make a slice untestable
  (`[CONFIG-2]`).

At around 200 lines this is a complete, navigable CLI. A real tool is this same shape repeated per
command — which is exactly why a human or an agent can open any one file and find the whole capability in
it.

> Every snippet on this page is real code from one runnable package, and the seven tests above pass as
> written (Python 3.14, pytest 8.4, `python_files = ["*_test.py"]`). If you copy it out and it fails,
> that is a bug in this page — please say so.

# coral-lint — Tier 1 static checks

The operational half of [Enforcement & Drift Control](../../ARCHITECTURE.md#enforcement-drift-control).
Point it at a repository and it fails the build on the `[auto]` rules it can decide deterministically.

```bash
cd tools/coral-lint
python3 -m coral_lint /path/to/repo          # human output; exit 1 if anything failed
python3 -m coral_lint /path/to/repo --json   # stable machine contract on stdout
python3 -m coral_lint --coverage             # which rules run, and why the rest don't
```

No dependencies, Python 3.11+, nothing to install.

## What it checks today

| Rule | What fails |
|---|---|
| `[BUCKET-1]` | a package or module named `utils`, `helpers`, `shared`, `common`, `services`, `repository`, `misc` (error) or `models`, `core`, `base`, `lib` (warning) |
| `[XCUT-2]` | a top-level module that is not a declared crosscut |
| `[STRUCT-1]` | a slice with no test file, colocated or mirrored |
| `[CONFIG-2]` | a slice reading `os.environ` / `os.getenv` / `dotenv` / `configparser` directly |
| `[CONC-1]` | module-level mutable state in a slice that something actually mutates |
| `[IDEM-2]` | a read-named slice containing a SQL write or a `.commit()` / `.save()` |
| `[ERR-2]` | a slice raising an exception type outside the declared taxonomy |
| `[ROOT-2]` | a root importing something that is neither a crosscut nor a slice, reaching into slice internals, or holding SQL |
| `[STATE-2]` | a module holding SQL that two or more slices import — a shared data-access layer |
| `[LIB-3]` | a library with a hidden singleton, or that performs work on `import` |
| `[LIB-5]` | a library that writes to the console or installs a process-wide handler |

`--coverage` prints the rest of the `[auto]` rules with a stated reason for each. **Nothing is silently
uncovered:** a test reads the `[auto]` rules straight out of the Coral docs and fails if any rule is
neither implemented nor explicitly excused.

`[BUCKET-1]` is the only check that needs no configuration, so `coral-lint .` is useful on first contact
with an unfamiliar repo. The rest need to know where your slices are, and say so rather than guessing.

## Configuration

Drop a `coral.toml` in the audited repo's root. Every layout-dependent check reads it, so "where the
slices live" is stated once in the repo that knows, instead of inferred per check — inference is how a
linter earns false positives, and one false positive on a blocking gate teaches everyone `--no-verify`.

```toml
[coral]
app_dirs     = ["expenses"]              # dirs whose children are top-level modules
feature_dirs = ["expenses/expense"]      # dirs whose children are slices
library_dirs = []                        # dirs that ARE a published library — enables [LIB-*]
roots        = ["expenses/app.py"]        # composition roots — not slices, not crosscuts
crosscuts  = ["errors", "money", "period", "db"]
error_types  = ["errors.validation", "errors.not_found"]
grandfathered = []                        # paths exempt from [BUCKET-1]
read_verbs   = ["show", "list", "get", "find", "summary", "report", "search", "read"]
ignore       = []                         # added to the built-in vendor/build list
```

`library_dirs` is never inferred, and that is deliberate: a CLI legitimately prints to `stdout` and a
service legitimately configures logging at boot, so running `[LIB-5]` against anything that had not
declared itself a library would be pure noise. Set it only for a published package.

A check with no configuration **skips and says why**, on `stderr`, on every run. It never reports zero
findings for a check that did not run — that would turn absence of evidence into a passing gate.

An unknown key or a path that does not exist is a hard failure *before any check runs*, which is
`[CONFIG-3]` applied to the tool itself.

## Contract

- **exit `0`** clean · **`1`** findings · **`2`** usage or configuration error — `[CLI-8]`
- `--json` on `stdout`, diagnostics on `stderr`, so the machine contract stays parseable — `[CLI-1]`, `[OBS-3]`
- each finding carries `rule`, `severity`, `path`, `line`, `message`, and a `remedy` naming the Coral form
- warnings do not fail the build unless you pass `--warnings-as-errors`

## It is itself a Coral app

Deliberately, because a conformance checker that does not conform is an argument against its own rules.
One slice per check, one file each, with a colocated test:

```text
coral_lint/
  app.py           composition root: registry, argv, rendering, exit codes — no check logic
  __main__.py      the only module that touches the real process
  errors.py        crosscut: the taxonomy. Checks raise; the root renders
  findings.py      crosscut: the Finding type. Data, with no formatting on it
  config.py        crosscut: resolve + validate coral.toml, once
  layout.py        crosscut: the repo's slices, top-level modules, roots
  pysource.py      crosscut: exact Python facts via the AST
  coverage.py      crosscut: what is and is not checked, with reasons
  checks/
    buckets.py               [BUCKET-1]   + buckets_test.py
    root_names.py            [XCUT-2]     + root_names_test.py
    colocation.py            [STRUCT-1]   + colocation_test.py
    ambient_config.py        [CONFIG-2]   + ambient_config_test.py
    slice_state.py           [CONC-1]     + slice_state_test.py
    read_only.py             [IDEM-2]     + read_only_test.py
    ad_hoc_errors.py         [ERR-2]      + ad_hoc_errors_test.py
    root_imports.py          [ROOT-2]     + root_imports_test.py
    shared_data_access.py    [STATE-2]    + shared_data_access_test.py
    ambient_library_state.py [LIB-3]      + ambient_library_state_test.py
    library_console.py       [LIB-5]      + library_console_test.py
```

It ships a `coral.toml` for itself and passes its own gates. Adding a check is one module and one line in
the registry — which is the property the structure exists to buy.

```bash
cd tools/coral-lint
python3 -m pytest -q        # 99 tests
python3 -m coral_lint .     # the tool, checked by itself
```

It is a CLI rather than a library, so it sets no `library_dirs` and `[LIB-3]`/`[LIB-5]` skip on it —
reported on every run rather than quietly counted as passing.

Self-checking has earned its keep twice. The check implementing `[STRUCT-1]` was originally named
`colocated_tests.py`, whose stem ends in `_tests`, so the tool classified its own slice as a test file and
silently skipped it — the count in the run summary ("1 of 7 slices are read-named") is what exposed it,
which is the argument for reporting what you looked at rather than only what you found. And `[STATE-2]`'s
first-ever finding was a **false positive against `pysource.py`**: a module holding SQL-shaped *regexes*
that eight slices import reads exactly like a data-access layer. That produced the regex-source guard
described below, and a regression test.

## How `[STATE-2]` decides adapter vs. repository

Worth its own section, because a forbidden repository and a legitimate adapter can hold *identical code*.
`[STATE-2]`'s test is **interface ownership**: if a shared package defines the data-access API and slices
consume what it offers, it is a repository layer; if the slice declares the interface and a shared package
merely implements it, it is an adapter.

Import direction is the observable form of that, and it is exactly decidable:

- a **repository** is imported **by** slices — the arrow runs slice → repository, so it accumulates every
  caller's needs and no slice can be read alone
- an **adapter** **imports** slices, to implement interfaces they declared — the arrow runs adapter →
  slice, and no slice mentions it

So the check is: a module holding SQL that **two or more slices import** is a shared data-access layer.
The same module, holding the same SQL, imported by none of them, is an adapter and passes. That is why the
[Go example](../../examples/go-api-slice.md#the-test-that-separates-this-from-a-repositories-layer)'s
generated `store` package is not a finding, and a `queries.py` that two slices reach for is.

## Precision over coverage

Every content check goes through `pysource.py` and the real Python AST rather than a regex, because a
regex for "reads the environment" also matches the word `environ` in a comment. The rule the docs give
for enforcement is static-first: *a gate that flakily passes a forbidden bucket loses all credibility.*
The corollary is that a gate which flakily fails legitimate code loses it faster.

Three places where that shows:

- `[CONC-1]` requires **both** a mutable module-level value **and** evidence that something mutates it.
  A module-level `ROUTES = {...}` nobody writes to is a constant; testing only for the mutable literal
  would flag a lookup table in every repository on earth.
- `[IDEM-2]` matches SQL **DML only**. `CREATE TABLE` inside a slice is `[STATE-5]` conformance — the
  slice owning its table's schema — so flagging it would punish the correct shape.
- `[BUCKET-1]` splits its own list. `utils` and `helpers` are errors; `models` and `core` are warnings,
  because the rule itself grandfathers a `core` that denotes one bounded concept, and the
  [backend review](../../examples/backend-review.md) concluded that renaming a cohesive `models` would be
  cosmetic. A linter that shouts at the judgment calls gets muted along with its real findings.
- SQL detection skips any string carrying regex metacharacters, because a string with `\b` or `\s+` in it
  is a *pattern*, not a statement. Without that guard, every module which processes SQL rather than
  executing it — a linter, a query builder, a migration tool — reads as a data-access layer.
- Import resolution prefers a package over a same-named module, matching CPython. Getting it backwards
  silently resolves `pkg.sub` to `pkg.py` and hides every finding inside the package — a test caught this
  one before it shipped.

## Adding a check

1. Write `checks/<name>.py` exposing `RULE`, `TITLE`, and `run(layout) -> CheckResult`.
2. Write `checks/<name>_test.py` beside it — including a case that proves it does **not** fire on
   conforming code. That test matters more than the positive one.
3. Add the module to `CHECKS` in `app.py` and remove its rule from `coverage.UNIMPLEMENTED`.
4. Run `python3 -m pytest -q`. `coverage_test.py` will fail if the rule is now claimed twice or not at all.

If the rule is **new to the docs**, run `npm run rules:lock` from the repo root first. `coverage_test.py`
reads `rules.lock`, not the markdown — deliberately, so this tool holds no second copy of the definition
grammar to drift against `scripts/rules.mjs` — which means a rule that isn't in the lock yet is invisible
to it. The site build fails until the lock is regenerated, so this can only mislead you locally.

If a check cannot be exact, return `CheckResult(rule=RULE, skipped="<why>")` instead of guessing. A stated
gap is worth more than a silent guess.

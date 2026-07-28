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
| `[XCUT-2]` | a top-level module that is not a declared horizontal |
| `[STRUCT-1]` | a slice with no test file, colocated or mirrored |
| `[CONFIG-2]` | a slice reading `os.environ` / `os.getenv` / `dotenv` / `configparser` directly |
| `[CONC-1]` | module-level mutable state in a slice that something actually mutates |
| `[IDEM-2]` | a read-named slice containing a SQL write or a `.commit()` / `.save()` |
| `[ERR-2]` | a slice raising an exception type outside the declared taxonomy |

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
roots        = ["expenses/app.py"]        # composition roots — not slices, not horizontals
horizontals  = ["errors", "money", "period", "db"]
error_types  = ["errors.validation", "errors.not_found"]
grandfathered = []                        # paths exempt from [BUCKET-1]
read_verbs   = ["show", "list", "get", "find", "summary", "report", "search", "read"]
ignore       = []                         # added to the built-in vendor/build list
```

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
  errors.py        horizontal: the taxonomy. Checks raise; the root renders
  findings.py      horizontal: the Finding type. Data, with no formatting on it
  config.py        horizontal: resolve + validate coral.toml, once
  layout.py        horizontal: the repo's slices, top-level modules, roots
  pysource.py      horizontal: exact Python facts via the AST
  coverage.py      horizontal: what is and is not checked, with reasons
  checks/
    buckets.py            [BUCKET-1]   + buckets_test.py
    root_names.py         [XCUT-2]     + root_names_test.py
    colocation.py         [STRUCT-1]   + colocation_test.py
    ambient_config.py     [CONFIG-2]   + ambient_config_test.py
    slice_state.py        [CONC-1]     + slice_state_test.py
    read_only.py          [IDEM-2]     + read_only_test.py
    ad_hoc_errors.py      [ERR-2]      + ad_hoc_errors_test.py
```

It ships a `coral.toml` for itself and passes its own gates. Adding a check is one module and one line in
the registry — which is the property the structure exists to buy.

```bash
cd tools/coral-lint
python3 -m pytest -q        # 59 tests
python3 -m coral_lint .     # the tool, checked by itself
```

Self-checking found a real bug during development: the check implementing `[STRUCT-1]` was originally
named `colocated_tests.py`, whose stem ends in `_tests`, so the tool classified its own slice as a test
file and silently skipped it. The count in the run summary — "1 of 7 slices are read-named" — is what
exposed it, which is the argument for reporting what you looked at rather than only what you found.

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

## Adding a check

1. Write `checks/<name>.py` exposing `RULE`, `TITLE`, and `run(layout) -> CheckResult`.
2. Write `checks/<name>_test.py` beside it — including a case that proves it does **not** fire on
   conforming code. That test matters more than the positive one.
3. Add the module to `CHECKS` in `app.py` and remove its rule from `coverage.UNIMPLEMENTED`.
4. Run `python3 -m pytest -q`. `coverage_test.py` will fail if the rule is now claimed twice or not at all.

If a check cannot be exact, return `CheckResult(rule=RULE, skipped="<why>")` instead of guessing. A stated
gap is worth more than a silent guess.

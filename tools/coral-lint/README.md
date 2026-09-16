# coral-lint — Tier 1 static checks

The operational half of [Enforcement & Drift Control](../../ARCHITECTURE.md#enforcement-drift-control).
Every rule it checks is production-baseline or app-profile, so the per-rule Tier 1 mapping lives with
those rules. [`PRODUCTION.md`](../../PRODUCTION.md#enforcement-of-the-baseline) carries it for the
baseline. The tool decides deterministically on the `[auto]` rules it implements.

```bash
cd tools/coral-lint
python3 -m coral_lint /path/to/repo          # exit 2 today — see "Applicability" below
python3 -m coral_lint /path/to/repo --ignore-applicability   # advisory findings; exit 1 if any
python3 -m coral_lint /path/to/repo --json --ignore-applicability   # machine contract on stdout
python3 -m coral_lint --coverage             # which rules run, and why the rest don't
```

No dependencies, Python 3.11+, nothing to install.

## Applicability — read this before treating it as a gate

**This tool is not a blocking Coral conformance gate today, and it refuses to pretend to be one.**

Under `[VER-6]`, a Coral rule binds a project through kernel membership or through that project's own
`CORAL.md` declaration, and through nothing else. Every rule below is a **production-baseline** or
**app-profile** rule, so none of them applies to a project that has not adopted that layer. A project
declaring

```yaml
scales: [app]
adopts: {}
```

is explicitly kernel-only and owes none of them. Failing it on `[BUCKET-1]` would be a finding against a
rule nobody adopted, which is the failure `[VER-6]` exists to stop.

This tool cannot resolve that declaration yet, so it **fails closed**. By default it produces a
configuration error (exit `2`, distinct from the `1` findings use) and no findings at all. `--coverage`
still works, because it reports what the tool implements rather than judging a project.

`--ignore-applicability` runs every implemented check anyway. Its output is **advisory**, not a
conformance verdict. The text form leads with a notice on `stderr`, and `--json` carries
`"conformance": false`. Use it as a code smell detector. Do not gate a build on it, and do not report its
output as Coral conformance.

Two things stand between here and resolving a declaration properly, and both are deliberate decisions
rather than missing code:

- The declaration is YAML, and this tool has no dependencies.
- Mapping `adopts` to rule IDs needs each rule's ownership kind, profile and scale. `rules.lock`
  deliberately does not carry those, so that an ownership reshuffle cannot churn the file `[VER-1]`
  depends on.

The Coral repository already implements the resolver (`scripts/applicability.mjs`). Giving this tool a
resolved surface to consume is the task that closes the gap. `coral_lint/applicability.py` is the seam it
fills.

`coral-lint` keeps its own `CORAL.md` in this directory, because it is a Coral CLI and a project declares
what it adopts. It is a project record rather than a documentation page, so the site does not publish it.
The Coral repository's build resolves that record with the real resolver, so it cannot drift from the
registries it names.

## What it checks today

| Rule | What fails |
|---|---|
| `[BUCKET-1]` | a package or module named `utils`, `helpers`, `shared`, `common`, `services`, `repository`, `misc` (error) or `models`, `core`, `base`, `lib` (warning) |
| `[XCUT-2]` | a top-level module that is not a declared crosscut |
| `[STRUCT-1]` | a slice with no test file, colocated or mirrored |
| `[CONFIG-2]` | a slice reading `os.environ` / `os.getenv` / `dotenv` / `configparser` directly |
| `[CONC-1]` | module-level mutable state in a slice that something mutates |
| `[IDEM-2]` | a read-named slice containing a SQL write or a `.commit()` / `.save()` |
| `[ERR-2]` | a slice raising an exception type outside its own app or published package's declared taxonomy |
| `[ROOT-2]` | a root importing something that is neither a crosscut nor a slice, reaching into slice internals, or holding SQL |
| `[STATE-2]` | a module holding SQL that two or more slices import, which is a shared data-access layer |
| `[LIB-3]` | a library with a hidden singleton, or that performs work on `import` |
| `[LIB-5]` | a library that writes to the console or installs a process-wide handler |

`--coverage` prints the rest of the `[auto]` rules with a stated reason for each. **Nothing is silently
uncovered:** a test reads the `[auto]` rules straight out of the Coral docs and fails if any rule is
neither implemented nor explicitly excused.

`[BUCKET-1]` is the only check that needs no configuration, so `coral-lint .` is useful on first contact
with an unfamiliar repo. The rest need to know where your slices are, and they say so rather than
guessing.

## Configuration

Drop a `coral.toml` in the audited repo's root. Every layout-dependent check reads it, so "where the
slices live" is stated once in the repo that holds the answer, rather than inferred per check. Inference
is how a linter earns false positives, and one false positive on a blocking gate teaches everyone
`--no-verify`.

```toml
[coral]
app_dirs     = ["expenses"]              # dirs whose children are top-level modules
feature_dirs = ["expenses/expense"]      # dirs whose children are slices
library_dirs = []                        # dirs that ARE a published library — enables [LIB-*]
roots        = ["expenses/app.py"]        # composition roots — not slices, not crosscuts
crosscuts  = ["errors", "money", "period", "db"]
error_types  = ["errors.validation", "errors.not_found"]   # one app/published package here
grandfathered = []                        # paths exempt from [BUCKET-1]
read_verbs   = ["show", "list", "get", "find", "summary", "report", "search", "read"]
ignore       = []                         # added to the built-in vendor/build list
```

### Declaring the error model, or several

`[ERR-1]` scopes the error model to **each app or published package**, not to the repository.
`error_types` above declares one model for everything in the repo, which is what a single-app repo
has. A repo holding a backend and a CLI has two, and one shared allowlist would pass a backend slice
that raised the CLI's constructor. Declare them per unit instead:

```toml
[[coral.error_models]]
path  = "services/api"                   # the app or published package this taxonomy belongs to
types = ["apierrors.validation", "apierrors.not_found"]

[[coral.error_models]]
path  = "tools/cli"
types = ["clierrors.usage", "clierrors.internal"]
```

Each slice is checked against the model whose `path` contains it, longest path winning, so a published
package nested inside an app resolves to the package. A slice inside no declared model makes `[ERR-2]`
**skip**, never pass. The flat form is held to the same rule: where the config names exactly one unit in
`app_dirs` / `library_dirs`, a slice outside it is not covered by that unit's taxonomy and `[ERR-2]`
skips. A config naming no unit at all states no boundary, and the flat taxonomy covers every slice. Declaring both forms is a hard config failure — two ways to say one thing is two
sources of truth.

**Every declared constructor must be qualified**, in both forms. Constructors are matched on
**identity**, and a bare `validation` is a spelling: it cannot say where the constructor lives, it never
matches what `from errors import validation` resolves to, and across units two taxonomies naming one
category the same thing would each accept the other's. Write `errors.validation`, not `validation`.

**Raise sites are resolved through the one import binding that reaches them**, not compared by spelling.
`from apierrors import validation` then `raise validation(...)` resolves to `apierrors.validation`; so do
`from apierrors import validation as invalid` and `import apierrors as errors`.

Resolution is **lexical and in source order**, because Python is both:

- an import inside another function binds nothing here, and a local `def`, a parameter or an assignment
  of the same name shadows one that would otherwise be visible. A locally defined `validation()` is a
  finding — that is the ad-hoc error type `[ERR-2]` exists to catch;
- an import written **after** the raise has not run yet, and does not bind it;
- two branches importing the same name from different modules are not one identity, and neither is a name
  a same-scope `from x import *` could have replaced. Branch outcomes are joined conservatively:
  agreement survives, disagreement is undecidable;
- a **class body is not an enclosing scope for its methods**. A constructor imported into a class is an
  attribute, not a bare name `run(self)` can see. Scopes outside the class stay visible, so a method may
  still close over the function the class was defined in.

A **relative** import must stay inside the unit that owns the raising slice. `from .errors import
validation` and `from ...errors import validation` spell the same name and can reach different packages,
so the module is resolved against the repository: a published package climbing into its host app is a
finding, and two units may each call their own constructor `errors.validation` without colliding.

Where an exact binding is unavailable — a star import, a rebound name, an unresolvable relative import —
`[ERR-2]` **skips** and names the raise. It never reports a clean run over a raise it could not decide.

If a repo declares more than one app or published package (via `app_dirs` / `library_dirs`) but only
the flat `error_types`, `[ERR-2]` **skips and says so**. It cannot tell which unit owns a slice, and
answering anyway would report a boundary violation as clean.

`library_dirs` is never inferred, and that is deliberate. A CLI legitimately prints to `stdout`, and a
service legitimately configures logging at boot. Running `[LIB-5]` against anything that had not declared
itself a library would therefore produce only noise. Set it only for a published package.

A check with no configuration **skips and says why**, on `stderr`, on every run. It never reports zero
findings for a check that did not run, because that would turn absence of evidence into a passing gate.

An unknown key or a path that does not exist is a hard failure *before any check runs*, which is
`[CONFIG-3]` applied to the tool itself.

## Contract

- **exit `0`** clean · **`1`** findings · **`2`** usage or configuration error (`[CLI-8]`)
- `--json` on `stdout`, diagnostics on `stderr`, so the machine contract stays parseable (`[CLI-1]`,
  `[OBS-3]`)
- each finding carries `rule`, `severity`, `path`, `line`, `message`, and a `remedy` naming the Coral form
- warnings do not fail the build unless you pass `--warnings-as-errors`

## It is itself a Coral app

Deliberately, because a conformance checker that does not conform is an argument against its own rules.
One slice per check, one file each, with a colocated test:

```text
coral_lint/
  app.py           composition root: registry, argv, rendering, exit codes, no check logic
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
the registry, which is the property the structure exists to buy.

```bash
cd tools/coral-lint
python3 -m pytest -q        # the unit suite
python3 -m coral_lint .     # the tool, checked by itself
```

It is a CLI rather than a library, so it sets no `library_dirs`, and `[LIB-3]` and `[LIB-5]` skip on it.
The skip is reported on every run rather than counted as passing.

Self-checking has found two real defects. The check implementing `[STRUCT-1]` was originally named
`colocated_tests.py`. That stem ends in `_tests`, so the tool classified its own slice as a test file and
silently skipped it. The count in the run summary ("1 of 7 slices are read-named") is what exposed it.
That is the argument for reporting what you looked at rather than only what you found. `[STATE-2]`'s
first finding was a **false positive against `pysource.py`**: a module holding SQL-shaped *regexes* that
eight slices import reads exactly like a data-access layer. That produced the regex-source guard
described below, and a regression test.

## How `[STATE-2]` decides adapter vs. repository

This needs its own section, because a forbidden repository and a legitimate adapter can hold *identical
code*. `[STATE-2]`'s test is **interface ownership**. If a shared package defines the data-access API and
slices consume what it offers, it is a repository layer. If the slice declares the interface and a shared
package implements it, it is an adapter.

Import direction is the observable form of that, and it is exactly decidable:

- a **repository** is imported **by** slices. The arrow runs slice → repository, so the repository
  accumulates every caller's needs and no slice can be read alone.
- an **adapter** **imports** slices, to implement interfaces they declared. The arrow runs adapter →
  slice, and no slice mentions the adapter.

The check is therefore that a module holding SQL which **two or more slices import** is a shared
data-access layer. The same module, holding the same SQL, imported by none of them, is an adapter and
passes. That is why the
[Go example](../../examples/go-api-slice.md#the-test-that-separates-this-from-a-repositories-layer)'s
generated `store` package is not a finding, and a `queries.py` that two slices reach for is.

## Precision over coverage

Every content check goes through `pysource.py` and the real Python AST rather than a regex. A regex for
"reads the environment" also matches the word `environ` in a comment. The rule the docs give
for enforcement is static-first: *a gate that flakily passes a forbidden bucket loses all credibility.*
A gate that flakily fails legitimate code loses credibility faster.

Three places where that shows:

- `[CONC-1]` requires **both** a mutable module-level value **and** evidence that something mutates it.
  A module-level `ROUTES = {...}` nobody writes to is a constant. Testing only for the mutable literal
  would flag a lookup table in almost every repository.
- `[IDEM-2]` matches SQL **DML only**. `CREATE TABLE` inside a slice is `[STATE-5]` conformance, because
  the slice owns its table's schema, so flagging it would penalize the correct shape.
- `[BUCKET-1]` splits its own list. `utils` and `helpers` are errors. `models` and `core` are warnings. The rule itself grandfathers a
  `core` that denotes one bounded concept, and the
  [backend review](../../examples/backend-review.md) concluded that renaming a cohesive `models` would be
  cosmetic. A linter that reports the judgment calls loudly gets muted along with its real findings.
- SQL detection skips any string carrying regex metacharacters, because a string with `\b` or `\s+` in it
  is a *pattern*, not a statement. Without that guard, every module that processes SQL rather than
  executing it reads as a data-access layer: a linter, a query builder, or a migration tool.
- Import resolution prefers a package over a same-named module, matching CPython. Reversing it silently
  resolves `pkg.sub` to `pkg.py` and hides every finding inside the package. A test caught this one
  before it shipped.

## Adding a check

1. Write `checks/<name>.py` exposing `RULE`, `TITLE`, and `run(layout) -> CheckResult`.
2. Write `checks/<name>_test.py` beside it, including a case that proves it does **not** fire on
   conforming code. That test matters more than the positive one.
3. Add the module to `CHECKS` in `app.py` and remove its rule from `coverage.UNIMPLEMENTED`.
4. Run `python3 -m pytest -q`. `coverage_test.py` will fail if the rule is now claimed twice or not at all.

If the rule is **new to the docs**, run `npm run rules:lock` from the repo root first. `coverage_test.py`
reads `rules.lock`, not the markdown. That is deliberate, so this tool holds no second copy of the
definition grammar to drift against `scripts/rules.mjs`. A rule that is not in the lock yet is therefore
invisible to it. The site build fails until the lock is regenerated, so this can only mislead you
locally.

If a check cannot be exact, return `CheckResult(rule=RULE, skipped="<why>")` instead of guessing. A
stated gap is worth more than a silent guess.

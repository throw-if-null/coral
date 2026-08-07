# Appendix: CLI

This appendix instantiates the [Coral app spine](../ARCHITECTURE.md) for command-line tools. Read the
spine first; this appendix only fills the app-type-specific slots and adds CLI-only rules. Rule IDs here
use the `CLI-` family and reference the spine's IDs.

---

## Boundary  → `[BOUND-1]`

The slice boundary is the **command** (`category add`, `expense add`, `summary month`). A tight pair of
related commands (`add`/`list` for one capability) may share a slice (`[BOUND-2]`).

## Observable contract  → `[BOUND-1]` `[CONTRACT-1]`

A command's contract is **exit code + `stdout`/`stderr` separation + `--json`**:

- **`[CLI-1]`** `[review]` Normal output goes to `stdout`; errors and diagnostics go to `stderr`.
- **`[CLI-2]`** `[review]` Failures return non-zero exit codes.
- **`[CLI-3]`** `[auto]` Read commands **must** support `--json` on `stdout`; mutations **may**, and if
  they do it follows `[CLI-4]`. A mutation's `--json` result is typically the created id — the
  [canonical slice](../CONVENTIONS.md#the-canonical-slice) and the
  [CLI example](../examples/cli-slice.md) both show `add` emitting one.
- **`[CLI-4]`** `[review]` `--json` output is stable across patch releases, fully typed, and free of
  color, progress, or decoration. → `[CONTRACT-1]`

## Composition root  → `[ROOT-1]`

The CLI entry point registers commands, composes subcommands, defines top-level configuration, and
constructs and injects crosscuts (`db`, `config`, `errors`, `logging`). It contains no business logic.

## Unix-style command rules

- **`[CLI-5]`** `[guide]` Commands are narrow, explicit, composable, and script-friendly. Concretely:
  one command does one thing well; its behavior is clear from its name and flags; its output pipes
  cleanly; and it never requires a human at the keyboard.
- **`[CLI-6]`** `[auto]` No interactive prompts by default. → `[CLI-5]`
- **`[CLI-7]`** `[guide]` Command names are stable and predictable.

## Idempotency form  → `[IDEM-1]`

CLI verb → semantics (the spine's mapping, concretely):

- `show` / `list` / `summary` → read-only and idempotent. → `[IDEM-2]`
- `init` → idempotent.
- `set` / `edit` / `update` → idempotent when setting a field to a caller-supplied value (same input →
  same end state). A *relative* change (increment/append) is non-idempotent — name it so. → `[IDEM-1]`
- `add` / `create` / `import` → non-idempotent by default; never auto-retried. → `[IDEM-4]`
- `delete` → idempotent if adopted.
- `ensure` / `upsert` → idempotent if introduced.
- a verb not listed here → classify it by effect and name it truthfully. → `[IDEM-6]`

A non-idempotent command must not be made to behave idempotently without renaming. → `[IDEM-3]`

## Error rendering  → `[ERR-3]`

Slices raise the taxonomy error `{category, code, message}`; the **root** catches it once, writes
`message` to `stderr`, and maps `category` → exit code. Minimal exit-code policy:

- **`[CLI-8]`** `[auto]` `0` success · `2` usage error · `1` every other failure.
- **`[CLI-9]`** `[review]` For finer scripting precision, use stable string `code`s on `stderr`, not a
  wider exit-code matrix.

## Observability mechanism  → `[OBS-1]`

- **`[CLI-10]`** `[auto]` Debug mode is a single global flag (e.g. `--debug`) configured at the root;
  slices do not configure tracing independently. → `[OBS-2]`
- **`[CLI-11]`** `[auto]` Trace output goes to `stderr`; default mode stays quiet; traces never pollute
  `--json` on `stdout`. → `[OBS-3]`

Debug may include: resolved command and arguments, resolved config and paths, transaction lifecycle
(begin/commit/rollback), operation labels and timing, and exception tracebacks.

## State / effects  → `[STATE-1]`

Prefer direct queries owned by the slice. A small, precisely-named `db` crosscut handles connection
management and migration *execution* only — never a generic data-access layer (`[STATE-2]`). Schema
definitions live with the owning slice (`[STATE-5]`).

## Configuration  → `[CONFIG-1]`

Precedence is **explicit flag → environment variable → config file → default**, resolved and validated
once at the root and injected (`[CONFIG-1]`, `[CONFIG-3]`). A missing required setting fails the process
with an `infrastructure` error and a non-zero exit, not a silent default. Slices read configuration only
from what was injected (`[CONFIG-2]`); secrets never appear in `--debug` output (`[CONFIG-4]`,
`[OBS-3]`).

## Trust boundary  → `[TRUST-1]` `[TRUST-2]`

Validate arguments and flags at the command boundary; fail fast. A local CLI typically has a minimal
trust boundary — the invoking user is trusted — and `[TRUST-2]` requires that assumption be *stated*, not
merely implied. A CLI that reads untrusted files or network input does not qualify for the minimal case.

## Testing mechanics  → `[TEST-1]`

- Exercise the command entry point against real or realistic temporary storage.
- Assert: exit codes, `stdout`/`stderr` separation, `--json` stability, idempotency semantics,
  transactional behavior, error rendering and codes, and `--debug` behavior where relevant. → `[TEST-4]`

---

## CLI slot summary

| Slot                | CLI instantiation                                       |
| ------------------- | ------------------------------------------------------- |
| boundary            | a command (`expense add`)                               |
| observable contract | exit code + stdout/stderr + `--json`                    |
| composition root    | thin CLI entry registering commands                     |
| state / effects     | slice-owned queries + `db` crosscut for connection    |
| configuration       | flag → env → file → default, validated at the root      |
| idempotency form    | verb → semantics mapping                                |
| error rendering     | root maps `category` → exit code (`0`/`2`/`1`)          |
| observability       | global `--debug` → `stderr`, quiet by default           |
| trust / security    | validate args at the boundary; user trusted, stated     |
| contract versioning | `--json` stable across patch releases                   |
| testing             | exercise entry point against realistic temp storage     |

---

## Agent Execution Contract (CLI)

The complete normative checklist for this appendix: every `[auto]` and `[review]` rule defined above. It
**adds to** the spine's contract in [`ARCHITECTURE.md`](../ARCHITECTURE.md) rather than replacing it —
load both. `[guide]` rules are rationale and live only in the prose.

<!-- coral:contract:start -->

- `[CLI-1]` Normal output goes to `stdout`; errors and diagnostics go to `stderr`.
- `[CLI-2]` Failures return non-zero exit codes.
- `[CLI-3]` Read commands must support `--json` on `stdout`; mutations may, and if they do they follow `[CLI-4]`.
- `[CLI-4]` Keep `--json` stable across patch releases, fully typed, and free of color, progress, or decoration.
- `[CLI-6]` No interactive prompts by default.
- `[CLI-8]` Exit `0` on success, `2` on usage error, `1` on every other failure.
- `[CLI-9]` Use stable string `code`s on `stderr` for finer scripting precision, not a wider exit-code matrix.
- `[CLI-10]` Configure debug mode as one global flag at the root; slices never configure tracing themselves.
- `[CLI-11]` Send trace output to `stderr`, stay quiet by default, and never pollute `--json` on `stdout`.

<!-- coral:contract:end -->

# Appendix: CLI

This appendix is one species of polyp. It instantiates the [Coral app spine](../ARCHITECTURE.md) for command-line tools. Read the spine
first; this appendix only fills the app-type-specific slots and adds CLI-only rules. Rule IDs here
use the `CLI-` family and reference the spine's IDs.

---

## Boundary  → `[BOUND-1]`

The slice boundary is the **command** (`category add`, `expense add`, `summary month`). A tight pair
of related commands (`add`/`list` for one capability) may share a slice.

## Observable contract  → `[BOUND-1]` `[CONTRACT-1]`

A command's contract is **exit code + `stdout`/`stderr` separation + `--json`**:

- **`[CLI-1]`** Normal output → `stdout`. Errors and diagnostics → `stderr`.
- **`[CLI-2]`** Failures return non-zero exit codes.
- **`[CLI-3]`** Read commands **must** support `--json` on `stdout`; mutations **may** emit a
  `--json` result (e.g. the created id) and, if they do, it follows `[CLI-4]`. (The spine's worked
  example shows `add`, a mutation, emitting `--json`.)
- **`[CLI-4]`** `--json` output is stable across patch releases, fully typed, and free of color,
  progress, or decoration. → `[CONTRACT-1]`

## Composition root  → `[ROOT-1]`

The CLI entry point registers commands, composes subcommands, defines top-level configuration, and
constructs/injects horizontals (db, config, errors, logging). It contains no business logic.

## Unix-style command rules

- **`[CLI-5]`** Commands are narrow (one command does one thing well), explicit (behavior clear from
  name and flags), composable (output pipes and scripts cleanly), and script-friendly.
- **`[CLI-6]`** No interactive prompts by default. → `[CLI-5]`
- **`[CLI-7]`** Command names are stable and predictable.

## Idempotency form  → `[IDEM-1]`

CLI verb → semantics (the spine's mapping, concretely):

- `show` / `list` / `summary` → read-only and idempotent. → `[IDEM-2]`
- `init` → idempotent.
- `set` / `edit` / `update` → idempotent when setting a field to a caller-supplied value (same input
  → same end state). A *relative* change (increment/append) is non-idempotent — name it so. → `[IDEM-1]`
- `add` / `create` / `import` → non-idempotent by default; never auto-retried. → `[IDEM-4]`
- `delete` → idempotent if adopted.
- `ensure` / `upsert` → idempotent if introduced.
- a verb not listed here → classify it by effect and name it truthfully. → `[IDEM-6]`

A non-idempotent command must not be made to behave idempotently without renaming. → `[IDEM-3]`

## Error rendering  → `[ERR-3]`

Slices raise the taxonomy error `{category, code, message}`; the **root** catches it once, writes
`message` to `stderr`, and maps `category` → exit code. Minimal exit-code policy:

- **`[CLI-8]`** `0` success · `2` usage error · `1` every other failure.
- **`[CLI-9]`** For finer scripting precision, use stable string `code`s in `stderr`, not a wider
  exit-code matrix.

## Observability mechanism  → `[OBS-1]`

- **`[CLI-10]`** Debug mode is a single global flag (e.g. `--debug`), configured at the root; slices
  do not configure tracing independently. → `[OBS-2]`
- **`[CLI-11]`** Trace output → `stderr`; default mode stays quiet; traces never pollute `--json` on
  `stdout`. → `[OBS-3]`
- Debug may include: resolved command + arguments, resolved config/paths, transaction lifecycle
  (begin/commit/rollback), operation labels and timing, and exception tracebacks.

## State / effects  → `[STATE-1]`

Prefer direct queries owned by the slice. A small, precisely-named `db` horizontal handles connection
management and schema bootstrap only — never a generic data-access layer. → `[STATE-2]`

## Trust boundary  → `[TRUST-1]`

Validate arguments and flags at the command boundary; fail fast. A local CLI typically has a minimal
trust boundary (the invoking user is trusted), but input is still validated before behavior.

## Testing mechanics  → `[TEST-1]`

- Exercise the command entry point against real or realistic temporary storage.
- Assert: exit codes, `stdout`/`stderr` separation, `--json` stability, idempotency semantics,
  transactional behavior, error rendering and codes, and `--debug` behavior where relevant. → `[TEST-4]`

---

## CLI slot summary

| Slot                 | CLI instantiation                                       |
| -------------------- | ------------------------------------------------------- |
| boundary             | a command (`expense add`)                               |
| observable contract  | exit code + stdout/stderr + `--json`                    |
| composition root     | thin CLI entry registering commands                     |
| state / effects      | slice-owned queries + `db` horizontal for connection    |
| idempotency form     | verb → semantics mapping                                |
| error rendering      | root maps `category` → exit code (`0`/`2`/`1`)          |
| observability        | global `--debug` → `stderr`, quiet by default           |
| trust / security     | validate args at the boundary; user trusted             |
| contract versioning  | `--json` stable across patch releases                   |
| testing              | exercise entry point against realistic temp storage     |

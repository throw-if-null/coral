# Appendix: CLI

This appendix instantiates the [Coral app spine](../ARCHITECTURE.md) for command-line tools. Read the
spine first. This appendix fills only the app-type-specific slots and adds CLI-only rules. Rule IDs here
use the `CLI-` family and reference the spine's IDs.

---

## Boundary  → `[BOUND-1]`

The slice boundary is the **command** (`category add`, `expense add`, `summary month`). A tight pair of
related commands (`add`/`list` for one capability) may share a slice (`[BOUND-2]`).

A command that opens a full-screen view is one command: its boundary is the invocation, its contract is
the exit code and `stderr` when it ends, and `--json` does not apply (`[CLI-3]`). A key binding inside the
view is not a trigger of a new slice; a binding that mutates calls the published capability of the slice
that owns the mutation. While the view runs it is the presentation boundary: it renders the error model's
category and code in its own surface, and the root renders what leaves the view (`[ERR-3]`). A refresh
timer inside the view is not a scheduled trigger (`[BOUND-5]`).

## Observable contract  → `[BOUND-1]` `[CONTRACT-1]`

A command's contract is **exit code + `stdout`/`stderr` separation + `--json`**:

- **`[CLI-1]`** `[review]` `{app:cli}` Normal output goes to `stdout`. Errors and diagnostics go to
  `stderr`.
- **`[CLI-2]`** `[review]` `{app:cli}` Failures return non-zero exit codes.

  A partial outcome is a failure. A command in partial mode (`[ERR-4]`) that reports one failed item
  exits `1`. The per-item report says which items failed. A caller that continues on a partial failure
  reads the report, not the exit code.
- **`[CLI-3]`** `[auto]` `{app:cli}` Read commands **must** support `--json` on `stdout`. Mutations
  **may**, and a mutation that does follows `[CLI-4]`. A mutation's `--json` result is typically the
  created id. The [canonical slice](../CONVENTIONS.md#the-canonical-slice) and the
  [CLI example](../examples/cli-slice.md) both show `add` emitting one.

  A read command is one whose output a caller reads: `show`, `list`, `status`, `get`, and a verb like
  them. `--json` covers each of them. It does not cover a command that opens a full-screen view, a
  command that hands the terminal to another program, or a command whose output is a script, a path, or
  another text a caller consumes as it is; for these the human form is the machine form, and the
  command's help says so. A read that also fetches is a read for this rule and names the fetch
  (`[IDEM-1]`).

  Decidable reading: every read command's parser accepts `--json`, and with it `stdout` holds one JSON
  document and nothing else.
- **`[CLI-4]`** `[review]` `{app:cli}` `--json` output is stable across patch releases, fully typed, and
  free of
  color, progress, or decoration. → `[CONTRACT-1]`

## Composition root  → `[ROOT-1]`

The CLI entry point registers commands, composes subcommands, defines top-level configuration, and
constructs and injects crosscuts (`db`, `config`, `errors`, `logging`). It contains no business logic.

## Unix-style command rules

- **`[CLI-5]`** `[guide]` `{app:cli}` Commands are narrow, explicit, composable, and script-friendly.
  Concretely:
  - one command does one thing well
  - its behavior is clear from its name and flags
  - its output pipes cleanly
  - it never requires an interactive user
- **`[CLI-6]`** `[auto]` `{app:cli}` No interactive prompts by default. → `[CLI-5]`

  An interactive prompt is a read from the terminal that the command waits on before it continues: a
  confirmation, a choice, a question. *By default* means in an invocation that no flag asked to prompt.
  A command may prompt when a flag of that invocation asks for it. A command whose purpose is to hand
  the terminal to another program, such as an editor, a pager, a multiplexer, or a full-screen view,
  does not prompt, and its name or its flag says that it hands over. A terminal check may change
  presentation, such as color or paging, never what the command does or the input it needs. A command
  that needs a terminal and has none fails with an error (`[CLI-2]`).

  Decidable reading: no slice reads from the terminal unless a flag of the invocation asks for it.
- **`[CLI-7]`** `[guide]` `{app:cli}` Command names are stable and predictable.

## Idempotency form  → `[IDEM-1]`

CLI verb → semantics (the spine's mapping, concretely):

- `show` / `list` / `summary` → read-only and idempotent. → `[IDEM-2]`
- `init` → idempotent.
- `set` / `edit` / `update` → idempotent when setting a field to a caller-supplied value (same input →
  same end state). A *relative* change (increment/append) is non-idempotent, so name it so. → `[IDEM-1]`
- `add` / `create` / `import` → non-idempotent by default, and never auto-retried. → `[IDEM-4]`
- `delete` → idempotent if adopted.
- `ensure` / `upsert` → idempotent if introduced.
- a verb not listed here → classify it by effect and name it truthfully. → `[IDEM-6]`

Do not change a non-idempotent command's effect to an idempotent one without renaming it. A dedupe key
that `[IDEM-5]` requires changes neither its effect nor its name. → `[IDEM-3]`

## Error rendering  → `[ERR-1]`

Slices raise the app's declared error model (`[ERR-1]`). The **root** catches it once, writes the message
to `stderr`, and owns the whole mapping from declared category to exit code. No slice picks an exit code.
Under the production baseline the raised value carries `{category, code, message}` (`[ERR-2]`), and
`[ERR-3]` names the root as the renderer. The one other renderer is a full-screen view while it runs,
as the Boundary section above states.

The exit-code contract is fixed regardless of what the taxonomy is called:

- **`[CLI-8]`** `[auto]` `{app:cli}` `0` success · `2` invalid invocation · `1` every other failure.

  Two cases sit outside the three codes. A command that ends on a signal exits as the shell convention
  fixes, 128 plus the signal number: `130` for SIGINT. A command whose purpose is to hand the terminal to
  another program, such as an attach or an exec, exits with that program's exit status, and its name or
  its help says that it hands over. Neither is a wider exit-code matrix (`[CLI-9]`).

  Decidable reading: the root maps category to exit code in one place, and no slice exits the process.
- **`[CLI-9]`** `[review]` `{app:cli}` For finer scripting precision, use stable string `code`s on
  `stderr`, not a
  wider exit-code matrix.

Three codes, and the root decides which one each declared category lands on. With `[ERR-5]`'s default
vocabulary the recommended mapping is `usage` → `2` and every other category → `1`. With another taxonomy
the root maps whichever category means *the invocation itself was wrong* onto `2`, and the rest onto `1`.
A boundary failure the taxonomy never sees — an argument parser rejecting a flag before any slice runs —
is a `2` for the same reason.

## Observability mechanism  → `[OBS-1]`

- **`[CLI-10]`** `[auto]` `{app:cli}` Debug mode is a single global flag (for example `--debug`)
  configured at the root. Slices do not configure tracing independently. → `[OBS-2]`

  `[CLI-10]` requires the flag: every CLI has one global debug flag at the root, and that flag is the
  only switch for trace output.

  Decidable reading: one flag at the root; no slice module configures a logger or tracer.
- **`[CLI-11]`** `[auto]` `{app:cli}` Trace output goes to `stderr`. Default mode stays quiet. Traces
  never pollute `--json` on `stdout`. → `[OBS-3]`

  Decidable reading: trace output is written to `stderr` only, and only when the flag is set.

Debug may include: resolved command and arguments, resolved config and paths, transaction lifecycle
(begin/commit/rollback), operation labels and timing, and exception tracebacks.

## State / effects  → `[STATE-1]`

Prefer direct queries owned by the slice. A small, precisely-named `db` crosscut handles connection
management and migration *execution* only. It is never a generic data-access layer (`[STATE-2]`). Schema
definitions live in the owning feature package, at one site within it (`[STATE-5]`). Sibling commands
share the table and still write their own SQL. `[MODEL-4]` states where an external tool's invocation
contract lives, such as git or tmux.

## Configuration  → `[CONFIG-1]`

Precedence is **explicit flag → environment variable → config file → default**. Configuration is
resolved and validated once at the root, then injected (`[CONFIG-1]`, `[CONFIG-3]`). A missing required
setting fails the process with an environment-failure error — `infrastructure` under `[ERR-5]`'s default
vocabulary — and a non-zero exit, not a silent default. Slices read configuration and runtime context
only from what was injected (`[CONFIG-2]`). Secrets never appear in `--debug`
output (`[CONFIG-4]`, `[OBS-3]`).

## Trust boundary  → `[TRUST-1]` `[TRUST-2]`

Validate arguments and flags at the command boundary, and fail fast. A local CLI typically has a minimal
trust boundary, because the invoking user is trusted. `[TRUST-2]` requires that assumption to be
*stated*, not implied. A CLI that reads untrusted files or network input does not qualify for the minimal
case.

## Testing mechanics  → `[TEST-1]`

- Exercise the command entry point against real or realistic temporary storage.
- A command that drives a terminal or a multiplexer runs against the isolated real program that
  `[TEST-1]` describes.
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
| trust / security    | validate args at the boundary, user trusted and stated  |
| contract versioning | `--json` stable across patch releases                   |
| testing             | exercise entry point against realistic temp storage     |

---

## Agent Execution Contract (CLI)

The complete normative checklist for this appendix: every `[auto]` and `[review]` rule defined above. It
**adds to** the app-scale contracts rather than replacing them. Load
[`ARCHITECTURE.md`](../ARCHITECTURE.md)'s contract, and [`PRODUCTION.md`](../PRODUCTION.md)'s if this
project adopts the production baseline. `[guide]` rules are rationale and live only in the prose.

<!-- coral:contract:start -->
<!-- coral:scope:app:cli -->

- `[CLI-1]` Normal output goes to `stdout`. Errors and diagnostics go to `stderr`.
- `[CLI-2]` Failures return non-zero exit codes.
- `[CLI-3]` Read commands must support `--json` on `stdout`. Mutations may, and a mutation that does follows `[CLI-4]`.
- `[CLI-4]` Keep `--json` stable across patch releases, fully typed, and free of color, progress, or decoration.
- `[CLI-6]` No interactive prompts by default.
- `[CLI-8]` Exit `0` on success, `2` on invalid invocation, `1` on every other failure.
- `[CLI-9]` Use stable string `code`s on `stderr` for finer scripting precision, not a wider exit-code matrix.
- `[CLI-10]` Configure debug mode as one global flag at the root. Slices never configure tracing themselves.
- `[CLI-11]` Send trace output to `stderr`, stay quiet by default, and never pollute `--json` on `stdout`.

<!-- coral:contract:end -->

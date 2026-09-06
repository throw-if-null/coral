# Appendix: Library / Package

This appendix instantiates the [Coral app spine](../ARCHITECTURE.md) for libraries and packages. Read the
spine first; this appendix fills the app-type-specific slots and adds library-only rules in the `LIB-`
family.

**Defining tension:** a library has **no composition root of its own — the consumer is the root**
(`[ROOT-3]`). Everything the spine assigns to the root (constructing crosscuts, rendering errors,
configuring observability, resolving config) belongs to somebody you will never meet. So the discipline
inverts: the library's job is to *accept* what it needs and *raise* what goes wrong, never to reach or
render. And because the public API **is** the observable contract under semver, backward compatibility is
the dominant pressure — it changes how aggressively you may refactor, and it makes every accidental export
a permanent obligation.

---

## Boundary  → `[BOUND-1]`

**`[LIB-1]`** `[review]` `{app:library}` One public capability is one slice: a public function, method set,
or entry point, owned end to end with its validation, behavior, and tests. Internal helpers stay inside the
slice unless `[XCUT-1]` promotes them.

## Observable contract  → `[CONTRACT-1]`

**`[LIB-2]`** `[review]` `{app:library}` The contract is the **public API surface**: exported signatures,
return values, the error types raised, and the exported types themselves. Anything not exported is not a
contract and may change freely — which is why the export list is a design decision, not an afterthought.

Document the contract's edges as deliberately as its centre: what happens on empty input, on a nil or
absent optional, and on concurrent use. Behavior a consumer can observe and rely on is part of the
contract whether or not you meant it to be.

## Composition root — the consumer  → `[ROOT-3]`

**`[LIB-3]`** `[auto]` `{app:library}` No ambient state: no hidden singletons, no package-level mutable
variables, and no side effects on import. The library must be constructible more than once in one process,
with two independent configurations, without interference.

Statically decidable and worth gating hard — this is the single property that most often makes a library
untestable for its consumers. If importing your package starts a goroutine, opens a connection, reads a
file, or mutates a global registry, every consumer inherits that whether they use the feature or not.

**`[LIB-4]`** `[review]` `{app:library}` Accept dependencies; never reach for them. A clock, an HTTP
client, a logger, a store, a random source, and configuration all arrive as parameters or constructor
options.

Configuration is absolute here: a library **never** reads the environment or a config file (`[CONFIG-2]`),
because the consumer owns the process and its configuration story. Injecting the clock and the random
source in particular is what makes a consumer's tests deterministic — and their determinism is your
responsibility, not theirs.

**`[LIB-5]`** `[auto]` `{app:library}` The library never writes to `stdout`/`stderr` and never installs
global handlers — no signal handlers, no panic or exception hooks, no global log configuration.

Diagnostics go through an injected logger or hook, and if none is supplied the default is **silence**, not
a fallback to the console (`[OBS-1]`, `[OBS-2]`). A library that prints has made a presentation decision
that belongs to the consumer's root, and it will corrupt the machine-readable output of any CLI that
depends on it (`[OBS-3]`).

## State / effects  → `[STATE-1]`

**`[LIB-6]`** `[review]` `{app:library}` Prefer pure functions, and push every effect to a
consumer-provided interface (`[EFFECT-2]`). Many libraries have no persistent state at all; those that do
accept the store rather than choosing it.

## Idempotency form  → `[IDEM-1]`

**`[LIB-7]`** `[review]` `{app:library}` Encode effect semantics in the name and document it:
`get`/`find`/`list` read; `set`/`update`/`ensure`/`upsert` are idempotent; `add`/`create` are not.

For anything that performs I/O, state the idempotency and the retry stance explicitly in the doc comment —
your consumer is deciding whether to wrap the call in a retry, and they cannot see inside
(`[IDEM-4]`, `[IDEM-6]`).

## Error rendering  → `[ERR-1]` `[ERR-3]`

**`[LIB-8]`** `[review]` `{app:library}` Raise typed taxonomy errors and never render: the consumer is the
root, so the consumer decides presentation.

The error **type**, its `category`, and its `code` strings are part of the public contract (`[ERR-2]`) and
therefore semver-relevant — adding a new `code` is a minor change, changing or removing one is breaking.
Make errors *inspectable* rather than *parseable*: expose a typed accessor or sentinel a consumer can
branch on, never expect them to match on a message string.

**The domain identity is primary; the taxonomy category is the routing hint.** A library's errors should
read in its own vocabulary — `ErrInvalidExpression`, `ErrUnsupportedCodec`, `ErrVersionMismatch` — and that
vocabulary is the `code` and the typed sentinel a consumer branches on. The `category` rides along so a
consuming app can map the error onto its own edge contract without knowing the library's domain: `validation`
becomes a `400` in a backend (`[BE-5]`), exit `1` in a CLI, a retry-or-dead-letter decision in a worker. That
is the taxonomy earning its place — one small enum that saves every consumer from writing a mapping table
per library — rather than the library being asked to describe its domain in six words that were chosen for
applications.

## Observability  → `[OBS-1]`

**`[LIB-9]`** `[review]` `{app:library}` Accept an injected logger or hook interface, define its no-op
default, and keep the interface minimal — every method you require, every consumer must implement.

## Trust / security  → `[TRUST-1]` `[TRUST-2]`

**`[LIB-10]`** `[review]` `{app:library}` Validate inputs at the public API boundary, and **state** the
trust assumption explicitly rather than leaving it implied.

Most libraries trust their caller, and saying so is the requirement. But a library that **parses untrusted
data** — a file format, a network payload, user-supplied markup or templates — has a real trust boundary
and must say so, along with its limits: input size bounds, recursion depth, and what it does *not* protect
against. An unstated trust assumption is the one a consumer will violate.

## Contract versioning  → `[CONTRACT-2]`

**`[LIB-11]`** `[review]` `{app:library}` Follow **semver**, and treat the following as breaking: an
exported signature change, a removed or renamed export, a new error type where one was not raised before, a
changed `category` **on an error code you already ship**, and a documented-behavior change.

Deprecate before removing, with a stated window and a compile-time-visible marker where the language
offers one. The rule from `[CHAN-4]` applies at the API surface too: **add freely, never repurpose.**
Changing what an existing parameter or field *means* while keeping its name is a breaking change that no
version number communicates and no consumer will notice until it's in production.

## Dependency surface

**`[LIB-12]`** `[guide]` `{app:library}` Minimize dependencies: every dependency you take, your consumers
take transitively, along with its vulnerabilities, its version constraints, and its own transitive set.

Prefer the standard library. Prefer accepting a narrow interface over depending on an implementation — the
`[STATE-2]` inversion (the consumer declares, you accept) is also a dependency-reduction technique.

## Testing mechanics  → `[TEST-1]`

**`[LIB-13]`** `[review]` `{app:library}` Test as a consumer would: exercise only the public API and assert
return values, raised errors, and types.

Do not test internals — **a test that imports a private symbol has made it a contract**, and the next
refactor will break the test rather than the consumer, teaching everyone to distrust the test suite. Add
one consumer-shaped test that constructs the library twice with different configuration, which is what
actually enforces `[LIB-3]`.

---

## Library slot summary

| Slot                | Library instantiation                                              |
| ------------------- | ------------------------------------------------------------------ |
| boundary            | one public API capability (`[LIB-1]`)                              |
| observable contract | exported signatures + return values + raised error types           |
| composition root    | **the consumer** — accept dependencies, no ambient state           |
| state / effects     | prefer pure; effects through consumer-provided interfaces          |
| configuration       | arguments only; never the environment                              |
| idempotency form    | naming signals effect; document retry stance for any I/O           |
| error rendering     | raise typed taxonomy errors; the consumer renders                  |
| observability       | injected logger/hook, no-op by default; never print                |
| trust / security    | validate at the API boundary; state the trust assumption           |
| contract versioning | semver; add freely, never repurpose; deprecate before removing     |
| dependency surface  | minimal — your dependencies are your consumers' dependencies       |
| testing             | public API only; a private symbol under test becomes a contract    |

## Open questions

- Internal (non-public) helpers shared across slices: a documented internal crosscut, or duplicated
  per slice? `[XCUT-1]` decides it, but a language with no internal-visibility mechanism forces the
  question earlier.
- How to expose crosscuts to consumers: constructor injection vs. functional options vs. a builder —
  largely a language-idiom call, worth fixing per ecosystem.

---

## Agent Execution Contract (library)

The complete normative checklist for this appendix: every `[auto]` and `[review]` rule defined above. It
**adds to** the app-scale contracts rather than replacing them —
load [`ARCHITECTURE.md`](../ARCHITECTURE.md)'s, and [`PRODUCTION.md`](../PRODUCTION.md)'s if this project
adopts the production baseline. `[guide]` rules are rationale and live only in the prose.

One asymmetry to carry into the list: the consumer is the composition root (`[ROOT-3]`), so every entry
that reads like "the root does it" in the spine means **somebody you will never meet does it**.

<!-- coral:contract:start -->
<!-- coral:scope:app:library -->

- `[LIB-1]` One public capability is one slice, owned end to end with its validation, behavior, and tests.
- `[LIB-2]` The contract is the public API surface: exported signatures, return values, raised error types, exported types.
- `[LIB-3]` No ambient state: no hidden singletons, no package-level mutables, no side effects on import.
- `[LIB-4]` Accept dependencies; never reach for them. A library never reads the environment or a config file.
- `[LIB-5]` Never write to `stdout`/`stderr` and never install global handlers; the default diagnostic is silence.
- `[LIB-6]` Prefer pure functions and push every effect to a consumer-provided interface.
- `[LIB-7]` Encode effect semantics in the name, and document idempotency and retry stance for anything doing I/O.
- `[LIB-8]` Raise typed taxonomy errors and never render; the consumer is the root and decides presentation.
- `[LIB-9]` Accept an injected logger or hook, define its no-op default, and keep the interface minimal.
- `[LIB-10]` Validate inputs at the public API boundary, and state the trust assumption explicitly.
- `[LIB-11]` Follow semver; add freely, never repurpose, deprecate before removing.
- `[LIB-13]` Test as a consumer would: public API only, plus one test constructing the library twice with different configuration.

<!-- coral:contract:end -->

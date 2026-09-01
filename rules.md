# Rule index

Every rule Coral publishes, in one place: **178 rules** across 9 documents — 28 `[auto]`, 121 `[review]`,
29 `[guide]`. Each ID links to its definition, where the reasoning lives; the statement here is only the
one-line form.

This page is **generated from the documents** (`npm run rules:index`), and the build fails if it drifts, so
it cannot disagree with them. A hand-maintained index would be a second copy of every rule — the failure
the `[DUP-*]` rules exist to prevent, committed by the rule set itself.

Statements come from each document's Agent Execution Contract, which is why they read as instructions.
`[guide]` rules are rationale rather than instruction and appear in no contract, so theirs is the opening
sentence of the definition instead.

The **Kernel** column marks the **9 kernel rules** — the ones whose presence, or the strictness Coral
states them at, is materially justified by an agent authoring the code while a human keeps architectural
authority. It is read from the one table that records it, in
[`CONVENTIONS.md`](./CONVENTIONS.md#the-coral-kernel), where each is mapped to the property it defends. An
unmarked rule is not optional — the column classifies *why* Coral imposes a rule, and at what strength, not
whether it binds.

## Coral Architecture — Conventions

10 rules — [`CONVENTIONS.md`](./CONVENTIONS.md)

| Rule | Class | Kernel | Statement |
| --- | --- | --- | --- |
| `[AGENT-1]` | `[guide]` |  | Prefer the structure that minimizes an agent's placement and cross-file-reasoning decisions, even at the cost of some duplication. |
| `[AGENT-2]` | `[review]` | ● | Flag, don't guess: take the reversible option, mark it, surface it for human review. |
| `[AGENT-3]` | `[guide]` |  | Do not over-comply literally. |
| `[AGENT-4]` | `[review]` | ● | Never author an exception or an extension; a human decides and records. |
| `[AGENT-5]` | `[review]` |  | Read the project's `CORAL.md` before escalating; a documented decision is settled. |
| `[VER-1]` | `[auto]` |  | Rule IDs are append-only: never renumbered, recycled, or removed. |
| `[VER-2]` | `[review]` |  | Adding, tightening, or retiring a rule is a major version; loosening or clarifying is minor. |
| `[VER-3]` | `[review]` | ● | State the Coral version a project targets; audit against that version. |
| `[VER-4]` | `[auto]` |  | Namespace a project's own rule IDs by project prefix; never reuse a Coral family name. |
| `[VER-5]` | `[auto]` | ● | Record exceptions and extensions in `CORAL.md` as machine-readable entries naming a rule ID and a scoped path. |

## Coral Architecture — the App

78 rules — [`ARCHITECTURE.md`](./ARCHITECTURE.md)

| Rule | Class | Kernel | Statement |
| --- | --- | --- | --- |
| `[SCOPE-1]` | `[guide]` |  | This architecture covers command/request-shaped apps with loosely-coupled features, where each feature is largely its own world. |
| `[SCOPE-2]` | `[guide]` |  | It is weak for dense, deeply-coupled domains where every feature reaches into one large central concept. |
| `[SCOPE-3]` | `[review]` |  | When features converge on one dense concept, give it its own app behind a published contract. |
| `[SCOPE-4]` | `[guide]` |  | What happens *after* the split is not in this document. |
| `[MODEL-1]` | `[review]` | ● | Every unit of code is a slice, a crosscut, an adapter, the composition root, or a published contract. |
| `[MODEL-2]` | `[review]` |  | Name every package for the capability or concern it owns, never for its technical role. |
| `[MODEL-3]` | `[guide]` |  | A crosscut's decisive property is defined once, injected many. |
| `[MODEL-4]` | `[review]` |  | An adapter implements a slice-declared port: infrastructure only, arrow inward, wired by the root, no behavior. |
| `[BOUND-1]` | `[guide]` |  | A slice handles one inbound request or trigger, end to end. |
| `[BOUND-2]` | `[review]` | ● | One request/trigger — or a very tight pair — per slice, owned end to end. |
| `[BOUND-3]` | `[review]` |  | Use the boundary form the appendix fixes; do not invent a new one. |
| `[BOUND-4]` | `[guide]` |  | "Continuous" or "real-time" work is not a new boundary kind. |
| `[BOUND-5]` | `[review]` |  | A scheduled/background trigger is a slice: observable outcome, overlap-safe, tested. |
| `[ROOT-1]` | `[review]` |  | Keep the root thin: register, construct, inject, bootstrap. No business logic. |
| `[ROOT-2]` | `[auto]` |  | The root imports no persistence or domain-internal module. |
| `[ROOT-3]` | `[guide]` |  | For a library, the *consumer* is the composition root: the package exposes capabilities and lets the consumer wire them. |
| `[STRUCT-1]` | `[auto]` |  | Colocate tests, or mirror the package structure where colocation is impossible. |
| `[STRUCT-2]` | `[review]` |  | Put slices in concrete, domain-oriented feature packages; the package owns its capability's state. |
| `[STRUCT-3]` | `[auto]` |  | Keep root-level crosscuts rare and precisely named. |
| `[BUCKET-1]` | `[auto]` |  | Do not create or expand `shared`/`common`/`utils`/`helpers`/`services`/`repository`/generic `models`. |
| `[BUCKET-2]` | `[guide]` |  | Generic catch-all names destroy locality and predictability. |
| `[XCUT-1]` | `[review]` | ● | Promote to a crosscut only when it is genuinely cross-cutting AND enforces a must-not-diverge invariant. |
| `[XCUT-2]` | `[auto]` |  | Give every crosscut a precise domain or infrastructure name. |
| `[XCUT-3]` | `[review]` |  | Inject crosscuts; consume their published surface, never their internals. |
| `[XCUT-4]` | `[guide]` |  | A crosscut is the *first line* of drift control. |
| `[XCUT-5]` | `[review]` |  | A domain entity may be a crosscut only as type + invariants — never its queries or storage. |
| `[DUP-1]` | `[guide]` |  | Small duplication across slices is acceptable and often preferred; do not extract merely to save lines. |
| `[DUP-2]` | `[review]` |  | Do not extract on similarity alone; similarity is not a shared concept. |
| `[DUP-3]` | `[review]` |  | Extract only to enforce an invariant or convention, provide named infrastructure, or clarify a real calculation. |
| `[DUP-4]` | `[review]` |  | Apply the Extraction Test before extracting. |
| `[COMPOSE-1]` | `[review]` | ● | Do not reach into another slice's internals; depend on its published capability. |
| `[COMPOSE-2]` | `[review]` |  | Prefer injecting a capability through the root over a slice-to-slice import. |
| `[COMPOSE-3]` | `[review]` |  | A shared multi-step workflow is a candidate crosscut, not a `services` bucket. |
| `[COMPOSE-4]` | `[review]` |  | Read fan-in is a legitimate slice, provided it uses published capabilities only. |
| `[EFFECT-1]` | `[review]` |  | Keep parsing, validation, normalization, calculation, and output shaping pure. |
| `[EFFECT-2]` | `[review]` |  | Keep side effects at the edges. |
| `[EFFECT-3]` | `[guide]` |  | The preferred slice flow is parse → validate → compute → persist/effect → render; do not intermingle calculation and side effects unnecessarily. |
| `[EFFECT-4]` | `[review]` |  | Do not extract a function only to make it pure or testable. |
| `[STATE-1]` | `[review]` |  | Keep state-access logic local to the slice that owns it. |
| `[STATE-2]` | `[auto]` |  | Do not create a shared repository or data-access layer. |
| `[STATE-3]` | `[guide]` |  | A shared persistence layer accumulates special cases and forces cross-slice reasoning on every change; local ownership keeps each slice independently changeable. |
| `[STATE-4]` | `[review]` |  | The slice that computes derived state owns it; write it from a set-/event-named handler. |
| `[STATE-5]` | `[review]` |  | One owning feature package per table/file/bucket, schema defined once inside it; siblings reach it directly, outsiders via a published capability. |
| `[STATE-6]` | `[review]` |  | A cache is never a source of truth; every read path must be correct with it empty. |
| `[STATE-7]` | `[review]` |  | Name the cache's invalidation strategy — TTL, write-through, or event-driven. |
| `[CONC-1]` | `[auto]` |  | A slice holds no mutable state between triggers. |
| `[CONC-2]` | `[review]` |  | Every crosscut is explicitly shared-and-concurrency-safe or constructed per trigger. |
| `[CONC-3]` | `[review]` |  | Name the strategy where two triggers can write the same state: serialize, compare-and-set, or commute. |
| `[CONC-4]` | `[review]` |  | Scope a transaction to one trigger; never hold it across an external call. |
| `[CONC-5]` | `[guide]` |  | The architecture's concurrency default is *one trigger, one thread of control, no shared mutable state*. |
| `[CONFIG-1]` | `[review]` |  | Resolve, validate, and inject configuration at the root as a crosscut. |
| `[CONFIG-2]` | `[auto]` |  | No slice reads the environment, a config file, or a global settings object directly. |
| `[CONFIG-3]` | `[review]` |  | Validate every required setting at construction; fail startup, not first use. |
| `[CONFIG-4]` | `[auto]` |  | Read secrets only through the config crosscut; never inline, log, or publish them. |
| `[IDEM-1]` | `[review]` |  | The name signals the effect; the implementation matches it. |
| `[IDEM-2]` | `[auto]` |  | A read-named slice contains no write or mutation call, including a cache write. |
| `[IDEM-3]` | `[review]` |  | Do not make a non-idempotent operation idempotent without renaming it. |
| `[IDEM-4]` | `[review]` |  | Never auto-retry a non-idempotent mutation. |
| `[IDEM-5]` | `[review]` |  | On an at-least-once platform, a mutating handler must be idempotent. |
| `[IDEM-6]` | `[review]` |  | Classify an unlisted verb by its effect and name it truthfully; flag an unclear effect. |
| `[ERR-1]` | `[review]` |  | Use the six-category taxonomy, defined once as a crosscut. |
| `[ERR-2]` | `[auto]` |  | Raise `{category, code, message}` using the enum; slices own their `code` strings. |
| `[ERR-3]` | `[review]` |  | Slices raise; the root renders; nothing else renders. |
| `[ERR-4]` | `[review]` |  | Batch operations are all-or-nothing unless partial outcomes are reported explicitly. |
| `[OBS-1]` | `[guide]` |  | Diagnostics are opt-in, off the data path, and never part of the machine contract. |
| `[OBS-2]` | `[review]` |  | Configure observability at the root; emit through the injected crosscut. |
| `[OBS-3]` | `[review]` |  | Keep diagnostics off the machine-readable contract channel. |
| `[CONTRACT-1]` | `[review]` |  | Keep the public contract stable, explicit, fully typed, and undecorated. |
| `[CONTRACT-2]` | `[review]` |  | Version public-contract changes per the app type's discipline. |
| `[TRUST-1]` | `[review]` |  | Validate and authorize untrusted input at the boundary. |
| `[TRUST-2]` | `[review]` |  | State the app's trust boundary explicitly, however minimal. |
| `[TEST-1]` | `[review]` | ● | Behavior-first: exercise the entry point, assert the observable contract, real infra, minimal mocking. |
| `[TEST-2]` | `[review]` |  | Prefer integration and end-to-end tests over isolated unit tests. |
| `[TEST-3]` | `[review]` |  | Unit tests are a scalpel; never duplicate integration coverage; never extract just to test. |
| `[TEST-4]` | `[review]` |  | Assert contract, errors, idempotency, transactions, authorization, and diagnostics where relevant. |
| `[GROW-1]` | `[guide]` |  | Start small: prefer one file per slice initially. |
| `[GROW-2]` | `[review]` |  | Answer file growth by splitting inside the slice, never with a global abstraction. |
| `[GROW-3]` | `[review]` |  | Treat domain densification as a split signal, not a refactor-into-a-shared-core signal. |

## Coral Architecture — the System

21 rules — [`SYSTEM.md`](./SYSTEM.md)

| Rule | Class | Kernel | Statement |
| --- | --- | --- | --- |
| `[CHAN-1]` | `[review]` |  | Cross an app boundary only through a published channel contract. |
| `[CHAN-2]` | `[guide]` |  | A channel is one of three forms, chosen per relationship: a synchronous API contract, an event, or a message bus. |
| `[CHAN-3]` | `[auto]` |  | Never share a datastore between apps. |
| `[CHAN-4]` | `[review]` |  | Version the channel contract; add freely, never repurpose, deprecate before removing. |
| `[CHAN-5]` | `[review]` |  | Make event/message consumers idempotent; never auto-retry a non-idempotent sync call. |
| `[CHAN-6]` | `[review]` |  | Never let errors cross the channel as exceptions; dead-letter the un-processable. |
| `[CHAN-7]` | `[review]` |  | Propagate the correlation/trace id across the channel, in metadata not payload. |
| `[CHAN-8]` | `[review]` |  | Authenticate the caller/message and validate every inbound channel payload. |
| `[CHAN-9]` | `[review]` |  | Make consumers that mutate shared state safe under concurrent and out-of-order delivery. |
| `[CHAN-10]` | `[review]` |  | Never assume a transactional view spanning two apps; state how a cross-app computation handles the skew. |
| `[ORCH-1]` | `[review]` |  | Put topology in the orchestration layer; keep business logic out of the wiring. |
| `[ORCH-2]` | `[review]` |  | Keep apps peer-agnostic: publish and consume capabilities, never hard-code peers. |
| `[ORCH-3]` | `[guide]` |  | Each app is independently deployable and independently observable. |
| `[ORCH-4]` | `[review]` |  | Let an agent orchestrate only from inside a harness, never as a bare model. |
| `[ORCH-5]` | `[review]` |  | Give the harness only published channel capabilities as tools; authorize every call and gate irreversible ones absent bounded pre-authorization. |
| `[ORCH-6]` | `[review]` |  | Treat the orchestrating harness as an app: its own contract, observability, and tests. |
| `[SYS-TEST-1]` | `[review]` |  | Verify each side independently against the shared contract, not by booting both apps. |
| `[SYS-TEST-2]` | `[review]` |  | Give every consumed channel relationship executable compatibility verification; consumer-driven contracts are one technique. |
| `[SYS-TEST-3]` | `[review]` |  | Gate producer releases on provider verification against consumer contracts. |
| `[SYS-TEST-4]` | `[guide]` |  | Contract testing is tool-agnostic in principle; pick concrete tooling per stack. |
| `[SYS-TEST-5]` | `[review]` |  | Keep integrated end-to-end suites tiny; they backstop contract tests, never replace them. |

## Appendix: Agentic App  (ADDENDUM)

13 rules — [`appendix/agentic-app.md`](./appendix/agentic-app.md)

| Rule | Class | Kernel | Statement |
| --- | --- | --- | --- |
| `[AGENTIC-1]` | `[guide]` |  | The boundary is one turn, task, or agent-invocation — a user message, or a goal handed to the agent. |
| `[AGENTIC-2]` | `[guide]` |  | Distinguish two intensities. |
| `[AGENTIC-3]` | `[review]` |  | Treat the model as an injected effect; keep prompt-building and output-parsing pure. |
| `[AGENTIC-4]` | `[review]` |  | Force a schema on model output; the contract is schema conformance plus observed tool calls, never the text. |
| `[AGENTIC-5]` | `[review]` |  | Run an autonomous or looping agent only inside a harness: typed tools, authorization, risk-based gating against explicit policy, observation, bounds. |
| `[AGENTIC-6]` | `[guide]` |  | The agent is the non-deterministic *core*; the harness is the deterministic *shell*. |
| `[AGENTIC-7]` | `[review]` |  | Treat history, memory, and retrieval as state: slice-owned, or a precisely-named retrieval crosscut. |
| `[AGENTIC-8]` | `[review]` |  | Dedupe a mutating agent by storing the first result keyed to the request; never re-run to recover. |
| `[AGENTIC-13]` | `[review]` |  | Give every side-effecting tool its own replay protection — key, natural key, or ledger; the stored result is not one. |
| `[AGENTIC-9]` | `[review]` |  | Map model failures to the taxonomy, bound schema repair then fail, and never accept malformed output. |
| `[AGENTIC-10]` | `[review]` |  | Treat prompt input and model output as untrusted, default-deny dangerous tools, keep secrets out of prompts entirely, and minimize/redact/retain personal data. |
| `[AGENTIC-12]` | `[review]` |  | Pin the model identifier and version the prompt; record both with each result and re-run evals before either changes. |
| `[AGENTIC-11]` | `[review]` |  | Test the deterministic parts normally, agent behavior by conformance and evals, and harness safety; never exact-match model text. |

## Appendix: Backend / Service

8 rules — [`appendix/backend.md`](./appendix/backend.md)

| Rule | Class | Kernel | Statement |
| --- | --- | --- | --- |
| `[BE-1]` | `[review]` |  | One slice per business operation, named for the singular capability plus its effect verb; the route is its trigger. |
| `[BE-2]` | `[review]` |  | The contract is status code + response body + observable side effects: `201` create, `200` read, `204` no body. |
| `[BE-3]` | `[review]` |  | Wire router, middleware, and injection at the root; crosscuts are singletons, only request-bound state is per-request. |
| `[BE-4]` | `[review]` |  | A synchronous `POST` may offer an idempotency key; any platform-redelivered handler must be idempotent. |
| `[BE-5]` | `[auto]` |  | Slices raise the taxonomy; one root middleware renders the body and maps `category` → HTTP status. |
| `[BE-6]` | `[review]` |  | Authenticate and coarsely authorize at the boundary; scope every query by owner/tenant id, default to deny. |
| `[BE-8]` | `[review]` |  | Render authn/authz failures at the boundary, not through the taxonomy: `401` unauthenticated, `403` no capability, `404` scoped miss. |
| `[BE-7]` | `[review]` |  | Pick one API versioning strategy and apply it system-wide — URL prefix by default; advance it only for a breaking change. |

## Appendix: CLI

11 rules — [`appendix/cli.md`](./appendix/cli.md)

| Rule | Class | Kernel | Statement |
| --- | --- | --- | --- |
| `[CLI-1]` | `[review]` |  | Normal output goes to `stdout`; errors and diagnostics go to `stderr`. |
| `[CLI-2]` | `[review]` |  | Failures return non-zero exit codes. |
| `[CLI-3]` | `[auto]` |  | Read commands must support `--json` on `stdout`; mutations may, and if they do they follow `[CLI-4]`. |
| `[CLI-4]` | `[review]` |  | Keep `--json` stable across patch releases, fully typed, and free of color, progress, or decoration. |
| `[CLI-5]` | `[guide]` |  | Commands are narrow, explicit, composable, and script-friendly. |
| `[CLI-6]` | `[auto]` |  | No interactive prompts by default. |
| `[CLI-7]` | `[guide]` |  | Command names are stable and predictable. |
| `[CLI-8]` | `[auto]` |  | Exit `0` on success, `2` on usage error, `1` on every other failure. |
| `[CLI-9]` | `[review]` |  | Use stable string `code`s on `stderr` for finer scripting precision, not a wider exit-code matrix. |
| `[CLI-10]` | `[auto]` |  | Configure debug mode as one global flag at the root; slices never configure tracing themselves. |
| `[CLI-11]` | `[auto]` |  | Send trace output to `stderr`, stay quiet by default, and never pollute `--json` on `stdout`. |

## Appendix: GitHub Action / Tool

12 rules — [`appendix/gh-action.md`](./appendix/gh-action.md)

| Rule | Class | Kernel | Statement |
| --- | --- | --- | --- |
| `[GHA-1]` | `[review]` |  | One action run is one slice: one trigger, handled end to end. |
| `[GHA-2]` | `[review]` |  | The contract is declared outputs + exit status + annotations; log text is not a contract. |
| `[GHA-3]` | `[auto]` |  | Declare every output the action writes in `action.yml`, and rely on no undeclared output. |
| `[GHA-4]` | `[review]` |  | The entry point is the root: validate inputs and environment there, inject, dispatch, render. No business logic. |
| `[GHA-5]` | `[review]` |  | Make every mutating run safe under redelivery, via an idempotency key, a natural key, or check-before-write. |
| `[GHA-6]` | `[review]` |  | Treat the event payload as attacker-controlled; pass untrusted values through `env:`, never into a `run:` body. |
| `[GHA-7]` | `[review]` |  | Declare `permissions:` explicitly and scope them to the run, default to read-only, and never write a secret to an output. |
| `[GHA-8]` | `[guide]` |  | Pin third-party actions you call by commit SHA, not by a moving tag. |
| `[GHA-9]` | `[review]` |  | Map `category` → exit status and annotation at the entry point, distinguish recoverable from not, never exit `0` on failure. |
| `[GHA-10]` | `[auto]` |  | Keep diagnostics in log groups and annotations, never on the outputs surface; report no-ops explicitly. |
| `[GHA-11]` | `[review]` |  | Treat input and output names as the versioned contract: add freely, never repurpose, deprecate before removing. |
| `[GHA-12]` | `[review]` |  | Exercise the entry point with simulated inputs and hostile payload fixtures, and assert a repeated run is a no-op. |

## Appendix: Library / Package

13 rules — [`appendix/library.md`](./appendix/library.md)

| Rule | Class | Kernel | Statement |
| --- | --- | --- | --- |
| `[LIB-1]` | `[review]` |  | One public capability is one slice, owned end to end with its validation, behavior, and tests. |
| `[LIB-2]` | `[review]` |  | The contract is the public API surface: exported signatures, return values, raised error types, exported types. |
| `[LIB-3]` | `[auto]` |  | No ambient state: no hidden singletons, no package-level mutables, no side effects on import. |
| `[LIB-4]` | `[review]` |  | Accept dependencies; never reach for them. A library never reads the environment or a config file. |
| `[LIB-5]` | `[auto]` |  | Never write to `stdout`/`stderr` and never install global handlers; the default diagnostic is silence. |
| `[LIB-6]` | `[review]` |  | Prefer pure functions and push every effect to a consumer-provided interface. |
| `[LIB-7]` | `[review]` |  | Encode effect semantics in the name, and document idempotency and retry stance for anything doing I/O. |
| `[LIB-8]` | `[review]` |  | Raise typed taxonomy errors and never render; the consumer is the root and decides presentation. |
| `[LIB-9]` | `[review]` |  | Accept an injected logger or hook, define its no-op default, and keep the interface minimal. |
| `[LIB-10]` | `[review]` |  | Validate inputs at the public API boundary, and state the trust assumption explicitly. |
| `[LIB-11]` | `[review]` |  | Follow semver; add freely, never repurpose, deprecate before removing. |
| `[LIB-12]` | `[guide]` |  | Minimize dependencies: every dependency you take, your consumers take transitively, along with its vulnerabilities, its version constraints, and its own transitive set. |
| `[LIB-13]` | `[review]` |  | Test as a consumer would: public API only, plus one test constructing the library twice with different configuration. |

## Appendix: Web App

12 rules — [`appendix/web.md`](./appendix/web.md)

| Rule | Class | Kernel | Statement |
| --- | --- | --- | --- |
| `[WEB-1]` | `[review]` |  | A slice is one route/page-action/endpoint, with its UI and its handler in the same slice. |
| `[WEB-2]` | `[guide]` |  | Microfrontends are an escalation pattern, not the default. |
| `[WEB-3]` | `[review]` |  | Keep the composition shell to layout and routing; it mounts slices and holds no business logic. |
| `[WEB-4]` | `[auto]` |  | Depend only on another slice's published surface: a typed import when integrated, a channel with no import edge when runtime-isolated. |
| `[WEB-5]` | `[review]` |  | Define design tokens, primitives, and interaction patterns once as an injected crosscut. |
| `[WEB-6]` | `[guide]` |  | The default web architecture is a single integrated frontend organized internally by capability slice, consuming the design-system crosscut. |
| `[WEB-7]` | `[review]` |  | Treat the client as hostile: authorize at the server boundary, validate every payload, keep secrets server-side. |
| `[WEB-8]` | `[auto]` |  | Follow HTTP method semantics: `GET`/`HEAD` safe and read-only, `POST` non-idempotent, `PUT`/`DELETE` idempotent. |
| `[WEB-9]` | `[auto]` |  | Slices raise the taxonomy; a root middleware renders to the right surface — error view or structured body. |
| `[WEB-10]` | `[review]` |  | Treat the route/URL structure as the stable contract: never break a route, never silently repurpose one. |
| `[WEB-11]` | `[review]` |  | Server state is the source of truth; client state is a slice-owned cache, and the mutating slice invalidates it. |
| `[WEB-12]` | `[review]` |  | Drive a web slice's behavior test through the real surface: no internals, no snapshots, no mocking its capability call. |

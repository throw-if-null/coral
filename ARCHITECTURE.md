# Coral Architecture — the App

*A capability-first architecture for systems where **agents write the code and humans review and
orchestrate**.*

> **Read [`CONVENTIONS.md`](./CONVENTIONS.md) first.** It defines the eight nouns this document uses
> (slice, crosscut, adapter, composition root, published contract, app, system, channel), the rule-ID
> scheme, the enforcement classes, the [Coral kernel](./CONVENTIONS.md#the-coral-kernel) — the rules Coral
> would substantially relax without the agent-author / human-architect operating model — and the
> [canonical slice](./CONVENTIONS.md#the-canonical-slice) every rule here exists to produce.

This is the **kernel-facing app spine**: the shape of one app, and the rules whose presence or strictness
Coral justifies by its operating model. It is what a project owes for calling itself Coral, before it has
adopted anything.

**What is deliberately not here.** Coral's general production-engineering policy — package naming,
directory layout, forbidden buckets, error taxonomy, transactions, retries, caching, concurrency
strategy, configuration, observability, trust boundaries — is the **production baseline**, an
[optional layer](./CONVENTIONS.md#ownership-layers) a project adopts explicitly. It lives in
[`PRODUCTION.md`](./PRODUCTION.md). **Nothing in this document's normative surface depends on it**: the
Agent Execution Contract below lists no rule defined there, and where the prose cites one it is pointing
at it or labelling an illustration as baseline policy, never asking for it. A reader can understand the
Coral kernel without loading it.

App-type specifics live in the appendices under [`appendix/`](#appendix-index). How separate apps compose
into a system lives in [`SYSTEM.md`](./SYSTEM.md). Worked code lives in
[`examples/cli-slice.md`](./examples/cli-slice.md) (a CLI in Python) and
[`examples/go-api-slice.md`](./examples/go-api-slice.md) (an HTTP endpoint in Go).

---

## How to read this document

Sections 1–7 **define** the kernel-facing rules and explain *why* each exists. The
[Agent Execution Contract](#agent-execution-contract) is the **complete** condensed checklist for **this
document**: every `[auto]` and `[review]` rule below appears in it, so an agent that loads only the
contract has this document's whole normative surface. The build fails if a rule is missing from it.

The contract here is short on purpose. It is the app-scale surface a project owes without adopting
anything; the much longer opt-in checklist is
[`PRODUCTION.md`](./PRODUCTION.md#agent-execution-contract-production-baseline-app-scale), and a project
loads it when its `CORAL.md` says so (`[VER-6]`).

Within a rule, **the first sentence is the rule** — complete and quotable on its own, so a reviewer can
paste it into a comment unedited. What follows is commentary: qualifications, examples, and
cross-references.

---

## The shape of an app

> **This illustration shows a codebase that has adopted the production baseline.** The five categories,
> the slice boundary and the published contract are kernel; the *specific* naming and placement policy it
> demonstrates — feature-package names, colocated tests, `db`/`config`/`errors` as root crosscuts, the
> absence of a `handlers`/`services`/`repositories` layer — comes from
> [`PRODUCTION.md`](./PRODUCTION.md) and binds only a project that has adopted it. Rule citations below
> that resolve to that document are pointing at the optional layer, not at a kernel requirement.

One picture before the rules. An expense tracker with four
capabilities, written without file extensions or a fixed language — the language binding fixes whether a
slice is a file or a directory, and whether tests colocate or mirror (`[STRUCT-1]`):

```
expenses/
  main              entry point
  app               bootstrap and composition root
  db                crosscut: connections and transactions
  config            crosscut: settings, resolved once at startup
  errors            crosscut: the error taxonomy
  category/
    add             definition + behavior
    add_test        tests for add (colocated, or mirrored if the language forbids colocation)
    list
    list_test
  expense/
    add
    add_test
  summary/
    month
    month_test
```

Everything in it is one of five things, which section 3 states as a rule (`[MODEL-1]`):

- `category/add`, `expense/add` and `summary/month` are **slices** — one capability each, owned from
  trigger through to output, tests included. `category/`, `expense/` and `summary/` are their **feature
  packages**: each groups the slices of one capability and owns the state behind them (`[STRUCT-2]`,
  `[STATE-5]`).
- `db`, `config` and `errors` are **crosscuts** — defined once, constructed at the root, and injected
  into the slices that need them.
- `app` is the **composition root**. It registers slices, constructs crosscuts, injects them, and holds
  no behavior of its own.
- What the app exposes to anything outside it — its command contract, HTTP shape, or library API — is
  its **published contract**.
- There is no **adapter** here, and for an app this size there usually isn't one: each slice writes its
  own queries through the injected `db` crosscut. An adapter appears when a slice declares a port and
  something else implements it — a generated persistence package, an external-system client
  (`[MODEL-4]`).

There is no `handlers`, no `services`, no `repositories`, no `utils` — a
[`PRODUCTION.md`](./PRODUCTION.md#_6-forbidden-buckets-bucket) rule (`[BUCKET-1]`), and one of the
clearest cases of a policy that is good engineering with or without an agent holding the keyboard.

---

## 1. Purpose, Scope & Breakage Boundary  `[SCOPE-*]`

This architecture optimizes for:

1. predictable placement of new code
2. strong locality between behavior and its tests
3. low abstraction overhead
4. self-verifiable, observable contracts
5. bounded blast radius per change
6. readability at scale for both agents and humans

**`[SCOPE-1]` `[guide]` `{governance}`** — This architecture covers **command/request-shaped apps with
loosely-coupled features**, where each feature is largely its own world. CLIs, CRUD-shaped backends, web
apps, libraries, and action/tool runners fit naturally.

**`[SCOPE-2]` `[guide]` `{governance}`** — It is **weak for dense, deeply-coupled domains** where every
feature reaches into one large central concept.

A tax engine, a scheduler, a pricing solver, a physics or simulation core: in these, the "capability"
boundary cuts across the thing that actually holds the complexity, and slicing fights the domain instead
of serving it. This is not a defect to patch — no architecture is universal. If your whole product is
one of these, use something else and say so.

**What to do when a codebase drifts out of that fit is production-baseline policy, not kernel policy.**
`[SCOPE-3]` — give the dense concept its own app behind a published contract — is stated in
[`PRODUCTION.md`](./PRODUCTION.md#_1-domain-density-and-the-split-signal-scope-3). Coral publishes the
*limit* unconditionally and the *remedy* as an opinion a project adopts.

**`[SCOPE-4]` `[guide]` `{governance}`** — What happens *after* the split is not in this document. How the
resulting apps relate — the channel between them, orchestration, cross-app contract testing — is the system
architecture, defined in [`SYSTEM.md`](./SYSTEM.md) (`[CHAN-*]`, `[ORCH-*]`, `[SYS-TEST-*]`). This document
publishes the split *signal*; `SYSTEM.md` consumes it. The dependency points one way.

---

## 2. The Operating Model: Agents Write, Humans Review

Defined once in
[`CONVENTIONS.md`](./CONVENTIONS.md#the-operating-model-agents-write-humans-review-agent) (`[AGENT-1]`;
`[AGENT-2]` flag-don't-guess; `[AGENT-3]` intent-over-letter), because it is cross-cutting to every
document in this set. In one line: deterministic placement, bounded blast radius, slice-sized context,
and self-verifiable contracts exist because **agents write and humans review**.

---

## 3. The Five Categories of Code  `[MODEL-*]`

Knowing which category you are writing answers most placement questions.

**`[MODEL-1]` `[review]`** — Every unit of code is a **slice**, a **crosscut**, an **adapter**, the
**composition root**, or a **published contract**.

There is no sixth category. Something that is none of these is a [forbidden
bucket](./PRODUCTION.md#_6-forbidden-buckets-bucket) (`[BUCKET-1]`). The five are not peers in volume:

| Category | What it owns | Volume |
|---|---|---|
| **slice** | one capability end to end — definition, parsing, validation, behavior, state access, output, tests | most of the code |
| **crosscut** | one cross-cutting concern, defined once and injected | few, precisely named |
| **adapter** | the infrastructure mechanics behind a port a slice declared | one per port that needs one; often none |
| **composition root** | registration, construction, injection, bootstrap | exactly one, thin |
| **published contract** | the surface others may depend on | one per slice/app that exposes anything |

---

## 4. The Slice Boundary  `[BOUND-*]`

**`[BOUND-2]` `[review]`** — Each request/trigger, or a very tight pair of related ones, forms one slice
that owns its behavior end to end.

The concrete boundary form each app type takes — a command invocation, an HTTP route, a message handler,
one action run, a public API function — and the discipline for scheduled and background triggers, are
production-baseline rules (`[BOUND-1]`, `[BOUND-3]`, `[BOUND-4]`, `[BOUND-5]`) in
[`PRODUCTION.md`](./PRODUCTION.md#_3-the-slice-boundary-bound).

**Anatomy of one slice.** A pure core (parse → validate → compute), effects at the edge (persist /
render), a stable published contract, and injected crosscuts:

```mermaid
flowchart LR
  T(["trigger<br/>(the one inbound request)"]) --> CORE
  subgraph CORE["pure core — no side effects"]
    direction LR
    P[parse] --> V[validate] --> C[compute]
  end
  CORE --> E[/"effect<br/>persist · call out"/]
  E --> R[render]
  R --> SK[("published contract")]
  SYM["injected crosscuts:<br/>config · errors · db · logging"]
  SYM -. injected .-> CORE
```

---

## 5. Cross-Cutting Concerns (Crosscuts)  `[XCUT-*]`

A crosscut is the *legitimate* form of sharing — not an exception to "no shared buckets" but a
different category with its own discipline.

**`[XCUT-1]` `[review]`** — Promote something to a crosscut only if it is **both** genuinely
cross-cutting (consumed by two or more slices) **and** enforcing an invariant or convention that must
not diverge.

The second prong is the real gate. Shared *similarity* is not enough (`[DUP-2]`): the thing must enforce
something that would be a **bug** if it diverged — money parsing, period/date format, the error
taxonomy, connection management, a domain entity's identity rules. Two consumers is a floor, not a
trigger; a thing consumed by twenty slices that carries no invariant is still a bucket.

The normal moment to promote is when a *second* consumer appears for logic currently inline in one
slice. Extracting then, and touching the first slice, is expected — flag the change per `[AGENT-2]`.

---

## 6. Slice-to-Slice Composition  `[COMPOSE-*]`

Some capabilities compose others (place order → reserve inventory → charge payment). Without a rule,
agents either copy whole workflows or quietly resurrect a `services` layer.

**`[COMPOSE-1]` `[review]`** — A slice may depend on another slice's **published capability**, never on
its internals — not its parsing, its queries, or its private helpers.

---

## 7. Testing Philosophy  `[TEST-*]`

**`[TEST-1]` `[review]`** — Testing is **behavior-first**: exercise the slice's entry point, assert its
observable contract (`[BOUND-1]`), use real or realistic temporary infrastructure, and minimize mocking.

"Realistic temporary infrastructure" means a temp database, a test container, an in-memory
implementation of the *real* interface — not a mock that asserts on calls. The distinction that matters
is whether the test would still pass if the behavior broke.

---

## Agent Execution Contract

The **complete** normative checklist for **this document**: every `[auto]` and `[review]` rule above, in
one place. Reviewers walk this same list and cite the same IDs.

Every line here is a [kernel](./CONVENTIONS.md#the-coral-kernel) rule. It binds without being adopted, it
carries no `coral:scope` marker, and it is the whole of what this document asks. Everything else Coral
publishes at app scale is opt-in and lives elsewhere: the production baseline in
[`PRODUCTION.md`](./PRODUCTION.md#agent-execution-contract-production-baseline-app-scale), the app-type
profiles in the [appendices](#appendix-index). Rules for several apps composing are in
[`SYSTEM.md`](./SYSTEM.md).

<!-- coral:contract:start -->

### Placement & naming
- `[MODEL-1]` Every unit of code is a slice, a crosscut, an adapter, the composition root, or a published contract.
- `[BOUND-2]` One request/trigger — or a very tight pair — per slice, owned end to end.

### The sharing decision
- `[XCUT-1]` Promote to a crosscut only when it is genuinely cross-cutting AND enforces a must-not-diverge invariant.
- `[COMPOSE-1]` Do not reach into another slice's internals; depend on its published capability.

### Testing
- `[TEST-1]` Behavior-first: exercise the entry point, assert the observable contract, real infra, minimal mocking.

<!-- coral:contract:end -->

The **change algorithm** — the step-by-step placement procedure an agent follows — depends on the
baseline's placement rules, so it is stated with them, in
[`PRODUCTION.md`](./PRODUCTION.md#change-algorithm).

---

## Enforcement & Drift Control

The rule IDs and enforcement classes exist so the architecture can be **checked**, not just read. The
first line of drift control is structural: a genuine crosscut (`[XCUT]`) has one copy and nothing to
drift. The tiers below are the backstop for what slips past it.

Two things are checked today. This repository enforces its **own** consistency at build time, in four
groups. Each rule is **classified**: exactly one enforcement class, exactly one ownership layer, and one
architectural scale — kernel membership read only from `CONVENTIONS.md`'s kernel block, every other rule
tagged on its own definition line against a registered profile, and scale read from the registered
document it is stated in. Each document is **complete and honestly scoped**: every `[auto]`/`[review]`
rule appears in its Agent Execution Contract, and a contract marks its opt-in groups so it cannot present
a profile-scoped rule as unconditional, and no opt-in rule is defined in a
[core document](./CONVENTIONS.md#core-documents). Each **citation resolves**, neither app-scale spine
cites a system rule, and every link fragment reaches a real anchor. And the **published set is stable**: no rule
ID removed or silently reclassified, the generated [rule index](./rules.md) still matching the registry it
indexes, the worked `CORAL.md` in `CONVENTIONS.md` still resolving through the applicability resolver, and
every worked example declaring the latest released Coral version. Malformed metadata fails the build
rather than being skipped, because a skipped rule is one that quietly leaves a layer while the page still
reads correctly. Separately, [`tools/coral-lint`](./tools/coral-lint/README.md) implements a growing subset
of Tier 1 against a target repository — advisory rather than blocking until it can resolve that
project's `[VER-6]` declaration, because every rule it checks is one a project has to adopt.

**Where the concrete checks are.** Every `[auto]` rule Coral publishes at app scale belongs to the
production baseline or to an app profile, so the per-rule Tier 1 mapping is stated with those rules:
[`PRODUCTION.md`](./PRODUCTION.md#enforcement-of-the-baseline) for the baseline, each appendix for its
own profile. This document's own rules are all `[review]`, and their gate is the human architectural
review the operating model already assumes.

**Tier 1 — static checks (deterministic, blocking).** One per `[auto]` rule, each citing the rule ID it
enforces so a failure points back at a definition. Some ship as
[`tools/coral-lint`](./tools/coral-lint/README.md) and some do not yet.

**Tier 2 — LLM reviewer (advisory first, graduated to blocking per check once low-false-positive).**
Reserved for `[review]` rules a static check cannot decide: cross-slice drift smells, "this is the Nth
copy — promote per `[XCUT-1]`?" classification calls, crosscut-vs-bucket judgments, state-ownership
disputes.

**Tier 3 — behavior tests.** Some `[review]` rules are cheap to assert and expensive to lint. Cover them
in the slice's own tests rather than pretending a linter can decide them.

**Four constraints that keep enforcement from fighting the architecture:**

1. **Static-first.** A gate that flakily passes a forbidden bucket loses all credibility.
2. **Flag drift as a question, never force convergence.** Suggest "A and B diverged — intended, or a
   missed `[XCUT]` promotion?" for a human to adjudicate. A "make everything consistent" reviewer would
   pressure agents back into premature shared abstractions — an anti-`[DUP]` engine.
3. **One slice at a time.** The reviewer gets the project's applicable contract as input, cites IDs, and
   reviews one slice per pass; slices are context-sized, so review stays tractable.
4. **The human is the final gate on anything irreversible.** The reviewer multiplies human attention; it
   does not replace the "humans review" half of the operating model.

New convention → new rule ID → new `[auto]` check (or `[review]` note) → enforced going forward.

---

## Document Set

- **[`CONVENTIONS.md`](./CONVENTIONS.md)** — the shared crosscut: vocabulary, rule-ID scheme,
  enforcement classes, operating model, and the canonical slice. The front door.
- **`ARCHITECTURE.md`** (this doc) — the kernel-facing app spine: the shape of one app and the rules
  Coral would substantially relax without its operating model.
- **[`PRODUCTION.md`](./PRODUCTION.md)** — the **optional** production baseline at app scale. Adopted
  explicitly (`production-baseline: true`), never implied by reading this document.
- **[`appendix/*.md`](#appendix-index)** — one **app profile** per app type, each adopted by name.
- **[`SYSTEM.md`](./SYSTEM.md)** — the system spine: how apps compose over a channel (`[CHAN-*]`, `[ORCH-*]`,
  `[SYS-TEST-*]`). Builds on this doc; this doc never cites a system rule.
- **Worked examples** — [`examples/cli-slice.md`](./examples/cli-slice.md) (two CLI slices in Python, one
  file each), [`examples/go-api-slice.md`](./examples/go-api-slice.md) (an HTTP slice in Go, where the
  language forces banding), and [`examples/backend-review.md`](./examples/backend-review.md) (the rules
  applied to a real service, including where they'd be overkill).

## Appendix Index

Each appendix instantiates the abstract slots for one app type: boundary, observable contract,
composition root, state/effects, configuration, idempotency form, error rendering, observability
mechanism, trust/security, contract versioning, and testing mechanics.

**An appendix is *complete* when every slot either carries an app-type rule or is explicitly deferred to
the app-scale rule it instantiates** — this document's, or [`PRODUCTION.md`](./PRODUCTION.md)'s. Deferring
is an answer, not a gap: it means that rule needs no app-type-specific form here, and saying so is what
lets a reader stop looking. A slot that is neither is
listed under "slots still to fill" on the appendix itself, so the gap is named rather than implied.
`[VER-2]` ties `1.0.0` to every **core** appendix being complete by this definition.

### Core appendices

- **[`appendix/cli.md`](./appendix/cli.md)** — CLI tools. **Complete.**
- **[`appendix/backend.md`](./appendix/backend.md)** — backends and services; heaviest use of
  crosscuts and `[COMPOSE]`. **Complete.**
- **[`appendix/web.md`](./appendix/web.md)** — web apps; the trust boundary is first-class. **Complete.**
- **[`appendix/library.md`](./appendix/library.md)** — libraries and packages; the consumer is the root;
  the contract is semver. **Complete.**
- **[`appendix/gh-action.md`](./appendix/gh-action.md)** — Actions and tools; at-least-once reruns make
  idempotency mandatory. **Complete.**

### Addenda

An **addendum** covers an app type nobody here has built yet. It is written from reading rather than from
experience, sits outside the `1.0.0` condition, and may change substantially without a major bump — see
[`CONVENTIONS.md`](./CONVENTIONS.md#versioning-and-local-deviations). It graduates to a core appendix once
someone has built the thing and the rules survived contact with it.

- **[`appendix/agentic-app.md`](./appendix/agentic-app.md)** — the **runtime-agent profile**, not a
  sixth app shape: an app of any shape adds it when it calls a model at runtime, so an agentic backend
  loads this *and* `appendix/backend.md`. The model is an injected effect and the agent runs in a
  harness. **ADDENDUM.** Its safety guardrails
  (harness, untrusted model output, never exact-match, never float the model identifier) hold regardless;
  its construction advice is provisional, and one slot is open pending a decision.

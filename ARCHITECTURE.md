# Coral Architecture — the App

*A capability-first architecture for systems where **agents write the code and humans review and
orchestrate**.*

> **Read [`CONVENTIONS.md`](./CONVENTIONS.md) first.** It defines the eight nouns this document uses:
> slice, crosscut, adapter, composition root, published contract, app, system, and channel. It also
> defines the rule-ID scheme and the enforcement classes. It defines two further things:
>
> - the [Coral kernel](./CONVENTIONS.md#the-coral-kernel): the rules Coral would substantially relax
>   without the agent-author / human-architect operating model
> - the [canonical slice](./CONVENTIONS.md#the-canonical-slice): a production-baseline realization of the
>   shape the rules here ask for

This is the **kernel-facing app spine**: the shape of one app, and the rules whose presence or strictness
Coral justifies by its operating model. It is what a project owes for calling itself Coral, before it has
adopted anything.

**What is deliberately not here.** Coral's general production-engineering policy is the **production
baseline**, an [optional layer](./CONVENTIONS.md#ownership-layers) a project adopts explicitly. That
policy covers package naming, directory layout, forbidden buckets, the recommended error-category
vocabulary and its enforcement, transactions, retries, caching, concurrency strategy, configuration,
observability, and trust boundaries. It lives in [`PRODUCTION.md`](./PRODUCTION.md). **This document's
Agent Execution Contract lists no rule defined
there.** Adopting Coral therefore obliges a project to none of it, and a reader can understand the Coral
kernel without loading it. Where the prose below cites a baseline rule, it is pointing at that rule or
labelling an illustration, never asking for it.

One exception is named rather than left implicit. `[TEST-1]`'s statement cites `[BOUND-1]` for the phrase
"observable contract", and `[BOUND-1]` is now a baseline `[guide]` rule. `[TEST-1]` is actionable without
it, because a guide is rationale and never a gate. The citation is still a loose end from this split.
Closing it means editing a published rule's normative sentence, which is a versioned change rather than a
documentation one.

App-type specifics live in the appendices under [`appendix/`](#appendix-index). How separate apps compose
into a system lives in [`SYSTEM.md`](./SYSTEM.md). Worked code lives in
[`examples/cli-slice.md`](./examples/cli-slice.md) (a CLI in Python) and
[`examples/go-api-slice.md`](./examples/go-api-slice.md) (an HTTP endpoint in Go).

---

## How to read this document

Sections 1–8 **define** the kernel-facing rules and explain *why* each exists. The
[Agent Execution Contract](#agent-execution-contract) is the **complete** condensed checklist for **this
document**. Every `[auto]` and `[review]` rule below appears in it, so an agent that loads only the
contract has this document's whole normative surface. The build fails if a rule is missing from it.

The contract here is short on purpose. It is the app-scale surface a project owes without adopting
anything. The much longer opt-in checklist is
[`PRODUCTION.md`](./PRODUCTION.md#agent-execution-contract-production-baseline-app-scale). A project
loads it when its `CORAL.md` says so (`[VER-6]`).

Within a rule, **the first sentence is the rule**. It is complete and quotable on its own, so a reviewer
can paste it into a comment unedited. What follows is commentary: qualifications, examples, and
cross-references.

---

## The shape of an app

> **This illustration, and the commentary under it, show a codebase that has adopted the production
> baseline.** The five categories, the slice boundary and the published contract are kernel. Everything
> more specific comes from [`PRODUCTION.md`](./PRODUCTION.md) and binds only a project that has adopted
> it:
>
> - feature-package names
> - colocated tests
> - `db`/`config`/`errors` as root crosscuts constructed once and injected
> - a root that holds no behavior of its own
> - the absence of a `handlers`/`services`/`repositories` layer
>
> Every rule cited below that resolves to that document is pointing at the optional layer, not at a
> kernel requirement. A kernel-only app may be laid out differently.

One picture before the rules. An expense tracker with four capabilities, written without file extensions
or a fixed language. The language binding fixes whether a slice is a file or a directory, and whether
tests colocate or mirror (`[STRUCT-1]`):

```
expenses/
  main              entry point
  app               bootstrap and composition root
  db                crosscut: connections and transactions
  config            crosscut: settings, resolved once at startup
  errors            crosscut: the app's declared error model
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

- `category/add`, `expense/add` and `summary/month` are **slices**: one capability each, owned from
  trigger through to output, tests included. `category/`, `expense/` and `summary/` are their **feature
  packages**. Each groups the slices of one capability and owns the state behind them (`[STRUCT-2]`,
  `[STATE-5]`).
- `db`, `config` and `errors` are **crosscuts**. They are defined once, constructed at the root, and
  injected into the slices that need them.
- `app` is the **composition root**. It registers slices, constructs crosscuts, injects them, and holds
  no behavior of its own.
- What the app exposes to anything outside it is its **published contract**: its command contract, HTTP
  shape, or library API.
- There is no **adapter** here, and an app this size usually has none. Each slice writes its own queries
  through the injected `db` crosscut. An adapter appears when a slice declares a port and something else
  implements it, such as a generated persistence package or an external-system client (`[MODEL-4]`).

There is no `handlers`, no `services`, no `repositories`, and no `utils`. That is a
[`PRODUCTION.md`](./PRODUCTION.md#_6-forbidden-buckets-bucket) rule (`[BUCKET-1]`). It is one of the
clearest cases of a policy that is good engineering whether or not an agent writes the code.

---

## 1. Purpose, Scope & Breakage Boundary  `[SCOPE-*]`

This architecture optimizes for:

1. predictable placement of new code
2. strong locality between behavior and its tests
3. low abstraction overhead
4. self-verifiable, observable contracts
5. a bounded amount of code affected per change
6. readability at scale for both agents and humans

**`[SCOPE-1]` `[guide]` `{governance}`** — This architecture covers **command/request-shaped apps with
loosely-coupled features**, where each feature is largely its own world. CLIs, CRUD-shaped backends, web
apps, libraries, and action/tool runners fit naturally.

**`[SCOPE-2]` `[guide]` `{governance}`** — It is **weak for dense, deeply-coupled domains** where every
feature reaches into one large central concept.

A tax engine, a scheduler, a pricing solver, a physics or simulation core. In these, the "capability"
boundary cuts across the thing that holds the complexity, and slicing works against the domain instead of
serving it. This is not a defect to repair, because no architecture is universal. If your whole product
is one of these, use something else and say so.

**What to do when a codebase drifts out of that fit is production-baseline policy, not kernel policy.**
`[SCOPE-3]` says to give the dense concept its own app behind a published contract. It is stated in
[`PRODUCTION.md`](./PRODUCTION.md#_1-domain-density-and-the-split-signal-scope-3). Coral publishes the
*limit* unconditionally and the *remedy* as an opinion a project adopts.

**`[SCOPE-4]` `[guide]` `{governance}`** — What happens *after* the split is not in this document. How the
resulting apps relate is the system architecture: the channel between them, orchestration, and cross-app
contract testing. [`SYSTEM.md`](./SYSTEM.md) defines it (`[CHAN-*]`, `[ORCH-*]`, `[SYS-TEST-*]`). This
document publishes the split *signal*, and `SYSTEM.md` consumes it. The dependency points one way.

---

## 2. The Operating Model: Agents Write, Humans Review

Defined once in
[`CONVENTIONS.md`](./CONVENTIONS.md#the-operating-model-agents-write-humans-review-agent), because it is
cross-cutting to every document in this set. Three rules state it: `[AGENT-1]`, `[AGENT-2]`
flag-don't-guess, and `[AGENT-3]` intent-over-letter. In one line: deterministic placement, a bounded
amount of code affected per change, slice-sized context, and self-verifiable contracts exist because
**agents write and humans review**.

---

## 3. The Five Categories of Code  `[MODEL-*]`

Knowing which category you are writing answers most placement questions.

**`[MODEL-1]` `[review]`** — Every unit of code is a **slice**, a **crosscut**, an **adapter**, the
**composition root**, or a **published contract**.

There is no sixth category. That is the kernel claim, and it is what makes "where does this go?" a
closed question. Coral's name for the shape that fits none of them is a **forbidden bucket**. The rule
*against creating one* is [`[BUCKET-1]`](./PRODUCTION.md#_6-forbidden-buckets-bucket), production
baseline. The five are not peers in volume:

| Category | What it owns | Volume |
|---|---|---|
| **slice** | one capability end to end: the trigger it answers, the work that answers it, its output, its tests | most of the code |
| **crosscut** | one concern that several slices need | few |
| **adapter** | the infrastructure-facing mechanics that connect behavior to an external system | one per external system that needs one, or none |
| **composition root** | the app's wiring and bootstrap boundary, where the parts are brought together and started | exactly one |
| **published contract** | the surface others may depend on | one per slice/app that exposes anything |

The table classifies. It does not prescribe, and it is deliberately thinner than the shape most Coral
codebases have. `[MODEL-1]` is a kernel rule requiring every unit of code to be one of these five. A
category defined by optional policy would therefore make that policy binding without being adopted. The
discipline stays with the rules:

- a crosscut *defined once and injected many* (`[MODEL-3]`, `[XCUT-3]`) rather than reached for, and
  precisely named (`[XCUT-2]`)
- the root *thin* and free of business logic (`[ROOT-1]`)
- the **slice** declaring the port an adapter implements, so the dependency runs adapter → slice
  (`[MODEL-4]`)

Every one of those is [production-baseline](./PRODUCTION.md) policy, binding a project that has adopted
that layer. None of them is needed to answer "which of the five is this?"

---

## 4. The Slice Boundary  `[BOUND-*]`

**`[BOUND-2]` `[review]`** — Each request or trigger, or a tightly-coupled pair of related ones, forms
one slice that owns its behavior end to end.

The concrete boundary form each app type takes is a production-baseline rule: a command invocation, an
HTTP route, a message handler, one action run, or a public API function. So is the discipline for
scheduled and background triggers. Both are stated as `[BOUND-1]`, `[BOUND-3]`, `[BOUND-4]` and
`[BOUND-5]` in [`PRODUCTION.md`](./PRODUCTION.md#_3-the-slice-boundary-bound).

**Anatomy of one slice, as the production baseline shapes it.** The kernel says a slice owns one trigger
end to end and publishes a contract. The internal arrangement below is
[`PRODUCTION.md`](./PRODUCTION.md) policy (`[EFFECT-1]`, `[EFFECT-2]`, `[EFFECT-3]`, `[XCUT-3]`): a pure
core (parse → validate → compute), the effect at the edge, rendering after it, and crosscuts arriving by
injection. It is shown here because it is the arrangement most Coral projects will recognise. A
kernel-only project satisfies `[BOUND-2]` without owing any of it:

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

A crosscut is the *legitimate* form of sharing: a category of its own rather than a hole in the
placement model. What discipline it then owes is the baseline's (`[XCUT-2]`, `[XCUT-3]`, `[XCUT-5]`).
What follows is the gate on becoming one at all.

**`[XCUT-1]` `[review]`** — Promote something to a crosscut only if it is **both** genuinely
cross-cutting (consumed by two or more slices) **and** enforcing an invariant or convention that must
not diverge.

The second prong is the real gate. Shared *similarity* is not enough (`[DUP-2]`). The thing must enforce
something that would be a **bug** if it diverged: money parsing, period or date format, the app's error
model once two slices raise through it (`[ERR-1]`), connection management, or a domain entity's identity
rules. Two consumers is a floor, not a trigger. A thing consumed by twenty slices that carries no
invariant is still a bucket.

The normal moment to promote is when a *second* consumer appears for logic currently inline in one
slice. Extracting then, and touching the first slice, is expected. Flag the change per `[AGENT-2]`.

---

## 6. Slice-to-Slice Composition  `[COMPOSE-*]`

Some capabilities compose others (place order → reserve inventory → charge payment). Without a rule,
agents either copy whole workflows or re-create a `services` layer.

**`[COMPOSE-1]` `[review]`** — A slice may depend on another slice's **published capability**, never on
its internals: not its parsing, its queries, or its private helpers.

---

## 7. The Error Model  `[ERR-*]`

Every capability can fail, so every capability has to say how. Where the failure vocabulary is declared,
and where a failure becomes output, are placement and ownership questions like any other. Left unstated,
each slice answers them locally, and the agent writing the next slice has no finite set to load — only
the conventions of whichever neighbours it happened to read.

**`[ERR-1]` `[review]`** — Every Coral codebase declares **one small, stable, structured error model**:
its categories are declared in one place, every failure a slice raises is constructed through that
declared model, and presenting a raised failure is **one boundary's responsibility, never a slice's**.

Three parts, and all three are the rule. **Structured** means a typed, inspectable value carrying a
category and a stable identity, not a bare string or a per-slice exception hierarchy a caller has to
pattern-match. **Declared in one place** means the set of categories is decided once for the codebase, so
a slice selects from it and never extends it. **Presentation belongs to one boundary** means that turning
a raised failure into observable output — an exit code, an HTTP status, an annotation, a rendered page —
happens at a single place that owns the observable contract, and never inside a slice in passing.

**The third part is stated as ownership, not as a root.** Not every Coral codebase has an executable
entry point, and the rule must hold for the one that does not. A library has **no composition root of its
own**, because the consumer is the root (`[ROOT-3]`). It still satisfies this rule, and satisfies it
exactly: it declares its error model, every slice raises through it, and **no slice in the package
presents anything** (`[LIB-8]`). The boundary that presents lies outside the package, in each consuming
application, where that application's own `[ERR-1]` gives it one. A library with many consumers therefore
has zero renderers rather than many, which is the rule met rather than an exception to it.

**Coral fixes the shape of the model, not its contents.** The kernel prescribes no number of categories
and no names for them. Three categories can be the right answer, and so can eight. What it forbids is
having no declared set, or having a different one per slice. Coral's *recommended* vocabulary is
`[ERR-5]`, a production-baseline guide, and a project that uses another small, stable taxonomy is
conformant without an exception (`[VER-5]`).

**One definition is not the same as one crosscut.** `[XCUT-1]` promotes something only when two or more
slices genuinely consume it, and an error model consumed by several slices meets that test easily: it
carries exactly the must-not-diverge invariant the second prong asks for. A single-slice app owes the one
declaration, not the promotion, and manufacturing a crosscut to satisfy this rule is the `[DUP-4]`
failure rather than diligence.

**Changing the taxonomy is an architectural change to a shared contract, not a slice-local one.** A slice
whose case does not fit an existing category does not mint a new one, because the set every other slice
selects from would then differ depending on which slice was written last. The change is made where the
model is declared, and it is visible there. Where the *right* category is genuinely unclear, that is an
ambiguous architectural decision and `[AGENT-2]` applies: flag it rather than guess.

**Which boundary that is, and what it maps onto, is the app type's answer.** The kernel names only that
there is one owner and that it is not a slice. For an executable application it is the composition root
or entry point, which is the production baseline's `[ERR-3]`. What each boundary then maps the declared
categories onto — HTTP statuses, exit codes, annotations, a rendered surface — is stated by the profile
that owns that boundary (`[BE-5]`, `[CLI-8]`, `[WEB-9]`, `[GHA-9]`), never here.

---

## 8. Testing Philosophy  `[TEST-*]`

**`[TEST-1]` `[review]`** — Testing is **behavior-first**: exercise the slice's entry point, assert its
observable contract (`[BOUND-1]`), use real or realistic temporary infrastructure, and minimize mocking.

"Realistic temporary infrastructure" means a temp database, a test container, or an in-memory
implementation of the *real* interface. It does not mean a mock that asserts on calls. The distinction
that matters is whether the test would still pass if the behavior broke.

---

## Agent Execution Contract

The **complete** normative checklist for **this document**: every `[auto]` and `[review]` rule above, in
one place. Reviewers walk this same list and cite the same IDs.

Every line here is a [kernel](./CONVENTIONS.md#the-coral-kernel) rule. It binds without being adopted, it
carries no `coral:scope` marker, and it is the whole of what this document asks. Everything else Coral
publishes at app scale is opt-in and lives elsewhere. The production baseline is in
[`PRODUCTION.md`](./PRODUCTION.md#agent-execution-contract-production-baseline-app-scale), and the
app-type profiles are in the [appendices](#appendix-index). Rules for several apps composing are in
[`SYSTEM.md`](./SYSTEM.md).

<!-- coral:contract:start -->

### Placement & naming
- `[MODEL-1]` Every unit of code is a slice, a crosscut, an adapter, the composition root, or a published contract.
- `[BOUND-2]` One request or trigger per slice, or a tightly-coupled pair, owned end to end.

### The sharing decision
- `[XCUT-1]` Promote to a crosscut only when it is genuinely cross-cutting AND enforces a must-not-diverge invariant.
- `[COMPOSE-1]` Do not reach into another slice's internals. Depend on its published capability.

### The error model
- `[ERR-1]` One small, stable, structured error model: categories declared once, construction through it, presentation owned by one boundary and never by a slice.

### Testing
- `[TEST-1]` Behavior-first: exercise the entry point, assert the observable contract, real infra, minimal mocking.

<!-- coral:contract:end -->

The **change algorithm** is the step-by-step placement procedure an agent follows. It depends on the
baseline's placement rules, so it is stated with them, in
[`PRODUCTION.md`](./PRODUCTION.md#change-algorithm).

---

## Enforcement & Drift Control

The rule IDs and enforcement classes exist so the architecture can be **checked**, not only read. The
first line of drift control is structural: a genuine crosscut (`[XCUT]`) has one copy and nothing to
drift. The tiers below are the backstop for what passes that line.

Two things are checked today. This repository enforces its **own** consistency at build time, in four
groups:

- Each rule is **classified**: exactly one enforcement class, exactly one ownership layer, and one
  architectural scale. Kernel membership is read only from `CONVENTIONS.md`'s kernel block. Every other
  rule is tagged on its own definition line against a registered profile. Scale is read from the
  registered document the rule is stated in.
- Each document is **complete and honestly scoped**. Every `[auto]` and `[review]` rule appears in its
  Agent Execution Contract. A contract marks its opt-in groups, so it cannot present a profile-scoped
  rule as unconditional. No opt-in rule is defined in a
  [core document](./CONVENTIONS.md#core-documents).
- Each **citation resolves**. Neither app-scale spine cites a system rule, and every link fragment
  reaches a real anchor.
- The **published set is stable**. No rule ID is removed or silently reclassified. The generated
  [rule index](./rules.md) still matches the registry it indexes. The worked `CORAL.md` in
  `CONVENTIONS.md` still resolves through the applicability resolver. Every worked example declares the
  latest released Coral version.

Malformed metadata fails the build rather than being skipped. A skipped rule is one that leaves a layer
without the page changing, so the page still reads correctly while the classification is wrong.

Separately, [`tools/coral-lint`](./tools/coral-lint/README.md) implements a growing subset of Tier 1
against a target repository. It is advisory rather than blocking until it can resolve that project's
`[VER-6]` declaration. Every rule it checks is one a project has to adopt.

**Where the concrete checks are.** Every `[auto]` rule Coral publishes at app scale belongs to the
production baseline or to an app profile, so the per-rule Tier 1 mapping is stated with those rules.
[`PRODUCTION.md`](./PRODUCTION.md#enforcement-of-the-baseline) carries it for the baseline, and each
appendix carries it for its own profile. This document's own rules are all `[review]`. Their gate is the
human architectural review the operating model already assumes.

**Tier 1, static checks (deterministic, blocking).** One per `[auto]` rule, each citing the rule ID it
enforces so a failure points back at a definition. Some ship as
[`tools/coral-lint`](./tools/coral-lint/README.md) and some do not yet.

**Tier 2, LLM reviewer (advisory first, graduated to blocking per check once low-false-positive).**
Reserved for `[review]` rules a static check cannot decide: cross-slice drift, "this is the Nth copy, so
promote per `[XCUT-1]`?" classification calls, crosscut-vs-bucket judgments, and state-ownership
disputes.

**Tier 3, behavior tests.** Some `[review]` rules are cheap to assert and expensive to lint. Cover them
in the slice's own tests rather than pretending a linter can decide them.

**Four constraints that keep enforcement from fighting the architecture:**

1. **Static-first.** A gate that flakily passes a forbidden bucket loses all credibility.
2. **Flag drift as a question, never force convergence.** Suggest "A and B diverged. Is that intended,
   or a missed `[XCUT]` promotion?" for a human to adjudicate. A "make everything consistent" reviewer
   would push agents back into premature shared abstractions, which is an anti-`[DUP]` engine.
3. **One slice at a time.** The reviewer gets the project's applicable contract as input, cites IDs, and
   reviews one slice per pass. Slices are context-sized, so review stays tractable.
4. **The human is the final gate on anything irreversible.** The reviewer multiplies human attention. It
   does not replace the "humans review" half of the operating model.

New convention → new rule ID → new `[auto]` check (or `[review]` note) → enforced going forward.

---

## Document Set

- **[`CONVENTIONS.md`](./CONVENTIONS.md)**: the shared crosscut. It holds the vocabulary, the rule-ID
  scheme, the enforcement classes, the operating model, and the canonical slice. The front door.
- **`ARCHITECTURE.md`** (this doc): the kernel-facing app spine. It holds the shape of one app and the
  rules Coral would substantially relax without its operating model.
- **[`PRODUCTION.md`](./PRODUCTION.md)**: the **optional** production baseline at app scale. It is
  adopted explicitly (`production-baseline: true`), and never implied by reading this document.
- **[`appendix/*.md`](#appendix-index)**: one **app profile** per app type, each adopted by name.
- **[`SYSTEM.md`](./SYSTEM.md)**: the system spine, covering how apps compose over a channel
  (`[CHAN-*]`, `[ORCH-*]`, `[SYS-TEST-*]`). It builds on this doc, and this doc never cites a system
  rule.
- **Worked examples**:
  - [`examples/cli-slice.md`](./examples/cli-slice.md): two CLI slices in Python, one file each.
  - [`examples/go-api-slice.md`](./examples/go-api-slice.md): an HTTP slice in Go, where the language
    forces banding.
  - [`examples/backend-review.md`](./examples/backend-review.md): the rules applied to a real service,
    including where they would be overkill.

## Appendix Index

Each appendix instantiates the abstract slots for one app type: boundary, observable contract,
composition root, state/effects, configuration, idempotency form, error rendering, observability
mechanism, trust/security, contract versioning, and testing mechanics.

**An appendix is *complete* when every slot either carries an app-type rule, or is explicitly deferred.**
A deferred slot points at the app-scale rule it instantiates, in this document or in
[`PRODUCTION.md`](./PRODUCTION.md). Deferring is an answer, not a gap. It means that rule needs no
app-type-specific form here, and saying so is what lets a reader stop looking. A slot that is neither is
listed under "slots still to fill" on the appendix itself, so the gap is named rather than implied.
`[VER-2]` ties `1.0.0` to every **core** appendix being complete by this definition.

### Core appendices

- **[`appendix/cli.md`](./appendix/cli.md)**: CLI tools. **Complete.**
- **[`appendix/backend.md`](./appendix/backend.md)**: backends and services. Heaviest use of crosscuts
  and `[COMPOSE]`. **Complete.**
- **[`appendix/web.md`](./appendix/web.md)**: web apps. The trust boundary is first-class. **Complete.**
- **[`appendix/library.md`](./appendix/library.md)**: libraries and packages. The consumer is the root,
  and the contract is semver. **Complete.**
- **[`appendix/gh-action.md`](./appendix/gh-action.md)**: Actions and tools. At-least-once reruns make
  idempotency mandatory. **Complete.**

### Addenda

An **addendum** covers an app type nobody here has built yet. It is written from reading rather than from
experience, it sits outside the `1.0.0` condition, and it may change substantially without a major bump.
See [`CONVENTIONS.md`](./CONVENTIONS.md#versioning-and-local-deviations). It graduates to a core appendix
once someone has built the thing and the rules survived contact with it.

- **[`appendix/agentic-app.md`](./appendix/agentic-app.md)**: the **runtime-agent profile**, not a sixth
  app shape. An app of any shape adds it when it calls a model at runtime, so an agentic backend loads
  this *and* `appendix/backend.md`. The model is an injected effect, and the agent runs in a harness.
  **ADDENDUM.** Its safety guardrails hold regardless: harness, untrusted model output, never
  exact-match, and never float the model identifier. Its construction advice is provisional, and one slot
  is open pending a decision.

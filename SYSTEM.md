# Coral Architecture — the System

<figure class="coral-fig wide">
  <img src="/reef-banner.png" alt="Several distinct coral colonies spaced apart on the seabed, linked only by the water between them" />
  <figcaption>A system — independent apps, coupled only by the bus between them.</figcaption>
</figure>

How separately-built **apps** compose into a **system**. This is a different bounded context from the app
spine: by the architecture's own `[SCOPE-3]`/`[GROW-3]` split signal, "one app" and "many apps composing"
are separate documents.

This document **builds on** [`ARCHITECTURE.md`](./ARCHITECTURE.md): each app in the system is internally
an app spine, with its own slices and horizontals. System rules use the families `[BUS-*]`, `[ORCH-*]`,
and `[SYS-TEST-*]`. The dependency points one way — this document cites app rules (`[IDEM-5]`,
`[CONTRACT-2]`); the app spine never cites a system rule.

**Defining tension:** the bus is the *only* coupling between apps. Keep it thin, explicit, and versioned;
never let two apps share a datastore or reach into each other's internals. The same properties that make
a slice agent-friendly — bounded context, self-verification — must hold at the app boundary. That is why
**contract testing**, not integrated end-to-end runs, is the system's test strategy: you verify each app
against the shared contract without standing up the whole system at once.

---

## The system at a glance

Apps never share a datastore. The **only** coupling is the bus, and the orchestration layer owns which
apps talk to which.

```mermaid
flowchart TB
  subgraph SYS["the system"]
    A["App A<br/>🗄 own store"]
    B["App B<br/>🗄 own store"]
    D["App C<br/>🗄 own store"]
    BUS{{"the bus<br/>API contract · event · message bus"}}
    A <--> BUS
    B <--> BUS
    D <--> BUS
  end
  ORCH["orchestration layer<br/>owns who-talks-to-whom · no business logic"] -. wires .-> BUS
  X["⛔ never a shared datastore"]
  class X bad
  classDef bad fill:#fdecec,stroke:#d23,color:#900
```

---

## 1. The Bus  `[BUS-*]`

**`[BUS-1]` `[review]`** — Apps communicate **only through a bus**: a published, explicit contract.

This is `[COMPOSE-1]` — depend on a published capability, never on internals — across a process line. If
app B needs data app A owns, A publishes a capability on the bus and B consumes it. A published read
should be **neutral enough that consumer-specific derived logic stays in the consumer**: a producer
exposes its data, never another app's calculation (`[STATE-4]`, `[ORCH-1]`).

**`[BUS-2]` `[guide]`** — A bus is one of three forms, chosen per relationship: a **synchronous API
contract**, an **event**, or an **actual message bus**.

The form is part of the contract. Choose by intent: a point-in-time read of current data → synchronous
API; a reaction to a state change → event; decoupled or buffered async work → message bus. When more than
one fits, prefer the weakest coupling that meets the latency need, and flag the choice (`[AGENT-2]`). The
form determines delivery semantics (`[BUS-5]`) and error model (`[BUS-6]`), so it is load-bearing, not a
detail.

**`[BUS-3]` `[auto]`** — Apps must not share a datastore.

A shared database re-creates the shared data-access layer `[STATE-2]` forbids, at system scale, and it
destroys `[STATE-5]` ownership across the whole system. Statically: an app's connection config names only
its own store.

**`[BUS-4]` `[review]`** — The bus contract is versioned and evolves backward-compatibly
(`[CONTRACT-2]`).

**Add** fields freely. **Never repurpose** a field — changing its type or meaning is a breaking change
even under the same name (turning `amount: 1250` into `amount: {value, currency}` is a repurpose, not an
addition; add a new field instead). **Removing** a field requires a **version step**: a new published
version of the capability, with the transport spelling — URL, header, media type, or schema version —
fixed by the appendix.

**Deprecate before removing**: mark the field deprecated in the contract and its broker/registry entry,
keep it for a stated window, and remove it only once **no consumer contract still references it**
(`[SYS-TEST-3]` confirms that). Derived data published on the bus is owned by its producer (`[STATE-4]`).

**`[BUS-5]` `[review]`** — Event and message buses are **at-least-once**: a consumer with mutating effects
must be idempotent (`[IDEM-5]`), via an idempotency key or a natural key.

The key makes the *handler* a safe no-op on redelivery even when the underlying operation is
non-idempotent (a relative decrement, `[IDEM-1]`); it is what reconciles `[IDEM-4]` (don't auto-retry a
non-idempotent op) with `[IDEM-5]` (the platform redelivers regardless). Synchronous API calls are not
at-least-once: the caller owns retry policy and must not auto-retry a non-idempotent operation.

**`[BUS-6]` `[review]`** — Errors do not cross the bus as exceptions.

On a **synchronous call**, a producer failure surfaces to the caller as the `infrastructure` category
(`[ERR-1]`). On an **event or message bus**, an un-processable message goes to a **dead-letter** path
rather than blocking the stream, and a transient failure is retried by redelivery — so the consumer must
be idempotent (`[BUS-5]`). Each app still raises and renders within its own boundary (`[ERR-3]`).

**`[BUS-7]` `[review]`** — Propagate a correlation/trace id across the bus so a single user action is
traceable across apps.

This is `[OBS-2]` at system scale. The id travels in the contract's metadata, never in the business
payload.

**`[BUS-8]` `[review]`** — The bus boundary is a **trust boundary** (`[TRUST-1]`): authenticate the caller
or message and validate the payload on receipt.

Never trust a cross-app payload implicitly, even from a sibling app you own.

**`[BUS-9]` `[review]`** — A bus gives **no ordering and no single-delivery guarantee** unless the contract
states one.

Distinct events may arrive out of order or concurrently, so a consumer that mutates shared state must be
**safe under concurrency**: serialize per affected key, use optimistic concurrency, or make the update
commutative. This is distinct from `[BUS-5]` dedupe — an idempotency key suppresses the *same* event
redelivered; it does **not** order two *different* events racing on the same state.

**`[BUS-10]` `[review]`** — Cross-app reads are **eventually consistent**, and a computation that needs a
coherent moment must state how it handles the skew.

Data fetched from two apps in two calls is not a transactional snapshot. Either tolerate the skew, read
from a single producer that exposes a consistent view, or reconcile asynchronously — and **say which**. Do
not assume a global snapshot the bus does not provide.

---

## 2. Orchestration  `[ORCH-*]`

**`[ORCH-1]` `[review]`** — The orchestration layer owns **topology** — which apps talk to which, over
which bus form — and contains no business logic.

It is the system's composition root, `[ROOT-1]` lifted to system scale: it wires producers to consumers,
and the apps themselves stay unaware of the wider graph.

**`[ORCH-2]` `[review]`** — An app publishes and consumes capabilities; it does not hard-code its peers.

*Re-wiring* existing capabilities — swapping a producer, routing an already-published capability to a new
consumer — is an orchestration change, not an edit to a participating app. *Publishing a new capability*
is, by contrast, a normal change to the producer app (a new slice in it), which owns and exposes it
(`[BUS-1]`). Adding a consumer never requires the producer to expose its internals.

**`[ORCH-3]` `[guide]`** — Each app is independently deployable and independently observable.

Density that would overwhelm one app (`[SCOPE-2]`) lives here as a *topology* problem, keeping every app
slice-shaped and within agent competence.

### The orchestrating harness (an agent as the conductor)

When an agent does the orchestrating, it is **not** a fourth, fuzzy bus form. It sits *above* the bus: a
consumer/router that *chooses among* the system's published capabilities. The bus underneath stays
deterministic and contract-tested; only the choice of which capability to call is the agent's.

**`[ORCH-4]` `[review]`** — An agent may orchestrate the system **only from inside a harness** — a
deterministic, observable app that employs the agent within walls.

See [`appendix/agentic-app.md`](./appendix/agentic-app.md), `[AGENTIC-5]`. Never a bare model with direct
authority over your apps.

**`[ORCH-5]` `[review]`** — The harness's tools **are** the apps' published bus capabilities (`[BUS-1]`);
the agent calls them and never reaches into internals.

Every call is authorized, irreversible cross-app actions are gated by a human, and every decision and
call is observed and trace-correlated (`[BUS-7]`, `[BUS-8]`).

**`[ORCH-6]` `[review]`** — The orchestrating harness **is itself an app** — an agentic app
(`[AGENTIC-6]`) with its own contract, observability, and tests.

The pattern holds at every scale: agent-in-a-harness at slice scale, app scale, and here at system scale.
Test it in two halves — the harness's deterministic routing, authorization, and gating are
contract-tested (`[SYS-TEST-1]`); the agent's behavior is graded by evals, never exact-match
(`[AGENTIC-11]`).

---

## 3. Contract Testing  `[SYS-TEST-*]`

**`[SYS-TEST-1]` `[review]`** — App-to-app behavior is verified by **contract tests, not by standing up
both apps together**; each side is tested independently against the shared bus contract.

This is `[TEST-1]` ("assert the observable contract") lifted across the process line, and it preserves
per-app independent verifiability — you never need both apps live at once, so each stays slice-sized for
an agent to reason about.

**`[SYS-TEST-2]` `[review]`** — Use **consumer-driven contracts**, and give **every consumed bus
relationship a published consumer contract**.

The consumer's expectations define the contract the producer must honor: the consumer test produces a
contract artifact, and the producer test verifies it honors that artifact, with neither app importing the
other. That artifact is what makes `[SYS-TEST-3]`'s release gate real — the gate can only catch breaks for
contracts it has, so an unverified cross-app dependency is not shippable.

**`[SYS-TEST-3]` `[review]`** — Contract tests are the enforcement mechanism for `[BUS-4]` and
`[CONTRACT-2]`: a producer change that would break a downstream consumer fails the **producer's own CI**
before release.

Run provider verification in the producer's pipeline against the consumer-published contracts.

**`[SYS-TEST-4]` `[guide]`** — Concrete tooling, tool-agnostic in principle; pick per stack:

- **Request/response and message buses:** [Pact](https://pact.io) — broad multi-language support (fits
  the language-agnostic stance), covers HTTP *and* message pacts, with a broker for sharing contracts and
  gating provider verification.
- **JVM stacks:** Spring Cloud Contract is an alternative.
- **Pure event/stream contracts:** a **schema registry** (Avro/Protobuf/JSON Schema) with enforced
  backward/forward compatibility checks is the event-shaped form of the same idea.

Whatever the tool, the contract is a **versioned artifact** in CI; breaking it fails the build.

**`[SYS-TEST-5]` `[review]`** — A thin smoke/e2e suite over a few critical cross-app journeys is allowed
as a backstop, but it does **not** replace contract tests — keep it tiny.

Contract tests catch contract drift cheaply and locally; broad integrated e2e is slow, flaky, and erodes
the independent-verifiability property (`[TEST-2]`, `[TEST-3]` at system scale).

---

## Agent Execution Contract (system)

The **complete** normative checklist for system-scale work: every `[auto]` and `[review]` rule in this
document. Sections 1–3 are the *why*; `[guide]` rules live only there.

<!-- coral:contract:start -->

### Crossing an app boundary
- `[BUS-1]` Cross an app boundary only through a published bus contract.
- `[BUS-3]` Never share a datastore between apps.
- `[BUS-8]` Authenticate the caller/message and validate every inbound bus payload.
- `[BUS-7]` Propagate the correlation/trace id across the bus, in metadata not payload.

### Delivery semantics
- `[BUS-5]` Make event/message consumers idempotent; never auto-retry a non-idempotent sync call.
- `[BUS-9]` Make consumers that mutate shared state safe under concurrent and out-of-order delivery.
- `[BUS-10]` Treat cross-app reads as eventually consistent, and state how the skew is handled.
- `[BUS-6]` Never let errors cross the bus as exceptions; dead-letter the un-processable.

### Contract evolution
- `[BUS-4]` Version the bus contract; add freely, never repurpose, deprecate before removing.

### Orchestration
- `[ORCH-1]` Put topology in the orchestration layer; keep business logic out of the wiring.
- `[ORCH-2]` Keep apps peer-agnostic: publish and consume capabilities, never hard-code peers.
- `[ORCH-4]` Let an agent orchestrate only from inside a harness, never as a bare model.
- `[ORCH-5]` Give the harness only published bus capabilities as tools; authorize every call and gate irreversible ones.
- `[ORCH-6]` Treat the orchestrating harness as an app: its own contract, observability, and tests.

### Contract testing
- `[SYS-TEST-1]` Verify each side independently against the shared contract, not by booting both apps.
- `[SYS-TEST-2]` Use consumer-driven contracts; every consumed dependency has a published contract.
- `[SYS-TEST-3]` Gate producer releases on provider verification against consumer contracts.
- `[SYS-TEST-5]` Keep integrated end-to-end suites tiny; they backstop contract tests, never replace them.

<!-- coral:contract:end -->

---

## System appendices (later)

When this spine densifies (`[GROW-2]`), split per bus form into `appendix/`:

- `system-rest.md` — synchronous API contracts (OpenAPI + Pact request/response).
- `system-events.md` — event/stream contracts (schema registry + compatibility, message pacts).
- `system-message-bus.md` — queue/broker specifics (delivery guarantees, dead-letter, ordering).

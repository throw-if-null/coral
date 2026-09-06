# Worked example: reviewing a real backend microservice

> Written against **Coral 0.7.0**.

The fastest way to understand Coral is to watch it applied to a *real* service rather than a toy. This
is a condensed review of a production-shaped Go microservice — an **audit-log service** (an HTTP read
API plus event-driven ingestion, on a NATS/JetStream + Postgres stack) — through the Coral rules. It
doubles as a method you can reuse: **audit any app by walking the rule families and asking, for each,
"where does this earn its keep, and where would it be overkill?"**

## The service in one paragraph

Three read endpoints (audit logs by entity, by a batch of entities, and last-edited), all `Get`-shaped
and tenant-scoped; an event consumer that ingests audit entries off the channel; Postgres via an ORM; a
thin `main` that only wires and runs. It is organized **by technical layer** (`api` / `events` /
`store` / `models` / `utils`) — the conventional Go layout, and the *opposite* of Coral's
organize-by-capability (`[MODEL-2]`). So this isn't a compliance check; it's "what would Coral change,
and is the change worth it?"

## Already Coral-shaped (often for free)

A well-built service on a good framework is already half-Coral before anyone says the word:

- **Thin composition root** — `main` only wires dependencies and runs. `[ROOT-1]`
- **Injected crosscuts** — the framework hands the app its router, logger, tracer, DB pool, config,
  and event bus; the DB module is the `db` crosscut. These are textbook crosscuts — defined once,
  injected, never reached for. `[XCUT-3]` `[STATE-2]`
- **A published channel contract** — a `client` package (typed events + subjects) that *other* services
  import to emit audit events. That is a published capability. `[CHAN-1]` `[CONTRACT-1]`
- **Trust at the edge** — middleware resolves identity and validates tenant/user/board + a permission
  *before* the handler runs; every query is tenant-scoped. `[BE-6]` `[TRUST-1]`
- **Read-only verbs** and **behavior-first tests** against a real database. `[IDEM-2]` `[TEST-1]`

The lesson: Coral mostly *names* what a good framework already enforces.

## Where the rules earn their keep

Two findings the rules surfaced — both independent of the folder layout.

### 1. The delivery guarantee was the opposite of what it looked like — `[CHAN-5]`

The service consumes events through the framework's high-level pub/sub handler, and JetStream is
enabled on the connection — so it *looks* durable. Reading the dependency revealed the handler path is
**core NATS, fire-and-forget: at-most-once, no acks, no redelivery.** For an audit log — a *system of
record* — that means entries delivered while the consumer is restarting or failing are **silently
lost**, never redelivered.

> The lesson matters as much as the finding: **don't infer a delivery guarantee — read the library.**
> The same method name ("subscribe") can be at-most-once or at-least-once depending on the path, and
> the difference is invisible from the call site.

The fix is a durable consumer with explicit ack (ack only *after* the write), making ingestion
at-least-once. And that, in turn, triggers `[CHAN-5]`: an at-least-once mutating consumer **must be
idempotent** — so the write becomes a dedupe/upsert keyed on the source event id. (Tellingly, a sibling
handler in the same service already did the idempotent upsert; the right pattern existed, just unevenly
applied — which is exactly the kind of drift a named rule prevents.)

### 2. Errors were ad-hoc and sometimes swallowed — `[ERR-1]`–`[ERR-3]`

Handlers rendered their own error bodies with inconsistent shapes and inline status codes — no
`{category, code, message}` taxonomy, and not "slices raise, the root renders" (`[ERR-3]`). Worse, the
event handler logged-and-returned-nil on failure, **swallowing** it. Combined with at-most-once
delivery, a failed write is a permanent, invisible loss. The fix: one small error taxonomy plus a
single root renderer; on the event side, surface failures and (once consumption is durable) ack only on
success.

## Where Coral would be overkill (the restraint)

Equally important — Coral is not a mandate to rewrite:

- **Whether `store` is an adapter or a repository layer** turns entirely on which side declares the
  interface (`[MODEL-4]`, `[STATE-2]`): slice-declared port and the arrow runs `store` → slice, or shared
  package defining the API and it is the layer `[STATE-2]` forbids. This review did not record the
  direction, so it cannot claim either — it is the first thing to check on a re-audit.
- **Re-slicing by capability** at ~2.4k LOC and five capabilities would be marginal. The layered layout
  is navigable, and `[SCOPE-1]`/`[GROW-1]` explicitly say *start small* and don't reorganize a working
  small service for purity.
- Near-identical mapping in two read handlers is the *tolerable* duplication that `[DUP-1]` sanctions.

## Where the rule is violated and the owner is unclear — `[BUCKET-1]`

`models` and `utils` are a real `[BUCKET-1]` violation, and an earlier version of this review got this
wrong in a way worth keeping on the page: it said renaming "would be cosmetic" and moved on. `[BUCKET-1]`
is `[auto]` — a blocking gate — so an official example waving it through taught the opposite of what the
rule set intends, namely that a deterministic rule is negotiable whenever compliance looks like tidying.
An agent that reads this page should not learn that.

What is actually true is narrower, and it is two separate claims. The rule **is** violated: the names are
on the forbidden list and the check fails. And strict compliance has **uncertain architectural value
here**, because the correct owner cannot be read off the repository — the types in `models` are used by
more than one capability, so moving them into any single one invents a boundary that the current code does
not establish.

That combination is the definition of an escalation, not of a pass. The agent reports the rule, the path,
the compliant alternatives, and why choosing between them would create an architectural boundary — then
stops (`[AGENT-2]`), because an agent never settles it itself (`[AGENT-4]`). If the team decides the layout
stays, that decision is an **Exception** in the project's `CORAL.md`, recorded against `BUCKET-1` and
scoped to those two paths (`[VER-5]`) — which is also the only thing that stops `coral-lint` reporting it
again on every run.

The distinction to carry away: *"the rule does not apply here"* and *"the rule applies and we are
knowingly not complying"* are different claims with different costs, and only the second one is available
for `models` and `utils`.

## The method (reusable)

To audit any app against Coral, walk the families and, for each, ask **"earns its keep, or overkill?"**:

- boundary & verbs — `[BOUND-1]` / `[IDEM-1]`
- crosscuts vs buckets — `[XCUT-1]` / `[BUCKET-1]`
- effects & state — `[EFFECT-2]` / `[STATE-1]`
- errors — `[ERR-1]`
- trust — `[TRUST-1]`
- delivery & contracts across the channel — `[CHAN-5]` / `[CONTRACT-1]`
- testing — `[TEST-1]`

Then separate **substance** (delivery, errors, trust — true under any architecture) from **structure you
are choosing to defer** (folder names, slice boundaries at small scale). The second category still gets
reported; what changes is the disposition — a recorded exception with a `revisit_when`, not a shrug
(`[VER-5]`). An audit that ranks substance first and dispositions the rest explicitly is the one people
act on; an audit that quietly drops the structural findings is the one that gets cited later as proof the
architecture was optional.

## What this also proves

Beyond the findings, the exercise is a dry-run of the architecture's *vocabulary*: every part of a real
service landed in one of the five categories (`[MODEL-1]`) without strain — slices, crosscuts, adapters,
a composition root, published contracts, and the channel between services. When the words fit a system you
didn't design, the model is doing real work.

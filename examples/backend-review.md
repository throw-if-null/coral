# Worked example: reviewing a real backend microservice

The fastest way to understand Coral is to watch it applied to a *real* service rather than a toy. This
is a condensed review of a production-shaped Go microservice — an **audit-log service** (an HTTP read
API plus event-driven ingestion, on a NATS/JetStream + Postgres stack) — through the Coral rules. It
doubles as a method you can reuse: **audit any app by walking the rule families and asking, for each,
"where does this earn its keep, and where would it be overkill?"**

## The service in one paragraph

Three read endpoints (audit logs by entity, by a batch of entities, and last-edited), all `Get`-shaped
and tenant-scoped; an event consumer that ingests audit entries off the bus; Postgres via an ORM; a
thin `main` that only wires and runs. It is organized **by technical layer** (`api` / `events` /
`store` / `models` / `utils`) — the conventional Go layout, and the *opposite* of Coral's
organize-by-capability (`[MODEL-2]`). So this isn't a compliance check; it's "what would Coral change,
and is the change worth it?"

## Already Coral-shaped (often for free)

A well-built service on a good framework is already half-Coral before anyone says the word:

- **Thin composition root** — `main` only wires dependencies and runs. `[ROOT-1]`
- **Injected horizontals** — the framework hands the app its router, logger, tracer, DB pool, config,
  and event bus; the DB module is the `db` horizontal. These are textbook horizontals — defined once,
  injected, never reached for. `[XCUT-3]` `[STATE-2]`
- **A published bus contract** — a `client` package (typed events + subjects) that *other* services
  import to emit audit events. That is a published capability. `[BUS-1]` `[CONTRACT-1]`
- **Trust at the edge** — middleware resolves identity and validates tenant/user/board + a permission
  *before* the handler runs; every query is tenant-scoped. `[BE-6]` `[TRUST-1]`
- **Read-only verbs** and **behavior-first tests** against a real database. `[IDEM-2]` `[TEST-1]`

The lesson: Coral mostly *names* what a good framework already enforces.

## Where the rules earn their keep

Two findings the rules surfaced — both independent of the folder layout.

### 1. The delivery guarantee was the opposite of what it looked like — `[BUS-5]`

The service consumes events through the framework's high-level pub/sub handler, and JetStream is
enabled on the connection — so it *looks* durable. Reading the dependency revealed the handler path is
**core NATS, fire-and-forget: at-most-once, no acks, no redelivery.** For an audit log — a *system of
record* — that means entries delivered while the consumer is restarting or failing are **silently
lost**, never redelivered.

> The lesson matters as much as the finding: **don't infer a delivery guarantee — read the library.**
> The same method name ("subscribe") can be at-most-once or at-least-once depending on the path, and
> the difference is invisible from the call site.

The fix is a durable consumer with explicit ack (ack only *after* the write), making ingestion
at-least-once. And that, in turn, triggers `[BUS-5]`: an at-least-once mutating consumer **must be
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

- **Re-slicing by capability** at ~2.4k LOC and five capabilities would be marginal. The layered layout
  is navigable, and `[SCOPE-1]`/`[GROW-1]` explicitly say *start small* and don't reorganize a working
  small service for purity.
- **`models` / `utils`** trip `[BUCKET-1]` *by name*, but two cohesive domain types and one helper are
  not the grab-bag the rule targets. Renaming would be cosmetic.
- Near-identical mapping in two read handlers is the *tolerable* duplication that `[DUP-1]` sanctions.

## The method (reusable)

To audit any app against Coral, walk the families and, for each, ask **"earns its keep, or overkill?"**:

- boundary & verbs — `[BOUND-1]` / `[IDEM-1]`
- horizontals vs buckets — `[XCUT-1]` / `[BUCKET-1]`
- effects & state — `[EFFECT-2]` / `[STATE-1]`
- errors — `[ERR-1]`
- trust — `[TRUST-1]`
- delivery & contracts across the bus — `[BUS-5]` / `[CONTRACT-1]`
- testing — `[TEST-1]`

Then separate **substance** (delivery, errors, trust — true under any architecture) from **cosmetics**
(folder names, slice boundaries at small scale). An audit that flags substance and waves off cosmetics
is the one people actually act on.

## What this also proves

Beyond the findings, the exercise is a dry-run of the architecture's *vocabulary*: every part of a real
service landed in one of the four categories (`[MODEL-1]`) without strain — slices, horizontals, a
composition root, published contracts, and the bus between services. When the words fit a system you
didn't design, the model is doing real work.

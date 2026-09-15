# Worked example: reviewing a real backend microservice

> Written against **Coral 0.6.0**.

The fastest way to understand Coral is to read it applied to a *real* service rather than a toy. This is
a condensed review of a production-shaped Go microservice against the Coral rules. The service is an
**audit-log service**: an HTTP read API plus event-driven ingestion, on a NATS/JetStream and Postgres
stack. The review also gives a reusable method. **Audit any app by walking the rule families and asking,
for each, "where does this rule prevent a real failure, and where would it be overkill?"**

## The service in one paragraph

The service has three read endpoints, all `Get`-shaped and tenant-scoped: audit logs by entity, by a
batch of entities, and last-edited. It also has an event consumer that ingests audit entries off the
channel, Postgres via an ORM, and a thin `main` that only wires and runs. It is organized **by technical
layer** (`api` / `events` / `store` / `models` / `utils`). That is the conventional Go layout, and the
*opposite* of Coral's organize-by-capability (`[MODEL-2]`). This is therefore not a compliance check. It
asks what Coral would change, and whether the change is worth it.

## Already Coral-shaped (often at no extra cost)

A well-built service on a good framework satisfies much of Coral before anyone says the word:

- **Thin composition root.** `main` only wires dependencies and runs. `[ROOT-1]`
- **Injected crosscuts.** The framework hands the app its router, logger, tracer, DB pool, config, and
  event bus. The DB module is the `db` crosscut. These are crosscuts in the exact Coral sense: defined
  once, injected, never reached for. `[XCUT-3]` `[STATE-2]`
- **A published channel contract.** A `client` package of typed events and subjects that *other*
  services import to emit audit events. That is a published capability. `[CHAN-1]` `[CONTRACT-1]`
- **Trust at the edge.** Middleware resolves identity and validates tenant, user, board and a permission
  *before* the handler runs. Every query is tenant-scoped. `[BE-6]` `[TRUST-1]`
- **Read-only verbs** and **behavior-first tests** against a real database. `[IDEM-2]` `[TEST-1]`

Coral largely *names* what a good framework already enforces.

## Where the rules earn their keep

The rules surfaced two findings. Both are independent of the folder layout.

### 1. The delivery guarantee was the opposite of what it looked like — `[CHAN-5]`

The service consumes events through the framework's high-level pub/sub handler, and JetStream is
enabled on the connection, so the path *looks* durable. Reading the dependency revealed the handler path
is **core NATS, fire-and-forget: at-most-once, no acks, no redelivery.** An audit log is a *system of
record*, so entries delivered while the consumer is restarting or failing are **silently lost**, and
never redelivered.

> The method matters as much as the finding. **Do not infer a delivery guarantee. Read the library.**
> The same method name ("subscribe") can be at-most-once or at-least-once depending on the path, and
> the difference is invisible from the call site.

The fix is a durable consumer with explicit ack, acking only *after* the write, which makes ingestion
at-least-once. That in turn triggers `[CHAN-5]`: an at-least-once mutating consumer **must be
idempotent**, so the write becomes a dedupe or upsert keyed on the source event id. A sibling handler in
the same service already did the idempotent upsert. The correct pattern existed and was applied
unevenly, which is the drift a named rule prevents.

### 2. Errors were ad-hoc and sometimes swallowed — `[ERR-1]`–`[ERR-3]`

Handlers rendered their own error bodies with inconsistent shapes and inline status codes. There was no
`{category, code, message}` taxonomy, and the pattern was not "slices raise, the root renders"
(`[ERR-3]`). The event handler also logged and returned nil on failure, **discarding** the error.
Combined with at-most-once delivery, a failed write is a permanent, invisible loss. The fix is one small
error taxonomy plus a single root renderer. On the event side, surface failures, and once consumption is
durable, ack only on success.

## Where Coral would be overkill (the restraint)

Coral is not a mandate to rewrite:

- **Whether `store` is an adapter or a repository layer** turns entirely on which side declares the
  interface (`[MODEL-4]`, `[STATE-2]`). Either the slice declares the port and the arrow runs `store` →
  slice, or a shared package defines the API and it is the layer `[STATE-2]` forbids. This review did not
  record the direction, so it cannot claim either. It is the first thing to check on a re-audit.
- **Re-slicing by capability** at roughly 2.4k LOC and five capabilities would be marginal. The layered
  layout is navigable, and `[SCOPE-1]` and `[GROW-1]` explicitly say to start small and not to
  reorganize a working small service for purity.
- Near-identical mapping in two read handlers is the *tolerable* duplication that `[DUP-1]` sanctions.

## Where the rule is violated and the owner is unclear — `[BUCKET-1]`

`models` and `utils` are a real `[BUCKET-1]` violation. An earlier version of this review got that wrong,
and the error is kept on the page deliberately. It said renaming "would be cosmetic" and moved on.
`[BUCKET-1]` is `[auto]`, which is a blocking gate. An official example passing it taught the opposite of
what the rule set intends: that a deterministic rule is negotiable whenever compliance looks like tidying.
An agent that reads this page should not learn that.

The true statement is narrower, and it is two separate claims. The rule **is** violated: the names are on
the forbidden list and the check fails. Strict compliance also has **uncertain architectural value here**,
because the correct owner cannot be read off the repository. The types in `models` are used by more than
one capability, so moving them into any single one invents a boundary that the current code does not
establish.

That combination is the definition of an escalation, not of a pass. The agent reports the rule, the path,
the compliant alternatives, and why choosing between them would create an architectural boundary. It then
stops (`[AGENT-2]`), because an agent never settles it itself (`[AGENT-4]`). If the team decides the layout
stays, that decision is an **Exception** in the project's `CORAL.md`, recorded against `BUCKET-1` and
scoped to those two paths (`[VER-5]`). Recording it is also the only thing that stops `coral-lint`
reporting it again on every run.

Carry this distinction away: *"the rule does not apply here"* and *"the rule applies and we are knowingly
not complying"* are different claims with different costs. Only the second is available for `models` and
`utils`.

## The method (reusable)

To audit any app against Coral, walk the families and, for each, ask **"does this prevent a real failure
here, or is it overkill?"**:

- boundary and verbs: `[BOUND-1]`, `[IDEM-1]`
- crosscuts against buckets: `[XCUT-1]`, `[BUCKET-1]`
- effects and state: `[EFFECT-2]`, `[STATE-1]`
- errors: `[ERR-1]`
- trust: `[TRUST-1]`
- delivery and contracts across the channel: `[CHAN-5]`, `[CONTRACT-1]`
- testing: `[TEST-1]`

Then separate **substance** from **structure you are choosing to defer**. Substance is delivery, errors
and trust, which are true under any architecture. Deferred structure is folder names and slice boundaries
at small scale. The second category is still reported. What changes is the disposition: a recorded
exception with a `revisit_when`, rather than no decision at all (`[VER-5]`). An audit that ranks substance
first and dispositions the rest explicitly is the one people act on. An audit that quietly drops the
structural findings is the one cited later as proof the architecture was optional.

## What this also proves

Beyond the findings, the exercise tests the architecture's *vocabulary*. Every part of a real service
landed in one of the five categories (`[MODEL-1]`) without strain: slices, crosscuts, adapters, a
composition root, published contracts, and the channel between services. The words fit a system nobody
here designed, which is evidence the model is doing real work.

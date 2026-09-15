# Appendix: Backend / Service

> Status: **complete**. Every slot either carries a `BE-` rule or is explicitly deferred to the spine.
> Read the spine first.

This appendix instantiates the [Coral app spine](../ARCHITECTURE.md) for backends and services.

**Defining tension:** backends have the richest domain model, so this is where **crosscuts
(`[XCUT-*]`)** and **slice-to-slice composition (`[COMPOSE-*]`)** carry the most weight. The failure to
avoid is re-growing a `services` or `repository` layer (`[BUCKET-1]`) presented as a domain core. Three
practices prevent it:

- keep the `[XCUT-1]` gate strict
- apply `[XCUT-5]`: an entity's invariants may be a crosscut, its queries may not
- inject domain invariants rather than reaching into them

---

## Boundary & naming  → `[BOUND-1]`

**`[BE-1]`** `[review]` `{app:backend}` One slice per **business operation**, and the route is that
operation's *trigger*, not its definition. The slice directory is the **singular capability + effect
verb** (`expense/create`). The route may be **plural** (`POST /expenses`). Map `method + path → slice` by
capability and effect, not by URL spelling. A tight read/write pair may share a slice (`[BOUND-2]`).

The distinction decides the two cases where route-counting gives the wrong answer. Two routes that are
the **same operation** are **one slice with two triggers**, not two slices. Examples are a current path
and a legacy alias, or the same handler mounted under two prefixes. Duplicating the slice to match the
URL table duplicates the behavior and guarantees the copies drift. One route that dispatches on a body
field into two genuinely different operations is **two slices** behind one trigger, however tidy the
single endpoint looks. `[BOUND-1]` is transport-agnostic on purpose. This rule instantiates it for HTTP
without making the URL table the architecture.

## Observable contract & success status  → `[CONTRACT-1]`

**`[BE-2]`** `[review]` `{app:backend}` The contract is **status code + response body + observable side
effects**. Success status by effect:

- **`201`** for a resource-creating `POST`, returning the created `id` and optionally a `Location`
- **`200`** for reads and idempotent sets that return a body
- **`204`** for sets and deletes with no body

The returned `id` and body shape are part of the stable contract (`[CONTRACT-1]`).

## Composition root & scope  → `[ROOT-1]`

**`[BE-3]`** `[review]` `{app:backend}` Wiring is router + middleware + dependency injection. **Crosscuts
are singletons by default** (connection pool, config, logger, error type, domain-invariant helpers). Only
**request-bound** state is per-request: the transaction/connection handle, the authenticated principal, and
the correlation/trace id. Inject request-scoped values into the slice. Never let a slice reach for
ambient globals (`[XCUT-3]`) or read configuration directly (`[CONFIG-2]`).

## Idempotency  → `[IDEM-1]` `[IDEM-5]`

**`[BE-4]`** `[review]` `{app:backend}` Resolve the spine's idempotency-key question by delivery path:

- A **synchronous client-driven** `POST` is *not* an at-least-once path, so an idempotency key is
  **optional**. Offer one when clients may retry on timeout, but it is not required.
- Any handler the **platform redelivers** is at-least-once, and it **must** be idempotent per
  `[IDEM-5]`, via an idempotency key or a natural key. Examples are a queue or event consumer, a webhook
  receiver, and a retried job.
- `GET`, `PUT` and `DELETE` are idempotent. `POST` is not (`[IDEM-1]`). Never auto-retry a `POST`
  (`[IDEM-4]`).

## Error rendering & status map  → `[ERR-1]`

**`[BE-5]`** `[auto]` `{app:backend}` Slices raise the app's declared error model (`[ERR-1]`), and a
single root error-handling middleware renders it and maps **every** declared category to an HTTP status.
No slice chooses a status or constructs its own error response. That is what makes this statically
checkable: a status-code write inside a slice module is a violation.

**The mapping is total, and this rule is what requires that.** `[ERR-1]` asks for one declared model and
one boundary that presents it; requiring a status for *every* declared category is this profile's
realization of that half. The middleware knows a status for every category the project declared, so
adding a category touches two central definitions — the taxonomy declaration and this mapping table —
and no slice or handler. That is the property worth having: the blast radius is the architectural
definitions, never every call site. A category the renderer does not know is not a custom taxonomy; it is
a gap that falls through to whatever a handler does next, which is the per-slice presentation `[ERR-1]`
forbids. A project that declares its own taxonomy is conformant here exactly when the root maps all of
it.

**The recommended mapping, when the project uses `[ERR-5]`'s default taxonomy:**

| category         | HTTP status |
| ---------------- | ----------- |
| `usage`          | `400`       |
| `validation`     | `400` (use `422` only if you deliberately distinguish well-formed-but-invalid) |
| `not_found`      | `404`       |
| `conflict`       | `409`       |
| `infrastructure` | `503` (or `500`) |
| `internal`       | `500`       |

A project on another taxonomy writes its own table at the same place, under the same total-mapping rule.
Under the production baseline the rendered body is `{category, code, message}` and the `code` strings stay
slice-owned (`[ERR-2]`).

**`401` and `403` are absent from this map by construction**, not by omission: no slice raises them, so
they belong to no error category. They are rendered by the middleware that denies the request, per
`[BE-8]`.

## Trust / security  → `[TRUST-1]` `[TRUST-2]`

**`[BE-6]`** `[review]` `{app:backend}` **Authenticate** at the boundary as root middleware, before the
slice, and do **coarse capability authorization** there too: may this principal call this endpoint at
all. The slice receives an already-authenticated principal. **Resource-level authorization lives with the
state it protects.** If resources are **user- or tenant-scoped**, the owner/tenant id is **part of the
record and part of every query's WHERE clause**.

Both halves are required, and the split is not a compromise. *May this principal call
`GET /expenses/{id}`* is answerable from the request alone, so it belongs at the edge where a denial costs
nothing. *May this principal see expense 947* is answerable only from domain state, because the row's
owner is in the row. Moving that check to the boundary means the middleware loads the resource. That
either duplicates the slice's query, or hands the slice a pre-loaded entity and dissolves its ownership of
its own state (`[STATE-1]`). Scoping the query is the same check, done where the answer already is. A
`WHERE tenant_id = $1` that matches nothing is an authorization denial expressed as the taxonomy's
missing-resource category — `not_found` under `[ERR-5]`'s default vocabulary (`[ERR-1]`, `[BE-8]`).

Decide this *before* writing the slice, because it changes the schema, the slice signature, and the
tests. It is the one slot in this appendix that is expensive to retrofit. Secrets come from the config
crosscut, never inline (`[CONFIG-4]`). **Default to deny:** a slice with no explicit authorization rule
is not shippable.

**`[BE-8]`** `[review]` `{app:backend}` Render authentication and authorization failures at the boundary
that decides them, never through the error model: **`401`** when the caller is unauthenticated,
**`403`** when an authenticated caller lacks the capability, and **`404`** when a scoped query does not
match.

Keep `401` and `403` apart. A client can act on the difference, and cannot act on the wrong one. `401`
means *we do not know who you are*: the credential is absent, malformed, or expired. Retrying with a
fresh credential may work, which is why `401` carries `WWW-Authenticate` when a scheme is being
advertised. `403` means *we know who you are and the answer is no*, so retrying is pointless. Returning
`403` for a missing token sends a client into a permission investigation over an expired session.
Returning `401` for a real permission denial sends it into a refresh loop that can never succeed.

`404` for a scoped miss is a deliberate misstatement, and it is required rather than permitted. The
alternative tells an unauthorized caller that expense 947 exists, which is exactly the fact they were
denied. **The requirement is the observable behavior, not a category name.** A scoped miss must reach the
client as a `404` that is indistinguishable from a genuine miss, whatever the project's taxonomy calls
it. Under `[ERR-5]`'s default vocabulary that category is `not_found`; on another taxonomy it is whichever
category `[BE-5]`'s table maps to `404`, and the equivalence must hold in the body as well as the status.
The slice makes no misstatement of its own. It raises the missing-resource category because its scoped
query found nothing, and `[BE-5]` maps it like any other. Do not add a `forbidden` category to make this
"more honest". The honesty is the vulnerability.

Neither `401` nor `403` carries a slice-owned `code`, because no slice raised them. Keep the body
minimal, and do not explain which rule denied the request. The detail belongs in the log line with the
correlation id (`[OBS-2]`), where the operator can see it and the caller cannot.

## Contract versioning  → `[CONTRACT-2]`

**`[BE-7]`** `[review]` `{app:backend}` **Pick one API versioning strategy, write it down, and apply it
across the system.** A **URL prefix** (`/v1`) is the default. Advance the version **only** for a breaking
change.

**Nothing additive bumps it.** A new endpoint, a new response field, and a new optional parameter never
bump the version. Two things are breaking:

- **repurposing** a field, which is breaking even under the same name. Turning `amount: 1250` into
  `amount: {value, currency}` is a repurpose, so add a new field instead.
- **removing** a field or an endpoint.

Both need `/v2`, with `/v1` kept for a stated window and its fields marked deprecated first.

**The spelling is a default, not architecture.** Header and media-type versioning are equally valid, and a
gateway or a client ecosystem may require one. Deviating is an **Exception** recorded in the project's
`CORAL.md`, not a violation. An agent never writes that record itself (`[AGENT-4]`). It flags the choice,
and a human decides. What is *not* acceptable is leaving the discipline undecided, or letting it vary
between services in one system. An agent adding an endpoint should never have to survey the repo to
discover the convention (`[AGENT-1]`).

**Decide the support window before the first external consumer**, and write it down. "We serve the current
and previous major, for six months" is a decision. Discovering you serve four is not.

## Slots deferred to the spine

These need no backend-specific rule. The spine's answer is the answer.

- **State / effects** → `[STATE-1]` `[STATE-2]` `[STATE-5]`: slice-owned queries, with the transaction
  scoped to the request. The `db` crosscut owns the pool and runs migrations. Each table's schema is
  defined once inside its owning feature package, so `expense/create` and `expense/list` share the table
  and still write their own queries.
- **Configuration** → `[CONFIG-1..4]`: one config crosscut constructed and validated at boot. No slice
  reads the environment.
- **Observability** → `[OBS-1..3]`: structured logs, metrics, and correlation/trace IDs via the injected
  logging crosscut. Never on the response body.
- **Testing** → `[TEST-1]` `[TEST-4]`: HTTP-level in-process tests against real or test-container infra.
  Assert status, body, side effects, and authorization.

## Open questions

- `[SCOPE-4]` governs cross-service composition: published capabilities over an explicit boundary, never
  a shared datastore. Confirm the transport (sync API or event stream) per system, per `[CHAN-2]`.

---

## Agent Execution Contract (backend)

The complete normative checklist for this appendix: every `[auto]` and `[review]` rule defined above. It
**adds to** the app-scale contracts rather than replacing them. Load
[`ARCHITECTURE.md`](../ARCHITECTURE.md)'s contract, and [`PRODUCTION.md`](../PRODUCTION.md)'s if this
project adopts the production baseline. `[guide]` rules are rationale and live only in the prose.

<!-- coral:contract:start -->
<!-- coral:scope:app:backend -->

- `[BE-1]` One slice per business operation, named for the singular capability plus its effect verb. The route is its trigger.
- `[BE-2]` The contract is status code + response body + observable side effects: `201` create, `200` read, `204` no body.
- `[BE-3]` Wire router, middleware, and injection at the root. Crosscuts are singletons, and only request-bound state is per-request.
- `[BE-4]` A synchronous `POST` may offer an idempotency key. Any platform-redelivered handler must be idempotent.
- `[BE-5]` Slices raise the declared error model. One root middleware renders it and maps every declared category to an HTTP status.
- `[BE-6]` Authenticate and coarsely authorize at the boundary. Scope every query by owner/tenant id, and default to deny.
- `[BE-8]` Render authn/authz failures at the boundary, not through the error model: `401` unauthenticated, `403` no capability, `404` scoped miss.
- `[BE-7]` Pick one API versioning strategy and apply it system-wide, with URL prefix as the default. Advance it only for a breaking change.

<!-- coral:contract:end -->

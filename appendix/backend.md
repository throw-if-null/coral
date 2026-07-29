# Appendix: Backend / Service

> Status: **complete** — every slot either carries a `BE-` rule or is explicitly deferred to the spine.
> Read the spine first.

This appendix instantiates the [Coral app spine](../ARCHITECTURE.md) for backends and services.

**Defining tension:** backends have the richest domain model, so this is where **horizontals
(`[XCUT-*]`)** and **slice-to-slice composition (`[COMPOSE-*]`)** carry the most weight. The trap is
re-growing a `services`/`repository` layer (`[BUCKET-1]`) under the guise of a domain core — keep the
`[XCUT-1]` gate strict, keep `[XCUT-5]` in mind (an entity's invariants may be a horizontal; its queries
may not), and inject domain invariants rather than reaching into them.

---

## Boundary & naming  → `[BOUND-1]`

**`[BE-1]`** `[review]` One slice per HTTP route or use-case. The slice directory is the **singular
capability + effect verb** (`expense/create`); the route may be **plural** (`POST /expenses`). Map
`method + path → slice` by capability and effect, not by URL spelling. A tight read/write pair may share a
slice (`[BOUND-2]`).

## Observable contract & success status  → `[CONTRACT-1]`

**`[BE-2]`** `[review]` The contract is **status code + response body + observable side effects**. Success
status by effect: **`201`** for a resource-creating `POST` (return the created `id`, optionally a
`Location`); **`200`** for reads and idempotent sets that return a body; **`204`** for sets and deletes
with no body. The returned `id` and body shape are part of the stable contract (`[CONTRACT-1]`).

## Composition root & scope  → `[ROOT-1]`

**`[BE-3]`** `[review]` Wiring is router + middleware + dependency injection. **Horizontals are singletons
by default** (connection pool, config, logger, error type, domain-invariant helpers). Only
**request-bound** state is per-request: the transaction/connection handle, the authenticated principal,
and the correlation/trace id. Inject request-scoped values into the slice; never let a slice reach for
ambient globals (`[XCUT-3]`) or read configuration directly (`[CONFIG-2]`).

## Idempotency  → `[IDEM-1]` `[IDEM-5]`

**`[BE-4]`** `[review]` Resolve the spine's idempotency-key question by delivery path:

- A **synchronous client-driven** `POST` is *not* an at-least-once path, so an idempotency key is
  **optional** — offer one when clients may retry on timeout, but it is not required.
- Any handler the **platform redelivers** (a queue/event consumer, a webhook receiver, a retried job) is
  at-least-once and **must** be idempotent per `[IDEM-5]`, via an idempotency key or a natural key.
- `GET`/`PUT`/`DELETE` are idempotent; `POST` is not (`[IDEM-1]`); never auto-retry a `POST`
  (`[IDEM-4]`).

## Error rendering & status map  → `[ERR-3]`

**`[BE-5]`** `[auto]` Slices raise the taxonomy; a single root error-handling middleware renders the
`{category, code, message}` body and maps `category` → HTTP status. No slice constructs its own HTTP
response, which is what makes this statically checkable: a status-code write inside a slice module is a
violation.

| category         | HTTP status |
| ---------------- | ----------- |
| `usage`          | `400`       |
| `validation`     | `400` (use `422` only if you deliberately distinguish well-formed-but-invalid) |
| `not_found`      | `404`       |
| `conflict`       | `409`       |
| `infrastructure` | `503` (or `500`) |
| `internal`       | `500`       |

The `code` strings stay slice-owned (`[ERR-2]`).

## Trust / security  → `[TRUST-1]` `[TRUST-2]`

**`[BE-6]`** `[review]` Authentication and authorization run at the boundary as **root middleware, before
the slice**; the slice receives an already-authenticated principal. If resources are **user- or
tenant-scoped**, the owner/tenant id is **part of the record and part of every query's WHERE clause**.

Decide this *before* writing the slice, because it changes the schema, the slice signature, and the
tests — it is the one slot in this appendix that is expensive to retrofit. Secrets come from the config
horizontal, never inline (`[CONFIG-4]`). **Default to deny:** a slice with no explicit authorization rule
is not shippable.

## Contract versioning  → `[CONTRACT-2]`

**`[BE-7]`** `[review]` Version the HTTP API with a **URL prefix** (`/v1`), and advance it **only** for a
breaking change.

**Nothing additive bumps it.** A new endpoint, a new response field, a new optional parameter — no bump,
ever. Two things are breaking: **repurposing** a field, which is breaking even under the same name (turning
`amount: 1250` into `amount: {value, currency}` is a repurpose, so add a new field instead), and
**removing** a field or an endpoint. Those need `/v2`, with `/v1` kept for a stated window and its fields
marked deprecated first.

**The spelling is a default, not architecture.** Header and media-type versioning are equally valid, and a
gateway or a client ecosystem may dictate one. Deviating is an **Exception** recorded in the project's
`CORAL.md` — not a violation — and an agent never writes that record itself (`[AGENT-4]`); it flags the
choice and a human decides. What is *not* acceptable is leaving the discipline undecided, or letting it vary
between services in one system: an agent adding an endpoint should never have to survey the repo to
discover the convention (`[AGENT-1]`).

**Decide the support window before the first external consumer**, and write it down. "We serve the current
and previous major, for six months" is a decision; discovering you serve four is not.

## Slots deferred to the spine

These need no backend-specific rule — the spine's answer is the answer.

- **State / effects** → `[STATE-1]` `[STATE-2]` `[STATE-5]`: slice-owned queries; transaction scoped to
  the request; the `db` horizontal owns the pool and runs migrations, while each table's schema is defined
  by its owning slice.
- **Configuration** → `[CONFIG-1..4]`: one config horizontal constructed and validated at boot; no slice
  reads the environment.
- **Observability** → `[OBS-1..3]`: structured logs + metrics + correlation/trace IDs via the injected
  logging horizontal; never on the response body.
- **Testing** → `[TEST-1]` `[TEST-4]`: HTTP-level in-process tests against real or test-container infra;
  assert status + body + side effects + authorization.

## Open questions

- Cross-service composition is governed by `[SCOPE-4]` — published capabilities over an explicit
  boundary, never a shared datastore. Confirm the transport (sync API vs. event stream) per system, per
  `[BUS-2]`.

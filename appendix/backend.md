# Appendix: Backend / Service  (PARTIAL — core slots filled)

> Status: partial. The slots Probe 3 found under-specified are now written as `BE-` rules; the rest
> remain slot notes to flesh out against a concrete backend. Read the spine first.

This appendix is one species of polyp. It instantiates the [Coral app spine](../ARCHITECTURE.md) for backends and services.

**Defining tension:** backends have the richest domain model, so this is where **horizontals
(`[XCUT-*]`)** and **slice-to-slice composition (`[COMPOSE-*]`)** carry the most weight. The trap is
re-growing a `services`/`repository` layer (`[BUCKET-1]`) under the guise of a domain core — keep the
`[XCUT-1]` gate strict and inject domain invariants rather than reaching into them.

---

## Boundary & naming  → `[BOUND-1]`

**`[BE-1]`** One slice per HTTP route/use-case. The slice directory is the **singular capability +
effect verb** (`expense/create`); the route may be **plural** (`POST /expenses`). Map
`method + path → slice` by capability and effect — not by URL spelling. A tight read/write pair may
share a slice (`[BOUND-2]`).

## Observable contract & success status  → `[CONTRACT-1]`

**`[BE-2]`** The contract is **status code + response body + observable side effects**. Success
status by effect: **`201`** for a resource-creating `POST` (return the created `id`, optionally a
`Location`); **`200`** for reads and idempotent sets that return a body; **`204`** for sets/deletes
with no body. The returned `id` and body shape are part of the stable contract (`[CONTRACT-1]`).

## Composition root & scope  → `[ROOT-1]`

**`[BE-3]`** Wiring is router + middleware + dependency injection. **Horizontals are singletons by
default** (connection pool, config, logger, error type, domain-invariant helpers). Only
**request-bound** state is per-request: the transaction/connection handle, the authenticated
principal, and the correlation/trace id. Inject request-scoped values into the slice; never let a
slice reach for ambient globals (`[XCUT-3]`).

## Idempotency  → `[IDEM-1]` `[IDEM-5]`

**`[BE-4]`** Resolves the spine tension on idempotency keys:
- A **synchronous client-driven** `POST` is *not* an at-least-once path, so an idempotency key is
  **optional** — offer one when clients may retry on timeout, but it is not required.
- Any handler the **platform redelivers** (a queue/event consumer, a webhook receiver, a retried job)
  is at-least-once and **must** be idempotent per `[IDEM-5]` — via an idempotency key or a natural key.
- `GET`/`PUT`/`DELETE` are idempotent; `POST` is not (`[IDEM-1]`); never auto-retry a `POST`
  (`[IDEM-4]`).

## Error rendering & status map  → `[ERR-3]`

**`[BE-5]`** Slices raise the taxonomy; a single root error-handling middleware renders the
`{category, code, message}` body and maps `category → HTTP status`:

| category         | HTTP status |
| ---------------- | ----------- |
| `usage`          | `400`       |
| `validation`     | `400` (use `422` only if you deliberately distinguish well-formed-but-invalid) |
| `not_found`      | `404`       |
| `conflict`       | `409`       |
| `infrastructure` | `503` (or `500`) |
| `internal`       | `500`       |

No slice renders its own HTTP response (`[ERR-3]`); the `code` strings stay slice-owned (`[ERR-2]`).

## Trust / security  → `[TRUST-1]` `[TRUST-2]`

**`[BE-6]`** (The gap Probe 3 flagged as most dangerous — it changes the data model.) Authn/authz run
at the boundary as **root middleware, before the slice**; the slice receives an already-authenticated
principal. If resources are **user- or tenant-scoped**, the owner/tenant id is **part of the record
and part of every query's WHERE clause** — decide this *before* writing the slice, because it changes
the schema, the slice signature, and the tests. Secrets come from the config horizontal, never inline.
Default to deny: a slice with no explicit authorization rule is not shippable.

## Remaining slot notes (flesh out per concrete backend)

- **State / effects** → `[STATE-1]` `[STATE-2]`: slice-owned queries; transaction scoped to the
  request; `db` horizontal owns the pool and schema bootstrap. *(Spine-sufficient.)*
- **Observability** → `[OBS-1..3]`: structured logs + metrics + correlation/trace IDs via the injected
  logging horizontal; never on the response body. *(Spine-sufficient.)*
- **Contract versioning** → `[CONTRACT-2]`: pick a discipline (URL prefix `/v1` or a version header)
  and additive-change rules; document it before the first external consumer.
- **Testing** → `[TEST-1]`: HTTP-level/in-process tests against real or test-container infra; assert
  status + body + side effects + authz. *(Spine-sufficient.)*

## Open questions

- Cross-service composition is governed by `[SCOPE-4]` (published capabilities over an explicit
  boundary, never a shared datastore) — confirm the transport (sync API vs. event stream) per system.

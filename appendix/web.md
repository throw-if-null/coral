# Appendix: Web App

> Status: **complete** — every slot either carries a `WEB-` rule or is explicitly deferred to the spine.
> Read the spine first.

This appendix instantiates the [Coral app spine](../ARCHITECTURE.md) for web applications
(server-rendered or SPA + API). Where it serves an API, defer to [`backend.md`](./backend.md) for the API
layer and use this appendix for the UI-facing slices.

**Defining tension:** two things make web the hardest app type. First, the **trust boundary
(`[TRUST-*]`)** is first-class — untrusted input arrives over the network from end users, and the browser
is hostile. Second, **rich UI is inherently fan-in** — a dashboard or control panel composes many domains
onto one screen, and unlike data fan-in, UI fan-in must also cohere *visually*. The preferred shape
addresses both by keeping each piece a slice and treating the screen as a small system.

---

## Boundary & the frontend slice  → `[BOUND-1]`

**`[WEB-1]`** `[review]` A slice is **one route / page-action / endpoint**, and its **UI and its handler
live in the same slice**: a frontend slice owns its view, its local state, and the one capability call it
makes. Do not split a feature's UI from its logic into global `components/` and `services/` layers — that
is the `[BUCKET-1]` failure wearing frontend clothes.

## The microfrontend shape (preferred) — a dashboard is a small system  → `[COMPOSE-4]` `[ORCH-1]`

**`[WEB-2]`** `[guide]` Prefer building rich UI as **microfrontends**: each panel, widget, or view is a
frontend slice that owns its UI, its local state, and its single capability call, end to end. A control
panel or dashboard is therefore **read fan-in at the UI layer** (`[COMPOSE-4]`) — many slices on one
screen — not one god-component that knows every domain.

**`[WEB-3]`** `[review]` The **composition shell is the frontend's orchestration layer** (`[ORCH-1]` in the
browser): it owns **layout and routing — where panels sit — and contains no business logic**. It mounts
slices; it does not reach inside them. Adding or moving a panel is a shell change, not an edit to another
panel.

**`[WEB-4]`** `[auto]` Panel-to-panel communication follows the **channel** (`[CHAN-*]` in
[`SYSTEM.md`](../SYSTEM.md)): a published contract — a shared event stream, a typed props/contract
surface, or a thin client-side bus — **never one panel importing or reaching into another's internals**
(`[COMPOSE-1]`). Statically: no import edge between two panel directories.

**`[WEB-5]`** `[review]` Shared design tokens, primitives, and interaction patterns are a **crosscut**:
defined once as a design-system package, injected into every slice, never re-implemented or forked per
panel.

A control panel must look like *one* product, and visual cohesion is the cross-cutting concern that data
fan-in doesn't have — it is most of what makes UI fan-in genuinely harder than the read fan-in of
`[COMPOSE-4]`. It is also a textbook `[XCUT-1]`: cross-cutting, and carrying an invariant (one visual
language) that is a defect when it diverges.

**`[WEB-6]`** `[guide]` A **single integrated frontend is acceptable** where true microfrontends are
uneconomical, provided it still organizes internally by capability slice and consumes the design-system
crosscut.

This is the honest fallback, not a loophole: visual cohesion, bundle size, and performance make
microfrontends genuinely uneconomical often enough that pretending otherwise would make the appendix
useless, and the industry has no clean answer. Treat it as the reversible default and **flag the choice**
(`[AGENT-2]`) rather than letting "one big app" happen silently. What matters is that the structure —
capability slices, each owning its view, state, and one call — survives even when the deployment unit
collapses to one.

## Trust / security — the heaviest slot  → `[TRUST-1]` `[TRUST-2]`

**`[WEB-7]`** `[review]` Treat the **client as hostile**: never trust anything that arrives from the
browser.

Authentication and authorization run at the server boundary as **middleware before the slice**, so the
slice receives an already-authenticated principal. Validate every request payload, enforce CSRF and
session protections, and keep secrets server-side (`[CONFIG-4]`) — anything shipped to the browser is
public by definition.

If resources are **user- or tenant-scoped**, the owner/tenant id is **part of the record and part of every
query's WHERE clause** (as in `[BE-6]`) — decide before writing the slice; it changes schema, slice
signature, and tests. **Default to deny.**

## Idempotency & effects  → `[IDEM-1]`

**`[WEB-8]`** `[auto]` HTTP method semantics: `GET`/`HEAD` are safe and read-only (`[IDEM-2]` — a `GET`
handler must not mutate); `POST` is non-idempotent; `PUT`/`DELETE` are idempotent. The client owns retry;
never auto-retry a `POST` (`[IDEM-4]`). Offer an idempotency key where a user may double-submit.

## Error rendering  → `[ERR-3]`

**`[WEB-9]`** `[auto]` Slices raise the taxonomy; a root middleware renders — mapping `category` → HTTP
status (per `[BE-5]`) **and** to the right surface: a user-facing error view or page for navigations, a
structured `{category, code, message}` body for API and fetch calls. Slices never render their own HTTP
response; `code` strings stay slice-owned (`[ERR-2]`).

## Contract versioning  → `[CONTRACT-2]`

**`[WEB-10]`** `[review]` The UI's stable contract is its **route/URL structure**: never break a route, and
never silently repurpose one.

This is the slot where web differs most from every other app type, and it is worth being precise about why.
A route has **no version prefix and no deprecation path**. Users bookmark it, other sites link it,
search engines index it, and a customer's runbook cites it — and you cannot ask a bookmark to migrate. So
there is no `/v2` move available: the old path either works or breaks somebody you cannot contact.

Repurposing is the worse failure. Changing what a path *means* while keeping the path is `[CHAN-4]`'s
never-repurpose rule at the URL layer, and it is nastier here because nothing errors — every old link keeps
resolving and quietly shows the wrong thing.

Moving a route therefore requires a **redirect from the old path, kept indefinitely** unless you can
demonstrate nothing references it. Query parameters that change behaviour are part of the same contract.
Where the app also exposes an API, that half follows `[BE-7]`.

## Slots deferred to the spine

- **Observability** → `[OBS-1..3]`: structured logs + traces + correlation IDs via the injected logging
  crosscut; never leaked into the rendered page or API body.
- **Configuration** → `[CONFIG-1..4]`, with one addition: anything shipped to the browser is public by
  definition, so no secret may reach client config.

## State / effects  → `[STATE-1]` `[STATE-6]`

**`[WEB-11]`** `[review]` Server state is the source of truth. Client state is a **cache of it**, owned by
the slice that fetched it, and never the only place a fact exists.

This is `[STATE-6]` in the browser, and the browser makes it sharper: a hard refresh, a new tab, and a cold
load *are* the empty-cache case, and users generate them constantly. So every render path must be correct
with client state empty — that is not an edge case to handle later, it is the second-most-common way your
page loads.

**Invalidation is owned by the slice that caused the change.** A slice that mutates invalidates what it
changed, then publishes on the channel (`[WEB-4]`); other panels react and decide for themselves. No panel
reaches into another's cache, and the shell stays logic-free (`[WEB-3]`). That is what keeps you out of a
global store that every panel reads and writes — the `[BUCKET-1]` failure in frontend clothes, arrived at
one convenience at a time.

**Optimistic updates are a display concession, not a state change.** They are allowed, and the slice must
reconcile against the server's response and must surface the failure. An optimistic update that silently
diverges from the server is `[XCUT-4]` drift rendered directly into the user's face, which is worse than a
spinner.

**The one genuinely client-owned state is what has never been sent**: form drafts, scroll position,
expand/collapse, an in-progress selection. That belongs to its slice, needs no server round trip, and
should not be pushed through the channel.

## Testing mechanics  → `[TEST-1]` `[TEST-4]`

**`[WEB-12]`** `[review]` A web slice's behavior test drives it **through the surface a user or a caller
actually touches** — a route with a request, or a mounted panel with an interaction — and asserts the
observable contract: the status or rendered output, the capability call it made, and the side effect.

That rules three things out, and they are the three that web test suites are usually made of:

- **Component-internal state.** Asserting a hook's value or a store's contents tests the implementation,
  and it breaks on every refactor while passing on every logic bug.
- **Markup snapshots.** A snapshot asserts *shape*, not *behavior*: it fails on every redesign and succeeds
  on every wrong-total. It is not a behavior test and should not be counted as one.
- **Mocking the capability call the slice exists to make.** Stub at the **channel contract** (`[WEB-4]`) or
  the HTTP boundary, never the function the slice calls — otherwise the test passes when the contract changes.

Two additions are mandatory rather than optional. An **authorization test at the boundary**, because
`[WEB-7]` is this app type's heaviest slot and the one that regresses silently — nothing visibly breaks
when an authz check stops firing. And for microfrontends, a **contract test on the panel channel**
(`[SYS-TEST-1]`), so each panel is verified alone and you never need the whole shell up to know a panel
works.

Browser-driving end-to-end tests are the `[SYS-TEST-5]` backstop: a handful of critical journeys, kept
deliberately tiny. They are the most expensive tests you own and the first to become flaky, so they must
not be where your coverage lives.

## Open questions

- SPA + API split: which slices live client-side vs. server-side, and how the boundary is mirrored (the
  API half is governed by `backend.md`).
- Server-rendered vs. SPA vs. islands: how the composition shell (`[WEB-3]`) is realized per stack.

## Web slot summary

| Slot                | Web instantiation                                                        |
| ------------------- | ------------------------------------------------------------------------ |
| boundary            | a route/page-action/endpoint; UI + handler in one slice                  |
| preferred shape     | microfrontends; panels = slices; dashboard = UI read fan-in              |
| composition root    | the shell — owns layout/routing, no business logic                       |
| panel ↔ panel       | over the channel (`[CHAN-*]`), never internal reach                           |
| visual cohesion     | design-system crosscut, injected                                       |
| fallback            | one integrated frontend, still organized by capability slice; flag it    |
| trust / security    | client hostile; authz at the edge; tenant in the data model; deny by default |
| idempotency         | HTTP method semantics; client owns retry                                 |
| error rendering     | root maps category → status + error view/JSON                           |
| contract versioning | the route/URL structure; redirect, never repurpose (`[BE-7]` for the API half) |
| state / effects     | server is truth; client state is a slice-owned cache; the mutator invalidates |
| testing             | drive the real surface; no snapshots; authz test + contract-test the panel channel |

---

## Agent Execution Contract (web)

The complete normative checklist for this appendix: every `[auto]` and `[review]` rule defined above. It
**adds to** the spine's contract in [`ARCHITECTURE.md`](../ARCHITECTURE.md) rather than replacing it —
load both. Where the app also serves an API, [`backend.md`](./backend.md)'s contract applies to that half.
`[guide]` rules are rationale and live only in the prose.

<!-- coral:contract:start -->

- `[WEB-1]` A slice is one route/page-action/endpoint, with its UI and its handler in the same slice.
- `[WEB-3]` Keep the composition shell to layout and routing; it mounts slices and holds no business logic.
- `[WEB-4]` Panel-to-panel communication goes over a published channel; no import edge between panel directories.
- `[WEB-5]` Define design tokens, primitives, and interaction patterns once as an injected crosscut.
- `[WEB-7]` Treat the client as hostile: authorize at the server boundary, validate every payload, keep secrets server-side.
- `[WEB-8]` Follow HTTP method semantics: `GET`/`HEAD` safe and read-only, `POST` non-idempotent, `PUT`/`DELETE` idempotent.
- `[WEB-9]` Slices raise the taxonomy; a root middleware renders to the right surface — error view or structured body.
- `[WEB-10]` Treat the route/URL structure as the stable contract: never break a route, never silently repurpose one.
- `[WEB-11]` Server state is the source of truth; client state is a slice-owned cache, and the mutating slice invalidates it.
- `[WEB-12]` Drive a web slice's behavior test through the real surface: no internals, no snapshots, no mocking its capability call.

<!-- coral:contract:end -->

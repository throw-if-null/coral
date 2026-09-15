# Appendix: Web App

> Status: **complete**. Every slot either carries a `WEB-` rule or is explicitly deferred to the spine.
> Read the spine first.

This appendix instantiates the [Coral app spine](../ARCHITECTURE.md) for web applications
(server-rendered or SPA + API). Where it serves an API, defer to [`backend.md`](./backend.md) for the API
layer and use this appendix for the UI-facing slices.

**Defining tension:** two things make web the hardest app type. First, the **trust boundary
(`[TRUST-*]`)** is first-class. Untrusted input arrives over the network from end users, and the browser
is under the caller's control. Second, **rich UI is inherently fan-in**. A dashboard or control panel
composes many domains onto one screen, and unlike data fan-in, UI fan-in must also cohere *visually*.
Keeping each piece a slice addresses both. It does **not** follow that each piece needs its own
deployment (`[WEB-6]`, `[WEB-2]`).

---

## Boundary & the frontend slice  → `[BOUND-1]`

**`[WEB-1]`** `[review]` `{app:web}` A slice is **one route / page-action / endpoint**, and its **UI and
its handler live in the same slice**. A frontend slice owns its view, its local state, and the one
capability call it makes. Do not split a feature's UI from its logic into global `components/` and
`services/` layers. That is the `[BUCKET-1]` failure in frontend form.

## The shape of a rich UI — a dashboard is read fan-in  → `[COMPOSE-4]` `[ORCH-1]`

**`[WEB-2]`** `[guide]` `{app:web}` **Microfrontends are an escalation pattern, not the default.** Adopt
them when a concrete requirement forces runtime independence: independent deployment, independent team
ownership, runtime isolation, different frameworks or runtimes, or independently versioned product
surfaces. A feature-rich frontend is **not** one of those reasons.

This rule used to read the other way, as "prefer building rich UI as microfrontends". The reasoning that
produced that wording was sound, and the conclusion still did not follow. Rich UI *is* read fan-in
(`[COMPOSE-4]`), and a dashboard *should* be many slices rather than one god-component. Both of those are
about **structure**, and microfrontends are about **deployment**. Coral gets the structural property from
capability slicing alone (`[WEB-1]`, `[WEB-6]`). Paying an independent deployment unit per panel to
obtain it buys nothing. It costs a bundle boundary, a runtime protocol, and a version skew per panel.

Where the requirement is real, everything the earlier wording described applies:

- each panel is a slice owning its UI, its local state, and its capability call
- the screen is a small system
- the panel channel is contract-tested (`[WEB-4]`, `[SYS-TEST-1]`)

**`[WEB-3]`** `[review]` `{app:web}` The **composition shell is the frontend's orchestration layer**
(`[ORCH-1]` in the browser). It owns **layout and routing**, meaning where panels sit, and it **contains
no business logic**. It mounts slices, and it does not reach inside them. Adding or moving a panel is a
shell change, not an edit to another panel.

**`[WEB-4]`** `[auto]` `{app:web}` A frontend slice never reaches into another slice's internals
(`[COMPOSE-1]`), and depends only on a published surface. **Where runtime isolation is claimed**
(`[WEB-2]`), that surface must additionally be a **channel** (`[CHAN-*]` in
[`SYSTEM.md`](../SYSTEM.md)): an event stream, a typed contract surface, or a thin client-side bus.
Statically there is then **no import edge between panel directories at all**. In an integrated frontend
(`[WEB-6]`), a **typed import of another slice's published surface is permitted, and is preferred to a
bus**.

The earlier version of this rule lost that distinction. It banned import edges unconditionally, including
inside the integrated frontend `[WEB-6]` sanctions. The integrated case was therefore forced to
communicate through a runtime channel across a boundary that does not exist at runtime: one bundle, one
process, one deployment. That trade is a bad one in both directions. A typed import gives the compiler a
chance to catch a break, gives the reader a definition to jump to, and appears in a dependency graph. An
event bus in a single bundle gives none of those, and it adds an untyped indirection whose consumers
cannot be enumerated. Locality and discoverability are the properties this architecture optimizes for
(`[AGENT-1]`), and here the channel costs both.

What does **not** relax is `[COMPOSE-1]`. "Published surface" means an explicit, deliberate export, such
as a slice's index or barrel naming what it offers. It is never a deep path into another slice's
components, hooks, or store. Deleting a slice must break only its published surface's consumers. If a
deep import made that untrue, the boundary is gone whichever mechanism carried it.

**`[WEB-5]`** `[review]` `{app:web}` Shared design tokens, primitives, and interaction patterns are a
**crosscut**: defined once as a design-system package, injected into every slice, never re-implemented or
forked per panel.

A control panel must look like *one* product. Visual cohesion is the cross-cutting concern that data
fan-in does not have. It is most of what makes UI fan-in harder than the read fan-in of `[COMPOSE-4]`. It is also a clear `[XCUT-1]` case: cross-cutting, and carrying an invariant (one visual
language) that is a defect when it diverges.

**`[WEB-6]`** `[guide]` `{app:web}` **The default web architecture is a single integrated frontend
organized internally by capability slice**, consuming the design-system crosscut. One deployment unit,
one bundle, and structural slice boundaries.

This is the default because it is the reversible choice, and because it keeps every property Coral asks
for. Each slice still owns its view, its local state, and its one capability call (`[WEB-1]`). The shell
still holds only layout and routing (`[WEB-3]`). The design system is still an injected crosscut
(`[WEB-5]`). What it does not buy is independent deployment, and independent deployment is a requirement
to be *shown*, not a property to be assumed (`[WEB-2]`).

Going the other way is the expensive direction. Splitting an integrated frontend into microfrontends
later is a known refactor with a known cost. Collapsing five deployed panels back into one bundle means
unwinding a runtime protocol, five build pipelines, and whatever version skew they have accumulated.
Start where the reversal is cheap, and escalate when a named requirement appears.

## Trust / security — the heaviest slot  → `[TRUST-1]` `[TRUST-2]`

**`[WEB-7]`** `[review]` `{app:web}` Treat the **client as hostile**: never trust anything that arrives
from the browser.

Authentication and authorization run at the server boundary as **middleware before the slice**, so the
slice receives an already-authenticated principal. Validate every request payload, enforce CSRF and
session protections, and keep secrets server-side (`[CONFIG-4]`). Anything shipped to the browser is
public by definition.

If resources are **user- or tenant-scoped**, the owner/tenant id is **part of the record and part of
every query's WHERE clause**. `[BE-6]` states the same requirement. Decide before writing the slice,
because it changes the schema, the slice signature, and the tests. **Default to deny.**

## Idempotency & effects  → `[IDEM-1]`

**`[WEB-8]`** `[auto]` `{app:web}` HTTP method semantics apply. `GET` and `HEAD` are safe and read-only,
so a `GET` handler must not mutate (`[IDEM-2]`). `POST` is non-idempotent. `PUT` and `DELETE` are
idempotent. The client owns retry, and never auto-retries a `POST` (`[IDEM-4]`). Offer an idempotency key
where a user may double-submit.

## Error rendering  → `[ERR-1]`

**`[WEB-9]`** `[auto]` `{app:web}` Slices raise the app's declared error model (`[ERR-1]`), and a root
middleware renders it. The middleware maps **every** declared category to an HTTP status **and** selects
the right surface: a user-facing error view or page for navigations, and a structured body for API and
fetch calls. Slices never render their own HTTP response.

Two mappings, one owner. `[ERR-1]` asks for one declared error model and for presentation to be owned by
a boundary rather than by a slice; **the total category → HTTP-status mapping is this rule's realization
of that**, not something `[ERR-1]` states. A category the middleware has no status for is a gap in this profile's own requirement, and it
falls through to whatever a handler does next — which is the per-slice presentation `[ERR-1]` forbids.

The surface decision is this profile's own too, because a web app answers both navigations and fetches
from the same routes and only the boundary knows which it is looking at. `[BE-5]` states the recommended
category → status table for `[ERR-5]`'s default vocabulary, and a web app that renders HTTP can copy it;
it is a default worth copying, not a rule this profile depends on. Under the production baseline the
structured body is `{category, code, message}` and `code` strings stay slice-owned (`[ERR-2]`).

## Contract versioning  → `[CONTRACT-2]`

**`[WEB-10]`** `[review]` `{app:web}` The UI's stable contract is its **route/URL structure**: never break
a route, and never silently repurpose one.

This is the slot where web differs most from every other app type. A route has **no version prefix and
no deprecation path**. Users bookmark it, other sites link it, search engines index it, and a customer's
runbook cites it. A bookmark cannot be asked to migrate. There is therefore no `/v2` move available: the
old path either works, or it breaks somebody you cannot contact.

Repurposing is the worse failure. Changing what a path *means* while keeping the path is `[CHAN-4]`'s
never-repurpose rule at the URL layer. It is harder to detect here because nothing errors. Every old link
keeps resolving and shows the wrong thing.

Moving a route therefore requires a **redirect from the old path, kept indefinitely**, unless you can
demonstrate nothing references it. Query parameters that change behaviour are part of the same contract.
Where the app also exposes an API, that half follows `[BE-7]`.

## Slots deferred to the spine

- **Observability** → `[OBS-1..3]`: structured logs, traces, and correlation IDs via the injected
  logging crosscut. Never leaked into the rendered page or API body.
- **Configuration** → `[CONFIG-1..4]`, with one addition: anything shipped to the browser is public by
  definition, so no secret may reach client config.

## State / effects  → `[STATE-1]` `[STATE-6]`

**`[WEB-11]`** `[review]` `{app:web}` Server state is the source of truth. Client state is a **cache of
it**, owned by the slice that fetched it, and never the only place a fact exists.

This is `[STATE-6]` in the browser, and the browser makes it sharper. A hard refresh, a new tab, and a
cold load *are* the empty-cache case, and users generate them constantly. Every render path must
therefore be correct with client state empty. That is not an edge case to handle later. It is the
second-most-common way the page loads.

**Invalidation is owned by the slice that caused the change.** A slice that mutates invalidates what it
changed, then notifies. It notifies over the channel where panels are runtime-isolated, or by
invalidating the shared query cache by key in an integrated frontend (`[WEB-4]`). Other slices react and
decide for themselves. No panel reaches into another's cache, and the shell stays logic-free
(`[WEB-3]`). That is what prevents a global store that every panel reads and writes. Such a store is the
`[BUCKET-1]` failure in frontend form, arrived at one convenience at a time.

**Optimistic updates are a display concession, not a state change.** They are allowed. The slice must
reconcile against the server's response, and must surface the failure. An optimistic update that silently
diverges from the server is `[XCUT-4]` drift rendered into the user interface, which is worse than a
spinner.

**The one genuinely client-owned state is what has never been sent**: form drafts, scroll position,
expand/collapse, and an in-progress selection. That belongs to its slice. It needs no server round trip,
and should not be pushed through the channel.

## Testing mechanics  → `[TEST-1]` `[TEST-4]`

**`[WEB-12]`** `[review]` `{app:web}` A web slice's behavior test drives it **through the surface a user
or a caller touches**, which is a route with a request or a mounted panel with an interaction. It asserts
the observable contract: the status or rendered output, the capability call it made, and the side effect.

That rules three things out, and they are the three that web test suites are usually made of:

- **Component-internal state.** Asserting a hook's value or a store's contents tests the implementation.
  It breaks on every refactor, and passes on every logic bug.
- **Markup snapshots.** A snapshot asserts *shape*, not *behavior*. It fails on every redesign and
  succeeds on every wrong total. It is not a behavior test and should not be counted as one.
- **Mocking the capability call the slice exists to make.** Stub at the **channel contract** (`[WEB-4]`)
  or the HTTP boundary, never the function the slice calls. Stubbing the function makes the test pass
  when the contract changes.

Two additions are mandatory rather than optional. The first is an **authorization test at the boundary**,
because `[WEB-7]` is this app type's heaviest slot and the one that regresses silently. Nothing visibly
breaks when an authz check stops firing. The second, for microfrontends, is a **contract test on the
panel channel** (`[SYS-TEST-1]`). It verifies each panel alone, so the whole shell never has to be
running to know a panel works.

Browser-driving end-to-end tests are the `[SYS-TEST-5]` backstop: a handful of critical journeys, kept
deliberately tiny. They are the most expensive tests you own and the first to become flaky, so they must
not be where your coverage lives.

## Open questions

- SPA + API split: which slices live client-side and which server-side, and how the boundary is
  mirrored. `backend.md` governs the API half.
- Server-rendered, SPA, or islands: how the composition shell (`[WEB-3]`) is realized per stack.

## Web slot summary

| Slot                | Web instantiation                                                        |
| ------------------- | ------------------------------------------------------------------------ |
| boundary            | a route/page-action/endpoint, UI + handler in one slice                  |
| default shape       | one integrated frontend, organized by capability slice: dashboard = UI read fan-in |
| composition root    | the shell, owning layout and routing, with no business logic             |
| slice ↔ slice       | typed published surface, a channel where runtime-isolated, never internal reach |
| visual cohesion     | design-system crosscut, injected                                       |
| escalation          | microfrontends, when a named requirement forces runtime independence, flagged |
| trust / security    | client hostile, authz at the edge, tenant in the data model, deny by default |
| idempotency         | HTTP method semantics, client owns retry                                 |
| error rendering     | root maps every declared category → status + error view/JSON            |
| contract versioning | the route/URL structure: redirect, never repurpose (`[BE-7]` for the API half) |
| state / effects     | server is truth, client state is a slice-owned cache, the mutator invalidates |
| testing             | drive the real surface, no snapshots, authz test + contract-test the panel channel |

---

## Agent Execution Contract (web)

The complete normative checklist for this appendix: every `[auto]` and `[review]` rule defined above. It
**adds to** the app-scale contracts rather than replacing them. Load
[`ARCHITECTURE.md`](../ARCHITECTURE.md)'s contract, and [`PRODUCTION.md`](../PRODUCTION.md)'s if this
project adopts the production baseline. Where the app also serves an API,
[`backend.md`](./backend.md)'s contract applies to that half. `[guide]` rules are rationale and live only
in the prose.

<!-- coral:contract:start -->
<!-- coral:scope:app:web -->

- `[WEB-1]` A slice is one route/page-action/endpoint, with its UI and its handler in the same slice.
- `[WEB-3]` Keep the composition shell to layout and routing. It mounts slices and holds no business logic.
- `[WEB-4]` Depend only on another slice's published surface: a typed import when integrated, a channel with no import edge when runtime-isolated.
- `[WEB-5]` Define design tokens, primitives, and interaction patterns once as an injected crosscut.
- `[WEB-7]` Treat the client as hostile. Authorize at the server boundary, validate every payload, and keep secrets server-side.
- `[WEB-8]` Follow HTTP method semantics: `GET`/`HEAD` safe and read-only, `POST` non-idempotent, `PUT`/`DELETE` idempotent.
- `[WEB-9]` Slices raise the declared error model. A root middleware maps every category to a status and renders the right surface: an error view or a structured body.
- `[WEB-10]` Treat the route/URL structure as the stable contract: never break a route, never silently repurpose one.
- `[WEB-11]` Server state is the source of truth. Client state is a slice-owned cache, and the mutating slice invalidates it.
- `[WEB-12]` Drive a web slice's behavior test through the real surface. No internals, no snapshots, and no mocking its capability call.

<!-- coral:contract:end -->

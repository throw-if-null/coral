# Appendix: Web App  (PARTIAL — core slots filled)

> Status: partial. The web-specific slots — especially the microfrontend shape and the trust
> boundary — are written as `WEB-` rules; the rest remain slot notes. Read the spine first.

This appendix is one species of polyp. It instantiates the [Coral app spine](../ARCHITECTURE.md) for
web applications (server-rendered or SPA + API). Where it serves an API, defer to
[`backend.md`](./backend.md) for the API layer and use this appendix for the UI-facing slices.

**Defining tension:** two things make web the hardest app type. First, the **trust boundary
(`[TRUST-*]`)** is first-class — untrusted input arrives over the network from end users, and the
browser is hostile. Second, **rich UI is inherently fan-in** — a dashboard or control panel composes
many domains onto one screen, and unlike data fan-in, UI fan-in must also cohere *visually*. The
preferred shape addresses both by keeping each piece a polyp and treating the screen as a reef.

---

## Boundary & the frontend polyp  → `[BOUND-1]`

**`[WEB-1]`** A slice is **one route / page-action / endpoint**, and its **UI and its handler live in
the same slice** (a frontend polyp owns its view + local state + the one capability call it makes).
Do not split a feature's UI from its logic into global `components/` and `services/` layers — that is
the `[BUCKET-1]` failure wearing frontend clothes.

## The microfrontend shape (preferred) — a dashboard is a reef  → `[COMPOSE-4]` `[ORCH-1]`

**`[WEB-2]` (preferred shape)** Build rich UI as **microfrontends**: each panel / widget / view is a
**frontend polyp** that owns its UI, its local state, and its single capability call, end to end. A
control panel or dashboard is therefore **read fan-in at the UI layer** (`[COMPOSE-4]`) — many polyps
on one screen — not one god-component that knows every domain.

**`[WEB-3]`** The **composition shell is the frontend's orchestration layer** (`[ORCH-1]` in the
browser): it owns **layout and routing — where panels sit — and contains no business logic**. It
mounts polyps; it does not reach inside them. Adding or moving a panel is a shell (orchestration)
change, not an edit to another panel.

**`[WEB-4]` (the water, in the browser)** Panel-to-panel (frontend-to-frontend) communication follows
the **bus** (`[BUS-*]` in [`SYSTEM.md`](../SYSTEM.md)): a published contract — a shared event channel,
a typed props/contract surface, or a thin client-side bus — **never one panel importing or reaching
into another's internals** (`[COMPOSE-1]`). Panels are colonies sharing the water, not fused bodies.

**`[WEB-5]` (visual cohesion is a symbiont)** A control panel must look like *one* product. Shared
design tokens, primitives, and interaction patterns are a **horizontal — a hosted symbiont**
(`[XCUT-1]`): defined once (a design-system package), injected into every polyp, never re-implemented
or forked per panel. This is the cross-cutting concern that data fan-in doesn't have and that makes UI
fan-in genuinely harder.

**`[WEB-6]`** *(guidance — pragmatism prevails, the honest fallback)* When visual cohesion, bundle size,
or performance makes true microfrontends uneconomical (the known weak spot, with no perfect industry
answer), a **single integrated frontend is acceptable — provided it still organizes internally by
capability-polyp** (feature-sliced, each owning its view+state+call) and consumes the design-system
symbiont. Treat this as the reversible default, and **flag the choice** (`[AGENT-2]`) rather than
letting "one big app" happen silently. The structure (polyps + injected symbionts) survives even when
the deployment unit collapses to one.

## Trust / security  → `[TRUST-1]` `[TRUST-2]`

**`[WEB-7]` (the heaviest slot)** Treat the **client as hostile**: never trust anything from the
browser. AuthN/authZ run at the server boundary as **middleware before the slice**; the slice receives
an authenticated principal. Validate every request payload, enforce CSRF/session protections, and keep
secrets server-side. If resources are **user/tenant-scoped**, the owner/tenant id is **part of the
record and every query's WHERE clause** (as in `[BE-6]`) — decide before writing the slice; it changes
schema, slice signature, and tests. **Default to deny.**

## Idempotency & effects  → `[IDEM-1]`

**`[WEB-8]`** HTTP method semantics: `GET`/`HEAD` safe and read-only (`[IDEM-2]` — a GET handler must
not mutate); `POST` non-idempotent; `PUT`/`DELETE` idempotent. The client owns retry; never auto-retry
a `POST` (`[IDEM-4]`). Offer an idempotency key where a user may double-submit.

## Error rendering  → `[ERR-3]`

**`[WEB-9]`** Slices raise the taxonomy; a root middleware renders — mapping `category` → HTTP status
(per `[BE-5]`) **and** to the right surface: a user-facing **error view/page** for navigations, a
structured `{category, code, message}` **body** for API/fetch calls. Slices never render their own
HTTP response; `code` strings stay slice-owned (`[ERR-2]`).

## Remaining slot notes (flesh out per concrete web app)

- **Observability** → `[OBS-1..3]`: structured logs + traces + correlation IDs via the injected
  logging symbiont; never leaked into the rendered page or API body. *(Spine-sufficient.)*
- **Contract versioning** → `[CONTRACT-2]`: for an exposed API, follow `backend.md` (`/v1` or header).
  For the UI itself, the **stable surface is the route/URL structure** users and links depend on —
  treat URL shape as a contract; don't break or silently repurpose routes.
- **State / effects** → `[STATE-1]`: slice-owned data access; session/cookie handling at the edge.
  Client-side state stays local to its polyp; cross-panel shared state goes over the bus (`[WEB-4]`),
  not a global store reached into by every panel.
- **Testing** → `[TEST-1]`: request/interaction-level tests asserting status + rendered/JSON output +
  side effects, **plus authz tests at the boundary**; for microfrontends, **contract-test the
  panel-to-panel bus** (`[SYS-TEST-*]`) so panels are verified independently, never by raising the
  whole shell.

## Open questions

- SPA + API split: which slices live client-side vs. server-side, and how the boundary is mirrored
  (the API half is governed by `backend.md`).
- Server-rendered vs. SPA vs. islands: how the composition shell (`[WEB-3]`) is realized per stack.

## Web slot summary

| Slot                | Web instantiation                                                        |
| ------------------- | ------------------------------------------------------------------------ |
| boundary            | a route/page-action/endpoint; UI + handler in one slice (frontend polyp) |
| preferred shape     | microfrontends; panels = polyps; dashboard = UI read fan-in              |
| composition root    | the shell — owns layout/routing, no business logic                       |
| frontend ↔ frontend | over the bus (`[BUS-*]`), never internal reach                           |
| visual cohesion     | design-system symbiont (a horizontal), injected                          |
| fallback            | one integrated frontend, still organized by capability-polyp; flag it    |
| trust / security    | client hostile; authz at the edge; tenant in the data model; deny by default |
| idempotency         | HTTP method semantics; client owns retry                                 |
| error rendering     | root maps category → status + error view/JSON                            |
| testing             | request-level + authz + contract-test the panel bus                      |

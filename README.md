# Coral Architecture

A fractal, capability-first software architecture for a world where **agents write the code and
humans review and orchestrate**. It applies to CLIs, backends, web apps, libraries, and tools — and
composes the same way from a single slice up to a whole system.

**📖 Live docs:** https://gray-hill-09bb08b03.7.azurestaticapps.net

## The idea in one breath

The architecture is named for coral because coral is a *living fractal*: the same simple unit repeats
and accretes at every scale, under a few rules that don't change.

- A **polyp** = a *slice* (one capability, owned end to end).
- A **hosted symbiont** = a *horizontal* (a cross-cutting concern — logging, auth, a domain
  invariant — defined once and injected, never re-built per slice).
- A **colony** = an *app*; a **reef** = a *system*; they talk only through **the water** = a *bus*.

The same three rules hold at each scale: own your trigger end to end; share only via a named symbiont
or a published contract; interact only across the bus.

## The documents

Read them in this order:

1. **[`CONVENTIONS.md`](./CONVENTIONS.md)** — start here. The Coral model, the rule-ID scheme, the
   enforcement classes, and the agents-write / humans-review operating model.
2. **[`ARCHITECTURE.md`](./ARCHITECTURE.md)** — the app spine: how to build one app.
3. **[`SYSTEM.md`](./SYSTEM.md)** — the system spine: how apps compose over a bus.
4. **[`appendix/`](./appendix)** — one file per app type (CLI, backend, web, library, GitHub Action).

Rules carry stable IDs like `[DUP-2]` with an enforcement class (`[auto]` / `[review]` / `[guide]`);
on the live site every citation links to its definition.

## Run the docs locally

```bash
npm install
npm run docs:dev      # live preview at http://localhost:5173
npm run docs:build    # static site → .vitepress/dist
npm run docs:preview  # serve the built site
```

## Deployment

Pushing to `main` triggers the Azure Static Web Apps workflow
(`.github/workflows/azure-static-web-apps-*.yml`), which builds with `npm run build` and publishes
`.vitepress/dist`.

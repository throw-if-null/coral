# Appendix: Library / Package  (SCAFFOLD)

> Status: scaffold. Slots listed below; fill with prose when a library is built against this spine.

This appendix is one species of polyp. It instantiates the [Coral app spine](../ARCHITECTURE.md) for libraries and packages. Read the spine
first. Rule IDs here will use the `LIB-` family.

**Defining tension:** a library has **no composition root of its own — the consumer is the root
(`[ROOT-3]`)**. The library exposes capabilities and lets the consumer wire and inject. The public
API *is* the observable contract, governed by semver; backward compatibility is the dominant
pressure, which changes how aggressively you may refactor across versions.

## Slots to fill

- **Boundary** → `[BOUND-1]`: a public API function / entry point (one public capability = one slice).
- **Observable contract** → `[CONTRACT-1]`: return value + raised errors + types. This is the API
  surface consumers depend on.
- **Composition root** → `[ROOT-3]`: the *consumer* wires the library; the library accepts injected
  dependencies rather than reaching for globals (no hidden singletons, no ambient state).
- **State / effects** → `[STATE-1]`: prefer pure functions; push effects to consumer-provided
  interfaces (`[EFFECT-2]`). Many libraries have no persistent state at all.
- **Idempotency form** → `[IDEM-1]`: encode effect semantics in naming (`get`/`find` vs.
  `create`/`add` vs. `ensure`/`upsert`); document it.
- **Error rendering** → `[ERR-1]`: raise typed taxonomy errors; the library never renders — the
  consumer decides presentation. (`[ERR-3]` "root renders" = the consumer here.)
- **Observability** → `[OBS-1]`: accept an injected logger/hook; never write to stdout/stderr or
  install global handlers.
- **Trust / security** → `[TRUST-1]`: validate public inputs at the API boundary; document trust
  assumptions (the library trusts its caller unless stated).
- **Contract versioning** → `[CONTRACT-2]`: **semver** — public API changes follow major/minor/patch
  discipline; deprecate before removing.
- **Testing** → `[TEST-1]`: exercise the public API as a consumer would; assert return values, raised
  errors, and types; avoid testing internals.

## Open questions to resolve when authoring

- Internal (non-public) helpers: still per-slice, or a documented internal horizontal?
- How to expose horizontals to consumers (constructor injection vs. functional options).

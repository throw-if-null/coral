# Appendix: GitHub Action / Tool  (SCAFFOLD)

> Status: scaffold. Slots listed below; fill with prose when an Action/tool is built against this spine.

This appendix is one species of polyp. It instantiates the [Coral app spine](../ARCHITECTURE.md) for GitHub Actions and similar
trigger-driven tools (CI steps, webhooks, schedulers). Read the spine first. Rule IDs here will use
the `GHA-` family.

**Defining tension:** the platform delivers **at-least-once** — Actions get re-run, webhooks
redeliver, schedules retry. So **idempotency is mandatory (`[IDEM-5]`)**, not advisory: any mutating
run must dedupe (idempotency key, natural key, or check-before-write) because you do not control the
retry. The observable contract is the action's declared outputs + exit status + annotations.

## Slots to fill

- **Boundary** → `[BOUND-1]`: one action run / one trigger event (one invocation = one slice).
- **Observable contract** → `[CONTRACT-1]`: declared outputs + exit status + log annotations
  (e.g. `::error::`, `::notice::`). Outputs are the typed, stable surface downstream steps consume.
- **Composition root** → `[ROOT-1]`: the action entry point reads inputs/env, constructs/injects
  horizontals, dispatches to the slice, and renders the result.
- **State / effects** → `[STATE-1]`: effects are usually remote (API calls, repo mutations, artifact
  writes); keep them at the edge and slice-local.
- **Idempotency form** → `[IDEM-5]` **(mandatory)**: mutating runs must be safe under redelivery;
  prefer idempotency keys / check-before-write; never assume exactly-once.
- **Error rendering** → `[ERR-3]`: slices raise the taxonomy; the entry point maps `category` → exit
  status + annotation; fail the step on non-recoverable categories.
- **Observability** → `[OBS-1]`: log groups + annotations; never pollute declared outputs.
- **Trust / security** → `[TRUST-1]`: treat inputs and event payloads as untrusted; guard secret
  handling and token scope; validate before acting.
- **Contract versioning** → `[CONTRACT-2]`: input/output names are the versioned contract; follow
  the action's tag/version discipline; deprecate inputs before removing.
- **Testing** → `[TEST-1]`: exercise the entry point with simulated inputs/events against realistic
  fixtures; assert outputs, exit status, annotations, and **idempotency under a repeated run**.

## Open questions to resolve when authoring

- Composite vs. JS vs. container action — how the entry point and injection differ.
- Distinguishing recoverable (retry-safe) from non-recoverable failures for the platform's retry.

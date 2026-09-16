# Appendix: GitHub Action / Tool

This appendix instantiates the [Coral app spine](../ARCHITECTURE.md) for GitHub Actions and similar
trigger-driven tools (CI steps, webhook receivers, schedulers). Read the spine first. This appendix fills
the app-type-specific slots and adds Action-only rules in the `GHA-` family.

**Defining tension:** two platform facts dominate, and both are outside your control. First, delivery is
**at-least-once**. Actions get re-run by hand, webhooks redeliver, and schedules retry, so **idempotency
is mandatory (`[IDEM-5]`)**, not advisory. Second, the run is **privileged and the input is often
hostile**. Several trigger types hand you a write-scoped token *and* attacker-authored content in the same
payload. Most Action defects are one of those two facts being assumed away.

---

## Boundary  → `[BOUND-1]`

**`[GHA-1]`** `[review]` `{app:gh-action}` One action run is one slice: one trigger, handled end to end. An
action that does several unrelated things is several actions.

Where one distribution must cover several capabilities, dispatch on a declared `mode`-style input at the
entry point. Keep one slice per mode. That is the same shape as a CLI's subcommands
(`[BOUND-2]`).

## Observable contract  → `[CONTRACT-1]`

**`[GHA-2]`** `[review]` `{app:gh-action}` The contract is **declared outputs + exit status +
annotations**. Log text is not a contract.

This is the rule with the most day-to-day consequence. A downstream step must consume your **outputs**,
and never parse your log lines. Log format is a diagnostic surface you need to stay free to change
(`[OBS-1]`). Once a workflow greps it, you have acquired an undeclared contract that improving a message
will break.

**`[GHA-3]`** `[auto]` `{app:gh-action}` Every output the action writes is declared in `action.yml`, and
the action relies on no undeclared output.

This is statically decidable by comparing `GITHUB_OUTPUT` writes against the declared `outputs:` block,
in both directions. An undeclared write is invisible to consumers reading the manifest. A declared output
that is never written is a contract you are silently failing to honor.

## Composition root  → `[ROOT-1]`

**`[GHA-4]`** `[review]` `{app:gh-action}` The entry point is the root: it reads and validates inputs and
environment, constructs and injects crosscuts, dispatches to the slice, and renders the result. It holds no
business logic.

Inputs and environment are configuration (`[CONFIG-1]`, `[CONFIG-3]`). Resolve and validate every
required one *here*. Fail the step immediately with a clear annotation, rather than at first use three
minutes into the run.

## Idempotency form — mandatory  → `[IDEM-5]`

**`[GHA-5]`** `[review]` `{app:gh-action}` Every mutating run must be safe under redelivery, via an
idempotency key, a natural key, or check-before-write. Never assume exactly-once.

The platform re-runs on a human's click, on a transient failure, and on a schedule that overlapped. The
concrete failure shape is duplicate outward-facing effects: three identical PR comments, two release tags,
or a doubled deployment. The cause is an effect written as *create* rather than *ensure*. Prefer a natural key the platform already gives you over inventing one: the commit SHA, the PR number,
or the run's target ref. Name the operation for what it does (`[IDEM-1]`, `[IDEM-3]`).

Overlapping scheduled runs are the related failure. Guard with a concurrency group, or decline to start
while a run is in flight (`[BOUND-5]`, `[CONC-3]`).

## Trust / security — the heaviest slot  → `[TRUST-1]` `[TRUST-2]`

**`[GHA-6]`** `[review]` `{app:gh-action}` Treat the event payload as attacker-controlled, and never
interpolate it into a shell command or script body.

`pull_request_target`, `issue_comment`, and `workflow_run` execute with a **write-scoped token** against
content an outsider authored. Every field a stranger can type is an injection vector: PR title and body,
branch name, issue comment, and commit message. A `github.event.*` expression interpolated directly into a
`run:` block is a code-execution sink. The workflow expression is substituted into the script text
*before* the shell sees it. Pass untrusted values through the **environment**, as an `env:` entry the step
reads as `"$VAR"`, so they arrive as data rather than as code. Validate them before acting.

**`[GHA-7]`** `[review]` `{app:gh-action}` Declare `permissions:` explicitly and scope them to what the
run needs, defaulting to read-only.

The token's default scope is far wider than most actions require. An action that never states its permissions inherits the repository default. That default is not a
decision anyone made for this action. Secrets come from the config crosscut (`[CONFIG-4]`), are never echoed, and are never
written to an output. Every downstream step can read an output.

**`[GHA-8]`** `[guide]` `{app:gh-action}` Pin third-party actions you call by commit SHA, not by a moving
tag.

A moving tag is someone else's mutable code executing inside your privileged context. Pinning is the
difference between depending on a *version* and depending on whatever that account publishes next.

## Error rendering  → `[ERR-1]`

**`[GHA-9]`** `[review]` `{app:gh-action}` Slices raise the app's declared error model (`[ERR-1]`). The
entry point owns the whole mapping from declared category to exit status and annotation, and classifies
every category as **recoverable** or **non-recoverable**.

The distinction matters more here than for a CLI, because a human decides whether to press re-run. So the
taxonomy has to carry enough information for the entry point to decide recoverability centrally. Any
small, stable taxonomy can: what it cannot do is leave the decision to each slice, or leave a category
the entry point has no answer for.

With `[ERR-5]`'s default vocabulary the classification falls out directly. `infrastructure` is worth
retrying and should say so in its annotation. `usage` and `validation` fail identically on every re-run
and should say *that*, so nobody spends twenty minutes re-running a malformed input. A project on another
taxonomy states the same split over its own categories, in one place.

Use `::error::` for step-failing conditions and `::warning::` or `::notice::` for the rest. **Never fail
silently with exit 0.** A green step that did nothing is the worst outcome the platform allows.

## Observability  → `[OBS-1]`

**`[GHA-10]`** `[auto]` `{app:gh-action}` Diagnostics use log groups and annotations only, never the
outputs surface (`[OBS-3]`).

A run has no caller to return to, so say what it *did*: counts, ids touched, and whether it was a no-op
on redelivery (`[BOUND-5]`). "Skipped: already applied for SHA abc123" turns `[GHA-5]`'s idempotency from
a claim into something an operator can verify from the log.

## Contract versioning  → `[CONTRACT-2]`

**`[GHA-11]`** `[review]` `{app:gh-action}` Input and output names are the versioned contract: add freely,
never repurpose, deprecate before removing.

Follow the ecosystem's moving-major-tag discipline: `v1` advances to each compatible release, with
immutable `v1.2.3` tags underneath. Removing or renaming an input breaks every workflow that sets it, and
those workflows live in repositories you cannot see or fix. That makes the `[CHAN-4]` prohibition on
repurposing a name stricter here than almost anywhere else.

## Testing mechanics  → `[TEST-1]`

**`[GHA-12]`** `[review]` `{app:gh-action}` Exercise the entry point with simulated inputs and realistic
event-payload fixtures, asserting declared outputs, exit status, annotations, **and idempotency under a
repeated run**.

The repeated-run assertion is the one that is always missing and always matters. Invoke the slice twice
against the same state, and assert the second run is a no-op with the same outputs (`[TEST-4]`,
`[GHA-5]`). Keep a fixture for each hostile trigger type you support, with an injection-shaped string in the payload
fields. `[GHA-6]` is then covered by a test rather than by care.

---

## Action slot summary

| Slot                | Action instantiation                                                  |
| ------------------- | --------------------------------------------------------------------- |
| boundary            | one action run / one trigger event                                    |
| observable contract | declared outputs + exit status + annotations, **not** log text         |
| composition root    | entry point: read/validate inputs, inject, dispatch, render           |
| state / effects     | usually remote (API calls, repo mutations, artifacts), at the edge     |
| configuration       | inputs + env validated at the entry point, failing the step immediately |
| idempotency form    | **mandatory**, natural key preferred, overlap-guard scheduled runs     |
| error rendering     | category → exit status + annotation, recoverable or not, never exit 0  |
| observability       | log groups + annotations, report no-ops explicitly                    |
| trust / security    | payload is attacker-controlled, no interpolation into `run:`, least-privilege token, pin by SHA |
| contract versioning | input/output names, moving major tag, never repurpose                  |
| testing             | simulated inputs + hostile fixtures, assert a repeated run is a no-op  |

## Open questions

- Composite vs. JavaScript vs. container action: how the entry point and dependency injection differ, and
  whether a composite action can satisfy `[ROOT-1]` thinness at all.
- Reusable workflows compared with actions: a reusable workflow is closer to an orchestration layer
  (`[ORCH-1]`) than to a slice. Decide which rules follow it.

---

## Agent Execution Contract (GitHub Action)

The complete normative checklist for this appendix: every `[auto]` and `[review]` rule defined above. It
**adds to** the app-scale contracts rather than replacing them. Load
[`ARCHITECTURE.md`](../ARCHITECTURE.md)'s contract, and [`PRODUCTION.md`](../PRODUCTION.md)'s if this
project adopts the production baseline. `[guide]` rules are rationale and live only in the prose.

Two entries carry more weight than the rest, because both defend against a platform fact you do not
control. `[GHA-5]` covers at-least-once delivery. `[GHA-6]` covers a privileged run with an often-hostile
payload.

<!-- coral:contract:start -->
<!-- coral:scope:app:gh-action -->

- `[GHA-1]` One action run is one slice: one trigger, handled end to end.
- `[GHA-2]` The contract is declared outputs + exit status + annotations. Log text is not a contract.
- `[GHA-3]` Declare every output the action writes in `action.yml`, and rely on no undeclared output.
- `[GHA-4]` The entry point is the root: validate inputs and environment there, inject, dispatch, render. No business logic.
- `[GHA-5]` Make every mutating run safe under redelivery, via an idempotency key, a natural key, or check-before-write.
- `[GHA-6]` Treat the event payload as attacker-controlled. Pass untrusted values through `env:`, never into a `run:` body.
- `[GHA-7]` Declare `permissions:` explicitly and scope them to the run, default to read-only, and never write a secret to an output.
- `[GHA-9]` Map every declared category → exit status and annotation at the entry point, classify each as recoverable or not, never exit `0` on failure.
- `[GHA-10]` Keep diagnostics in log groups and annotations, never on the outputs surface. Report no-ops explicitly.
- `[GHA-11]` Treat input and output names as the versioned contract: add freely, never repurpose, deprecate before removing.
- `[GHA-12]` Exercise the entry point with simulated inputs and hostile payload fixtures, and assert a repeated run is a no-op.

<!-- coral:contract:end -->

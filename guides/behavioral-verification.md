# Behavioral verification

> **This document is a protocol. It defines no rule.** Every requirement in it is a citation of a Coral
> rule, listed in the [rule index](../rules.md), or a procedure for applying one. A project adopts rules
> through its `CORAL.md` ([`CONVENTIONS.md`](../CONVENTIONS.md#what-applies-to-a-project)). It does not
> adopt this document. A project that follows this protocol says so in its agent instructions file, as
> the README's "Start a project" step shows.

## Purpose

The code may be replaced. The required behavior and the engineering quality must survive. A feature
must be reimplementable behind the same contract, or behind a contract a human deliberately revised.

This protocol states how a project records required behavior so that this holds:

- the **format** of an acceptance criterion, with one example for the backend profile
- the **coverage checklist**, and when each item applies
- the **change process** for expected behavior
- the **relationship** between acceptance tests and the slice's other tests
- the **replacement check**

## The rules this protocol rests on

Read these rules first. The protocol applies them. It does not restate them, and it does not extend
them.

| Rule | Defined in | What it fixes |
|---|---|---|
| `[TEST-1]` | `ARCHITECTURE.md`, kernel | Testing is behavior-first: exercise the slice's entry point, assert its observable contract, use real or realistic temporary infrastructure, and minimize mocking. |
| `[TEST-2]` | `PRODUCTION.md`, baseline | Prefer integration and end-to-end tests over isolated unit tests. |
| `[TEST-3]` | `PRODUCTION.md`, baseline | Unit tests are a scalpel, not a default. |
| `[TEST-4]` | `PRODUCTION.md`, baseline | Behavior tests validate, where relevant, the observable contract, error rendering and codes, idempotency semantics, transactional behavior, authorization at the boundary, and diagnostic behavior. |
| `[ERR-1]` | `ARCHITECTURE.md`, kernel | One small, stable, structured error model per app or published package. Presentation belongs to a boundary, never to a slice. |
| `[ERR-2]` | `PRODUCTION.md`, baseline | A slice raises only through the error model declared for its own app or published package. The baseline shape is `{category, code, message}`. |

This protocol is written for the canonical configuration in `templates/CORAL.md`: `scales: [app]`,
`production-baseline: true`, `app-profile: [backend]`. The baseline rules in the table bind a project
that has adopted the baseline (`[VER-6]`). A kernel-only project is bound by `[TEST-1]` and `[ERR-1]`
alone. The format, the change process, and the replacement check still apply to it, with the boundary
and the error shape its own appendix and error model define. System scale is not in the canonical
configuration, so no system-scale testing rule is cited here.

## Terms

This document uses the vocabulary of [`CONVENTIONS.md`](../CONVENTIONS.md#the-vocabulary) and adds
five terms. None of them is a rule.

- **Boundary**: the place where a trigger enters a slice and where the outcome is observed. It is the
  observable contract the app type fixes in `[BOUND-1]`'s table and in its appendix (`[BOUND-3]`). For a
  backend it is status code, response body, and observable side effects (`[BE-2]`).
- **Acceptance criterion**: one statement of required behavior in the format below: one trigger, one
  outcome, at one boundary.
- **Acceptance test**: a behavior test, in the slice's own tests, that asserts exactly one acceptance
  criterion and cites it by name.
- **Expected behavior**: the set of acceptance criteria of a feature. A change to it is a contract
  change and follows the change process below.
- **Feature**: the unit the replacement check applies to. It is one slice (`[BOUND-2]`), or the slices
  of one capability when they share state (`[STATE-5]`).

## The acceptance criterion format

A feature has one header and one or more criteria. The header states what every criterion of the
feature shares. A criterion states one behavior.

| Part | Required | Content |
|---|---|---|
| **Feature** | yes | The slice or capability, by its name in the repository. |
| **Boundary** | yes | The entry point, and the contract form the app type fixes for it. |
| **Assumes** | no | Project decisions the outcomes depend on: the error taxonomy, the status map, the versioning strategy. |
| **Criterion** | yes | A short stable name. The acceptance test cites it. |
| **Given** | no | The observable state before the trigger: the result of earlier triggers, or fixture data stated as a caller could observe it. |
| **When** | yes | **One** trigger with its inputs: one request, command, message, scheduled tick, or call. |
| **Then** | yes | **One** outcome: what the boundary returns, and the state a caller can observe afterwards through a published surface. |

Six constraints apply to every criterion.

1. **One trigger.** When a behavior needs two triggers to state, put the first in Given, or write two
   criteria.
2. **One outcome.** An outcome may have several observable parts: a status, named body fields, a side
   effect. All of them are observed from outside the app. When the outcome depends on which branch the
   trigger takes, write one criterion per branch.
3. **At a boundary a user or a caller can see.** The trigger enters where the app type's observable
   contract is. For a backend that is the route (`[BE-1]`), and the outcome is status, body, and side
   effects (`[BE-2]`). A criterion never enters below the boundary.
4. **Independent of the implementation.** A criterion names no function, module, class, file, table,
   column, query, framework, or internal state. A side effect is observed through a published surface:
   a later trigger of the same app, an emitted event, or an output the contract names. When no
   published surface shows the effect, the criterion states the effect in domain terms, and the
   acceptance test observes it at the storage the feature owns. That observation is the one place an
   acceptance test touches the implementation. An edit to it is an edit to the test, and the change
   process applies.
5. **The expected outcome, not the current one.** The outcome is what the contract promises. A criterion
   copied from what the code does today records the implementation. When the two differ, a human
   decides which is required, under the change process.
6. **Errors in their rendered form.** An error outcome states the `category` and `code` of the declared
   error model (`[ERR-2]`) and, for a backend, the status the root maps that category to (`[BE-5]`). It
   never states the raised type or the raising function (`[ERR-1]`). `message` is asserted as present
   and non-empty unless the contract fixes its text.

Criteria are versioned with the code they describe, in the same repository, so a criterion and its
test can land in one change. The protocol does not fix the file. A project may keep a criterion in the
acceptance test itself, as the test's name and description, or in a document beside the slice.

### One example, for the backend profile

The feature is `expense/create` from [`appendix/backend.md`](../appendix/backend.md). The slice is the
business operation; `POST /expenses` is its trigger (`[BE-1]`).

```text
Feature:    expense/create
Boundary:   HTTP. POST /expenses, called by an authenticated principal.
            Contract: status code + response body + observable side effects.
Assumes:    the recommended taxonomy and status map, so `validation` renders as 400.

Criterion:  create-returns-created-expense
  Given:    GET /expenses by the principal returns an empty list.
  When:     POST /expenses with body {"amount": 1250, "currency": "EUR", "month": "2026-03"}.
  Then:     status 201, and the body carries an `id`. GET /expenses/{id} by the same principal
            returns 200 with amount 1250, currency "EUR", and month "2026-03".

Criterion:  create-rejects-invalid-month
  Given:    GET /expenses by the principal returns an empty list.
  When:     POST /expenses with body {"amount": 1250, "currency": "EUR", "month": "2026-13"}.
  Then:     status 400, and the body is {category: "validation", code: "invalid_month",
            message: <non-empty>}. GET /expenses by the same principal still returns an empty list.
```

What the example does not say is the point. It names no handler, no validator, no table, and no ORM.
It does not say that the slice returns `400`, because the slice does not choose a status: the root
maps `validation` to `400` (`[BE-5]`), and the criterion states the mapped result. The same two
criteria hold for a second implementation in another language or framework, and the acceptance tests
that assert them pass against it unchanged.

## The coverage checklist

Walk the checklist once when a feature's criteria are written, and again when its contract changes.
Each item states when it applies. An item that does not apply yields no criterion. Do not write a
criterion to fill an item.

### 1. Business invariants

**Applies:** always. Every feature has at least one.

**What it is:** a property of the domain that holds after the trigger, stated as an outcome at the
boundary. A created record is readable. A deleted record is gone, and a read of it is a miss. A total
equals the sum of its parts.

**The criterion states** the trigger and its observable consequence. Where the contract fixes a limit
value, the value on each side of the limit is a criterion. This item is the observable contract of
`[TEST-1]` and `[TEST-4]`.

### 2. Error behavior through the declared error model

**Applies:** always. `[ERR-1]` binds every app and published package.

**What it is:** every failure the contract promises, rendered at the boundary.

**The criterion states** the trigger that provokes the failure, and the rendered form: `category` and
`code` from the declared error model (`[ERR-2]`), rendered by the root and by nothing else
(`[ERR-3]`), and for a backend the status the root maps the category to (`[BE-5]`). The body carries
no diagnostic output (`[OBS-3]`). A batch or bulk trigger has a criterion for the failure of one item:
all-or-nothing, or the explicit partial report the contract promises (`[ERR-4]`). `401` and `403` are
not rendered through the error model (`[BE-8]`); they are item 7, with the scoped-miss `404`.

### 3. Compatibility of published surfaces

**Applies:** when the feature has a published contract (`[CONTRACT-1]`): an HTTP shape, a
machine-readable output, a library public API, or an emitted event. For a backend, every route is one.

**What it is:** the shape a caller depends on, and its stability across changes.

**The criterion states** the fields and types the caller depends on. The acceptance test asserts that
the named fields are present with the stated types. It does not assert the absence of unnamed fields,
unless the contract says the shape is closed. Adding a field passes. Removing or repurposing a field
fails, and is a contract change under the app type's versioning discipline (`[CONTRACT-2]`, `[BE-7]`).
A new contract version is a change of expected behavior. The criteria of the previous version stay,
and stay tested, until its stated support window ends.

### 4. Persistence and data migration

**Applies:** when the feature owns state (`[STATE-5]`): it writes a table, a file, or a bucket.

**What it is:** data written by one trigger survives the process, and survives a schema change.

**The criterion states**, for persistence, that what one trigger writes is observable through a later
trigger after the process has restarted, not only inside one process or one transaction. The
acceptance test runs against real or realistic temporary storage (`[TEST-1]`), never a mock of the
store. For a data migration, the criterion applies when a schema change lands. Given data written
under the previous schema, by the previous version's triggers or by an equivalent fixture, and the
migration run, the current read trigger returns that data under the current contract. The criterion
names neither the migration nor the schema; the `db` crosscut runs the migration and the owning
package defines it (`[STATE-5]`). Where the contract promises atomicity, a criterion states the
observable result of a failure part-way through the trigger: no partial state is visible through any
read trigger (`[CONC-4]`, `[ERR-4]`). This is the transactional behavior `[TEST-4]` names. If the
failure cannot be provoked at the boundary, the test for it is one of the cases `[TEST-3]` admits a
unit test for, and it is not an acceptance test.

### 5. Performance budgets

**Applies:** only when the contract states a budget: a latency, a size, or a volume a caller depends
on. Coral has no performance rule. A budget is a project decision, recorded with the contract. A
budget nobody wrote down yields no criterion. Do not invent one.

**What it is:** a limit the caller can observe at the boundary.

**The criterion states** the trigger, the load under which the limit holds (data volume, concurrent
callers), the limit, and the environment the limit is measured in. A limit without a load and an
environment is not a criterion. The acceptance test measures at the boundary, under the stated load,
with real or realistic infrastructure (`[TEST-1]`). It runs where the stated environment holds, which
may be outside the default test run.

### 6. Concurrency

**Applies:** when two triggers can write the same state (`[CONC-3]`); when a scheduled or background
trigger can overlap its own previous run (`[BOUND-5]`); when the platform redelivers the trigger
(`[IDEM-5]`); or when a mutation offers an idempotency key (`[BE-4]`).

**What it is:** the single outcome the contract promises when triggers interleave or repeat.

**The criterion states** the interleaving or the repetition as the When, and the single outcome as the
Then. For redelivery and idempotency keys: two deliveries of the same trigger, concurrent or in
sequence, leave exactly one effect, and both responses carry the same result. For two writers to one
record: the outcome the named strategy promises. Serialize means both writes are applied, in some
order. Compare-and-set means the second writer receives the conflict category, `409` under the
recommended status map. Commutative means the combined result is observable. For an overlapping
background run: one run's effect, or the second run declines to start, and the decline is observable
(`[BOUND-5]`). These are the idempotency semantics `[TEST-4]` names.

### 7. Security boundaries

**Applies:** to every app whose trust boundary is more than "the caller is trusted" (`[TRUST-1]`,
`[TRUST-2]`). For a backend it always applies (`[BE-6]`). A minimal trust boundary that is written down
yields no criterion beyond validation of input at the public surface.

**What it is:** who may trigger the feature, what they may see, and what happens before any effect.

**The criterion states**, for a backend: an unauthenticated call returns `401` and has no effect; an
authenticated call without the capability returns `403` and has no effect; and neither of those bodies
carries a slice-owned `code` (`[BE-8]`). A call for a resource of another owner or tenant returns `404`
with a body equal to the body of a genuine miss: the missing-resource category and the slice's `code`,
raised through the error model and rendered by the root (`[BE-5]`, `[BE-8]`). Malformed input is
rejected before any effect is observable (`[TRUST-1]`), which is item 2 stated with the effect in the
Then. This is the authorization at the boundary `[TEST-4]` names.

## Changing expected behavior

Expected behavior changes when a criterion is added, revised, or removed. Each is a contract change,
and the process is the same.

1. **An agent proposes.** The proposal holds both halves together: the criterion text, and the test
   diff that asserts it. Neither half is proposed alone. The proposal names the criteria that change
   and states why.
2. **A human approves.** Until approval, the current criteria and acceptance tests remain the
   reference. The agent does not merge, skip, or alter the test in the meantime. This is the division
   of labour `[AGENT-4]` fixes for exceptions, applied to the project's own contract: the agent proposes
   the wording, and a human decides.
3. **Both halves land in one change.** The criterion text and the test change are one commit or one
   pull request. A test change without its criterion, or a criterion change without its test, is
   incomplete and is not merged.

A new feature's criteria are proposed with the feature and approved in its review. The process is the
same, applied for the first time.

**An agent must not weaken an acceptance test to make an implementation pass.** Weakening includes:
deleting or skipping a test; marking it as expected to fail; loosening an assertion, for example from an
exact value to "contains", from a value to "any value", or from a status to "any `4xx`"; widening a
tolerance; changing the Given so the failing path is no longer reached; replacing real infrastructure
with a mock that returns the expected value; and asserting at a point inside the implementation
instead of at the boundary.

When an implementation does not pass an acceptance test, the agent has two moves: fix the
implementation, or propose a change to expected behavior under this process and report the failing
criterion by name (`[AGENT-2]`). There is no third move.

An approved change to a criterion is a deliberate revision of the contract. When the criterion belongs
to a published surface, the change also follows the app type's versioning discipline (`[CONTRACT-2]`).

## Acceptance tests and the slice's other tests

Acceptance tests are behavior tests under `[TEST-1]`. They live in the slice's own tests, with its
other tests. Under the baseline that is beside the code (`[STRUCT-1]`). Nothing distinguishes an
acceptance test from another behavior test except its purpose: it asserts one criterion, and it cites
the criterion's name.

The slice's other tests remain the slice's own:

- integration tests that exercise a path the criteria do not enumerate, or exercise several slices
  together (`[TEST-2]`)
- unit tests, where `[TEST-3]` admits one: complex branching, pure calculations with many input
  combinations, edge cases that are impractical to set up at the boundary

These tests are not part of expected behavior. They may be rewritten, replaced, or deleted together
with the implementation they test. The change process does not apply to them, and they do not decide
the replacement check. A reviewer still holds them to `[TEST-2]` and `[TEST-3]`.

The protocol prescribes no test framework, no directory layout, no fixture library, and no boilerplate.
It prescribes no naming scheme beyond citing the criterion's name. The cited rules fix everything the
protocol requires about where and how tests are written: behavior-first at the entry point with real or
realistic infrastructure (`[TEST-1]`), beside the code (`[STRUCT-1]`), integration over unit
(`[TEST-2]`), unit only as a scalpel (`[TEST-3]`), and asserting the surfaces `[TEST-4]` lists. The
project's language and framework decide the rest.

## The replacement check

A feature is replaceable when its acceptance tests pass against the new implementation without
edits, or with edits that a human approved under the change process.

1. **Fix the reference.** The criteria and acceptance tests at the version being replaced are the
   reference. They do not change while the replacement is written, except through the change process.
2. **Write the replacement.** Its unit and integration tests are new. The old ones go with the old
   implementation.
3. **Run the reference acceptance tests, unedited, against the replacement** at the same boundary.
4. **Classify each failure.** A failing test is one of two things: a defect in the replacement, which
   is fixed, or a deliberate revision of the contract, which is proposed under the change process with
   the criterion text and the test diff, and which a human approves or rejects. There is no third
   classification.
5. **Pass.** The check passes when every acceptance test passes, and every edit to a criterion or an
   acceptance test carries a human approval. The change description names the criteria that changed,
   so the revision is visible in history.

The check proves that the replacement satisfies every recorded criterion. It does not prove that the
criteria are complete. A behavior with no criterion is not protected. The coverage checklist exists to
find that gap: walk it before a replacement, and add the missing criteria through the change process
first.

The check does not verify conformance to Coral's rules. Conformance is verified separately, by review
and by behavior tests ([`ARCHITECTURE.md`](../ARCHITECTURE.md#enforcement-drift-control)), and a rule
binds whether or not a test verifies it
([`CONVENTIONS.md`](../CONVENTIONS.md#rules-and-verification)).

Replacing the error model, or the shape of a published surface, is not a replacement of a feature. It
is a contract change. It goes through the change process and the app type's versioning discipline
(`[CONTRACT-2]`).

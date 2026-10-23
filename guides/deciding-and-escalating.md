# Deciding and escalating

This document is a protocol. It defines no rule. It cites rules that
[`CONVENTIONS.md`](/CONVENTIONS#the-operating-model-agents-write-humans-review-agent) defines, `[AGENT-1]`
to `[AGENT-5]`, and the exception and extension format of the project's
[`CORAL.md`](/CONVENTIONS#coral-md-—-the-project-s-adherence-record). Where this document and a rule
differ, the rule holds. `[AGENT-1]` and `[AGENT-3]` are `[guide]` rules, so the generated contract omits
them. `[AGENT-5]` is a framework-governance rule: it binds how the project relates to Coral, not its
source, so the contract omits it from its rule list and states that it still instructs the agent. This
document is where an agent meets all three.

An agent that implements against Coral makes decisions continuously. Most are its own to make. Some need
verification before it decides. Some belong to a human. This document gives:

- the test that sorts a decision into one of three classes
- what the agent reads before it asks
- the record an agent writes when it asks
- where a human decision is recorded, so a later session does not reopen it
- the classification a review applies to each escalation afterwards

## The three decision classes

| Class | Test | What the agent does |
|---|---|---|
| **Agent-owned** | All of: local to one slice, reversible by reverting the commit, covered by the slice's behavior tests | Decides. Records nothing beyond the commit. |
| **Constrained** | Touches a boundary, a published surface, a declared invariant, or an error model | Verifies against the contract and the behavior tests. Decides if they permit it. Otherwise asks. |
| **Human-owned** | Consequential, disputed, or irreversible | Asks. |

A decision is agent-owned only if every item of its test holds. A decision that fails one item moves to
the next class. Apply the test to the change as implemented, not as planned: a diff that grew past one
slice while it was written is classified again. A structure that minimizes placement decisions
(`[AGENT-1]`) leaves fewer decisions to classify.

### Agent-owned

Every item holds:

- **Local.** The change is inside one slice. No other slice, crosscut, adapter, or root changes with it.
- **Reversible.** Reverting the commit restores the previous behavior. Nothing outside the repository has
  observed the change: no data written in a new shape, no message published, no contract shipped.
- **Covered.** The slice's behavior tests exercise the changed behavior through the entry point
  (`[TEST-1]`). A change the tests do not observe is not covered.

Examples: the order of checks inside a handler, a local name, a split of one slice file into two
(`[GROW-2]`), a test added for the slice's own contract. The agent decides. The commit is the record, and
a reviewer reads the diff.

A decision that presents as agent-owned can fail the test on inspection. A constant one slice reads can be
a value the API description publishes. A removed function can be part of a package's public surface. The
test is applied to what the code is, not to where it sits.

### Constrained

The decision touches one of:

- a **boundary**: what a trigger accepts, what it returns, or the authorization it applies at the edge
  (`[TRUST-1]`)
- a **published surface**: a published capability another slice depends on (`[COMPOSE-1]`), a public
  contract (`[CONTRACT-1]`), or a channel contract between apps (`[CHAN-1]`)
- a **declared invariant**: a crosscut's must-not-diverge property (`[XCUT-1]`), a state owner
  (`[STATE-5]`), or an extension declared in `CORAL.md`
- an **error model**: the app's declared categories, their construction, or their presentation (`[ERR-1]`)

The agent verifies before it decides, in this order:

1. `CORAL-CONTRACT.md`: the applicable rules, and the project's accepted exceptions and extensions.
2. The contract of the surface touched: the API description, the schema, the published capability's
   signature, or the channel contract.
3. The behavior tests of every slice that exercises the surface.

If all three permit the change, the agent decides, and the commit message names what it verified. If
they permit it and the choice between permitted options is still ambiguous, `[AGENT-2]` applies. If a
rule's letter and its intent diverge on the case at hand, `[AGENT-3]` applies, and it also ends in
`[AGENT-2]`. If any of the three forbids the change, or is silent on it and the change would alter what
a caller can observe, the decision is human-owned.

### Human-owned

Any one of these holds:

- **Consequential.** The decision changes what a caller, an operator, or another app can rely on: a new
  or changed published contract, a new dependency, or a change to a security boundary or to the trust
  boundary (`[TRUST-2]`).
- **Disputed.** The sources disagree: the contract permits what a test forbids, or two rules point in
  different directions. Two Coral rules that contradict each other are a defect in Coral, filed upstream
  as an [amendment](/CONVENTIONS#three-kinds-of-divergence) and not resolved locally.
- **Irreversible.** Reverting the commit does not restore the previous state: a data migration, a message
  published on a channel, a release.
- **A rule deviation.** An exception or an extension. `[AGENT-4]` reserves both for a human.

The agent asks. Work that does not depend on the answer continues. Work that does depend on it waits.

## Settled decisions

Before it asks, an agent reads what the project has already decided. `[AGENT-5]` requires `CORAL.md`.
This protocol adds the decision log. A recorded decision is settled: the agent applies it, cites the entry
in the commit message, and does not ask again. An escalation whose answer was recorded is classified
avoidable in review.

Read, in order:

1. `CORAL-CONTRACT.md`. The exceptions and extensions it carries are the ones in force.
2. `CORAL.md`. The prose below the block holds the trade-off behind each entry and its `revisit when`
   condition. A met condition is a reason to ask. An unmet one is not.
3. The decision log.
4. The behavior tests. A test that asserts the behavior in question records a decision somebody made.

## The escalation record

When it asks, the agent writes one record per decision, on the surface where the project reviews: the
pull request, the task, or the session. A `REVIEW:` note per `[AGENT-2]` points to the record. It does not
replace it.

| Field | Content |
|---|---|
| **Needs deciding** | One question, answerable in a sentence. The class, and the test item that put the decision there. |
| **Options** | Each option the agent sees, with its consequence for the surface, the tests, and reversibility. "Do nothing" is an option. |
| **Verified** | What the agent read and ran before asking: the contract entries, the `CORAL.md` entries, the decision-log entries, and the tests, each with its result. An empty field marks the escalation avoidable until shown otherwise. |
| **Recommendation** | The one option the agent would take, and why. |

A reviewer answers by naming an option, and records the answer as the next section says.

## Where a human decision is recorded

| Decision | Record | Who writes it |
|---|---|---|
| A rule deviation: a Coral rule knowingly broken in one subtree, or a local rule Coral does not have | An exception or extension entry in `CORAL.md`, in the format `[VER-5]` fixes, with the trade-off in the prose below the block | A human (`[AGENT-4]`) |
| A product or architecture decision no rule covers | The project decision log | A human. An agent may draft the entry when asked. |
| A Coral rule that is wrong or too narrow | An amendment upstream, [not a project record](/CONVENTIONS#three-kinds-of-divergence) | A human on the project opens it |

### The project decision log

One file in the project root. `DECISIONS.md` is the default name. When the file is elsewhere, the agent
instructions file names it, so an agent loads it with `CORAL.md`. The log is append-only, one entry per
decision. A reversed decision gets a new entry that names the one it supersedes.

| Field | Content |
|---|---|
| **Date** | When it was decided. |
| **Decision** | What was decided, stated so an agent can apply it without the discussion. |
| **Reason** | Why this option, and what was rejected. |
| **Decided by** | The person. A later session needs someone to ask. |
| **Revisit when** | The condition under which the decision is reopened. A condition, not a date, as for a `CORAL.md` exception. |

Example entry:

| Date | Decision | Reason | Decided by | Revisit when |
|---|---|---|---|---|
| 2026-10-20 | HTTP calls to providers use the standard library client. No third-party HTTP client. | One client to configure for timeouts and tracing. No provider needs more. | J. Doe | A provider requires a protocol the standard client does not speak. |

## Worked examples

Three per class: a warranted escalation, an avoidable escalation, and a silent decision that should have
been escalated. Each example is filed under the class the decision presented as; where the test moves it
to another class, the example says so.

### Agent-owned

- **Warranted.** A bug fix in a list slice moves the default page size from 50 to 100. One constant, one
  slice, one commit to revert. On inspection, the slice's behavior test asserts the default and the API
  description publishes it, so the decision touches a published surface and is constrained. The
  description does not permit a change it does not make. The agent asks. Warranted: the decision
  presented as agent-owned and failed the test.
- **Avoidable.** Two slices each parse the same date format in a private function. The agent asks whether
  to extract it. `CORAL-CONTRACT.md` carries `[DUP-2]` and `[DUP-4]`: do not extract on similarity
  alone, and apply the Extraction Test. The test answers no: no invariant, no named infrastructure, no
  calculation to clarify. The copies stay. The answer was in the contract.
- **Missed.** While fixing a slice's input parser, the agent widens the accepted format: a date field now
  also accepts a timestamp. The parser is local and the tests pass. What a trigger accepts is its
  boundary, and a caller can start depending on the wider input, so the decision was constrained. The
  agent neither verified against the API description nor asked.

### Constrained

- **Warranted.** A slice meets a new failure: the upstream provider's quota is exhausted. The app's error
  model (`[ERR-1]`) declares its categories once, and none fits. Adding a category changes the model for
  every slice. The agent verifies that the contract and the tests do not permit a category added from
  inside a slice, and asks with the two options it sees: a new category, or a mapping to the nearest
  existing one with a stated reason. Warranted.
- **Avoidable.** A new slice needs rows from a table another package owns. The agent asks whether it may
  read the table directly. `CORAL.md` carries an exception to `[STATE-5]` on that path, with its reason
  and its `revisit when` condition, and the condition has not been met. `[AGENT-5]` requires that read
  before escalating. The answer was in `CORAL.md`.
- **Missed.** Two slices disagree on the status for a duplicate: one returns `409`, the other `422`. The
  agent changes the second to `409` for consistency. Both codes are on the published surface, and the API
  description pins each. The `422` was a documented choice. The agent neither verified nor asked, and
  review found the change in the diff. Drift is
  [flagged as a question](/ARCHITECTURE#enforcement-drift-control), not forced to converge.

### Human-owned

- **Warranted.** A feature needs a column that two slices will write. `[STATE-5]` gives one owner per
  table. The agent sees two options: one slice owns the table and publishes a capability the other
  calls, or an exception to `[STATE-5]` on the path. An exception is authored by a human (`[AGENT-4]`).
  The record names both options, states that `CORAL.md` holds no exception and the decision log has no
  entry, and recommends the published capability. Warranted.
- **Avoidable.** A new integration needs an HTTP client. The agent asks whether it may add a client
  library. The decision log holds the example entry above: standard library client, no third-party
  client, revisit when a provider requires a protocol it does not speak. The provider speaks HTTP/1.1.
  The answer was in the decision log.
- **Missed.** A rename of a database column ships in one commit with the code that reads it, because the
  tests pass against the migrated schema. A data migration is irreversible once it runs against
  production data, so the decision was human-owned. The agent did not ask.

## How a review classifies an escalation

A review of a change, and the review of Coral's first use, reads every escalation and every silent
decision on the surface it covers, and gives each one of three classifications.

| Classification | Meaning | What it says about the loop |
|---|---|---|
| **Warranted** | The test put the decision in a class the agent could not decide alone, and the answer was not recorded anywhere the agent is required to read. | The protocol worked. The answer is recorded now, so the next session does not ask. |
| **Avoidable** | The answer was in the contract, the tests, `CORAL.md`, or the decision log. | Either the agent did not read what `[AGENT-5]` and this protocol require, or the record was not findable. The review says which. |
| **Missed** | A constrained or human-owned decision was made silently. | The most serious finding. It is found in the diff, not in a record. |

The count of escalations is not a score. Three warranted escalations in one slice are the protocol
working. Zero escalations in a change that moved a published contract hide a missed one. A review reports
the classification of each escalation and the cause of each avoidable and each missed one. Escalations
that are mostly avoidable [count against Coral's claim](/#what-coral-claims-and-how-it-is-judged). So
does a missed escalation that broke a behavior contract.

# Appendix: Agentic App  (ADDENDUM)

> **Status: ADDENDUM — not part of the core appendix set, and not part of the `1.0.0` condition.**
>
> Nobody here has built an agentic app yet. This page is written from reading and from principle, not
> from experience. It is a **starting point rather than a blueprint**. Expect parts of it to be wrong, and
> expect it to change substantially without a major version bump (`[VER-2]`). Its rule IDs are permanent
> (`[VER-1]`), so citing one stays safe. Its content carries no stability promise.
>
> One slot is open, and it is open **pending a decision, not pending prose**. That slot is *composition
> root*: whether tool definitions live with the harness, or with the slice each tool fronts. Both answers
> are defensible, and neither is settled anywhere in the industry. *Observability* was the second open
> slot. `[AGENTIC-10]`'s data-governance rules now answer the half that was blocking it: capture prompts
> redacted, and let retention bound the exposure.
>
> **Do not invent an answer to the open slot.** Pick the reversible option for your app, flag it
> (`[AGENT-2]`), and record it in your project's `CORAL.md` as an **Extension**. That is what extensions
> are for. A recurring answer across projects is the signal for an amendment that closes the slot for
> everyone.
>
> What this page is good for meanwhile is the `[AGENTIC-*]` rules that are **safety guardrails** rather
> than construction advice:
>
> - the harness (`[AGENTIC-5]`)
> - untrusted model output and prompt injection (`[AGENTIC-10]`)
> - never exact-matching model text (`[AGENTIC-11]`)
> - never floating the model identifier (`[AGENTIC-12]`)
> - per-action replay protection (`[AGENTIC-13]`)
>
> Those hold whether or not the rest of the page survives contact with a real build. Read the spine
> first.

This appendix instantiates the [Coral app spine](../ARCHITECTURE.md) for **agentic apps**: apps built
around an LLM or an LLM agent *at runtime*. This is a different axis from the operating model in
[`CONVENTIONS.md`](../CONVENTIONS.md), where agents *write* the code. There the agent is the **author**.
Here it is a **runtime component** of the app itself.

**Defining tension:** Coral is built on determinism, typed contracts, and exact-match behavior tests. An
LLM is none of those. Two moves resolve it:

1. Treat the model as a *non-deterministic effect, injected as a crosscut*, as a `model` client alongside
   `db`. The pure parts then stay pure, and the non-determinism is confined to one edge call.
2. For an autonomous agent, put it inside a **harness**: a deterministic, observable shell that turns
   judgment into safe, bounded, gated action.

The agent is the non-deterministic core. The harness is the deterministic slice around it.

## Boundary & shape  → `[BOUND-1]`

**`[AGENTIC-1]`** `[guide]` `{runtime-agent}` The boundary is **one turn, task, or agent-invocation**,
such as a user message or a goal handed to the agent. One inbound trigger, handled end to end.

**`[AGENTIC-2]`** `[guide]` `{runtime-agent}` Distinguish two intensities. A **one-shot call** builds a
prompt, calls the model, and parses the output, with no loop. It needs only the model-as-crosscut
discipline below. An **agentic loop**, in which the model iteratively chooses tools and acts, needs the
full **Harness**. Do not use a loop when one call suffices.

## Model as a crosscut, pure core, fuzzy edge  → `[EFFECT-2]` `[XCUT-1]`

**`[AGENTIC-3]`** `[review]` `{runtime-agent}` The model is an **injected effect**, not pure compute. The
slice flow is parse → validate → *build prompt/context* (pure) → **call the model** (an edge effect,
non-deterministic like any network call) → *parse and validate output* (pure) → effect/tool calls →
render.

The model client, the tools, and memory/retrieval are **injected crosscuts** (`[XCUT-1]`). They are
defined once, passed in, and never reached for as globals. Keep prompt-building and output-parsing pure
and testable. Only the call itself is non-deterministic.

## Observable contract  → `[CONTRACT-1]`

**`[AGENTIC-4]`** `[review]` `{runtime-agent}` Force a contract on fuzzy output with a **schema**
(structured output or tool-call format). The observable contract is **"output conforms to the schema" plus
the observed side effects (tool calls)**, never the exact text.

Output that fails the schema is a `validation` failure (`[ERR-1]`). Repair or retry it a bounded number
of times. Never pass it downstream malformed.

## The Harness (the heart of an agentic app)

**`[AGENTIC-5]`** `[review]` `{runtime-agent}` An autonomous or looping agent runs **only inside a
harness**: a deterministic, observable app that runs the agent under enforced limits. There is no "bare
agent" with direct authority.

The harness owns five duties:

1. **Tools are typed published contracts.** The agent acts only through tools, and each tool is a
   deterministic, contract-tested capability (`[CHAN-1]`, `[COMPOSE-1]`). A tool is never a reach into
   internals. The non-determinism is confined to *which tool, with what arguments*.
2. **Authorize every tool call** (`[TRUST-1]`). Default-deny the dangerous ones, and scope what this agent
   may reach.
3. **Gate by risk, against an explicit policy.** High-risk, privileged, irreversible, or user-visible
   actions require human approval, **unless the application has pre-authorized them within bounded
   policy**. Bounds are values such as a spend ceiling, a recipient allow-list, a limit on how much the
   action can affect, or an expiry. Inside the bounds the agent proceeds. Outside them, or for anything
   the policy does not classify, it escalates. This is `[AGENT-2]` *enforced by the harness*, not left to
   the agent's judgment.

   The blanket form of this rule requires every irreversible action to wait for a human. It reads
   stricter and is weaker in practice. An agent that needs a click per write is not autonomous, so a team
   that needs autonomy responds by reclassifying its writes as reversible. The gate then blocks nothing
   while still appearing to be a control. Bounded pre-authorization is the version that survives contact
   with a real deployment. *This agent may refund up to £50 to the customer who is in the conversation,
   and nothing else* is enforceable and auditable. It also does not require a human in a loop that would
   defeat the application's purpose.

   Two properties keep it enforceable. First, **the bounds are the harness's, not the agent's**. They are
   resolved at the root as configuration (`[CONFIG-1]`). They are never widenable by the thing they
   constrain, because a model that can raise its own ceiling has no ceiling. Second, **the unclassified
   case denies**. An action the policy does not mention escalates rather than proceeding. Otherwise every
   gap in the policy silently becomes a permission.
4. **Observe everything** (`[OBS-1]`). Every prompt, decision, tool call, and result is logged and
   traceable.
5. **Bound context and authority** to one scoped task.

**`[AGENTIC-6]`** `[guide]` `{runtime-agent}` The agent is the non-deterministic *core*, and the harness is
the deterministic *shell*. A harness is therefore an otherwise-ordinary Coral app with one injected
non-deterministic component: it owns its trigger, has a contract, and is observable and testable. Build "a
Claude Code for your purpose", not "a model with unrestricted access to your systems."

## State & memory  → `[STATE-1]`

**`[AGENTIC-7]`** `[review]` `{runtime-agent}` Conversation history, agent memory, and RAG/vector retrieval
are state: slice-owned where local, or a precisely-named **retrieval/memory crosscut** when shared
(`[XCUT-1]`, `[STATE-2]`). Do not place them in a generic store that every slice reaches into. Give each
store one owning feature package (`[STATE-5]`).

## Idempotency  → `[IDEM-1]`

**`[AGENTIC-8]`** `[review]` `{runtime-agent}` On an at-least-once platform, a mutating agent dedupes by
**storing the first result** keyed to the request, never by re-running.

This is stricter than ordinary `[IDEM-5]` dedupe because a generate is not merely non-idempotent. It is
**non-reproducible**. Re-running does not reproduce the previous output, so the usual "retry until it
succeeds" recovery silently produces a *different* answer on the redelivery. The second answer then
overwrites the first. The stored result is the only thing that makes the handler a true no-op.

Caching by exact input is allowed, as an optimization rather than a correctness guarantee. The same
prompt is not contractually the same output.

**This rule does not make the agent's *actions* happen once.** See `[AGENTIC-13]` for that. This rule
makes the handler *answer* consistently, which is a different property and the easier half.

**`[AGENTIC-13]`** `[review]` `{runtime-agent}` Every side-effecting tool carries its **own** replay
protection: an idempotency key, a natural key with check-before-write, or an action ledger. The stored
model result is not one.

This is the gap `[AGENTIC-8]` leaves, and it is a correctness bug. Consider the sequence. The agent
selects an action and calls `chargeCard()`. The charge succeeds, and the process dies before the result is
stored. The dedupe key was never written, so redelivery re-runs the turn and charges the card a second
time. `[AGENTIC-8]` was satisfied at every instant, and the customer was billed twice. `chargeCard`,
`sendEmail`, `deleteResource`, `createTicket` and `publishChange` each need a key of their own, because
each is the thing that must not happen twice.

**The ordering is the mechanism, not a detail.** Record the *intent* before acting, then act, then record
the *outcome*. A ledger written only on success cannot distinguish "never happened" from "happened, and
the process died before writing it down". That is the case that decides whether replay is safe. An entry
written first turns the ambiguous case into a reconcilable one: on replay, an intent with no outcome is
looked up against the downstream system rather than retried blindly.

Model-level and effect-level protection are **two layers, and a mutating agent needs both** (`[IDEM-5]`,
`[GHA-5]`). Conflating them is the failure this rule exists to name. `[AGENTIC-8]` alone gives you an
agent that answers consistently while double-charging.

## Error model  → `[ERR-1]`

**`[AGENTIC-9]`** `[review]` `{runtime-agent}` Map model failures to the taxonomy: model unavailable or
timed out → `infrastructure`, output that fails its schema → `validation` with bounded repair then
failure, refusal or content-filter → a named `validation` or `conflict` code, and tool errors propagating
under their own taxonomy category. Never silently accept malformed output.

## Trust (the heaviest slot)  → `[TRUST-1]` `[TRUST-2]`

**`[AGENTIC-10]`** `[review]` `{runtime-agent}` Three LLM-specific hazards sit on top of the usual boundary
validation:

- **Prompt injection.** Untrusted input reaches the prompt. Treat any external text in context as
  adversarial, and never let it escalate the agent's authority or rewrite its instructions.
- **Model output is untrusted.** Never execute it, render it as HTML, or act on it without checking.
  Validate and authorize it downstream exactly as you would user input.
- **Tool-call authorization.** Default-deny dangerous tools, scope what this agent may reach, and gate by
  risk against explicit policy (`[AGENTIC-5]`).
- **Data governance.** **Secrets never enter a prompt** (`[CONFIG-4]`). That half is absolute, because a
  credential has no legitimate reason to be in one. **Personal data is governed, not banned.** Five
  practices govern it:
  - pass only the fields the task needs
  - authorize the access as you would any read
  - redact what the model does not need to see
  - apply a retention policy to stored prompts and traces
  - keep personal data out of logs and traces by default

The earlier form of this rule said "keep secrets and PII out of prompts and logs". The PII half was
unsatisfiable by construction. A support-triage agent, a recruiting assistant, and a medical-scribe app
process personal information *as their purpose*. A rule that cannot be followed is not followed
selectively. It is ignored entirely, taking the satisfiable secrets half with it. Minimization is
enforceable and auditable where prohibition was neither. It is also the answer to the observability slot
below: capture prompts, capture them redacted, and let retention rather than blanket avoidance bound the
exposure.

## Contract versioning  → `[CONTRACT-2]`

**`[AGENTIC-12]`** `[review]` `{runtime-agent}` **Pin the model identifier and version the prompt**, record
both with every stored result, and re-run the evals before a change to either ships.

A model upgrade is not a dependency bump. The observable contract is "output conforms to the schema, plus
the observed tool calls" (`[AGENTIC-4]`). A new model can satisfy the schema perfectly while changing
behaviour in ways only evals detect (`[AGENTIC-11]`). The type checks still pass, and the answers get
worse.

**These are release-gating provenance, not a published contract.** The distinction matters, because the
earlier wording ("part of the contract") implied the wrong obligations. Calling them a contract pulls in
`[CONTRACT-2]`'s versioning discipline. It also suggests external consumers must be told when the model
changes, and usually they must not be. Their contract is the *schema* (`[AGENTIC-4]`), and while the
schema still holds, a model swap is not a breaking change to them. What the pin buys is internal and
substantial:

- reproducibility
- a forensic trail for an output nobody can explain
- a rollback target
- an eval gate that a floating alias would bypass with no commit and no review

Where external compatibility genuinely does depend on the exact model, it *is* a published contract and
`[CONTRACT-2]` applies. Examples are a customer pinned to the model by agreement, and a regulated audit
trail. Decide that deliberately and write it down. Do not arrive at it by default.

**Pin the model identifier explicitly. Never let it float to an alias such as "latest".** A floating model
means the contract can change with no commit, no review, and no eval run. That is the opposite of what a
published contract is for.

Version prompts alongside the code that builds them, and **record the model identifier and prompt version
with each stored result**. `[AGENTIC-8]` already stores the result for dedupe, so store the provenance
with it. Without that, an output nobody can explain has no forensic trail. In an agent-first codebase, the
next agent also cannot ask what the prompt used to say.

## Slots still to fill

- **Composition root** → wires the model client, tools, and memory/retrieval as injected crosscuts, and
  constructs the harness, with no business logic. *Needs an `AGENTIC-` rule on where tool definitions
  live: with the harness, or with the slice each tool fronts.*
- **Observability** → token, cost, and latency on top of `[OBS-1..3]`. Capture prompts, responses, and
  tool calls so the agent's decisions are auditable. **Spine-sufficient as of `[AGENTIC-10]`.** The
  conflict with `[CONFIG-4]` was "capture every prompt" against "log no personal data", and data
  governance resolves it. Secrets never enter the prompt at all. Personal data is minimized before it
  does, captured redacted, and bounded by retention. The token, cost and latency half needs no `AGENTIC-`
  rule of its own.

## Testing  → `[TEST-1]`

**`[AGENTIC-11]`** `[review]` `{runtime-agent}` Test in three layers. The first is ordinary, and the rest
are specific to this app type:

1. **Deterministic parts, normally.** Prompt building, output parsing, and the harness's authorization,
   gating, and tool-wiring are plain pure or behavior tests.
2. **Agent behavior, by conformance and evals.** Assert that the output satisfies the schema
   (`[AGENTIC-4]`). Eval suites and **LLM-as-judge** grade quality. **Never exact-match** on model text.
3. **Harness safety.** Assert that dangerous tools are denied, that irreversible actions gate, and that
   every action is observed.

## Agentic-app slot summary

| Slot                | Agentic instantiation                                          |
| ------------------- | -------------------------------------------------------------- |
| boundary            | one turn / task / agent-invocation                             |
| shape               | one-shot call or agentic loop (loop ⇒ full harness)            |
| model               | injected non-deterministic effect, a crosscut                |
| observable contract | schema-conformant output + observed tool calls                 |
| harness             | tools = typed contracts · authz · risk-gate against policy · observe · bound |
| state               | conversation / memory / RAG (local or a retrieval crosscut)   |
| idempotency         | two layers: dedupe-by-stored-result, **and** per-action replay protection |
| error model         | model → infrastructure, bad output → validation (bounded repair) |
| trust               | prompt injection · untrusted output · tool authz · data governance |
| contract versioning | the schema is the contract, model + prompt are pinned provenance, re-eval on change |
| testing             | deterministic parts normal, behavior via conformance + evals + judge |

## Open questions

- **Multi-agent**, meaning agents calling agents. Each sub-agent is its own harnessed app. Cross-agent
  calls follow `[CHAN-1]` and the orchestrating harness in [`SYSTEM.md`](../SYSTEM.md).
- **Streaming output**: how the observable contract is asserted incrementally rather than on completion.

---

## Agent Execution Contract (agentic app)

The complete normative checklist for this appendix: every `[auto]` and `[review]` rule defined above. It
**adds to** the app-scale contracts rather than replacing them. Load
[`ARCHITECTURE.md`](../ARCHITECTURE.md)'s contract, and [`PRODUCTION.md`](../PRODUCTION.md)'s if this
project adopts the production baseline. `[guide]` rules are rationale and live only in the prose.

This appendix is an **ADDENDUM**. Its rule IDs are permanent, but its content may change substantially
without a major bump. Five entries hold regardless: `[AGENTIC-5]`, `[AGENTIC-10]`, `[AGENTIC-11]`,
`[AGENTIC-12]` and `[AGENTIC-13]`. They are safety guardrails, not construction advice.

<!-- coral:contract:start -->
<!-- coral:scope:runtime-agent -->

- `[AGENTIC-3]` Treat the model as an injected effect, and keep prompt-building and output-parsing pure.
- `[AGENTIC-4]` Force a schema on model output. The contract is schema conformance plus observed tool calls, never the text.
- `[AGENTIC-5]` Run an autonomous or looping agent only inside a harness: typed tools, authorization, risk-based gating against explicit policy, observation, bounds.
- `[AGENTIC-7]` Treat history, memory, and retrieval as state: slice-owned, or a precisely-named retrieval crosscut.
- `[AGENTIC-8]` Dedupe a mutating agent by storing the first result keyed to the request. Never re-run to recover.
- `[AGENTIC-13]` Give every side-effecting tool its own replay protection: a key, a natural key, or a ledger. The stored result is not one.
- `[AGENTIC-9]` Map model failures to the taxonomy, bound schema repair then fail, and never accept malformed output.
- `[AGENTIC-10]` Treat prompt input and model output as untrusted, default-deny dangerous tools, keep secrets out of prompts entirely, and minimize/redact/retain personal data.
- `[AGENTIC-11]` Test the deterministic parts normally, agent behavior by conformance and evals, and harness safety. Never exact-match model text.
- `[AGENTIC-12]` Pin the model identifier and version the prompt. Record both with each result, and re-run evals before either changes.

<!-- coral:contract:end -->

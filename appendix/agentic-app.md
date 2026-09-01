# Appendix: Agentic App  (ADDENDUM)

> **Status: ADDENDUM — not part of the core appendix set, and not part of the `1.0.0` condition.**
>
> Nobody here has built an agentic app yet. This page is written from reading and from principle, not from
> experience, so it is a **starting point rather than a blueprint**: expect parts of it to be wrong, and
> expect it to change substantially without a major version bump (`[VER-2]`). Its rule IDs are permanent
> (`[VER-1]`), so citing one stays safe — but its content carries no stability promise.
>
> One slot is open, and it is open **pending a decision, not pending prose**: *composition root* — whether
> tool definitions live with the harness or with the slice each tool fronts. Both answers are defensible and
> neither is settled anywhere in the industry. (*Observability* was the second; `[AGENTIC-10]`'s
> data-governance rules now answer the half that was blocking it — capture prompts redacted, and let
> retention bound the exposure.)
>
> **Do not invent an answer to that one.** Pick the reversible option for your app, flag it
> (`[AGENT-2]`), and record it in your project's `CORAL.md` as an **Extension** — that is precisely what
> extensions are for. A recurring answer across projects is the signal for an amendment that closes the
> slot for everyone.
>
> What this page is good for meanwhile: the `[AGENTIC-*]` rules that are **safety guardrails** rather than
> construction advice — the harness (`[AGENTIC-5]`), untrusted model output and prompt injection
> (`[AGENTIC-10]`), never exact-matching model text (`[AGENTIC-11]`), never floating the model identifier
> (`[AGENTIC-12]`), and per-action replay protection (`[AGENTIC-13]`). Those hold whether or not the rest of
> the page survives contact with a real build. Read the spine first.

This appendix instantiates the [Coral app spine](../ARCHITECTURE.md) for **agentic apps** — apps built
around an LLM or an LLM agent *at runtime*. (This is a different axis from the operating model in
[`CONVENTIONS.md`](../CONVENTIONS.md), where agents *write* the code: there the agent is the **author**;
here it is a **runtime component** of the app itself.)

**Defining tension:** Coral is built on determinism, typed contracts, and exact-match behavior tests — and
an LLM is none of those. Two moves resolve it. **(1)** Treat the model as a *non-deterministic effect,
injected as a crosscut* (a `model` client, like `db`), so the pure parts stay pure and the fuzz is
quarantined to one edge call. **(2)** For an autonomous agent, put it inside a **harness** — a
deterministic, observable shell that turns judgment into safe, bounded, gated action. The agent is the
non-deterministic core; the harness is the deterministic slice around it.

## Boundary & shape  → `[BOUND-1]`

**`[AGENTIC-1]`** `[guide]` `{runtime-agent}` The boundary is **one turn, task, or agent-invocation** — a
user message, or a goal handed to the agent. One inbound trigger, handled end to end.

**`[AGENTIC-2]`** `[guide]` `{runtime-agent}` Distinguish two intensities. A **one-shot call** (build
prompt → call model → parse output; no loop) needs only the model-as-crosscut discipline below. An
**agentic loop** (the model iteratively chooses tools and acts) needs the full **Harness**. Don't reach for
a loop when one call suffices.

## Model as a crosscut; pure core, fuzzy edge  → `[EFFECT-2]` `[XCUT-1]`

**`[AGENTIC-3]`** `[review]` `{runtime-agent}` The model is an **injected effect**, not pure compute. The
slice flow is parse → validate → *build prompt/context* (pure) → **call the model** (an edge effect,
non-deterministic like any network call) → *parse and validate output* (pure) → effect/tool calls → render.

The model client, the tools, and memory/retrieval are **injected crosscuts** (`[XCUT-1]`) — defined once,
passed in, never reached for as globals. Keep prompt-building and output-parsing pure and testable; only
the call itself is fuzzy.

## Observable contract  → `[CONTRACT-1]`

**`[AGENTIC-4]`** `[review]` `{runtime-agent}` Force a contract on fuzzy output with a **schema**
(structured output or tool-call format). The observable contract is **"output conforms to the schema" plus
the observed side effects (tool calls)** — never the exact text.

Output that fails the schema is a `validation` failure (`[ERR-1]`), repaired or retried a bounded number of
times, never passed downstream malformed.

## The Harness (the heart of an agentic app)

**`[AGENTIC-5]`** `[review]` `{runtime-agent}` An autonomous or looping agent runs **only inside a
harness** — a deterministic, observable app that employs the agent within walls. There is no "bare agent"
with direct authority.

The harness owns five duties:

1. **Tools are typed published contracts.** The agent acts only through tools, and each tool is a
   deterministic, contract-tested capability (`[CHAN-1]` / `[COMPOSE-1]`) — never a reach into internals.
   The non-determinism is confined to *which tool, with what arguments*.
2. **Authorize every tool call** (`[TRUST-1]`) — default-deny the dangerous ones; scope what this agent may
   touch.
3. **Gate by risk, against an explicit policy.** High-risk, privileged, irreversible, or user-visible
   actions require human approval **unless the application has pre-authorized them within bounded
   policy** — a spend ceiling, a recipient allow-list, a blast-radius limit, an expiry. Inside the
   bounds the agent proceeds; outside them, or for anything the policy does not classify, it escalates.
   This is `[AGENT-2]` *enforced by the harness*, not left to the agent's judgment.

   The blanket form of this rule — every irreversible action waits for a human — reads stricter and is
   weaker in practice. An agent that needs a click per write is not autonomous, so a team that needs
   autonomy responds by reclassifying its writes as reversible, and the gate becomes decoration while
   still appearing to be a control. Bounded pre-authorization is the version that survives contact with a
   real deployment: *this agent may refund up to £50 to the customer who is in the conversation, and
   nothing else*, is enforceable, auditable, and does not require a human in a loop that would defeat the
   application's purpose.

   Two properties keep it honest. **The bounds are the harness's, not the agent's** — resolved at the root
   as configuration (`[CONFIG-1]`) and never widenable by the thing they constrain, because a model that
   can raise its own ceiling has no ceiling. And **the unclassified case denies**: an action the policy
   does not mention escalates rather than proceeding, or every gap in the policy silently becomes a
   permission.
4. **Observe everything** (`[OBS-1]`) — every prompt, decision, tool call, and result is logged and
   traceable.
5. **Bound context and authority** — a scoped task, not god-mode.

**`[AGENTIC-6]`** `[guide]` `{runtime-agent}` The agent is the non-deterministic *core*; the harness is the
deterministic *shell*. A harness is therefore an otherwise-ordinary Coral app — it owns its trigger, has a
contract, is observable and testable — with one injected non-deterministic brain. Build "a Claude Code for
your purpose," not "a model loose on your systems."

## State & memory  → `[STATE-1]`

**`[AGENTIC-7]`** `[review]` `{runtime-agent}` Conversation history, agent memory, and RAG/vector retrieval
are state: slice-owned where local, or a precisely-named **retrieval/memory crosscut** when shared
(`[XCUT-1]`, `[STATE-2]`). Don't smear them into a generic store reached into from everywhere, and give
each store one owning feature package (`[STATE-5]`).

## Idempotency  → `[IDEM-1]`

**`[AGENTIC-8]`** `[review]` `{runtime-agent}` On an at-least-once platform, a mutating agent dedupes by
**storing the first result** keyed to the request, never by re-running.

The reason this is stricter than ordinary `[IDEM-5]` dedupe: a generate is not merely non-idempotent, it is
**non-reproducible**. Re-running does not reproduce the previous output, so the usual "retry until it
succeeds" recovery silently produces a *different* answer on the redelivery — and the second answer
overwrites the first. The stored result is the only thing that makes the handler a true no-op.

Caching by exact input is allowed, but as an optimization, not a correctness guarantee: the same prompt is
not contractually the same output.

**What this rule does not do is make the agent's *actions* happen once** — see `[AGENTIC-13]`. It makes the
handler *answer* consistently, which is a different property and the easier half.

**`[AGENTIC-13]`** `[review]` `{runtime-agent}` Every side-effecting tool carries its **own** replay
protection — an idempotency key, a natural key with check-before-write, or an action ledger. The stored
model result is not one.

This is the gap `[AGENTIC-8]` leaves, and it is a correctness bug rather than a matter of rigour. Consider
the sequence: the agent decides to act, calls `chargeCard()`, the charge succeeds, and the process dies
before the result is stored. The dedupe key was never written, so redelivery re-runs the turn — and charges
the card a second time. `[AGENTIC-8]` was satisfied at every instant and the customer was billed twice.
`chargeCard`, `sendEmail`, `deleteResource`, `createTicket`, `publishChange`: each needs a key of its own,
because each is the thing that must not happen twice.

**The ordering is the mechanism, not a detail.** Record the *intent* before acting, then act, then record
the *outcome*. A ledger written only on success cannot distinguish "never happened" from "happened, and we
died before writing it down" — and that is precisely the case that decides whether replay is safe. An
entry written first turns the ambiguous case into a reconcilable one: on replay, an intent with no outcome
is looked up against the downstream system rather than blindly retried.

Model-level and effect-level protection are **two layers and a mutating agent needs both**
(`[IDEM-5]`, `[GHA-5]`). Conflating them is the failure this rule exists to name: `[AGENTIC-8]` alone
gives you an agent that answers consistently while double-charging.

## Error model  → `[ERR-1]`

**`[AGENTIC-9]`** `[review]` `{runtime-agent}` Map model failures to the taxonomy: model unavailable or
timed out → `infrastructure`; output that fails its schema → `validation` (bounded repair, then fail);
refusal or content-filter → a named `validation` or `conflict` code; tool errors propagate under their own
taxonomy category. Never silently accept malformed output.

## Trust (the heaviest slot)  → `[TRUST-1]` `[TRUST-2]`

**`[AGENTIC-10]`** `[review]` `{runtime-agent}` Three LLM-specific hazards sit on top of the usual boundary
validation:

- **Prompt injection** — untrusted input reaches the prompt. Treat any external text in context as
  adversarial, and never let it escalate the agent's authority or rewrite its instructions.
- **Model output is untrusted** — never exec it, render it as HTML, or act on it blindly; validate and
  authorize it downstream exactly as you would user input.
- **Tool-call authorization** — default-deny dangerous tools, scope what this agent may reach, and gate
  by risk against explicit policy (`[AGENTIC-5]`).
- **Data governance** — **secrets never enter a prompt** (`[CONFIG-4]`); that half is absolute, because a
  credential has no legitimate reason to be in one. **Personal data is governed, not banned**: pass only
  the fields the task needs, authorize the access as you would any read, redact what the model does not
  need to see, apply a retention policy to stored prompts and traces, and keep personal data out of logs
  and traces by default.

The earlier form of this rule said "keep secrets and PII out of prompts and logs", and the PII half was
unsatisfiable by construction: a support-triage agent, a recruiting assistant, a medical-scribe app process
personal information *as their purpose*. A rule that cannot be followed is not followed selectively — it is
ignored wholesale, taking the satisfiable secrets half with it. Minimization is enforceable and auditable
where prohibition was neither, and it is also the answer to the observability slot below: capture prompts,
capture them redacted, and let retention rather than blanket avoidance bound the exposure.

## Contract versioning  → `[CONTRACT-2]`

**`[AGENTIC-12]`** `[review]` `{runtime-agent}` **Pin the model identifier and version the prompt**, record
both with every stored result, and re-run the evals before a change to either ships.

A model upgrade is not a dependency bump. The observable contract is "output conforms to the schema, plus
the observed tool calls" (`[AGENTIC-4]`), and a new model can satisfy the schema perfectly while changing
behaviour in ways only evals detect (`[AGENTIC-11]`) — the type checks still pass and the answers get
worse.

**These are release-gating provenance, not a published contract**, and the distinction is worth drawing
because the earlier wording ("part of the contract") implied the wrong obligations. Calling them a contract
pulls in `[CONTRACT-2]`'s versioning discipline and suggests external consumers must be told when the model
changes — and usually they must not be, because their contract is the *schema* (`[AGENTIC-4]`), and while it
still holds a model swap is not a breaking change to them. What the pin actually buys is internal and
substantial: reproducibility, a forensic trail for an output nobody can explain, a rollback target, and an
eval gate that a floating alias would bypass with no commit and no review.

Where external compatibility genuinely does depend on the exact model — a customer pinned to it by
agreement, a regulated audit trail — then it *is* a published contract and `[CONTRACT-2]` applies. Decide
that deliberately and write it down; do not arrive at it by default.

**Pin the model identifier explicitly; never let it float to an alias like "latest".** A floating model
means the contract can change with no commit, no review, and no eval run — the exact opposite of what a
published contract is for.

Version prompts alongside the code that builds them, and **record the model identifier and prompt version
with each stored result** (`[AGENTIC-8]` already stores the result for dedupe — store the provenance with
it). Without that, an output nobody can explain has no forensic trail, and in an agent-first codebase the
next agent cannot ask what the prompt used to say.

## Slots still to fill

- **Composition root** → wires the model client, tools, and memory/retrieval as injected crosscuts and
  constructs the harness; no business logic. *Needs an `AGENTIC-` rule on where tool definitions live —
  with the harness, or with the slice each tool fronts.*
- **Observability** → token, cost, and latency on top of `[OBS-1..3]`; capture prompts, responses, and tool
  calls so the agent's decisions are auditable. **Spine-sufficient as of `[AGENTIC-10]`**: the conflict with
  `[CONFIG-4]` was "capture every prompt" versus "log no personal data", and data governance resolves it —
  secrets never enter the prompt at all, personal data is minimized before it does, captured redacted, and
  bounded by retention. The token/cost/latency half needs no `AGENTIC-` rule of its own.

## Testing  → `[TEST-1]`

**`[AGENTIC-11]`** `[review]` `{runtime-agent}` Test in three layers — the first ordinary, the rest the new
mode:

1. **Deterministic parts, normally.** Prompt building, output parsing, and the harness's authorization,
   gating, and tool-wiring are plain pure or behavior tests.
2. **Agent behavior, by conformance and evals.** Does the output satisfy the schema (`[AGENTIC-4]`)? Eval
   suites and **LLM-as-judge** grade quality; **never exact-match** on model text.
3. **Harness safety.** Assert that dangerous tools are denied, that irreversible actions gate, and that
   every action is observed.

## Agentic-app slot summary

| Slot                | Agentic instantiation                                          |
| ------------------- | -------------------------------------------------------------- |
| boundary            | one turn / task / agent-invocation                             |
| shape               | one-shot call vs agentic loop (loop ⇒ full harness)            |
| model               | injected non-deterministic effect, a crosscut                |
| observable contract | schema-conformant output + observed tool calls                 |
| harness             | tools = typed contracts · authz · risk-gate against policy · observe · bound |
| state               | conversation / memory / RAG (local or a retrieval crosscut)   |
| idempotency         | two layers: dedupe-by-stored-result, **and** per-action replay protection |
| error model         | model → infrastructure; bad output → validation (bounded repair) |
| trust               | prompt injection · untrusted output · tool authz · data governance |
| contract versioning | the schema is the contract; model + prompt are pinned provenance, re-eval on change |
| testing             | deterministic parts normal; behavior via conformance + evals + judge |

## Open questions

- **Multi-agent** (agents calling agents): each sub-agent is its own harnessed app; cross-agent calls
  follow `[CHAN-1]` and the orchestrating harness in [`SYSTEM.md`](../SYSTEM.md).
- **Streaming output**: how the observable contract is asserted incrementally vs. on completion.

---

## Agent Execution Contract (agentic app)

The complete normative checklist for this appendix: every `[auto]` and `[review]` rule defined above. It
**adds to** the spine's contract in [`ARCHITECTURE.md`](../ARCHITECTURE.md) rather than replacing it —
load both. `[guide]` rules are rationale and live only in the prose.

This appendix is an **ADDENDUM**: its rule IDs are permanent, but its content may change substantially
without a major bump. The five entries that hold regardless are `[AGENTIC-5]`, `[AGENTIC-10]`,
`[AGENTIC-11]`, `[AGENTIC-12]` and `[AGENTIC-13]` — they are safety guardrails, not construction advice.

<!-- coral:contract:start -->
<!-- coral:scope:runtime-agent -->

- `[AGENTIC-3]` Treat the model as an injected effect; keep prompt-building and output-parsing pure.
- `[AGENTIC-4]` Force a schema on model output; the contract is schema conformance plus observed tool calls, never the text.
- `[AGENTIC-5]` Run an autonomous or looping agent only inside a harness: typed tools, authorization, risk-based gating against explicit policy, observation, bounds.
- `[AGENTIC-7]` Treat history, memory, and retrieval as state: slice-owned, or a precisely-named retrieval crosscut.
- `[AGENTIC-8]` Dedupe a mutating agent by storing the first result keyed to the request; never re-run to recover.
- `[AGENTIC-13]` Give every side-effecting tool its own replay protection — key, natural key, or ledger; the stored result is not one.
- `[AGENTIC-9]` Map model failures to the taxonomy, bound schema repair then fail, and never accept malformed output.
- `[AGENTIC-10]` Treat prompt input and model output as untrusted, default-deny dangerous tools, keep secrets out of prompts entirely, and minimize/redact/retain personal data.
- `[AGENTIC-11]` Test the deterministic parts normally, agent behavior by conformance and evals, and harness safety; never exact-match model text.
- `[AGENTIC-12]` Pin the model identifier and version the prompt; record both with each result and re-run evals before either changes.

<!-- coral:contract:end -->

# Appendix: Agentic App  (PARTIAL — core slots filled)

> Status: partial. The agentic-specific slots — model-as-horizontal, the harness, and eval-based testing —
> are written as `AGENTIC-` rules; the rest are slot notes. Read the spine first.

This appendix instantiates the [Coral app spine](../ARCHITECTURE.md) for **agentic apps** — apps built
around an LLM or an LLM agent *at runtime*. (This is a different axis from the operating model in
[`CONVENTIONS.md`](../CONVENTIONS.md), where agents *write* the code: there the agent is the **author**;
here it is a **runtime component** of the app itself.)

**Defining tension:** Coral is built on determinism, typed contracts, and exact-match behavior tests — and
an LLM is none of those. Two moves resolve it. **(1)** Treat the model as a *non-deterministic effect,
injected as a horizontal* (a `model` client, like `db`), so the pure parts stay pure and the fuzz is
quarantined to one edge call. **(2)** For an autonomous agent, put it inside a **harness** — a
deterministic, observable shell that turns judgment into safe, bounded, gated action. The agent is the
non-deterministic core; the harness is the deterministic slice around it.

## Boundary & shape  → `[BOUND-1]`

**`[AGENTIC-1]`** `[guide]` The boundary is **one turn, task, or agent-invocation** — a user message, or a
goal handed to the agent. One inbound trigger, handled end to end.

**`[AGENTIC-2]`** `[guide]` Distinguish two intensities. A **one-shot call** (build prompt → call model →
parse output; no loop) needs only the model-as-horizontal discipline below. An **agentic loop** (the model
iteratively chooses tools and acts) needs the full **Harness**. Don't reach for a loop when one call
suffices.

## Model as a horizontal; pure core, fuzzy edge  → `[EFFECT-2]` `[XCUT-1]`

**`[AGENTIC-3]`** `[review]` The model is an **injected effect**, not pure compute. The slice flow is
parse → validate → *build prompt/context* (pure) → **call the model** (an edge effect, non-deterministic
like any network call) → *parse and validate output* (pure) → effect/tool calls → render.

The model client, the tools, and memory/retrieval are **injected horizontals** (`[XCUT-1]`) — defined once,
passed in, never reached for as globals. Keep prompt-building and output-parsing pure and testable; only
the call itself is fuzzy.

## Observable contract  → `[CONTRACT-1]`

**`[AGENTIC-4]`** `[review]` Force a contract on fuzzy output with a **schema** (structured output or
tool-call format). The observable contract is **"output conforms to the schema" plus the observed side
effects (tool calls)** — never the exact text.

Output that fails the schema is a `validation` failure (`[ERR-1]`), repaired or retried a bounded number of
times, never passed downstream malformed.

## The Harness (the heart of an agentic app)

**`[AGENTIC-5]`** `[review]` An autonomous or looping agent runs **only inside a harness** — a
deterministic, observable app that employs the agent within walls. There is no "bare agent" with direct
authority.

The harness owns five duties:

1. **Tools are typed published contracts.** The agent acts only through tools, and each tool is a
   deterministic, contract-tested capability (`[BUS-1]` / `[COMPOSE-1]`) — never a reach into internals. The
   non-determinism is confined to *which tool, with what arguments*.
2. **Authorize every tool call** (`[TRUST-1]`) — default-deny the dangerous ones; scope what this agent may
   touch.
3. **Gate irreversible and outward-facing actions behind a human.** Reversible → the agent proceeds;
   irreversible (writes, sends, deploys, spends) → a human confirms. This is `[AGENT-2]` *enforced by the
   harness*, not left to the agent's judgment.
4. **Observe everything** (`[OBS-1]`) — every prompt, decision, tool call, and result is logged and
   traceable.
5. **Bound context and authority** — a scoped task, not god-mode.

**`[AGENTIC-6]`** `[guide]` The agent is the non-deterministic *core*; the harness is the deterministic
*shell*. A harness is therefore an otherwise-ordinary Coral app — it owns its trigger, has a contract, is
observable and testable — with one injected non-deterministic brain. Build "a Claude Code for your
purpose," not "a model loose on your systems."

## State & memory  → `[STATE-1]`

**`[AGENTIC-7]`** `[review]` Conversation history, agent memory, and RAG/vector retrieval are state:
slice-owned where local, or a precisely-named **retrieval/memory horizontal** when shared (`[XCUT-1]`,
`[STATE-2]`). Don't smear them into a generic store reached into from everywhere, and give each store one
owning slice (`[STATE-5]`).

## Idempotency  → `[IDEM-1]`

**`[AGENTIC-8]`** `[review]` On an at-least-once platform, a mutating agent dedupes by **storing the first
result** keyed to the request, never by re-running.

The reason this is stricter than ordinary `[IDEM-5]` dedupe: a generate is not merely non-idempotent, it is
**non-reproducible**. Re-running does not reproduce the previous output, so the usual "retry until it
succeeds" recovery silently produces a *different* answer on the redelivery — and the second answer
overwrites the first. The stored result is the only thing that makes the handler a true no-op.

Caching by exact input is allowed, but as an optimization, not a correctness guarantee: the same prompt is
not contractually the same output.

## Error model  → `[ERR-1]`

**`[AGENTIC-9]`** `[review]` Map model failures to the taxonomy: model unavailable or timed out →
`infrastructure`; output that fails its schema → `validation` (bounded repair, then fail); refusal or
content-filter → a named `validation` or `conflict` code; tool errors propagate under their own taxonomy
category. Never silently accept malformed output.

## Trust (the heaviest slot)  → `[TRUST-1]` `[TRUST-2]`

**`[AGENTIC-10]`** `[review]` Three LLM-specific hazards sit on top of the usual boundary validation:

- **Prompt injection** — untrusted input reaches the prompt. Treat any external text in context as
  adversarial, and never let it escalate the agent's authority or rewrite its instructions.
- **Model output is untrusted** — never exec it, render it as HTML, or act on it blindly; validate and
  authorize it downstream exactly as you would user input.
- **Tool-call authorization and data governance** — default-deny dangerous tools; keep secrets and PII out
  of prompts and logs (`[CONFIG-4]`); gate irreversible actions (`[AGENTIC-5]`).

## Remaining slot notes

- **Composition root** → wires the model client, tools, and memory/retrieval as injected horizontals and
  constructs the harness; no business logic.
- **Observability** → token, cost, and latency on top of `[OBS-1..3]`; capture prompts, responses, and tool
  calls (PII-aware) so the agent's decisions are auditable.
- **Contract versioning** → the **model and prompt version are part of the contract** (`[CONTRACT-2]`); a
  model upgrade is a contract change — re-run evals before shipping.

## Testing  → `[TEST-1]`

**`[AGENTIC-11]`** `[review]` Test in three layers — the first ordinary, the rest the new mode:

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
| model               | injected non-deterministic effect, a horizontal                |
| observable contract | schema-conformant output + observed tool calls                 |
| harness             | tools = typed contracts · authz · gate irreversible · observe · bound |
| state               | conversation / memory / RAG (local or a retrieval horizontal)   |
| idempotency         | non-reproducible; dedupe-by-stored-result on at-least-once     |
| error model         | model → infrastructure; bad output → validation (bounded repair) |
| trust               | prompt injection · untrusted output · tool authz · data governance |
| contract versioning | model + prompt version is the contract; re-eval on upgrade     |
| testing             | deterministic parts normal; behavior via conformance + evals + judge |

## Open questions

- **Multi-agent** (agents calling agents): each sub-agent is its own harnessed app; cross-agent calls
  follow `[BUS-1]` and the orchestrating harness in [`SYSTEM.md`](../SYSTEM.md).
- **Streaming output**: how the observable contract is asserted incrementally vs. on completion.

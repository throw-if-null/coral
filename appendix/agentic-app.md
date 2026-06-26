# Appendix: Agentic App  (PARTIAL — core slots filled)

> Status: partial. The agentic-specific slots — model-as-symbiont, the harness, and eval-based
> testing — are written as `AGENTIC-` rules; the rest are slot notes. Read the spine first.

This appendix is one species of polyp. It instantiates the [Coral app spine](../ARCHITECTURE.md) for
**agentic apps** — apps built around an LLM or an LLM agent *at runtime*. (This is a different axis
from the operating model in [`CONVENTIONS.md`](../CONVENTIONS.md), where agents *write* the code:
there the agent is the **author**; here it is a **runtime component** of the app itself.)

**Defining tension:** Coral is built on determinism, typed contracts, and exact-match behavior tests —
and an LLM is none of those. Two moves resolve it: **(1)** treat the model as a *non-deterministic
effect, injected as a symbiont* (a `model` client horizontal, like `db`), so the pure parts stay pure
and the fuzz is quarantined to one edge call; and **(2)** for an autonomous agent, put it inside a
**harness** — a deterministic, observable shell that turns judgment into safe, bounded, gated action.
The agent is the non-deterministic core; the harness is the deterministic polyp around it.

## Boundary & shape  → `[BOUND-1]`

**`[AGENTIC-1]`** The boundary is **one turn / task / agent-invocation** — a user message, or a goal
handed to the agent. One inbound trigger, handled end to end.

**`[AGENTIC-2]`** Distinguish two intensities. A **one-shot call** (build prompt → call model → parse
output; no loop) needs only the model-as-symbiont discipline below. An **agentic loop** (the model
iteratively chooses tools and acts) needs the full **Harness**. Don't reach for a loop when one call
suffices.

## Model as a symbiont; pure core, fuzzy edge  → `[EFFECT-2]` `[XCUT-1]`

**`[AGENTIC-3]`** The model is an **injected effect**, not pure compute. Slice flow:
parse → validate → *build prompt/context* (pure) → **call the model** (an edge effect, non-deterministic
like any network call) → *parse & validate output* (pure) → effect/tool calls → render. The model
client, tools, and memory/retrieval are **injected symbionts** (`[XCUT-1]`) — defined once, passed in,
never reached for as globals. Keep prompt-building and output-parsing pure and testable; only the call
itself is fuzzy.

## Observable contract  → `[CONTRACT-1]`

**`[AGENTIC-4]`** Force a contract on fuzzy output with a **schema** (structured output / tool-call
format). The observable contract is **"output conforms to the schema" + the observed side effects
(tool calls)** — never the exact text. Output that fails the schema is a `validation` failure
(`[ERR-1]`), repaired/retried a bounded number of times, never passed downstream malformed.

## The Harness (the heart of an agentic app)

**`[AGENTIC-5]`** An autonomous or looping agent runs **only inside a harness** — a deterministic,
observable app (a polyp) that employs the agent within walls. There is no "bare agent" with direct
authority. The harness owns five duties:
1. **Tools = typed published contracts.** The agent acts only through tools, and each tool is a
   deterministic, contract-tested capability (`[BUS-1]` / `[COMPOSE-1]`) — never a reach into
   internals. The non-determinism is confined to *which tool, with what arguments*.
2. **Authorize every tool call** (`[TRUST-1]`) — default-deny the dangerous ones; scope what this
   agent may touch.
3. **Gate irreversible / outward-facing actions behind a human.** Reversible → the agent proceeds;
   irreversible (writes, sends, deploys, spends) → a human confirms. This is `[AGENT-2]` *enforced by
   the harness*, not left to the agent's judgment.
4. **Observe everything** (`[OBS-1]`) — every prompt, decision, tool call, and result is logged and
   traceable.
5. **Bound context and authority** — a scoped task, not god-mode.

**`[AGENTIC-6]`** The agent is the non-deterministic *core*; the harness is the deterministic *shell*.
So a harness is an otherwise-ordinary Coral app — it owns its trigger, has a contract, is observable
and testable — with one injected non-deterministic brain. Build "a Claude Code for your purpose," not
"a model loose on your systems."

## State & memory  → `[STATE-1]`

**`[AGENTIC-7]`** Conversation history, agent memory, and RAG/vector retrieval are state — slice-owned
where local, or a precisely-named **retrieval/memory symbiont** when shared (`[XCUT-1]` / `[STATE-2]`).
Don't smear them into a generic store reached into from everywhere.

## Idempotency  → `[IDEM-1]`

**`[AGENTIC-8]`** A "generate" is **non-idempotent and non-reproducible** — a retry won't reproduce the
output. On an at-least-once platform (`[IDEM-5]`), a mutating agent must dedupe by **storing the first
result** keyed to the request, not by re-running. Caching by exact input is allowed, but as an
optimization, not a correctness guarantee.

## Error model  → `[ERR-1]`

**`[AGENTIC-9]`** Map model failures to the taxonomy: model unavailable/timeout → `infrastructure`;
output that fails its schema → `validation` (bounded repair, then fail); refusal / content-filter → a
named `validation` or `conflict` code; tool errors propagate under their own taxonomy category. Never
silently accept malformed output.

## Trust (the heaviest slot)  → `[TRUST-1]` `[TRUST-2]`

**`[AGENTIC-10]`** Three LLM-specific hazards sit on top of the usual boundary validation:
- **Prompt injection** — untrusted input reaches the prompt; treat any external text in context as
  adversarial, and never let it escalate the agent's authority or rewrite its instructions.
- **Model output is untrusted** — never exec it, render it as HTML, or act on it blindly; validate and
  authorize it downstream exactly as you would user input.
- **Tool-call authorization & data governance** — default-deny dangerous tools; keep secrets/PII out of
  prompts and logs; gate irreversible actions (`[AGENTIC-5]`).

## Remaining slot notes
- **Composition root** → wires the model client, tools, and memory/retrieval as injected symbionts and
  constructs the harness; no business logic.
- **Observability** → token/cost/latency on top of `[OBS-*]`; capture prompts + responses + tool calls
  (PII-aware) so the agent's decisions are auditable.
- **Contract versioning** → the **model + prompt version are part of the contract** (`[CONTRACT-2]`); a
  model upgrade is a contract change — re-run evals before shipping.

## Testing  → `[TEST-1]`

**`[AGENTIC-11]`** Three layers — the first ordinary, the rest the new mode:
1. **Deterministic parts, normally.** Prompt building, output parsing, and the harness's
   authz/gating/tool-wiring are plain pure/behavior tests.
2. **Agent behavior, by conformance + evals.** Does the output satisfy the schema (`[AGENTIC-4]`)? Eval
   suites and **LLM-as-judge** grade quality; **never exact-match** on model text.
3. **Harness safety.** Assert that dangerous tools are denied, irreversible actions gate, and every
   action is observed.

## Agentic-app slot summary

| Slot                | Agentic instantiation                                          |
| ------------------- | -------------------------------------------------------------- |
| boundary            | one turn / task / agent-invocation                             |
| shape               | one-shot call vs agentic loop (loop ⇒ full harness)            |
| model               | injected non-deterministic effect + symbiont                   |
| observable contract | schema-conformant output + observed tool calls                 |
| harness             | tools=typed contracts · authz · gate irreversible · observe · bound |
| state               | conversation / memory / RAG (local or a retrieval symbiont)    |
| idempotency         | non-reproducible; dedupe-by-stored-result on at-least-once     |
| error model         | model→infrastructure; bad output→validation (bounded repair)   |
| trust               | prompt injection · untrusted output · tool authz · data governance |
| contract versioning | model + prompt version is the contract; re-eval on upgrade     |
| testing             | deterministic parts normal; behavior via conformance + evals + judge |

## Open questions
- **Multi-agent** (agents calling agents): each sub-agent is its own harnessed polyp; cross-agent calls
  follow `[BUS-1]` and the orchestrating harness in [`SYSTEM.md`](../SYSTEM.md).
- **Streaming output**: how the observable contract is asserted incrementally vs on completion.

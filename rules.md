# Rule index

Every rule Coral publishes, in one place: **178 rules** across 9 documents — 28 `[auto]`, 121 `[review]`,
29 `[guide]`. Each ID links to its definition, where the reasoning lives; the statement here is only the
one-line form.

This page is **generated from the documents** (`npm run rules:index`), and the build fails if it drifts, so
it cannot disagree with them. A hand-maintained index would be a second copy of every rule — the failure
the `[DUP-*]` rules exist to prevent, committed by the rule set itself.

Statements come from each document's Agent Execution Contract, which is why they read as instructions.
`[guide]` rules are rationale rather than instruction and appear in no contract, so theirs is the opening
sentence of the definition instead.

## Ownership layers

Every rule belongs to exactly one **ownership layer**: the narrowest surface that justifies it. This is a
separate axis from the enforcement class — a rule is *both* `app profile · cli` *and* `[auto]`. Ownership
answers *who has to load this rule*; the class answers *how it is checked*.

They answer to three audiences rather than stacking into one number. **97 form the conformance surface** —
kernel plus production baseline — what a Coral codebase is built and audited against before any profile is
added, 69 of them `[review]`. **9 govern Coral itself** and sit outside that surface entirely: no
application source code satisfies or violates them. Coral-aware humans, agents and tooling read them when
interpreting a rule, consulting the adherence record, or changing how a project relates to Coral. The other
**72 are opt-in** — 50 `[review]` — and load only where their profile is selected, so a CLI with no runtime
model never reads an `[AGENTIC-*]` rule and a library never reads an HTTP status code.

Scale narrows the conformance surface further. 18 of those 97 are stated at *system* scale in
[`SYSTEM.md`](./SYSTEM.md) — channel contracts, topology, cross-app contract testing — and a repository
that ships one app has no channel to version and no topology to wire. They are the baseline **when several
apps compose**, not a reason for a single-app project to load them.

| Layer | Rules | `[auto]` | `[review]` | `[guide]` | Loaded by |
| --- | --- | --- | --- | --- | --- |
| kernel | 9 | 1 | 8 | 0 | every Coral codebase |
| framework governance | 9 | 2 | 2 | 5 | Coral-aware humans, agents and tooling — never audited against application source |
| production baseline | 88 | 12 | 61 | 15 | every Coral codebase, at the scale the rule is stated for |
| app profile · backend | 8 | 1 | 7 | 0 | projects with an app of that shape |
| app profile · cli | 11 | 5 | 4 | 2 | projects with an app of that shape |
| app profile · gh-action | 12 | 2 | 9 | 1 | projects with an app of that shape |
| app profile · library | 13 | 2 | 10 | 1 | projects with an app of that shape |
| app profile · web | 12 | 3 | 7 | 2 | projects with an app of that shape |
| language binding | 0 | 0 | 0 | 0 | projects in that language ecosystem |
| runtime-agent profile | 16 | 0 | 13 | 3 | applications that call a model at runtime |

**kernel** membership is read from the one table that records it, in
[`CONVENTIONS.md`](./CONVENTIONS.md#the-coral-kernel), where each member is mapped to the property it
defends. Every other rule carries its layer as a `{tag}` on its own definition line, and the profiles those
tags may name are registered in [`CONVENTIONS.md`](./CONVENTIONS.md#ownership-layers). Kernel membership
answers *why Coral imposes a rule, and at what strength*; it does not mean the rule matters more, and no
layer below it is optional once its profile is loaded.

## Rules by scope

The same rules, grouped by the layer that owns them rather than by the document that states them — which is
the grouping a project reads when it is deciding what it has to load. Each heading is the layer's **key**,
the stable identifier the tooling resolves every rule to; the human name is in the [table
above](#ownership-layers). Statements are in the per-document tables below, and the reasoning is in the
document itself.

### kernel

9 rules — kernel.

| Rule | Class | Defined in |
| --- | --- | --- |
| `[AGENT-2]` | `[review]` | [`CONVENTIONS.md`](./CONVENTIONS.md) |
| `[AGENT-4]` | `[review]` | [`CONVENTIONS.md`](./CONVENTIONS.md) |
| `[BOUND-2]` | `[review]` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| `[COMPOSE-1]` | `[review]` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| `[MODEL-1]` | `[review]` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| `[TEST-1]` | `[review]` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| `[VER-3]` | `[review]` | [`CONVENTIONS.md`](./CONVENTIONS.md) |
| `[VER-5]` | `[auto]` | [`CONVENTIONS.md`](./CONVENTIONS.md) |
| `[XCUT-1]` | `[review]` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |

### framework-governance

9 rules — framework governance.

| Rule | Class | Defined in |
| --- | --- | --- |
| `[AGENT-1]` | `[guide]` | [`CONVENTIONS.md`](./CONVENTIONS.md) |
| `[AGENT-3]` | `[guide]` | [`CONVENTIONS.md`](./CONVENTIONS.md) |
| `[AGENT-5]` | `[review]` | [`CONVENTIONS.md`](./CONVENTIONS.md) |
| `[SCOPE-1]` | `[guide]` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| `[SCOPE-2]` | `[guide]` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| `[SCOPE-4]` | `[guide]` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| `[VER-1]` | `[auto]` | [`CONVENTIONS.md`](./CONVENTIONS.md) |
| `[VER-2]` | `[review]` | [`CONVENTIONS.md`](./CONVENTIONS.md) |
| `[VER-4]` | `[auto]` | [`CONVENTIONS.md`](./CONVENTIONS.md) |

### production-baseline

88 rules — production baseline.

| Rule | Class | Defined in |
| --- | --- | --- |
| `[BOUND-1]` | `[guide]` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| `[BOUND-3]` | `[review]` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| `[BOUND-4]` | `[guide]` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| `[BOUND-5]` | `[review]` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| `[BUCKET-1]` | `[auto]` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| `[BUCKET-2]` | `[guide]` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| `[CHAN-1]` | `[review]` | [`SYSTEM.md`](./SYSTEM.md) |
| `[CHAN-10]` | `[review]` | [`SYSTEM.md`](./SYSTEM.md) |
| `[CHAN-2]` | `[guide]` | [`SYSTEM.md`](./SYSTEM.md) |
| `[CHAN-3]` | `[auto]` | [`SYSTEM.md`](./SYSTEM.md) |
| `[CHAN-4]` | `[review]` | [`SYSTEM.md`](./SYSTEM.md) |
| `[CHAN-5]` | `[review]` | [`SYSTEM.md`](./SYSTEM.md) |
| `[CHAN-6]` | `[review]` | [`SYSTEM.md`](./SYSTEM.md) |
| `[CHAN-7]` | `[review]` | [`SYSTEM.md`](./SYSTEM.md) |
| `[CHAN-8]` | `[review]` | [`SYSTEM.md`](./SYSTEM.md) |
| `[CHAN-9]` | `[review]` | [`SYSTEM.md`](./SYSTEM.md) |
| `[COMPOSE-2]` | `[review]` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| `[COMPOSE-3]` | `[review]` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| `[COMPOSE-4]` | `[review]` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| `[CONC-1]` | `[auto]` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| `[CONC-2]` | `[review]` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| `[CONC-3]` | `[review]` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| `[CONC-4]` | `[review]` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| `[CONC-5]` | `[guide]` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| `[CONFIG-1]` | `[review]` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| `[CONFIG-2]` | `[auto]` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| `[CONFIG-3]` | `[review]` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| `[CONFIG-4]` | `[auto]` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| `[CONTRACT-1]` | `[review]` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| `[CONTRACT-2]` | `[review]` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| `[DUP-1]` | `[guide]` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| `[DUP-2]` | `[review]` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| `[DUP-3]` | `[review]` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| `[DUP-4]` | `[review]` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| `[EFFECT-1]` | `[review]` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| `[EFFECT-2]` | `[review]` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| `[EFFECT-3]` | `[guide]` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| `[EFFECT-4]` | `[review]` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| `[ERR-1]` | `[review]` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| `[ERR-2]` | `[auto]` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| `[ERR-3]` | `[review]` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| `[ERR-4]` | `[review]` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| `[GROW-1]` | `[guide]` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| `[GROW-2]` | `[review]` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| `[GROW-3]` | `[review]` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| `[IDEM-1]` | `[review]` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| `[IDEM-2]` | `[auto]` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| `[IDEM-3]` | `[review]` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| `[IDEM-4]` | `[review]` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| `[IDEM-5]` | `[review]` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| `[IDEM-6]` | `[review]` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| `[MODEL-2]` | `[review]` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| `[MODEL-3]` | `[guide]` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| `[MODEL-4]` | `[review]` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| `[OBS-1]` | `[guide]` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| `[OBS-2]` | `[review]` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| `[OBS-3]` | `[review]` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| `[ORCH-1]` | `[review]` | [`SYSTEM.md`](./SYSTEM.md) |
| `[ORCH-2]` | `[review]` | [`SYSTEM.md`](./SYSTEM.md) |
| `[ORCH-3]` | `[guide]` | [`SYSTEM.md`](./SYSTEM.md) |
| `[ROOT-1]` | `[review]` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| `[ROOT-2]` | `[auto]` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| `[ROOT-3]` | `[guide]` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| `[SCOPE-3]` | `[review]` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| `[STATE-1]` | `[review]` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| `[STATE-2]` | `[auto]` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| `[STATE-3]` | `[guide]` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| `[STATE-4]` | `[review]` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| `[STATE-5]` | `[review]` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| `[STATE-6]` | `[review]` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| `[STATE-7]` | `[review]` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| `[STRUCT-1]` | `[auto]` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| `[STRUCT-2]` | `[review]` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| `[STRUCT-3]` | `[auto]` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| `[SYS-TEST-1]` | `[review]` | [`SYSTEM.md`](./SYSTEM.md) |
| `[SYS-TEST-2]` | `[review]` | [`SYSTEM.md`](./SYSTEM.md) |
| `[SYS-TEST-3]` | `[review]` | [`SYSTEM.md`](./SYSTEM.md) |
| `[SYS-TEST-4]` | `[guide]` | [`SYSTEM.md`](./SYSTEM.md) |
| `[SYS-TEST-5]` | `[review]` | [`SYSTEM.md`](./SYSTEM.md) |
| `[TEST-2]` | `[review]` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| `[TEST-3]` | `[review]` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| `[TEST-4]` | `[review]` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| `[TRUST-1]` | `[review]` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| `[TRUST-2]` | `[review]` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| `[XCUT-2]` | `[auto]` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| `[XCUT-3]` | `[review]` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| `[XCUT-4]` | `[guide]` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| `[XCUT-5]` | `[review]` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |

### app-profile

56 rules — app profile, by profile.

#### backend

8 rules — `{app:backend}`.

| Rule | Class | Defined in |
| --- | --- | --- |
| `[BE-1]` | `[review]` | [`appendix/backend.md`](./appendix/backend.md) |
| `[BE-2]` | `[review]` | [`appendix/backend.md`](./appendix/backend.md) |
| `[BE-3]` | `[review]` | [`appendix/backend.md`](./appendix/backend.md) |
| `[BE-4]` | `[review]` | [`appendix/backend.md`](./appendix/backend.md) |
| `[BE-5]` | `[auto]` | [`appendix/backend.md`](./appendix/backend.md) |
| `[BE-6]` | `[review]` | [`appendix/backend.md`](./appendix/backend.md) |
| `[BE-7]` | `[review]` | [`appendix/backend.md`](./appendix/backend.md) |
| `[BE-8]` | `[review]` | [`appendix/backend.md`](./appendix/backend.md) |

#### cli

11 rules — `{app:cli}`.

| Rule | Class | Defined in |
| --- | --- | --- |
| `[CLI-1]` | `[review]` | [`appendix/cli.md`](./appendix/cli.md) |
| `[CLI-10]` | `[auto]` | [`appendix/cli.md`](./appendix/cli.md) |
| `[CLI-11]` | `[auto]` | [`appendix/cli.md`](./appendix/cli.md) |
| `[CLI-2]` | `[review]` | [`appendix/cli.md`](./appendix/cli.md) |
| `[CLI-3]` | `[auto]` | [`appendix/cli.md`](./appendix/cli.md) |
| `[CLI-4]` | `[review]` | [`appendix/cli.md`](./appendix/cli.md) |
| `[CLI-5]` | `[guide]` | [`appendix/cli.md`](./appendix/cli.md) |
| `[CLI-6]` | `[auto]` | [`appendix/cli.md`](./appendix/cli.md) |
| `[CLI-7]` | `[guide]` | [`appendix/cli.md`](./appendix/cli.md) |
| `[CLI-8]` | `[auto]` | [`appendix/cli.md`](./appendix/cli.md) |
| `[CLI-9]` | `[review]` | [`appendix/cli.md`](./appendix/cli.md) |

#### gh-action

12 rules — `{app:gh-action}`.

| Rule | Class | Defined in |
| --- | --- | --- |
| `[GHA-1]` | `[review]` | [`appendix/gh-action.md`](./appendix/gh-action.md) |
| `[GHA-10]` | `[auto]` | [`appendix/gh-action.md`](./appendix/gh-action.md) |
| `[GHA-11]` | `[review]` | [`appendix/gh-action.md`](./appendix/gh-action.md) |
| `[GHA-12]` | `[review]` | [`appendix/gh-action.md`](./appendix/gh-action.md) |
| `[GHA-2]` | `[review]` | [`appendix/gh-action.md`](./appendix/gh-action.md) |
| `[GHA-3]` | `[auto]` | [`appendix/gh-action.md`](./appendix/gh-action.md) |
| `[GHA-4]` | `[review]` | [`appendix/gh-action.md`](./appendix/gh-action.md) |
| `[GHA-5]` | `[review]` | [`appendix/gh-action.md`](./appendix/gh-action.md) |
| `[GHA-6]` | `[review]` | [`appendix/gh-action.md`](./appendix/gh-action.md) |
| `[GHA-7]` | `[review]` | [`appendix/gh-action.md`](./appendix/gh-action.md) |
| `[GHA-8]` | `[guide]` | [`appendix/gh-action.md`](./appendix/gh-action.md) |
| `[GHA-9]` | `[review]` | [`appendix/gh-action.md`](./appendix/gh-action.md) |

#### library

13 rules — `{app:library}`.

| Rule | Class | Defined in |
| --- | --- | --- |
| `[LIB-1]` | `[review]` | [`appendix/library.md`](./appendix/library.md) |
| `[LIB-10]` | `[review]` | [`appendix/library.md`](./appendix/library.md) |
| `[LIB-11]` | `[review]` | [`appendix/library.md`](./appendix/library.md) |
| `[LIB-12]` | `[guide]` | [`appendix/library.md`](./appendix/library.md) |
| `[LIB-13]` | `[review]` | [`appendix/library.md`](./appendix/library.md) |
| `[LIB-2]` | `[review]` | [`appendix/library.md`](./appendix/library.md) |
| `[LIB-3]` | `[auto]` | [`appendix/library.md`](./appendix/library.md) |
| `[LIB-4]` | `[review]` | [`appendix/library.md`](./appendix/library.md) |
| `[LIB-5]` | `[auto]` | [`appendix/library.md`](./appendix/library.md) |
| `[LIB-6]` | `[review]` | [`appendix/library.md`](./appendix/library.md) |
| `[LIB-7]` | `[review]` | [`appendix/library.md`](./appendix/library.md) |
| `[LIB-8]` | `[review]` | [`appendix/library.md`](./appendix/library.md) |
| `[LIB-9]` | `[review]` | [`appendix/library.md`](./appendix/library.md) |

#### web

12 rules — `{app:web}`.

| Rule | Class | Defined in |
| --- | --- | --- |
| `[WEB-1]` | `[review]` | [`appendix/web.md`](./appendix/web.md) |
| `[WEB-10]` | `[review]` | [`appendix/web.md`](./appendix/web.md) |
| `[WEB-11]` | `[review]` | [`appendix/web.md`](./appendix/web.md) |
| `[WEB-12]` | `[review]` | [`appendix/web.md`](./appendix/web.md) |
| `[WEB-2]` | `[guide]` | [`appendix/web.md`](./appendix/web.md) |
| `[WEB-3]` | `[review]` | [`appendix/web.md`](./appendix/web.md) |
| `[WEB-4]` | `[auto]` | [`appendix/web.md`](./appendix/web.md) |
| `[WEB-5]` | `[review]` | [`appendix/web.md`](./appendix/web.md) |
| `[WEB-6]` | `[guide]` | [`appendix/web.md`](./appendix/web.md) |
| `[WEB-7]` | `[review]` | [`appendix/web.md`](./appendix/web.md) |
| `[WEB-8]` | `[auto]` | [`appendix/web.md`](./appendix/web.md) |
| `[WEB-9]` | `[auto]` | [`appendix/web.md`](./appendix/web.md) |

### language-binding

0 rules — language binding.

### runtime-agent-profile

16 rules — runtime-agent profile.

| Rule | Class | Defined in |
| --- | --- | --- |
| `[AGENTIC-1]` | `[guide]` | [`appendix/agentic-app.md`](./appendix/agentic-app.md) |
| `[AGENTIC-10]` | `[review]` | [`appendix/agentic-app.md`](./appendix/agentic-app.md) |
| `[AGENTIC-11]` | `[review]` | [`appendix/agentic-app.md`](./appendix/agentic-app.md) |
| `[AGENTIC-12]` | `[review]` | [`appendix/agentic-app.md`](./appendix/agentic-app.md) |
| `[AGENTIC-13]` | `[review]` | [`appendix/agentic-app.md`](./appendix/agentic-app.md) |
| `[AGENTIC-2]` | `[guide]` | [`appendix/agentic-app.md`](./appendix/agentic-app.md) |
| `[AGENTIC-3]` | `[review]` | [`appendix/agentic-app.md`](./appendix/agentic-app.md) |
| `[AGENTIC-4]` | `[review]` | [`appendix/agentic-app.md`](./appendix/agentic-app.md) |
| `[AGENTIC-5]` | `[review]` | [`appendix/agentic-app.md`](./appendix/agentic-app.md) |
| `[AGENTIC-6]` | `[guide]` | [`appendix/agentic-app.md`](./appendix/agentic-app.md) |
| `[AGENTIC-7]` | `[review]` | [`appendix/agentic-app.md`](./appendix/agentic-app.md) |
| `[AGENTIC-8]` | `[review]` | [`appendix/agentic-app.md`](./appendix/agentic-app.md) |
| `[AGENTIC-9]` | `[review]` | [`appendix/agentic-app.md`](./appendix/agentic-app.md) |
| `[ORCH-4]` | `[review]` | [`SYSTEM.md`](./SYSTEM.md) |
| `[ORCH-5]` | `[review]` | [`SYSTEM.md`](./SYSTEM.md) |
| `[ORCH-6]` | `[review]` | [`SYSTEM.md`](./SYSTEM.md) |

## Coral Architecture — Conventions

10 rules — [`CONVENTIONS.md`](./CONVENTIONS.md)

| Rule | Class | Layer | Statement |
| --- | --- | --- | --- |
| `[AGENT-1]` | `[guide]` | framework governance | Prefer the structure that minimizes an agent's placement and cross-file-reasoning decisions, even at the cost of some duplication. |
| `[AGENT-2]` | `[review]` | kernel | Flag, don't guess: take the reversible option, mark it, surface it for human review. |
| `[AGENT-3]` | `[guide]` | framework governance | Do not over-comply literally. |
| `[AGENT-4]` | `[review]` | kernel | Never author an exception or an extension; a human decides and records. |
| `[AGENT-5]` | `[review]` | framework governance | Read the project's `CORAL.md` before escalating; a documented decision is settled. |
| `[VER-1]` | `[auto]` | framework governance | Rule IDs are append-only: never renumbered, recycled, or removed. |
| `[VER-2]` | `[review]` | framework governance | Adding, tightening, or retiring a rule is a major version; loosening or clarifying is minor. |
| `[VER-3]` | `[review]` | kernel | State the Coral version a project targets; audit against that version. |
| `[VER-4]` | `[auto]` | framework governance | Namespace a project's own rule IDs by project prefix; never reuse a Coral family name. |
| `[VER-5]` | `[auto]` | kernel | Record exceptions and extensions in `CORAL.md` as machine-readable entries naming a rule ID and a scoped path. |

## Coral Architecture — the App

78 rules — [`ARCHITECTURE.md`](./ARCHITECTURE.md)

| Rule | Class | Layer | Statement |
| --- | --- | --- | --- |
| `[SCOPE-1]` | `[guide]` | framework governance | This architecture covers command/request-shaped apps with loosely-coupled features, where each feature is largely its own world. |
| `[SCOPE-2]` | `[guide]` | framework governance | It is weak for dense, deeply-coupled domains where every feature reaches into one large central concept. |
| `[SCOPE-3]` | `[review]` | production baseline | When features converge on one dense concept, give it its own app behind a published contract. |
| `[SCOPE-4]` | `[guide]` | framework governance | What happens *after* the split is not in this document. |
| `[MODEL-1]` | `[review]` | kernel | Every unit of code is a slice, a crosscut, an adapter, the composition root, or a published contract. |
| `[MODEL-2]` | `[review]` | production baseline | Name every package for the capability or concern it owns, never for its technical role. |
| `[MODEL-3]` | `[guide]` | production baseline | A crosscut's decisive property is defined once, injected many. |
| `[MODEL-4]` | `[review]` | production baseline | An adapter implements a slice-declared port: infrastructure only, arrow inward, wired by the root, no behavior. |
| `[BOUND-1]` | `[guide]` | production baseline | A slice handles one inbound request or trigger, end to end. |
| `[BOUND-2]` | `[review]` | kernel | One request/trigger — or a very tight pair — per slice, owned end to end. |
| `[BOUND-3]` | `[review]` | production baseline | Use the boundary form the appendix fixes; do not invent a new one. |
| `[BOUND-4]` | `[guide]` | production baseline | "Continuous" or "real-time" work is not a new boundary kind. |
| `[BOUND-5]` | `[review]` | production baseline | A scheduled/background trigger is a slice: observable outcome, overlap-safe, tested. |
| `[ROOT-1]` | `[review]` | production baseline | Keep the root thin: register, construct, inject, bootstrap. No business logic. |
| `[ROOT-2]` | `[auto]` | production baseline | The root imports no persistence or domain-internal module. |
| `[ROOT-3]` | `[guide]` | production baseline | Each appendix names its root form — including the app types that have no root of their own: for a library the *consumer* is the composition root, so the package exposes capabilities and lets the consumer wire them. |
| `[STRUCT-1]` | `[auto]` | production baseline | Colocate tests, or mirror the package structure where colocation is impossible. |
| `[STRUCT-2]` | `[review]` | production baseline | Put slices in concrete, domain-oriented feature packages; the package owns its capability's state. |
| `[STRUCT-3]` | `[auto]` | production baseline | Keep root-level crosscuts rare and precisely named. |
| `[BUCKET-1]` | `[auto]` | production baseline | Do not create or expand `shared`/`common`/`utils`/`helpers`/`services`/`repository`/generic `models`. |
| `[BUCKET-2]` | `[guide]` | production baseline | Generic catch-all names destroy locality and predictability. |
| `[XCUT-1]` | `[review]` | kernel | Promote to a crosscut only when it is genuinely cross-cutting AND enforces a must-not-diverge invariant. |
| `[XCUT-2]` | `[auto]` | production baseline | Give every crosscut a precise domain or infrastructure name. |
| `[XCUT-3]` | `[review]` | production baseline | Inject crosscuts; consume their published surface, never their internals. |
| `[XCUT-4]` | `[guide]` | production baseline | A crosscut is the *first line* of drift control. |
| `[XCUT-5]` | `[review]` | production baseline | A domain entity may be a crosscut only as type + invariants — never its queries or storage. |
| `[DUP-1]` | `[guide]` | production baseline | Small duplication across slices is acceptable and often preferred; do not extract merely to save lines. |
| `[DUP-2]` | `[review]` | production baseline | Do not extract on similarity alone; similarity is not a shared concept. |
| `[DUP-3]` | `[review]` | production baseline | Extract only to enforce an invariant or convention, provide named infrastructure, or clarify a real calculation. |
| `[DUP-4]` | `[review]` | production baseline | Apply the Extraction Test before extracting. |
| `[COMPOSE-1]` | `[review]` | kernel | Do not reach into another slice's internals; depend on its published capability. |
| `[COMPOSE-2]` | `[review]` | production baseline | Prefer injecting a capability through the root over a slice-to-slice import. |
| `[COMPOSE-3]` | `[review]` | production baseline | A shared multi-step workflow is a candidate crosscut, not a `services` bucket. |
| `[COMPOSE-4]` | `[review]` | production baseline | Read fan-in is a legitimate slice, provided it uses published capabilities only. |
| `[EFFECT-1]` | `[review]` | production baseline | Keep parsing, validation, normalization, calculation, and output shaping pure. |
| `[EFFECT-2]` | `[review]` | production baseline | Keep side effects at the edges. |
| `[EFFECT-3]` | `[guide]` | production baseline | The preferred slice flow is parse → validate → compute → persist/effect → render; do not intermingle calculation and side effects unnecessarily. |
| `[EFFECT-4]` | `[review]` | production baseline | Do not extract a function only to make it pure or testable. |
| `[STATE-1]` | `[review]` | production baseline | Keep state-access logic local to the slice that owns it. |
| `[STATE-2]` | `[auto]` | production baseline | Do not create a shared repository or data-access layer. |
| `[STATE-3]` | `[guide]` | production baseline | A shared persistence layer accumulates special cases and forces cross-slice reasoning on every change; local ownership keeps each slice independently changeable. |
| `[STATE-4]` | `[review]` | production baseline | The slice that computes derived state owns it; write it from a set-/event-named handler. |
| `[STATE-5]` | `[review]` | production baseline | One owning feature package per table/file/bucket, schema defined once inside it; siblings reach it directly, outsiders via a published capability. |
| `[STATE-6]` | `[review]` | production baseline | A cache is never a source of truth; every read path must be correct with it empty. |
| `[STATE-7]` | `[review]` | production baseline | Name the cache's invalidation strategy — TTL, write-through, or event-driven. |
| `[CONC-1]` | `[auto]` | production baseline | A slice holds no mutable state between triggers. |
| `[CONC-2]` | `[review]` | production baseline | Every crosscut is explicitly shared-and-concurrency-safe or constructed per trigger. |
| `[CONC-3]` | `[review]` | production baseline | Name the strategy where two triggers can write the same state: serialize, compare-and-set, or commute. |
| `[CONC-4]` | `[review]` | production baseline | Scope a transaction to one trigger; never hold it across an external call. |
| `[CONC-5]` | `[guide]` | production baseline | The architecture's concurrency default is *one trigger, one thread of control, no shared mutable state*. |
| `[CONFIG-1]` | `[review]` | production baseline | Resolve, validate, and inject configuration at the root as a crosscut. |
| `[CONFIG-2]` | `[auto]` | production baseline | No slice reads the environment, a config file, or a global settings object directly. |
| `[CONFIG-3]` | `[review]` | production baseline | Validate every required setting at construction; fail startup, not first use. |
| `[CONFIG-4]` | `[auto]` | production baseline | Read secrets only through the config crosscut; never inline, log, or publish them. |
| `[IDEM-1]` | `[review]` | production baseline | The name signals the effect; the implementation matches it. |
| `[IDEM-2]` | `[auto]` | production baseline | A read-named slice contains no write or mutation call, including a cache write. |
| `[IDEM-3]` | `[review]` | production baseline | Do not make a non-idempotent operation idempotent without renaming it. |
| `[IDEM-4]` | `[review]` | production baseline | Never auto-retry a non-idempotent mutation. |
| `[IDEM-5]` | `[review]` | production baseline | On an at-least-once platform, a mutating handler must be idempotent. |
| `[IDEM-6]` | `[review]` | production baseline | Classify an unlisted verb by its effect and name it truthfully; flag an unclear effect. |
| `[ERR-1]` | `[review]` | production baseline | Use the six-category taxonomy, defined once as a crosscut. |
| `[ERR-2]` | `[auto]` | production baseline | Raise `{category, code, message}` using the enum; slices own their `code` strings. |
| `[ERR-3]` | `[review]` | production baseline | Slices raise; the root renders; nothing else renders. |
| `[ERR-4]` | `[review]` | production baseline | Batch operations are all-or-nothing unless partial outcomes are reported explicitly. |
| `[OBS-1]` | `[guide]` | production baseline | Diagnostics are opt-in, off the data path, and never part of the machine contract. |
| `[OBS-2]` | `[review]` | production baseline | Configure observability at the root; emit through the injected crosscut. |
| `[OBS-3]` | `[review]` | production baseline | Keep diagnostics off the machine-readable contract channel. |
| `[CONTRACT-1]` | `[review]` | production baseline | Keep the public contract stable, explicit, fully typed, and undecorated. |
| `[CONTRACT-2]` | `[review]` | production baseline | Version public-contract changes per the app type's discipline. |
| `[TRUST-1]` | `[review]` | production baseline | Validate and authorize untrusted input at the boundary. |
| `[TRUST-2]` | `[review]` | production baseline | State the app's trust boundary explicitly, however minimal. |
| `[TEST-1]` | `[review]` | kernel | Behavior-first: exercise the entry point, assert the observable contract, real infra, minimal mocking. |
| `[TEST-2]` | `[review]` | production baseline | Prefer integration and end-to-end tests over isolated unit tests. |
| `[TEST-3]` | `[review]` | production baseline | Unit tests are a scalpel; never duplicate integration coverage; never extract just to test. |
| `[TEST-4]` | `[review]` | production baseline | Assert contract, errors, idempotency, transactions, authorization, and diagnostics where relevant. |
| `[GROW-1]` | `[guide]` | production baseline | Start small: prefer one file per slice initially. |
| `[GROW-2]` | `[review]` | production baseline | Answer file growth by splitting inside the slice, never with a global abstraction. |
| `[GROW-3]` | `[review]` | production baseline | Treat domain densification as a split signal, not a refactor-into-a-shared-core signal. |

## Coral Architecture — the System

21 rules — [`SYSTEM.md`](./SYSTEM.md)

| Rule | Class | Layer | Statement |
| --- | --- | --- | --- |
| `[CHAN-1]` | `[review]` | production baseline | Cross an app boundary only through a published channel contract. |
| `[CHAN-2]` | `[guide]` | production baseline | A channel is one of three forms, chosen per relationship: a synchronous API contract, an event, or a message bus. |
| `[CHAN-3]` | `[auto]` | production baseline | Never share a datastore between apps. |
| `[CHAN-4]` | `[review]` | production baseline | Version the channel contract; add freely, never repurpose, deprecate before removing. |
| `[CHAN-5]` | `[review]` | production baseline | Make event/message consumers idempotent; never auto-retry a non-idempotent sync call. |
| `[CHAN-6]` | `[review]` | production baseline | Never let errors cross the channel as exceptions; dead-letter the un-processable. |
| `[CHAN-7]` | `[review]` | production baseline | Propagate the correlation/trace id across the channel, in metadata not payload. |
| `[CHAN-8]` | `[review]` | production baseline | Authenticate the caller/message and validate every inbound channel payload. |
| `[CHAN-9]` | `[review]` | production baseline | Make consumers that mutate shared state safe under concurrent and out-of-order delivery. |
| `[CHAN-10]` | `[review]` | production baseline | Never assume a transactional view spanning two apps; state how a cross-app computation handles the skew. |
| `[ORCH-1]` | `[review]` | production baseline | Put topology in the orchestration layer; keep business logic out of the wiring. |
| `[ORCH-2]` | `[review]` | production baseline | Keep apps peer-agnostic: publish and consume capabilities, never hard-code peers. |
| `[ORCH-3]` | `[guide]` | production baseline | Each app is independently deployable and independently observable. |
| `[ORCH-4]` | `[review]` | runtime-agent profile | Let an agent orchestrate only from inside a harness, never as a bare model. |
| `[ORCH-5]` | `[review]` | runtime-agent profile | Give the harness only published channel capabilities as tools; authorize every call and gate irreversible ones absent bounded pre-authorization. |
| `[ORCH-6]` | `[review]` | runtime-agent profile | Treat the orchestrating harness as an app: its own contract, observability, and tests. |
| `[SYS-TEST-1]` | `[review]` | production baseline | Verify each side independently against the shared contract, not by booting both apps. |
| `[SYS-TEST-2]` | `[review]` | production baseline | Give every consumed channel relationship executable compatibility verification; consumer-driven contracts are one technique. |
| `[SYS-TEST-3]` | `[review]` | production baseline | Gate producer releases on provider verification against consumer contracts. |
| `[SYS-TEST-4]` | `[guide]` | production baseline | Contract testing is tool-agnostic in principle; pick concrete tooling per stack. |
| `[SYS-TEST-5]` | `[review]` | production baseline | Keep integrated end-to-end suites tiny; they backstop contract tests, never replace them. |

## Appendix: Agentic App  (ADDENDUM)

13 rules — [`appendix/agentic-app.md`](./appendix/agentic-app.md)

| Rule | Class | Layer | Statement |
| --- | --- | --- | --- |
| `[AGENTIC-1]` | `[guide]` | runtime-agent profile | The boundary is one turn, task, or agent-invocation — a user message, or a goal handed to the agent. |
| `[AGENTIC-2]` | `[guide]` | runtime-agent profile | Distinguish two intensities. |
| `[AGENTIC-3]` | `[review]` | runtime-agent profile | Treat the model as an injected effect; keep prompt-building and output-parsing pure. |
| `[AGENTIC-4]` | `[review]` | runtime-agent profile | Force a schema on model output; the contract is schema conformance plus observed tool calls, never the text. |
| `[AGENTIC-5]` | `[review]` | runtime-agent profile | Run an autonomous or looping agent only inside a harness: typed tools, authorization, risk-based gating against explicit policy, observation, bounds. |
| `[AGENTIC-6]` | `[guide]` | runtime-agent profile | The agent is the non-deterministic *core*; the harness is the deterministic *shell*. |
| `[AGENTIC-7]` | `[review]` | runtime-agent profile | Treat history, memory, and retrieval as state: slice-owned, or a precisely-named retrieval crosscut. |
| `[AGENTIC-8]` | `[review]` | runtime-agent profile | Dedupe a mutating agent by storing the first result keyed to the request; never re-run to recover. |
| `[AGENTIC-13]` | `[review]` | runtime-agent profile | Give every side-effecting tool its own replay protection — key, natural key, or ledger; the stored result is not one. |
| `[AGENTIC-9]` | `[review]` | runtime-agent profile | Map model failures to the taxonomy, bound schema repair then fail, and never accept malformed output. |
| `[AGENTIC-10]` | `[review]` | runtime-agent profile | Treat prompt input and model output as untrusted, default-deny dangerous tools, keep secrets out of prompts entirely, and minimize/redact/retain personal data. |
| `[AGENTIC-12]` | `[review]` | runtime-agent profile | Pin the model identifier and version the prompt; record both with each result and re-run evals before either changes. |
| `[AGENTIC-11]` | `[review]` | runtime-agent profile | Test the deterministic parts normally, agent behavior by conformance and evals, and harness safety; never exact-match model text. |

## Appendix: Backend / Service

8 rules — [`appendix/backend.md`](./appendix/backend.md)

| Rule | Class | Layer | Statement |
| --- | --- | --- | --- |
| `[BE-1]` | `[review]` | app profile · backend | One slice per business operation, named for the singular capability plus its effect verb; the route is its trigger. |
| `[BE-2]` | `[review]` | app profile · backend | The contract is status code + response body + observable side effects: `201` create, `200` read, `204` no body. |
| `[BE-3]` | `[review]` | app profile · backend | Wire router, middleware, and injection at the root; crosscuts are singletons, only request-bound state is per-request. |
| `[BE-4]` | `[review]` | app profile · backend | A synchronous `POST` may offer an idempotency key; any platform-redelivered handler must be idempotent. |
| `[BE-5]` | `[auto]` | app profile · backend | Slices raise the taxonomy; one root middleware renders the body and maps `category` → HTTP status. |
| `[BE-6]` | `[review]` | app profile · backend | Authenticate and coarsely authorize at the boundary; scope every query by owner/tenant id, default to deny. |
| `[BE-8]` | `[review]` | app profile · backend | Render authn/authz failures at the boundary, not through the taxonomy: `401` unauthenticated, `403` no capability, `404` scoped miss. |
| `[BE-7]` | `[review]` | app profile · backend | Pick one API versioning strategy and apply it system-wide — URL prefix by default; advance it only for a breaking change. |

## Appendix: CLI

11 rules — [`appendix/cli.md`](./appendix/cli.md)

| Rule | Class | Layer | Statement |
| --- | --- | --- | --- |
| `[CLI-1]` | `[review]` | app profile · cli | Normal output goes to `stdout`; errors and diagnostics go to `stderr`. |
| `[CLI-2]` | `[review]` | app profile · cli | Failures return non-zero exit codes. |
| `[CLI-3]` | `[auto]` | app profile · cli | Read commands must support `--json` on `stdout`; mutations may, and if they do they follow `[CLI-4]`. |
| `[CLI-4]` | `[review]` | app profile · cli | Keep `--json` stable across patch releases, fully typed, and free of color, progress, or decoration. |
| `[CLI-5]` | `[guide]` | app profile · cli | Commands are narrow, explicit, composable, and script-friendly. |
| `[CLI-6]` | `[auto]` | app profile · cli | No interactive prompts by default. |
| `[CLI-7]` | `[guide]` | app profile · cli | Command names are stable and predictable. |
| `[CLI-8]` | `[auto]` | app profile · cli | Exit `0` on success, `2` on usage error, `1` on every other failure. |
| `[CLI-9]` | `[review]` | app profile · cli | Use stable string `code`s on `stderr` for finer scripting precision, not a wider exit-code matrix. |
| `[CLI-10]` | `[auto]` | app profile · cli | Configure debug mode as one global flag at the root; slices never configure tracing themselves. |
| `[CLI-11]` | `[auto]` | app profile · cli | Send trace output to `stderr`, stay quiet by default, and never pollute `--json` on `stdout`. |

## Appendix: GitHub Action / Tool

12 rules — [`appendix/gh-action.md`](./appendix/gh-action.md)

| Rule | Class | Layer | Statement |
| --- | --- | --- | --- |
| `[GHA-1]` | `[review]` | app profile · gh-action | One action run is one slice: one trigger, handled end to end. |
| `[GHA-2]` | `[review]` | app profile · gh-action | The contract is declared outputs + exit status + annotations; log text is not a contract. |
| `[GHA-3]` | `[auto]` | app profile · gh-action | Declare every output the action writes in `action.yml`, and rely on no undeclared output. |
| `[GHA-4]` | `[review]` | app profile · gh-action | The entry point is the root: validate inputs and environment there, inject, dispatch, render. No business logic. |
| `[GHA-5]` | `[review]` | app profile · gh-action | Make every mutating run safe under redelivery, via an idempotency key, a natural key, or check-before-write. |
| `[GHA-6]` | `[review]` | app profile · gh-action | Treat the event payload as attacker-controlled; pass untrusted values through `env:`, never into a `run:` body. |
| `[GHA-7]` | `[review]` | app profile · gh-action | Declare `permissions:` explicitly and scope them to the run, default to read-only, and never write a secret to an output. |
| `[GHA-8]` | `[guide]` | app profile · gh-action | Pin third-party actions you call by commit SHA, not by a moving tag. |
| `[GHA-9]` | `[review]` | app profile · gh-action | Map `category` → exit status and annotation at the entry point, distinguish recoverable from not, never exit `0` on failure. |
| `[GHA-10]` | `[auto]` | app profile · gh-action | Keep diagnostics in log groups and annotations, never on the outputs surface; report no-ops explicitly. |
| `[GHA-11]` | `[review]` | app profile · gh-action | Treat input and output names as the versioned contract: add freely, never repurpose, deprecate before removing. |
| `[GHA-12]` | `[review]` | app profile · gh-action | Exercise the entry point with simulated inputs and hostile payload fixtures, and assert a repeated run is a no-op. |

## Appendix: Library / Package

13 rules — [`appendix/library.md`](./appendix/library.md)

| Rule | Class | Layer | Statement |
| --- | --- | --- | --- |
| `[LIB-1]` | `[review]` | app profile · library | One public capability is one slice, owned end to end with its validation, behavior, and tests. |
| `[LIB-2]` | `[review]` | app profile · library | The contract is the public API surface: exported signatures, return values, raised error types, exported types. |
| `[LIB-3]` | `[auto]` | app profile · library | No ambient state: no hidden singletons, no package-level mutables, no side effects on import. |
| `[LIB-4]` | `[review]` | app profile · library | Accept dependencies; never reach for them. A library never reads the environment or a config file. |
| `[LIB-5]` | `[auto]` | app profile · library | Never write to `stdout`/`stderr` and never install global handlers; the default diagnostic is silence. |
| `[LIB-6]` | `[review]` | app profile · library | Prefer pure functions and push every effect to a consumer-provided interface. |
| `[LIB-7]` | `[review]` | app profile · library | Encode effect semantics in the name, and document idempotency and retry stance for anything doing I/O. |
| `[LIB-8]` | `[review]` | app profile · library | Raise typed taxonomy errors and never render; the consumer is the root and decides presentation. |
| `[LIB-9]` | `[review]` | app profile · library | Accept an injected logger or hook, define its no-op default, and keep the interface minimal. |
| `[LIB-10]` | `[review]` | app profile · library | Validate inputs at the public API boundary, and state the trust assumption explicitly. |
| `[LIB-11]` | `[review]` | app profile · library | Follow semver; add freely, never repurpose, deprecate before removing. |
| `[LIB-12]` | `[guide]` | app profile · library | Minimize dependencies: every dependency you take, your consumers take transitively, along with its vulnerabilities, its version constraints, and its own transitive set. |
| `[LIB-13]` | `[review]` | app profile · library | Test as a consumer would: public API only, plus one test constructing the library twice with different configuration. |

## Appendix: Web App

12 rules — [`appendix/web.md`](./appendix/web.md)

| Rule | Class | Layer | Statement |
| --- | --- | --- | --- |
| `[WEB-1]` | `[review]` | app profile · web | A slice is one route/page-action/endpoint, with its UI and its handler in the same slice. |
| `[WEB-2]` | `[guide]` | app profile · web | Microfrontends are an escalation pattern, not the default. |
| `[WEB-3]` | `[review]` | app profile · web | Keep the composition shell to layout and routing; it mounts slices and holds no business logic. |
| `[WEB-4]` | `[auto]` | app profile · web | Depend only on another slice's published surface: a typed import when integrated, a channel with no import edge when runtime-isolated. |
| `[WEB-5]` | `[review]` | app profile · web | Define design tokens, primitives, and interaction patterns once as an injected crosscut. |
| `[WEB-6]` | `[guide]` | app profile · web | The default web architecture is a single integrated frontend organized internally by capability slice, consuming the design-system crosscut. |
| `[WEB-7]` | `[review]` | app profile · web | Treat the client as hostile: authorize at the server boundary, validate every payload, keep secrets server-side. |
| `[WEB-8]` | `[auto]` | app profile · web | Follow HTTP method semantics: `GET`/`HEAD` safe and read-only, `POST` non-idempotent, `PUT`/`DELETE` idempotent. |
| `[WEB-9]` | `[auto]` | app profile · web | Slices raise the taxonomy; a root middleware renders to the right surface — error view or structured body. |
| `[WEB-10]` | `[review]` | app profile · web | Treat the route/URL structure as the stable contract: never break a route, never silently repurpose one. |
| `[WEB-11]` | `[review]` | app profile · web | Server state is the source of truth; client state is a slice-owned cache, and the mutating slice invalidates it. |
| `[WEB-12]` | `[review]` | app profile · web | Drive a web slice's behavior test through the real surface: no internals, no snapshots, no mocking its capability call. |

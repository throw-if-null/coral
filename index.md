---
layout: home

hero:
  name: Coral Architecture
  text: Code grouped by what it does, not by what kind of code it is
  tagline: Rules for CLIs, backends, web apps, libraries and tools — and for how several
    of them compose into a system.
  image:
    src: /logo.png
    alt: Coral Architecture
---

## What this is

Coral is a set of rules for organising code in a repository. It is written to be followed by coding
agents as well as by people, so the rules are stated explicitly, numbered, and most of them are
checkable by a program rather than by argument.

The organising principle is one sentence: **one capability, owned end to end, in one place.**

A capability is one thing the software does — one command, one HTTP endpoint, one event handler.
Everything that capability needs sits together, its tests included. The common alternative — all the
request handlers in one directory, all the database code in another — groups code by what kind of code
it is, and Coral does not do that.

## What that looks like

A small expense-tracking CLI with two commands, `expenses add` and `expenses list`:

```text
expenses/
  __main__.py        entry point — argv in, exit code out
  app.py             registers the commands, constructs the shared parts, injects them
  errors.py          the error taxonomy, defined once
  money.py           parsing and formatting money, defined once
  db.py              connection and transaction handling, defined once
  expense/
    add.py           the whole of `expenses add`
    add_test.py      its test, next to it
    list.py          the whole of `expenses list`
    list_test.py
```

Everything `expenses add` does lives in `add.py`: reading the arguments, validating them, writing the
row, returning the result. Its test sits beside it.

There is no `handlers/` directory holding the argument parsing, no `services/` directory holding the
logic, and no `repositories/` directory holding the SQL.

The same shape holds for a backend: one directory per endpoint or event handler, with its tests, and the
shared parts constructed at startup. [An HTTP endpoint in Go](/examples/go-api-slice) works through the
case where a language's own rules — import cycles, code generation — force one capability to span more
than one package, which stays legitimate as long as every package is named for that capability.

## The five kinds of code

Every file above is one of five things, and knowing which one you are writing answers most questions
about where to put it.

A **slice** is one capability, complete: `add.py`, `list.py`. Most of a codebase is slices.

A **crosscut** is something several slices need, defined in one place and passed in: `money.py`,
`errors.py`, `db.py`. There are few of them, and each has a specific name. Code does not become a crosscut
just because it appears twice: it has to be genuinely cross-cutting *and* carry an invariant that would be
a bug if the copies drifted apart. Duplication that fails that test is left alone deliberately.

The **composition root** is the entry point that constructs the crosscuts and hands them to the slices:
`app.py`. It holds no business logic.

A **published contract** is the part other code is allowed to depend on. For this CLI it is the exit
code, the separation of `stdout` from `stderr`, and the shape of the `--json` output.

An **adapter** is the code that speaks to one specific piece of infrastructure — a database driver, an S3
client, a payment API — behind an interface the slice itself declared. Which side owns that interface is
the whole point: the slice says what it needs, the adapter implements it, and the dependency points from
the adapter to the slice. Turn that arrow around and you have a `repositories` layer, where one shared
package decides what every caller gets. Small apps often have none — the CLI above has none, because a
`db.py` crosscut is enough.

There is a sixth thing most codebases have, and Coral does not allow it: a directory named for nothing in
particular — `utils`, `shared`, `common`, `services`, `helpers`. When code does not obviously belong to a
slice, the answer is either a crosscut with a real name, or leaving the duplication alone. That rule is
`[BUCKET-1]`, and it is one a linter can decide on its own.

## The same shape at three sizes

An **app** is one deployable unit: many slices, one composition root, one set of crosscuts. A **system**
is several apps. A **channel** is the only connection allowed between two apps — a published, versioned
contract in one of three forms: a synchronous API, an event, or a message bus.

Three rules hold at all three sizes:

1. Own your trigger end to end — the one request, command, or event you answer.
2. Share only through a named crosscut or a published contract, never through a bucket and never by
   reaching into another unit's internals.
3. Cross a boundary only over a channel. Two apps never fuse and never share a database.

That is the whole vocabulary: eight nouns — slice, crosscut, adapter, composition root, published
contract, app, system, channel. [`CONVENTIONS.md`](/CONVENTIONS) defines each one precisely, and every other document
refers back to it rather than restating it.

## Why the rules are shaped this way

Coral assumes a coding agent writes most of the code and a person reviews it. Four consequences follow,
and every rule in the set traces back to at least one of them.

**A slice fits in one context window.** An agent can read everything a change depends on at once, rather
than discovering afterwards that it never loaded some of it.

**A change is confined to one directory.** The reviewer's job has a known size before they start reading.

**Placement is decided by the structure.** "Where does this go?" has one answer, so it stops consuming
judgment — in the prompt and in review alike.

**Every slice can be checked from outside itself.** The expense CLI's test runs the real command against
a real database and asserts on the exit code and the `--json` payload — the same contract a user of the
tool depends on. An agent can run that and see whether the change worked, rather than reporting that it
should have.

Some of Coral's rules owe their presence, or the strictness Coral states them at, to those four
consequences — remove the agent-author premise and Coral would substantially relax them. That subset is
named and justified in [the Coral kernel](/CONVENTIONS#the-coral-kernel).

## Where this does not fit

Some domains have one central concept that every feature reaches into: a tax engine, a scheduler, a
pricing solver. Splitting those by capability cuts across the thing that actually holds the complexity,
and the result is worse than a conventional layout. Coral states this as a rule rather than a footnote —
`[SCOPE-2]` — and the recommendation there is to use something else and say so.

## How to read the rest

To see the rules applied before reading them, [a real backend service reviewed against
Coral](/examples/backend-review) is the shortest route: what the service already did right, two problems
the rules surfaced, and three places where following Coral would have been wasted effort.

Otherwise, in order:

- [`CONVENTIONS.md`](/CONVENTIONS) — the vocabulary, the rule numbering, the enforcement classes, and how
  a project records where it knowingly deviates.
- [`ARCHITECTURE.md`](/ARCHITECTURE) — how to build one app. The longest document, holding most of the
  rules.
- [`SYSTEM.md`](/SYSTEM) — how separately-built apps compose over a channel.
- [Appendices](/appendix/cli) — one file per app profile: CLI, backend, web, library, GitHub Action —
  plus the runtime-agent profile, which an app of any shape adds when it calls a model.
- [Worked examples](/examples/cli-slice) — real code, in Python and Go.

Every rule carries an ID like `[DUP-2]` and exactly one enforcement class: `[auto]` if a linter can decide
it, `[review]` if it needs a person's judgment, `[guide]` if it is rationale rather than a pass/fail gate.
On this site each citation links to its definition, and the build fails if a citation has no definition, if
a rule has no class, or if a published ID disappears — so the documents' internal consistency is checked
rather than trusted.

If you are looking for one rule rather than reading through, the [rule index](/rules) has every one of
them on a single page — ID, class, and a one-line statement, generated from the documents themselves.

---
layout: home

hero:
  name: Coral Architecture
  text: One trigger, one owning capability, end to end
  tagline: Rules for CLIs, backends, web apps, libraries and tools, and for how several
    of them compose into a system.
  image:
    src: /logo.png
    alt: Coral Architecture
---

## What this is

Coral is a set of rules for organising code in a repository. Coding agents follow it, and so do people.
The rules are therefore stated explicitly and numbered. Most of them are checkable by a program rather
than by argument.

The organising principle is one sentence: **one trigger, one owning capability, end to end.**

A capability is one thing the software does: one command, one HTTP endpoint, one event handler. The
unconditional part of Coral governs **ownership**. Whatever answers a trigger owns the whole of answering
it: parsing, validating, doing the work, returning the result, and the tests that prove it. Every unit of
code has one of five known roles.

**Ownership is not the same as physical colocation**, and Coral separates the two deliberately. *Where*
that owned behavior sits is Coral's **production baseline**: **code grouped by what it does, not by what
kind of code it is**. The baseline requires packages named for the capability or concern they own. It
forbids a global `handlers` / `services` / `repositories` layer. It puts tests beside the code they
verify. It is
[optional and adopted explicitly](/PRODUCTION). Most projects that want Coral want it. A project can still
own its triggers end to end without taking on Coral's opinion about what the directories are called.

## What that looks like

A small expense-tracking CLI with two commands, `expenses add` and `expenses list`. **It shows a project
that has taken Coral's [production baseline](/PRODUCTION)**, an optional layer adopted explicitly. Three
things in it are that layer's policy rather than the minimum a Coral codebase owes: the colocated tests,
the root crosscuts constructed once and passed in, and the absence of a
`handlers`/`services`/`repositories` layer. What Coral asks without adopting anything is a much shorter
list. The section [below](#why-the-core-rules-are-shaped-this-way) says which part is which.

```text
expenses/
  __main__.py        entry point — argv in, exit code out
  app.py             registers the commands, constructs the shared parts, injects them
  errors.py          the error model, declared once
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
shared parts constructed at startup. [An HTTP endpoint in Go](/examples/go-api-slice) works through a
harder case. A language's own rules, such as import cycles and code generation, can force one capability
to span more than one package. That stays legitimate as long as every package is named for that
capability.

## The five kinds of code

Every file above is one of five things. Knowing which one you are writing answers most questions about
where to put it. **The five are the unconditional part.** In a Coral codebase every unit of code fits one
of them, whatever else the project has adopted. The five are a classification, not a checklist: a given
app need not contain all five, and small ones usually do not. How each category is then *built* is where
the optional layer starts. This section says which is which.

A **slice** is one capability, complete: `add.py`, `list.py`. Most of a codebase is slices.

A **crosscut** is one concern that several slices need: `money.py`, `errors.py`, `db.py`. Code does not
become a crosscut by appearing twice. It has to be genuinely cross-cutting. It also has to carry an
invariant that would be a bug if the copies drifted apart. That test is one of the rules that applies to
every Coral codebase. Duplication that fails it is left alone deliberately. *The production baseline adds
the discipline around it: give each crosscut a precise name, and pass it in rather than letting a slice
reach for it.*

The **composition root** is where the parts are brought together and started: `app.py`. *The baseline adds
that it stays thin. It registers, constructs and wires, and holds no business logic of its own.*

A **published contract** is the part other code is allowed to depend on. For this CLI it is the exit
code, the separation of `stdout` from `stderr`, and the shape of the `--json` output.

An **adapter** is the code that sends to and reads from one specific piece of infrastructure: a database
driver, an S3 client, a payment API. Small apps often have none. The CLI above has none, because a `db.py`
crosscut is enough. *The baseline adds the dependency direction: the **slice** declares the interface it
needs, the adapter implements it, and the dependency points from the adapter to the slice. Reverse that
arrow and the result is a `repositories` layer, where one shared package decides what every caller gets.*

The italicised additions above are [production baseline](/PRODUCTION) rules. A project that has not
adopted that layer still classifies every unit of code with the same five categories. It owes none of the
discipline in italics.

Most codebases have a sixth thing, and it is not one of the five: a directory named for nothing in
particular, such as `utils`, `shared`, `common`, `services`, or `helpers`. Coral calls that a **forbidden
bucket**. When code has no clear owning slice, the answer is either a crosscut with a real name or
leaving the duplication alone. `[BUCKET-1]` is the rule that bans a bucket, and a linter can decide it on
its own. It belongs to the **production baseline**, an optional layer described below, rather than to the
core of Coral. The reason is that it is good engineering whoever writes the code.

## The same shape at three sizes

An **app** is one deployable unit: many slices, one composition root, one set of crosscuts. A **system**
is several apps. A **channel** is the pathway between two apps, and the contract governing what crosses
it.

One shape repeats at all three sizes:

1. Own your trigger end to end: the one request, command, or event you answer.
2. Consume another unit through what it publishes, never by reaching into its internals. Share a concern
   by holding it in one definition rather than copying it.
3. Between apps, that published surface is a channel.

That is the whole vocabulary: eight nouns. They are slice, crosscut, adapter, composition root, published
contract, app, system, and channel. [`CONVENTIONS.md`](/CONVENTIONS) defines each one precisely. Every
other document refers back to it rather than restating it.

**The nouns are the vocabulary. The production discipline around them is a separate, optional decision.**
All four of these are real Coral rules:

- never a `utils` bucket
- apps never share a database
- a channel is versioned and takes one of three forms
- crosscuts are injected rather than reached for

They belong to the [production baseline](/PRODUCTION), which a project adopts explicitly. The
[section below](#why-the-core-rules-are-shaped-this-way) draws the line.

## Why the core rules are shaped this way

Coral assumes a coding agent writes most of the code and a person reviews it. Four consequences follow.
The **kernel** is the small set of rules Coral imposes on every Coral codebase, and it traces back to
those four.

**A slice fits in one context window.** An agent can read everything a change depends on at once, rather
than discovering afterwards that it never loaded some of it.

**A change is confined to one slice.** The reviewer's job has a known size before they start reading.

**Placement is decided by the structure.** "Where does this go?" has one answer, so it stops consuming
judgment in the prompt and in review alike.

**Every slice can be checked from outside itself.** The expense CLI's test runs the real command against
a real database. It asserts on the exit code and the `--json` payload, which is the same contract a user
of the tool depends on. An agent can run that test and see whether the change worked, rather than
reporting that it should have.

A rule is a **kernel** rule when its presence, or the strictness Coral states it at, materially comes
from those four consequences. Remove the agent-author premise and Coral would substantially relax it.
[The Coral kernel](/CONVENTIONS#the-coral-kernel) names and justifies that subset.

**Most of what Coral publishes is not that, and does not claim to be.** All of these are required because
the *software* needs them:

- which error categories a project uses, and how they are enforced
- transaction scope
- retry semantics
- cache invalidation
- concurrency strategy
- configuration
- trust boundaries
- HTTP status codes

Their justification survives a human-authored codebase. Coral publishes them as the **production baseline** and as per-app-type
**profiles**: opinionated, coherent, and **optional**. A project takes them on deliberately, in its
`CORAL.md`. A project that takes none of them is still a Coral codebase.

## Where this does not fit

Some domains have one central concept that every feature reaches into: a tax engine, a scheduler, a
pricing solver. Splitting those by capability cuts across the thing that holds the complexity. The result
is worse than a conventional layout. Coral states this as a rule rather than a footnote, `[SCOPE-2]`. The
recommendation there is to use something else and say so.

## How to read the rest

[A real backend service reviewed against Coral](/examples/backend-review) is the shortest route to seeing
the rules applied before reading them. It covers what the service already did right. It also covers two
problems the rules surfaced, and three places where following Coral would have been wasted effort.

Otherwise, in order:

- [`CONVENTIONS.md`](/CONVENTIONS): the vocabulary, the rule numbering, and the enforcement classes. It
  also covers how a project declares
  [how much of Coral applies to it](/CONVENTIONS#what-applies-to-a-project), and how it records where it
  knowingly deviates.
- [`ARCHITECTURE.md`](/ARCHITECTURE): the kernel-facing app architecture. It gives the shape of one app,
  and the rules that bind every Coral codebase without being adopted. Short.
- [`PRODUCTION.md`](/PRODUCTION): the **production baseline** for one app, and the long, opinionated
  production-engineering layer. Read it to decide whether you want it. It applies only once your
  `CORAL.md` says so.
- [`SYSTEM.md`](/SYSTEM): how separately-built apps compose over a channel. Also optional, and two
  independent opt-ins: the system-scale baseline, and the runtime-agent orchestration rules.
- [Appendices](/appendix/cli): one document per app profile (CLI, backend, web, library, GitHub Action).
  They also hold the runtime-agent addendum, which an app of any shape adds when it calls a model at
  runtime.
- [Worked examples](/examples/cli-slice): real code, in Python and Go.

Every rule carries an ID like `[DUP-2]` and exactly one enforcement class. `[auto]` means a linter can
decide it. `[review]` means it needs a person's judgment. `[guide]` means it is rationale rather than a
pass/fail gate.

On this site each citation links to its definition. The build fails if a citation has no definition, if a
rule has no class, or if a published ID disappears. The documents' internal consistency is checked rather
than trusted.

**Not all of it applies to you, and which part does is your decision, not ours.** One small set applies to
every Coral codebase: the [kernel](/CONVENTIONS#the-coral-kernel). Everything else, the production
baseline included, applies because a project's `CORAL.md` says it does. The declaration names four
things:

- the app profiles the project has taken on
- whether the project wants the baseline
- whether it calls a model at runtime
- whether it is one app or several apps composing

Adding a rule or a profile here changes nothing for an existing project until that project adopts it.
[What applies to a project](/CONVENTIONS#what-applies-to-a-project) holds the rules for that.

The [rule index](/rules) lists every rule on a single page, with its ID, its class, and a one-line
statement. It is generated from the documents themselves. Use it to look one rule up rather than reading
through.

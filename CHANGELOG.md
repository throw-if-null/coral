# Changelog

Every change to the Coral rule set, recorded per rule ID so a version diff answers the only question a
consuming project actually asks: **which rules must I now satisfy that I did not before?**

Versioning is governed by `[VER-2]`:

| Change | Bump |
|---|---|
| a rule **added**, or **tightened** | **major** — code that conformed can stop conforming |
| a rule **retired** | **major** — invalidates citations in project `CORAL.md` files |
| a rule **loosened** or **clarified**; a new appendix; a new `[guide]` rule | minor |
| prose that leaves conformance unchanged | patch |

Adding a rule is breaking because a rule is a **constraint** — closer to adding a required field than to
adding an API endpoint.

**Coral is currently in `0.y.z`**, semver's major-version-zero phase: the rule set is not yet stable, so a
change that *would* be major bumps the **minor** instead. Rules are still arriving in batches while the
appendices are filled, and burning a major per batch would put Coral at version 6 with nothing stable to
show for it. `1.0.0` is cut when **every appendix is complete** — every slot carrying either an app-type
rule or an explicit "spine-sufficient" note — which is a checkable condition rather than a feeling.

Rule IDs are append-only (`[VER-1]`): never renumbered, never recycled, never removed. `rules.lock` is the
checked-in record of every published ID and its enforcement class, and the build fails on any drift
between it and the documents. Regenerate with `npm run rules:lock` and record the change here.

A project states the version it targets in its `CORAL.md` (`[VER-3]`). Upgrading is a deliberate act: read
the entries between your target and the new version, satisfy the added rules, and re-audit.

---

## Unreleased

*Nothing yet.* A version marks a release, not a commit (`[VER-2]`), so changes land here first and the
bump happens when the batch is cut.

---

## 0.5.0 — 2026-08-08

**Every rule is now findable in one place, and every appendix now carries a contract.** No rule was added,
tightened, or retired. Two `[guide]` rules were reworded for clarity, which under `[VER-2]` is what makes
this a **minor** bump rather than a patch.

**The six appendices gain an Agent Execution Contract.** Only the three spines carried one before. The
build's contract-completeness check is opt-in by marker — it verifies that every `[auto]` and `[review]`
rule defined in a document appears in that document's contract — so it had been skipping the appendices
entirely. That left 58 rules with no condensed form and nothing noticing: an agent building a CLI could
load `ARCHITECTURE.md`'s contract in full and still be missing all nine normative `CLI-` rules. Each
appendix now ends with its own contract and the check covers it. An appendix contract **adds to** the app
spine's rather than replacing it, so building a CLI means loading both.

**`rules.md` — every rule on one page.** 174 rules across nine documents, grouped by document, each with
its enforcement class and a one-line statement, each ID linking to its definition. The documents define a
rule once and point at it, which is right for reading and useless for looking one up: nothing answered
*what rules exist?* or *show me every `[auto]` rule*, and the appendices were the worst of it — 67 rules
discoverable only by reading the file that holds them.

The page is generated (`npm run rules:index`) and the build fails if it falls behind the documents, which
is the only version of this worth having: a hand-maintained index is a second copy of 174 rules, and the
second copy is the one that goes stale. Statements come from the Agent Execution Contracts, so the index
inherits their completeness guarantee instead of carrying a parallel set of summaries nobody maintains —
which is the other reason the appendices needed contracts first.

**`[BUCKET-2]` and `[SYS-TEST-4]` reworded** — the two clarifications. `CONVENTIONS.md` requires a rule's
first sentence to be the rule, *complete and quotable on its own*, and generating an index that quotes
exactly that sentence is what exposed these two failing it. `[BUCKET-2]` opened with *"These names destroy
locality and predictability"* — *these names* being `[BUCKET-1]`'s list one rule earlier, so the sentence
carried nothing on its own; it now reads *"Generic catch-all names"*. `[SYS-TEST-4]` opened with a fragment
ending in a colon that ran straight into its list of tools; it is now a sentence. Neither change alters
what either rule requires.

**An on-ramp for human readers, on `index.md` and `README.md`. Patch-level: no rule was added, tightened,
loosened, or retired, and nothing about conformance changed.**

The document set was written for agents, which load whole files and do not care what order the ideas arrive
in. For a person reading top to bottom, that produced a set where every definition precedes its example:
the seven-noun vocabulary table opens `CONVENTIONS.md`, while the first directory layout is four documents
away in `examples/`. The landing page and the README both opened with the same taxonomy.

So the site's landing page now carries the explanation the spines deliberately do not: a worked directory
layout first, then the four kinds of code named against it, then the three scales, then the four properties
that every rule traces back to — which until now were stated only in `CONVENTIONS.md`'s operating-model
section, roughly halfway into the file. The four properties are *paraphrased* there, not moved; the precise
statement stays where `[AGENT-1]` needs it. Where a rule already says something, the on-ramp cites it
(`[BUCKET-1]`, `[SCOPE-2]`, `[DUP-2]`) so the build resolves the link rather than a second copy drifting.

The landing page's four-card feature grid is gone with it. The cards predated the on-ramp, when they were
the only content on the page; once the prose existed, each card was a shorter and worse-voiced preview of
a section directly beneath it. The two facts they carried that the prose did not — the promotion gate for
a crosscut, and the names of the three enforcement classes — moved into the prose.

`README.md` loses its copy of the taxonomy and its numbered reading list — the reading order existed in
three places, and `CONVENTIONS.md` is the one an agent loads. What is left is what only a repository README
can answer: what is in here, how to run the linter, how to install the audit skill, how to build the docs.

The spines keep their density — prose tuned for a human reader would cost them the property that makes
them work as agent input, and the split between explanation and Agent Execution Contract already handles
that tension one layer down. Two *orderings* changed, though, for the same reason the on-ramp exists: both
put an abstraction ahead of the concrete thing that makes it legible.

`CONVENTIONS.md` now defines **forbidden bucket** and **drift** after the canonical slice instead of
immediately under the vocabulary table. Both are named for what a crosscut is *not*, so they were being
defined by contrast with something the reader had not yet seen — and they made the file's first movement
two prohibitions.

`ARCHITECTURE.md` now opens with the app layout that was previously in §6, 219 lines in, so its
twenty-two rule sections have a concrete thing to attach to. The tree is named rather than
parameterised (`expenses/`, `db`, `config`, `errors` in place of `<app>/` and `<crosscuts>`), and §6 links
up to it rather than carrying a second copy. No rule text moved in either file.

`CONVENTIONS.md` also loses its **Why "Coral"?** section. It spent a figure, a paragraph and a four-row
table teaching a biology vocabulary — polyp, skeleton, colony, reef — and then told the reader the
vocabulary was decoration. It was: those four words appear nowhere else in the document set, so the
section's own claim that they turn up "in a heading or an aside" was never true. The one engineering idea
inside it — the same shape repeating at every scale — is not a metaphor and does not need one; it is the
three-scale invariant, and the landing page now states it plainly. The architecture is called Coral; that
is all the section established that survives it.

---

## 0.4.0 — 2026-08-05

**A vocabulary pass. No rule's *substance* changed — three nouns were renamed, one family was renumbered,
and one clarification was added.** A **minor** bump under the `0.y.z` clause: renaming a family retires ten
IDs and publishes ten, which is major after `1.0.0`.

**`horizontal` → `crosscut`.** The old name collided with an anti-pattern Coral forbids: in general usage a
*horizontal slice* **is** a layer, and `[MODEL-2]`/`[STATE-2]`/`[BUCKET-1]` exist to forbid exactly that. So
the word named both the sanctioned thing and the banned thing, and a reader's prior knowledge worked against
them. `crosscut` cannot be misread as a layer, and it makes the governing family self-documenting — `XCUT`
already abbreviated *crosscutting*, so **no rule ID changed**. `tools/coral-lint` renames its config key to
match: `[coral].horizontals` → `[coral].crosscuts`.

**`vertical` dropped as a term.** It only ever appeared as a gloss on `slice`, and naming an axis invited the
question it could not answer — *is there a horizontal slice too?* A slice is a slice.

**`bus` → `channel`, and `[BUS-1..10]` → `[CHAN-1..10]`.** `bus` was correct as a *form* and wrong as the
*genus*: a bus means broker middleware, while a Coral bus was also a plain synchronous HTTP call. The old
`BUS-2` had to say "an **actual** message bus" to recover the ordinary meaning, and the system diagram
showed a bus containing a bus. `channel` is the genus; a message bus is one of its three forms, restored to
its specific sense. The ID mapping, one-to-one and in order:

| Retired | Replaced by | | Retired | Replaced by |
|---|---|---|---|---|
| `BUS-1` | `[CHAN-1]` | | `BUS-6` | `[CHAN-6]` |
| `BUS-2` | `[CHAN-2]` | | `BUS-7` | `[CHAN-7]` |
| `BUS-3` | `[CHAN-3]` | | `BUS-8` | `[CHAN-8]` |
| `BUS-4` | `[CHAN-4]` | | `BUS-9` | `[CHAN-9]` |
| `BUS-5` | `[CHAN-5]` | | `BUS-10` | `[CHAN-10]` |

**This is a deliberate break of `[VER-1]`, and the second and last one.** Append-only means a family is never
renumbered, so renaming `BUS` is precisely what that rule forbids. It is taken anyway, on the same grounds as
the `0.1.0` alias deletion recorded below: Coral is pre-`1.0.0`, the rule set is declared unstable, and no
project targets `0.3.0`. After `1.0.0` the answer would have been to live with the name. If you find `BUS-4`
cited in an old commit or review comment, the table above is the translation.

**New: `[CHAN-2]` gains a "not middleware" clarification**, and `CONVENTIONS.md` gains a short section stating
that a channel **is** a published contract at app scale — the same idea at a different rank, distinguished by
carrying delivery semantics (`[CHAN-5]`, `[CHAN-9]`, `[CHAN-10]`) that have no meaning at slice scale. Both
close the same gap: nothing in Coral requires a broker.

**Unchanged, after review:** `composition root` (the established term from the dependency-injection
literature — `root` alone collides with DDD's *aggregate root*), `published contract` (`interface` names the
*consumer*-side dependency a slice declares, which is the opposite direction, and is the distinction
`[STATE-2]` turns on), `app`, and `system`.

---

## 0.3.0 — 2026-07-30

**Every core appendix is now complete, which is the `1.0.0` condition** — see the note at the end for why
`1.0.0` was not cut here.

**`web.md` is complete.** Its last two slots are filled:

- **`[WEB-11]`** `[review]` — server state is the source of truth; client state is a **cache of it**, owned
  by the slice that fetched it, and never the only place a fact exists. This is `[STATE-6]` in the browser,
  where a hard refresh, a new tab and a cold load *are* the empty-cache case — so the empty case is the
  second-most-common way a page loads, not an edge case. Invalidation is owned by the slice that caused the
  change, which then publishes on the channel (`[WEB-4]`); no panel reaches into another's cache, which is
  what keeps a global read-write store from arriving one convenience at a time. Optimistic updates are a
  *display* concession and must reconcile and surface failure. Never-sent state — form drafts, scroll,
  expand/collapse — is the one genuinely client-owned kind.
- **`[WEB-12]`** `[review]` — a behavior test drives the slice **through the surface a user or caller
  actually touches** and asserts the observable contract. Rules out component-internal state, markup
  snapshots (which assert *shape*, so they fail on every redesign and pass on every wrong total), and
  mocking the capability call the slice exists to make. Mandatory additions: an authorization test at the
  boundary, because `[WEB-7]` regresses silently, and for microfrontends a contract test on the panel
  channel.

**`agentic-app.md` is now an ADDENDUM, not a PARTIAL appendix.** The distinction is honesty about
provenance rather than about completeness: nobody here has built an agentic app, so the page is written
from reading and from principle. Writing a blueprint for something you have not built is speculation
dressed as guidance, and an agent cannot tell the difference from the page — the label is how it tells.

An addendum sits **outside the `1.0.0` condition and outside the version discipline**: it may change
substantially without a major bump, though its rule IDs remain permanent (`[VER-1]`) so citations stay
valid. It graduates to a core appendix when someone has built the thing and the rules survived contact
with it. Its **safety guardrails** — the harness, untrusted model output and prompt injection, never
exact-matching model text, never floating the model identifier — hold regardless; only the construction
advice is provisional.

`[ORCH-4]` in `SYSTEM.md` now states the harness's five duties **in full**, so a core-spine rule no longer
depends on an addendum for its meaning. It still points at `[AGENTIC-5]` for elaboration.

**Also:** `[VER-2]` gained the release-versus-commit clause, and the definition of the `1.0.0` condition
narrowed from "every appendix" to "every **core** appendix" as a consequence of the addendum category.

**Rules: 172 → 174.**

### Why this is 0.3.0 and not 1.0.0

The `1.0.0` condition is met, and `1.0.0` is deliberately being held back anyway.

`1.0.0` is a stability promise, and **50 of these 174 rules were authored by an agent across a single
session** — including two appendices in full (`[LIB-1..13]`, `[GHA-1..12]`) and two new families
(`[CONC-1..5]`, `[CONFIG-1..4]`). Most of the rest were reviewed in conversation as they were written, but
the two appendices have not yet been read line by line by a human. Coral's own operating model says agents
write and humans review; making a stability promise before the review half has happened would contradict
the document set at exactly the point it claims to be trustworthy.

Expect several more `0.x` iterations. `1.0.0` is cut when the rule set has been read, not merely when it is
structurally complete.

## 0.2.0 — 2026-07-29

**Contract versioning, filled in for the three appendices that lacked it.** Three rules — and they are
three genuinely different answers, not one answer repeated:

- **`[BE-7]`** `[review]` — version the HTTP API with a **URL prefix** (`/v1`), advanced only for a
  breaking change. Nothing additive bumps it; repurposing a field is breaking even under the same name;
  removal needs a version step with deprecation first. The *spelling* is a stated default, not
  architecture — header or media-type versioning is equally valid, and deviating is an **Exception** in the
  project's `CORAL.md` rather than a violation. What is not acceptable is leaving it undecided or varying
  it between services in one system.
- **`[WEB-10]`** `[review]` — the UI's stable contract is its **route/URL structure**. This slot differs
  from every other app type because a route has no version prefix and no deprecation path: you cannot
  ask a bookmark to migrate. Repurposing a path is the worse failure, because nothing errors — old links
  keep resolving and quietly show the wrong thing. Moving a route requires a redirect kept indefinitely.
- **`[AGENTIC-12]`** `[review]` — the **model identifier and prompt version are part of the contract**;
  changing either requires re-running evals before ship. Pin the model; never float to "latest", or the
  contract can change with no commit and no review. Record model + prompt version with each stored result.

**Appendix status is now named rather than blanket-labelled.** "PARTIAL" told a reader not to trust a page
without saying which part, so an agent either over-trusted it or re-derived everything. An appendix is now
**complete** when every slot carries either an app-type rule or an explicit "spine-sufficient" note —
"deferred to the spine" being an answer, not a gap — and any slot that is neither is listed under *slots
still to fill* on the appendix itself.

- `backend.md` is now **complete** (contract versioning was its last open slot)
- `cli.md`, `library.md`, `gh-action.md` were already complete
- `web.md` — two slots open: state/effects, testing
- `agentic-app.md` — two slots open: composition root, observability

`[VER-2]` gained the major-version-zero clause described above, and now ties `1.0.0` to all six appendices
being complete.

**Rules: 169 → 172.**

---

## 0.1.0 — 2026-07-29

First versioned release. Everything before this point was unversioned drafting, so this is a baseline
rather than a list of changes.

**Baseline: 169 rules across 31 families.** The full inventory with enforcement classes is
`rules.lock`; from 0.2.0 onward, entries name the affected rule IDs individually.

**`[VER-1]`'s append-only guarantee starts here.** During pre-versioned drafting, 27 alias rule IDs were
deleted — `[PLACE-*]`, `[FORBID-*]`, `[SHARE-*]`, `[SEM-*]`, `[EO-*]`, `[T-*]`, `[SYS-*]` — each of which
had restated an existing rule under a second name. They predate `rules.lock`, so if you find one cited in
an old commit or review comment it is a real ID that legitimately no longer exists. The promise that an ID
never disappears applies from `0.1.0` forward, not across the whole of git history.

Families, by document:

| Document | Families |
|---|---|
| `CONVENTIONS.md` | `AGENT`, `VER` |
| `ARCHITECTURE.md` | `SCOPE`, `MODEL`, `BOUND`, `ROOT`, `STRUCT`, `BUCKET`, `XCUT`, `DUP`, `COMPOSE`, `EFFECT`, `STATE`, `CONC`, `CONFIG`, `IDEM`, `ERR`, `OBS`, `CONTRACT`, `TRUST`, `TEST`, `GROW` |
| `SYSTEM.md` | `CHAN`, `ORCH`, `SYS-TEST` |
| `appendix/*` | `CLI`, `BE`, `WEB`, `AGENTIC`, `LIB`, `GHA` |

`appendix/library.md` and `appendix/gh-action.md` are written; `appendix/backend.md`, `appendix/web.md`
and `appendix/agentic-app.md` are marked PARTIAL and carry "remaining slot notes" — those gaps are known
and will close in later minor versions.

What this baseline guarantees, and what the build enforces on every commit:

- every rule carries exactly one enforcement class — `[auto]` / `[review]` / `[guide]`
- every rule-ID citation resolves to a definition
- every `[auto]` and `[review]` rule appears in its document's Agent Execution Contract, so the contract
  is the complete normative surface
- every rule ID present in `rules.lock` still exists, with an unchanged class
- every in-site link fragment resolves

Not part of the versioned rule set, and free to change without a bump:
`tools/coral-lint` (an optional reference implementation of some `[auto]` checks — adopting it is a
human's decision, and it is never invoked by the audit skill), the VitePress site configuration, and the
build scripts.

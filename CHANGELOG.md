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

A version marks a release, not a commit (`[VER-2]`), so changes land here first and the bump happens when
the batch is cut.

**The Coral kernel is named, and `[MODEL-1]`'s contract line is corrected. Patch-level: no rule was
added, tightened, loosened, or retired, and no ID or enforcement class moved.**

Coral's rules were not all here for the same reason, and nothing said which was which. Nine of them owe
their presence — or the strictness Coral states them at — to the operating model: an agent authors the
code while a human retains architectural authority. Remove that premise and Coral would substantially
relax `[BOUND-2]`, `[MODEL-1]`, `[XCUT-1]`, `[COMPOSE-1]`, `[TEST-1]`, `[AGENT-2]`, `[AGENT-4]`,
`[VER-3]` and `[VER-5]`. `CONVENTIONS.md` now names that subset, states the four-part membership test,
and maps each member to the property it defends (locality, bounded context, deterministic placement,
reviewability, self-verification, drift prevention). It is deliberately *not* the claim that a human
author would have no reason to follow them.

It is a **named subset of existing rules, not a family.** There is no `KERN-*` and there will not be:
"one rule, one ID" forbids a second family that restates rules defined elsewhere, and the kernel table is
rows of citations. The build enforces that: a definition line inside the kernel block fails, as does a
malformed or duplicated row, or a row citing an ID no rule defines — with unit tests for each failure
mode (`npm run check:rules`) rather than a ritual of breaking the docs on purpose. `rules.md` marks the
nine from that same block, so membership has one source and a change to it lands as a diff in a generated
file.

**"Kernel" does not mean "most important."** `[TRUST-1]` matters more to a running system than any of the
nine. The classification answers *why Coral imposes a rule, and at what strength* — an unmarked rule is
not optional.

**`[MODEL-1]`'s contract line was missing `adapter`, and that one is not cosmetic.** The canonical
definition has named five categories since `[MODEL-4]` landed in 0.6.0; the Agent Execution Contract in
`ARCHITECTURE.md` still said *"a slice, a crosscut, the composition root, or a published contract"*.
`CONVENTIONS.md` promises the contract is the **complete** normative surface — an agent may load only
that — so an agent doing exactly what Coral invites it to do was given a four-category model and no
legitimate home for infrastructure behind a slice-declared port. The two now agree. **Clarification, not
a tightening:** the rule already required five, and `rules.md` (generated from the contract) picks the
correction up.

Two more copies of the same adapter drift: `ARCHITECTURE.md` said `CONVENTIONS.md` defines "the seven
nouns" while listing eight, and `README.md` pointed at the site's "four kinds of code" section, which has
been *The five kinds of code* since 0.6.0. The historical mentions in this changelog and in
`examples/go-api-slice.md` describe the pre-adapter taxonomy accurately and are left alone.

**Every rule now names its ownership layer, and the build enforces it. Patch-level: no rule was added,
tightened, loosened, or retired, no ID moved document, and no enforcement class changed — `rules.lock`
is byte-identical.**

Coral publishes 178 rules and no project is the audience for all of them. A CLI with no runtime model has
no reason to read `[AGENTIC-*]`; a library has no reason to read HTTP status codes; a project that never
edits Coral has no reason to read the rule-numbering discipline. Left unstated they arrive as one wall,
and the reviewer's real budget — the `[review]` rules, spent one judgment at a time — goes on rules that
were never about them. Each rule now carries exactly one of six **ownership layers**: kernel, framework
governance, production baseline, app profile, language binding, runtime-agent profile. `CONVENTIONS.md`
gains an [Ownership layers](./CONVENTIONS.md#ownership-layers) section defining them and a
`coral:profiles` registry naming the profiles that exist; `rules.md` replaces its binary **Kernel** column
with a generated **Layer** column and a per-layer tally.

The counts answer to three audiences rather than stacking into one number. **97 rules carry no profile**
(kernel + production baseline) and are what a codebase is built and audited against, 69 of them
`[review]`; 18 of those 97 are stated at *system* scale in `SYSTEM.md`, and a repository that ships one
app has no channel to version or topology to wire. **9 govern Coral itself** — no application source code
satisfies or violates `[VER-2]`; they bind the decisions a project makes *about* Coral. The other **72 are
opt-in** — 50 `[review]` — and load with the profile that owns them. **There are no language-binding
rules**, and the empty layer is left honestly empty; every Coral rule is stated in language-neutral terms
today, and the Go and Python worked examples illustrate neutral rules rather than binding them.

**Ownership is a separate axis from enforcement**, and no enforcement class moved. `[CLI-6]` is
`app profile · cli` *and* `[auto]`; `[CLI-9]` is `app profile · cli` *and* `[review]`. Ownership says who
must load a rule; the class says how it is checked once they do. A narrow layer is not a weak one — once a
profile is loaded, its rules bind exactly as hard as the baseline's.

**Kernel membership did not move and did not gain a second home.** It is still read from the
`coral:kernel` block and nowhere else, which is why kernel rules carry *no* inline tag: one there would be
a second membership registry. The build fails in both directions — a tag on a kernel rule, and a rule
dropped from the kernel table without gaining one.

Three classification decisions worth recording, because none of them follows from the file a rule sits in:

- **`[SCOPE-1]`, `[SCOPE-2]` and `[SCOPE-4]` are framework governance**, not architecture, despite living
  in the app spine. They state where Coral applies and which document owns what happens after a split.
  None constrains application source code, which is the test.
- **`[ORCH-4]`, `[ORCH-5]` and `[ORCH-6]` are the runtime-agent profile**, and they **stay in
  `SYSTEM.md`**. `SYSTEM.md` says in prose that the harness guardrail is stated there precisely so it does
  not depend on an ADDENDUM, and moving a `[review]` safety rule into a document that carries no stability
  promise would reverse that for a filing convenience. What did need fixing was the *loading*: an Agent
  Execution Contract is the complete normative surface of its document, so listing `[ORCH-4]` beside
  `[CHAN-1]` told an agent that runtime-agent orchestration binds every system. Contracts now mark their
  opt-in groups with a `coral:scope` marker — every appendix contract opens with its profile, and
  `SYSTEM.md` scopes the three in place.
- **`[ROOT-3]`'s sentences were reordered.** Its opening sentence was *"For a library, the consumer is the
  composition root"*, and `CONVENTIONS.md` says the first sentence of a rule **is** the rule — so by
  Coral's own convention a library rule was sitting in the universally-loaded spine. The general statement
  now leads and the library is the illustration. Same two facts, same `[guide]` class, same ID: prose that
  leaves conformance unchanged.

`[AGENT-1]`, `[AGENT-3]`, `[AGENT-5]`, `[VER-1]`, `[VER-2]` and `[VER-4]` are framework governance, as
expected — each governs Coral's own interpretation, versioning, or adoption rather than any application.
`[AGENT-2]`, `[AGENT-4]`, `[VER-3]` and `[VER-5]` remain kernel.

The parser gained one fix this needed: **a rule definition inside a fenced code block is an illustration,
not a definition.** `CONVENTIONS.md` now prints an example definition line, and the registry is
first-definition-wins across a fixed document order, so without the fix that example silently became the
definition of `[CLI-6]` and moved the rule to another page — the failure `CHANGELOG.md` caused once
already, arriving from a direction a file exclusion cannot cover. Opening and closing fences are matched
separately, per CommonMark: an opener may carry an info string and a closer may not, so ```` ```yaml ````
opens a block rather than closing one, and a nested fence inside a longer one stays content.

---

## 0.6.0 — 2026-08-18

**A consolidation pass: the rule set now agrees with itself and with its own examples.** Four rules are
**added** — `[MODEL-4]`, `[BE-8]`, `[VER-5]`, `[AGENTIC-13]` — which under the `0.y.z` clause makes this a
**minor** rather than a major. Nothing was retired. Several rules are **loosened** (`[MODEL-1]`,
`[STATE-5]`, `[WEB-4]`, `[SYS-TEST-2]`) or **clarified** (`[BE-1]`, `[BE-6]`, `[BE-7]`, `[CHAN-10]`,
`[LIB-11]`, `[STRUCT-2]`), and one `[guide]` default is **reversed** (`[WEB-2]`/`[WEB-6]`).

The pass was driven by a review of the whole set against itself. Most of what it found was not a missing
rule but a **claim the documents made and did not keep** — a taxonomy that declared itself closed while an
official example carried a counter-example, a status map missing the two statuses every backend returns, a
dependency direction stated twice and enforced nowhere. Four of the six build gates that existed could not
catch any of them, which is why two more now exist.

**`[MODEL-4]` — `adapter` is a category, and `[MODEL-1]` now names five.** `[MODEL-1]` claimed "there is no
fifth category. Something that is none of these is a forbidden bucket," while
[`examples/go-api-slice.md`](./examples/go-api-slice.md) carried a deliberate counter-example: its `store`
package was "deliberately not in this table," being "neither a crosscut nor a bucket." One of the two had
to be wrong, and it was the closure claim. `[MODEL-4]` names the missing member and gates it with the
interface-ownership direction `[STATE-2]` already defined — the slice declares the port, the adapter
implements it, the arrow runs adapter → slice. Reverse the arrow and it is still the `repository` layer
`[BUCKET-1]` forbids. **What you must now satisfy:** an adapter holds no application behavior, and is
named for the infrastructure it speaks to rather than a role. The vocabulary is eight nouns, not seven.

**`[BE-8]` — `401` and `403` are specified.** The six-category taxonomy has no `unauthenticated` or
`forbidden`, and `[BE-5]`'s status map ran 400/400/404/409/503/500 — so the two statuses every backend
returns were produced by code no rule described. They stay *out* of the taxonomy, because a slice cannot
raise what the boundary already decided; `[BE-8]` fixes the shape instead: `401` unauthenticated, `403`
authenticated but without the capability, `404` for a scoped query that matches nothing — "exists but is
not yours" must be indistinguishable from "does not exist." `[ERR-1]` now states that the omission is
deliberate rather than leaving it to be inferred. `[BE-6]` is **clarified** in the same pass: coarse
capability authorization at the boundary, resource-level authorization with the state it protects, which
is what its own WHERE-clause requirement always did.

**`[VER-5]` — exceptions become machine-readable.** A `CORAL.md` exception was prose, so `coral-lint` had
no way to honour one: an approved `internal/models` package failed the gate on every run, forever, and a
register nobody can act on stops being believed. Exceptions and extensions now go in a parseable block
naming the rule ID and a **scoped path** — `internal/models`, not `**`. `coral-lint` does not read it yet
and says so under `--coverage`; the format has to exist before the tool can honour it.

**[`examples/backend-review.md`](./examples/backend-review.md) stops waving off an `[auto]` rule.** It said
`models`/`utils` trip `[BUCKET-1]` "*by name*" and that "renaming would be cosmetic" — an official example
teaching that a blocking rule is negotiable whenever compliance looks like tidying. It now separates the
two claims that were fused: the rule **is** violated, **and** the correct owner cannot be read off the
repository. That combination is an escalation (`[AGENT-2]`, `[AGENT-4]`) and then a recorded exception
(`[VER-5]`) if the team keeps the layout — not a pass.

**A sixth build gate: the app spine cites no system rule.** `CONVENTIONS.md` states the one-way dependency
twice — "the app spine **never** cites a system rule, so the core app model stays independent of system
concerns" — and nothing verified it, so `ARCHITECTURE.md` had been citing `[ORCH-1]` in its `[SCOPE-3]`
commentary for as long as that rule has existed. The citation is removed and the claim is now checked. It
decays exactly the way an unenforced claim does: a cross-reference reads as helpfulness, and the cost only
appears later, when a reader of the app spine cannot finish a rule without loading the document the spine is
supposed to be independent of. "System rule" is derived from the registry (defined in `SYSTEM.md`), so a new
system family is covered automatically, and family wildcards like `[ORCH-*]` still work — pointing at a
family is how `[SCOPE-4]` intends the spine to refer outward. Appendices stay exempt by design.

Also corrected: the Tier 1 table claimed "one per `[auto]` rule" while listing the eleven defined in
`ARCHITECTURE.md` — true of this document's rules, misleading about the other seventeen, which live in the
appendices.

**`[CHAN-10]` — "cross-app reads are eventually consistent" was not true.** A synchronous read from the app
that *owns* the data may be strongly consistent according to that app's own model, so the blanket claim
taught agents to bolt reconciliation onto reads that never needed it. What the channel genuinely never
provides is **atomicity across owners**: two apps, two transactions, no snapshot spanning both. The rule now
says that instead, and notes that event and message channels are additionally eventual by construction —
a property of those forms, not of every channel.

**`[SYS-TEST-2]` — executable compatibility verification, with consumer-driven contracts as one technique.**
The rule mandated CDC while `[SYS-TEST-4]`, on the same page, already called a schema registry "the
event-shaped form of the same idea" — so the spine mandated one technique and endorsed another. The
requirement is now the property: an artifact that executes, passes or fails, and is wired into the producer's
release gate. CDC remains the reference technique; schema-registry compatibility checks, provider contracts,
protocol conformance suites, and generated client/server compatibility tests are equally valid per
relationship. A documented schema nobody runs is still not verification.

**`[BE-1]` — the route is the trigger, not the definition.** The statement led with "one slice per HTTP
route" while its own commentary said to map by capability and effect, "not by URL spelling." Now stated as
one slice per business operation, which settles the two cases route-counting gets wrong: two routes that are
the same operation (a legacy alias, a second mount point) are one slice with two triggers, and one route
dispatching on a body field into two different operations is two slices.

**`[BE-7]` — the versioning *strategy* is the invariant; the URL prefix is the default.** The statement read
as though `/v1` were architecture, while the commentary already said "the spelling is a default, not
architecture" and allowed header or media-type versioning. The rule now requires picking one strategy and
applying it system-wide, with the URL prefix as the default — which is what it always meant, and it removes
the need to record a `CORAL.md` exception for a choice that was never a violation.

**`[LIB-8]` / `[LIB-11]` — a library's errors read in its own vocabulary.** `[LIB-8]` required "typed
taxonomy errors" without saying which half a consumer branches on, which read as Coral asking a codec
library to describe its domain in six words chosen for applications. The domain identity is primary — the
`code` and the typed sentinel, `ErrUnsupportedCodec` — and the `category` rides along as the routing hint
that saves every consumer from writing a mapping table per library. `[LIB-11]` is **clarified**: a changed
`category` is breaking on a code you already ship.

**`[AGENTIC-13]` — side-effect replay protection, which `[AGENTIC-8]` did not provide.** `[AGENTIC-8]`
deduped a mutating agent "by storing the first result keyed to the request." That makes the handler *answer*
consistently; it does not make the agent's *actions* happen once. The agent calls `chargeCard()`, the charge
succeeds, the process dies before the result is stored — the dedupe key was never written, redelivery
re-runs the turn, and the card is charged twice with `[AGENTIC-8]` satisfied at every instant. Every
side-effecting tool now carries its own key, natural key, or action ledger, and the ledger's ordering is
part of the rule: record intent, act, record outcome, because a ledger written only on success cannot tell
"never happened" from "happened and we died before writing it down." **What you must now satisfy:** a
mutating agentic app needs both layers, not one.

**`[AGENTIC-5]` — gating becomes risk-based and policy-bounded.** The blanket form ("irreversible → a human
confirms") reads stricter and is weaker: an agent that needs a click per write is not autonomous, so a team
that needs autonomy reclassifies its writes as reversible and the gate becomes decoration while still
looking like a control. High-risk, privileged, irreversible, or user-visible actions still require approval
**unless pre-authorized within bounded policy** — a spend ceiling, a recipient allow-list, a blast-radius
limit, an expiry. Two guards keep it honest: the bounds are the harness's, resolved at the root
(`[CONFIG-1]`) and never widenable by the agent they constrain; and an action the policy does not classify
escalates rather than proceeding. `[ORCH-4]` and `[ORCH-5]` in [`SYSTEM.md`](./SYSTEM.md) carry the same
clause, so the system spine and the addendum do not disagree.

**`[AGENTIC-10]` — the blanket PII prohibition becomes data governance.** "Keep secrets and PII out of
prompts and logs" was unsatisfiable by construction for the applications most likely to need this page: a
support-triage agent, a recruiting assistant, a medical scribe process personal information *as their
purpose*. An unfollowable rule is not followed selectively, it is ignored wholesale — taking the
satisfiable secrets half with it. Secrets stay **absolute** (a credential has no reason to be in a prompt);
personal data is now **minimized, authorized, redacted, retained, and kept off logs and traces by default**.
This also closes one of the appendix's two open slots: *observability* was blocked on reconciling "capture
every prompt" with `[CONFIG-4]`, and minimization plus redaction plus retention is that reconciliation. One
slot remains — where tool definitions live.

**`[AGENTIC-12]` — model and prompt versions are provenance, not a published contract.** The pin and the
eval gate are unchanged and still guardrails; what was wrong was the framing. "Part of the contract" pulls
in `[CONTRACT-2]`'s versioning discipline and implies external consumers must be notified of a model swap —
and usually they must not be, because their contract is the schema (`[AGENTIC-4]`), which a new model can
satisfy exactly. The pin's value is internal: reproducibility, a forensic trail, a rollback target, and an
eval gate a floating alias would bypass with no commit and no review. Where external compatibility really
does depend on the exact model, it *is* a published contract — decide that deliberately rather than by
default.

**`[WEB-2]` / `[WEB-4]` / `[WEB-6]` — the web default is reversed.** `[WEB-2]` preferred microfrontends
and `[WEB-6]` called an integrated frontend "the honest fallback", while `[WEB-4]` — an **`[auto]`** rule —
banned import edges between panel directories unconditionally. So the sanctioned fallback was still forced
to communicate over a runtime channel across a boundary that does not exist at runtime: one bundle, one
process, one deployment, an untyped bus.

The reasoning behind the old default was sound and the conclusion did not follow. Rich UI is read fan-in
and a dashboard should be many slices — both **structural** properties, obtained from capability slicing
alone. Microfrontends are about **deployment**. So `[WEB-6]` is now the default (one integrated frontend,
organized by capability slice) and `[WEB-2]` is the escalation, adopted for a named requirement:
independent deployment, independent team ownership, runtime isolation, differing frameworks, or
independently versioned surfaces. "The frontend is feature-rich" is not one of them. Each rule keeps its
own subject — `[WEB-2]` is still the microfrontend rule and `[WEB-6]` still the integrated-frontend rule —
so an existing citation of either still means what it meant.

`[WEB-4]` is **loosened** to match: depend only on another slice's published surface, which is a typed
import in an integrated frontend and a channel with no import edge where runtime isolation is claimed.
`[COMPOSE-1]` does not relax — "published surface" means a deliberate export, never a deep path into
another slice's components, hooks, or store.

**`[STATE-5]` — state ownership moves from the slice to the feature package.** The rule said "every
table, file, or bucket has **exactly one owning slice**", `[STATE-1]` keeps queries slice-local, and
`[COMPOSE-1]` sends any second reader through the owner's published capability. Together those made
ordinary CRUD ill-formed: `expense/add`, `expense/edit`, `expense/delete` and `expense/list` all touch one
table, and `[GROW-3]` listed "two slices write the same table" as a signal to split the app. The strictly
compliant alternative was worse — a write slice publishing a read capability for its own siblings, which is
the owning slice becoming the repository `[STATE-2]` exists to prevent.

Ownership is now the **feature package**, with the schema defined once inside it. Slices in the owning
package reach the table directly; a slice in another package still goes through a published capability.
`[GROW-3]`'s trip-wire is rescoped to **two feature packages** writing one table, which is the case that
was always the real signal. **What you must now satisfy:** nothing new — this is a loosening, and it
ratifies what [`examples/cli-slice.md`](./examples/cli-slice.md) already did. The guard is explicit,
though: package ownership is **not** permission for a shared `expense/queries` module. The ownership
boundary moved; the locality boundary did not, and `[STATE-1]` now says so at package scale.

**`[STRUCT-2]` — the feature package is defined, and stopped being a synonym for "slice".** The two spines
disagreed: `ARCHITECTURE.md` showed `category/` containing `add` and `list` (a container of slices), while
`CONVENTIONS.md`'s placement diagram labelled the slice box "a feature package" (the same thing). With
`[STATE-5]` now hanging ownership on the package, that ambiguity had to go. A feature package holds the
slices of one capability and owns their state; it is a container, not a sixth category, which is why
`[MODEL-1]` does not list it. `CONVENTIONS.md` gains a feature-package row in the "capability is
scale-relative" table, since that is exactly the scale that was missing from it.

**The examples were pinned to a version that no longer existed.** All three, plus the audit skill, said
"written against Coral 0.4.0" while `VERSION` said `0.5.0` — `[VER-3]`'s own failure mode, committed by the
reference material, which is worse than committing it downstream because this is what people copy. Fixed,
and `scripts/check-versions.mjs` now fails the build on a lagging declaration, so bumping it is a claim
that the page was re-read against the current rules.

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

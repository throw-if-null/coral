---
name: coral-audit
description: >
  Audit a code repository against Coral Architecture to answer ONE question: is this a Coral app, and
  where does it diverge? The verdict is architectural CONFORMANCE to the rule surface the project's own
  CORAL.md resolves to — the Coral kernel unconditionally, plus the production baseline and the
  app / runtime / language profiles that file explicitly adopts, at the scales it declares ([VER-6]).
  Capability slicing, the five categories, published-capability composition and behavior-first testing are
  kernel and always count; bucket packages, role-revealing package names, named and injected crosscuts,
  thin composition, the error taxonomy and the rest of the production discipline are production-baseline
  policy and count only where that layer is adopted. Structural / naming / cross-cutting-placement
  divergences inside the selected surface ARE the findings; security / correctness / reliability bugs are
  recorded as awareness notes for the team, never the headline and never the answer. Use when asked to
  audit, review, or scrutinize a repo / service / library for Coral alignment. Produces a heavy diagnostic
  report that seeds a SEPARATE planning session; it does NOT plan the refactor or choose big-bang vs
  strangler — that is the later planning session.
---

# Coral repo audit

> Written against **Coral 0.6.0**. Audit a project against the version its
> `CORAL.md` declares, not against this one (`[VER-3]`).
>
> **"Written against" names the latest *released* Coral — the only version a project can
> target. It is not a claim that everything below exists in 0.6.0.** This skill already
> implements `[VER-6]`, which is **unreleased** and ships in 0.7.0: `CORAL.md` adoption
> declarations, the undeclared-normative-surface finding, and scale filtering are all
> 0.7.0 behaviour. A project targeting 0.6.0 or earlier has no adoption declaration and is
> not wrong for it — audit it against its own version's applicability semantics, not
> against the ones below. Delete this note when 0.7.0 is cut.

Scrutinize a repository against Coral Architecture and produce a thorough **diagnostic report** that a
human reads and then feeds into a **separate planning session** (plan mode) — the planning session, not
this audit, decides the refactor approach, sequencing, and tasks.

The report answers **one** question: *is this a Coral app, and where does it diverge?* Conformance to the
architecture is the verdict. Bugs the audit happens to surface along the way — security, correctness,
reliability — are recorded as **awareness notes** for the team, not as the headline and not as the answer.

## Boundary — read this first (it prevents the known failure modes)

1. **Altitude before depth.** Form the *structural thesis* BEFORE reading line-by-line. The biggest
   findings in a base layer have no line number — they are the *shape* of the repo and what it forces
   on consumers. Diving straight into bug-hunting finds real bugs and misses the design.
2. **Diagnose; do not decide the rollout.** The report says *what is wrong* and *what correct looks
   like*. It does NOT prescribe the migration strategy (big-bang vs strangler), sequencing, or task
   breakdown — those are decided later by a human + a planning agent who own the risk and context. Stop
   at findings + target state + decision inputs.
3. **Verify; do not infer.** Never assert a guarantee (delivery semantics, ack, drain, ordering,
   concurrency safety, idempotency) from an API name or a config flag. Read the dependency source. If a
   dependency is unavailable, label the claim explicitly as an unverified inference.
4. **Synthesize.** Cluster findings by root cause and name the linchpin (the one change that dissolves
   several). Finding the pieces is not enough — connect them.
5. **The verdict is conformance to the SELECTED surface — and bugs are not the verdict.** The audit
   answers *is this a Coral app?*, and "a Coral app" means one that satisfies the rules its own `CORAL.md`
   resolves to. There is no fixed list of characteristics that makes a repository conformant, and treating
   one as fixed is how this skill produces findings against rules the project never took on. Four tiers,
   and they are decided by the declaration, never by the code's shape:

   - **kernel** — always counts, for every Coral project, with nothing to adopt and nothing to decline.
     Ten rules, and they audit against three different things. Against the **source**: capability slicing
     and the five categories (`[MODEL-1]`), one trigger owned end to end (`[BOUND-2]`), promotion to a
     crosscut gated on a must-not-diverge invariant (`[XCUT-1]`), consuming another slice only through its
     published capability (`[COMPOSE-1]`), behavior-first tests at the entry point (`[TEST-1]`). Against
     **`CORAL.md`**: `[VER-3]`, `[VER-5]`, `[VER-6]`. Against **how architectural decisions were made**:
     `[AGENT-2]` (ambiguity flagged, not guessed) and `[AGENT-4]` (a human authors every exception and
     extension). Take the membership from `CONVENTIONS.md`'s kernel block, which is its single source.
   - **production baseline** — counts only where `production-baseline` is adopted, and only at the scales
     declared. This is where **no bucket packages** (`[BUCKET-*]`), **role-revealing package names**
     (`[MODEL-2]`), **precisely named and injected crosscuts** (`[XCUT-2]`, `[XCUT-3]`), **thin
     composition** (`[ROOT-1]`), the **error taxonomy** (`[ERR-*]`), state ownership, concurrency,
     idempotency, configuration and trust-boundary policy all live. Most of what an auditor reaches for
     first is in this tier.
   - **app / runtime-agent / language profiles** — count only for the profiles named in `adopts`.
   - **bugs** — security / correctness / reliability defects, *however severe*, go in **Notes for human
     awareness**. Unchanged: they are recorded so the team knows, and never become the headline or the
     answer. Do not let a scary bug hijack the conformance question.

   **Within the selected surface, judge hard.** A misplaced crosscut (error rendering living in `utils`)
   or a meaningless name (`pkg`, `utils`, `middleware.go` — a name that tells you nothing but "it's a
   middleware") is a **real conformance finding** for a project that has adopted the baseline — never file
   it as a throwaway LOW and move on. Only a genuinely cohesive unit's exact name is cosmetic; say which is
   which, but don't use "don't flag every folder" as an excuse to wave off a real bucket or a misplaced
   concern.

   **Outside it, observe — do not convict.** A kernel-only project with a `utils` package is not in breach
   of anything: `[BUCKET-1]` is not in its surface. Record what you saw as an **observation**, say which
   rule *would* bite, and let it feed the one question that is actually open for that project — whether to
   adopt the baseline. An observation is not a finding, is not ranked with findings, and does not move the
   verdict.
6. **Judge what an applicable rule decides; observe what none does; flag what you can't adjudicate.**
   Conformance exists to make the code legible and maintainable for humans *and agents*, which is why
   structural findings carry the verdict when they are in scope. Four moves, and the first two are
   separated by applicability alone:
   **(a) judge** structure / naming / placement **where a rule in the selected surface decides it** —
   Coral's answer there is determinate and does not depend on the reader's taste, so a divergence is a
   conformance finding and never a throwaway LOW. Most of these rules are production baseline
   (`[MODEL-2]`, `[BUCKET-1]`, `[ROOT-1]`, `[XCUT-2]`, `[XCUT-3]`, `[STATE-*]`), so *which* structural
   answers Coral has for this project is a fact about its `CORAL.md`, not about structure in general.
   **(b) observe** the same thing when the rule that would decide it belongs to a layer the project has
   not adopted. Coral has an opinion; this project has not taken it on. Record what you saw and which rule
   would apply, and keep it out of the findings and the verdict (boundary rule 5).
   **(c) flag** a consequential, non-obvious *behavioral or contract* choice (delivery semantics, effect
   ordering, a deliberate deviation from the obvious) that the selected rules do not determine, or whose
   intent you cannot establish: it may be a valid trade-off whose reasons you cannot see — do NOT rule it
   wrong. Surface it for a human to confirm, and check whether an explanatory **comment** captures the
   "why." An undocumented murky decision is itself a maintainability gap (flag it as "confirm intent +
   document"); a decision that IS commented is legible — just note it and credit the comment. In an
   agent-first codebase this matters *more*, not less: the next agent cannot ask the author, so unwritten
   rationale is invisible. **(d) note** outright defects with no deliberate-choice character (a security
   hole, a nil-deref) as awareness notes. Rule what an applicable rule decides and you can verify; observe
   what is out of scope; flag what you can't adjudicate.
7. **Read-only.** This skill reads and reports; it never modifies the audited code.

## Input

A path to the repo (from the user's prompt or `args`). If none is given, ask which repo. You have access
to dependency repos too — use them (boundary rule 3).

**Read the repo's `CORAL.md` first. It decides what you are auditing against, and without it there is no
audit to perform.** It is the project's adherence record, and every field changes what counts as a
finding:

- **`targets: <version>`** — audit against *that* version, never against the newest Coral you happen to
  have (`[VER-3]`). A rule added after the declared target is not yet binding on this project; note it as
  an upgrade consideration, not a divergence. A rule that is only in an unreleased Coral binds nobody.
- **`scales`** — which architectural scales the repository is written at. A project that declares only
  `app` does not owe system-scale rules (`[CHAN-*]`, `[SYS-TEST-*]`, `[ORCH-4..6]`), whatever it adopts.
- **`adopts`** — the non-kernel ownership scopes the project has taken on (`[VER-6]`). **This is the
  audit's scope.** The kernel applies unconditionally. Everything else — the production baseline
  included — applies only because this block says so, at the declared scales. A rule outside the selected
  set is not a finding, and never becomes one because it exists in the Coral repository.

**Read `targets` before you require any of the rest.** `[VER-6]` is itself versioned: a record targeting a
Coral release from before it was added legitimately has no `scales` and no `adopts`, and reporting that
absence as a `[VER-6]` violation applies a rule to a project whose target predates it — which is what
`[VER-3]` forbids. For such a project, load the applicability semantics of the version it targets and
audit against those; do not audit it against this version's, and do not report its record as invalid.
- **Extensions** — project-local rules Coral has no rule for, each scoped to a path. Treat them as
  binding **within that path**: code that breaks a declared extension there is a finding, cited by its
  project ID.
- **Exceptions** — Coral rules the project knowingly breaks, each scoped to a path. Inside that path they
  are **accepted deviations**, not findings. Outside it the rule still applies in full. Report them in
  their own short section so the reader sees the standing debt, and flag any whose stated `revisit when`
  condition now appears to be met.

### No `CORAL.md`, or an invalid one — stop and report that

**Do not audit a repository whose adoption declaration is missing, unparsable, or invalid, and do not
substitute a default for it.** The project has an **undeclared normative surface**: which Coral rules bind
it is nobody's stated decision, so any finding you produce is a finding against rules you chose on the
project's behalf.

This is the headline finding, and it replaces the conformance verdict rather than sitting beneath it:

> **Undeclared normative surface.** This repository has no valid Coral adoption declaration, so which
> Coral rules apply to it is undefined. A conformance verdict is not available until a human records one
> (`[VER-6]`).

Auditing it against whatever version you happen to have loaded is exactly the behaviour `[VER-6]` exists
to stop. So is guessing: "it looks like a CLI, so I audited the CLI profile", "there are two services here, so I applied
the system-scale rules", "an unrecognised profile name, so I skipped that layer".

What you **may** do — and should — is propose one. Read the repository, say which scales and which scopes
it looks like it needs and why, and write the declaration out in full as a **recommendation for a human**:

- label it clearly as a proposal, never as the surface you audited against;
- **never write or edit `CORAL.md` yourself** (`[AGENT-4]`) — recommend the entry and let a human commit
  it.

You may then, if it is useful, produce a **hypothetical assessment** against the proposed set — clearly
labelled as such, headed by the declaration it assumes, and carrying **no conformance verdict**. A
conformance verdict requires a declaration recorded in `CORAL.md`, and nothing else stands in for one.

**A confirmation in this session does not.** `[VER-6]` says the project's `CORAL.md` declares its adopted
surface, and the whole design is one file with one answer. A surface agreed in chat is a second source of
applicability that no future agent, tool, or reviewer can read, that nobody can diff, and that disagrees
with the file the next audit will load. Treat it as what it is — a human endorsing your proposal, which
makes recording it likely, not already done. Say so, and say the verdict is waiting on the commit.

The same applies to a declaration that is present but does not resolve: an unknown ownership key, an
unregistered profile name, an unknown scale, or an exception naming a rule the project has not selected.
Report the specific problem; do not repair it and do not work around it.

## Procedure

### 1. Frame (altitude) — before any line-by-line reading

Framing is **observation, not adjudication**. Answer these for any repository, whatever it has adopted;
they tell you what the code *is*. Which of the answers becomes a finding is decided later, in step 3, by
the selected surface — several of the questions below are shaped by production-baseline policy
(`[ROOT-1]` thinness, `[XCUT-3]` injection, `[MODEL-4]` interface direction) and are only divergences for
a project that adopted it.

Produce a **structural thesis** by answering:
- What is this repo — an app (and which app-type appendix applies?) or a crosscut / framework /
  base layer?
- What is its *shape*? A thin composition root that composes concerns, or god-files mixing orchestration
  with subsystem implementation?
- **What does it force on its consumers?** Dependency injection vs service-locator/globals? Can a
  consumer test against it without booting the whole thing? Does a change here ripple into many repos?
- If it's a framework: is standardization achieved by *composition* or by *containment*?
- Dependency surface: does every consumer link things it does not use?
- Do the five categories map cleanly (slice / crosscut / adapter / composition root / published
  contract — `[MODEL-1]`, kernel, so this one binds every Coral project)? An adapter is only an adapter if
  the slice declares the interface and the adapter implements it (`[MODEL-4]`, production baseline); the
  other arrow direction is a `repository` layer. Where nothing maps, is that a smell in the code or a gap
  in the architecture?

Map the surface to support this: manifest/`go.mod`, file sizes, the public API, and the critical
subsystems — lifecycle/init, shutdown, persistence, transport/channel, HTTP, config, globals, health. For
large repos, prioritize the critical paths; you may read in parallel.

### 2. Map the units
List the capabilities/slices, the crosscuts, the published contracts (the channel surface), and the
composition root. Note where the Coral model fits and where it strains.

### 3. Walk the rule families (depth) — line-cited

Read the code and the docs; judge for yourself. **Do not run a linter or any other tool as a source of
findings.** The Coral documents are the only authority on what a rule means, and a tool's implementation
of a rule is one interpretation of it — trusting that interpretation would quietly substitute the tool's
opinions for the architecture's. Whether to adopt a linter is a human's decision, made after reading an
audit, not an input to producing one.

For each family, cite `file:line` and tag *earns-its-keep* vs *overkill*. The order below is a priority
order **over the production baseline**, which is the layer most projects adopt and where most of these
families live; for a project that adopted it, the first two and the last two carry the verdict — capability
slicing, placement/naming, and thin composition — so do not treat them as warm-up. For a project that did
not, they are observations (boundary rule 5) and the walk is short. **What a kernel-only project is
audited against, in full:**

- against the **source** — `[MODEL-1]` (the five categories), `[BOUND-2]` (one trigger, owned end to end),
  `[XCUT-1]` (promotion to a crosscut needs a must-not-diverge invariant), `[COMPOSE-1]` (published
  capability, never internals), `[TEST-1]` (behavior-first at the entry point). Five rules; that is the
  whole structural surface.
- against **`CORAL.md`** — `[VER-3]` (a target is declared), `[VER-5]` (deviations are explicit and
  path-scoped), `[VER-6]` (what it adopts is declared).
- against the **way architectural decisions were made** — `[AGENT-2]` (an ambiguous architectural decision
  is flagged for a human rather than guessed) and `[AGENT-4]` (only a human authors an exception or an
  extension). These are kernel and they do bind, but what they bind is process and record: audit them by
  asking whether ambiguity was escalated and whether the `CORAL.md` entries look human-authored, not by
  grepping a slice.

Ten rules, which is the whole kernel. Read the kernel block in `CONVENTIONS.md` for the current
membership rather than trusting this list — it is the single source, and this is a reading aid.

The order below is the baseline's:
- fit: is this a command/request-shaped app the model actually covers, or a dense coupled domain it
  is weak for? does everything converge on one god-slice? — `[SCOPE-*]`
- capability slicing, placement & role-revealing names: packages named for the capability or concern
  they own and never for a technical role, crosscuts rare and precisely named — `[MODEL-*]` /
  `[STRUCT-*]`
- boundary & verbs — `[BOUND-*]` / `[IDEM-*]`
- crosscuts vs forbidden buckets, including the entity loophole (invariants may be a crosscut;
  queries and storage may not) — `[XCUT-*]` / `[BUCKET-*]`
- effects, state & schema ownership (one owning feature package per table; interface ownership points
  adapter → slice) — `[EFFECT-*]` / `[STATE-*]`
- configuration: resolved and validated at the root, injected, never read ambiently from a slice —
  `[CONFIG-*]`
- errors: taxonomy, raise-vs-render, swallowing — `[ERR-*]`
- trust boundary, secrets, authz — `[TRUST-*]`
- delivery guarantees & contracts (events/channel, versioning) — `[CHAN-*]` / `[CONTRACT-*]`
- testing: is it injectable, or a boot-the-world coupling magnet? — `[TEST-*]` / `[SYS-TEST-*]`
- slice-to-slice dependency: published capability only, never another slice's internals; a shared
  multi-step workflow becomes its own slice — `[COMPOSE-*]`
- composition-root thinness & global state — `[ROOT-*]`

**Walk only the families in the project's selected set, and file findings only against rules in it.**
App-type families (`[WEB-*]`, `[BE-*]`, `[CLI-*]`, `[AGENTIC-*]`, …) are deliberately absent from the
order: the `adopts` block already says which profiles apply, so a new app type needs no change here. Each
document's **Agent Execution Contract** is the complete list of `[auto]`/`[review]` rules for that
document — use it as the checklist, this list as the order, and the `coral:scope:` markers inside it to
tell which of its lines the project actually adopted. `ARCHITECTURE.md`'s contract is unscoped and short
because everything in it is kernel; `PRODUCTION.md`'s whole contract sits under one `coral:scope:baseline`
marker; `SYSTEM.md` marks its baseline and runtime-agent groups separately.

**Do not reconstruct the selected set from the code.** "It has a `utils` package, so `[BUCKET-1]` must
apply", "it talks to another service, so the `[CHAN-*]` rules apply", "it has an HTTP handler, so audit the
backend profile" — each of those is the inference `[VER-6]` exists to end. The declaration is the only
input. If it looks like the project should have adopted more than it did, that is a **recommendation** for
the report, not a licence to audit against the larger set.

Two families are never findings against a slice, for two different reasons, and neither is the whole
`[VER-*]` family:

- **framework governance** — `[VER-1]`, `[VER-2]`, `[VER-4]`, `[AGENT-1]`, `[AGENT-3]`, `[AGENT-5]`. These
  bind the project's *decisions about Coral*, not its code, and are not adoptable into an application
  conformance surface at all.
- **the kernel's record and process rules** — `[VER-3]`, `[VER-5]`, `[VER-6]`, `[AGENT-2]`, `[AGENT-4]`.
  These are kernel rules and *do* bind every Coral project unconditionally, but what they bind is
  `CORAL.md` and the decisions around it: does it declare a target, are its exceptions and extensions
  machine-readable and path-scoped, does it declare what it adopts, was an ambiguous architectural call
  escalated rather than guessed, was each recorded deviation authored by a human. Check them against that
  file and against the decision trail, never against a slice.

For base layers especially, also scrutinize: init error handling (panic vs return; partial-init), graceful
shutdown (ordering, timeouts, exit codes, in-flight drain), concurrency / global-state safety (data
races), resource management (pools, leaks, reconnection), observability correctness, and fail-fast config.

Rule definitions live in the Coral docs (`CONVENTIONS.md`, `ARCHITECTURE.md`, `PRODUCTION.md`,
`SYSTEM.md`, `appendix/*` in the coral-architecture repo / site) — read them if available; otherwise reason
from the family names. **`PRODUCTION.md` is where the production baseline's app-scale rules are defined**,
and for a project that has adopted the baseline that is most of its applicable surface; `ARCHITECTURE.md`
holds only the kernel's app-scale rules and the governance rules that frame them. That split arrived in
Coral 0.7.0 — in a release the project's `targets` predates, those same rules are defined in
`ARCHITECTURE.md` instead. The rule IDs are unchanged either way, so read whichever layout that version
has; `rules.md` in any release maps every ID to the document defining it.

### 4. Verify, don't infer
For every guarantee a finding rests on, read the dependency source to confirm or refute it. Correct or
explicitly label any remaining inference.

### 5. Synthesize
Cluster the **conformance** findings by root cause and name the one structural change that would move the
repo most toward Coral (the linchpin). Rank findings by how far they sit from Coral and what the
divergence costs to re-align — not by bug impact. Keep any bugs in their own awareness-notes pile; they
are recorded, not ranked as conformance findings.

### 6. Report — the handoff artifact
Write `CORAL_AUDIT.md` to the **audited repo's root** (private — never publish a candid internal audit to
a public/shared site). It is a **heavy diagnostic briefing**, optimized as input to a separate planning
session; heaviness is intentional — the planner needs full context. Include:
- The **audited surface**, stated before anything else: the Coral version targeted, the scales declared,
  and the scopes adopted — the set every finding below is measured against. Name what is **not** in it as
  well, in one line, so a reader cannot mistake a short findings list for a clean repository: "the
  production baseline is not adopted, so `[BUCKET-*]`, `[ERR-*]`, `[STATE-*]`, `[CONC-*]`, `[CONFIG-*]`
  and `[ROOT-*]` were not audited." If the declaration was missing or invalid, this section says so and the
  report stops at a proposed declaration instead of a verdict.
- A **conformance verdict**, led with: *is this a Coral app?* (yes / partly / no) in one paragraph, with
  the structural thesis — what shape the code actually is versus a capability-sliced app.
- A **conformance findings table**, ranked by distance-from-Coral (note which Coral rule each breaks).
- Per finding: *what · where (file:line) · which Coral rule it diverges from · why it's a divergence ·
  target state (what the Coral form looks like)*. Be thorough.
- An **Observations — outside the adopted surface** section, where anything the audit noticed that a
  *non-adopted* layer would have flagged is recorded: what it is, where, and which rule would bite if the
  layer were adopted. This is the section that makes "should we adopt the production baseline?" a decision
  with evidence behind it. It is explicitly **not** findings — do not rank it with them, do not let it
  reach the verdict, and do not word it as a violation. Omit the section entirely when the project has
  adopted everything relevant.
- A **"what conforms (keep)"** section — credibility requires acknowledging what is already Coral
  (including what it gets for free from a Coral-aligned framework versus what the repo earned itself).
- A **Flags — confirm intent & document** section: consequential, non-obvious behavioral/contract choices
  the audit cannot adjudicate (e.g. delivery semantics, effect ordering). For each: what the choice is,
  why it's consequential, and whether an explanatory comment already exists. These ask a human to confirm
  the choice and, if it stands, document it — they are neither conformance findings nor bugs.
- An **Accepted deviations** section listing every exception declared in the project's `CORAL.md`, with the
  rule it breaks and its stated trade-off. These are **not findings** — a documented, deliberate decision
  has already been adjudicated. Two things to add value here: mark any whose `revisit when` condition now
  looks met, and mark any that appear in several places or several projects, because a recurring exception
  is the signal for an **amendment** to Coral itself rather than a permanent local carve-out.
- A **Deliberate-looking but undocumented** section: deviations that read as somebody's decision rather
  than as drift, but which no `CORAL.md` entry covers. For each, say what the choice appears to be and ask
  a human to either record it (as an exception or an extension) or reverse it. This is the section that
  makes the loop converge — an undocumented decision gets re-litigated by every agent that meets it. Do
  not write the record yourself (`[AGENT-4]`); propose the wording.
- A separate **Notes for human awareness (not conformance)** section: bugs / security / correctness /
  reliability found in passing, recorded so the team knows. Flag any that warrant escalation — but keep
  them out of the conformance verdict, and keep them shorter than the conformance findings.
- A **synthesis**: conformance clusters + the linchpin change that moves the repo most toward Coral.
- **Decision inputs** (clearly labeled as inputs, not decisions): how far from Coral is it? what does
  re-aligning cost / what's its blast-radius? what already conforms? dependency surface? — the factors a
  planning session weighs to choose an approach.
- A closing line stating this report is the **seed for a planning session** that will decide the approach
  (big-bang vs strangler), sequencing, and task breakdown — none of which belong here.

## Do NOT
- Audit a repository with no valid `CORAL.md` against whatever version you happen to have loaded, or
  against any set you chose yourself. Report the undeclared normative surface and propose a declaration instead.
- Treat an inferred adoption set as normative — including one a human agrees with in the session. A
  proposed surface can carry a clearly labelled hypothetical assessment; only a declaration recorded in
  `CORAL.md` can carry a conformance verdict.
- File a finding against a rule outside the project's selected set — including the ones it is most
  tempting to treat as universal: a `utils`/`services`/`helpers` bucket, a technical-role package name, a
  fat composition root, a shared repository layer, an ad-hoc error shape, an ambient config read. Every one
  of those is **production baseline**, and a project that has not adopted that layer does not owe them.
  Record them as observations instead.
- Prescribe the migration strategy, sequencing, or task breakdown (that is the planning session's job).
- Assert a guarantee you did not verify in the dependency source.
- Lead with a bug (security / correctness / reliability) or let one become the verdict — the verdict is
  Coral conformance; bugs are awareness notes. Never skip the conformance thesis.
- File a misplaced crosscut or a bucket / meaningless name as a throwaway LOW **where the baseline is
  adopted** — those ARE the findings for that project.
- Infer the adopted set from the repository's shape, or widen it because the code "obviously needs" a
  rule. Recommend the wider declaration; audit the declared one.
- Rule a behavioral / contract trade-off (delivery semantics, effect ordering) "wrong" when you cannot
  see the reasons — flag it for a human and check for an explanatory comment instead.
- Publish a candid audit of an internal repo to a public or shared site.
- Modify the audited code — read and report only.

## Note
This skill is itself shared infrastructure — a base layer for audits. Keep it small and clear; if the
method is wrong, every audit inherits the flaw. Scrutinize it like you would any base layer.

---
name: coral-audit
description: >
  Audit a code repository against Coral Architecture to answer ONE question: is this a Coral app, and
  where does it diverge? The verdict is architectural CONFORMANCE — capability slicing, cross-cutting
  concerns placed as named crosscuts, no bucket packages, role-revealing names, published contracts,
  thin composition. Structural / naming / cross-cutting-placement divergences ARE the findings;
  security / correctness / reliability bugs are recorded as awareness notes for the team, never the
  headline and never the answer. Use when asked to audit, review, or scrutinize a repo / service /
  library for Coral alignment. Produces a heavy diagnostic report that seeds a SEPARATE planning session;
  it does NOT plan the refactor or choose big-bang vs strangler — that is the later planning session.
---

# Coral repo audit

> Written against **Coral 0.5.0**. Audit a project against the version its
> `CORAL.md` declares, not against this one (`[VER-3]`).

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
5. **The verdict is conformance — and bugs are not the verdict.** The audit answers *is this a Coral
   app?* Substance = conformance to Coral: capability slicing, cross-cutting concerns placed as named
   crosscuts, no bucket packages, role-revealing names, published contracts, thin composition. A
   misplaced crosscut (e.g. error rendering living in `utils`) or a meaningless name (`pkg`, `utils`,
   `middleware.go` — a name that tells you nothing but "it's a middleware") is a **real conformance
   finding** — never file it as a throwaway LOW and move on. Only a genuinely cohesive unit's exact name
   is cosmetic; say which is which, but don't use "don't flag every folder" as an excuse to wave off a
   real bucket or a misplaced concern. Security / correctness / reliability defects, *however severe*, are
   recorded in a separate **Notes for human awareness** section so the team knows — they do NOT become the
   headline or the answer. Do not let a scary bug hijack the conformance question.
6. **Judge what's clearly wrong; flag what you can't adjudicate — and require it be documented.**
   Conformance exists to make the code legible and maintainable for humans *and agents* — that is the
   whole point of structure and naming, and it is why structural findings matter so much. So:
   **(a) judge** structure / naming / placement — these have a context-independent right answer and
   directly serve legibility; they are the conformance findings. **(b) flag** a consequential, non-obvious
   *behavioral or contract* choice (delivery semantics, effect ordering, a deliberate deviation from the
   obvious): it may be a valid trade-off whose reasons you cannot see — do NOT rule it wrong. Surface it
   for a human to confirm, and check whether an explanatory **comment** captures the "why." An
   undocumented murky decision is itself a maintainability gap (flag it as "confirm intent + document"); a
   decision that IS commented is legible — just note it and credit the comment. In an agent-first codebase
   this matters *more*, not less: the next agent cannot ask the author, so unwritten rationale is
   invisible. **(c) note** outright defects with no deliberate-choice character (a security hole, a
   nil-deref) as awareness notes. Rule what you can verify; flag what you can't.
7. **Read-only.** This skill reads and reports; it never modifies the audited code.

## Input

A path to the repo (from the user's prompt or `args`). If none is given, ask which repo. You have access
to dependency repos too — use them (boundary rule 3).

**Read the repo's `CORAL.md` first, if it has one.** It is the project's adherence record and it changes
what counts as a finding:

- **Targets: Coral `<version>`** — audit against *that* version, not the latest (`[VER-3]`). A rule added
  after the declared target is not yet binding on this project; note it as an upgrade consideration, not a
  divergence.
- **Extensions** — project-local rules Coral has no rule for. Treat them as binding: code that breaks a
  declared extension is a finding, cited by its project ID.
- **Exceptions** — Coral rules the project knowingly breaks. These are **accepted deviations**, not
  findings. Report them in their own short section so the reader sees the standing debt, and flag any whose
  stated `revisit when` condition now appears to be met.

If the repo has no `CORAL.md`, say so once: audit against the current version, and note that the project
has no declared target or exception register. **Never write or edit `CORAL.md` yourself** (`[AGENT-4]`) —
recommend the entry and let a human commit it.

## Procedure

### 1. Frame (altitude) — before any line-by-line reading
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
  contract — `[MODEL-1]`)? An adapter is only an adapter if the slice declares the interface and the
  adapter implements it (`[MODEL-4]`); the other arrow direction is a `repository` layer. Where nothing
  maps, is that a smell in the code or a gap in the architecture?

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

For each family, cite `file:line` and tag *earns-its-keep* vs *overkill*. The first two and the last
two carry the verdict — they are capability slicing, placement/naming, and thin composition, the
dimensions the conformance answer rests on. Do not treat them as warm-up:
- fit: is this a command/request-shaped app the model actually covers, or a dense coupled domain it
  is weak for? does everything converge on one god-slice? — `[SCOPE-*]`
- capability slicing, placement & role-revealing names: packages named for the capability or concern
  they own and never for a technical role, crosscuts rare and precisely named — `[MODEL-*]` /
  `[STRUCT-*]`
- boundary & verbs — `[BOUND-*]` / `[IDEM-*]`
- crosscuts vs forbidden buckets, including the entity loophole (invariants may be a crosscut;
  queries and storage may not) — `[XCUT-*]` / `[BUCKET-*]`
- effects, state & schema ownership (one owning slice per table; interface ownership points
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

This list is a priority order, not the whole rule set — the docs are authoritative. App-type families
(`[WEB-*]`, `[BE-*]`, `[CLI-*]`, `[AGENTIC-*]`, …) are deliberately absent: step 1 already selects the
appendix that applies, so a new app type needs no change here. Each spine's **Agent Execution Contract**
is the complete list of `[auto]`/`[review]` rules for that document — use it as the checklist and this
list as the order.

For base layers especially, also scrutinize: init error handling (panic vs return; partial-init), graceful
shutdown (ordering, timeouts, exit codes, in-flight drain), concurrency / global-state safety (data
races), resource management (pools, leaks, reconnection), observability correctness, and fail-fast config.

Rule definitions live in the Coral docs (`CONVENTIONS.md`, `ARCHITECTURE.md`, `SYSTEM.md`, `appendix/*`
in the coral-architecture repo / site) — read them if available; otherwise reason from the family names.

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
- A **conformance verdict**, led with: *is this a Coral app?* (yes / partly / no) in one paragraph, with
  the structural thesis — what shape the code actually is versus a capability-sliced app.
- A **conformance findings table**, ranked by distance-from-Coral (note which Coral rule each breaks).
- Per finding: *what · where (file:line) · which Coral rule it diverges from · why it's a divergence ·
  target state (what the Coral form looks like)*. Be thorough.
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
- Prescribe the migration strategy, sequencing, or task breakdown (that is the planning session's job).
- Assert a guarantee you did not verify in the dependency source.
- Lead with a bug (security / correctness / reliability) or let one become the verdict — the verdict is
  Coral conformance; bugs are awareness notes. Never skip the conformance thesis.
- File a misplaced crosscut or a bucket / meaningless name as a throwaway LOW — those ARE the findings.
- Rule a behavioral / contract trade-off (delivery semantics, effect ordering) "wrong" when you cannot
  see the reasons — flag it for a human and check for an explanatory comment instead.
- Publish a candid audit of an internal repo to a public or shared site.
- Modify the audited code — read and report only.

## Note
This skill is itself shared infrastructure — a base layer for audits. Keep it small and clear; if the
method is wrong, every audit inherits the flaw. Scrutinize it like you would any base layer.

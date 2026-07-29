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
the batch is cut. **This batch completes every core appendix, which is the `1.0.0` condition** — see the
note at the end.

**`web.md` is complete.** Its last two slots are filled:

- **`[WEB-11]`** `[review]` — server state is the source of truth; client state is a **cache of it**, owned
  by the slice that fetched it, and never the only place a fact exists. This is `[STATE-6]` in the browser,
  where a hard refresh, a new tab and a cold load *are* the empty-cache case — so the empty case is the
  second-most-common way a page loads, not an edge case. Invalidation is owned by the slice that caused the
  change, which then publishes on the bus (`[WEB-4]`); no panel reaches into another's cache, which is what
  keeps a global read-write store from arriving one convenience at a time. Optimistic updates are a
  *display* concession and must reconcile and surface failure. Never-sent state — form drafts, scroll,
  expand/collapse — is the one genuinely client-owned kind.
- **`[WEB-12]`** `[review]` — a behavior test drives the slice **through the surface a user or caller
  actually touches** and asserts the observable contract. Rules out component-internal state, markup
  snapshots (which assert *shape*, so they fail on every redesign and pass on every wrong total), and
  mocking the capability call the slice exists to make. Mandatory additions: an authorization test at the
  boundary, because `[WEB-7]` regresses silently, and for microfrontends a contract test on the panel bus.

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

**Rules: 172 → 174.** Every core appendix is now complete, so `1.0.0` is available to cut whenever the
batch is deemed ready.

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
  from every other app type because a route has no version prefix and no deprecation channel: you cannot
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

Families, by document:

| Document | Families |
|---|---|
| `CONVENTIONS.md` | `AGENT`, `VER` |
| `ARCHITECTURE.md` | `SCOPE`, `MODEL`, `BOUND`, `ROOT`, `STRUCT`, `BUCKET`, `XCUT`, `DUP`, `COMPOSE`, `EFFECT`, `STATE`, `CONC`, `CONFIG`, `IDEM`, `ERR`, `OBS`, `CONTRACT`, `TRUST`, `TEST`, `GROW` |
| `SYSTEM.md` | `BUS`, `ORCH`, `SYS-TEST` |
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

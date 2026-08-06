# Coral Architecture

A set of rules for organising code in a repository, written to be followed by coding agents as well as by
people. The organising principle is one sentence: **one capability, owned end to end, in one place.**
Everything one command or one endpoint needs sits together, its tests included, rather than being spread
across a `handlers/`, a `services/` and a `repositories/` directory. Shared code exists only where it is
named and passed in. The same shape applies to a CLI, a backend, a web app, a library, or a tool, and it
composes from a single capability up to a whole system.

**📖 Live docs:** https://gray-hill-09bb08b03.7.azurestaticapps.net — the guided version, with a worked
directory layout, the four kinds of code, and where the architecture does not fit.

Coral is a poor fit for dense domains where every feature reaches into one central concept — a tax engine,
a scheduler, a solver. That limit is stated as a rule (`[SCOPE-2]`), not as a footnote.

## The documents

Start with [`CONVENTIONS.md`](./CONVENTIONS.md). It defines the seven nouns every other document uses, the
rule-ID scheme, the enforcement classes, and the agents-write / humans-review operating model; the rest
refer back to it instead of restating any of it.

From there: [`ARCHITECTURE.md`](./ARCHITECTURE.md) is how to build one app,
[`SYSTEM.md`](./SYSTEM.md) is how separately-built apps compose over a channel, [`appendix/`](./appendix)
holds one file per app type, and [`examples/`](./examples) holds worked code — including
[a real service reviewed against the rules](./examples/backend-review.md), which states where they would
have been overkill.

Rules carry stable IDs like `[DUP-2]` with an enforcement class (`[auto]` / `[review]` / `[guide]`); on the
live site every citation links to its definition. The build fails if a rule has no class, if a citation has
no definition, if a rule is missing from its document's Agent Execution Contract, if a published rule ID
has disappeared or been reclassified, or if a link fragment doesn't resolve — the docs' own drift control
is structural, not goodwill.

## Versioning, and how a project records where it differs

Coral is versioned because it will be **incomplete**: rules get missed, patterns need covering, and some
rules turn out to be wrong. The current version is in `VERSION`; what changed is in
[`CHANGELOG.md`](./CHANGELOG.md), recorded per rule ID. Rule IDs are append-only — never renumbered,
recycled, or removed — and `rules.lock` is the checked-in record the build enforces that against.

A consuming project keeps a **`CORAL.md`** in its root declaring the version it targets and two kinds of
local divergence:

- an **Exception** — Coral has a rule; this project knowingly breaks it for a trade-off
- an **Extension** — Coral has no rule; this project needs one; it stays local, under its own ID prefix

A third kind isn't recorded locally at all: an **Amendment** is when a Coral rule is *wrong or too
narrow*, and it goes upstream as an issue or PR on this repo. An exception that recurs across projects is
the signal for one — and when the amendment lands, the local entries are deleted and the project bumps its
target. **The register shrinks when Coral improves.**

An agent never authors an exception or an extension (`[AGENT-4]`); it flags the ambiguity and a human
decides and records it. And it reads `CORAL.md` before escalating (`[AGENT-5]`), so a settled decision
isn't re-litigated by every agent that meets it. The full convention is in
[`CONVENTIONS.md`](./CONVENTIONS.md#versioning-and-local-deviations).

## The linter

[`tools/coral-lint/`](./tools/coral-lint/) is the Tier 1 gate: it fails the build on the `[auto]` rules a
static check can decide. Eleven today — `[BUCKET-1]`, `[XCUT-2]`, `[STRUCT-1]`, `[ROOT-2]`, `[STATE-2]`,
`[CONFIG-2]`, `[CONC-1]`, `[IDEM-2]`, `[ERR-2]`, plus `[LIB-3]` and `[LIB-5]` for published libraries —
with every other `[auto]` rule listed under `--coverage` alongside a stated reason it isn't checked yet, so
nothing is silently uncovered.

```bash
cd tools/coral-lint
python3 -m coral_lint /path/to/repo     # exit 1 on findings; --json for a stable machine contract
python3 -m coral_lint --coverage        # what runs, and why the rest doesn't
```

No dependencies, Python 3.11+. `[BUCKET-1]` needs no configuration, so it is useful immediately; the rest
read a `coral.toml` in the audited repo declaring where its slices live, because guessing is how a linter
earns false positives. It is itself a Coral CLI — one slice per check — and it passes its own gates.

## The audit skill

[`.claude/skills/coral-audit/`](./.claude/skills/coral-audit) is the operational counterpart to the
docs: point it at a repo and it produces a `CORAL_AUDIT.md` answering one question — *is this a Coral
app, and where does it diverge?* Structural divergences are the findings; bugs it happens to surface
are recorded as awareness notes, never the verdict. It diagnoses only — the refactor approach is
decided later, by a human in a separate planning session.

Because it lives in `.claude/skills/`, Claude Code picks it up automatically when you work in this
repo. To audit *other* repos — which is the point — install it at user level:

```bash
ln -s "$PWD/.claude/skills/coral-audit" ~/.claude/skills/coral-audit
```

A symlink rather than a copy, deliberately: two copies of the same rules drift, and the docs are the
one place the rules are allowed to live.

## Run the docs locally

```bash
npm install
npm run docs:dev      # live preview at http://localhost:5173
npm run docs:build    # static site → .vitepress/dist
npm run docs:preview  # serve the built site
```

## Deployment

Pushing to `main` triggers the Azure Static Web Apps workflow
(`.github/workflows/azure-static-web-apps-*.yml`), which builds with `npm run build` and publishes
`.vitepress/dist`.


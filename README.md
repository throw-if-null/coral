# Coral Architecture

A capability-first software architecture for a world where **agents write the code and humans review
and orchestrate**. It applies to CLIs, backends, web apps, libraries, and tools — and composes the
same way from a single slice up to a whole system.

**📖 Live docs:** https://gray-hill-09bb08b03.7.azurestaticapps.net

## The idea in one breath

Code falls into exactly four categories, and knowing which you are writing answers most placement
questions:

- A **slice** owns one capability end to end — its trigger, parsing, validation, behavior, state
  access, output, and tests.
- A **horizontal** is a cross-cutting concern — logging, config, the error taxonomy, a domain
  invariant — defined **once**, precisely named, and **injected**. Never re-built per slice.
- The **composition root** registers slices, constructs horizontals, and injects them. No logic.
- A **published contract** is the only surface anyone else may depend on.

Anything that is none of these is a `utils`/`services`/`shared` pile, and the answer is a real
horizontal or honest duplication — not a bucket.

Three rules hold at every scale (slice, app, system): own your trigger end to end; share only through
a named horizontal or a published contract; cross a boundary only over the bus.

**Where it doesn't fit:** dense, deeply-coupled domains where every feature reaches into one central
concept — a tax engine, a scheduler, a solver. Slicing fights those domains. Use something else and
say so.

## The documents

Read them in this order:

1. **[`CONVENTIONS.md`](./CONVENTIONS.md)** — start here. The vocabulary, the canonical slice, the
   rule-ID scheme, the enforcement classes, and the agents-write / humans-review operating model.
2. **[`ARCHITECTURE.md`](./ARCHITECTURE.md)** — the app spine: how to build one app.
3. **[`SYSTEM.md`](./SYSTEM.md)** — the system spine: how apps compose over a bus.
4. **[`appendix/`](./appendix)** — one file per app type (CLI, backend, web, agentic/LLM, library,
   GitHub Action).
5. **[`examples/`](./examples)** — [two CLI slices in Python](./examples/cli-slice.md) (one file each),
   [an HTTP slice in Go](./examples/go-api-slice.md) (where the language forces a capability across
   packages), and [the rules applied to a real service](./examples/backend-review.md) including where
   they'd be overkill.

Rules carry stable IDs like `[DUP-2]` with an enforcement class (`[auto]` / `[review]` / `[guide]`);
on the live site every citation links to its definition. The build fails if a rule has no class, if a
citation has no definition, or if a rule is missing from its document's Agent Execution Contract — the
docs' own drift control is structural, not goodwill.

The name is explained in one paragraph at the end of `CONVENTIONS.md`. It is a naming scheme, not a
reasoning tool; no rule requires the metaphor to apply it.

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

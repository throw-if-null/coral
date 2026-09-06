# Coral Architecture

A set of rules for organising code in a repository, written to be followed by coding agents as well as by
people. The organising principle is one sentence: **one capability, owned end to end, in one place.**
Everything one command or one endpoint needs sits together, its tests included, rather than being spread
across a `handlers/`, a `services/` and a `repositories/` directory. Shared code exists only where it is
named and passed in. The same shape applies to a CLI, a backend, a web app, a library, or a tool, and it
composes from a single capability up to a whole system.

**📖 Live docs:** https://coral.appsandtools.work — the guided version, with a worked
directory layout, the five kinds of code, and where the architecture does not fit.

Coral is a poor fit for dense domains where every feature reaches into one central concept — a tax engine,
a scheduler, a solver. That limit is stated as a rule (`[SCOPE-2]`), not as a footnote.

## The documents

Start with [`CONVENTIONS.md`](./CONVENTIONS.md). It defines the eight nouns every other document uses, the
rule-ID scheme, the enforcement classes, the agents-write / humans-review operating model, the
[Coral kernel](./CONVENTIONS.md#the-coral-kernel) — the rules Coral would substantially relax without
the agent-author / human-architect operating model — and
[what applies to a project](./CONVENTIONS.md#what-applies-to-a-project), which is how a project declares
how much of Coral it has taken on. The rest refer back to it instead of restating any of it.

From there: [`ARCHITECTURE.md`](./ARCHITECTURE.md) is how to build one app,
[`SYSTEM.md`](./SYSTEM.md) is how separately-built apps compose over a channel, [`appendix/`](./appendix)
holds one document per **app profile** — CLI, backend, web, library, GitHub Action — plus the
runtime-agent addendum, which an app of any shape adds when it calls a model at runtime. And
[`examples/`](./examples) holds worked code — including
[a real service reviewed against the rules](./examples/backend-review.md), which states where they would
have been overkill.

To look a rule up rather than read for it, [`rules.md`](./rules.md) lists all of them on one page with
their class, their ownership layer, their scale, and a one-line statement, grouped by document. It is generated from
the documents (`npm run rules:index`) and the build fails if it falls behind them, because an index that
can drift from what it indexes is worse than no index.

Rules carry stable IDs like `[DUP-2]`, and three independent classifications: an **enforcement class**
(`[auto]` / `[review]` / `[guide]`) saying how the rule is checked, an
**[ownership layer](./CONVENTIONS.md#ownership-layers)** saying who has to read it — so a CLI is not asked
to reason about HTTP status codes or runtime-AI rules — and an
**[architectural scale](./CONVENTIONS.md#architectural-scale)** saying whether it governs one app or
several apps composing. On the live site every citation links to its definition. The build fails if a rule
has no class or no layer, if a citation has no definition, if a rule is missing from its document's Agent
Execution Contract, if a contract lists an opt-in rule without saying so, if a published rule ID has
disappeared or been reclassified, if the rule index is stale, if the worked `CORAL.md` in `CONVENTIONS.md`
stops resolving, or if a link fragment doesn't resolve — the docs' own drift control is structural, not
goodwill.

## Versioning, and how a project records where it differs

Coral is versioned because it will be **incomplete**: rules get missed, patterns need covering, and some
rules turn out to be wrong. The current version is in `VERSION`; what changed is in
[`CHANGELOG.md`](./CHANGELOG.md), recorded per rule ID. Rule IDs are append-only — never renumbered,
recycled, or removed — and `rules.lock` is the checked-in record the build enforces that against.

A consuming project keeps a **`CORAL.md`** in its root. It is the one file that answers *what rules apply
here*, and it carries three things:

- the **Coral version** the project targets (`[VER-3]`)
- **what it adopts** (`[VER-6]`) — the scales it is written at, and the non-kernel scopes it takes on. The
  kernel applies without being declared; everything else, the production baseline included, applies
  because this block says so. **A rule never becomes applicable just by existing in this repository**, so
  adding a profile or a rule here changes nothing for a project until that project adopts it. A missing or
  invalid declaration is a configuration finding, not a licence to audit against everything.
- two kinds of local divergence, each scoped to a path:
  - an **Exception** — Coral has a rule; this project knowingly breaks it for a trade-off, in one subtree
  - an **Extension** — Coral has no rule; this project needs one; it stays local, under its own ID prefix

Coral layers **compose by union**, with no precedence between them: no layer overrides another, and two
Coral rules that contradict each other are a defect in Coral to be filed upstream rather than resolved
locally.

A third kind isn't recorded locally at all: an **Amendment** is when a Coral rule is *wrong or too
narrow*, and it goes upstream as an issue or PR on this repo. An exception that recurs across projects is
the signal for one — and when the amendment lands, the local entries are deleted and the project bumps its
target. **The register shrinks when Coral improves.**

An agent never authors an exception or an extension (`[AGENT-4]`); it flags the ambiguity and a human
decides and records it. And it reads `CORAL.md` before escalating (`[AGENT-5]`), so a settled decision
isn't re-litigated by every agent that meets it. The full convention is in
[`CONVENTIONS.md`](./CONVENTIONS.md#versioning-and-local-deviations).

## The linter

[`tools/coral-lint/`](./tools/coral-lint/) implements Tier 1: the `[auto]` rules a static check can
decide. Eleven today — `[BUCKET-1]`, `[XCUT-2]`, `[STRUCT-1]`, `[ROOT-2]`, `[STATE-2]`, `[CONFIG-2]`,
`[CONC-1]`, `[IDEM-2]`, `[ERR-2]`, plus `[LIB-3]` and `[LIB-5]` for published libraries — with every other
`[auto]` rule listed under `--coverage` alongside a stated reason it isn't checked yet, so nothing is
silently uncovered.

**It is not a blocking conformance gate today.** Every rule it checks is production-baseline or
app-profile, so none of them binds a project that has not adopted that layer (`[VER-6]`), and the tool
cannot resolve a project's declaration yet. So it **fails closed**: by default it reports a configuration
error rather than findings, and `--ignore-applicability` produces output that is explicitly advisory
rather than a conformance verdict.
[Its README](./tools/coral-lint/README.md#applicability--read-this-before-treating-it-as-a-gate) says what
closing that gap needs.

```bash
cd tools/coral-lint
python3 -m coral_lint /path/to/repo --ignore-applicability   # advisory; exit 1 on findings
python3 -m coral_lint --coverage                             # what runs, and why the rest doesn't
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

The site is hosted on **Cloudflare Workers Static Assets** at
[coral.appsandtools.work](https://coral.appsandtools.work). It is static only: `wrangler.jsonc`
declares no `main` entrypoint and no `run_worker_first`, so every request is served by Cloudflare's
asset server rather than by a Worker invocation. That keeps the site inside the Free plan and adds no
KV, R2, D1, or Durable Objects.

Deployment runs through **Cloudflare Workers Builds** (Cloudflare's own GitHub integration), not
through GitHub Actions. Pushing to `main` triggers a build that runs `npm run build` — the full
pipeline, including the version, rule, and anchor checks — and then `npx wrangler deploy`, which
publishes `.vitepress/dist`. Because Cloudflare authenticates the repository through the GitHub
App, **no Cloudflare API token or account ID belongs in this repository**.

`.node-version` pins the Node major used by both local and Cloudflare builds, so a change to
Cloudflare's default Node version cannot silently change the build.

### One-time Cloudflare setup

Do this once, in the Cloudflare dashboard, after this change is merged.

**Workers Builds** — Workers & Pages → `coral` → Settings → Build:

| Setting | Value |
| --- | --- |
| Repository | `throw-if-null/coral` |
| Production branch | `main` |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Non-production branch builds | enabled (gives every branch and PR a preview URL) |

Preview builds use Cloudflare's own preview deployment mechanism; `preview_urls` is set to `true` in
`wrangler.jsonc` so branch builds get a versioned preview URL even though `workers_dev` is off. The
account needs a `workers.dev` subdomain for those preview URLs to resolve.

**Custom domain** — Workers & Pages → `coral` → Settings → Domains & Routes:

- add `coral.appsandtools.work` as a **custom domain** (not a route)
- `appsandtools.work` must already be a zone on the same Cloudflare account
- Cloudflare then creates and manages the DNS record and the TLS certificate

`wrangler.jsonc` already declares the custom domain, so `npx wrangler deploy` claims it on the first
deploy; adding it in the dashboard is only needed if that step is skipped.

### Retiring the Azure Static Web App

The Azure resources are deliberately not touched by code. Delete them by hand, and only after the
Cloudflare deployment is confirmed good:

1. deploy successfully to Cloudflare
2. verify <https://coral.appsandtools.work> loads
3. verify representative pages — `ARCHITECTURE`, `CONVENTIONS`, `SYSTEM`, `rules`, one `appendix/`
   page, one `examples/` page
4. verify static assets and Mermaid diagrams render
5. verify anchor links resolve, including rule citations such as `ARCHITECTURE#DUP-2`
6. verify a nonexistent URL returns the VitePress 404 page with a `404` status
7. only then delete the Azure Static Web App
8. remove the GitHub repository secret `AZURE_STATIC_WEB_APPS_API_TOKEN_GRAY_HILL_09BB08B03`


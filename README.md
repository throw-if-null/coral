# Coral Architecture

Coral is a set of rules for organising code in a repository. Coding agents follow it, and so do people.

The organising principle is one sentence: **one trigger, one owning capability, end to end.** One command
or one endpoint is answered by one unit. That unit owns the whole of answering it. Every unit of code has
one of five known roles.

The same shape applies to a CLI, a backend, a web app, a library, or a tool. It composes from a single
capability up to a whole system.

**That core is small. It governs ownership rather than layout.** The **production baseline** holds
everything else:

- code grouped by what it does rather than by what kind of code it is
- the capability's files sitting together instead of spread across `handlers/`, `services/` and
  `repositories/`
- tests beside the code they verify
- no `utils` bucket
- crosscuts injected rather than reached for
- error-model enforcement, plus a recommended error-category vocabulary
- transaction and retry policy
- no shared database between apps

Coral publishes the production baseline as one coherent opinion. A project adopts it explicitly. Using
Coral does not inherit it.

**📖 Live docs:** https://coral.appsandtools.work

The site holds the guided version. It includes a worked directory layout, the five kinds of code, and
where the architecture does not fit.

Coral is a poor fit for dense domains where every feature reaches into one central concept: a tax engine,
a scheduler, a solver. `[SCOPE-2]` states that limit as a rule.

## The documents

Start with [`CONVENTIONS.md`](./CONVENTIONS.md). It defines the eight nouns every other document uses, the
rule-ID scheme, the enforcement classes, and the agents-write / humans-review operating model. It defines
two further things the other documents depend on:

- the [Coral kernel](./CONVENTIONS.md#the-coral-kernel): the rules Coral would substantially relax without
  the agent-author / human-architect operating model
- [what applies to a project](./CONVENTIONS.md#what-applies-to-a-project): how a project declares how much
  of Coral it has taken on

The rest refer back to it instead of restating any of it.

From there, in the order a project decides things:

1. [`ARCHITECTURE.md`](./ARCHITECTURE.md): the kernel-facing app architecture. It gives the shape of one
   app, and the rules whose presence or strictness Coral justifies by its operating model. It binds a
   Coral codebase without being adopted. It is short.
2. [`PRODUCTION.md`](./PRODUCTION.md): the **production baseline** for one app, and the decision whether
   to take it. It covers package naming, buckets, state ownership, concurrency, idempotency, errors,
   config, observability, contracts, trust, testing, and growth. It is **optional and subordinate**. Coral
   publishes it as an opinionated production-engineering policy. It applies only where a project's
   `CORAL.md` says `production-baseline: true`. Its justification is that the software needs it, not that
   an agent wrote it.
3. [`SYSTEM.md`](./SYSTEM.md): how separately-built apps compose over a channel. It is optional as well.
   It carries two independent opt-ins: the system-scale production baseline, and the runtime-agent
   orchestration rules. Neither implies the other.
4. [`appendix/`](./appendix): one document per **app profile** (CLI, backend, web, library, GitHub
   Action). It also holds the runtime-agent addendum an app of any shape adds when it calls a model at
   runtime. Each is adopted by name.

[`examples/`](./examples) holds worked code. It includes
[a real service reviewed against the rules](./examples/backend-review.md). That review states where the
rules would have been overkill.

[`rules.md`](./rules.md) lists every rule on one page, grouped by document. Each entry carries its class,
its ownership layer, its scale, and a one-line statement. Use it to look a rule up rather than to read for
it. `npm run rules:index` generates the page from the documents, and the build fails if the page falls
behind them. An index that can drift from what it indexes is worse than no index.

**Only a small part of Coral is imposed because an agent writes the code.** That subset is the
[kernel](./CONVENTIONS.md#the-coral-kernel): a small set of rules, named and justified one at a time, and
counted in [`rules.md`](./rules.md)'s layer tally. Coral publishes general production-engineering policy
separately, as the production baseline and the app profiles. A project adopts that policy rather than
inheriting it. The build enforces the separation structurally: it
rejects an opt-in rule defined in a [core document](./CONVENTIONS.md#core-documents).

Rules carry stable IDs like `[DUP-2]`, and three independent classifications:

- an **enforcement class** (`[auto]` / `[review]` / `[guide]`) saying how the rule is checked
- an **[ownership layer](./CONVENTIONS.md#ownership-layers)** saying who has to read it, so a CLI is not
  asked to reason about HTTP status codes or runtime-AI rules
- an **[architectural scale](./CONVENTIONS.md#architectural-scale)** saying whether it governs one app or
  several apps composing

On the live site every citation links to its definition. The build fails on any of the following:

- a rule has no class or no layer
- a citation has no definition
- a rule is missing from its document's Agent Execution Contract
- a contract lists an opt-in rule without saying so
- an opt-in rule is defined in a core document
- a published rule ID has disappeared or been reclassified
- the rule index is stale
- the worked `CORAL.md` in `CONVENTIONS.md` stops resolving
- a link fragment does not resolve

The documents' drift control is structural, not goodwill.

## Versioning, and how a project records where it differs

Coral is versioned because it will be **incomplete**: rules get missed, patterns need covering, and some
rules turn out to be wrong. [`CHANGELOG.md`](./CHANGELOG.md) records what changed, per rule ID. Rule IDs
are append-only. They are never renumbered, recycled, or removed. `rules.lock` is the checked-in record
the build enforces that against.

**Coral carries two versions, and the difference matters now that version identity is part of
applicability.** The **latest released** version is in `VERSION`, and it is the only version a project can
target. The **working** version is the rule set these documents currently describe, named by the
changelog's Unreleased heading. Between releases the working version is a successor to `VERSION`, so
**`main` describes rules that are not in any release yet**.
[`CONVENTIONS.md`](./CONVENTIONS.md#two-versions-released-and-working) states the split.

A consuming project keeps a **`CORAL.md`** in its root. It is the one file that answers *what rules apply
here*, and it carries three things:

- the **Coral version** the project targets (`[VER-3]`)
- **what it adopts** (`[VER-6]`): the scales it is written at, and the non-kernel scopes it takes on
- two kinds of local divergence, each scoped to a path:
  - an **Exception**: Coral has a rule, and this project knowingly breaks it for a trade-off, in one
    subtree
  - an **Extension**: Coral has no rule, this project needs one, and it stays local under its own ID
    prefix

The kernel applies without being declared. Everything else, the production baseline included, applies
because the adoption block says so. **A rule never becomes applicable by existing in this repository.**
Adding a profile or a rule here changes nothing for a project until that project adopts it. A missing or
invalid declaration is a configuration finding, not a licence to audit against everything.

Coral layers **compose by union**, with no precedence between them. No layer overrides another. Two Coral
rules that contradict each other are a defect in Coral. File it upstream rather than resolving it locally.

A third kind of divergence is not recorded locally. An **Amendment** applies when a Coral rule is *wrong
or too narrow*, and it goes upstream as an issue or PR on this repository. An exception that recurs across
projects is the signal for one. When the amendment lands, the project deletes the local entries and bumps
its target. **The register shrinks when Coral improves.**

An agent never authors an exception or an extension (`[AGENT-4]`). It flags the ambiguity, and a human
decides and records it. An agent reads `CORAL.md` before escalating (`[AGENT-5]`), so a settled decision
is not reopened by every agent that meets it.
[`CONVENTIONS.md`](./CONVENTIONS.md#versioning-and-local-deviations) holds the full convention.

From that declaration a project generates **`CORAL-CONTRACT.md`**. The file holds the project's complete
normative Coral surface: every applicable `[auto]` and `[review]` rule, plus its own exceptions and
extensions. An agent loads that file and no Coral document.

```bash
# from a Coral checkout describing the version the project targets
npm run contract:generate -- --project /path/to/project
```

The command lives here, in the Coral checkout. `--project` names the consuming repository, because Coral
supports projects that are not Node projects at all.

The rule model always comes from the checkout that runs the command, and no flag points it elsewhere. The
documents are only half of a release, and the code that reads them is the other half. Generating for
another Coral version therefore means checking out that version and running its own `contract:generate`.

The output is generated, never edited. `CORAL.md` stays the only file a project writes by hand. Rules from
a scale, layer or profile the project has not adopted leave no trace in the output. Output is
byte-identical for the same inputs.

An unresolvable declaration produces an error and no contract. It also leaves no *stale* contract: a
failed regeneration removes the file the previous run wrote rather than leaving a file that looks current.
The generator only ever removes or replaces files it wrote. It refuses anything else at the destination
rather than overwriting it. [`CONVENTIONS.md`](./CONVENTIONS.md#the-generated-execution-contract)
documents it.

## The linter

[`tools/coral-lint/`](./tools/coral-lint/) implements Tier 1: the `[auto]` rules a static check can
decide. Eleven are checked today: `[BUCKET-1]`, `[XCUT-2]`, `[STRUCT-1]`, `[ROOT-2]`, `[STATE-2]`,
`[CONFIG-2]`, `[CONC-1]`, `[IDEM-2]`, `[ERR-2]`, plus `[LIB-3]` and `[LIB-5]` for published libraries.
`--coverage` lists every other `[auto]` rule with a stated reason it is not checked yet, so nothing is
silently uncovered.

**It is not a blocking conformance gate today.** Every rule it checks is production-baseline or
app-profile, so none of them binds a project that has not adopted that layer (`[VER-6]`). The tool cannot
resolve a project's declaration yet. It therefore **fails closed**: by default it reports a configuration
error rather than findings, and `--ignore-applicability` produces output that is explicitly advisory
rather than a conformance verdict.
[Its README](./tools/coral-lint/README.md#applicability--read-this-before-treating-it-as-a-gate) states
what closing that gap needs.

```bash
cd tools/coral-lint
python3 -m coral_lint /path/to/repo --ignore-applicability   # advisory; exit 1 on findings
python3 -m coral_lint --coverage                             # what runs, and why the rest doesn't
```

No dependencies, Python 3.11+. `[BUCKET-1]` needs no configuration, so it is useful immediately. The other
checks read a `coral.toml` in the audited repo. That file declares where the repo's slices live.
Guessing is how a linter earns false positives. The linter is itself a Coral CLI, one slice per check, and it passes
its own gates.

## The audit skill

[`.claude/skills/coral-audit/`](./.claude/skills/coral-audit) is the operational counterpart to the docs.
Point it at a repo and it produces a `CORAL_AUDIT.md`. The report answers one question: *is this a Coral
app, and where does it diverge?* Structural divergences are the findings. Bugs the audit surfaces are
recorded as awareness notes, never the verdict. The skill diagnoses only. A human decides the refactor
approach later, in a separate planning session.

Claude Code loads the skill when you work in this repo, because it lives in `.claude/skills/`. Auditing
*other* repos is the intended use. Install it at user level:

```bash
ln -s "$PWD/.claude/skills/coral-audit" ~/.claude/skills/coral-audit
```

Use a symlink rather than a copy. Two copies of the same rules drift, and the docs are the one place the
rules are allowed to live.

## Run the docs locally

```bash
npm install
npm run docs:dev      # live preview at http://localhost:5173
npm run docs:build    # static site → .vitepress/dist
npm run docs:preview  # serve the built site
```

## Deployment

**Cloudflare Workers Static Assets** hosts the site at
[coral.appsandtools.work](https://coral.appsandtools.work). The deployment is static only. `wrangler.jsonc`
declares no `main` entrypoint and no `run_worker_first`, so Cloudflare's asset server serves every request
rather than a Worker invocation. That keeps the site inside the Free plan, and it adds no KV, R2, D1, or
Durable Objects.

Deployment runs through **Cloudflare Workers Builds**, Cloudflare's own GitHub integration, rather than
through GitHub Actions. A push to `main` triggers a build. The build runs `npm run build`, which is the
full pipeline including the version, rule, and anchor checks. It then runs `npx wrangler deploy`, which
publishes `.vitepress/dist`. Cloudflare authenticates the repository through the GitHub App, so **no
Cloudflare API token or account ID belongs in this repository**.

`.node-version` pins the Node major used by both local and Cloudflare builds. A change to Cloudflare's
default Node version therefore cannot silently change the build.

### One-time Cloudflare setup

Do this once, in the Cloudflare dashboard, after this change is merged.

**Workers Builds**, in Workers & Pages → `coral` → Settings → Build:

| Setting | Value |
| --- | --- |
| Repository | `throw-if-null/coral` |
| Production branch | `main` |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Non-production branch builds | enabled (gives every branch and PR a preview URL) |

Preview builds use Cloudflare's own preview deployment mechanism. `wrangler.jsonc` sets `preview_urls` to
`true`, so branch builds get a versioned preview URL even though `workers_dev` is off. The account needs a
`workers.dev` subdomain for those preview URLs to resolve.

**Custom domain**, in Workers & Pages → `coral` → Settings → Domains & Routes:

- add `coral.appsandtools.work` as a **custom domain** (not a route)
- `appsandtools.work` must already be a zone on the same Cloudflare account
- Cloudflare then creates and manages the DNS record and the TLS certificate

`wrangler.jsonc` already declares the custom domain, so `npx wrangler deploy` claims it on the first
deploy. Add it in the dashboard only if that step is skipped.

### Retiring the Azure Static Web App

No code touches the Azure resources. Delete them by hand, and only after the Cloudflare deployment is
confirmed good:

1. deploy successfully to Cloudflare
2. verify <https://coral.appsandtools.work> loads
3. verify representative pages: `CONVENTIONS`, `ARCHITECTURE`, `PRODUCTION`, `SYSTEM`, `rules`, one
   `appendix/` page, one `examples/` page
4. verify static assets and Mermaid diagrams render
5. verify anchor links resolve, including a cross-page rule citation such as `PRODUCTION#DUP-2`.
   `ARCHITECTURE` links to it, so the check exercises both the deep link and the page it lands on
6. verify a nonexistent URL returns the VitePress 404 page with a `404` status
7. only then delete the Azure Static Web App
8. remove the GitHub repository secret `AZURE_STATIC_WEB_APPS_API_TOKEN_GRAY_HILL_09BB08B03`

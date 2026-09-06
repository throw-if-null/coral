import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'
import fs from 'node:fs'
import path from 'node:path'

import {
  APP_SPINE,
  CONTRACT_END,
  CONTRACT_START,
  INDEX_FILE,
  INLINE_ID_RE,
  LOCK_FILE,
  SYSTEM_SPINE,
  checkContractScopes,
  loadRuleModel,
  parseLock,
  serializeIndex,
  useRe,
} from '../scripts/rules.mjs'
import {
  ADHERENCE_EXAMPLE_END,
  ADHERENCE_EXAMPLE_START,
  ADHERENCE_FILE,
  parseAdherenceRecord,
  resolveApplicability,
} from '../scripts/applicability.mjs'

// ─────────────────────────────────────────────────────────────────────────────
// Rule-ID registry, deep-link plugin, and the doc-integrity gates.
//
// The docs cite stable rule IDs like [SCOPE-3], [CHAN-1]. This makes every rule
// *definition* a deep-link target (#SCOPE-3) and turns every *reference* into a
// link to the page that defines it — operationalizing the citation system on the
// web. Parsing lives in ../scripts/rules.mjs so the lockfile writer shares it.
//
// Ten gates run here, each guarding a claim the documents make about themselves:
//   1. every rule definition carries exactly one enforcement class
//   2. every rule-ID citation resolves to a definition
//   3. every [auto]/[review] rule appears in its document's Agent Execution
//      Contract, so the contract really is the complete normative surface
//   4. no rule ID is ever removed, renumbered, or silently reclassified — [VER-1]
//   5. rules.md, the generated index, matches the registry it claims to index
//   6. the app spine cites no system rule — the dependency points one way
//   7. the kernel cites existing rules and defines none of them
//   8. every rule outside the kernel carries exactly one ownership layer
//   9. a contract marks the rules that are opt-in, so it cannot list them as unconditional
//  10. the worked CORAL.md in CONVENTIONS.md is a record the applicability resolver accepts
// Two more run outside this file: link fragments in scripts/check-anchors.mjs
// (post-build, because heading ids only exist once markdown-it has rendered them),
// and declared example versions in scripts/check-versions.mjs.
// ─────────────────────────────────────────────────────────────────────────────
const SRC = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
// Base path: '/' locally; the deploy workflow sets DOCS_BASE (e.g. '/coral/' for
// GitHub project Pages). One knob feeds both VitePress and the rule-ID link hrefs.
const BASE = process.env.DOCS_BASE || '/'
// VitePress does NOT apply `base` to `head` entries — prefix public assets by hand.
const asset = (file) => `${BASE}${file}`

// One composition for the whole build. Gates 1, 7 and 8 all used to be spelled out here as
// separate parser calls, and scripts/rules-index.mjs spelled the same five out again — so
// the canonical model does it once and every gate below reads a rule that already knows its
// own ownership scope.
const model = loadRuleModel(SRC)
const { registry, rules, defsByFile, problems, files: DOC_FILES } = model

// ─────────────────────────────────────────────────────────────────────────────
// Gate 2 — referential integrity: every rule ID that appears anywhere must be
// registered.
//
// This is the guard for the failure this file has already had twice — eleven
// [AGENTIC-*] rules in a file the registry never read, and eleven [CLI-*] rules
// written in a form the definition regex didn't match. Both were silent: an
// unregistered ID falls through to plain <code>, so nothing errors and the page
// still builds.
//
// Note *what* is compared. Checking definitions against emitted anchors only
// proves the parser agrees with itself, and cannot see a rule it never
// recognized as one. Checking usage against registration can: a rule nobody
// cites is fine, but a citation with no definition means either a typo or a
// definition written in a shape we don't parse.
// ─────────────────────────────────────────────────────────────────────────────
const orphans = new Map() // ID -> Set of files it appears in
for (const rel of DOC_FILES) {
  const abs = path.join(SRC, rel)
  if (!fs.existsSync(abs)) continue
  for (const m of fs.readFileSync(abs, 'utf8').matchAll(useRe())) {
    if (registry.has(m[1])) continue
    if (!orphans.has(m[1])) orphans.set(m[1], new Set())
    orphans.get(m[1]).add(rel)
  }
}
for (const id of [...orphans.keys()].sort()) {
  problems.push(
    `[${id}] cited in ${[...orphans.get(id)].join(', ')} but never defined. Either the` +
      ' citation is a typo, or the definition is written in a form the parser does not match.' +
      ' A definition line must open with one of:  **`[ID]`   - `[ID]`   - **`[ID]`**'
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Gate 3 — contract completeness.
//
// Each spine claims its Agent Execution Contract is the COMPLETE normative
// surface: an agent that loads only the contract should miss nothing. That claim
// used to rest on goodwill, and it was false — around twenty [auto]/[review]
// rules existed only in the prose. So verify it: every non-[guide] rule defined
// in a file must be cited inside that file's contract markers.
//
// Opt-in by marker, so appendices (which have no contract section) are exempt.
// [guide] rules are rationale, not instructions, and stay in the prose only.
// ─────────────────────────────────────────────────────────────────────────────
for (const [rel, defs] of defsByFile) {
  const text = fs.readFileSync(path.join(SRC, rel), 'utf8')
  const start = text.indexOf(CONTRACT_START)
  if (start === -1) continue
  const end = text.indexOf(CONTRACT_END, start)
  if (end === -1) {
    problems.push(`${rel} opens ${CONTRACT_START} but never closes it with ${CONTRACT_END}.`)
    continue
  }
  const cited = new Set([...text.slice(start, end).matchAll(useRe())].map((m) => m[1]))
  for (const d of defs.filter((d) => d.cls && d.cls !== 'guide' && !cited.has(d.id))) {
    problems.push(
      `[${d.id}] (\`[${d.cls}]\`, defined in ${rel}) is missing from that document's Agent` +
        ' Execution Contract. Every [auto]/[review] rule must appear there, so the contract stays' +
        ' the complete normative surface.'
    )
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Gate 4 — [VER-1]: rule IDs are append-only.
//
// A project's CORAL.md cites [STATE-5] to record an exception, and that citation
// has to mean the same thing years later. So every published ID and its class are
// recorded in rules.lock, and a rule that disappears or is quietly reclassified
// fails the build. Adding a rule fails too, until the lock is regenerated — that
// forced step is where CHANGELOG.md and the version bump get remembered.
// ─────────────────────────────────────────────────────────────────────────────
const lockPath = path.join(SRC, LOCK_FILE)
if (fs.existsSync(lockPath)) {
  const locked = parseLock(fs.readFileSync(lockPath, 'utf8'))
  for (const [id, entry] of [...locked].sort()) {
    if (!rules.has(id)) {
      problems.push(
        `[${id}] is in ${LOCK_FILE} but no longer defined in the docs. [VER-1] makes rule IDs` +
          ' append-only: a withdrawn rule keeps its ID and is marked retired in place. Restore it,' +
          ' or if the retirement is deliberate, say so in the docs and regenerate the lock.'
      )
    } else if (rules.get(id).cls !== entry.cls) {
      problems.push(
        `[${id}] changed class \`[${entry.cls}]\` → \`[${rules.get(id).cls}]\`. That is a` +
          ` version-relevant change ([VER-2]): record it in CHANGELOG.md and run` +
          ' `npm run rules:lock`.'
      )
    }
  }
  for (const id of [...rules.keys()].sort()) {
    if (!locked.has(id)) {
      problems.push(
        `[${id}] is defined in the docs but absent from ${LOCK_FILE}. Run` +
          ' `npm run rules:lock` and record the addition in CHANGELOG.md against the version it' +
          ' ships in ([VER-2]).'
      )
    }
  }
} else {
  console.warn(`\n[coral] ${LOCK_FILE} is missing — run \`npm run rules:lock\` to create it.\n`)
}

// ─────────────────────────────────────────────────────────────────────────────
// Gate 6 — the app spine does not cite a system rule.
//
// CONVENTIONS.md states this twice ("the dependency points one way: the app spine
// never cites a system rule, so the core app model stays independent of system
// concerns"), and nothing verified it — so ARCHITECTURE.md had been citing [ORCH-1]
// in its [SCOPE-3] commentary since that rule existed.
//
// It is the kind of claim that decays silently: a citation reads as helpful
// cross-referencing, and the cost only shows up later, when a reader of the app
// spine cannot finish a rule without loading a document the spine is supposed to be
// independent of. That is the context-economy property [AGENT-1] exists to protect,
// spent one convenient parenthesis at a time.
//
// Derived rather than hardcoded: "system rule" means one DEFINED in SYSTEM.md, so a
// new system family is covered automatically. Family wildcards ([CHAN-*]) are not
// rule IDs and do not match — pointing at a family is how the spine is meant to
// refer outward, per [SCOPE-4].
//
// Appendices are deliberately exempt: CONVENTIONS.md permits them to cite system
// rules where an app type reproduces the system pattern internally, which is why
// web.md legitimately references [CHAN-*] and [SYS-TEST-1].
// ─────────────────────────────────────────────────────────────────────────────
const spineAbs = path.join(SRC, APP_SPINE)
if (fs.existsSync(spineAbs)) {
  const systemRules = new Set(
    [...rules].filter(([, r]) => r.page === SYSTEM_SPINE).map(([id]) => id)
  )
  const leaked = new Set(
    [...fs.readFileSync(spineAbs, 'utf8').matchAll(useRe())]
      .map((m) => m[1])
      .filter((id) => systemRules.has(id))
  )
  for (const id of [...leaked].sort()) {
    problems.push(
      `${APP_SPINE} cites [${id}], which is defined in ${SYSTEM_SPINE}. The dependency points one` +
        ' way (CONVENTIONS.md, "Rule IDs"): the app spine never cites a system rule, so the core app' +
        ' model stays loadable without system concerns. Refer to the family in prose ([ORCH-*]) or' +
        ' state the point without the citation.'
    )
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Gate 7 — the kernel classifies, it does not legislate.
//
// CONVENTIONS.md names a subset of existing rules as the kernel: the ones whose
// presence or strictness is materially justified by the agent-author /
// human-architect operating model. That is a classification of *why Coral imposes a
// rule, and at what strength*, and it must never become a second place a rule is
// stated — "one rule, one ID" is the reason there is no KERN-* family in the first
// place.
//
// parseKernel() does the work, because the same validation has to hold for whoever
// reads the table — the build here and scripts/rules-index.mjs both — and because it
// is then unit-testable (scripts/rules.test.mjs) rather than only reachable by
// breaking the docs on purpose. Passing the registry in is what turns "the rows
// parse" into "the rows cite rules that exist".
//
// Every line inside the markers is accounted for: an unrecognised or malformed row is
// an error rather than a row that quietly does not count, a duplicate ID is an error,
// and a definition-shaped line is an error. A table that is the single source of a
// classification must not have a shape in which membership can fall out unnoticed.
//
// The size of the kernel is deliberately NOT hardcoded. Gate 5 already makes a
// membership change show up as a diff in a generated file, which is the same forcing
// step rules.lock gives a rule change — a constant would add a second thing to edit
// and nothing to the guarantee.
//
// Its problems arrive in `model.problems` above, along with the taxonomy's and the
// classifier's — the model is where the composition lives.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Gate 8 — every rule has exactly one ownership layer.
//
// Kernel membership comes from the block Gate 7 just validated and from nowhere else;
// every other rule carries one `{tag}` on its definition line. Both halves are checked
// against each other, which is what makes the pair a forcing function rather than a
// convention: a new rule with no tag fails the build, a tag on a kernel rule fails the
// build, and a rule dropped from the kernel table fails until it is given a tag.
//
// The profile registry is validated first because the tags resolve against it — an
// `{app:cli}` that no registered profile matches is a typo, and a typo that resolved
// would quietly invent a layer nobody loads.
//
// The strict check here is the last one, and it binds REGISTERED app/language profiles
// only: such a rule must be DEFINED in its profile's own document, and the registry may
// not name a spine as one. Classification alone cannot fix the loading problem, because a
// rule sitting in ARCHITECTURE.md is read by everyone who reads ARCHITECTURE.md whatever
// its tag says — and a registry free to call ARCHITECTURE.md a profile's home could bless
// exactly that. The fixed `runtime-agent` layer is out of scope for the check by design:
// [ORCH-4..6] stay in SYSTEM.md and are made opt-in by Gate 9 instead.
//
// The result is not a lookup table beside the rules: loadRuleModel() attaches each resolved
// scope to its rule, so `rules.get(id).scope.kind` is the one place ownership is read from.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Gate 9 — a contract says which of its rules are opt-in.
//
// Gate 3 makes each Agent Execution Contract COMPLETE; this makes it HONEST about
// scope. An agent is invited to load only the contract, so a contract that lists
// [ORCH-4] beside [CHAN-1] with nothing between them has told the agent that
// runtime-agent orchestration binds every system — the rule would be correctly
// classified and still incorrectly loaded.
//
// Only runs once the layers are known, because the check is "does this line's scope
// marker match this rule's layer", and an unclassified rule has no answer.
// ─────────────────────────────────────────────────────────────────────────────
if (model.classified) problems.push(...checkContractScopes(SRC, rules))

// ─────────────────────────────────────────────────────────────────────────────
// Gate 10 — the documented adherence record is one the resolver accepts.
//
// CONVENTIONS.md prints a whole `CORAL.md` as a worked example, and every consuming
// project copies it. A machine-readable format whose only published example the machine
// has never read has one untested user, and it is the most important one: the example
// names ownership keys, profile names and scales, and all three are registry values that
// can be renamed here without the example following.
//
// So the build parses it with the same resolver a project's tooling would use and
// resolves it against this version's rule model. `[VER-6]` is the rule this enforces for
// consuming projects; this is Coral holding its own documentation to it.
//
// Only runs once the model is classified — resolving an adoption against a taxonomy the
// build has already refused produces a second complaint about the first failure.
// ─────────────────────────────────────────────────────────────────────────────
if (model.classified) {
  const conventions = fs.readFileSync(path.join(SRC, 'CONVENTIONS.md'), 'utf8')
  const open = conventions.indexOf(ADHERENCE_EXAMPLE_START)
  const close = conventions.indexOf(ADHERENCE_EXAMPLE_END)
  if (open === -1 || close <= open) {
    problems.push(
      `CONVENTIONS.md must mark its worked \`${ADHERENCE_FILE}\` example with` +
        ` ${ADHERENCE_EXAMPLE_START} and ${ADHERENCE_EXAMPLE_END}. The build resolves that example,` +
        ' and an unmarked one is an example nothing checks.'
    )
  } else {
    const version = fs.readFileSync(path.join(SRC, 'VERSION'), 'utf8').trim()
    const { declaration, problems: recordProblems } = parseAdherenceRecord(
      conventions.slice(open, close)
    )
    const resolution = resolveApplicability(declaration, model, { version })
    for (const p of [...recordProblems, ...resolution.problems]) {
      problems.push(
        `the worked \`${ADHERENCE_FILE}\` in CONVENTIONS.md is not a record a project could use: ${p}`
      )
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Gate 5 — the rule index is current.
//
// rules.md is a generated view of this registry (scripts/rules-index.mjs), and an
// unchecked generated file rots in the worst way available: it keeps rendering, keeps
// looking authoritative, and quietly describes last month's rule set. So the build
// re-renders it and fails on any difference — the same posture as rules.lock, and for
// the same reason the file is checked in at all, which is that a diff is reviewable.
//
// Only runs on clean docs. Rendering an index from a registry that already failed
// Gate 1 or 3 produces a wrong file and a second error about the file being wrong.
// ─────────────────────────────────────────────────────────────────────────────
if (!problems.length) {
  const indexPath = path.join(SRC, INDEX_FILE)
  const current = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, 'utf8') : null
  if (current !== serializeIndex(SRC, model)) {
    problems.push(
      `${INDEX_FILE} is ${current === null ? 'missing' : 'stale'}. It is generated from the rule` +
        ' registry, so it cannot be edited by hand — run `npm run rules:index` to re-render it.'
    )
  }
}

if (problems.length) {
  const msg = [`${problems.length} rule-registry problem(s):`, ...problems.map((p) => `    ${p}`)].join('\n')
  // Same posture as VitePress's own dead-link checking: fail the build, warn in dev
  // so an in-progress edit doesn't kill the running server.
  if (process.argv.includes('build')) throw new Error(`[coral] ${msg}`)
  console.warn(`\n[coral] ${msg}\n`)
}

function ruleIdPlugin(md) {
  // Pass 1: mark code-spans that hold a rule ID, flagging the one that *leads* its
  // block as the definition. "Leads" = first ID code-span preceded only by opening
  // tags (strong/em/list) and whitespace text — robust to **`[ID]` `[class]`** and
  // - `[ID]` ... alike, regardless of exact child positions.
  md.core.ruler.push('coral_rule_ids', (state) => {
    for (const tok of state.tokens) {
      if (tok.type !== 'inline' || !tok.children) continue
      const ch = tok.children
      let defIdx = -1
      for (let i = 0; i < ch.length; i++) {
        const c = ch[i]
        if (c.type !== 'code_inline' || !INLINE_ID_RE.test(c.content)) continue
        let leadOnly = true
        for (let j = 0; j < i; j++) {
          const p = ch[j]
          if (p.type.endsWith('_open')) continue
          if (p.type === 'text' && p.content.trim() === '') continue
          leadOnly = false
          break
        }
        if (leadOnly) defIdx = i
        break // only the first ID code-span can be the definition
      }
      for (let i = 0; i < ch.length; i++) {
        const c = ch[i]
        if (c.type !== 'code_inline') continue
        const m = INLINE_ID_RE.exec(c.content)
        if (!m) continue
        c.meta = { ...(c.meta || {}), ruleId: m[1], isDef: i === defIdx }
      }
    }
  })

  // Pass 2: render marked code-spans as anchors / links.
  const base = md.renderer.rules.code_inline
    || ((t, i, o, e, self) => `<code>${md.utils.escapeHtml(t[i].content)}</code>`)
  md.renderer.rules.code_inline = (tokens, idx, opts, env, self) => {
    const t = tokens[idx]
    const id = t.meta?.ruleId
    if (!id) return base(tokens, idx, opts, env, self)
    const label = `<code>${md.utils.escapeHtml(t.content)}</code>`
    const defPage = registry.get(id)
    const cur = env?.relativePath
    // anchor target only on the page that defines the id, and only ONCE per page —
    // the first leading occurrence (the real definition, earliest in document order)
    // wins; later leading occurrences (e.g. the Enforcement bullet list) fall through
    // to same-page refs, so we never emit a duplicate HTML id.
    if (t.meta.isDef && defPage === cur) {
      const seen = (env.__coralDefs ||= new Set())
      if (!seen.has(id)) {
        seen.add(id)
        return `<a id="${id}" class="rule-def" href="#${id}">${label}</a>`
      }
    }
    if (!defPage) return label // unknown id: leave as plain code
    const href = defPage === cur
      ? `#${id}`
      // .html (matching VitePress's own links) so a hard-loaded cross-page deep link
      // hits a real static file on any host — not just an in-app SPA click.
      : `${BASE}${defPage.replace(/\.md$/, '.html')}#${id}`
    return `<a class="rule-ref" href="${href}">${label}</a>`
  }
}

export default withMermaid(defineConfig({
  title: 'Coral Architecture',
  description: 'A fractal, capability-first architecture — agents write, humans review.',
  base: BASE,
  lastUpdated: true,
  srcExclude: ['README.md'], // repo landing page, not a rendered site page
  head: [
    ['link', { rel: 'icon', type: 'image/png', sizes: '32x32', href: asset('favicon-32.png') }],
    ['link', { rel: 'icon', type: 'image/png', href: asset('logo.png') }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: 'Coral Architecture' }],
    ['meta', { property: 'og:description', content: 'A fractal, capability-first architecture — agents write, humans review.' }],
    // base-relative now; for social-scraper previews, make this an absolute URL on deploy
    ['meta', { property: 'og:image', content: asset('reef-banner.png') }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:image', content: asset('reef-banner.png') }],
  ],
  markdown: {
    config: (md) => md.use(ruleIdPlugin),
  },
  themeConfig: {
    logo: '/logo.png',
    search: { provider: 'local' },
    outline: { level: [2, 3] },
    nav: [
      { text: 'Conventions', link: '/CONVENTIONS' },
      { text: 'App', link: '/ARCHITECTURE' },
      { text: 'System', link: '/SYSTEM' },
      { text: 'Rule index', link: '/rules' },
      { text: 'Examples', link: '/examples/go-api-slice' },
    ],
    sidebar: [
      { text: 'Conventions & vocabulary', link: '/CONVENTIONS' },
      { text: 'The App', link: '/ARCHITECTURE' },
      { text: 'The System', link: '/SYSTEM' },
      { text: 'Rule index — all rules, one page', link: '/rules' },
      {
        text: 'App profiles (by app type)',
        collapsed: false,
        items: [
          { text: 'CLI', link: '/appendix/cli' },
          { text: 'Backend / Service', link: '/appendix/backend' },
          { text: 'Web App', link: '/appendix/web' },
          { text: 'Library / Package', link: '/appendix/library' },
          { text: 'GitHub Action / Tool', link: '/appendix/gh-action' },
        ],
      },
      {
        // Not an app type: an agentic backend loads the backend profile AND this one.
        text: 'Runtime-agent profile',
        collapsed: false,
        items: [{ text: 'Agentic App (LLM)', link: '/appendix/agentic-app' }],
      },
      {
        text: 'Worked examples',
        collapsed: false,
        items: [
          { text: 'CLI (Python) — two slices', link: '/examples/cli-slice' },
          { text: 'Go API — a capability slice', link: '/examples/go-api-slice' },
          { text: 'Backend microservice review', link: '/examples/backend-review' },
        ],
      },
      { text: 'Versioning & changelog', link: '/CHANGELOG' },
      {
        text: 'Enforcement',
        collapsed: false,
        items: [
          { text: 'coral-lint — Tier 1 checks', link: '/tools/coral-lint/README' },
        ],
      },
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/ClimateView/coral' },
    ],
  },
}))

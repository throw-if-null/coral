import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'
import fs from 'node:fs'
import path from 'node:path'

// ─────────────────────────────────────────────────────────────────────────────
// Rule-ID registry + anchor plugin.
//
// The docs cite stable rule IDs like [SCOPE-3], [BUS-1]. This makes every rule
// *definition* a deep-link target (#SCOPE-3) and turns every *reference* into a
// link to the page that defines it — operationalizing the citation system on the
// web. The whole thing keys off the doc's own formatting:
//   definition  →  line starts with  **`[ID]` ...   or   - `[ID]` ...
//   id grammar  →  FAMILY(-SUBFAMILY)*-N   e.g. SCOPE-3, SYS-TEST-1, WEB-6
// ─────────────────────────────────────────────────────────────────────────────
const SRC = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
// Base path: '/' locally; the deploy workflow sets DOCS_BASE (e.g. '/coral/' for
// GitHub project Pages). One knob feeds both VitePress and the rule-ID link hrefs.
const BASE = process.env.DOCS_BASE || '/'
// VitePress does NOT apply `base` to `head` entries — prefix public assets by hand.
const asset = (file) => `${BASE}${file}`

// The spine docs are pinned first because the registry is first-definition-wins:
// precedence has to be stable and must not depend on directory order.
const SPINE = ['CONVENTIONS.md', 'ARCHITECTURE.md', 'SYSTEM.md']
// Everything else is discovered, so a new appendix or example is registered just by
// existing. This list used to be hand-maintained, and appendix/agentic-app.md was
// never added to it — its eleven [AGENTIC-*] rules silently got no anchors and every
// citation of them rendered as inert code. Scanning a file that defines no rules
// costs nothing, so there is no reason to curate. README.md is skipped at any depth:
// it is srcExclude'd, so a definition there would point at a page that isn't built.
const SKIP = new Set(['node_modules', 'public'])
function findDocs(dir) {
  const out = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || SKIP.has(e.name)) continue
    const abs = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...findDocs(abs))
    else if (e.name.endsWith('.md') && e.name !== 'README.md') out.push(path.relative(SRC, abs))
  }
  return out
}
// Set preserves insertion order, so the spine keeps precedence over the sorted rest.
const DOC_FILES = [...new Set([...SPINE, ...findDocs(SRC).sort()])]

// id grammar, anchored for inline-token matching and reused (unanchored) for scanning
const ID_CORE = '[A-Z][A-Z-]*-\\d+'
const INLINE_ID_RE = new RegExp(`^\\[(${ID_CORE})\\]$`)
// A definition line opens with a bullet, bold, or both, then the ID code-span. All three
// combinations occur: **`[SCOPE-1]`** (spine), - `[PLACE-1]` (bulleted), - **`[CLI-1]`**
// (cli.md). Missing the third silently cost appendix/cli.md all eleven of its anchors.
// The leading `- **` / `**` / `- ` is required, not optional: a wrapped paragraph line can
// begin with a bare `[ID]` code-span, and those are citations, not definitions.
const DEF_RE = new RegExp(String.raw`^(?:- \*\*|\*\*|- )\`\[(${ID_CORE})\]\``, 'gm')

// registry: ID -> defining page (relative path, matches VitePress env.relativePath)
const registry = new Map()
for (const rel of DOC_FILES) {
  const abs = path.join(SRC, rel)
  if (!fs.existsSync(abs)) continue
  const text = fs.readFileSync(abs, 'utf8')
  for (const m of text.matchAll(DEF_RE)) {
    if (!registry.has(m[1])) registry.set(m[1], rel) // first definition wins
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Referential integrity: every rule ID that appears anywhere must be registered.
//
// This is the guard for the failure this file has already had twice — eleven
// [AGENTIC-*] rules in a file the registry never read, and eleven [CLI-*] rules
// written in a form DEF_RE didn't match. Both were silent: an unregistered ID
// falls through to plain <code>, so nothing errors and the page still builds.
//
// Note *what* is compared. Checking definitions against emitted anchors only
// proves the parser agrees with itself, and cannot see a rule it never
// recognized as one. Checking usage against registration can: a rule nobody
// cites is fine, but a citation with no definition means either a typo or a
// definition written in a shape we don't parse.
// ─────────────────────────────────────────────────────────────────────────────
const USE_RE = new RegExp(String.raw`\`\[(${ID_CORE})\]\``, 'g')
const orphans = new Map() // ID -> Set of files it appears in
for (const rel of DOC_FILES) {
  const abs = path.join(SRC, rel)
  if (!fs.existsSync(abs)) continue
  for (const m of fs.readFileSync(abs, 'utf8').matchAll(USE_RE)) {
    if (registry.has(m[1])) continue
    if (!orphans.has(m[1])) orphans.set(m[1], new Set())
    orphans.get(m[1]).add(rel)
  }
}
if (orphans.size) {
  const msg = [
    `${orphans.size} rule ID(s) appear in the docs but no definition was found:`,
    ...[...orphans.keys()].sort()
      .map((id) => `    [${id}]  cited in: ${[...orphans.get(id)].join(', ')}`),
    'Either the citation is a typo, or the definition is written in a form DEF_RE',
    'does not match. A definition line must open with one of:',
    '    **`[ID]`     - `[ID]`     - **`[ID]`**',
  ].join('\n')
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
    ],
    sidebar: [
      { text: 'Conventions & the Coral Model', link: '/CONVENTIONS' },
      { text: 'The App (one Colony)', link: '/ARCHITECTURE' },
      { text: 'The System (the Reef)', link: '/SYSTEM' },
      {
        text: 'Appendices (species of polyp)',
        collapsed: false,
        items: [
          { text: 'CLI', link: '/appendix/cli' },
          { text: 'Backend / Service', link: '/appendix/backend' },
          { text: 'Web App', link: '/appendix/web' },
          { text: 'Agentic App (LLM)', link: '/appendix/agentic-app' },
          { text: 'Library / Package', link: '/appendix/library' },
          { text: 'GitHub Action / Tool', link: '/appendix/gh-action' },
        ],
      },
      {
        text: 'Worked examples',
        collapsed: false,
        items: [
          { text: 'Go API — a capability slice', link: '/examples/go-api-slice' },
          { text: 'Backend microservice review', link: '/examples/backend-review' },
        ],
      },
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/ClimateView/coral' },
    ],
  },
}))

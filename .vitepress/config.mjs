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

const DOC_FILES = [
  'CONVENTIONS.md', 'ARCHITECTURE.md', 'SYSTEM.md',
  'appendix/cli.md', 'appendix/backend.md', 'appendix/web.md',
  'appendix/library.md', 'appendix/gh-action.md',
]

// id grammar, anchored for inline-token matching and reused (unanchored) for scanning
const ID_CORE = '[A-Z][A-Z-]*-\\d+'
const INLINE_ID_RE = new RegExp(`^\\[(${ID_CORE})\\]$`)
const DEF_RE = new RegExp(String.raw`^(?:\*\*|- )\`\[(${ID_CORE})\]\``, 'gm')

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
      { text: 'Start here', link: '/CONVENTIONS' },
      { text: 'App', link: '/ARCHITECTURE' },
      { text: 'System', link: '/SYSTEM' },
    ],
    sidebar: [
      {
        text: 'Start here',
        items: [{ text: 'Conventions — the Coral Model', link: '/CONVENTIONS' }],
      },
      { text: 'The App (one Colony)', link: '/ARCHITECTURE' },
      { text: 'The System (the Reef)', link: '/SYSTEM' },
      {
        text: 'Appendices (species of polyp)',
        collapsed: false,
        items: [
          { text: 'CLI', link: '/appendix/cli' },
          { text: 'Backend / Service', link: '/appendix/backend' },
          { text: 'Web App', link: '/appendix/web' },
          { text: 'Library / Package', link: '/appendix/library' },
          { text: 'GitHub Action / Tool', link: '/appendix/gh-action' },
        ],
      },
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/ClimateView/coral' },
    ],
  },
}))

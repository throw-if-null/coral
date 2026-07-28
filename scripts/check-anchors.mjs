// ─────────────────────────────────────────────────────────────────────────────
// Post-build anchor check: every in-site link fragment must resolve to a real id.
//
// Why post-build rather than inside config.mjs: heading ids are produced by
// markdown-it-anchor's slugifier, and re-implementing that slugifier here would
// mean a second copy that can drift from the real one — exactly what the docs
// tell you not to do. Reading the ids out of the rendered HTML is the same fact,
// measured instead of predicted.
//
// This guards a failure the docs shipped with silently: `#7-forbidden-buckets-bucket-`
// was linked from two places, and the real id is `#_7-forbidden-buckets-bucket`
// (leading digit gets an underscore, trailing punctuation is dropped, `--`
// collapses). VitePress's dead-link check validates the page, never the fragment,
// so the links resolved to the right page and silently ignored the anchor.
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs'
import path from 'node:path'

const DIST = path.resolve(import.meta.dirname, '..', '.vitepress', 'dist')
const BASE = process.env.DOCS_BASE || '/'

if (!fs.existsSync(DIST)) {
  console.error(`[anchors] no build output at ${DIST} — run the build first.`)
  process.exit(1)
}

function htmlFiles(dir) {
  const out = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...htmlFiles(abs))
    else if (e.name.endsWith('.html')) out.push(abs)
  }
  return out
}

const files = htmlFiles(DIST)
// dist-relative posix path -> Set of every id on that page (headings AND the
// rule-def anchors emitted by the ruleIdPlugin, which are not headings).
const ids = new Map()
for (const abs of files) {
  const rel = path.relative(DIST, abs).split(path.sep).join('/')
  const set = new Set()
  for (const m of fs.readFileSync(abs, 'utf8').matchAll(/\sid="([^"]+)"/g)) set.add(m[1])
  ids.set(rel, set)
}

// Map an href to a dist-relative page path, or null if it isn't an in-site page.
function resolvePage(href, fromRel) {
  if (href.startsWith('/')) {
    let p = href.slice(BASE.length > 1 ? BASE.length : 1)
    if (p === '' || p.endsWith('/')) p += 'index.html'
    if (!p.endsWith('.html')) return null
    return ids.has(p) ? p : null
  }
  // relative href — resolve against the linking page's directory
  const dir = path.posix.dirname(fromRel)
  const p = path.posix.normalize(path.posix.join(dir === '.' ? '' : dir, href))
  return ids.has(p) ? p : null
}

const problems = []
for (const abs of files) {
  const rel = path.relative(DIST, abs).split(path.sep).join('/')
  const html = fs.readFileSync(abs, 'utf8')
  for (const m of html.matchAll(/href="([^"]+)"/g)) {
    const href = m[1]
    if (/^(https?:|mailto:|tel:|data:)/.test(href)) continue
    const hash = href.indexOf('#')
    if (hash === -1) continue
    let frag = href.slice(hash + 1)
    if (!frag) continue
    try {
      frag = decodeURIComponent(frag)
    } catch {
      /* leave as-is */
    }
    const target = hash === 0 ? rel : resolvePage(href.slice(0, hash), rel)
    if (!target) continue // not an in-site page we rendered; VitePress owns that check
    if (!ids.get(target).has(frag)) {
      problems.push(`${rel} → ${href}   (no id "${frag}" on ${target})`)
    }
  }
}

const unique = [...new Set(problems)].sort()
if (unique.length) {
  console.error(`\n[anchors] ${unique.length} unresolved link fragment(s):`)
  for (const p of unique) console.error(`    ${p}`)
  console.error('')
  process.exit(1)
}
console.log(`[anchors] OK — every in-site link fragment resolves (${files.length} pages checked).`)

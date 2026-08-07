// ─────────────────────────────────────────────────────────────────────────────
// The rule parser. One definition, two consumers.
//
// .vitepress/config.mjs needs it to build the deep-link registry and to run the
// integrity checks; scripts/rules-lock.mjs needs it to write rules.lock. A second
// copy of this regex would drift, and a drifted parser fails silently — it simply
// stops recognising some rules as rules, which is the exact failure this file's
// checks exist to catch. So it lives here and is injected into both.
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs'
import path from 'node:path'

// id grammar: FAMILY(-SUBFAMILY)*-N   e.g. SCOPE-3, SYS-TEST-1, WEB-6, VER-1
export const ID_CORE = '[A-Z][A-Z-]*-\\d+'
export const INLINE_ID_RE = new RegExp(`^\\[(${ID_CORE})\\]$`)

// A definition line opens with a bullet, bold, or both, then the ID code-span.
// All three combinations occur: **`[SCOPE-1]`**, - `[BUCKET-1]`, - **`[CLI-1]`**.
// The leading marker is required, not optional: a wrapped paragraph line can begin
// with a bare `[ID]` code-span, and those are citations, not definitions.
const DEF_LINE_RE = new RegExp(String.raw`^(?:- \*\*|\*\*|- )\`\[(${ID_CORE})\]\`(.*)$`)

// Factories, not shared instances — a stateful /g regex reused across callers is a
// bug waiting to happen.
export const useRe = () => new RegExp(String.raw`\`\[(${ID_CORE})\]\``, 'g')
const classRe = () => /`\[(auto|review|guide)\]`/g

// The spine is pinned first because the registry is first-definition-wins:
// precedence has to be stable and must not depend on directory order.
const SPINE = ['CONVENTIONS.md', 'ARCHITECTURE.md', 'SYSTEM.md']
const SKIP = new Set(['node_modules', 'public'])

// A changelog RECORDS rules; it does not define them. But it quotes each new rule
// in the very shape a definition uses — `- **`[WEB-11]`** `[review]` — server
// state is…` — and the registry is first-definition-wins with CHANGELOG.md sorting
// before appendix/*. So the quotes were winning: [WEB-10], [WEB-11], [WEB-12],
// [BE-7] and [AGENTIC-12] resolved to the changelog instead of their own page, and
// [VER-1] read as *classless* because the prose mention `**`[VER-1]`'s append-only
// guarantee starts here.**` matched first and carries no `[auto]` marker. All of it
// was silent — a rule still had *a* definition, just the wrong one.
//
// Rewording every future entry would be a discipline that eventually lapses, so the
// exclusion is structural. DEFINITIONS only: the file stays in docFiles(), so Gate 2
// still requires every ID the changelog cites to resolve somewhere.
// rules.md is generated FROM this registry (scripts/rules-index.mjs), so letting it
// define anything would be circular as well as wrong. Its rows are table cells, which
// DEF_LINE_RE cannot match today — but that is an accident of the row syntax, not a
// guarantee, and the changelog taught us what a silent registry hijack costs. Say it.
const DEFINES_NOTHING = new Set(['CHANGELOG.md', 'rules.md'])

export const CONTRACT_START = '<!-- coral:contract:start -->'
export const CONTRACT_END = '<!-- coral:contract:end -->'

function walk(dir, srcDir) {
  const out = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || SKIP.has(e.name)) continue
    const abs = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...walk(abs, srcDir))
    else if (e.name.endsWith('.md')) out.push(path.relative(srcDir, abs))
  }
  return out
}

// Everything else is discovered, so a new appendix or example is registered just by
// existing. Only the ROOT README.md is excluded — it is srcExclude'd, so a
// definition there would point at a page that isn't built. A nested README
// (tools/coral-lint/) IS built and IS scanned.
export function docFiles(srcDir) {
  return [...new Set([...SPINE, ...walk(srcDir, srcDir).sort()])].filter((rel) => rel !== 'README.md')
}

/**
 * Parse every rule definition across the doc set.
 *
 * @returns {{registry: Map<string,string>, rules: Map<string,{page:string,cls:string|undefined}>,
 *            defsByFile: Map<string,Array<{id:string,cls:string|undefined}>>, problems: string[]}}
 */
export function parseRules(srcDir) {
  const files = docFiles(srcDir)
  const registry = new Map() // ID -> defining page (matches VitePress env.relativePath)
  const rules = new Map() // ID -> { page, cls }
  const defsByFile = new Map()
  const problems = []

  for (const rel of files) {
    if (DEFINES_NOTHING.has(rel)) continue
    const abs = path.join(srcDir, rel)
    if (!fs.existsSync(abs)) continue
    const lines = fs.readFileSync(abs, 'utf8').split('\n')
    lines.forEach((line, i) => {
      const m = DEF_LINE_RE.exec(line)
      if (!m) return
      const [, id, rest] = m
      // First definition wins. Later leading occurrences (a contract bullet, an
      // enforcement-table row) are citations of an already-defined rule, and are
      // deliberately exempt from the class check — only the definition carries it.
      if (registry.has(id)) return
      registry.set(id, rel)

      const classes = [...rest.matchAll(classRe())].map((c) => c[1])
      if (classes.length !== 1) {
        problems.push(
          `[${id}] ${rel}:${i + 1} carries ${classes.length === 0 ? 'no' : classes.length}` +
            ' enforcement class; CONVENTIONS.md requires exactly one of `[auto]` / `[review]` /' +
            ' `[guide]` on the definition line.'
        )
      }
      rules.set(id, { page: rel, cls: classes[0] })
      if (!defsByFile.has(rel)) defsByFile.set(rel, [])
      defsByFile.get(rel).push({ id, cls: classes[0] })
    })
  }
  return { registry, rules, defsByFile, problems, files }
}

export const LOCK_FILE = 'rules.lock'
export const LOCK_HEADER = [
  '# rules.lock — every rule ID Coral has ever published, with its enforcement class.',
  '#',
  '# [VER-1] makes rule IDs append-only: never renumbered, never recycled, never',
  '# removed. A project CORAL.md cites [STATE-5] and that citation must mean the',
  '# same thing in five years, so this file is the checked-in record the build',
  '# compares against. An ID that disappears, or whose class changes, fails the',
  '# build until the change is deliberate: regenerate with `npm run rules:lock`',
  '# and record it in CHANGELOG.md.',
  '#',
  '# Generated. Do not hand-edit.',
]

/** Serialize the rule set to lockfile text. Sorted, so diffs are readable. */
export function serializeLock(rules) {
  const lines = [...rules.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, { cls, page }]) => `${id}\t${cls ?? '?'}\t${page}`)
  return [...LOCK_HEADER, '', ...lines, ''].join('\n')
}

/** Parse lockfile text back into ID -> {cls, page}. */
export function parseLock(text) {
  const out = new Map()
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const [id, cls, page] = trimmed.split('\t')
    out.set(id, { cls, page })
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// The rule index — rules.md, a generated view of the registry.
//
// The docs define each rule once and point at it, which is right for reading and
// useless for looking one up: there is no page that answers "what rules exist?"
// or "show me every [auto] rule". This builds one. It is GENERATED for the same
// reason rules.lock is: a hand-written index is a second copy of 174 rules, and
// the second copy is always the one that goes stale.
//
// The statement column comes from the Agent Execution Contract wherever there is
// one — those lines are already curated one-line imperatives, and sourcing from
// them means the index inherits Gate 3's completeness guarantee instead of
// inventing a parallel summary nobody maintains. [guide] rules are not in any
// contract, so they fall back to the opening sentence of the definition.
// ─────────────────────────────────────────────────────────────────────────────
export const INDEX_FILE = 'rules.md'

const CONTRACT_LINE_RE = new RegExp(String.raw`^- \`\[(${ID_CORE})\]\`\s+(.*)$`)

/** Drop bold markers and collapse whitespace, so a statement sits in one table cell. */
const flatten = (s) => s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\s+/g, ' ').trim()

/** Greedy wrap for generated prose, matching the documents' ~107-column convention. */
function wrap(text, width = 107) {
  const out = []
  let line = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && line.length + 1 + word.length > width) {
      out.push(line)
      line = word
    } else line = line ? `${line} ${word}` : word
  }
  if (line) out.push(line)
  return out
}

/** First sentence, ignoring the periods inside `code spans` and common abbreviations. */
function firstSentence(text) {
  let tick = false
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '`') tick = !tick
    if (tick || !'.!?'.includes(text[i])) continue
    const next = text.slice(i + 1)
    if (!next || /^\s+[A-Z“"(]/.test(next)) return text.slice(0, i + 1)
  }
  return text
}

/**
 * One-line statement per rule: the contract line where a document has one, else the
 * definition's opening sentence.
 *
 * @returns {Map<string,string>} ID -> statement
 */
export function extractStatements(srcDir, rules) {
  const out = new Map()
  const byPage = new Map()
  for (const [id, { page }] of rules) {
    if (!byPage.has(page)) byPage.set(page, [])
    byPage.get(page).push(id)
  }

  for (const [rel, ids] of byPage) {
    const text = fs.readFileSync(path.join(srcDir, rel), 'utf8')

    // Preferred source: the document's own contract.
    const start = text.indexOf(CONTRACT_START)
    if (start !== -1) {
      const end = text.indexOf(CONTRACT_END, start)
      for (const line of text.slice(start, end === -1 ? undefined : end).split('\n')) {
        const m = CONTRACT_LINE_RE.exec(line)
        if (m) out.set(m[1], flatten(m[2]))
      }
    }

    // Fallback: the definition itself, read to the end of its paragraph so a wrapped
    // opening sentence is not truncated at the line break.
    const lines = text.split('\n')
    for (const id of ids) {
      if (out.has(id)) continue
      const i = lines.findIndex((l) => DEF_LINE_RE.exec(l)?.[1] === id)
      if (i === -1) continue
      let body = DEF_LINE_RE.exec(lines[i])[2]
      for (let j = i + 1; j < lines.length && lines[j].trim() && !DEF_LINE_RE.test(lines[j]); j++) {
        body += ` ${lines[j].trim()}`
      }
      // Order matters. The `**` that closes a bolded ID has to go BEFORE flatten pairs
      // it with the next opening `**` in the sentence — otherwise `**[SCOPE-1]** — This
      // covers **command-shaped apps**` loses "This covers" instead of the emphasis.
      body = body
        .replace(classRe(), '')     // the enforcement class is its own column
        .trimStart()
        .replace(/^\*\*/, '')       // closing marker of a bolded ID
        .replace(/^[\s—–:-]+/, '')  // the dash or colon that opens most definitions
      out.set(id, firstSentence(flatten(body)))
    }
  }
  return out
}

/** Render the registry as the rules.md page. Owns the whole file — prose included. */
export function serializeIndex(srcDir, rules, defsByFile) {
  const statements = extractStatements(srcDir, rules)
  const count = (c) => [...rules.values()].filter((r) => r.cls === c).length
  const title = (rel) =>
    (fs.readFileSync(path.join(srcDir, rel), 'utf8').match(/^# (.+)$/m)?.[1] || rel).trim()

  const out = [
    '# Rule index',
    '',
    ...wrap(
      `Every rule Coral publishes, in one place: **${rules.size} rules** across ${defsByFile.size} ` +
        `documents — ${count('auto')} \`[auto]\`, ${count('review')} \`[review]\`, ` +
        `${count('guide')} \`[guide]\`. Each ID links to its definition, where the reasoning lives; ` +
        'the statement here is only the one-line form.'
    ),
    '',
    ...wrap(
      'This page is **generated from the documents** (`npm run rules:index`), and the build fails if ' +
        'it drifts, so it cannot disagree with them. A hand-maintained index would be a second copy ' +
        'of every rule — the failure the `[DUP-*]` rules exist to prevent, committed by the rule set ' +
        'itself.'
    ),
    '',
    ...wrap(
      "Statements come from each document's Agent Execution Contract, which is why they read as " +
        'instructions. `[guide]` rules are rationale rather than instruction and appear in no ' +
        'contract, so theirs is the opening sentence of the definition instead.'
    ),
    '',
  ]

  for (const [rel, defs] of defsByFile) {
    out.push(
      `## ${title(rel)}`,
      '',
      `${defs.length} rule${defs.length === 1 ? '' : 's'} — [\`${rel}\`](./${rel})`,
      '',
      '| Rule | Class | Statement |',
      '| --- | --- | --- |',
      ...defs.map(({ id, cls }) => {
        const s = (statements.get(id) || '').replace(/\|/g, '\\|')
        return `| \`[${id}]\` | \`[${cls}]\` | ${s} |`
      }),
      ''
    )
  }
  return out.join('\n')
}

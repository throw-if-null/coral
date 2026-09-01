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

// A fenced code block is an ILLUSTRATION of a rule, never a definition of one. Coral's own
// documents now show what a definition line looks like — CONVENTIONS.md's ownership section
// prints `- **`[CLI-6]`** `[auto]` `{app:cli}` …` as an example — and the registry is
// first-definition-wins with CONVENTIONS.md sorting before appendix/cli.md, so without this
// the example silently became the definition and [CLI-6] moved documents. Same failure the
// changelog caused, arriving from the other direction: there the fix was to exclude a file,
// and a file exclusion cannot help when the example is in the file that also defines rules.
//
// Fence lengths are tracked per CommonMark: only a fence at least as long as the one that
// opened the block can close it, which is what keeps CONVENTIONS.md's ````-wrapped CORAL.md
// example (containing a ```yaml fence) from toggling the state twice and re-opening.
const FENCE_RE = /^\s*(`{3,}|~{3,})/

/**
 * Every rule-definition line in a document, skipping fenced code blocks.
 *
 * @param {string[]} lines
 * @returns {Array<{i:number,id:string,rest:string,line:string}>}
 */
export function definitionLines(lines) {
  const out = []
  let fence = null
  for (let i = 0; i < lines.length; i++) {
    const f = FENCE_RE.exec(lines[i])
    if (f) {
      const marker = f[1]
      if (fence === null) fence = marker
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null
      continue
    }
    if (fence !== null) continue
    const m = DEF_LINE_RE.exec(lines[i])
    if (m) out.push({ i, id: m[1], rest: m[2], line: lines[i] })
  }
  return out
}

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

// The kernel block in CONVENTIONS.md — the named subset of rules whose presence or
// strictness is materially justified by the agent-author / human-architect operating
// model. It is a table of CITATIONS, and that is the whole point:
// "one rule, one ID" forbids a KERN-* family, so the kernel must not be able to
// restate a rule. Parsing it here rather than hand-listing the IDs is what keeps the
// classification single-sourced — rules.md marks kernel rules from this block.
export const KERNEL_START = '<!-- coral:kernel:start -->'
export const KERNEL_END = '<!-- coral:kernel:end -->'
export const KERNEL_FILE = 'CONVENTIONS.md'

// The exact shape of a kernel row: ID citation, rationale, properties. Anchored at both
// ends, so it fixes the column count too.
//
// Only the FIRST column contributes membership — reading every ID in the block would let
// a citation in a rationale cell silently join the kernel. And the match is required, not
// opportunistic: a row that fails this shape is an error, never a row that quietly does
// not count. `| [MODEL-1] | … | … |` (no backticks) is not a citation the site can link
// and must not be readable as membership either.
//
// The cell class is `[^|]*[^|\s][^|]*` — "no pipes, and not blank". `\S` would be the
// obvious spelling and is wrong: `|` is non-whitespace, so it let ` why | properties `
// parse as one cell and a four-column row read as a valid three-column one.
const KERNEL_ROW_RE = new RegExp(
  String.raw`^\|\s*\`\[(${ID_CORE})\]\`\s*\|([^|]*[^|\s][^|]*)\|([^|]*[^|\s][^|]*)\|$`
)
// The header and its delimiter are held to the same three-column shape as the data
// rows. They used to be checked loosely — the delimiter pattern was /^\|[\s:|-]+\|$/,
// which accepts `|---|` and `|-|-|-|-|` alike, so the parser could report a valid table
// while its header described two columns and its rows carried three. Once this function
// says the table is structurally valid, it has to actually be a three-column Markdown
// table from the header down.
//
// Header cells are checked structurally, not by their wording: three non-empty cells.
// Freezing the prose would make rewording a heading a build failure and buy nothing —
// nothing reads the header text.
const KERNEL_COLUMNS = 3
// One Markdown alignment cell: hyphens, optionally colon-anchored on either side.
const DELIM_CELL_RE = /^\s*:?-+:?\s*$/

/** The cells of a full Markdown table row, or null if the line is not one. */
function tableCells(line) {
  if (line.length < 2 || !line.startsWith('|') || !line.endsWith('|')) return null
  return line.slice(1, -1).split('|')
}

// ─────────────────────────────────────────────────────────────────────────────
// Ownership layers — which surface a rule belongs to.
//
// Enforcement class answers *how hard* a rule is checked. This answers a different
// question: *who has to load it at all*. A CLI with no runtime model should not have
// to reason about `[AGENTIC-*]`, and a library should not have to read HTTP status
// codes, so every rule names the narrowest surface that justifies it.
//
// The six layers are fixed. They are the taxonomy itself, not a registry of rules, so
// they live in code rather than in a document — a seventh layer is a change to what
// Coral means by ownership, not an entry someone adds.
//
//   kernel               — read from CONVENTIONS.md's kernel block, and ONLY from there.
//   framework governance — governs Coral itself: interpretation, versioning, adoption.
//   production baseline  — language- and app-shape-neutral; every production app.
//   app profile          — applies because of the app's external shape (cli, backend, …).
//   language binding     — applies because of one language ecosystem. Currently empty.
//   runtime-agent profile— applies because the RUNNING app uses a model.
//
// `family` marks the two layers whose members carry a profile identity: `app:cli` is a
// classification, `app` alone is not. Which concrete profiles exist is a documented
// fact rather than a code constant — see the profile registry below.
// ─────────────────────────────────────────────────────────────────────────────
export const LAYERS = [
  { key: 'kernel', label: 'kernel', tag: null, family: null },
  { key: 'governance', label: 'framework governance', tag: 'governance', family: null },
  { key: 'baseline', label: 'production baseline', tag: 'baseline', family: null },
  { key: 'app', label: 'app profile', tag: null, family: 'app' },
  { key: 'lang', label: 'language binding', tag: null, family: 'lang' },
  { key: 'runtime-agent', label: 'runtime-agent profile', tag: 'runtime-agent', family: null },
]

// The layers a project OPTS INTO. Their rules are not universally applicable, which is
// why a contract that carries one has to say so — see checkContractScopes().
const OPTIONAL_KEYS = new Set(['app', 'lang', 'runtime-agent'])

// Who has to load each layer, in the words a reader of rules.md needs. Generated prose, so
// it sits with the taxonomy rather than being retyped into the index.
const LOADED_BY = {
  kernel: 'every Coral project',
  governance: 'every Coral project (Coral itself)',
  baseline: 'every production Coral application',
  app: 'projects with an app of that shape',
  lang: 'projects in that language ecosystem',
  'runtime-agent': 'applications that call a model at runtime',
}

// tag grammar: lowercase token, optionally `family:profile`  e.g. baseline, app:cli, lang:go
export const TAG_CORE = '[a-z][a-z0-9-]*(?::[a-z][a-z0-9-]*)?'
const TAG_RE = new RegExp(`^\\{(${TAG_CORE})\\}$`)
// A code span written in the SHAPE of a tag: one brace-delimited word, no spaces and no
// punctuation a tag could not contain. This is what makes a malformed tag an ERROR
// rather than an unrecognised span — `{App:CLI}` and `{app cli}` are caught, while the
// error taxonomy's `{category, code, message}` (commas, spaces) is correctly not a tag.
const TAG_SHAPED_RE = /^\{[A-Za-z0-9:_-]+\}$/
const codeSpans = (s) => [...s.matchAll(/`([^`]*)`/g)].map((m) => m[1])

/**
 * Resolve an ownership tag against the taxonomy and the declared profiles.
 *
 * @returns {{key:string,label:string,profile:string|null}|string} the layer, or an error
 *   sentence explaining why the tag is not one.
 */
export function resolveTag(tag, profiles) {
  const [head, profile] = tag.split(':')
  const familyLayer = LAYERS.find((l) => l.family === head)
  if (profile === undefined) {
    const layer = LAYERS.find((l) => l.tag === tag)
    if (layer) return { key: layer.key, label: layer.label, profile: null }
    if (familyLayer) {
      return (
        `\`{${tag}}\` names the ${familyLayer.label} layer without a profile. A ${familyLayer.label}` +
        ` rule must say WHICH one — \`{${head}:<profile>}\`.`
      )
    }
    return `\`{${tag}}\` is not an ownership layer. Use one of: ${tagVocabulary(profiles)}.`
  }
  if (!familyLayer) {
    return (
      `\`{${tag}}\` uses the profile form \`family:profile\`, but \`${head}\` is not a layer that takes` +
      ` a profile. Only ${LAYERS.filter((l) => l.family).map((l) => `\`${l.family}:\``).join(' and ')} do.`
    )
  }
  if (!profiles.has(tag)) {
    return (
      `\`{${tag}}\` is not a declared profile. Every profile is registered in ${PROFILES_FILE}'s` +
      ` ${PROFILES_START} block, which is what stops a typo becoming a silent new layer.`
    )
  }
  return { key: familyLayer.key, label: familyLayer.label, profile }
}

/** The tags a rule may currently carry, for an error message that can be acted on. */
function tagVocabulary(profiles) {
  const fixed = LAYERS.filter((l) => l.tag).map((l) => `\`{${l.tag}}\``)
  const declared = [...profiles.keys()].sort().map((t) => `\`{${t}}\``)
  return [...fixed, ...declared].join(', ')
}

/** Human-readable layer of a resolved classification: `app profile · cli`. */
export const layerLabel = ({ label, profile }) => (profile ? `${label} · ${profile}` : label)

// ─────────────────────────────────────────────────────────────────────────────
// The profile registry — which app profiles and language bindings exist.
//
// Same posture as the kernel block: one table, in one document, parsed rather than
// duplicated. A profile is not just a name, it is a claim about where its rules live,
// so the registry records the home document and the build holds rules to it. That is
// the check that keeps an `{app:cli}` rule out of the universally-loaded spine — the
// failure this whole classification exists to prevent.
//
// There are deliberately no `lang:` rows today. Coral has no language-binding rules,
// and inventing a profile to populate a layer would be worse than an honest zero.
// ─────────────────────────────────────────────────────────────────────────────
export const PROFILES_START = '<!-- coral:profiles:start -->'
export const PROFILES_END = '<!-- coral:profiles:end -->'
export const PROFILES_FILE = 'CONVENTIONS.md'
const PROFILE_COLUMNS = 3
// | `{app:cli}` | `appendix/cli.md` | what it covers |
const PROFILE_ROW_RE = new RegExp(
  String.raw`^\|\s*\`\{(${TAG_CORE})\}\`\s*\|\s*\`([^\`|]+)\`\s*\|([^|]*[^|\s][^|]*)\|$`
)

/**
 * Parse and validate the profile registry in CONVENTIONS.md.
 *
 * Every guarantee the kernel parser makes, for the same reason: this table is the single
 * source of which profiles exist, so a row that silently fails to parse would delete a
 * profile while the page still reads correctly. Unrecognised line, duplicate tag, wrong
 * column count, missing header or delimiter, a home document that does not exist — all
 * errors, none skipped.
 *
 * @returns {{profiles: Map<string,{home:string,covers:string}>, problems: string[]}}
 */
export function parseProfiles(srcDir) {
  const problems = []
  const profiles = new Map()
  const abs = path.join(srcDir, PROFILES_FILE)
  if (!fs.existsSync(abs)) {
    problems.push(`${PROFILES_FILE} is missing — it is where the profile registry lives.`)
    return { profiles, problems }
  }
  const text = fs.readFileSync(abs, 'utf8')
  const count = (marker) => text.split(marker).length - 1
  const starts = count(PROFILES_START)
  const ends = count(PROFILES_END)
  if (starts !== 1 || ends !== 1) {
    problems.push(
      `${PROFILES_FILE} must hold exactly one ${PROFILES_START} block (found ${starts} start` +
        ` marker(s) and ${ends} end marker(s)). Two registries would leave one of them silently` +
        ' contributing nothing.'
    )
    return { profiles, problems }
  }
  const start = text.indexOf(PROFILES_START)
  const end = text.indexOf(PROFILES_END)
  if (end < start) {
    problems.push(`${PROFILES_FILE} has ${PROFILES_END} before ${PROFILES_START}.`)
    return { profiles, problems }
  }

  const SHAPE = 'Each row is  | `{family:profile}` | `home/document.md` | what it covers |'
  const block = text.slice(start + PROFILES_START.length, end)
  const markerLine = text.slice(0, start).split('\n').length
  let header = false
  let delim = false
  let rows = 0

  block.split('\n').forEach((line, i) => {
    const at = `${PROFILES_FILE}:${markerLine + i}`
    const trimmed = line.trim()
    if (!trimmed) return
    if (!trimmed.startsWith('|')) {
      problems.push(
        `${at} is inside the profile registry but is not a table row. The block holds the registry` +
          ` and nothing else — prose belongs outside the markers. ${SHAPE}`
      )
      return
    }
    if (!header) {
      header = true
      const cells = tableCells(trimmed)
      if (PROFILE_ROW_RE.test(trimmed)) {
        problems.push(`${at}: the profile registry's first row must be its header, not a profile.`)
      } else if (!cells || cells.length !== PROFILE_COLUMNS || cells.some((c) => !c.trim())) {
        problems.push(
          `${at}: the profile registry's header must have exactly ${PROFILE_COLUMNS} non-empty` +
            ` columns, matching its rows. ${SHAPE}`
        )
      }
      return
    }
    if (!delim) {
      delim = true
      const cells = tableCells(trimmed)
      if (!cells || cells.length !== PROFILE_COLUMNS || !cells.every((c) => DELIM_CELL_RE.test(c))) {
        problems.push(
          `${at}: expected the header delimiter row with exactly ${PROFILE_COLUMNS} columns` +
            ' (|---|---|---|) here.'
        )
      }
      return
    }

    rows++
    const row = PROFILE_ROW_RE.exec(trimmed)
    if (!row) {
      problems.push(
        `${at} is a malformed profile row, so the profile it declares cannot be read. ${SHAPE} —` +
          ' the tag and the home document must both be code spans, and there must be exactly three' +
          ' non-empty columns.'
      )
      return
    }
    const [, tag, home, covers] = row
    const family = LAYERS.find((l) => l.family === tag.split(':')[0])
    if (!tag.includes(':') || !family) {
      problems.push(
        `${at} declares \`{${tag}}\`, which is not a profile. Only the layers that take a profile` +
          ` identity are registered here: ${LAYERS.filter((l) => l.family).map((l) => `\`${l.family}:\``).join(', ')}.`
      )
      return
    }
    if (profiles.has(tag)) {
      problems.push(
        `${at} declares \`{${tag}}\` twice. One row per profile: a second row is a copy that can be` +
          ' edited without the first one moving.'
      )
      return
    }
    if (!fs.existsSync(path.join(srcDir, home))) {
      problems.push(
        `${at} declares \`{${tag}}\`'s rules as living in \`${home}\`, which does not exist.`
      )
      return
    }
    profiles.set(tag, { home, covers: covers.trim() })
  })

  if (!header || !delim) {
    problems.push(
      `${PROFILES_FILE}'s profile registry is not a table. It must open with a header row and its` +
        ` delimiter. ${SHAPE}`
    )
  } else if (!rows) {
    problems.push(`${PROFILES_FILE}'s profile registry has a header but no profiles. ${SHAPE}`)
  }
  return { profiles, problems }
}

/**
 * Assign every published rule its one ownership layer.
 *
 * Two sources, deliberately disjoint. Kernel membership comes from CONVENTIONS.md's kernel
 * block and from nowhere else, so a kernel rule carries NO inline tag — a tag on one would
 * be a second membership registry, which is the one thing the kernel design forbids. Every
 * other rule carries exactly one `{tag}` on its definition line, next to its enforcement
 * class, because the classification belongs where the rule is stated and not in a table
 * that can be edited without the rule moving.
 *
 * Both directions are errors, and that is what makes the pair a forcing function: a new rule
 * with no tag fails, and a rule promoted into the kernel fails until its tag is removed.
 *
 * @returns {{layers: Map<string,{tag:string|null,key:string,label:string,profile:string|null}>,
 *            problems: string[]}}
 */
export function classifyRules({ rules, kernel, profiles }) {
  const problems = []
  const layers = new Map()
  for (const [id, rule] of rules) {
    const at = `${rule.page}${rule.line ? `:${rule.line}` : ''}`
    if (kernel.has(id)) {
      if (rule.tags.length) {
        problems.push(
          `[${id}] ${at} is a kernel rule AND carries the inline ownership tag` +
            ` \`{${rule.tags[0]}}\`. Kernel membership is recorded in ${KERNEL_FILE}'s kernel` +
            ' block and nowhere else; a tag here would be a second membership registry. Remove the' +
            ' tag, or remove the rule from the kernel table.'
        )
        continue
      }
      layers.set(id, { tag: null, key: 'kernel', label: 'kernel', profile: null })
      continue
    }
    if (rule.tags.length !== 1) {
      problems.push(
        `[${id}] ${at} carries ` +
          (rule.tags.length === 0 ? 'no ownership tag' : `${rule.tags.length} ownership tags`) +
          '; every rule outside the kernel needs exactly one on its definition line, after its' +
          ` enforcement class. Available: ${tagVocabulary(profiles)}.`
      )
      continue
    }
    const resolved = resolveTag(rule.tags[0], profiles)
    if (typeof resolved === 'string') {
      problems.push(`[${id}] ${at}: ${resolved}`)
      continue
    }
    if (resolved.profile) {
      const home = profiles.get(rule.tags[0]).home
      if (rule.page !== home) {
        problems.push(
          `[${id}] is classified \`{${rule.tags[0]}}\` but is defined in ${rule.page}, while that` +
            ` profile's rules live in ${home}. A profile rule defined in a universally-loaded` +
            ' document is read as universally applicable however it is classified — move the rule,' +
            ' or reclassify it.'
        )
        continue
      }
    }
    layers.set(id, { tag: rule.tags[0], ...resolved })
  }
  return { layers, problems }
}

// ─────────────────────────────────────────────────────────────────────────────
// Contract scope — an Agent Execution Contract says which of its rules are optional.
//
// Each contract claims to be the COMPLETE normative surface of its document, and an agent
// is invited to load only that. So a contract listing `[ORCH-4]` beside `[CHAN-1]` with no
// distinction tells the agent that runtime-agent orchestration binds every system, which
// is exactly the scope failure the ownership layers exist to name. Classifying the rule and
// leaving the contract flat would fix the label and not the loading.
//
// The marker is `<!-- coral:scope:<tag> -->`, and it governs the contract lines after it
// until `<!-- coral:scope:end -->` or the close of the contract. Universal rules — kernel,
// production baseline, framework governance — must sit OUTSIDE every marker; an optional
// rule must sit inside one naming its own tag.
// ─────────────────────────────────────────────────────────────────────────────
const SCOPE_RE = /^<!--\s*coral:scope:(\S+?)\s*-->$/
const SCOPE_END = 'end'

export function checkContractScopes(srcDir, { rules, layers }) {
  const problems = []
  const byPage = new Set([...rules.values()].map((r) => r.page))
  for (const rel of [...byPage].sort()) {
    const text = fs.readFileSync(path.join(srcDir, rel), 'utf8')
    const start = text.indexOf(CONTRACT_START)
    if (start === -1) continue
    const end = text.indexOf(CONTRACT_END, start)
    const block = text.slice(start, end === -1 ? undefined : end)
    const markerLine = text.slice(0, start).split('\n').length
    let scope = null
    let used = false
    let openedAt = 0

    block.split('\n').forEach((line, i) => {
      const at = `${rel}:${markerLine + i}`
      const m = SCOPE_RE.exec(line.trim())
      if (m) {
        if (scope && !used) {
          problems.push(
            `${rel}:${openedAt} opens contract scope \`{${scope}}\` but no contract line falls under` +
              ' it. A scope marker that governs nothing is a claim the contract does not make.'
          )
        }
        if (m[1] === SCOPE_END) {
          if (!scope) {
            problems.push(`${at} closes a contract scope that was never opened.`)
          }
          scope = null
          return
        }
        const known = [...layers.values()].some((l) => l.tag === m[1])
        if (!known) {
          problems.push(
            `${at} opens contract scope \`{${m[1]}}\`, which no rule is classified under. A scope` +
              ' marker names an ownership tag that is actually in use.'
          )
        }
        scope = m[1]
        used = false
        openedAt = markerLine + i
        return
      }
      const cite = CONTRACT_LINE_RE.exec(line)
      if (!cite) return
      const layer = layers.get(cite[1])
      if (!layer) return
      const optional = OPTIONAL_KEYS.has(layer.key)
      if (!optional) {
        if (scope) {
          problems.push(
            `[${cite[1]}] ${at} is \`${layerLabel(layer)}\` — it binds every Coral app — but sits` +
              ` inside contract scope \`{${scope}}\`, which marks it as opt-in. Move it out of the` +
              ' scoped group.'
          )
        }
        return
      }
      used = true
      if (scope !== layer.tag) {
        problems.push(
          `[${cite[1]}] ${at} is \`${layerLabel(layer)}\`, so it applies only to projects that load` +
            ` that profile — but the contract lists it ${scope ? `under scope \`{${scope}}\`` : 'unscoped'}.` +
            ` Put it under \`<!-- coral:scope:${layer.tag} -->\`, or the contract presents an` +
            ' opt-in rule as universal.'
        )
      }
    })
    if (scope && !used) {
      problems.push(
        `${rel}:${openedAt} opens contract scope \`{${scope}}\` but no contract line falls under it.`
      )
    }
  }
  return problems
}

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
    definitionLines(lines).forEach(({ i, id, rest }) => {
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

      // Ownership tags are collected here and judged in classifyRules(), which is the only
      // place that knows whether this rule is in the kernel — and so whether a tag is
      // required or forbidden. What IS judged here is legibility: a span written in the
      // shape of a tag but not spelled like one is an error, never a tag that quietly does
      // not count. Silently dropping `{App:CLI}` would drop the rule out of every layer.
      const tags = []
      for (const span of codeSpans(rest)) {
        if (!TAG_SHAPED_RE.test(span)) continue
        const t = TAG_RE.exec(span)
        if (t) tags.push(t[1])
        else
          problems.push(
            `[${id}] ${rel}:${i + 1} carries \`${span}\`, which is written as an ownership tag but` +
              ' is not one. A tag is lowercase, with an optional single `family:profile` split —' +
              ' `{baseline}`, `{app:cli}`.'
          )
      }
      // The same span outside backticks renders as literal braces and would be invisible to
      // the parser, so it fails rather than leaving the rule unclassified for a reader who
      // can plainly see a classification on the line.
      for (const m of rest.replace(/`[^`]*`/g, '').matchAll(/\{[A-Za-z0-9:_-]+\}/g)) {
        problems.push(
          `[${id}] ${rel}:${i + 1} carries ${m[0]} outside a code span. An ownership tag is written` +
            ' as `' + `${m[0]}` + '` so it reads as a tag and parses as one.'
        )
      }

      rules.set(id, { page: rel, line: i + 1, cls: classes[0], tags })
      if (!defsByFile.has(rel)) defsByFile.set(rel, [])
      defsByFile.get(rel).push({ id, cls: classes[0] })
    })
  }
  return { registry, rules, defsByFile, problems, files }
}

/**
 * Parse and validate the kernel table in CONVENTIONS.md.
 *
 * Two guarantees, and both have to be enforced rather than assumed.
 *
 * The block CITES rules and never defines them: a definition line inside it would make
 * the kernel a second normative source for a rule already defined elsewhere, which is
 * the one failure this classification must not be able to cause.
 *
 * And every line in the block is accounted for. The first version of this parser only
 * *collected* rows that matched, which sounds equivalent and is not: a row whose ID lost
 * its backticks, or gained a fourth column, simply stopped being a kernel rule, silently,
 * while the table still read correctly to a human. A table that is the single source of a
 * classification cannot have a shape in which membership can fall out unnoticed — so an
 * unrecognised line is an error, a duplicate ID is an error, and the header and its
 * delimiter must be present, be exactly one line each, and carry the same three columns
 * the rows do.
 *
 * The same argument applies one level up, to the markers: the file must hold exactly one
 * of each. Reading the first block would leave a second, fully visible kernel table
 * contributing nothing, and a reader with no way to tell which one counts.
 *
 * The kernel's *size* is deliberately not checked. Gate 5 already turns a membership
 * change into a diff in a generated file; a constant here would be a second thing to
 * edit and would add nothing.
 *
 * @param {string} srcDir
 * @param {Map<string,unknown>} [rules] the rule registry; when given, every cited ID must
 *   resolve in it — the check that keeps the kernel a subset of rules that actually exist.
 * @returns {{ids: Set<string>, problems: string[]}}
 */
export function parseKernel(srcDir, rules) {
  const problems = []
  const ids = new Set()
  const abs = path.join(srcDir, KERNEL_FILE)
  if (!fs.existsSync(abs)) {
    problems.push(`${KERNEL_FILE} is missing — it is where kernel membership is recorded.`)
    return { ids, problems }
  }

  // Exactly one block. Taking the first start and the first end after it — which is what
  // this did — means a second, entirely visible kernel table contributes nothing to
  // generated membership, and a human reading the page cannot tell which one counts.
  // A page with two canonical tables has no canonical table.
  const text = fs.readFileSync(abs, 'utf8')
  const count = (marker) => text.split(marker).length - 1
  const starts = count(KERNEL_START)
  const ends = count(KERNEL_END)
  if (starts !== 1 || ends !== 1) {
    if (starts === 0) {
      problems.push(
        `${KERNEL_FILE} has no ${KERNEL_START} block. Kernel membership is recorded there, in one` +
          ' table, and rules.md is generated from it.'
      )
    } else if (starts > 1) {
      problems.push(
        `${KERNEL_FILE} has ${starts} ${KERNEL_START} markers. Kernel membership is one table:` +
          ' a second block is a second source, and only one of them would be read.'
      )
    }
    if (ends === 0 && starts > 0) {
      problems.push(`${KERNEL_FILE} opens ${KERNEL_START} but never closes it with ${KERNEL_END}.`)
    } else if (ends > 1) {
      problems.push(
        `${KERNEL_FILE} has ${ends} ${KERNEL_END} markers, and the kernel block takes exactly one.`
      )
    }
    return { ids, problems }
  }

  const start = text.indexOf(KERNEL_START)
  const end = text.indexOf(KERNEL_END)
  if (end < start) {
    problems.push(
      `${KERNEL_FILE} has ${KERNEL_END} before ${KERNEL_START}. The end marker closes the block;` +
        ' it cannot precede it.'
    )
    return { ids, problems }
  }

  const SHAPE = 'Each row is  | `[ID]` | why it is kernel | properties defended |'
  const block = text.slice(start + KERNEL_START.length, end)
  // 1-based line number of the marker, so a reported line matches the editor's gutter.
  const markerLine = text.slice(0, start).split('\n').length
  let header = false
  let delim = false
  let rows = 0

  block.split('\n').forEach((line, i) => {
    const at = `${KERNEL_FILE}:${markerLine + i}`
    const trimmed = line.trim()
    if (!trimmed) return

    const def = DEF_LINE_RE.exec(line)
    if (def) {
      problems.push(
        `[${def[1]}] ${at} is written as a rule DEFINITION inside the kernel block. The kernel is a` +
          ' named subset of existing rules: every row cites a rule defined elsewhere, and the kernel' +
          ' never restates one.'
      )
      return
    }
    if (!trimmed.startsWith('|')) {
      problems.push(
        `${at} is inside the kernel block but is not a table row. The block holds the membership` +
          ` table and nothing else — prose belongs outside the markers. ${SHAPE}`
      )
      return
    }
    if (!header) {
      header = true
      if (KERNEL_ROW_RE.test(trimmed)) {
        problems.push(`${at}: the kernel table's first row must be its header, not a rule row.`)
        return
      }
      const cells = tableCells(trimmed)
      if (!cells || cells.length !== KERNEL_COLUMNS || cells.some((c) => !c.trim())) {
        problems.push(
          `${at}: the kernel table's header must have exactly ${KERNEL_COLUMNS} non-empty columns,` +
            ` matching its rows. ${SHAPE}`
        )
      }
      return
    }
    if (!delim) {
      delim = true
      const cells = tableCells(trimmed)
      if (!cells || cells.length !== KERNEL_COLUMNS || !cells.every((c) => DELIM_CELL_RE.test(c))) {
        problems.push(
          `${at}: expected the header delimiter row with exactly ${KERNEL_COLUMNS} columns` +
            ' (|---|---|---|) here.'
        )
      }
      return
    }

    rows++
    const row = KERNEL_ROW_RE.exec(trimmed)
    if (!row) {
      problems.push(
        `${at} is a malformed kernel row, so its membership cannot be read. ${SHAPE} — the ID must` +
          ' be a backticked citation (`[MODEL-1]`, not [MODEL-1]) and there must be exactly three' +
          ' non-empty columns.'
      )
      return
    }
    const id = row[1]
    if (ids.has(id)) {
      problems.push(
        `[${id}] ${at} is listed in the kernel table twice. One row per rule: a second row is a` +
          ' copy that can be edited without the first one moving.'
      )
      return
    }
    ids.add(id)
    if (rules && !rules.has(id)) {
      problems.push(
        `[${id}] ${at} is listed in the kernel table but is not a defined rule. The kernel is a` +
          ' named subset of existing rules, so every row must cite one — check the ID for a typo.'
      )
    }
  })

  if (!header || !delim) {
    problems.push(
      `${KERNEL_FILE}'s kernel block is not a table. It must open with a header row and its` +
        ` delimiter. ${SHAPE}`
    )
  } else if (!rows) {
    // Counted as rows, not as parsed IDs: a table whose only row is malformed has already
    // reported that, and "no rules" on top of it would just be noise.
    problems.push(`${KERNEL_FILE}'s kernel table has a header but no rules. ${SHAPE}`)
  }
  return { ids, problems }
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
    const defs = new Map(definitionLines(lines).map((d) => [d.id, d]))
    for (const id of ids) {
      if (out.has(id)) continue
      const def = defs.get(id)
      if (!def) continue
      const i = def.i
      let body = def.rest
      for (let j = i + 1; j < lines.length && lines[j].trim() && !DEF_LINE_RE.test(lines[j]); j++) {
        body += ` ${lines[j].trim()}`
      }
      // Order matters. The `**` that closes a bolded ID has to go BEFORE flatten pairs
      // it with the next opening `**` in the sentence — otherwise `**[SCOPE-1]** — This
      // covers **command-shaped apps**` loses "This covers" instead of the emphasis.
      body = body
        .replace(classRe(), '')     // the enforcement class is its own column
        .replace(/`\{[^`]*\}`/g, '')  // and so is the ownership tag
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
  const { ids: kernel } = parseKernel(srcDir)
  const { profiles } = parseProfiles(srcDir)
  const { layers } = classifyRules({ rules, kernel, profiles })
  const count = (c) => [...rules.values()].filter((r) => r.cls === c).length
  const title = (rel) =>
    (fs.readFileSync(path.join(srcDir, rel), 'utf8').match(/^# (.+)$/m)?.[1] || rel).trim()

  // One row per ownership surface a project can be asked to load: the fixed layers, plus a
  // row per declared profile so "which profile?" is answerable without opening a document.
  // Declared-but-empty profiles and the zero-rule `language binding` layer are rendered
  // too — a layer with no rules is a fact worth stating, and stating it here keeps it from
  // being asserted in prose that nothing checks.
  const buckets = []
  for (const layer of LAYERS) {
    if (!layer.family) {
      buckets.push({ label: layer.label, key: layer.key, profile: null })
      continue
    }
    const declared = [...profiles.keys()].filter((t) => t.startsWith(`${layer.family}:`)).sort()
    if (!declared.length) buckets.push({ label: layer.label, key: layer.key, profile: null })
    for (const tag of declared) {
      buckets.push({ label: `${layer.label} · ${tag.split(':')[1]}`, key: layer.key, profile: tag })
    }
  }
  const members = (b) =>
    [...layers.entries()].filter(
      ([, l]) => l.key === b.key && (b.profile === null || `${b.key}:${l.profile}` === b.profile)
    )
  const tally = buckets.map((b) => {
    const ids = members(b)
    const cls = (c) => ids.filter(([id]) => rules.get(id).cls === c).length
    return { ...b, total: ids.length, auto: cls('auto'), review: cls('review'), guide: cls('guide') }
  })
  const sum = (rows, k) => rows.reduce((n, r) => n + r[k], 0)
  const universal = tally.filter((r) => r.key === 'kernel' || r.key === 'baseline')
  const optional = tally.filter((r) => OPTIONAL_KEYS.has(r.key))

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
    '## Ownership layers',
    '',
    ...wrap(
      'Every rule belongs to exactly one **ownership layer**: the narrowest surface that justifies ' +
        'it. This is a separate axis from the enforcement class — a rule is *both* ' +
        '`app profile · cli` *and* `[auto]`. Ownership answers *who has to load this rule*; the ' +
        'class answers *how it is checked*.'
    ),
    '',
    ...wrap(
      `**${sum(universal, 'total')} rules bind every Coral application** (${LAYERS[0].label} + ` +
        `${LAYERS[2].label}), of which ${sum(universal, 'review')} are \`[review]\`. The remaining ` +
        `${sum(optional, 'total')} are opt-in — ${sum(optional, 'review')} \`[review]\` — and load ` +
        'only with the profile that owns them, so a CLI with no runtime model never reads an ' +
        '`[AGENTIC-*]` rule and a library never reads an HTTP status code.'
    ),
    '',
    '| Layer | Rules | `[auto]` | `[review]` | `[guide]` | Loaded by |',
    '| --- | --- | --- | --- | --- | --- |',
    ...tally.map((r) => {
      const where = r.profile
        ? `projects with a \`${r.profile.split(':')[1]}\` ${r.key === 'app' ? 'app' : 'binding'}`
        : LOADED_BY[r.key]
      return `| ${r.label} | ${r.total} | ${r.auto} | ${r.review} | ${r.guide} | ${where} |`
    }),
    '',
    ...wrap(
      `**${LAYERS[0].label}** membership is read from the one table that records it, in ` +
        '[`CONVENTIONS.md`](./CONVENTIONS.md#the-coral-kernel), where each of the nine is mapped to ' +
        'the property it defends. Every other rule carries its layer as a `{tag}` on its own ' +
        'definition line, and the profiles those tags may name are registered in ' +
        '[`CONVENTIONS.md`](./CONVENTIONS.md#ownership-layers). Kernel membership answers *why Coral ' +
        'imposes a rule, and at what strength*; it does not mean the rule matters more, and no ' +
        'layer below it is optional once its profile is loaded.'
    ),
    '',
  ]

  for (const [rel, defs] of defsByFile) {
    out.push(
      `## ${title(rel)}`,
      '',
      `${defs.length} rule${defs.length === 1 ? '' : 's'} — [\`${rel}\`](./${rel})`,
      '',
      '| Rule | Class | Layer | Statement |',
      '| --- | --- | --- | --- |',
      ...defs.map(({ id, cls }) => {
        const s = (statements.get(id) || '').replace(/\|/g, '\\|')
        const l = layers.get(id)
        return `| \`[${id}]\` | \`[${cls}]\` | ${l ? layerLabel(l) : '?'} | ${s} |`
      }),
      ''
    )
  }
  return out.join('\n')
}

// ─────────────────────────────────────────────────────────────────────────────
// The rule parser, and the canonical rule model built on it. One definition, three
// consumers.
//
// .vitepress/config.mjs needs it to build the deep-link registry and to run the
// integrity checks; scripts/rules-index.mjs needs it to render rules.md;
// scripts/rules-lock.mjs needs it to write rules.lock. A second copy of this regex
// would drift, and a drifted parser fails silently — it simply stops recognising
// some rules as rules, which is the exact failure this file's checks exist to catch.
// So it lives here and is injected into all three.
//
// Two levels, and the split is deliberate. The low-level parsers — parseRules,
// parseLayers, parseKernel, parseProfiles, classifyRules — each read one thing and
// stay independently testable against fixtures. loadRuleModel() composes them into
// the object consumers actually hold: rules that carry their own resolved ownership
// scope, with no second lookup table beside them. See its own header for why.
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs'
import path from 'node:path'

import { coralVersion } from './version.mjs'

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
// Opening and closing are NOT the same shape, and treating them as one pattern is how a
// too-permissive parser lets an example escape. CommonMark, for the parts this relies on:
//
//   · a fence is 3+ backticks or 3+ tildes, indented at most three spaces;
//   · an OPENING fence may carry an info string — ```yaml — and for a backtick fence that
//     info string may not itself contain a backtick;
//   · a CLOSING fence carries nothing but spaces and tabs after the marker, and is the same
//     character and at least as long as the fence that opened the block.
//
// The last two are what make ```not-a-closing-fence an opener rather than a closer. A single
// pattern matching "3+ markers, anything after" closes there and reads every following line
// as document text again — which for a page of rule examples means inventing definitions.
//
// While a block is open only the closing shape is tested, so a nested ```yaml inside a
// ````-opened block is content, not a state change. CONVENTIONS.md's CORAL.md sample is
// exactly that, and a parser that toggles on any fence swallows every definition after it.
//
// NOT modelled: indented code blocks (four spaces, no fence). They need no handling here
// because DEF_LINE_RE anchors a definition at column 0, so a line inside one can never look
// like a definition in the first place — and a four-space-indented fence is not a fence.
const FENCE_OPEN_RE = /^ {0,3}(?:(`{3,})[^`]*|(~{3,}).*)$/
const FENCE_CLOSE_RE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/

/**
 * Every rule-definition line in a document, skipping fenced code blocks.
 *
 * @param {string[]} lines
 * @returns {Array<{i:number,id:string,rest:string,line:string}>}
 */
export function definitionLines(lines) {
  const out = []
  let fence = null // the marker that opened the current block, or null outside one
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (fence !== null) {
      const close = FENCE_CLOSE_RE.exec(line)
      if (close && close[1][0] === fence[0] && close[1].length >= fence.length) fence = null
      continue
    }
    const open = FENCE_OPEN_RE.exec(line)
    if (open) {
      fence = open[1] ?? open[2]
      continue
    }
    const m = DEF_LINE_RE.exec(line)
    if (m) out.push({ i, id: m[1], rest: m[2], line })
  }
  return out
}

// Factories, not shared instances — a stateful /g regex reused across callers is a
// bug waiting to happen.
export const useRe = () => new RegExp(String.raw`\`\[(${ID_CORE})\]\``, 'g')

// The spine is pinned first because the registry is first-definition-wins:
// precedence has to be stable and must not depend on directory order.
//
// The two architectural scales are named rather than spelled out at each use. Gate 6 needs
// them to check the one-way dependency, and rules.md needs them to say which baseline rules
// are stated for several apps composing rather than for one app — two readers, so one name.
export const APP_SPINE = 'ARCHITECTURE.md'
export const SYSTEM_SPINE = 'SYSTEM.md'
const SPINE = ['CONVENTIONS.md', APP_SPINE, SYSTEM_SPINE]
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
// The taxonomy is READ FROM CONVENTIONS.md, not hardcoded here. It used to be a constant,
// and that made two authorities for one fact: CONVENTIONS.md says it is authoritative for
// the ownership layers and prints a six-row table, while the parser carried its own copy
// plus a separate set of which layers are opt-in. Renaming a layer, adding a seventh, or
// changing one from opt-in to unconditional would have left every build check passing
// against the old vocabulary — the documentation/tooling drift the rule set exists to stop,
// committed by the rule set's own tooling.
//
// What is registered is only the ownership-layer taxonomy — six layers today, and the shape
// is open: a seventh is a row, not a code change. Membership stays where it was:
// kernel membership in `coral:kernel`, each non-kernel rule's layer inline on its own
// definition, and the concrete app/language profiles in `coral:profiles`.
//
// One thing is still anchored in code, and has to be: the row with no tag is the kernel
// layer, because its membership comes from a different source that the parser has to know
// by name. Everything else — label, key, tag, family, opt-in-ness, audience — is a doc fact.
export const LAYERS_START = '<!-- coral:layers:start -->'
export const LAYERS_END = '<!-- coral:layers:end -->'
export const LAYERS_FILE = 'CONVENTIONS.md'
const LAYER_COLUMNS = 7
// The stable machine identity of a layer, and the reason it is a COLUMN rather than
// something derived.
//
// A resolved scope is what every consumer switches on, so its identifier has to survive the
// two edits a taxonomy actually receives. Deriving it from the tag ties it to the tag —
// renaming `{governance}` to `{framework-governance}` would silently rename the kind, and a
// consumer keyed on the old one stops matching without any check noticing. Deriving it from
// the label ties it to presentation, so rewording `app profile` to `application profile`
// does the same. And the kernel layer has neither a tag nor a family to derive from.
//
// So the registry states it, and the parser validates it structurally: a code span holding
// one lowercase hyphen-separated token, unique across the table. `kernel`, `app-profile`,
// `runtime-agent-profile`. The set stays open — a seventh layer is a seventh row, and nothing
// here enumerates the valid ones. What IS pinned lives in the tests: the keys already
// published are held as a required subset, so an existing one cannot be renamed unnoticed
// while a new one still needs no code change.
//
// Matched whole, like the tag cell beside it, and for the same reason. Reading the cell as
// "strip the backticks, then check what is left" REPAIRS malformed syntax instead of
// refusing it: `` `app`-profile `` normalises to `app-profile` and is accepted, so the
// registry would quietly answer for a key nobody wrote. A registry that is the single source
// of an identifier must not have a shape in which the identifier can be invented for it.
const LAYER_KIND_CELL_RE = /^`([a-z][a-z0-9]*(?:-[a-z0-9]+)*)`$/
// The tagless row. Written as an em dash so a reader sees "this layer has no tag" rather
// than an empty cell that might be an omission.
const NO_TAG = '—'
// The two literal values the contract-scope column may take. `profile-scoped` means a
// contract listing one of these rules must say so; `unscoped` means it must not. Note what
// neither word claims: `unscoped` is not `universal`. Kernel, framework governance and
// production baseline are all unscoped and have three different audiences.
const SCOPE_WORDS = { unscoped: false, 'profile-scoped': true }

// The three top-level surfaces a layer can belong to. Unlike the layers themselves, THIS
// vocabulary is closed and lives in code, and the split is deliberate: the index writes a
// different sentence about each surface, so the generator has to know which is which, and a
// surface it could not write about would be a surface it silently omitted.
//
// Closing the set is what removes the drift the layers registry was added for. Renaming
// `{governance}` to `{framework-governance}` changes a TAG; the row still says `governance`
// in its Surface column, so the nine rules stay in the same group and no generated total
// silently empties. A typo in the column fails the build instead.
// Named rather than spelled inline, because two consumers outside this file switch on them:
// the contract-scope gate below, and the applicability resolver, which has to know which
// surface a project may adopt and which one is never audited against application source.
// A second copy of either string is a vocabulary that can drift from the closed set.
export const CONFORMANCE = 'conformance'
export const GOVERNANCE = 'governance'
// The one surface whose rules a project selects rather than inherits. Contract scope has to
// agree with it row by row — see the check in parseLayers().
export const OPT_IN = 'opt-in'
export const SURFACES = [CONFORMANCE, GOVERNANCE, OPT_IN]

// tag grammar: lowercase token, optionally `family:profile`  e.g. baseline, app:cli, lang:go
export const TAG_CORE = '[a-z][a-z0-9-]*(?::[a-z][a-z0-9-]*)?'
const TAG_RE = new RegExp(`^\\{(${TAG_CORE})\\}$`)
// A code span written in the SHAPE of a tag: one brace-delimited word, no spaces and no
// punctuation a tag could not contain. This is what makes a malformed tag an ERROR
// rather than an unrecognised span — `{App:CLI}` and `{app cli}` are caught, while the
// error taxonomy's `{category, code, message}` (commas, spaces) is correctly not a tag.
const TAG_SHAPED_RE = /^\{[A-Za-z0-9:_-]+\}$/
// A layer row's tag cell: `{baseline}` for a fixed layer, `{app:…}` for one that takes a
// profile identity. The ellipsis is literal — the family declares that its members name a
// profile, and which profiles exist is the other registry's business.
const LAYER_TAG_RE = /^`\{([a-z][a-z0-9-]*)(:…)?\}`$/

/**
 * @typedef {{label: string, kind: string, tag: string|null, family: string|null,
 *            surface: string, scoped: boolean, readBy: string, why: string}} Layer
 *
 * `kind` is the row's stable machine key; `label` is presentation text. They are separate
 * columns on purpose — see LAYER_KIND_CELL_RE.
 */

/**
 * @typedef {{kind: string, profile: string|null, tag: string|null, label: string,
 *            surface: string, contractScoped: boolean}} Scope
 *
 * A rule's resolved ownership, and the only representation of it a consumer needs. `kind`
 * identifies the layer, `profile` names which one within a layer that takes profiles, and
 * `tag` is what the definition line carries (null for a kernel rule, whose membership comes
 * from the kernel block instead).
 */

/** The one thing about the taxonomy that stays anchored in code: which row is the kernel's. */
export const kernelLayerOf = (taxonomy) => taxonomy.find((l) => l.tag === null && l.family === null)

/**
 * Rules per top-level surface — the partition the rule index's three subtotals rest on.
 *
 * Throws rather than returning a short count: a layer whose surface is not one of the three
 * would otherwise vanish from every total while its rules still appeared in the per-document
 * tables, which is precisely the silent gap this grouping exists to make impossible.
 *
 * @param {Map<string,{surface:string}>} scopes rule ID -> resolved scope
 * @returns {Map<string,string[]>} surface -> rule IDs
 */
export function groupBySurface(scopes) {
  const out = new Map(SURFACES.map((s) => [s, []]))
  for (const [id, scope] of scopes) {
    const bucket = out.get(scope.surface)
    if (!bucket) {
      throw new Error(
        `[${id}] has surface \`${scope.surface}\`, which is not one of ${SURFACES.join(', ')}`
      )
    }
    bucket.push(id)
  }
  return out
}

/**
 * Parse and validate the ownership-layer taxonomy in CONVENTIONS.md.
 *
 * Same posture as the kernel block and the profile registry, for the same reason: this is
 * the single source of what layers exist, so a row that silently fails to parse would
 * delete a layer while the page still reads correctly. Unrecognised line, duplicate label,
 * key or tag, a malformed key, wrong column count, a scope word that is neither of the two,
 * more or less than one tagless row — all errors, none skipped.
 *
 * @returns {{taxonomy: Layer[], problems: string[]}}
 */
export function parseLayers(srcDir) {
  const problems = []
  const taxonomy = []
  const abs = path.join(srcDir, LAYERS_FILE)
  if (!fs.existsSync(abs)) {
    problems.push(`${LAYERS_FILE} is missing — it is where the ownership taxonomy is defined.`)
    return { taxonomy, problems }
  }
  const text = fs.readFileSync(abs, 'utf8')
  const count = (marker) => text.split(marker).length - 1
  const starts = count(LAYERS_START)
  const ends = count(LAYERS_END)
  if (starts !== 1 || ends !== 1) {
    problems.push(
      `${LAYERS_FILE} must hold exactly one ${LAYERS_START} block (found ${starts} start marker(s)` +
        ` and ${ends} end marker(s)). Two taxonomies would leave one of them silently unread.`
    )
    return { taxonomy, problems }
  }
  const start = text.indexOf(LAYERS_START)
  const end = text.indexOf(LAYERS_END)
  if (end < start) {
    problems.push(`${LAYERS_FILE} has ${LAYERS_END} before ${LAYERS_START}.`)
    return { taxonomy, problems }
  }

  const SHAPE =
    'Each row is  | Layer | machine key | `{tag}` or — | surface | contract scope | read by |' +
    ' justified by |'
  const block = text.slice(start + LAYERS_START.length, end)
  const markerLine = text.slice(0, start).split('\n').length
  let header = false
  let delim = false

  block.split('\n').forEach((line, i) => {
    const at = `${LAYERS_FILE}:${markerLine + i}`
    const trimmed = line.trim()
    if (!trimmed) return
    if (!trimmed.startsWith('|')) {
      problems.push(
        `${at} is inside the ownership-layer registry but is not a table row. The block holds the` +
          ` registry and nothing else — prose belongs outside the markers. ${SHAPE}`
      )
      return
    }
    const cells = tableCells(trimmed)
    if (!header) {
      header = true
      if (!cells || cells.length !== LAYER_COLUMNS || cells.some((c) => !c.trim())) {
        problems.push(
          `${at}: the ownership-layer registry's header must have exactly ${LAYER_COLUMNS}` +
            ` non-empty columns, matching its rows. ${SHAPE}`
        )
      }
      return
    }
    if (!delim) {
      delim = true
      if (!cells || cells.length !== LAYER_COLUMNS || !cells.every((c) => DELIM_CELL_RE.test(c))) {
        problems.push(
          `${at}: expected the header delimiter row with exactly ${LAYER_COLUMNS} columns here.`
        )
      }
      return
    }
    if (!cells || cells.length !== LAYER_COLUMNS || cells.some((c) => !c.trim())) {
      problems.push(
        `${at} is a malformed layer row, so the layer it declares cannot be read. ${SHAPE}`
      )
      return
    }
    const [rawLabel, rawKind, rawTag, surface, rawScope, readBy, why] = cells.map((c) => c.trim())
    const label = rawLabel.replace(/\*\*/g, '')
    const kindCell = LAYER_KIND_CELL_RE.exec(rawKind)
    if (!kindCell) {
      problems.push(
        `${at}: ${rawKind} is not a layer key. The key is what every consumer switches a` +
          ' resolved scope on, so it is written as a code span holding one lowercase' +
          ' hyphen-separated token — ``kernel``, ``app-profile``, ``runtime-agent-profile`` —' +
          ' and not as the label, which is presentation text that may be reworded.'
      )
      return
    }
    const kind = kindCell[1]
    if (!SURFACES.includes(surface)) {
      problems.push(
        `${at}: \`${surface}\` is not a surface. A layer belongs to exactly one of` +
          ` ${SURFACES.map((x) => `\`${x}\``).join(', ')} — that column is what the rule index` +
          ' groups its three subtotals by, so an unrecognised value would drop the layer out of' +
          ' every total while its rules still appeared in the table.'
      )
      return
    }
    if (!(rawScope in SCOPE_WORDS)) {
      problems.push(
        `${at}: \`${rawScope}\` is not a contract-scope word. A layer is \`unscoped\` or` +
          ' `profile-scoped`, and nothing else — that column is what Gate 9 reads.'
      )
      return
    }
    // The two columns say different things and must not disagree about the one thing they
    // share. Surface is who the layer is for; contract scope is how that optionality is
    // written in a contract — but `opt-in | unscoped` would have rules.md call a layer
    // optional while Gate 9 accepted its rules as unconditional contract lines, which is the
    // loading contradiction the whole classification exists to remove. `conformance |
    // profile-scoped` is the mirror image: the index counts the rule in the base surface
    // while the contract tells a project it may decline it.
    if (SCOPE_WORDS[rawScope] !== (surface === OPT_IN)) {
      problems.push(
        `${at}: \`${surface}\` and \`${rawScope}\` contradict each other. An \`${OPT_IN}\` layer is` +
          ` \`profile-scoped\` and every other surface is \`unscoped\` — otherwise the rule index` +
          ' and the contract gate describe the same rule differently.'
      )
      return
    }
    let tag = null
    let family = null
    if (rawTag === NO_TAG) {
      // The layer whose membership comes from the kernel block rather than from a tag. The
      // parser has to know which ROW that is, and the em dash is how the row says so — the
      // key stays a doc fact like every other column.
      if (taxonomy.some((l) => l.tag === null && l.family === null)) {
        problems.push(
          `${at} is a second tagless layer. Exactly one layer takes its membership from` +
            ` ${KERNEL_FILE}'s kernel block; every other layer is named by a \`{tag}\`.`
        )
        return
      }
      // A tagless layer cannot be profile-scoped: `coral:scope:<tag>` needs a tag to name,
      // so the configuration is unreachable rather than merely unusual. Refuse it here
      // instead of letting Gate 9 meet a state it cannot describe.
      if (SCOPE_WORDS[rawScope]) {
        problems.push(
          `${at}: the tagless layer must be \`unscoped\`. Its members come from` +
            ` ${KERNEL_FILE}'s kernel block and carry no tag, so no \`coral:scope\` marker could` +
            ' name it — and by the same token it cannot be an `opt-in` surface.'
        )
        return
      }
    } else {
      const m = LAYER_TAG_RE.exec(rawTag)
      if (!m) {
        problems.push(
          `${at}: ${rawTag} is not a layer tag. Write a fixed layer as \`` +
            '`{baseline}`` and one that takes a profile identity as ``{app:…}`` — or ' +
            `\`${NO_TAG}\` for the layer read from the kernel block.`
        )
        return
      }
      if (m[2]) family = m[1]
      else tag = m[1]
    }
    // A family tag says "this layer has concrete profiles", and a profile is something a
    // project selects. Declaring one on a non-opt-in surface gives two incompatible answers:
    // the surface says the rules are in the base conformance set, while the profile registry
    // puts them in a document only a selecting project loads. The scope invariant above then
    // makes `profile-scoped` automatic.
    if (family && surface !== OPT_IN) {
      problems.push(
        `${at}: ${rawTag} declares a profile family, so its layer must be \`${OPT_IN}\` —` +
          ` \`${surface}\` says its rules apply before any profile is selected, while every` +
          ' profile it registers would live in a document only a selecting project reads.'
      )
      return
    }
    const identity = tag ?? family
    if (identity !== null && taxonomy.some((l) => (l.tag ?? l.family) === identity)) {
      problems.push(`${at} declares ${rawTag} twice. One row per ownership layer.`)
      return
    }
    // The key is the identifier consumers hold, so a duplicate is worse than a duplicate
    // tag: two layers would answer to one `scope.kind` and every consumer switching on it
    // would silently treat them as the same layer.
    if (taxonomy.some((l) => l.kind === kind)) {
      problems.push(
        `${at} declares the layer key \`${kind}\` twice. One row per key — two layers sharing` +
          ' one key are one layer to every consumer that switches on a resolved scope.'
      )
      return
    }
    if (taxonomy.some((l) => l.label === label)) {
      problems.push(`${at} declares the layer name \`${label}\` twice. One row per layer.`)
      return
    }
    taxonomy.push({
      label,
      kind,
      tag,
      family,
      surface,
      scoped: SCOPE_WORDS[rawScope],
      readBy,
      why,
    })
  })

  if (!header || !delim) {
    problems.push(
      `${LAYERS_FILE}'s ownership-layer registry is not a table. It must open with a header row` +
        ` and its delimiter. ${SHAPE}`
    )
  } else if (!taxonomy.length) {
    problems.push(`${LAYERS_FILE}'s ownership-layer registry has a header but no layers. ${SHAPE}`)
  } else if (!kernelLayerOf(taxonomy)) {
    problems.push(
      `${LAYERS_FILE}'s ownership-layer registry has no tagless row. One layer takes its members` +
        ` from ${KERNEL_FILE}'s kernel block rather than from an inline tag, and it is written` +
        ` with \`${NO_TAG}\` in the tag column.`
    )
  }
  return { taxonomy, problems }
}

// ─────────────────────────────────────────────────────────────────────────────
// Architectural scale — the second applicability axis.
//
// Ownership answers *who has to load a rule*. It does not finish the question, and
// PO-02 found the gap in the layer that spans both answers: the production baseline
// states `[STATE-5]` for one app in ARCHITECTURE.md and `[CHAN-1]` for several apps
// composing in SYSTEM.md. One ownership kind, two audiences. The runtime-agent layer
// has the same shape — `[AGENTIC-*]` is one app's business and `[ORCH-4..6]` is the
// system's — so a standalone CLI that adopts either layer must not thereby acquire
// topology rules for a topology it does not have.
//
// Scale is deliberately NOT a seventh ownership layer. Ownership says why a rule
// exists and how narrowly; scale says at what size it bites, and the two vary
// independently. What makes it derivable rather than a third tag on every definition
// line is that Coral already states scale structurally: a document is written at one
// scale, and every rule in it inherits that. So the registry below maps a document to
// a scale, one row per scale, with exactly one DEFAULT row — written `—`, the same
// idiom the kernel row uses in the ownership table — covering every document no other
// row claims.
//
// Read from CONVENTIONS.md for the same reason the layers are: a scale hardcoded here
// would be a second authority for a documented fact, and `rule.page === SYSTEM_SPINE`
// scattered across consumers is that second authority spelled out once per consumer.
// Every consumer reads `rule.scale`.
// ─────────────────────────────────────────────────────────────────────────────
export const SCALES_START = '<!-- coral:scales:start -->'
export const SCALES_END = '<!-- coral:scales:end -->'
export const SCALES_FILE = 'CONVENTIONS.md'
const SCALE_COLUMNS = 5
// Same grammar and the same whole-cell match as a layer key, for the same reason: a
// scale key is what a project's adoption declaration names, so it must not be
// repairable into a key nobody wrote.
const SCALE_KEY_CELL_RE = /^`([a-z][a-z0-9]*(?:-[a-z0-9]+)*)`$/
// The document a scale is stated in, as a code span. One document per row.
const SCALE_PAGE_CELL_RE = /^`([^`|]+)`$/
// The default row's document cell. An em dash so a reader sees "every other document"
// rather than an empty cell that might be an omission.
const NO_DOCUMENT = '—'

/**
 * @typedef {{label: string, key: string, page: string|null, readBy: string, why: string}} Scale
 *
 * `page` is the document whose rules are stated at this scale, or null for the one
 * DEFAULT row that covers every document no other row claims.
 */

/** The scale every unclaimed document falls to. Exactly one row is it. */
export const defaultScaleOf = (scales) => scales.find((s) => s.page === null)

/**
 * The scale a document's rules are stated at. Total by construction: a document either
 * has a row of its own or falls to the default one.
 *
 * @returns {string|undefined} the scale key, or undefined against an invalid registry
 */
export function scaleOfPage(page, scales) {
  return (scales.find((s) => s.page === page) ?? defaultScaleOf(scales))?.key
}

/**
 * Parse and validate the architectural-scale registry in CONVENTIONS.md.
 *
 * Same posture as the ownership taxonomy: an unrecognised line, a duplicate key, label
 * or document, a malformed key, the wrong column count, a document that does not exist,
 * or anything other than exactly one default row is an error. A registry that decides
 * applicability must not have a shape in which a scale can fall out unnoticed.
 *
 * @returns {{scales: Scale[], problems: string[]}}
 */
export function parseScales(srcDir) {
  const problems = []
  const scales = []
  const abs = path.join(srcDir, SCALES_FILE)
  if (!fs.existsSync(abs)) {
    problems.push(`${SCALES_FILE} is missing — it is where the scale registry is defined.`)
    return { scales, problems }
  }
  const text = fs.readFileSync(abs, 'utf8')
  const count = (marker) => text.split(marker).length - 1
  const starts = count(SCALES_START)
  const ends = count(SCALES_END)
  if (starts !== 1 || ends !== 1) {
    problems.push(
      `${SCALES_FILE} must hold exactly one ${SCALES_START} block (found ${starts} start marker(s)` +
        ` and ${ends} end marker(s)). Two registries would leave one of them silently unread.`
    )
    return { scales, problems }
  }
  const start = text.indexOf(SCALES_START)
  const end = text.indexOf(SCALES_END)
  if (end < start) {
    problems.push(`${SCALES_FILE} has ${SCALES_END} before ${SCALES_START}.`)
    return { scales, problems }
  }

  const SHAPE =
    'Each row is  | Scale | machine key | `document.md` or — | read by | justified by |'
  const block = text.slice(start + SCALES_START.length, end)
  const markerLine = text.slice(0, start).split('\n').length
  const known = new Set(docFiles(srcDir))
  let header = false
  let delim = false

  block.split('\n').forEach((line, i) => {
    const at = `${SCALES_FILE}:${markerLine + i}`
    const trimmed = line.trim()
    if (!trimmed) return
    if (!trimmed.startsWith('|')) {
      problems.push(
        `${at} is inside the scale registry but is not a table row. The block holds the registry` +
          ` and nothing else — prose belongs outside the markers. ${SHAPE}`
      )
      return
    }
    const cells = tableCells(trimmed)
    if (!header) {
      header = true
      if (!cells || cells.length !== SCALE_COLUMNS || cells.some((c) => !c.trim())) {
        problems.push(
          `${at}: the scale registry's header must have exactly ${SCALE_COLUMNS} non-empty` +
            ` columns, matching its rows. ${SHAPE}`
        )
      }
      return
    }
    if (!delim) {
      delim = true
      if (!cells || cells.length !== SCALE_COLUMNS || !cells.every((c) => DELIM_CELL_RE.test(c))) {
        problems.push(
          `${at}: expected the header delimiter row with exactly ${SCALE_COLUMNS} columns here.`
        )
      }
      return
    }
    if (!cells || cells.length !== SCALE_COLUMNS || cells.some((c) => !c.trim())) {
      problems.push(
        `${at} is a malformed scale row, so the scale it declares cannot be read. ${SHAPE}`
      )
      return
    }
    const [rawLabel, rawKey, rawPage, readBy, why] = cells.map((c) => c.trim())
    const label = rawLabel.replace(/\*\*/g, '')
    const keyCell = SCALE_KEY_CELL_RE.exec(rawKey)
    if (!keyCell) {
      problems.push(
        `${at}: ${rawKey} is not a scale key. A project's adoption declaration names scales by` +
          ' this key, so it is written as a code span holding one lowercase hyphen-separated' +
          ' token — ``app``, ``system`` — and not as the label, which is presentation text.'
      )
      return
    }
    const key = keyCell[1]
    let page = null
    if (rawPage === NO_DOCUMENT) {
      if (scales.some((s) => s.page === null)) {
        problems.push(
          `${at} is a second default scale. Exactly one row covers every document no other row` +
            ` claims, and it is written with \`${NO_DOCUMENT}\` in the document column —` +
            ' two of them would leave the scale of most rules undecidable.'
        )
        return
      }
    } else {
      const m = SCALE_PAGE_CELL_RE.exec(rawPage)
      if (!m) {
        problems.push(
          `${at}: ${rawPage} is not a document. Write the document a scale's rules are stated in` +
            ` as a code span — \`\`${SYSTEM_SPINE}\`\` — or \`${NO_DOCUMENT}\` for the default row.`
        )
        return
      }
      page = m[1]
      if (!known.has(page)) {
        problems.push(
          `${at} states scale \`${key}\` as living in \`${page}\`, which is not a document the` +
            ' rule registry reads.'
        )
        return
      }
      const claimed = scales.find((s) => s.page === page)
      if (claimed) {
        problems.push(
          `${at} claims \`${page}\` for scale \`${key}\`, which \`${claimed.key}\` already claims.` +
            ' A document is written at one scale, and every rule in it inherits that one.'
        )
        return
      }
    }
    if (scales.some((s) => s.key === key)) {
      problems.push(
        `${at} declares the scale key \`${key}\` twice. One row per key — two scales sharing one` +
          ' key are one scale to every consumer that switches on a resolved scale.'
      )
      return
    }
    if (scales.some((s) => s.label === label)) {
      problems.push(`${at} declares the scale name \`${label}\` twice. One row per scale.`)
      return
    }
    scales.push({ label, key, page, readBy, why })
  })

  if (!header || !delim) {
    problems.push(
      `${SCALES_FILE}'s scale registry is not a table. It must open with a header row and its` +
        ` delimiter. ${SHAPE}`
    )
  } else if (!scales.length) {
    problems.push(`${SCALES_FILE}'s scale registry has a header but no scales. ${SHAPE}`)
  } else if (!defaultScaleOf(scales)) {
    problems.push(
      `${SCALES_FILE}'s scale registry has no default row. One scale covers every document no` +
        ` other row claims, and it is written with \`${NO_DOCUMENT}\` in the document column.`
    )
  }
  return { scales, problems }
}

/**
 * Resolve an ownership tag against the taxonomy and the declared profiles.
 *
 * Returns the whole resolved scope, not a layer reference: the tag it was resolved from is
 * part of the answer, so a caller never has to staple it back on and never has to
 * reconstruct `family:profile` from the pieces.
 *
 * @returns {Scope|string} the scope, or an error sentence explaining why the tag is not one.
 */
export function resolveTag(tag, profiles, taxonomy) {
  const [head, profile] = tag.split(':')
  const familyLayer = taxonomy.find((l) => l.family === head)
  if (profile === undefined) {
    const layer = taxonomy.find((l) => l.tag === tag)
    if (layer) {
      return {
        kind: layer.kind,
        profile: null,
        tag,
        label: layer.label,
        surface: layer.surface,
        contractScoped: layer.scoped,
      }
    }
    if (familyLayer) {
      return (
        `\`{${tag}}\` names the ${familyLayer.label} layer without a profile. A ${familyLayer.label}` +
        ` rule must say WHICH one — \`{${head}:<profile>}\`.`
      )
    }
    return `\`{${tag}}\` is not an ownership layer. Use one of: ${tagVocabulary(profiles, taxonomy)}.`
  }
  if (!familyLayer) {
    return (
      `\`{${tag}}\` uses the profile form \`family:profile\`, but \`${head}\` is not a layer that takes` +
      ` a profile. Only these take one: ${families(taxonomy)}.`
    )
  }
  if (!profiles.has(tag)) {
    return (
      `\`{${tag}}\` is not a declared profile. Every profile is registered in ${PROFILES_FILE}'s` +
      ` ${PROFILES_START} block, which is what stops a typo becoming a silent new layer.`
    )
  }
  return {
    kind: familyLayer.kind,
    profile,
    tag,
    label: familyLayer.label,
    surface: familyLayer.surface,
    contractScoped: familyLayer.scoped,
  }
}

/** The `family:` prefixes a profile tag may use, for an error message that can be acted on. */
const families = (taxonomy) =>
  taxonomy.filter((l) => l.family).map((l) => `\`${l.family}:\``).join(', ')

/** The tags a rule may currently carry, for an error message that can be acted on. */
function tagVocabulary(profiles, taxonomy) {
  const fixed = taxonomy.filter((l) => l.tag).map((l) => `\`{${l.tag}}\``)
  const declared = [...profiles.keys()].sort().map((t) => `\`{${t}}\``)
  return [...fixed, ...declared].join(', ')
}

// ─────────────────────────────────────────────────────────────────────────────
// The metadata slot.
//
// A definition line is  ID -> enforcement class -> ownership tag -> the rule statement, and
// BOTH pieces of metadata sit in that slot rather than being tokens that may appear anywhere.
// The parser used to scan the WHOLE line for each, which quietly reserved two pieces of
// ordinary syntax. A rule saying "use `{id}` as the path placeholder", or naming the route
// /widgets/{id}, was read as carrying a second ownership tag. A rule saying "compare this
// with `[review]`" was read as carrying two enforcement classes — and, worse in the other
// direction, `**`[X-1]` `{base}`** — behaves like `[review]`.` was ACCEPTED, its class taken
// from its own prose. Rules are allowed to talk about braces and about enforcement classes.
//
// So the slot has an end. It runs from just after the ID through the whitespace and bold
// markers around the enforcement class and the ownership tag, and it closes at the first
// thing that is neither — which is where the statement begins. `{id}` after that point is
// content. `{id}` BEFORE that point is not: the slot is reserved, and a tag-shaped span
// there is metadata whether or not it was meant as any.
// ─────────────────────────────────────────────────────────────────────────────
// Whitespace and the `**` of a bolded ID or class — the only filler the slot allows.
const SLOT_FILLER_RE = /^[\s*]+/
const CODE_SPAN_RE = /^`([^`]*)`/
const CLASS_SPAN_RE = /^\[(?:auto|review|guide)\]$/
// A bare brace token, anchored: `/widgets/{id}` does not match, a leading `{id}` does.
const BARE_TAG_RE = /^\{[A-Za-z0-9:_-]+\}/

/**
 * Read the ownership tags out of a definition line's metadata slot.
 *
 * @param {string} rest the definition line after its rule-ID code span
 * @returns {{tags: string[], problems: string[]}} problems are sentences, un-prefixed
 */
export function parseDefinitionMetadata(rest) {
  const classes = []
  const tags = []
  const spans = [] // [start, end) of every metadata span, in document order
  const problems = []
  let at = 0
  let classAt = -1
  let tagAt = -1
  let seen = 0
  for (;;) {
    const filler = SLOT_FILLER_RE.exec(rest.slice(at))
    if (filler) at += filler[0].length
    const span = CODE_SPAN_RE.exec(rest.slice(at))
    if (!span) break
    const body = span[1]
    if (CLASS_SPAN_RE.test(body)) {
      if (classAt < 0) classAt = seen
      classes.push(body.slice(1, -1))
    } else if (TAG_SHAPED_RE.test(body)) {
      if (tagAt < 0) tagAt = seen
      const t = TAG_RE.exec(body)
      if (t) tags.push(t[1])
      else {
        problems.push(
          `carries \`${body}\`, which is written as an ownership tag but is not one. A tag is` +
            ' lowercase, with an optional single `family:profile` split — `{baseline}`, `{app:cli}`.'
        )
      }
    } else break // the statement opens with a code span
    spans.push([at, at + span[0].length])
    at += span[0].length
    seen++
  }
  // The slot is ordered — CONVENTIONS.md says ID → enforcement class → ownership tag → the
  // statement, and a parser looser than its own documented grammar is one more thing a reader
  // has to discover by experiment. Only flagged when both are present: a missing class is
  // reported by the caller and does not need saying twice.
  if (tagAt >= 0 && classAt >= 0 && tagAt < classAt) {
    problems.push(
      'carries its ownership tag before its enforcement class. The definition line reads' +
        ' ID → enforcement class → ownership tag → the statement.'
    )
  }
  // A tag outside its backticks renders as literal braces and is invisible to the parser, so
  // it fails rather than leaving a rule unclassified for a reader who can plainly see a
  // classification on the line. Only where the slot found no tag: once a rule is classified,
  // a brace token in its statement is the statement's business.
  if (!tags.length) {
    const bare = BARE_TAG_RE.exec(rest.slice(at))
    if (bare) {
      problems.push(
        `carries ${bare[0]} outside a code span. An ownership tag is written as` +
          ` \`${bare[0]}\` so it reads as a tag and parses as one.`
      )
    }
  }
  return { classes, tags, spans, end: at, problems }
}

/**
 * A definition line's `rest` with its metadata removed and nothing else.
 *
 * The generated index used to strip every class-shaped and brace-shaped code span anywhere
 * on the line, which deleted a rule's own words: a `[guide]` rule saying "compare this with
 * `[review]`" lost the comparison, and one explaining "use `{id}`" lost the placeholder.
 * Removing exactly the spans the slot consumed leaves the statement alone.
 */
export function stripDefinitionMetadata(rest) {
  const { spans } = parseDefinitionMetadata(rest)
  let out = rest
  for (const [start, end] of [...spans].reverse()) out = out.slice(0, start) + out.slice(end)
  return out
}

/** Human-readable form of a resolved scope: `app profile · cli`. Presentation only. */
export const scopeLabel = ({ label, profile }) => (profile ? `${label} · ${profile}` : label)

// ─────────────────────────────────────────────────────────────────────────────
// The profile registry — which app profiles and language bindings exist.
//
// Same posture as the kernel block: one table, in one document, parsed rather than
// duplicated. A profile is not just a name, it is a claim about where its rules live,
// so the registry records the home document and the build holds rules to it. That is
// the check that keeps an `{app:cli}` rule out of a broadly-loaded spine — the failure
// this whole classification exists to prevent.
//
// Which means the registry cannot be allowed to name a spine as a home. `| {app:cli} |
// ARCHITECTURE.md |` would satisfy every downstream check while doing exactly the thing
// the checks exist to stop: the rules would sit in a document every project reads, and the
// home check would bless it. The eligible homes are therefore the documents that are NOT
// broadly loaded — no spine, and nothing that defines no rules at all. Two profiles sharing
// a home is refused for the same reason one step weaker: loading either one exposes the
// other's rules, so the profiles are not separable in practice.
//
// This binds `app:` and `lang:` only, because they are the layers the registry holds. The
// fixed `runtime-agent` layer has no registry row and no dedicated-document requirement —
// `[ORCH-4..6]` deliberately stay in SYSTEM.md, where the guardrail does not depend on an
// ADDENDUM, and are made opt-in by contract scope instead.
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
 * @param {string} srcDir
 * @param {Layer[]} taxonomy the parsed ownership taxonomy; the families it declares are the
 *   only ones a row may name.
 * @returns {{profiles: Map<string,{home:string,covers:string}>, problems: string[]}}
 */
export function parseProfiles(srcDir, taxonomy) {
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
  // The pages a rule may be defined in, minus the spines. docFiles() rather than a fresh
  // directory walk, so "can define rules" means the same thing here as it does to the parser.
  const eligible = new Set(
    docFiles(srcDir).filter((rel) => !SPINE.includes(rel) && !DEFINES_NOTHING.has(rel))
  )
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
    const family = taxonomy.find((l) => l.family === tag.split(':')[0])
    if (family && family.surface !== OPT_IN) {
      // parseLayers() already refuses such a row, so this only fires for a taxonomy built
      // some other way. It is worth keeping: the registry is what turns a family into
      // selectable profiles, and it should not do that for a layer nobody selects.
      problems.push(
        `${at} registers a profile under \`${family.label}\`, whose surface is` +
          ` \`${family.surface}\` rather than \`${OPT_IN}\`. A profile is selected; a layer that` +
          ' is not opt-in has nothing to select.'
      )
      return
    }
    if (!tag.includes(':') || !family) {
      problems.push(
        `${at} declares \`{${tag}}\`, which is not a profile. Only the layers that take a profile` +
          ` identity are registered here: ${families(taxonomy)}.`
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
    if (SPINE.includes(home)) {
      problems.push(
        `${at} declares \`{${tag}}\`'s rules as living in \`${home}\`, which is a spine. A spine is` +
          ' loaded by every project that reads Coral at that scale, so rules kept there are read as' +
          ' binding whatever they are classified — naming one here would let the registry excuse the' +
          ' failure the home check exists to catch. A profile needs a document of its own.'
      )
      return
    }
    if (!eligible.has(home)) {
      problems.push(
        `${at} declares \`{${tag}}\`'s rules as living in \`${home}\`, which is not a document that` +
          ' can define rules. A profile home is one of the pages the rule registry reads.'
      )
      return
    }
    const claimed = [...profiles].find(([, p]) => p.home === home)
    if (claimed) {
      problems.push(
        `${at} declares \`{${tag}}\`'s rules as living in \`${home}\`, which \`{${claimed[0]}}\`` +
          ' already claims. Two profiles sharing a document are not separable: loading either one' +
          " exposes the other's rules, so selecting a profile stops meaning anything."
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
 * Resolve every published rule's one ownership scope.
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
 * A rule in a registered `app:` or `lang:` profile must additionally be defined in that
 * profile's own document — see parseProfiles() for why the registry cannot name a spine as
 * one. The fixed `runtime-agent` layer carries no such requirement.
 *
 * The low-level classifier. It returns the scopes keyed by rule ID rather than attaching
 * them, so it stays testable against a hand-built registry; loadRuleModel() is what turns
 * the result into the canonical rule objects consumers actually hold.
 *
 * `unresolved` is the rules it deliberately left without a scope, having said why. It is
 * returned rather than inferred so loadRuleModel() can tell "this rule failed, and here is
 * the sentence explaining it" from "this rule vanished and nobody noticed" — the second is
 * a bug in this function, and matching problem strings to find it would be a third parser.
 *
 * @returns {{scopes: Map<string,Scope>, unresolved: Set<string>, problems: string[]}}
 */
export function classifyRules({ rules, kernel, profiles, taxonomy }) {
  const problems = []
  const scopes = new Map()
  const unresolved = new Set()
  const kernelLayer = kernelLayerOf(taxonomy)
  if (kernel.size && !kernelLayer) {
    problems.push(
      `The ownership taxonomy declares no tagless layer, so the ${kernel.size} rule(s) in` +
        ` ${KERNEL_FILE}'s kernel block have no layer to belong to.`
    )
    // Nothing can be classified against a taxonomy with no kernel row, and the reason has
    // just been given once. Naming all of them again would be the same sentence per rule.
    for (const id of rules.keys()) unresolved.add(id)
    return { scopes, unresolved, problems }
  }
  // home document -> the profile tag that owns it, for the reverse check below.
  const owners = new Map([...profiles].map(([tag, p]) => [p.home, tag]))
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
        unresolved.add(id)
        continue
      }
      // From the row, never reconstructed. Rebuilding `label: 'kernel'` here is what put a
      // second representation of the layer back into the code the registry had just removed
      // it from: renaming the row would have moved the tally and left every kernel rule
      // still labelled with the old name.
      scopes.set(id, {
        kind: kernelLayer.kind,
        profile: null,
        tag: null,
        label: kernelLayer.label,
        surface: kernelLayer.surface,
        contractScoped: kernelLayer.scoped,
      })
      continue
    }
    if (rule.tags.length !== 1) {
      problems.push(
        `[${id}] ${at} carries ` +
          (rule.tags.length === 0 ? 'no ownership tag' : `${rule.tags.length} ownership tags`) +
          '; every rule outside the kernel needs exactly one on its definition line, after its' +
          ` enforcement class. Available: ${tagVocabulary(profiles, taxonomy)}.`
      )
      unresolved.add(id)
      continue
    }
    const resolved = resolveTag(rule.tags[0], profiles, taxonomy)
    if (typeof resolved === 'string') {
      problems.push(`[${id}] ${at}: ${resolved}`)
      unresolved.add(id)
      continue
    }
    // Registered `app:` / `lang:` profiles only. The registry guarantees their homes are not
    // spines, so "defined in its own document" means something; the fixed `runtime-agent`
    // layer has no registry row and no such requirement — [ORCH-4..6] stay in SYSTEM.md by
    // design and are made opt-in by contract scope instead.
    if (resolved.profile) {
      const home = profiles.get(rule.tags[0]).home
      if (rule.page !== home) {
        problems.push(
          `[${id}] is classified \`{${rule.tags[0]}}\` but is defined in ${rule.page}, while that` +
            ` profile's rules live in ${home}. A rule kept in a broadly-loaded document is read as` +
            ' binding however it is classified — move the rule, or reclassify it.'
        )
        unresolved.add(id)
        continue
      }
    }
    scopes.set(id, resolved)
  }

  // And the reverse. The check above keeps a profile rule out of a broadly-loaded document;
  // this keeps a broadly-loaded rule out of a profile's document, which is the same leak
  // running the other way. A `{baseline}` rule defined in appendix/cli.md is classified
  // correctly and still invisible to everyone who is not building a CLI — and because a
  // `[guide]` rule appears in no Agent Execution Contract, Gate 9 cannot see it either.
  //
  // Definitions only. Citing [BOUND-2] in appendix/cli.md is how an appendix is supposed to
  // refer to the spine; what is forbidden is DEFINING a rule there that is not the profile's.
  for (const [home, tag] of owners) {
    for (const [id, rule] of rules) {
      if (rule.page !== home || !scopes.has(id)) continue
      const scope = scopes.get(id)
      if (scope.tag === tag) continue
      problems.push(
        `[${id}] is defined in ${home}, which is \`{${tag}}\`'s document, but is classified` +
          ` \`${scopeLabel(scope)}\`. Only that profile's rules are defined there: a rule kept in a` +
          ' profile document is read only by projects that select the profile, whatever its layer' +
          ' says. Move the definition to a document its own layer is loaded from, or reclassify it.'
      )
    }
  }
  return { scopes, unresolved, problems }
}

// ─────────────────────────────────────────────────────────────────────────────
// The canonical rule model — one object per rule, ownership included.
//
// Before this existed, "a rule" meant `{page, line, cls, tags}` and its ownership lived in a
// parallel `Map<id, layer>` that every consumer rebuilt for itself: .vitepress/config.mjs,
// scripts/rules-index.mjs and serializeIndex() each called parseRules, parseLayers,
// parseKernel, parseProfiles and classifyRules in the same order, and serializeIndex() did
// it a second time on rules it had already been handed. Four copies of one composition, and
// the classification was only ever as single-sourced as the least careful of them.
//
// So the composition has one name. A rule that comes out of here carries its own resolved
// `scope`, and nothing downstream needs a second lookup to know what a rule belongs to.
//
// What it does NOT do is default. An unresolved scope is a problem in the returned list, and
// the rule simply has no `scope` — never a `production baseline` stand-in that would let a
// misclassified rule render as a correctly classified one.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse the documents into the canonical rule model.
 *
 * @param {string} srcDir
 * `version` is the model's IDENTITY, and it is the working version rather than the released
 * one — the rule set these documents describe, which between releases is not the same thing
 * as what `VERSION` holds. Everything that resolves a project's declared target compares
 * against it, so a model that could not identify itself would let a project be audited
 * against rules its target predates. See scripts/version.mjs.
 *
 * @returns {{rules: Map<string,{page:string,line:number,cls:string|undefined,
 *              tags:string[],scale:string|undefined,scope?:Scope}>,
 *            registry: Map<string,string>, defsByFile: Map<string,Array<{id:string,cls:string}>>,
 *            files: string[], taxonomy: Layer[], scales: Scale[], kernel: Set<string>,
 *            profiles: Map<string,{home:string,covers:string}>, version: string|null,
 *            classified: boolean, problems: string[]}}
 *
 * When `problems` is empty, every rule in `rules` has a `scope` and that scope has a `kind`,
 * every rule has a `scale` naming a registered one, and `version` identifies the model.
 */
export function loadRuleModel(srcDir) {
  const { registry, rules: raw, defsByFile, problems, files } = parseRules(srcDir)
  const { working: version, problems: versionProblems } = coralVersion(srcDir)
  const { taxonomy, problems: taxonomyProblems } = parseLayers(srcDir)
  const { scales, problems: scaleProblems } = parseScales(srcDir)
  const { ids: kernel, problems: kernelProblems } = parseKernel(srcDir, raw)
  const { profiles, problems: profileProblems } = parseProfiles(srcDir, taxonomy)
  const classify = { rules: raw, kernel, profiles, taxonomy }
  const { scopes, unresolved, problems: scopeProblems } = classifyRules(classify)
  const ownershipProblems = [
    ...taxonomyProblems,
    ...scaleProblems,
    ...kernelProblems,
    ...profileProblems,
    ...scopeProblems,
  ]
  // The identity is an ownership-grade fact: a model that cannot say which Coral it is
  // cannot be composed against, so it must not come back `classified`.
  ownershipProblems.push(...versionProblems)

  // Scale rides on the rule beside ownership, resolved once here. Every consumer reads
  // `rule.scale`; none of them repeats `rule.page === SYSTEM_SPINE`, which is the shape the
  // second authority took before the registry existed.
  const rules = new Map()
  for (const [id, rule] of raw) {
    const scope = scopes.get(id)
    const scale = scaleOfPage(rule.page, scales)
    rules.set(id, scope ? { ...rule, scale, scope } : { ...rule, scale })
  }

  // The invariant, asserted rather than assumed — and asserted unconditionally.
  //
  // classifyRules() names every rule it could not resolve, so a scopeless rule it did NOT
  // name means the two disagree: the model would hand a consumer `rule.scope === undefined`
  // with no sentence anywhere saying why, and the consumer would read the rule as belonging
  // nowhere. That is a bug in the classifier, and it is exactly as much a bug when some
  // unrelated citation elsewhere in the doc set also failed to parse — so this does not wait
  // for a clean `problems` list before looking. `unresolved` keeps it from restating a
  // failure classifyRules() has already explained for that rule.
  for (const [id, rule] of rules) {
    if (rule.scope?.kind || unresolved.has(id)) continue
    ownershipProblems.push(
      `[${id}] came out of the rule model with no resolved ownership scope, and nothing` +
        ' reported why. Every rule has exactly one scope or a problem explaining its absence.'
    )
  }
  const complete = [...rules.values()].every((r) => r.scope?.kind)

  // What `classified` claims: the ownership model is whole and every source it was built
  // from parsed clean. All four sources count, kernel membership included — a duplicated
  // kernel row can leave the membership SET intact, so every rule still resolves and the
  // classification still rests on a registry the build has refused. Gate 9 reads this, and a
  // flag that said "good enough" while one of its inputs was invalid would be a weaker claim
  // than its name makes.
  const classified = !ownershipProblems.length && complete
  problems.push(...ownershipProblems)
  return {
    rules,
    registry,
    defsByFile,
    files,
    taxonomy,
    scales,
    kernel,
    profiles,
    version,
    classified,
    problems,
  }
}

/**
 * The ownership groups, in taxonomy order: one per fixed layer, one per declared profile of
 * a layer that takes them.
 *
 * This is what both the rule index's layer tally and its by-scope section are built from, so
 * neither can group the rules differently from the other. A layer that takes profiles but has
 * none declared still yields a group — an empty layer is a fact worth printing, and printing
 * it here keeps it from being asserted in prose that nothing checks.
 *
 * @param {Map<string,{scope?:Scope}>} rules canonical rules
 * @param {Layer[]} taxonomy
 * @param {Map<string,unknown>} profiles the profile registry
 * @returns {Array<{kind:string,label:string,profile:string|null,tag:string|null,
 *                  surface:string,readBy:string,ids:string[]}>}
 */
export function groupByScope(rules, taxonomy, profiles) {
  const groups = []
  for (const layer of taxonomy) {
    const base = {
      kind: layer.kind,
      label: layer.label,
      surface: layer.surface,
      readBy: layer.readBy,
    }
    if (!layer.family) {
      groups.push({ ...base, profile: null, tag: layer.tag, ids: [] })
      continue
    }
    const declared = [...profiles.keys()].filter((t) => t.startsWith(`${layer.family}:`)).sort()
    if (!declared.length) groups.push({ ...base, profile: null, tag: null, ids: [] })
    for (const tag of declared) {
      groups.push({ ...base, profile: tag.split(':')[1], tag, ids: [] })
    }
  }
  for (const [id, rule] of rules) {
    const scope = rule.scope
    if (!scope) continue
    const group = groups.find((g) => g.kind === scope.kind && g.profile === scope.profile)
    if (!group) {
      throw new Error(
        `[${id}] resolves to scope \`${scopeLabel(scope)}\` (kind \`${scope.kind}\`), which no` +
          ` group in ${LAYERS_FILE}'s ${LAYERS_START} block covers.`
      )
    }
    group.ids.push(id)
  }
  return groups
}

// ─────────────────────────────────────────────────────────────────────────────
// Contract scope — an Agent Execution Contract says which of its rules are opt-in.
//
// Each contract claims to be the COMPLETE normative surface of its document, and an agent
// is invited to load only that. So a contract listing `[ORCH-4]` beside `[CHAN-1]` with no
// distinction tells the agent that runtime-agent orchestration binds every system, which
// is exactly the scope failure the ownership layers exist to name. Classifying the rule and
// leaving the contract flat would fix the label and not the loading.
//
// The distinction this gate needs is structural, and deliberately narrower than any claim
// about who loads what: a rule in an OPT-IN layer (an app profile, a language binding, the
// runtime-agent profile) must sit under a scope naming its own tag, and a rule in any other
// layer must not sit inside one. It says nothing about whether an unscoped rule binds every
// project — kernel, production baseline and framework governance have different audiences,
// and reasserting a single "universal" category here is the overclaim the layer definitions
// exist to avoid.
//
// The marker is `<!-- coral:scope:<tag> -->`, and it governs the contract lines after it
// until `<!-- coral:scope:end -->` or the close of the contract. Scopes do not nest and do
// not chain: opening one while another is open is an error rather than a silent switch,
// because the grammar says a scope runs until it is closed and a parser that quietly
// disagrees with its own documented grammar is how the next malformed contract gets read
// as a well-formed one.
// ─────────────────────────────────────────────────────────────────────────────
const SCOPE_RE = /^<!--\s*coral:scope:(\S+?)\s*-->$/
const SCOPE_END = 'end'

/**
 * @param {string} srcDir
 * @param {Map<string,{page:string,scope?:Scope}>} rules canonical rules — each carrying its
 *   own resolved scope. There is deliberately no second classification map to pass: one
 *   authority, read off the rule.
 */
export function checkContractScopes(srcDir, rules) {
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
        const tag = m[1]
        const emptyScope = () =>
          problems.push(
            `${rel}:${openedAt} opens contract scope \`{${scope}}\` but no contract line falls under` +
              ' it. A scope marker that governs nothing is a claim the contract does not make.'
          )
        if (tag === SCOPE_END) {
          if (!scope) problems.push(`${at} closes a contract scope that was never opened.`)
          else if (!used) emptyScope()
          scope = null
          return
        }
        if (scope) {
          // Reported, then treated as an implicit close, so the lines below are diagnosed
          // against the scope their author meant rather than cascading a second complaint.
          problems.push(
            `${at} opens contract scope \`{${tag}}\` while \`{${scope}}\` (opened at` +
              ` ${rel}:${openedAt}) is still open. Scopes do not nest and do not chain: close the` +
              ' first with `<!-- coral:scope:end -->` before opening another, so which rules a' +
              ' marker governs is readable without counting markers.'
          )
          if (!used) emptyScope()
        }
        const known = [...rules.values()].some((r) => r.scope?.tag === tag)
        if (!known) {
          problems.push(
            `${at} opens contract scope \`{${tag}}\`, which no rule is classified under. A scope` +
              ' marker names an ownership tag that is actually in use.'
          )
        }
        scope = tag
        used = false
        openedAt = markerLine + i
        return
      }
      const cite = CONTRACT_LINE_RE.exec(line)
      if (!cite) return
      const owner = rules.get(cite[1])?.scope
      if (!owner) return
      if (!owner.contractScoped) {
        if (scope) {
          problems.push(
            `[${cite[1]}] ${at} is \`${scopeLabel(owner)}\`, which is not a profile-scoped layer —` +
              ` but it sits inside opt-in contract scope \`{${scope}}\`, which says a project can` +
              ' decline it. Move it out of the scoped group.'
          )
        }
        return
      }
      used = true
      if (scope !== owner.tag) {
        problems.push(
          `[${cite[1]}] ${at} is \`${scopeLabel(owner)}\`, so it applies only where that profile is` +
            ' selected — but the contract lists it ' +
            (scope ? `under scope \`{${scope}}\`.` : 'unscoped.') +
            ` Put it under \`<!-- coral:scope:${owner.tag} -->\`, or the contract presents an` +
            ' opt-in rule as one that binds unconditionally.'
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

      // Both pieces of metadata come from the slot, never from the statement. A rule that
      // discusses `[review]` in its prose does not thereby carry two classes, and — the
      // direction that actually let something through — a rule with no class in its slot
      // cannot borrow one out of its own sentence.
      //
      // The ownership tag is collected here and JUDGED in classifyRules(), which is the only
      // place that knows whether this rule is in the kernel, and so whether a tag is required
      // or forbidden. What is judged here is legibility: a span written in the shape of a tag
      // but not spelled like one is an error, never a tag that quietly does not count.
      const meta = parseDefinitionMetadata(rest)
      const { classes, tags } = meta
      for (const p of meta.problems) problems.push(`[${id}] ${rel}:${i + 1} ${p}`)
      if (classes.length !== 1) {
        problems.push(
          `[${id}] ${rel}:${i + 1} carries ${classes.length === 0 ? 'no' : classes.length}` +
            ' enforcement class before its statement; CONVENTIONS.md requires exactly one of' +
            ' `[auto]` / `[review]` / `[guide]` in the metadata, next to the rule ID. One in the' +
            ' statement is prose.'
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
      let body = stripDefinitionMetadata(def.rest)
      for (let j = i + 1; j < lines.length && lines[j].trim() && !DEF_LINE_RE.test(lines[j]); j++) {
        body += ` ${lines[j].trim()}`
      }
      // Order matters. The `**` that closes a bolded ID has to go BEFORE flatten pairs
      // it with the next opening `**` in the sentence — otherwise `**[SCOPE-1]** — This
      // covers **command-shaped apps**` loses "This covers" instead of the emphasis.
      // Both the class and the tag are already gone — stripDefinitionMetadata() removed
      // exactly the slot's spans, so a `[review]` or a `{id}` in the statement survives.
      body = body
        .trimStart()
        .replace(/^\*\*/, '')       // closing marker of a bolded ID
        .replace(/^[\s—–:-]+/, '')  // the dash or colon that opens most definitions
      out.set(id, firstSentence(flatten(body)))
    }
  }
  return out
}

/**
 * Render the registry as the rules.md page. Owns the whole file — prose included.
 *
 * Takes the canonical model, and takes it whole. It used to take `(srcDir, rules, defsByFile)`
 * and then reparse the taxonomy, the kernel block and the profile registry to reclassify rules
 * its caller had already classified — a second composition of the same five parsers, one
 * function call away from the first. Every classification it prints now comes off the rule.
 *
 * @param {string} srcDir
 * @param {ReturnType<typeof loadRuleModel>} model
 */
export function serializeIndex(srcDir, model) {
  const { rules, defsByFile, taxonomy, scales, profiles } = model
  const statements = extractStatements(srcDir, rules)
  const kernelLayer = kernelLayerOf(taxonomy)
  const count = (c) => [...rules.values()].filter((r) => r.cls === c).length
  const title = (rel) =>
    (fs.readFileSync(path.join(srcDir, rel), 'utf8').match(/^# (.+)$/m)?.[1] || rel).trim()

  // One group per ownership surface a project can be asked to load: the fixed layers, plus a
  // group per declared profile so "which profile?" is answerable without opening a document.
  // Declared-but-empty profiles and the zero-rule `language binding` layer are rendered
  // too — a layer with no rules is a fact worth stating, and stating it here keeps it from
  // being asserted in prose that nothing checks.
  //
  // The same groups feed the tally below and the by-scope section further down, so the two
  // cannot disagree about which rules are in a layer.
  const groups = groupByScope(rules, taxonomy, profiles)
  const tally = groups.map((g) => {
    const cls = (c) => g.ids.filter((id) => rules.get(id).cls === c).length
    return {
      ...g,
      label: scopeLabel({ label: g.label, profile: g.profile }),
      total: g.ids.length,
      auto: cls('auto'),
      review: cls('review'),
      guide: cls('guide'),
    }
  })
  const sum = (rows, k) => rows.reduce((n, r) => n + r[k], 0)
  // Three audiences, not one stack. `conformance` is what a codebase is audited against;
  // `governance` binds whoever decides how the project relates to Coral and constrains no
  // source code; `optional` loads with a profile. They partition the rule set, so the three
  // subtotals in the prose below reconcile to rules.size by construction rather than by a
  // number someone kept up to date.
  const [conformance, governance, optional] = SURFACES.map((s) =>
    tally.filter((r) => r.surface === s)
  )
  // Asserted, not assumed. "The three subtotals partition the rule set" is a claim the
  // generated prose makes in so many words, and the only way it can fail is a layer whose
  // rules reach the per-document tables while its surface reaches no group — exactly the
  // shape of the drift this registry exists to prevent, so it must not be able to render.
  const grouped = sum(conformance, 'total') + sum(governance, 'total') + sum(optional, 'total')
  if (grouped !== rules.size) {
    throw new Error(
      `[coral] the ownership surfaces cover ${grouped} of ${rules.size} rules. Every layer in` +
        ` ${LAYERS_FILE}'s ${LAYERS_START} block must name one of: ${SURFACES.join(', ')}.`
    )
  }
  // The second applicability axis, read off the rule rather than recomputed from its page.
  // An adopted layer contributes only its rules at the scales a project declares, so the
  // per-scale totals are part of "how much of Coral applies to me" and not a footnote:
  // the production baseline is the baseline for ONE APP in ARCHITECTURE.md and the baseline
  // for SEVERAL APPS COMPOSING in SYSTEM.md, and most projects want only the first.
  const byScale = scales.map((sc) => ({
    ...sc,
    ids: [...rules].filter(([, r]) => r.scale === sc.key).map(([id]) => id),
  }))
  const scaleCovered = byScale.reduce((n, sc) => n + sc.ids.length, 0)
  if (scaleCovered !== rules.size) {
    throw new Error(
      `[coral] the scale registry covers ${scaleCovered} of ${rules.size} rules. Every document` +
        ` either has a row in ${SCALES_FILE}'s ${SCALES_START} block or falls to the default one.`
    )
  }

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
      'They answer to three audiences rather than stacking into one number. ' +
        `**${sum(conformance, 'total')} form the conformance surface** — ` +
        `${conformance.map((r) => r.label).join(' plus ')} — the rules that apply without a project ` +
        `deciding anything, ${sum(conformance, 'review')} of them \`[review]\`. ` +
        `**${sum(governance, 'total')} govern Coral itself** and sit outside that surface ` +
        'entirely: no application source code satisfies or violates them. Coral-aware humans, ' +
        'agents and tooling read them when interpreting a rule, consulting the adherence ' +
        'record, or changing how a project relates to Coral. The other ' +
        `**${sum(optional, 'total')} are opt-in** — ${sum(optional, 'review')} \`[review]\` — and ` +
        "reach a project only where its `CORAL.md` adopts the layer they belong to, so a CLI that " +
        'has not adopted the runtime-agent profile never reads an `[AGENTIC-*]` rule and a library ' +
        'never reads an HTTP status code.'
    ),
    '',
    ...wrap(
      '**Opt-in is the normal case, and the production baseline is opt-in too.** Coral publishes it ' +
        'for every codebase that wants it, and a project still says so: a rule becomes applicable ' +
        "through kernel membership or through the project's own declaration, and never because it " +
        'exists in the Coral repository (`[VER-6]`). How a project declares what it adopts, and how ' +
        'the set is composed from that, is in ' +
        '[`CONVENTIONS.md`](./CONVENTIONS.md#what-applies-to-a-project).'
    ),
    '',
    '| Layer | Rules | `[auto]` | `[review]` | `[guide]` | Loaded by |',
    '| --- | --- | --- | --- | --- | --- |',
    ...tally.map((r) => {
      // The layer's own `Read by`, profile rows included. Synthesising "projects with a `cli`
      // app" needed the code to know that `app:` means an app and everything else is a
      // language binding — a taxonomy fact the registry is supposed to own. The Layer column
      // already carries which profile it is, so nothing is lost by asking the row.
      const where = r.readBy
      return `| ${r.label} | ${r.total} | ${r.auto} | ${r.review} | ${r.guide} | ${where} |`
    }),
    '',
    ...wrap(
      `**${kernelLayer.label}** membership is read from the one table that records it, in ` +
        '[`CONVENTIONS.md`](./CONVENTIONS.md#the-coral-kernel), where each member is mapped to ' +
        'the property it defends. Every other rule carries its layer as a `{tag}` on its own ' +
        'definition line, and the profiles those tags may name are registered in ' +
        '[`CONVENTIONS.md`](./CONVENTIONS.md#ownership-layers). Kernel membership answers *why Coral ' +
        'imposes a rule, and at what strength*; it does not mean the rule matters more, and an ' +
        'adopted layer binds exactly as hard as the kernel does.'
    ),
    '',
    '## Scale',
    '',
    ...wrap(
      'Ownership does not finish the applicability question. A rule is also stated at one ' +
        '**architectural scale**, and an adopted layer contributes only its rules at the scales a ' +
        'project declares. The production baseline is where this bites: it is the baseline for ' +
        '**one app** and, separately, the baseline for **several apps composing**, and a repository ' +
        'that ships one app has no channel to version and no topology to wire. The runtime-agent ' +
        'profile splits the same way.'
    ),
    '',
    ...wrap(
      'Scale is derived from the document a rule is stated in — one row per scale in ' +
        `[\`${SCALES_FILE}\`](./${SCALES_FILE}#architectural-scale), plus a default that covers ` +
        'every other document — so it is a fact about where the rule lives rather than a third ' +
        'marker on its definition line. Kernel rules are not narrowed by scale: they bind without ' +
        'a decision, so a scale declaration cannot decline them.'
    ),
    '',
    '| Scale | Rules | Stated in | Read by |',
    '| --- | --- | --- | --- |',
    ...byScale.map(
      (sc) =>
        `| ${sc.key} | ${sc.ids.length} | ${sc.page ? `[\`${sc.page}\`](./${sc.page})` : 'every other document'} | ${sc.readBy} |`
    ),
    '',
  ]

  // ── Rules by scope ─────────────────────────────────────────────────────────
  //
  // The tables further down are grouped by DEFINING DOCUMENT, which answers "what is in
  // ARCHITECTURE.md" and not "which ownership layer owns this rule" — and the second is the
  // question ownership was introduced to answer. So the same rules are listed once more,
  // grouped the other way: one section per layer, in taxonomy order, with a subsection per
  // profile where the layer takes one.
  //
  // What this grouping is NOT is the load set. Ownership is one applicability axis, and the
  // production baseline carries a second: its ARCHITECTURE.md rules are app-scale and its
  // SYSTEM.md rules are system-scale, so a one-app repository loads part of that group and
  // not the rest. CONVENTIONS.md says so, the prose above says so, and this section must not
  // say otherwise — a view that presents itself as the complete answer to "what do I load"
  // would overclaim in exactly the direction the layer definitions were written to avoid.
  //
  // Compact on purpose — ID, class and defining document, no statements. The statement is
  // one scroll away in the per-document table and one click away in the document itself, and
  // repeating 178 of them would make the page a second copy of itself.
  //
  // Headings carry the machine key rather than the label, because that is the value a
  // consumer of the model switches on and this is the page that has to make it findable.
  const seen = new Set()
  for (const g of groups) {
    for (const id of g.ids) {
      if (seen.has(id)) {
        throw new Error(`[coral] [${id}] appears in more than one ownership group.`)
      }
      seen.add(id)
    }
  }
  if (seen.size !== rules.size) {
    throw new Error(
      `[coral] the ownership groups cover ${seen.size} of ${rules.size} rules. Every rule resolves` +
        ' to exactly one scope, so every rule belongs to exactly one group.'
    )
  }

  out.push(
    '## Rules by scope',
    '',
    ...wrap(
      'The same rules, grouped by the ownership layer that owns them rather than by the document ' +
        "that states them. Each heading is the layer's **key**, the stable identifier the tooling " +
        'resolves every rule to; the human name is in the [table above](#ownership-layers). ' +
        'Statements are in the per-document tables below, and the reasoning is in the document ' +
        'itself.'
    ),
    '',
    ...wrap(
      '**Ownership is one applicability axis, not the whole load decision.** A group here says ' +
        'which layer or profile a rule belongs to, and nothing more. Two things narrow it further: ' +
        'a layer applies only where the project has **adopted** it, and an adopted layer ' +
        'contributes only its rules at the **scales** the project declares — which is why the ' +
        'Scale column is in every table below. A one-app repository that adopts the production ' +
        'baseline takes the app-scale part of that group and not the rest.'
    ),
    ''
  )
  const scopeTable = (ids) => [
    '| Rule | Class | Scale | Defined in |',
    '| --- | --- | --- | --- |',
    ...[...ids]
      .sort((a, b) => a.localeCompare(b))
      .map((id) => {
        const { cls, page, scale } = rules.get(id)
        return `| \`[${id}]\` | \`[${cls}]\` | ${scale} | [\`${page}\`](./${page}) |`
      }),
    '',
  ]
  const plural = (n) => `${n} rule${n === 1 ? '' : 's'}`
  // Grouped by kind so a layer that takes profiles gets one heading with a subsection per
  // profile, rather than one flat heading per profile. Taxonomy order throughout: the
  // registry decides what the sections are and in what order they appear.
  for (const kind of [...new Set(groups.map((g) => g.kind))]) {
    const mine = groups.filter((g) => g.kind === kind)
    out.push(`### ${kind}`, '')
    // One group for the kind means either a fixed layer or a profile family with nothing
    // registered under it yet — `language binding` is the second, and its honest zero is
    // printed rather than left to prose.
    if (mine.length === 1 && mine[0].profile === null) {
      out.push(`${plural(mine[0].ids.length)} — ${mine[0].label}.`, '')
      if (mine[0].ids.length) out.push(...scopeTable(mine[0].ids))
      continue
    }
    out.push(
      `${plural(mine.reduce((n, g) => n + g.ids.length, 0))} — ${mine[0].label}, by profile.`,
      ''
    )
    for (const g of mine) {
      out.push(`#### ${g.profile}`, '', `${plural(g.ids.length)} — \`{${g.tag}}\`.`, '')
      if (g.ids.length) out.push(...scopeTable(g.ids))
    }
  }

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
        const scope = rules.get(id)?.scope
        return `| \`[${id}]\` | \`[${cls}]\` | ${scope ? scopeLabel(scope) : '?'} | ${s} |`
      }),
      ''
    )
  }
  return out.join('\n')
}

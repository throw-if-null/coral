// ─────────────────────────────────────────────────────────────────────────────
// The project execution contract — one generated Markdown file holding the whole
// normative Coral surface of one project.
//
// The problem it solves is a loading problem. Coral's normative content is spread over
// `CONVENTIONS.md`, `ARCHITECTURE.md`, `SYSTEM.md`, an appendix per profile and a
// generated rule index, and *most of it does not apply to any given project*: a CLI is
// not the audience for browser rules, a one-app repository is not the audience for
// system-scale rules, and nobody is the audience for framework governance. An agent
// handed the repository has to work out which of that surface binds it, every session,
// from prose — and `[VER-6]` exists because that inference was being made by whoever
// happened to be reading. This file is the answer written down: the agent loads one
// generated document and needs no other.
//
// **It is a serialization layer and nothing else.** Every applicability decision was
// already made upstream and is read, not re-derived:
//
//   · `loadRuleModel()`            — what Coral publishes, and each rule's class
//   · `resolveAdherence()`         — the project's declaration, resolved
//   · `resolution.selected`        — which Coral rules apply, after version, ownership
//                                    and scale selection
//   · `resolution.exceptions`      — accepted path-scoped decisions
//   · `resolution.extensions`      — project-local rules
//   · `extractStatements()`        — the canonical one-line statement of a rule
//
// Nothing below inspects `{app:*}`, `{lang:*}`, `{baseline}`, a contract scope marker, a
// document name or the profile registry. A second implementation of the selection rules
// is a second answer to "what applies here", and two answers is the failure the whole
// applicability pass was written to end. If this file ever needs to know what a profile
// is, the fix is upstream.
//
// One filter IS applied here, deliberately. `resolution.selected` answers *applicable*,
// which is not the same question as *normative*: a `[guide]` rule can be applicable and
// is still rationale rather than instruction — it appears in no Agent Execution
// Contract and is never reported as a violation. An execution contract carries
// instructions, so guides are filtered out, using the rule model's own definition of
// normative (`isNormative`) rather than a class list spelled out again here.
//
// Two shapes the output deliberately does NOT have:
//
//   · **no per-path contract.** Generating a complete rule set per source path would
//     duplicate ~150 rules per exception and grow the file with every decision. The
//     common set is stated once and the path-local deltas are separate sections.
//   · **no empty sections.** There is no "Backend: not selected" and no "Language
//     bindings: none". A profile the project did not adopt leaves no trace at all —
//     absence is the whole point, and a line naming an unselected profile is a rule
//     surface arriving through a heading.
//
// And it is fail-closed in the same shape the resolver is: an invalid input yields a
// result carrying no `markdown` field at all, so a partial contract is not something a
// caller can reach by forgetting a check. That shape stops at the return value, which is
// only half of fail-closed once a file exists — see the publishing section at the bottom
// for the other half: a failed regeneration discards the stale contract, and a successful
// one is published by rename rather than by truncating the destination.
// ─────────────────────────────────────────────────────────────────────────────
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { ADHERENCE_FILE, ROOT_PATH, loadApplicability } from './applicability.mjs'
import { extractStatements, isNormative, loadRuleModel } from './rules.mjs'

/** The file a consuming project generates into its root. */
export const CONTRACT_FILE = 'CORAL-CONTRACT.md'

/** The first line of every generated contract — the human's title. */
export const CONTRACT_HEADING = '# Coral project execution contract'

/**
 * The second line: the machine's proof that this generator wrote the file.
 *
 * A heading is not provenance. `--out` names an arbitrary destination, and a document a
 * human wrote may perfectly reasonably open `# Coral project execution contract` — a note
 * about one, a draft, a copy pasted for review. Deleting that file because a later
 * generation failed is data loss committed in the name of a safety property.
 *
 * So the identity is an explicit marker in Coral's own `coral:` namespace, and
 * writeExecutionContract() requires the exact preamble — heading AND marker, in order —
 * before it will remove anything. PO-05 is unreleased, so there is no earlier
 * marker-less generated format to keep supporting.
 */
export const CONTRACT_MARKER = '<!-- coral:generated-execution-contract -->'

/**
 * The exact opening this generator emits. Output is always LF, which is what keeps it
 * byte-identical run to run; RECOGNISING output is a looser question — see
 * isGeneratedContract().
 */
export const CONTRACT_PREAMBLE = `${CONTRACT_HEADING}\n${CONTRACT_MARKER}`

/** A line without its carriage return, if it has one. */
const withoutCR = (line) => (line?.endsWith('\r') ? line.slice(0, -1) : line)

/**
 * Was this text written by this generator?
 *
 * The identity is the first two LOGICAL lines — heading, then marker — and the comparison
 * is deliberately tolerant of line endings while the output itself is not. The contract
 * is documented as belonging in version control, and a repository configured for CRLF
 * checks it out with `\r\n`: byte-comparing the preamble would then stop recognising the
 * generator's own file, and the stale-contract bug this marker exists to close would come
 * straight back through `core.autocrlf`.
 *
 * Position matters as much as presence. A human's document that merely mentions the marker
 * in its prose is not a generated contract, so this is not a substring search.
 */
export function isGeneratedContract(text) {
  if (typeof text !== 'string') return false
  const [first, second] = text.split('\n', 2)
  return withoutCR(first) === CONTRACT_HEADING && withoutCR(second) === CONTRACT_MARKER
}

/** The npm script a project runs, quoted in the generated header so the file says how to redo it. */
export const GENERATE_COMMAND = 'npm run contract:generate'

// The decision fields an exception may carry, in the order they are rendered, with the
// label each gets. Only these, and only when present: the record's own vocabulary is
// `[VER-5]`'s, and inventing a missing `decided_by` would fabricate an approval.
//
// `upstream` is deliberately absent. It is a disposition toward *Coral* — whether the
// deviation is amendment material — and says nothing to an agent working in the
// project. The contract carries what changes execution.
const DECISION_FIELDS = [
  ['reason', 'Reason'],
  ['decided_by', 'Decided by'],
  ['decided', 'Decided'],
  ['revisit_when', 'Revisit when'],
]

// ─────────────────────────────────────────────────────────────────────────────
// Ordering.
//
// Every list is sorted by content, never by the order the declaration happened to be
// written in: the same model and the same `CORAL.md` must produce the same bytes, and a
// key reordering in the YAML is not a change to the contract.
//
// Rule IDs sort by FAMILY then by NUMBER, numerically. Plain string order puts
// `MODEL-10` between `MODEL-1` and `MODEL-2`, which is a deterministic order and a
// misleading one to read.
// ─────────────────────────────────────────────────────────────────────────────
const ID_PARTS_RE = /^(.*)-(\d+)$/

/** `MODEL-10` -> `['MODEL', 10]`. An ID that does not split sorts on the whole string. */
const idKey = (id) => {
  const m = ID_PARTS_RE.exec(id)
  return m ? [m[1], Number(m[2])] : [id, 0]
}

export function compareRuleIds(a, b) {
  const [fa, na] = idKey(a)
  const [fb, nb] = idKey(b)
  if (fa !== fb) return fa < fb ? -1 : 1
  if (na !== nb) return na - nb
  return 0
}

/**
 * Path, then rule ID, then the rendered block itself — a TOTAL order over what is emitted.
 *
 * The first two keys are the ones a reader scans by. They are not enough on their own:
 * PO-04 accepts two exceptions naming the same rule at the same path with different
 * decision metadata, and those compare equal on `(path, rule)`. A stable sort would then
 * keep them in the order the YAML happened to list them, and reversing two entries whose
 * decisions are unchanged would change the generated bytes — which is precisely the
 * guarantee this file makes. Comparing the rendered lines closes it: entries that render
 * differently have a defined order, and entries that render identically produce identical
 * bytes whichever way they fall.
 *
 * This is output ordering and nothing else. No entry outranks another, and nothing here
 * suppresses anything — precedence between records is a thing PO-04 deliberately does not
 * have, and it is not being introduced by a sort.
 */
const compareRendered = (a, b) => {
  if (a.path !== b.path) return a.path < b.path ? -1 : 1
  const byId = compareRuleIds(a.rule, b.rule)
  if (byId) return byId
  const [ta, tb] = [a.lines.join('\n'), b.lines.join('\n')]
  return ta === tb ? 0 : ta < tb ? -1 : 1
}

// ─────────────────────────────────────────────────────────────────────────────
// Rendering.
//
// Every string below that came out of a `CORAL.md` goes through one of two helpers, and
// none of them is interpolated raw. The reason is a property this file has to hold for
// EVERY record the resolver accepts, not just the tidy ones: the generated document's
// structure is the generator's, never the project's.
//
// `[VER-5]` puts no grammar on a `reason` or a `statement`, and YAML block scalars make a
// multi-line value ordinary. Interpolated raw, this is a valid extension:
//
//     statement: |
//       Every invoice records its tenant.
//       ## Accepted exceptions
//
// and its second line lands at column zero in the output — a heading that invents a
// section, in a file whose whole purpose is to be the one thing an agent trusts.
// ─────────────────────────────────────────────────────────────────────────────

// Characters that can open a Markdown block when they lead a line: ATX headings, list
// bullets, blockquotes, thematic breaks, fences, setext underlines, GFM table rows.
const BLOCK_OPENER_RE = /^[#>+*\-_~=|`]/
// `1.` / `1)` — an ordered-list marker. The escape goes on the PUNCTUATION, not the digit:
// a backslash before a digit is a literal backslash, since digits are not escapable.
const ORDERED_MARKER_RE = /^(\d{1,9})([.)])/

/**
 * A project-authored value as one line of Markdown that cannot open a block.
 *
 * Two steps, and both are needed. Whitespace is collapsed, so the value occupies exactly
 * the line it was rendered onto and no continuation line can escape the entry it belongs
 * to. Then a leading block-opener is backslash-escaped, so a value that *starts* with
 * `## ` or `- ` is text rather than structure.
 *
 * Collapsing is a deliberate single-line representation, not a truncation: every word
 * survives. It is also how Coral states every other rule — `extractStatements()` flattens
 * the canonical statements the same way — and `CONVENTIONS.md` already says the block's
 * fields are the record while the prose below it carries the long form.
 */
export function inlineText(value) {
  const flat = String(value).replace(/\s+/g, ' ').trim()
  if (!flat) return flat
  const ordered = ORDERED_MARKER_RE.exec(flat)
  if (ordered) return `${ordered[1]}\\${ordered[2]}${flat.slice(ordered[0].length)}`
  return BLOCK_OPENER_RE.test(flat) ? `\\${flat}` : flat
}

/**
 * A value as a Markdown code span, whatever backticks it contains.
 *
 * CommonMark closes a code span with a backtick run of exactly the opening length, so the
 * fence is one longer than the longest run inside — and content that begins or ends with a
 * backtick is padded, or the parser reads that backtick as part of the delimiter.
 *
 * This matters for paths and not in theory: `[VER-5]`'s path grammar refuses globs,
 * absolute paths and `..` segments, and a backtick is an ordinary character in a POSIX
 * directory name. The generator renders what the resolver accepts.
 */
export function inlineCode(value) {
  const s = String(value)
  const longest = Math.max(0, ...[...s.matchAll(/`+/g)].map((m) => m[0].length))
  const fence = '`'.repeat(longest + 1)
  const pad = s.startsWith('`') || s.endsWith('`') || (s.startsWith(' ') && s.endsWith(' ')) ? ' ' : ''
  return `${fence}${pad}${s}${pad}${fence}`
}

/**
 * How a path reads in the contract.
 *
 * Subtrees, not globs — `[VER-5]` paths are directories that cover themselves and
 * everything beneath them, and PO-04 refuses glob syntax outright. Writing `internal/**`
 * here would show the reader a pattern language the record does not have.
 */
const pathPhrase = (p) => (p === ROOT_PATH ? 'the whole repository' : `${inlineCode(p)} and descendants`)

/** One contract line, in the shape every Agent Execution Contract in Coral already uses. */
const ruleLine = (id, statement) => `- \`[${id}]\` ${statement}`

/**
 * One accepted exception, as the lines it occupies plus the keys it sorts by.
 *
 * Rendered as a unit so the sort can use the rendered text as its last key, and so every
 * project-authored value passes through inlineText() exactly once, here.
 */
function exceptionBlock(entry) {
  const lines = [`- \`[${entry.rule}]\` — ${pathPhrase(entry.path)}`]
  for (const [field, label] of DECISION_FIELDS) {
    const value = entry[field]
    if (value === undefined || value === null) continue
    const text = inlineText(value)
    if (!text) continue
    lines.push(`  - ${label}: ${text}`)
  }
  return { path: entry.path, rule: entry.rule, lines }
}

/** One project extension. Its `statement` is the normative content; nothing else is emitted. */
function extensionBlock(entry) {
  return {
    path: entry.path,
    rule: entry.rule,
    lines: [`- \`[${entry.rule}]\` — ${pathPhrase(entry.path)}`, `  - ${inlineText(entry.statement)}`],
  }
}

/**
 * The adoption summary for the header.
 *
 * Positive selections only. A layer declared `false`, or a profile list declared empty,
 * selected nothing and therefore has nothing to say in a document about what applies —
 * and naming it would put an unadopted layer's vocabulary in the file, which is exactly
 * what the no-leakage property forbids.
 */
function adoptionSummary(adopted) {
  const parts = []
  for (const kind of [...adopted.keys()].sort()) {
    const value = adopted.get(kind)
    if (value === true) parts.push(`\`${kind}\``)
    else if (Array.isArray(value) && value.length) {
      parts.push(`\`${kind}\`: ${value.map((p) => `\`${p}\``).join(', ')}`)
    }
  }
  return parts
}

/**
 * Serialize a resolved project into its execution contract.
 *
 * Pure: no filesystem, no clock, no randomness. The same inputs give the same bytes,
 * which is what makes the generated file reviewable in a diff.
 *
 * @param {{model: ReturnType<import('./rules.mjs').loadRuleModel>,
 *          resolution: ReturnType<import('./applicability.mjs').resolveApplicability>,
 *          statements: Map<string,string>}} input
 * @returns {{ok: true, markdown: string, counts: {rules:number,exceptions:number,extensions:number},
 *             problems: []}
 *          | {ok: false, problems: string[]}} an invalid input carries NO `markdown`
 *   field, so a partial contract cannot be read off a failure by forgetting a check.
 */
export function executionContract({ model, resolution, statements } = {}) {
  const problems = []
  const fail = () => ({ ok: false, problems })

  // ── the preconditions, each fatal on its own ─────────────────────────────
  //
  // A rule model that did not parse clean cannot say which rules exist, which class
  // they carry, or which Coral it is — so "the complete normative surface" would be a
  // claim about a rule set nobody validated. `classified` is not enough by itself: a
  // rule with no enforcement class is a parse problem rather than an ownership one, and
  // it is precisely the rule this generator would silently drop as non-normative.
  if (!model || typeof model.version !== 'string') {
    problems.push(
      'no rule model, or one that cannot identify the Coral release it is. A contract' +
        ' generated against an unidentified rule set states requirements no project can pin.'
    )
    return fail()
  }
  if (!model.classified || model.problems?.length) {
    problems.push(
      `the Coral ${model.version} rule model did not validate, so there is no rule set to` +
        ' generate a contract from:'
    )
    problems.push(...(model.problems ?? ['the model reported no problem list at all']))
    return fail()
  }
  if (!resolution?.ok) {
    problems.push(
      `no valid applicability resolution, so this project's normative surface is undeclared` +
        ' rather than empty. Fix the declaration; nothing is generated until it resolves:'
    )
    problems.push(...(resolution?.problems ?? ['no resolution was produced at all']))
    return fail()
  }
  if (resolution.version !== model.version) {
    // Unreachable through resolveApplicability(), which refuses a mismatch itself. Asserted
    // anyway: a hand-assembled pair is the one way a contract could be rendered from one
    // release's rules against another's selection, and that is not a thing to discover from
    // the output.
    problems.push(
      `the resolution is for Coral ${resolution.version} and the model is Coral ${model.version}.` +
        ' Resolve the target version first ([VER-3]).'
    )
    return fail()
  }

  // ── the base normative set ────────────────────────────────────────────────
  //
  // `selected` answers "applicable"; `isNormative` answers "instructs". Both, and in
  // that order — the second is the only judgment this file makes, and it makes it with
  // the rule model's definition rather than a class list of its own.
  const ids = [...resolution.selected].filter((id) => isNormative(model.rules.get(id)))
  ids.sort(compareRuleIds)

  // A rule with no canonical statement cannot be stated to an agent, and a contract with
  // a hole in it is worse than no contract: it reads as complete. Every missing statement
  // is reported, not just the first, because the fix is one pass over the documents.
  const missing = ids.filter((id) => !statements?.get(id)?.trim())
  if (missing.length) {
    for (const id of missing) {
      problems.push(
        `[${id}] is applicable to this project and has no canonical statement in Coral` +
          ` ${model.version}. Its definition, or its document's Agent Execution Contract, is` +
          ' where that sentence comes from — a contract that lists a rule it cannot state is not' +
          ' one an agent can execute.'
      )
    }
    return fail()
  }

  // Rendered BEFORE sorting, because the rendered block is the sort's last key — see
  // compareRendered(). Every project-authored string in them has been through inlineText()
  // or inlineCode() by this point; nothing below interpolates one again.
  const exceptions = resolution.exceptions.map(exceptionBlock).sort(compareRendered)
  const extensions = resolution.extensions.map(extensionBlock).sort(compareRendered)
  const scales = [...resolution.scales].sort()
  const adopts = adoptionSummary(resolution.adopted)

  // ── the document ──────────────────────────────────────────────────────────
  const out = [
    CONTRACT_HEADING,
    CONTRACT_MARKER,
    '',
    `Generated from \`${ADHERENCE_FILE}\`. **Do not edit this file** — change \`${ADHERENCE_FILE}\``,
    'and regenerate it.',
    '',
    // Where the command lives, said plainly. It is an npm script in a COral checkout, not
    // in this repository — Coral supports projects that are not Node projects at all — and
    // the checkout has to be the one describing the version named below, because a record
    // is only ever resolved against the release it targets.
    `Regenerate from a Coral \`${model.version}\` checkout, where the command lives:`,
    '',
    `    ${GENERATE_COMMAND} -- --project <path to this repository>`,
    '',
    // `--out` is a supported mode, and the default invocation above is wrong for a contract
    // stored anywhere else: following it would write a NEW file at the project root and
    // leave the one being read untouched. The serializer does not know its own eventual
    // pathname and should not learn — an absolute path baked into the Markdown would be
    // machine-specific — so the case is qualified statically instead.
    `If this contract is kept somewhere other than the project's default \`${CONTRACT_FILE}\`, pass`,
    'that same destination again with `--out`, or the command will write a second contract at the',
    'default location and leave this one stale.',
    '',
    `- Coral: \`${model.version}\``,
    `- Scales: ${scales.map((s) => `\`${s}\``).join(', ')}`,
    `- Adopts: ${adopts.length ? adopts.join(', ') : 'nothing beyond the kernel'}`,
    '',
    // Two different reasons a Coral rule can be missing from this file, and collapsing them
    // into one sentence makes the document lie. A rule outside the project's selection is
    // INAPPLICABLE. A `[guide]` may sit squarely inside an adopted scope and is omitted
    // because it is NOT NORMATIVE — the distinction the generator is built on, so the
    // generated prose has to carry it too.
    'This is the complete normative Coral surface of this project: every applicable `[auto]` and',
    '`[review]` rule, stated once. An `[auto]` or `[review]` rule that is not listed here does not',
    'apply to this project — it belongs to a scale, a layer or a profile this project has not',
    'adopted. `[guide]` rules are left out on different grounds: some of them belong to scopes this',
    'project HAS adopted, and they are omitted because they are rationale rather than instruction,',
    'not because they are inapplicable. Their reasoning lives in the Coral documents.',
    '',
    '## Rules',
    '',
    ...ids.map((id) => ruleLine(id, statements.get(id).trim())),
  ]

  if (exceptions.length) {
    // Three claims, and the middle one is not decoration. An accepted exception must stop
    // an agent re-raising a decision that is already made — that is what the register is
    // for. It must NOT tell it to ignore `revisit_when`, which exists so a settled
    // exception deliberately comes back for human re-evaluation once its condition holds:
    // "do not raise it again" would make every revisit condition dead text. And outside its
    // path the Coral rule is simply in force, which is why the rule is still listed above.
    out.push(
      '',
      '## Accepted exceptions',
      '',
      'These are recorded project decisions. Do not report the underlying Coral rule as an unresolved',
      'violation while the recorded exception remains applicable, at the stated path or below, and do',
      'not re-litigate the decision itself. If an entry states a `Revisit when` condition and that',
      'condition has been met, surface the exception for human re-evaluation rather than treating the',
      'old decision as permanent. Each rule stays listed under **Rules** above because an exception is',
      'scoped to a path: outside that path the rule applies normally.',
      ''
    )
    for (const e of exceptions) out.push(...e.lines)
  }

  if (extensions.length) {
    out.push(
      '',
      '## Project extensions',
      '',
      'Local rules this project adds. Coral does not define them; inside their path they are',
      'normative here exactly as a Coral rule is.',
      ''
    )
    for (const e of extensions) out.push(...e.lines)
  }

  out.push('')
  // Counts alongside the text, so the CLI can report what it wrote without re-parsing
  // its own output — a second, weaker reading of a document this function already knows.
  return {
    ok: true,
    markdown: out.join('\n'),
    counts: { rules: ids.length, exceptions: exceptions.length, extensions: extensions.length },
    problems: [],
  }
}

/**
 * Read a Coral tree and a project, and generate the project's contract — the whole path
 * in one call.
 *
 * The ordering is the one every caller gets wrong by hand: build the model, resolve the
 * declaration against it (which is where the target-version check lives), extract the
 * statements, then serialize. Version acquisition is NOT solved here — a project
 * targeting another release is refused by the resolver with the existing version-first
 * semantics, and fetching that release's documents is separate work.
 *
 * @param {string} coralDir a checkout of the Coral documents
 * @param {string} projectDir the consuming project's root, holding its `CORAL.md`
 * @returns {ReturnType<typeof executionContract>}
 */
export function loadExecutionContract(coralDir, projectDir) {
  try {
    const model = loadRuleModel(coralDir)
    // Guard before resolving: loadApplicability() throws on a model with no version, and a
    // thrown TypeError is a worse report than the sentence executionContract() already writes.
    if (!model.classified || model.problems.length || typeof model.version !== 'string') {
      return executionContract({ model, resolution: null, statements: new Map() })
    }
    const resolution = loadApplicability(projectDir, model)
    // Statements are read from the documents, so they are extracted only once there is
    // something to state. Extracting for the whole registry and slicing would be the same
    // answer at more I/O; extracting for the selection alone would re-derive nothing.
    const statements = resolution.ok ? extractStatements(coralDir, model.rules) : new Map()
    return executionContract({ model, resolution, statements })
  } catch (e) {
    // Reading the inputs is filesystem work, and every step of it can fail for reasons that
    // are the operator's rather than the code's: a Coral checkout that is not there, a
    // `CORAL.md` that is not readable, a document removed between the walk and the read. A
    // missing directory is a configuration problem exactly like an unregistered profile is,
    // and it belongs in the same problem list — an ENOENT stack trace is not an answer to
    // "which rules apply here", and worse, an exception escaping this function skips the
    // fail-closed lifecycle at the file boundary entirely.
    const problem = systemProblem(e, coralDir, projectDir)
    if (!problem) throw e // a programmer error; it should surface as one
    return { ok: false, problems: [problem] }
  }
}

/**
 * A thrown value as a reportable problem, or null if it is not an expected system failure.
 *
 * The test is Node's own: a `SystemError` carries the failing `syscall` and an errno-style
 * `code`. A `TypeError` from calling something wrongly carries neither, and must keep
 * throwing — swallowing a bug into a problem list would turn every defect in this module
 * into a message blaming the operator's configuration.
 */
function systemProblem(e, coralDir, projectDir) {
  const code = e?.code
  if (typeof code !== 'string' || !/^E[A-Z0-9]+$/.test(code)) return null
  if (typeof e.syscall !== 'string' && typeof e.path !== 'string') return null
  const where = e.path ? `\`${e.path}\`` : `the Coral checkout \`${coralDir}\``
  return (
    `${where} could not be read (${code}). The contract is generated from the Coral documents in` +
    ` \`${coralDir}\` and the declaration in \`${path.join(projectDir, ADHERENCE_FILE)}\`; both have to` +
    ' be readable before there is anything to state. Check the paths and the permissions.'
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Publishing — the file boundary, and the only place fail-closed can actually be kept.
//
// Returning an error is not enough once a contract has been written once. The failure
// that matters is the SECOND run:
//
//   1. a valid `CORAL.md` generates `CORAL-CONTRACT.md`;
//   2. the declaration is edited into something that does not resolve;
//   3. regeneration fails and says so;
//   4. the old contract is still sitting there, still claiming to be the project's
//      complete normative surface.
//
// Step 4 is worse than never having generated at all, because the next agent loads a file
// that looks current and has no way to know a regeneration failed. So a failed run
// DISCARDS the stale contract: after this function returns unsuccessfully, there is no
// final file claiming to be the current contract.
//
// Only a file this generator wrote is touched, and the heading alone does not establish
// that. An `--out` destination the caller picked may be anything, a human's document may
// legitimately open with that title, and destroying a file we did not produce is not a
// fail-closed measure but data loss — so the test is isGeneratedContract(): the heading
// plus the `coral:` machine marker beneath it, which nothing but this generator writes.
//
// The same test governs BOTH directions, because the hole is symmetrical. Refusing to
// delete a human's file when generation fails buys nothing if a generation that succeeds
// overwrites it, so a destination that exists and is not generator-owned is refused rather
// than replaced. There is no `--force`: moving the file or picking another destination is
// a decision for whoever knows what is in it.
//
// Failures on the way IN are part of the same lifecycle. loadExecutionContract() turns an
// unreadable checkout or declaration into a problem rather than an exception, and
// writeExecutionContract() discards stale output even when something escapes anyway: an
// exception that skipped this boundary would leave the destination holding a contract for
// a declaration nobody can resolve any more, which is the exact state the boundary exists
// to prevent.
//
// And publication is atomic. `writeFileSync()` onto the final path truncates first, so a
// write that fails midway leaves exactly the artifact the whole design says must never
// exist: a partial Markdown document at the contract's own filename. The new text goes to
// a temporary file beside the destination and is moved onto it with a rename, which is
// atomic within a directory: the destination holds the old contract or the new one, never
// half of either.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Why this destination must not be written, or null.
 *
 * `CORAL.md` is the editable source and the contract is generated output; the two must not
 * be able to become one file. `--out CORAL.md` would overwrite the declaration with the
 * document derived from it — the project's own decisions gone, and the next resolution
 * reading a contract as a record. Checked before anything else touches the filesystem, so
 * a refused destination is never also a discarded one.
 */
function destinationProblem(file, projectDir) {
  // Case-insensitively, because the filesystem is. `--out coral.md` and `--out Coral.md`
  // name the same file as `CORAL.md` on Windows and on a default macOS volume, so a
  // case-sensitive guard protects the declaration on Linux and hands it to the generator
  // everywhere else. Refused on every platform rather than probed for: a reserved name is a
  // reserved name, and a guard whose behaviour depends on the volume is one nobody can reason
  // about.
  if (path.basename(file).toLowerCase() !== ADHERENCE_FILE.toLowerCase()) return null
  // Its directory decides whether it is THIS project's record — the basename already matched,
  // and comparing full paths would reintroduce the case sensitivity just removed.
  const own = path.resolve(path.dirname(file)) === path.resolve(projectDir)
  return (
    `\`${file}\` is the reserved name \`${ADHERENCE_FILE}\` (case is ignored, because the filesystem` +
    ` may ignore it too), which is a project's adherence RECORD and not a place to put generated output.` +
    (own ? ' It is this project\'s own declaration: writing the contract there would destroy the' +
      ' decisions the contract is derived from.' : '') +
    ` The contract is written to \`${CONTRACT_FILE}\` by default; \`--out\` may name any other file.`
  )
}

/**
 * Remove a previously generated contract at `file`, so a failed run leaves none behind.
 *
 * @returns {{removed: string|null, problems: string[]}} a problem only where a stale
 *   contract is still there and could not be removed — silence would leave the caller
 *   believing the fail-closed guarantee held when it did not.
 */
function discardStale(file) {
  try {
    if (!fs.existsSync(file)) return { removed: null, problems: [] }
    // Heading AND marker, in position. A human's document may legitimately open with the
    // heading alone — a note about a contract, a draft, a copy pasted for review — and
    // deleting that because a later generation failed is data loss dressed up as a safety
    // property. Only this generator writes the marker.
    if (!isGeneratedContract(fs.readFileSync(file, 'utf8'))) return { removed: null, problems: [] }
    fs.rmSync(file)
    return { removed: file, problems: [] }
  } catch (e) {
    // Worded for what is actually known: the file could not be inspected or could not be
    // deleted, and in neither case can this claim to have left the destination clean.
    return {
      removed: null,
      problems: [
        `\`${file}\` could not be inspected or removed (${e.message}). If it is a previously` +
          ' generated contract it is still on disk and is now stale — it describes an earlier' +
          ' declaration, so do not load it.',
      ],
    }
  }
}

/**
 * Why this destination must not be REPLACED, or null.
 *
 * The mirror of discardStale(), on the successful path, and it closes the same hole from
 * the other side. Refusing to delete a human's file when generation fails is worth little
 * if a generation that succeeds overwrites it — `--out NOTES.md`, or a `CORAL-CONTRACT.md`
 * somebody started writing by hand before this command existed. Ownership decides both.
 *
 * Fail-closed when the destination cannot be read: unproven ownership is not ownership.
 * No `--force`, deliberately — moving the file or choosing another destination is a
 * decision for whoever knows what is in it.
 */
function occupiedProblem(file) {
  try {
    if (!fs.existsSync(file)) return null
    if (isGeneratedContract(fs.readFileSync(file, 'utf8'))) return null
    return (
      `\`${file}\` already exists and was not written by this generator — it carries no` +
      ` \`${CONTRACT_MARKER}\` marker. Replacing it would discard whatever it holds, so nothing was` +
      ' written. Move it, delete it, or generate somewhere else with `--out`.'
    )
  } catch (e) {
    return (
      `\`${file}\` already exists and could not be read (${e.message}), so there is no way to tell` +
      ' whether it is a generated contract or something else. Nothing was written.'
    )
  }
}

/** How many names to try before giving up. A collision needs a UUID clash; two is generous. */
const TEMP_ATTEMPTS = 8

/**
 * Create the temporary artifact publication renames from — EXCLUSIVELY.
 *
 * The destination is carefully protected by now, and for a while its sibling was not: the
 * temporary path was `.<name>.<pid>.tmp`, which is predictable, so an unrelated file
 * already sitting there was truncated by the write and then deleted by the error path.
 * Every argument for not overwriting a file we do not own applies to that file too.
 *
 * So the name is unpredictable AND the create is exclusive — `wx` fails rather than
 * truncates — which makes "this invocation never took a path it did not create" a property
 * of the syscall rather than of the odds. Cleanup then removes only what this returned.
 *
 * Beside the destination, never in the system temp directory: a rename is atomic only
 * within one filesystem, and `/tmp` is routinely a different one.
 *
 * The name is random and the contract is deterministic, which is not a contradiction: this
 * path never reaches the Markdown, only the directory entry that exists for a moment
 * between the write and the rename.
 *
 * @param {string} dir the destination's directory
 * @param {string} base the destination's filename, used only to make the temp recognisable
 * @param {() => string} unique injectable for testing the collision path; a UUID otherwise
 * @returns {{path: string, fd: number}} an open descriptor for a file that did not exist
 */
export function createTempFile(dir, base, unique = randomUUID) {
  let last = null
  for (let attempt = 0; attempt < TEMP_ATTEMPTS; attempt++) {
    last = path.join(dir, `.${base}.${unique()}.tmp`)
    try {
      return { path: last, fd: fs.openSync(last, 'wx') }
    } catch (e) {
      // Anything but "it is already there" is the caller's problem — a missing directory, a
      // read-only volume — and is reported rather than retried.
      if (e.code !== 'EEXIST') throw e
    }
  }
  const err = new Error(
    `could not create a temporary file beside \`${path.join(dir, base)}\`: ${TEMP_ATTEMPTS} candidate` +
      ` names were already taken (last tried \`${last}\`).`
  )
  err.code = 'EEXIST'
  throw err
}

/** Write `text` to `file` atomically. Returns a problem sentence, or null on success. */
function publish(file, text) {
  let tmp = null
  try {
    tmp = createTempFile(path.dirname(file), path.basename(file))
    fs.writeFileSync(tmp.fd, text)
    fs.closeSync(tmp.fd)
    tmp.fd = null
    fs.renameSync(tmp.path, file)
    return null
  } catch (e) {
    // Only ever the artifact this invocation created. `tmp` is null when createTempFile()
    // itself failed, which is exactly when there is nothing of ours on disk to remove.
    discardTemp(tmp)
    return `the contract could not be written to \`${file}\` (${e.message}).`
  }
}

/** Close and remove a temporary artifact this invocation created. Never throws. */
function discardTemp(tmp) {
  if (!tmp) return
  try {
    if (tmp.fd !== null) fs.closeSync(tmp.fd)
  } catch {
    /* the descriptor is going away with the process either way */
  }
  try {
    fs.rmSync(tmp.path, { force: true })
  } catch {
    /* nothing further to do: it carries no contract filename and no marker */
  }
}

/**
 * Generate a project's contract and publish it.
 *
 * The whole point of the function, stated as the invariant it keeps:
 *
 *     after an unsuccessful return — no final file claims to be the current contract
 *     after a successful return   — the final file holds the complete new contract
 *
 * A filesystem error is reported through the same problem list as a configuration error,
 * rather than thrown: an uncaught stack trace beside an uncertain destination is the one
 * outcome a caller cannot act on.
 *
 * @param {string} coralDir a checkout of the Coral documents
 * @param {string} projectDir the consuming project's root
 * @param {string} [outFile] an explicit destination; defaults to `<project>/CORAL-CONTRACT.md`
 * @returns {{ok: true, file: string, markdown: string, counts: object, problems: []}
 *          | {ok: false, problems: string[], removed: string|null}}
 */
export function writeExecutionContract(coralDir, projectDir, outFile) {
  const file = outFile ?? path.join(projectDir, CONTRACT_FILE)
  const refused = destinationProblem(file, projectDir)
  // Refused before any cleanup: a destination we will not write is a destination we have
  // no business deleting either.
  if (refused) return { ok: false, problems: [refused], removed: null }

  let result
  try {
    result = loadExecutionContract(coralDir, projectDir)
  } catch (e) {
    // loadExecutionContract() already turns every EXPECTED filesystem failure into a
    // problem, so reaching here means a defect rather than a mistyped path — and a defect
    // must still surface as one, not be laundered into `{ok: false}`. What it must not do
    // is leave a contract that describes an earlier declaration sitting at the destination:
    // the file boundary is the last line of defence, and it does not get to skip its own
    // guarantee because something upstream threw.
    const stale = discardStale(file)
    // And if the cleanup ALSO failed, that is the one case where the guarantee did not
    // hold — precisely the fact a caller needs and the one a bare rethrow would drop on the
    // floor. Both reach it, with the original defect first.
    if (stale.problems.length) {
      throw new AggregateError(
        [e, new Error(stale.problems.join(' '))],
        `the contract generator failed, and the stale contract at \`${file}\` could not be removed.`
      )
    }
    throw e
  }
  if (!result.ok) {
    const stale = discardStale(file)
    return { ok: false, problems: [...result.problems, ...stale.problems], removed: stale.removed }
  }

  // A valid contract is not a licence to overwrite whatever is in the way. Checked here
  // rather than up front, so a project with both a broken declaration and an occupied
  // destination hears about the declaration — the problem it has to fix either way.
  const occupied = occupiedProblem(file)
  if (occupied) return { ok: false, problems: [occupied], removed: null }

  const failure = publish(file, result.markdown)
  if (failure) {
    // The rename may not have happened, which leaves the previous contract in place — and
    // it is now stale for exactly the reason above.
    const stale = discardStale(file)
    return { ok: false, problems: [failure, ...stale.problems], removed: stale.removed }
  }
  return { ...result, file }
}

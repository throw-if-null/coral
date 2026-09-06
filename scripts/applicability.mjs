// ─────────────────────────────────────────────────────────────────────────────
// Project applicability — which Coral rules bind a given project, and where.
//
// The canonical rule model (scripts/rules.mjs) answers *what Coral publishes*. It
// deliberately does not answer *what applies here*, and the two are not the same
// question: Coral publishes rules for CLIs, for browsers, for systems of several apps
// and for applications that call a model at runtime, and no project is the audience
// for all of them. Before this module the gap was filled by whoever was reading —
// an auditor against "current main", an agent against whatever it had loaded — which
// is the failure `[VER-6]` names: a rule becoming applicable because it exists
// somewhere in the Coral repository.
//
// So applicability is resolved from a DECLARATION, and from nothing else. The project
// states, in its `CORAL.md`, the Coral version it targets, the architectural scales it
// is written at, and the non-kernel ownership scopes it adopts. This module reads that
// statement, validates every name in it against the rule model for that version, and
// resolves the set. Two properties make it worth having as code rather than as prose:
//
//   · it FAILS CLOSED, structurally. A missing declaration, an unknown ownership key, an
//     unregistered profile, an unknown scale, an exception to a rule the project never
//     selected — every one is a reported problem, none has a default, and an invalid
//     resolution carries no `selected` field at all. Fail-closed cannot be a convention
//     each caller remembers; it has to be a shape they cannot misuse.
//   · it is VERSION-FIRST. The target is read before any schema is enforced, because
//     `[VER-6]` is itself versioned: a record written for a release that predates it has
//     no adoption block, and demanding one would apply the rule retroactively. A record
//     for another release is refused as "load that release's semantics", never as an
//     invalid record. This module is the applicability semantics of the ONE version it
//     ships in, and it says so rather than pretending to be lenient across releases.
//   · it is a SET UNION with no ordering. Declaration order carries no meaning, a thing
//     selected twice is selected once, and no layer wins over another. Two Coral rules
//     that contradict each other are a defect in Coral, and hidden precedence here would
//     resolve that defect invisibly in every consuming project instead of surfacing it.
//
// Everything the resolver switches on is read from the registries — ownership kinds and
// profile names from CONVENTIONS.md's tables, scales from its scale registry, rule IDs
// and their scopes from the model. Nothing about Coral's current vocabulary is spelled
// out below, which is what makes a new profile or a new optional layer a documents
// change rather than a change here.
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs'
import path from 'node:path'

import { parse as parseYaml } from 'yaml'

import { GOVERNANCE, GUIDE, ID_CORE, OPT_IN, isNormative, kernelLayerOf } from './rules.mjs'

/** The file a consuming project keeps in its root. */
export const ADHERENCE_FILE = 'CORAL.md'

// Coral's own documentation prints a whole `CORAL.md` as a worked example, and these mark it
// so the build can resolve that example through this module. They live here rather than in
// the build because the marker names a contract this module defines — and because the build
// and the tests both read it, which is two consumers and therefore one constant.
export const ADHERENCE_EXAMPLE_START = '<!-- coral:adherence:start -->'
export const ADHERENCE_EXAMPLE_END = '<!-- coral:adherence:end -->'

// The machine-readable block inside it. `yaml coral` rather than plain `yaml` so a
// `CORAL.md` may hold other YAML — a snippet being discussed, a proposed entry — without
// either of them being read as the record.
//
// Scanned for the OPENING info string only, and closed by a fence of the same character
// that is at least as long. That is what lets CONVENTIONS.md print the whole file as a
// worked example inside a ```` fence and still have this find the ``` block within it,
// which is the only reason the documented example can be checked by the build at all.
const BLOCK_OPEN_RE = /^ {0,3}(`{3,}|~{3,})yaml coral[ \t]*$/
const BLOCK_CLOSE_RE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/

// A rule ID as an adherence entry writes it: bare, not bracketed. CONVENTIONS.md's
// typography note is the reason — a bracketed ID is a citation the build resolves, and
// these are data fields rather than prose citations.
const ENTRY_ID_RE = new RegExp(`^${ID_CORE}$`)
// The family half of an ID: everything before the final `-N`. `SYS-TEST-1` -> `SYS-TEST`.
const FAMILY_RE = new RegExp(`^(${ID_CORE.replace('-\\d+', '')})-\\d+$`)

// A three-part version, the only form `targets` may take.
const VERSION_RE = /^\d+\.\d+\.\d+$/

/**
 * The one sentence said whenever a record and a model are for different Coral releases.
 *
 * Written once because two callers say it — the parser, before it enforces a schema, and the
 * resolver, before it composes — and because what it must NOT say is as important as what it
 * does: not "your record is invalid", which would blame the project for a rule its target
 * predates, but "resolve the target first", which is the actual next step.
 */
const versionMismatch = (targets, version) =>
  `this record targets Coral ${targets}, and this is the Coral ${version} model. Load Coral` +
  ` ${targets}'s rule set and its applicability semantics before auditing against it ([VER-3])` +
  ` — including its record schema, which may not have had every field ${version} requires. A` +
  ' project does not acquire a rule, or a required field, by standing still.'

// The two shapes an `adopts` value may take, decided by the layer rather than by the
// value: a layer that registers profiles is adopted by naming them, a layer with a fixed
// tag is adopted or not. Stated as words because they appear in error messages.
export const ADOPT_FLAG = 'flag'
export const ADOPT_PROFILES = 'profiles'

/**
 * @typedef {{rule: string, path: string, [k: string]: unknown}} Entry
 *
 * @typedef {{targets: string, scales: string[], adopts: Record<string, boolean|string[]>,
 *            exceptions: Entry[], extensions: Entry[]}} Declaration
 *
 * @typedef {{kind: string, label: string, form: 'flag'|'profiles', profiles: string[]}} Selectable
 */

// ─────────────────────────────────────────────────────────────────────────────
// What a project is allowed to declare.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The ownership scopes a project may adopt, derived from the registries.
 *
 * Two layers are deliberately absent and for different reasons. The KERNEL is implicit:
 * it is the one layer whose rules bind without a decision, so a manifest that could
 * select it could also decline it, and "conformant to Coral" would stop meaning
 * anything. FRAMEWORK GOVERNANCE is not an application layer at all — no application
 * source satisfies or violates `[VER-2]`, so adopting it into a conformance surface
 * would put rules in front of an auditor that no slice can ever answer.
 *
 * Everything else is whatever the taxonomy currently calls `opt-in`. Adding a layer or a
 * profile to Coral therefore makes it SELECTABLE and nothing more — see
 * resolveApplicability(), where absence from a declaration means not adopted.
 *
 * @param {{taxonomy: import('./rules.mjs').Layer[], profiles: Map<string,unknown>}} model
 * @returns {{selectable: Map<string,Selectable>, problems: string[]}}
 */
export function selectableScopes(model) {
  const problems = []
  const selectable = new Map()
  const kernel = kernelLayerOf(model.taxonomy)
  for (const layer of model.taxonomy) {
    if (layer === kernel) continue
    if (layer.surface === GOVERNANCE) continue
    if (layer.surface !== OPT_IN) {
      // A conformance layer other than the kernel has no way to become applicable under
      // `[VER-6]`: it is not implicit, because only the kernel is, and it is not
      // selectable, because its surface says its rules apply before any selection. That
      // is a contradiction in the taxonomy, and the resolver refuses it rather than
      // picking one of the two readings on the registry's behalf.
      problems.push(
        `the ownership layer \`${layer.kind}\` has surface \`${layer.surface}\` but is not the` +
          ' kernel, so nothing can make its rules applicable: they are neither implicit nor' +
          ` adoptable. Either it is the kernel layer, or its surface is \`${OPT_IN}\`.`
      )
      continue
    }
    const declared = layer.family
      ? [...model.profiles.keys()]
          .filter((t) => t.startsWith(`${layer.family}:`))
          .map((t) => t.split(':')[1])
          .sort()
      : []
    selectable.set(layer.kind, {
      kind: layer.kind,
      label: layer.label,
      form: layer.family ? ADOPT_PROFILES : ADOPT_FLAG,
      profiles: declared,
    })
  }
  return { selectable, problems }
}

// ─────────────────────────────────────────────────────────────────────────────
// Reading the declaration.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pull the one `yaml coral` block out of an adherence record's text.
 *
 * Exactly one, and that is checked rather than assumed for the same reason the kernel
 * block is: a second block is a second answer to "what applies here", fully visible on
 * the page, with nothing saying which one counted.
 *
 * @returns {{body: string|null, problems: string[]}}
 */
export function adherenceBlock(text) {
  const problems = []
  const lines = text.split('\n')
  const blocks = []
  let fence = null
  let body = []
  for (const line of lines) {
    if (fence === null) {
      const open = BLOCK_OPEN_RE.exec(line)
      if (open) {
        fence = open[1]
        body = []
      }
      continue
    }
    const close = BLOCK_CLOSE_RE.exec(line)
    if (close && close[1][0] === fence[0] && close[1].length >= fence.length) {
      blocks.push(body.join('\n'))
      fence = null
      continue
    }
    body.push(line)
  }
  if (fence !== null) {
    problems.push(
      'the ```yaml coral block is never closed. The machine-readable record has to be a complete' +
        ' fenced block, or the half of it below the break is invisible to every tool that reads it.'
    )
    return { body: null, problems }
  }
  if (!blocks.length) {
    problems.push(
      `${ADHERENCE_FILE} holds no \`\`\`yaml coral block. That block is the record — the target` +
        ' version, the adopted scopes, and the exception and extension entries ([VER-5],' +
        ' [VER-6]). Prose around it carries the why; it does not carry the record.'
    )
    return { body: null, problems }
  }
  if (blocks.length > 1) {
    problems.push(
      `${ADHERENCE_FILE} holds ${blocks.length} \`\`\`yaml coral blocks. There is one record per` +
        ' project: a second block is a second answer to "what applies here", with nothing saying' +
        ' which one counts.'
    )
    return { body: null, problems }
  }
  return { body: blocks[0], problems }
}

/** Every string in a list, or null if the value is not a list of strings. */
const stringList = (v) => (Array.isArray(v) && v.every((x) => typeof x === 'string') ? v : null)

const isMapping = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

/**
 * The version an adherence record targets, read WITHOUT requiring anything else of it.
 *
 * This is the first step of every path through this module, and the ordering is the whole
 * point. `[VER-6]` is itself versioned: it did not exist before the release that introduced
 * it, so a record targeting an earlier Coral legitimately carries no `adopts` block, and
 * reporting that absence as a `[VER-6]` violation applies the rule retroactively — the exact
 * thing `[VER-3]` exists to prevent. The target has to be readable before any schema is
 * enforced, so that the answer for such a record is *"load that release's applicability
 * semantics"* rather than *"your record is missing a field"*.
 *
 * It therefore requires only what every adherence record has ever had: one machine-readable
 * block, holding a mapping, naming a target version.
 *
 * @param {string} text the whole `CORAL.md`
 * @returns {{targets: string|null, problems: string[]}}
 */
export function adherenceTarget(text) {
  const { body, problems } = adherenceBlock(text)
  if (body === null) return { targets: null, problems }
  let doc
  try {
    doc = parseYaml(body)
  } catch (e) {
    problems.push(`the \`\`\`yaml coral block is not valid YAML: ${e.message}`)
    return { targets: null, problems }
  }
  if (!isMapping(doc)) {
    problems.push('the ```yaml coral block must be a mapping, and it must name a `targets` version.')
    return { targets: null, problems }
  }
  // A YAML scalar `0.6` parses as a number and would silently become "0.6", so the type is
  // checked rather than coerced.
  if (typeof doc.targets !== 'string' || !VERSION_RE.test(doc.targets)) {
    problems.push(
      '`targets` must name the Coral version this project is audited against, as a quoted' +
        ' three-part version ([VER-3]) — `targets: "0.6.0"`. Without it there is no way to know' +
        ' which rule set, or which record schema, this file is written against.'
    )
    return { targets: null, problems }
  }
  return { targets: doc.targets, problems }
}

/**
 * Parse and shape-check an adherence record written for `version`.
 *
 * **Version first, schema second.** The target is read by adherenceTarget() before anything
 * else is required of the file, and a record targeting a different Coral is refused on that
 * ground alone — with no complaint about fields that release may never have had. This module
 * implements the record schema of exactly one Coral version, the one it ships in; reading a
 * record from another release means loading that release's semantics, which is a different
 * copy of this file and not a lenient mode of this one.
 *
 * Past that gate it knows nothing about Coral's *vocabulary* — it validates that the record
 * IS a record: the required keys are present and every value has the type its key promises.
 * Whether `cli` is a registered profile is resolveApplicability()'s question, because only
 * that function has the rule model. The split matters for the error a reader gets: "your YAML
 * has a list where a boolean belongs" and "`clii` is not a registered app profile" are
 * different mistakes with different fixes.
 *
 * @param {string} text the whole `CORAL.md`
 * @param {string} version the Coral version whose record schema to enforce — required, so a
 *   record can never be validated against an unidentified one.
 * @returns {{declaration: Declaration|null, targets: string|null, problems: string[]}}
 */
export function parseAdherenceRecord(text, version) {
  if (typeof version !== 'string' || !VERSION_RE.test(version)) {
    throw new TypeError(
      'parseAdherenceRecord(text, version): `version` is required and must be a three-part' +
        ' version. A record schema belongs to a Coral release; validating one against an' +
        ' unidentified release is how a rule gets applied to a project that predates it.'
    )
  }
  const { targets, problems } = adherenceTarget(text)
  if (targets === null) return { declaration: null, targets: null, problems }
  if (targets !== version) {
    problems.push(versionMismatch(targets, version))
    return { declaration: null, targets, problems }
  }

  // Safe: adherenceTarget() has already parsed the same block into a mapping.
  const doc = parseYaml(adherenceBlock(text).body)

  const KNOWN = ['targets', 'scales', 'adopts', 'exceptions', 'extensions']
  for (const key of Object.keys(doc)) {
    if (!KNOWN.includes(key)) {
      problems.push(
        `\`${key}\` is not a field of the adherence record. It holds ${KNOWN.join(', ')} and` +
          ' nothing else — a misspelled field that was quietly ignored is a decision nobody made.'
      )
    }
  }

  // `scales` — required, non-empty. Which architectural sizes the project is written at.
  const scales = stringList(doc.scales)
  if (!scales || !scales.length) {
    problems.push(
      '`scales` must be a non-empty list of architectural scale keys — `scales: [app]` for a' +
        ' repository that ships one app. It is declared rather than inferred: "this repository' +
        ' happens to contain several apps" is not a decision anybody made ([VER-6]).'
    )
  }

  // `adopts` — required, and a mapping. Its ABSENCE is the case this whole module exists
  // for: a project with no declaration has an undeclared normative surface, which is a
  // configuration finding and not permission to pick a default. An empty mapping is a
  // different thing entirely — an explicit decision to run on the kernel alone — and the
  // two must not be spelled the same way.
  const rawAdopts = doc.adopts
  let adopts = null
  if (!isMapping(rawAdopts)) {
    problems.push(
      '`adopts` must be a mapping of ownership keys to selections ([VER-6]). A project that' +
        ' adopts no optional layer writes `adopts: {}` and means it; leaving the field out means' +
        ' nobody decided, and this is not defaulted.'
    )
  } else {
    adopts = rawAdopts
    for (const [kind, value] of Object.entries(adopts)) {
      if (typeof value === 'boolean') continue
      if (stringList(value)) continue
      problems.push(
        `\`adopts.${kind}\` must be \`true\`/\`false\` for a layer with a fixed tag, or a list of` +
          ' profile names for a layer that registers profiles.'
      )
    }
  }

  const entries = (field) => {
    const v = doc[field]
    if (v === undefined || v === null) return []
    if (!Array.isArray(v) || !v.every(isMapping)) {
      problems.push(`\`${field}\` must be a list of entries, each a mapping ([VER-5]).`)
      return []
    }
    return v
  }
  const exceptions = entries('exceptions')
  const extensions = entries('extensions')

  if (problems.length) return { declaration: null, targets, problems }
  return { declaration: { targets, scales, adopts, exceptions, extensions }, targets, problems }
}

// ─────────────────────────────────────────────────────────────────────────────
// Paths.
//
// Both record types are path-scoped, and a path a tool cannot decide is a path that
// excuses whatever the reader wants it to. The semantics are therefore the narrowest
// ones that answer the only question asked of them — *does this entry cover this source
// file?* — and nothing more: a repo-relative directory, matching itself and everything
// beneath it.
//
// Glob forms are REFUSED rather than interpreted. Supporting them means inventing a
// precedence between overlapping patterns, and precedence between records is exactly what
// this design does not have. `[VER-5]` already says the same thing about the unbounded
// case in prose — `path: "**"` excuses the rule, and a project that needs that has an
// amendment to file — so the root path is refused for the same reason `**` is.
// ─────────────────────────────────────────────────────────────────────────────
const GLOB_CHARS = /[*?[\]{}]/
// C0 and C1 control characters, newline and tab included. See pathProblem().
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/

// The whole repository, written the one way. `.` and `./` mean it; an empty path does not —
// see pathProblem(), where a missing path stays a missing decision rather than becoming this.
export const ROOT_PATH = '.'

/** One directory, one spelling: no leading `./`, no trailing slash, root always `.`. */
const normalizePath = (p) => {
  const trimmed = String(p).trim().replace(/^\.\/+/, '').replace(/\/+$/, '')
  return trimmed === '' || trimmed === ROOT_PATH ? ROOT_PATH : trimmed
}

/**
 * Why `p` is not a usable entry path, or null if it is one.
 *
 * The repository root is the one thing the two record types disagree about, and the reason is
 * what each of them does with it.
 *
 * An **exception** at the root declines a Coral rule everywhere. That is not a decision about
 * a place, it is a decision about the rule — and Coral has a name for it: an amendment,
 * filed upstream, so that the defect is fixed for everyone rather than carried forever as a
 * per-project carve-out. `[VER-5]` already says as much in prose.
 *
 * An **extension** at the root adds a rule Coral does not have, everywhere in this project.
 * That is an ordinary thing for a project to need — every outbound request carries our trace
 * header; every capability publishes our metadata descriptor — and Coral has no claim on it
 * whatsoever. Refusing it would leave a project inventing artificial subdirectories, or
 * filing an amendment for a rule Coral should never adopt. So it is allowed, and written
 * explicitly as `path: "."`.
 *
 * @param {unknown} p
 * @param {{allowRoot?: boolean}} [options] whether the repository root is a legal scope
 * @returns {string|null}
 */
export function pathProblem(p, { allowRoot = false } = {}) {
  if (typeof p !== 'string' || !p.trim()) {
    return 'names no path. Both record types are scoped to a path ([VER-5]): an entry with no path' +
      ' excuses a habit rather than a place. Silence is not the same decision as `path: "."`,' +
      ' and it is not read as one.'
  }
  // A path is written by a human, printed in a diagnostic, and rendered into a generated
  // execution contract, and all three are line-oriented. A path carrying a line break or a
  // control character therefore cannot be shown anywhere without changing what it names —
  // the same objection the glob refusal below makes, one class of character over. Refused
  // rather than rendered ambiguously; a directory named this way is renamed, not excused.
  //
  // Tested against the ORIGINAL string, before the trim below. Trimming first would delete
  // exactly the characters this refuses whenever they sit at either end, so `internal/billing\n`
  // would resolve quietly as `internal/billing` — a path silently renamed into a different
  // one, which is the failure the rule exists to prevent rather than an instance of it being
  // caught. Interior control characters would still be refused, which is what makes the
  // omission the kind nobody notices.
  if (CONTROL_CHARS.test(p)) {
    return 'names a path containing a line break or a control character. A path is written,' +
      ' printed and rendered on one line, and one that cannot be shown without changing what it' +
      ' names is a path no reader and no tool can check. Nor is it trimmed away and resolved as' +
      ' the path that is left: that would silently rename it. Write the subtree plainly —' +
      ' `internal/billing`.'
  }
  const raw = p.trim()
  if (GLOB_CHARS.test(raw)) {
    return `names the path \`${raw}\`, which is a pattern rather than a place. A path is a` +
      ' repo-relative directory and matches that directory and everything under it; patterns' +
      ' would need a precedence between overlapping entries, and there is deliberately none.' +
      ' For the whole repository, where that is allowed, write `path: "."`.'
  }
  if (raw.startsWith('/') || /^[A-Za-z]:/.test(raw) || raw.includes('\\')) {
    return `names the path \`${raw}\`, which is not repo-relative. A path is resolved against the` +
      ' repository root so the record means the same thing on every machine.'
  }
  const norm = normalizePath(raw)
  if (norm === ROOT_PATH) {
    if (allowRoot) return null
    return 'scopes to the whole repository. Declining a Coral rule everywhere is not a decision' +
      ' about a place, it is a decision about the rule — file an amendment (CONVENTIONS.md,' +
      ' "Three kinds of divergence") so it is fixed for everyone, rather than carrying the' +
      ' carve-out forever. (A project rule of your own may scope to `.`; a Coral one may not.)'
  }
  if (norm.split('/').some((seg) => !seg || seg === '.' || seg === '..')) {
    return `names the path \`${raw}\`, which walks outside or through itself. Write the subtree` +
      ' plainly — `internal/billing`.'
  }
  return null
}

/**
 * Does an entry scoped to `scope` cover the source path `target`?
 *
 * Subtree containment, on path segments. `internal/billing` covers `internal/billing` and
 * `internal/billing/invoice.go`, and does not cover `internal/billing-archive` — a prefix
 * test on the raw string would, which is how a scoped decision silently widens.
 *
 * The root covers everything, which is the point of allowing it for an extension.
 */
export function pathApplies(scope, target) {
  const a = normalizePath(scope)
  if (a === ROOT_PATH) return true
  const b = normalizePath(target)
  return b === a || b.startsWith(`${a}/`)
}

// ─────────────────────────────────────────────────────────────────────────────
// The composition.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve a declaration against the rule model into the project's normative surface.
 *
 * The algebra, stated once:
 *
 *     selected = kernel
 *              ∪ { r : r's ownership kind is adopted, at r's scale }
 *
 * A union, and only a union. There is no ordering between layers and no precedence: a
 * rule is in the set or it is not, and no adopted layer can remove, weaken, or override a
 * rule another adopted layer contributes. Two Coral rules that contradict each other are a
 * defect in Coral — resolving it here would apply a hidden fix in every consuming project
 * and leave the defect in place upstream.
 *
 * The kernel is added unconditionally and is NOT scale-filtered: it is the one layer that
 * binds without a decision, so it cannot be narrowed by one either.
 *
 * **The result is discriminated, and that is load-bearing.** A valid resolution is
 * `{ok: true, …}` and carries `selected`; an invalid one is `{ok: false, problems, diagnostic}`
 * and carries **no `selected` at all**. Fail-closed applicability is the property PO-04 exists
 * to establish, and a shape that hands back a plausible-looking rule set beside a list of
 * problems makes ignoring the problems the easy thing to write — one valid adoption plus one
 * typo'd profile name would otherwise produce a populated set that nobody declared. The
 * partial answer is still returned, under `diagnostic`, because a tool should be able to say
 * what the project *would* have owed; it is spelled differently so it cannot be mistaken for
 * the normative surface, and effectiveRulesAt() refuses it outright.
 *
 * @param {Declaration|null} declaration
 * @param {ReturnType<import('./rules.mjs').loadRuleModel>} model the rule model to compose
 *   from. It must carry its own `version`, and the declaration's target is compared against
 *   it unconditionally — there is no opt-out, because "resolve the target version first" is a
 *   precondition and an optional check is one a caller forgets. Building the model for an
 *   older release is the caller's job and is not solved here.
 * @returns {{ok: true, version: string, selected: Set<string>,
 *            adopted: Map<string,boolean|string[]>, scales: Set<string>,
 *            exceptions: Entry[], extensions: Entry[], problems: []}
 *          | {ok: false, version: string|null, problems: string[], diagnostic: object}}
 */
export function resolveApplicability(declaration, model) {
  const version = model?.version
  if (typeof version !== 'string' || !VERSION_RE.test(version)) {
    throw new TypeError(
      'resolveApplicability(declaration, model): the model must carry a `version` identifying' +
        ' the Coral release it is the rule set of. loadRuleModel() sets it. Composing against an' +
        ' unidentified model is how a project gets audited against rules its target predates.'
    )
  }
  const problems = []
  const selected = new Set()
  const adopted = new Map()
  const scales = new Set()
  const exceptions = []
  const extensions = []
  // The two exits. `invalid()` deliberately does not carry `selected`: reading it off a
  // failed resolution should be impossible, not merely discouraged.
  const invalid = () => ({
    ok: false,
    version,
    problems,
    diagnostic: { selected, adopted, scales, exceptions, extensions },
  })
  const valid = () => ({
    ok: true,
    version,
    selected,
    adopted,
    scales,
    exceptions,
    extensions,
    problems,
  })

  if (!declaration) {
    problems.push(
      `no adherence declaration. A project with no readable \`${ADHERENCE_FILE}\` record has an` +
        ' **undeclared normative surface**: which Coral rules bind it is unknown, and that is a' +
        ' configuration finding to fix rather than a licence to audit against everything Coral' +
        ' publishes ([VER-6]).'
    )
    return invalid()
  }
  if (declaration.targets !== version) {
    problems.push(versionMismatch(declaration.targets, version))
    return invalid()
  }

  // ── scales ────────────────────────────────────────────────────────────────
  const known = new Set(model.scales.map((s) => s.key))
  for (const key of declaration.scales) {
    if (!known.has(key)) {
      problems.push(
        `\`${key}\` is not an architectural scale. Coral ${declaration.targets} publishes` +
          ` ${[...known].sort().map((k) => `\`${k}\``).join(', ')} — an unrecognised scale is a` +
          ' typo, and a typo that resolved would silently narrow the rule set.'
      )
      continue
    }
    scales.add(key)
  }

  // ── adopted scopes ────────────────────────────────────────────────────────
  const { selectable, problems: taxonomyProblems } = selectableScopes(model)
  problems.push(...taxonomyProblems)
  const kernelLayer = kernelLayerOf(model.taxonomy)
  const vocabulary = () =>
    [...selectable.values()]
      .map((s) => `\`${s.kind}\`${s.form === ADOPT_PROFILES ? ` (${s.profiles.join(', ') || 'no profiles registered'})` : ''}`)
      .join(', ')

  for (const [kind, value] of Object.entries(declaration.adopts)) {
    if (kernelLayer && kind === kernelLayer.kind) {
      problems.push(
        `\`adopts.${kind}\` selects the kernel, which is not selectable. Kernel rules bind every` +
          ' Coral codebase without a decision — a manifest that could select the kernel could also' +
          ' decline it, and "conformant to Coral" would stop meaning anything. Remove the key.'
      )
      continue
    }
    const layer = model.taxonomy.find((l) => l.kind === kind)
    if (layer && !selectable.has(kind)) {
      problems.push(
        `\`adopts.${kind}\` selects \`${layer.label}\`, which is not an application conformance` +
          ` layer: its surface is \`${layer.surface}\`, so no application source code satisfies or` +
          ' violates its rules. It is read by Coral-aware humans, agents and tooling when' +
          ' interpreting Coral, and it is never audited against a slice. Remove the key.'
      )
      continue
    }
    const spec = selectable.get(kind)
    if (!spec) {
      problems.push(
        `\`adopts.${kind}\` is not an ownership kind Coral ${declaration.targets} publishes.` +
          ` Adoptable: ${vocabulary()}. An unknown key is a typo or a layer from a different` +
          ' version, and either way it selects nothing — which is why it is an error rather than' +
          ' a value that is quietly ignored.'
      )
      continue
    }
    if (spec.form === ADOPT_FLAG) {
      if (typeof value !== 'boolean') {
        problems.push(
          `\`adopts.${kind}\` must be \`true\` or \`false\`: \`${spec.label}\` has a fixed tag and` +
            ' registers no profiles, so there is nothing to name.'
        )
        continue
      }
      adopted.set(kind, value)
      continue
    }
    if (!Array.isArray(value)) {
      problems.push(
        `\`adopts.${kind}\` must be a list of profile names: \`${spec.label}\` registers profiles,` +
          ` so a selection says WHICH — ${spec.profiles.map((p) => `\`${p}\``).join(', ') || '(none registered)'}.`
      )
      continue
    }
    const chosen = []
    for (const name of value) {
      if (!spec.profiles.includes(name)) {
        problems.push(
          `\`${name}\` is not a registered \`${spec.label}\` in Coral ${declaration.targets}.` +
            ` Registered: ${spec.profiles.map((p) => `\`${p}\``).join(', ') || 'none'}. An` +
            ' unregistered name is a typo, and a typo read as an empty profile would silently' +
            ' drop every rule the project meant to adopt.'
        )
        continue
      }
      // Selecting the same profile twice is the same selection. The set is what the
      // algebra is defined over, so a duplicate is absorbed rather than counted.
      if (!chosen.includes(name)) chosen.push(name)
    }
    // Sorted, so the resolved adoption reads the same however the manifest was written.
    adopted.set(kind, chosen.sort())
  }

  // ── the union ─────────────────────────────────────────────────────────────
  //
  // Absence is not adoption. A layer or profile the declaration does not mention
  // contributes nothing, which is what makes adding one to Coral a no-op for every
  // project until that project edits its own record.
  for (const [id, rule] of model.rules) {
    const scope = rule.scope
    if (!scope) continue
    if (model.kernel.has(id)) {
      selected.add(id)
      continue
    }
    const spec = selectable.get(scope.kind)
    if (!spec) continue // governance, or a layer the taxonomy already complained about
    const chosen = adopted.get(scope.kind)
    const isAdopted =
      spec.form === ADOPT_FLAG ? chosen === true : Array.isArray(chosen) && chosen.includes(scope.profile)
    if (!isAdopted) continue
    // Scale is the second gate and it is not optional. A standalone CLI that adopts the
    // production baseline is adopting the rules for building one app, not the rules for
    // several apps composing over a channel — and the runtime-agent layer splits the same
    // way, with its app rules in an appendix and `[ORCH-4..6]` at system scale.
    if (!scales.has(rule.scale)) continue
    selected.add(id)
  }

  // ── project records ───────────────────────────────────────────────────────
  const families = new Set()
  for (const id of model.rules.keys()) {
    const m = FAMILY_RE.exec(id)
    if (m) families.add(m[1])
  }

  declaration.exceptions.forEach((entry, i) => {
    const at = `exceptions[${i}]`
    const id = entry.rule
    if (typeof id !== 'string' || !ENTRY_ID_RE.test(id)) {
      problems.push(`${at} names no Coral rule ID. An exception is attributable to one rule ([VER-5]).`)
      return
    }
    if (!model.rules.has(id)) {
      problems.push(
        `${at} excepts \`${id}\`, which Coral ${declaration.targets} does not define. Check the ID,` +
          ' or the version this project targets.'
      )
      return
    }
    // A `[guide]` rule is rationale, not instruction: it appears in no Agent Execution
    // Contract, it is never a finding, and there is therefore nothing for an exception to
    // excuse. Accepting one would record a deviation from a rule nobody could have been in
    // breach of — and it would be invisible in exactly the place it matters, because a
    // generated execution contract lists the normative rules and would either omit the
    // decision or carry a decision about a rule that is not in the file. Checked BEFORE the
    // stale-entry test below, because "adopt the layer" is the wrong advice here: adopting
    // the guide's layer would not make the exception mean anything.
    if (!isNormative(model.rules.get(id))) {
      const cls = model.rules.get(id).cls
      const what = cls ? `is \`[${cls}]\`` : 'carries no enforcement class'
      problems.push(
        `${at} excepts \`${id}\`, which ${what} and is therefore not normative. A \`[${GUIDE}]\` is` +
          ' rationale rather than instruction — it appears in no Agent Execution Contract and is' +
          ' never reported as a violation — so an exception to it excuses nothing. Delete the entry;' +
          ' if the intent was to record a trade-off, the prose below the block is where it belongs' +
          ' ([VER-5]).'
      )
      return
    }
    // The stale-entry check, and the reason it is an error. An exception to a rule the
    // project never selected excuses nothing today and would silently start excusing
    // something the day the project adopts that layer — a dormant override nobody
    // re-decided. Adopting the layer is the moment to decide whether the exception is
    // still wanted, so the record must not be able to pre-answer it.
    if (!selected.has(id)) {
      problems.push(
        `${at} excepts \`${id}\`, which is not in this project's selected rule set: it belongs to` +
          ` \`${scopeDescription(model, id)}\`, which this project has not adopted at a scale it` +
          ' works at. An exception to a rule that does not apply excuses nothing now and would' +
          ' start excusing something the day the layer is adopted, without anyone deciding that.' +
          ' Remove it, or adopt the layer.'
      )
      return
    }
    // No `allowRoot`: a Coral rule declined everywhere is an amendment, not an exception.
    const bad = pathProblem(entry.path)
    if (bad) {
      problems.push(`${at} ${bad}`)
      return
    }
    exceptions.push({ ...entry, rule: id, path: normalizePath(entry.path) })
  })

  declaration.extensions.forEach((entry, i) => {
    const at = `extensions[${i}]`
    const id = entry.rule
    if (typeof id !== 'string' || !ENTRY_ID_RE.test(id)) {
      problems.push(
        `${at} names no rule ID. A project rule carries an ID of its own so a finding can cite it` +
          ' ([VER-4], [VER-5]).'
      )
      return
    }
    // An extension ADDS a rule Coral does not have. Letting it carry a Coral ID, or a
    // Coral family name, would make "extension" a way to redefine a Coral rule in place —
    // an override with no record that anything was overridden. Replacing a Coral
    // requirement is written as it actually is: an exception to the Coral rule, plus a
    // project rule of the project's own.
    if (model.rules.has(id)) {
      problems.push(
        `${at} declares \`${id}\`, which is a Coral rule. An extension adds a rule Coral does not` +
          ' have; it never redefines one. To replace a Coral requirement, record an exception to' +
          ' the Coral rule AND a project rule under your own prefix — two entries, because they' +
          ' are two decisions ([VER-4]).'
      )
      return
    }
    const family = FAMILY_RE.exec(id)?.[1]
    if (family && families.has(family)) {
      problems.push(
        `${at} declares \`${id}\`, which reuses the Coral family \`${family}\`. A project rule is` +
          ` namespaced by a project prefix — \`ACME-1\`, not \`${family}-99\` — or it collides the` +
          ' day Coral adds that number, silently, with two documents holding one citation ([VER-4]).'
      )
      return
    }
    if (typeof entry.statement !== 'string' || !entry.statement.trim()) {
      problems.push(`${at} states no rule. An extension records the rule itself, stated as a rule.`)
      return
    }
    // One ID, one definition — the property that makes a project citation mean something.
    //
    // An extension entry does not merely SELECT a rule the way an exception selects a Coral
    // one; it *defines* the rule. Two entries under one ID are therefore two different rules
    // answering to one citation, and effectiveRulesAt() reduces both to the string `ACME-1`
    // with no way to say which was meant. At a path both entries cover, "the complete rule set
    // is derivable deterministically" simply stops being true.
    //
    // Rejected regardless of path, and deliberately so: differing paths are the case that looks
    // most reasonable and is exactly as ambiguous, because the two definitions overlap wherever
    // one path contains the other. A project rule that genuinely covers several disjoint
    // subtrees needs a schema that says so; until one exists, give the rules separate IDs.
    const already = extensions.find((e) => e.rule === id)
    if (already) {
      problems.push(
        `${at} declares \`${id}\` a second time (already defined for \`${already.path}\`). An` +
          ' extension DEFINES a project rule, so two entries under one ID are two rules answering' +
          ' to one citation — and a finding citing it would name neither. Give them separate IDs,' +
          ' or state one rule once at a path that covers both places.'
      )
      return
    }
    // `allowRoot`: a project rule of the project's own may legitimately bind the whole
    // repository, and Coral has no claim on it either way.
    const bad = pathProblem(entry.path, { allowRoot: true })
    if (bad) {
      problems.push(`${at} ${bad}`)
      return
    }
    extensions.push({ ...entry, rule: id, path: normalizePath(entry.path) })
  })

  return problems.length ? invalid() : valid()
}

/** How a rule's ownership reads in an error message: `app profile · cli`, `production baseline`. */
function scopeDescription(model, id) {
  const scope = model.rules.get(id)?.scope
  if (!scope) return 'an unresolved scope'
  const where = scope.profile ? `${scope.label} · ${scope.profile}` : scope.label
  return `${where} (${model.rules.get(id).scale} scale)`
}

/**
 * The rules in force at one source path.
 *
 *     effective = selected Coral rules
 *               - exceptions whose path covers this one
 *               + extensions whose path covers this one
 *
 * Per path, and only per path. An exception scoped to `internal/billing` says nothing
 * about the rest of the repository, so the Coral rule it names is still in force
 * everywhere else — removing it globally would let one deliberate trade-off quietly
 * become a project-wide policy.
 *
 * **Refuses an invalid resolution outright.** The alternative — reading `diagnostic.selected`
 * when `ok` is false — is the one mistake that turns a reported configuration problem back
 * into a normative-looking rule set, and it should not be reachable by forgetting a check. A
 * throw rather than an empty answer, because an empty effective set reads as "this path owes
 * nothing", which is a different and equally wrong claim.
 *
 * @param {ReturnType<typeof resolveApplicability>} resolution a VALID resolution (`ok: true`)
 * @param {string} target a repo-relative source path
 * @returns {{coral: string[], suppressed: string[], extensions: string[]}} sorted, so the
 *   result is a function of the declaration's content and not of its order.
 * @throws {TypeError} if the resolution is invalid
 */
export function effectiveRulesAt(resolution, target) {
  if (!resolution?.ok) {
    throw new TypeError(
      'effectiveRulesAt(): this resolution is not valid, so it names no normative rule set —' +
        ` there is nothing in force at \`${target}\` to report. Fix the declaration first:\n` +
        (resolution?.problems ?? ['no resolution was produced at all']).map((p) => `  - ${p}`).join('\n')
    )
  }
  const suppressed = new Set()
  for (const e of resolution.exceptions) {
    if (pathApplies(e.path, target)) suppressed.add(e.rule)
  }
  const local = new Set()
  for (const e of resolution.extensions) {
    if (pathApplies(e.path, target)) local.add(e.rule)
  }
  const sort = (set) => [...set].sort()
  return {
    coral: sort(new Set([...resolution.selected].filter((id) => !suppressed.has(id)))),
    suppressed: sort(suppressed),
    extensions: sort(local),
  }
}

/**
 * Resolve an adherence record's text against a rule model — the whole path in one call.
 *
 * The ordering the two steps have to be in: read the target, refuse a record for another
 * release on that ground alone, enforce this release's schema, then compose. Callers that
 * hand-roll the sequence are the ones that get it backwards, so there is one function that
 * does not.
 *
 * @param {string} text the whole `CORAL.md`
 * @param {ReturnType<import('./rules.mjs').loadRuleModel>} model
 * @returns {ReturnType<typeof resolveApplicability>}
 */
export function resolveAdherence(text, model) {
  // Throws if the model cannot identify itself — the precondition, checked before anything
  // is read off the file.
  const { declaration, problems } = parseAdherenceRecord(text, model?.version)
  if (!declaration) {
    // The parser has already said exactly what is wrong, and the resolver's
    // "no adherence declaration … ([VER-6])" must NOT be stacked on top of it. For a record
    // written against an earlier release that sentence would be a `[VER-6]` finding against a
    // project whose target predates `[VER-6]` — the retroactive application this ordering
    // exists to prevent, reintroduced by an error message.
    return {
      ok: false,
      version: model.version,
      problems,
      diagnostic: {
        selected: new Set(),
        adopted: new Map(),
        scales: new Set(),
        exceptions: [],
        extensions: [],
      },
    }
  }
  return resolveApplicability(declaration, model)
}

/**
 * Read a project's adherence record from disk and resolve it.
 *
 * A missing file is the headline failure this module exists to make loud. It is reported
 * with the same sentence a malformed one gets, because they are the same situation from
 * the auditor's side: nobody said what applies here.
 *
 * @param {string} projectDir
 * @param {ReturnType<import('./rules.mjs').loadRuleModel>} model
 * @returns {ReturnType<typeof resolveApplicability>}
 */
export function loadApplicability(projectDir, model) {
  const abs = path.join(projectDir, ADHERENCE_FILE)
  if (!fs.existsSync(abs)) return resolveApplicability(null, model)
  return resolveAdherence(fs.readFileSync(abs, 'utf8'), model)
}

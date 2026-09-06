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
//   · it FAILS CLOSED. A missing declaration, an unknown ownership key, an unregistered
//     profile, an unknown scale, an exception to a rule the project never selected —
//     every one of them is a reported problem, and none of them has a default. There is
//     no path through this file that guesses what a project meant.
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

import { GOVERNANCE, ID_CORE, OPT_IN, kernelLayerOf } from './rules.mjs'

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
 * Parse and shape-check an adherence record.
 *
 * This layer knows nothing about Coral's vocabulary — it validates that the record IS a
 * record: the block parses as YAML, the required keys are present, and every value has
 * the type its key promises. Whether `cli` is a registered profile is
 * resolveApplicability()'s question, because only that function has the rule model.
 *
 * The split matters for the error a reader gets. "your YAML has a list where a boolean
 * belongs" and "`clii` is not a registered app profile" are different mistakes with
 * different fixes, and a single pass that reported both as "invalid declaration" would
 * make the first one look like the second.
 *
 * @param {string} text the whole `CORAL.md`
 * @returns {{declaration: Declaration|null, problems: string[]}}
 */
export function parseAdherenceRecord(text) {
  const { body, problems } = adherenceBlock(text)
  if (body === null) return { declaration: null, problems }

  let doc
  try {
    doc = parseYaml(body)
  } catch (e) {
    problems.push(`the \`\`\`yaml coral block is not valid YAML: ${e.message}`)
    return { declaration: null, problems }
  }
  if (!isMapping(doc)) {
    problems.push(
      'the ```yaml coral block must be a mapping with `targets`, `scales` and `adopts` at the top' +
        ' level.'
    )
    return { declaration: null, problems }
  }

  const KNOWN = ['targets', 'scales', 'adopts', 'exceptions', 'extensions']
  for (const key of Object.keys(doc)) {
    if (!KNOWN.includes(key)) {
      problems.push(
        `\`${key}\` is not a field of the adherence record. It holds ${KNOWN.join(', ')} and` +
          ' nothing else — a misspelled field that was quietly ignored is a decision nobody made.'
      )
    }
  }

  // `targets` — required, and a string. A YAML scalar `0.6` parses as a number and would
  // silently become "0.6", so the type is checked rather than coerced.
  const targets = doc.targets
  if (typeof targets !== 'string' || !/^\d+\.\d+\.\d+$/.test(targets)) {
    problems.push(
      '`targets` must name the Coral version this project is audited against, as a quoted' +
        ' three-part version ([VER-3]) — `targets: "0.6.0"`.'
    )
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

  if (problems.length) return { declaration: null, problems }
  return { declaration: { targets, scales, adopts, exceptions, extensions }, problems }
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

/** Trailing slashes and a leading `./` removed, so one directory has one spelling. */
const normalizePath = (p) => p.replace(/^\.\//, '').replace(/\/+$/, '')

/**
 * Why `p` is not a usable entry path, or null if it is one.
 *
 * @returns {string|null}
 */
export function pathProblem(p) {
  if (typeof p !== 'string' || !p.trim()) {
    return 'names no path. Both record types are scoped to a path ([VER-5]): an entry with no path' +
      ' excuses a habit rather than a place.'
  }
  const raw = p.trim()
  if (GLOB_CHARS.test(raw)) {
    return `names the path \`${raw}\`, which is a pattern rather than a place. A path is a` +
      ' repo-relative directory and matches that directory and everything under it; patterns' +
      ' would need a precedence between overlapping entries, and there is deliberately none.'
  }
  if (raw.startsWith('/') || /^[A-Za-z]:/.test(raw) || raw.includes('\\')) {
    return `names the path \`${raw}\`, which is not repo-relative. A path is resolved against the` +
      ' repository root so the record means the same thing on every machine.'
  }
  const norm = normalizePath(raw)
  if (!norm || norm === '.') {
    return 'scopes to the whole repository. That is not an exception or a local extension, it is a' +
      ' statement about the rule itself — file an amendment (CONVENTIONS.md, "Three kinds of' +
      ' divergence") instead.'
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
 */
export function pathApplies(scope, target) {
  const a = normalizePath(String(scope).trim())
  const b = normalizePath(String(target).trim())
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
 * @param {Declaration} declaration
 * @param {ReturnType<import('./rules.mjs').loadRuleModel>} model the rule model for the
 *   version the declaration targets. Resolving the target version is the CALLER's job and
 *   happens first: applying current-main rules to a project pinned to an older release is
 *   the failure `[VER-3]` exists to prevent, and this function cannot detect it from a
 *   model alone. Pass `version` to have the mismatch checked.
 * @param {{version?: string}} [options]
 * @returns {{selected: Set<string>, adopted: Map<string,boolean|string[]>, scales: Set<string>,
 *            exceptions: Entry[], extensions: Entry[], problems: string[]}}
 *
 * **A non-empty `problems` makes the whole result diagnostic, not normative.** A caller that
 * ignores it and audits against `selected` anyway has audited against a set nobody declared —
 * which is the failure this module exists to prevent, arriving one layer later. The partial
 * selection is returned rather than emptied so a tool can say *what* the project would have
 * owed had the record been valid; it is never the surface to report findings against.
 */
export function resolveApplicability(declaration, model, options = {}) {
  const problems = []
  const selected = new Set()
  const adopted = new Map()
  const scales = new Set()
  const exceptions = []
  const extensions = []
  // One live result object, returned from every exit. An early failure returns it half-
  // filled rather than returning a different shape, so a caller never has to branch on which
  // kind of failure it got before it can read `problems`.
  const resolved = () => ({ selected, adopted, scales, exceptions, extensions, problems })

  if (!declaration) {
    problems.push(
      `no adherence declaration. A project with no readable \`${ADHERENCE_FILE}\` record has an` +
        ' **undeclared normative surface**: which Coral rules bind it is unknown, and that is a' +
        ' configuration finding to fix rather than a licence to audit against everything Coral' +
        ' publishes ([VER-6]).'
    )
    return resolved()
  }
  if (options.version && declaration.targets !== options.version) {
    problems.push(
      `the project targets Coral ${declaration.targets}, but this rule model is Coral` +
        ` ${options.version}. Resolve the target version first and compose from that version's` +
        ' rules ([VER-3]) — a project does not acquire a rule by standing still.'
    )
    return resolved()
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
    const bad = pathProblem(entry.path)
    if (bad) {
      problems.push(`${at} ${bad}`)
      return
    }
    exceptions.push({ ...entry, rule: id, path: normalizePath(entry.path.trim()) })
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
    const bad = pathProblem(entry.path)
    if (bad) {
      problems.push(`${at} ${bad}`)
      return
    }
    extensions.push({ ...entry, rule: id, path: normalizePath(entry.path.trim()) })
  })

  return resolved()
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
 * @param {ReturnType<typeof resolveApplicability>} resolution
 * @param {string} target a repo-relative source path
 * @returns {{coral: string[], suppressed: string[], extensions: string[]}} sorted, so the
 *   result is a function of the declaration's content and not of its order.
 */
export function effectiveRulesAt(resolution, target) {
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
 * Read a project's adherence record and resolve it — the whole path, for a caller that
 * has a directory rather than a string.
 *
 * A missing file is the headline failure this module exists to make loud. It is reported
 * with the same sentence a malformed one gets, because they are the same situation from
 * the auditor's side: nobody said what applies here.
 *
 * @param {string} projectDir
 * @param {ReturnType<import('./rules.mjs').loadRuleModel>} model
 * @param {{version?: string}} [options]
 */
export function loadApplicability(projectDir, model, options = {}) {
  const abs = path.join(projectDir, ADHERENCE_FILE)
  if (!fs.existsSync(abs)) {
    return resolveApplicability(null, model, options)
  }
  const { declaration, problems } = parseAdherenceRecord(fs.readFileSync(abs, 'utf8'))
  const resolution = resolveApplicability(declaration, model, options)
  resolution.problems.unshift(...problems)
  return resolution
}

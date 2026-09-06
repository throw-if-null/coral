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
// caller can reach by forgetting a check.
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs'
import path from 'node:path'

import { ADHERENCE_FILE, ROOT_PATH, loadApplicability } from './applicability.mjs'
import { extractStatements, isNormative, loadRuleModel } from './rules.mjs'

/** The file a consuming project generates into its root. */
export const CONTRACT_FILE = 'CORAL-CONTRACT.md'

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

/** Path first, then rule ID — the order a reader scans a register of decisions in. */
const compareEntries = (a, b) =>
  a.path === b.path ? compareRuleIds(a.rule, b.rule) : a.path < b.path ? -1 : 1

// ─────────────────────────────────────────────────────────────────────────────
// Rendering.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * How a path reads in the contract.
 *
 * Subtrees, not globs — `[VER-5]` paths are directories that cover themselves and
 * everything beneath them, and PO-04 refuses glob syntax outright. Writing `internal/**`
 * here would show the reader a pattern language the record does not have.
 */
const pathPhrase = (p) => (p === ROOT_PATH ? 'the whole repository' : `\`${p}\` and descendants`)

/** One contract line, in the shape every Agent Execution Contract in Coral already uses. */
const ruleLine = (id, statement) => `- \`[${id}]\` ${statement}`

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

  const exceptions = [...resolution.exceptions].sort(compareEntries)
  const extensions = [...resolution.extensions].sort(compareEntries)
  const scales = [...resolution.scales].sort()
  const adopts = adoptionSummary(resolution.adopted)

  // ── the document ──────────────────────────────────────────────────────────
  const out = [
    '# Coral project execution contract',
    '',
    `Generated from \`${ADHERENCE_FILE}\` by \`${GENERATE_COMMAND}\`. **Do not edit this file.**`,
    `Change \`${ADHERENCE_FILE}\` and regenerate it.`,
    '',
    `- Coral: \`${model.version}\``,
    `- Scales: ${scales.map((s) => `\`${s}\``).join(', ')}`,
    `- Adopts: ${adopts.length ? adopts.join(', ') : 'nothing beyond the kernel'}`,
    '',
    'This is the complete normative Coral surface of this project: every applicable `[auto]` and',
    '`[review]` rule, stated once. A Coral rule that is not listed here does not apply to this',
    'project — it belongs to a scale, a layer or a profile this project has not adopted. `[guide]`',
    'rules are rationale rather than instruction and are not listed at all.',
    '',
    '## Rules',
    '',
    ...ids.map((id) => ruleLine(id, statements.get(id).trim())),
  ]

  if (exceptions.length) {
    out.push(
      '',
      '## Accepted exceptions',
      '',
      'These are recorded project decisions, already made. Do not report the named Coral rule as a',
      'violation at the stated path or below, and do not raise it again. Each rule stays listed under',
      '**Rules** above because an exception is scoped to a path: it remains in force everywhere else.',
      ''
    )
    for (const e of exceptions) {
      out.push(`- \`[${e.rule}]\` — ${pathPhrase(e.path)}`)
      for (const [field, label] of DECISION_FIELDS) {
        const value = e[field]
        if (value === undefined || value === null || String(value).trim() === '') continue
        out.push(`  - ${label}: ${String(value).trim()}`)
      }
    }
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
    for (const e of extensions) {
      out.push(`- \`[${e.rule}]\` — ${pathPhrase(e.path)}`)
      out.push(`  - ${String(e.statement).trim()}`)
    }
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
}

/**
 * Generate and write `CORAL-CONTRACT.md` into a project.
 *
 * Writes nothing at all on failure — the file on disk is either the current contract or
 * the previous one, never a plausible-looking partial.
 *
 * @returns {{ok: true, file: string, markdown: string, problems: []}
 *          | {ok: false, problems: string[]}}
 */
export function writeExecutionContract(coralDir, projectDir, outFile) {
  const result = loadExecutionContract(coralDir, projectDir)
  if (!result.ok) return result
  const file = outFile ?? path.join(projectDir, CONTRACT_FILE)
  fs.writeFileSync(file, result.markdown)
  return { ...result, file }
}

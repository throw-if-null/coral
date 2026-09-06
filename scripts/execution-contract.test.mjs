// ─────────────────────────────────────────────────────────────────────────────
// Tests for the project execution contract — `node --test scripts/`, wired into the
// build.
//
// Two tiers, the same split the applicability tests use and for the same reason. The
// SYNTHETIC tier builds a whole fixture repository whose vocabulary is not Coral's —
// `core`, `base-rules`, `shape:widget`, `lang:zeta`, scales `small` and `large` — so a
// test says something about the generator rather than about today's profile names.
// Registering a language binding is the point of that tier and not an incidental
// detail: Coral has no language-binding rules today, and an implementation proved only
// against an empty layer is proved against nothing.
//
// The REPOSITORY tier at the bottom runs the whole `loadRuleModel -> applicability ->
// generator` path over Coral's own documents and its own worked `CORAL.md`, which is
// the only place the fixtures cannot speak for: that the statements a real contract
// emits are real sentences, and that a real CLI project's contract carries no backend,
// web, library, action, system or governance rule.
//
// The property most of these tests are really about is ABSENCE. A rule that leaks in
// is easy to see; a profile that leaks in through a heading, a metadata line or a
// statement's wording is not, so the leakage assertions search the whole file rather
// than the rule list.
// ─────────────────────────────────────────────────────────────────────────────
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import test from 'node:test'

import { stringify } from 'yaml'

import {
  KERNEL_END,
  KERNEL_START,
  LAYERS_END,
  LAYERS_START,
  PROFILES_END,
  PROFILES_START,
  SCALES_END,
  SCALES_START,
  extractStatements,
  loadRuleModel,
} from './rules.mjs'
import {
  ADHERENCE_EXAMPLE_END,
  ADHERENCE_EXAMPLE_START,
  ADHERENCE_FILE,
  resolveAdherence,
} from './applicability.mjs'
import {
  CONTRACT_FILE,
  CONTRACT_HEADING,
  CONTRACT_MARKER,
  CONTRACT_PREAMBLE,
  compareRuleIds,
  createTempFile,
  isGeneratedContract,
  executionContract,
  inlineCode,
  inlineText,
  loadExecutionContract,
  writeExecutionContract,
} from './execution-contract.mjs'
import { coralVersion } from './version.mjs'

const REPO = path.resolve(import.meta.dirname, '..')
// The WORKING version: these tests resolve records against the model this tree
// describes, which between releases is not the rule set `VERSION` names.
const VERSION = coralVersion(REPO).working

// ── a fixture repository ─────────────────────────────────────────────────────
//
// Shaped like Coral's without borrowing its words. What it has that the applicability
// fixture does not: a `[guide]` rule in three different layers, so "guides are never
// emitted" is tested where a guide can reach the selection; and a REGISTERED language
// binding, so the layer that is empty in Coral today is not empty here.

const FIXTURE_VERSION = '9.9.9'

const LAYER_HEADER = [
  '| Layer | Key | Tag | Surface | Contract scope | Read by | Justified by |',
  '|---|---|---|---|---|---|---|',
]
const LAYER_ROWS = [
  '| the core | `core` | — | conformance | unscoped | everyone | the operating model |',
  '| base rules | `base-rules` | `{base}` | opt-in | profile-scoped | adopters | software |',
  '| meta rules | `meta-rules` | `{meta}` | governance | unscoped | maintainers | the framework |',
  '| shape profile | `shape-profile` | `{shape:…}` | opt-in | profile-scoped | shapes | a shape |',
  '| language binding | `language-binding` | `{lang:…}` | opt-in | profile-scoped | a lang | it |',
  '| runtime overlay | `runtime-overlay` | `{runtime}` | opt-in | profile-scoped | runtimes | a runtime |',
]
const SCALE_HEADER = ['| Scale | Key | Stated in | Read by | Justified by |', '|---|---|---|---|---|']
const SCALE_ROWS = [
  '| small | `small` | — | one unit | the unit itself |',
  '| large | `large` | `SPREAD.md` | many units | what only exists between units |',
]
const PROFILE_HEADER = ['| Profile | Rules live in | What it covers |', '|---|---|---|']
const PROFILE_ROWS = [
  '| `{shape:widget}` | `appendix/widget.md` | Widget-shaped applications. |',
  '| `{shape:gadget}` | `appendix/gadget.md` | Gadget-shaped applications. |',
  '| `{lang:zeta}` | `appendix/zeta.md` | Projects written in Zeta. |',
]
const KERNEL_HEADER = ['| Rule | Why | Properties |', '|---|---|---|']

// Every statement below carries a word that occurs nowhere else in the fixture, so a
// leakage assertion can search for the WORDING and not only for the rule ID. A profile
// that leaks in through a heading or through another rule's prose is the failure that
// an ID-only search cannot see.
const conventions = () =>
  [
    '# Conventions',
    '',
    '**`[K-1]` `[auto]`** — every unit declares its purpose in a manifest.',
    '**`[K-2]` `[review]`** — keep the entry point thin and delegate outward.',
    '**`[K-3]` `[guide]`** — the kernel rationale about tectonics, which instructs nobody.',
    '',
    LAYERS_START,
    '',
    ...LAYER_HEADER,
    ...LAYER_ROWS,
    '',
    LAYERS_END,
    '',
    SCALES_START,
    '',
    ...SCALE_HEADER,
    ...SCALE_ROWS,
    '',
    SCALES_END,
    '',
    KERNEL_START,
    '',
    ...KERNEL_HEADER,
    '| `[K-1]` | because | locality |',
    '| `[K-2]` | because | locality |',
    '| `[K-3]` | because | locality |',
    '',
    KERNEL_END,
    '',
    PROFILES_START,
    '',
    ...PROFILE_HEADER,
    ...PROFILE_ROWS,
    '',
    PROFILES_END,
    '',
  ].join('\n')

function fixture(overrides = {}) {
  const { version = FIXTURE_VERSION, extra = {} } = overrides
  return {
    VERSION: `${version}\n`,
    'CHANGELOG.md': '# Changelog\n\n## Unreleased\n',
    'CONVENTIONS.md': conventions(),
    'ARCHITECTURE.md': [
      '# Unit',
      '',
      '**`[BASE-1]` `[review]` `{base}`** — one unit keeps its ledger private.',
      '**`[BASE-3]` `[guide]` `{base}`** — baseline rationale about sedimentation, which instructs nobody.',
      '**`[META-1]` `[review]` `{meta}`** — governance about quarterly stewardship of the framework.',
      '',
    ].join('\n'),
    'SPREAD.md': [
      '# Spread',
      '',
      '**`[BASE-2]` `[review]` `{base}`** — several units version the crossing they publish.',
      '**`[RT-2]` `[review]` `{runtime}`** — the harness bounds every dispatch across units.',
      '',
    ].join('\n'),
    'appendix/widget.md': [
      '# Widget',
      '',
      '**`[WID-1]` `[review]` `{shape:widget}`** — a widget renders its dials without blocking.',
      '**`[WID-2]` `[guide]` `{shape:widget}`** — widget rationale about knurling, which instructs nobody.',
      '',
    ].join('\n'),
    'appendix/gadget.md': [
      '# Gadget',
      '',
      '**`[GAD-1]` `[auto]` `{shape:gadget}`** — a gadget names its flywheel explicitly.',
      '',
    ].join('\n'),
    'appendix/zeta.md': [
      '# Zeta',
      '',
      '**`[ZETA-1]` `[auto]` `{lang:zeta}`** — a Zeta unit pins its comptime allocator.',
      '',
    ].join('\n'),
    'appendix/runtime.md': [
      '# Runtime',
      '',
      '**`[RT-1]` `[review]` `{runtime}`** — one unit caps the tokens a single dispatch may spend.',
      '',
    ].join('\n'),
    ...extra,
  }
}

/** Words that must not appear in a contract that did not select the thing they belong to. */
const LEAK_WORDS = {
  gadget: ['GAD-1', 'gadget', 'flywheel'],
  zeta: ['ZETA-1', 'zeta', 'Zeta', 'comptime'],
  widget: ['WID-1', 'widget', 'dials'],
  large: ['BASE-2', 'crossing'],
  runtimeSmall: ['RT-1', 'tokens'],
  runtimeLarge: ['RT-2', 'dispatch across'],
  governance: ['META-1', 'stewardship'],
  guides: ['K-3', 'BASE-3', 'WID-2', 'tectonics', 'sedimentation', 'knurling'],
}

function inTree(tree, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coral-contract-'))
  try {
    for (const [rel, text] of Object.entries(tree)) {
      fs.mkdirSync(path.join(dir, path.dirname(rel)), { recursive: true })
      fs.writeFileSync(path.join(dir, rel), text)
    }
    return fn(dir)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

/** A `CORAL.md`, rendered from an object so a test controls key order exactly. */
const record = (declaration) =>
  ['# Coral adherence', '', '```yaml coral', stringify(declaration).trimEnd(), '```', ''].join('\n')

/**
 * Generate a contract for one declaration against the fixture repository, through the
 * whole public path: rule model, applicability, generator. The tests never assemble a
 * resolution by hand, because a hand-assembled one would not be testing the integration
 * the generator is supposed to be a layer over.
 */
function generate(declaration, overrides = {}) {
  return inTree(fixture(overrides), (coral) =>
    inTree({ [ADHERENCE_FILE]: record(declaration) }, (project) =>
      loadExecutionContract(coral, project)
    )
  )
}

/** A generated contract asserted valid; returns its Markdown. */
function contract(declaration, overrides) {
  const result = generate(declaration, overrides)
  assert.equal(result.ok, true, `expected a contract:\n${result.problems?.join('\n')}`)
  assert.deepEqual(result.problems, [])
  return result.markdown
}

/** A generation asserted to have failed, and to have produced no contract at all. */
function refused(declaration, overrides) {
  const result = generate(declaration, overrides)
  assert.equal(result.ok, false, 'a contract was generated from an unresolvable project')
  assert.ok(result.problems.length)
  assert.equal(result.markdown, undefined, 'a failed generation exposed Markdown')
  return result
}

/** The rule IDs the contract's `## Rules` section lists, in file order. */
function listedRules(markdown) {
  const start = markdown.indexOf('\n## Rules\n')
  assert.ok(start !== -1, 'the contract has no Rules section')
  const rest = markdown.slice(start + 1)
  const end = rest.indexOf('\n## ')
  const body = end === -1 ? rest : rest.slice(0, end)
  return [...body.matchAll(/^- `\[([A-Z][A-Z-]*-\d+)\]`/gm)].map((m) => m[1])
}

/** Assert none of these strings occurs ANYWHERE in the file — headings and metadata included. */
function absent(markdown, words, why) {
  for (const w of words) {
    assert.ok(!markdown.includes(w), `\`${w}\` leaked into the contract (${why})`)
  }
}

const kernelOnly = { targets: FIXTURE_VERSION, scales: ['small'], adopts: {} }
const NORMATIVE_KERNEL = ['K-1', 'K-2']

// ── 1. kernel only ───────────────────────────────────────────────────────────

test('a kernel-only project gets the normative kernel and nothing else', () => {
  const md = contract(kernelOnly)
  assert.deepEqual(listedRules(md), NORMATIVE_KERNEL)
  assert.ok(md.includes('- `[K-1]` every unit declares its purpose in a manifest.'))
  assert.ok(md.includes('Adopts: nothing beyond the kernel'))
})

test('a kernel-only contract emits no exception or extension section', () => {
  const md = contract(kernelOnly)
  assert.ok(!md.includes('## Accepted exceptions'))
  assert.ok(!md.includes('## Project extensions'))
})

// ── 2. the production baseline ───────────────────────────────────────────────

test('adopting the baseline at one scale brings that scale and not the other', () => {
  const md = contract({ ...kernelOnly, adopts: { 'base-rules': true } })
  assert.deepEqual(listedRules(md), ['BASE-1', 'K-1', 'K-2'])
  absent(md, LEAK_WORDS.large, 'the large scale was not declared')
})

test('declaring both scales brings both halves of the baseline', () => {
  const md = contract({
    ...kernelOnly,
    scales: ['small', 'large'],
    adopts: { 'base-rules': true },
  })
  assert.deepEqual(listedRules(md), ['BASE-1', 'BASE-2', 'K-1', 'K-2'])
})

// ── 3-4. profiles ────────────────────────────────────────────────────────────

test('one adopted profile contributes its rules; the sibling profile leaves no trace', () => {
  const md = contract({ ...kernelOnly, adopts: { 'shape-profile': ['widget'] } })
  assert.deepEqual(listedRules(md), ['K-1', 'K-2', 'WID-1'])
  absent(md, LEAK_WORDS.gadget, 'the gadget profile was not adopted')
})

test('two profiles of one layer compose by union, with no precedence anywhere in the file', () => {
  const md = contract({ ...kernelOnly, adopts: { 'shape-profile': ['widget', 'gadget'] } })
  assert.deepEqual(listedRules(md), ['GAD-1', 'K-1', 'K-2', 'WID-1'])
  // Union, not a stack: nothing in the document orders one profile against another or
  // says a rule is overridden. Contract order is rule ID order and carries no meaning.
  for (const word of ['overrides', 'takes precedence', 'wins over', 'first match']) {
    assert.ok(!md.includes(word), `the contract implies precedence: "${word}"`)
  }
})

test('the order profiles are declared in does not reach the contract', () => {
  const a = contract({ ...kernelOnly, adopts: { 'shape-profile': ['widget', 'gadget'] } })
  const b = contract({ ...kernelOnly, adopts: { 'shape-profile': ['gadget', 'widget'] } })
  assert.equal(a, b)
})

// ── 5. a registered language binding ─────────────────────────────────────────

test('a selected language binding contributes its rules', () => {
  const md = contract({ ...kernelOnly, adopts: { 'language-binding': ['zeta'] } })
  assert.deepEqual(listedRules(md), ['K-1', 'K-2', 'ZETA-1'])
  assert.ok(md.includes('a Zeta unit pins its comptime allocator.'))
})

test('an unselected language binding is absolutely absent, layer name included', () => {
  // The layer is REGISTERED and has a rule; the project simply did not take it. Nothing
  // about it may appear — not the rule, not the profile name, not a "no language binding
  // selected" line, which is the empty section this design refuses.
  const md = contract({ ...kernelOnly, adopts: { 'language-binding': [] } })
  assert.deepEqual(listedRules(md), NORMATIVE_KERNEL)
  absent(md, [...LEAK_WORDS.zeta, 'language-binding'], 'no language binding was selected')
})

// ── 6. a fixed opt-in layer spanning both scales ─────────────────────────────

test('a runtime overlay adopted at one scale keeps its other-scale rules out', () => {
  const md = contract({ ...kernelOnly, adopts: { 'runtime-overlay': true } })
  assert.deepEqual(listedRules(md), ['K-1', 'K-2', 'RT-1'])
  absent(md, LEAK_WORDS.runtimeLarge, 'the large scale was not declared')
})

test('declaring both scales brings both halves of the overlay', () => {
  const md = contract({
    ...kernelOnly,
    scales: ['small', 'large'],
    adopts: { 'runtime-overlay': true },
  })
  assert.deepEqual(listedRules(md), ['K-1', 'K-2', 'RT-1', 'RT-2'])
})

test('a runtime overlay left unadopted leaves nothing behind at either scale', () => {
  const md = contract({ ...kernelOnly, scales: ['small', 'large'], adopts: {} })
  absent(md, [...LEAK_WORDS.runtimeSmall, ...LEAK_WORDS.runtimeLarge], 'the overlay was not adopted')
})

// ── 7. guides ────────────────────────────────────────────────────────────────

test('`[guide]` rules are never emitted, in any layer, however much is adopted', () => {
  const md = contract({
    ...kernelOnly,
    scales: ['small', 'large'],
    adopts: {
      'base-rules': true,
      'shape-profile': ['widget', 'gadget'],
      'language-binding': ['zeta'],
      'runtime-overlay': true,
    },
  })
  // Everything selectable is selected, so this is the widest contract the fixture can
  // produce — and the three guides are still not in it.
  assert.deepEqual(listedRules(md), [
    'BASE-1',
    'BASE-2',
    'GAD-1',
    'K-1',
    'K-2',
    'RT-1',
    'RT-2',
    'WID-1',
    'ZETA-1',
  ])
  absent(md, LEAK_WORDS.guides, 'guides are rationale and instruct nobody')
})

test('a governance rule never reaches the contract either', () => {
  const md = contract({ ...kernelOnly, scales: ['small', 'large'], adopts: { 'base-rules': true } })
  absent(md, LEAK_WORDS.governance, 'framework governance is not an application surface')
})

// ── 8-9. path-scoped exceptions ──────────────────────────────────────────────

const withBase = (extra) => ({
  targets: FIXTURE_VERSION,
  scales: ['small'],
  adopts: { 'base-rules': true },
  ...extra,
})

test('an accepted exception is recorded as a path decision and does not remove the rule', () => {
  const md = contract(
    withBase({
      exceptions: [
        {
          rule: 'BASE-1',
          path: 'internal/billing',
          reason: 'two slices co-own the ledger while the split is in flight',
          decided_by: 'A. Reviewer',
          decided: '2026-08-18',
          revisit_when: 'the reconciliation slice lands',
        },
      ],
    })
  )
  // The rule is still a normative Coral rule of this project, listed once.
  assert.deepEqual(listedRules(md), ['BASE-1', 'K-1', 'K-2'])
  // And the decision is recorded once, with its scope and its context.
  assert.equal(md.split('## Accepted exceptions').length, 2)
  assert.ok(md.includes('- `[BASE-1]` — `internal/billing` and descendants'))
  assert.ok(md.includes('  - Reason: two slices co-own the ledger while the split is in flight'))
  assert.ok(md.includes('  - Decided by: A. Reviewer'))
  assert.ok(md.includes('  - Decided: 2026-08-18'))
  assert.ok(md.includes('  - Revisit when: the reconciliation slice lands'))
})

test('the exception section carries all three semantics, and does not defeat `revisit_when`', () => {
  // The behavioural requirement, and the trap in it. The contract alone must settle an
  // ACTIVE decision so an agent under the path stops re-raising it — but `revisit_when`
  // exists so a settled exception deliberately comes back for human re-evaluation once its
  // condition holds, and a blanket "do not raise it again" would make every revisit
  // condition dead text in the one document the agent reads. Three distinct instructions,
  // asserted separately so a later rewording cannot quietly drop the middle one.
  const md = contract(
    withBase({
      exceptions: [
        { rule: 'BASE-1', path: 'internal/billing', revisit_when: 'the reconciliation slice lands' },
      ],
    })
  )
  const section = md.slice(md.indexOf('## Accepted exceptions'))
  const prose = section.slice(0, section.indexOf('\n- `['))

  // 1. while it is applicable: an accepted decision, not an open finding.
  assert.match(prose, /Do not report the underlying Coral rule as an unresolved/)
  assert.match(prose, /while the recorded exception remains applicable/)
  assert.match(prose, /not re-litigate the decision/)
  // 2. once the condition is met: surface it, do not treat the decision as permanent.
  assert.match(prose, /`Revisit when` condition and that/)
  assert.match(prose, /surface the exception for human re-evaluation/)
  assert.match(prose, /rather than treating the/)
  assert.match(prose, /old decision as permanent/)
  // 3. outside the path: the Coral rule applies normally, which is why it is still listed.
  assert.match(prose, /stays listed under \*\*Rules\*\* above/)
  assert.match(prose, /outside that path the rule applies normally/)

  // And the condition it is talking about is actually rendered on the entry.
  assert.ok(section.includes('  - Revisit when: the reconciliation slice lands'))

  // The instruction that would defeat the revisit condition must not be there.
  assert.ok(!/do not raise it again/i.test(prose), 'the contract forbids ever raising the rule again')
})

test('an exception with no recorded context emits its scope and invents nothing', () => {
  const md = contract(withBase({ exceptions: [{ rule: 'BASE-1', path: 'internal/billing' }] }))
  assert.ok(md.includes('- `[BASE-1]` — `internal/billing` and descendants'))
  for (const label of ['Reason:', 'Decided by:', 'Decided:', 'Revisit when:']) {
    assert.ok(!md.includes(label), `the generator invented a \`${label}\` nobody recorded`)
  }
})

test('one rule excepted at two paths gives two decisions and one rule line', () => {
  const md = contract(
    withBase({
      exceptions: [
        { rule: 'BASE-1', path: 'internal/shipping', reason: 'second' },
        { rule: 'BASE-1', path: 'internal/billing', reason: 'first' },
      ],
    })
  )
  assert.deepEqual(listedRules(md), ['BASE-1', 'K-1', 'K-2'])
  const section = md.slice(md.indexOf('## Accepted exceptions'))
  assert.ok(section.includes('- `[BASE-1]` — `internal/billing` and descendants'))
  assert.ok(section.includes('- `[BASE-1]` — `internal/shipping` and descendants'))
  // Sorted by path, so the register does not reorder when the YAML does.
  assert.ok(section.indexOf('internal/billing') < section.indexOf('internal/shipping'))
})

test('a path is rendered as a subtree, never as a glob', () => {
  const md = contract(withBase({ exceptions: [{ rule: 'BASE-1', path: 'internal/billing' }] }))
  // A glob is not a path form `[VER-5]` has, and rendering one would advertise a pattern
  // language the record does not support. Checked on the scope phrases themselves, since
  // Markdown emphasis puts legitimate asterisks elsewhere in the file.
  const scopes = [...md.matchAll(/^- `\[[^\]]+\]` — (.*)$/gm)].map((m) => m[1])
  assert.deepEqual(scopes, ['`internal/billing` and descendants'])
  for (const s of scopes) assert.ok(!/[*?[\]{}]/.test(s), `a glob character reached \`${s}\``)
})

// The PO-04 correction PO-05 required. See the exceptions branch of resolveApplicability().

test('an exception to a `[guide]` rule is refused, so it can neither appear nor vanish', () => {
  const r = refused(
    withBase({ exceptions: [{ rule: 'BASE-3', path: 'internal/billing', reason: 'why' }] })
  )
  assert.ok(
    r.problems.some((p) => /is `\[guide\]` and is therefore not normative/.test(p)),
    r.problems.join('\n')
  )
})

test('the same refusal applies to a `[guide]` kernel rule, which is always selected', () => {
  const r = refused(withBase({ exceptions: [{ rule: 'K-3', path: 'internal/billing' }] }))
  assert.ok(
    r.problems.some((p) => /K-3/.test(p) && /not normative/.test(p)),
    r.problems.join('\n')
  )
})

// ── 10. project extensions ───────────────────────────────────────────────────

test('a project extension is emitted with its statement and its path', () => {
  const md = contract(
    withBase({
      extensions: [
        {
          rule: 'ACME-1',
          path: 'internal/billing',
          statement: 'every invoice writer logs the tenant id',
          reason: 'not something Coral covers',
          upstream: 'not-a-candidate',
        },
      ],
    })
  )
  const section = md.slice(md.indexOf('## Project extensions'))
  assert.ok(section.includes('- `[ACME-1]` — `internal/billing` and descendants'))
  assert.ok(section.includes('  - every invoice writer logs the tenant id'))
  // The statement is the normative content; the record's other fields are not execution
  // instructions and are left in `CORAL.md`.
  assert.ok(!md.includes('not-a-candidate'))
})

test('a root-scoped extension reads as project-wide', () => {
  const md = contract(
    withBase({
      extensions: [{ rule: 'ACME-2', path: '.', statement: 'every module names its owner' }],
    })
  )
  assert.ok(md.includes('- `[ACME-2]` — the whole repository'))
  assert.ok(!md.includes('`.` and descendants'), 'the root path rendered as a subtree')
})

test('extensions sort by path then ID, so the YAML order does not reach the file', () => {
  const entries = [
    { rule: 'ACME-3', path: 'internal/shipping', statement: 'three' },
    { rule: 'ACME-1', path: 'internal/billing', statement: 'one' },
    { rule: 'ACME-2', path: 'internal/billing', statement: 'two' },
  ]
  const a = contract(withBase({ extensions: entries }))
  const b = contract(withBase({ extensions: [...entries].reverse() }))
  assert.equal(a, b)
  const section = a.slice(a.indexOf('## Project extensions'))
  assert.deepEqual(
    [...section.matchAll(/- `\[(ACME-\d)\]`/g)].map((m) => m[1]),
    ['ACME-1', 'ACME-2', 'ACME-3']
  )
})

// ── 11-13. nothing partial ever reaches disk ─────────────────────────────────

test('a project with no CORAL.md produces no contract', () => {
  const result = inTree(fixture(), (coral) => inTree({ 'README.md': '# hi\n' }, (project) =>
    loadExecutionContract(coral, project)
  ))
  assert.equal(result.ok, false)
  assert.equal(result.markdown, undefined)
  assert.ok(result.problems.some((p) => /undeclared normative surface/.test(p)))
})

test('a CORAL.md with no `adopts` block produces no contract', () => {
  const r = refused({ targets: FIXTURE_VERSION, scales: ['small'] })
  assert.ok(r.problems.some((p) => /`adopts` must be a mapping/.test(p)))
})

test('an unknown profile propagates the PO-04 failure and yields no partial contract', () => {
  const r = refused({ ...kernelOnly, adopts: { 'shape-profile': ['widgett'] } })
  assert.ok(r.problems.some((p) => /`widgett` is not a registered/.test(p)))
})

test('an unknown ownership kind yields no partial contract', () => {
  const r = refused({ ...kernelOnly, adopts: { 'shape-profiles': ['widget'] } })
  assert.ok(r.problems.some((p) => /is not an ownership kind/.test(p)))
})

test('an unknown scale yields no partial contract', () => {
  const r = refused({ ...kernelOnly, scales: ['enormous'] })
  assert.ok(r.problems.some((p) => /is not an architectural scale/.test(p)))
})

test('a version mismatch is refused version-first, and emits nothing', () => {
  const r = refused({ ...kernelOnly, targets: '9.9.8' })
  assert.ok(
    r.problems.some((p) => /targets Coral 9\.9\.8, and this is the Coral 9\.9\.9 model/.test(p)),
    r.problems.join('\n')
  )
  // The version-first semantics: this is "load that release", not "your record is invalid".
  assert.ok(r.problems.some((p) => /Load Coral 9\.9\.8's rule set/.test(p)))
  assert.ok(!r.problems.some((p) => /`adopts` must be/.test(p)), 'a schema complaint outranked the target')
})

test('a rule model that does not validate produces no contract, never "all Coral rules"', () => {
  // A rule defined with no enforcement class: the model reports it, and the generator
  // must refuse rather than quietly treating the rule as non-normative and dropping it.
  const broken = fixture({
    extra: { 'appendix/broken.md': '# Broken\n\n**`[BASE-9]` `{base}`** — no class at all.\n' },
  })
  const result = inTree(broken, (coral) =>
    inTree({ [ADHERENCE_FILE]: record(kernelOnly) }, (project) =>
      loadExecutionContract(coral, project)
    )
  )
  assert.equal(result.ok, false)
  assert.equal(result.markdown, undefined)
  assert.ok(result.problems.some((p) => /did not validate/.test(p)), result.problems.join('\n'))
})

test('writeExecutionContract leaves no file behind when generation fails', () => {
  inTree(fixture(), (coral) =>
    inTree({ [ADHERENCE_FILE]: record({ ...kernelOnly, scales: ['enormous'] }) }, (project) => {
      const result = writeExecutionContract(coral, project)
      assert.equal(result.ok, false)
      assert.equal(fs.existsSync(path.join(project, CONTRACT_FILE)), false)
    })
  )
})

test('writeExecutionContract writes exactly what the generator returned', () => {
  inTree(fixture(), (coral) =>
    inTree({ [ADHERENCE_FILE]: record(kernelOnly) }, (project) => {
      const result = writeExecutionContract(coral, project)
      assert.equal(result.ok, true)
      assert.equal(result.file, path.join(project, CONTRACT_FILE))
      assert.equal(fs.readFileSync(result.file, 'utf8'), result.markdown)
    })
  )
})

// ── the pure layer's own preconditions ───────────────────────────────────────

test('executionContract refuses an invalid resolution rather than answering emptily', () => {
  const model = inTree(fixture(), loadRuleModel)
  const resolution = resolveAdherence(record({ ...kernelOnly, scales: ['enormous'] }), model)
  const result = executionContract({ model, resolution, statements: new Map() })
  assert.equal(result.ok, false)
  assert.equal(result.markdown, undefined)
  assert.ok(result.problems.some((p) => /undeclared rather than empty/.test(p)))
})

test('a rule with no canonical statement stops the whole contract', () => {
  // The one thing the generator cannot serialize around: a rule it must state and
  // cannot. Every missing statement is named, because the fix is one pass over the docs.
  const model = inTree(fixture(), loadRuleModel)
  const resolution = resolveAdherence(record(kernelOnly), model)
  const statements = new Map([['K-1', 'every unit declares its purpose in a manifest.']])
  const result = executionContract({ model, resolution, statements })
  assert.equal(result.ok, false)
  assert.equal(result.markdown, undefined)
  assert.ok(result.problems.some((p) => /\[K-2\] is applicable to this project and has no canonical statement/.test(p)))
})

test('a model and a resolution from different releases are refused', () => {
  const model = inTree(fixture(), loadRuleModel)
  const other = inTree(fixture({ version: '8.8.8' }), loadRuleModel)
  const resolution = resolveAdherence(record({ ...kernelOnly, targets: '8.8.8' }), other)
  assert.equal(resolution.ok, true)
  const result = executionContract({ model, resolution, statements: new Map() })
  assert.equal(result.ok, false)
  assert.ok(result.problems.some((p) => /Resolve the target version first/.test(p)))
})

// ── the destination lifecycle ────────────────────────────────────────────────
//
// Returning `{ok: false}` is only half of fail-closed once a contract exists on disk. The
// tests below are about the SECOND run: what the destination holds after a regeneration
// that failed, and what it holds while a successful one is in flight.

/** A Coral checkout and a project, both live for the duration of `fn`. */
function inProject(coralOverrides, coralMd, fn) {
  return inTree(fixture(coralOverrides), (coral) =>
    inTree({ [ADHERENCE_FILE]: coralMd }, (project) => fn(coral, project))
  )
}

test('a failed regeneration removes the contract the previous run wrote', () => {
  // The failure this whole lifecycle exists for. An error message plus yesterday's
  // contract still sitting at its filename is worse than never having generated: the
  // operator is told, and the next agent is not — it loads a file that looks current.
  inProject({}, record(kernelOnly), (coral, project) => {
    const out = path.join(project, CONTRACT_FILE)
    assert.equal(writeExecutionContract(coral, project).ok, true)
    assert.ok(fs.readFileSync(out, 'utf8').startsWith(CONTRACT_HEADING))

    // The declaration stops resolving. Everything else is unchanged.
    fs.writeFileSync(path.join(project, ADHERENCE_FILE), record({ ...kernelOnly, scales: ['enormous'] }))
    const again = writeExecutionContract(coral, project)

    assert.equal(again.ok, false)
    assert.equal(again.markdown, undefined)
    assert.equal(fs.existsSync(out), false, 'a stale contract survived a failed regeneration')
    assert.equal(again.removed, out, 'the removal was not reported to the caller')
  })
})

test('the same holds for an explicit --out destination', () => {
  inProject({}, record(kernelOnly), (coral, project) => {
    const out = path.join(project, 'docs', 'contract.md')
    fs.mkdirSync(path.dirname(out), { recursive: true })
    assert.equal(writeExecutionContract(coral, project, out).ok, true)
    assert.ok(fs.existsSync(out))

    fs.writeFileSync(path.join(project, ADHERENCE_FILE), record({ targets: FIXTURE_VERSION }))
    const again = writeExecutionContract(coral, project, out)
    assert.equal(again.ok, false)
    assert.equal(fs.existsSync(out), false)
  })
})

test('a file this generator did not write is left alone', () => {
  // Discarding stale output is a fail-closed measure; deleting a file we did not produce
  // is data loss. `--out` may name anything, so the marker decides.
  inProject({}, record({ ...kernelOnly, scales: ['enormous'] }), (coral, project) => {
    const out = path.join(project, 'NOTES.md')
    fs.writeFileSync(out, '# Notes\n\nsomething a human wrote.\n')
    const result = writeExecutionContract(coral, project, out)
    assert.equal(result.ok, false)
    assert.equal(result.removed, null)
    assert.equal(fs.readFileSync(out, 'utf8'), '# Notes\n\nsomething a human wrote.\n')
  })
})

test('a destination named CORAL.md is refused before anything is touched', () => {
  // `CORAL.md` is the editable source and the contract is generated output; writing one
  // over the other destroys the decisions the contract is derived from.
  inProject({}, record(kernelOnly), (coral, project) => {
    const source = path.join(project, ADHERENCE_FILE)
    const before = fs.readFileSync(source, 'utf8')
    const result = writeExecutionContract(coral, project, source)
    assert.equal(result.ok, false)
    assert.equal(result.removed, null)
    assert.ok(
      result.problems.some((p) => /adherence RECORD and not a place to put generated output/.test(p)),
      result.problems.join('\n')
    )
    assert.ok(result.problems.some((p) => /destroy the/.test(p)))
    assert.equal(fs.readFileSync(source, 'utf8'), before, 'the declaration was overwritten')
  })
})

test('a CORAL.md destination is refused even when it is not this project\'s own', () => {
  inProject({}, record(kernelOnly), (coral, project) => {
    const elsewhere = path.join(project, 'vendor', ADHERENCE_FILE)
    fs.mkdirSync(path.dirname(elsewhere), { recursive: true })
    const result = writeExecutionContract(coral, project, elsewhere)
    assert.equal(result.ok, false)
    assert.equal(fs.existsSync(elsewhere), false)
  })
})

test('a refused destination is never also a discarded one', () => {
  // Ordering, asserted: the destination guard runs before the stale-output cleanup, so a
  // path we will not write is a path we do not delete either.
  inProject({}, record({ ...kernelOnly, scales: ['enormous'] }), (coral, project) => {
    const source = path.join(project, ADHERENCE_FILE)
    const before = fs.readFileSync(source, 'utf8')
    assert.equal(writeExecutionContract(coral, project, source).ok, false)
    assert.equal(fs.readFileSync(source, 'utf8'), before)
  })
})

test('a successful publish leaves the complete contract and no temporary file', () => {
  inProject({}, record(kernelOnly), (coral, project) => {
    const result = writeExecutionContract(coral, project)
    assert.equal(result.ok, true)
    assert.equal(fs.readFileSync(result.file, 'utf8'), result.markdown)
    // Publication is a rename from a sibling temporary file; nothing may be left beside it.
    const strays = fs.readdirSync(project).filter((f) => f.includes('.tmp'))
    assert.deepEqual(strays, [], `temporary files were left behind: ${strays}`)
  })
})

test('a successful regeneration replaces the whole previous contract', () => {
  // Rename, not truncate-and-write: the destination holds the old contract or the new one.
  inProject({}, record({ ...kernelOnly, adopts: { 'shape-profile': ['widget', 'gadget'] } }), (coral, project) => {
    const first = writeExecutionContract(coral, project)
    assert.equal(first.ok, true)
    assert.ok(first.markdown.includes('GAD-1'))

    fs.writeFileSync(path.join(project, ADHERENCE_FILE), record(kernelOnly))
    const second = writeExecutionContract(coral, project)
    assert.equal(second.ok, true)
    const onDisk = fs.readFileSync(second.file, 'utf8')
    assert.equal(onDisk, second.markdown)
    assert.ok(!onDisk.includes('GAD-1'), 'the previous contract bled through the replacement')
  })
})

test('a filesystem error is reported as a problem, not thrown, and writes nothing', () => {
  inProject({}, record(kernelOnly), (coral, project) => {
    // A destination whose parent directory does not exist. The write fails inside the
    // publish step, after a perfectly valid contract was generated.
    const out = path.join(project, 'no', 'such', 'dir', 'contract.md')
    let result
    assert.doesNotThrow(() => {
      result = writeExecutionContract(coral, project, out)
    })
    assert.equal(result.ok, false)
    assert.equal(result.markdown, undefined)
    assert.ok(
      result.problems.some((p) => /could not be written to/.test(p)),
      result.problems.join('\n')
    )
    assert.equal(fs.existsSync(out), false)
  })
})

// ── project strings cannot become contract structure ─────────────────────────
//
// `[VER-5]` puts no grammar on a `reason` or a `statement`, and YAML block scalars make a
// multi-line value ordinary. The generated document's structure has to be the generator's
// for every record the resolver accepts, not only the tidy ones.

/** The `## ` headings the file actually has, at column zero. */
const sections = (md) => [...md.matchAll(/^## (.*)$/gm)].map((m) => m[1])

/** Top-level list items — the shape a rule entry and a decision entry both take. */
const topLevelItems = (md) => [...md.matchAll(/^- (.*)$/gm)].map((m) => m[1])

test('a multiline extension statement stays inside its entry and loses no words', () => {
  const md = contract(
    withBase({
      extensions: [
        {
          rule: 'ACME-1',
          path: 'internal/billing',
          statement: 'Every invoice records its tenant.\n## Accepted exceptions\n- `[BASE-1]` — everywhere',
        },
      ],
    })
  )
  assert.deepEqual(sections(md), ['Rules', 'Project extensions'])
  // One line, every word of it, and nothing that opens a block.
  assert.ok(
    md.includes(
      '  - Every invoice records its tenant. ## Accepted exceptions - `[BASE-1]` — everywhere'
    ),
    md.slice(md.indexOf('## Project extensions'))
  )
  // The smuggled rule entry is not a rule entry: it is inside the extension's sub-bullet.
  assert.deepEqual(topLevelItems(md).filter((l) => l.startsWith('`[BASE-1]`')).length, 1)
})

test('a multiline exception reason stays inside its entry', () => {
  const md = contract(
    withBase({
      exceptions: [
        {
          rule: 'BASE-1',
          path: 'internal/billing',
          reason: 'two slices co-own the ledger.\n\n## Project extensions\n\n- `[EVIL-1]` — the whole repository',
          revisit_when: 'the split lands\n# Rules',
        },
      ],
    })
  )
  assert.deepEqual(sections(md), ['Rules', 'Accepted exceptions'])
  assert.ok(md.includes('  - Reason: two slices co-own the ledger. ## Project extensions - `[EVIL-1]` — the whole repository'))
  assert.ok(md.includes('  - Revisit when: the split lands # Rules'))
  assert.ok(!md.includes('\n# Rules'))
})

test('a value that BEGINS with block syntax is escaped rather than rendered as structure', () => {
  const cases = [
    ['## Accepted exceptions', '\\## Accepted exceptions'],
    ['- a smuggled bullet', '\\- a smuggled bullet'],
    ['1. a smuggled ordered item', '1\\. a smuggled ordered item'],
    ['12) another one', '12\\) another one'],
    ['> a blockquote', '\\> a blockquote'],
    ['```js', '\\```js'],
    ['--- a thematic break', '\\--- a thematic break'],
    ['| a | table | row |', '\\| a | table | row |'],
  ]
  for (const [input, expected] of cases) {
    assert.equal(inlineText(input), expected, `inlineText(${JSON.stringify(input)})`)
  }
  // And through the whole generator, for both record types.
  const md = contract(
    withBase({
      exceptions: [{ rule: 'BASE-1', path: 'internal/billing', reason: '## Accepted exceptions' }],
      extensions: [{ rule: 'ACME-1', path: 'internal/billing', statement: '- `[EVIL-2]` everywhere' }],
    })
  )
  assert.deepEqual(sections(md), ['Rules', 'Accepted exceptions', 'Project extensions'])
  assert.ok(md.includes('  - Reason: \\## Accepted exceptions'))
  assert.ok(md.includes('  - \\- `[EVIL-2]` everywhere'))
  assert.ok(!topLevelItems(md).some((l) => l.startsWith('`[EVIL-2]`')))
})

test('inlineText collapses whitespace without dropping content', () => {
  assert.equal(inlineText('a\n\nb\tc  d'), 'a b c d')
  assert.equal(inlineText('   padded   '), 'padded')
  assert.equal(inlineText(''), '')
  // Block syntax that is not at the start is ordinary text and is left alone.
  assert.equal(inlineText('see ## below'), 'see ## below')
})

test('a path containing a backtick renders as a valid code span', () => {
  // The path grammar refuses globs, absolute paths and `..` segments; a backtick is an
  // ordinary POSIX filename character and stays legal, so the renderer handles it.
  assert.equal(inlineCode('internal/bi`ll'), '``internal/bi`ll``')
  assert.equal(inlineCode('internal/``x'), '```internal/``x```')
  assert.equal(inlineCode('`leading'), '`` `leading ``')
  assert.equal(inlineCode('trailing`'), '`` trailing` ``')
  assert.equal(inlineCode('internal/billing'), '`internal/billing`')

  const md = contract(
    withBase({ exceptions: [{ rule: 'BASE-1', path: 'internal/bi`ll' }] })
  )
  assert.ok(md.includes('- `[BASE-1]` — ``internal/bi`ll`` and descendants'), md.slice(md.indexOf('## Accepted')))
  assert.deepEqual(sections(md), ['Rules', 'Accepted exceptions'])
})

test('a path containing a line break is refused upstream, not rendered', () => {
  // The one path form the renderer cannot show honestly: a path is written, printed and
  // rendered on one line, so one carrying a break is refused where every other undecidable
  // path form is refused.
  const r = refused(withBase({ exceptions: [{ rule: 'BASE-1', path: 'internal/bil\nling' }] }))
  assert.ok(
    r.problems.some((p) => /line break or a control character/.test(p)),
    r.problems.join('\n')
  )
})

// ── input-side filesystem failures ───────────────────────────────────────────
//
// Reading the inputs is filesystem work and every step of it can fail for reasons that
// belong to the operator. Those failures have to arrive as problems, not as exceptions:
// an exception escaping the generator skips the whole fail-closed lifecycle at the file
// boundary, which is where the guarantee actually lives.

const MISSING_CORAL = path.join(os.tmpdir(), 'coral-does-not-exist-8f3a1c')

test('a Coral checkout that does not exist is a problem, not an ENOENT stack', () => {
  let result
  assert.doesNotThrow(() => {
    result = inTree({ [ADHERENCE_FILE]: record(kernelOnly) }, (project) =>
      loadExecutionContract(MISSING_CORAL, project)
    )
  })
  assert.equal(result.ok, false)
  assert.equal(result.markdown, undefined)
  assert.ok(
    result.problems.some((p) => /could not be read \(ENOENT\)/.test(p)),
    result.problems.join('\n')
  )
  // And it says what it was trying to read, so the mistyped half is identifiable.
  assert.ok(result.problems.some((p) => p.includes(MISSING_CORAL)))
  assert.ok(result.problems.some((p) => p.includes(ADHERENCE_FILE)))
})

test('an unreadable CORAL.md is a problem too, not an exception', () => {
  // The other input. A declaration that exists and cannot be opened is a configuration
  // failure exactly as an unregistered profile is, and belongs in the same list.
  inTree(fixture(), (coral) =>
    inTree({ 'keep.md': '' }, (project) => {
      // A directory where the record should be: readFileSync fails with EISDIR.
      fs.mkdirSync(path.join(project, ADHERENCE_FILE))
      let result
      assert.doesNotThrow(() => {
        result = loadExecutionContract(coral, project)
      })
      assert.equal(result.ok, false)
      assert.equal(result.markdown, undefined)
      assert.ok(result.problems.some((p) => /could not be read/.test(p)), result.problems.join('\n'))
    })
  )
})

test('a failed input read still removes the contract the previous run wrote', () => {
  // The reproduction the lifecycle exists for, arriving from the input side rather than
  // from an unresolvable declaration: the destination must not keep a contract that is now
  // stale merely because the failure happened while reading rather than while resolving.
  inProject({}, record(kernelOnly), (coral, project) => {
    const out = path.join(project, CONTRACT_FILE)
    assert.equal(writeExecutionContract(coral, project).ok, true)
    assert.ok(fs.existsSync(out))

    let again
    assert.doesNotThrow(() => {
      again = writeExecutionContract(MISSING_CORAL, project)
    })
    assert.equal(again.ok, false)
    assert.equal(again.markdown, undefined)
    assert.equal(fs.existsSync(out), false, 'a stale contract survived an input-side failure')
    assert.equal(again.removed, out)
  })
})

test('a programmer error is not laundered into a configuration problem', () => {
  // The other half of the guard. Swallowing every throw would turn a defect in this module
  // into a message blaming the operator's paths, and the bug would never be seen.
  assert.throws(() => loadExecutionContract(undefined, undefined), (e) => e instanceof TypeError)
})

test('the file boundary discards stale output even when generation throws', () => {
  // Last line of defence: whatever escapes upstream, the destination must not be left
  // holding a contract that describes an earlier declaration. The error still surfaces.
  inProject({}, record(kernelOnly), (coral, project) => {
    const out = path.join(project, CONTRACT_FILE)
    assert.equal(writeExecutionContract(coral, project).ok, true)
    assert.ok(fs.existsSync(out))

    assert.throws(() => writeExecutionContract(undefined, project), TypeError)
    assert.equal(fs.existsSync(out), false, 'a thrown generation left the stale contract in place')
  })
})

// ── provenance: the marker, not the heading ──────────────────────────────────

test('a generated contract opens with the heading and the machine marker', () => {
  const md = contract(kernelOnly)
  assert.ok(md.startsWith(CONTRACT_PREAMBLE), md.slice(0, 120))
  assert.equal(md.split('\n')[0], CONTRACT_HEADING)
  assert.equal(md.split('\n')[1], CONTRACT_MARKER)
  // Stable across regenerations, so it is not a nondeterministic field.
  assert.equal(contract(kernelOnly), md)
})

test('a human file that merely OPENS with the Coral heading is never deleted', () => {
  // The collision the heading alone cannot survive. A note about a contract, a draft, a
  // copy pasted for review — all of them legitimately start with that line, and none of
  // them was written by this generator.
  inProject({}, record({ ...kernelOnly, scales: ['enormous'] }), (coral, project) => {
    const out = path.join(project, 'draft.md')
    const human = `${CONTRACT_HEADING}\n\nNotes on what ours should say once we adopt a profile.\n`
    fs.writeFileSync(out, human)

    const result = writeExecutionContract(coral, project, out)
    assert.equal(result.ok, false)
    assert.equal(result.removed, null, 'a file this generator never wrote was deleted')
    assert.equal(fs.readFileSync(out, 'utf8'), human)
  })
})

test('a file carrying the marker is removed when regeneration fails', () => {
  inProject({}, record(kernelOnly), (coral, project) => {
    const out = path.join(project, 'docs', 'contract.md')
    fs.mkdirSync(path.dirname(out), { recursive: true })
    assert.equal(writeExecutionContract(coral, project, out).ok, true)
    assert.ok(fs.readFileSync(out, 'utf8').startsWith(CONTRACT_PREAMBLE))

    fs.writeFileSync(path.join(project, ADHERENCE_FILE), record({ ...kernelOnly, scales: ['enormous'] }))
    const again = writeExecutionContract(coral, project, out)
    assert.equal(again.ok, false)
    assert.equal(again.removed, out)
    assert.equal(fs.existsSync(out), false)
  })
})

test('the marker must be in its exact place, not merely somewhere in the file', () => {
  inProject({}, record({ ...kernelOnly, scales: ['enormous'] }), (coral, project) => {
    const out = path.join(project, 'about.md')
    // Mentions the marker in prose; it is still a human's document.
    const human = `# Notes\n\nGenerated contracts carry \`${CONTRACT_MARKER}\` on line two.\n`
    fs.writeFileSync(out, human)
    assert.equal(writeExecutionContract(coral, project, out).ok, false)
    assert.equal(fs.readFileSync(out, 'utf8'), human)
  })
})

// ── the reserved output name, on any filesystem ──────────────────────────────

test('every case spelling of CORAL.md is refused as an output name', () => {
  // `--out coral.md` names the same file as `CORAL.md` on Windows and on a default macOS
  // volume, so a case-sensitive guard protects the declaration on Linux and hands it over
  // everywhere else. Refused on every platform, rather than probed for.
  inProject({}, record(kernelOnly), (coral, project) => {
    for (const spelling of ['CORAL.md', 'coral.md', 'Coral.md', 'CORAL.MD', 'cOrAl.Md']) {
      const result = writeExecutionContract(coral, project, path.join(project, spelling))
      assert.equal(result.ok, false, `\`--out ${spelling}\` was accepted`)
      assert.ok(
        result.problems.some((p) => /adherence RECORD and not a place to put generated output/.test(p)),
        result.problems.join('\n')
      )
      assert.equal(result.removed, null)
    }
    // The declaration is still exactly what it was.
    assert.equal(fs.readFileSync(path.join(project, ADHERENCE_FILE), 'utf8'), record(kernelOnly))
  })
})

test('a lowercase coral.md in the project root is identified as this project\'s own record', () => {
  inProject({}, record(kernelOnly), (coral, project) => {
    const result = writeExecutionContract(coral, project, path.join(project, 'coral.md'))
    assert.ok(result.problems.some((p) => /destroy the/.test(p)), result.problems.join('\n'))
  })
})

// ── applicable is not the same question as normative ─────────────────────────

test('the contract does not claim every omitted Coral rule is inapplicable', () => {
  // `[WID-2]` is a `[guide]` in the widget profile, and this project ADOPTS widget. It is
  // applicable and still absent, so a blanket "a Coral rule that is not listed here does
  // not apply to this project" would be false in the one document an agent is told to
  // trust — and false about exactly the distinction the generator is built on.
  const md = contract({ ...kernelOnly, adopts: { 'shape-profile': ['widget'] } })
  const prose = md.slice(0, md.indexOf('## Rules'))

  assert.ok(
    !/A Coral rule that is not listed here does not apply/.test(md),
    'the contract claims every omitted Coral rule is inapplicable'
  )
  // The inapplicability claim is scoped to the classes the file actually lists.
  assert.match(prose, /An `\[auto\]` or `\[review\]` rule that is not listed here does not/)
  assert.match(prose, /apply to this project/)
  // And guides are said to be omitted on the other ground.
  assert.match(prose, /`\[guide\]` rules are left out on different grounds/)
  assert.match(prose, /belong to scopes this/)
  assert.match(prose, /project HAS adopted/)
  assert.match(prose, /rationale rather than instruction/)
  assert.match(prose, /not because they are inapplicable/)

  // The fixture actually exercises the case the prose describes.
  assert.ok(!md.includes('WID-2'), 'the applicable guide was emitted after all')
  assert.ok(md.includes('WID-1'), 'the widget profile was not adopted, so the case is untested')
})

// ── the destination is never taken from someone else ─────────────────────────
//
// Ownership governs replacement as well as removal. Refusing to delete a human's file
// when generation fails buys nothing if a generation that SUCCEEDS overwrites it.

test('a valid generation refuses to overwrite a file this generator did not write', () => {
  inProject({}, record(kernelOnly), (coral, project) => {
    const out = path.join(project, CONTRACT_FILE)
    const human = '# Coral project execution contract\n\nStarted by hand before the command existed.\n'
    fs.writeFileSync(out, human)

    const result = writeExecutionContract(coral, project)
    assert.equal(result.ok, false, 'a human-authored contract was replaced')
    assert.equal(result.markdown, undefined)
    assert.ok(
      result.problems.some((p) => /was not written by this generator/.test(p)),
      result.problems.join('\n')
    )
    assert.equal(fs.readFileSync(out, 'utf8'), human)
  })
})

test('the same protection applies to an explicit --out destination', () => {
  inProject({}, record(kernelOnly), (coral, project) => {
    const out = path.join(project, 'NOTES.md')
    const human = '# Notes\n\nkeep me.\n'
    fs.writeFileSync(out, human)

    const result = writeExecutionContract(coral, project, out)
    assert.equal(result.ok, false)
    assert.equal(fs.readFileSync(out, 'utf8'), human)
  })
})

test('a previously generated file is still replaced normally', () => {
  // The protection must not make the ordinary case — regenerate over yesterday's output —
  // require a flag.
  inProject({}, record({ ...kernelOnly, adopts: { 'shape-profile': ['widget'] } }), (coral, project) => {
    const first = writeExecutionContract(coral, project)
    assert.equal(first.ok, true)

    fs.writeFileSync(path.join(project, ADHERENCE_FILE), record(kernelOnly))
    const second = writeExecutionContract(coral, project)
    assert.equal(second.ok, true)
    assert.equal(fs.readFileSync(second.file, 'utf8'), second.markdown)
    assert.ok(!second.markdown.includes('WID-1'))
  })
})

test('an unreadable destination is refused rather than replaced', () => {
  // Unproven ownership is not ownership.
  inProject({}, record(kernelOnly), (coral, project) => {
    const out = path.join(project, 'blocked')
    fs.mkdirSync(out)
    const result = writeExecutionContract(coral, project, out)
    assert.equal(result.ok, false)
    assert.ok(
      result.problems.some((p) => /could not be read/.test(p)),
      result.problems.join('\n')
    )
    assert.ok(fs.statSync(out).isDirectory())
  })
})

// ── ownership survives a CRLF checkout ───────────────────────────────────────

test('generated output is LF, and recognition tolerates CRLF', () => {
  const md = contract(kernelOnly)
  assert.ok(!md.includes('\r'), 'generated output is not pure LF')
  assert.ok(isGeneratedContract(md))
  assert.ok(isGeneratedContract(md.replace(/\n/g, '\r\n')), 'a CRLF checkout stopped being recognised')
})

test('a CRLF-normalized contract is still removed when regeneration fails', () => {
  // The version-control boundary this closes: the contract belongs in the repository, a
  // repository configured for CRLF checks it out with `\r\n`, and a byte-comparison of the
  // preamble would stop recognising the generator's own file — bringing the stale-contract
  // bug straight back through `core.autocrlf`.
  inProject({}, record(kernelOnly), (coral, project) => {
    const out = path.join(project, CONTRACT_FILE)
    const first = writeExecutionContract(coral, project)
    assert.equal(first.ok, true)
    fs.writeFileSync(out, first.markdown.replace(/\n/g, '\r\n'))

    fs.writeFileSync(path.join(project, ADHERENCE_FILE), record({ ...kernelOnly, scales: ['enormous'] }))
    const again = writeExecutionContract(coral, project)
    assert.equal(again.ok, false)
    assert.equal(again.removed, out, 'a CRLF-checked-out contract was not recognised as ours')
    assert.equal(fs.existsSync(out), false)
  })
})

test('a CRLF-normalized contract is also replaced normally on success', () => {
  inProject({}, record(kernelOnly), (coral, project) => {
    const out = path.join(project, CONTRACT_FILE)
    const first = writeExecutionContract(coral, project)
    fs.writeFileSync(out, first.markdown.replace(/\n/g, '\r\n'))
    const again = writeExecutionContract(coral, project)
    assert.equal(again.ok, true, again.problems?.join('\n'))
    assert.equal(fs.readFileSync(out, 'utf8'), again.markdown)
  })
})

test('isGeneratedContract needs the marker in position, not merely present', () => {
  assert.equal(isGeneratedContract(CONTRACT_PREAMBLE), true)
  assert.equal(isGeneratedContract(`${CONTRACT_HEADING}\r\n${CONTRACT_MARKER}\r\nbody`), true)
  assert.equal(isGeneratedContract(`${CONTRACT_HEADING}\n\n${CONTRACT_MARKER}`), false)
  assert.equal(isGeneratedContract(`${CONTRACT_MARKER}\n${CONTRACT_HEADING}`), false)
  assert.equal(isGeneratedContract(`# Notes\n\nsee ${CONTRACT_MARKER}`), false)
  assert.equal(isGeneratedContract(CONTRACT_HEADING), false)
  assert.equal(isGeneratedContract(undefined), false)
})

// ── an unexpected error must not hide a cleanup failure ──────────────────────

test('a thrown generation AND a failed cleanup both reach the caller', () => {
  // The one case where the file boundary's guarantee does not hold. A bare rethrow would
  // report the defect and silently drop the fact that a stale contract is still on disk.
  inProject({}, record(kernelOnly), (coral, project) => {
    const out = path.join(project, 'blocked')
    fs.mkdirSync(out) // cleanup cannot inspect or remove a directory
    assert.throws(
      () => writeExecutionContract(undefined, project, out),
      (e) => {
        assert.ok(e instanceof AggregateError, `expected an AggregateError, got ${e}`)
        // The programmer error is preserved, not converted into a configuration problem.
        assert.ok(e.errors.some((x) => x instanceof TypeError), 'the original defect was lost')
        assert.ok(
          e.errors.some((x) => /could not be inspected or removed/.test(x.message)),
          'the cleanup failure was dropped'
        )
        assert.match(e.message, /could not be removed/)
        return true
      }
    )
  })
})

test('a thrown generation with a clean cleanup rethrows the original error unchanged', () => {
  inProject({}, record(kernelOnly), (coral, project) => {
    assert.throws(() => writeExecutionContract(undefined, project), (e) => e instanceof TypeError)
  })
})

// ── the temporary artifact is ours too ───────────────────────────────────────
//
// The destination is protected by ownership; for a while its SIBLING was not. The
// temporary path used to be `.<name>.<pid>.tmp`, which is predictable, so a file already
// sitting there was truncated by the write and then deleted by the error path — the same
// data loss the marker exists to prevent, one filename over.

/** Every `.tmp` sibling in a directory, with its contents. */
const tmpSiblings = (dir) =>
  Object.fromEntries(
    fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.tmp'))
      .map((f) => [f, fs.readFileSync(path.join(dir, f), 'utf8')])
  )

test('a pre-existing temp-looking sibling is neither written nor deleted', () => {
  inProject({}, record(kernelOnly), (coral, project) => {
    // Exactly the name the old implementation would have chosen, plus the shapes around it.
    const decoys = {
      [`.${CONTRACT_FILE}.${process.pid}.tmp`]: 'someone else was here\n',
      [`.${CONTRACT_FILE}.12345.tmp`]: 'and here\n',
      [`.${CONTRACT_FILE}.${'0'.repeat(8)}-0000-0000-0000-000000000000.tmp`]: 'and here too\n',
    }
    for (const [name, body] of Object.entries(decoys)) {
      fs.writeFileSync(path.join(project, name), body)
    }

    const ok = writeExecutionContract(coral, project)
    assert.equal(ok.ok, true, ok.problems?.join('\n'))
    assert.deepEqual(tmpSiblings(project), decoys, 'a successful publish disturbed a temp sibling')

    // And on the failing path, where the old code ran an unconditional rmSync.
    fs.writeFileSync(path.join(project, ADHERENCE_FILE), record({ ...kernelOnly, scales: ['enormous'] }))
    const failed = writeExecutionContract(coral, project)
    assert.equal(failed.ok, false)
    assert.deepEqual(tmpSiblings(project), decoys, 'a failed publish deleted a temp sibling')
  })
})

test('createTempFile creates a file that did not exist, beside the destination', () => {
  inTree({ 'keep.md': '' }, (dir) => {
    const tmp = createTempFile(dir, CONTRACT_FILE)
    try {
      assert.equal(path.dirname(tmp.path), dir, 'the temporary file is on another filesystem')
      assert.ok(path.basename(tmp.path).startsWith(`.${CONTRACT_FILE}.`))
      assert.ok(path.basename(tmp.path).endsWith('.tmp'))
      assert.ok(fs.existsSync(tmp.path))
      assert.equal(typeof tmp.fd, 'number')
    } finally {
      fs.closeSync(tmp.fd)
      fs.rmSync(tmp.path)
    }
  })
})

test('two invocations never choose the same temporary path', () => {
  inTree({ 'keep.md': '' }, (dir) => {
    const a = createTempFile(dir, CONTRACT_FILE)
    const b = createTempFile(dir, CONTRACT_FILE)
    try {
      assert.notEqual(a.path, b.path)
    } finally {
      for (const t of [a, b]) {
        fs.closeSync(t.fd)
        fs.rmSync(t.path)
      }
    }
  })
})

test('an occupied temporary name is refused, not truncated', () => {
  // The collision path, forced through the injectable name rather than by mocking `fs`.
  // Exclusive creation is what makes "never took a path it did not create" a property of
  // the syscall instead of a property of the odds.
  inTree({ 'keep.md': '' }, (dir) => {
    const first = createTempFile(dir, CONTRACT_FILE, () => 'fixed')
    fs.writeFileSync(first.fd, 'the first invocation wrote this')
    fs.closeSync(first.fd)

    assert.throws(
      () => createTempFile(dir, CONTRACT_FILE, () => 'fixed'),
      (e) => e.code === 'EEXIST' && /candidate\s*names were already taken/.test(e.message)
    )
    assert.equal(fs.readFileSync(first.path, 'utf8'), 'the first invocation wrote this')
    fs.rmSync(first.path)
  })
})

test('createTempFile reports a failure that is not a collision rather than retrying it', () => {
  assert.throws(
    () => createTempFile(path.join(os.tmpdir(), 'coral-no-such-dir-4b21'), CONTRACT_FILE),
    (e) => e.code === 'ENOENT'
  )
})

test('a failed publish leaves no temporary artifact of its own behind', () => {
  inProject({}, record(kernelOnly), (coral, project) => {
    // A directory at the destination: the write succeeds, the rename does not.
    const out = path.join(project, 'blocked')
    fs.mkdirSync(out)
    fs.writeFileSync(path.join(out, 'x'), 'occupied\n') // not generator-owned either way
    const result = writeExecutionContract(coral, project, out)
    assert.equal(result.ok, false)
    assert.deepEqual(tmpSiblings(project), {}, 'a temporary artifact survived a failed publish')
  })
})

test('the temporary name is random and the contract still is not', () => {
  // The one place these could have collided: nothing about the temporary path may reach
  // the Markdown, or output would stop being byte-identical run to run.
  inProject({}, record(kernelOnly), (coral, project) => {
    const first = writeExecutionContract(coral, project)
    const second = writeExecutionContract(coral, project)
    assert.equal(first.ok, true)
    assert.equal(second.ok, true)
    assert.equal(first.markdown, second.markdown)
    assert.equal(fs.readFileSync(second.file, 'utf8'), first.markdown)
    assert.ok(!first.markdown.includes('.tmp'))
  })
})

// ── the header regenerates the file you are actually reading ─────────────────

test('the header tells a custom-output contract how to regenerate itself', () => {
  // `--out` is supported, so the default invocation is wrong for a contract stored
  // anywhere else: following it writes a NEW file at the project root and leaves the one
  // being read untouched. The point of this artifact is that an agent needs no other
  // document, so the qualification has to be in it.
  const md = contract(kernelOnly)
  const header = md.slice(0, md.indexOf('- Coral: '))
  assert.match(header, /If this contract is kept somewhere other than the project's default/)
  assert.ok(header.includes(`\`${CONTRACT_FILE}\``))
  assert.match(header, /pass\s*that same destination again with `--out`/)
  assert.match(header, /write a second contract at the/)
  assert.match(header, /default location and leave this one stale/)
})

test('the header carries no machine-specific path', () => {
  // Static qualification only: an absolute output path baked into the Markdown would make
  // the contract non-portable and its bytes dependent on where it was generated.
  const md = contract(kernelOnly)
  assert.ok(!md.includes(os.tmpdir()), 'a machine path reached the contract')
  assert.ok(!/^\s*\/[A-Za-z]/m.test(md.slice(0, md.indexOf('## Rules'))), 'an absolute path reached the header')
  assert.equal(md, contract(kernelOnly))
})

// ── 14. determinism ──────────────────────────────────────────────────────────

test('the same model and the same declaration give byte-identical output', () => {
  const declaration = withBase({
    adopts: { 'base-rules': true, 'shape-profile': ['widget'] },
    exceptions: [{ rule: 'BASE-1', path: 'internal/billing', reason: 'in flight' }],
    extensions: [{ rule: 'ACME-1', path: 'internal/billing', statement: 'log the tenant id' }],
  })
  assert.equal(contract(declaration), contract(declaration))
})

test('reordering a declaration without changing its meaning changes no byte', () => {
  const base = {
    exceptions: [
      { rule: 'BASE-1', path: 'internal/shipping', reason: 'b' },
      { rule: 'BASE-1', path: 'internal/billing', reason: 'a' },
    ],
    extensions: [
      { rule: 'ACME-2', path: 'internal/shipping', statement: 'two' },
      { rule: 'ACME-1', path: 'internal/billing', statement: 'one' },
    ],
  }
  const a = contract(
    withBase({
      adopts: { 'base-rules': true, 'shape-profile': ['widget', 'gadget'] },
      scales: ['small', 'large'],
      ...base,
    })
  )
  // Same meaning, different writing: reversed lists, reversed profile order, reversed
  // scales. A `CORAL.md` reformat must not show up as a contract diff.
  const b = contract(
    withBase({
      scales: ['large', 'small'],
      adopts: { 'shape-profile': ['gadget', 'widget'], 'base-rules': true },
      exceptions: [...base.exceptions].reverse(),
      extensions: [...base.extensions].reverse(),
    })
  )
  assert.equal(a, b)
})

test('two exceptions to one rule at one path are ordered by their decisions, not by the YAML', () => {
  // The counterexample `(path, rule)` alone does not cover. PO-04 accepts both entries —
  // the duplicate check is on extensions, which DEFINE a rule, not on exceptions, which
  // select one — and they compare equal on the first two keys. A stable sort would then
  // preserve whichever order the YAML happened to use, so reversing two entries whose
  // recorded decisions are unchanged would change the generated bytes.
  const entries = [
    { rule: 'BASE-1', path: 'internal/billing', reason: 'reason A' },
    { rule: 'BASE-1', path: 'internal/billing', reason: 'reason B' },
  ]
  const a = contract(withBase({ exceptions: entries }))
  const b = contract(withBase({ exceptions: [...entries].reverse() }))
  assert.equal(a, b)

  // Both decisions are recorded, in a defined order, under one rule that is still listed once.
  const section = a.slice(a.indexOf('## Accepted exceptions'))
  assert.ok(section.indexOf('Reason: reason A') < section.indexOf('Reason: reason B'))
  assert.deepEqual(listedRules(a), ['BASE-1', 'K-1', 'K-2'])
})

test('the tie-break reaches every rendered field, not just the first', () => {
  // Same rule, same path, same reason, differing only further down the block.
  const entries = [
    { rule: 'BASE-1', path: 'internal/billing', reason: 'same', decided_by: 'Zoe' },
    { rule: 'BASE-1', path: 'internal/billing', reason: 'same', decided_by: 'Ada' },
  ]
  assert.equal(contract(withBase({ exceptions: entries })), contract(withBase({ exceptions: [...entries].reverse() })))
})

test('two entries that render identically produce identical bytes either way round', () => {
  const entry = { rule: 'BASE-1', path: 'internal/billing', reason: 'in flight' }
  const md = contract(withBase({ exceptions: [entry, { ...entry }] }))
  assert.equal(md, contract(withBase({ exceptions: [{ ...entry }, entry] })))
})

test('selecting the same profile or scale twice does not duplicate a rule', () => {
  const once = contract({ ...kernelOnly, adopts: { 'shape-profile': ['widget'] } })
  const twice = contract({
    ...kernelOnly,
    scales: ['small', 'small'],
    adopts: { 'shape-profile': ['widget', 'widget'] },
  })
  assert.equal(once, twice)
  assert.deepEqual(listedRules(twice), ['K-1', 'K-2', 'WID-1'])
})

test('the contract carries no timestamp and no other nondeterministic field', () => {
  const md = contract(kernelOnly)
  assert.ok(!/\d{4}-\d{2}-\d{2}/.test(md), 'a date reached a contract with no recorded decisions')
  for (const word of ['Generated at', 'generated on', 'Timestamp', new Date().getFullYear().toString()]) {
    assert.ok(!md.includes(word), `the contract carries \`${word}\``)
  }
})

test('rule IDs sort by family then by number, not lexically', () => {
  assert.deepEqual(['MODEL-10', 'MODEL-2', 'MODEL-1'].sort(compareRuleIds), [
    'MODEL-1',
    'MODEL-2',
    'MODEL-10',
  ])
  assert.deepEqual(['SYS-TEST-2', 'STATE-5', 'SYS-TEST-1'].sort(compareRuleIds), [
    'STATE-5',
    'SYS-TEST-1',
    'SYS-TEST-2',
  ])
})

test('the listed rules are in the order the comparator defines', () => {
  const md = contract({
    ...kernelOnly,
    scales: ['small', 'large'],
    adopts: {
      'base-rules': true,
      'shape-profile': ['widget', 'gadget'],
      'language-binding': ['zeta'],
      'runtime-overlay': true,
    },
  })
  const listed = listedRules(md)
  assert.deepEqual(listed, [...listed].sort(compareRuleIds))
})

// ── the production command binds one checkout ────────────────────────────────

/** Run the real CLI, capturing what an operator would see. */
const cli = (...args) =>
  spawnSync(process.execPath, [path.join(REPO, 'scripts', 'generate-contract.mjs'), ...args], {
    encoding: 'utf8',
  })

test('the CLI offers no way to point the rule model at another checkout', () => {
  // The invariant: the checkout supplying the generator and applicability CODE is the
  // checkout supplying the Coral rule MODEL. A flag that moved only the documents would
  // let a 0.8.0 tree read 0.7.0 documents, build a model that truthfully calls itself
  // 0.7.0, pass the target-version check, and then resolve the record under 0.8.0's
  // applicability semantics — every version gate satisfied and the answer from the wrong
  // release. `[VER-3]` says load the SEMANTICS of the targeted version, not its files.
  const rejected = cli('--coral', REPO, '--project', REPO)
  assert.equal(rejected.status, 1)
  assert.match(rejected.stderr, /unknown argument `--coral`/)

  const help = cli('--help')
  assert.equal(help.status, 0)
  assert.ok(!help.stdout.includes('--coral'), 'the help still advertises --coral')
  // And it says where the model comes from, and what to do for another version.
  assert.ok(help.stdout.includes(REPO), 'the help does not name the checkout it generates from')
  assert.match(help.stdout, /check\s*out that version and run its own contract:generate/)
})

test('the CLI generates against its own checkout', () => {
  // Asserted through behaviour rather than by reading the source: a record targeting the
  // version THIS tree describes resolves, which is only true if the model came from here.
  inTree({ [ADHERENCE_FILE]: record({ targets: VERSION, scales: ['app'], adopts: {} }) }, (project) => {
    const run = cli('--project', project, '--stdout')
    assert.equal(run.status, 0, run.stderr)
    assert.ok(run.stdout.startsWith(CONTRACT_PREAMBLE))
    assert.ok(run.stdout.includes(`- Coral: \`${VERSION}\``))
  })
})

// ── 16. the real documents ───────────────────────────────────────────────────

const REAL = loadRuleModel(REPO)

test('the repository model is clean, so the integration assertions mean something', () => {
  assert.deepEqual(REAL.problems, [])
})

/** Coral's own worked `CORAL.md`, as a consuming project's file. */
function workedExample() {
  const text = fs.readFileSync(path.join(REPO, 'CONVENTIONS.md'), 'utf8')
  const start = text.indexOf(ADHERENCE_EXAMPLE_START)
  const end = text.indexOf(ADHERENCE_EXAMPLE_END)
  assert.ok(start !== -1 && end > start, 'the adherence example is not marked in CONVENTIONS.md')
  return text.slice(start, end)
}

test("CONVENTIONS.md's worked CORAL.md generates a real contract end to end", () => {
  const md = inTree({ [ADHERENCE_FILE]: workedExample() }, (project) => {
    const result = loadExecutionContract(REPO, project)
    assert.equal(result.ok, true, result.problems?.join('\n'))
    return result.markdown
  })

  assert.ok(md.startsWith('# Coral project execution contract\n'))
  assert.ok(md.includes(`- Coral: \`${VERSION}\``))
  assert.ok(md.includes('- Scales: `app`'))
  assert.ok(md.includes('- Adopts: `app-profile`: `cli`, `production-baseline`'))

  const listed = listedRules(md)
  // The kernel, unconditionally — every normative kernel rule, and no [guide] one.
  for (const id of REAL.kernel) {
    const normative = ['auto', 'review'].includes(REAL.rules.get(id).cls)
    assert.equal(listed.includes(id), normative, `[${id}] (${REAL.rules.get(id).cls}) is misplaced`)
  }
  // The app-scale baseline and the CLI profile.
  assert.ok(listed.includes('STATE-5'))
  assert.ok(listed.includes('CLI-6'))
  // Every listed rule is applicable AND normative, and is stated.
  for (const id of listed) {
    assert.ok(['auto', 'review'].includes(REAL.rules.get(id).cls), `[${id}] is not normative`)
  }
  assert.deepEqual(listed, [...listed].sort(compareRuleIds))
  assert.equal(new Set(listed).size, listed.length, 'a rule was listed twice')

  // The record's own decisions, carried through.
  assert.ok(md.includes('## Accepted exceptions'))
  assert.ok(md.includes('- `[STATE-5]` — `internal/billing` and descendants'))
  assert.ok(md.includes('## Project extensions'))
  assert.ok(md.includes('- `[ACME-1]` — `internal/billing` and descendants'))

  // And the whole point: no unselected surface, anywhere in the file.
  for (const word of [
    'BE-1', 'BE-2', 'WEB-1', 'LIB-1', 'GHA-1', 'AGENTIC-1', 'ORCH-4',
    'CHAN-1', 'SYS-TEST-1', 'VER-1', 'VER-2', 'SCOPE-1',
    'backend', 'Backend', 'web app', 'Web App', 'library', 'Library',
    'GitHub Action', 'not selected', 'none registered',
  ]) {
    assert.ok(!md.includes(word), `\`${word}\` leaked into a CLI project's contract`)
  }
})

test('a real kernel-only project owes exactly the normative kernel', () => {
  const declaration = { targets: VERSION, scales: ['app'], adopts: {} }
  const md = inTree({ [ADHERENCE_FILE]: record(declaration) }, (project) => {
    const result = loadExecutionContract(REPO, project)
    assert.equal(result.ok, true, result.problems?.join('\n'))
    return result.markdown
  })
  const expected = [...REAL.kernel]
    .filter((id) => ['auto', 'review'].includes(REAL.rules.get(id).cls))
    .sort(compareRuleIds)
  assert.deepEqual(listedRules(md), expected)
})

test('every statement a real contract emits is the rule model\'s canonical one', () => {
  // The self-containment property: an agent reading only this file gets the same
  // sentence it would get from the defining document, so it never has to open one.
  const declaration = { targets: VERSION, scales: ['app'], adopts: { 'app-profile': ['backend'] } }
  const md = inTree({ [ADHERENCE_FILE]: record(declaration) }, (project) => {
    const result = loadExecutionContract(REPO, project)
    assert.equal(result.ok, true, result.problems?.join('\n'))
    return result.markdown
  })
  const statements = extractStatements(REPO, REAL.rules)
  for (const id of listedRules(md)) {
    assert.ok(md.includes(`- \`[${id}]\` ${statements.get(id)}`), `[${id}] was restated`)
  }
})

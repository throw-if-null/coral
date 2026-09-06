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
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
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
  compareRuleIds,
  executionContract,
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

test('the exception section tells an agent not to report the rule again under that path', () => {
  // The behavioural requirement: the contract alone must be enough for an agent working
  // under the excepted path to know the decision is settled, and enough for one working
  // elsewhere to know the rule still binds.
  const md = contract(
    withBase({ exceptions: [{ rule: 'BASE-1', path: 'internal/billing' }] })
  )
  const section = md.slice(md.indexOf('## Accepted exceptions'))
  assert.match(section, /Do not report the named Coral rule as a\nviolation at the stated path or below/)
  assert.match(section, /it remains in force everywhere else/)
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

// ─────────────────────────────────────────────────────────────────────────────
// Tests for the project-applicability resolver — `node --test scripts/`, wired into
// the build.
//
// Two tiers, the same split the other test files use and for the same reason. The
// SYNTHETIC tier builds a whole fixture repository with a vocabulary that is not
// Coral's — `core`, `base-rules`, `shape:widget`, scales `small` and `large` — so a
// test says something about the machinery rather than about today's profile names or
// today's counts. Renaming `{baseline}`, adding a seventh layer or registering a new
// app profile must not touch this file.
//
// The REPOSITORY tier at the bottom pins the handful of things the synthetic tier
// cannot: that Coral's own published ownership keys are adoptable under the names
// external tooling holds, that the kernel is not among them, that framework
// governance is refused, and that the worked example in CONVENTIONS.md is a record
// the resolver actually accepts.
// ─────────────────────────────────────────────────────────────────────────────
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { stringify } from 'yaml'

import {
  CORE_END,
  CORE_START,
  KERNEL_END,
  KERNEL_START,
  LAYERS_END,
  LAYERS_START,
  PROFILES_END,
  PROFILES_START,
  SCALES_END,
  SCALES_START,
  loadRuleModel,
} from './rules.mjs'
import {
  ADHERENCE_EXAMPLE_END,
  ADHERENCE_EXAMPLE_START,
  ADHERENCE_FILE,
  adherenceBlock,
  adherenceTarget,
  effectiveRulesAt,
  loadApplicability,
  parseAdherenceRecord,
  pathApplies,
  pathProblem,
  resolveAdherence,
  resolveApplicability,
  selectableScopes,
} from './applicability.mjs'
import { coralVersion } from './version.mjs'

const REPO = path.resolve(import.meta.dirname, '..')
// The WORKING version, not the released one: these tests resolve records against the model
// this tree describes, which between releases is not the rule set `VERSION` names.
const VERSION = coralVersion(REPO).working

// ── a fixture repository ─────────────────────────────────────────────────────
//
// Deliberately shaped like Coral's without borrowing its words: one implicit layer,
// one adoptable fixed layer whose rules span both scales, one governance layer, two
// profile families, and a second adoptable fixed layer that also spans both scales —
// which is the shape `runtime-agent` has and the one that makes scale filtering
// worth testing separately from adoption.

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
const SCALE_HEADER = [
  '| Scale | Key | Stated in | Read by | Justified by |',
  '|---|---|---|---|---|',
]
const SCALE_ROWS = [
  '| small | `small` | — | one unit | the unit itself |',
  '| large | `large` | `SPREAD.md` | many units | what only exists between units |',
]
const PROFILE_HEADER = ['| Profile | Rules live in | What it covers |', '|---|---|---|']
const PROFILE_ROWS = [
  '| `{shape:widget}` | `appendix/widget.md` | Widget-shaped applications. |',
  '| `{shape:gadget}` | `appendix/gadget.md` | Gadget-shaped applications. |',
]
const KERNEL_HEADER = ['| Rule | Why | Properties |', '|---|---|---|']
// The fixture's front door is its one core document — the registries and the implicit rule
// live there, and nothing opt-in does.
const CORE_HEADER = ['| Document | Defines | Justified by |', '|---|---|---|']
const CORE_ROWS = ['| `CONVENTIONS.md` | the registries and the implicit rule | everyone reads it |']

const conventions = ({ layers = LAYER_ROWS, scales = SCALE_ROWS, profiles = PROFILE_ROWS }) =>
  [
    '# Conventions',
    '',
    '**`[K-1]` `[review]`** — the implicit one.',
    '',
    LAYERS_START,
    '',
    ...LAYER_HEADER,
    ...layers,
    '',
    LAYERS_END,
    '',
    SCALES_START,
    '',
    ...SCALE_HEADER,
    ...scales,
    '',
    SCALES_END,
    '',
    KERNEL_START,
    '',
    ...KERNEL_HEADER,
    '| `[K-1]` | because | locality |',
    '',
    KERNEL_END,
    '',
    PROFILES_START,
    '',
    ...PROFILE_HEADER,
    ...profiles,
    '',
    PROFILES_END,
    '',
    CORE_START,
    '',
    ...CORE_HEADER,
    ...CORE_ROWS,
    '',
    CORE_END,
    '',
  ].join('\n')

/**
 * A whole fixture repository.
 *
 * `BASE-1` and `RT-1` are small-scale; `BASE-2` and `RT-2` are large-scale, because
 * they live in `SPREAD.md`. That is the split PO-04 exists to close — one ownership
 * layer, two audiences — and it is built into the fixture rather than asserted about
 * the real documents, so a test about it says something about the mechanism.
 */
const FIXTURE_VERSION = '9.9.9'

function fixture(overrides = {}) {
  const { layers, scales, profiles, version = FIXTURE_VERSION, extra = {} } = overrides
  return {
    // The version identity of the fixture's rule model. Records are resolved against it, so
    // a test can build a model for a DIFFERENT release simply by naming one. The bare
    // Unreleased heading is the other half: it asserts the tree still describes that release
    // rather than a successor, which the model requires to be stated rather than assumed.
    VERSION: `${version}\n`,
    'CHANGELOG.md': '# Changelog\n\n## Unreleased\n',
    'CONVENTIONS.md': conventions({ layers, scales, profiles }),
    'ARCHITECTURE.md': [
      '# Unit',
      '',
      '**`[BASE-1]` `[review]` `{base}`** — the small-scale base one.',
      '**`[META-1]` `[review]` `{meta}`** — the governance one.',
      '',
    ].join('\n'),
    'SPREAD.md': [
      '# Spread',
      '',
      '**`[BASE-2]` `[review]` `{base}`** — the large-scale base one.',
      '**`[RT-2]` `[review]` `{runtime}`** — the large-scale runtime one.',
      '',
    ].join('\n'),
    'appendix/widget.md': [
      '# Widget',
      '',
      '**`[WID-1]` `[review]` `{shape:widget}`** — the widget one.',
      '',
    ].join('\n'),
    'appendix/gadget.md': [
      '# Gadget',
      '',
      '**`[GAD-1]` `[auto]` `{shape:gadget}`** — the gadget one.',
      '',
    ].join('\n'),
    'appendix/runtime.md': [
      '# Runtime',
      '',
      '**`[RT-1]` `[review]` `{runtime}`** — the small-scale runtime one.',
      '',
    ].join('\n'),
    ...extra,
  }
}

function inTree(tree, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coral-applies-'))
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

/** The fixture's rule model, asserted clean — a broken fixture is not a finding. */
function fixtureModel(overrides) {
  return inTree(fixture(overrides), (dir) => {
    const m = loadRuleModel(dir)
    assert.deepEqual(m.problems, [], 'the fixture repository itself must parse clean')
    return m
  })
}

const MODEL = fixtureModel()

/** A `CORAL.md`, rendered from an object so a test can control key order exactly. */
const record = (declaration) =>
  ['# Coral adherence', '', '```yaml coral', stringify(declaration).trimEnd(), '```', ''].join('\n')

/** Parse and resolve in one step, against the fixture model unless told otherwise. */
const resolve = (declaration, { model = MODEL } = {}) => resolveAdherence(record(declaration), model)

/** The selected rule IDs, sorted — the value every composition test compares. */
const selectedIds = (resolution) => [...resolution.selected].sort()

/** A declaration that adopts nothing, for tests that vary one field. */
const kernelOnly = { targets: FIXTURE_VERSION, scales: ['small'], adopts: {} }

/** A resolution asserted VALID. `ok` is checked, not just the problem list. */
const clean = (resolution) => {
  assert.deepEqual(resolution.problems, [])
  assert.equal(resolution.ok, true, 'a problem-free resolution must be usable')
  return resolution
}

/** A resolution asserted INVALID, and asserted to expose no normative surface. */
function invalid(resolution) {
  assert.equal(resolution.ok, false, `expected an invalid resolution: ${resolution.problems}`)
  assert.ok(resolution.problems.length)
  assert.equal(resolution.selected, undefined, 'an invalid resolution exposed a `selected` set')
  assert.throws(() => effectiveRulesAt(resolution, 'src/anything.go'), TypeError)
  return resolution
}

// ── 1. the floor ─────────────────────────────────────────────────────────────

test('an explicit kernel-only project resolves the kernel and nothing else', () => {
  const r = clean(resolve(kernelOnly))
  assert.deepEqual(selectedIds(r), ['K-1'])
})

test('the kernel cannot be adopted — it is implicit, and selecting it is an error', () => {
  // The mirror of the rule above. A manifest able to select the kernel is a manifest
  // able to decline it, and then "conformant to Coral" means nothing in particular.
  const r = resolve({ ...kernelOnly, adopts: { core: true } })
  assert.ok(
    r.problems.some((p) => /selects the kernel, which is not selectable/.test(p)),
    r.problems.join('\n')
  )
})

// ── 2-4. the production baseline is genuinely optional, and scale-filtered ────

test('a baseline that is not adopted contributes no rule', () => {
  const r = clean(resolve(kernelOnly))
  assert.ok(!r.selected.has('BASE-1'))
  assert.ok(!r.selected.has('BASE-2'))
})

test('adopting the baseline at small scale leaves the large-scale baseline out', () => {
  const r = clean(resolve({ ...kernelOnly, adopts: { 'base-rules': true } }))
  assert.deepEqual(selectedIds(r), ['BASE-1', 'K-1'])
  assert.ok(!r.selected.has('BASE-2'), 'a one-unit project acquired a between-units rule')
})

test('declaring the large scale adds the large-scale baseline, deterministically', () => {
  const both = { ...kernelOnly, scales: ['small', 'large'], adopts: { 'base-rules': true } }
  const first = clean(resolve(both))
  const second = clean(resolve(both))
  assert.deepEqual(selectedIds(first), ['BASE-1', 'BASE-2', 'K-1'])
  assert.deepEqual(selectedIds(first), selectedIds(second))
})

test('the large scale alone brings the large-scale baseline only', () => {
  const r = clean(resolve({ ...kernelOnly, scales: ['large'], adopts: { 'base-rules': true } }))
  assert.deepEqual(selectedIds(r), ['BASE-2', 'K-1'])
})

// ── 5-8. profiles ────────────────────────────────────────────────────────────

test('adopting one profile adds its rules and no other profile of the same layer', () => {
  const r = clean(resolve({ ...kernelOnly, adopts: { 'shape-profile': ['widget'] } }))
  assert.deepEqual(selectedIds(r), ['K-1', 'WID-1'])
  assert.ok(!r.selected.has('GAD-1'))
})

test('two profiles of one layer compose by union', () => {
  const r = clean(resolve({ ...kernelOnly, adopts: { 'shape-profile': ['widget', 'gadget'] } }))
  assert.deepEqual(selectedIds(r), ['GAD-1', 'K-1', 'WID-1'])
})

test('an unregistered profile of a registered layer is an error, not an empty profile', () => {
  const r = invalid(resolve({ ...kernelOnly, adopts: { 'shape-profile': ['widgett'] } }))
  assert.ok(
    r.problems.some((p) => /`widgett` is not a registered/.test(p)),
    r.problems.join('\n')
  )
  assert.ok(!r.diagnostic.selected.has('WID-1'))
})

test('an unregistered language binding is an error too', () => {
  // The layer exists and has no profiles registered — in the fixture as in Coral. An
  // honest zero must still refuse a name, or the empty layer becomes a hole every typo
  // falls through.
  const r = resolve({ ...kernelOnly, adopts: { 'language-binding': ['go'] } })
  assert.ok(
    r.problems.some((p) => /`go` is not a registered/.test(p) && /none/.test(p)),
    r.problems.join('\n')
  )
})

test('a layer that registers profiles cannot be adopted with a boolean', () => {
  const r = resolve({ ...kernelOnly, adopts: { 'shape-profile': true } })
  assert.ok(
    r.problems.some((p) => /must be a list of profile names/.test(p)),
    r.problems.join('\n')
  )
})

test('a layer with a fixed tag cannot be adopted with a list', () => {
  const r = resolve({ ...kernelOnly, adopts: { 'base-rules': ['everything'] } })
  assert.ok(
    r.problems.some((p) => /must be `true` or `false`/.test(p)),
    r.problems.join('\n')
  )
})

// ── 9-11. a fixed opt-in layer that spans both scales ────────────────────────

test('a runtime overlay left false contributes nothing at any scale', () => {
  const r = clean(
    resolve({ ...kernelOnly, scales: ['small', 'large'], adopts: { 'runtime-overlay': false } })
  )
  assert.deepEqual(selectedIds(r), ['K-1'])
})

test('adopting it at one scale does not make its other-scale rules applicable', () => {
  // The `[ORCH-4..6]` shape: one adoption, rules in two documents at two scales. A
  // project that adopts the overlay for its own unit must not thereby owe the rules
  // that only exist between units.
  const r = clean(resolve({ ...kernelOnly, adopts: { 'runtime-overlay': true } }))
  assert.deepEqual(selectedIds(r), ['K-1', 'RT-1'])
  assert.ok(!r.selected.has('RT-2'))
})

test('declaring both scales brings both halves of the overlay', () => {
  const r = clean(
    resolve({ ...kernelOnly, scales: ['small', 'large'], adopts: { 'runtime-overlay': true } })
  )
  assert.deepEqual(selectedIds(r), ['K-1', 'RT-1', 'RT-2'])
})

// ── 12-13. what cannot be adopted at all ─────────────────────────────────────

test('a governance layer cannot be adopted into application conformance', () => {
  const r = resolve({ ...kernelOnly, adopts: { 'meta-rules': true } })
  assert.ok(
    r.problems.some((p) => /not an application conformance layer/.test(p)),
    r.problems.join('\n')
  )
})

test('a governance rule is never selected, however much is adopted', () => {
  const r = clean(
    resolve({
      ...kernelOnly,
      scales: ['small', 'large'],
      adopts: {
        'base-rules': true,
        'runtime-overlay': true,
        'shape-profile': ['widget', 'gadget'],
        'language-binding': [],
      },
    })
  )
  assert.ok(!r.selected.has('META-1'), 'framework governance entered the application rule set')
  assert.deepEqual(selectedIds(r), ['BASE-1', 'BASE-2', 'GAD-1', 'K-1', 'RT-1', 'RT-2', 'WID-1'])
})

test('an unknown ownership kind is an error, not a value that is quietly ignored', () => {
  const r = resolve({ ...kernelOnly, adopts: { 'tenancy-overlay': true } })
  assert.ok(
    r.problems.some((p) => /is not an ownership kind/.test(p)),
    r.problems.join('\n')
  )
})

test('a taxonomy with a non-kernel conformance layer is refused rather than guessed at', () => {
  // Under [VER-6] such a layer has no way to become applicable: not implicit, because
  // only the kernel is, and not adoptable, because its surface says otherwise. The
  // resolver names the contradiction instead of picking a reading.
  const model = fixtureModel({
    layers: [
      ...LAYER_ROWS,
      '| tenancy | `tenancy` | `{tenancy}` | conformance | unscoped | all | why |',
    ],
    extra: {
      'ARCHITECTURE.md': [
        '# Unit',
        '',
        '**`[BASE-1]` `[review]` `{base}`** — the small-scale base one.',
        '**`[META-1]` `[review]` `{meta}`** — the governance one.',
        '**`[TEN-1]` `[review]` `{tenancy}`** — the new conformance one.',
        '',
      ].join('\n'),
    },
  })
  const { problems } = selectableScopes(model)
  assert.ok(
    problems.some((p) => /neither implicit nor\s+adoptable/.test(p)),
    problems.join('\n')
  )
})

// ── 14. fail closed ──────────────────────────────────────────────────────────

test('a record with no `adopts` block fails rather than defaulting', () => {
  const r = invalid(resolve({ targets: FIXTURE_VERSION, scales: ['small'] }))
  assert.ok(
    r.problems.some((p) => /`adopts` must be a mapping/.test(p)),
    r.problems.join('\n')
  )
  assert.equal(r.diagnostic.selected.size, 0, 'a failed declaration must select nothing at all')
})

test('an absent CORAL.md is an undeclared normative surface, not "audit against everything"', () => {
  const r = invalid(inTree({ 'README.md': '# nothing here\n' }, (dir) => loadApplicability(dir, MODEL)))
  assert.ok(
    r.problems.some((p) => /undeclared normative surface/.test(p)),
    r.problems.join('\n')
  )
  assert.equal(r.diagnostic.selected.size, 0)
})

test('a CORAL.md with no machine-readable block fails the same way', () => {
  const r = invalid(
    inTree({ [ADHERENCE_FILE]: '# Coral adherence\n\nWe follow Coral, mostly.\n' }, (dir) =>
      loadApplicability(dir, MODEL)
    )
  )
  assert.ok(
    r.problems.some((p) => /holds no ```yaml coral block/.test(p)),
    r.problems.join('\n')
  )
  assert.equal(r.diagnostic.selected.size, 0)
})

test('`adopts: {}` is a decision and is accepted; silence is not the same decision', () => {
  const explicit = clean(resolve(kernelOnly))
  assert.deepEqual(selectedIds(explicit), ['K-1'])
  const silent = resolve({ targets: '9.9.9', scales: ['small'] })
  assert.ok(silent.problems.length)
})

test('two `yaml coral` blocks in one record is an error, not a first-one-wins', () => {
  const text = [
    '```yaml coral',
    'targets: "9.9.9"',
    '```',
    '',
    '```yaml coral',
    'targets: "1.0.0"',
    '```',
    '',
  ].join('\n')
  const { declaration, problems } = parseAdherenceRecord(text, FIXTURE_VERSION)
  assert.equal(declaration, null)
  assert.ok(problems.some((p) => /holds 2 ```yaml coral blocks/.test(p)), problems.join('\n'))
})

test('a missing or unknown scale fails closed', () => {
  const none = invalid(resolve({ targets: FIXTURE_VERSION, scales: [], adopts: {} }))
  assert.ok(none.problems.some((p) => /`scales` must be a non-empty list/.test(p)))
  const wrong = invalid(
    resolve({ ...kernelOnly, scales: ['enormous'], adopts: { 'base-rules': true } })
  )
  assert.ok(
    wrong.problems.some((p) => /`enormous` is not an architectural scale/.test(p)),
    wrong.problems.join('\n')
  )
  assert.ok(!wrong.diagnostic.selected.has('BASE-1'), 'an unrecognised scale selected rules')
})

test('a field the record does not have is an error, not a typo nobody sees', () => {
  const r = invalid(resolve({ ...kernelOnly, adoptss: { 'base-rules': true } }))
  assert.ok(
    r.problems.some((p) => /`adoptss` is not a field/.test(p)),
    r.problems.join('\n')
  )
})

test('an exception to a rule that IS selected is fine — the stale check is not a blanket ban', () => {
  const r = clean(
    resolve(
      withEntries({ exceptions: [{ rule: 'BASE-1', path: 'internal/billing' }] })
    )
  )
  assert.equal(r.exceptions.length, 1)
})

// ── 15-16. adding to Coral changes nothing until a project adopts ────────────

test('registering a new profile leaves an existing manifest resolving the same set', () => {
  const declaration = { ...kernelOnly, adopts: { 'shape-profile': ['widget'] } }
  const before = clean(resolve(declaration))
  const grown = fixtureModel({
    profiles: [...PROFILE_ROWS, '| `{shape:doohickey}` | `appendix/doohickey.md` | Doohickeys. |'],
    extra: {
      'appendix/doohickey.md': [
        '# Doohickey',
        '',
        '**`[DOO-1]` `[review]` `{shape:doohickey}`** — the doohickey one.',
        '',
      ].join('\n'),
    },
  })
  assert.ok(grown.rules.has('DOO-1'), 'the fixture did not actually grow')
  const after = clean(resolve(declaration, { model: grown }))
  assert.deepEqual(selectedIds(after), selectedIds(before))
})

test('a whole new optional layer leaves an existing manifest unchanged until it is adopted', () => {
  const declaration = { ...kernelOnly, adopts: { 'base-rules': true } }
  const before = clean(resolve(declaration))
  const grown = fixtureModel({
    layers: [
      ...LAYER_ROWS,
      '| tenancy overlay | `tenancy-overlay` | `{tenancy}` | opt-in | profile-scoped | tenants | why |',
    ],
    extra: {
      'appendix/tenancy.md': [
        '# Tenancy',
        '',
        '**`[TEN-1]` `[review]` `{tenancy}`** — the tenancy one.',
        '',
      ].join('\n'),
    },
  })
  assert.ok(grown.rules.has('TEN-1'), 'the fixture did not actually grow')
  const after = clean(resolve(declaration, { model: grown }))
  assert.deepEqual(selectedIds(after), selectedIds(before))
  // …and it is adoptable the moment the project says so, with no code change.
  const adopting = clean(
    resolve({ ...declaration, adopts: { ...declaration.adopts, 'tenancy-overlay': true } }, { model: grown })
  )
  assert.ok(adopting.selected.has('TEN-1'))
})

// ── 17-18. the algebra is a set ──────────────────────────────────────────────

test('declaration order does not affect the effective rule set', () => {
  const a = clean(
    resolve({
      targets: '9.9.9',
      scales: ['small', 'large'],
      adopts: {
        'base-rules': true,
        'shape-profile': ['widget', 'gadget'],
        'runtime-overlay': true,
      },
    })
  )
  const b = clean(
    resolve({
      adopts: {
        'runtime-overlay': true,
        'shape-profile': ['gadget', 'widget'],
        'base-rules': true,
      },
      scales: ['large', 'small'],
      targets: '9.9.9',
    })
  )
  assert.deepEqual(selectedIds(a), selectedIds(b))
  assert.deepEqual([...a.adopted.entries()].sort(), [...b.adopted.entries()].sort())
})

test('selecting the same thing twice does not change the set', () => {
  const once = clean(resolve({ ...kernelOnly, adopts: { 'shape-profile': ['widget'] } }))
  const twice = clean(
    resolve({ ...kernelOnly, adopts: { 'shape-profile': ['widget', 'widget'] } })
  )
  assert.deepEqual(selectedIds(twice), selectedIds(once))
  assert.deepEqual(twice.adopted.get('shape-profile'), ['widget'])
})

test('declaring a scale twice does not change the set either', () => {
  const once = clean(resolve({ ...kernelOnly, adopts: { 'base-rules': true } }))
  const twice = clean(
    resolve({ ...kernelOnly, scales: ['small', 'small'], adopts: { 'base-rules': true } })
  )
  assert.deepEqual(selectedIds(twice), selectedIds(once))
})

// ── 19-21. exceptions ────────────────────────────────────────────────────────

const withEntries = (extra) => ({
  targets: '9.9.9',
  scales: ['small'],
  adopts: { 'base-rules': true, 'shape-profile': ['widget'] },
  ...extra,
})

test('a scoped exception removes its exact rule at the paths it covers', () => {
  const r = clean(
    resolve(
      withEntries({
        exceptions: [{ rule: 'BASE-1', path: 'internal/billing', reason: 'in flight' }],
      })
    )
  )
  const inside = effectiveRulesAt(r, 'internal/billing/invoice.go')
  assert.ok(!inside.coral.includes('BASE-1'))
  assert.deepEqual(inside.suppressed, ['BASE-1'])
  // and only that rule
  assert.ok(inside.coral.includes('WID-1'))
  assert.ok(inside.coral.includes('K-1'))
})

test('the same rule still applies outside the exception\'s path', () => {
  const r = clean(
    resolve(withEntries({ exceptions: [{ rule: 'BASE-1', path: 'internal/billing' }] }))
  )
  for (const outside of ['internal/shipping/rate.go', 'cmd/app/main.go', 'internal/billing-archive/x']) {
    const at = effectiveRulesAt(r, outside)
    assert.ok(at.coral.includes('BASE-1'), `[BASE-1] was dropped at ${outside}`)
    assert.deepEqual(at.suppressed, [])
  }
  // the selected set itself is untouched — an exception narrows a path, not the project
  assert.ok(r.selected.has('BASE-1'))
})

test('an exception to a rule the project has not selected is rejected as stale', () => {
  const r = invalid(resolve(withEntries({ exceptions: [{ rule: 'GAD-1', path: 'internal/gadgets' }] })))
  assert.ok(
    r.problems.some((p) => /is not in this project's selected rule set/.test(p)),
    r.problems.join('\n')
  )
  assert.equal(r.diagnostic.exceptions.length, 0, 'a stale entry was kept as a dormant override')
})

test('an exception to a `[guide]` rule is rejected — there is nothing to excuse', () => {
  // A guide is rationale, not instruction: it is in no Agent Execution Contract and is
  // never reported as a violation, so an entry excusing one records a deviation nobody
  // could have been in breach of. Left accepted it is worse than useless — it is a
  // decision that either vanishes from a generated execution contract or appears there
  // against a rule the contract does not list.
  const model = fixtureModel({
    extra: {
      'appendix/rationale.md':
        '# Rationale\n\n**`[BASE-9]` `[guide]` `{base}`** — the rationale one.\n',
    },
  })
  const r = invalid(
    resolve(withEntries({ exceptions: [{ rule: 'BASE-9', path: 'internal/billing' }] }), { model })
  )
  assert.ok(
    r.problems.some((p) => /`BASE-9`, which is `\[guide\]` and is therefore not normative/.test(p)),
    r.problems.join('\n')
  )
  assert.equal(r.diagnostic.exceptions.length, 0)
  // And it is refused on THAT ground, not as a stale entry: the rule is selected, and
  // "adopt the layer" would be advice that fixes nothing.
  assert.ok(!r.problems.some((p) => /is not in this project's selected rule set/.test(p)))
})

test('an exception to a `[guide]` rule the project has NOT selected is still refused as a guide', () => {
  const model = fixtureModel({
    extra: {
      'appendix/gadget.md':
        '# Gadget\n\n**`[GAD-1]` `[auto]` `{shape:gadget}`** — the gadget one.\n' +
        '**`[GAD-9]` `[guide]` `{shape:gadget}`** — the gadget rationale.\n',
    },
  })
  const r = invalid(
    resolve(withEntries({ exceptions: [{ rule: 'GAD-9', path: 'internal/x' }] }), { model })
  )
  assert.ok(
    r.problems.some((p) => /not normative/.test(p)),
    r.problems.join('\n')
  )
})

test('an exception to a rule Coral does not define at all is rejected', () => {
  const r = invalid(resolve(withEntries({ exceptions: [{ rule: 'GHOST-1', path: 'internal/x' }] })))
  assert.ok(
    r.problems.some((p) => /does not define/.test(p)),
    r.problems.join('\n')
  )
})

test('an exception with no path is rejected', () => {
  const r = invalid(resolve(withEntries({ exceptions: [{ rule: 'BASE-1' }] })))
  assert.ok(
    r.problems.some((p) => /names no path/.test(p)),
    r.problems.join('\n')
  )
})

// ── 22-24. extensions ────────────────────────────────────────────────────────

const extension = (over = {}) => ({
  rule: 'ACME-1',
  path: 'internal/billing',
  statement: 'every invoice writer logs the tenant id',
  ...over,
})

test('a project extension applies only inside its scope', () => {
  const r = clean(resolve(withEntries({ extensions: [extension()] })))
  assert.deepEqual(effectiveRulesAt(r, 'internal/billing/invoice.go').extensions, ['ACME-1'])
  assert.deepEqual(effectiveRulesAt(r, 'internal/shipping/rate.go').extensions, [])
  assert.deepEqual(effectiveRulesAt(r, 'internal/billing-archive/old.go').extensions, [])
})

test('an extension may not carry a Coral rule ID', () => {
  const r = invalid(resolve(withEntries({ extensions: [extension({ rule: 'BASE-1' })] })))
  assert.ok(
    r.problems.some((p) => /is a Coral rule\. An extension adds a rule Coral does not/.test(p)),
    r.problems.join('\n')
  )
  assert.equal(r.diagnostic.extensions.length, 0)
})

test('an extension may not reuse a Coral family name', () => {
  // The collision [VER-4] describes: `BASE-99` is free today and is Coral's tomorrow,
  // and then two documents hold one citation with nothing saying which is meant.
  const r = invalid(resolve(withEntries({ extensions: [extension({ rule: 'BASE-99' })] })))
  assert.ok(
    r.problems.some((p) => /reuses the Coral family `BASE`/.test(p)),
    r.problems.join('\n')
  )
})

test('an extension without the [VER-5] path is rejected', () => {
  const r = invalid(
    resolve(withEntries({ extensions: [{ rule: 'ACME-1', statement: 'do the thing' }] }))
  )
  assert.ok(
    r.problems.some((p) => /names no path/.test(p)),
    r.problems.join('\n')
  )
  assert.equal(r.diagnostic.extensions.length, 0)
})

test('an extension that states no rule is rejected', () => {
  const r = invalid(
    resolve(withEntries({ extensions: [{ rule: 'ACME-1', path: 'internal/billing' }] }))
  )
  assert.ok(
    r.problems.some((p) => /states no rule/.test(p)),
    r.problems.join('\n')
  )
})

test('a project rule ID may be defined only once, whatever the paths', () => {
  // An extension DEFINES its rule, so two entries under one ID are two rules answering to one
  // citation — and at a path both cover, `ACME-1` names neither of them.
  const sameStatement = invalid(
    resolve(
      withEntries({
        extensions: [
          extension({ rule: 'ACME-1', path: 'internal', statement: 'every request logs the tenant' }),
          extension({ rule: 'ACME-1', path: 'internal/billing', statement: 'invoices use decimals' }),
        ],
      })
    )
  )
  assert.ok(
    sameStatement.problems.some((p) => /declares `ACME-1` a second time/.test(p)),
    sameStatement.problems.join('\n')
  )
  // …and identically when only the statement differs, at one path
  const samePath = invalid(
    resolve(
      withEntries({
        extensions: [
          extension({ rule: 'ACME-1', statement: 'one thing' }),
          extension({ rule: 'ACME-1', statement: 'a different thing' }),
        ],
      })
    )
  )
  assert.ok(samePath.problems.some((p) => /declares `ACME-1` a second time/.test(p)))
})

test('two different project rule IDs are fine, in either order', () => {
  const forward = clean(
    resolve(
      withEntries({
        extensions: [
          extension({ rule: 'ACME-1', path: 'internal/billing' }),
          extension({ rule: 'ACME-2', path: 'internal/shipping' }),
        ],
      })
    )
  )
  const reversed = clean(
    resolve(
      withEntries({
        extensions: [
          extension({ rule: 'ACME-2', path: 'internal/shipping' }),
          extension({ rule: 'ACME-1', path: 'internal/billing' }),
        ],
      })
    )
  )
  const at = (r, p) => effectiveRulesAt(r, p).extensions
  assert.deepEqual(at(forward, 'internal/billing/x.go'), ['ACME-1'])
  assert.deepEqual(at(forward, 'internal/shipping/y.go'), ['ACME-2'])
  assert.deepEqual(at(forward, 'internal/billing/x.go'), at(reversed, 'internal/billing/x.go'))
  assert.deepEqual(at(forward, 'internal/shipping/y.go'), at(reversed, 'internal/shipping/y.go'))
})

test('two exceptions may name one Coral rule in two subtrees — the ID is already canonical', () => {
  // The asymmetry with extensions, stated as a test: an exception SELECTS a rule Coral has
  // already defined, so two of them are two decisions about two places, not two definitions.
  const r = clean(
    resolve(
      withEntries({
        exceptions: [
          { rule: 'BASE-1', path: 'internal/billing', reason: 'in flight' },
          { rule: 'BASE-1', path: 'internal/legacy', reason: 'pending rewrite' },
        ],
      })
    )
  )
  assert.equal(r.exceptions.length, 2)
  assert.deepEqual(effectiveRulesAt(r, 'internal/billing/x.go').suppressed, ['BASE-1'])
  assert.deepEqual(effectiveRulesAt(r, 'internal/legacy/y.go').suppressed, ['BASE-1'])
  assert.deepEqual(effectiveRulesAt(r, 'internal/shipping/z.go').suppressed, [])
})

test('replacing a Coral rule is two entries, and both of them work', () => {
  // The documented way to diverge: an exception to the Coral rule plus a project rule of
  // the project's own. "Extension" never secretly means "override", so this is what the
  // record has to look like — and the resolver has to accept it.
  const r = clean(
    resolve(
      withEntries({
        exceptions: [{ rule: 'BASE-1', path: 'internal/billing' }],
        extensions: [extension()],
      })
    )
  )
  const at = effectiveRulesAt(r, 'internal/billing/invoice.go')
  assert.deepEqual(at.suppressed, ['BASE-1'])
  assert.deepEqual(at.extensions, ['ACME-1'])
})

// ── 25. no precedence ────────────────────────────────────────────────────────

test('composition has no "later layer wins" behaviour', () => {
  // Every ordering of the same adoptions yields the same set, and adding a layer only
  // ever adds: no adopted layer can remove or replace what another contributed.
  const base = clean(resolve({ ...kernelOnly, adopts: { 'base-rules': true } }))
  const plusProfile = clean(
    resolve({ ...kernelOnly, adopts: { 'base-rules': true, 'shape-profile': ['widget'] } })
  )
  const profileFirst = clean(
    resolve({ ...kernelOnly, adopts: { 'shape-profile': ['widget'], 'base-rules': true } })
  )
  assert.deepEqual(selectedIds(plusProfile), selectedIds(profileFirst))
  for (const id of selectedIds(base)) {
    assert.ok(plusProfile.selected.has(id), `[${id}] was removed by adopting another layer`)
  }
  assert.deepEqual(
    selectedIds(plusProfile),
    [...new Set([...selectedIds(base), 'WID-1'])].sort()
  )
})

test('an adopted profile cannot suppress a rule from another adopted layer', () => {
  // Stated separately from the union check because it is the property a "more specific
  // wins" implementation would break while still passing a count comparison.
  const all = clean(
    resolve({
      ...kernelOnly,
      scales: ['small', 'large'],
      adopts: { 'base-rules': true, 'shape-profile': ['widget', 'gadget'], 'runtime-overlay': true },
    })
  )
  for (const id of ['BASE-1', 'BASE-2', 'RT-1', 'RT-2', 'WID-1', 'GAD-1', 'K-1']) {
    assert.ok(all.selected.has(id), `[${id}] is missing from a manifest that adopts everything`)
  }
})

// ── paths ────────────────────────────────────────────────────────────────────

test('path forms that cannot be decided are refused rather than interpreted', () => {
  for (const bad of ['**', 'src/**', 'internal/*', '/etc/passwd', '..', 'a/../b', '']) {
    assert.ok(pathProblem(bad), `\`${bad}\` was accepted as an entry path`)
    assert.ok(pathProblem(bad, { allowRoot: true }), `\`${bad}\` was accepted at the root`)
  }
  for (const good of ['internal/billing', 'src', 'a/b/c', './src/app']) {
    assert.equal(pathProblem(good), null, `\`${good}\` was rejected`)
  }
})

test('a path carrying a line break or a control character is refused', () => {
  // A path is written by a human, printed in a diagnostic and rendered into a generated
  // execution contract, and all three are line-oriented. One that cannot be shown without
  // changing what it names is refused for the same reason a glob is: nothing can check it.
  for (const bad of ['internal/bil\nling', 'internal/\tbilling', 'internal/bill\u0000ing']) {
    assert.match(pathProblem(bad), /line break or a control character/, JSON.stringify(bad))
  }
  // Checked BEFORE the trim, which is the case that would otherwise pass silently: a
  // trailing newline is exactly what `.trim()` removes, so a check that ran after it would
  // resolve `internal/billing\n` as `internal/billing` — the same path under a different
  // name, which is the renaming this refusal exists to prevent rather than an instance of
  // it being caught.
  for (const edge of ['internal/billing\n', '\tinternal/billing', 'internal/billing\r', '\ninternal/billing\n']) {
    assert.match(pathProblem(edge), /line break or a control character/, JSON.stringify(edge))
  }
  assert.match(pathProblem('internal/billing\n'), /silently rename/)
  // An entry carrying one is refused by the resolver, not normalized into a neighbour.
  const r = invalid(resolve(withEntries({ exceptions: [{ rule: 'BASE-1', path: 'internal/billing\n' }] })))
  assert.ok(r.problems.some((p) => /line break or a control character/.test(p)), r.problems.join('\n'))
  // Ordinary awkward characters stay legal — a backtick is a POSIX filename character, and
  // the contract generator renders it rather than the record refusing it.
  assert.equal(pathProblem('internal/bi`ll'), null)
  assert.equal(pathProblem('internal/bill ing'), null)
})

test('the repository root is a path only where the record type allows it', () => {
  // The asymmetry, at the level it is decided. Declining a Coral rule everywhere is a
  // statement about the rule; adding a project rule everywhere is a statement about the
  // project, and Coral has no claim on it.
  for (const root of ['.', './', './/']) {
    assert.match(pathProblem(root), /file an amendment/)
    assert.equal(pathProblem(root, { allowRoot: true }), null, `\`${root}\` was rejected at root`)
  }
  // and an ABSENT path is still absent — it does not become the root by omission
  assert.match(pathProblem(undefined, { allowRoot: true }), /names no path/)
  assert.match(pathProblem('', { allowRoot: true }), /names no path/)
  assert.match(pathProblem('   ', { allowRoot: true }), /names no path/)
})

test('the root path covers every target; a subtree still does not cover its siblings', () => {
  for (const target of ['x.go', 'internal/billing/invoice.go', 'a/b/c/d.py', '.']) {
    assert.ok(pathApplies('.', target), `root did not cover ${target}`)
    assert.ok(pathApplies('./', target), `root did not cover ${target}`)
  }
  assert.ok(!pathApplies('internal', '.'))
})

test('a repository-wide project extension applies everywhere', () => {
  // The case the old policy made inexpressible: a rule that is genuinely local to this
  // project and genuinely covers all of it — an org trace header, a metadata descriptor —
  // and that Coral should never adopt.
  const r = clean(
    resolve(
      withEntries({
        extensions: [
          extension({ rule: 'ACME-1', path: '.', statement: 'every outbound request carries X-Acme-Trace' }),
        ],
      })
    )
  )
  assert.equal(r.extensions[0].path, '.')
  for (const target of ['main.go', 'internal/billing/invoice.go', 'deep/ly/nested/file.py']) {
    assert.deepEqual(effectiveRulesAt(r, target).extensions, ['ACME-1'], `missing at ${target}`)
  }
})

test('a repository-wide EXCEPTION is still refused — that is an amendment', () => {
  const r = invalid(resolve(withEntries({ exceptions: [{ rule: 'BASE-1', path: '.' }] })))
  assert.ok(
    r.problems.some((p) => /file an amendment/.test(p)),
    r.problems.join('\n')
  )
  assert.equal(r.diagnostic.exceptions.length, 0)
})

test('`**` is still refused on an extension, root permission or not', () => {
  for (const pattern of ['**', '*', 'src/**']) {
    const r = invalid(resolve(withEntries({ extensions: [extension({ path: pattern })] })))
    assert.ok(
      r.problems.some((p) => /is a pattern rather than a place/.test(p)),
      `\`${pattern}\` was accepted: ${r.problems.join('\n')}`
    )
  }
})

test('path matching is on segments, so a sibling with a shared prefix is not covered', () => {
  assert.ok(pathApplies('internal/billing', 'internal/billing'))
  assert.ok(pathApplies('internal/billing', 'internal/billing/invoice.go'))
  assert.ok(pathApplies('internal/billing/', 'internal/billing/deep/x.go'))
  assert.ok(!pathApplies('internal/billing', 'internal/billing-archive/x.go'))
  assert.ok(!pathApplies('internal/billing', 'internal'))
})

test('the effective set at a path is sorted, so it is a function of content not of order', () => {
  const a = clean(
    resolve(
      withEntries({
        extensions: [extension({ rule: 'ACME-2' }), extension({ rule: 'ACME-1' })],
      })
    )
  )
  assert.deepEqual(effectiveRulesAt(a, 'internal/billing/x.go').extensions, ['ACME-1', 'ACME-2'])
})

// ── block extraction ─────────────────────────────────────────────────────────

test('the record is found inside a documentation fence, which is how the example is checked', () => {
  const nested = [
    '````markdown',
    '# Coral adherence',
    '',
    '```yaml coral',
    'targets: "9.9.9"',
    '```',
    '````',
    '',
  ].join('\n')
  const { body, problems } = adherenceBlock(nested)
  assert.deepEqual(problems, [])
  assert.equal(body.trim(), 'targets: "9.9.9"')
})

test('an unclosed block is an error, not half a record', () => {
  const { body, problems } = adherenceBlock('```yaml coral\ntargets: "9.9.9"\n')
  assert.equal(body, null)
  assert.ok(problems.some((p) => /never closed/.test(p)), problems.join('\n'))
})

test('a block that is not valid YAML says so', () => {
  const { declaration, problems } = parseAdherenceRecord(
    '```yaml coral\n\tadopts: [\n```\n',
    FIXTURE_VERSION
  )
  assert.equal(declaration, null)
  assert.ok(problems.some((p) => /not valid YAML/.test(p)), problems.join('\n'))
})

// ── version first, schema second ─────────────────────────────────────────────
//
// `[VER-6]` is itself versioned. A record written for a release that predates it has no
// adoption block and is not wrong for lacking one, so the target has to be readable — and
// acted on — before any field is required. Getting this backwards applies the new rule
// retroactively to every existing project, which is the failure `[VER-3]` names.

/** A pre-VER-6 `CORAL.md`: a target and the entries, and nothing this release added. */
const LEGACY_RECORD = [
  '# Coral adherence',
  '',
  '```yaml coral',
  'targets: "9.8.0"',
  '',
  'exceptions:',
  '  - rule: BASE-1',
  '    path: internal/billing',
  '    reason: two slices co-own the invoice table',
  '```',
  '',
].join('\n')

test('a pre-VER-6 record has its target identified without `scales` or `adopts`', () => {
  const { targets, problems } = adherenceTarget(LEGACY_RECORD)
  assert.deepEqual(problems, [])
  assert.equal(targets, '9.8.0')
})

test('a pre-VER-6 record is not reported as violating [VER-6]', () => {
  // The whole point. The answer is "load that release's semantics", not "your record is
  // missing a field that release never had".
  const r = invalid(resolveAdherence(LEGACY_RECORD, MODEL))
  const said = r.problems.join('\n')
  assert.match(said, /targets Coral 9\.8\.0/)
  assert.match(said, /Load Coral 9\.8\.0's rule set and its applicability semantics/)
  assert.doesNotMatch(said, /`adopts`/)
  assert.doesNotMatch(said, /`scales`/)
  assert.doesNotMatch(said, /VER-6/)
})

test('the release that introduces the declaration DOES require `scales` and `adopts`', () => {
  // Same file, same parser, target moved onto the model's own version. Now the fields are
  // owed, and the complaint names them.
  const current = LEGACY_RECORD.replace('9.8.0', FIXTURE_VERSION)
  const r = invalid(resolveAdherence(current, MODEL))
  const said = r.problems.join('\n')
  assert.match(said, /`scales` must be a non-empty list/)
  assert.match(said, /`adopts` must be a mapping/)
  assert.doesNotMatch(said, /Load Coral/)
})

test('any target other than the model\'s own is refused the same way, older or newer', () => {
  for (const target of ['0.1.0', '9.8.0', '9.9.8', '10.0.0']) {
    const r = invalid(resolveAdherence(LEGACY_RECORD.replace('9.8.0', target), MODEL))
    assert.match(r.problems.join('\n'), new RegExp(`targets Coral ${target.replace(/\./g, '\\.')}`))
  }
  // …and the identity that decides it is the model's, not a caller's opinion.
  const older = fixtureModel({ version: '9.8.0' })
  assert.equal(older.version, '9.8.0')
  const r = invalid(resolveAdherence(record(kernelOnly), older))
  assert.match(r.problems.join('\n'), /targets Coral 9\.9\.9, and this is the Coral 9\.8\.0 model/)
})

test('a record cannot be validated against an unidentified release', () => {
  // Not a reported problem — a thrown precondition. An optional version check is one a
  // caller forgets, and forgetting it is how a project gets audited against rules its
  // target predates.
  assert.throws(() => parseAdherenceRecord(record(kernelOnly)), TypeError)
  assert.throws(() => parseAdherenceRecord(record(kernelOnly), 'latest'), TypeError)
  const declaration = parseAdherenceRecord(record(kernelOnly), FIXTURE_VERSION).declaration
  assert.ok(declaration)
  assert.throws(() => resolveApplicability(declaration, { ...MODEL, version: undefined }), TypeError)
  assert.throws(() => resolveApplicability(declaration, { ...MODEL, version: '' }), TypeError)
})

// ── an invalid resolution is not consumable ──────────────────────────────────

test('one valid selection plus one invalid one yields no consumable normative surface', () => {
  // The shape that made the old API dangerous: everything about this declaration is fine
  // except one profile name, so a partially-populated `selected` would look entirely normal
  // beside a problem list a caller might not read.
  const r = resolve({
    ...kernelOnly,
    adopts: { 'base-rules': true, 'shape-profile': ['widget', 'widgett'] },
  })
  assert.equal(r.ok, false)
  assert.equal(r.selected, undefined, 'an invalid resolution exposed a normative rule set')
  assert.ok(r.problems.some((p) => /`widgett` is not a registered/.test(p)))
  // the partial answer survives, spelled so it cannot be mistaken for the surface
  assert.ok(r.diagnostic.selected.has('BASE-1'))
  assert.ok(r.diagnostic.selected.has('WID-1'))
})

test('effectiveRulesAt refuses an invalid resolution rather than answering emptily', () => {
  // An empty effective set would read as "this path owes nothing", which is a different and
  // equally wrong claim from "nobody has said what this path owes".
  const r = resolve({ ...kernelOnly, adopts: { 'shape-profile': ['widgett'] } })
  assert.throws(
    () => effectiveRulesAt(r, 'internal/billing/invoice.go'),
    (e) => e instanceof TypeError && /names no normative rule set/.test(e.message)
  )
  assert.throws(() => effectiveRulesAt(undefined, 'x.go'), TypeError)
  // and the diagnostic set cannot be smuggled in as one either
  assert.throws(() => effectiveRulesAt(r.diagnostic, 'x.go'), TypeError)
})

// ── the real documents ───────────────────────────────────────────────────────

const REAL = loadRuleModel(REPO)

test('the repository model is clean, so the integration assertions mean something', () => {
  assert.deepEqual(REAL.problems, [])
})

test("Coral's own published ownership keys are the adoption vocabulary", () => {
  // The compatibility lock, in the one place it belongs: these are the strings a
  // consuming project writes in its `CORAL.md`, so renaming one is a break for every
  // manifest in existence. Adding a key stays free — this is a required subset.
  const { selectable, problems } = selectableScopes(REAL)
  assert.deepEqual(problems, [])
  for (const kind of ['production-baseline', 'app-profile', 'language-binding', 'runtime-agent-profile']) {
    assert.ok(selectable.has(kind), `\`${kind}\` is no longer adoptable`)
  }
  assert.ok(!selectable.has('kernel'), 'the kernel became selectable')
  assert.ok(!selectable.has('framework-governance'), 'framework governance became selectable')
  assert.equal(selectable.get('production-baseline').form, 'flag')
  assert.equal(selectable.get('runtime-agent-profile').form, 'flag')
  assert.equal(selectable.get('app-profile').form, 'profiles')
  assert.equal(selectable.get('language-binding').form, 'profiles')
})

test('a standalone CLI on the real rule set gets the app-scale baseline and the CLI profile', () => {
  const r = clean(
    resolve(
      {
        targets: VERSION,
        scales: ['app'],
        adopts: {
          'production-baseline': true,
          'app-profile': ['cli'],
          'language-binding': [],
          'runtime-agent-profile': false,
        },
      },
      { model: REAL, version: VERSION }
    )
  )
  // the kernel, unconditionally
  for (const id of REAL.kernel) assert.ok(r.selected.has(id), `[${id}] is a kernel rule`)
  // the app-scale baseline, and not the system-scale one
  assert.ok(r.selected.has('STATE-5'))
  assert.ok(!r.selected.has('CHAN-1'), 'a one-app CLI acquired a channel rule')
  assert.ok(!r.selected.has('SYS-TEST-1'))
  // its own profile, and no other
  assert.ok(r.selected.has('CLI-6'))
  assert.ok(!r.selected.has('BE-1'))
  assert.ok(!r.selected.has('WEB-1'))
  // no runtime-agent rules, at either scale
  assert.ok(!r.selected.has('AGENTIC-1'))
  assert.ok(!r.selected.has('ORCH-4'))
  // and no framework governance, ever
  assert.ok(!r.selected.has('VER-1'))
  assert.ok(!r.selected.has('VER-2'))
})

test('an agentic backend in a multi-app system gets [ORCH-4..6]; an app-only one does not', () => {
  const adopts = {
    'production-baseline': true,
    'app-profile': ['backend'],
    'runtime-agent-profile': true,
  }
  const system = clean(
    resolve({ targets: VERSION, scales: ['app', 'system'], adopts }, { model: REAL, version: VERSION })
  )
  for (const id of ['ORCH-4', 'ORCH-5', 'ORCH-6', 'CHAN-1', 'AGENTIC-1', 'BE-1']) {
    assert.ok(system.selected.has(id), `[${id}] is missing from the system-scale selection`)
  }
  const appOnly = clean(
    resolve({ targets: VERSION, scales: ['app'], adopts }, { model: REAL, version: VERSION })
  )
  assert.ok(appOnly.selected.has('AGENTIC-1'), 'the app-scale runtime-agent rules were dropped')
  for (const id of ['ORCH-4', 'ORCH-5', 'ORCH-6', 'CHAN-1']) {
    assert.ok(!appOnly.selected.has(id), `[${id}] became applicable to an app-only project`)
  }
})

test('a kernel-only project on the real rule set owes exactly the kernel', () => {
  const r = clean(
    resolve(
      { targets: VERSION, scales: ['app'], adopts: {} },
      { model: REAL, version: VERSION }
    )
  )
  assert.deepEqual([...r.selected].sort(), [...REAL.kernel].sort())
})

// ── PO-06: the split is a document move, and applicability did not follow it ──
//
// The documents moved; the resolver did not, and must not. These pin the four claims a
// reader of that change has to be able to check: that adopting a profile is not a back door
// into the baseline, that adopting the runtime-agent profile is not either, that the
// system-scale baseline is still system-scale after the app-scale half left ARCHITECTURE.md,
// and that the resolver reads ownership and scale rather than the page a rule is written on.

const REAL_ADOPT = (adopts, scales = ['app']) =>
  clean(resolve({ targets: VERSION, scales, adopts }, { model: REAL, version: VERSION }))

const baselineIds = () =>
  [...REAL.rules].filter(([, r]) => r.scope.kind === 'production-baseline').map(([id]) => id)

test('adopting an app profile alone brings no production-baseline rule', () => {
  // The failure this would be: a project takes `app-profile: [cli]`, and because the CLI
  // appendix refines baseline rules, the baseline arrives with it. Nothing in the resolver
  // does that, and nothing in the document restructuring changed it.
  const r = REAL_ADOPT({ 'app-profile': ['cli'] })
  assert.ok(r.selected.has('CLI-6'), 'the adopted profile contributed nothing')
  for (const id of baselineIds()) {
    assert.ok(!r.selected.has(id), `[${id}] arrived with an app profile that did not adopt it`)
  }
  // exactly the kernel plus the CLI profile's app-scale rules, and nothing else
  const expected = [...REAL.rules]
    .filter(
      ([id, rule]) =>
        REAL.kernel.has(id) || (rule.scope.profile === 'cli' && rule.scale === 'app')
    )
    .map(([id]) => id)
  assert.deepEqual([...r.selected].sort(), expected.sort())
})

test('adopting the runtime-agent profile alone brings no production-baseline rule', () => {
  // Both scales, so the system-scale half of each layer is in play: [ORCH-4..6] must arrive
  // and [CHAN-1] must not. The two are in one document and always have been; what makes them
  // separable is the ownership tag, not the page.
  const r = REAL_ADOPT({ 'runtime-agent-profile': true }, ['app', 'system'])
  for (const id of ['AGENTIC-1', 'ORCH-4', 'ORCH-5', 'ORCH-6']) {
    assert.ok(r.selected.has(id), `[${id}] is a runtime-agent rule and was not selected`)
  }
  for (const id of baselineIds()) {
    assert.ok(!r.selected.has(id), `[${id}] arrived with the runtime-agent profile`)
  }
})

test('adopting the production baseline alone brings no profile and no runtime-agent rule', () => {
  const r = REAL_ADOPT({ 'production-baseline': true }, ['app', 'system'])
  assert.ok(r.selected.has('STATE-5'), 'the app-scale baseline was not selected')
  assert.ok(r.selected.has('CHAN-1'), 'the system-scale baseline was not selected')
  for (const id of ['CLI-6', 'BE-1', 'WEB-1', 'LIB-3', 'GHA-1', 'AGENTIC-1', 'ORCH-4']) {
    assert.ok(!r.selected.has(id), `[${id}] arrived with the production baseline`)
  }
})

test('the system-scale baseline is still system-scale after the app-scale half moved out', () => {
  // Scale is derived from the defining document, so moving seventy rules to a new one is
  // exactly the change that could have altered it by accident. SYSTEM.md keeps its scale row;
  // PRODUCTION.md falls to the `app` default like every other unclaimed document.
  for (const id of ['CHAN-1', 'CHAN-10', 'SYS-TEST-1', 'ORCH-4']) {
    assert.equal(REAL.rules.get(id).scale, 'system', `[${id}] left system scale`)
  }
  for (const id of ['STATE-5', 'CONC-1', 'ERR-1', 'BUCKET-1', 'SCOPE-3']) {
    assert.equal(REAL.rules.get(id).scale, 'app', `[${id}] left app scale`)
  }
  // and a one-app project that adopts the baseline takes the first set and not the second
  const appOnly = REAL_ADOPT({ 'production-baseline': true }, ['app'])
  assert.ok(appOnly.selected.has('STATE-5'))
  for (const id of ['CHAN-1', 'CHAN-10', 'SYS-TEST-1']) {
    assert.ok(!appOnly.selected.has(id), `[${id}] reached a one-app project`)
  }
})

test('the applicable set is decided by ownership and scale, never by the defining document', () => {
  // The claim the whole restructuring rests on. Every selected rule is either a kernel rule
  // or one whose layer the declaration adopts at a scale the declaration names — computed
  // from the rule model, with the page never consulted.
  const adopts = { 'production-baseline': true, 'app-profile': ['cli'] }
  const r = REAL_ADOPT(adopts, ['app'])
  for (const id of r.selected) {
    const rule = REAL.rules.get(id)
    if (REAL.kernel.has(id)) continue
    assert.equal(rule.scale, 'app', `[${id}] was selected at a scale the project did not declare`)
    const kind = rule.scope.kind
    const ok =
      (kind === 'production-baseline' && adopts['production-baseline']) ||
      (kind === 'app-profile' && adopts['app-profile'].includes(rule.scope.profile))
    assert.ok(ok, `[${id}] (${kind}) was selected by nothing in the declaration`)
  }
})

test("CONVENTIONS.md's worked CORAL.md example is a record the resolver accepts", () => {
  // A machine-readable format whose documented example the machine has never read has
  // one untested user, and it is the one every consuming project copies.
  const text = fs.readFileSync(path.join(REPO, 'CONVENTIONS.md'), 'utf8')
  const start = text.indexOf(ADHERENCE_EXAMPLE_START)
  const end = text.indexOf(ADHERENCE_EXAMPLE_END)
  assert.ok(start !== -1 && end > start, 'the adherence example is not marked in CONVENTIONS.md')
  const { declaration, problems } = parseAdherenceRecord(text.slice(start, end), VERSION)
  assert.deepEqual(problems, [])
  assert.equal(declaration.targets, VERSION)
  const r = clean(resolveApplicability(declaration, REAL))
  assert.deepEqual(r.problems, [])
  // and it demonstrates what the section says it demonstrates
  assert.deepEqual(declaration.scales, ['app'])
  assert.equal(r.adopted.get('production-baseline'), true)
  assert.deepEqual(r.adopted.get('app-profile'), ['cli'])
  assert.deepEqual(r.adopted.get('language-binding'), [])
  assert.equal(r.adopted.get('runtime-agent-profile'), false)
  assert.equal(r.exceptions.length, 1)
  assert.equal(r.extensions.length, 1)
  assert.ok(r.exceptions[0].path)
  assert.ok(r.extensions[0].path)
})

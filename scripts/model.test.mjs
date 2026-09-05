// ─────────────────────────────────────────────────────────────────────────────
// Tests for the canonical rule model — `node --test scripts/`, wired into the build.
//
// scripts/layers.test.mjs covers the parsers and the classifier one at a time. This file
// covers what a CONSUMER holds: a rule object that already knows its own ownership, and the
// composition that produces it. The distinction is the point of PO-03 — before it, ownership
// lived in a `Map<id, layer>` beside the rules and every consumer rebuilt it, so "the rule
// index and the build agree about what [CLI-6] is" was a coincidence maintained by hand.
//
// Two tiers again, and the same split. Fixture trees carry a SYNTHETIC taxonomy wherever the
// test is about mechanics, so renaming a real layer is a documents change and not a test
// change. The repository block at the bottom pins one thing the synthetic tier cannot: the
// machine KEYS. Those are the stable public identifiers — a consumer switches on
// `scope.kind` — so a test may hold them, and a change to one is a deliberate break rather
// than a rewording. Labels and tags are still never asserted against the real documents.
// ─────────────────────────────────────────────────────────────────────────────
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  KERNEL_END,
  KERNEL_START,
  LAYERS_END,
  LAYERS_START,
  PROFILES_END,
  PROFILES_FILE,
  PROFILES_START,
  extractStatements,
  groupByScope,
  loadRuleModel,
  parseLayers,
  serializeIndex,
} from './rules.mjs'

const REPO = path.resolve(import.meta.dirname, '..')

// ── a fixture repository ─────────────────────────────────────────────────────
//
// Synthetic vocabulary throughout: `core`, `base`, `meta`, `shape:`, `lang:`. The one
// exception is the language-binding row, which keeps Coral's own spelling — Coral has zero
// language-binding rules today, so the only way to test that layer at all is to build one.

const LAYER_HEADER = [
  '| Layer | Key | Tag | Surface | Contract scope | Read by | Justified by |',
  '|---|---|---|---|---|---|---|',
]
const LAYER_ROWS = [
  '| the core | `core` | — | conformance | unscoped | everyone | the operating model |',
  '| base rules | `base-rules` | `{base}` | conformance | unscoped | every codebase | software |',
  '| meta rules | `meta-rules` | `{meta}` | governance | unscoped | maintainers | the framework |',
  '| shape profile | `shape-profile` | `{shape:…}` | opt-in | profile-scoped | shapes | a shape |',
  '| language binding | `language-binding` | `{lang:…}` | opt-in | profile-scoped | a lang | it |',
]
const PROFILE_HEADER = ['| Profile | Rules live in | What it covers |', '|---|---|---|']
const PROFILE_ROWS = [
  '| `{shape:widget}` | `appendix/widget.md` | Widget-shaped applications. |',
  '| `{shape:gadget}` | `appendix/gadget.md` | Gadget-shaped applications. |',
  '| `{lang:go}` | `appendix/go.md` | The Go realization of a neutral concept. |',
]
const KERNEL_HEADER = ['| Rule | Why | Properties |', '|---|---|---|']

/** A CONVENTIONS.md holding all three registries, plus whatever definitions `defs` adds. */
const conventions = ({ layers = LAYER_ROWS, profiles = PROFILE_ROWS, kernel = ['K-1'], defs = [] }) =>
  [
    '# Conventions',
    '',
    ...defs,
    '',
    LAYERS_START,
    '',
    ...LAYER_HEADER,
    ...layers,
    '',
    LAYERS_END,
    '',
    KERNEL_START,
    '',
    ...KERNEL_HEADER,
    ...kernel.map((id) => `| \`[${id}]\` | because | locality |`),
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
  ].join('\n')

/** A whole fixture repository, sound by default: one rule in every declared layer. */
function fixture(overrides = {}) {
  const {
    layers,
    profiles,
    kernel = ['K-1'],
    conventionDefs = ['**`[K-1]` `[review]`** — the kernel one.'],
    spine = [
      '**`[BASE-1]` `[review]` `{base}`** — the baseline one.',
      '**`[META-1]` `[review]` `{meta}`** — the governance one.',
    ],
    extra = {},
  } = overrides
  return {
    [PROFILES_FILE]: conventions({ layers, profiles, kernel, defs: conventionDefs }),
    'ARCHITECTURE.md': ['# App', '', ...spine, ''].join('\n'),
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
    'appendix/go.md': ['# Go', '', '**`[GO-1]` `[review]` `{lang:go}`** — the Go one.', ''].join(
      '\n'
    ),
    ...extra,
  }
}

/** Run `fn` against a throwaway source tree built from `tree`. */
function inTree(tree, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coral-model-'))
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

/** The model for a fixture tree. */
const model = (overrides) => inTree(fixture(overrides), loadRuleModel)

/** The model for a fixture tree, asserted clean. */
function cleanModel(overrides) {
  const m = model(overrides)
  assert.deepEqual(m.problems, [], 'the fixture repository itself must parse clean')
  return m
}

// ── the invariant ────────────────────────────────────────────────────────────

test('a clean model gives every rule exactly one resolved scope', () => {
  const { rules } = cleanModel()
  assert.equal(rules.size, 6)
  for (const [id, rule] of rules) {
    assert.ok(rule.scope, `[${id}] has no scope`)
    assert.ok(rule.scope.kind, `[${id}] has no scope kind`)
  }
})

test('the resolved scope keeps kind, profile and tag as separate facts', () => {
  const { rules } = cleanModel()
  // The kernel rule: its membership is in the kernel block, so it carries no tag at all —
  // and the model resolves it anyway, which is the whole reason a canonical scope exists.
  assert.deepEqual(rules.get('K-1').scope, {
    kind: 'core',
    profile: null,
    tag: null,
    label: 'the core',
    surface: 'conformance',
    contractScoped: false,
  })
  // A profile rule: the layer and the profile are two fields, never one fused string.
  assert.deepEqual(rules.get('WID-1').scope, {
    kind: 'shape-profile',
    profile: 'widget',
    tag: 'shape:widget',
    label: 'shape profile',
    surface: 'opt-in',
    contractScoped: true,
  })
  // A fixed non-kernel layer: a tag, and no profile.
  assert.equal(rules.get('BASE-1').scope.kind, 'base-rules')
  assert.equal(rules.get('BASE-1').scope.profile, null)
  assert.equal(rules.get('BASE-1').scope.tag, 'base')
})

test('a language binding resolves to its layer and its profile', () => {
  // Coral publishes no `{lang:…}` rule today, so the layer can only be exercised
  // synthetically — and an untested layer is one that stops working unnoticed the day
  // someone writes the first one.
  const { rules } = cleanModel()
  assert.equal(rules.get('GO-1').scope.kind, 'language-binding')
  assert.equal(rules.get('GO-1').scope.profile, 'go')
  assert.equal(rules.get('GO-1').scope.tag, 'lang:go')
})

test('a rule with no ownership metadata fails — it does not come back with a null scope', () => {
  const m = model({
    spine: [
      '**`[BASE-1]` `[review]` `{base}`** — the baseline one.',
      '**`[META-1]` `[review]` `{meta}`** — the governance one.',
      '**`[LOST-1]` `[review]`** — nobody classified this one.',
    ],
  })
  assert.ok(
    m.problems.some((p) => /\[LOST-1\].*carries no ownership tag/.test(p)),
    m.problems.join('\n')
  )
  // Retained for diagnostics, and pointedly NOT defaulted into the baseline.
  assert.ok(m.rules.has('LOST-1'))
  assert.equal(m.rules.get('LOST-1').scope, undefined)
  assert.equal(m.classified, false)
})

test('an unknown tag and an unregistered profile both fail', () => {
  const unknown = model({
    spine: ['**`[BASE-1]` `[review]` `{invented}`** — a tag nobody declared.'],
  })
  assert.ok(
    unknown.problems.some((p) => /is not an ownership layer/.test(p)),
    unknown.problems.join('\n')
  )
  assert.equal(unknown.rules.get('BASE-1').scope, undefined)

  const typo = model({
    extra: {
      'appendix/widget.md': [
        '# Widget',
        '',
        '**`[WID-1]` `[review]` `{shape:widgett}`** — a profile nobody registered.',
        '',
      ].join('\n'),
    },
  })
  assert.ok(
    typo.problems.some((p) => /is not a declared profile/.test(p)),
    typo.problems.join('\n')
  )
})

// ── the machine key ──────────────────────────────────────────────────────────

test('a malformed layer key is refused, never silently accepted', () => {
  for (const bad of ['App Profile', 'app_profile', 'App-Profile', '-app', 'app-', '']) {
    const { problems } = inTree(
      { [PROFILES_FILE]: conventions({ layers: [...LAYER_ROWS.slice(0, 1),
        `| odd layer | ${bad ? `\`${bad}\`` : ' '} | \`{odd}\` | conformance | unscoped | all | y |`,
      ] }) },
      parseLayers
    )
    assert.ok(
      problems.some((p) => /is not a layer key|malformed layer row/.test(p)),
      `\`${bad}\` was accepted as a layer key`
    )
  }
})

test('two layers cannot share one machine key', () => {
  const { problems } = inTree(
    {
      [PROFILES_FILE]: conventions({
        layers: [
          ...LAYER_ROWS,
          '| other rules | `base-rules` | `{other}` | conformance | unscoped | all | a reason |',
        ],
      }),
    },
    parseLayers
  )
  assert.ok(
    problems.some((p) => /declares the layer key `base-rules` twice/.test(p)),
    problems.join('\n')
  )
})

test('renaming a layer LABEL does not move the machine kind', () => {
  const { rules } = cleanModel({
    layers: LAYER_ROWS.map((r, i) =>
      i === 1 ? '| the floor | `base-rules` | `{base}` | conformance | unscoped | all | why |' : r
    ),
  })
  assert.equal(rules.get('BASE-1').scope.kind, 'base-rules')
  assert.equal(rules.get('BASE-1').scope.label, 'the floor')
})

test('renaming a TAG does not move the machine kind either', () => {
  const { rules } = cleanModel({
    layers: LAYER_ROWS.map((r, i) =>
      i === 1 ? '| base rules | `base-rules` | `{floor}` | conformance | unscoped | all | why |' : r
    ),
    spine: [
      '**`[BASE-1]` `[review]` `{floor}`** — the baseline one, retagged.',
      '**`[META-1]` `[review]` `{meta}`** — the governance one.',
    ],
  })
  assert.equal(rules.get('BASE-1').scope.kind, 'base-rules')
  assert.equal(rules.get('BASE-1').scope.tag, 'floor')
})

test('a sixth layer arrives as a registry row, with no JavaScript enum to extend', () => {
  // The claim the key column has to keep making. Nothing in scripts/ lists the valid kinds,
  // so a new one has to work the first time it is written down.
  const m = cleanModel({
    layers: [
      ...LAYER_ROWS,
      '| tenancy overlay | `tenancy-overlay` | `{tenancy}` | conformance | unscoped | all | why |',
    ],
    spine: [
      '**`[BASE-1]` `[review]` `{base}`** — the baseline one.',
      '**`[META-1]` `[review]` `{meta}`** — the governance one.',
      '**`[TEN-1]` `[review]` `{tenancy}`** — the new layer\'s one.',
    ],
  })
  assert.equal(m.rules.get('TEN-1').scope.kind, 'tenancy-overlay')
  const page = inTree(fixture({
    layers: [
      ...LAYER_ROWS,
      '| tenancy overlay | `tenancy-overlay` | `{tenancy}` | conformance | unscoped | all | why |',
    ],
    spine: [
      '**`[BASE-1]` `[review]` `{base}`** — the baseline one.',
      '**`[META-1]` `[review]` `{meta}`** — the governance one.',
      '**`[TEN-1]` `[review]` `{tenancy}`** — the new layer\'s one.',
    ],
  }), (dir) => serializeIndex(dir, loadRuleModel(dir)))
  assert.match(page, /^### tenancy-overlay$/m)
})

// ── grouping ─────────────────────────────────────────────────────────────────

test('the scope groups follow the registry, and hold every rule exactly once', () => {
  const m = cleanModel()
  const groups = groupByScope(m.rules, m.taxonomy, m.profiles)
  // Registry order, one group per fixed layer and one per declared profile.
  assert.deepEqual(
    groups.map((g) => [g.kind, g.profile]),
    [
      ['core', null],
      ['base-rules', null],
      ['meta-rules', null],
      ['shape-profile', 'gadget'],
      ['shape-profile', 'widget'],
      ['language-binding', 'go'],
    ]
  )
  const all = groups.flatMap((g) => g.ids)
  assert.equal(all.length, m.rules.size)
  assert.equal(new Set(all).size, m.rules.size)
})

test('two profiles of one layer stay in separate groups', () => {
  const m = cleanModel()
  const groups = groupByScope(m.rules, m.taxonomy, m.profiles)
  const widget = groups.find((g) => g.profile === 'widget')
  const gadget = groups.find((g) => g.profile === 'gadget')
  assert.deepEqual(widget.ids, ['WID-1'])
  assert.deepEqual(gadget.ids, ['GAD-1'])
  // and the page keeps them apart too, under one layer heading
  const page = inTree(fixture(), (dir) => serializeIndex(dir, loadRuleModel(dir)))
  const section = page.slice(page.indexOf('### shape-profile'), page.indexOf('### language-binding'))
  const widgetRows = section.slice(section.indexOf('#### widget'))
  assert.match(widgetRows, /`\[WID-1\]`/)
  assert.doesNotMatch(widgetRows, /`\[GAD-1\]`/)
})

test('a layer that declares a family but registers no profile still gets a group', () => {
  // The honest zero. `language binding` is empty in the real documents, and a layer that
  // vanishes when it is empty is one nobody notices has stopped being populated.
  const m = cleanModel({
    profiles: PROFILE_ROWS.slice(0, 2),
    extra: { 'appendix/go.md': '# Go\n' },
  })
  const groups = groupByScope(m.rules, m.taxonomy, m.profiles)
  const empty = groups.find((g) => g.kind === 'language-binding')
  assert.ok(empty)
  assert.deepEqual(empty.ids, [])
})

// ── the generator reads the model, not the documents ─────────────────────────

test('serializeIndex renders the scope it was handed, and does not reparse ownership', () => {
  // The load-bearing behaviour, proved by making the model disagree with the documents: the
  // page must follow the model. serializeIndex() used to call parseLayers, parseKernel,
  // parseProfiles and classifyRules for itself, so a caller's classification was decorative.
  const page = inTree(fixture(), (dir) => {
    const m = loadRuleModel(dir)
    assert.deepEqual(m.problems, [])
    m.rules.get('BASE-1').scope = { ...m.rules.get('BASE-1').scope, label: 'INVENTED LAYER' }
    return serializeIndex(dir, m)
  })
  assert.match(page, /INVENTED LAYER/)
})

// ── the real documents ───────────────────────────────────────────────────────

const REAL = loadRuleModel(REPO)

test('the repository model is clean and every rule in it has one scope', () => {
  assert.deepEqual(REAL.problems, [])
  assert.ok(REAL.classified)
  assert.equal(REAL.rules.size, 178)
  for (const [id, rule] of REAL.rules) {
    assert.ok(rule.scope, `[${id}] has no resolved scope`)
    assert.ok(rule.scope.kind, `[${id}] has no scope kind`)
  }
})

// The machine keys are the stable public identifiers — the whole reason they are a column
// rather than something derived — so pinning them is the point, not an accident. Labels and
// tags are deliberately not asserted: those may be reworded without breaking a consumer.
const KIND_OF = {
  'MODEL-1': ['kernel', null, null],
  'CONC-1': ['production-baseline', null, 'baseline'],
  'VER-1': ['framework-governance', null, 'governance'],
  'CLI-6': ['app-profile', 'cli', 'app:cli'],
  'BE-1': ['app-profile', 'backend', 'app:backend'],
  'ORCH-4': ['runtime-agent-profile', null, 'runtime-agent'],
}

for (const [id, [kind, profile, tag]] of Object.entries(KIND_OF)) {
  test(`[${id}] resolves to kind \`${kind}\``, () => {
    const scope = REAL.rules.get(id)?.scope
    assert.ok(scope, `[${id}] is not in the model`)
    assert.equal(scope.kind, kind)
    assert.equal(scope.profile, profile)
    assert.equal(scope.tag, tag)
  })
}

test('every layer key the registry declares is a well-formed, unique token', () => {
  const kinds = REAL.taxonomy.map((l) => l.kind)
  assert.equal(new Set(kinds).size, kinds.length)
  for (const kind of kinds) assert.match(kind, /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/)
})

test("the generated page's scope grouping holds every rule exactly once", () => {
  const groups = groupByScope(REAL.rules, REAL.taxonomy, REAL.profiles)
  const all = groups.flatMap((g) => g.ids)
  assert.equal(all.length, REAL.rules.size)
  assert.equal(new Set(all).size, REAL.rules.size)
  // and the rendered section agrees with the grouping it was built from
  const page = serializeIndex(REPO, REAL)
  // Bounded at the next `## ` heading — the per-document tables follow, and they list the
  // same IDs.
  const from = page.indexOf('## Rules by scope')
  const section = page.slice(from, page.indexOf('\n## ', from + 1))
  const listed = [...section.matchAll(/^\| `\[([A-Z][A-Z-]*-\d+)\]` \|/gm)].map((m) => m[1])
  assert.deepEqual(listed.sort(), all.sort())
})

test('the by-scope section adds no statements of its own', () => {
  // Grouping is a second VIEW of the registry, not a second copy of it. Every statement on
  // the page still comes from extractStatements(), once each.
  const page = serializeIndex(REPO, REAL)
  const statements = extractStatements(REPO, REAL.rules)
  for (const [id, statement] of statements) {
    if (!statement) continue
    const cell = statement.replace(/\|/g, '\\|')
    assert.equal(
      page.split(`| \`[${id}]\` | \`[${REAL.rules.get(id).cls}]\` |`).length - 1,
      2,
      `[${id}] should appear once in its document table and once in its scope group`
    )
    assert.ok(page.includes(cell), `[${id}]'s statement is missing from the page`)
  }
})

test('the layer tally and the scope groups count the same rules', () => {
  // Two renderings of one grouping, so they cannot disagree — this is the assertion that
  // would have caught them being computed twice.
  const page = serializeIndex(REPO, REAL)
  const groups = groupByScope(REAL.rules, REAL.taxonomy, REAL.profiles)
  for (const g of groups) {
    const label = g.profile ? `${g.label} · ${g.profile}` : g.label
    const row = page.split('\n').find((l) => l.startsWith(`| ${label} |`))
    assert.ok(row, `no tally row for ${label}`)
    assert.equal(Number(row.split('|')[2].trim()), g.ids.length, label)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Tests for the ownership-layer machinery — `node --test scripts/`, wired into the build.
//
// Same argument as the kernel parser's tests, one layer up. Every rule outside the kernel
// carries its ownership layer inline, rules.md is generated from those tags, and a project
// decides what to load by reading the result. So the *rejections* are the load-bearing
// part: a tag that can be skipped instead of failing takes its rule out of every layer
// while the page still reads correctly to a human, and the generated index agrees with the
// mistake. Each failure mode is asserted here against fixtures rather than by breaking the
// real documents on purpose.
//
// Two tiers, and the split matters.
//
// The unit tests resolve against a SYNTHETIC taxonomy — `base`, `meta`, `shape:…`,
// `runtime-addon` — deliberately spelled nothing like Coral's. They test parser and
// classifier mechanics, so literal values in them are fixtures, not a claim about Coral's
// layers. Written against `baseline` / `app:cli` they made renaming a canonical tag a test
// edit, which is the second authority the layers registry was added to delete.
//
// The last block runs against the real documents, and note what it does NOT assert: it names
// no layer, no tag, no label, and does not say that `language binding` is currently empty.
// Those are facts the documents own. It asserts invariants instead — every rule lands in
// exactly one layer, the surfaces partition the rule set, no kernel rule carries a tag, the
// profile registry is honoured — so a deliberate rename moves the documents and the
// generated index together and touches nothing here.
// ─────────────────────────────────────────────────────────────────────────────
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  APP_SPINE,
  CONTRACT_END,
  CONTRACT_START,
  KERNEL_END,
  KERNEL_START,
  LAYERS_END,
  LAYERS_START,
  PROFILES_END,
  PROFILES_FILE,
  PROFILES_START,
  SCALES_END,
  SCALES_START,
  SURFACES,
  SYSTEM_SPINE,
  checkContractScopes,
  classifyRules,
  defaultScaleOf,
  groupBySurface,
  loadRuleModel,
  parseKernel,
  parseLayers,
  parseProfiles,
  parseRules,
  parseScales,
  resolveTag,
  scaleOfPage,
  serializeIndex,
  stripDefinitionMetadata,
} from './rules.mjs'

const REPO = path.resolve(import.meta.dirname, '..')
const SPINE_FILES = ['CONVENTIONS.md', APP_SPINE, SYSTEM_SPINE]
// The taxonomy the fixtures resolve against. Read from the real CONVENTIONS.md rather than
// written out here: a literal copy would be exactly the second authority parseLayers() was
// added to remove, and it would stop these tests from noticing a layer being renamed.
// The real taxonomy — used ONLY by the integration block at the bottom.
const { taxonomy: REAL, problems: REAL_PROBLEMS } = parseLayers(REPO)

const HEADER = ['| Profile | Rules live in | What it covers |', '|---|---|---|']
const ROW = '| `{shape:widget}` | `appendix/widget.md` | Widget-shaped applications. |'

/** Run `body` inside a throwaway source tree, with the extra files `tree` provides. */
function inTree(tree, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coral-layers-'))
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

/** Assert the problems contain exactly one entry matching `re`. */
function onlyProblem(problems, re) {
  assert.equal(problems.length, 1, `expected one problem, got:\n${problems.join('\n')}`)
  assert.match(problems[0], re)
}

// ── the synthetic taxonomy the unit tests resolve against ────────────────────
//
// Every name here is chosen NOT to be one of Coral's: `base` is not `baseline`, `shape:` is
// not `app:`, `the core` is not `kernel`. These tests are about the machinery, and using the
// canonical vocabulary would mean renaming a real layer — the thing the registry exists to
// make possible — broke tests that have nothing to do with the change.
const LAYER_HEADER = [
  '| Layer | Key | Tag | Surface | Contract scope | Read by | Justified by |',
  '|---|---|---|---|---|---|---|',
]
const LAYER_ROWS = [
  '| the core | `core` | — | conformance | unscoped | everyone | the operating model |',
  '| base rules | `base-rules` | `{base}` | conformance | unscoped | every codebase | the software |',
  '| meta rules | `meta-rules` | `{meta}` | governance | unscoped | maintainers | the framework |',
  '| shape profile | `shape-profile` | `{shape:…}` | opt-in | profile-scoped | shapes | the shape |',
  '| dialect binding | `dialect-binding` | `{dialect:…}` | opt-in | profile-scoped | dialects | it |',
  '| runtime addon | `runtime-addon-layer` | `{runtime-addon}` | opt-in | profile-scoped | callers | m |',
]

/** Write a CONVENTIONS.md holding `body` between the layer markers, and parse it. */
const parseTaxonomy = (body) =>
  inTree(
    { [PROFILES_FILE]: ['# Conventions', '', LAYERS_START, ...body, LAYERS_END, ''].join('\n') },
    parseLayers
  )

/** The synthetic taxonomy, plus any extra rows a caller wants. Must parse clean. */
function fixtureTaxonomy(extra = []) {
  const { taxonomy, problems } = parseTaxonomy(['', ...LAYER_HEADER, ...LAYER_ROWS, ...extra, ''])
  assert.deepEqual(problems, [], 'the fixture taxonomy itself must parse clean')
  return taxonomy
}
const FIXTURE = fixtureTaxonomy()

/** Write a CONVENTIONS.md holding `body` between the profile markers, and parse it. */
const parseBlock = (body, extra = {}) =>
  inTree(
    {
      [PROFILES_FILE]: ['# Conventions', '', PROFILES_START, ...body, PROFILES_END, ''].join('\n'),
      'appendix/widget.md': '# Widget\n',
      ...extra,
    },
    (dir) => parseProfiles(dir, FIXTURE)
  )

// ── the ownership-layer taxonomy ─────────────────────────────────────────────

test('a well-formed taxonomy yields its layers and no problems', () => {
  const { taxonomy, problems } = parseTaxonomy(['', ...LAYER_HEADER, ...LAYER_ROWS, ''])
  assert.deepEqual(problems, [])
  assert.deepEqual(
    taxonomy.map((l) => [l.label, l.tag, l.family, l.surface, l.scoped]),
    [
      ['the core', null, null, 'conformance', false],
      ['base rules', 'base', null, 'conformance', false],
      ['meta rules', 'meta', null, 'governance', false],
      ['shape profile', null, 'shape', 'opt-in', true],
      ['dialect binding', null, 'dialect', 'opt-in', true],
      ['runtime addon', 'runtime-addon', null, 'opt-in', true],
    ]
  )
})

test('a scope word that is neither `unscoped` nor `profile-scoped` fails', () => {
  // That column is what Gate 9 reads, so a third word would silently do nothing.
  const { problems } = parseTaxonomy([
    '',
    ...LAYER_HEADER,
    LAYER_ROWS[0],
    '| shape profile | `shape-profile` | `{shape:…}` | opt-in | sometimes | shapes | the shape |',
    '',
  ])
  onlyProblem(problems, /is not a contract-scope word/)
})

test('a tag cell that is neither a tag nor the em dash fails', () => {
  const { problems } = parseTaxonomy([
    '',
    ...LAYER_HEADER,
    LAYER_ROWS[0],
    '| base rules | `base-rules` | base | conformance | unscoped | every codebase | why |',
    '',
  ])
  onlyProblem(problems, /`?base`? is not a layer tag/)
})

test('a second tagless layer fails — only the kernel takes members from its own block', () => {
  const { problems } = parseTaxonomy([
    '',
    ...LAYER_HEADER,
    LAYER_ROWS[0],
    '| something else | `something-else` | — | conformance | unscoped | everyone | why |',
    '',
  ])
  onlyProblem(problems, /is a second tagless layer/)
})

test('a taxonomy with no tagless layer fails', () => {
  const { problems } = parseTaxonomy(['', ...LAYER_HEADER, ...LAYER_ROWS.slice(1), ''])
  onlyProblem(problems, /has no tagless row/)
})

test('a duplicated tag, and a duplicated layer name, both fail', () => {
  onlyProblem(
    parseTaxonomy(['', ...LAYER_HEADER, ...LAYER_ROWS, LAYER_ROWS[1], '']).problems,
    /declares `\{base\}` twice/
  )
  onlyProblem(
    parseTaxonomy([
      '',
      ...LAYER_HEADER,
      ...LAYER_ROWS,
      '| base rules | `other-rules` | `{other}` | conformance | unscoped | everyone | why |',
      '',
    ]).problems,
    /declares the layer name `base rules` twice/
  )
})

test('a malformed row fails rather than dropping the layer', () => {
  const { taxonomy, problems } = parseTaxonomy([
    '',
    ...LAYER_HEADER,
    LAYER_ROWS[0],
    '| base rules | `base-rules` | `{base}` | conformance | unscoped |',
    '',
  ])
  assert.deepEqual(
    taxonomy.map((l) => l.label),
    ['the core']
  )
  onlyProblem(problems, /malformed layer row/)
})

test('prose inside the taxonomy fails, and so does a header of the wrong width', () => {
  onlyProblem(
    parseTaxonomy(['', ...LAYER_HEADER, ...LAYER_ROWS, 'and one more thing', '']).problems,
    /is not a table row/
  )
  onlyProblem(
    parseTaxonomy(['', '| Layer | Tag |', LAYER_HEADER[1], ...LAYER_ROWS, '']).problems,
    /header must have exactly 7 non-empty columns/
  )
})

test('two taxonomy blocks fail, and so does none', () => {
  const twice = [
    '# Conventions',
    LAYERS_START,
    ...LAYER_HEADER,
    ...LAYER_ROWS,
    LAYERS_END,
    LAYERS_START,
    ...LAYER_HEADER,
    ...LAYER_ROWS,
    LAYERS_END,
    '',
  ].join('\n')
  onlyProblem(
    inTree({ [PROFILES_FILE]: twice }, parseLayers).problems,
    /exactly one .* block \(found 2 start marker\(s\)/
  )
  onlyProblem(
    inTree({ [PROFILES_FILE]: '# Conventions\n' }, parseLayers).problems,
    /exactly one .* block \(found 0 start marker\(s\)/
  )
})

test("the repository's taxonomy parses clean and covers every tag rules use", () => {
  // The assertion is structural, not a second copy of the six layers: every tag a rule
  // carries resolves to a declared layer, and the kernel layer is the tagless one.
  assert.deepEqual(REAL_PROBLEMS, [])
  assert.ok(REAL.length > 0)
  assert.equal(REAL.filter((l) => l.tag === null && l.family === null).length, 1)
  const { rules } = parseRules(REPO)
  for (const [id, rule] of rules) {
    for (const tag of rule.tags) {
      const head = tag.split(':')[0]
      assert.ok(
        REAL.some((l) => l.tag === head || l.family === head),
        `[${id}] carries {${tag}}, which no declared layer covers`
      )
    }
  }
})

// ── generated statements keep the statement's own braces ─────────────────────

test('stripDefinitionMetadata removes both metadata spans and nothing else', () => {
  // Whitespace left behind by the removal is collapsed downstream; what matters is which
  // spans go and which stay.
  const out = stripDefinitionMetadata(
    '** `[guide]` `{base}`** — Use `{id}`, `{category, code, message}`, and compare `[review]`.'
  )
  assert.doesNotMatch(out, /\{base\}/)
  assert.doesNotMatch(out, /`\[guide\]`/)
  assert.match(out, /Use `\{id\}`, `\{category, code, message\}`, and compare `\[review\]`\./)
})

test('a [guide] statement keeps its brace AND class syntax through serializeIndex', () => {
  // The generated fallback used to strip EVERY brace code span, so a rule explaining `{id}`
  // had the `{id}` deleted out of its own one-line statement. Same over-reach the slot
  // parser fixed, one path further along.
  const conventions = [
    '# Conventions',
    '',
    '**`[K-1]` `[review]`** — the kernel one.',
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
    '| Scale | Key | Stated in | Read by | Justified by |',
    '|---|---|---|---|---|',
    '| small | `small` | — | one unit | the unit itself |',
    '',
    SCALES_END,
    '',
    KERNEL_START,
    '',
    '| Rule | Why | Properties |',
    '|---|---|---|',
    '| `[K-1]` | because | locality |',
    '',
    KERNEL_END,
    '',
    PROFILES_START,
    '',
    ...HEADER,
    ROW,
    '',
    PROFILES_END,
    '',
  ].join('\n')
  const widget = [
    '# Widget',
    '',
    '**`[X-1]` `[guide]` `{shape:widget}`** — Use `{id}` in the path, raise',
    '`{category, code, message}` on failure, and compare this with `[review]`.',
    '',
  ].join('\n')
  const page = inTree(
    {
      VERSION: '9.9.9\n',
      'CHANGELOG.md': '# Changelog\n\n## Unreleased\n',
      [PROFILES_FILE]: conventions,
      'appendix/widget.md': widget,
    },
    (dir) => {
      const model = loadRuleModel(dir)
      assert.deepEqual(model.problems, [])
      return serializeIndex(dir, model)
    }
  )
  // The per-document table, not the compact by-scope one: the scope section lists the same
  // ID with no statement, and it comes first on the page.
  const row = page.split('\n').findLast((l) => l.startsWith('| `[X-1]`'))
  assert.match(
    row,
    /Use `\{id\}` in the path, raise `\{category, code, message\}` on failure, and compare/
  )
  assert.match(row, /compare this with `\[review\]`\./)
  assert.doesNotMatch(row, /\{shape:widget\}/)
  // the metadata class moved to its own column; the one in the prose stayed in the statement
  assert.match(row, /^\| `\[X-1\]` \| `\[guide\]` \|/)
})

// ── mutation: the registry really is the source ──────────────────────────────
//
// The tests above prove the parser reads the table. These prove nothing else *also* holds a
// copy — each one changes a fact in the fixture registry and checks the change lands
// everywhere, with no code edit. That is the whole claim `coral:layers` was added to make,
// and it is the claim that quietly stopped being true twice already.

/** Parse a taxonomy from LAYER_ROWS with one row swapped for `row`. */
const withRow = (i, row) =>
  fixtureTaxonomy([]) && parseTaxonomy([
    '',
    ...LAYER_HEADER,
    ...LAYER_ROWS.map((r, j) => (j === i ? row : r)),
    '',
  ])

test('renaming the tagless layer renames what kernel rules are classified as', () => {
  // The failure this catches: classifyRules() used to rebuild `label: 'kernel'` by hand, so
  // the tally moved with the table and every kernel rule kept the old name.
  const { taxonomy, problems } = withRow(
    0,
    '| the nucleus | `core` | — | conformance | unscoped | everyone | the operating model |'
  )
  assert.deepEqual(problems, [])
  const { scopes } = classifyRules({
    rules: new Map([['K-1', rule('ARCHITECTURE.md', [])]]),
    kernel: new Set(['K-1']),
    profiles: new Map(),
    taxonomy,
  })
  assert.equal(scopes.get('K-1').label, 'the nucleus')
  assert.equal(scopes.get('K-1').surface, 'conformance')
  // and the machine key, which is a separate column, did NOT move with the label
  assert.equal(scopes.get('K-1').kind, 'core')
})

test('renaming a tag keeps its rules in the same surface', () => {
  // The reported drift case, in miniature: rename `{meta}` and update the rule tags, and the
  // governance subtotal must not empty out. Surface is a column, not a literal in the code.
  const { taxonomy, problems } = withRow(
    2,
    '| meta rules | `meta-rules` | `{framework-meta}` | governance | unscoped | maintainers | why |'
  )
  assert.deepEqual(problems, [])
  const { scopes } = classifyRules({
    rules: new Map([['X-1', rule('ARCHITECTURE.md', ['framework-meta'])]]),
    kernel: new Set(),
    profiles: new Map(),
    taxonomy,
  })
  assert.equal(scopes.get('X-1').surface, 'governance')
  // the tag moved and the machine key did not, which is the whole point of the key column
  assert.equal(scopes.get('X-1').kind, 'meta-rules')
  assert.equal(scopes.get('X-1').tag, 'framework-meta')
  assert.deepEqual(groupBySurface(scopes).get('governance'), ['X-1'])
})

test('a seventh layer joins the surface it declares, and is not dropped', () => {
  // A syntactically valid layer must never vanish from the audience totals. The taxonomy is
  // open; only the three surfaces are closed.
  const taxonomy = fixtureTaxonomy([
    '| extra layer | `extra-layer` | `{extra}` | conformance | unscoped | everyone | a reason |',
  ])
  const { scopes, problems } = classifyRules({
    rules: new Map([
      ['X-1', rule('ARCHITECTURE.md', ['extra'])],
      ['X-2', rule('ARCHITECTURE.md', ['meta'])],
    ]),
    kernel: new Set(),
    profiles: new Map(),
    taxonomy,
  })
  assert.deepEqual(problems, [])
  assert.equal(scopes.get('X-1').kind, 'extra-layer')
  const groups = groupBySurface(scopes)
  assert.deepEqual(groups.get('conformance'), ['X-1'])
  assert.deepEqual(groups.get('governance'), ['X-2'])
  assert.equal(
    [...groups.values()].reduce((n, ids) => n + ids.length, 0),
    scopes.size
  )
})

test('a layer naming a surface that does not exist is refused, never silently dropped', () => {
  const { problems } = parseTaxonomy([
    '',
    ...LAYER_HEADER,
    LAYER_ROWS[0],
    '| odd layer | `odd-layer` | `{odd}` | somewhere-else | unscoped | someone | a reason |',
    '',
  ])
  onlyProblem(problems, /is not a surface/)
})

test('groupBySurface refuses a layer whose surface is not one of the three', () => {
  // Belt and braces: parseLayers cannot produce this, but the grouping is what the index's
  // totals rest on, so it fails loudly rather than returning a short count.
  assert.throws(
    () => groupBySurface(new Map([['X-1', { surface: 'invented' }]])),
    /is not one of/
  )
})

test('the tagless layer cannot be opt-in — no marker could name it', () => {
  // `opt-in | profile-scoped` is internally consistent, so it passes the surface/scope
  // agreement check and has to be refused on its own terms: the kernel row carries no tag,
  // so no `coral:scope:<tag>` marker could ever select it.
  const { problems } = withRow(
    0,
    '| the core | `core` | — | opt-in | profile-scoped | everyone | the operating model |'
  )
  // Two problems, both true: the row is refused, and the taxonomy is then left without a
  // tagless layer at all. The first is the one being asserted.
  assert.match(problems[0], /tagless layer must be `unscoped`/)
})

// ── surface and contract scope may not disagree ──────────────────────────────
//
// They are different questions — who the layer is for, and how a contract writes that down
// — but they share one dimension, and a row where they disagree splits the two systems that
// read them. `opt-in | unscoped` has rules.md call a layer optional while Gate 9 accepts its
// rules as unconditional contract lines: the loading contradiction this whole classification
// was built to remove, reintroduced through the registry.

/** A taxonomy whose second row carries `surface` and `scope`. */
const combo = (surface, scope) =>
  withRow(
    1,
    `| base rules | \`base-rules\` | \`{base}\` | ${surface} | ${scope} | every codebase | why |`
  )

test('an opt-in layer that is not profile-scoped fails', () => {
  onlyProblem(combo('opt-in', 'unscoped').problems, /`opt-in` and `unscoped` contradict each other/)
})

test('a conformance layer that is profile-scoped fails', () => {
  onlyProblem(
    combo('conformance', 'profile-scoped').problems,
    /`conformance` and `profile-scoped` contradict each other/
  )
})

test('a governance layer that is profile-scoped fails', () => {
  onlyProblem(
    combo('governance', 'profile-scoped').problems,
    /`governance` and `profile-scoped` contradict each other/
  )
})

test('the two agreeing combinations pass', () => {
  for (const [surface, scope] of [
    ['opt-in', 'profile-scoped'],
    ['conformance', 'unscoped'],
    ['governance', 'unscoped'],
  ]) {
    const { taxonomy, problems } = combo(surface, scope)
    assert.deepEqual(problems, [], `${surface} | ${scope}`)
    const row = taxonomy.find((l) => l.tag === 'base')
    assert.equal(row.surface, surface)
    assert.equal(row.scoped, scope === 'profile-scoped')
  }
})

test('a profile family on a non-opt-in surface fails', () => {
  // A family says "this layer has concrete profiles", and a profile is selected. On a
  // conformance surface the two halves disagree: the index counts the rules before any
  // profile is chosen, while the registry puts them in a document only a chooser reads.
  for (const surface of ['conformance', 'governance']) {
    const { problems } = withRow(
      3,
      `| shape profile | \`shape-profile\` | \`{shape:…}\` | ${surface} | unscoped | shapes | why |`
    )
    onlyProblem(problems, /declares a profile family, so its layer must be `opt-in`/)
  }
})

test('a profile family that is opt-in and profile-scoped passes', () => {
  const { taxonomy, problems } = withRow(
    3,
    '| shape profile | `shape-profile` | `{shape:…}` | opt-in | profile-scoped | shapes | why |'
  )
  assert.deepEqual(problems, [])
  assert.equal(taxonomy.find((l) => l.family === 'shape').surface, 'opt-in')
})

test('a FIXED tag may still be opt-in — runtime-agent is the intended case', () => {
  const { taxonomy, problems } = withRow(
    5,
    '| runtime addon | `runtime-addon-layer` | `{runtime-addon}` | opt-in | profile-scoped | c | m |'
  )
  assert.deepEqual(problems, [])
  const row = taxonomy.find((l) => l.tag === 'runtime-addon')
  assert.equal(row.family, null)
  assert.equal(row.surface, 'opt-in')
})

test('the profile registry refuses a family whose layer is not opt-in', () => {
  // Defensive: parseLayers() already refuses the row, so this only fires for a taxonomy
  // built some other way. The registry is what turns a family into selectable profiles.
  const bent = FIXTURE.map((l) =>
    l.family === 'shape' ? { ...l, surface: 'conformance', scoped: false } : l
  )
  const { problems } = inTree(
    {
      [PROFILES_FILE]: ['# Conventions', '', PROFILES_START, '', ...HEADER, ROW, '', PROFILES_END, '']
        .join('\n'),
      'appendix/widget.md': '# Widget\n',
    },
    (dir) => parseProfiles(dir, bent)
  )
  onlyProblem(problems, /whose surface is `conformance` rather than `opt-in`/)
})

test("the repository's own rows all satisfy the invariant", () => {
  // Asserted as the relationship, not as a list of which layer is which.
  assert.deepEqual(REAL_PROBLEMS, [])
  for (const l of REAL) {
    assert.equal(l.scoped, l.surface === 'opt-in', l.label)
    if (l.family) assert.equal(l.surface, 'opt-in', `${l.label} is a family`)
  }
  const tagless = REAL.find((l) => l.tag === null && l.family === null)
  assert.equal(tagless.scoped, false)
  assert.notEqual(tagless.surface, 'opt-in')
})

// ── the profile registry ─────────────────────────────────────────────────────

test('a well-formed registry yields its profiles and no problems', () => {
  const { profiles, problems } = parseBlock(['', ...HEADER, ROW, ''])
  assert.deepEqual(problems, [])
  assert.deepEqual([...profiles.keys()], ['shape:widget'])
  assert.equal(profiles.get('shape:widget').home, 'appendix/widget.md')
})

test('a duplicated profile is an error, not a silent last-one-wins', () => {
  const { problems } = parseBlock(['', ...HEADER, ROW, ROW, ''])
  onlyProblem(problems, /declares `\{shape:widget\}` twice/)
})

test('a malformed row fails rather than dropping the profile', () => {
  // The tag lost its backticks, so the site cannot link it and the parser must not read it.
  const { profiles, problems } = parseBlock([
    '',
    ...HEADER,
    '| {shape:widget} | `appendix/widget.md` | Widget-shaped applications. |',
    '',
  ])
  assert.equal(profiles.size, 0)
  onlyProblem(problems, /malformed profile row/)
})

test('a row with a fourth column fails', () => {
  const { problems } = parseBlock([
    '',
    ...HEADER,
    '| `{shape:widget}` | `appendix/widget.md` | covers | extra |',
    '',
  ])
  onlyProblem(problems, /malformed profile row/)
})

test('a layer that takes no profile cannot be registered as one', () => {
  const { problems } = parseBlock([
    '',
    ...HEADER,
    '| `{base}` | `appendix/widget.md` | not a profile |',
    '',
  ])
  onlyProblem(problems, /is not a profile/)
})

test("a profile whose home document does not exist fails", () => {
  const { problems } = parseBlock([
    '',
    ...HEADER,
    '| `{shape:widget}` | `appendix/nope.md` | Widget-shaped applications. |',
    '',
  ])
  onlyProblem(problems, /which does not exist/)
})

test('a profile whose home is a spine fails', () => {
  // `| {app:cli} | ARCHITECTURE.md |` would satisfy every downstream check while doing the
  // exact thing they exist to stop: the rules sit in a document every project reads, and the
  // home check blesses it. The registry must not be able to excuse that.
  const { problems } = parseBlock(
    ['', ...HEADER, '| `{shape:widget}` | `ARCHITECTURE.md` | Widget-shaped applications. |', ''],
    { 'ARCHITECTURE.md': '# App\n' }
  )
  onlyProblem(problems, /which is a spine/)
})

test('a language binding whose home is a spine fails too', () => {
  const { problems } = parseBlock(
    ['', ...HEADER, '| `{dialect:go}` | `SYSTEM.md` | Go. |', ''],
    { 'SYSTEM.md': '# System\n' }
  )
  onlyProblem(problems, /which is a spine/)
})

test('a home that defines no rules fails', () => {
  const { problems } = parseBlock(
    ['', ...HEADER, '| `{shape:widget}` | `CHANGELOG.md` | Widget-shaped applications. |', ''],
    { 'CHANGELOG.md': '# Changelog\n' }
  )
  onlyProblem(problems, /not a document that can define rules/)
})

test('two profiles cannot claim the same home document', () => {
  // Loading either one exposes the other's rules, so selecting a profile stops meaning
  // anything — one step weaker than the spine failure, and refused for the same reason.
  const { profiles, problems } = parseBlock([
    '',
    ...HEADER,
    ROW,
    '| `{shape:gadget}` | `appendix/widget.md` | Gadget-shaped applications. |',
    '',
  ])
  assert.deepEqual([...profiles.keys()], ['shape:widget'])
  onlyProblem(problems, /which `\{shape:widget\}` already claims/)
})

test('prose inside the registry fails rather than being ignored', () => {
  const { problems } = parseBlock(['', ...HEADER, ROW, 'and one more thing', ''])
  onlyProblem(problems, /is not a table row/)
})

test('the header and its delimiter must carry the same three columns as the rows', () => {
  // A loose check here would let the table describe two columns while its rows carry three.
  onlyProblem(
    parseBlock(['', '| Profile | Rules live in |', HEADER[1], ROW, '']).problems,
    /header must have exactly 3 non-empty columns/
  )
  onlyProblem(
    parseBlock(['', HEADER[0], '|---|---|', ROW, '']).problems,
    /delimiter row with exactly 3 columns/
  )
})

test('a registry with a header and no profiles fails', () => {
  onlyProblem(parseBlock(['', ...HEADER, '']).problems, /has a header but no profiles/)
})

test('two registry blocks fail — a second source is no source', () => {
  const page = [
    '# Conventions',
    PROFILES_START,
    ...HEADER,
    ROW,
    PROFILES_END,
    PROFILES_START,
    ...HEADER,
    ROW,
    PROFILES_END,
    '',
  ].join('\n')
  const { problems } = inTree({ [PROFILES_FILE]: page, 'appendix/cli.md': '# CLI\n' }, parseProfiles)
  onlyProblem(problems, /exactly one .* block \(found 2 start marker\(s\)/)
})

test('a missing registry block fails', () => {
  const { problems } = inTree({ [PROFILES_FILE]: '# Conventions\n' }, parseProfiles)
  onlyProblem(problems, /exactly one .* block \(found 0 start marker\(s\)/)
})

// ── resolving a tag ──────────────────────────────────────────────────────────

test('a tag resolves to its layer, and a profile tag keeps its identity', () => {
  const profiles = new Map([['shape:widget', { home: 'appendix/widget.md', covers: '' }]])
  assert.deepEqual(resolveTag('base', profiles, FIXTURE), {
    kind: 'base-rules',
    profile: null,
    tag: 'base',
    label: 'base rules',
    surface: 'conformance',
    contractScoped: false,
  })
  assert.deepEqual(resolveTag('shape:widget', profiles, FIXTURE), {
    kind: 'shape-profile',
    profile: 'widget',
    tag: 'shape:widget',
    label: 'shape profile',
    surface: 'opt-in',
    contractScoped: true,
  })
})

test('a profile-bearing layer named without a profile is rejected', () => {
  assert.match(resolveTag('shape', new Map(), FIXTURE), /must say WHICH one/)
})

test('an unregistered profile is rejected, so a typo cannot invent a layer', () => {
  assert.match(resolveTag('shape:widgett', new Map(), FIXTURE), /is not a declared profile/)
})

test('a profile split on a layer that takes none is rejected', () => {
  assert.match(resolveTag('base:strict', new Map(), FIXTURE), /is not a layer that takes a profile/)
})

test('an unknown bare tag is rejected and the message lists the real ones', () => {
  const out = resolveTag('important', new Map(), FIXTURE)
  assert.match(out, /is not an ownership layer/)
  assert.match(out, /`\{base\}`/)
})

// ── reading tags off a definition line ───────────────────────────────────────

/** Parse a one-document tree whose ARCHITECTURE.md holds `lines`. */
const parseDoc = (lines) =>
  inTree({ 'ARCHITECTURE.md': ['# App', '', ...lines, ''].join('\n') }, parseRules)

test('a tag is read off the definition line, after the enforcement class', () => {
  const { rules, problems } = parseDoc(['**`[X-1]` `[review]` `{base}`** — a rule.'])
  assert.deepEqual(problems, [])
  assert.deepEqual(rules.get('X-1').tags, ['base'])
})

test('a span written in the shape of a tag but spelled wrong is an error, not a skip', () => {
  const { problems } = parseDoc(['**`[X-1]` `[review]` `{App:CLI}`** — a rule.'])
  onlyProblem(problems, /written as an ownership tag but is not one/)
})

test('a tag outside its code span fails rather than reading as unclassified', () => {
  const { problems } = parseDoc(['**`[X-1]` `[review]`** {base} — a rule.'])
  onlyProblem(problems, /outside a code span/)
})

test('the metadata slot is ordered: class, then tag', () => {
  const { rules, problems } = parseDoc(['**`[X-1]` `[review]` `{base}`** — a rule.'])
  assert.deepEqual(problems, [])
  assert.deepEqual(rules.get('X-1').tags, ['base'])
})

test('a tag before the enforcement class fails', () => {
  // CONVENTIONS.md documents ID → class → tag → statement. A parser looser than its own
  // stated grammar is one more thing a reader has to discover by experiment.
  const { rules, problems } = parseDoc(['**`[X-1]` `{base}` `[review]`** — a rule.'])
  onlyProblem(problems, /carries its ownership tag before its enforcement class/)
  // still collected, so this is the only complaint rather than "and it has no tag either"
  assert.deepEqual(rules.get('X-1').tags, ['base'])
})

test('a class in the STATEMENT cannot satisfy a missing metadata class', () => {
  // The bypass: no class in the slot, but `[review]` in the prose. The global scan used to
  // accept the rule's own sentence as its enforcement class.
  const { problems } = parseDoc(['**`[X-1]` `{base}`** — This behaves like `[review]`.'])
  onlyProblem(problems, /carries no enforcement class before its statement/)
})

test('a class in the STATEMENT does not become a second class', () => {
  // The inverse: structurally valid, and the global scan rejected it for saying `[review]`
  // out loud.
  const { rules, problems } = parseDoc([
    '**`[X-1]` `[guide]` `{base}`** — Compare this with `[review]`.',
  ])
  assert.deepEqual(problems, [])
  assert.equal(rules.get('X-1').cls, 'guide')
  assert.deepEqual(rules.get('X-1').tags, ['base'])
})

test('two classes in the metadata slot still fail', () => {
  const { problems } = parseDoc(['**`[X-1]` `[guide]` `[review]` `{base}`** — a rule.'])
  onlyProblem(problems, /carries 2 enforcement class(es)? before its statement/)
})

test('a kernel-shaped line keeps a class-shaped span in its statement', () => {
  const { rules, problems } = parseDoc([
    '**`[K-1]` `[review]`** — Do not confuse this with `[guide]`.',
  ])
  assert.deepEqual(problems, [])
  assert.equal(rules.get('K-1').cls, 'review')
  assert.deepEqual(rules.get('K-1').tags, [])
})

test('a kernel-shaped line — class then statement, no tag — still passes', () => {
  const { rules, problems } = parseDoc(['**`[X-1]` `[review]`** — a kernel rule.'])
  assert.deepEqual(problems, [])
  assert.deepEqual(rules.get('X-1').tags, [])
})

test('a brace token in the STATEMENT is content, not a second tag', () => {
  // `{id}` is ordinary API notation. The metadata slot ends where the statement begins, so
  // a rule is free to talk about braces without the parser reading them as classification.
  const { rules, problems } = parseDoc([
    '**`[X-1]` `[review]` `{base}`** — Use `{id}` as the path placeholder.',
  ])
  assert.deepEqual(problems, [])
  assert.deepEqual(rules.get('X-1').tags, ['base'])
})

test('an unbackticked brace token in the statement is content too', () => {
  const { rules, problems } = parseDoc([
    '**`[X-1]` `[review]` `{base}`** — Handle /widgets/{id} and /widgets/{id}/parts.',
  ])
  assert.deepEqual(problems, [])
  assert.deepEqual(rules.get('X-1').tags, ['base'])
})

test('a statement opening with a code span does not extend the slot', () => {
  // `[CLI-8]`'s real shape: the statement begins with `0`, which is not a class and not
  // tag-shaped, so the slot closes there and later spans are content.
  const { rules, problems } = parseDoc([
    '- **`[X-1]`** `[auto]` `{base}` `0` success · `2` usage error · `{id}` is not a tag.',
  ])
  assert.deepEqual(problems, [])
  assert.deepEqual(rules.get('X-1').tags, ['base'])
})

test('a brace token in the slot is still metadata, and still checked', () => {
  // The slot is reserved. A tag-shaped span there is classification whether or not it was
  // meant as one — which is what makes "exactly one" enforceable at all.
  const { rules } = parseDoc(['**`[X-1]` `[review]` `{base}` `{meta}`** — two tags.'])
  assert.deepEqual(rules.get('X-1').tags, ['base', 'meta'])
})

test('a misplaced bare tag is still caught when the rule has none', () => {
  const { problems } = parseDoc(['**`[X-1]` `[review]`** {base} — a rule.'])
  onlyProblem(problems, /outside a code span/)
})

test('a bare brace after a real tag is not reported as a misplaced one', () => {
  const { problems } = parseDoc(['**`[X-1]` `[review]` `{base}`** {id} names the placeholder.'])
  assert.deepEqual(problems, [])
})

test("the error taxonomy's braced shape is not mistaken for a tag", () => {
  // `{category, code, message}` is a code span full of braces and must stay one.
  const { rules, problems } = parseDoc([
    '**`[X-1]` `[auto]` `{base}`** — errors carry `{category, code, message}`.',
  ])
  assert.deepEqual(problems, [])
  assert.deepEqual(rules.get('X-1').tags, ['base'])
})

// ── assigning layers ─────────────────────────────────────────────────────────

const rule = (page, tags, cls = 'review') => ({ page, line: 1, cls, tags })
const profiles = () => new Map([['shape:widget', { home: 'appendix/widget.md', covers: '' }]])

test('a kernel rule takes its layer from the kernel block and carries no tag', () => {
  const rules = new Map([['K-1', rule('ARCHITECTURE.md', [])]])
  const { scopes, problems } = classifyRules({
    rules,
    kernel: new Set(['K-1']),
    profiles: profiles(),
    taxonomy: FIXTURE,
  })
  assert.deepEqual(problems, [])
  assert.deepEqual(scopes.get('K-1'), {
    kind: 'core',
    profile: null,
    tag: null,
    label: 'the core',
    surface: 'conformance',
    contractScoped: false,
  })
})

test('a tag on a kernel rule fails — it would be a second membership registry', () => {
  const rules = new Map([['K-1', rule('ARCHITECTURE.md', ['base'])]])
  const { scopes, problems } = classifyRules({
    rules,
    kernel: new Set(['K-1']),
    profiles: profiles(),
    taxonomy: FIXTURE,
  })
  assert.equal(scopes.size, 0)
  onlyProblem(problems, /second membership registry/)
})

test('an untagged non-kernel rule fails, so a new rule cannot land unclassified', () => {
  const { scopes, problems } = classifyRules({
    rules: new Map([['X-1', rule('ARCHITECTURE.md', [])]]),
    kernel: new Set(),
    profiles: profiles(),
    taxonomy: FIXTURE,
  })
  assert.equal(scopes.size, 0)
  onlyProblem(problems, /carries no ownership tag/)
})

test('two tags fail — a rule is in one layer or it is in none', () => {
  const { problems } = classifyRules({
    rules: new Map([['X-1', rule('ARCHITECTURE.md', ['base', 'meta'])]]),
    kernel: new Set(),
    profiles: profiles(),
    taxonomy: FIXTURE,
  })
  onlyProblem(problems, /carries 2 ownership tags/)
})

test('a profile rule defined outside its own document fails', () => {
  const { problems } = classifyRules({
    rules: new Map([['X-1', rule('ARCHITECTURE.md', ['shape:widget'])]]),
    kernel: new Set(),
    profiles: profiles(),
    taxonomy: FIXTURE,
  })
  onlyProblem(problems, /defined in ARCHITECTURE\.md, while that profile's rules live in/)
})

test('a profile rule in its own document is accepted, profile identity intact', () => {
  const { scopes, problems } = classifyRules({
    rules: new Map([['X-1', rule('appendix/widget.md', ['shape:widget'])]]),
    kernel: new Set(),
    profiles: profiles(),
    taxonomy: FIXTURE,
  })
  assert.deepEqual(problems, [])
  assert.deepEqual(scopes.get('X-1'), {
    kind: 'shape-profile',
    profile: 'widget',
    tag: 'shape:widget',
    label: 'shape profile',
    surface: 'opt-in',
    contractScoped: true,
  })
})

// ── the profile home, in the other direction ─────────────────────────────────
//
// The check above keeps a profile rule out of a broadly-loaded document. These keep a
// broadly-loaded rule out of a profile's document — the same leak running the other way,
// and the one contract scoping cannot catch, because a `[guide]` rule is in no contract.

/** Classify one rule defined in the widget profile's home under `tag`. */
const inProfileHome = (tag, cls = 'review') =>
  classifyRules({
    rules: new Map([['X-1', rule('appendix/widget.md', [tag], cls)]]),
    kernel: new Set(),
    profiles: profiles(),
    taxonomy: FIXTURE,
  })

const NOT_ITS_DOCUMENT = /is `\{shape:widget\}`'s document, but is classified/

test('a conformance-surface rule defined in a profile home fails', () => {
  // Correctly classified, and still invisible to everyone who does not select the profile.
  onlyProblem(inProfileHome('base').problems, NOT_ITS_DOCUMENT)
})

test('a governance-surface rule defined in a profile home fails', () => {
  onlyProblem(inProfileHome('meta').problems, NOT_ITS_DOCUMENT)
})

test("another opt-in layer's rule defined in a profile home fails", () => {
  onlyProblem(inProfileHome('runtime-addon').problems, NOT_ITS_DOCUMENT)
})

test('a [guide] rule is caught too — no contract would ever have seen it', () => {
  onlyProblem(inProfileHome('base', 'guide').problems, NOT_ITS_DOCUMENT)
})

test("the profile's own rule in its own home is fine", () => {
  const { scopes, problems } = inProfileHome('shape:widget')
  assert.deepEqual(problems, [])
  assert.equal(scopes.get('X-1').profile, 'widget')
})

test('a kernel rule defined in a profile home fails', () => {
  const { problems } = classifyRules({
    rules: new Map([['K-1', rule('appendix/widget.md', [])]]),
    kernel: new Set(['K-1']),
    profiles: profiles(),
    taxonomy: FIXTURE,
  })
  onlyProblem(problems, NOT_ITS_DOCUMENT)
})

test('citing a rule from a profile document is untouched — definitions only', () => {
  // X-1 is DEFINED in the spine and merely cited by the profile document, which is how a
  // profile is meant to refer outward. Only the defining page is checked.
  const { problems } = classifyRules({
    rules: new Map([
      ['X-1', rule('ARCHITECTURE.md', ['base'])],
      ['Y-1', rule('appendix/widget.md', ['shape:widget'])],
    ]),
    kernel: new Set(),
    profiles: profiles(),
    taxonomy: FIXTURE,
  })
  assert.deepEqual(problems, [])
})

// ── contract scopes ──────────────────────────────────────────────────────────

/**
 * A one-document tree whose contract holds `lines`, checked for scope honesty.
 *
 * `byId` is rule ID -> resolved scope; the helper builds the canonical rules the gate now
 * reads, each carrying its own scope. There is no second classification map to hand it.
 */
function scopes(lines, byId) {
  const page = ['# Doc', '', CONTRACT_START, ...lines, CONTRACT_END, ''].join('\n')
  return inTree({ 'SYSTEM.md': page }, (dir) =>
    checkContractScopes(
      dir,
      new Map([...byId].map(([id, scope]) => [id, { page: 'SYSTEM.md', scope }]))
    )
  )
}

// Resolved from the fixture taxonomy rather than written out, so these carry whatever the
// rows say — including any field added to a Scope later.
const WIDGET = new Map([['shape:widget', { home: 'appendix/widget.md', covers: '' }]])
const resolved = (tag) => resolveTag(tag, WIDGET, FIXTURE)
const LAYER = {
  unscoped: resolved('base'),
  profile: resolved('shape:widget'),
  addon: resolved('runtime-addon'),
}

test('an opt-in rule under its own scope, beside an unscoped rule, is fine', () => {
  const problems = scopes(
    [
      '- `[CHAN-1]` cross a boundary over a channel.',
      '<!-- coral:scope:runtime-addon -->',
      '- `[ORCH-4]` only from inside a harness.',
      '<!-- coral:scope:end -->',
      '- `[SYS-TEST-1]` contract-test each side.',
    ],
    new Map([
      ['CHAN-1', LAYER.unscoped],
      ['ORCH-4', LAYER.addon],
      ['SYS-TEST-1', LAYER.unscoped],
    ])
  )
  assert.deepEqual(problems, [])
})

test('an opt-in rule listed unscoped fails — the contract would present it as unconditional', () => {
  const problems = scopes(
    ['- `[ORCH-4]` only from inside a harness.'],
    new Map([['ORCH-4', LAYER.addon]])
  )
  onlyProblem(problems, /the contract lists it unscoped/)
})

test('a rule from a non-profile layer inside a scope fails', () => {
  const problems = scopes(
    [
      '<!-- coral:scope:runtime-addon -->',
      '- `[ORCH-4]` only from inside a harness.',
      '- `[CHAN-1]` cross a boundary over a channel.',
    ],
    new Map([
      ['ORCH-4', LAYER.addon],
      ['CHAN-1', LAYER.unscoped],
    ])
  )
  onlyProblem(problems, /not a profile-scoped layer .* sits inside opt-in contract scope/s)
})

test('a scope naming the wrong profile fails', () => {
  const problems = scopes(
    ['<!-- coral:scope:base -->', '- `[ORCH-4]` only from inside a harness.'],
    new Map([
      ['ORCH-4', LAYER.addon],
      ['CHAN-1', LAYER.unscoped],
    ])
  )
  onlyProblem(problems, /under scope `\{base\}`/)
})

test('a scope that governs nothing fails', () => {
  const problems = scopes(
    ['<!-- coral:scope:runtime-addon -->', '<!-- coral:scope:end -->'],
    new Map([['ORCH-4', LAYER.addon]])
  )
  onlyProblem(problems, /no contract line falls under it/)
})

test('opening a scope while another is open fails', () => {
  // The documented grammar says a scope runs until it is closed. A parser that quietly
  // switches instead disagrees with its own grammar, and the marker stops being readable
  // without counting markers.
  const problems = scopes(
    [
      '<!-- coral:scope:runtime-addon -->',
      '- `[ORCH-4]` only from inside a harness.',
      '<!-- coral:scope:shape:widget -->',
      '- `[CLI-6]` no interactive prompts.',
    ],
    new Map([
      ['ORCH-4', LAYER.addon],
      ['CLI-6', LAYER.profile],
    ])
  )
  onlyProblem(
    problems,
    /opens contract scope `\{shape:widget\}` while `\{runtime-addon\}` .* is still open/s
  )
})

test('reopening the same scope without closing it fails', () => {
  const problems = scopes(
    [
      '<!-- coral:scope:runtime-addon -->',
      '- `[ORCH-4]` only from inside a harness.',
      '<!-- coral:scope:runtime-addon -->',
      '- `[ORCH-5]` published capabilities only.',
    ],
    new Map([
      ['ORCH-4', LAYER.addon],
      ['ORCH-5', LAYER.addon],
    ])
  )
  onlyProblem(problems, /while `\{runtime-addon\}` .* is still open/s)
})

test('scope → rules → end → a different scope is the valid sequence', () => {
  const problems = scopes(
    [
      '<!-- coral:scope:runtime-addon -->',
      '- `[ORCH-4]` only from inside a harness.',
      '<!-- coral:scope:end -->',
      '- `[CHAN-1]` cross a boundary over a channel.',
      '<!-- coral:scope:shape:widget -->',
      '- `[CLI-6]` no interactive prompts.',
      '<!-- coral:scope:end -->',
    ],
    new Map([
      ['ORCH-4', LAYER.addon],
      ['CHAN-1', LAYER.unscoped],
      ['CLI-6', LAYER.profile],
    ])
  )
  assert.deepEqual(problems, [])
})

test('closing a scope that was never opened fails', () => {
  const problems = scopes(
    ['<!-- coral:scope:end -->', '- `[CHAN-1]` cross a boundary over a channel.'],
    new Map([['CHAN-1', LAYER.unscoped]])
  )
  onlyProblem(problems, /closes a contract scope that was never opened/)
})

test('a scope naming a tag no rule uses fails', () => {
  const problems = scopes(
    ['<!-- coral:scope:shape:widget -->', '- `[ORCH-4]` only from inside a harness.'],
    new Map([['ORCH-4', LAYER.addon]])
  )
  assert.ok(problems.some((p) => /which no rule is classified under/.test(p)), problems.join('\n'))
})

// ── the scale registry ───────────────────────────────────────────────────────
//
// Same posture as the ownership taxonomy, and the tests say the same things about it:
// the key is a machine identity that may not be repaired into something nobody wrote,
// a row that fails to parse is an error rather than a scale that quietly stops
// existing, and there is exactly one default row. Synthetic vocabulary throughout —
// `here`, `there`, `WIDE.md` — so renaming Coral's scales is a documents change.

const SCALE_HEADER = ['| Scale | Key | Stated in | Read by | Justified by |', '|---|---|---|---|---|']

/** Write a CONVENTIONS.md holding `body` between the scale markers, and parse it. */
const parseScaleRegistry = (body, extra = {}) =>
  inTree(
    {
      [PROFILES_FILE]: ['# Conventions', '', SCALES_START, ...body, SCALES_END, ''].join('\n'),
      'WIDE.md': '# Wide\n',
      ...extra,
    },
    parseScales
  )

const scaleRows = (rows) => parseScaleRegistry(['', ...SCALE_HEADER, ...rows, ''])

test('a well-formed scale registry yields its scales and no problems', () => {
  const { scales, problems } = scaleRows([
    '| here | `here` | — | one unit | itself |',
    '| there | `there` | `WIDE.md` | many units | between them |',
  ])
  assert.deepEqual(problems, [])
  assert.deepEqual(
    scales.map((sc) => [sc.key, sc.page]),
    [
      ['here', null],
      ['there', 'WIDE.md'],
    ]
  )
})

test('scaleOfPage falls to the default row for every document no row claims', () => {
  const { scales } = scaleRows([
    '| here | `here` | — | one unit | itself |',
    '| there | `there` | `WIDE.md` | many units | between them |',
  ])
  assert.equal(scaleOfPage('WIDE.md', scales), 'there')
  assert.equal(scaleOfPage('ARCHITECTURE.md', scales), 'here')
  assert.equal(scaleOfPage('appendix/anything.md', scales), 'here')
  assert.equal(defaultScaleOf(scales).key, 'here')
})

test('a registry with no default row is refused — most rules would have no scale', () => {
  const { problems } = scaleRows(['| there | `there` | `WIDE.md` | many units | between them |'])
  assert.ok(problems.some((p) => /has no default row/.test(p)), problems.join('\n'))
})

test('a second default row is refused too', () => {
  const { problems } = scaleRows([
    '| here | `here` | — | one unit | itself |',
    '| also | `also` | — | one unit | itself |',
  ])
  assert.ok(problems.some((p) => /is a second default scale/.test(p)), problems.join('\n'))
})

test('the scale key cell is matched whole, like a layer key', () => {
  for (const cell of ['here', '`Here`', '`here scale`', '`here_scale`', '`{here}`', '`-here`']) {
    const { scales, problems } = scaleRows([
      '| here | `here` | — | one unit | itself |',
      `| odd | ${cell} | \`WIDE.md\` | many | between |`,
    ])
    assert.ok(problems.some((p) => /is not a scale key|malformed scale row/.test(p)), cell)
    assert.deepEqual(scales.map((sc) => sc.key), ['here'], `${cell} contributed a scale anyway`)
  }
})

test('two scales cannot share a key, a name, or a document', () => {
  const dupKey = scaleRows([
    '| here | `here` | — | one | itself |',
    '| other | `here` | `WIDE.md` | many | between |',
  ])
  assert.ok(dupKey.problems.some((p) => /declares the scale key `here` twice/.test(p)))
  const dupName = scaleRows([
    '| here | `here` | — | one | itself |',
    '| here | `there` | `WIDE.md` | many | between |',
  ])
  assert.ok(dupName.problems.some((p) => /declares the scale name `here` twice/.test(p)))
  const dupPage = scaleRows([
    '| here | `here` | — | one | itself |',
    '| there | `there` | `WIDE.md` | many | between |',
    '| yonder | `yonder` | `WIDE.md` | many | between |',
  ])
  assert.ok(dupPage.problems.some((p) => /already claims/.test(p)), dupPage.problems.join('\n'))
})

test('a scale naming a document that does not exist is refused', () => {
  const { problems } = scaleRows([
    '| here | `here` | — | one | itself |',
    '| there | `there` | `GHOST.md` | many | between |',
  ])
  assert.ok(problems.some((p) => /is not a document the/.test(p)), problems.join('\n'))
})

test('prose inside the scale block, or a malformed row, is an error and not a skip', () => {
  const prose = parseScaleRegistry(['', ...SCALE_HEADER, '| here | `here` | — | one | itself |', 'and a note', ''])
  assert.ok(prose.problems.some((p) => /is not a table row/.test(p)))
  const short = scaleRows(['| here | `here` | — | one |'])
  assert.ok(short.problems.some((p) => /malformed scale row/.test(p)))
})

test('two scale blocks in one file is an error, not a first-one-wins', () => {
  const { problems } = inTree(
    {
      [PROFILES_FILE]: [
        '# Conventions',
        '',
        SCALES_START,
        ...SCALE_HEADER,
        '| here | `here` | — | one | itself |',
        SCALES_END,
        SCALES_START,
        ...SCALE_HEADER,
        '| here | `here` | — | one | itself |',
        SCALES_END,
        '',
      ].join('\n'),
    },
    parseScales
  )
  assert.ok(problems.some((p) => /must hold exactly one/.test(p)), problems.join('\n'))
})

// ── the real documents ───────────────────────────────────────────────────────

test('every published rule lands in exactly one ownership layer', () => {
  const { rules, problems } = parseRules(REPO)
  const { ids: kernel, problems: kp } = parseKernel(REPO, rules)
  const { profiles: registry, problems: pp } = parseProfiles(REPO, REAL)
  const { scopes: resolvedScopes, problems: lp } = classifyRules({
    rules,
    kernel,
    profiles: registry,
    taxonomy: REAL,
  })
  assert.deepEqual([...REAL_PROBLEMS, ...problems, ...kp, ...pp, ...lp], [])
  assert.equal(resolvedScopes.size, rules.size)
  for (const [id, scope] of resolvedScopes) {
    assert.ok(scope.kind, `[${id}] has no scope kind`)
    // "Exactly one" is structural, not a count of matches: a rule holds one tag and one
    // resolved scope, so there is no shape in which it can appear in two.
    assert.equal(typeof scope.label, 'string')
  }
})

test('the three surfaces partition every classified rule', () => {
  // The claim rules.md prints in words — conformance + governance + opt-in = every rule —
  // asserted without naming a single layer. groupBySurface() throws on a layer whose surface
  // is not one of the three, which is the shape in which a total could silently go short.
  const { rules } = parseRules(REPO)
  const { ids: kernel } = parseKernel(REPO, rules)
  const { profiles: registry } = parseProfiles(REPO, REAL)
  const { scopes: resolvedScopes } = classifyRules({
    rules,
    kernel,
    profiles: registry,
    taxonomy: REAL,
  })
  const groups = groupBySurface(resolvedScopes)
  assert.deepEqual([...groups.keys()], SURFACES)
  assert.equal(
    [...groups.values()].reduce((n, ids) => n + ids.length, 0),
    rules.size
  )
  // and every declared layer names one of them, including any that currently has no rules
  for (const layer of REAL) assert.ok(SURFACES.includes(layer.surface), layer.label)
})

test('the generated index reconciles its own three subtotals', () => {
  // serializeIndex() throws if the surfaces do not cover every rule; this proves the guard
  // runs on the real registry rather than only on fixtures.
  const model = loadRuleModel(REPO)
  const { rules } = model
  const page = serializeIndex(REPO, model)
  const n = String.raw`\*\*(\d+)`
  // Whitespace-tolerant: the generated prose is greedy-wrapped, so a phrase may straddle a
  // line break and a literal space would make this test fail on a reworded paragraph rather
  // than on a subtotal that stopped reconciling.
  const ws = (phrase) => phrase.split(' ').join(String.raw`\s+`)
  const [, a, b, c] = page.match(
    new RegExp(
      `${n}${ws(' form the conformance surface')}\\*\\*[\\s\\S]*?` +
        `${n}${ws(' govern Coral itself')}\\*\\*[\\s\\S]*?${n}${ws(' are opt-in')}`
    )
  )
  assert.equal(Number(a) + Number(b) + Number(c), rules.size)
})

test('kernel membership stays single-sourced — no kernel rule carries a tag', () => {
  const { rules } = parseRules(REPO)
  const { ids: kernel } = parseKernel(REPO, rules)
  assert.ok(kernel.size > 0)
  for (const id of kernel) assert.deepEqual(rules.get(id).tags, [], `[${id}] carries a tag`)
})

test("every profile's rules live in the document the registry names for it", () => {
  const { rules } = parseRules(REPO)
  const { profiles: registry, problems } = parseProfiles(REPO, REAL)
  assert.deepEqual(problems, [])
  assert.ok(registry.size > 0)
  // The registry's own invariants, asserted structurally rather than by listing the homes:
  // no profile lives in a spine, and no two share a document.
  const homes = [...registry.values()].map((p) => p.home)
  assert.equal(new Set(homes).size, homes.length, 'two profiles share a home document')
  for (const home of homes) {
    assert.ok(!SPINE_FILES.includes(home), `${home} is a spine and cannot be a profile home`)
  }
  for (const [tag, { home }] of registry) {
    for (const [id, r] of rules) {
      if (r.tags[0] === tag) assert.equal(r.page, home, `[${id}] is ${tag} but lives in ${r.page}`)
    }
  }
})

test('no contract presents an opt-in rule as unscoped', () => {
  const { rules, classified } = loadRuleModel(REPO)
  assert.ok(classified)
  assert.deepEqual(checkContractScopes(REPO, rules), [])
})

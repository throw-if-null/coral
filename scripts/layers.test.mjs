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
// The last block runs against the real documents, and note what it does NOT assert: not
// which rules are in which layer, and not that `language binding` is currently empty. Both
// would be second copies of facts the documents own — the thing this design exists to
// avoid. It asserts the invariants instead: every rule lands in exactly one layer, no
// kernel rule carries a tag, and the profile registry is honoured.
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
  SYSTEM_SPINE,
  checkContractScopes,
  classifyRules,
  parseKernel,
  parseLayers,
  parseProfiles,
  parseRules,
  resolveTag,
} from './rules.mjs'

const REPO = path.resolve(import.meta.dirname, '..')
const SPINE_FILES = ['CONVENTIONS.md', APP_SPINE, SYSTEM_SPINE]
// The taxonomy the fixtures resolve against. Read from the real CONVENTIONS.md rather than
// written out here: a literal copy would be exactly the second authority parseLayers() was
// added to remove, and it would stop these tests from noticing a layer being renamed.
const { taxonomy: TAXONOMY, problems: TAXONOMY_PROBLEMS } = parseLayers(REPO)

const HEADER = ['| Profile | Rules live in | What it covers |', '|---|---|---|']
const ROW = '| `{app:cli}` | `appendix/cli.md` | Command-line applications. |'

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

/** Write a CONVENTIONS.md holding `body` between the profile markers, and parse it. */
const parseBlock = (body, extra = {}) =>
  inTree(
    {
      [PROFILES_FILE]: ['# Conventions', '', PROFILES_START, ...body, PROFILES_END, ''].join('\n'),
      'appendix/cli.md': '# CLI\n',
      ...extra,
    },
    (dir) => parseProfiles(dir, TAXONOMY)
  )

/** Assert the problems contain exactly one entry matching `re`. */
function onlyProblem(problems, re) {
  assert.equal(problems.length, 1, `expected one problem, got:\n${problems.join('\n')}`)
  assert.match(problems[0], re)
}

// ── the ownership-layer taxonomy ─────────────────────────────────────────────

const LAYER_HEADER = [
  '| Layer | Tag | Contract scope | Read by | Justified by |',
  '|---|---|---|---|---|',
]
const LAYER_ROWS = [
  '| kernel | — | unscoped | every codebase | the operating model |',
  '| production baseline | `{baseline}` | unscoped | every codebase | the software needing it |',
  '| app profile | `{app:…}` | profile-scoped | apps of that shape | the external shape |',
]

/** Write a CONVENTIONS.md holding `body` between the layer markers, and parse it. */
const parseTaxonomy = (body) =>
  inTree(
    { [PROFILES_FILE]: ['# Conventions', '', LAYERS_START, ...body, LAYERS_END, ''].join('\n') },
    parseLayers
  )

test('a well-formed taxonomy yields its layers and no problems', () => {
  const { taxonomy, problems } = parseTaxonomy(['', ...LAYER_HEADER, ...LAYER_ROWS, ''])
  assert.deepEqual(problems, [])
  assert.deepEqual(
    taxonomy.map((l) => [l.key, l.tag, l.family, l.scoped]),
    [
      ['kernel', null, null, false],
      ['baseline', 'baseline', null, false],
      ['app', null, 'app', true],
    ]
  )
})

test('a scope word that is neither `unscoped` nor `profile-scoped` fails', () => {
  // That column is what Gate 9 reads, so a third word would silently do nothing.
  const { problems } = parseTaxonomy([
    '',
    ...LAYER_HEADER,
    ...LAYER_ROWS.slice(0, 2),
    '| app profile | `{app:…}` | sometimes | apps of that shape | the external shape |',
    '',
  ])
  onlyProblem(problems, /is not a contract-scope word/)
})

test('a tag cell that is neither a tag nor the em dash fails', () => {
  const { problems } = parseTaxonomy([
    '',
    ...LAYER_HEADER,
    LAYER_ROWS[0],
    '| production baseline | baseline | unscoped | every codebase | why |',
    '',
  ])
  onlyProblem(problems, /is not a layer tag/)
})

test('a second tagless layer fails — only the kernel takes members from its own block', () => {
  const { problems } = parseTaxonomy([
    '',
    ...LAYER_HEADER,
    LAYER_ROWS[0],
    '| something else | — | unscoped | everyone | why |',
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
    /declares `\{baseline\}` twice/
  )
  onlyProblem(
    parseTaxonomy([
      '',
      ...LAYER_HEADER,
      ...LAYER_ROWS,
      '| production baseline | `{governance}` | unscoped | everyone | why |',
      '',
    ]).problems,
    /declares the layer name `production baseline` twice/
  )
})

test('a malformed row fails rather than dropping the layer', () => {
  const { taxonomy, problems } = parseTaxonomy([
    '',
    ...LAYER_HEADER,
    LAYER_ROWS[0],
    '| production baseline | `{baseline}` | unscoped |',
    '',
  ])
  assert.deepEqual(
    taxonomy.map((l) => l.key),
    ['kernel']
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
    /header must have exactly 5 non-empty columns/
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
  assert.deepEqual(TAXONOMY_PROBLEMS, [])
  assert.ok(TAXONOMY.length > 0)
  assert.equal(TAXONOMY.filter((l) => l.tag === null && l.family === null).length, 1)
  const { rules } = parseRules(REPO)
  for (const [id, rule] of rules) {
    for (const tag of rule.tags) {
      const head = tag.split(':')[0]
      assert.ok(
        TAXONOMY.some((l) => l.tag === head || l.family === head),
        `[${id}] carries {${tag}}, which no declared layer covers`
      )
    }
  }
})

// ── the profile registry ─────────────────────────────────────────────────────

test('a well-formed registry yields its profiles and no problems', () => {
  const { profiles, problems } = parseBlock(['', ...HEADER, ROW, ''])
  assert.deepEqual(problems, [])
  assert.deepEqual([...profiles.keys()], ['app:cli'])
  assert.equal(profiles.get('app:cli').home, 'appendix/cli.md')
})

test('a duplicated profile is an error, not a silent last-one-wins', () => {
  const { problems } = parseBlock(['', ...HEADER, ROW, ROW, ''])
  onlyProblem(problems, /declares `\{app:cli\}` twice/)
})

test('a malformed row fails rather than dropping the profile', () => {
  // The tag lost its backticks, so the site cannot link it and the parser must not read it.
  const { profiles, problems } = parseBlock([
    '',
    ...HEADER,
    '| {app:cli} | `appendix/cli.md` | Command-line applications. |',
    '',
  ])
  assert.equal(profiles.size, 0)
  onlyProblem(problems, /malformed profile row/)
})

test('a row with a fourth column fails', () => {
  const { problems } = parseBlock([
    '',
    ...HEADER,
    '| `{app:cli}` | `appendix/cli.md` | covers | extra |',
    '',
  ])
  onlyProblem(problems, /malformed profile row/)
})

test('a layer that takes no profile cannot be registered as one', () => {
  const { problems } = parseBlock([
    '',
    ...HEADER,
    '| `{baseline}` | `appendix/cli.md` | not a profile |',
    '',
  ])
  onlyProblem(problems, /is not a profile/)
})

test("a profile whose home document does not exist fails", () => {
  const { problems } = parseBlock([
    '',
    ...HEADER,
    '| `{app:cli}` | `appendix/nope.md` | Command-line applications. |',
    '',
  ])
  onlyProblem(problems, /which does not exist/)
})

test('a profile whose home is a spine fails', () => {
  // `| {app:cli} | ARCHITECTURE.md |` would satisfy every downstream check while doing the
  // exact thing they exist to stop: the rules sit in a document every project reads, and the
  // home check blesses it. The registry must not be able to excuse that.
  const { problems } = parseBlock(
    ['', ...HEADER, '| `{app:cli}` | `ARCHITECTURE.md` | Command-line applications. |', ''],
    { 'ARCHITECTURE.md': '# App\n' }
  )
  onlyProblem(problems, /which is a spine/)
})

test('a language binding whose home is a spine fails too', () => {
  const { problems } = parseBlock(
    ['', ...HEADER, '| `{lang:go}` | `SYSTEM.md` | Go. |', ''],
    { 'SYSTEM.md': '# System\n' }
  )
  onlyProblem(problems, /which is a spine/)
})

test('a home that defines no rules fails', () => {
  const { problems } = parseBlock(
    ['', ...HEADER, '| `{app:cli}` | `CHANGELOG.md` | Command-line applications. |', ''],
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
    '| `{app:backend}` | `appendix/cli.md` | HTTP services. |',
    '',
  ])
  assert.deepEqual([...profiles.keys()], ['app:cli'])
  onlyProblem(problems, /which `\{app:cli\}` already claims/)
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
  const profiles = new Map([['app:cli', { home: 'appendix/cli.md', covers: '' }]])
  assert.deepEqual(resolveTag('baseline', profiles, TAXONOMY), {
    key: 'baseline',
    label: 'production baseline',
    profile: null,
    scoped: false,
  })
  assert.deepEqual(resolveTag('app:cli', profiles, TAXONOMY), {
    key: 'app',
    label: 'app profile',
    profile: 'cli',
    scoped: true,
  })
})

test('a profile-bearing layer named without a profile is rejected', () => {
  assert.match(resolveTag('app', new Map(), TAXONOMY), /must say WHICH one/)
})

test('an unregistered profile is rejected, so a typo cannot invent a layer', () => {
  assert.match(resolveTag('app:clii', new Map(), TAXONOMY), /is not a declared profile/)
})

test('a profile split on a layer that takes none is rejected', () => {
  assert.match(resolveTag('baseline:strict', new Map(), TAXONOMY), /is not a layer that takes a profile/)
})

test('an unknown bare tag is rejected and the message lists the real ones', () => {
  const out = resolveTag('important', new Map(), TAXONOMY)
  assert.match(out, /is not an ownership layer/)
  assert.match(out, /`\{baseline\}`/)
})

// ── reading tags off a definition line ───────────────────────────────────────

/** Parse a one-document tree whose ARCHITECTURE.md holds `lines`. */
const parseDoc = (lines) =>
  inTree({ 'ARCHITECTURE.md': ['# App', '', ...lines, ''].join('\n') }, parseRules)

test('a tag is read off the definition line, after the enforcement class', () => {
  const { rules, problems } = parseDoc(['**`[X-1]` `[review]` `{baseline}`** — a rule.'])
  assert.deepEqual(problems, [])
  assert.deepEqual(rules.get('X-1').tags, ['baseline'])
})

test('a span written in the shape of a tag but spelled wrong is an error, not a skip', () => {
  const { problems } = parseDoc(['**`[X-1]` `[review]` `{App:CLI}`** — a rule.'])
  onlyProblem(problems, /written as an ownership tag but is not one/)
})

test('a tag outside its code span fails rather than reading as unclassified', () => {
  const { problems } = parseDoc(['**`[X-1]` `[review]`** {baseline} — a rule.'])
  onlyProblem(problems, /outside a code span/)
})

test("the error taxonomy's braced shape is not mistaken for a tag", () => {
  // `{category, code, message}` is a code span full of braces and must stay one.
  const { rules, problems } = parseDoc([
    '**`[X-1]` `[auto]` `{baseline}`** — errors carry `{category, code, message}`.',
  ])
  assert.deepEqual(problems, [])
  assert.deepEqual(rules.get('X-1').tags, ['baseline'])
})

// ── assigning layers ─────────────────────────────────────────────────────────

const rule = (page, tags, cls = 'review') => ({ page, line: 1, cls, tags })
const profiles = () => new Map([['app:cli', { home: 'appendix/cli.md', covers: '' }]])

test('a kernel rule takes its layer from the kernel block and carries no tag', () => {
  const rules = new Map([['K-1', rule('ARCHITECTURE.md', [])]])
  const { layers, problems } = classifyRules({
    rules,
    kernel: new Set(['K-1']),
    profiles: profiles(),
    taxonomy: TAXONOMY,
  })
  assert.deepEqual(problems, [])
  assert.equal(layers.get('K-1').key, 'kernel')
})

test('a tag on a kernel rule fails — it would be a second membership registry', () => {
  const rules = new Map([['K-1', rule('ARCHITECTURE.md', ['baseline'])]])
  const { layers, problems } = classifyRules({
    rules,
    kernel: new Set(['K-1']),
    profiles: profiles(),
    taxonomy: TAXONOMY,
  })
  assert.equal(layers.size, 0)
  onlyProblem(problems, /second membership registry/)
})

test('an untagged non-kernel rule fails, so a new rule cannot land unclassified', () => {
  const { layers, problems } = classifyRules({
    rules: new Map([['X-1', rule('ARCHITECTURE.md', [])]]),
    kernel: new Set(),
    profiles: profiles(),
    taxonomy: TAXONOMY,
  })
  assert.equal(layers.size, 0)
  onlyProblem(problems, /carries no ownership tag/)
})

test('two tags fail — a rule is in one layer or it is in none', () => {
  const { problems } = classifyRules({
    rules: new Map([['X-1', rule('ARCHITECTURE.md', ['baseline', 'governance'])]]),
    kernel: new Set(),
    profiles: profiles(),
    taxonomy: TAXONOMY,
  })
  onlyProblem(problems, /carries 2 ownership tags/)
})

test('a profile rule defined outside its own document fails', () => {
  const { problems } = classifyRules({
    rules: new Map([['X-1', rule('ARCHITECTURE.md', ['app:cli'])]]),
    kernel: new Set(),
    profiles: profiles(),
    taxonomy: TAXONOMY,
  })
  onlyProblem(problems, /defined in ARCHITECTURE\.md, while that profile's rules live in/)
})

test('a profile rule in its own document is accepted, profile identity intact', () => {
  const { layers, problems } = classifyRules({
    rules: new Map([['X-1', rule('appendix/cli.md', ['app:cli'])]]),
    kernel: new Set(),
    profiles: profiles(),
    taxonomy: TAXONOMY,
  })
  assert.deepEqual(problems, [])
  assert.deepEqual(layers.get('X-1'), {
    tag: 'app:cli',
    key: 'app',
    label: 'app profile',
    profile: 'cli',
    scoped: true,
  })
})

// ── the profile home, in the other direction ─────────────────────────────────
//
// The check above keeps a profile rule out of a broadly-loaded document. These keep a
// broadly-loaded rule out of a profile's document — the same leak running the other way,
// and the one contract scoping cannot catch, because a `[guide]` rule is in no contract.

/** Classify one rule defined in the CLI profile's home under `tag`. */
const inCliHome = (tag, cls = 'review') =>
  classifyRules({
    rules: new Map([['X-1', rule('appendix/cli.md', [tag], cls)]]),
    kernel: new Set(),
    profiles: profiles(),
    taxonomy: TAXONOMY,
  })

test('a baseline rule defined in a profile home fails', () => {
  // Correctly classified, and still invisible to everyone not building a CLI.
  onlyProblem(inCliHome('baseline').problems, /is `\{app:cli\}`'s document, but is classified/)
})

test('a governance rule defined in a profile home fails', () => {
  onlyProblem(inCliHome('governance').problems, /is `\{app:cli\}`'s document, but is classified/)
})

test('a runtime-agent rule defined in a profile home fails', () => {
  onlyProblem(inCliHome('runtime-agent').problems, /is `\{app:cli\}`'s document, but is classified/)
})

test('a [guide] rule is caught too — no contract would ever have seen it', () => {
  onlyProblem(inCliHome('baseline', 'guide').problems, /is `\{app:cli\}`'s document/)
})

test('the profile\'s own rule in its own home is fine', () => {
  const { layers, problems } = inCliHome('app:cli')
  assert.deepEqual(problems, [])
  assert.equal(layers.get('X-1').profile, 'cli')
})

test('a kernel rule defined in a profile home fails', () => {
  const { problems } = classifyRules({
    rules: new Map([['K-1', rule('appendix/cli.md', [])]]),
    kernel: new Set(['K-1']),
    profiles: profiles(),
    taxonomy: TAXONOMY,
  })
  onlyProblem(problems, /is `\{app:cli\}`'s document, but is classified `kernel`/)
})

test('citing a baseline rule from a profile document is untouched — definitions only', () => {
  // [BOUND-2] is DEFINED in the spine and merely cited by the appendix, which is how an
  // appendix is meant to refer outward. Only the defining page is checked.
  const { problems } = classifyRules({
    rules: new Map([
      ['BOUND-2', rule('ARCHITECTURE.md', ['baseline'])],
      ['CLI-1', rule('appendix/cli.md', ['app:cli'])],
    ]),
    kernel: new Set(),
    profiles: profiles(),
    taxonomy: TAXONOMY,
  })
  assert.deepEqual(problems, [])
})

// ── contract scopes ──────────────────────────────────────────────────────────

/** A one-document tree whose contract holds `lines`, checked for scope honesty. */
function scopes(lines, layers) {
  const page = ['# Doc', '', CONTRACT_START, ...lines, CONTRACT_END, ''].join('\n')
  return inTree({ 'SYSTEM.md': page }, (dir) =>
    checkContractScopes(dir, {
      rules: new Map([...layers.keys()].map((id) => [id, { page: 'SYSTEM.md' }])),
      layers,
    })
  )
}

const LAYER = {
  baseline: {
    tag: 'baseline',
    key: 'baseline',
    label: 'production baseline',
    profile: null,
    scoped: false,
  },
  cli: { tag: 'app:cli', key: 'app', label: 'app profile', profile: 'cli', scoped: true },
  agent: {
    tag: 'runtime-agent',
    key: 'runtime-agent',
    label: 'runtime-agent profile',
    profile: null,
    scoped: true,
  },
}

test('an opt-in rule under its own scope, beside an unscoped baseline rule, is fine', () => {
  const problems = scopes(
    [
      '- `[CHAN-1]` cross a boundary over a channel.',
      '<!-- coral:scope:runtime-agent -->',
      '- `[ORCH-4]` only from inside a harness.',
      '<!-- coral:scope:end -->',
      '- `[SYS-TEST-1]` contract-test each side.',
    ],
    new Map([
      ['CHAN-1', LAYER.baseline],
      ['ORCH-4', LAYER.agent],
      ['SYS-TEST-1', LAYER.baseline],
    ])
  )
  assert.deepEqual(problems, [])
})

test('an opt-in rule listed unscoped fails — the contract would present it as unconditional', () => {
  const problems = scopes(
    ['- `[ORCH-4]` only from inside a harness.'],
    new Map([['ORCH-4', LAYER.agent]])
  )
  onlyProblem(problems, /the contract lists it unscoped/)
})

test('a rule from a non-profile layer inside a scope fails', () => {
  const problems = scopes(
    [
      '<!-- coral:scope:runtime-agent -->',
      '- `[ORCH-4]` only from inside a harness.',
      '- `[CHAN-1]` cross a boundary over a channel.',
    ],
    new Map([
      ['ORCH-4', LAYER.agent],
      ['CHAN-1', LAYER.baseline],
    ])
  )
  onlyProblem(problems, /not a profile-scoped layer .* sits inside opt-in contract scope/s)
})

test('a scope naming the wrong profile fails', () => {
  const problems = scopes(
    ['<!-- coral:scope:baseline -->', '- `[ORCH-4]` only from inside a harness.'],
    new Map([
      ['ORCH-4', LAYER.agent],
      ['CHAN-1', LAYER.baseline],
    ])
  )
  onlyProblem(problems, /under scope `\{baseline\}`/)
})

test('a scope that governs nothing fails', () => {
  const problems = scopes(
    ['<!-- coral:scope:runtime-agent -->', '<!-- coral:scope:end -->'],
    new Map([['ORCH-4', LAYER.agent]])
  )
  onlyProblem(problems, /no contract line falls under it/)
})

test('opening a scope while another is open fails', () => {
  // The documented grammar says a scope runs until it is closed. A parser that quietly
  // switches instead disagrees with its own grammar, and the marker stops being readable
  // without counting markers.
  const problems = scopes(
    [
      '<!-- coral:scope:runtime-agent -->',
      '- `[ORCH-4]` only from inside a harness.',
      '<!-- coral:scope:app:cli -->',
      '- `[CLI-6]` no interactive prompts.',
    ],
    new Map([
      ['ORCH-4', LAYER.agent],
      ['CLI-6', LAYER.cli],
    ])
  )
  onlyProblem(problems, /opens contract scope `\{app:cli\}` while `\{runtime-agent\}` .* is still open/s)
})

test('reopening the same scope without closing it fails', () => {
  const problems = scopes(
    [
      '<!-- coral:scope:runtime-agent -->',
      '- `[ORCH-4]` only from inside a harness.',
      '<!-- coral:scope:runtime-agent -->',
      '- `[ORCH-5]` published capabilities only.',
    ],
    new Map([
      ['ORCH-4', LAYER.agent],
      ['ORCH-5', LAYER.agent],
    ])
  )
  onlyProblem(problems, /while `\{runtime-agent\}` .* is still open/s)
})

test('scope → rules → end → a different scope is the valid sequence', () => {
  const problems = scopes(
    [
      '<!-- coral:scope:runtime-agent -->',
      '- `[ORCH-4]` only from inside a harness.',
      '<!-- coral:scope:end -->',
      '- `[CHAN-1]` cross a boundary over a channel.',
      '<!-- coral:scope:app:cli -->',
      '- `[CLI-6]` no interactive prompts.',
      '<!-- coral:scope:end -->',
    ],
    new Map([
      ['ORCH-4', LAYER.agent],
      ['CHAN-1', LAYER.baseline],
      ['CLI-6', LAYER.cli],
    ])
  )
  assert.deepEqual(problems, [])
})

test('closing a scope that was never opened fails', () => {
  const problems = scopes(
    ['<!-- coral:scope:end -->', '- `[CHAN-1]` cross a boundary over a channel.'],
    new Map([['CHAN-1', LAYER.baseline]])
  )
  onlyProblem(problems, /closes a contract scope that was never opened/)
})

test('a scope naming a tag no rule uses fails', () => {
  const problems = scopes(
    ['<!-- coral:scope:app:cli -->', '- `[ORCH-4]` only from inside a harness.'],
    new Map([['ORCH-4', LAYER.agent]])
  )
  assert.ok(problems.some((p) => /which no rule is classified under/.test(p)), problems.join('\n'))
})

// ── the real documents ───────────────────────────────────────────────────────

test('every published rule lands in exactly one ownership layer', () => {
  const { rules, problems } = parseRules(REPO)
  const { ids: kernel, problems: kp } = parseKernel(REPO, rules)
  const { profiles: registry, problems: pp } = parseProfiles(REPO, TAXONOMY)
  const { layers, problems: lp } = classifyRules({
    rules,
    kernel,
    profiles: registry,
    taxonomy: TAXONOMY,
  })
  assert.deepEqual([...TAXONOMY_PROBLEMS, ...problems, ...kp, ...pp, ...lp], [])
  assert.equal(layers.size, rules.size)
  for (const [id, layer] of layers) {
    assert.ok(layer.key, `[${id}] has no layer key`)
    // "Exactly one" is structural, not a count of matches: a rule holds one tag and one
    // resolved layer, so there is no shape in which it can appear in two.
    assert.equal(typeof layer.label, 'string')
  }
})

test('kernel membership stays single-sourced — no kernel rule carries a tag', () => {
  const { rules } = parseRules(REPO)
  const { ids: kernel } = parseKernel(REPO, rules)
  assert.ok(kernel.size > 0)
  for (const id of kernel) assert.deepEqual(rules.get(id).tags, [], `[${id}] carries a tag`)
})

test("every profile's rules live in the document the registry names for it", () => {
  const { rules } = parseRules(REPO)
  const { profiles: registry, problems } = parseProfiles(REPO, TAXONOMY)
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
  const { rules } = parseRules(REPO)
  const { ids: kernel } = parseKernel(REPO, rules)
  const { profiles: registry } = parseProfiles(REPO, TAXONOMY)
  const { layers } = classifyRules({ rules, kernel, profiles: registry, taxonomy: TAXONOMY })
  assert.deepEqual(checkContractScopes(REPO, { rules, layers }), [])
})

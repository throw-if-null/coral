// ─────────────────────────────────────────────────────────────────────────────
// Tests for scripts/release.mjs: release preparation, release verification, and the
// GitHub Release notes. The last test holds this repository to its own released version.
// ─────────────────────────────────────────────────────────────────────────────
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { coralVersion } from './version.mjs'
import {
  compatibilitySummary,
  githubAnchor,
  planRelease,
  releaseNotes,
  releaseProblems,
  tagMessage,
  unwrap,
} from './release.mjs'

const REPO = path.resolve(import.meta.dirname, '..')

const json = (data) => `${JSON.stringify(data, null, 2)}\n`
const LOCK = '# lock\n\nRULE-1\treview\tA.md\n'
const UNCHANGED = { 'rules.lock': LOCK, 'rules.md': 'RULE-1 does a thing.\n' }

/** A tree that holds release 1.2.0 and a 1.3.0 batch under Unreleased. */
function fixture({ heading = '## Unreleased — 1.3.0', entries = '`[X-1]` is tightened.', extra = {} } = {}) {
  return {
    VERSION: '1.2.0\n',
    'CHANGELOG.md': [
      '# Changelog',
      '',
      heading,
      '',
      entries,
      '',
      '## 1.2.0 — 2026-01-01',
      '',
      'The earlier batch.',
      '',
    ].join('\n'),
    'package.json': json({ name: 'coral', version: '1.2.0', repository: { url: 'git+https://github.com/o/coral.git' } }),
    'package-lock.json': json({ name: 'coral', version: '1.2.0', packages: { '': { name: 'coral', version: '1.2.0' } } }),
    'examples/page.md': '# Page\n\n> Written against **Coral 1.2.0**.\n',
    'README.md': 'Load https://raw.githubusercontent.com/throw-if-null/coral/v1.2.0/guides/a.md first.\n',
    'templates/CORAL.md': `targets: "${heading.includes('—') ? heading.split('— ')[1] : '1.2.0'}"\n`,
    'rules.lock': LOCK,
    'rules.md': 'RULE-1 does a thing.\n',
    ...extra,
  }
}

function inTree(tree, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coral-release-'))
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

const apply = (dir, plan) => {
  for (const [rel, text] of plan.writes) fs.writeFileSync(path.join(dir, rel), text)
}
const read = (dir, rel) => fs.readFileSync(path.join(dir, rel), 'utf8')

test('cutting moves every version-bearing file to the new version', () =>
  inTree(fixture(), (dir) => {
    const plan = planRelease(dir, '1.3.0', '2026-02-02')
    assert.deepEqual(plan.problems, [])
    assert.equal(plan.state, 'cut')
    apply(dir, plan)
    assert.equal(read(dir, 'VERSION'), '1.3.0\n')
    assert.equal(JSON.parse(read(dir, 'package.json')).version, '1.3.0')
    const lock = JSON.parse(read(dir, 'package-lock.json'))
    assert.equal(lock.version, '1.3.0')
    assert.equal(lock.packages[''].version, '1.3.0')
    assert.match(read(dir, 'examples/page.md'), /Written against \*\*Coral 1\.3\.0\*\*/)
    assert.match(read(dir, 'README.md'), /coral\/v1\.3\.0\/guides/)
    assert.match(
      read(dir, 'CHANGELOG.md'),
      /^## Unreleased\n\n## 1\.3\.0 — 2026-02-02\n\n`\[X-1\]` is tightened\.\n\n## 1\.2\.0/m
    )
    const v = coralVersion(dir)
    assert.deepEqual([v.released, v.working, v.unreleased], ['1.3.0', '1.3.0', false])
    assert.deepEqual(releaseProblems(dir, '1.3.0'), [])
  }))

test('preparing a prepared tree changes nothing', () =>
  inTree(fixture(), (dir) => {
    apply(dir, planRelease(dir, '1.3.0', '2026-02-02'))
    const again = planRelease(dir, '1.3.0', '2026-03-03')
    assert.deepEqual(again.problems, [])
    assert.equal(again.state, 'prepared')
    assert.equal(again.writes.size, 0)
  }))

test('preparing a partly prepared tree completes it and keeps other edits', () =>
  inTree(fixture(), (dir) => {
    apply(dir, planRelease(dir, '1.3.0', '2026-02-02'))
    fs.writeFileSync(path.join(dir, 'examples/page.md'), '# Page, edited\n\n> Written against **Coral 1.2.0**.\n')
    assert.deepEqual(releaseProblems(dir, '1.3.0'), [
      'examples/page.md does not name 1.3.0. Run `npm run release:prepare -- 1.3.0` and merge the result.',
    ])
    const plan = planRelease(dir, '1.3.0', '2026-03-03')
    assert.deepEqual([...plan.writes.keys()], ['examples/page.md'])
    apply(dir, plan)
    assert.equal(read(dir, 'examples/page.md'), '# Page, edited\n\n> Written against **Coral 1.3.0**.\n')
  }))

test('a bare Unreleased heading takes the version the maintainer selects', () =>
  inTree(fixture({ heading: '## Unreleased' }), (dir) => {
    const plan = planRelease(dir, '1.3.0', '2026-02-02', { previous: UNCHANGED })
    assert.deepEqual(plan.problems, [])
    assert.equal(plan.bump, 'minor')
    apply(dir, plan)
    assert.equal(read(dir, 'templates/CORAL.md'), 'targets: "1.3.0"\n')
    assert.match(read(dir, 'CHANGELOG.md'), /^## Unreleased\n\n## 1\.3\.0 — 2026-02-02\n/m)
    assert.deepEqual(releaseProblems(dir, '1.3.0'), [])
  }))

test('a patch is accepted when the rule surface is unchanged', () =>
  inTree(fixture({ heading: '## Unreleased' }), (dir) => {
    const plan = planRelease(dir, '1.2.1', '2026-02-02', { previous: UNCHANGED })
    assert.deepEqual([plan.problems, plan.bump], [[], 'patch'])
  }))

for (const [name, overrides, version, previous, expected] of [
  ['a patch whose rule index changed', {}, '1.2.1', { ...UNCHANGED, 'rules.md': 'old\n' }, /rules\.md changed since v1\.2\.0/],
  ['a patch without the previous rule surface', {}, '1.2.1', null, /cannot be read/],
  ['a skipped version', {}, '1.4.0', UNCHANGED, /not the next patch, minor, or major/],
  [
    'a minor that adds a rule after 1.0',
    { extra: { 'rules.lock': `${LOCK}RULE-2\tauto\tA.md\n` } },
    '1.3.0',
    UNCHANGED,
    /adds, retires, or reclassifies RULE-2.*major/,
  ],
]) {
  test(`a bare heading refuses ${name}`, () =>
    inTree(fixture({ heading: '## Unreleased', ...overrides }), (dir) => {
      const plan = planRelease(dir, version, '2026-02-02', { previous })
      assert.equal(plan.writes.size, 0)
      assert.match(plan.problems.join('\n'), expected)
    }))
}

test('the compatibility summary states the bump and the rule surface change', () => {
  const text = compatibilitySummary('0.11.0', '0.12.0', 'minor', {
    comparable: true,
    changed: ['rules.lock', 'rules.md'],
    added: ['NEW-1'],
    removed: [],
  })
  assert.match(text, /0\.11\.0 → 0\.12\.0, a \*\*minor\*\* release/)
  assert.match(text, /While Coral is 0\.y\.z, a minor version carries every rule change/)
  assert.match(text, /Changed since v0\.11\.0: `rules\.lock`, `rules\.md` \(added: NEW-1\)/)
})

test('a major that adds a rule after 1.0 is accepted', () =>
  inTree(fixture({ heading: '## Unreleased', extra: { 'rules.lock': `${LOCK}RULE-2\tauto\tA.md\n` } }), (dir) => {
    const plan = planRelease(dir, '2.0.0', '2026-02-02', { previous: UNCHANGED })
    assert.deepEqual([plan.problems, plan.bump, plan.surface.added], [[], 'major', ['RULE-2']])
  }))

test('verification refuses a release commit with entries under Unreleased', () =>
  inTree(fixture(), (dir) => {
    apply(dir, planRelease(dir, '1.3.0', '2026-02-02'))
    const changelog = read(dir, 'CHANGELOG.md').replace('## Unreleased\n', '## Unreleased\n\nA later change.\n')
    fs.writeFileSync(path.join(dir, 'CHANGELOG.md'), changelog)
    assert.match(releaseProblems(dir, '1.3.0').join('\n'), /Unreleased section is not empty/)
  }))

for (const [name, overrides, version, expected] of [
  ['a version other than the one the heading names', {}, '1.4.0', /heading names 1\.3\.0, not 1\.4\.0/],
  ['a tag name', {}, 'v1.3.0', /not a three-part version/],
  ['a version below the release', {}, '1.1.0', /below the released 1\.2\.0/],
  ['an empty Unreleased section', { entries: '' }, '1.3.0', /Unreleased section is empty/],
  [
    'a version whose section already exists',
    { entries: 'x\n\n## 1.3.0 — 2026-01-15\n\ny' },
    '1.3.0',
    /already has a section for 1\.3\.0/,
  ],
  [
    'package.json in another format',
    { extra: { 'package.json': '{"name":"coral","version":"1.2.0"}\n' } },
    '1.3.0',
    /package\.json is not formatted as npm writes it/,
  ],
]) {
  test(`preparing refuses ${name} and writes nothing`, () =>
    inTree(fixture(overrides), (dir) => {
      const plan = planRelease(dir, version, '2026-02-02')
      assert.equal(plan.problems.length, 1, plan.problems.join('\n'))
      assert.match(plan.problems[0], expected)
      assert.equal(plan.writes.size, 0)
    }))
}

test('verification refuses a tree that describes a successor of the release', () =>
  inTree(fixture(), (dir) => {
    apply(dir, planRelease(dir, '1.3.0', '2026-02-02'))
    const changelog = read(dir, 'CHANGELOG.md').replace('## Unreleased\n', '## Unreleased — 1.4.0\n\nMore.\n')
    fs.writeFileSync(path.join(dir, 'CHANGELOG.md'), changelog)
    const [problem] = releaseProblems(dir, '1.3.0')
    assert.match(problem, /describe 1\.4\.0, not 1\.3\.0/)
  }))

test('verification refuses a tree that has not cut the release', () =>
  inTree(fixture(), (dir) => {
    assert.deepEqual(releaseProblems(dir, '1.3.0'), [
      'VERSION is 1.2.0, not 1.3.0. Run `npm run release:prepare -- 1.3.0` and merge the result.',
    ])
  }))

test('release notes hold the section, unwrapped, and name the source commit', () =>
  inTree(fixture({ entries: 'A rule is\ntightened.\n\n- one item\n  continued\n  - nested' }), (dir) => {
    apply(dir, planRelease(dir, '1.3.0', '2026-02-02'))
    const sha = 'a'.repeat(40)
    const notes = releaseNotes(dir, '1.3.0', { repository: 'o/coral', commit: sha })
    assert.ok(notes.startsWith('A rule is tightened.\n\n- one item continued\n  - nested\n'))
    assert.match(notes, /^## Adopting this release$/m)
    assert.ok(notes.includes(`commit [\`${sha}\`](https://github.com/o/coral/commit/${sha})`))
    assert.ok(notes.includes('(https://github.com/o/coral/blob/v1.3.0/CHANGELOG.md#130--2026-02-02)'))
    assert.ok(!notes.includes('The earlier batch.'))
  }))

test('release notes for a release PR name no commit, and the tag message is the summary', () =>
  inTree(fixture({ entries: 'The batch\nsummary.\n\nMore detail.' }), (dir) => {
    apply(dir, planRelease(dir, '1.3.0', '2026-02-02'))
    assert.ok(!releaseNotes(dir, '1.3.0', { repository: 'o/coral' }).includes('Source:'))
    assert.equal(tagMessage(dir, '1.3.0'), 'Coral 1.3.0\n\nThe batch summary.\n')
  }))

test('unwrap keeps fences, tables, and headings', () => {
  const text = '## H\ntext\n\n```js\na\nb\n```\n| a |\n| b |'
  assert.equal(unwrap(text), text)
})

test('githubAnchor matches GitHub for a release heading', () => {
  assert.equal(githubAnchor('0.11.0 — 2026-11-21'), '0110--2026-11-21')
})

test("this repository's version-bearing files agree with VERSION", () => {
  const { released } = coralVersion(REPO)
  const plan = planRelease(REPO, released, '1970-01-01')
  assert.deepEqual(plan.problems, [])
  assert.deepEqual(
    [...plan.writes.keys()],
    [],
    `these files do not name ${released}; run \`npm run release:prepare -- ${released}\``
  )
})

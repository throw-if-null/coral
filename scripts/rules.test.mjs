// ─────────────────────────────────────────────────────────────────────────────
// Tests for the kernel-table parser — `node --test scripts/`, wired into the build.
//
// The kernel table in CONVENTIONS.md is the single source of kernel membership, and
// rules.md is generated from it. That makes the parser's *rejections* the load-bearing
// part: if a malformed row can be skipped instead of failing, a rule leaves the kernel
// silently and the generated index agrees with the mistake. Proving that by breaking
// the real documents is a manual ritual nobody repeats, so the failure modes are
// asserted here against fixtures instead.
//
// The last test is the regression that matters most day to day: the parser and the
// real table still agree, and the real table still parses clean.
// ─────────────────────────────────────────────────────────────────────────────
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { KERNEL_END, KERNEL_FILE, KERNEL_START, parseKernel } from './rules.mjs'

const REPO = path.resolve(import.meta.dirname, '..')

/** A registry stand-in: the IDs a fixture is allowed to cite. */
const registry = (...ids) => new Map(ids.map((id) => [id, { page: 'ARCHITECTURE.md', cls: 'review' }]))

const HEADER = ['| Rule | Why it is kernel | Properties defended |', '|---|---|---|']

/** Write a CONVENTIONS.md holding `body` between the kernel markers, and parse it. */
function parse(body, rules) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coral-kernel-'))
  const page = ['# Conventions', '', KERNEL_START, ...body, KERNEL_END, ''].join('\n')
  fs.writeFileSync(path.join(dir, KERNEL_FILE), page)
  try {
    return parseKernel(dir, rules)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

/** Assert the problems contain exactly one entry matching `re`. */
function onlyProblem(problems, re) {
  assert.equal(problems.length, 1, `expected one problem, got:\n${problems.join('\n')}`)
  assert.match(problems[0], re)
}

test('a well-formed block yields its membership and no problems', () => {
  const { ids, problems } = parse(
    [
      '',
      ...HEADER,
      '| `[BOUND-2]` | one capability-sized unit | locality |',
      '| `[SYS-TEST-1]` | multi-segment families parse too | reviewability |',
      '',
    ],
    registry('BOUND-2', 'SYS-TEST-1')
  )
  assert.deepEqual(problems, [])
  assert.deepEqual([...ids], ['BOUND-2', 'SYS-TEST-1'])
})

test('a rule cell without backticks fails instead of dropping out of membership', () => {
  const { ids, problems } = parse(
    ['', ...HEADER, '| [MODEL-1] | no code span | deterministic placement |', ''],
    registry('MODEL-1')
  )
  onlyProblem(problems, /malformed kernel row/)
  assert.equal(ids.size, 0)
})

test('a row with the wrong column count is malformed, not a silent pass', () => {
  const { problems } = parse(
    ['', ...HEADER, '| `[MODEL-1]` | why | properties | extra |', ''],
    registry('MODEL-1')
  )
  onlyProblem(problems, /malformed kernel row/)
})

test('an empty rationale or properties cell is malformed', () => {
  const { problems } = parse(['', ...HEADER, '| `[MODEL-1]` | why |  |', ''], registry('MODEL-1'))
  onlyProblem(problems, /malformed kernel row/)
})

test('the same rule listed twice fails', () => {
  const { ids, problems } = parse(
    [
      '',
      ...HEADER,
      '| `[MODEL-1]` | first row | deterministic placement |',
      '| `[MODEL-1]` | second row | reviewability |',
      '',
    ],
    registry('MODEL-1')
  )
  onlyProblem(problems, /listed in the kernel table twice/)
  // The first row still counts; only the copy is rejected.
  assert.deepEqual([...ids], ['MODEL-1'])
})

test('an ID no rule defines fails', () => {
  const { ids, problems } = parse(
    ['', ...HEADER, '| `[MODEL-99]` | invented | locality |', ''],
    registry('MODEL-1')
  )
  onlyProblem(problems, /is not a defined rule/)
  // Membership is still reported, so the generated index cannot silently disagree.
  assert.deepEqual([...ids], ['MODEL-99'])
})

test('membership is read without a registry, and then nothing resolves', () => {
  const { ids, problems } = parse(['', ...HEADER, '| `[MODEL-99]` | invented | locality |', ''])
  assert.deepEqual(problems, [])
  assert.deepEqual([...ids], ['MODEL-99'])
})

test('a rule definition inside the block fails', () => {
  const { problems } = parse(
    [
      '',
      ...HEADER,
      '| `[MODEL-1]` | cited, as it must be | deterministic placement |',
      '',
      '- **`[BOUND-2]`** `[review]` — restated here',
      '',
    ],
    registry('MODEL-1', 'BOUND-2')
  )
  onlyProblem(problems, /written as a rule DEFINITION inside the kernel block/)
})

test('prose inside the block fails — the markers hold the table and nothing else', () => {
  const { problems } = parse(
    ['', ...HEADER, '| `[MODEL-1]` | why | properties |', '', 'Nine rules, listed above.', ''],
    registry('MODEL-1')
  )
  onlyProblem(problems, /is not a table row/)
})

test('a header row that is really a rule row fails', () => {
  const { ids, problems } = parse(
    [
      '',
      '| `[MODEL-1]` | why | properties |',
      '|---|---|---|',
      '| `[BOUND-2]` | why | properties |',
      '',
    ],
    registry('MODEL-1', 'BOUND-2')
  )
  onlyProblem(problems, /first row must be its header/)
  // The row consumed as a header does not become membership.
  assert.deepEqual([...ids], ['BOUND-2'])
})

test('a missing delimiter row fails', () => {
  const { problems } = parse(
    [
      '',
      HEADER[0],
      '| `[MODEL-1]` | why | properties |',
      '| `[BOUND-2]` | why | properties |',
      '',
    ],
    registry('MODEL-1', 'BOUND-2')
  )
  onlyProblem(problems, /expected the header delimiter row/)
})

test('a header with no rules fails', () => {
  const { ids, problems } = parse(['', ...HEADER, ''], registry('MODEL-1'))
  onlyProblem(problems, /has a header but no rules/)
  assert.equal(ids.size, 0)
})

test('an entirely empty block fails', () => {
  const { problems } = parse([''], registry('MODEL-1'))
  onlyProblem(problems, /is not a table/)
})

test('a block that is never closed fails', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coral-kernel-'))
  const page = ['# Conventions', '', KERNEL_START, ...HEADER, '| `[MODEL-1]` | why | props |', ''].join('\n')
  fs.writeFileSync(path.join(dir, KERNEL_FILE), page)
  try {
    const { ids, problems } = parseKernel(dir, registry('MODEL-1'))
    onlyProblem(problems, /never closes it/)
    assert.equal(ids.size, 0)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('a page with no kernel block at all fails', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coral-kernel-'))
  fs.writeFileSync(path.join(dir, KERNEL_FILE), '# Conventions\n\nNo kernel here.\n')
  try {
    onlyProblem(parseKernel(dir).problems, /has no <!-- coral:kernel:start --> block/)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

// Membership itself, asserted. Changing the kernel means changing this list — the same
// forcing step rules.lock gives a rule change, and the reason it is spelled out rather
// than derived from the table it is meant to be checking.
test("this repository's kernel table parses clean, with exactly the nine kernel rules", () => {
  const { ids, problems } = parseKernel(REPO)
  assert.deepEqual(problems, [])
  assert.deepEqual(
    [...ids].sort(),
    ['AGENT-2', 'AGENT-4', 'BOUND-2', 'COMPOSE-1', 'MODEL-1', 'TEST-1', 'VER-3', 'VER-5', 'XCUT-1']
  )
})

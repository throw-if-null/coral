// ─────────────────────────────────────────────────────────────────────────────
// Tests for the executable example project under examples/. `npm run check:rules`
// (`node --test scripts/*.test.mjs`) runs them as part of `docs:build`.
//
// The project directory is excluded from the rule scanner, because its Markdown is the
// project's and not documentation: its generated CORAL-CONTRACT.md is written in the
// definition-line shape, so a project extension listed there (`ACME-1`) would register as a
// classless Coral rule (Gate 1), and its README and contract are not site pages. The
// exclusion also hides the project's CORAL.md from Gate 10, which discovers
// adherence records through the scanner's file list. These tests stand in for that gate:
// the record resolves with the real resolver, and the committed contract is what the real
// generator writes today, so a rule-text change that leaves the contract stale fails the
// build instead of shipping.
//
// The page that walks through the project cites the code by URL and quotes it in fences.
// The last test holds every fence to being a verbatim excerpt of a project file, so the
// page cannot describe code the project does not contain.
// ─────────────────────────────────────────────────────────────────────────────
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import { ADHERENCE_FILE, resolveAdherence } from './applicability.mjs'
import { CONTRACT_FILE, loadExecutionContract } from './execution-contract.mjs'
import { docFiles, loadRuleModel } from './rules.mjs'

const REPO = path.resolve(import.meta.dirname, '..')
const PROJECT = 'examples/go-api-slice'
const PAGE = 'examples/go-api-slice.md'
const REGENERATE = `npm run contract:generate -- --project ${PROJECT}`

const projectDir = path.join(REPO, PROJECT)

test(`${PROJECT} is excluded from the rule scanner`, () => {
  const scanned = docFiles(REPO).filter((rel) => rel.startsWith(`${PROJECT}/`))
  assert.deepEqual(scanned, [], `the scanner lists project files: ${scanned.join(', ')}`)
})

test(`${PROJECT}/${ADHERENCE_FILE} resolves against this checkout's rule model`, () => {
  const model = loadRuleModel(REPO)
  assert.deepEqual(model.problems, [])
  const text = fs.readFileSync(path.join(projectDir, ADHERENCE_FILE), 'utf8')
  const { ok, problems } = resolveAdherence(text, model)
  assert.ok(
    ok,
    `${PROJECT}/${ADHERENCE_FILE} is not a record a project could use:\n  - ${problems.join('\n  - ')}`
  )
})

test(`${PROJECT}/${CONTRACT_FILE} is the generator's output`, () => {
  const result = loadExecutionContract(REPO, projectDir)
  assert.ok(result.ok, `no contract could be generated:\n  - ${result.problems.join('\n  - ')}`)
  const committed = fs.readFileSync(path.join(projectDir, CONTRACT_FILE), 'utf8')
  assert.equal(
    committed,
    result.markdown,
    `${PROJECT}/${CONTRACT_FILE} differs from what the generator writes today.` +
      ` Run \`${REGENERATE}\` and commit the result.`
  )
})

// A fence opened with ```go or ```sql, up to the line that closes it.
const FENCE_RE = /^```(go|sql)[^\n]*\n([\s\S]*?)\n```[ \t]*$/gm

function filesUnder(dir) {
  const out = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...filesUnder(abs))
    else out.push(abs)
  }
  return out
}

test(`every Go and SQL fence in ${PAGE} is an excerpt of a file under ${PROJECT}`, () => {
  const page = fs.readFileSync(path.join(REPO, PAGE), 'utf8')
  const fences = [...page.matchAll(FENCE_RE)].map((m) => m[2])
  assert.ok(fences.length > 0, `${PAGE} has no Go or SQL fence`)
  const sources = filesUnder(projectDir).map((abs) => fs.readFileSync(abs, 'utf8'))
  for (const fence of fences) {
    assert.ok(
      sources.some((src) => src.includes(fence)),
      `a fence in ${PAGE} is not a verbatim excerpt of any file under ${PROJECT}:\n${fence}`
    )
  }
})

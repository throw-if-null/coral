// ─────────────────────────────────────────────────────────────────────────────
// Every worked example and skill declares the Coral version it was written
// against, and this asserts that declaration still matches the version the documents
// in this tree actually describe.
//
// Why it exists: all three examples and the audit skill said "Written against
// Coral 0.4.0" while VERSION said 0.5.0, and nothing noticed. That is the exact
// failure [VER-3] describes — an audit performed against a version nobody is on —
// committed by the reference material itself, which is worse than committing it in
// a consuming project because this is what people copy.
//
// The check is deliberately blunt: the declared version must EQUAL the version
// these documents describe, not merely parse. A lagging declaration is the signal,
// so tolerating a lag would remove the only information the marker carries. Bumping
// it is therefore a claim — "I re-read this page against the current rules" — and
// that claim is the point.
//
// Which version that is, is the WORKING one, not the released one. Between releases
// the documents are not the rule set `VERSION` names: the batch under Unreleased has
// already changed them. A page declaring the last release while sitting beside rules
// that release never had is the same lie this check exists to catch, one version
// later — and it is the lie the audit skill was telling, since it requires `[VER-6]`
// and said it was written against the release before it. So the moment a batch names
// its next version in the changelog, every declaring page owes the re-read. A
// prose-only batch names none, the working version stays the released one, and
// nothing here moves.
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs'
import path from 'node:path'

import { coralVersion } from './version.mjs'

const ROOT = path.resolve(import.meta.dirname, '..')
const { released, working: VERSION, unreleased, problems: versionProblems } = coralVersion(ROOT)
if (versionProblems.length) {
  console.error(`\n[versions] ${versionProblems.length} problem(s):\n`)
  for (const p of versionProblems) console.error(`  - ${p}`)
  console.error('')
  process.exit(1)
}
const DECLARATION = /Written against \*\*Coral (\d+\.\d+\.\d+)\*\*/g

// Files that MUST carry a declaration. Discovered, not listed, so a new example is
// covered by existing rather than by somebody remembering to add it here.
function targets() {
  const out = []
  const examples = path.join(ROOT, 'examples')
  if (fs.existsSync(examples)) {
    for (const f of fs.readdirSync(examples)) if (f.endsWith('.md')) out.push(path.join('examples', f))
  }
  const skills = path.join(ROOT, '.claude', 'skills')
  if (fs.existsSync(skills)) {
    for (const d of fs.readdirSync(skills)) {
      const rel = path.join('.claude', 'skills', d, 'SKILL.md')
      if (fs.existsSync(path.join(ROOT, rel))) out.push(rel)
    }
  }
  return out.sort()
}

const problems = []
const files = targets()

for (const rel of files) {
  const text = fs.readFileSync(path.join(ROOT, rel), 'utf8')
  const found = [...text.matchAll(DECLARATION)].map((m) => m[1])
  if (found.length === 0) {
    problems.push(
      `${rel} declares no target version. Add "> Written against **Coral ${VERSION}**." near the top —` +
        ' [VER-3]: an example that does not say what it was written against cannot be audited.'
    )
    continue
  }
  if (found.length > 1) {
    problems.push(`${rel} declares ${found.length} target versions (${found.join(', ')}); there must be exactly one.`)
    continue
  }
  if (found[0] !== VERSION) {
    problems.push(
      `${rel} says it was written against Coral ${found[0]}, but VERSION is ${VERSION}. Re-read the page` +
        ` against the current rules, fix what drifted, then bump the declaration to ${VERSION}.`
    )
  }
}

if (problems.length) {
  console.error(`\n[versions] ${problems.length} problem(s):\n`)
  for (const p of problems) console.error(`  - ${p}`)
  console.error('')
  process.exit(1)
}

const state = unreleased ? ` (unreleased; ${released} is the last cut release)` : ''
console.log(`[versions] OK — ${files.length} file(s) declare Coral ${VERSION}${state}.`)

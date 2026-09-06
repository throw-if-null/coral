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
// The check is deliberately blunt: the declared version must EQUAL the RELEASED
// version, not merely parse. A lagging declaration is the signal, so tolerating a lag
// would remove the only information the marker carries. Bumping it is therefore a
// claim — "I re-read this page against the current rules" — and that claim is the
// point.
//
// Released, and not the working version the documents currently describe, because of
// what this marker is FOR. It tells a reader which Coral a page is good for, and the
// only Coral a reader can pin is one that has been cut: nobody's `CORAL.md` can target
// an unreleased version. Tying the marker to the working version would instead demand
// a re-read of every declaring page the moment a batch opens, which is friction
// charged for a claim no reader can act on yet. The declarations move when the release
// moves, which is also when the pages become newly wrong if nobody looked.
//
// That is a different question from the one `model.version` answers, and the two must
// not be confused. `model.version` identifies the rule set these documents ARE — the
// working version — and is what a `CORAL.md` is resolved against, so a `targets:` line
// in a record this repository owns names that one. See scripts/version.mjs.
//
// A page that already implements an unreleased rule is the one place this is not
// self-evident, and it says so in prose rather than by moving its marker early.
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs'
import path from 'node:path'

import { coralVersion } from './version.mjs'

const ROOT = path.resolve(import.meta.dirname, '..')
const { released: VERSION, working, unreleased, problems: versionProblems } = coralVersion(ROOT)
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

const state = unreleased ? ` (the released version; ${working} is unreleased and in progress)` : ''
console.log(`[versions] OK — ${files.length} file(s) declare Coral ${VERSION}${state}.`)

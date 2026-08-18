// ─────────────────────────────────────────────────────────────────────────────
// Every worked example and skill declares the Coral version it was written
// against, and this asserts that declaration still matches VERSION.
//
// Why it exists: all three examples and the audit skill said "Written against
// Coral 0.4.0" while VERSION said 0.5.0, and nothing noticed. That is the exact
// failure [VER-3] describes — an audit performed against a version nobody is on —
// committed by the reference material itself, which is worse than committing it in
// a consuming project because this is what people copy.
//
// The check is deliberately blunt: the declared version must EQUAL VERSION, not
// merely parse. A lagging declaration is the signal, so tolerating a lag would
// remove the only information the marker carries. Bumping it is therefore a claim —
// "I re-read this page against the current rules" — and that claim is the point.
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const VERSION = fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim()
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

console.log(`[versions] OK — ${files.length} file(s) declare Coral ${VERSION}.`)

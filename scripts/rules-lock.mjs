// Regenerate rules.lock from the docs. Run after deliberately adding, retiring, or
// reclassifying a rule — and record the same change in CHANGELOG.md, because the
// lock says *what* changed and the changelog says *why* and *which version*.
import fs from 'node:fs'
import path from 'node:path'

import { LOCK_FILE, parseLock, parseRules, serializeLock } from './rules.mjs'

const SRC = path.resolve(import.meta.dirname, '..')
const lockPath = path.join(SRC, LOCK_FILE)

const { rules, problems } = parseRules(SRC)
if (problems.length) {
  console.error('[rules-lock] refusing to write a lock from docs that do not parse cleanly:')
  for (const p of problems) console.error(`    ${p}`)
  process.exit(1)
}

const before = fs.existsSync(lockPath) ? parseLock(fs.readFileSync(lockPath, 'utf8')) : new Map()
const next = serializeLock(rules)
fs.writeFileSync(lockPath, next)

const added = [...rules.keys()].filter((id) => !before.has(id)).sort()
const removed = [...before.keys()].filter((id) => !rules.has(id)).sort()
const reclassed = [...rules.entries()]
  .filter(([id, r]) => before.has(id) && before.get(id).cls !== r.cls)
  .map(([id, r]) => `${id} ${before.get(id).cls} → ${r.cls}`)
  .sort()

console.log(`[rules-lock] wrote ${LOCK_FILE} — ${rules.size} rules.`)
if (added.length) console.log(`  added:      ${added.join(', ')}`)
if (reclassed.length) console.log(`  reclassed:  ${reclassed.join(', ')}`)
if (removed.length) {
  console.log(`  REMOVED:    ${removed.join(', ')}`)
  console.log(
    '\n  [VER-1] says rule IDs are never removed or recycled. If a rule is being\n' +
      '  withdrawn it keeps its ID and is marked retired in place, so this list should\n' +
      '  normally be empty. Undo, or make the retirement explicit in the docs.'
  )
}
if (added.length || removed.length || reclassed.length) {
  console.log('\n  Now record this in CHANGELOG.md against the version it ships in.')
}

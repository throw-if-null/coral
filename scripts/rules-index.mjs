// Regenerate rules.md — the browsable index of every published rule — from the docs.
// Run after adding, retiring, reclassifying, or rewording a rule's contract line. The
// build checks the checked-in file against a fresh render and fails on a mismatch, so
// this is never optional; it is just the step that makes the failure go away.
import fs from 'node:fs'
import path from 'node:path'

import { INDEX_FILE, parseRules, serializeIndex } from './rules.mjs'

const SRC = path.resolve(import.meta.dirname, '..')
const indexPath = path.join(SRC, INDEX_FILE)

const { rules, defsByFile, problems } = parseRules(SRC)
if (problems.length) {
  console.error('[rules-index] refusing to write an index from docs that do not parse cleanly:')
  for (const p of problems) console.error(`    ${p}`)
  process.exit(1)
}

const next = serializeIndex(SRC, rules, defsByFile)
const before = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, 'utf8') : null
fs.writeFileSync(indexPath, next)

if (before === next) {
  console.log(`[rules-index] ${INDEX_FILE} already current — ${rules.size} rules.`)
} else {
  console.log(
    `[rules-index] wrote ${INDEX_FILE} — ${rules.size} rules across ${defsByFile.size} documents.`
  )
}

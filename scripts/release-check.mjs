#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// `npm run release:check -- <version>` — verifies that this checkout is the source of
// release <version>, and optionally writes its GitHub Release notes.
//
// The release workflow runs it on the commit the tag names, before `npm ci`, so it uses
// nothing outside Node. The full checks are `npm test`, which the workflow runs separately.
// ─────────────────────────────────────────────────────────────────────────────
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { packageRepository, releaseNotes, releaseProblems } from './release.mjs'

const ROOT = path.resolve(import.meta.dirname, '..')

const USAGE = `
Verify that this checkout is the source of a Coral release.

  npm run release:check -- <version> [options]

  <version>              the release, such as 0.11.0.
  --notes <file>         also write the GitHub Release notes to <file>.
  --commit <sha>         the commit the notes name. Default: HEAD.
  --repository <o/n>     the repository the notes link to. Default: package.json's.
  --help                 this text.
`

function parseArgs(argv) {
  const opts = { version: null, notes: null, commit: null, repository: null, help: false }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const value = () => {
      const v = argv[++i]
      if (v === undefined || v.startsWith('--')) throw new Error(`${arg} needs a value.`)
      return v
    }
    switch (arg) {
      case '--notes': opts.notes = path.resolve(value()); break
      case '--commit': opts.commit = value(); break
      case '--repository': opts.repository = value(); break
      case '--help': case '-h': opts.help = true; break
      default:
        if (arg.startsWith('--') || opts.version) throw new Error(`unexpected argument \`${arg}\`.`)
        opts.version = arg
    }
  }
  if (!opts.help && !opts.version) throw new Error('name the version to check.')
  return opts
}

let opts
try {
  opts = parseArgs(process.argv.slice(2))
} catch (e) {
  console.error(`\n[release] ${e.message}${USAGE}`)
  process.exit(1)
}
if (opts.help) {
  console.log(USAGE.trim())
  process.exit(0)
}

const problems = releaseProblems(ROOT, opts.version)
if (problems.length) {
  console.error(`\n[release] this checkout is not release ${opts.version} — ${problems.length} problem(s):\n`)
  for (const p of problems) console.error(`  - ${p}`)
  console.error('')
  process.exit(1)
}
console.log(`[release] OK — every version-bearing file names ${opts.version}.`)

if (opts.notes) {
  const commit = opts.commit ?? execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim()
  if (!/^[0-9a-f]{40}$/.test(commit)) {
    console.error(`\n[release] \`${commit}\` is not a full commit SHA.\n`)
    process.exit(1)
  }
  const repository = opts.repository ?? packageRepository(ROOT)
  if (!repository) {
    console.error('\n[release] no repository: pass --repository <owner/name>.\n')
    process.exit(1)
  }
  fs.writeFileSync(opts.notes, releaseNotes(ROOT, opts.version, { repository, commit }))
  console.log(`[release] wrote the release notes to ${path.relative(process.cwd(), opts.notes) || opts.notes}.`)
}

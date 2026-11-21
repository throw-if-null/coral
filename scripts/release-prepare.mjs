#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// `npm run release:prepare -- <version>` — cuts the Unreleased batch as <version>.
//
// Writes the file changes scripts/release.mjs plans, regenerates the example project's
// contract, and runs `npm test`. It does not commit, tag, or publish: the result is a
// working-tree change that a maintainer reviews and merges, and the tag and the GitHub
// Release follow from the merged commit. README.md § "Releasing Coral" lists the steps.
// ─────────────────────────────────────────────────────────────────────────────
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { planRelease } from './release.mjs'

const ROOT = path.resolve(import.meta.dirname, '..')
const EXAMPLE_PROJECTS = ['examples/go-api-slice']

const USAGE = `
Prepare a Coral release in this checkout.

  npm run release:prepare -- <version> [options]

  <version>         the version to release, such as 0.11.0. It must be the version the
                    changelog's Unreleased heading names, or the next patch when the
                    heading names none.
  --date <date>     the release date, YYYY-MM-DD. Default: today, UTC.
  --skip-checks     do not run npm test.
  --help            this text.

A tree that is already prepared for <version> is left unchanged, and the checks run again.
`

function parseArgs(argv) {
  const opts = { version: null, date: new Date().toISOString().slice(0, 10), checks: true, help: false }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    switch (arg) {
      case '--date': {
        const v = argv[++i]
        if (v === undefined || v.startsWith('--')) throw new Error('--date needs a value.')
        opts.date = v
        break
      }
      case '--skip-checks': opts.checks = false; break
      case '--help': case '-h': opts.help = true; break
      default:
        if (arg.startsWith('--') || opts.version) throw new Error(`unexpected argument \`${arg}\`.`)
        opts.version = arg
    }
  }
  if (!opts.help && !opts.version) throw new Error('name the version to release.')
  return opts
}

function run(command, args) {
  console.log(`\n[release] ${command} ${args.join(' ')}`)
  const r = spawnSync(command, args, { cwd: ROOT, stdio: 'inherit' })
  return r.status === 0
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

const plan = planRelease(ROOT, opts.version, opts.date)
if (plan.problems.length) {
  console.error(`\n[release] ${opts.version} cannot be prepared — ${plan.problems.length} problem(s):\n`)
  for (const p of plan.problems) console.error(`  - ${p}`)
  console.error('')
  process.exit(1)
}

for (const [rel, text] of plan.writes) fs.writeFileSync(path.join(ROOT, rel), text)
if (plan.state === 'prepared' && !plan.writes.size) {
  console.log(`[release] ${opts.version} is already prepared; no file changed.`)
} else {
  console.log(`[release] ${plan.state === 'cut' ? 'cut' : 'completed'} ${opts.version}; changed:`)
  for (const rel of plan.writes.keys()) console.log(`  - ${rel}`)
}

let ok = true
for (const project of EXAMPLE_PROJECTS) {
  ok = run(process.execPath, ['scripts/generate-contract.mjs', '--project', project]) && ok
}
if (ok && opts.checks) ok = run('npm', ['test'])

if (!ok) {
  console.error(`\n[release] a check failed. Fix it, then run release:prepare ${opts.version} again.\n`)
  process.exit(1)
}

console.log(`
[release] ${opts.version} is prepared. Before you commit:
  - Read the CHANGELOG.md section for ${opts.version}. It is the GitHub Release body, so its
    first paragraph states the batch and its compatibility, and it says what a project must
    now satisfy.
  - Re-read each page whose "Written against" marker moved. The marker claims the page holds
    for ${opts.version}.
`)

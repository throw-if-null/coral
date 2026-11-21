#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// `npm run release:prepare -- <version>` — cuts the Unreleased batch as <version>.
//
// Writes the file changes scripts/release.mjs plans, regenerates the example project's
// contract, and runs `npm test`. It does not commit, tag, or publish. The prepare-release
// workflow runs it and opens the release PR; merging that PR publishes the release. Run it
// locally to reproduce or troubleshoot a preparation.
// ─────────────────────────────────────────────────────────────────────────────
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { RULE_SURFACE_FILES, TAG_PREFIX, compatibilitySummary, planRelease } from './release.mjs'
import { coralVersion } from './version.mjs'

const ROOT = path.resolve(import.meta.dirname, '..')
const EXAMPLE_PROJECTS = ['examples/go-api-slice']

const USAGE = `
Prepare a Coral release in this checkout.

  npm run release:prepare -- <version> [options]

  <version>         the version to release, such as 0.12.0. When the changelog's
                    Unreleased heading names a version, it must be that one. Otherwise
                    it is the next patch, minor, or major version.
  --date <date>     the release date, YYYY-MM-DD. Default: today, UTC.
  --summary <file>  write the version decision, for the release PR, to <file>.
  --skip-checks     do not run npm test.
  --help            this text.

A tree that is already prepared for <version> is left unchanged, and the checks run again.
`

function parseArgs(argv) {
  const opts = { version: null, date: new Date().toISOString().slice(0, 10), summary: null, checks: true, help: false }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    switch (arg) {
      case '--date': {
        const v = argv[++i]
        if (v === undefined || v.startsWith('--')) throw new Error('--date needs a value.')
        opts.date = v
        break
      }
      case '--summary': {
        const v = argv[++i]
        if (v === undefined || v.startsWith('--')) throw new Error('--summary needs a value.')
        opts.summary = path.resolve(v)
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

/** The rule surface files at the released version's tag, or null when git cannot read them. */
function previousSurface() {
  const { released } = coralVersion(ROOT)
  if (!released) return null
  try {
    return Object.fromEntries(
      RULE_SURFACE_FILES.map((rel) => [
        rel,
        execFileSync('git', ['show', `${TAG_PREFIX}${released}:${rel}`], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }),
      ])
    )
  } catch {
    return null
  }
}

const released = coralVersion(ROOT).released
const plan = planRelease(ROOT, opts.version, opts.date, { previous: previousSurface() })
if (plan.problems.length) {
  console.error(`\n[release] ${opts.version} cannot be prepared — ${plan.problems.length} problem(s):\n`)
  for (const p of plan.problems) console.error(`  - ${p}`)
  console.error('')
  process.exit(1)
}

for (const [rel, text] of plan.writes) fs.writeFileSync(path.join(ROOT, rel), text)
if (plan.state === 'cut') {
  const summary = compatibilitySummary(released, opts.version, plan.bump, plan.surface)
  console.log(`\n${summary}`)
  if (opts.summary) fs.writeFileSync(opts.summary, `${summary}\n`)
}
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
[release] ${opts.version} is prepared. Before the release PR merges:
  - Read the CHANGELOG.md section for ${opts.version}. It is the GitHub Release body, so its
    first paragraph states the batch and its compatibility, and it says what a project must
    now satisfy.
  - Re-read each page whose "Written against" marker moved. The marker claims the page holds
    for ${opts.version}.
`)

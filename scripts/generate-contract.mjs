#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// `npm run contract:generate` — the thin CLI over the execution-contract generator.
//
// Argument parsing, one file write, and an exit code. Every decision about what the
// contract contains lives in scripts/execution-contract.mjs, and every decision about
// what applies lives further up still, in the applicability resolver. A CLI that
// interpreted a declaration would be a fourth place to look for that answer.
//
// Fail-closed here means three things and all of them matter: a non-zero exit, nothing
// partial written, and NO STALE CONTRACT LEFT AT THE DESTINATION. A generator that
// reports an error while yesterday's contract sits there unchanged has told the operator
// and lied to the next agent, which loads a file that looks current. The lifecycle is
// implemented in writeExecutionContract(); this reports what it did.
// ─────────────────────────────────────────────────────────────────────────────
import path from 'node:path'
import process from 'node:process'

import {
  CONTRACT_FILE,
  loadExecutionContract,
  writeExecutionContract,
} from './execution-contract.mjs'

const CORAL_DIR = path.resolve(import.meta.dirname, '..')

const USAGE = `
Generate a project's Coral execution contract.

  npm run contract:generate -- --project <dir> [options]

  --project <dir>   the consuming project's root, holding its CORAL.md.
                    Default: the current directory.
  --out <file>      where to write. Default: <project>/${CONTRACT_FILE}
  --stdout          write to standard output instead of a file.
  --coral <dir>     the Coral documents to generate against.
                    Default: this checkout (${CORAL_DIR}).
  --help            this text.

The contract is generated from the project's CORAL.md and contains only that project's
applicable [auto] and [review] Coral rules, plus its own accepted exceptions and
extensions. It is regenerated, never edited.

Coral does not fetch the release a project targets. A CORAL.md targeting a version other
than the one this checkout describes is refused, and no contract is written.
`

function parseArgs(argv) {
  const opts = { project: process.cwd(), out: null, stdout: false, coral: CORAL_DIR, help: false }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    // A flag that takes a value consumes the next argument, and a missing value is an
    // error rather than the next flag: `--out --stdout` must not write to a file called
    // `--stdout`.
    const value = () => {
      const v = argv[++i]
      if (v === undefined || v.startsWith('--')) throw new Error(`${arg} needs a value.`)
      return v
    }
    switch (arg) {
      case '--project': opts.project = path.resolve(value()); break
      case '--out': opts.out = path.resolve(value()); break
      case '--coral': opts.coral = path.resolve(value()); break
      case '--stdout': opts.stdout = true; break
      case '--help': case '-h': opts.help = true; break
      default: throw new Error(`unknown argument \`${arg}\`.`)
    }
  }
  if (opts.stdout && opts.out) throw new Error('--stdout and --out name two destinations; pick one.')
  return opts
}

function fail(problems, removed) {
  console.error(`\n[contract] no contract was generated — ${problems.length} problem(s):\n`)
  for (const p of problems) console.error(`  - ${p}`)
  // Said out loud, because it is a change to the working tree made by a command that
  // failed. The alternative is worse: leaving a contract that describes an earlier
  // declaration and looks exactly like a current one.
  if (removed) {
    console.error(
      `\n[contract] removed the previously generated contract at` +
        ` ${path.relative(process.cwd(), removed) || removed} — it described an earlier declaration.`
    )
  }
  console.error('')
  process.exit(1)
}

let opts
try {
  opts = parseArgs(process.argv.slice(2))
} catch (e) {
  console.error(`\n[contract] ${e.message}${USAGE}`)
  process.exit(1)
}

if (opts.help) {
  console.log(USAGE.trim())
  process.exit(0)
}

if (opts.stdout) {
  const result = loadExecutionContract(opts.coral, opts.project)
  if (!result.ok) fail(result.problems)
  process.stdout.write(result.markdown)
} else {
  const result = writeExecutionContract(opts.coral, opts.project, opts.out)
  if (!result.ok) fail(result.problems, result.removed)
  const { rules, exceptions, extensions } = result.counts
  console.log(`[contract] wrote ${path.relative(process.cwd(), result.file) || result.file}`)
  console.log(
    `[contract] ${rules} Coral rule(s), ${exceptions} accepted exception(s),` +
      ` ${extensions} project extension(s).`
  )
}

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
//
// ── one checkout ─────────────────────────────────────────────────────────────
//
// THE RULE MODEL AND THE CODE THAT INTERPRETS IT COME FROM THE SAME CHECKOUT. That is
// why the Coral directory is not an option here: it is bound, below, to the parent of
// this very file, and there is deliberately no flag to point it anywhere else.
//
// A `--coral <dir>` would have looked like the obvious way to generate against another
// release, and it is precisely the thing `[VER-3]` forbids. It moves only the DOCUMENTS.
// `applicability.mjs`, `rules.mjs`, the adherence schema, the selection algebra and this
// generator all still come from whatever checkout is executing — so a 0.8.0 tree pointed
// at 0.7.0 documents builds a model that truthfully calls itself 0.7.0, passes the
// target-version check against a `CORAL.md` targeting 0.7.0, and then resolves that
// record under 0.8.0's applicability semantics. Every version gate in the system is
// satisfied and the answer is still from the wrong release.
//
// CONVENTIONS.md already says what to do instead, and says it about semantics rather than
// files: load the applicability semantics of the version the record targets. Concretely —
// check out that Coral, and run ITS `npm run contract:generate`. Fetching it is separate
// work and is not solved here.
//
// The parameter survives one level down, in writeExecutionContract(), because the
// synthetic tests build fixture trees with a vocabulary that is not Coral's. What is not
// offered is "today's implementation against another checkout's documents" as a supported
// operation.
// ─────────────────────────────────────────────────────────────────────────────
import path from 'node:path'
import process from 'node:process'

import {
  CONTRACT_FILE,
  loadExecutionContract,
  writeExecutionContract,
} from './execution-contract.mjs'

/**
 * The Coral checkout this command generates against: the one it is running from.
 *
 * Bound, not configured. See the header — a flag that moved the documents without moving
 * the semantics is a version-first violation wearing a convenience.
 */
const CORAL_DIR = path.resolve(import.meta.dirname, '..')

const USAGE = `
Generate a project's Coral execution contract.

  npm run contract:generate -- --project <dir> [options]

  --project <dir>   the consuming project's root, holding its CORAL.md.
                    Default: the current directory.
  --out <file>      where to write. Default: <project>/${CONTRACT_FILE}
  --stdout          write to standard output instead of a file.
  --help            this text.

The contract is generated from the project's CORAL.md and contains only that project's
applicable [auto] and [review] Coral rules, plus its own accepted exceptions and
extensions. It is regenerated, never edited. An existing file at the destination is
replaced only if this generator wrote it.

The Coral rule model comes from THIS checkout:

  ${CORAL_DIR}

and there is no option to point it elsewhere. Moving the documents without moving the
code that interprets them would resolve a record under one release's applicability
semantics while calling it another's. To generate for a different Coral version, check
out that version and run its own contract:generate. Coral does not fetch it for you: a
CORAL.md targeting a version other than the one this checkout describes is refused, and
no contract is written.
`

function parseArgs(argv) {
  const opts = { project: process.cwd(), out: null, stdout: false, help: false }
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
  const result = loadExecutionContract(CORAL_DIR, opts.project)
  if (!result.ok) fail(result.problems)
  process.stdout.write(result.markdown)
} else {
  const result = writeExecutionContract(CORAL_DIR, opts.project, opts.out)
  if (!result.ok) fail(result.problems, result.removed)
  const { rules, exceptions, extensions } = result.counts
  console.log(`[contract] wrote ${path.relative(process.cwd(), result.file) || result.file}`)
  console.log(
    `[contract] ${rules} Coral rule(s), ${exceptions} accepted exception(s),` +
      ` ${extensions} project extension(s).`
  )
}

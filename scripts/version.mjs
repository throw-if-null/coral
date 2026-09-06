// ─────────────────────────────────────────────────────────────────────────────
// Which Coral the documents in this tree currently describe.
//
// Two versions, and conflating them is a real error rather than a pedantic one.
//
//   · the RELEASED version is what `VERSION` holds. It moves when a batch is cut,
//     not when a commit lands — `[VER-2]` says so, and that is the whole reason
//     the changelog has an Unreleased section.
//   · the WORKING version is what the documents in the tree would ship as. Between
//     releases those are not the same rule set, and saying they are is how a rule
//     that does not exist in 0.6.0 gets presented to a project as a 0.6.0 rule.
//
// That is not hypothetical. `[VER-6]` is unreleased: a project targeting 0.6.0 is
// targeting a Coral in which it does not exist, and its `CORAL.md` legitimately has
// no adoption declaration. An applicability resolver that identified this tree as
// "0.6.0" would report that record as violating a rule its target predates —
// `[VER-6]` applied retroactively, which is exactly what `[VER-3]` forbids.
//
// So the model carries an identity, and the identity is the working version.
//
// Where the working version comes from: the Unreleased heading names it, next to
// the compatibility statement that already decides the bump level. One place, and
// the place where the decision is already made. `## Unreleased — 0.7.0` says the
// documents in this tree are the 0.7.0 rule set. A bare `## Unreleased` says the
// batch changes no rule and the tree still describes the released version — the
// same claim as a `[VER-2]` patch, written where patch-level is decided.
//
// Both are STATEMENTS, and the difference between them and a missing statement is the
// whole of this file's fail-closed posture. A bare heading is an assertion someone made;
// no heading, or no changelog at all, is an absence — and reading an absence as
// "working == released" recreates the exact bug this identity exists to prevent, one
// deleted file later: the tree still holds unreleased rules, but now claims to be the
// release before them, and a record targeting that release resolves against rules that
// were never in it. So both are refused, and the model does not come back `classified`.
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs'
import path from 'node:path'

export const VERSION_FILE = 'VERSION'
export const CHANGELOG_FILE = 'CHANGELOG.md'

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/
// `## Unreleased`, optionally naming the version the tree would ship as. The em dash
// matches the released headings' own form (`## 0.6.0 — 2026-08-18`), so the section
// headings stay one shape.
const UNRELEASED_RE = /^## Unreleased(?:[ \t]+—[ \t]+(\d+\.\d+\.\d+))?[ \t]*$/gm

/** -1, 0 or 1 — numeric comparison, not string. `0.10.0` is above `0.9.0`. */
export function compareVersions(a, b) {
  const [, ...x] = SEMVER_RE.exec(a)
  const [, ...y] = SEMVER_RE.exec(b)
  for (let i = 0; i < 3; i++) {
    if (Number(x[i]) !== Number(y[i])) return Number(x[i]) < Number(y[i]) ? -1 : 1
  }
  return 0
}

/**
 * The released and working versions of a documentation tree.
 *
 * `working` is what every version-identity check compares against, because it is what
 * the tree actually describes. It equals `released` unless the Unreleased heading names
 * a successor.
 *
 * @param {string} srcDir
 * @returns {{released: string|null, working: string|null, unreleased: boolean,
 *            problems: string[]}}
 */
export function coralVersion(srcDir) {
  const problems = []
  const abs = path.join(srcDir, VERSION_FILE)
  if (!fs.existsSync(abs)) {
    problems.push(
      `${VERSION_FILE} is missing — it is what says which Coral this tree is. Nothing that` +
        ' resolves a project\'s target can run without it.'
    )
    return { released: null, working: null, unreleased: false, problems }
  }
  const released = fs.readFileSync(abs, 'utf8').trim()
  if (!SEMVER_RE.test(released)) {
    problems.push(`${VERSION_FILE} holds \`${released}\`, which is not a three-part version.`)
    return { released: null, working: null, unreleased: false, problems }
  }

  const changelog = path.join(srcDir, CHANGELOG_FILE)
  if (!fs.existsSync(changelog)) {
    problems.push(
      `${CHANGELOG_FILE} is missing, so nothing says whether this tree still describes the` +
        ` released ${released} or a successor to it. That is not a reason to assume the former:` +
        ' a tree holding unreleased rules while claiming the release before them is how a project' +
        ' gets audited against rules its target predates.'
    )
    return { released, working: null, unreleased: false, problems }
  }
  const headings = [...fs.readFileSync(changelog, 'utf8').matchAll(UNRELEASED_RE)]
  if (headings.length > 1) {
    problems.push(
      `${CHANGELOG_FILE} has ${headings.length} Unreleased headings. There is one, and it is what` +
        ' names the version this tree would ship as; two would leave the identity ambiguous.'
    )
    return { released, working: null, unreleased: false, problems }
  }
  if (!headings.length) {
    problems.push(
      `${CHANGELOG_FILE} has no \`## Unreleased\` heading, so this tree does not say which rule set` +
        ` it is. Write a bare \`## Unreleased\` to assert it is still ${released}, or` +
        ' `## Unreleased — x.y.z` to name the successor it would ship as. An absent heading is a' +
        ' missing statement, not a claim that nothing has changed.'
    )
    return { released, working: null, unreleased: false, problems }
  }
  // A BARE heading, on the other hand, is a statement: the batch changes no rule and the tree
  // still describes the release. That is the same claim a `[VER-2]` patch makes, made where
  // patch-level is decided.
  const named = headings[0][1]
  if (!named) return { released, working: released, unreleased: false, problems }

  if (compareVersions(named, released) <= 0) {
    problems.push(
      `${CHANGELOG_FILE}'s Unreleased heading names ${named}, which is not above the released` +
        ` ${released}. The next release is a later version than the last one.`
    )
    return { released, working: null, unreleased: false, problems }
  }
  return { released, working: named, unreleased: true, problems }
}

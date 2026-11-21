// ─────────────────────────────────────────────────────────────────────────────
// Which Coral the documents in this tree currently describe.
//
// Two versions, and conflating them is a real error rather than a pedantic one.
//
//   · the RELEASED version is what `VERSION` holds: the latest cut. It moves when a
//     batch is cut, not when a commit lands — `[VER-2]` says so, and that is the whole
//     reason the changelog has an Unreleased section.
//   · the WORKING version identifies the rule set the documents in the tree describe.
//     When the tree holds changes that no release records, the two are not the same
//     rule set, and saying they are is how a rule that does not exist in 0.6.0 gets
//     presented to a project as a 0.6.0 rule.
//
// `[VER-6]` is an instance. It does not exist in 0.6.0, so the `CORAL.md` of a project
// targeting 0.6.0 legitimately has no adoption declaration. An applicability resolver
// that identified a tree holding `[VER-6]` as "0.6.0" would report that record as
// violating a rule its target predates — `[VER-6]` applied retroactively, which is
// exactly what `[VER-3]` forbids.
//
// So the model carries an identity, and the identity is the working version.
//
// Where the working version comes from, in the changelog's Unreleased section:
//
//   · `## Unreleased — 0.12.0` names it: the tree is the 0.12.0 rule set.
//   · a bare `## Unreleased` over entries: the tree holds changes that no release
//     records, and the version they ship as is decided when the batch is cut. The
//     working version is `0.11.0+unreleased`, a development identity that no release
//     carries. A record or contract that names it cannot be read as the published 0.11.0.
//   · a bare `## Unreleased` with nothing under it: the tree is the cut release itself,
//     and the working version is `VERSION`. This is the state of a release commit.
//
// The entries decide, not a comparison with the previous release's files: the
// changelog records every change to the rule set, and a full-text tightening leaves the
// generated rule index unchanged.
//
// No heading, or no changelog at all, is an absence. Reading it as "working == released"
// recreates the bug this identity exists to prevent: the tree still holds unreleased
// rules, but claims to be the release before them, and a record targeting that release
// resolves against rules that were never in it. So it is refused, and the model does not
// come back `classified`.
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs'
import path from 'node:path'

export const VERSION_FILE = 'VERSION'
export const CHANGELOG_FILE = 'CHANGELOG.md'

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/

/** The suffix of a development identity: `VERSION` followed by changes no release records. */
export const DEVELOPMENT_SUFFIX = '+unreleased'
/** A version identity: a release version, or a development identity. */
export const IDENTITY_RE = /^\d+\.\d+\.\d+(?:\+unreleased)?$/

/** The "written against" marker of a worked example or a skill. scripts/check-versions.mjs states its contract. */
export const DECLARATION = /Written against \*\*Coral (\d+\.\d+\.\d+)\*\*/g

/**
 * Files that MUST carry a declaration, relative to `srcDir`. Discovered, not listed, so a new
 * example is covered by existing rather than by somebody remembering to add it.
 *
 * @param {string} srcDir
 * @returns {string[]}
 */
export function declarationFiles(srcDir) {
  const out = []
  const examples = path.join(srcDir, 'examples')
  if (fs.existsSync(examples)) {
    for (const f of fs.readdirSync(examples)) if (f.endsWith('.md')) out.push(path.join('examples', f))
  }
  const skills = path.join(srcDir, '.claude', 'skills')
  if (fs.existsSync(skills)) {
    for (const d of fs.readdirSync(skills)) {
      const rel = path.join('.claude', 'skills', d, 'SKILL.md')
      if (fs.existsSync(path.join(srcDir, rel))) out.push(rel)
    }
  }
  return out.sort()
}
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
 * the tree actually describes. It is the version the Unreleased heading names; else a
 * development identity, `<released>+unreleased`, when entries sit under a bare heading;
 * else `released`. `named` is the heading's version, or null.
 *
 * @param {string} srcDir
 * @returns {{released: string|null, working: string|null, named: string|null,
 *            unreleased: boolean, problems: string[]}}
 */
export function coralVersion(srcDir) {
  const problems = []
  const abs = path.join(srcDir, VERSION_FILE)
  if (!fs.existsSync(abs)) {
    problems.push(
      `${VERSION_FILE} is missing — it is what says which Coral this tree is. Nothing that` +
        ' resolves a project\'s target can run without it.'
    )
    return { released: null, working: null, named: null, unreleased: false, problems }
  }
  const released = fs.readFileSync(abs, 'utf8').trim()
  if (!SEMVER_RE.test(released)) {
    problems.push(`${VERSION_FILE} holds \`${released}\`, which is not a three-part version.`)
    return { released: null, working: null, named: null, unreleased: false, problems }
  }

  const changelog = path.join(srcDir, CHANGELOG_FILE)
  if (!fs.existsSync(changelog)) {
    problems.push(
      `${CHANGELOG_FILE} is missing, so nothing says whether this tree still describes the` +
        ` released ${released} or a successor to it. That is not a reason to assume the former:` +
        ' a tree holding unreleased rules while claiming the release before them is how a project' +
        ' gets audited against rules its target predates.'
    )
    return { released, working: null, named: null, unreleased: false, problems }
  }
  const text = fs.readFileSync(changelog, 'utf8')
  const headings = [...text.matchAll(UNRELEASED_RE)]
  if (headings.length > 1) {
    problems.push(
      `${CHANGELOG_FILE} has ${headings.length} Unreleased headings. There is one, and it is what` +
        ' names the version this tree would ship as; two would leave the identity ambiguous.'
    )
    return { released, working: null, named: null, unreleased: false, problems }
  }
  if (!headings.length) {
    problems.push(
      `${CHANGELOG_FILE} has no \`## Unreleased\` heading, so this tree does not say which rule set` +
        ` it is. Write \`## Unreleased\` above the changes since ${released}, or` +
        ' `## Unreleased — x.y.z` to name the successor it would ship as. An absent heading is a' +
        ' missing statement, not a claim that nothing has changed.'
    )
    return { released, working: null, named: null, unreleased: false, problems }
  }
  const named = headings[0][1]
  if (!named) {
    const start = headings[0].index + headings[0][0].length
    const next = text.slice(start).search(/^## /m)
    const entries = (next < 0 ? text.slice(start) : text.slice(start, start + next)).trim()
    if (!entries) return { released, working: released, named: null, unreleased: false, problems }
    return { released, working: `${released}${DEVELOPMENT_SUFFIX}`, named: null, unreleased: true, problems }
  }

  if (compareVersions(named, released) <= 0) {
    problems.push(
      `${CHANGELOG_FILE}'s Unreleased heading names ${named}, which is not above the released` +
        ` ${released}. The next release is a later version than the last one.`
    )
    return { released, working: null, named: null, unreleased: false, problems }
  }
  return { released, working: named, named, unreleased: true, problems }
}

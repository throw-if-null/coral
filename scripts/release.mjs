// ─────────────────────────────────────────────────────────────────────────────
// Release preparation, release verification, and release notes.
//
// A release is a cut batch (`[VER-2]`): `VERSION` moves, the changelog's Unreleased
// entries become the released version's section, and every file that names the released
// version names the new one. scripts/release-prepare.mjs writes that change for the release
// PR, and scripts/release-check.mjs and scripts/release-gh.mjs verify it on the merged commit.
//
// Preparation is computed, not applied step by step. planRelease() reads the tree and
// returns the full content of every file that must change, or problems and no writes. A
// prepared tree plans zero writes, so a rerun changes nothing, and verification is the
// same computation: a commit is a consistent release of X when preparing X again would
// change no file.
//
// Every edit replaces a version string or a heading in place. Other content in the same
// files, including uncommitted edits, is kept.
//
// No dependency outside Node: the release workflows verify the tree and build the notes
// without `npm ci`.
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs'
import path from 'node:path'

import {
  CHANGELOG_FILE,
  DECLARATION,
  VERSION_FILE,
  compareVersions,
  coralVersion,
  declarationFiles,
} from './version.mjs'

export const TAG_PREFIX = 'v'

const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const UNRELEASED_LINE = /^## Unreleased(?:[ \t]+—[ \t]+\d+\.\d+\.\d+)?[ \t]*$/m

const PACKAGE_FILE = 'package.json'
const LOCK_FILE = 'package-lock.json'

// The adherence records this repository resolves. Each targets the working version, so a
// cut that changes the working version moves them.
export const RECORD_FILES = ['CONVENTIONS.md', 'templates/CORAL.md', 'examples/go-api-slice/CORAL.md']

// The generated rule surface. `rules.lock` changes when a rule is added, retired, or
// reclassified, and `rules.md` when a rule's contract line changes. A batch that changes
// either changes a rule, so it is not a patch under `[VER-2]`. A batch that changes neither
// may still change a rule's full text, which no file decides: the version the maintainer
// selects states that decision, and the release PR shows it for review.
export const RULE_SURFACE_FILES = ['rules.lock', 'rules.md']

// The agent-instructions snippet and the example project's copy of it load Coral's
// protocols from a release tag. scripts/agent-instructions.test.mjs holds the two copies
// equal; this keeps the tag on the released version.
export const PROTOCOL_FILES = ['README.md', 'examples/go-api-slice/AGENTS.md']
export const PROTOCOL_URL = /raw\.githubusercontent\.com\/throw-if-null\/coral\/v(\d+\.\d+\.\d+)\//g

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** `## X — YYYY-MM-DD`, the heading of a released version's changelog section. */
function releasedHeading(version) {
  return new RegExp(`^## ${escape(version)} — (\\d{4}-\\d{2}-\\d{2})[ \\t]*$`, 'gm')
}

/** The text between a heading match and the next `## ` heading. */
function sectionAfter(text, match) {
  const start = match.index + match[0].length
  const next = text.slice(start).search(/^## /m)
  return next < 0 ? text.slice(start) : text.slice(start, start + next)
}

/**
 * A released version's changelog section, or null when the changelog has none.
 *
 * @param {string} changelog
 * @param {string} version
 * @returns {{date: string, body: string, count: number}|null}
 */
export function changelogSection(changelog, version) {
  const matches = [...changelog.matchAll(releasedHeading(version))]
  if (!matches.length) return null
  return { date: matches[0][1], body: sectionAfter(changelog, matches[0]).trim(), count: matches.length }
}

/** `patch`, `minor`, or `major` when `to` is that direct successor of `from`, else null. */
export function bumpKind(from, to) {
  const [a, b, c] = from.split('.').map(Number)
  const [x, y, z] = to.split('.').map(Number)
  if (x === a && y === b && z === c + 1) return 'patch'
  if (x === a && y === b + 1 && z === 0) return 'minor'
  if (x === a + 1 && y === 0 && z === 0) return 'major'
  return null
}

const lockEntries = (text) =>
  new Map(
    text
      .split('\n')
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const [id, cls] = line.split('\t')
        return [id, cls]
      })
  )

/**
 * How the rule surface of `root` differs from `previous`, the same files at the last release.
 * `previous` is null when they cannot be read, and the result is then not `comparable`.
 *
 * @param {string} root
 * @param {Record<string, string>|null} previous file name to content
 * @returns {{comparable: boolean, changed: string[], added: string[], removed: string[]}}
 */
export function ruleSurfaceChanges(root, previous) {
  if (!previous) return { comparable: false, changed: [], added: [], removed: [] }
  const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8')
  const changed = RULE_SURFACE_FILES.filter((rel) => previous[rel] !== read(rel))
  const before = lockEntries(previous['rules.lock'] ?? '')
  const after = lockEntries(read('rules.lock'))
  const added = [...after.keys()].filter((id) => !before.has(id))
  const removed = [...before.keys()].filter((id) => after.get(id) !== before.get(id))
  return { comparable: true, changed, added, removed }
}

const BUMP_MEANING = {
  patch: 'It states that no rule changed: the batch changes prose only.',
  minor: 'It states that rules are loosened or clarified, or that an appendix or a `[guide]` rule is added. No rule is added, tightened, or retired.',
  major: 'It states that rules are added, tightened, or retired, so code that conformed can stop conforming.',
  zeroMinor: 'While Coral is 0.y.z, a minor version carries every rule change: added, tightened, retired, loosened, or clarified.',
}

/**
 * The version decision of a cut, as Markdown for the release PR: the bump, what it states
 * under `[VER-2]`, and how the rule surface changed since the previous release.
 */
export function compatibilitySummary(from, to, bump, surface) {
  const zero = from.startsWith('0.')
  const meaning = zero && bump === 'minor' ? BUMP_MEANING.zeroMinor : BUMP_MEANING[bump]
  const tag = `${TAG_PREFIX}${from}`
  let rules
  if (!surface?.comparable) rules = `The rule surface at ${tag} could not be read, so it was not compared.`
  else if (!surface.changed.length) rules = `\`rules.lock\` and \`rules.md\` are unchanged since ${tag}.`
  else {
    const ids = [
      surface.added.length && `added: ${surface.added.join(', ')}`,
      surface.removed.length && `retired or reclassified: ${surface.removed.join(', ')}`,
    ].filter(Boolean)
    rules = `Changed since ${tag}: ${surface.changed.map((f) => `\`${f}\``).join(', ')}${ids.length ? ` (${ids.join('; ')})` : ''}.`
  }
  return [`**Version:** ${from} → ${to}, a **${bump}** release under \`[VER-2]\`. ${meaning}`, '', `**Rule surface:** ${rules}`].join('\n')
}

/** Rewrites JSON only when the file already has `JSON.stringify(_, null, 2)` formatting, as npm writes it. */
function setJsonVersions(rel, text, version, problems) {
  const data = JSON.parse(text)
  if (`${JSON.stringify(data, null, 2)}\n` !== text) {
    problems.push(`${rel} is not formatted as npm writes it, so it is not rewritten. Run \`npm install\`, then retry.`)
    return text
  }
  data.version = version
  if (data.packages?.['']) data.packages[''].version = version
  return `${JSON.stringify(data, null, 2)}\n`
}

/**
 * Computes the change that releases `version`.
 *
 * `state` is `cut` when the tree still holds the batch under Unreleased, and `prepared` when
 * `VERSION` already names `version`. Either way, `writes` holds the new content of each file
 * that differs from it, and is empty when there are problems.
 *
 * A cut accepts the version the Unreleased heading names, or, under a bare heading, the
 * direct successor of the released version that the maintainer selects. `bump` and
 * `surface` describe that decision for the release PR.
 *
 * @param {string} root
 * @param {string} version
 * @param {string} date the release date, YYYY-MM-DD; used only when cutting
 * @param {{previous?: Record<string, string>|null}} [options] the rule surface files at the
 *   released version's tag; see ruleSurfaceChanges()
 * @returns {{state: 'cut'|'prepared'|null, writes: Map<string, string>, problems: string[],
 *            bump?: string, surface?: object}}
 */
export function planRelease(root, version, date, { previous = null } = {}) {
  const problems = []
  const writes = new Map()
  const none = (state = null) => ({ state, writes: new Map(), problems })
  let bump
  let surface

  if (!SEMVER_RE.test(version)) {
    problems.push(`\`${version}\` is not a three-part version such as 0.11.0. Name it without the \`${TAG_PREFIX}\` prefix.`)
    return none()
  }
  if (!DATE_RE.test(date)) {
    problems.push(`\`${date}\` is not a date of the form YYYY-MM-DD.`)
    return none()
  }

  const v = coralVersion(root)
  if (v.problems.length) return { ...none(), problems: v.problems }

  const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8')
  const changelog = read(CHANGELOG_FILE)
  const section = changelogSection(changelog, version)
  if (section?.count > 1) {
    problems.push(`${CHANGELOG_FILE} has ${section.count} sections for ${version}. A version has one.`)
    return none()
  }

  let state
  let nextChangelog = changelog
  if (v.released === version) {
    state = 'prepared'
    if (!section) {
      problems.push(
        `${VERSION_FILE} is ${version}, but ${CHANGELOG_FILE} has no \`## ${version} — <date>\` section.` +
          ' A release without its entries tells a consuming project nothing.'
      )
      return none()
    }
  } else if (compareVersions(version, v.released) < 0) {
    problems.push(`${version} is below the released ${v.released}. A release is a later version than the last one.`)
    return none()
  } else {
    state = 'cut'
    if (section) {
      problems.push(
        `${CHANGELOG_FILE} already has a section for ${version}, but ${VERSION_FILE} is still ${v.released}.` +
          ' Remove the section or set VERSION by hand. Cutting again would duplicate it.'
      )
      return none()
    }
    if (v.unreleased && v.working !== version) {
      problems.push(
        `${CHANGELOG_FILE}'s Unreleased heading names ${v.working}, not ${version}. The heading names the` +
          ' version the batch ships as, so prepare that version or correct the heading.'
      )
      return none()
    }
    bump = bumpKind(v.released, version)
    if (!bump) {
      problems.push(`${version} is not the next patch, minor, or major version after the released ${v.released}.`)
      return none()
    }
    surface = ruleSurfaceChanges(root, previous)
    const tag = `${TAG_PREFIX}${v.released}`
    if (bump === 'patch' && !surface.comparable) {
      problems.push(
        `${version} is a patch, which states that no rule changed, but the rule surface at ${tag} cannot be` +
          ' read to check it. Fetch the tags, or select a minor version.'
      )
      return none()
    }
    if (bump === 'patch' && surface.changed.length) {
      problems.push(
        `${version} is a patch, which states that no rule changed, but ${surface.changed.join(' and ')}` +
          ` changed since ${tag}. A rule change is at least a minor version under \`[VER-2]\`.`
      )
      return none()
    }
    const ids = [...surface.added, ...surface.removed]
    if (Number(v.released.split('.')[0]) >= 1 && ids.length && bump !== 'major') {
      problems.push(
        `${version} is a ${bump}, but rules.lock adds, retires, or reclassifies ${ids.join(', ')} since ${tag}.` +
          ' That is a major version under `[VER-2]`.'
      )
      return none()
    }
    const heading = UNRELEASED_LINE.exec(changelog)
    const entries = sectionAfter(changelog, heading).trim()
    if (!entries) {
      problems.push(`${CHANGELOG_FILE}'s Unreleased section is empty. A release records what changed.`)
      return none()
    }
    nextChangelog =
      changelog.slice(0, heading.index) +
      `## Unreleased\n\n## ${version} — ${date}` +
      changelog.slice(heading.index + heading[0].length)
  }

  const desired = new Map([
    [VERSION_FILE, `${version}\n`],
    [CHANGELOG_FILE, nextChangelog],
  ])
  for (const rel of [PACKAGE_FILE, LOCK_FILE]) {
    if (fs.existsSync(path.join(root, rel))) desired.set(rel, setJsonVersions(rel, read(rel), version, problems))
  }
  for (const rel of declarationFiles(root)) {
    desired.set(rel, read(rel).replace(DECLARATION, (m, old) => m.replace(old, version)))
  }
  for (const rel of PROTOCOL_FILES) {
    if (fs.existsSync(path.join(root, rel))) {
      desired.set(rel, read(rel).replace(PROTOCOL_URL, (m, old) => m.replace(`v${old}/`, `v${version}/`)))
    }
  }
  if (v.working !== version) {
    const target = `targets: "${v.working}"`
    for (const rel of RECORD_FILES) {
      if (fs.existsSync(path.join(root, rel))) {
        desired.set(rel, (desired.get(rel) ?? read(rel)).replaceAll(target, `targets: "${version}"`))
      }
    }
  }
  if (problems.length) return none(state)

  for (const [rel, text] of desired) if (read(rel) !== text) writes.set(rel, text)
  return { state, writes, problems, bump, surface }
}

/**
 * Problems that keep the tree at `root` from being the source of release `version`. Empty
 * means every version-bearing file names `version`, the changelog has its section, and the
 * documents describe that release rather than a successor.
 *
 * @param {string} root
 * @param {string} version
 * @returns {string[]}
 */
export function releaseProblems(root, version) {
  const v = coralVersion(root)
  if (v.problems.length) return v.problems
  const prepare = `Run \`npm run release:prepare -- ${version}\` and merge the result.`
  if (v.released !== version) return [`${VERSION_FILE} is ${v.released}, not ${version}. ${prepare}`]
  const plan = planRelease(root, version, '1970-01-01')
  if (plan.problems.length) return plan.problems
  const problems = [...plan.writes.keys()].map((rel) => `${rel} does not name ${version}. ${prepare}`)
  if (v.unreleased) {
    problems.push(
      `${CHANGELOG_FILE}'s Unreleased heading names ${v.working}, so these documents describe ${v.working},` +
        ` not ${version}. Release ${version} from the commit that cut it.`
    )
  }
  // A release commit records every change in its own section. An entry under Unreleased is a
  // change that reached the release PR after it was prepared, typically by updating its
  // branch from main, and no release section describes it.
  const changelog = fs.readFileSync(path.join(root, CHANGELOG_FILE), 'utf8')
  const heading = UNRELEASED_LINE.exec(changelog)
  if (heading && sectionAfter(changelog, heading).trim()) {
    problems.push(
      `${CHANGELOG_FILE}'s Unreleased section is not empty, so this tree holds changes that the ${version}` +
        ' section does not record. Close the release PR, and prepare the release again from main.'
    )
  }
  return problems
}

/** GitHub's heading anchor: lowercase, punctuation other than `-` removed, spaces to `-`. */
export function githubAnchor(heading) {
  return heading
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/ /g, '-')
}

/**
 * Joins hard-wrapped lines. The changelog wraps prose at a fixed width, and a GitHub release
 * body renders each line break.
 */
export function unwrap(markdown) {
  const out = []
  let fence = false
  for (const line of markdown.split('\n')) {
    if (/^\s*```/.test(line)) fence = !fence
    const prev = out.length ? out[out.length - 1] : ''
    const startsBlock = fence || /^\s*```/.test(line) || /^\s*([-*+]|\d+\.)\s|^\s*[#>|]/.test(line) || line.trim() === ''
    const prevJoinable = prev.trim() !== '' && !/^\s*```/.test(prev) && !/^\s*[#|]/.test(prev)
    if (!startsBlock && prevJoinable && !fence) out[out.length - 1] = `${prev} ${line.trim()}`
    else out.push(line)
  }
  return out.join('\n')
}

/**
 * The GitHub Release body for `version`: its changelog section, how a project adopts the
 * release, and, when `commit` is given, the source commit.
 *
 * @param {string} root
 * @param {string} version
 * @param {{repository: string, commit?: string}} source `owner/name` and the tagged commit
 * @returns {string}
 */
export function releaseNotes(root, version, { repository, commit }) {
  const section = requireSection(root, version)
  const tag = `${TAG_PREFIX}${version}`
  const base = `https://github.com/${repository}`
  const anchor = githubAnchor(`${version} — ${section.date}`)
  return [
    unwrap(section.body),
    '',
    '## Adopting this release',
    '',
    `Set \`targets: "${version}"\` in the project's \`CORAL.md\`. Generate \`CORAL-CONTRACT.md\` with the` +
      ` generator from tag \`${tag}\`, commit it, and load the agent protocols from the same tag.` +
      ` [README § Start a project](${base}/blob/${tag}/README.md#start-a-project) lists the steps.`,
    '',
    ...(commit ? [`- Source: tag \`${tag}\`, commit [\`${commit}\`](${base}/commit/${commit}).`] : []),
    `- Full entry: [CHANGELOG.md § ${version}](${base}/blob/${tag}/CHANGELOG.md#${anchor}).`,
    '',
  ].join('\n')
}

/** The annotated tag's message: the version, then the section's first paragraph. */
export function tagMessage(root, version) {
  const [summary] = unwrap(requireSection(root, version).body).split(/\n\s*\n/)
  return `Coral ${version}\n\n${summary}\n`
}

function requireSection(root, version) {
  const section = changelogSection(fs.readFileSync(path.join(root, CHANGELOG_FILE), 'utf8'), version)
  if (!section) throw new Error(`${CHANGELOG_FILE} has no section for ${version}.`)
  return section
}

/** `owner/name` from package.json's repository URL. */
export function packageRepository(root) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, PACKAGE_FILE), 'utf8'))
  const m = /github\.com[/:]([^/]+\/[^/.]+)(?:\.git)?$/.exec(pkg.repository?.url ?? '')
  return m ? m[1] : null
}

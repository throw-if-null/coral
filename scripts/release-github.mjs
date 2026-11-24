// ─────────────────────────────────────────────────────────────────────────────
// The GitHub side of a release: which merged pull request is a release, and how its tag
// and GitHub Release are created.
//
// Every function takes `api(method, path, body)`, which returns the parsed response and
// throws an error with `status` on a non-2xx response. scripts/release-gh.mjs passes one
// over fetch, and the tests pass an in-memory repository.
//
// A release is a merged pull request into the default branch, from the branch
// `release/<version>` of this repository, whose merge commit is a consistent release of that
// version (scripts/release.mjs). An ordinary merge is never published, whatever its
// `VERSION` says. Merging the pull request is the approval: the tag names its merge commit,
// never the branch tip at the time the workflow runs.
//
// The merge commit must have the tree of the pull request's head, which is the revision the
// maintainer reviewed and CI tested. A pull request merged while its branch lagged the base
// has a merge commit that also holds the base's later changes, and is refused.
//
// Publication only adds. A tag that exists is never moved, a published release is never
// edited, and each step first reads what a previous attempt left, so a rerun after a
// partial failure resumes instead of duplicating.
// ─────────────────────────────────────────────────────────────────────────────
import { TAG_PREFIX } from './release.mjs'
import { compareVersions } from './version.mjs'

const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
export const RELEASE_BRANCH_PREFIX = 'release/'

/** The version a `release/<version>` branch names, or null. */
export function releaseBranchVersion(ref) {
  if (!ref?.startsWith(RELEASE_BRANCH_PREFIX)) return null
  const version = ref.slice(RELEASE_BRANCH_PREFIX.length)
  return SEMVER_RE.test(version) ? version : null
}

const notFound = (e) => e?.status === 404

async function getOrNull(api, path) {
  try {
    return await api('GET', path)
  } catch (e) {
    if (notFound(e)) return null
    throw e
  }
}

/** Every page of a list endpoint that takes `per_page` and `page`. */
async function listAll(api, path) {
  const out = []
  for (let page = 1; ; page++) {
    const sep = path.includes('?') ? '&' : '?'
    const items = await api('GET', `${path}${sep}per_page=100&page=${page}`)
    out.push(...items)
    if (items.length < 100) return out
  }
}

/**
 * The commit a tag names, or null when the tag does not exist.
 *
 * @returns {Promise<{commit: string, annotated: boolean}|null>}
 */
export async function tagCommit(api, repo, version) {
  const ref = await getOrNull(api, `repos/${repo}/git/ref/tags/${TAG_PREFIX}${version}`)
  if (!ref) return null
  if (ref.object.type === 'commit') return { commit: ref.object.sha, annotated: false }
  const tag = await api('GET', `repos/${repo}/git/tags/${ref.object.sha}`)
  return { commit: tag.object.sha, annotated: true }
}

/**
 * What the prepare-release workflow does for `version`: `create` a release PR, or report
 * the open one (`exists`). `problems` holds the reasons it does neither.
 *
 * @returns {Promise<{action: 'create'|'exists'|null, url?: string, problems: string[]}>}
 */
export async function preflight(api, { repo, version }) {
  const problems = []
  if (!SEMVER_RE.test(version)) {
    return { action: null, problems: [`\`${version}\` is not a three-part version such as 0.12.0.`] }
  }
  const tag = `${TAG_PREFIX}${version}`
  const branch = `${RELEASE_BRANCH_PREFIX}${version}`
  if (await tagCommit(api, repo, version)) {
    problems.push(`${tag} already exists. A version is released once.`)
    return { action: null, problems }
  }
  const owner = repo.split('/')[0]
  const pulls = await listAll(api, `repos/${repo}/pulls?state=all&head=${owner}:${encodeURIComponent(branch)}`)
  const open = pulls.find((p) => p.state === 'open')
  if (open) return { action: 'exists', url: open.html_url, problems }
  const merged = pulls.find((p) => p.merged_at)
  if (merged) {
    problems.push(
      `${merged.html_url} cut ${version} and is merged, but ${tag} does not exist. Publication failed.` +
        ' Re-run the failed jobs of its release workflow run, or run the release workflow with that PR number.'
    )
    return { action: null, problems }
  }
  if (await getOrNull(api, `repos/${repo}/git/ref/heads/${branch}`)) {
    problems.push(`Branch ${branch} exists without an open pull request. Delete the branch, then run again.`)
    return { action: null, problems }
  }
  return { action: 'create', problems }
}

/**
 * The release that merged pull request `pr` cut, read from GitHub: its version, from
 * `VERSION` at the merge commit, and that commit.
 *
 * The caller still verifies the tree at `commit` with releaseProblems() and runs the tests.
 *
 * @param {Function} api
 * @param {{repo: string, pr: number}} opts
 * @returns {Promise<{version: string|null, commit: string|null, problems: string[]}>}
 */
export async function resolveRelease(api, { repo, pr }) {
  const problems = []
  const none = () => ({ version: null, commit: null, problems })
  const p = await api('GET', `repos/${repo}/pulls/${pr}`)
  const defaultBranch = p.base.repo.default_branch
  if (!p.merged_at) problems.push(`#${pr} is not merged. Merging the release PR approves the release.`)
  if (p.base.ref !== defaultBranch) problems.push(`#${pr} merged into ${p.base.ref}, not ${defaultBranch}.`)
  if (p.head.repo?.full_name !== repo) problems.push(`#${pr} comes from another repository.`)
  const branchVersion = releaseBranchVersion(p.head.ref)
  if (!branchVersion) {
    problems.push(`#${pr} comes from ${p.head.ref}, not from a ${RELEASE_BRANCH_PREFIX}<version> branch.`)
  }
  if (problems.length) return none()

  const commit = p.merge_commit_sha
  const file = await getOrNull(api, `repos/${repo}/contents/VERSION?ref=${commit}`)
  const version = file ? Buffer.from(file.content, 'base64').toString('utf8').trim() : null
  if (!version || !SEMVER_RE.test(version)) {
    problems.push(`VERSION at ${commit} is ${version ? `\`${version}\`` : 'missing'}, not a three-part version.`)
    return none()
  }
  if (branchVersion !== version) {
    problems.push(`#${pr} releases ${branchVersion}, but VERSION at its merge commit is ${version}.`)
    return none()
  }

  const [merged, head] = await Promise.all(
    [commit, p.head.sha].map((sha) => api('GET', `repos/${repo}/git/commits/${sha}`))
  )
  if (merged.tree.sha !== head.tree.sha) {
    problems.push(
      `The merge commit ${commit} differs from #${pr}'s head ${p.head.sha}, so it holds changes that were not` +
        ' in the reviewed release PR. Its branch was behind the base when it merged. Prepare the release again.'
    )
    return none()
  }

  const { status } = await api('GET', `repos/${repo}/compare/${commit}...${defaultBranch}`)
  if (status !== 'identical' && status !== 'ahead') {
    problems.push(`${defaultBranch} does not contain ${commit}, the merge commit of #${pr}.`)
    return none()
  }

  const tag = await tagCommit(api, repo, version)
  if (tag && tag.commit !== commit) {
    problems.push(`${TAG_PREFIX}${version} already names ${tag.commit}. A tag is never moved.`)
    return none()
  }
  if (tag && !tag.annotated) {
    problems.push(`${TAG_PREFIX}${version} is a lightweight tag. Release tags are annotated.`)
    return none()
  }
  return { version, commit, problems }
}

/**
 * Creates what is missing of release `version` at `commit`: the annotated tag, a draft
 * release, then the published release. A published release for the tag ends the run
 * without a change.
 *
 * @param {Function} api
 * @param {{repo: string, version: string, commit: string, notes: string, message: string}} opts
 * @param {(line: string) => void} [log]
 * @returns {Promise<{url: string, created: string[]}>}
 */
export async function publishRelease(api, { repo, version, commit, notes, message }, log = () => {}) {
  const tag = `${TAG_PREFIX}${version}`
  const created = []

  const assertTag = async () => {
    const t = await tagCommit(api, repo, version)
    if (!t) throw new Error(`${tag} does not exist.`)
    if (t.commit !== commit) throw new Error(`${tag} names ${t.commit}, not ${commit}. A tag is never moved.`)
  }

  if (!(await tagCommit(api, repo, version))) {
    const object = await api('POST', `repos/${repo}/git/tags`, { tag, message, object: commit, type: 'commit' })
    try {
      await api('POST', `repos/${repo}/git/refs`, { ref: `refs/tags/${tag}`, sha: object.sha })
      created.push('tag')
      log(`created ${tag} at ${commit}`)
    } catch (e) {
      // 422: another run created the ref first. assertTag() decides whether it is ours.
      if (e?.status !== 422) throw e
    }
  }
  await assertTag()

  const releases = await listAll(api, `repos/${repo}/releases`)
  const mine = releases.filter((r) => r.tag_name === tag)
  if (mine.length > 1) throw new Error(`${tag} has ${mine.length} releases. Delete the extra drafts, then run again.`)
  let release = mine[0]
  if (release && !release.draft) {
    log(`${tag} is already published`)
    return { url: release.html_url, created }
  }
  if (release) {
    log(`using the existing draft for ${tag}`)
  } else {
    release = await api('POST', `repos/${repo}/releases`, { tag_name: tag, name: `Coral ${version}`, body: notes, draft: true })
    created.push('draft')
    log(`created a draft release for ${tag}`)
  }

  const published = releases
    .filter((r) => !r.draft && !r.prerelease && r.tag_name.startsWith(TAG_PREFIX))
    .map((r) => r.tag_name.slice(TAG_PREFIX.length))
    .filter((v) => SEMVER_RE.test(v))
  const latest = published.every((v) => compareVersions(version, v) >= 0)

  await assertTag()
  const done = await api('PATCH', `repos/${repo}/releases/${release.id}`, {
    draft: false,
    make_latest: latest ? 'true' : 'false',
  })
  created.push('release')
  log(`published ${done.html_url}${latest ? ' as latest' : ''}`)
  return { url: done.html_url, created }
}

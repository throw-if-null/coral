// ─────────────────────────────────────────────────────────────────────────────
// Tests for scripts/release-github.mjs against an in-memory GitHub: which merged pull
// request is a release, and how publication preserves tags and releases and resumes after
// a partial failure.
// ─────────────────────────────────────────────────────────────────────────────
import assert from 'node:assert/strict'
import test from 'node:test'

import { preflight, publishRelease, releaseBranchVersion, resolveRelease } from './release-github.mjs'

const REPO = 'o/coral'
const MERGE = 'm'.repeat(40)
const OTHER = 'f'.repeat(40)

class HttpError extends Error {
  constructor(status) {
    super(`HTTP ${status}`)
    this.status = status
  }
}

/** A repository as the REST API sees it, with `failOn` to make one call fail once. */
function github(overrides = {}) {
  const state = {
    pulls: {
      7: {
        merged_at: '2026-11-22T00:00:00Z',
        merge_commit_sha: MERGE,
        state: 'closed',
        html_url: 'https://github.com/o/coral/pull/7',
        base: { ref: 'main', repo: { default_branch: 'main' } },
        head: { ref: 'release/1.3.0', repo: { full_name: REPO } },
      },
    },
    versions: { [MERGE]: '1.3.0' },
    onMain: new Set([MERGE]),
    tags: {},
    heads: new Set(),
    releases: [{ id: 1, tag_name: 'v1.2.0', draft: false, prerelease: false, html_url: 'u/v1.2.0' }],
    failOn: null,
    calls: [],
    ...overrides,
  }
  let nextId = 100
  const api = async (method, path, body) => {
    state.calls.push(`${method} ${path}`)
    if (state.failOn && `${method} ${path}`.startsWith(state.failOn)) {
      state.failOn = null
      throw new HttpError(500)
    }
    const route = path.replace(`repos/${REPO}/`, '').replace(/[?&]per_page=100&page=1$/, '')
    let m
    if (method === 'GET' && (m = /^pulls\/(\d+)$/.exec(route))) {
      if (!state.pulls[m[1]]) throw new HttpError(404)
      return state.pulls[m[1]]
    }
    if (method === 'GET' && (m = /^pulls\?state=all&head=o:release%2F(.+)$/.exec(route))) {
      return Object.values(state.pulls).filter((p) => p.head.ref === `release/${m[1]}`)
    }
    if (method === 'GET' && (m = /^contents\/VERSION\?ref=(.+)$/.exec(route))) {
      const v = state.versions[m[1]]
      if (!v) throw new HttpError(404)
      return { content: Buffer.from(`${v}\n`).toString('base64') }
    }
    if (method === 'GET' && (m = /^compare\/(.+)\.\.\.main$/.exec(route))) {
      return { status: state.onMain.has(m[1]) ? 'ahead' : 'diverged' }
    }
    if (method === 'GET' && (m = /^git\/ref\/tags\/(.+)$/.exec(route))) {
      const t = state.tags[m[1]]
      if (!t) throw new HttpError(404)
      return { object: t.annotated ? { type: 'tag', sha: `tag-${m[1]}` } : { type: 'commit', sha: t.commit } }
    }
    if (method === 'GET' && (m = /^git\/tags\/tag-(.+)$/.exec(route))) {
      return { object: { type: 'commit', sha: state.tags[m[1]].commit } }
    }
    if (method === 'GET' && (m = /^git\/ref\/heads\/(.+)$/.exec(route))) {
      if (!state.heads.has(m[1])) throw new HttpError(404)
      return {}
    }
    if (method === 'POST' && route === 'git/tags') {
      state.pendingTag = { name: body.tag, commit: body.object, message: body.message }
      return { sha: `tag-${body.tag}` }
    }
    if (method === 'POST' && route === 'git/refs') {
      const name = body.ref.replace('refs/tags/', '')
      if (state.tags[name]) throw new HttpError(422)
      state.tags[name] = { commit: state.pendingTag.commit, annotated: true, message: state.pendingTag.message }
      return {}
    }
    if (method === 'GET' && route === 'releases') return state.releases.map((r) => ({ ...r }))
    if (method === 'POST' && route === 'releases') {
      const r = { id: nextId++, ...body, prerelease: false, html_url: `u/${body.tag_name}` }
      state.releases.push(r)
      return r
    }
    if (method === 'PATCH' && (m = /^releases\/(\d+)$/.exec(route))) {
      const r = state.releases.find((x) => x.id === Number(m[1]))
      Object.assign(r, body)
      return r
    }
    throw new Error(`unrouted ${method} ${path}`)
  }
  return { api, state }
}

const publishArgs = { repo: REPO, version: '1.3.0', commit: MERGE, notes: 'notes', message: 'Coral 1.3.0' }

test('releaseBranchVersion reads release/<version> only', () => {
  assert.equal(releaseBranchVersion('release/1.3.0'), '1.3.0')
  assert.equal(releaseBranchVersion('release/v1.3.0'), null)
  assert.equal(releaseBranchVersion('feature/release/1.3.0'), null)
  assert.equal(releaseBranchVersion(undefined), null)
})

test('a merged release PR resolves to its merge commit', async () => {
  const { api } = github()
  assert.deepEqual(await resolveRelease(api, { repo: REPO, pr: 7, requireReleaseBranch: true }), {
    version: '1.3.0',
    commit: MERGE,
    problems: [],
  })
})

for (const [name, change, expected] of [
  ['an ordinary merged PR', (s) => (s.pulls[7].head.ref = 'feat/thing'), /not from a release\/<version> branch/],
  ['an unmerged PR', (s) => (s.pulls[7].merged_at = null), /is not merged/],
  ['a PR into another branch', (s) => (s.pulls[7].base.ref = 'next'), /merged into next, not main/],
  ['a PR from a fork', (s) => (s.pulls[7].head.repo = { full_name: 'x/coral' }), /another repository/],
  ['a branch that names another version', (s) => (s.versions[MERGE] = '1.4.0'), /VERSION at its merge commit is 1\.4\.0/],
  ['a merge commit main does not contain', (s) => s.onMain.clear(), /main does not contain/],
  ['a version whose tag names another commit', (s) => (s.tags['v1.3.0'] = { commit: OTHER, annotated: true }), /never moved/],
  ['a lightweight tag', (s) => (s.tags['v1.3.0'] = { commit: MERGE, annotated: false }), /lightweight/],
]) {
  test(`resolution refuses ${name}`, async () => {
    const { api, state } = github()
    change(state)
    const r = await resolveRelease(api, { repo: REPO, pr: 7, requireReleaseBranch: true })
    assert.equal(r.version, null)
    assert.match(r.problems.join('\n'), expected)
  })
}

test('recovery resolves a merged PR from any branch by its VERSION', async () => {
  const { api, state } = github()
  state.pulls[7].head.ref = 'feat/release-workflow'
  const r = await resolveRelease(api, { repo: REPO, pr: 7, requireReleaseBranch: false })
  assert.deepEqual([r.version, r.commit], ['1.3.0', MERGE])
})

test('publication creates the annotated tag at the merge commit, then the release', async () => {
  const { api, state } = github()
  const r = await publishRelease(api, publishArgs)
  assert.deepEqual(r.created, ['tag', 'draft', 'release'])
  assert.deepEqual(state.tags['v1.3.0'], { commit: MERGE, annotated: true, message: 'Coral 1.3.0' })
  const release = state.releases.find((x) => x.tag_name === 'v1.3.0')
  assert.deepEqual([release.draft, release.make_latest, release.body], [false, 'true', 'notes'])
  assert.equal(r.url, 'u/v1.3.0')
})

test('publication never moves an existing tag', async () => {
  const { api, state } = github({ tags: { 'v1.3.0': { commit: OTHER, annotated: true } } })
  await assert.rejects(publishRelease(api, publishArgs), /never moved/)
  assert.equal(state.tags['v1.3.0'].commit, OTHER)
  assert.ok(!state.calls.some((c) => c.startsWith('POST')))
})

test('a rerun after a published release changes nothing', async () => {
  const { api, state } = github()
  await publishRelease(api, publishArgs)
  const before = JSON.stringify(state.releases)
  state.calls = []
  const r = await publishRelease(api, publishArgs)
  assert.deepEqual(r.created, [])
  assert.equal(JSON.stringify(state.releases), before)
  assert.ok(!state.calls.some((c) => !c.startsWith('GET')))
})

test('a rerun after the tag was created resumes at the release', async () => {
  const { api, state } = github()
  state.failOn = `POST repos/${REPO}/releases`
  await assert.rejects(publishRelease(api, publishArgs))
  assert.ok(state.tags['v1.3.0'])
  const r = await publishRelease(api, publishArgs)
  assert.deepEqual(r.created, ['draft', 'release'])
})

test('a rerun after the draft was created publishes that draft', async () => {
  const { api, state } = github()
  state.failOn = `PATCH repos/${REPO}/releases/`
  await assert.rejects(publishRelease(api, publishArgs))
  const r = await publishRelease(api, publishArgs)
  assert.deepEqual(r.created, ['release'])
  assert.equal(state.releases.filter((x) => x.tag_name === 'v1.3.0').length, 1)
})

test('a release below the highest published version is not marked latest', async () => {
  const { api, state } = github()
  state.releases.push({ id: 2, tag_name: 'v2.0.0', draft: false, prerelease: false, html_url: 'u/v2.0.0' })
  await publishRelease(api, publishArgs)
  assert.equal(state.releases.find((x) => x.tag_name === 'v1.3.0').make_latest, 'false')
})

test('preflight creates when nothing exists, and reports an open release PR', async () => {
  const { api, state } = github({ pulls: {} })
  assert.deepEqual(await preflight(api, { repo: REPO, version: '1.3.0' }), { action: 'create', problems: [] })
  state.pulls[8] = { state: 'open', merged_at: null, html_url: 'pr/8', head: { ref: 'release/1.3.0' } }
  assert.deepEqual(await preflight(api, { repo: REPO, version: '1.3.0' }), { action: 'exists', url: 'pr/8', problems: [] })
})

for (const [name, change, expected] of [
  ['a released version', (s) => (s.tags['v1.3.0'] = { commit: MERGE, annotated: true }), /already exists/],
  ['a merged release PR without a tag', () => {}, /is merged, but v1\.3\.0 does not exist/],
  ['an orphaned release branch', (s) => ((s.pulls = {}), s.heads.add('release/1.3.0')), /without an open pull request/],
  ['a tag name', null, /not a three-part version/],
]) {
  test(`preflight refuses ${name}`, async () => {
    const { api, state } = github()
    if (change) change(state)
    const r = await preflight(api, { repo: REPO, version: change ? '1.3.0' : 'v1.3.0' })
    assert.equal(r.action, null)
    assert.match(r.problems.join('\n'), expected)
  })
}

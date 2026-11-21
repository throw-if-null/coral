#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// The release workflows' GitHub calls: a thin CLI over scripts/release-github.mjs.
//
//   preflight <version>               prepare-release: create a release PR, or report it
//   resolve --pr <n> [--release-branch]
//                                     release: the version and commit a merged PR cut
//   publish --version <v> --commit <sha>
//                                     release: tag and publish, from a checkout of <sha>
//
// Reads GITHUB_TOKEN, GITHUB_REPOSITORY, and GITHUB_API_URL. Writes its results to
// GITHUB_OUTPUT and GITHUB_STEP_SUMMARY when they are set.
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { preflight, publishRelease, resolveRelease } from './release-github.mjs'
import { releaseNotes, releaseProblems, tagMessage } from './release.mjs'

const ROOT = path.resolve(import.meta.dirname, '..')

function githubApi(token, baseUrl) {
  return async (method, route, body) => {
    const res = await fetch(`${baseUrl}/${route}`, {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    const text = await res.text()
    const data = text ? JSON.parse(text) : null
    if (!res.ok) {
      const e = new Error(`${method} ${route}: ${res.status} ${data?.message ?? res.statusText}`)
      e.status = res.status
      throw e
    }
    return data
  }
}

function output(values) {
  const lines = Object.entries(values).map(([k, v]) => `${k}=${v}`)
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`)
  for (const line of lines) console.log(line)
}

function summary(text) {
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`)
  console.log(text)
}

function fail(problems) {
  for (const p of problems) console.error(`::error::${p}`)
  process.exit(1)
}

function flags(argv) {
  const out = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--release-branch') out.releaseBranch = true
    else if (arg.startsWith('--')) {
      const v = argv[++i]
      if (v === undefined || v.startsWith('--')) fail([`${arg} needs a value.`])
      out[arg.slice(2)] = v
    } else out._.push(arg)
  }
  return out
}

const [command, ...rest] = process.argv.slice(2)
const args = flags(rest)
const { GITHUB_TOKEN: token, GITHUB_REPOSITORY: repo } = process.env
if (!token || !repo) fail(['GITHUB_TOKEN and GITHUB_REPOSITORY must be set.'])
const api = githubApi(token, process.env.GITHUB_API_URL ?? 'https://api.github.com')

switch (command) {
  case 'preflight': {
    const [version] = args._
    const r = await preflight(api, { repo, version })
    if (r.problems.length) fail(r.problems)
    if (r.action === 'exists') summary(`The release PR for ${version} is open: ${r.url}`)
    output({ action: r.action })
    break
  }
  case 'resolve': {
    const pr = Number(args.pr)
    if (!Number.isInteger(pr) || pr <= 0) fail([`\`${args.pr}\` is not a pull request number.`])
    const r = await resolveRelease(api, { repo, pr, requireReleaseBranch: Boolean(args.releaseBranch) })
    if (r.problems.length) fail(r.problems)
    output({ version: r.version, commit: r.commit })
    break
  }
  case 'publish': {
    const { version, commit } = args
    const problems = releaseProblems(ROOT, version)
    if (problems.length) fail(problems)
    const notes = releaseNotes(ROOT, version, { repository: repo, commit })
    const r = await publishRelease(api, { repo, version, commit, notes, message: tagMessage(ROOT, version) }, console.log)
    summary(`Coral ${version}: ${r.url}`)
    output({ url: r.url })
    break
  }
  default:
    fail([`unknown command \`${command}\`. Use preflight, resolve, or publish.`])
}

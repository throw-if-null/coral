// ─────────────────────────────────────────────────────────────────────────────
// README.md § "Start a project" holds the agent-instructions snippet that a project copies,
// and examples/go-api-slice/AGENTS.md is the example project's copy of it. The site build
// excludes README.md and the rule scanner excludes the example project, so no other check
// reads either file.
//
// The snippet loads haddock's doc-maintenance skill by URL at the tag that this Coral
// release pins. README.md also names that tag in prose and in the Claude Code install. A
// reference that names another tag loads another version of the skill.
// ─────────────────────────────────────────────────────────────────────────────
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const REPO = path.resolve(import.meta.dirname, '..')
const README = 'README.md'
const AGENTS = 'examples/go-api-slice/AGENTS.md'

const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8')

// The fence sits inside a numbered list item, so each of its lines carries the item's indent.
function readmeSnippet() {
  const section = read(README).match(/^## Start a project\n([\s\S]*?)(?=^## )/m)
  assert.ok(section, `${README} has no "## Start a project" section`)
  const fence = section[1].match(/^( *)```markdown\n([\s\S]*?)\n\1```$/m)
  assert.ok(fence, `${README} § "Start a project" has no \`\`\`markdown fence`)
  const indent = fence[1]
  return fence[2]
    .split('\n')
    .map((line) => (line.startsWith(indent) ? line.slice(indent.length) : line))
    .join('\n')
}

// `#<tag>` and `@<tag>` are the ref forms that `claude plugin marketplace add` reads.
const HADDOCK_URL_TAG = /throw-if-null\/haddock(?:\/tree|\/blob)?[/#@](v\d+\.\d+\.\d+)\b/g
// Coral writes its own versions without a `v` prefix, so a `vX.Y.Z` or `#vX.Y.Z` code span is a
// haddock tag.
const TAG_SPAN = /`#?(v\d+\.\d+\.\d+)`/g

test(`${AGENTS} holds the agent-instructions snippet of ${README}`, () => {
  const agents = read(AGENTS)
  const at = agents.indexOf('## Coral\n')
  assert.ok(at >= 0, `${AGENTS} has no "## Coral" section`)
  assert.equal(
    agents.slice(at),
    `${readmeSnippet()}\n`,
    `${AGENTS} § Coral differs from the snippet in ${README} § "Start a project". Copy the snippet.`
  )
})

test(`${README} and ${AGENTS} pin one haddock tag`, () => {
  const found = []
  for (const rel of [README, AGENTS]) {
    const text = read(rel)
    for (const m of text.matchAll(HADDOCK_URL_TAG)) found.push(`${rel}: ${m[1]}`)
    for (const m of text.matchAll(TAG_SPAN)) found.push(`${rel}: ${m[1]}`)
  }
  assert.ok(
    found.some((f) => f.startsWith(`${AGENTS}: `)),
    `${AGENTS} loads no haddock skill at a tag`
  )
  const tags = new Set(found.map((f) => f.split(': ')[1]))
  assert.equal(tags.size, 1, `haddock references name more than one tag:\n  - ${found.join('\n  - ')}`)
})

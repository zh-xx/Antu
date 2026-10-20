// The security policy and the two workflows that watch the repository (#238): what they must keep.
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const read = (path) => readFileSync(path, 'utf8')

test('there is a security policy in both languages, each pointing at the other and at the private report', () => {
  for (const [file, other] of [['SECURITY.md', 'SECURITY.zh-CN.md'], ['SECURITY.zh-CN.md', 'SECURITY.md']]) {
    assert.ok(existsSync(file), file)
    const text = read(file)
    assert.ok(text.includes(`](${other})`), `${file} links to ${other}`)
    assert.match(text, /\(<?https:\/\/github\.com\/zh-xx\/Antu\/security\/advisories\/new>?\)|<https:\/\/github\.com\/zh-xx\/Antu\/security\/advisories\/new>/, `${file} names the private report`)
    assert.doesNotMatch(text, /@(foxmail|qq|gmail)\.com/, `${file} holds no personal address`)
  }
})

test('the Scorecard workflow pins every action by commit and only reports', () => {
  const wf = read('.github/workflows/scorecard.yml')
  const uses = [...wf.matchAll(/^\s*uses:\s*(\S+)/gm)].map((m) => m[1])
  assert.ok(uses.length >= 4)
  for (const u of uses) assert.match(u, /@[0-9a-f]{40}$/, `${u} is pinned by a full commit`)
  assert.match(wf, /^\s+scorecard:\s*$/m, 'the job is called scorecard (tools/verify/ci-green.mjs lets it pass)')
  assert.match(wf, /publish_results: true/)
  assert.doesNotMatch(wf, /^\s*push:/m, 'no run on every push to main: the release waits for every check of its commit')
})

test('the audit workflow runs only on a dependency change or by hand, and never on a schedule or a push', () => {
  const wf = read('.github/workflows/audit.yml')
  assert.match(wf, /npm audit --audit-level=high/)
  assert.match(wf, /npm audit signatures/)
  assert.match(wf, /paths:\s*\n\s*- package\.json\s*\n\s*- package-lock\.json/)
  assert.doesNotMatch(wf, /^\s*schedule:/m)
  assert.doesNotMatch(wf, /^\s*push:/m)
})

// ---- Scorecard: Token-Permissions and Pinned-Dependencies (#248) ----

import { readdirSync } from 'node:fs'
const workflows = readdirSync('.github/workflows').filter((f) => f.endsWith('.yml'))

test('every action in every workflow is pinned by its full commit, with the version in a comment', () => {
  assert.ok(workflows.length >= 8)
  for (const f of workflows) {
    const uses = [...read(`.github/workflows/${f}`).matchAll(/^[ \t]*(?:-[ \t]+)?uses:[ \t]*(.+)$/gm)].map((m) => m[1])
    for (const u of uses) assert.match(u, /^[\w.-]+\/[\w./-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/, `${f}: ${u}`)
  }
})

test('no workflow gives the token a write permission for the whole workflow', () => {
  for (const f of workflows) {
    const top = /^permissions:[^\n]*\n((?:[ \t]+.*\n|\n)*)/m.exec(read(`.github/workflows/${f}`))
    assert.ok(top, `${f} has a permissions block at the top`)
    assert.doesNotMatch(top[0], /write/, `${f}: a write permission belongs in the job that needs it`)
  }
})

test('the release job asks for write itself, and verify only reads', () => {
  assert.match(read('.github/workflows/release.yml'), /^ {4}permissions:\n {6}contents: write/m)
  assert.match(read('.github/workflows/verify.yml'), /^permissions:\n {2}contents: read\n/m)
  assert.match(read('.github/workflows/codeql.yml'), /^ {4}permissions:\n(?: {6}.*\n)*? {6}security-events: write/m)
})

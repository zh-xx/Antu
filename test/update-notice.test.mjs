// The command line's notice that a newer Antu is out (tools/lib/update-notice.mjs, #113): when it speaks, what it says,
// that it asks at most once a day, and that it never gets in the way (no network, a bad answer, switched off).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DAY_MS, compareVersions, noticeText, updateNotice, whereRuns } from '../tools/lib/update-notice.mjs'

/** A registry that answers with `body` and counts the requests */
async function registry(body, status = 200) {
  const seen = { n: 0 }
  const server = createServer((req, res) => {
    seen.n += 1
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(body))
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  return { url: `http://127.0.0.1:${server.address().port}/latest`, seen, close: () => new Promise((r) => server.close(r)) }
}

test('versions are compared as numbers, and only MAJOR.MINOR.PATCH is compared', () => {
  assert.equal(compareVersions('0.9.0', '0.10.0'), -1)
  assert.equal(compareVersions('0.10.0', '0.9.0'), 1)
  assert.equal(compareVersions('1.2.3', '1.2.3'), 0)
  assert.equal(compareVersions('dev', '0.9.0'), null)
  assert.equal(compareVersions('0.9.0-rc.1', '0.9.0'), null)
})

test('the notice names the version and the one command to give, for the skill and for the package, and says nothing when not older', () => {
  const skill = noticeText({ current: '0.9.0', latest: '0.10.0', where: 'skill' })
  assert.match(skill, /Antu 0\.10\.0 is out; this skill is 0\.9\.0/)
  assert.match(skill, /npx skills update antu -g/)
  assert.ok(!/npx skills update -g/.test(skill), 'the command names the skill: it must not update the others')
  assert.match(skill, /Do not run it unless the user agrees/)
  assert.match(noticeText({ current: '0.9.0', latest: '0.10.0', where: 'npm' }), /npm update -g @zh-xx\/antu/)
  assert.equal(noticeText({ current: '0.10.0', latest: '0.10.0', where: 'skill' }), '')
  assert.equal(noticeText({ current: '0.11.0', latest: '0.10.0', where: 'skill' }), '')
  assert.equal(noticeText({ current: '0.9.0', latest: '0.10.0', where: 'source' }), '')
})

test('where the file runs from is told by its place', () => {
  const root = mkdtempSync(join(tmpdir(), 'antu-where-'))
  mkdirSync(join(root, 'skill/scripts'), { recursive: true })
  writeFileSync(join(root, 'skill/SKILL.md'), '')
  assert.equal(whereRuns(join(root, 'skill/scripts/antu.mjs')), 'skill')
  assert.equal(whereRuns(join(root, 'node_modules/@zh-xx/antu/bin/antu.mjs')), 'npm')
  assert.equal(whereRuns(join(root, 'repo/tools/lib/update-notice.mjs')), 'source')
})

test('a newer version in the registry gives the notice, and the answer is kept for a day', async () => {
  const reg = await registry({ version: '0.10.0' })
  try {
    const env = { ANTU_REGISTRY_URL: reg.url }
    const first = await updateNotice({ current: '0.9.0', where: 'skill', env, now: 1_000_000 })
    assert.match(first, /Antu 0\.10\.0 is out/)
    assert.equal(reg.seen.n, 1)
    // within the day: from the kept answer, no new request
    assert.match(await updateNotice({ current: '0.9.0', where: 'skill', env, now: 1_000_000 + DAY_MS - 1000 }), /0\.10\.0/)
    assert.equal(reg.seen.n, 1)
    // after the day: asks again
    await updateNotice({ current: '0.9.0', where: 'skill', env, now: 1_000_000 + DAY_MS + 1000 })
    assert.equal(reg.seen.n, 2)
  } finally {
    await reg.close()
  }
})

test('it says nothing when this is the newest, when it is switched off, from a source clone, or when the answer is no use', async () => {
  const same = await registry({ version: '0.9.0' })
  const bad = await registry({ nothing: true })
  const err = await registry({ error: 'no' }, 500)
  try {
    assert.equal(await updateNotice({ current: '0.9.0', where: 'skill', env: { ANTU_REGISTRY_URL: same.url }, now: 5_000_000 }), '')
    assert.equal(await updateNotice({ current: '0.9.0', where: 'skill', env: { ANTU_REGISTRY_URL: bad.url }, now: 5_000_000 }), '')
    assert.equal(await updateNotice({ current: '0.9.0', where: 'skill', env: { ANTU_REGISTRY_URL: err.url }, now: 5_000_000 }), '')
    const reg = await registry({ version: '0.10.0' })
    try {
      assert.equal(await updateNotice({ current: '0.9.0', where: 'skill', env: { ANTU_REGISTRY_URL: reg.url, ANTU_NO_UPDATE_NOTIFIER: '1' }, now: 9_000_000 }), '')
      assert.equal(await updateNotice({ current: '0.9.0', where: 'source', env: { ANTU_REGISTRY_URL: reg.url }, now: 9_000_000 }), '')
      assert.equal(reg.seen.n, 0, 'switched off or from a clone: not even a request')
    } finally {
      await reg.close()
    }
  } finally {
    await same.close()
    await bad.close()
    await err.close()
  }
})

test('with no network at all the command is not held up and says nothing', async () => {
  const started = Date.now()
  const out = await updateNotice({ current: '0.9.0', where: 'skill', env: { ANTU_REGISTRY_URL: 'http://127.0.0.1:9/latest' }, now: 20_000_000 })
  assert.equal(out, '')
  assert.ok(Date.now() - started < 3000, 'gives up within the time it allows itself')
})

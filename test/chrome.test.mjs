// ============================================================
//  test/chrome.test.mjs — the part of launching a browser that can be tested alone
//
//  Launching a browser needs a real browser (that belongs to the integration
//  layer in tools/verify), but "the three attempts must not tread on each other"
//  is pure arithmetic and can be pinned down here.
//
//  Worth pinning because it was hit for real: three headless variants sharing one
//  profile directory made Chrome kill itself (the SingletonLock already existed),
//  so the second and third variants could not even start and the fallback chain was
//  dead. The symptom was an intermittent "all three variants failed to start" on CI
//  (fixed in commits 384d52b and 5bbd087).
// ============================================================

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { HEADLESS_VARIANTS, attemptPorts, launchArgs } from '../tools/lib/chrome.mjs'

const args = (i, over = {}) =>
  launchArgs({
    flags: HEADLESS_VARIANTS[i],
    port: 9500 + i,
    profile: `/tmp/antu-chrome-${i}`,
    width: 1600,
    height: 900,
    ...over,
  })

const flagValue = (list, name) => list.find((a) => a.startsWith(`${name}=`))

test('all three headless variants are present and distinct', () => {
  assert.equal(HEADLESS_VARIANTS.length, 3)
  const keys = HEADLESS_VARIANTS.map((f) => f.join(' '))
  assert.equal(new Set(keys).size, 3, `two variants are identical: ${keys}`)
})

test('each variant gets its own port', () => {
  const ports = attemptPorts(9500)
  assert.equal(ports.length, HEADLESS_VARIANTS.length)
  assert.deepEqual(ports, [9500, 9501, 9502])
  assert.equal(new Set(ports).size, ports.length, `duplicate ports: ${ports}`)
})

test('an explicit starting port is counted up from', () => {
  assert.deepEqual(attemptPorts(9600), [9600, 9601, 9602])
})

test('each attempt uses its own profile directory', () => {
  const profiles = [0, 1, 2].map((i) => flagValue(args(i), '--user-data-dir'))
  assert.equal(new Set(profiles).size, 3, `duplicate profiles: ${profiles}`)
})

test('the arguments carry this attempt’s port and profile, with no crossing over', () => {
  for (let i = 0; i < 3; i += 1) {
    assert.equal(flagValue(args(i), '--remote-debugging-port'), `--remote-debugging-port=${9500 + i}`)
    assert.equal(flagValue(args(i), '--user-data-dir'), `--user-data-dir=/tmp/antu-chrome-${i}`)
  }
})

test('the two flags a container needs are present (the CI runner is a container)', () => {
  const a = args(0)
  assert.ok(a.includes('--no-sandbox'), 'missing --no-sandbox')
  assert.ok(
    a.includes('--disable-dev-shm-usage'),
    'missing --disable-dev-shm-usage: /dev/shm is small in a container and Chrome fails to start',
  )
})

test('the headless variant is passed through as-is', () => {
  assert.ok(args(0).includes('--headless=old'))
  assert.ok(args(1).includes('--headless=new'))
  assert.ok(!args(2).some((a) => a.startsWith('--headless')), 'the third variant must not carry headless')
})

test('window size and start page are still set (existing behaviour; do not drop them)', () => {
  const a = args(0)
  assert.equal(flagValue(a, '--window-size'), '--window-size=1600,900')
  assert.ok(a.includes('--allow-file-access-from-files'), 'without it a file:// sample cannot be opened')
  assert.equal(a.at(-1), 'about:blank')
})

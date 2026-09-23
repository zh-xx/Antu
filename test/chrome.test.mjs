// ============================================================
//  test/chrome.test.mjs —— 起浏览器这件事里能单独测的那部分
//
//  起浏览器整件事要真浏览器（那归 tools/verify 的集成层），
//  但"三次尝试之间不许互相踩"这条是纯算术，能在这儿钉住。
//
//  为什么值得钉：这条踩过。三种 headless 写法共用一个 profile 目录时，
//  Chrome 见到 profile 已被占用就直接自杀（SingletonLock 已存在），
//  于是第二、三种写法连启动都做不到，备用链路是废的，
//  症状是 CI 上偶发"三种写法全都没起来"（见 known-issues 第 18 条）。
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

test('三种 headless 写法都在，且互不相同', () => {
  assert.equal(HEADLESS_VARIANTS.length, 3)
  const keys = HEADLESS_VARIANTS.map((f) => f.join(' '))
  assert.equal(new Set(keys).size, 3, `有两种写法一模一样：${keys}`)
})

test('每种写法各占一个端口，不重复', () => {
  const ports = attemptPorts(9500)
  assert.equal(ports.length, HEADLESS_VARIANTS.length)
  assert.deepEqual(ports, [9500, 9501, 9502])
  assert.equal(new Set(ports).size, ports.length, `端口有重复：${ports}`)
})

test('指定起始端口时也从它往后排', () => {
  assert.deepEqual(attemptPorts(9600), [9600, 9601, 9602])
})

test('每次尝试用各自的 profile 目录', () => {
  const profiles = [0, 1, 2].map((i) => flagValue(args(i), '--user-data-dir'))
  assert.equal(new Set(profiles).size, 3, `profile 有重复：${profiles}`)
})

test('参数里带上这次尝试的端口与 profile，不会串', () => {
  for (let i = 0; i < 3; i += 1) {
    assert.equal(flagValue(args(i), '--remote-debugging-port'), `--remote-debugging-port=${9500 + i}`)
    assert.equal(flagValue(args(i), '--user-data-dir'), `--user-data-dir=/tmp/antu-chrome-${i}`)
  }
})

test('带上容器里需要的两条（CI 的 runner 是容器）', () => {
  const a = args(0)
  assert.ok(a.includes('--no-sandbox'), '缺 --no-sandbox')
  assert.ok(
    a.includes('--disable-dev-shm-usage'),
    '缺 --disable-dev-shm-usage：容器里 /dev/shm 小，Chrome 会因此起不来',
  )
})

test('headless 写法原样传下去', () => {
  assert.ok(args(0).includes('--headless=old'))
  assert.ok(args(1).includes('--headless=new'))
  assert.ok(!args(2).some((a) => a.startsWith('--headless')), '第三种不该带 headless')
})

test('窗口尺寸与首页仍在（这两条是原行为，别改丢了）', () => {
  const a = args(0)
  assert.equal(flagValue(a, '--window-size'), '--window-size=1600,900')
  assert.ok(a.includes('--allow-file-access-from-files'), '缺了就打不开 file:// 的样本')
  assert.equal(a.at(-1), 'about:blank')
})

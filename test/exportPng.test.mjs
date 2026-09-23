// ============================================================
//  test/exportPng.test.mjs —— 导出里能单独测的那部分
//
//  导出整件事要浏览器（抓 DOM、出图），那部分归 tools/verify 的集成测试。
//  这里管两类纯函数：从标题生成文件名，和"内容尺寸 + 留白 = 成品尺寸"。
// ============================================================

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { EXPORT_PAD, exportFrame, fileNameOf } from '../src/shell/exportPng.js'

test('文件名取自标题，后缀 .png', () => {
  assert.equal(fileNameOf('电梯劝烟案'), '电梯劝烟案.png')
})

test('文件名里不能有的字符换掉', () => {
  // 斜杠、冒号、星号、问号、引号、尖括号、竖线、空白
  const name = fileNameOf('A/B:C*D?E"F<G>H|I J')
  assert.ok(!/[/:*?"<>|\s]/.test(name), `还留着不能进文件名的字符：${name}`)
  assert.ok(name.endsWith('.png'))
})

test('标题为空或不是字符串时有兜底', () => {
  assert.equal(fileNameOf(''), '案图.png')
  assert.equal(fileNameOf(undefined), '案图.png')
  assert.equal(fileNameOf(null), '案图.png')
})

test('标题过长会截断（避免超出文件系统上限）', () => {
  const name = fileNameOf('长'.repeat(200))
  assert.ok(name.length <= 64, `截断后还有 ${name.length} 个字符`)
  assert.ok(name.endsWith('.png'))
})

test('留白非零', () => {
  assert.ok(EXPORT_PAD > 0, '导出图必须留白，否则贴着内容边裁')
})

test('成品尺寸 = 内容 + 四周留白', () => {
  const f = exportFrame(1000, 600)
  assert.equal(f.width, 1000 + EXPORT_PAD * 2)
  assert.equal(f.height, 600 + EXPORT_PAD * 2)
})

test('内容画在留白之内，不贴边', () => {
  const f = exportFrame(1000, 600)
  assert.equal(f.offsetX, EXPORT_PAD)
  assert.equal(f.offsetY, EXPORT_PAD)
  // 右边和下边剩下的空当也是 EXPORT_PAD
  assert.equal(f.width - f.offsetX - 1000, EXPORT_PAD)
  assert.equal(f.height - f.offsetY - 600, EXPORT_PAD)
})

test('留白是四边一致，不随内容形状变', () => {
  const wide = exportFrame(2000, 100)
  const tall = exportFrame(100, 2000)
  assert.equal(wide.width - 2000, tall.height - 2000)
  assert.equal(wide.offsetX, tall.offsetY)
})

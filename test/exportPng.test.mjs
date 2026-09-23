// ============================================================
//  test/exportPng.test.mjs —— 导出里能单独测的那部分
//
//  导出整件事要浏览器（抓 DOM、出图），那部分归 tools/verify 的集成测试。
//  这里只管从标题生成文件名这一类纯函数。
// ============================================================

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { fileNameOf } from '../src/shell/exportPng.js'

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

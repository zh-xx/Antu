// ============================================================
//  test/dsh-locale.test.mjs — the plugin's own dictionaries
//
//  The dictionaries are inlined into client.js by build.mjs; they are plain
//  data, so they can be checked without React, a DOM, or DSH.
// ============================================================

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { ANTU_NS, en, zh } from '../tools/dsh/src/locale.mjs'

/** The `{name}` placeholders of one template, in first-appearance order. */
const placeholders = (template) => [...template.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()

test('locale namespace is the plugin-owned antuDsh', () => {
  assert.equal(ANTU_NS, 'antuDsh')
})

test('zh and en carry the same keys, all non-empty', () => {
  assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort())
  for (const dictionary of [zh, en]) {
    for (const [key, value] of Object.entries(dictionary)) {
      assert.equal(typeof value, 'string', key)
      assert.ok(value.trim().length > 0, `${key} is empty`)
    }
  }
})

test('zh and en use the same placeholders', () => {
  for (const key of Object.keys(en)) {
    assert.deepEqual(placeholders(zh[key]), placeholders(en[key]), key)
  }
})

test('the upgrade notice still names the required DSH version in both languages', () => {
  assert.match(en['error.upgrade'], /≥ 0\.2\.0-rc\.2/)
  assert.match(zh['error.upgrade'], /≥ 0\.2\.0-rc\.2/)
})

// Layout-B of issue 123: paper level on the env drives the preview viewport.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { PAPER_LEVELS, paperOf, resolvePaperLevel } from '../src/core/paper.js'
import { embeddedEnv, standaloneEnv } from '../src/shell/env.js'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')

test('resolvePaperLevel defaults and rejects unknowns', () => {
  assert.equal(resolvePaperLevel(undefined), 'screen')
  assert.equal(resolvePaperLevel(null), 'screen')
  assert.equal(resolvePaperLevel(''), 'screen')
  assert.equal(resolvePaperLevel('a4l'), 'a4l')
  assert.throws(() => resolvePaperLevel('letter'), /letter/)
})

test('standaloneEnv takes paper from the page preset', () => {
  assert.equal(standaloneEnv({ preset: null }).paper, 'screen')
  assert.equal(standaloneEnv({ preset: {} }).paper, 'screen')
  assert.equal(standaloneEnv({ preset: { paper: 'a4p' } }).paper, 'a4p')
  assert.equal(standaloneEnv({ preset: { paper: 'a4l' } }).paper, 'a4l')
  // a bad preset value must not crash the viewer page
  assert.equal(standaloneEnv({ preset: { paper: 'letter' } }).paper, 'screen')
})

test('embeddedEnv takes paper from the mount option', () => {
  assert.equal(embeddedEnv().paper, 'screen')
  assert.equal(embeddedEnv({ paper: 'a4l' }).paper, 'a4l')
  assert.equal(embeddedEnv({ paper: 'nope' }).paper, 'screen')
})

test('the stylesheet sizes the canvas for a4 paper levels', () => {
  const css = readFileSync(join(REPO, 'src/styles.css'), 'utf8')
  assert.match(css, /\[data-paper='a4l'\]/)
  assert.match(css, /\[data-paper='a4p'\]/)
  assert.match(css, /--antu-paper-w/)
  assert.match(css, /--antu-paper-h/)
  for (const level of ['a4l', 'a4p']) {
    const { width, height } = paperOf(level).canvas
    assert.ok(width > 0 && height > 0)
  }
  assert.deepEqual([...PAPER_LEVELS], ['screen', 'a4l', 'a4p'])
})

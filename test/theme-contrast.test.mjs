// The colours of the two sides are written as text (column headings, lane names, legends, camps), so in every theme
// each keeps a contrast of at least 4.5:1 against the canvas (WCAG AA for normal text). See spec/theme.md.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { THEMES, THEME_IDS } from '../src/theme/themes.js'

const channel = (v) => {
  const c = v / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}
const luminance = (hex) => {
  const n = parseInt(hex.slice(1), 16)
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
}
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

test('the side colours of every theme are readable as text on its canvas (4.5:1 or more)', () => {
  for (const id of THEME_IDS) {
    const c = THEMES[id].color
    for (const side of ['side1', 'side2']) {
      const ratio = contrast(c[side], c.canvas)
      assert.ok(ratio >= 4.5, `${id}.${side} ${c[side]} on ${c.canvas}: ${ratio.toFixed(2)}:1`)
    }
  }
})

test('the measure is right: black on white is 21:1, the old modern side 2 failed', () => {
  assert.equal(contrast('#000000', '#ffffff').toFixed(1), '21.0')
  assert.ok(contrast('#94a3b8', '#fbfcfd') < 4.5)
})

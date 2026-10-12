// The procedure's four states (issue 187): read from kind and outcome, painted from each theme's flow.state
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { stateOf, statePaint, nodePaint } from '../src/renderers/procedure/flow/palette.js'
import { THEMES } from '../src/theme/themes.js'

test('the four states come from what the file already says', () => {
  assert.equal(stateOf('step'), 'normal')
  assert.equal(stateOf('step', 'positive'), 'normal')
  assert.equal(stateOf('decision', 'neutral'), 'normal')
  assert.equal(stateOf('step', 'negative'), 'warn')
  assert.equal(stateOf('document', 'negative'), 'warn')
  assert.equal(stateOf('end', 'negative'), 'stop')
  assert.equal(stateOf('end', 'positive'), 'done')
  // An end with no outcome is a normal end
  assert.equal(stateOf('end'), 'done')
  assert.equal(stateOf('note', 'negative'), 'normal')
})

test('every theme paints the three states apart, and keeps the line that says them in black and white', () => {
  for (const [name, theme] of Object.entries(THEMES)) {
    const [warn, stop, done] = ['warn', 'stop', 'done'].map((s) => statePaint(s, theme))
    const fills = new Set([warn.fill, stop.fill, done.fill, theme.flow.outcome.neutral.fill])
    assert.equal(fills.size, 4, `${name}: two states share a fill`)
    assert.ok(warn.dash && stop.dash, `${name}: gone wrong and terminated are dashed`)
    assert.ok(!done.dash && done.width > theme.flow.outcome.neutral.width, `${name}: a normal end is a heavier line`)
    // With the switch off, the paint is the outcome's, as before
    assert.deepEqual(nodePaint('end', 'negative', theme, false), theme.flow.outcome.negative)
    assert.equal(nodePaint('end', 'negative', theme, true).fill, stop.fill)
  }
})

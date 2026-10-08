// Where the control capsule goes (src/shell/dockPlace.js): centred when the canvas allows, else beside the
// minimap, else the minimap gives way, else it wraps; never over the zoom buttons or the minimap, never off the
// canvas. The browser check of the same thing, on every kind, is in tools/verify/run.mjs ("the capsule …").
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DOCK_EDGE, DOCK_GAP, placeDock } from '../src/shell/dockPlace.js'

const ZOOM_RIGHT = 45 // the zoom buttons' right edge, as the page draws them
const MINIMAP = 202

test('on a wide canvas the capsule is centred and the minimap stays', () => {
  const p = placeDock({ width: 1600, natural: 825, zoomRight: ZOOM_RIGHT, minimapWidth: MINIMAP })
  assert.deepEqual(p, { left: 1600 / 2 - 825 / 2, maxWidth: null, hideMinimap: false })
})

test('when centring would reach the minimap, the capsule moves sideways and the minimap stays', () => {
  const p = placeDock({ width: 1024, natural: 706, zoomRight: ZOOM_RIGHT, minimapWidth: MINIMAP })
  assert.equal(p.hideMinimap, false)
  assert.equal(p.maxWidth, null)
  assert.equal(p.left + 706, 1024 - DOCK_EDGE - MINIMAP - DOCK_GAP, 'its right edge one gap short of the minimap')
})

test('when there is no room beside the minimap, the minimap gives way', () => {
  const p = placeDock({ width: 900, natural: 825, zoomRight: ZOOM_RIGHT, minimapWidth: MINIMAP })
  assert.equal(p.hideMinimap, true)
  assert.equal(p.maxWidth, null)
  assert.ok(p.left >= ZOOM_RIGHT + DOCK_GAP && p.left + 825 <= 900 - DOCK_EDGE)
})

test('when even that is not enough, the capsule wraps within the strip', () => {
  const p = placeDock({ width: 560, natural: 825, zoomRight: ZOOM_RIGHT, minimapWidth: MINIMAP })
  assert.deepEqual(p, { left: ZOOM_RIGHT + DOCK_GAP, maxWidth: 560 - DOCK_EDGE - ZOOM_RIGHT - DOCK_GAP, hideMinimap: true })
})

test('a host that left out the minimap or the zoom buttons gets the room they would have taken', () => {
  assert.equal(placeDock({ width: 1024, natural: 706, zoomRight: ZOOM_RIGHT, minimapWidth: null }).left, 1024 / 2 - 706 / 2)
  assert.equal(placeDock({ width: 700, natural: 680, zoomRight: null, minimapWidth: null }).left, DOCK_EDGE)
})

test('at every width from 320 to 2000 px and every capsule width the page has, nothing overlaps and nothing leaves the canvas', () => {
  // the capsule widths of the fifteen kinds, as measured on the examples
  const naturals = [289, 337, 389, 407, 557, 558, 561, 654, 706, 825]
  for (let width = 320; width <= 2000; width += 8) {
    for (const natural of naturals) {
      const p = placeDock({ width, natural, zoomRight: ZOOM_RIGHT, minimapWidth: MINIMAP })
      const w = p.maxWidth ?? natural
      const at = `width ${width}, capsule ${natural}`
      assert.ok(p.left >= ZOOM_RIGHT + DOCK_GAP - 1e-9, `${at}: over the zoom buttons`)
      assert.ok(p.left + w <= width - DOCK_EDGE + 1e-9, `${at}: off the canvas`)
      if (!p.hideMinimap) assert.ok(p.left + w <= width - DOCK_EDGE - MINIMAP - DOCK_GAP + 1e-9, `${at}: over the minimap`)
      // the minimap gives way only when it has to
      if (p.hideMinimap) assert.ok(natural > width - DOCK_EDGE - MINIMAP - DOCK_GAP - (ZOOM_RIGHT + DOCK_GAP), `${at}: minimap hidden needlessly`)
    }
  }
})

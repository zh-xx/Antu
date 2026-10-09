// The timeline's Stagger switch (vertical only, on by default in the page; the layout draws it only when asked): a row may start half a row after the one before it
// when the two have no column in common. Cards never overlap, no link runs under a card, no axis dot sits under a
// card, and the dots on the axis keep the order of the slots. Checked on every fact example.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'

import { buildFactGraph } from '../src/renderers/fact/timeline/layout.js'
import { rowTopsOf } from '../src/renderers/fact/timeline/metrics.js'
import { buildGrid } from '../src/renderers/fact/timeline/grid.js'
import { layoutReport, formatLayoutReport } from '../tools/lib/report.mjs'

const examples = readdirSync('examples/fact')
  .filter((f) => f.endsWith('.json'))
  .map((f) => [f, JSON.parse(readFileSync(`examples/fact/${f}`, 'utf8'))])

const FIELDS = { summary: true }
const boxes = (g) => g.nodes.filter((n) => n.type === 'card').map((n) => ({ id: n.id, x: n.position.x, y: n.position.y, w: n.data.cardW, h: n.data.cardH }))
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

test('off, the rows are where they always were: one row each', () => {
  for (const [, spec] of examples) {
    const grid = buildGrid(spec)
    assert.deepEqual(rowTopsOf(grid, false), grid.rows.map((_, i) => i))
    const a = buildFactGraph(spec, FIELDS, undefined, 'vertical')
    const b = buildFactGraph(spec, FIELDS, undefined, 'vertical', { stagger: false })
    assert.deepEqual(b.size, a.size)
    assert.equal(a.staggered, false)
  }
})

test('horizontal ignores it', () => {
  for (const [, spec] of examples) {
    const a = buildFactGraph(spec, FIELDS, undefined, 'horizontal')
    const b = buildFactGraph(spec, FIELDS, undefined, 'horizontal', { stagger: true })
    assert.deepEqual(b.size, a.size)
    assert.equal(b.staggered, false)
  }
})

test('rows go down by at least half a row, and rows sharing a column stay a whole row apart', () => {
  for (const [f, spec] of examples) {
    {
      const grid = buildGrid(spec)
      if (grid.errors.length) continue
      const tops = rowTopsOf(grid, true)
      const cols = grid.rows.map((row) => new Set([...row.cells.keys()]))
      tops.forEach((t, i) => {
        if (i > 0) assert.ok(t - tops[i - 1] >= 0.5, `${f}: row ${i} is less than half a row below the one before`)
        for (let j = 0; j < i; j++) {
          if ([...cols[i]].some((k) => cols[j].has(k))) assert.ok(t - tops[j] >= 1, `${f}: rows ${j} and ${i} share a column`)
        }
      })
    }
  }
})

test('on every example: no card overlaps another, no link runs under a card, no dot sits under one', () => {
  for (const [f, spec] of examples) {
    {
      const g = buildFactGraph(spec, FIELDS, undefined, 'vertical', { stagger: true })
      if (g.errors.length) continue
      const cards = boxes(g)
      for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) assert.ok(!overlap(cards[i], cards[j]), `${f}: ${cards[i].id} overlaps ${cards[j].id}`)
      const segments = g.nodes.find((n) => n.type === 'links')?.data.segments ?? []
      for (const s of segments) {
        const line = { x: s.left + 1, y: s.top, w: s.width - 2, h: 1 }
        // a link meets the cards of its own slot (the axis card beside it) as it always has: only other rows count
        const under = cards.filter((c) => overlap(line, c) && Math.abs(c.y + c.h / 2 - s.top) > 1)
        assert.equal(under.length, 0, `${f}: a link at y=${s.top} runs under ${under.map((c) => c.id).join(', ')}`)
      }
      const axis = g.nodes.find((n) => n.type === 'axis')
      for (const off of axis.data.dotOffsets) {
        const dot = { x: axis.position.x - 4, y: axis.position.y + off, w: 10, h: 10 }
        const axisCards = cards.filter((c) => overlap(dot, c))
        // a dot under a card on the axis is that card's own row (a card on the axis covers its own dot, as it always has)
        assert.ok(axisCards.length <= 1, `${f}: the dot at ${off} sits under ${axisCards.map((c) => c.id).join(', ')}`)
      }
      const offsets = axis.data.dotOffsets
      offsets.forEach((o, i) => i > 0 && assert.ok(o > offsets[i - 1], `${f}: the dots are out of slot order`))
    }
  }
})

test('it makes a long timeline shorter: the Fang Yuan example opens with larger text', () => {
  const spec = JSON.parse(readFileSync('examples/fact/fang-yuan-loan-and-conflict.zh-CN.json', 'utf8'))
  const a = buildFactGraph(spec, FIELDS, undefined, 'vertical')
  const b = buildFactGraph(spec, FIELDS, undefined, 'vertical', { stagger: true })
  assert.ok(b.size.height < a.size.height * 0.7, `${b.size.height} vs ${a.size.height}`)
})

test('layout reports the vertical size as the page opens it, staggered, with the size unstaggered beside it', () => {
  const long = JSON.parse(readFileSync('examples/fact/fang-yuan-loan-and-conflict.zh-CN.json', 'utf8'))
  const r = layoutReport(long)
  const staggered = buildFactGraph(long, FIELDS, undefined, 'vertical', { stagger: true })
  const flat = buildFactGraph(long, FIELDS, undefined, 'vertical')
  assert.deepEqual(r.byOrientation.vertical.size, staggered.size)
  assert.deepEqual(r.unstaggered.size, flat.size)
  const text = formatLayoutReport(r)
  assert.match(text, /10\.8 px as it opens \(vertical\)/)
  assert.match(text, /rows staggered, the page's default; with "Stagger" off 1264×1482/)
  // a timeline the switch does not change says nothing about it
  const short = JSON.parse(readFileSync('examples/fact/sample-no-groups.zh-CN.json', 'utf8'))
  assert.doesNotMatch(formatLayoutReport(layoutReport(short)), /Stagger/)
})

test('an act of several parties on the axis names them on its card; no card grows (issue #172)', () => {
  const spec = JSON.parse(readFileSync('examples/fact/sample-four-parties-four-slots.zh-CN.json', 'utf8'))
  for (const orientation of ['vertical', 'horizontal']) {
    const g = buildFactGraph(spec, { summary: true }, undefined, orientation)
    const cards = g.nodes.filter((n) => n.type === 'card')
    const joint = cards.filter((n) => n.data.joint).map((n) => n.data.event.id).sort()
    // the contract (buyer and supplier) and the joint acceptance (all four); one party's own acts are not joint
    const several = cards.filter((n) => (n.data.event.actorIds ?? []).length >= 2).map((n) => n.data.event.id).sort()
    assert.deepEqual(joint, several, orientation)
    assert.ok(joint.length >= 2, orientation)
    const plain = buildFactGraph({ ...spec, slots: spec.slots.map((s) => ({ events: s.events.map((e) => ({ ...e, actorIds: e.actorIds?.slice(0, 1) })) })) }, { summary: true }, undefined, orientation)
    assert.equal(cards[0].data.cardH, plain.nodes.find((n) => n.type === 'card').data.cardH, `${orientation}: same card height`)
  }
})

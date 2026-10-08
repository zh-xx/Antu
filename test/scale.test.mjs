// ============================================================
//  test/scale.test.mjs — the fact time scale (issue #85, kind A): breaks, marks, no overlap
//  (pure functions)
//
//  What must hold:
//    1. every event of every fact example is on exactly one card (its own, or a gathered run)
//    2. no two cards intersect, on every example and on a dense case made to crowd one lane
//    3. the axis breaks only where the scale changes, never inside an evening, at most twice
//    4. a date given to the day, month or year is a period, not a point; an undated event and a
//       period take their place from their neighbours in data order
// ============================================================

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

import {
  BREAK_FLOOR_MS,
  CARD_W,
  LABEL_W,
  MAX_BREAKS,
  buildScaleGraph,
  findBreaks,
  lanesOf,
  placeLane,
  ticksOf,
  timeOf,
  unitOf,
} from '../src/renderers/fact/scale/layout.js'
import { factKnowledge } from '../src/renderers/fact/schema.js'
import { registerKnowledge, layoutKindsOf } from '../src/core/registry.js'
import { translate } from '../src/core/i18n.js'

const DIR = 'examples/fact'
const files = readdirSync(DIR).filter((f) => f.endsWith('.json'))
const load = (f) => JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8'))
const H = 3600000
const D = 24 * H

const intersects = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y

function assertSound(spec, label) {
  const g = buildScaleGraph(spec, {})
  const ids = spec.slots.flatMap((s) => s.events.map((e) => e.id))
  const onCards = g.cards.flatMap((c) => c.ids)
  assert.deepEqual([...onCards].sort(), [...ids].sort(), `${label}: every event on exactly one card`)
  for (let i = 0; i < g.cards.length; i++) {
    for (let j = i + 1; j < g.cards.length; j++) {
      assert.ok(!intersects(g.cards[i], g.cards[j]), `${label}: ${g.cards[i].id} and ${g.cards[j].id} do not overlap`)
    }
  }
  for (const c of g.cards) {
    assert.ok(c.x >= LABEL_W && c.x + c.w <= g.size.width, `${label}: ${c.id} inside the diagram, right of the labels`)
    assert.ok(c.y >= 0, `${label}: ${c.id} not above the top`)
  }
  assert.ok(g.segments.length <= MAX_BREAKS + 1, `${label}: at most ${MAX_BREAKS} breaks`)
  assert.deepEqual(g.errors, [])
  return g
}

test('the time scale is the third fact kind', () => {
  registerKnowledge('fact', factKnowledge)
  assert.deepEqual(layoutKindsOf('fact'), ['timeline', 'chronicle', 'scale'])
})

for (const f of files) {
  test(`${f}: every event on one card, no overlap`, () => {
    assertSound(load(f), f)
  })
}

test('a dense case: a burst of 25 events in under a minute, a quiet evening around it, a long run-up', () => {
  // Evenly spread events never crowd (a segment is as wide as its events need); a burst does
  const events = []
  for (let i = 0; i < 4; i++) events.push({ id: `early-${i}`, date: `2030-0${i + 1}-15`, label: `Early event ${i}` })
  for (let i = 0; i < 25; i++) {
    events.push({ id: `burst-${i}`, date: `2030-08-01T21:10:${String(i * 2).padStart(2, '0')}`, label: `Something happens in the burst, number ${i}` })
  }
  for (const hm of ['21:30', '22:00', '22:30', '23:00', '23:30']) events.push({ id: `quiet-${hm}`, date: `2030-08-01T${hm}`, label: `Quiet at ${hm}` })
  const spec = { type: 'fact', title: 'dense', slots: events.map((e) => ({ events: [e] })) }
  const g = assertSound(spec, 'dense')
  assert.ok(g.gathered.length > 0, 'the crowded evening is gathered')
  assert.ok(g.cards.length < events.length, 'fewer cards than events')
  assert.equal(g.segments.length, 2, 'the run-up and the evening: one break, not one inside the months')
  assert.equal(g.segments.at(-1).count, 30, 'the evening is a segment of its own')
  // The quiet events keep their own cards
  for (const hm of ['21:30', '22:00', '22:30', '23:00', '23:30']) assert.ok(g.cards.some((c) => c.ids.length === 1 && c.ids[0] === `quiet-${hm}`), `quiet-${hm} has its own card`)
  // The gathered runs are listed under the diagram
  const list = g.nodes.find((n) => n.type === 'scaleRunList')
  assert.ok(list, 'the list of gathered events is part of the diagram')
  assert.equal(list.data.runs.reduce((n, r) => n + r.events.length, 0), g.gathered.reduce((n, r) => n + r.ids.length, 0))
})

test('many events at the very same moment never overlap', () => {
  const events = Array.from({ length: 12 }, (_, i) => ({ id: `e${i}`, date: '2030-01-01T10:00', label: `Same moment ${i}` }))
  assertSound({ type: 'fact', title: 't', slots: [{ events }] }, 'same moment')
})

test('placeLane gathers the nearest neighbours first', () => {
  const placed = placeLane([
    { id: 'a', x: 0 },
    { id: 'b', x: 300 },
    { id: 'c', x: 302 },
    { id: 'd', x: 304 },
    { id: 'e', x: 306 },
    { id: 'f', x: 700 },
  ])
  const ids = placed.map((p) => p.ids)
  assert.deepEqual(ids[0], ['a'])
  assert.deepEqual(ids.at(-1), ['f'])
  assert.ok(placed.every((p) => p.level < 3))
  // Within each level, cards are a card width apart
  for (const lv of [0, 1, 2]) {
    const xs = placed.filter((p) => p.level === lv).map((p) => p.x)
    for (let i = 1; i < xs.length; i++) assert.ok(xs[i] - xs[i - 1] >= CARD_W)
  }
})

test('breaks: where the scale changes, never inside an evening', () => {
  const t0 = Date.UTC(2030, 0, 1)
  // months apart, then one evening hours apart
  const times = [0, 90 * D, 200 * D, 300 * D, 310 * D, 310 * D + 2 * H, 310 * D + 5 * H, 310 * D + 6 * H].map((t) => t0 + t)
  const found = findBreaks(times)
  assert.ok(found.includes(3), 'the 10 days before the evening break')
  assert.ok(!found.includes(0) && !found.includes(1), 'gaps between months alike do not')
  assert.ok(found.every((i) => i < 4), 'nothing inside the evening breaks')
  const evening = [0, 1, 2, 5, 7].map((h) => t0 + h * H)
  assert.deepEqual(findBreaks(evening), [], 'gaps under two days never break')
  assert.ok(BREAK_FLOOR_MS >= 2 * D)
  assert.deepEqual(findBreaks([t0, t0 + 400 * D]), [], 'two points alone have nothing to compare with')
})

test('a date to the day, month or year is a period; a time is a point; dateEnd is a span', () => {
  assert.equal(timeOf({ date: '2030-06' }).kind, 'band')
  assert.equal(timeOf({ date: '2030' }).kind, 'band')
  assert.equal(timeOf({ date: '2030-06-02' }).kind, 'band')
  assert.equal(timeOf({ date: '2030-06-02T20:14' }).kind, 'dot')
  const bar = timeOf({ date: '2030-06-02T20:14', dateEnd: '2030-06-02T20:16' })
  assert.equal(bar.kind, 'bar')
  assert.equal(bar.to - bar.from, 2 * 60000)
  const month = timeOf({ date: '2030-02' })
  assert.equal(month.to - month.from, 28 * D, 'February 2030 is 28 days')
  assert.equal(timeOf({}), null)
})

test('a day-only event written after the evening stays after it; an undated one sits between', () => {
  const spec = {
    type: 'fact',
    title: 't',
    slots: [
      { events: [{ id: 'a', date: '2030-06-02T20:14', label: 'a' }] },
      { events: [{ id: 'u', label: 'no date' }] },
      { events: [{ id: 'b', date: '2030-06-02T20:27', label: 'b' }] },
      { events: [{ id: 'day', date: '2030-06-02', label: 'that day' }] },
    ],
  }
  const g = buildScaleGraph(spec, {})
  const layer = g.nodes.find((n) => n.type === 'scaleLayer')
  const x = (id) => layer.data.marks.find((m) => m.id === id).x
  assert.ok(x('a') < x('u') && x('u') < x('b'), 'the undated event between its neighbours')
  assert.ok(x('day') > x('b'), 'the day-only event after the evening it was written after')
  assert.equal(layer.data.marks.find((m) => m.id === 'u').undated, true)
  // a day is longer than this whole scale of minutes: cut to it, a band would read as lasting exactly that long
  const day = layer.data.marks.find((m) => m.id === 'day')
  assert.equal(day.kind, 'dot', 'on a scale of minutes the day is a mark, not a band')
  assert.equal(day.coarse, true, 'marked as coarser than the scale (hollow, with "that day")')
  assert.equal(day.prec, 'day')
  assert.equal(g.undated, 1)
})

test('tick units and labels', () => {
  assert.equal(unitOf(3 * 365 * D), 'year')
  assert.equal(unitOf(100 * D), 'month')
  assert.equal(unitOf(10 * D), 'day')
  assert.equal(unitOf(10 * H), 'hour')
  assert.equal(unitOf(20 * 60000), 'minute')
  const t0 = Date.UTC(2030, 0, 1, 20, 3)
  const ticks = ticksOf(t0, t0 + 20 * 60000, 'minute', 6)
  assert.ok(ticks.length >= 2 && ticks.length <= 6)
  assert.ok(ticks.every((t) => t >= t0 && t <= t0 + 20 * 60000))
})

test('every scale message exists in both languages', () => {
  for (const lang of ['en', 'zh']) {
    for (const key of ['graphKind.scale', 'scale.other', 'scale.events', 'scale.undated', 'scale.unit.year', 'scale.unit.month', 'scale.unit.day', 'scale.unit.hour', 'scale.unit.minute']) {
      assert.ok(!translate(lang, key).startsWith('scale.') && !translate(lang, key).startsWith('graphKind.'), `${lang} ${key}`)
    }
    assert.ok(translate(lang, 'scale.segment', { n: 1, unit: 'x', count: 2 }).includes('2'))
    assert.ok(translate(lang, 'scale.run', { n: 3 }).includes('3'))
    assert.ok(translate(lang, 'scale.runListed', { n: 3 }).includes('3'))
  }
})

// ---- a lane per party (the dock switch, off by default) ----

test('lane per party: a side of two or more parties is split, a side of one keeps its lane, the axis stays', () => {
  const spec = load('fang-yuan-loan-and-conflict.zh-CN.json')
  const events = spec.slots.flatMap((s) => s.events)
  assert.deepEqual(lanesOf(spec, events).map((l) => l.key), ['g-1', 'g-2', 'g-3'], 'off: one lane per group')
  const on = lanesOf(spec, events, { byParty: true })
  assert.deepEqual(on.map((l) => l.key), ['actor:a-1', 'actor:a-2', 'g-2', 'g-3'])
  assert.deepEqual(on.slice(0, 2).map((l) => [l.label, l.side, l.groupIndex]), [['方远', '方远母子', 0], ['梁某（方远之母）', '方远母子', 0]])
})

test('lane per party: an event of one party is in its own lane, one of several on the axis; nothing is lost or overlaps', () => {
  for (const f of files) {
    const spec = load(f)
    const g = buildScaleGraph(spec, {}, { byParty: true })
    const ids = spec.slots.flatMap((s) => s.events.map((e) => e.id))
    assert.deepEqual([...g.cards.flatMap((c) => c.ids)].sort(), [...ids].sort(), `${f}: every event on one card`)
    for (let i = 0; i < g.cards.length; i++) for (let j = i + 1; j < g.cards.length; j++) assert.ok(!intersects(g.cards[i], g.cards[j]), `${f}: no overlap`)
  }
  const spec = load('fang-yuan-loan-and-conflict.zh-CN.json')
  const g = buildScaleGraph(spec, {}, { byParty: true })
  const lanes = g.nodes.find((n) => n.type === 'scaleLayer').data.lanes
  const laneOfCard = (id) => lanes[g.cards.find((c) => c.ids.includes(id)).lane]?.key
  assert.equal(laneOfCard('ev-11'), 'actor:a-1', 'Fang Yuan alone: his lane')
  assert.equal(laneOfCard('ev-2'), 'actor:a-2', 'Liang alone: her lane')
  assert.equal(laneOfCard('ev-1'), 'g-3', 'both sides: the axis')
})

test('lane per party changes nothing where no side holds two parties', () => {
  const spec = load('neighbour-corridor-charging.zh-CN.json')
  assert.deepEqual(buildScaleGraph(spec, {}, { byParty: true }).size, buildScaleGraph(spec, {}).size)
})

test('a date that fits its scale is not coarse: a month on a scale of months is a band, a day there a dot', () => {
  const spec = {
    type: 'fact',
    title: 'months',
    slots: [
      { events: [{ id: 'a', date: '2024-01-10', label: 'a' }] },
      { events: [{ id: 'm', date: '2024-05', label: 'May' }] },
      { events: [{ id: 'b', date: '2024-09-20', label: 'b' }] },
    ],
  }
  const marks = buildScaleGraph(spec, {}).nodes.find((n) => n.type === 'scaleLayer').data.marks
  assert.equal(marks.find((m) => m.id === 'm').kind, 'band')
  assert.ok(marks.every((m) => !m.coarse), 'nothing is coarser than this scale')
})

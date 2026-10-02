// ============================================================
//  test/chronicle.test.mjs — the fact chronicle (issue #85): order, gaps and card heights
//  (pure functions)
//
//  What must hold:
//    1. every event of every fact example appears once, in slot order, and nothing is refused
//    2. the gap between time points is worded at the precision the dates have, and a gap of
//       30 days or more is "long"
//    3. cards never overlap, and every card is tall enough for the lines its text wraps to
//    4. wrapping counts a Latin word as unbreakable, so English titles are not under-counted
// ============================================================

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

import {
  CARD_INNER_W,
  TITLE_FONT,
  TITLE_SCALE,
  buildChronicleGraph,
  chronicleItems,
  gapBetween,
  groupIndexOf,
} from '../src/renderers/fact/chronicle/layout.js'
import { wrapLineCount, textEm } from '../src/renderers/fact/cardGeometry.js'
import { validateSpec as validate } from '../src/core/validate.js'
import { tEn, translate } from '../src/core/i18n.js'
import { factKnowledge } from '../src/renderers/fact/schema.js'
import { registerKnowledge, layoutKindsOf } from '../src/core/registry.js'

const DIR = 'examples/fact'
// Both languages: card heights depend on the text, and English wraps differently from Chinese
const files = readdirSync(DIR).filter((f) => f.endsWith('.json'))
const load = (f) => JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8'))
const ALL_FIELDS = { summary: true, actors: true, sources: true }

test('the chronicle is a registered fact kind, after the timeline', () => {
  registerKnowledge('fact', factKnowledge)
  assert.deepEqual(layoutKindsOf('fact').slice(0, 2), ['timeline', 'chronicle'])
})

for (const f of files) {
  test(`${f}: every event once, in slot order, nothing refused`, () => {
    const spec = load(f)
    assert.deepEqual(validate(spec), [], 'the example itself is valid')
    const ids = spec.slots.flatMap((s) => s.events.map((e) => e.id))
    for (const fields of [{}, { summary: true }, ALL_FIELDS]) {
      const g = buildChronicleGraph(spec, fields)
      assert.deepEqual(g.errors, [])
      const shown = g.items.map((i) => i.event.id)
      assert.deepEqual([...shown].sort(), [...ids].sort(), 'each event exactly once')
      // Slot order is kept: the slot index never goes back
      const slotOrder = g.items.map((i) => i.slotIndex)
      assert.deepEqual(slotOrder, [...slotOrder].sort((a, b) => a - b))
    }
  })

  test(`${f}: cards do not overlap and are tall enough for their text`, () => {
    const spec = load(f)
    for (const fields of [{}, { summary: true }, ALL_FIELDS]) {
      const g = buildChronicleGraph(spec, fields)
      const cards = g.nodes.filter((n) => n.type === 'entry')
      for (let i = 1; i < cards.length; i++) {
        const prev = cards[i - 1]
        assert.ok(cards[i].position.y >= prev.position.y + prev.height + 10, `${cards[i].id} sits below ${prev.id} with room`)
      }
      for (const c of cards) {
        const { event } = c.data
        const titleLines = wrapLineCount(event.label, CARD_INNER_W / TITLE_FONT, TITLE_SCALE)
        assert.ok(c.data.lines.title >= titleLines, `${c.id}: title lines`)
        if (!fields.summary || !event.summary) assert.equal(c.data.lines.summary, 0, `${c.id}: summary hidden takes no height`)
      }
      const last = cards.at(-1)
      assert.equal(g.size.height, last.position.y + last.height, 'the content ends at the last card')
    }
  })
}

test('items within a slot are sorted by date when all have one', () => {
  const spec = load('neighbour-corridor-charging.zh-CN.json')
  const firstSlot = chronicleItems(spec).filter((i) => i.slotIndex === 0)
  const dates = firstSlot.map((i) => i.event.date)
  assert.deepEqual(dates, [...dates].sort())
  assert.equal(firstSlot[0].first, true)
  assert.ok(firstSlot.slice(1).every((i) => !i.first && i.spacing === 'sameSlot' && i.gap === null))
})

test('the gap is measured from the end of the previous time point', () => {
  const spec = {
    slots: [
      { events: [{ id: 'a', date: '2030-01-01T10:00', dateEnd: '2030-01-01T11:30' }] },
      { events: [{ id: 'b', date: '2030-01-01T12:00' }] },
    ],
  }
  const [, b] = chronicleItems(spec)
  assert.deepEqual(b.gap, { key: 'chronicle.gapMinutes', vars: { n: 30 }, long: false, approx: false })
})

test('gap wording follows the coarser precision of the two dates', () => {
  const g = (a, b) => {
    const r = gapBetween(a, b)
    return r && [r.key.split('.')[1], r.vars, r.long]
  }
  assert.deepEqual(g('2030-06-02T20:14:03', '2030-06-02T20:14:29'), ['gapSeconds', { n: 26 }, false])
  assert.deepEqual(g('2030-06-02T20:00', '2030-06-02T22:30'), ['gapHoursMinutes', { h: 2, m: 30 }, false])
  assert.deepEqual(g('2030-06-02T20:00', '2030-06-03T07:00'), ['gapHours', { n: 11 }, false])
  // A day-only date cannot say how many hours passed
  assert.deepEqual(g('2030-06-02', '2030-06-03T07:00'), ['gapDays', { n: 1 }, false])
  assert.equal(g('2030-06-02', '2030-06-02T07:00'), null, 'same day: nothing to say')
  assert.deepEqual(g('2030-06-02', '2030-06-30'), ['gapDays', { n: 28 }, false])
  assert.deepEqual(g('2030-06-02', '2030-07-05'), ['gapMonths', { n: 1 }, true], '30 days or more is long')
  assert.deepEqual(g('2030-06', '2031-09'), ['gapYearsMonths', { y: 1, m: 3 }, true])
  assert.deepEqual(g('2030', '2032'), ['gapYears', { n: 2 }, true])
  assert.equal(g('2030-06-02', '2030-06-01'), null, 'going back in time: no gap')
  assert.equal(g(undefined, '2030-06-01'), null)
  assert.equal(gapBetween('2030-01-01', '2030-01-05', true).approx, true)
})

test('an undated event has no gap on either side', () => {
  const spec = {
    slots: [
      { events: [{ id: 'a', date: '2030-01-01' }] },
      { events: [{ id: 'b' }] },
      { events: [{ id: 'c', date: '2030-03-01' }] },
    ],
  }
  const [, b, c] = chronicleItems(spec)
  assert.equal(b.gap, null)
  assert.equal(b.spacing, 'none')
  assert.equal(c.gap, null)
  const g = buildChronicleGraph(spec, {})
  const spine = g.nodes.find((n) => n.type === 'spine')
  assert.deepEqual(spine.data.dots.map((d) => d.hollow), [false, true, false], 'the undated dot is hollow')
})

test('every gap key has a message in both languages', () => {
  const keys = ['gapSeconds', 'gapMinutes', 'gapHours', 'gapHoursMinutes', 'gapDays', 'gapMonths', 'gapYears', 'gapYearsMonths']
  for (const k of keys) {
    for (const lang of ['en', 'zh']) {
      const text = translate(lang, `chronicle.${k}`, { n: 2, h: 1, m: 5, y: 1 })
      assert.ok(text && !text.startsWith('chronicle.'), `${lang} chronicle.${k}`)
    }
  }
  assert.ok(tEn('graphKind.chronicle'))
})

test('group colour follows the place in groups; no group is neutral', () => {
  const spec = { groups: [{ id: 'x' }, { id: 'y' }, { id: 'z' }] }
  assert.equal(groupIndexOf(spec, { groupId: 'x' }), 0)
  assert.equal(groupIndexOf(spec, { groupId: 'y' }), 1)
  assert.equal(groupIndexOf(spec, { groupId: 'z' }), 2)
  assert.equal(groupIndexOf(spec, {}), 2)
})

test('wrapping: a Latin word does not break, CJK breaks anywhere', () => {
  // 10 em per line; "aaaa " words are 4 × 0.55 = 2.2 em each
  assert.equal(wrapLineCount('', 10), 0)
  assert.equal(wrapLineCount('一二三四五六七八九十', 10), 1)
  assert.equal(wrapLineCount('一二三四五六七八九十一', 10), 2)
  // Four 2.2 em words with spaces fit (2.2×4 + 0.55×3 = 10.45 > 10, so the fourth wraps)
  assert.equal(wrapLineCount('aaaa aaaa aaaa aaaa', 10), 2)
  // Total width says 1 line here (8.25 em), but the second word does not fit after the first
  const long = 'aaaaaaaaaa aaaaa'
  assert.ok(textEm(long) < 10)
  assert.equal(wrapLineCount(long, 6), 2)
  // A word longer than a line breaks across lines
  assert.equal(wrapLineCount('a'.repeat(40), 10), 3)
  // Scale widens one script only
  assert.equal(wrapLineCount('一二三四五六七八九十', 10, { latin: 2 }), 1)
  assert.equal(wrapLineCount('一二三四五六七八九十', 10, { cjk: 1.1 }), 2)
  assert.equal(wrapLineCount('aaaaa aaaa', 10), 1)
  assert.equal(wrapLineCount('aaaaa aaaa', 10, { latin: 2 }), 2)
})

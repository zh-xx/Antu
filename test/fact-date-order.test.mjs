// The order of the slots is the order of the events, and `date` never reorders. When the order clearly contradicts the
// dates, `validate` stays silent (it is not an error) and the notes say so; nothing is ever reordered.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'

import { notesOf, validate } from '../tools/lib/report.mjs'
import { dateSpan } from '../src/renderers/fact/dateOrder.js'

const ev = (id, date, extra = {}) => ({ id, label: `事件 ${id}`, ...(date === undefined ? {} : { date }), ...extra })
const spec = (...slots) => ({ specVersion: 1, type: 'fact', title: '日期顺序', slots: slots.map((events) => ({ events })) })
const dateNotes = (s) => notesOf(s).filter((n) => /wholly earlier/.test(n))

test('a date is the span it names: a day is the whole day, a minute is that minute', () => {
  const day = dateSpan('2030-06-02')
  const minute = dateSpan('2030-06-02T20:14')
  assert.equal(day.to - day.from, 24 * 3600 * 1000)
  assert.equal(minute.to - minute.from, 60 * 1000)
  assert.ok(minute.from >= day.from && minute.to <= day.to)
  assert.equal(dateSpan('2030-02').to - dateSpan('2030-02').from, 28 * 24 * 3600 * 1000)
  assert.equal(dateSpan('2030-6-2'), null)
  assert.equal(dateSpan('soon'), null)
})

test('a slot wholly before the one before it is noted, with both places named, and it is not an error', () => {
  const s = spec([ev('e1', '2030-06-02')], [ev('e2', '2030-05-01')])
  assert.deepEqual(validate(s), [])
  const notes = dateNotes(s)
  assert.equal(notes.length, 1)
  assert.match(notes[0], /slots\[1\]\.events\[0\] \("e2", 2030-05-01\)/)
  assert.match(notes[0], /slots\[0\]\.events\[0\] \("e1", 2030-06-02\)/)
  assert.match(notes[0], /nothing is reordered/)
})

test('different precision that overlaps is not a contradiction', () => {
  assert.deepEqual(dateNotes(spec([ev('e1', '2030-06-02')], [ev('e2', '2030-06-02T20:14:03')])), [])
  assert.deepEqual(dateNotes(spec([ev('e1', '2030-06-02T20:27')], [ev('e2', '2030-06-02')])), [])
  assert.deepEqual(dateNotes(spec([ev('e1', '2030-06')], [ev('e2', '2030-06-30')])), [])
})

test('the same day written to the minute, the later minute first, is a contradiction: the spans are disjoint', () => {
  assert.equal(dateNotes(spec([ev('e1', '2030-06-02T20:27')], [ev('e2', '2030-06-02T20:14')])).length, 1)
})

test('events inside one slot are one time point and are not compared with each other', () => {
  assert.deepEqual(dateNotes(spec([ev('e1', '2030-06-02'), ev('e2', '2030-01-01')])), [])
})

test('an event without a date, or with one that does not parse, takes no part', () => {
  assert.deepEqual(dateNotes(spec([ev('e1', '2030-06-02')], [ev('e2')], [ev('e3', '2030-06-05')])), [])
  assert.deepEqual(dateNotes(spec([ev('e1', '2030-06-02')], [ev('e2', 'next week')], [ev('e3', '2030-06-05')])), [])
})

test('the comparison is with the nearest slot before it that has a date, so one wrong date is named once', () => {
  const s = spec([ev('e1', '2030-06-01')], [ev('e2', '2030-01-01')], [ev('e3', '2030-06-03')], [ev('e4', '2030-06-04')])
  assert.equal(dateNotes(s).length, 1)
})

test('an approximate date has one unit of room on each side', () => {
  assert.deepEqual(dateNotes(spec([ev('e1', '2030-06-02')], [ev('e2', '2030-06-01', { approx: true })])), [])
  assert.equal(dateNotes(spec([ev('e1', '2030-06-02')], [ev('e2', '2030-06-01')])).length, 1)
})

test('a span counts to its end: an event inside the span of the one before is not earlier', () => {
  assert.deepEqual(dateNotes(spec([ev('e1', '2030-06-01', { dateEnd: '2030-06-30' })], [ev('e2', '2030-06-10')])), [])
})

test('the examples of the fact type say nothing about the order of their dates', () => {
  for (const f of readdirSync('examples/fact').filter((n) => n.endsWith('.json'))) {
    const s = JSON.parse(readFileSync(`examples/fact/${f}`, 'utf8'))
    assert.deepEqual(dateNotes(s), [], f)
  }
})

test('a party that no event names is a note, not an error (issue 172)', async () => {
  const { partyNotes } = await import('../src/renderers/fact/partyNotes.js')
  const spec = {
    actors: [{ id: 'a-1', name: '甲' }, { id: 'a-2', name: '乙' }, { id: 'a-3', name: '丙' }],
    slots: [{ events: [{ id: 'ev-1', label: 'x', actorIds: ['a-1', 'a-2'] }] }, { events: [{ id: 'ev-2', label: 'y' }] }],
  }
  const notes = partyNotes(spec)
  assert.equal(notes.length, 1)
  assert.match(notes[0], /actors\[2\] \(a-3\).*"丙"/)
  // named together with others is enough to be named
  spec.slots[1].events[0].actorIds = ['a-1', 'a-2', 'a-3']
  assert.deepEqual(partyNotes(spec), [])
})

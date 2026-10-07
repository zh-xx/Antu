// A view that names parties on its sides draws only the events of those parties (by design: a view to follow two
// parties, as the examples do). What it leaves out is said in the layout report (#137); `validate` stays silent, because
// a view that follows two parties and leaves the others out is often exactly what was meant.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { notesOf, layoutReport, formatLayoutReport, validate } from '../tools/lib/report.mjs'

const spec = (views) => ({
  specVersion: 1,
  type: 'fact',
  title: 'A loan',
  actors: [{ id: 'a-1', name: '林芳' }, { id: 'a-2', name: '赵磊' }, { id: 'a-3', name: '许颖' }],
  views,
  slots: [
    { events: [{ id: 'ev-1', label: '林芳转账', date: '2030-03-04', actorIds: ['a-1'] }] },
    { events: [{ id: 'ev-2', label: '赵磊出具借条', date: '2030-03-04', actorIds: ['a-2'] }] },
    { events: [{ id: 'ev-3', label: '许颖转交', date: '2030-03-14', actorIds: ['a-3'] }] },
    { events: [{ id: 'ev-4', label: '借款到期未还', date: '2030-04-04' }] },
  ],
})

const scoped = { label: '分列', splitBy: 'actor', side1: { label: '林芳', actors: ['a-1'] }, side2: { label: '赵磊', actors: ['a-2'] }, axis: { label: '其他' } }

test('a view that leaves out the events of a party is not an error, and not a note: it may be on purpose', () => {
  const s = spec([scoped])
  assert.deepEqual(validate(s), [])
  assert.deepEqual(notesOf(s), [])
})

test('the layout report says how many events are drawn, which are left out, and what to do', () => {
  const text = formatLayoutReport(layoutReport(spec([scoped])))
  assert.match(text, /3 of 4 events drawn/)
  assert.match(text, /left out: events ev-3, of a-3 许颖/)
  assert.match(text, /put the party on a side/)
})

test('a view that places every event, or names no party, says nothing of the kind', () => {
  const placed = { ...scoped, side1: { label: '林芳', actors: ['a-1', 'a-3'] } }
  assert.doesNotMatch(formatLayoutReport(layoutReport(spec([placed]))), /left out/)
  const open = { label: '只按时间', splitBy: 'actor', side1: { label: '', actors: [] }, side2: { label: '', actors: [] }, axis: { label: '全部' } }
  assert.doesNotMatch(formatLayoutReport(layoutReport(spec([open]))), /left out/)
})

test('a view that follows one party: the report counts what is left out, too', () => {
  const follow = { label: '只看林芳', splitBy: 'actor', side1: { label: '林芳', actors: ['a-1'] }, side2: { label: '', actors: [] }, axis: { label: '' } }
  assert.match(formatLayoutReport(layoutReport(spec([follow]))), /2 of 4 events drawn/)
})

test('a view split by group leaves nothing out, so it says nothing', () => {
  assert.doesNotMatch(formatLayoutReport(layoutReport(spec([{ label: '按组', splitBy: 'group' }]))), /left out|events drawn/)
})

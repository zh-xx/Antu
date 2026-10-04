// ============================================================
//  test/chain.test.mjs — the relationship guarantee chain (issue #89): sorting, inference, clear boxes
//  (pure functions)
//
//  What must hold:
//    1. every relation of every relationship example lands in exactly one place: a claim block, a guarantee
//       card, a counter-guarantee card, the bucket of guarantees tied to no claim, or the list of the rest
//    2. a guarantee without `secures` is tied only when that is plain (its creditor has exactly one claim and
//       the guarantor is not that claim's debtor); otherwise it is in the bucket, with the reason
//    3. no two boxes overlap, nothing leaves the content size, any valid JSON draws (no claims, no guarantors)
// ============================================================

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

import { buildChainGraph, classify, claimTitle } from '../src/renderers/relationship/chain/layout.js'
import { relationshipKnowledge } from '../src/renderers/relationship/schema.js'
import { registerKnowledge, layoutKindsOf } from '../src/core/registry.js'
import { translate } from '../src/core/i18n.js'
import { layoutReport, formatLayoutReport } from '../tools/lib/report.mjs'

const DIR = 'examples/relationship'
const files = readdirSync(DIR).filter((f) => f.endsWith('.json'))
const load = (f) => JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8'))

const entity = (id, extra = {}) => ({ id, kind: 'person', label: `Party ${id}`, ...extra })
const rel = (id, from, to, kind, extra = {}) => ({ id, from, to, kind, ...extra })
const spec = (entities, relations) => ({ type: 'relationship', specVersion: 1, title: 't', entities, relations })

/** Where every relation went, as ids */
const placed = (s) => {
  const p = classify(s)
  const slots = [...p.slots.values()].flat()
  return [...p.claims.map((c) => c.id), ...slots.map((x) => x.guarantee.id), ...slots.flatMap((x) => x.counters.map((c) => c.id)), ...p.bucket.map((b) => b.guarantee.id), ...p.other.map((o) => o.id)]
}

const boxesOf = (g) => {
  const out = []
  for (const n of g.nodes) {
    if (n.type === 'rnode') out.push({ id: n.id, x: n.position.x, y: n.position.y, w: n.data.w, h: n.data.h })
    if (n.type === 'chainClaim') out.push({ id: n.id, x: n.position.x, y: n.position.y, w: n.data.w, h: n.data.h })
  }
  const layer = g.nodes.find((n) => n.type === 'chainLayer')
  layer.data.empties.forEach((e, i) => out.push({ id: `empty${i}`, x: e.x, y: e.y, w: e.w, h: e.h }))
  return out
}
const overlaps = (boxes) => {
  const out = []
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]
      const b = boxes[j]
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) out.push([a.id, b.id])
    }
  }
  return out
}
function assertSound(s, label) {
  const g = buildChainGraph(s, {})
  assert.deepEqual(g.errors, [], `${label}: valid`)
  const ids = placed(s)
  assert.deepEqual([...ids].sort(), s.relations.map((r) => r.id).sort(), `${label}: every relation in exactly one place`)
  const boxes = boxesOf(g)
  assert.deepEqual(overlaps(boxes), [], `${label}: no two boxes overlap`)
  for (const b of boxes) assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= g.size.width && b.y + b.h <= g.size.height, `${label}: ${b.id} inside the content`)
  // every party is drawn somewhere, or is only named in a claim / list (a party nothing relates to cannot exist: validation allows it, the chain need not show it)
  return g
}

test('the guarantee chain is the relationship diagram\'s third kind', () => {
  registerKnowledge('relationship', relationshipKnowledge)
  assert.deepEqual(layoutKindsOf('relationship'), ['graph', 'focus', 'chain'])
})

for (const f of files) {
  test(`${f}: every relation in one place, no overlap`, () => {
    assertSound(load(f), f)
  })
}

test('a guarantee is tied by secures, whatever else the creditor has', () => {
  const s = spec(
    [entity('c'), entity('d1'), entity('d2'), entity('g')],
    [rel('r1', 'c', 'd1', 'debt'), rel('r2', 'c', 'd2', 'debt'), rel('r3', 'g', 'c', 'guarantee', { secures: 'r2' })],
  )
  const p = classify(s)
  assert.equal(p.slots.get('r2').length, 1)
  assert.equal(p.slots.get('r2')[0].inferred, false)
  assert.equal(p.slots.get('r1').length, 0)
  assert.equal(p.bucket.length, 0)
  assertSound(s, 'secures')
})

test('inference: the creditor has exactly one claim and the guarantor is not its debtor', () => {
  const s = spec([entity('c'), entity('d'), entity('g')], [rel('r1', 'c', 'd', 'debt'), rel('r2', 'g', 'c', 'guarantee')])
  const p = classify(s)
  assert.equal(p.slots.get('r1').length, 1)
  assert.equal(p.slots.get('r1')[0].inferred, true)
  assert.equal(p.bucket.length, 0)
  const g = assertSound(s, 'inferred')
  assert.equal(g.inferred, 1)
  const chip = g.nodes.find((n) => n.type === 'chainLayer').data.chips.find((c) => c.kind === 'guarantee')
  assert.match(chip.text, /inferred/, 'the label says so')
  const link = g.nodes.find((n) => n.type === 'chainLayer').data.links.find((l) => l.kind === 'guarantee')
  assert.equal(link.dotted, true, 'a dotted link')
})

test('no inference when it is ambiguous, none, or the guarantor owes the claim', () => {
  const two = spec([entity('c'), entity('d1'), entity('d2'), entity('g')], [rel('r1', 'c', 'd1', 'debt'), rel('r2', 'c', 'd2', 'debt'), rel('r3', 'g', 'c', 'guarantee')])
  assert.deepEqual(classify(two).bucket.map((b) => [b.guarantee.id, b.reason, b.candidates.map((c) => c.id)]), [['r3', 'many', ['r1', 'r2']]])
  const none = spec([entity('c'), entity('d'), entity('g'), entity('x')], [rel('r1', 'c', 'd', 'debt'), rel('r2', 'g', 'x', 'guarantee')])
  assert.deepEqual(classify(none).bucket.map((b) => [b.guarantee.id, b.reason]), [['r2', 'none']])
  const self = spec([entity('c'), entity('d')], [rel('r1', 'c', 'd', 'debt'), rel('r2', 'd', 'c', 'guarantee')])
  assert.deepEqual(classify(self).bucket.map((b) => [b.guarantee.id, b.reason]), [['r2', 'self']])
  for (const s of [two, none, self]) {
    const g = assertSound(s, 'bucket')
    assert.equal(g.bucket, 1)
    assert.equal(g.inferred, 0)
  }
})

test('what stands behind a guarantor: a contract with the debtor, or a guarantee from the debtor', () => {
  const s = spec(
    [entity('c'), entity('d'), entity('g'), entity('h')],
    [
      rel('r1', 'c', 'd', 'debt'),
      rel('r2', 'g', 'c', 'guarantee', { secures: 'r1' }),
      rel('r3', 'd', 'g', 'contract'), // the debtor and the guarantor: a counter-guarantee contract
      rel('r4', 'h', 'c', 'guarantee', { secures: 'r1' }),
      rel('r5', 'd', 'h', 'guarantee'), // the debtor guarantees the guarantor: names no claim, but it is the counter-guarantee
      rel('r6', 'c', 'g', 'contract'), // between the creditor and the guarantor: not behind the guarantor, in the rest
    ],
  )
  const p = classify(s)
  const slot = (id) => p.slots.get('r1').find((x) => x.guarantee.id === id)
  assert.deepEqual(slot('r2').counters.map((c) => c.id), ['r3'])
  assert.deepEqual(slot('r4').counters.map((c) => c.id), ['r5'])
  assert.deepEqual(p.bucket, [])
  assert.deepEqual(p.other.map((o) => o.id), ['r6'])
  const g = assertSound(s, 'counters')
  assert.equal(g.counters, 2)
})

test('a contract is a claim only when a guarantee names it', () => {
  const alone = spec([entity('a'), entity('b')], [rel('r1', 'a', 'b', 'contract')])
  assert.deepEqual(classify(alone).claims, [])
  const named = spec([entity('a'), entity('b'), entity('g')], [rel('r1', 'a', 'b', 'contract'), rel('r2', 'g', 'a', 'guarantee', { secures: 'r1' })])
  assert.deepEqual(classify(named).claims.map((c) => c.id), ['r1'])
  assertSound(named, 'contract claim')
})

test('no claims: the view says so and lists every relation; no guarantors: "no security"', () => {
  const eq = spec([entity('a'), entity('b'), entity('c')], [rel('r1', 'a', 'b', 'equity', { share: 50 }), rel('r2', 'b', 'c', 'equity', { share: 100 })])
  const g = assertSound(eq, 'no claims')
  const layer = g.nodes.find((n) => n.type === 'chainLayer').data
  assert.equal(g.claims, 0)
  assert.ok(layer.empties.some((e) => e.text === translate('en', 'rel.chain.noClaims')))
  assert.equal(layer.texts.length, 2, 'both relations listed')
  const bare = spec([entity('a'), entity('b')], [rel('r1', 'a', 'b', 'debt', { amount: '1 万元' })])
  const gb = assertSound(bare, 'unsecured')
  assert.equal(gb.unsecured, 1)
  assert.equal(gb.nodes.find((n) => n.type === 'chainClaim').data.tail, translate('en', 'rel.chain.none'), 'the claim card says it has no security')
})

test('the claim title carries the amount as written', () => {
  assert.equal(claimTitle({ label: '借款', amount: '3000 万元' }, '债权，3000 万元'), '借款  3000 万元')
  assert.equal(claimTitle({ label: '借款' }, 'x'), '借款')
  assert.equal(claimTitle({ amount: '3000 万元' }, '债权，3000 万元'), '债权，3000 万元', 'no label: the default text already has it')
})

test('a big case stays clear: many claims, guarantors, counters and others', () => {
  const ents = Array.from({ length: 20 }, (_, i) => entity(`p${i}`, { label: `A party with a rather long name number ${i}`, role: `Role ${i}` }))
  const relations = []
  for (let i = 0; i < 5; i++) relations.push(rel(`d${i}`, 'p0', `p${1 + i}`, 'debt', { label: `Loan number ${i}`, amount: `${i + 1} million` }))
  for (let i = 0; i < 12; i++) relations.push(rel(`g${i}`, `p${6 + (i % 8)}`, 'p0', 'guarantee', { label: `Guarantee ${i}`, secures: `d${i % 5}` }))
  for (let i = 0; i < 6; i++) relations.push(rel(`c${i}`, `p${1 + (i % 5)}`, `p${6 + i}`, 'contract', { label: `Counter ${i}` }))
  for (let i = 0; i < 12; i++) relations.push(rel(`e${i}`, `p${i}`, `p${(i + 3) % 20}`, 'equity', { share: 10 + i }))
  assertSound(spec(ents, relations), 'big')
})

test('the layout is the same every time; a spec with problems is reported, not drawn', () => {
  const s = load('sample-group-guarantee.zh-CN.json')
  assert.deepEqual(buildChainGraph(s, {}), buildChainGraph(s, {}))
  const bad = buildChainGraph(spec([entity('a')], [rel('r1', 'a', 'nowhere', 'debt')]), {})
  assert.ok(bad.errors.length > 0)
  assert.deepEqual(bad.nodes, [])
})

test('the example with a counter-guarantee shows it', () => {
  const g = assertSound(load('sample-group-guarantee.zh-CN.json'), 'group guarantee')
  assert.equal(g.claims, 1)
  assert.equal(g.guarantors, 2)
  assert.equal(g.counters, 1)
  assert.equal(g.inferred, 0)
  assert.equal(g.other, 5)
})

test('the geometry report speaks of claims, inference and the bucket', () => {
  const s = spec([entity('c'), entity('d'), entity('g'), entity('x'), entity('y')], [rel('r1', 'c', 'd', 'debt'), rel('r2', 'g', 'c', 'guarantee'), rel('r3', 'x', 'y', 'guarantee')])
  const r = layoutReport(s, { kind: 'chain' })
  assert.equal(r.ok, true)
  assert.equal(r.kind, 'chain')
  const text = formatLayoutReport(r)
  assert.match(text, /^Kind: chain/m)
  assert.match(text, /1 claim\(s\): 1 guarantor\(s\)/)
  assert.match(text, /1 guarantee\(s\) tied to their claim by inference/)
  assert.match(text, /1 guarantee\(s\) tied to no claim/)
  const none = formatLayoutReport(layoutReport(spec([entity('a'), entity('b')], [rel('r1', 'a', 'b', 'equity')]), { kind: 'chain' }))
  assert.match(none, /No claims/)
})

test('every chain message exists in both languages', () => {
  const keys = ['graphKind.chain', 'rel.chain.colClaims', 'rel.chain.colGuarantors', 'rel.chain.colCounter', 'rel.chain.creditor', 'rel.chain.debtor', 'rel.chain.partyA', 'rel.chain.partyB', 'rel.chain.none', 'rel.chain.inferred', 'rel.chain.noClaims', 'rel.chain.noClaimsHint']
  const vars = { g: 2, c: 1, n: 3, creditor: 'X', claims: 'Y' }
  for (const lang of ['en', 'zh']) {
    for (const key of [...keys, 'rel.chain.count', 'rel.chain.inferredNote', 'rel.chain.bucket', 'rel.chain.other', 'rel.chain.reason.none', 'rel.chain.reason.many', 'rel.chain.reason.self']) {
      const text = translate(lang, key, vars)
      assert.ok(text && !text.startsWith('rel.') && !text.startsWith('graphKind.'), `${lang} ${key}`)
    }
  }
})

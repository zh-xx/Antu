// ============================================================
//  test/relationship.test.mjs — the relationship diagram: validation and layout (pure functions)
//
//  Three things are pinned:
//    1. validation catches each rule of spec/relationship/schema-draft.md §5 and points at the
//       right place (errors carry the field path and the entity / relation id)
//    2. hints are separate from errors: they never stop the drawing
//    3. the layout works out: both orientations, no overlapping entities, camps side by side,
//       every link starts and ends on the boundary of its two entities
// ============================================================

import { test } from 'node:test'
import assert from 'node:assert/strict'

import '../src/renderers/index.js'
import { validateSpec } from '../src/core/validate.js'
import { knowledgeOf } from '../src/core/registry.js'
import { translate } from '../src/core/i18n.js'
import { validateRelationship, hintsOfRelationship, isDirected } from '../src/renderers/relationship/graph/rules.js'
import { buildRelationshipGraph, labelOf } from '../src/renderers/relationship/graph/layout.js'
import { describeSchema, layoutReport, formatLayoutReport, notesOf } from '../tools/mcp/engine.mjs'
import { midpointOf, nearestOn, securesTies } from '../src/renderers/relationship/graph/secures.js'

/** The spec's example: a loan, a guarantee, a shareholding and a marriage, in two camps */
const base = () => ({
  type: 'relationship',
  title: 'Zhang San v. Li Si',
  asOf: '2023-03-10',
  groups: [
    { id: 'g-1', label: 'Creditor side' },
    { id: 'g-2', label: 'Debtor side' },
  ],
  entities: [
    { id: 'e-1', kind: 'person', label: 'Zhang San', role: 'Lender', groupId: 'g-1' },
    { id: 'e-2', kind: 'person', label: 'Li Si', role: 'Borrower', groupId: 'g-2' },
    { id: 'e-3', kind: 'person', label: 'Wang Wu', role: 'Guarantor', groupId: 'g-2' },
    { id: 'e-4', kind: 'company', label: 'Xinghe Trading Co.', groupId: 'g-2' },
    { id: 'e-5', kind: 'person', label: 'Zhao Liu', role: "Li Si's spouse", groupId: 'g-2' },
  ],
  relations: [
    { id: 'r-1', from: 'e-1', to: 'e-2', kind: 'debt', label: 'Loan', amount: 'CNY 500,000', sourceIds: ['s-1'] },
    { id: 'r-2', from: 'e-3', to: 'e-1', kind: 'guarantee', label: 'Joint and several guarantee', secures: 'r-1', sourceIds: ['s-2'] },
    { id: 'r-3', from: 'e-2', to: 'e-4', kind: 'equity', share: 60, sourceIds: ['s-3'] },
    { id: 'r-4', from: 'e-2', to: 'e-5', kind: 'kinship', label: 'Spouses' },
  ],
  sources: [
    { id: 's-1', type: 'contract', name: 'Loan contract', loc: { file: 'loan-contract.pdf', page: 1 } },
    { id: 's-2', type: 'contract', name: 'Guarantee contract', loc: { file: 'guarantee.pdf', page: 1 } },
    { id: 's-3', type: 'evidence', name: 'Business registration record', loc: { file: 'registry.pdf', page: 2 } },
  ],
})
const some = (errs, re) => errs.some((e) => re.test(e))

test('the spec example: valid, no hints, both orientations lay out', () => {
  assert.deepEqual(validateRelationship(base()), [])
  assert.deepEqual(validateSpec(base()), [], 'the registry dispatches relationship to its validator')
  assert.deepEqual(hintsOfRelationship(base()), [])
  for (const dir of ['vertical', 'horizontal']) {
    const g = buildRelationshipGraph(base(), {}, undefined, dir)
    assert.deepEqual(g.errors, [], dir)
    assert.equal(g.edges.length, 0, 'edges are always empty: links are drawn by our own layer')
    assert.equal(g.nodes.length, 5, 'not one entity may be lost')
    assert.equal(g.connections.length, 4, 'not one relation may be lost')
    assert.ok(g.size.width > 0 && g.size.height > 0)
  }
})

test('validation catches each error rule of the spec (§5, rules 1 to 12)', () => {
  const cases = [
    ['entities empty (1)', (s) => { s.entities = [] }, /entities.*must not be empty/],
    ['relations empty (1)', (s) => { s.relations = [] }, /relations.*must not be empty/],
    ['entity without id (2)', (s) => { delete s.entities[1].id }, /entities\[1\].*missing required field `id`/],
    ['duplicate entity id (2)', (s) => { s.entities[1].id = 'e-1' }, /duplicates an earlier entity/],
    ['duplicate relation id (2)', (s) => { s.relations[1].id = 'r-1' }, /duplicates an earlier relation/],
    ['entity kind not in the enum (3)', (s) => { s.entities[0].kind = 'human' }, /kind is "human"/],
    ['relation kind not in the enum (3)', (s) => { s.relations[0].kind = 'loan' }, /kind is "loan"/],
    ['entity without a label (4)', (s) => { delete s.entities[2].label }, /entities\[2\].*missing required field `label`/],
    ['from does not exist (5)', (s) => { s.relations[0].from = 'e-99' }, /`from` refers to a non-existent entity "e-99"/],
    ['to does not exist (5)', (s) => { s.relations[0].to = 'e-99' }, /`to` refers to a non-existent entity "e-99"/],
    ['a relation from an entity to itself (6)', (s) => { s.relations[0].to = 'e-1' }, /cannot be related to itself/],
    ['the same relation twice (7)', (s) => { s.relations.push({ ...s.relations[3], id: 'r-9' }) }, /duplicate relation e-2 -> e-5/],
    ['groupId does not exist (8)', (s) => { s.entities[0].groupId = 'g-9' }, /`groupId` refers to a non-existent group "g-9"/],
    ['sourceIds does not exist (8)', (s) => { s.relations[0].sourceIds = ['s-9'] }, /`sourceIds` refers to a non-existent source "s-9"/],
    ['share out of range (9)', (s) => { s.relations[2].share = 120 }, /`share` must be a number from 0 to 100/],
    ['share on a kind that has none (9)', (s) => { s.relations[0].share = 10 }, /`share` only belongs on a relation of kind equity/],
    ['amount on a kind that has none (10)', (s) => { s.relations[2].amount = 'CNY 1' }, /`amount` only belongs on a relation of kind debt \/ contract/],
    ['secures on a kind that has none (11)', (s) => { s.relations[0].secures = 'r-2' }, /`secures` only belongs on a relation of kind guarantee/],
    ['secures points nowhere (11)', (s) => { s.relations[1].secures = 'r-99' }, /`secures` refers to a non-existent relation "r-99"/],
    ['secures points at something that is not a claim (11)', (s) => { s.relations[1].secures = 'r-3' }, /a guarantee secures a claim \(debt \/ contract\)/],
    ['asOf is not a date (12)', (s) => { s.asOf = 'last March' }, /asOf: "last March" is not an ISO date/],
  ]
  for (const [name, mutate, re] of cases) {
    const s = base()
    mutate(s)
    const errs = validateRelationship(s)
    assert.ok(errs.length > 0, `${name}: should report an error but passed`)
    assert.ok(some(errs, re), `${name}: the error must point at the right thing, got ${JSON.stringify(errs)}`)
  }
})

test('errors carry the field path and the id (so an agent can fix them)', () => {
  const s = base()
  s.relations[1].secures = 'r-99'
  const errs = validateRelationship(s)
  assert.ok(errs.some((e) => e.includes('relations[1] (r-2)')), 'must say which relation')
  assert.ok(errs.some((e) => e.includes('r-99')), 'must say which id')
})

test('hints (rules 13 to 16) are hints: they never fail validation or stop the layout', () => {
  const s = base()
  s.entities.push({ id: 'e-6', kind: 'company', label: 'Second holder' }) // no relation at all (14)
  s.entities.push({ id: 'e-7', kind: 'person', label: 'Another holder' })
  s.relations.push({ id: 'r-5', from: 'e-7', to: 'e-4', kind: 'equity', share: 50 }) // 60 + 50 into e-4 (13)
  s.relations.push({ id: 'r-6', from: 'e-3', to: 'e-1', kind: 'guarantee', label: 'Mortgage' }) // no secures (15)
  s.relations.push({ id: 'r-7', from: 'e-4', to: 'e-2', kind: 'equity', share: 5 }) // e-2 -> e-4 -> e-2 (16)
  assert.deepEqual(validateRelationship(s), [], 'hints are not errors')
  const hints = hintsOfRelationship(s)
  assert.ok(some(hints, /add up to 110%/), `rule 13: ${JSON.stringify(hints)}`)
  assert.ok(some(hints, /Second holder.*no relation to anyone/), 'rule 14')
  assert.ok(some(hints, /does not say which claim it secures/), 'rule 15')
  assert.ok(some(hints, /shareholdings loop back/), 'rule 16')
  const g = buildRelationshipGraph(s)
  assert.deepEqual(g.errors, [], 'a hint must not stop the layout')
  assert.equal(g.nodes.length, 7)
  assert.ok(g.hints.length >= 4)
  // antu_validate shows them after a pass
  assert.deepEqual(notesOf(s), hints)
})

test('invalid data is not laid out: errors only, never half a diagram', () => {
  const s = base()
  s.relations[0].to = 'e-99'
  const g = buildRelationshipGraph(s)
  assert.ok(g.errors.length > 0)
  assert.equal(g.nodes.length, 0)
  assert.equal(g.connections.length, 0)
})

test('directed: contract and kinship have no arrowhead by default, the rest do; directed overrides', () => {
  assert.equal(isDirected({ kind: 'debt' }), true)
  assert.equal(isDirected({ kind: 'equity' }), true)
  assert.equal(isDirected({ kind: 'contract' }), false)
  assert.equal(isDirected({ kind: 'kinship' }), false)
  assert.equal(isDirected({ kind: 'kinship', directed: true }), true)
  assert.equal(isDirected({ kind: 'debt', directed: false }), false)
  const g = buildRelationshipGraph(base())
  assert.equal(g.connections.find((c) => c.relationId === 'r-4').directed, false)
  assert.equal(g.connections.find((c) => c.relationId === 'r-1').directed, true)
})

test('the default label follows the interface language and never replaces the author\'s', () => {
  const r = { kind: 'equity', share: 60 }
  assert.equal(labelOf(r), 'Holds 60%')
  assert.equal(labelOf(r, (k, v) => translate('zh', k, v)), '持股 60%')
  assert.equal(labelOf({ kind: 'debt', amount: 'CNY 5' }), 'Claim, CNY 5')
  assert.equal(labelOf({ kind: 'debt', label: 'Loan' }), 'Loan')
  const g = buildRelationshipGraph(base(), { t: (k, v) => translate('zh', k, v) })
  assert.equal(g.connections.find((c) => c.relationId === 'r-3').label, '持股 60%', 'fields.t reaches the label')
})

test('both orientations: no entities overlap, and every camp box holds its own members', () => {
  for (const dir of ['vertical', 'horizontal']) {
    const g = buildRelationshipGraph(base(), {}, undefined, dir)
    const boxes = g.nodes.map((n) => ({ id: n.id, x: n.position.x, y: n.position.y, w: n.data.w, h: n.data.h }))
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i]
        const b = boxes[j]
        const overlap = a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5
        assert.ok(!overlap, `${dir}: ${a.id} overlaps ${b.id}`)
      }
    }
    assert.equal(g.groupBoxes.length, 2)
    const inside = (n, gb) => n.x >= gb.x - 0.5 && n.y >= gb.y - 0.5 && n.x + n.w <= gb.x + gb.w + 0.5 && n.y + n.h <= gb.y + gb.h + 0.5
    const spec = base()
    for (const gb of g.groupBoxes) {
      for (const e of spec.entities) {
        const n = boxes.find((b) => b.id === e.id)
        assert.equal(inside(n, gb), e.groupId === gb.groupId, `${dir}: ${e.id} and the box "${gb.label}"`)
      }
    }
    const [a, b] = g.groupBoxes
    const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y
    assert.ok(apart, `${dir}: the two camp boxes overlap`)
  }
})

test('camps stand side by side in the order written, and whoever is in no group stands between two camps', () => {
  const s = base()
  s.entities.push({ id: 'e-6', kind: 'organization', label: 'Guarantee Fund' })
  s.relations.push({ id: 'r-5', from: 'e-6', to: 'e-1', kind: 'guarantee', label: 'Backstop', secures: 'r-1' })
  const g = buildRelationshipGraph(s)
  const [first, second] = g.groupBoxes
  assert.equal(first.label, 'Creditor side')
  assert.ok(first.x < second.x, 'the first group stands left of the second')
  const loose = g.nodes.find((n) => n.id === 'e-6').position
  assert.ok(loose.x >= first.x + first.w && loose.x + 20 <= second.x, 'the ungrouped party stands between the two camps')
  // groups switched off: no boxes, one camp
  const flat = buildRelationshipGraph(s, { groups: false })
  assert.equal(flat.groupBoxes.length, 0)
  assert.equal(flat.nodes.length, 6)
})

test('every link starts and ends on the boundary of its two entities, with a straight run into the target', () => {
  for (const dir of ['vertical', 'horizontal']) {
    const g = buildRelationshipGraph(base(), {}, undefined, dir)
    const at = new Map(g.nodes.map((n) => [n.id, { x: n.position.x, y: n.position.y, w: n.data.w, h: n.data.h }]))
    const onBorder = ([x, y], r) => {
      const inX = x >= r.x - 0.5 && x <= r.x + r.w + 0.5
      const inY = y >= r.y - 0.5 && y <= r.y + r.h + 0.5
      return (inX && (Math.abs(y - r.y) < 0.5 || Math.abs(y - (r.y + r.h)) < 0.5)) || (inY && (Math.abs(x - r.x) < 0.5 || Math.abs(x - (r.x + r.w)) < 0.5))
    }
    for (const c of g.connections) {
      assert.ok(c.points.length >= 2, `${dir}: ${c.id} has no route`)
      assert.ok(onBorder(c.points[0], at.get(c.from)), `${dir}: ${c.id} does not start on ${c.from}`)
      assert.ok(onBorder(c.points.at(-1), at.get(c.to)), `${dir}: ${c.id} does not end on ${c.to}`)
      assert.ok(c.d.startsWith('M ') && c.dCurve.startsWith('M '), 'both path styles are drawn')
      if (c.points.length > 2) {
        const [p, q] = c.points.slice(-2)
        assert.ok(Math.hypot(q[0] - p[0], q[1] - p[1]) >= 10.5, `${dir}: ${c.id} enters its entity after a run under 11px`)
      }
      // the label box lies inside the picture
      assert.ok(c.labelAt.x >= 0 && c.labelAt.y >= 0, `${dir}: ${c.id} label is past the top or left`)
      assert.ok(c.labelAt.x + c.labelSize.width <= g.size.width && c.labelAt.y + c.labelSize.height <= g.size.height, `${dir}: ${c.id} label is past the picture`)
    }
  }
})

test('a route never runs through an entity that is not one of its ends', () => {
  for (const dir of ['vertical', 'horizontal']) {
    const g = buildRelationshipGraph(base(), {}, undefined, dir)
    for (const c of g.connections) {
      for (const n of g.nodes.filter((n) => n.id !== c.from && n.id !== c.to)) {
        const r = { x: n.position.x, y: n.position.y, w: n.data.w, h: n.data.h }
        const hit = c.points.slice(1).some((q, i) => {
          const p = c.points[i]
          return Math.max(p[0], q[0]) > r.x && Math.min(p[0], q[0]) < r.x + r.w && Math.max(p[1], q[1]) > r.y && Math.min(p[1], q[1]) < r.y + r.h
        })
        assert.ok(!hit, `${dir}: ${c.id} runs through ${n.id}`)
      }
    }
  }
})

test('the same JSON always gives the same picture', () => {
  const a = buildRelationshipGraph(base())
  const b = buildRelationshipGraph(base())
  assert.deepEqual(a.connections.map((c) => c.points), b.connections.map((c) => c.points))
  assert.deepEqual(a.nodes.map((n) => n.position), b.nodes.map((n) => n.position))
})

test('a relationship with no groups is one camp; a lone entity is still drawn', () => {
  const s = base()
  delete s.groups
  s.entities.forEach((e) => delete e.groupId)
  s.entities.push({ id: 'e-6', kind: 'other', label: 'Nobody' })
  const g = buildRelationshipGraph(s)
  assert.deepEqual(g.errors, [])
  assert.equal(g.groupBoxes.length, 0)
  assert.equal(g.nodes.length, 6)
  assert.ok(some(g.hints, /Nobody.*no relation to anyone/))
})

test('past 25 entities the diagram is hinted, not refused', () => {
  const s = {
    type: 'relationship',
    title: 'Crowd',
    entities: Array.from({ length: 26 }, (_, i) => ({ id: `e-${i}`, kind: 'person', label: `Person ${i}` })),
    relations: Array.from({ length: 25 }, (_, i) => ({ id: `r-${i}`, from: `e-${i}`, to: `e-${i + 1}`, kind: 'other' })),
  }
  const g = buildRelationshipGraph(s)
  assert.deepEqual(g.errors, [])
  assert.ok(some(g.hints, /26 entities/))
})

test('MCP: the type is registered, the field table and the geometry report come from it', () => {
  assert.ok(knowledgeOf('relationship'), 'registered in renderers/index.js')
  const d = describeSchema('relationship')
  assert.ok(d.ok && d.text.includes('[relations]') && d.text.includes('secures') && d.text.includes('equity'), 'the field table is generated from the code')
  const r = layoutReport(base(), {})
  assert.equal(r.ok, true)
  assert.equal(r.counts.entities, 5)
  assert.equal(r.counts.relations, 4)
  assert.equal(r.suggestedOrientation, 'vertical')
  const text = formatLayoutReport(r)
  assert.match(text, /5 entities \/ 4 relations/)
  assert.match(text, /Suggested orientation: vertical/)
  assert.equal(knowledgeOf('relationship').summarize(base()).line, '5 entities / 4 relations / 2 groups')
})

test('every required field in the field table is required by the validator', () => {
  // The table and the validator must not tell two stories (the same guard as fact's): take away
  // each field the table marks required and the validator has to say so
  const fields = knowledgeOf('relationship').fields
  const at = { entities: (s) => s.entities[0], relations: (s) => s.relations[0], groups: (s) => s.groups[0] }
  let checked = 0
  for (const [group, rows] of Object.entries(fields)) {
    if (!at[group]) continue
    for (const row of rows.filter((r) => r.req === 'yes')) {
      const s = base()
      delete at[group](s)[row.name]
      assert.ok(validateRelationship(s).length > 0, `${group}.${row.name} is marked required but removing it passes`)
      checked += 1
    }
  }
  assert.ok(checked >= 8, `only ${checked} required fields were checked`)
})

test('rows are shared by every camp: a holder stands above what it holds, a creditor above the debtor, a guarantor above the creditor', () => {
  // The spec's example has the guarantor and the debtor in one camp and the creditor in the other. Worked out camp by
  // camp they would all stand on one row (nothing inside a camp relates them); worked out on the whole graph the
  // guarantor is above the creditor and the creditor above the debtor, whichever camp each is in.
  const at = (g, id) => g.nodes.find((n) => n.id === id).position
  const v = buildRelationshipGraph(base(), {}, undefined, 'vertical')
  assert.ok(at(v, 'e-3').y < at(v, 'e-1').y, 'guarantor (Wang Wu) above the creditor (Zhang San)')
  assert.ok(at(v, 'e-1').y < at(v, 'e-2').y, 'creditor above the debtor (Li Si)')
  assert.ok(at(v, 'e-2').y < at(v, 'e-4').y, 'the holder (Li Si) above the company he holds')
  const h = buildRelationshipGraph(base(), {}, undefined, 'horizontal')
  assert.ok(at(h, 'e-3').x < at(h, 'e-1').x && at(h, 'e-1').x < at(h, 'e-2').x, 'the same order, left to right, when horizontal')
  // and the stats count the shared rows
  assert.equal(v.stats.layers, 4)
  assert.equal(v.nodes.find((n) => n.id === 'e-4').data.layer, 3)
})

test('an entity carries what it is related to, for its overlay', () => {
  const g = buildRelationshipGraph(base())
  const li = g.nodes.find((n) => n.id === 'e-2').data.relations
  assert.equal(li.length, 3, 'Li Si: the loan, the shareholding, the marriage')
  const loan = li.find((r) => r.id === 'r-1')
  assert.deepEqual([loan.out, loan.other, loan.text, loan.directed], [false, 'Zhang San', 'Loan', true])
  assert.equal(li.find((r) => r.id === 'r-4').directed, false, 'a marriage has no arrow')
})

test('secures: the tie joins a guarantee to the claim it secures, and only when they are near', () => {
  assert.deepEqual(midpointOf([[0, 0], [0, 100]]), [0, 50])
  assert.deepEqual(midpointOf([[0, 0], [100, 0], [100, 100]]), [100, 0], 'halfway along the length, round a corner')
  assert.deepEqual(nearestOn([[0, 0], [100, 0]], [40, 30]), { at: [40, 0], d: 30 })
  assert.deepEqual(nearestOn([[0, 0], [100, 0]], [140, 0]).at, [100, 0], 'clamped to the end of the segment')
  const cs = [
    { id: 'r:claim', relationId: 'claim', points: [[0, 100], [200, 100]], secures: null },
    { id: 'r:g', relationId: 'g', points: [[100, 0], [100, 60]], secures: 'claim' },
    { id: 'r:far', relationId: 'far', points: [[100, -400], [100, -300]], secures: 'claim' },
    { id: 'r:none', relationId: 'none', points: [[0, 0], [10, 0]], secures: null },
  ]
  const ties = securesTies(cs)
  assert.equal(ties.length, 1, 'the far one would be a long slanting line and is left out')
  assert.deepEqual([ties[0].id, ties[0].claimId, ties[0].from, ties[0].to], ['r:g', 'r:claim', [100, 30], [100, 100]])
  assert.equal(securesTies(cs, 1000).length, 2, 'the distance is a parameter')
  const g = buildRelationshipGraph(base())
  assert.equal(g.connections.find((c) => c.relationId === 'r-2').secures, 'r-1', 'layout hands the renderer the pair')
})

test('text slack goes on Latin letters only, so a Chinese diagram is not left loose', () => {
  const latin = buildRelationshipGraph({ ...base(), entities: base().entities.map((e) => ({ ...e, label: 'Wang Wu Wang', role: undefined })) })
  const cjk = buildRelationshipGraph({ ...base(), entities: base().entities.map((e) => ({ ...e, label: '星河商贸有限公司', role: undefined })) })
  const w = (g) => g.nodes[0].data.textW
  assert.ok(w(latin) > 12 * 14 * 0.5, 'Latin text is given room for a bold face')
  assert.equal(w(cjk), Math.ceil(8 * 14), 'eight CJK characters are eight ems, not more')
})

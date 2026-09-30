// ============================================================
//  test/justification.test.mjs — the justification diagram: validation and layout
//
//  The specification is spec/justification/schema-draft.md; rule numbers below are its §5. The layout
//  is pure geometry (no browser). Same shape as test/relationship.test.mjs.
// ============================================================

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

import '../src/renderers/index.js'
import { validateSpec } from '../src/core/validate.js'
import { knowledgeOf } from '../src/core/registry.js'
import { validateJustification, hintsOfJustification } from '../src/renderers/justification/tree/rules.js'
import { buildJustificationGraph } from '../src/renderers/justification/tree/layout.js'
import { chainOf } from '../src/renderers/justification/tree/chain.js'
import { describeSchema, layoutReport, formatLayoutReport, notesOf } from '../tools/mcp/engine.mjs'

const base = () => ({
  type: 'justification',
  title: 'A small reasoning',
  speaker: 'The court',
  groups: [{ id: 'g-1', label: 'Issue 1' }],
  nodes: [
    { id: 'c-1', kind: 'conclusion', label: 'Guilty', holds: 'yes' },
    { id: 'n-1', kind: 'norm', label: 'Art. 1', sourceIds: ['s-1'], groupId: 'g-1' },
    { id: 'e-1', kind: 'element', label: 'The act', holds: 'yes', groupId: 'g-1' },
    { id: 'f-1', kind: 'fact', label: 'He did it', date: '2016-04-14T22:22', sourceIds: ['s-2'], groupId: 'g-1' },
    { id: 'f-2', kind: 'fact', label: 'A witness saw it', date: '2016-04-14', sourceIds: ['s-2'], groupId: 'g-1' },
  ],
  links: [
    { from: 'n-1', to: 'e-1', stance: 'basis' },
    { from: 'f-1', to: 'e-1' },
    { from: 'f-2', to: 'e-1', stance: 'for' },
    { from: 'e-1', to: 'c-1' },
  ],
  sources: [
    { id: 's-1', type: 'statute', name: 'Art. 1', loc: { lawName: 'Criminal Law', article: 1, version: '2015' } },
    { id: 's-2', type: 'case', name: 'Judgment', loc: { caseNo: '(2017) 1', court: 'A court' } },
  ],
})
const some = (errs, re) => errs.some((e) => re.test(e))

test('the spec example: valid, no hints, both orientations lay out', () => {
  const s = base()
  assert.deepEqual(validateJustification(s), [])
  assert.deepEqual(hintsOfJustification(s), [])
  for (const o of ['horizontal', 'vertical']) {
    const g = buildJustificationGraph(s, {}, undefined, o)
    assert.deepEqual(g.errors, [])
    assert.equal(g.nodes.length, 5)
    assert.equal(g.connections.length, 4)
    assert.equal(g.groupBoxes.length, 1)
    assert.ok(g.size.width > 0 && g.size.height > 0)
  }
})

test('validation catches each error rule of the spec (§5, rules 1 to 12)', () => {
  const bad = (mutate) => {
    const s = base()
    mutate(s)
    return validateJustification(s)
  }
  assert.ok(some(bad((s) => (s.nodes = [])), /`nodes` must not be empty/), '1')
  assert.ok(some(bad((s) => (s.links = [])), /`links` must not be empty/), '1')
  assert.ok(some(bad((s) => (s.nodes[1].id = 'c-1')), /duplicates an earlier node/), '2')
  assert.ok(some(bad((s) => (s.nodes[1].kind = 'law')), /not one of/), '3')
  assert.ok(some(bad((s) => delete s.nodes[1].label), /missing required field `label`/), '3')
  assert.ok(some(bad((s) => (s.links[0].to = 'x-9')), /non-existent node "x-9"/), '4')
  assert.ok(some(bad((s) => (s.links[1].to = 'f-1')), /cannot support itself/), '4')
  assert.ok(some(bad((s) => (s.links[1].stance = 'maybe')), /stance is "maybe"/), '5')
  assert.ok(some(bad((s) => (s.links[1].stance = 'basis')), /can only start from a norm/), '5')
  assert.ok(some(bad((s) => s.links.push({ from: 'f-1', to: 'e-1' })), /duplicate link/), '6')
  assert.ok(some(bad((s) => (s.nodes[1].groupId = 'g-9')), /non-existent group/), '7')
  assert.ok(some(bad((s) => (s.nodes[3].sourceIds = ['s-9'])), /non-existent source/), '7')
  assert.ok(some(bad((s) => (s.nodes[0].holds = 'maybe')), /must be "yes" or "no"/), '8')
  assert.ok(some(bad((s) => (s.nodes[3].holds = 'yes')), /does not hold or fail/), '8')
  assert.ok(some(bad((s) => (s.nodes[1].holds = 'no')), /does not hold or fail/), '8: a norm does not hold either')
  assert.ok(some(bad((s) => (s.nodes[2].date = '2016-04-14')), /only belongs on a fact/), '9')
  assert.ok(some(bad((s) => (s.nodes[3].date = 'last Tuesday')), /not an ISO date/), '9')
  assert.ok(some(bad((s) => (s.nodes[2].combine = 'both')), /`combine` is "both"/), '19: combine is all or any')
  assert.ok(some(bad((s) => (s.nodes[3].combine = 'all')), /only belongs on/), '19: a fact is not supported by other nodes')
  assert.ok(some(bad((s) => s.links.push({ from: 'c-1', to: 'e-1' })), /cycle/), '10')
  assert.ok(some(bad((s) => s.links.push({ from: 'e-1', to: 'f-1' })), /is a leaf/), '11: a fact has no supporter')
  assert.ok(some(bad((s) => s.links.push({ from: 'e-1', to: 'n-1' })), /is a leaf/), '11: nor a norm')
  assert.ok(some(bad((s) => (s.nodes[0].kind = 'judgement')), /no end conclusion/), '12')
})

test('errors carry the field path and the id (so an agent can fix them)', () => {
  const s = base()
  s.links[0].to = 'x-9'
  s.nodes[3].date = 'soon'
  const errs = validateJustification(s)
  assert.ok(errs.some((e) => e.includes('links[0]')))
  assert.ok(errs.some((e) => e.includes('nodes[3] (f-1)')))
})

test('hints (rules 13 to 18) are hints: they never fail validation or stop the layout', () => {
  const s = base()
  s.nodes.push({ id: 'c-2', kind: 'conclusion', label: 'Another end', groupId: 'g-1' })
  s.nodes.push({ id: 'f-3', kind: 'fact', label: 'A fact with nothing to do', groupId: 'g-1' })
  s.nodes.push({ id: 'n-2', kind: 'norm', label: 'A norm with no source', groupId: 'g-1' })
  s.nodes.push({ id: 'e-2', kind: 'element', label: 'Held on rejected grounds', holds: 'yes', groupId: 'g-1' })
  s.nodes.push({ id: 'j-1', kind: 'judgement', label: 'Rejected', holds: 'no', groupId: 'g-1' })
  s.links.push({ from: 'j-1', to: 'e-2' }, { from: 'n-2', to: 'e-2', stance: 'basis' }, { from: 'e-2', to: 'c-1' })
  const hints = hintsOfJustification(s)
  assert.ok(hints.some((h) => /conclusions end the diagram/.test(h)), '13')
  assert.ok(hints.some((h) => /f-3.*supports nothing/.test(h)), '14')
  assert.ok(hints.some((h) => /fact "A fact with nothing to do" has no source/.test(h)), '15')
  assert.ok(hints.some((h) => /norm "A norm with no source" has no source/.test(h)), '16')
  assert.ok(hints.some((h) => /e-2.*holds although everything that supports it is rejected/.test(h)), '17')
  assert.ok(hints.some((h) => /nothing supports "Another end"/.test(h)), '18')
  // a rejected element needs no support: e-2 is held on rejected grounds and has a norm, and a rejected one with none is not hinted
  const rej = base()
  rej.nodes.push({ id: 'e-9', kind: 'element', label: 'A defence that fails', holds: 'no', groupId: 'g-1' }, { id: 'j-9', kind: 'judgement', label: 'It does not stand', holds: 'yes', groupId: 'g-1' })
  rej.links.push({ from: 'j-9', to: 'e-9', stance: 'against' }, { from: 'e-9', to: 'c-1', stance: 'against' })
  assert.ok(!hintsOfJustification(rej).some((h) => /e-9/.test(h) && /nothing supports/.test(h)), '18: a rejected node needs no support')
  assert.deepEqual(validateJustification(s), [], 'hints are not errors')
  const g = buildJustificationGraph(s)
  assert.deepEqual(g.errors, [])
  assert.ok(g.hints.length >= hints.length)
})

test('invalid data is not laid out: errors only, never half a diagram', () => {
  const s = base()
  s.links[0].to = 'x-9'
  const g = buildJustificationGraph(s)
  assert.ok(g.errors.length > 0)
  assert.equal(g.nodes.length, 0)
  assert.equal(g.connections.length, 0)
})

test('validateSpec routes a justification to its own rules', () => {
  assert.deepEqual(validateSpec(base()), [])
  const s = base()
  s.nodes[0].holds = 'maybe'
  assert.ok(validateSpec(s).length > 0)
})

test('the six node kinds and the tree: the conclusion is the first layer, its supports come after', () => {
  const g = buildJustificationGraph(base(), {}, undefined, 'horizontal')
  const at = (id) => g.nodes.find((n) => n.id === id)
  // horizontal: layers run left to right
  assert.ok(at('c-1').position.x + at('c-1').data.w <= at('e-1').position.x, 'the conclusion stands before its element')
  assert.ok(at('e-1').position.x + at('e-1').data.w <= at('f-1').position.x, 'the element stands before its facts')
  const v = buildJustificationGraph(base(), {}, undefined, 'vertical')
  const atv = (id) => v.nodes.find((n) => n.id === id)
  assert.ok(atv('c-1').position.y + atv('c-1').data.h <= atv('e-1').position.y, 'vertically, the conclusion is on top')
  assert.ok(atv('e-1').position.y + atv('e-1').data.h <= atv('f-1').position.y)
})

test('the written order is kept among nodes that share a parent', () => {
  const s = base()
  for (const o of ['horizontal', 'vertical']) {
    const g = buildJustificationGraph(s, {}, undefined, o)
    const at = (id) => g.nodes.find((n) => n.id === id).position
    const key = o === 'horizontal' ? 'y' : 'x'
    assert.ok(at('f-1')[key] < at('f-2')[key], `${o}: the first fact written stands first`)
  }
})

test('no nodes overlap, and every issue box holds its own nodes', () => {
  const spec = JSON.parse(readFileSync('examples/justification/yuhuan-defense-excess.zh-CN.json', 'utf8'))
  for (const o of ['horizontal', 'vertical']) {
    const g = buildJustificationGraph(spec, {}, undefined, o)
    const rects = g.nodes.map((n) => ({ id: n.id, x: n.position.x, y: n.position.y, w: n.data.w, h: n.data.h, g: n.data.groupId }))
    for (let i = 0; i < rects.length; i += 1) {
      for (let j = i + 1; j < rects.length; j += 1) {
        const a = rects[i]
        const b = rects[j]
        const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y
        assert.ok(apart, `${o}: ${a.id} and ${b.id} overlap`)
      }
    }
    for (const box of g.groupBoxes) {
      for (const r of rects.filter((x) => x.g === box.groupId)) {
        assert.ok(r.x >= box.x && r.y >= box.y && r.x + r.w <= box.x + box.w && r.y + r.h <= box.y + box.h, `${o}: ${r.id} inside its issue box`)
      }
    }
  }
})

test('every link starts and ends on the boundary of its two nodes', () => {
  const spec = JSON.parse(readFileSync('examples/justification/yuhuan-defense-excess.zh-CN.json', 'utf8'))
  const g = buildJustificationGraph(spec, {}, undefined, 'horizontal')
  const rect = (id) => {
    const n = g.nodes.find((x) => x.id === id)
    return { x: n.position.x, y: n.position.y, w: n.data.w, h: n.data.h }
  }
  const onEdge = ([px, py], r) => {
    const insideX = px >= r.x - 0.6 && px <= r.x + r.w + 0.6
    const insideY = py >= r.y - 0.6 && py <= r.y + r.h + 0.6
    const onX = Math.abs(px - r.x) < 0.6 || Math.abs(px - (r.x + r.w)) < 0.6
    const onY = Math.abs(py - r.y) < 0.6 || Math.abs(py - (r.y + r.h)) < 0.6
    return (onX && insideY) || (onY && insideX)
  }
  for (const c of g.connections) {
    assert.ok(onEdge(c.points[0], rect(c.from)), `${c.id} starts on ${c.from}`)
    assert.ok(onEdge(c.points[c.points.length - 1], rect(c.to)), `${c.id} ends on ${c.to}`)
  }
})

test('the same JSON always gives the same picture', () => {
  const spec = JSON.parse(readFileSync('examples/justification/yuhuan-defense-excess.zh-CN.json', 'utf8'))
  const a = buildJustificationGraph(spec, {}, undefined, 'horizontal')
  const b = buildJustificationGraph(spec, {}, undefined, 'horizontal')
  assert.deepEqual(a.nodes.map((n) => n.position), b.nodes.map((n) => n.position))
  assert.deepEqual(a.connections.map((c) => c.points), b.connections.map((c) => c.points))
})

test('with no groups the whole diagram is one unboxed tree; a lone node is still drawn', () => {
  const s = base()
  delete s.groups
  for (const n of s.nodes) delete n.groupId
  const g = buildJustificationGraph(s)
  assert.deepEqual(g.errors, [])
  assert.equal(g.groupBoxes.length, 0)
  assert.equal(g.nodes.length, 5)
  // a node nothing supports and that supports nothing is a hint, and it is drawn
  s.nodes.push({ id: 'f-9', kind: 'fact', label: 'Alone' })
  const lone = buildJustificationGraph(s)
  assert.equal(lone.nodes.length, 6)
  assert.ok(lone.hints.some((h) => /f-9/.test(h)))
})

test('a node carries what it rests on and what it supports, for its overlay', () => {
  const g = buildJustificationGraph(base())
  const e = g.nodes.find((n) => n.id === 'e-1').data
  assert.equal(e.grounds.length, 3)
  assert.deepEqual(e.grounds.map((x) => x.stance).sort(), ['basis', 'for', 'for'])
  assert.equal(e.supports.length, 1)
  assert.equal(e.supports[0].id, 'c-1')
  const f = g.nodes.find((n) => n.id === 'f-1').data
  assert.equal(f.sourceCount, 1)
  assert.equal(f.groupLabel, 'Issue 1')
})

test('holds and stance are paint: the geometry does not depend on them', () => {
  const a = buildJustificationGraph(base())
  const s = base()
  s.nodes[2].holds = 'no'
  s.links[1].stance = 'against'
  const b = buildJustificationGraph(s)
  assert.deepEqual(a.nodes.map((n) => n.position), b.nodes.map((n) => n.position))
})

test('a link with a label is given a spot for it; one without is not', () => {
  const s = base()
  s.links[1].label = 'Limits the reduction'
  const g = buildJustificationGraph(s)
  const labelled = g.connections.filter((c) => c.label)
  assert.equal(labelled.length, 1)
  assert.ok(labelled[0].labelAt && labelled[0].labelSize)
  assert.ok(g.connections.filter((c) => !c.label).every((c) => c.labelAt === null))
})

test('MCP: the type is registered, the field table and the geometry report come from it', () => {
  const k = knowledgeOf('justification')
  assert.ok(k)
  assert.equal(typeof k.validate, 'function')
  assert.deepEqual(Object.keys(k.layouts), ['tree'])
  const d = describeSchema('justification')
  assert.equal(d.ok, true)
  assert.match(d.text, /kind\s+yes/)
  assert.match(d.text, /stance/)
  const r = layoutReport(base())
  assert.equal(r.ok, true)
  const text = formatLayoutReport(r)
  assert.match(text, /5 nodes/)
  assert.match(text, /Suggested orientation: horizontal/)
  assert.deepEqual(notesOf(base()), [])
})

test('every required field in the field table is required by the validator', () => {
  const k = knowledgeOf('justification')
  const required = {
    nodes: ['id', 'kind', 'label'],
    links: ['from', 'to'],
    groups: ['id', 'label'],
  }
  for (const [group, names] of Object.entries(required)) {
    const listed = k.fields[group].filter((f) => f.req === 'yes').map((f) => f.name)
    assert.deepEqual(listed, names, `${group}: the field table and the rules agree`)
  }
})

test('the real example: valid, no hints, 40 nodes in 5 issues', () => {
  for (const lang of ['zh-CN', 'en']) {
    const spec = JSON.parse(readFileSync(`examples/justification/yuhuan-defense-excess.${lang}.json`, 'utf8'))
    assert.deepEqual(validateJustification(spec), [], lang)
    assert.deepEqual(hintsOfJustification(spec), [], lang)
    const g = buildJustificationGraph(spec)
    // 40 nodes in the data; five facts are drawn twice, once in each issue that uses them
    assert.equal(g.stats.nodes, 40)
    assert.equal(g.stats.copies, 5)
    assert.equal(g.nodes.length, 45)
    assert.equal(g.connections.length, 48)
    assert.equal(g.groupBoxes.length, 5)
  }
})

test('a fact that supports several issues is one node in the data and is drawn once in each of them', () => {
  const s = base()
  s.groups.push({ id: 'g-2', label: 'Issue 2' })
  s.nodes.push(
    { id: 'c-2', kind: 'conclusion', label: 'A second conclusion', holds: 'yes', groupId: 'g-2' },
    { id: 'e-2', kind: 'element', label: 'Another element', holds: 'yes', groupId: 'g-2' },
  )
  s.links.push({ from: 'f-1', to: 'e-2' }, { from: 'e-2', to: 'c-2' }, { from: 'c-2', to: 'c-1' })
  for (const o of ['horizontal', 'vertical']) {
    const g = buildJustificationGraph(s, {}, undefined, o)
    assert.deepEqual(g.errors, [])
    const drawn = g.nodes.filter((n) => n.data.node.id === 'f-1')
    assert.equal(drawn.length, 2, `${o}: f-1 is drawn in both issues`)
    assert.equal(drawn.filter((n) => n.data.copyOf === null).length, 1, 'one original')
    assert.equal(drawn.filter((n) => n.data.copyOf === 'f-1').length, 1, 'one copy')
    assert.ok(drawn.every((n) => n.data.copies === 2))
    assert.notEqual(drawn[0].id, drawn[1].id, 'each has its own id')
    // each copy sits in the box of the issue whose element it supports
    const box = (gid) => g.groupBoxes.find((b) => b.groupId === gid)
    const inBox = (n, b) => n.position.x >= b.x && n.position.y >= b.y && n.position.x + n.data.w <= b.x + b.w && n.position.y + n.data.h <= b.y + b.h
    assert.equal(drawn.filter((n) => inBox(n, box('g-1'))).length, 1)
    assert.equal(drawn.filter((n) => inBox(n, box('g-2'))).length, 1)
    // the links keep the id of the node they stand for, and run between the placements
    const links = g.connections.filter((c) => c.fromNode === 'f-1')
    assert.equal(links.length, 2)
    assert.notEqual(links[0].from, links[1].from)
    assert.deepEqual(links.map((c) => c.toNode).sort(), ['e-1', 'e-2'])
  }
  // a fact that supports one issue only stands in that issue, whatever groupId it says
  const t = base()
  t.groups.push({ id: 'g-2', label: 'Issue 2' })
  t.nodes.push({ id: 'c-2', kind: 'conclusion', label: 'Second', holds: 'yes', groupId: 'g-2' }, { id: 'f-9', kind: 'fact', label: 'Says g-1, used in g-2', sourceIds: ['s-2'], groupId: 'g-1' })
  t.links.push({ from: 'f-9', to: 'c-2' }, { from: 'c-2', to: 'c-1' })
  const g = buildJustificationGraph(t)
  assert.equal(g.stats.copies, 0)
  const f = g.nodes.find((n) => n.id === 'f-9')
  const b2 = g.groupBoxes.find((b) => b.groupId === 'g-2')
  assert.ok(f.position.x >= b2.x && f.position.x + f.data.w <= b2.x + b2.w, 'f-9 stands in the second issue')
})

test('the layout of a diagram is remembered: the same content is laid out once', () => {
  const s = base()
  const a = buildJustificationGraph(s, {}, undefined, 'horizontal')
  const b = buildJustificationGraph(JSON.parse(JSON.stringify(s)), {}, undefined, 'horizontal')
  assert.equal(a, b, 'the same object comes back')
  const c = buildJustificationGraph(s, {}, undefined, 'vertical')
  assert.notEqual(a, c)
  s.nodes[0].label = 'Not guilty'
  assert.notEqual(buildJustificationGraph(s, {}, undefined, 'horizontal'), a, 'a change lays it out again')
})

test('looking at a node lights its chain: what it rests on, and what it leads to', () => {
  const g = buildJustificationGraph(base())
  const c = chainOf(g.connections, g.nodes, 'e-1')
  // the element rests on its norm and its two facts, and leads to the conclusion
  assert.deepEqual([...c.nodes].sort(), ['c-1', 'e-1', 'f-1', 'f-2', 'n-1'])
  assert.equal(c.lines.size, 4, 'all four links are in it')
  // a fact leads up to the element and the conclusion, and does not light the other fact
  const f = chainOf(g.connections, g.nodes, 'f-1')
  assert.deepEqual([...f.nodes].sort(), ['c-1', 'e-1', 'f-1'])
  assert.ok(!f.nodes.has('f-2'), 'a sibling is not in the chain')
  assert.ok(!f.nodes.has('n-1'), 'nor is the norm the element rests on')
  // the end conclusion rests on everything
  assert.equal(chainOf(g.connections, g.nodes, 'c-1').nodes.size, 5)
})

test('looking at a copy lights every copy of the fact, each with the way up from it', () => {
  const spec = JSON.parse(readFileSync('examples/justification/yuhuan-defense-excess.zh-CN.json', 'utf8'))
  const g = buildJustificationGraph(spec)
  const copies = g.nodes.filter((n) => n.data.node.id === 'f-2')
  assert.equal(copies.length, 2)
  const c = chainOf(g.connections, g.nodes, copies[0].id)
  assert.ok(copies.every((n) => c.nodes.has(n.id)), 'both copies light')
  // f-2 supports "cause" (issue 1) and "the victims' fault" (issue 5), so both chains up light
  const lit = new Set([...c.nodes].map((id) => g.nodes.find((n) => n.id === id).data.node.id))
  assert.ok(lit.has('e-1') && lit.has('c-2') && lit.has('j-5') && lit.has('c-5') && lit.has('c-1'))
  assert.ok(!lit.has('e-2'), 'an element it does not support is not lit')
})

test('the small examples for an agent: valid, no hints, each in both languages, small, and both orientations lay out', () => {
  const dir = 'examples/agent/justification/'
  const names = readdirSync(dir).filter((f) => f.endsWith('.json'))
  assert.equal(names.length, 12, 'six pairs')
  for (const f of names) {
    const text = readFileSync(dir + f, 'utf8')
    const spec = JSON.parse(text)
    assert.deepEqual(validateJustification(spec), [], f)
    assert.deepEqual(hintsOfJustification(spec), [], `${f}: no notes`)
    assert.ok(text.length < 2500, `${f}: small (${text.length} bytes)`)
    for (const o of ['horizontal', 'vertical']) assert.deepEqual(buildJustificationGraph(spec, {}, undefined, o).errors, [], `${f} ${o}`)
  }
  for (const stem of new Set(names.map((f) => f.replace(/\.(zh-CN|en)\.json$/, '')))) {
    const zh = JSON.parse(readFileSync(`${dir}${stem}.zh-CN.json`, 'utf8'))
    const en = JSON.parse(readFileSync(`${dir}${stem}.en.json`, 'utf8'))
    assert.deepEqual(zh.nodes.map((n) => [n.id, n.kind, n.holds]), en.nodes.map((n) => [n.id, n.kind, n.holds]), `${stem}: the pair has the same structure`)
    assert.deepEqual(zh.links.map((k) => [k.from, k.to, k.stance]), en.links.map((k) => [k.from, k.to, k.stance]), `${stem}: and the same links`)
  }
  // the shared-fact example draws its fact twice
  const shared = buildJustificationGraph(JSON.parse(readFileSync(`${dir}4-shared-fact.en.json`, 'utf8')))
  assert.equal(shared.stats.copies, 1)
})

test('the elevator case: valid, no hints, the rejected branches drawn, nothing overlaps', () => {
  for (const lang of ['zh-CN', 'en']) {
    const spec = JSON.parse(readFileSync(`examples/justification/elevator-smoking-liability.${lang}.json`, 'utf8'))
    assert.deepEqual(validateJustification(spec), [], lang)
    assert.deepEqual(hintsOfJustification(spec), [], lang)
    for (const o of ['horizontal', 'vertical']) {
      const g = buildJustificationGraph(spec, {}, undefined, o)
      assert.equal(g.stats.nodes, 34)
      assert.equal(g.groupBoxes.length, 3)
      assert.ok(g.nodes.filter((n) => n.data.node.holds === 'no').length >= 6, 'the rejected claims are drawn')
    }
  }
})

test('combine (and / or): valid values, hints when it has nothing to combine or contradicts holds (rules 19 to 21)', () => {
  const ok = base()
  ok.nodes[2].combine = 'all'
  assert.deepEqual(validateJustification(ok), [])
  assert.deepEqual(hintsOfJustification(ok), [], 'the element rests on a norm and two facts: two for-links to combine')
  // 19: fewer than two supporters
  const alone = base()
  alone.nodes[0].combine = 'any'
  assert.ok(hintsOfJustification(alone).some((h) => /c-1.*fewer than two links/.test(h)), '19')
  // 20: all, upheld, and something it rests on is rejected
  const bad = base()
  bad.nodes[2].combine = 'all'
  bad.nodes.push({ id: 'j-9', kind: 'judgement', label: 'Rejected', holds: 'no', groupId: 'g-1' })
  bad.links.push({ from: 'j-9', to: 'e-1' })
  assert.ok(hintsOfJustification(bad).some((h) => /e-1.*needs all it rests on, but "Rejected" is rejected/.test(h)), '20')
  // 21: any, rejected, and one of them holds
  const any = base()
  any.nodes[2].combine = 'any'
  any.nodes[2].holds = 'no'
  any.nodes.push({ id: 'j-8', kind: 'judgement', label: 'Upheld ground', holds: 'yes', groupId: 'g-1' })
  any.links.push({ from: 'j-8', to: 'e-1' })
  assert.ok(hintsOfJustification(any).some((h) => /e-1.*rejected although any one it rests on would do/.test(h)), '21')
  // and: combine changes no geometry
  const a = buildJustificationGraph(base())
  const b = buildJustificationGraph(ok)
  assert.deepEqual(a.nodes.map((n) => n.position), b.nodes.map((n) => n.position))
})

test('folding an issue keeps what it sums up to and says how many nodes it leaves out (#39)', () => {
  const spec = JSON.parse(readFileSync('examples/justification/yuhuan-defense-excess.zh-CN.json', 'utf8'))
  const open = buildJustificationGraph(spec, {}, undefined, 'horizontal')
  const one = buildJustificationGraph(spec, { collapsed: ['g-1'] }, undefined, 'horizontal')
  assert.equal(open.nodes.length, 45)
  // issue 1 draws 16 nodes (its conclusion, the norm, four elements and ten facts); only its conclusion stays
  assert.equal(one.nodes.length, 45 - 15)
  const box = (g, id) => g.groupBoxes.find((b) => b.groupId === id)
  assert.equal(box(one, 'g-1').collapsed, true)
  assert.equal(box(one, 'g-1').hidden, 15)
  assert.equal(box(one, 'g-1').total, 16)
  assert.equal(box(one, 'g-2').collapsed, false)
  assert.equal(box(one, 'g-2').hidden, 0)
  assert.ok(one.nodes.some((n) => n.id === 'c-2'), 'the issue conclusion stays')
  assert.ok(!one.nodes.some((n) => n.id === 'e-1'), 'its elements are left out')
  // the other issues are as they were, and the link from the kept conclusion to the end conclusion stays
  assert.ok(one.connections.some((c) => c.fromNode === 'c-2' && c.toNode === 'c-1'))
  assert.ok(one.size.height < open.size.height, 'the picture is shorter')
  // the data is not touched: the counts of the spec are the same
  assert.equal(one.stats.nodes, 40)
  assert.equal(one.stats.hidden, 15)
})

test('a fact that another issue still uses stays there when its own issue is folded', () => {
  const spec = JSON.parse(readFileSync('examples/justification/yuhuan-defense-excess.zh-CN.json', 'utf8'))
  const g = buildJustificationGraph(spec, { collapsed: ['g-1'] }, undefined, 'horizontal')
  // f-2 is written in issue 1 and drawn again in issue 5, which is open
  assert.ok(g.nodes.some((n) => n.data.node.id === 'f-2' && n.data.copyOf === 'f-2'), 'the copy in issue 5 stays')
  assert.ok(!g.nodes.some((n) => n.id === 'f-2'), 'and the one in the folded issue is gone')
  // what a kept node rests on is still told in its overlay, folded or not
  const rest = (gr) => gr.nodes.find((n) => n.id === 'c-2').data.grounds.length
  assert.equal(rest(g), rest(buildJustificationGraph(spec, {}, undefined, 'horizontal')))
})

test('folding every issue leaves the end conclusion and each issue\'s summary; unknown ids are ignored', () => {
  const spec = JSON.parse(readFileSync('examples/justification/yuhuan-defense-excess.zh-CN.json', 'utf8'))
  const ids = spec.groups.map((g) => g.id)
  const g = buildJustificationGraph(spec, { collapsed: ids }, undefined, 'horizontal')
  // issue 3 has no conclusion of its own: its element goes straight to the end conclusion, and is what it sums up to
  assert.deepEqual(g.nodes.map((n) => n.id).sort(), ['c-1', 'c-2', 'c-3', 'c-4', 'c-5', 'e-6'])
  assert.deepEqual(g.errors, [])
  const ignored = buildJustificationGraph(spec, { collapsed: ['g-nope'] }, undefined, 'horizontal')
  assert.equal(ignored.nodes.length, 45)
  for (const o of ['horizontal', 'vertical']) {
    const all = buildJustificationGraph(spec, { collapsed: ids }, undefined, o)
    assert.ok(all.size.width < 2000 && all.size.height < 1000, `${o}: all folded fits a screen (${all.size.width}x${all.size.height})`)
  }
  // folding is part of the layout cache key
  assert.notEqual(g, buildJustificationGraph(spec, {}, undefined, 'horizontal'))
  assert.equal(buildJustificationGraph(spec, { collapsed: [...ids].reverse() }, undefined, 'horizontal'), g, 'the order of the ids does not matter')
})

test('a single issue has nothing to fold into, and a folded issue can be opened again', () => {
  const s = base()
  const g = buildJustificationGraph(s, { collapsed: ['g-1'] }, undefined, 'horizontal')
  assert.deepEqual(g.errors, [])
  assert.ok(g.nodes.some((n) => n.id === 'c-1'))
  assert.ok(g.groupBoxes[0].collapsed)
  const open = buildJustificationGraph(s, { collapsed: [] }, undefined, 'horizontal')
  assert.equal(open.nodes.length, 5)
})

test('the real cases keep few crossings between their links (a bound, not a promise of zero)', async () => {
  const { routedCrossings } = await import('../src/renderers/justification/tree/crossings.js')
  // before the layouts were tried with several seeds: elevator 11 / 11, Yu Huan 6 / 5 (horizontal / vertical)
  const bound = { 'elevator-smoking-liability': 6, 'yuhuan-defense-excess': 5 }
  for (const [name, most] of Object.entries(bound)) {
    const spec = JSON.parse(readFileSync(`examples/justification/${name}.zh-CN.json`, 'utf8'))
    for (const o of ['horizontal', 'vertical']) {
      const g = buildJustificationGraph(spec, {}, undefined, o)
      const n = routedCrossings(g.connections.map((c) => c.points))
      assert.ok(n <= most, `${name} ${o}: ${n} crossings, at most ${most}`)
    }
  }
})

test('the small examples have no crossing at all', async () => {
  const { routedCrossings } = await import('../src/renderers/justification/tree/crossings.js')
  const dir = 'examples/agent/justification/'
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const g = buildJustificationGraph(JSON.parse(readFileSync(dir + f, 'utf8')), {}, undefined, 'horizontal')
    assert.equal(routedCrossings(g.connections.map((c) => c.points)), 0, f)
  }
})

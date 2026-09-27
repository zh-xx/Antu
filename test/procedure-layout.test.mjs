// ============================================================
//  test/procedure-layout.test.mjs — the procedure diagram: validation and layered layout
//  (pure functions)
//
//  Two things must be pinned:
//    1. validation catches bad data and points at the right place (errors carry the
//       field path and the node id)
//    2. layout works out (7 real contracts, both orientations, no overlapping nodes,
//       the main line is a straight line)
// ============================================================

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

import { validateProcedure, hintsOfProcedure, KINDS } from '../src/renderers/procedure/flow/rules.js'
import { buildProcedureGraph, toPathD } from '../src/renderers/procedure/flow/layout.js'
import { procedureKnowledge } from '../src/renderers/procedure/schema.js'
import { registerKnowledge, layoutOf, layoutKindsOf } from '../src/core/registry.js'

const DIR = 'examples/procedure'
// Examples are stored in pairs (<name>.zh-CN.json and <name>.en.json, see
// examples/README.md). **Only one language is scanned here**: the two have an identical
// graph structure and differ only in text values, so scanning both would run every
// assertion twice. And with a language suffix on every file name, "7 documents" no
// longer equals the number of JSON files in the directory.
const LANG = '.zh-CN.json'
const files = readdirSync(DIR)
  .filter((f) => f.endsWith(LANG))
  .sort()
const load = (f) => JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8'))
// Locate a document by its file name prefix rather than hard-coding the suffixed name
const byPrefix = (prefix) => files.find((f) => f.startsWith(prefix))
const base = () => load(byPrefix('02-'))
const some = (errs, re) => errs.some((e) => re.test(e))

test('seven real contracts: validation passes for all of them', () => {
  // This one reports "not a single file found" first, with the reason, so the later
  // assertions do not all go red and hide the root cause. It really happened once:
  // tests were run while the examples were being renamed to <name>.zh-CN.json.
  assert.ok(
    files.length > 0,
    `no *${LANG} files under examples/procedure. This happens while the paired rename ` +
      '(<name>.zh-CN.json / <name>.en.json) is still in progress; it recovers once done.',
  )
  assert.equal(files.length, 7, 'the corpus is 7 documents; if fewer, look again')
  for (const f of files) {
    assert.deepEqual(validateProcedure(load(f)), [], `${f} should have no errors`)
  }
})

test('seven real contracts: both orientations lay out and no nodes overlap', () => {
  for (const f of files) {
    for (const dir of ['vertical', 'horizontal']) {
      const g = buildProcedureGraph(load(f), {}, undefined, dir)
      assert.deepEqual(g.errors, [], `${f} / ${dir} does not lay out`)
      assert.equal(g.edges.length, 0, 'edges are always empty: links are drawn by our own layer')
      assert.ok(g.size.width > 0 && g.size.height > 0, `${f} / ${dir} size must be positive`)
      assert.equal(g.nodes.length, load(f).nodes.length, `${f}: not one node may be lost`)

      // no overlap: two nodes along the same direction must not sit on each other
      const boxes = g.nodes.map((n) => ({
        x: n.position.x,
        y: n.position.y,
        w: n.data.w,
        h: n.data.h,
        id: n.id,
      }))
      for (let i = 0; i < boxes.length; i += 1) {
        for (let j = i + 1; j < boxes.length; j += 1) {
          const a = boxes[i]
          const b = boxes[j]
          const overlap =
            a.x < b.x + b.w - 0.5 &&
            b.x < a.x + a.w - 0.5 &&
            a.y < b.y + b.h - 0.5 &&
            b.y < a.y + a.h - 0.5
          assert.ok(!overlap, `${f} / ${dir}: ${a.id} overlaps ${b.id}`)
        }
      }
    }
  }
})

test('the main line is a straight line when vertical (all in one column)', () => {
  const g = buildProcedureGraph(load(byPrefix('01-')), {}, undefined, 'vertical')
  const centers = g.spine.map((id) => {
    const n = g.nodes.find((x) => x.id === id)
    return n.position.x + n.data.w / 2
  })
  assert.ok(g.spine.length > 5, 'the main line of this data should have a dozen or so steps')
  assert.equal(new Set(centers.map((c) => Math.round(c))).size, 1, 'main line nodes must be aligned on one vertical line')
})

test('back edges are recognised, and the count matches what was measured', () => {
  const back01 = buildProcedureGraph(load(byPrefix('01-'))).stats.backEdges
  const back06 = buildProcedureGraph(load(byPrefix('06-'))).stats.backEdges
  const back07 = buildProcedureGraph(load(byPrefix('07-'))).stats.backEdges
  assert.equal(back01, 12, '01 has 9 back edges plus 3 added "extension returns to this stage" edges')
  assert.equal(back06, 3, '06: the rectification loop')
  assert.equal(back07, 0, '07 is acyclic')
})

test('several edges into the same target merge into one link', () => {
  const g = buildProcedureGraph(load(byPrefix('03-')))
  assert.equal(g.stats.groupedEdges, 3, '03 has 3 edges merged away (two groups flowing into the termination node)')
  assert.equal(g.stats.connections, g.stats.edges - g.stats.groupedEdges)
  const merged = g.connections.filter((c) => c.merged > 1)
  assert.equal(merged.length, 2, 'after merging there should be 2 links')
  assert.ok(merged.some((c) => c.label.includes(' / ')), 'merged conditions must be shown side by side')
})

test('sizes match what was measured: 06 has 20 layers, 05 has 16, 01 has 12', () => {
  const layers = (f) => buildProcedureGraph(load(byPrefix(f))).stats.layers
  assert.equal(layers('06-'), 20)
  assert.equal(layers('05-'), 16)
  assert.equal(layers('01-'), 12)
  assert.equal(layers('04-'), 5)
})

test('validation catches each of the thirteen rules', () => {
  const cases = [
    ['kind not in the vocabulary', (s) => { s.nodes[1].kind = 'desicion' }, /kind/],
    ['edge points at a non-existent node', (s) => { s.edges[0].to = 'n-99' }, /non-existent node/],
    ['self-loop', (s) => { s.edges[0].to = s.edges[0].from }, /self-loop/],
    ['duplicate edge', (s) => { s.edges.push({ ...s.edges[0] }) }, /duplicate edge/],
    ['a decision with too few outgoing edges', (s) => { s.edges = s.edges.filter((e) => e.from !== 'n-5' || e.to === 'n-6') }, /at least 2/],
    ['a decision edge with no condition', (s) => { delete s.edges.find((e) => e.from === 'n-5' && e.to === 'n-7').condition }, /has no condition/],
    ['a dead end that is not an end', (s) => { s.edges = s.edges.filter((e) => e.from !== 'n-10') }, /dead end/],
    ['no end node', (s) => { s.nodes.find((n) => n.id === 'n-11').kind = 'step' }, /end/],
    ['the main line broken', (s) => { delete s.edges.find((e) => e.from === 'n-6' && e.main).main }, /main line breaks at node/],
    ['dangling actorIds', (s) => { s.nodes[0].actorIds = ['a-9'] }, /non-existent actor/],
    ['dangling stageId', (s) => { s.nodes[0].stageId = 'st-9' }, /non-existent stage/],
    ['domain not in the enum', (s) => { s.domain = '合同流程' }, /domain/],
    ['an isolated cycle (unreachable)', (s) => {
      s.nodes.push({ id: 'n-20', kind: 'step', label: '孤儿甲' })
      s.nodes.push({ id: 'n-21', kind: 'end', label: '孤儿乙' })
      s.edges.push({ from: 'n-20', to: 'n-21' })
      s.edges.push({ from: 'n-21', to: 'n-20' })
    }, /unreachable/],
  ]
  for (const [name, mutate, re] of cases) {
    const s = base()
    mutate(s)
    const errs = validateProcedure(s)
    assert.ok(errs.length > 0, `${name}: should report an error but passed`)
    assert.ok(some(errs, re), `${name}: the error must point at the right thing, got ${JSON.stringify(errs)}`)
  }
})

test('errors carry the field path and the node id (so an agent can fix them)', () => {
  const s = base()
  s.edges[0].to = 'n-99'
  const errs = validateProcedure(s)
  assert.ok(errs.some((e) => e.includes('edges[0]')), 'must say which edge')
  assert.ok(errs.some((e) => e.includes('n-99')), 'must say which id')
})

test('the decision error offers two ways out (add conditions, or change kind to step)', () => {
  const s = base()
  delete s.edges.find((e) => e.from === 'n-5' && e.to === 'n-7').condition
  const err = validateProcedure(s).find((e) => e.includes('has no condition'))
  assert.ok(err.includes('step'), 'must suggest changing to step')
})

test('hints are separate from errors: several entries only hint, they do not block rendering', () => {
  const s = base()
  s.nodes.push({ id: 'n-20', kind: 'end', label: 'second entry' })
  assert.deepEqual(validateProcedure(s), [], 'several entries must not be an error')
  assert.ok(some(hintsOfProcedure(s), /entries/), 'but a hint must be given')
  const g = buildProcedureGraph(s)
  assert.deepEqual(g.errors, [], 'a hint must not stop the layout')
})

test('invalid data is not laid out: errors only, never half a diagram', () => {
  const s = base()
  s.edges[0].to = 'n-99'
  const g = buildProcedureGraph(s)
  assert.ok(g.errors.length > 0)
  assert.equal(g.nodes.length, 0)
  assert.equal(g.connections.length, 0)
})

test('polyline to SVG path: two points join directly, each extra corner gets a radius', () => {
  assert.equal(toPathD([[0, 0], [0, 100]]), 'M 0 0 L 0 100')
  const d = toPathD([[0, 0], [0, 50], [100, 50], [100, 100]])
  assert.ok(d.startsWith('M 0 0'))
  assert.equal((d.match(/Q/g) || []).length, 2, 'one radius per corner')
  assert.equal(toPathD([]), '')
})

test('knowledge registration: procedure is registered with the flow sub-type', () => {
  registerKnowledge('procedure', procedureKnowledge)
  assert.deepEqual(layoutKindsOf('procedure'), ['flow'])
  assert.equal(typeof layoutOf('procedure', 'flow'), 'function')
  assert.ok(KINDS.includes('decision'), 'the vocabulary contains the decision kind')
})

// ── Minimal examples for agents ──────────────────────────────
// These are not documentation but **runnable data**: change the schema and they fail,
// so they cannot drift quietly. Same rule as the fact batch.

const AGENT_DIR = 'examples/agent/procedure'
// Stored in pairs: `<name>.en.json` and `<name>.zh-CN.json`, identical in structure and
// differing only in text values. Both are runnable data and both must validate. "Six"
// counts paired prefixes, not files.
const agentFiles = readdirSync(AGENT_DIR).filter((f) => f.endsWith('.json')).sort()
const agentPairs = [...new Set(agentFiles.map((f) => f.replace(/\.(en|zh-CN)\.json$/i, '.json')))]

test('agent examples: six (each with an en and a zh-CN half), all validate and lay out', () => {
  assert.equal(agentPairs.length, 6)
  for (const base of agentPairs) {
    for (const lang of ['en', 'zh-CN']) {
      const f = `${base.replace(/\.json$/, '')}.${lang}.json`
      assert.ok(agentFiles.includes(f), `${f} missing: the two halves must pair up`)
    }
  }
  for (const f of agentFiles) {
    const spec = JSON.parse(readFileSync(`${AGENT_DIR}/${f}`, 'utf8'))
    assert.deepEqual(validateProcedure(spec), [], `${f} should have no errors`)
    for (const dir of ['vertical', 'horizontal']) {
      const g = buildProcedureGraph(spec, {}, undefined, dir)
      assert.deepEqual(g.errors, [], `${f} / ${dir} does not lay out`)
      assert.ok(g.size.width > 0 && g.size.height > 0)
    }
  }
})

test('agent examples: each under 2 KB (they are read by an agent, so keep them small)', () => {
  for (const f of agentFiles) {
    const bytes = readFileSync(`${AGENT_DIR}/${f}`).length
    assert.ok(bytes < 2048, `${f} is ${bytes} bytes, too large`)
  }
})

test('agent examples: no hints such as several entries (copying them hits no trap)', () => {
  for (const f of agentFiles) {
    const spec = JSON.parse(readFileSync(`${AGENT_DIR}/${f}`, 'utf8'))
    assert.deepEqual(hintsOfProcedure(spec), [], `${f} should produce no hints`)
  }
})

// ── Link geometry ────────────────────────────────────────────
// The renderer will draw connections from `points` verbatim, so the contract has to hold here:
// a link touches both boxes, and a back edge is routed outside the whole node field. Getting
// this wrong looks like a line floating in mid-air or crossing a node, which shows up only in a
// picture — exactly the kind of defect the unit layer should have caught first.

const withBoxes = (f, dir) => {
  const g = buildProcedureGraph(load(f), {}, undefined, dir)
  const box = new Map(
    g.nodes.map((n) => [n.id, { x: n.position.x, y: n.position.y, w: n.data.w, h: n.data.h }]),
  )
  return { g, box }
}

const onBoxBoundary = (p, b) => {
  const [x, y] = p
  const within = (v, lo, hi) => v >= lo - 0.5 && v <= hi + 0.5
  if (!within(x, b.x, b.x + b.w) || !within(y, b.y, b.y + b.h)) return false
  return (
    Math.abs(x - b.x) < 0.5 ||
    Math.abs(x - (b.x + b.w)) < 0.5 ||
    Math.abs(y - b.y) < 0.5 ||
    Math.abs(y - (b.y + b.h)) < 0.5
  )
}

test('every link begins and ends on the boundary of its two nodes', () => {
  for (const f of files) {
    for (const dir of ['vertical', 'horizontal']) {
      const { g, box } = withBoxes(f, dir)
      for (const c of g.connections) {
        const first = c.points[0]
        const last = c.points[c.points.length - 1]
        assert.ok(onBoxBoundary(first, box.get(c.from)), `${f}/${dir}: ${c.id} starts off the source box`)
        assert.ok(onBoxBoundary(last, box.get(c.to)), `${f}/${dir}: ${c.id} ends off the target box`)
        assert.ok(c.d.startsWith('M '), `${f}/${dir}: ${c.id} has no path`)
        for (const [x, y] of c.points) {
          assert.ok(Number.isFinite(x) && Number.isFinite(y), `${f}/${dir}: ${c.id} has a bad point`)
        }
      }
    }
  }
})

test('back edges are routed outside every node, so they cross nothing', () => {
  let checked = 0
  for (const f of files) {
    for (const dir of ['vertical', 'horizontal']) {
      const { g } = withBoxes(f, dir)
      const back = g.connections.filter((c) => c.kind === 'back')
      if (back.length === 0) continue
      const maxRight = Math.max(...g.nodes.map((n) => n.position.x + n.data.w))
      const maxBottom = Math.max(...g.nodes.map((n) => n.position.y + n.data.h))
      for (const c of back) {
        const lane = dir === 'vertical' ? c.points[1][0] : c.points[1][1]
        const limit = dir === 'vertical' ? maxRight : maxBottom
        assert.ok(lane > limit, `${f}/${dir}: ${c.id} runs inside the node field (lane ${lane} <= ${limit})`)
        checked += 1
      }
    }
  }
  assert.ok(checked > 20, `the corpus should contain back edges to check, saw ${checked}`)
})

test('a link carrying several conditions merges them into one label', () => {
  const g = buildProcedureGraph(load('03-labour-outsourcing-contract.zh-CN.json'))
  const merged = g.connections.filter((c) => c.merged > 1)
  assert.equal(merged.length, 2)
  for (const c of merged) {
    assert.ok(c.label.includes(' / '), 'merged conditions are joined with " / "')
    assert.equal(c.points.length, 4, 'a merged branch link is still one orthogonal polyline')
  }
})

// ── What the renderer relies on ──────────────────────────────
// The flowchart renderer draws straight from these fields, and the canvas fits the viewport
// (and the image export crops) to `size`. So anything outside `size` is cut off on screen and
// in the exported PNG, which is how the back-edge lanes were first found missing from it.

// One language of the agent examples is enough here (the pair shares its structure)
const agentEn = agentFiles.filter((f) => f.endsWith('.en.json'))
const loadAgent = (f) => JSON.parse(readFileSync(`${AGENT_DIR}/${f}`, 'utf8'))

test('every node and every link point lies inside the content size', () => {
  for (const f of files) {
    for (const dir of ['vertical', 'horizontal']) {
      const g = buildProcedureGraph(load(f), {}, undefined, dir)
      const { width, height } = g.size
      for (const n of g.nodes) {
        assert.ok(n.position.x >= 0 && n.position.x + n.data.w <= width, `${f}/${dir}: ${n.id} sticks out sideways`)
        assert.ok(n.position.y >= 0 && n.position.y + n.data.h <= height, `${f}/${dir}: ${n.id} sticks out vertically`)
      }
      for (const c of g.connections) {
        for (const [x, y] of c.points) {
          assert.ok(x >= 0 && x <= width && y >= 0 && y <= height, `${f}/${dir}: ${c.id} leaves the content box at (${x}, ${y})`)
        }
      }
    }
  }
})

test('the main-line links are exactly the spine, marked or inferred', () => {
  for (const [name, spec] of [...files.map((f) => [f, load(f)]), ...agentEn.map((f) => [f, loadAgent(f)])]) {
    const g = buildProcedureGraph(spec)
    const main = g.connections.filter((c) => c.kind === 'main')
    assert.equal(main.length, g.spine.length - 1, `${name}: one main link per step along the spine`)
    for (const c of main) {
      assert.equal(g.spine[g.spine.indexOf(c.from) + 1], c.to, `${name}: ${c.id} is not a spine step`)
    }
  }
  // The agent example with no `main` flags at all: the highlight must still follow the inferred spine
  const inferred = buildProcedureGraph(loadAgent('5-inferred-spine.en.json'))
  assert.ok(inferred.connections.some((c) => c.kind === 'main'), 'an inferred spine still gets main links')
})

test('stage bands follow the main line: in order, contiguous, never overlapping', () => {
  let checked = 0
  for (const f of files) {
    const spec = load(f)
    for (const dir of ['vertical', 'horizontal']) {
      const g = buildProcedureGraph(spec, {}, undefined, dir)
      if (!spec.stages?.length) {
        assert.equal(g.stageBands.length, 0, `${f}: no stages, no bands`)
        assert.equal(g.gutter, 0, `${f}: no stages, no gutter`)
        continue
      }
      assert.ok(g.stageBands.length > 0, `${f}/${dir}: stages written but no band drawn`)
      assert.ok(g.gutter > 0, `${f}/${dir}: bands need a gutter`)
      const along = dir === 'vertical' ? g.size.height : g.size.width
      g.stageBands.forEach((b, i) => {
        assert.ok(b.to > b.from, `${f}/${dir}: band ${b.label} is empty`)
        assert.ok(b.from >= 0 && b.to <= along, `${f}/${dir}: band ${b.label} leaves the content`)
        if (i > 0) assert.equal(b.from, g.stageBands[i - 1].to, `${f}/${dir}: bands ${i - 1} and ${i} are not contiguous`)
      })
      // Every node sits beyond the gutter, so a band name never runs under a node
      for (const n of g.nodes) {
        const across = dir === 'vertical' ? n.position.x : n.position.y
        assert.ok(across >= g.gutter, `${f}/${dir}: ${n.id} sits in the stage gutter`)
      }
      checked += 1
    }
    // Switched off: no bands and the gutter is given back
    const off = buildProcedureGraph(spec, { stages: false })
    assert.equal(off.stageBands.length, 0)
    assert.equal(off.gutter, 0)
  }
  assert.ok(checked >= 8, `the corpus should have staged contracts to check, saw ${checked}`)
})

test('every condition label says how it sits on its point', () => {
  for (const f of files) {
    for (const dir of ['vertical', 'horizontal']) {
      const g = buildProcedureGraph(load(f), {}, undefined, dir)
      for (const c of g.connections) {
        assert.ok(['rise', 'over', 'center'].includes(c.labelAnchor), `${f}/${dir}: ${c.id} anchor ${c.labelAnchor}`)
        assert.ok(Number.isFinite(c.labelAt.x) && Number.isFinite(c.labelAt.y), `${f}/${dir}: ${c.id} label point`)
      }
    }
  }
})

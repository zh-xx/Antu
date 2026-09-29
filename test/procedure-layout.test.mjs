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
import { buildProcedureGraph, toPathD, toCurveD } from '../src/renderers/procedure/flow/layout.js'
import { bendsOf } from '../src/renderers/procedure/flow/straighten.js'
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

test('the main line runs straight inside a stage: almost no main link there bends', () => {
  // Inside a stage the flow runs down one column and main-line links carry ELK's straightness
  // priority. A main link into the next stage has to leave one column and enter the next, so it
  // bends (see the bend test below); those are left out here. Measured: 4 of 114 main links
  // inside a stage bend, both orientations.
  let total = 0
  let bent = 0
  for (const f of files) {
    const spec = load(f)
    const stage = new Map(spec.nodes.map((n) => [n.id, n.stageId]))
    for (const dir of ['vertical', 'horizontal']) {
      const g = buildProcedureGraph(spec, {}, undefined, dir)
      assert.ok(g.spine.length > 3, `${f}: the main line should be found`)
      for (const c of g.connections.filter((c) => c.kind === 'main' && stage.get(c.from) === stage.get(c.to))) {
        total += 1
        if (bendsOf(c.points) > 0) bent += 1
      }
    }
  }
  assert.ok(bent / total <= 0.06, `${bent} of ${total} main links inside a stage bend`)
})

test('back edges are recognised: only the real loops are left', () => {
  // With breach, delay and termination written as rules (§11), what loops back is a real loop:
  // rectify and inspect again, the monthly cycle, renewal
  const back = (p) => buildProcedureGraph(load(byPrefix(p))).stats.backEdges
  assert.equal(back('01-'), 3, '01: the three rectify-and-reinspect loops')
  assert.equal(back('06-'), 2, '06: recommissioning and re-inspection')
  assert.equal(back('07-'), 0, '07 is acyclic')
})

test('several edges into the same target merge into one link', () => {
  const g = buildProcedureGraph(JSON.parse(readFileSync(`${AGENT_DIR}/6-merged-edges.en.json`, 'utf8')))
  assert.ok(g.stats.groupedEdges > 0, 'the merged-edges example has edges merged away')
  assert.equal(g.stats.connections, g.stats.edges - g.stats.groupedEdges)
  const merged = g.connections.filter((c) => c.merged > 1)
  assert.ok(merged.length > 0)
  for (const c of merged) assert.ok(c.label.includes(' / '), 'merged conditions are joined with " / "')
})

/**
 * Does b come after a along the flow? In the column layout the flow runs down inside a stage
 * and on to the next column (left to right); transposed, right inside a stage and on to the
 * next row. So each step is either further along its column or in a later one.
 */
const goesForward = (g, a, b, dir) => {
  const at = new Map(g.nodes.map((n) => [n.id, { x: n.position.x, y: n.position.y, w: n.data.w, h: n.data.h }]))
  const p = at.get(a)
  const q = at.get(b)
  const [along, across, alongSize, acrossSize] = dir === 'horizontal' ? ['x', 'y', 'w', 'h'] : ['y', 'x', 'h', 'w']
  return q[along] >= p[along] + p[alongSize] - 1 || q[across] >= p[across] + p[acrossSize] - 1
}

test('the main line always goes forward: down its column, or on to a later one', () => {
  for (const f of files) {
    for (const dir of ['vertical', 'horizontal']) {
      const g = buildProcedureGraph(load(f), {}, undefined, dir)
      for (let i = 1; i < g.spine.length; i += 1) {
        assert.ok(goesForward(g, g.spine[i - 1], g.spine[i], dir), `${f}/${dir}: the main line turns back at ${g.spine[i]}`)
      }
    }
  }
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

test('hints are separate from errors: several start nodes only hint, they do not block rendering', () => {
  const s = base()
  s.nodes.push({ id: 'n-20', kind: 'start', label: 'second entry' })
  s.edges.push({ from: 'n-20', to: s.edges[0].to })
  assert.deepEqual(validateProcedure(s), [], 'several starts must not be an error')
  assert.ok(some(hintsOfProcedure(s), /entries/), 'but a hint must be given')
  const g = buildProcedureGraph(s)
  assert.deepEqual(g.errors, [], 'a hint must not stop the layout')
})

test('a node that is not a start and has no incoming edge is an orphan error (#18)', () => {
  const s = base()
  // An orphan step with a chain hanging off it: only the orphan is reported
  s.nodes.push({ id: 'n-20', kind: 'step', label: 'forgotten step' })
  s.nodes.push({ id: 'n-21', kind: 'step', label: 'after it' })
  s.edges.push({ from: 'n-20', to: 'n-21' })
  s.edges.push({ from: 'n-21', to: s.edges[0].to })
  const errs = validateProcedure(s)
  assert.ok(errs.some((e) => e.includes('n-20') && /incoming/.test(e)), `the orphan is named: ${JSON.stringify(errs)}`)
  assert.ok(!errs.some((e) => e.includes('n-21')), 'the chain hanging off it is not reported again')

  // A note stands outside the flow: no incoming edge is fine
  const t = base()
  t.nodes.push({ id: 'n-20', kind: 'note', label: 'an explanation' })
  assert.deepEqual(validateProcedure(t), [])
})

test('the procedure report opens vertical and names the better fit apart (#17)', () => {
  // A wide canvas makes horizontal the better fit for some documents; the diagram still opens
  // vertical, and the report must say so rather than suggest the better fit
  for (const f of files) {
    const r = procedureKnowledge.report(load(f), buildProcedureGraph, { canvas: { width: 1600, height: 900 } })
    assert.equal(r.suggestedOrientation, 'vertical', `${f}: the diagram opens vertical`)
    const betterFit = r.byOrientation.horizontal.fit > r.byOrientation.vertical.fit ? 'horizontal' : 'vertical'
    assert.equal(r.betterFit, betterFit, `${f}: the better fit is reported apart`)
    const text = procedureKnowledge.formatReport(r)
    assert.ok(text.includes('Suggested orientation: vertical'))
    assert.equal(text.includes('fits a screen better'), betterFit === 'horizontal')
  }
})

test('curved links end on a real segment that points into the node (#23)', () => {
  // The arrowhead follows the last drawn segment. A segment of length 0 has no direction and the
  // browser draws the head pointing right, so a link entering from the top or the left of a node
  // could show a head that points nowhere near where the link goes.
  const lastLeg = (d) => {
    const pts = d
      .split(/(?=[MLC])/)
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => {
        const v = t.slice(1).match(/-?[\d.]+/g).map(Number)
        return [v.at(-2), v.at(-1)]
      })
    return [pts.at(-2), pts.at(-1)]
  }
  let checked = 0
  for (const f of files) {
    for (const dir of ['vertical', 'horizontal']) {
      const g = buildProcedureGraph(load(f), {}, undefined, dir)
      const box = new Map(g.nodes.map((n) => [n.id, { x: n.position.x, y: n.position.y, w: n.data.w, h: n.data.h }]))
      for (const c of g.connections) {
        const [a, b] = lastLeg(c.dCurve)
        const len = Math.hypot(b[0] - a[0], b[1] - a[1])
        assert.ok(len > 0.05, `${f}/${dir}: ${c.id} ends on a segment of length ${len}`)
        // A short jog before the node is what made the head look wrong (the reported case): the
        // route itself keeps a straight run of 11px into the node, longer than the arrowhead (7)
        if (c.points.length > 2) {
          const [p, q] = c.points.slice(-2)
          const run = Math.hypot(q[0] - p[0], q[1] - p[1])
          assert.ok(run >= 10.5, `${f}/${dir}: ${c.id} enters its node after a run of only ${run.toFixed(1)}px`)
        }
        // the side of the target the link ends on decides which way the head must point
        const t = box.get(c.to)
        const [dx, dy] = [(b[0] - a[0]) / len, (b[1] - a[1]) / len]
        const near = (v, w) => Math.abs(v - w) < 1.5
        if (near(b[1], t.y)) assert.ok(dy > 0.7, `${f}/${dir}: ${c.id} enters a top edge but points ${dx.toFixed(2)},${dy.toFixed(2)}`)
        else if (near(b[1], t.y + t.h)) assert.ok(dy < -0.7, `${f}/${dir}: ${c.id} enters a bottom edge but points ${dx.toFixed(2)},${dy.toFixed(2)}`)
        else if (near(b[0], t.x)) assert.ok(dx > 0.7, `${f}/${dir}: ${c.id} enters a left edge but points ${dx.toFixed(2)},${dy.toFixed(2)}`)
        else if (near(b[0], t.x + t.w)) assert.ok(dx < -0.7, `${f}/${dir}: ${c.id} enters a right edge but points ${dx.toFixed(2)},${dy.toFixed(2)}`)
        checked += 1
      }
    }
  }
  assert.ok(checked >= 200, `only ${checked} links checked`)
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

test('curved style: the same route, straight stays straight, each corner becomes one arc', () => {
  assert.equal(toCurveD([[0, 0], [0, 100]]), toPathD([[0, 0], [0, 100]]))
  const pts = [[0, 0], [0, 50], [100, 50], [100, 100]]
  const d = toCurveD(pts)
  assert.ok(d.startsWith('M 0 0') && d.endsWith('L 100 100'), 'it starts and ends where the route does')
  assert.equal((d.match(/C/g) || []).length, 2, 'one arc per corner')
  assert.equal(toCurveD([]), '')
})

test('links bend as little as possible: straight first, then one bend', () => {
  // Inside a stage: straight, else one bend (straighten.js). A link into the next stage leaves
  // one column and enters another, usually with two bends, three when the side facing the next
  // column is taken; a loop may need four to go round. Measured on the corpus, both
  // orientations: 200 links, 153 of them straight or with one bend, none above four.
  let links = 0
  let straightOrOne = 0
  for (const f of files) {
    for (const dir of ['vertical', 'horizontal']) {
      const g = buildProcedureGraph(load(f), {}, undefined, dir)
      for (const c of g.connections) {
        const b = bendsOf(c.points)
        assert.ok(b <= (c.kind === 'back' ? 4 : 3), `${f}/${dir}: ${c.id} bends ${b} times`)
        links += 1
        if (b <= 1) straightOrOne += 1
      }
    }
  }
  assert.ok(straightOrOne / links >= 0.72, `only ${straightOrOne} of ${links} links are straight or bend once`)
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

test('agent examples: seven (each with an en and a zh-CN half), all validate and lay out', () => {
  assert.equal(agentPairs.length, 7)
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
    g.nodes.map((n) => [n.id, { x: n.position.x, y: n.position.y, w: n.data.w, h: n.data.h, kind: n.data.node.kind }]),
  )
  return { g, box }
}

/** On a diamond's outline (a decision meets its links on its four slanted edges) */
const onDiamond = ([x, y], b) => {
  const cx = b.x + b.w / 2
  const cy = b.y + b.h / 2
  return Math.abs(Math.abs(x - cx) / (b.w / 2) + Math.abs(y - cy) / (b.h / 2) - 1) < 0.01
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
        const on = (p, b) => (b.kind === 'decision' ? onDiamond(p, b) : onBoxBoundary(p, b))
        assert.ok(on(first, box.get(c.from)), `${f}/${dir}: ${c.id} starts off the source's outline`)
        assert.ok(on(last, box.get(c.to)), `${f}/${dir}: ${c.id} ends off the target's outline`)
        assert.ok(c.d.startsWith('M '), `${f}/${dir}: ${c.id} has no path`)
        for (const [x, y] of c.points) {
          assert.ok(Number.isFinite(x) && Number.isFinite(y), `${f}/${dir}: ${c.id} has a bad point`)
        }
      }
    }
  }
})

/**
 * Which nodes a polyline runs behind. A segment may touch its own two boxes only at its ends
 * (it leaves one boundary and arrives at another); any other box it enters, it is hidden by.
 */
const runsBehind = (c, box) => {
  const hits = []
  for (let i = 0; i < c.points.length - 1; i += 1) {
    const [[x1, y1], [x2, y2]] = [c.points[i], c.points[i + 1]]
    const [lx, hx, ly, hy] = [Math.min(x1, x2), Math.max(x1, x2), Math.min(y1, y2), Math.max(y1, y2)]
    for (const [id, b] of box) {
      // A link meets a diamond on its slanted outline, inside the diamond's own box: that
      // stretch of its first or last segment is its own business
      const own = (id === c.from && i === 0) || (id === c.to && i === c.points.length - 2)
      if (own && b.kind === 'decision') continue
      if (hx > b.x + 1 && lx < b.x + b.w - 1 && hy > b.y + 1 && ly < b.y + b.h - 1) hits.push(id)
    }
  }
  return hits
}

test('no link runs behind a node: every real contract, both orientations', () => {
  // The first rendering had 10 of 37 links in 01 and 8 of 23 in 03 disappearing under boxes
  // they did not belong to. The reader cannot follow such a line, so this is a hard zero.
  for (const f of files) {
    for (const dir of ['vertical', 'horizontal']) {
      const { g, box } = withBoxes(f, dir)
      for (const c of g.connections) {
        assert.deepEqual(runsBehind(c, box), [], `${f}/${dir}: ${c.id} runs behind these nodes`)
      }
    }
  }
})

test('no two different links lie on top of each other', () => {
  // Lines may coincide only where they are meant to: the fork shared by one source's branches,
  // the lane shared by back edges into one target. Anything else is two lines drawn as one.
  const segs = (c) =>
    c.points.slice(1).map((p, i) => {
      const q = c.points[i]
      return q[0] === p[0]
        ? { axis: 'v', at: q[0], lo: Math.min(q[1], p[1]), hi: Math.max(q[1], p[1]) }
        : { axis: 'h', at: q[1], lo: Math.min(q[0], p[0]), hi: Math.max(q[0], p[0]) }
    })
  for (const f of files) {
    for (const dir of ['vertical', 'horizontal']) {
      const g = buildProcedureGraph(load(f), {}, undefined, dir)
      const cs = g.connections.map((c) => ({ c, s: segs(c) }))
      for (let i = 0; i < cs.length; i += 1) {
        for (let j = i + 1; j < cs.length; j += 1) {
          const [A, B] = [cs[i].c, cs[j].c]
          if (A.from === B.from || A.to === B.to) continue
          for (const a of cs[i].s) {
            for (const b of cs[j].s) {
              const same = a.axis === b.axis && Math.abs(a.at - b.at) < 0.5
              const shared = Math.min(a.hi, b.hi) - Math.max(a.lo, b.lo)
              assert.ok(!(same && shared > 2), `${f}/${dir}: ${A.id} and ${B.id} overlap for ${shared}px`)
            }
          }
        }
      }
    }
  }
})


test('the picture does not depend on the order nodes are written in', () => {
  // A node appended at the end of the list once turned 06's main line upside down (ELK's
  // model-order cycle breaking reversed an edge that pointed at a node written earlier).
  // Reverse the node list of every contract: the main line must still go forward.
  for (const f of files) {
    const spec = load(f)
    spec.nodes.reverse()
    const g = buildProcedureGraph(spec)
    assert.deepEqual(g.errors, [], f)
    for (let i = 1; i < g.spine.length; i += 1) {
      assert.ok(goesForward(g, g.spine[i - 1], g.spine[i], 'vertical'), `${f}: the main line turns back at ${g.spine[i]}`)
    }
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

test('stage boxes hold their own nodes and never overlap', () => {
  let checked = 0
  const inside = (n, b) =>
    n.position.x >= b.x && n.position.y >= b.y && n.position.x + n.data.w <= b.x + b.w && n.position.y + n.data.h <= b.y + b.h
  const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
  for (const f of files) {
    const spec = load(f)
    for (const dir of ['vertical', 'horizontal']) {
      const g = buildProcedureGraph(spec, {}, undefined, dir)
      if (!spec.stages?.length) {
        assert.equal(g.stageBoxes.length, 0, `${f}: no stages, no boxes`)
        continue
      }
      const used = new Set(spec.nodes.map((n) => n.stageId).filter(Boolean))
      assert.equal(g.stageBoxes.length, used.size, `${f}/${dir}: one box per stage that has nodes`)
      for (const b of g.stageBoxes) {
        assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= g.size.width && b.y + b.h <= g.size.height, `${f}/${dir}: box ${b.label} leaves the content`)
        for (const n of g.nodes) {
          if (n.data.node.stageId === b.stageId) assert.ok(inside(n, b), `${f}/${dir}: ${n.id} is outside its box ${b.label}`)
          else assert.ok(!inside(n, b), `${f}/${dir}: ${n.id} sits in the box of ${b.label}`)
        }
      }
      g.stageBoxes.forEach((a, i) =>
        g.stageBoxes.slice(i + 1).forEach((b) => assert.ok(!overlap(a, b), `${f}/${dir}: boxes ${a.label} and ${b.label} overlap`)),
      )
      checked += 1
    }
    // Switched off: no boxes
    assert.equal(buildProcedureGraph(spec, { stages: false }).stageBoxes.length, 0)
  }
  assert.ok(checked >= 8, `the corpus should have staged contracts to check, saw ${checked}`)
})

test('condition labels sit clear of every node, inside the content', () => {
  // ELK is given a box per label and places it; nothing is guessed afterwards
  const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
  for (const f of files) {
    for (const dir of ['vertical', 'horizontal']) {
      const g = buildProcedureGraph(load(f), {}, undefined, dir)
      const nodes = g.nodes.map((n) => ({ id: n.id, x: n.position.x, y: n.position.y, w: n.data.w, h: n.data.h }))
      for (const c of g.connections.filter((c) => c.label)) {
        const l = { x: c.labelAt.x, y: c.labelAt.y, w: c.labelSize.width, h: c.labelSize.height }
        assert.ok(l.x >= 0 && l.y >= 0 && l.x + l.w <= g.size.width && l.y + l.h <= g.size.height, `${f}/${dir}: ${c.id} label outside`)
        for (const n of nodes) assert.ok(!overlap(l, n), `${f}/${dir}: ${c.id} label covers ${n.id}`)
      }
    }
  }
})



// ── The rule layer (v1.1, §11) ──────
// Contingent clauses — breach, delay liability, rights to terminate — as `rules` beside the
// flow instead of edges out of some step. See spec/procedure/schema-draft.md §11.

const RULES_DIR = 'examples/procedure'
const ruleFiles = readdirSync(RULES_DIR).filter((f) => f.endsWith('.zh-CN.json') && JSON.parse(readFileSync(`${RULES_DIR}/${f}`, 'utf8')).rules?.length).sort()
const loadRules = (f) => JSON.parse(readFileSync(`${RULES_DIR}/${f}`, 'utf8'))

test('rule-layer drafts validate cleanly, with no hints', () => {
  assert.ok(ruleFiles.length >= 2)
  for (const f of ruleFiles) {
    assert.deepEqual(validateProcedure(loadRules(f)), [], f)
    // an end reached only through a rule is not a second entry
    assert.deepEqual(hintsOfProcedure(loadRules(f)), [], f)
  }
})

test('rules are validated: references, the end they lead to, the trigger', () => {
  const cases = [
    ['stageIds points nowhere', (s) => { s.rules[0].stageIds = ['st-9'] }, /non-existent stage "st-9"/],
    ['endId is not an end', (s) => { s.rules[4].endId = 'n-3' }, /not a node of kind "end"/],
    ['endId points nowhere', (s) => { s.rules[4].endId = 'n-99' }, /non-existent node "n-99"/],
    ['when missing', (s) => { delete s.rules[0].when }, /`when` is required/],
    ['when list has a blank', (s) => { s.rules[5].when.push(' ') }, /`when` is required/],
    ['then missing', (s) => { delete s.rules[0].then }, /missing required field `then`/],
    ['duplicate id', (s) => { s.rules[1].id = s.rules[0].id }, /already used/],
    ['id shared with a node', (s) => { s.rules[0].id = 'n-1' }, /already used/],
    ['bad outcome', (s) => { s.rules[0].outcome = 'bad' }, /outcome/],
    ['rules not an array', (s) => { s.rules = {} }, /`rules` must be an array/],
  ]
  for (const [name, mutate, re] of cases) {
    const s = loadRules('03-labour-outsourcing-contract.zh-CN.json')
    mutate(s)
    assert.ok(some(validateProcedure(s), re), `${name}: expected ${re}, got ${JSON.stringify(validateProcedure(s))}`)
  }
})

test('rules become a table under the diagram: every rule once, grouped by the end it leads to', () => {
  for (const f of ruleFiles) {
    const spec = loadRules(f)
    const ends = [...new Set(spec.rules.map((r) => r.endId).filter(Boolean))]
    for (const dir of ['vertical', 'horizontal']) {
      const g = buildProcedureGraph(spec, {}, undefined, dir)
      const t = g.ruleTable
      assert.ok(t, `${f}/${dir}: no table`)
      // Every rule exactly once
      const ids = t.groups.flatMap((gr) => gr.rows.map((r) => r.rule.id))
      assert.deepEqual([...ids].sort(), spec.rules.map((r) => r.id).sort(), `${f}/${dir}: rules dropped or repeated`)
      // One group per end, in the order first named, then the rest; headings only when there is an end
      assert.deepEqual(t.groups.filter((gr) => gr.endId).map((gr) => gr.endId), ends, `${f}/${dir}: end groups`)
      for (const gr of t.groups) {
        for (const r of gr.rows) assert.equal(r.rule.endId ?? null, gr.endId, `${f}/${dir}: ${r.rule.id} in the wrong group`)
        assert.equal(gr.headed, ends.length > 0)
        // Inside a group, by the first stage a rule applies in
        const firsts = gr.rows.map((r) => r.first)
        assert.deepEqual(firsts, [...firsts].sort((a, b) => a - b), `${f}/${dir}: rows not in stage order`)
      }
      // Under everything else, inside the content, rows stacked without gaps or overlaps
      const bottom = Math.max(...g.nodes.map((n) => n.position.y + n.data.h), ...g.stageBoxes.map((b) => b.y + b.h))
      assert.ok(t.y >= bottom, `${f}/${dir}: the table starts above the diagram's bottom`)
      assert.ok(t.x + t.w <= g.size.width && t.y + t.h <= g.size.height, `${f}/${dir}: the table leaves the content`)
      const rows = t.groups.flatMap((gr) => gr.rows)
      for (let i = 1; i < rows.length; i += 1) assert.ok(rows[i].y >= rows[i - 1].y + rows[i - 1].h, `${f}/${dir}: rows overlap`)
    }
  }
})

test('an end the rules lead to says how many; the scope is written out', () => {
  const g = buildProcedureGraph(loadRules('03-labour-outsourcing-contract.zh-CN.json'))
  const end = g.nodes.find((n) => n.data.ruleCount > 0)
  assert.ok(end, 'the end the termination rules lead to carries their count')
  assert.equal(end.data.ruleCount, 3, 'three termination grounds')
  // No link runs from the table into the diagram: the table and the count point at each other
  assert.equal(g.connections.filter((c) => !g.nodes.some((n) => n.id === c.from)).length, 0)
  // A rule over one stage names it; over several, the first and the last; over none, throughout
  const rows = g.ruleTable.groups.flatMap((gr) => gr.rows)
  for (const r of rows) assert.ok(['one', 'range', 'all'].includes(r.scope.kind))
  const g01 = buildProcedureGraph(loadRules('01-software-development-contract.zh-CN.json'))
  const ranged = g01.ruleTable.groups.flatMap((gr) => gr.rows).find((r) => r.scope.kind === 'range')
  assert.ok(ranged && ranged.scope.from && ranged.scope.to && ranged.scope.n > 1, '01: a rule over several stages names its range')
})

test('the rule switch removes the table and the counts', () => {
  const s = loadRules('03-labour-outsourcing-contract.zh-CN.json')
  const on = buildProcedureGraph(s)
  const off = buildProcedureGraph(s, { rules: false })
  assert.equal(off.ruleTable, null)
  assert.ok(off.nodes.every((n) => n.data.ruleCount === 0), 'no counts on the ends')
  assert.ok(off.size.height < on.size.height, 'switching rules off should give the height of the table back')
})

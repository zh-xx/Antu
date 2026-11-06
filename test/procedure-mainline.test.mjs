// ============================================================
//  test/procedure-mainline.test.mjs — Mainline-first flowchart prototype (#190)
//
//  Behind fields.engine === 'mainline'. Default layout stays ELK; these tests pin
//  that the prototype draws every node without overlap and keeps the main line
//  nearly straight inside a stage.
// ============================================================

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

import { buildProcedureGraph } from '../src/renderers/procedure/flow/layout.js'
import { bendsOf } from '../src/renderers/procedure/flow/straighten.js'
import { analyseProcedureGraph } from '../src/renderers/procedure/flow/spine.js'

const DIR = 'examples/procedure'
const LANG = '.zh-CN.json'
const files = readdirSync(DIR)
  .filter((f) => f.endsWith(LANG))
  .sort()
const load = (f) => JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8'))
const fields = { engine: 'mainline' }
/** Ends reached only through rules (no flow edge) are not painted on the canvas. */
const paintedNodeCount = (spec) => {
  const edged = new Set()
  for (const e of spec.edges ?? []) {
    edged.add(e.from)
    edged.add(e.to)
  }
  const ruleOnly = new Set((spec.rules ?? []).map((r) => r.endId).filter((id) => id && !edged.has(id)))
  return spec.nodes.filter((n) => !ruleOnly.has(n.id)).length
}

test('spine.js agrees with the default layout on the main line', () => {
  for (const f of files) {
    const spec = load(f)
    const { spine } = analyseProcedureGraph(spec)
    const g = buildProcedureGraph(spec, {}, undefined, 'vertical')
    assert.deepEqual(spine, g.spine, `${f}: shared spine walk must match layout.js`)
  }
})

test('mainline: corpus, both orientations, no overlap, every node present', () => {
  for (const f of files) {
    for (const dir of ['vertical', 'horizontal']) {
      const spec = load(f)
      const g = buildProcedureGraph(spec, fields, undefined, dir)
      assert.deepEqual(g.errors, [], `${f} / ${dir} mainline does not lay out`)
      assert.equal(g.nodes.length, paintedNodeCount(spec), `${f}: every flow node is painted (rule-only ends stay off)`)
      assert.ok(g.size.width > 0 && g.size.height > 0)

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
            a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5
          assert.ok(!overlap, `${f} / ${dir}: ${a.id} overlaps ${b.id}`)
        }
      }
    }
  }
})

test('mainline: main links inside a stage bend rarely (by construction)', () => {
  let total = 0
  let bent = 0
  for (const f of files) {
    const spec = load(f)
    const stage = new Map(spec.nodes.map((n) => [n.id, n.stageId]))
    for (const dir of ['vertical', 'horizontal']) {
      const g = buildProcedureGraph(spec, fields, undefined, dir)
      for (const c of g.connections.filter((c) => c.kind === 'main' && stage.get(c.from) === stage.get(c.to))) {
        total += 1
        if (bendsOf(c.points) > 0) bent += 1
      }
    }
  }
  assert.ok(total > 0, 'expected main links inside stages')
  // Spine axis is pinned: in-stage main links must stay straight (0 bends)
  assert.equal(bent, 0, `${bent} of ${total} main links inside a stage still bend under mainline`)
})

test('default engine is unchanged when fields.engine is omitted', () => {
  const spec = load(files[0])
  const a = buildProcedureGraph(spec, {}, undefined, 'vertical')
  const b = buildProcedureGraph(spec, { stages: true }, undefined, 'vertical')
  assert.equal(a.nodes.length, b.nodes.length)
  // Positions from ELK path should match for the same inputs
  for (let i = 0; i < a.nodes.length; i += 1) {
    assert.equal(a.nodes[i].position.x, b.nodes[i].position.x)
    assert.equal(a.nodes[i].position.y, b.nodes[i].position.y)
  }
})

test('mainline: every labelled connection has labelAt (paint must not crash)', () => {
  // Regression for the EPC edge that had label but null labelAt — ConnectionLayerNode reads .x
  for (const f of files) {
    for (const dir of ['vertical', 'horizontal']) {
      const g = buildProcedureGraph(load(f), fields, undefined, dir)
      for (const c of g.connections) {
        if (!c.label) {
          assert.equal(c.labelAt, null, `${f} / ${dir}: ${c.id} has no label so labelAt stays null`)
          continue
        }
        assert.ok(c.labelAt, `${f} / ${dir}: ${c.id} labelled but labelAt is null`)
        assert.ok(c.labelSize, `${f} / ${dir}: ${c.id} labelled but labelSize is null`)
        assert.equal(typeof c.labelAt.x, 'number')
        assert.equal(typeof c.labelAt.y, 'number')
      }
    }
  }
})

test('stages off: Mainline is one straight spine; Current keeps columns but hides bands', () => {
  let checked = 0
  for (const f of files) {
    const spec = load(f)
    const present = (spec.stages ?? []).filter((st) => spec.nodes.some((n) => n.stageId === st.id))
    const ids = new Set((spec.stages ?? []).map((s) => s.id))
    const hasColumns = present.length > 1 && spec.nodes.every((n) => n.stageId && ids.has(n.stageId))
    if (!hasColumns) continue
    checked += 1

    const offCurrent = buildProcedureGraph(spec, { stages: false }, undefined, 'vertical')
    const offMainline = buildProcedureGraph(spec, { stages: false, engine: 'mainline' }, undefined, 'vertical')
    assert.equal(offCurrent.stageBoxes.length, 0, `${f}: stages off → no painted boxes`)
    assert.equal(offMainline.stageBoxes.length, 0, `${f}: stages off → no painted boxes (mainline)`)
    assert.equal(offCurrent.nodes.length, offMainline.nodes.length, f)

    // Mainline with Stages off: no fold → one trunk (centres share one axis across the whole spine)
    const byId = new Map(offMainline.nodes.map((n) => [n.id, n]))
    const vals = offMainline.spine.map((id) => centre(byId.get(id), 'vertical'))
    assert.ok(vals.length >= 2, `${f}: expected a spine`)
    const span = Math.max(...vals) - Math.min(...vals)
    assert.ok(span <= 2, `${f}: stages-off mainline spine centre span ${span.toFixed(2)}px > 2`)

    // Current still uses stage columns (data path); geometry must differ from the straight trunk
    let same = 0
    for (let i = 0; i < offCurrent.nodes.length; i += 1) {
      if (
        offCurrent.nodes[i].position.x === offMainline.nodes[i].position.x &&
        offCurrent.nodes[i].position.y === offMainline.nodes[i].position.y
      ) {
        same += 1
      }
    }
    assert.ok(same < offCurrent.nodes.length, `${f}: stages-off mainline must not match current columns`)
  }
  assert.ok(checked > 0, 'expected multi-stage examples')
})

/** Centre of a flowchart node (the spine axis is the shared centre, not the left edge). */
const centre = (n, dir) =>
  dir === 'vertical' ? n.position.x + n.data.w / 2 : n.position.y + n.data.h / 2

test('mainline: spine axis is straight inside each stage (centre span ≤ 2px)', () => {
  for (const f of files) {
    for (const dir of ['vertical', 'horizontal']) {
      const spec = load(f)
      const g = buildProcedureGraph(spec, fields, undefined, dir)
      const byId = new Map(g.nodes.map((n) => [n.id, n]))
      const stageOf = new Map(spec.nodes.map((n) => [n.id, n.stageId]))
      /** @type {Map<string, number[]>} */
      const axes = new Map()
      for (const id of g.spine) {
        const st = stageOf.get(id) ?? '__none__'
        if (!axes.has(st)) axes.set(st, [])
        axes.get(st).push(centre(byId.get(id), dir))
      }
      for (const [st, vals] of axes) {
        if (vals.length < 2) continue
        const span = Math.max(...vals) - Math.min(...vals)
        assert.ok(span <= 2, `${f} / ${dir} / ${st}: spine centre span ${span.toFixed(2)}px > 2`)
      }
    }
  }
})

test('mainline: with stage data stripped, one implicit column stays on a straight spine', () => {
  for (const f of files) {
    const raw = load(f)
    const stripped = {
      ...raw,
      stages: [],
      nodes: raw.nodes.map(({ stageId: _s, ...n }) => n),
      rules: (raw.rules ?? []).map(({ stageIds: _s, ...r }) => r),
    }
    for (const dir of ['vertical', 'horizontal']) {
      const g = buildProcedureGraph(stripped, fields, undefined, dir)
      assert.deepEqual(g.errors, [], `${f} / ${dir}: stripped stages must still lay out`)
      assert.equal(g.stageBoxes.length, 0, `${f}: implicit stage is never painted`)
      assert.equal(g.nodes.length, paintedNodeCount(raw))
      const byId = new Map(g.nodes.map((n) => [n.id, n]))
      const vals = g.spine.map((id) => centre(byId.get(id), dir))
      assert.ok(vals.length >= 2, `${f}: expected a spine`)
      const span = Math.max(...vals) - Math.min(...vals)
      assert.ok(span <= 2, `${f} / ${dir}: implicit spine centre span ${span.toFixed(2)}px > 2`)
    }
  }
})

test('mainline: spine ends stay on the axis; rule-only ends stay off the canvas', () => {
  for (const f of files) {
    const spec = load(f)
    const edged = new Set()
    for (const e of spec.edges ?? []) {
      edged.add(e.from)
      edged.add(e.to)
    }
    const ruleOnly = new Set(
      (spec.rules ?? []).map((r) => r.endId).filter((id) => id && !edged.has(id)),
    )
    for (const dir of ['vertical', 'horizontal']) {
      const g = buildProcedureGraph(spec, fields, undefined, dir)
      const byId = new Map(g.nodes.map((n) => [n.id, n]))
      for (const id of ruleOnly) {
        assert.equal(byId.has(id), false, `${f}: rule-only end ${id} must not be painted`)
      }
      const stageOf = new Map(spec.nodes.map((n) => [n.id, n.stageId ?? '__implicit__']))
      /** @type {Map<string, number[]>} */
      const axes = new Map()
      for (const id of g.spine) {
        const n = byId.get(id)
        if (!n) continue
        const st = stageOf.get(id) ?? '__implicit__'
        if (!axes.has(st)) axes.set(st, [])
        axes.get(st).push(centre(n, dir))
      }
      // Ends that sit on the spine walk share that stage's axis. Branch-exit ends hang beside
      // the fork and are not required to share the trunk.
      for (const id of g.spine) {
        const n = byId.get(id)
        if (!n || n.data?.node?.kind !== 'end') continue
        const st = stageOf.get(id) ?? '__implicit__'
        const vals = axes.get(st) ?? []
        if (vals.length < 2) continue
        const axis = vals.reduce((s, v) => s + v, 0) / vals.length
        const c = centre(n, dir)
        assert.ok(Math.abs(c - axis) <= 2, `${f} / ${dir}: spine end ${id} centre ${c.toFixed(1)} off axis ${axis.toFixed(1)}`)
      }
      // Every painted node has at least one incident link (no islands).
      const linked = new Set()
      for (const c of g.connections) {
        linked.add(c.from)
        linked.add(c.to)
      }
      for (const n of g.nodes) {
        assert.ok(linked.has(n.id), `${f} / ${dir}: painted node ${n.id} has no link`)
      }
    }
  }
})

test('mainline: in-stage decision branches bend ≤1 (≥95%); same-row backs are straight', () => {
  let branchTotal = 0
  let branchOk = 0
  let backSameRow = 0
  let backBent = 0
  for (const f of files) {
    const spec = load(f)
    const kindOf = new Map(spec.nodes.map((n) => [n.id, n.kind]))
    const stageOf = new Map(spec.nodes.map((n) => [n.id, n.stageId]))
    for (const stagesOn of [true, false]) {
      const g = buildProcedureGraph(spec, { ...fields, stages: stagesOn }, undefined, 'vertical')
      const byId = new Map(g.nodes.map((n) => [n.id, n]))
      for (const c of g.connections) {
        if (
          c.kind === 'branch' &&
          kindOf.get(c.from) === 'decision' &&
          stageOf.get(c.from) === stageOf.get(c.to)
        ) {
          branchTotal += 1
          if (bendsOf(c.points) <= 1) branchOk += 1
        }
        if (c.kind === 'back' && kindOf.get(c.to) === 'decision') {
          const a = byId.get(c.from)
          const b = byId.get(c.to)
          if (!a || !b) continue
          const sameRow = Math.abs(a.position.y + a.data.h / 2 - (b.position.y + b.data.h / 2)) < 2
          if (!sameRow) continue
          backSameRow += 1
          if (bendsOf(c.points) > 0) backBent += 1
        }
      }
    }
  }
  assert.ok(branchTotal > 0, 'expected in-stage decision branch links')
  // First sibling on a shared lane is 0-bend; later siblings stack and may elbow. ≥85% is the bar.
  assert.ok(branchOk / branchTotal >= 0.85, `only ${branchOk} of ${branchTotal} in-stage decision branches bend ≤1`)
  assert.ok(backSameRow > 0, 'expected at least one same-row back to a decision')
  assert.equal(backBent, 0, `${backBent} of ${backSameRow} same-row backs still bend`)
})

test('mainline: connection labels stay clear of nodes and near their segment', () => {
  const overlap = (a, b) =>
    a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5
  const distToSeg = (L, pts) => {
    const cx = L.x + L.w / 2
    const cy = L.y + L.h / 2
    let best = Infinity
    for (let i = 0; i < pts.length - 1; i += 1) {
      const [p, q] = [pts[i], pts[i + 1]]
      const dx = q[0] - p[0]
      const dy = q[1] - p[1]
      const len2 = dx * dx + dy * dy
      const t = len2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ((cx - p[0]) * dx + (cy - p[1]) * dy) / len2))
      best = Math.min(best, Math.hypot(cx - p[0] - t * dx, cy - p[1] - t * dy))
    }
    return best
  }
  let labelled = 0
  for (const f of files) {
    const spec = load(f)
    for (const stagesOn of [true, false]) {
      for (const dir of ['vertical', 'horizontal']) {
        const g = buildProcedureGraph(spec, { ...fields, stages: stagesOn }, undefined, dir)
        const nodes = g.nodes.map((n) => ({
          id: n.id,
          x: n.position.x,
          y: n.position.y,
          w: n.data.w,
          h: n.data.h,
        }))
        for (const c of g.connections) {
          if (!c.label) continue
          labelled += 1
          assert.ok(c.labelAt, `${f} / stages=${stagesOn} / ${dir}: ${c.id} missing labelAt`)
          const L = { x: c.labelAt.x, y: c.labelAt.y, w: c.labelSize.width, h: c.labelSize.height }
          for (const n of nodes) {
            assert.ok(
              !overlap(L, n),
              `${f} / stages=${stagesOn} / ${dir}: label «${c.label}» (${c.id}) overlaps ${n.id}`,
            )
          }
          const d = distToSeg(L, c.points)
          assert.ok(
            d <= 40,
            `${f} / stages=${stagesOn} / ${dir}: label «${c.label}» (${c.id}) sits ${d.toFixed(1)}px from its line`,
          )
        }
      }
    }
  }
  assert.ok(labelled > 0, 'expected labelled connections in the corpus')
})

test('mainline: free side faces are not shared when a decision has two exits', () => {
  // Work-injury n-3: trunk owns N/S; 材料不全 (+back) and 不予受理 must take opposite E/W faces.
  // n-15: hang rejoin from n-14 must enter a side face, not share the trunk top with n-13.
  const spec = load('08-work-injury-recognition.zh-CN.json')
  const g = buildProcedureGraph(spec, { ...fields, stages: false }, undefined, 'vertical')
  const byId = new Map(g.nodes.map((n) => [n.id, n]))
  const face = (n, [x, y]) => {
    const cx = n.position.x + n.data.w / 2
    const cy = n.position.y + n.data.h / 2
    const onL = Math.abs(x - n.position.x) < 1
    const onR = Math.abs(x - (n.position.x + n.data.w)) < 1
    const onT = Math.abs(y - n.position.y) < 1
    const onB = Math.abs(y - (n.position.y + n.data.h)) < 1
    if (onL && Math.abs(y - cy) < 1) return 'W'
    if (onR && Math.abs(y - cy) < 1) return 'E'
    if (onT && Math.abs(x - cx) < 1) return 'N'
    if (onB && Math.abs(x - cx) < 1) return 'S'
    return `?(${x},${y})`
  }
  const endOn = (c, nodeId) => {
    const n = byId.get(nodeId)
    const pt = c.from === nodeId ? c.points[0] : c.points[c.points.length - 1]
    return face(n, pt)
  }
  const leave4 = g.connections.find((c) => c.id === 'c:n-3->n-4')
  const leave18 = g.connections.find((c) => c.id === 'c:n-3->n-18')
  const back = g.connections.find((c) => c.id === 'c:n-4->n-3')
  assert.ok(leave4 && leave18 && back)
  const f4 = endOn(leave4, 'n-3')
  const f18 = endOn(leave18, 'n-3')
  const fb = endOn(back, 'n-3')
  assert.ok(f4 === 'E' || f4 === 'W', `材料不全 leaves on a side face, got ${f4}`)
  assert.ok(f18 === 'E' || f18 === 'W', `不予受理 leaves on a side face, got ${f18}`)
  assert.notEqual(f4, f18, `two free side exits must not share a face (${f4})`)
  assert.equal(fb, f4, 'loop back shares the 材料不全 face (bidirectional hop)')

  const mainIn = g.connections.find((c) => c.id === 'c:n-13->n-15')
  const rejoin = g.connections.find((c) => c.id === 'c:n-14->n-15')
  assert.ok(mainIn && rejoin)
  assert.equal(endOn(mainIn, 'n-15'), 'N', 'trunk enters n-15 from the top')
  const rj = endOn(rejoin, 'n-15')
  assert.ok(rj === 'E' || rj === 'W', `hang rejoin enters a side face of n-15, got ${rj}`)
})

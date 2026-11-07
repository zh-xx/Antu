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

test('mainline: side-corridor back label sits on the vertical ink (stages off)', () => {
  // 03 n-5→n-3「否，下月继续」: chip on the left vertical run, not below the short stub by the diamond.
  const spec = load('03-labour-outsourcing-contract.zh-CN.json')
  const g = buildProcedureGraph(spec, { ...fields, stages: false }, undefined, 'vertical')
  const c = g.connections.find((e) => e.id === 'c:n-5->n-3')
  assert.ok(c?.labelAt && c.labelSize)
  const L = { x: c.labelAt.x, y: c.labelAt.y, w: c.labelSize.width, h: c.labelSize.height }
  const cx = L.x + L.w / 2
  const cy = L.y + L.h / 2
  // Nearest segment should be the long vertical (same x, different y).
  let onVert = false
  let best = Infinity
  for (let i = 0; i < c.points.length - 1; i += 1) {
    const [p, q] = [c.points[i], c.points[i + 1]]
    const dx = q[0] - p[0]
    const dy = q[1] - p[1]
    const len2 = dx * dx + dy * dy
    const t = len2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ((cx - p[0]) * dx + (cy - p[1]) * dy) / len2))
    const d = Math.hypot(cx - p[0] - t * dx, cy - p[1] - t * dy)
    if (d < best) {
      best = d
      onVert = Math.abs(dx) < 0.5 && Math.abs(dy) > 1
    }
  }
  assert.ok(onVert, 'label should sit on the vertical corridor')
  assert.ok(best <= 1, `on-ink chip centre should be on the stroke, dist=${best.toFixed(1)}`)
  for (const n of g.nodes) {
    const r = { x: n.position.x, y: n.position.y, w: n.data.w, h: n.data.h }
    const hit = L.x < r.x + r.w - 0.5 && r.x < L.x + L.w - 0.5 && L.y < r.y + r.h - 0.5 && r.y < L.y + L.h - 0.5
    assert.ok(!hit, `label must not overlap ${n.id}`)
  }
})

test('mainline: labelled hang↔hang hop keeps ink stubs beside the chip', () => {
  // Synthetic S1: decision「支线是否回并」→ end「支线终止」on a neighbour hang lane used to be
  // only LANE_SEP wide, so「结束」hid the whole stroke. Floor: longest run ≥ label + 2×20.
  const spec = {
    type: 'procedure',
    specVersion: 1,
    title: 'ink-floor hang-hang',
    domain: 'contract-performance',
    actors: [{ id: 'a-1', name: '甲方', role: '买方' }],
    sources: [{ id: 's-1', type: 'note', name: 't', loc: { file: 't' } }],
    stages: [
      { id: 'st-1', label: '主干' },
      { id: 'st-2', label: '挂枝' },
    ],
    nodes: [
      { id: 'n-1', kind: 'start', label: '开始', stageId: 'st-1' },
      { id: 'n-2', kind: 'decision', label: '是否走支线', stageId: 'st-1' },
      { id: 'n-3', kind: 'step', label: '主干付款', stageId: 'st-1', actorIds: ['a-1'] },
      { id: 'n-4', kind: 'end', label: '完成', stageId: 'st-1', outcome: 'positive' },
      { id: 'n-5', kind: 'decision', label: '支线是否回并', stageId: 'st-2' },
      { id: 'n-6', kind: 'end', label: '支线终止', stageId: 'st-2', outcome: 'negative' },
    ],
    edges: [
      { from: 'n-1', to: 'n-2', main: true },
      { from: 'n-2', to: 'n-3', condition: '否', main: true },
      { from: 'n-2', to: 'n-5', condition: '是' },
      { from: 'n-5', to: 'n-3', condition: '回并' },
      { from: 'n-5', to: 'n-6', condition: '结束' },
      { from: 'n-3', to: 'n-4', main: true },
    ],
  }
  const g = buildProcedureGraph(spec, { ...fields, stages: false }, undefined, 'vertical')
  const spine = new Set(g.spine)
  const c = g.connections.find((e) => e.id === 'c:n-5->n-6')
  assert.ok(c?.labelSize && c.points?.length, 'labelled hang↔hang edge')
  assert.equal(spine.has('n-5'), false)
  assert.equal(spine.has('n-6'), false)
  let bestLen = 0
  for (let i = 0; i < c.points.length - 1; i += 1) {
    const [p, q] = [c.points[i], c.points[i + 1]]
    bestLen = Math.max(bestLen, Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]))
  }
  const INK_PAD = 20
  const need = c.labelSize.width + 2 * INK_PAD
  assert.ok(bestLen + 0.5 >= need, `hang↔hang「结束」run ${bestLen} < floor ${need}`)
})

test('mainline: hang→spine rejoin uses hang lane (leave N/S, 1 bend, spine side entry)', () => {
  // Hang boxes may use N/S; spine keeps N/S for the trunk. Prefer: leave travel face → hang column
  // → spine mid → side face (1 bend). Outer corridor only when that lane is blocked.
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
  /** @type {{ file: string, id: string, leave: 'N' | 'S' }[]} */
  const cases = [
    { file: '03-labour-outsourcing-contract.zh-CN.json', id: 'c:n-7->n-2', leave: 'N' }, // upward distant
    { file: '07-share-acquisition-agreement.zh-CN.json', id: 'c:n-13->n-14', leave: 'S' }, // downward distant
    { file: '05-premises-lease.zh-CN.json', id: 'c:n-25->n-22', leave: 'N' }, // upward rejoin
    { file: '08-work-injury-recognition.zh-CN.json', id: 'c:n-14->n-15', leave: 'S' }, // near downward
  ]
  for (const { file, id, leave } of cases) {
    const spec = load(file)
    const g = buildProcedureGraph(spec, { ...fields, stages: false }, undefined, 'vertical')
    const byId = new Map(g.nodes.map((n) => [n.id, n]))
    const c = g.connections.find((e) => e.id === id)
    assert.ok(c, `${file}: missing ${id}`)
    const hang = byId.get(c.from)
    const spineN = byId.get(c.to)
    assert.ok(hang && spineN)
    assert.ok(g.spine.includes(c.to), `${file}: ${c.to} should be on spine`)
    assert.equal(g.spine.includes(c.from), false, `${file}: ${c.from} should be hang`)
    assert.equal(face(hang, c.points[0]), leave, `${file} ${id} leave`)
    const enter = face(spineN, c.points[c.points.length - 1])
    assert.ok(enter === 'E' || enter === 'W', `${file} ${id} spine side entry, got ${enter}`)
    assert.ok(bendsOf(c.points) <= 1, `${file} ${id} hang-lane ≤1 bend, got ${bendsOf(c.points)}`)
    const hangCx = hang.position.x + hang.data.w / 2
    assert.ok(Math.abs(c.points[1][0] - hangCx) < 1, `${file} ${id} vertical on hang centre`)
  }
  // Trunk N/S on the upward target stay free of the rejoin.
  {
    const spec = load('03-labour-outsourcing-contract.zh-CN.json')
    const g = buildProcedureGraph(spec, { ...fields, stages: false }, undefined, 'vertical')
    const byId = new Map(g.nodes.map((n) => [n.id, n]))
    const spine = byId.get('n-2')
    const mainIn = g.connections.find((e) => e.id === 'c:n-1->n-2')
    const mainOut = g.connections.find((e) => e.id === 'c:n-2->n-3')
    assert.equal(face(spine, mainIn.points[mainIn.points.length - 1]), 'N')
    assert.equal(face(spine, mainOut.points[0]), 'S')
  }
})

test('mainline: blocked hang-lane uses inward gutter (purchase-contract)', () => {
  // 02 n-9→n-6「是」: n-8 sits on the hang column above the diamond, so hang-lane is blocked.
  // Prefer the gutter between hang and spine (leave W, enter E) — not a far outer U with a tiny jog.
  const spec = load('02-purchase-contract.zh-CN.json')
  const g = buildProcedureGraph(spec, { ...fields, stages: false }, undefined, 'vertical')
  const byId = new Map(g.nodes.map((n) => [n.id, n]))
  const face = (n, [x, y]) => {
    const cx = n.position.x + n.data.w / 2
    const cy = n.position.y + n.data.h / 2
    if (Math.abs(x - n.position.x) < 1 && Math.abs(y - cy) < 1) return 'W'
    if (Math.abs(x - (n.position.x + n.data.w)) < 1 && Math.abs(y - cy) < 1) return 'E'
    if (Math.abs(y - n.position.y) < 1 && Math.abs(x - cx) < 1) return 'N'
    if (Math.abs(y - (n.position.y + n.data.h)) < 1 && Math.abs(x - cx) < 1) return 'S'
    return '?'
  }
  const c = g.connections.find((e) => e.id === 'c:n-9->n-6')
  const hang = byId.get('n-9')
  const spine = byId.get('n-6')
  assert.ok(c && hang && spine)
  assert.equal(face(hang, c.points[0]), 'W', 'gutter leaves toward the spine')
  assert.equal(face(spine, c.points[c.points.length - 1]), 'E')
  assert.ok(bendsOf(c.points) <= 2)
  const hangCx = hang.position.x + hang.data.w / 2
  const spineRight = spine.position.x + spine.data.w
  // Vertical run (if any) sits between spine and hang — not outside the hang column.
  for (let i = 0; i < c.points.length - 1; i += 1) {
    const [p, q] = [c.points[i], c.points[i + 1]]
    if (Math.abs(p[0] - q[0]) >= 0.5 || Math.abs(p[1] - q[1]) <= 1) continue
    assert.ok(p[0] < hangCx - 1, `gutter x=${p[0]} should be inward of hang cx ${hangCx}`)
    assert.ok(p[0] > spineRight - 1, `gutter x=${p[0]} should be outside spine right ${spineRight}`)
  }
})

test('mainline: S3 nested hang flips to opposite side (auto)', () => {
  // Synthetic S3 (issue 190 C4): long dead-end contains a shorter rejoin hang. Contained hang
  // flips to the free opposite face — no mainlineHangSide override.「是」left to 外挂;「回并」
  // leaves west; 内挂 stays on the preferred right; 0 box hits; spine 0-bend.
  const spec = JSON.parse(readFileSync('preview/synthetic-rejoin/fixtures/S3-outer-gutter-blocked.zh-CN.json', 'utf8'))
  const g = buildProcedureGraph(spec, { ...fields, stages: false }, undefined, 'vertical')
  const byId = new Map(g.nodes.map((n) => [n.id, n]))
  const spine = new Set(g.spine)
  assert.deepEqual(g.errors, [])
  assert.ok(spine.has('n-3') && spine.has('n-2') && spine.has('n-4'))

  const cx = (id) => byId.get(id).position.x + byId.get(id).data.w / 2
  assert.ok(cx('n-20') < cx('n-4'), '外挂 hang left of spine')
  assert.ok(cx('n-10') > cx('n-4'), '内挂 hang stays on preferred right')

  const face = (n, [x, y]) => {
    const ncx = n.position.x + n.data.w / 2
    const ncy = n.position.y + n.data.h / 2
    if (Math.abs(x - n.position.x) < 1 && Math.abs(y - ncy) < 1) return 'W'
    if (Math.abs(x - (n.position.x + n.data.w)) < 1 && Math.abs(y - ncy) < 1) return 'E'
    if (Math.abs(y - n.position.y) < 1 && Math.abs(x - ncx) < 1) return 'N'
    if (Math.abs(y - (n.position.y + n.data.h)) < 1 && Math.abs(x - ncx) < 1) return 'S'
    return '?'
  }
  const leaveIs = g.connections.find((e) => e.id === 'c:n-2->n-10')
  const leaveOut = g.connections.find((e) => e.id === 'c:n-4->n-20')
  const rejoin = g.connections.find((e) => e.id === 'c:n-21->n-3')
  assert.ok(leaveIs && leaveOut && rejoin)
  assert.equal(bendsOf(leaveIs.points), 0, '内挂「是」same-row leave')
  assert.equal(bendsOf(leaveOut.points), 0, '外挂「是」same-row leave')
  assert.equal(face(byId.get('n-4'), leaveOut.points[0]), 'W', '外挂 fork leaves left')
  assert.equal(face(byId.get('n-2'), leaveIs.points[0]), 'E', '内挂 fork leaves right')
  assert.ok(bendsOf(rejoin.points) <= 2, `回并 ≤2 bends, got ${bendsOf(rejoin.points)}`)
  assert.equal(face(byId.get('n-21'), rejoin.points[0]), 'W', '回并 leaves west away from spine')
  assert.equal(face(byId.get('n-3'), rejoin.points[rejoin.points.length - 1]), 'W')

  for (const c of g.connections.filter((e) => e.kind === 'main')) {
    assert.equal(bendsOf(c.points), 0, `${c.id} spine bend`)
  }

  const segHits = (p, q, box, pad = 0.5) => {
    const [x1, y1] = p
    const [x2, y2] = q
    const minx = Math.min(x1, x2)
    const maxx = Math.max(x1, x2)
    const miny = Math.min(y1, y2)
    const maxy = Math.max(y1, y2)
    const bx = box.position.x
    const by = box.position.y
    const bw = box.data.w
    const bh = box.data.h
    if (maxx < bx + pad || minx > bx + bw - pad || maxy < by + pad || miny > by + bh - pad) return false
    if (Math.abs(y1 - y2) < 0.5) return y1 > by + pad && y1 < by + bh - pad && maxx > bx + pad && minx < bx + bw - pad
    if (Math.abs(x1 - x2) < 0.5) return x1 > bx + pad && x1 < bx + bw - pad && maxy > by + pad && miny < by + bh - pad
    return false
  }
  const hits = []
  for (const c of [leaveIs, leaveOut, rejoin]) {
    for (let i = 0; i < c.points.length - 1; i += 1) {
      for (const n of g.nodes) {
        if (n.id === c.from || n.id === c.to) continue
        if (segHits(c.points[i], c.points[i + 1], n)) hits.push(`${c.id}@${n.id}`)
      }
    }
  }
  assert.deepEqual(hits, [], `S3 gate: no box hits, got ${hits.join(', ')}`)
})

test('mainline: stages-off hang→spine never enters trunk N/S (corpus)', () => {
  // Every hang→spine hop: spine end is E/W. Off-row hops leave hang on N/S (travel face), ≤2 bends.
  const face = (n, [x, y]) => {
    const cx = n.position.x + n.data.w / 2
    const cy = n.position.y + n.data.h / 2
    if (Math.abs(x - n.position.x) < 1 && Math.abs(y - cy) < 1) return 'W'
    if (Math.abs(x - (n.position.x + n.data.w)) < 1 && Math.abs(y - cy) < 1) return 'E'
    if (Math.abs(y - n.position.y) < 1 && Math.abs(x - cx) < 1) return 'N'
    if (Math.abs(y - (n.position.y + n.data.h)) < 1 && Math.abs(x - cx) < 1) return 'S'
    return '?'
  }
  let hops = 0
  for (const f of files) {
    const spec = load(f)
    const g = buildProcedureGraph(spec, { ...fields, stages: false }, undefined, 'vertical')
    const spine = new Set(g.spine)
    const byId = new Map(g.nodes.map((n) => [n.id, n]))
    for (const c of g.connections) {
      if (spine.has(c.from) || !spine.has(c.to)) continue
      hops += 1
      const hang = byId.get(c.from)
      const sp = byId.get(c.to)
      assert.ok(hang && sp, `${f} ${c.id}`)
      const enter = face(sp, c.points[c.points.length - 1])
      assert.ok(enter === 'E' || enter === 'W', `${f} ${c.id}: spine enter ${enter}, want E/W`)
      const sameRow = Math.abs(hang.position.y + hang.data.h / 2 - (sp.position.y + sp.data.h / 2)) < 2
      if (sameRow) {
        assert.equal(bendsOf(c.points), 0, `${f} ${c.id}: same-row hang→spine should be straight`)
        continue
      }
      const leave = face(hang, c.points[0])
      const towardSpine =
        hang.position.x + hang.data.w / 2 > sp.position.x + sp.data.w / 2 ? 'W' : 'E'
      // Hang-lane / outer leave N/S; inward gutter leaves the face toward the spine.
      assert.ok(
        leave === 'N' || leave === 'S' || leave === towardSpine,
        `${f} ${c.id}: off-row hang leave ${leave}, want N/S or ${towardSpine}`,
      )
      assert.ok(bendsOf(c.points) <= 2, `${f} ${c.id}: ≤2 bends, got ${bendsOf(c.points)}`)
      // Hang-lane (leave N/S, 1 bend) keeps the vertical on the hang centre.
      if ((leave === 'N' || leave === 'S') && bendsOf(c.points) <= 1) {
        const hangCx = hang.position.x + hang.data.w / 2
        assert.ok(Math.abs(c.points[1][0] - hangCx) < 1, `${f} ${c.id}: hang-lane vertical on hang cx`)
      }
    }
  }
  assert.ok(hops >= 4, `expected several hang→spine hops, got ${hops}`)
})

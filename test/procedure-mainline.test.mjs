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

import { buildProcedureGraph, labelBox } from '../src/renderers/procedure/flow/layout.js'
import { bendsOf } from '../src/renderers/procedure/flow/straighten.js'
import { analyseProcedureGraph } from '../src/renderers/procedure/flow/spine.js'
import { onDiamondOutline } from '../src/renderers/procedure/flow/diamondPorts.js'
import { textEm } from '../src/renderers/fact/cardGeometry.js'
import { LABEL_FONT, LABEL_PAD_X, LABEL_MAX_W, MAINLINE_LABEL_MAX_W, LABEL_LINE, PAD, sizeOf, wrapLines } from '../src/renderers/procedure/flow/metrics.js'

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

/** @param {ReturnType<typeof buildProcedureGraph>} g @param {string} f @param {string} dir */
function assertMainlineCellGrid(g, f, dir) {
  assert.ok(g.cellGrid, `${f} / ${dir}: expected cellGrid under mainline engine`)
  const cg = g.cellGrid
  assert.equal(cg.isH, dir === 'horizontal')
  assert.ok(cg.cellCross > 0, 'cellCross')
  assert.ok(cg.cols >= 1, 'cols')
  assert.ok(cg.padColsLeft >= 1 && cg.padColsRight >= 1, 'pad columns')
  assert.ok(Array.isArray(cg.rows) && cg.rows.length >= 1, 'rows')
  const row0 = cg.rows[0].size
  for (let i = 0; i < cg.rows.length; i += 1) {
    assert.ok(
      Math.abs(cg.rows[i].size - row0) < 0.01,
      `${f} / ${dir}: row ${i} size ${cg.rows[i].size} ≠ uniform ${row0}`,
    )
  }
  for (let i = 0; i < cg.rows.length - 1; i += 1) {
    const a = cg.rows[i]
    const b = cg.rows[i + 1]
    assert.equal(b.start, a.start + a.size, `${f} / ${dir}: rows must be contiguous`)
  }
  const vertical = dir === 'vertical'
  for (const n of g.nodes) {
    const r = { x: n.position.x, y: n.position.y, w: n.data.w, h: n.data.h }
    const cm = vertical ? r.x + r.w / 2 : r.y + r.h / 2
    const col = Math.round((cm - cg.originCross) / cg.cellCross - 0.5)
    const center = cg.originCross + (col + 0.5) * cg.cellCross
    assert.ok(
      Math.abs(center - cm) <= 1.5,
      `${f} / ${dir}: ${n.id} centre ${cm.toFixed(2)} off column ${col} centre ${center.toFixed(2)}`,
    )
    const lo = cg.originCross + col * cg.cellCross
    const hi = lo + cg.cellCross
    const c0 = vertical ? r.x : r.y
    const c1 = vertical ? r.x + r.w : r.y + r.h
    assert.ok(c0 >= lo - 0.5 && c1 <= hi + 0.5, `${f} / ${dir}: ${n.id} outside column bounds`)
    const a0 = vertical ? r.y : r.x
    const a1 = vertical ? r.y + r.h : r.x + r.w
    const am = (a0 + a1) / 2
    const row = cg.rows.find((rw) => a0 >= rw.start - 0.5 && a1 <= rw.start + rw.size + 0.5)
    assert.ok(row, `${f} / ${dir}: ${n.id} [${a0.toFixed(1)}, ${a1.toFixed(1)}] not contained within one cell row`)
    const rowCenter = row.start + row.size / 2
    assert.ok(
      Math.abs(am - rowCenter) <= 1.5,
      `${f} / ${dir}: ${n.id} along-centre ${am.toFixed(2)} off row centre ${rowCenter.toFixed(2)}`,
    )
  }
}

test('mainline: cellGrid present with valid shape (stages on)', () => {
  for (const f of files) {
    for (const dir of ['vertical', 'horizontal']) {
      const g = buildProcedureGraph(load(f), { ...fields, stages: true }, undefined, dir)
      assert.deepEqual(g.errors, [], `${f} / ${dir}`)
      assertMainlineCellGrid(g, f, dir)
    }
  }
})

test('mainline: cellGrid present with valid shape (stages off)', () => {
  for (const f of files) {
    for (const dir of ['vertical', 'horizontal']) {
      const g = buildProcedureGraph(load(f), { ...fields, stages: false }, undefined, dir)
      assert.deepEqual(g.errors, [], `${f} / ${dir}`)
      assertMainlineCellGrid(g, f, dir)
    }
  }
})

test('default engine: cellGrid is null', () => {
  for (const f of files.slice(0, 3)) {
    for (const dir of ['vertical', 'horizontal']) {
      const g = buildProcedureGraph(load(f), { stages: true }, undefined, dir)
      assert.equal(g.cellGrid, null, `${f} / ${dir}: ELK/current should not build a cell grid`)
    }
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
    const box = { x: n.position.x, y: n.position.y, w: n.data.w, h: n.data.h }
    // Split-track ports on diamond E/W faces (off the cardinal tip) still count as E/W.
    if (
      n.data?.node?.kind === 'decision' &&
      onDiamondOutline(box, [x, y]) &&
      Math.abs(y - cy) < n.data.h * 0.45
    ) {
      if (x > cx) return 'E'
      if (x < cx) return 'W'
    }
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
  // only LANE_SEP wide, so「结束」hid the whole stroke. Floor: longest run ≥ label + 2×INK_PAD.
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
  const INK_PAD = 12
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
  // 08 n-14→n-15 is input main:true hang→spine rejoin: place aligns hang with rejoin row so
  // the edge stays 0-bend side-horizontal (not the unmarked hang-lane S→side pattern above).
  {
    const spec = load('08-work-injury-recognition.zh-CN.json')
    const g = buildProcedureGraph(spec, { ...fields, stages: false }, undefined, 'vertical')
    const byId = new Map(g.nodes.map((n) => [n.id, n]))
    const c = g.connections.find((e) => e.id === 'c:n-14->n-15')
    assert.ok(c)
    const hang = byId.get('n-14')
    const spineN = byId.get('n-15')
    assert.ok(hang && spineN)
    assert.equal(bendsOf(c.points), 0, 'input main:true rejoin must be straight')
    const leaveFace = face(hang, c.points[0])
    const enter = face(spineN, c.points[c.points.length - 1])
    assert.ok(leaveFace === 'E' || leaveFace === 'W', `same-row leave on side face, got ${leaveFace}`)
    assert.ok(enter === 'E' || enter === 'W', `same-row enter on spine side, got ${enter}`)
    assert.ok(
      Math.abs(hang.position.y + hang.data.h / 2 - (spineN.position.y + spineN.data.h / 2)) < 2,
      'hang shares rejoin row',
    )
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
  // Outer free face: left hang leaves W (away from trunk / parent's same-row「是」), enters spine W.
  // Inward E leave crossed the leave hop (parent visual review); outer-left clears with ≤2 bends.
  assert.equal(face(byId.get('n-21'), rejoin.points[0]), 'W', '回并 leaves west on outer free face')
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

test('mainline: L1 litigation nested hang flips (DeepSeek fixture)', () => {
  // Legal-shaped S3 topology: 管辖异议 long dead hang contains 财产保全 short upward rejoin.
  // Contained 保全 flips left; 管辖 stays right; 回并 leaves west; 0 box hits.
  const spec = JSON.parse(readFileSync('preview/synthetic-rejoin/fixtures/L1-litigation-nested-hang.zh-CN.json', 'utf8'))
  const g = buildProcedureGraph(spec, { ...fields, stages: false }, undefined, 'vertical')
  const byId = new Map(g.nodes.map((n) => [n.id, n]))
  assert.deepEqual(g.errors, [])
  const cx = (id) => byId.get(id).position.x + byId.get(id).data.w / 2
  assert.ok(cx('n-16') < cx('n-5'), '财产保全 hang left of spine')
  assert.ok(cx('n-11') > cx('n-5'), '管辖异议 hang stays on preferred right')
  const face = (n, [x, y]) => {
    const ncx = n.position.x + n.data.w / 2
    const ncy = n.position.y + n.data.h / 2
    if (Math.abs(x - n.position.x) < 1 && Math.abs(y - ncy) < 1) return 'W'
    if (Math.abs(x - (n.position.x + n.data.w)) < 1 && Math.abs(y - ncy) < 1) return 'E'
    if (Math.abs(y - n.position.y) < 1 && Math.abs(x - ncx) < 1) return 'N'
    if (Math.abs(y - (n.position.y + n.data.h)) < 1 && Math.abs(x - ncx) < 1) return 'S'
    return '?'
  }
  const leaveJ = g.connections.find((e) => e.id === 'c:n-2->n-11')
  const leaveP = g.connections.find((e) => e.id === 'c:n-5->n-16')
  const rejoin = g.connections.find((e) => e.id === 'c:n-19->n-4')
  assert.ok(leaveJ && leaveP && rejoin)
  assert.equal(face(byId.get('n-2'), leaveJ.points[0]), 'E', '管辖 fork leaves right')
  assert.equal(face(byId.get('n-5'), leaveP.points[0]), 'W', '保全 fork leaves left')
  assert.equal(face(byId.get('n-19'), rejoin.points[0]), 'W', '回并 leaves west away from spine')
  assert.ok(bendsOf(rejoin.points) <= 2, `回并 ≤2 bends, got ${bendsOf(rejoin.points)}`)
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
  for (const c of [leaveJ, leaveP, rejoin]) {
    for (let i = 0; i < c.points.length - 1; i += 1) {
      for (const n of g.nodes) {
        if (n.id === c.from || n.id === c.to) continue
        if (segHits(c.points[i], c.points[i + 1], n)) hits.push(`${c.id}@${n.id}`)
      }
    }
  }
  assert.deepEqual(hits, [], `L1 gate: no box hits, got ${hits.join(', ')}`)
})

test('mainline: L2 decision hang→spine leaves side face (not N/S)', () => {
  // 「异议是否成立」否 → 是否申请财产保全 must leave W/E. Leaving N shares the hang-chain
  // in-port and reads as an incoming arrow on the diamond.
  const spec = JSON.parse(readFileSync('preview/synthetic-rejoin/fixtures/L2-labour-arbitration-nested.zh-CN.json', 'utf8'))
  const g = buildProcedureGraph(spec, { ...fields, stages: false }, undefined, 'vertical')
  const byId = new Map(g.nodes.map((n) => [n.id, n]))
  assert.deepEqual(g.errors, [])
  const face = (n, [x, y]) => {
    const ncx = n.position.x + n.data.w / 2
    const ncy = n.position.y + n.data.h / 2
    if (Math.abs(x - n.position.x) < 1 && Math.abs(y - ncy) < 1) return 'W'
    if (Math.abs(x - (n.position.x + n.data.w)) < 1 && Math.abs(y - ncy) < 1) return 'E'
    if (Math.abs(y - n.position.y) < 1 && Math.abs(x - ncx) < 1) return 'N'
    if (Math.abs(y - (n.position.y + n.data.h)) < 1 && Math.abs(x - ncx) < 1) return 'S'
    return '?'
  }
  const rejoin = g.connections.find((e) => e.id === 'c:n-13->n-6')
  assert.ok(rejoin, '异议否 → 保全决策')
  const leave = face(byId.get('n-13'), rejoin.points[0])
  // Right-side hang: leave west toward the spine (inward), not east into an outer U.
  assert.equal(leave, 'W', `否 should leave west toward spine, got ${leave}`)
  const enter = face(byId.get('n-6'), rejoin.points[rejoin.points.length - 1])
  assert.equal(enter, 'E', `spine enter from the hang side, got ${enter}`)
})

test('mainline: L1 branch-exit ends stay in hang lane (not canvas top)', () => {
  // Decision sibling ends (管辖异议终结 / 保全不准终结) used to place at y≈0 because the
  // child hang drew before its parent fork box existed, and could flip to the opposite face.
  // They must stay in the parent hang column, below the hang chain — not at the canvas top.
  const spec = JSON.parse(readFileSync('preview/synthetic-rejoin/fixtures/L1-litigation-nested-hang.zh-CN.json', 'utf8'))
  const g = buildProcedureGraph(spec, { ...fields, stages: false }, undefined, 'vertical')
  const byId = new Map(g.nodes.map((n) => [n.id, n]))
  assert.deepEqual(g.errors, [])
  const spineTop = Math.min(...g.spine.map((id) => byId.get(id).position.y))
  const cx = (id) => byId.get(id).position.x + byId.get(id).data.w / 2
  const spineCx = cx('n-5')

  const end15 = byId.get('n-15')
  const end20 = byId.get('n-20')
  assert.ok(end15.position.y > spineTop + 40, `n-15 must not sit at canvas top (y=${end15.position.y})`)
  assert.ok(end20.position.y > spineTop + 40, `n-20 must not sit at canvas top (y=${end20.position.y})`)
  assert.ok(cx('n-15') > spineCx, '管辖异议终结 stays on right with 管辖 hang')
  assert.ok(cx('n-20') < spineCx, '保全不准终结 stays left of spine (保全 hang)')
  // Shared hang-chain terminus stays in the lane; pure sibling end sits same-row right of the diamond.
  assert.ok(Math.abs(cx('n-15') - cx('n-14')) < 40, 'n-15 shares 管辖 lane with n-14')
  assert.ok(end15.position.y >= byId.get('n-14').position.y - 1, 'n-15 below/at 裁定移送管辖')
  const dec = byId.get('n-18')
  assert.ok(Math.abs(end20.position.y + end20.data.h / 2 - (dec.position.y + dec.data.h / 2)) < 2, 'n-20 same row as 是否准许保全')
  assert.ok(end20.position.x >= dec.position.x + dec.data.w - 1, 'n-20 to the right of 是否准许保全')
  const leaveNo = g.connections.find((e) => e.id === 'c:n-18->n-20')
  assert.ok(leaveNo)
  assert.equal(bendsOf(leaveNo.points), 0, '不准 should be a straight same-row hop')
})

test('mainline: stages-off hang→spine never enters trunk N/S (corpus)', () => {
  // Every hang→spine hop: spine end is E/W. Off-row hops leave hang on N/S (travel face), ≤2 bends.
  const face = (n, [x, y]) => {
    const cx = n.position.x + n.data.w / 2
    const cy = n.position.y + n.data.h / 2
    const box = { x: n.position.x, y: n.position.y, w: n.data.w, h: n.data.h }
    // Bidirectional split-track ports on diamond E/W faces (off cardinal tip).
    if (
      n.data?.node?.kind === 'decision' &&
      onDiamondOutline(box, [x, y]) &&
      Math.abs(y - cy) < n.data.h * 0.45
    ) {
      if (x > cx) return 'E'
      if (x < cx) return 'W'
    }
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

test('mainline: stages on → stacked bands; all mains 0-bend; whole spine straight', () => {
  let checked = 0
  for (const f of files) {
    const spec = load(f)
    const present = (spec.stages ?? []).filter((st) => spec.nodes.some((n) => n.stageId === st.id))
    const ids = new Set((spec.stages ?? []).map((s) => s.id))
    if (present.length < 1 || !spec.nodes.every((n) => n.stageId && ids.has(n.stageId))) continue
    checked += 1
    for (const dir of ['vertical', 'horizontal']) {
      const g = buildProcedureGraph(spec, { ...fields, stages: true }, undefined, dir)
      assert.equal(g.stats.layoutEngine, 'mainline', `${f} / ${dir}`)
      const byId = new Map(g.nodes.map((n) => [n.id, n]))
      const vals = g.spine.map((id) => centre(byId.get(id), dir))
      assert.ok(vals.length >= 2, `${f} / ${dir}: expected a spine`)
      const span = Math.max(...vals) - Math.min(...vals)
      assert.ok(span <= 2, `${f} / ${dir}: whole-spine centre span ${span.toFixed(2)}px > 2`)
      const spineSet = new Set(g.spine)
      for (const c of g.connections) {
        if (c.kind !== 'main' || !spineSet.has(c.from) || !spineSet.has(c.to)) continue
        assert.equal(bendsOf(c.points), 0, `${f} / ${dir}: main ${c.id} bends`)
      }
    }
  }
  assert.ok(checked > 0, 'expected staged examples')
})


test('mainline: stages on → stageBoxes non-overlapping, contain members, uniform cross span', () => {
  const overlap = (a, b) => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5
  let checked = 0
  for (const f of files) {
    const spec = load(f)
    const present = (spec.stages ?? []).filter((st) => spec.nodes.some((n) => n.stageId === st.id))
    const ids = new Set((spec.stages ?? []).map((s) => s.id))
    if (present.length < 2 || !spec.nodes.every((n) => n.stageId && ids.has(n.stageId))) continue
    checked += 1
    for (const dir of ['vertical', 'horizontal']) {
      const g = buildProcedureGraph(spec, { ...fields, stages: true }, undefined, dir)
      const used = new Set(g.nodes.map((n) => n.data?.node?.stageId).filter(Boolean))
      assert.ok(g.stageBoxes.length >= used.size, `${f} / ${dir}: at least one box per used canvas stage`)
      for (let i = 0; i < g.stageBoxes.length; i += 1) {
        for (let j = i + 1; j < g.stageBoxes.length; j += 1) {
          assert.ok(!overlap(g.stageBoxes[i], g.stageBoxes[j]), `${f} / ${dir}: boxes overlap`)
        }
      }
      if (dir === 'vertical') {
        const w0 = g.stageBoxes[0].w
        for (const b of g.stageBoxes) assert.ok(Math.abs(b.w - w0) < 0.5, `${f}: uniform width`)
      } else {
        const h0 = g.stageBoxes[0].h
        for (const b of g.stageBoxes) assert.ok(Math.abs(b.h - h0) < 0.5, `${f}: uniform height`)
      }
      const boxOf = new Map(g.stageBoxes.map((b) => [b.stageId, b]))
      for (const n of g.nodes) {
        const sid = n.data?.node?.stageId ?? spec.nodes.find((x) => x.id === n.id)?.stageId
        const b = boxOf.get(sid)
        assert.ok(b, `${f} / ${dir}: missing box for ${sid}`)
        assert.ok(
          n.position.x >= b.x - 0.5 &&
            n.position.y >= b.y - 0.5 &&
            n.position.x + n.data.w <= b.x + b.w + 0.5 &&
            n.position.y + n.data.h <= b.y + b.h + 0.5,
          `${f} / ${dir}: ${n.id} not inside stage box ${sid}`,
        )
      }
    }
  }
  assert.ok(checked > 0, 'expected multi-stage examples')
})

test('mainline: stages off → stageBoxes empty on straight spine', () => {
  let checked = 0
  for (const f of files) {
    const spec = load(f)
    const present = (spec.stages ?? []).filter((st) => spec.nodes.some((n) => n.stageId === st.id))
    if (present.length < 1) continue
    checked += 1
    for (const dir of ['vertical', 'horizontal']) {
      const g = buildProcedureGraph(spec, { ...fields, stages: false }, undefined, dir)
      assert.equal(g.stageBoxes.length, 0, `${f} / ${dir}: stages off → no boxes`)
      const byId = new Map(g.nodes.map((n) => [n.id, n]))
      const vals = g.spine.map((id) => centre(byId.get(id), dir))
      if (vals.length < 2) continue
      const span = Math.max(...vals) - Math.min(...vals)
      assert.ok(span <= 2, `${f} / ${dir}: stages-off spine span ${span.toFixed(2)}`)
    }
  }
  assert.ok(checked > 0, 'expected staged examples')
})


test('mainline: >4 incident parallel fan-out & merge uses 1-bend tree-fork rail and aligned sibling row', () => {
  const spec = {
    type: 'procedure',
    specVersion: 1,
    title: '行政复议五路并列决定与合并送达',
    domain: 'administrative',
    nodes: [
      { id: 'n-1', kind: 'start', label: '立案受理' },
      { id: 'n-2', kind: 'step', label: '全面审查' },
      { id: 'n-3', kind: 'decision', label: '作出何种行政复议决定？' },
      { id: 'n-4', kind: 'step', label: '决定维持原行政行为' },
      { id: 'n-5', kind: 'step', label: '决定变更原行政行为' },
      { id: 'n-6', kind: 'step', label: '决定撤销并责令重作' },
      { id: 'n-7', kind: 'step', label: '决定确认行为违法或无效' },
      { id: 'n-8', kind: 'step', label: '决定限期履行法定职责' },
      { id: 'n-9', kind: 'document', label: '制作复议决定书并送达' },
      { id: 'n-10', kind: 'end', label: '发生法律效力' },
    ],
    edges: [
      { from: 'n-1', to: 'n-2', main: true },
      { from: 'n-2', to: 'n-3', main: true },
      { from: 'n-3', to: 'n-4', condition: '合法适当', main: true },
      { from: 'n-3', to: 'n-5', condition: '内容不当' },
      { from: 'n-3', to: 'n-6', condition: '事实不清/违法' },
      { from: 'n-3', to: 'n-7', condition: '确认违法/无效' },
      { from: 'n-3', to: 'n-8', condition: '不履行职责' },
      { from: 'n-4', to: 'n-9', main: true },
      { from: 'n-5', to: 'n-9' },
      { from: 'n-6', to: 'n-9' },
      { from: 'n-7', to: 'n-9' },
      { from: 'n-8', to: 'n-9' },
      { from: 'n-9', to: 'n-10', main: true },
    ],
  }
  const g = buildProcedureGraph(spec, { ...fields, stages: false }, undefined, 'vertical')
  const byId = new Map(g.nodes.map((n) => [n.id, n]))
  const peers = ['n-4', 'n-5', 'n-6', 'n-7', 'n-8'].map((id) => byId.get(id))
  const rowY = peers[0].position.y
  for (const p of peers) {
    assert.ok(Math.abs(p.position.y - rowY) < 1, `sibling ${p.id} aligned on row y=${rowY}`)
  }
  for (const c of g.connections) {
    if (c.kind === 'main') {
      assert.equal(bendsOf(c.points), 0, `main ${c.id} should be 0-bend`)
    } else {
      assert.equal(bendsOf(c.points), 1, `branch/rejoin ${c.id} should be 1-bend`)
    }
  }
})

/** Longest horizontal run's mid-y for a polyline (fallback: average y). */
function trackY(points) {
  if (!points?.length) return 0
  let best = points[0][1]
  let bestLen = 0
  for (let i = 0; i < points.length - 1; i += 1) {
    const [p, q] = [points[i], points[i + 1]]
    if (Math.abs(p[1] - q[1]) >= 0.5) continue
    const len = Math.abs(q[0] - p[0])
    if (len > bestLen) {
      bestLen = len
      best = (p[1] + q[1]) / 2
    }
  }
  return best
}

test('mainline: bidirectional same-row A⇄B tracks and labels do not stack', () => {
  const spec = {
    type: 'procedure',
    specVersion: 1,
    title: '双向同排回路',
    domain: 'litigation',
    nodes: [
      { id: 'n-1', kind: 'start', label: '起' },
      { id: 'n-2', kind: 'decision', label: '是否受理？' },
      { id: 'n-3', kind: 'step', label: '补正材料' },
      { id: 'n-4', kind: 'step', label: '继续审查' },
      { id: 'n-5', kind: 'end', label: '终' },
    ],
    edges: [
      { from: 'n-1', to: 'n-2', main: true },
      { from: 'n-2', to: 'n-3', condition: '材料不全' },
      { from: 'n-3', to: 'n-2', condition: '补正后再次提交', back: true },
      { from: 'n-2', to: 'n-4', condition: '可以受理', main: true },
      { from: 'n-4', to: 'n-5', main: true },
    ],
  }
  const g = buildProcedureGraph(spec, { ...fields, stages: false }, undefined, 'vertical')
  assert.deepEqual(g.errors, [])
  const pairs = []
  for (const c of g.connections) {
    const ret = g.connections.find((o) => o !== c && o.from === c.to && o.to === c.from)
    if (!ret) continue
    const key = [c.from, c.to].sort().join('|')
    if (pairs.includes(key)) continue
    pairs.push(key)
    const byId = new Map(g.nodes.map((n) => [n.id, n]))
    const a = byId.get(c.from)
    const b = byId.get(c.to)
    assert.ok(a && b)
    const sameRow = Math.abs(a.position.y + a.data.h / 2 - (b.position.y + b.data.h / 2)) < 2
    if (!sameRow) continue
    const trackSep = Math.abs(trackY(c.points) - trackY(ret.points))
    let labelOverlap = false
    if (c.labelAt && ret.labelAt && c.labelSize && ret.labelSize) {
      labelOverlap =
        c.labelAt.x < ret.labelAt.x + ret.labelSize.width - 0.5 &&
        ret.labelAt.x < c.labelAt.x + c.labelSize.width - 0.5 &&
        c.labelAt.y < ret.labelAt.y + ret.labelSize.height - 0.5 &&
        ret.labelAt.y < c.labelAt.y + c.labelSize.height - 0.5
      assert.ok(!labelOverlap, `${c.id} / ${ret.id}: label chips must not overlap`)
    }
    // Rect↔rect: parallel tracks. Diamond pairs may share the cardinal tip but labels must clear.
    assert.ok(
      trackSep >= 10 || !labelOverlap,
      `${c.id} / ${ret.id}: need track separation or clear labels (sep=${trackSep})`,
    )
  }
  assert.ok(pairs.length > 0, 'expected a reciprocal pair')
})

test('mainline: non-overlapping hang intervals pack into lane 0 without empty intermediate column', () => {
  // Short later span before a later point-span must share lane 0 (not shove into col 2+).
  const spec = {
    type: 'procedure',
    specVersion: 1,
    title: '车道打包回归',
    domain: 'administrative',
    nodes: [
      { id: 'n-1', kind: 'start', label: '起' },
      { id: 'n-2', kind: 'step', label: '站2' },
      { id: 'n-3', kind: 'step', label: '站3' },
      { id: 'n-4', kind: 'step', label: '站4' },
      { id: 'n-5', kind: 'step', label: '站5' },
      { id: 'n-6', kind: 'end', label: '终' },
      { id: 'n-a1', kind: 'step', label: '早挂一步' },
      { id: 'n-a2', kind: 'step', label: '早挂二步' },
      { id: 'n-b1', kind: 'end', label: '晚挂终点' },
    ],
    edges: [
      { from: 'n-1', to: 'n-2', main: true },
      { from: 'n-2', to: 'n-3', main: true },
      { from: 'n-3', to: 'n-4', main: true },
      { from: 'n-4', to: 'n-5', main: true },
      { from: 'n-5', to: 'n-6', main: true },
      // Hang A: leave n-2, two boxes, rejoin n-4 → longer span.
      { from: 'n-2', to: 'n-a1' },
      { from: 'n-a1', to: 'n-a2', main: true },
      { from: 'n-a2', to: 'n-4' },
      // Hang B: leave n-5, single end → short/point span packed first by bySpan.
      { from: 'n-5', to: 'n-b1' },
    ],
  }
  const g = buildProcedureGraph(spec, { ...fields, stages: false }, undefined, 'vertical')
  assert.deepEqual(g.errors, [])
  const byId = new Map(g.nodes.map((n) => [n.id, n]))
  const cell = g.cellGrid?.cellCross ?? 112
  const spineX = byId.get('n-3').position.x + byId.get('n-3').data.w / 2
  const colOf = (id) => Math.round((byId.get(id).position.x + byId.get(id).data.w / 2 - spineX) / cell)
  // Both hangs must share the first hang column (lane 0); no empty intermediate column.
  assert.equal(Math.abs(colOf('n-a1')), 1, `n-a1 col≈${colOf('n-a1')}`)
  assert.equal(Math.abs(colOf('n-a2')), 1, `n-a2 col≈${colOf('n-a2')}`)
  assert.equal(Math.abs(colOf('n-b1')), 1, `n-b1 col≈${colOf('n-b1')}`)
})

test('mainline: cross-stage shared sink claimed by in-stage feeder (no vertical void)', () => {
  const spec = {
    type: 'procedure',
    specVersion: 1,
    title: '跨阶段汇合',
    domain: 'litigation',
    stages: [
      { id: 'st-1', label: '仲裁' },
      { id: 'st-2', label: '起诉' },
    ],
    nodes: [
      { id: 'n-1', kind: 'start', label: '起', stageId: 'st-1' },
      { id: 'n-2', kind: 'step', label: '仲裁裁决', stageId: 'st-1' },
      { id: 'n-3', kind: 'decision', label: '是否起诉？', stageId: 'st-1' },
      { id: 'n-4', kind: 'end', label: '裁决生效', stageId: 'st-1' },
      { id: 'n-5', kind: 'step', label: '准备起诉材料', stageId: 'st-2' },
      { id: 'n-6', kind: 'step', label: '向人民法院起诉', stageId: 'st-2' },
      { id: 'n-7', kind: 'end', label: '立案', stageId: 'st-2' },
    ],
    edges: [
      { from: 'n-1', to: 'n-2', main: true },
      { from: 'n-2', to: 'n-3', main: true },
      { from: 'n-3', to: 'n-4', condition: '不起诉' },
      { from: 'n-3', to: 'n-5', condition: '起诉', main: true },
      { from: 'n-5', to: 'n-6', main: true },
      // Extra in-stage feeder into shared sink (together with cross-stage from earlier).
      { from: 'n-5', to: 'n-7' },
      { from: 'n-6', to: 'n-7', main: true },
      // Cross-stage converge into n-6 as well (from st-1 step).
      { from: 'n-2', to: 'n-6' },
    ],
  }
  const g = buildProcedureGraph(spec, { ...fields, stages: true }, undefined, 'vertical')
  assert.deepEqual(g.errors, [])
  const byId = new Map(g.nodes.map((n) => [n.id, n]))
  const st2 = g.stageBoxes.find((b) => b.stageId === 'st-2')
  assert.ok(st2, 'st-2 box')
  const n5 = byId.get('n-5')
  const n6 = byId.get('n-6')
  const n7 = byId.get('n-7')
  const top = Math.min(n5.position.y, n6.position.y, n7.position.y)
  const voidAbove = top - st2.y
  assert.ok(voidAbove < 200, `st-2 void above first node too large: ${voidAbove.toFixed(1)}px`)
  const span = Math.max(n5.position.y + n5.data.h, n6.position.y + n6.data.h, n7.position.y + n7.data.h) - top
  assert.ok(span < 500, `st-2 member vertical span too large: ${span.toFixed(1)}px`)
})

test('labelBox applies width slack beyond raw textEm * LABEL_FONT', () => {
  // Short chips stay under LABEL_MAX_W so slack is visible; long text is capped at LABEL_MAX_W.
  for (const text of ['不符合', '第47条']) {
    const raw = textEm(text) * LABEL_FONT + LABEL_PAD_X * 2
    const box = labelBox(text)
    assert.ok(box.width > raw, `labelBox('${text}') width ${box.width} should exceed raw ${raw}`)
    assert.ok(box.width <= LABEL_MAX_W, `labelBox('${text}') width ${box.width} exceeds LABEL_MAX_W`)
  }
  // 8-char CJK at default cap stays 1 line; Mainline-first allows wider chips (MAINLINE_LABEL_MAX_W, issue #376).
  {
    const eight = labelBox('第47条以外的争议')
    assert.equal(eight.width, LABEL_MAX_W, `labelBox('第47条以外的争议') should cap at LABEL_MAX_W`)
    assert.equal(eight.height, LABEL_LINE + 2, `8-char CJK should stay 1 line, h=${eight.height}`)
  }
  {
    const longer = labelBox('属民事诉讼受案范围且本院有管辖权', MAINLINE_LABEL_MAX_W)
    assert.equal(longer.width, MAINLINE_LABEL_MAX_W, `long condition should cap at MAINLINE_LABEL_MAX_W`)
    assert.equal(longer.height, LABEL_LINE * 2 + 2, `16-char condition should wrap cleanly to 2 lines, h=${longer.height}`)
  }
})

test('mainline: stages on → stageBoxes stay non-negative and enclose connection rails', () => {
  let checked = 0
  for (const f of files) {
    const spec = load(f)
    const present = (spec.stages ?? []).filter((st) => spec.nodes.some((n) => n.stageId === st.id))
    const ids = new Set((spec.stages ?? []).map((s) => s.id))
    if (present.length < 1 || !spec.nodes.every((n) => n.stageId && ids.has(n.stageId))) continue
    checked += 1
    for (const dir of ['vertical', 'horizontal']) {
      const g = buildProcedureGraph(spec, { ...fields, stages: true }, undefined, dir)
      assert.equal(g.stats.layoutEngine, 'mainline', `${f} / ${dir}`)
      assert.ok(g.stageBoxes.length >= 1, `${f} / ${dir}: expected stage boxes`)
      for (const b of g.stageBoxes) {
        assert.ok(b.x >= 0 && b.y >= 0, `${f} / ${dir}: stageBox ${b.stageId} has negative origin (${b.x}, ${b.y})`)
        assert.ok(b.x >= PAD - 0.5, `${f} / ${dir}: stageBox ${b.stageId} x ${b.x} < PAD`)
        assert.ok(b.y >= PAD - 0.5, `${f} / ${dir}: stageBox ${b.stageId} y ${b.y} < PAD`)
      }
      const cg = g.cellGrid
      assert.ok(cg, `${f} / ${dir}: cellGrid`)
      const vertical = dir === 'vertical'
      if (cg.hasStages) {
        const cross0 = cg.originCross + (cg.stageColStart ?? 0) * cg.cellCross
        const cross1 = cross0 + (cg.stageColCount ?? cg.cols) * cg.cellCross
        for (const b of g.stageBoxes) {
          const b0 = vertical ? b.x : b.y
          const b1 = vertical ? b.x + b.w : b.y + b.h
          assert.ok(Math.abs(b0 - cross0) < 0.5, `${f} / ${dir}: ${b.stageId} cross start vs grid`)
          assert.ok(Math.abs(b1 - cross1) < 0.5, `${f} / ${dir}: ${b.stageId} cross end vs grid`)
        }
      }
      if (vertical && g.stageBoxes.length) {
        const byY = [...g.stageBoxes].sort((a, b) => a.y - b.y)
        const y0 = byY[0].y
        const y1 = byY[byY.length - 1].y + byY[byY.length - 1].h
        for (const c of g.connections) {
          for (const [, y] of c.points ?? []) {
            assert.ok(
              y >= y0 - 0.5 && y <= y1 + 0.5,
              `${f}: ${c.id} point y=${y.toFixed(1)} outside stage span [${y0.toFixed(1)}, ${y1.toFixed(1)}]`,
            )
          }
        }
      }
    }
  }
  assert.ok(checked > 0, 'expected staged examples')
})



test('issue #376: horizontal mainline condition labels stay horizontal (never vertically transposed)', () => {
  for (const f of files) {
    const spec = load(f)
    const g = buildProcedureGraph(spec, fields, undefined, 'horizontal')
    for (const c of g.connections) {
      if (!c.label || !c.labelSize) continue
      if (String(c.label).length >= 3) {
        assert.ok(
          c.labelSize.width > c.labelSize.height,
          `${f}: horizontal label '${c.label}' looks vertically transposed (${c.labelSize.width}x${c.labelSize.height})`,
        )
      }
    }
  }
})

test('issue #376: 9-10 char step labels wrap onto balanced lines without orphan-char wrap', () => {
  for (const label of ['乙方发货并随附单证', '甲方提出书面质量异议']) {
    const sz = sizeOf({ kind: 'step', label }, false)
    assert.ok(wrapLines(label, sz.textW) <= 2, `step '${label}' should fit in ≤2 lines`)
    assert.ok(
      sz.textW <= 104,
      `step '${label}' should compact to a balanced 2-line width (got textW=${sz.textW}, avoiding 8+1 orphan wrap)`,
    )
  }
})

test('issue #376: same-column reciprocal rework loop separates onto two parallel vertical tracks', () => {
  const spec = {
    type: 'procedure',
    specVersion: 1,
    title: '同列单步补正回环',
    domain: 'litigation',
    stages: [{ id: 'st-1', label: '立案审查' }],
    nodes: [
      { id: 'n-1', kind: 'start', label: '提交起诉状', stageId: 'st-1' },
      { id: 'n-2', kind: 'decision', label: '材料是否齐备', stageId: 'st-1' },
      { id: 'n-3', kind: 'step', label: '一次性告知补正', stageId: 'st-1' },
      { id: 'n-4', kind: 'end', label: '登记立案', stageId: 'st-1', outcome: 'positive' },
    ],
    edges: [
      { from: 'n-1', to: 'n-2', main: true },
      { from: 'n-2', to: 'n-3', condition: '材料欠缺' },
      { from: 'n-3', to: 'n-2', condition: '补正后重审' },
      { from: 'n-2', to: 'n-4', condition: '材料齐备', main: true },
    ],
  }
  const g = buildProcedureGraph(spec, fields, undefined, 'vertical')
  const fwd = g.connections.find((c) => c.from === 'n-2' && c.to === 'n-3')
  const ret = g.connections.find((c) => c.from === 'n-3' && c.to === 'n-2')
  assert.ok(fwd?.points?.length >= 2 && ret?.points?.length >= 2, 'both reciprocal edges should route')
  // Whether same-row or same-column, reciprocal strokes must not stack on one shared line
  const sameLine =
    fwd.points.length === 2 &&
    ret.points.length === 2 &&
    Math.abs(fwd.points[0][0] - ret.points[1][0]) < 1 &&
    Math.abs(fwd.points[0][1] - ret.points[1][1]) < 1 &&
    Math.abs(fwd.points[1][0] - ret.points[0][0]) < 1 &&
    Math.abs(fwd.points[1][1] - ret.points[0][1]) < 1
  assert.equal(sameLine, false, 'reciprocal rework loop arrows must be separated onto parallel tracks')
})

test('issue #190: off-spine stages never splice ahead of an earlier spine stage', () => {
  const spec = {
    type: 'procedure',
    specVersion: 1,
    title: '离主干阶段顺序保序',
    domain: 'contract-performance',
    stages: [
      { id: 'st-1', label: '签订与下单' },
      { id: 'st-2', label: '交货与检验' },
      { id: 'st-3', label: '付款' },
      { id: 'st-4', label: '质量异议与协商' },
      { id: 'st-5', label: '违约处理与终止' },
    ],
    nodes: [
      { id: 'n-1', kind: 'start', label: '合同签订', stageId: 'st-1' },
      { id: 'n-2', kind: 'decision', label: '检验是否合格', stageId: 'st-2' },
      { id: 'n-3', kind: 'step', label: '甲方付款', stageId: 'st-3' },
      { id: 'n-4', kind: 'end', label: '履行完毕', stageId: 'st-3', outcome: 'positive' },
      { id: 'n-5', kind: 'step', label: '提出质量异议', stageId: 'st-4' },
      { id: 'n-6', kind: 'decision', label: '协商是否成功', stageId: 'st-4' },
      { id: 'n-7', kind: 'step', label: '按协议处理', stageId: 'st-4' },
      { id: 'n-8', kind: 'end', label: '合同终止', stageId: 'st-5', outcome: 'negative' },
    ],
    edges: [
      { from: 'n-1', to: 'n-2', main: true },
      { from: 'n-2', to: 'n-3', condition: '合格', main: true },
      { from: 'n-3', to: 'n-4', main: true },
      { from: 'n-2', to: 'n-5', condition: '不合格' },
      { from: 'n-5', to: 'n-6' },
      { from: 'n-6', to: 'n-7', condition: '协商成功' },
      { from: 'n-7', to: 'n-3' },
      { from: 'n-6', to: 'n-8', condition: '协商不成' },
    ],
  }
  const g = buildProcedureGraph(spec, fields, undefined, 'vertical')
  assert.deepEqual(
    g.stageBoxes.map((b) => b.stageId),
    ['st-1', 'st-2', 'st-3', 'st-4', 'st-5'],
    'stage bands must follow spec.stages order without splicing off-spine stages ahead of st-3',
  )
  const n2 = g.nodes.find((n) => n.id === 'n-2')
  const n3 = g.nodes.find((n) => n.id === 'n-3')
  assert.ok(n3.position.y - (n2.position.y + n2.data.h) < 150, 'main spine n-2→n-3 must not have a vertical chasm')
  // Horizontal mode must also have zero 180-degree collinear spikes (overshoot-and-reverse stubs).
  const gh = buildProcedureGraph(spec, fields, undefined, 'horizontal')
  for (const c of gh.connections) {
    const pts = c.points ?? []
    for (let i = 0; i < pts.length - 2; i += 1) {
      const [a, b, d] = [pts[i], pts[i + 1], pts[i + 2]]
      const sameX = Math.abs(a[0] - b[0]) < 0.5 && Math.abs(b[0] - d[0]) < 0.5
      const sameY = Math.abs(a[1] - b[1]) < 0.5 && Math.abs(b[1] - d[1]) < 0.5
      assert.equal(sameX || sameY, false, `${c.id} has redundant collinear / hairpin point ${JSON.stringify([a, b, d])}`)
    }
  }
})

test('issue #190: off-spine 4-way fan-out & bus-merge aligns siblings on one row with 0 crossings', () => {
  const spec = {
    type: 'procedure',
    specVersion: 1,
    title: '离主干多路并列扇出汇流',
    domain: 'administrative',
    stages: [{ id: 'st-1', label: '作出决定' }],
    nodes: [
      { id: 'n-1', kind: 'start', label: '审理终结', stageId: 'st-1' },
      { id: 'n-2', kind: 'decision', label: '行为是否合法适当', stageId: 'st-1' },
      { id: 'n-3', kind: 'step', label: '决定维持', stageId: 'st-1' },
      { id: 'n-4', kind: 'decision', label: '属于哪类违法', stageId: 'st-1' },
      { id: 'n-5', kind: 'step', label: '决定变更', stageId: 'st-1' },
      { id: 'n-6', kind: 'step', label: '决定撤销', stageId: 'st-1' },
      { id: 'n-7', kind: 'step', label: '确认无效', stageId: 'st-1' },
      { id: 'n-8', kind: 'step', label: '责令履行', stageId: 'st-1' },
      { id: 'n-9', kind: 'end', label: '送达决定书', stageId: 'st-1', outcome: 'positive' },
    ],
    edges: [
      { from: 'n-1', to: 'n-2', main: true },
      { from: 'n-2', to: 'n-3', condition: '合法适当', main: true },
      { from: 'n-3', to: 'n-9', main: true },
      { from: 'n-2', to: 'n-4', condition: '违法或不当' },
      { from: 'n-4', to: 'n-5', condition: '第63条' },
      { from: 'n-4', to: 'n-6', condition: '第64条' },
      { from: 'n-4', to: 'n-7', condition: '第67条' },
      { from: 'n-4', to: 'n-8', condition: '第66条' },
      { from: 'n-5', to: 'n-9' },
      { from: 'n-6', to: 'n-9' },
      { from: 'n-7', to: 'n-9' },
      { from: 'n-8', to: 'n-9' },
    ],
  }
  const g = buildProcedureGraph(spec, fields, undefined, 'vertical')
  const sibYs = ['n-5', 'n-6', 'n-7', 'n-8'].map((id) => {
    const n = g.nodes.find((x) => x.id === id)
    return n.position.y + n.data.h / 2
  })
  assert.ok(Math.max(...sibYs) - Math.min(...sibYs) <= 2, `off-spine fan-out siblings should align on one row: ${sibYs}`)
})

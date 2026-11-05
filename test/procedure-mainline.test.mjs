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

test('spine.js agrees with the default layout on the main line', () => {
  for (const f of files) {
    const spec = load(f)
    const { spine } = analyseProcedureGraph(spec)
    const g = buildProcedureGraph(spec, {}, undefined, 'vertical')
    assert.deepEqual(spine, g.spine, `${f}: shared spine walk must match layout.js`)
  }
})

test('mainline: seven contracts, both orientations, no overlap, every node present', () => {
  for (const f of files) {
    for (const dir of ['vertical', 'horizontal']) {
      const spec = load(f)
      const g = buildProcedureGraph(spec, fields, undefined, dir)
      assert.deepEqual(g.errors, [], `${f} / ${dir} mainline does not lay out`)
      assert.equal(g.nodes.length, spec.nodes.length, `${f}: not one node may be lost`)
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
      assert.equal(g.nodes.length, raw.nodes.length)
      const byId = new Map(g.nodes.map((n) => [n.id, n]))
      const vals = g.spine.map((id) => centre(byId.get(id), dir))
      assert.ok(vals.length >= 2, `${f}: expected a spine`)
      const span = Math.max(...vals) - Math.min(...vals)
      assert.ok(span <= 2, `${f} / ${dir}: implicit spine centre span ${span.toFixed(2)}px > 2`)
    }
  }
})

test('mainline: kind:end sits on the stage spine axis (terminus, including rule-only stubs)', () => {
  for (const f of files) {
    const spec = load(f)
    const ends = spec.nodes.filter((n) => n.kind === 'end')
    if (!ends.length) continue
    for (const dir of ['vertical', 'horizontal']) {
      const g = buildProcedureGraph(spec, fields, undefined, dir)
      const byId = new Map(g.nodes.map((n) => [n.id, n]))
      const stageOf = new Map(spec.nodes.map((n) => [n.id, n.stageId ?? '__implicit__']))
      /** @type {Map<string, number[]>} */
      const axes = new Map()
      for (const id of g.spine) {
        const st = stageOf.get(id) ?? '__implicit__'
        if (!axes.has(st)) axes.set(st, [])
        axes.get(st).push(centre(byId.get(id), dir))
      }
      // Stages whose only trunk nodes are rule-only ends: those ends share one axis.
      /** @type {Map<string, number[]>} */
      const endAxes = new Map()
      for (const end of ends) {
        const st = stageOf.get(end.id) ?? '__implicit__'
        if (!endAxes.has(st)) endAxes.set(st, [])
        endAxes.get(st).push(centre(byId.get(end.id), dir))
      }
      for (const end of ends) {
        const n = byId.get(end.id)
        assert.ok(n, `${f}: missing end ${end.id}`)
        const st = stageOf.get(end.id) ?? '__implicit__'
        const vals = axes.get(st) ?? []
        const c = centre(n, dir)
        if (vals.length) {
          const axis = vals.reduce((s, v) => s + v, 0) / vals.length
          assert.ok(Math.abs(c - axis) <= 2, `${f} / ${dir}: end ${end.id} centre ${c.toFixed(1)} off spine axis ${axis.toFixed(1)}`)
        } else {
          const eVals = endAxes.get(st) ?? [c]
          const span = Math.max(...eVals) - Math.min(...eVals)
          assert.ok(span <= 2, `${f} / ${dir}: lone-stage ends in ${st} span ${span.toFixed(2)}px`)
        }
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
  assert.ok(branchOk / branchTotal >= 0.95, `only ${branchOk} of ${branchTotal} in-stage decision branches bend ≤1`)
  assert.ok(backSameRow > 0, 'expected at least one same-row back to a decision')
  assert.equal(backBent, 0, `${backBent} of ${backSameRow} same-row backs still bend`)
})

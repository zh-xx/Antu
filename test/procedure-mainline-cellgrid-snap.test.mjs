// ============================================================
//  test/procedure-mainline-cellgrid-snap.test.mjs — every node centre on a cell
// ============================================================

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

import { buildProcedureGraph, labelBox } from '../src/renderers/procedure/flow/layout.js'
import { bookmarkBoxOf } from '../src/renderers/procedure/flow/columns.js'
import { sizeOf } from '../src/renderers/procedure/flow/metrics.js'
import { applyStackedStageBands } from '../src/renderers/procedure/flow/stackedStages.js'
import { bendsOf } from '../src/renderers/procedure/flow/straighten.js'
import {
  clearWrapAround,
  segRunsOnBoxEdge,
  findCollinearAmbiguities,
  pathCrossCount,
  segHitsBox,
} from '../src/renderers/procedure/flow/hangSpineRoute.js'

const STRICT = 'test/fixtures/mainline-strict'
const strictFiles = readdirSync(STRICT)
  .filter((f) => f.endsWith('.zh-CN.json'))
  .sort()
const exampleFiles = readdirSync('examples/procedure')
  .filter((f) => f.endsWith('.zh-CN.json'))
  .sort()
  .slice(0, 4)

const fixtures = [
  ...strictFiles.map((f) => ({ path: `${STRICT}/${f}`, name: f })),
  ...exampleFiles.map((f) => ({ path: `examples/procedure/${f}`, name: f })),
]
const load = (p) => JSON.parse(readFileSync(p, 'utf8'))

/**
 * @param {ReturnType<typeof buildProcedureGraph>} g
 * @param {string} label
 * @param {'vertical'|'horizontal'} dir
 */
function assertOnLattice(g, label, dir) {
  const cg = g.cellGrid
  assert.ok(cg, `${label}: cellGrid`)
  const vertical = dir === 'vertical'
  for (const n of g.nodes) {
    const w = n.data.w
    const h = n.data.h
    const cm = vertical ? n.position.x + w / 2 : n.position.y + h / 2
    const am = vertical ? n.position.y + h / 2 : n.position.x + w / 2
    const col = Math.round((cm - cg.originCross) / cg.cellCross - 0.5)
    const colC = cg.originCross + (col + 0.5) * cg.cellCross
    assert.ok(
      Math.abs(cm - colC) <= 1,
      `${label} ${n.id}: cross centre ${cm.toFixed(2)} off cell ${colC.toFixed(2)} by ${Math.abs(cm - colC).toFixed(2)}`,
    )
    const ca = cg.cellAlong ?? cg.rows[0].size
    const originAlong = cg.rows[0].start
    const row = Math.round((am - originAlong) / ca - 0.5)
    const rowC = originAlong + (row + 0.5) * ca
    assert.ok(
      Math.abs(am - rowC) <= 1,
      `${label} ${n.id}: along centre ${am.toFixed(2)} off cell ${rowC.toFixed(2)} by ${Math.abs(am - rowC).toFixed(2)}`,
    )
  }
}

test('sizeOf floors: short step ≥136×56, width multiple of 16; diamond ≥160×84', () => {
  const step = sizeOf({ kind: 'step', label: '受理' }, false)
  assert.ok(step.w >= 136 && step.h >= 56, `step ${step.w}x${step.h}`)
  assert.equal(step.w % 16, 0, `step width ${step.w} not multiple of 16`)
  const pill = sizeOf({ kind: 'start', label: '开始' }, false)
  assert.ok(pill.w >= 136 && pill.h >= 56)
  assert.equal(pill.w % 16, 0)
  const diamond = sizeOf({ kind: 'decision', label: '是否？' }, false)
  assert.ok(diamond.w >= 160 && diamond.h >= 84, `diamond ${diamond.w}x${diamond.h}`)
  assert.equal(diamond.w % 16, 0)
  // Long CJK label wraps compactly (2 lines) instead of bloating to ~240px.
  const long = sizeOf({ kind: 'step', label: '不裁定重整，申请不予受理' }, false)
  assert.ok(long.w <= 176, `long step width ${long.w} should stay compact`)
  assert.ok(long.textW <= 130, `long textW ${long.textW}`)
})

test('cross-stage 2-point shift enters target face midpoint, not side border', () => {
  // Two stages stacked vertically; a horizontal 2-point link from A→B becomes an L into B's top mid
  // when stage B is pushed down (cellAlong lattice separation).
  const placed = new Map([
    ['a', { x: 40, y: 40, w: 80, h: 56 }],
    ['b', { x: 200, y: 48, w: 80, h: 56 }],
  ])
  const connections = [
    {
      from: 'a',
      to: 'b',
      points: [
        [120, 68],
        [200, 68],
      ],
    },
  ]
  const size = { width: 400, height: 200 }
  const nodes = [
    { id: 'a', stageId: 's1' },
    { id: 'b', stageId: 's2' },
  ]
  const stages = [
    { id: 's1', label: '一' },
    { id: 's2', label: '二' },
  ]
  applyStackedStageBands({
    placed,
    connections,
    size,
    nodes,
    stages,
    spine: ['a', 'b'],
    vertical: true,
    groups: [{ from: 'a', to: 'b' }],
    cellAlong: 128,
  })
  const pts = connections[0].points
  const b = placed.get('b')
  assert.ok(b, 'target placed')
  assert.ok(pts.length >= 3, `expected L-route, got ${pts.length} points`)
  const last = pts[pts.length - 1]
  const topMidX = b.x + b.w / 2
  const topY = b.y
  assert.ok(
    Math.abs(last[0] - topMidX) <= 1 && Math.abs(last[1] - topY) <= 1,
    `enter should be top mid (${topMidX},${topY}), got (${last[0]},${last[1]})`,
  )
  // Must not ride the left or right side border of the target.
  const onLeft = Math.abs(last[0] - b.x) < 1
  const onRight = Math.abs(last[0] - (b.x + b.w)) < 1
  assert.ok(!onLeft && !onRight, 'must not enter on side border')
})

for (const stages of [true, false]) {
  for (const dir of /** @type {const} */ (['vertical', 'horizontal'])) {
    test(`mainline grid snap: stages=${stages} ${dir}`, () => {
      for (const { path, name } of fixtures) {
        const g = buildProcedureGraph(
          load(path),
          { engine: 'mainline', grid: true, stages, conditions: true, detail: false },
          undefined,
          dir,
        )
        assert.deepEqual(g.errors, [], `${name}: errors`)
        assertOnLattice(g, `${name} stages=${stages} ${dir}`, dir)
      }
    })
  }
}

test('multi-exit hang: dead-end beside step, shared end under feeder, 0-bend edges', () => {
  // Hang-chain walk prefers the lexicographically first non-spine out as continuation.
  // Name the shared sink before the pure leaf so the leaf becomes the sibling side-end.
  // earlyFork sits above n/spineStep and also feeds sharedEnd (spine → hang branch).
  // List earlyFork→sharedEnd last so hang discovery still builds the multi-exit chain from fork.
  const spec = {
    type: 'procedure',
    specVersion: 1,
    title: 'multi-exit hang convergence',
    domain: 'contract-performance',
    actors: [{ id: 'a-1', name: '甲方', role: '买方' }],
    sources: [{ id: 's-1', type: 'note', name: 't', loc: { file: 't' } }],
    stages: [{ id: 'st-1', label: '主干' }],
    nodes: [
      { id: 'start', kind: 'start', label: '开始', stageId: 'st-1' },
      { id: 'earlyFork', kind: 'decision', label: '早期汇合', stageId: 'st-1' },
      { id: 'fork', kind: 'decision', label: '是否分支', stageId: 'st-1' },
      { id: 'n', kind: 'step', label: '挂枝步骤', stageId: 'st-1', actorIds: ['a-1'] },
      { id: 'sharedEnd', kind: 'end', label: '汇合终', stageId: 'st-1', outcome: 'neutral' },
      { id: 'zLeaf', kind: 'end', label: '终止', stageId: 'st-1', outcome: 'negative' },
      { id: 'spineStep', kind: 'step', label: '主干步骤', stageId: 'st-1', actorIds: ['a-1'] },
      { id: 'finalEnd', kind: 'end', label: '完成', stageId: 'st-1', outcome: 'positive' },
    ],
    edges: [
      { from: 'start', to: 'earlyFork', main: true },
      { from: 'earlyFork', to: 'fork', condition: '否', main: true },
      { from: 'fork', to: 'spineStep', condition: '否', main: true },
      { from: 'spineStep', to: 'finalEnd', main: true },
      { from: 'fork', to: 'n', condition: '是' },
      { from: 'n', to: 'sharedEnd', condition: '合' },
      { from: 'n', to: 'zLeaf', condition: '止' },
      { from: 'spineStep', to: 'sharedEnd' },
      { from: 'earlyFork', to: 'sharedEnd', condition: '是' },
    ],
  }
  const g = buildProcedureGraph(
    spec,
    { engine: 'mainline', grid: true, stages: false, conditions: true, detail: false },
    undefined,
    'vertical',
  )
  assert.deepEqual(g.errors, [], 'errors')
  assertOnLattice(g, 'multi-exit hang', 'vertical')
  const byId = new Map(g.nodes.map((node) => [node.id, node]))
  const boxOf = (id) => {
    const node = byId.get(id)
    assert.ok(node, id)
    return { x: node.position.x, y: node.position.y, w: node.data.w, h: node.data.h }
  }
  const hang = boxOf('n')
  const dead = boxOf('zLeaf')
  const shared = boxOf('sharedEnd')
  const early = boxOf('earlyFork')
  const finalBox = boxOf('finalEnd')
  const spineStep = boxOf('spineStep')
  assert.ok(hang.y > early.y - 2, 'n below earlyFork')
  assert.ok(spineStep.y > early.y + early.h - 2, 'spineStep below earlyFork')
  const edge = (from, to) => {
    const c = g.connections.find((e) => e.from === from && e.to === to)
    assert.ok(c?.points?.length >= 2, `${from}->${to}`)
    return c
  }
  const cDead = edge('n', 'zLeaf')
  edge('n', 'sharedEnd')
  edge('spineStep', 'sharedEnd')
  const cEarlyShared = edge('earlyFork', 'sharedEnd')
  assert.equal(bendsOf(cDead.points), 0, 'n -> zLeaf 0 bends')
  assert.ok(
    Math.abs(dead.y + dead.h / 2 - (hang.y + hang.h / 2)) <= 2,
    'dead-end beside hang step (same row)',
  )
  assert.ok(Math.abs(dead.x - hang.x) > 8, 'dead-end distinct column from hang step')
  // earlyFork → sharedEnd must stay in-bounds (no world-wrap blank row below finalEnd)
  // and terminate on sharedEnd's box boundary (never strictly inside).
  const yLo = early.y
  const yHi = finalBox.y + finalBox.h + 16
  for (const p of cEarlyShared.points) {
    assert.ok(
      p[1] >= yLo - 1 && p[1] <= yHi + 1,
      `earlyFork->sharedEnd y=${p[1].toFixed(1)} outside [${yLo}, ${yHi}] (no wrap below finalEnd)`,
    )
  }
  const enter = cEarlyShared.points[cEarlyShared.points.length - 1]
  const strictlyInside =
    enter[0] > shared.x + 0.5 &&
    enter[0] < shared.x + shared.w - 0.5 &&
    enter[1] > shared.y + 0.5 &&
    enter[1] < shared.y + shared.h - 0.5
  assert.equal(strictlyInside, false, 'earlyFork->sharedEnd must not end inside sharedEnd box')
  const onBoundary =
    Math.abs(enter[0] - shared.x) <= 1 ||
    Math.abs(enter[0] - (shared.x + shared.w)) <= 1 ||
    Math.abs(enter[1] - shared.y) <= 1 ||
    Math.abs(enter[1] - (shared.y + shared.h)) <= 1
  assert.ok(onBoundary, `earlyFork->sharedEnd enter (${enter[0]},${enter[1]}) on sharedEnd boundary`)
  for (const c of g.connections) {
    if (!c.points || c.points.length < 2) continue
    const fromBox = boxOf(c.from)
    const toBox = boxOf(c.to)
    const fromDiamond = byId.get(c.from)?.data?.node?.kind === 'decision'
    const toDiamond = byId.get(c.to)?.data?.node?.kind === 'decision'
    if (!fromDiamond) {
      assert.equal(
        segRunsOnBoxEdge(c.points[0], c.points[1], fromBox),
        false,
        `${c.id || `${c.from}->${c.to}`} leave rides border`,
      )
    }
    if (!toDiamond) {
      assert.equal(
        segRunsOnBoxEdge(c.points[c.points.length - 2], c.points[c.points.length - 1], toBox),
        false,
        `${c.id || `${c.from}->${c.to}`} enter rides border`,
      )
    }
  }
})

test('labelBox: 8-char CJK stays 1 line; longer wraps to 2', () => {
  assert.equal(labelBox('第47条以外的争议').height, 18)
  assert.equal(labelBox('不予受理（第29条）').height, 34)
})

test('right-branch-only staged spine: cross-stage label avoids stage title box', () => {
  const spec = {
    type: 'procedure',
    specVersion: 1,
    title: 'cross-stage title clear',
    domain: 'litigation',
    stages: [
      { id: 'st-1', label: '一审判决' },
      { id: 'st-2', label: '二审审理与终审' },
    ],
    nodes: [
      { id: 'n-1', kind: 'start', label: '提起诉讼', stageId: 'st-1' },
      { id: 'n-2', kind: 'decision', label: '双方是否提起上诉', stageId: 'st-1' },
      { id: 'n-3', kind: 'end', label: '一审判决生效', stageId: 'st-1', outcome: 'positive' },
      { id: 'n-4', kind: 'step', label: '二审立案审理', stageId: 'st-2' },
      { id: 'n-5', kind: 'end', label: '二审终审生效', stageId: 'st-2', outcome: 'positive' },
    ],
    edges: [
      { from: 'n-1', to: 'n-2', main: true },
      { from: 'n-2', to: 'n-3', condition: '双方均未上诉' },
      { from: 'n-2', to: 'n-4', condition: '一方或双方提起上诉', main: true },
      { from: 'n-4', to: 'n-5', main: true },
    ],
  }
  const g = buildProcedureGraph(
    spec,
    { engine: 'mainline', grid: true, stages: true, conditions: true, detail: false },
    undefined,
    'vertical',
  )
  assert.deepEqual(g.errors, [])
  const titles = g.stageBoxes.map((b) => ({ label: b.label, ...bookmarkBoxOf(b, b.label) }))
  for (const c of g.connections) {
    if (!c.labelAt || !c.labelSize) continue
    const lr = { x: c.labelAt.x, y: c.labelAt.y, w: c.labelSize.width, h: c.labelSize.height }
    for (const tb of titles) {
      const overlaps =
        lr.x < tb.x + tb.w - 0.5 &&
        tb.x < lr.x + lr.w - 0.5 &&
        lr.y < tb.y + tb.h - 0.5 &&
        tb.y < lr.y + lr.h - 0.5
      assert.equal(overlaps, false, `label "${c.label}" overlaps stage title (${JSON.stringify(lr)} vs ${JSON.stringify(tb)})`)
    }
  }
})

test('left-hang forward-rejoin with sideEndHang: outward leaf, compact cellW, clean West gutter rejoin', () => {
  const spec = {
    type: 'procedure',
    specVersion: 1,
    title: 'left sideEndHang outward + gutter rejoin',
    domain: 'other',
    stages: [
      { id: 'st-1', label: '核查' },
      { id: 'st-2', label: '催缴' },
      { id: 'st-3', label: '救济' },
      { id: 'st-4', label: '处置' },
    ],
    nodes: [
      { id: 'n-1', kind: 'start', label: '开始核查', stageId: 'st-1' },
      { id: 'n-2', kind: 'decision', label: '是否按期足额缴纳？', stageId: 'st-1' },
      { id: 'n-3', kind: 'end', label: '履行完毕', stageId: 'st-1', outcome: 'positive' },
      { id: 'n-3s', kind: 'step', label: '发出书面催缴书', stageId: 'st-2' },
      { id: 'n-4', kind: 'decision', label: '宽限期届满是否缴纳？', stageId: 'st-2' },
      { id: 'n-5', kind: 'end', label: '补缴完成保留股权', stageId: 'st-2', outcome: 'positive' },
      { id: 'n-5s', kind: 'step', label: '作出失权决议', stageId: 'st-2' },
      { id: 'n-6', kind: 'decision', label: '股东30日内是否起诉？', stageId: 'st-3' },
      { id: 'n-7', kind: 'step', label: '股东提起异议之诉', stageId: 'st-3' },
      { id: 'n-8', kind: 'decision', label: '法院是否支持失权？', stageId: 'st-3' },
      { id: 'n-9', kind: 'end', label: '失权不成立恢复资格', stageId: 'st-3', outcome: 'positive' },
      { id: 'n-10', kind: 'step', label: '转让或减资注销股权', stageId: 'st-4' },
      { id: 'n-11', kind: 'end', label: '程序终结', stageId: 'st-4', outcome: 'positive' },
    ],
    edges: [
      { from: 'n-1', to: 'n-2', main: true },
      { from: 'n-2', to: 'n-3', condition: '已足额缴纳' },
      { from: 'n-2', to: 'n-3s', condition: '未按期缴纳', main: true },
      { from: 'n-3s', to: 'n-4', main: true },
      { from: 'n-4', to: 'n-5', condition: '宽限期内缴纳' },
      { from: 'n-4', to: 'n-5s', condition: '届满仍未缴纳', main: true },
      { from: 'n-5s', to: 'n-6', main: true },
      { from: 'n-6', to: 'n-10', condition: '30日内未起诉', main: true },
      { from: 'n-6', to: 'n-7', condition: '30日内起诉' },
      { from: 'n-7', to: 'n-8' },
      { from: 'n-8', to: 'n-9', condition: '判决不成立' },
      { from: 'n-8', to: 'n-10', condition: '判决失权有效' },
      { from: 'n-10', to: 'n-11', main: true },
    ],
  }
  const g = buildProcedureGraph(
    spec,
    { engine: 'mainline', grid: true, stages: true, conditions: true, detail: false },
    undefined,
    'vertical',
  )
  assert.deepEqual(g.errors, [])
  assert.ok(g.cellGrid.cellCross < 340, `expected compact cellW < 340, got ${g.cellGrid.cellCross}`)
  const byId = new Map(g.nodes.map((n) => [n.id, n]))
  const cx = (id) => byId.get(id).position.x + byId.get(id).data.w / 2
  assert.ok(cx('n-9') < cx('n-8'), 'sideEndHang n-9 placed outward left of n-8')
  assert.ok(cx('n-8') < cx('n-6'), 'parent hang n-8 adjacent left of spine n-6')

  const rejoin = g.connections.find((c) => c.id === 'c:n-8->n-10')
  assert.ok(rejoin)
  const target = byId.get('n-10')
  const endPt = rejoin.points[rejoin.points.length - 1]
  assert.ok(Math.abs(endPt[0] - target.position.x) < 1, `rejoin enters n-10 West face, got ${JSON.stringify(endPt)}`)

  for (let i = 0; i < g.connections.length; i += 1) {
    assert.equal(
      pathCrossCount(
        g.connections[i].points,
        g.connections.slice(i + 1).map((o) => o.points),
      ),
      0,
      `unexpected crossing on ${g.connections[i].id}`,
    )
  }
  const amb = findCollinearAmbiguities(g.connections)
  assert.deepEqual(amb.shortAttachments, [])
  assert.deepEqual(amb.unrelatedOverlaps, [])

  const titles = g.stageBoxes.map((b) => ({ label: b.label, ...bookmarkBoxOf(b, b.label) }))
  for (const c of g.connections) {
    for (let i = 0; i < c.points.length - 1; i += 1) {
      for (const tb of titles) {
        assert.equal(segHitsBox(c.points[i], c.points[i + 1], tb, -2), false, `${c.id} hits stage title ${tb.label}`)
      }
    }
  }
})

test('left-outer vertical corridor across stacked stages avoids stage title boxes and stays inside stageBoxes', () => {
  const spec = {
    type: 'procedure',
    specVersion: 1,
    title: 'left-outer corridor stage title clearance',
    domain: 'litigation',
    stages: [
      { id: 'st-1', label: '受理审查' },
      { id: 'st-2', label: '答辩与管辖异议' },
      { id: 'st-3', label: '庭前准备阶段' },
      { id: 'st-4', label: '判决与上诉救济' },
    ],
    nodes: [
      { id: 'n-1', kind: 'start', label: '起诉立案', stageId: 'st-1' },
      { id: 'n-2', kind: 'step', label: '送达应诉', stageId: 'st-1' },
      { id: 'n-3', kind: 'decision', label: '是否提出管辖异议', stageId: 'st-2' },
      { id: 'n-4', kind: 'end', label: '移送管辖', stageId: 'st-2', outcome: 'neutral' },
      { id: 'n-5', kind: 'step', label: '裁定驳回异议', stageId: 'st-2' },
      { id: 'n-6', kind: 'step', label: '庭前证据交换', stageId: 'st-3' },
      { id: 'n-7', kind: 'step', label: '排期开庭通知', stageId: 'st-3' },
      { id: 'n-8', kind: 'decision', label: '是否当庭提起上诉', stageId: 'st-4' },
      { id: 'n-9', kind: 'end', label: '进入二审程序', stageId: 'st-4', outcome: 'positive' },
      { id: 'n-10', kind: 'end', label: '一审判决生效', stageId: 'st-4', outcome: 'positive' },
    ],
    edges: [
      { from: 'n-1', to: 'n-2', main: true },
      { from: 'n-2', to: 'n-3', main: true },
      { from: 'n-3', to: 'n-4', condition: '异议成立' },
      { from: 'n-3', to: 'n-5', condition: '异议不成立' },
      { from: 'n-3', to: 'n-6', condition: '未提异议', main: true },
      { from: 'n-5', to: 'n-6', condition: '未上诉' },
      { from: 'n-5', to: 'n-9', condition: '提起上诉' },
      { from: 'n-6', to: 'n-7', main: true },
      { from: 'n-7', to: 'n-8', main: true },
      { from: 'n-8', to: 'n-9', condition: '上诉' },
      { from: 'n-8', to: 'n-10', condition: '不上诉', main: true },
    ],
  }
  const g = buildProcedureGraph(
    spec,
    { engine: 'mainline', grid: true, stages: true, conditions: true, detail: false },
    undefined,
    'vertical',
  )
  assert.deepEqual(g.errors, [])
  const maxStageX = Math.max(...g.stageBoxes.map((b) => b.x + b.w))
  const minStageY = Math.min(...g.stageBoxes.map((b) => b.y))
  const maxStageY = Math.max(...g.stageBoxes.map((b) => b.y + b.h))
  const titles = g.stageBoxes.map((b) => ({ label: b.label, ...bookmarkBoxOf(b, b.label) }))
  for (const c of g.connections) {
    for (const [x, y] of c.points) {
      assert.ok(x >= 8 && x <= maxStageX + 0.5, `${c.id} x=${x} outside positive stage corridor [8, ${maxStageX}]`)
      assert.ok(y >= minStageY - 0.5 && y <= maxStageY + 0.5, `${c.id} y=${y} outside stageBoxes [${minStageY}, ${maxStageY}]`)
    }
    for (let i = 0; i < c.points.length - 1; i += 1) {
      for (const tb of titles) {
        assert.equal(segHitsBox(c.points[i], c.points[i + 1], tb, -2), false, `${c.id} crosses stage title ${tb.label}`)
      }
    }
  }
})

test('cross-stage vertical spine labels: 7-char and 9-char pure-CJK stay single-line, clear border and arrowhead', () => {
  assert.equal(labelBox('未按期足额缴纳').height, 18)
  assert.equal(labelBox('宽限期届满仍未缴纳').height, 18)
  const spec = {
    type: 'procedure',
    specVersion: 1,
    title: 'cross-stage pure CJK label clearance',
    domain: 'other',
    stages: [
      { id: 'st-1', label: '核查' },
      { id: 'st-2', label: '催缴' },
      { id: 'st-3', label: '失权' },
    ],
    nodes: [
      { id: 'n-1', kind: 'decision', label: '是否按期足额缴纳？', stageId: 'st-1' },
      { id: 'n-1b', kind: 'end', label: '已履行完毕', stageId: 'st-1', outcome: 'positive' },
      { id: 'n-2', kind: 'step', label: '公司发出书面催缴书', stageId: 'st-2' },
      { id: 'n-3', kind: 'decision', label: '宽限期届满是否缴纳？', stageId: 'st-2' },
      { id: 'n-3b', kind: 'end', label: '补缴完成', stageId: 'st-2', outcome: 'positive' },
      { id: 'n-4', kind: 'end', label: '失权程序启动', stageId: 'st-3', outcome: 'positive' },
    ],
    edges: [
      { from: 'n-1', to: 'n-1b', condition: '已按期缴纳' },
      { from: 'n-1', to: 'n-2', condition: '未按期足额缴纳', main: true },
      { from: 'n-2', to: 'n-3', main: true },
      { from: 'n-3', to: 'n-3b', condition: '宽限期内缴纳' },
      { from: 'n-3', to: 'n-4', condition: '宽限期届满仍未缴纳', main: true },
    ],
  }
  const g = buildProcedureGraph(
    spec,
    { engine: 'mainline', grid: true, stages: true, conditions: true, detail: false },
    undefined,
    'vertical',
  )
  assert.deepEqual(g.errors, [])
  const byId = new Map(g.nodes.map((n) => [n.id, n]))
  for (const edgeId of ['c:n-1->n-2', 'c:n-3->n-4']) {
    const c = g.connections.find((e) => e.id === edgeId)
    assert.ok(c?.labelAt && c?.labelSize)
    assert.equal(c.labelSize.height, 18, `${edgeId} should stay 18px single-line`)
    const r = { x: c.labelAt.x, y: c.labelAt.y, w: c.labelSize.width, h: c.labelSize.height }
    for (const s of g.stageBoxes) {
      assert.equal(r.y < s.y && r.y + r.h > s.y, false, `${edgeId} crosses top border of ${s.stageId}`)
      assert.equal(r.y < s.y + s.h && r.y + r.h > s.y + s.h, false, `${edgeId} crosses bottom border of ${s.stageId}`)
    }
    const target = byId.get(c.to)
    assert.ok(target.position.y - (r.y + r.h) >= 6, `${edgeId} arrowhead gap=${target.position.y - (r.y + r.h)} < 6`)
  }
})

test('staged bands: skip-stage node in later run does not insert blank gap before next stage', () => {
  const spec = {
    type: 'procedure',
    specVersion: 1,
    title: 'skip-stage no white gulf',
    domain: 'litigation',
    stages: [
      { id: 'st-1', label: '启动' },
      { id: 'st-2', label: '审查' },
      { id: 'st-3', label: '审理' },
      { id: 'st-4', label: '终结' },
    ],
    nodes: [
      { id: 'n-1', kind: 'start', label: '生效裁判', stageId: 'st-1' },
      { id: 'n-2', kind: 'decision', label: '申请再审', stageId: 'st-2' },
      { id: 'n-3', kind: 'step', label: '驳回申请', stageId: 'st-2' },
      { id: 'n-4', kind: 'end', label: '未申请终结', stageId: 'st-4', outcome: 'negative' },
      { id: 'n-5', kind: 'step', label: '裁定再审', stageId: 'st-2' },
      { id: 'n-6', kind: 'step', label: '合议庭审理', stageId: 'st-3' },
      { id: 'n-7', kind: 'end', label: '再审裁判生效', stageId: 'st-4', outcome: 'positive' },
    ],
    edges: [
      { from: 'n-1', to: 'n-2', main: true },
      { from: 'n-2', to: 'n-3', condition: '驳回' },
      { from: 'n-3', to: 'n-4', condition: '终止' },
      { from: 'n-2', to: 'n-5', condition: '受理', main: true },
      { from: 'n-5', to: 'n-6', main: true },
      { from: 'n-6', to: 'n-7', main: true },
    ],
  }
  const g = buildProcedureGraph(
    spec,
    { engine: 'mainline', grid: true, stages: true, conditions: true, detail: false },
    undefined,
    'vertical',
  )
  assert.deepEqual(g.errors, [])
  assert.equal(g.stageBoxes.length, 4)
  for (let i = 0; i < g.stageBoxes.length - 1; i += 1) {
    const gap = g.stageBoxes[i + 1].y - (g.stageBoxes[i].y + g.stageBoxes[i].h)
    assert.ok(gap <= 12, `unexpected gap ${gap}px between ${g.stageBoxes[i].label} and ${g.stageBoxes[i + 1].label}`)
  }
})

test('clearWrapAround: exits without border-ride and offsets target entry from occupied rail', () => {
  const a = { x: 200, y: 200, w: 144, h: 60 }
  const b = { x: 520, y: 520, w: 144, h: 60 }
  const other = { x: 840, y: 200, w: 144, h: 60 }
  const placed = new Map([
    ['a', a],
    ['b', b],
    ['other', other],
  ])
  const existing = [[
    [912, 260],
    [912, 550],
    [664, 550],
  ]]
  const pts = clearWrapAround(a, b, false, placed, 'a', 'b', 24, existing)
  assert.ok(pts && pts.length >= 4, 'expected valid wrap route')
  assert.equal(segRunsOnBoxEdge(pts[0], pts[1], a), false, 'leave must not ride source border')
  assert.equal(pathCrossCount(pts, existing), 0, 'wrap route avoids crossings')
  const enterY = pts[pts.length - 1][1]
  assert.notEqual(Math.round(enterY), 550, 'entry shifts off occupied bcy rail to avoid collinear overlap')
})

test('problem 1: disconnected early-exit end nodes in final stage compact onto one row', () => {
  const spec = {
    type: 'procedure',
    specVersion: 1,
    title: 'compact disconnected terminal stage',
    domain: 'litigation',
    stages: [
      { id: 'st-1', label: '受理' },
      { id: 'st-2', label: '审查' },
      { id: 'st-3', label: '审理' },
      { id: 'st-4', label: '终结' },
    ],
    nodes: [
      { id: 'n-1', kind: 'start', label: '提起申请', stageId: 'st-1' },
      { id: 'n-2', kind: 'decision', label: '是否符合受理', stageId: 'st-2' },
      { id: 'n-3', kind: 'step', label: '不予受理告知', stageId: 'st-2' },
      { id: 'n-4', kind: 'step', label: '补正材料通知', stageId: 'st-2' },
      { id: 'n-5', kind: 'step', label: '移送审判庭', stageId: 'st-2' },
      { id: 'n-6', kind: 'step', label: '开庭审理', stageId: 'st-3' },
      { id: 'n-7', kind: 'end', label: '不予受理终结', stageId: 'st-4', outcome: 'negative' },
      { id: 'n-8', kind: 'end', label: '撤回申请终结', stageId: 'st-4', outcome: 'negative' },
      { id: 'n-9', kind: 'end', label: '审理裁判生效', stageId: 'st-4', outcome: 'positive' },
    ],
    edges: [
      { from: 'n-1', to: 'n-2', main: true },
      { from: 'n-2', to: 'n-3', condition: '不符合' },
      { from: 'n-2', to: 'n-4', condition: '需补正' },
      { from: 'n-2', to: 'n-5', condition: '符合', main: true },
      { from: 'n-3', to: 'n-7', condition: '未救济' },
      { from: 'n-4', to: 'n-8', condition: '逾期未补' },
      { from: 'n-5', to: 'n-6', main: true },
      { from: 'n-6', to: 'n-9', main: true },
    ],
  }
  const g = buildProcedureGraph(
    spec,
    { engine: 'mainline', grid: true, stages: true, conditions: true, detail: false },
    undefined,
    'vertical',
  )
  assert.deepEqual(g.errors, [])
  assertOnLattice(g, 'compact terminal stage', 'vertical')
  const st4Nodes = g.nodes.filter((n) => n.data?.node?.stageId === 'st-4')
  const ys = st4Nodes.map((n) => n.position.y + n.data.h / 2)
  assert.ok(Math.max(...ys) - Math.min(...ys) <= 8, `st-4 nodes span multiple rows: ${JSON.stringify(ys)}`)
  const st4Box = g.stageBoxes.at(-1)
  assert.ok(st4Box.h <= g.cellGrid.cellAlong + 40, `st-4 height ${st4Box.h} stretched unnecessarily`)
})

test('problem 2: forward downward non-diamond hang-to-spine never wraps above top start node', () => {
  const spec = {
    type: 'procedure',
    specVersion: 1,
    title: 'forward downward hang no top wrap',
    domain: 'litigation',
    stages: [
      { id: 'st-1', label: '启动' },
      { id: 'st-2', label: '审查' },
    ],
    nodes: [
      { id: 'n-1', kind: 'start', label: '生效裁判', stageId: 'st-1' },
      { id: 'n-2', kind: 'decision', label: '启动监督途径', stageId: 'st-1' },
      { id: 'n-3', kind: 'step', label: '依职权启动再审', stageId: 'st-1' },
      { id: 'n-4', kind: 'step', label: '检察机关建议', stageId: 'st-1' },
      { id: 'n-5', kind: 'step', label: '受理审查', stageId: 'st-2' },
      { id: 'n-6', kind: 'decision', label: '是否符合事由', stageId: 'st-2' },
      { id: 'n-7', kind: 'step', label: '提请监督审查', stageId: 'st-2' },
      { id: 'n-8', kind: 'step', label: '裁定进入再审', stageId: 'st-2' },
      { id: 'n-9', kind: 'end', label: '终结程序', stageId: 'st-2', outcome: 'positive' },
    ],
    edges: [
      { from: 'n-1', to: 'n-2', main: true },
      { from: 'n-2', to: 'n-3', condition: '途径一' },
      { from: 'n-2', to: 'n-4', condition: '途径二' },
      { from: 'n-2', to: 'n-5', condition: '申请', main: true },
      { from: 'n-3', to: 'n-8', condition: '决定' },
      { from: 'n-4', to: 'n-8', condition: '建议成立' },
      { from: 'n-5', to: 'n-6', main: true },
      { from: 'n-6', to: 'n-7', condition: '逾期' },
      { from: 'n-7', to: 'n-8', condition: '抗诉' },
      { from: 'n-6', to: 'n-8', condition: '符合', main: true },
      { from: 'n-8', to: 'n-9', main: true },
    ],
  }
  const g = buildProcedureGraph(
    spec,
    { engine: 'mainline', grid: true, stages: true, conditions: true, detail: false },
    undefined,
    'vertical',
  )
  assert.deepEqual(g.errors, [])
  const minNodeY = Math.min(...g.nodes.map((n) => n.position.y))
  let minEdgeY = Infinity
  for (const c of g.connections) {
    for (const [, y] of c.points ?? []) minEdgeY = Math.min(minEdgeY, y)
  }
  assert.ok(minEdgeY >= minNodeY - 12, `edge wrapped above top node: minEdgeY=${minEdgeY} < minNodeY-12=${minNodeY - 12}`)
})

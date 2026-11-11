// Four-point cardinal port priority (issue 190 / PR #359 follow-up).
// Free N/E/S/W tips (diamond vertices) / rect-capsule face mids must beat slant/arc attaches
// when a clear feasible route exists. Tips-full fifth edges may keep a slant with evidence.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildProcedureGraph } from '../src/renderers/procedure/flow/layout.js'
import {
  diamondVertices,
  isCardinalDiamondTip,
  betterDiamondEnterCandidate,
  diamondSidePortCandidates,
  staggerOnDiamondSide,
  onDiamondOutline,
} from '../src/renderers/procedure/flow/diamondPorts.js'
import { pathCrossCount } from '../src/renderers/procedure/flow/hangSpineRoute.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const fields = { engine: 'mainline', stages: false }

function boxOf(g, id) {
  const n = g.nodes.find((x) => x.id === id)
  assert.ok(n, id)
  return { x: n.position.x, y: n.position.y, w: n.data.w, h: n.data.h }
}

function midOf(box, face) {
  if (face === 'E') return [box.x + box.w, box.y + box.h / 2]
  if (face === 'W') return [box.x, box.y + box.h / 2]
  if (face === 'N') return [box.x + box.w / 2, box.y]
  return [box.x + box.w / 2, box.y + box.h]
}

function faceOfMid(box, p, tol = 2.5) {
  for (const f of /** @type {const} */ (['N', 'E', 'S', 'W'])) {
    const m = midOf(box, f)
    if (Math.hypot(p[0] - m[0], p[1] - m[1]) <= tol) return f
  }
  return null
}

function outwardOk(face, a, b) {
  return (
    (face === 'E' && Math.abs(a[1] - b[1]) < 0.5 && a[0] > b[0] + 0.5) ||
    (face === 'W' && Math.abs(a[1] - b[1]) < 0.5 && a[0] < b[0] - 0.5) ||
    (face === 'N' && Math.abs(a[0] - b[0]) < 0.5 && a[1] < b[1] - 0.5) ||
    (face === 'S' && Math.abs(a[0] - b[0]) < 0.5 && a[1] > b[1] + 0.5)
  )
}

test('diamondPorts: isCardinalDiamondTip vs face/slant; candidates tip-first', () => {
  const n = { position: { x: 100, y: 200 }, data: { w: 120, h: 80 } }
  const v = diamondVertices(n)
  assert.equal(isCardinalDiamondTip(n, v.N), true)
  assert.equal(isCardinalDiamondTip(n, v.W), true)
  const slant = staggerOnDiamondSide(n, 'N', 0, 2)
  assert.equal(onDiamondOutline(n, slant), true)
  assert.equal(isCardinalDiamondTip(n, slant), false, 'slant on N side is not the N tip')
  const cands = diamondSidePortCandidates(n, 'N', { includeTip: true, staggerSlots: 2 })
  assert.equal(isCardinalDiamondTip(n, cands[0]), true)
  assert.deepEqual(cands[0], v.N)
  assert.ok(cands.slice(1).every((p) => !isCardinalDiamondTip(n, p)))
})

test('enter rank: free tip class beats fewer-bend slant at same cross (non-flat)', () => {
  // Policy unit: not S1/L4-specific. A 3-bend tip must win over a 1-bend slant when cross ties.
  const tip = { cross: 0, tipRank: 0, bends: 3, len: 900 }
  const slant = { cross: 0, tipRank: 1, bends: 1, len: 200 }
  assert.equal(betterDiamondEnterCandidate(tip, slant), true, 'tip class before bends')
  assert.equal(betterDiamondEnterCandidate(slant, tip), false)
  // Among tips, fewer bends still wins.
  assert.equal(
    betterDiamondEnterCandidate(
      { cross: 0, tipRank: 0, bends: 1, len: 400 },
      { cross: 0, tipRank: 0, bends: 3, len: 200 },
    ),
    true,
  )
  // Cross remains hard: tip with +1 cross loses to 0-cross slant.
  assert.equal(
    betterDiamondEnterCandidate(
      { cross: 1, tipRank: 0, bends: 1, len: 100 },
      { cross: 0, tipRank: 1, bends: 4, len: 800 },
    ),
    false,
  )
  // No tip available: among slants, bends then length.
  assert.equal(
    betterDiamondEnterCandidate(
      { cross: 0, tipRank: 1, bends: 2, len: 500 },
      { cross: 0, tipRank: 1, bends: 3, len: 100 },
    ),
    true,
  )
})

test('S1 V: free N tip preferred over NW slant for branch-merge enter', () => {
  const spec = JSON.parse(
    readFileSync(join(ROOT, 'preview/synthetic-rejoin/fixtures/S1-hang-lane-clear.zh-CN.json'), 'utf8'),
  )
  const g = buildProcedureGraph(spec, fields, undefined, 'vertical')
  const c = g.connections.find((x) => x.id === 'c:n-2->n-5')
  assert.ok(c, 'c:n-2->n-5')
  const box = boxOf(g, 'n-5')
  const end = c.points.at(-1)
  const prev = c.points.at(-2)
  assert.equal(isCardinalDiamondTip(box, end), true, `enter ${end} must be cardinal tip`)
  assert.deepEqual(
    [end[0], end[1]],
    diamondVertices(box).N,
    'S1 enter must use free N tip (not NW slant)',
  )
  assert.ok(prev[1] < end[1] - 0.5, 'approach from north of N tip')
})

test('L4 V: 回并 enter uses free W tip with west approach (not SW slant / not tipFace≠hit)', () => {
  const spec = JSON.parse(
    readFileSync(join(ROOT, 'preview/synthetic-rejoin/fixtures/L4-enforcement-objection-nested.zh-CN.json'), 'utf8'),
  )
  const g = buildProcedureGraph(spec, fields, undefined, 'vertical')
  const c = g.connections.find((x) => x.from === 'n-15' && x.to === 'n-13')
  assert.ok(c, 'c:n-15->n-13')
  const box = boxOf(g, 'n-13')
  const end = c.points.at(-1)
  const prev = c.points.at(-2)
  assert.equal(isCardinalDiamondTip(box, end), true, `enter ${end} must be W tip not SW slant`)
  assert.deepEqual([end[0], end[1]], diamondVertices(box).W)
  assert.ok(prev[0] < end[0] - 0.5, 'last run from west (outward normal into W tip)')
})

test('07 H: tips-full fifth leave may stay on slant (no forced tip overlap)', () => {
  const spec = JSON.parse(
    readFileSync(join(ROOT, 'examples/procedure/07-share-acquisition-agreement.zh-CN.json'), 'utf8'),
  )
  const g = buildProcedureGraph(spec, fields, undefined, 'horizontal')
  const box = boxOf(g, 'n-3')
  const tips = diamondVertices(box)
  for (const f of /** @type {const} */ (['N', 'E', 'S', 'W'])) {
    const tip = tips[f]
    const hit = g.connections.some((c) => {
      const pts = []
      if (c.from === 'n-3') pts.push(c.points[0])
      if (c.to === 'n-3') pts.push(c.points.at(-1))
      return pts.some((p) => Math.hypot(p[0] - tip[0], p[1] - tip[1]) <= 2.5)
    })
    assert.equal(hit, true, `tip ${f} occupied`)
  }
  const slant = g.connections.find(
    (c) => c.from === 'n-3' && c.points?.length && !isCardinalDiamondTip(box, c.points[0]),
  )
  assert.ok(slant, 'expected a non-tip fifth leave when all tips are taken')
  assert.equal(onDiamondOutline(box, slant.points[0]), true)
})

test('V08b V: capsule enter on cardinal mid with outward approach; n-b2 W tip leave kept', () => {
  const spec = JSON.parse(
    readFileSync(join(ROOT, 'test/fixtures/mainline-strict/V08-multi-componentsb-extra.zh-CN.json'), 'utf8'),
  )
  const g = buildProcedureGraph(spec, fields, undefined, 'vertical')
  const c = g.connections.find((x) => x.id === 'c:n-b2->n-x-end')
  assert.ok(c)
  const endBox = boxOf(g, 'n-x-end')
  const srcBox = boxOf(g, 'n-b2')
  const leave = c.points[0]
  const end = c.points.at(-1)
  const prev = c.points.at(-2)
  assert.ok(
    Math.hypot(leave[0] - srcBox.x, leave[1] - (srcBox.y + srcBox.h / 2)) <= 2.5,
    `leave must stay on n-b2 W tip, got ${leave}`,
  )
  const face = faceOfMid(endBox, end)
  assert.ok(face, `enter ${end} must sit on a face mid, not capsule arc`)
  assert.ok(outwardOk(face, prev, end), `last run must be outward into ${face} mid`)
  const others = g.connections.filter((o) => o !== c).map((o) => o.points)
  assert.equal(pathCrossCount(c.points, others), 0)
})

test('B02 H: capsule end enter uses outward stub (not face-parallel into painted E arc)', () => {
  // Horizontal frame maps painted E/W arcs to N/S before polish; rewrite must cover those faces.
  const spec = JSON.parse(
    readFileSync(join(ROOT, 'test/fixtures/mainline-strict/B02-multioutlet-shared.zh-CN.json'), 'utf8'),
  )
  const g = buildProcedureGraph(spec, fields, undefined, 'horizontal')
  const c = g.connections.find((x) => x.id === 'c:n-2->n-7')
  assert.ok(c, 'c:n-2->n-7')
  const endBox = boxOf(g, 'n-7')
  const end = c.points.at(-1)
  const prev = c.points.at(-2)
  const face = faceOfMid(endBox, end)
  assert.ok(face === 'E' || face === 'W', `enter must sit on painted E/W mid, got ${face} @ ${end}`)
  assert.ok(outwardOk(face, prev, end), `last run must be outward into ${face}, prev=${prev} end=${end}`)
  assert.equal(pathCrossCount(c.points, g.connections.filter((o) => o !== c).map((o) => o.points)), 0)
})

test('B09 V: S mid occupied by sibling → second leave may stagger on S (not free-mid skip)', () => {
  // Documented same-face multi-leave: S mid held by n-11→n-12; n-11→n-5 at non-mid S is intentional.
  const spec = JSON.parse(
    readFileSync(join(ROOT, 'test/fixtures/mainline-strict/B09-nested-hang-rejoin.zh-CN.json'), 'utf8'),
  )
  const g = buildProcedureGraph(spec, fields, undefined, 'vertical')
  const box = boxOf(g, 'n-11')
  const sMid = midOf(box, 'S')
  const to12 = g.connections.find((c) => c.from === 'n-11' && c.to === 'n-12')
  const to5 = g.connections.find((c) => c.from === 'n-11' && c.to === 'n-5')
  assert.ok(to12 && to5)
  assert.ok(Math.hypot(to12.points[0][0] - sMid[0], to12.points[0][1] - sMid[1]) <= 2.5, 'sibling owns S mid')
  assert.equal(faceOfMid(box, to5.points[0]), null, 'second leave is non-mid on S')
  assert.ok(Math.abs(to5.points[0][1] - (box.y + box.h)) <= 2.5, 'still on S face')
})

test('08 V: inputMain routes stay straight (no port4 regression)', () => {
  const spec = JSON.parse(
    readFileSync(join(ROOT, 'examples/procedure/08-work-injury-recognition.zh-CN.json'), 'utf8'),
  )
  const g = buildProcedureGraph(spec, fields, undefined, 'vertical')
  for (const c of g.connections) {
    if (!c.inputMain) continue
    assert.ok(
      c.points.length === 2 ||
        (c.points.length === 3 &&
          ((Math.abs(c.points[0][0] - c.points[1][0]) < 0.5 &&
            Math.abs(c.points[1][0] - c.points[2][0]) < 0.5) ||
            (Math.abs(c.points[0][1] - c.points[1][1]) < 0.5 &&
              Math.abs(c.points[1][1] - c.points[2][1]) < 0.5))),
      `inputMain ${c.id} must stay straight, pts=${JSON.stringify(c.points)}`,
    )
  }
})

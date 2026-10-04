// ============================================================
//  src/renderers/relationship/chain/layout.js — the guarantee chain (issue #89): one claim, its guarantors,
//  what stands behind them
//
//  The third way of drawing a relationship diagram, from the same JSON as the graph. In a loan or guarantee
//  dispute the question is "this claim: how many layers of security, who stands last". The graph draws every
//  relation alike; here the link from a guarantee to the claim it secures is the main structure:
//
//    left     one block per claim (a `debt`, or a `contract` a guarantee names): its label, amount, parties
//    middle   the guarantors of that claim, one card each, with the guarantee's own label under it
//    right    what stands behind each guarantor: a contract between the guarantor and the debtor, or a
//             guarantee from the debtor to the guarantor (a counter-guarantee); nothing is drawn where there
//             is none (the claim's card says how many there are)
//    below    guarantees tied to no claim (with the reason), then every other relation as a list
//
//  `secures` is optional in the data, so a guarantee without it is tied when that is plain: its creditor
//  (the guarantee's `to`) is the creditor of exactly one claim, and the guarantor is not that claim's own
//  debtor. It is then drawn with a dotted link and "inferred" on its label. Otherwise it goes in the bucket
//  with the reason; nothing is dropped. No JSON field is added: the inference is made here, when drawing.
//
//  Every relation lands in exactly one place: a claim block, a guarantee card, a counter-guarantee card, the
//  bucket, or the list of the rest. Any valid JSON draws (no claims, no guarantees, a claim nobody
//  guarantees: each has an explicit empty state). Pure JS, so Node computes the same geometry for
//  antu_layout and the tests check every example.
//
//  Plain on purpose (one ink, one weight for the claim, one for the rest): every box of a column is as wide
//  as the column, a guarantor stands across from the first thing behind it, the claim card is centred on its
//  guarantors, so every line is horizontal except the trunk from the claim.
// ============================================================

import { validateRelationship, hintsOfRelationship, isDirected } from '../graph/rules.js'
import { PAD, SCALE_HINT_ENTITIES } from '../graph/metrics.js'
import { wrapLineCount } from '../../fact/cardGeometry.js'
import { makePartyData } from '../partyData.js'
import { tEn } from '../../../core/i18n.js'

// ---------- geometry ----------
export const CLAIM_W = 400
const COL_GAP = 90
/** Between a guarantor column and its counter-guarantee column: room for the link and its label */
const COUNTER_GAP = 110
export const MIN_COL_W = 200
/** A label under a card wraps inside the column and takes the lines it needs */
const CHIP_LH = 16
const CHIP_FONT = 11.5
const CHIP_GAP = 6
const ROW_GAP = 18
const BLOCK_GAP = 36
const STACK_GAP = 12
const HEAD_H = 36
/** Sections under the blocks */
const SECTION_GAP = 28
const SECTION_HEAD_H = 34
const MIN_CONTENT_W = 900
/** Text metrics: the claim card's title and lines, the sections' text */
export const TITLE_FONT = 16
const TITLE_LH = 22
const LINE_FONT = 12.5
const LINE_LH = 19
/** The small note under an inferred guarantee */
const NOTE_FONT = 11.5
const NOTE_LH = 16
/** Node estimates widen Latin text a little (the page's real font is wider than the em table) */
const SCALE = { latin: 1.2, cjk: 1.06 }

const lines = (text, width, font) => Math.max(1, wrapLineCount(text, width / font, SCALE))
/** How tall a label under a card is: its lines, plus the chip's padding (it is as wide as the column at most) */
const chipH = (text, maxW) => lines(text, maxW - 18, CHIP_FONT) * CHIP_LH + 4

/**
 * Sort every relation into its place. Pure data, no geometry.
 * @returns {
 *   claims:  relations that are claims, in written order,
 *   slots:   Map claim id -> [{ guarantee, inferred, counters: relation[] }],
 *   bucket:  [{ guarantee, reason: 'none' | 'many' | 'self', candidates: claim[] }],
 *   other:   every relation that is none of these,
 * }
 */
export function classify(spec) {
  const rels = spec.relations
  const byId = new Map(rels.map((r) => [r.id, r]))
  // A claim is a debt, or a contract that a guarantee names (a contract alone is not a claim)
  const claimIds = new Set(rels.filter((r) => r.kind === 'debt').map((r) => r.id))
  for (const g of rels) if (g.kind === 'guarantee' && g.secures && byId.has(g.secures)) claimIds.add(g.secures)
  const claims = rels.filter((r) => claimIds.has(r.id))
  const slots = new Map(claims.map((c) => [c.id, []]))
  const bucket = []
  const used = new Set(claimIds)

  // 1. Each guarantee: tied by `secures`, tied by inference, or in the bucket with the reason
  for (const g of rels.filter((r) => r.kind === 'guarantee')) {
    used.add(g.id)
    if (g.secures && slots.has(g.secures)) {
      slots.get(g.secures).push({ guarantee: g, inferred: false, counters: [] })
      continue
    }
    const candidates = claims.filter((c) => c.kind === 'debt' && c.from === g.to)
    if (candidates.length === 1 && candidates[0].to !== g.from) slots.get(candidates[0].id).push({ guarantee: g, inferred: true, counters: [] })
    else bucket.push({ guarantee: g, reason: candidates.length === 0 ? 'none' : candidates.length > 1 ? 'many' : 'self', candidates })
  }

  // 2. What stands behind a guarantor: a contract between the guarantor and the claim's debtor, or a guarantee
  //    from the debtor to the guarantor (which, naming no claim, was put in the bucket just above)
  for (const c of claims) {
    for (const slot of slots.get(c.id)) {
      const G = slot.guarantee.from
      const D = c.to
      for (const r of rels) {
        if (used.has(r.id) || r.kind !== 'contract') continue
        if ((r.from === G && r.to === D) || (r.from === D && r.to === G)) {
          slot.counters.push(r)
          used.add(r.id)
        }
      }
      for (let i = 0; i < bucket.length; i += 1) {
        const g = bucket[i].guarantee
        if (bucket[i].reason === 'none' && g.from === D && g.to === G) {
          slot.counters.push(g)
          bucket.splice(i, 1)
          i -= 1
        }
      }
    }
  }
  for (const b of bucket) used.add(b.guarantee.id)
  const other = rels.filter((r) => !used.has(r.id) && !claimIds.has(r.id))
  return { claims, slots, bucket, other }
}

/** The text on a claim's card: its label with the amount as written (a default label already has it) */
export function claimTitle(relation, labelText) {
  const label = typeof relation.label === 'string' ? relation.label.trim() : ''
  if (!label) return labelText
  return relation.amount ? `${label}  ${relation.amount}` : label
}

/**
 * Turn a relationship spec into React Flow nodes for the guarantee chain.
 * Called as (spec, fields, view, orientation) like every kind; only `fields.t` (the interface language's
 * translate function) is used.
 */
export function buildChainGraph(spec, fields = {}) {
  const errors = validateRelationship(spec)
  const hints = hintsOfRelationship(spec)
  const empty = { errors, hints, nodes: [], edges: [], connections: [], size: { width: 0, height: 0 }, stats: { entities: 0, relations: 0, groups: 0, kinds: {} } }
  if (errors.length) return empty
  const t = typeof fields?.t === 'function' ? fields.t : tEn
  const entities = spec.entities
  const relations = spec.relations
  if (entities.length > SCALE_HINT_ENTITIES) hints.push(tEn('rhint.tooLarge', { n: entities.length, limit: SCALE_HINT_ENTITIES }))
  const entityById = new Map(entities.map((e) => [e.id, e]))
  const party = makePartyData(spec, t)
  const index = new Map(relations.map((r, i) => [r.id, i]))
  const textOf = (r) => party.labelTexts[index.get(r.id)]
  const sizeOf = (id) => party.sizes.get(id)
  const parts = classify(spec)

  // Column widths: as wide as the widest party box in them; every box of a column is that wide, so the
  // edges line up
  const widest = (ids) => Math.max(MIN_COL_W, ...ids.map((id) => sizeOf(id).w))
  const guarantorIds = [...parts.slots.values()].flat().map((s) => s.guarantee.from)
  const counterEnds = []
  for (const c of parts.claims) for (const slot of parts.slots.get(c.id)) for (const r of slot.counters) counterEnds.push(r.from === slot.guarantee.from ? r.to : r.from)
  const guarantorW = widest(guarantorIds)
  const counterW = counterEnds.length ? widest(counterEnds) : 0
  const gX = PAD + CLAIM_W + COL_GAP
  const cX = gX + guarantorW + COUNTER_GAP
  const contentW = Math.max(counterEnds.length ? cX + counterW - PAD : gX + guarantorW - PAD, MIN_CONTENT_W)
  const width = contentW + PAD * 2
  /** A party box as wide as its column: same data, the text column follows */
  const boxData = (entity, w, extra = {}) => ({ ...party.dataOf(entity, { layer: 1, hintKey: 'rel.previewHint', plain: true, ...extra }), w, textW: w - 28 })

  const nodes = []
  const layer = { width, height: 0, headings: [], links: [], chips: [], empties: [], frames: [], texts: [] }
  let y = PAD

  // ── the blocks ──
  if (parts.claims.length) {
    layer.headings.push({ x: PAD, y, text: t('rel.chain.colClaims') })
    if (guarantorIds.length) layer.headings.push({ x: gX, y, text: t('rel.chain.colGuarantors') })
    if (counterEnds.length) layer.headings.push({ x: cX, y, text: t('rel.chain.colCounter') })
    y += HEAD_H
  }
  parts.claims.forEach((claim, ci) => {
    const slots = parts.slots.get(claim.id)
    // The claim's card: its title, who stands on which side, and the count
    const contract = claim.kind !== 'debt'
    const sides = [
      [t(contract ? 'rel.chain.partyA' : 'rel.chain.creditor'), entityById.get(claim.from).label],
      [t(contract ? 'rel.chain.partyB' : 'rel.chain.debtor'), entityById.get(claim.to).label],
    ]
    const title = claimTitle(claim, textOf(claim))
    const innerW = CLAIM_W - 36
    const counterTotal = slots.reduce((n, s) => n + s.counters.length, 0)
    const tail = slots.length ? t('rel.chain.count', { g: slots.length, c: counterTotal }) : t('rel.chain.none')
    const titleLines = lines(title, innerW, TITLE_FONT)
    const sideLines = sides.map(([k, name]) => lines(`${k}  ${name}`, innerW, LINE_FONT))
    const cardH = 18 + titleLines * TITLE_LH + 8 + sideLines.reduce((n, l) => n + l * LINE_LH, 0) + 10 + LINE_LH + 18

    // The rows are laid out from 0 and moved down together once the claim card's place is known: the card
    // is centred on its guarantors, so a lone guarantor stands straight across from it
    const rowNodes = []
    const rowLinks = []
    const rowChips = []
    const rowTexts = []
    const centres = []
    let ry = 0
    slots.forEach((slot, si) => {
      const g = slot.guarantee
      const gEntity = entityById.get(g.from)
      const gSize = sizeOf(g.from)
      const key = `c${ci}g${si}`
      // Counters stacked beside it, each with its label under it; the guarantor stands across from the first
      const stack = slot.counters.map((r) => {
        const endId = r.from === g.from ? r.to : r.from
        const sz = sizeOf(endId)
        return { r, endId, sz, chipH: chipH(textOf(r), counterW) }
      })
      let cy = ry
      const counterCentres = []
      stack.forEach((c, k) => {
        rowNodes.push({ id: `${c.endId}@${key}k${k}`, type: 'rnode', position: { x: cX, y: cy }, data: boxData(entityById.get(c.endId), counterW) })
        counterCentres.push(cy + c.sz.h / 2)
        rowChips.push({ x: cX, y: cy + c.sz.h + CHIP_GAP, text: textOf(c.r), kind: c.r.kind, maxW: counterW })
        cy += c.sz.h + CHIP_GAP + c.chipH + STACK_GAP
      })
      const counterH = stack.length ? cy - STACK_GAP - ry : 0
      const gy = stack.length ? counterCentres[0] - gSize.h / 2 : ry
      rowNodes.push({ id: `${g.from}@${key}`, type: 'rnode', position: { x: gX, y: gy }, data: boxData(gEntity, guarantorW) })
      const gCentre = gy + gSize.h / 2
      centres.push(gCentre)
      const gText = textOf(g) + (slot.inferred ? ` · ${t('rel.chain.inferred')}` : '')
      const gChipH = chipH(gText, guarantorW)
      rowChips.push({ x: gX, y: gy + gSize.h + CHIP_GAP, text: gText, kind: 'guarantee', maxW: guarantorW })
      // Why an inferred guarantee stands here, under its label
      let noteH = 0
      if (slot.inferred) {
        const note = t('rel.chain.inferredNote', { creditor: entityById.get(g.to).label })
        noteH = 4 + lines(note, guarantorW, NOTE_FONT) * NOTE_LH
        rowTexts.push({ x: gX, y: gy + gSize.h + CHIP_GAP + gChipH + 4, w: guarantorW, main: note, tone: 'note' })
      }
      // The link from the claim to this guarantor (dotted when inferred); its start is set once the card is placed
      rowLinks.push({ claim: true, to: [gX, gCentre], kind: 'guarantee', dotted: slot.inferred, arrow: 'end' })
      // From the guarantor to each counter: the relation runs left to right here, its own direction kept by the arrowhead
      stack.forEach((c, k) => {
        rowLinks.push({ from: [gX + guarantorW, gCentre], to: [cX, counterCentres[k]], kind: c.r.kind, arrow: isDirected(c.r) ? (c.r.to === g.from ? 'start' : 'end') : null })
      })
      const guarantorH = gy - ry + gSize.h + CHIP_GAP + gChipH + noteH
      ry += Math.max(guarantorH, counterH) + ROW_GAP
    })
    const rowsH = slots.length ? ry - ROW_GAP : 0

    const meanCentre = centres.length ? centres.reduce((n, c) => n + c, 0) / centres.length : cardH / 2
    const cardTop = meanCentre - cardH / 2
    const shift = Math.max(0, -cardTop)
    const top = y + shift
    for (const n of rowNodes) nodes.push({ ...n, position: { x: n.position.x, y: n.position.y + top } })
    for (const l of rowLinks) {
      const to = [l.to[0], l.to[1] + top]
      const from = l.claim ? [PAD + CLAIM_W, y + shift + cardTop + cardH / 2] : [l.from[0], l.from[1] + top]
      layer.links.push({ from, to, kind: l.kind, dotted: l.dotted, arrow: l.arrow, trunk: l.claim ? gX - COL_GAP / 2 : undefined })
    }
    for (const c of rowChips) layer.chips.push({ ...c, y: c.y + top })
    for (const x of rowTexts) layer.texts.push({ ...x, y: x.y + top })
    nodes.push({
      id: `claim:${claim.id}`,
      type: 'chainClaim',
      position: { x: PAD, y: y + shift + cardTop },
      width: CLAIM_W,
      height: cardH,
      draggable: false,
      connectable: false,
      data: { title, sides: sides.map(([label, name]) => ({ label, name })), tail, w: CLAIM_W, h: cardH },
    })
    y += Math.max(shift + cardTop + cardH, shift + rowsH) + BLOCK_GAP
  })

  // ── no claims at all: say so, and still list everything below ──
  if (!parts.claims.length) {
    layer.empties.push({ x: PAD, y, w: contentW, h: 84, text: t('rel.chain.noClaims'), sub: t('rel.chain.noClaimsHint') })
    y += 84 + BLOCK_GAP
  }

  // ── guarantees tied to no claim ──
  if (parts.bucket.length) {
    const top = y
    let by = y + SECTION_HEAD_H
    const boxW = widest(parts.bucket.map((b) => b.guarantee.from))
    const textX = PAD + boxW + 24
    const textW = PAD + contentW - textX
    for (const [bi, b] of parts.bucket.entries()) {
      const g = b.guarantee
      const gSize = sizeOf(g.from)
      const creditor = entityById.get(g.to).label
      const main = `${textOf(g)} → ${creditor}`
      const reason = t(`rel.chain.reason.${b.reason}`, { creditor, claims: b.candidates.map((c) => claimTitle(c, textOf(c))).join(' / ') })
      const textH = lines(main, textW, LINE_FONT) * LINE_LH + lines(reason, textW, LINE_FONT) * LINE_LH + 4
      const rowH = Math.max(gSize.h, textH)
      nodes.push({ id: `${g.from}@b${bi}`, type: 'rnode', position: { x: PAD, y: by + (rowH - gSize.h) / 2 }, data: boxData(entityById.get(g.from), boxW) })
      layer.texts.push({ x: textX, y: by + (rowH - textH) / 2, w: textW, main, sub: reason })
      by += rowH + ROW_GAP
    }
    layer.frames.push({ x: PAD, y: top, w: contentW, h: by - ROW_GAP - top, title: t('rel.chain.bucket', { n: parts.bucket.length }), titleAt: [PAD, top + 22] })
    y = by - ROW_GAP + SECTION_GAP
  }

  // ── every other relation, as a list ──
  if (parts.other.length) {
    const top = y
    const cols = parts.other.length > 8 ? 2 : 1
    const colW = (contentW - 24 * (cols - 1)) / cols
    const items = parts.other.map((r) => {
      const text = `${textOf(r)}：${entityById.get(r.from).label} → ${entityById.get(r.to).label}`
      return { text, h: lines(text, colW, LINE_FONT) * LINE_LH }
    })
    const split = cols === 1 ? items.length : Math.ceil(items.length / 2)
    const colItems = [items.slice(0, split), items.slice(split)].slice(0, cols)
    let colBottom = top + SECTION_HEAD_H
    colItems.forEach((list, c) => {
      let ly = top + SECTION_HEAD_H
      for (const it of list) {
        layer.texts.push({ x: PAD + c * (colW + 24), y: ly, w: colW, main: it.text })
        ly += it.h + 6
      }
      colBottom = Math.max(colBottom, ly)
    })
    layer.frames.push({ x: PAD, y: top, w: contentW, h: colBottom - 6 - top, title: t('rel.chain.other', { n: parts.other.length }), titleAt: [PAD, top + 22] })
    y = colBottom - 6 + SECTION_GAP
  }

  const height = Math.ceil(y - SECTION_GAP + PAD)
  layer.height = height
  nodes.unshift({
    id: '__chain__',
    type: 'chainLayer',
    position: { x: 0, y: 0 },
    // Decoration layer: 1×1 for React Flow, drawn at full size inside (see fact/timeline/nodes.js cellsNode)
    width: 1,
    height: 1,
    draggable: false,
    selectable: false,
    connectable: false,
    focusable: false,
    style: { pointerEvents: 'none' },
    data: layer,
  })

  const kinds = {}
  for (const r of relations) kinds[r.kind] = (kinds[r.kind] ?? 0) + 1
  const slotsAll = [...parts.slots.values()].flat()
  return {
    errors,
    hints,
    nodes,
    edges: [],
    connections: [],
    claims: parts.claims.length,
    guarantors: slotsAll.length,
    inferred: slotsAll.filter((s) => s.inferred).length,
    counters: slotsAll.reduce((n, s) => n + s.counters.length, 0),
    unsecured: parts.claims.filter((c) => !parts.slots.get(c.id).length).length,
    bucket: parts.bucket.length,
    other: parts.other.length,
    size: { width: Math.ceil(width), height },
    stats: { entities: entities.length, relations: relations.length, groups: spec.groups?.length ?? 0, kinds },
  }
}

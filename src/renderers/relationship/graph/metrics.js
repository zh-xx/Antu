// ============================================================
//  src/renderers/relationship/graph/metrics.js — relationship sizes and spacing
//
//  The single source of every size the relationship graph uses (the same job as procedure's
//  metrics.js). The positions come from ELK (layout.js); this file only answers "how big is this
//  entity" and "how big is this label".
//
//  An entity is as big as its text: the name, and under it the role in one short line. The
//  stylesheet draws the text with exactly these numbers (the entity passes textW down), so the
//  box and the text in it cannot disagree.
// ============================================================

// The same text measure the fact cards and the procedure nodes use, so a CJK character counts the same everywhere
import { textEm } from '../../fact/cardGeometry.js'

/** Entity text: the name, and the role under it */
export const ENTITY_FONT = 14
export const ENTITY_LINE = 20
export const ROLE_FONT = 12
export const ROLE_LINE = 16
export const ENTITY_MAX_LINES = 2
/** Inner padding of a box */
export const ENTITY_PAD_X = 16
export const ENTITY_PAD_Y = 10
/** The text column: never narrower than this, and wrapped once wider than the cap */
export const TEXT_MIN_W = 76
export const TEXT_MAX_W = 160

/**
 * ELK spacing between two levels of a camp. ELK adds room for a relation's label on top of this, so it
 * only has to keep two levels apart; wider left a tall empty stretch between a holder and what it holds.
 */
export const LAYER_GAP = 48
export const NODE_GAP = 32

/** The channel between two camps: the links across run in it, and their labels stand in it */
export const CAMP_GAP = 110

/** A group box: room at the top for its title, and around its entities */
export const GROUP_PAD_TOP = 32
export const GROUP_PAD = 18
export const GROUP_TITLE_FONT = 13

/** Padding around the content */
export const PAD = 32

/** Relation labels: ELK is given a box per label and keeps it clear of every entity */
export const LABEL_FONT = 12
export const LABEL_LINE = 16
export const LABEL_PAD_X = 6
export const LABEL_MAX_W = 150

/**
 * textEm measures regular text. An entity's name is bold (600), which runs wider, and a label sits in
 * a box with no room to spare: without these the name wrapped one line too early and a label lost
 * its last letter ("Loa"), both seen in the first screenshots. The factor goes on the Latin letters
 * only: a CJK character is one em wide however heavy it is, and widening those too would leave the
 * boxes of a Chinese diagram loose.
 */
export const BOLD_FACTOR = 1.3
export const LABEL_FACTOR = 1.2
const emOf = (text, factor) => {
  const s = String(text ?? '')
  const latin = [...s].filter((ch) => ch.codePointAt(0) < 0x2e80).join('')
  return textEm(s) + textEm(latin) * (factor - 1)
}

/**
 * What crossing another link costs the router, in pixels of length. The flowchart's is 1400: a detour
 * always beats a crossing. Here links run across the picture between camps, so a crossing is worth a
 * bend or so and not a trip round the whole diagram (seen on the first horizontal screenshot).
 */
export const CROSS_COST = 900

/** Past this many entities the diagram is reported with a hint (it is not an error) */
export const SCALE_HINT_ENTITIES = 25

/** The box a relation's label needs: width capped, text wrapped into lines */
export function labelBox(text) {
  const textW = emOf(text, LABEL_FACTOR) * LABEL_FONT
  const width = Math.min(LABEL_MAX_W, Math.ceil(textW + LABEL_PAD_X * 2))
  const lines = Math.max(1, Math.ceil(textW / (LABEL_MAX_W - LABEL_PAD_X * 2) - 1e-9))
  return { width, height: lines * LABEL_LINE + 2 }
}

/** The single source of entity sizes. Returns { w, h, textW }: textW is the width of the text column the entity draws its text in. */
export function sizeOf(entity) {
  const label = String(entity?.label ?? '')
  const role = entity?.role ? String(entity.role) : ''
  const labelW = emOf(label, BOLD_FACTOR) * ENTITY_FONT
  // The role shows on one line, so it can widen the box only up to the cap
  const roleW = role ? textEm(role) * ROLE_FONT : 0
  const textW = Math.ceil(Math.min(TEXT_MAX_W, Math.max(TEXT_MIN_W, labelW, roleW)))
  const lines = Math.min(ENTITY_MAX_LINES, Math.max(1, Math.ceil(labelW / textW - 1e-9)))
  const textH = lines * ENTITY_LINE + (role ? ROLE_LINE + 2 : 0)
  return { w: textW + ENTITY_PAD_X * 2, h: textH + ENTITY_PAD_Y * 2, textW }
}

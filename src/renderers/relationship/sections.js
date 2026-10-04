// ============================================================
//  src/renderers/relationship/sections.js — the lists under a levelled picture (shared)
//
//  The equity tree, the authority chart, the relation path and the camp summary each draw only part of
//  the data and list the rest under the picture, so that every relation (and every party) is on the page
//  once. This writes those lists into the line layer (LineLayerNode): a framed section with a title and
//  rows of text, or the dashed empty box that says there is nothing to draw. Pure JS.
// ============================================================

import { wrapLineCount } from '../fact/cardGeometry.js'
import { PAD } from './graph/metrics.js'

export const SECTION_GAP = 28
const SECTION_PAD = 20
const SECTION_HEAD_H = 34
const LINE_FONT = 12.5
const LINE_LH = 19
const SCALE = { latin: 1.2, cjk: 1.06 }
export const EMPTY_H = 84

const lines = (text, width) => Math.max(1, wrapLineCount(text, width / LINE_FONT, SCALE))

/**
 * @param layer  the line layer's data (frames, texts and empties are pushed into it)
 * @param width  the sections' width; they start at PAD
 * @param y      where the first one starts
 * @returns { section(title, items), empty(text, sub), y() }  items: [{ main, sub?, tone? }]
 */
export function sectionWriter(layer, width, y) {
  const textW = width - SECTION_PAD * 2
  return {
    section(title, items) {
      const top = y
      let ly = top + SECTION_HEAD_H
      for (const it of items) {
        const hh = lines(it.main, textW) * LINE_LH + (it.sub ? lines(it.sub, textW) * LINE_LH : 0)
        layer.texts.push({ x: PAD + SECTION_PAD, y: ly, w: textW, main: it.main, sub: it.sub, tone: it.tone })
        ly += hh + 6
      }
      layer.frames.push({ x: PAD, y: top, w: width, h: ly - top + SECTION_PAD - 6, title, titleAt: [PAD + SECTION_PAD, top + 22] })
      y = ly + SECTION_PAD - 6 + SECTION_GAP
    },
    empty(text, sub) {
      layer.empties.push({ x: PAD, y, w: width, h: EMPTY_H, text, sub })
      y += EMPTY_H + SECTION_GAP
    },
    /** Where the next thing would start; the picture's height is this minus the last gap, plus PAD */
    y: () => y,
  }
}

// ============================================================
//  src/core/paper.js — paper size as a layout input (issue 123)
//
//  A theme is appearance (`spec/theme.md`). Paper is layout: how wide and tall the
//  drawing area is. Comments used to name A4 as the reason for PIXEL_RATIO = 2, but A4
//  was nowhere as a number. The print path (PR 271) introduced millimetres and a printable
//  area for the browser's sheet; this file is the shared quantity those CSS pixels come
//  from, and the place future layout / CLI / MCP `paper` arguments will read.
//
//  Levels today: screen (the reference window), a4l / a4p (A4 less the print margins).
//  Plain JS, no React, so Node and the browser both import it.
// ============================================================

import { REFERENCE_CANVAS } from './canvas.js'

/** The paper levels a caller may ask for. `screen` is today's default canvas. */
export const PAPER_LEVELS = Object.freeze(['screen', 'a4l', 'a4p'])

/** The page margins the print CSS asks for (`@page { margin: 12mm }`), in millimetres */
export const PRINT_MARGIN_MM = 12

/** A4, in millimetres (portrait: the long side is the height) */
export const A4_MM = Object.freeze({ width: 210, height: 297 })

/** CSS pixels per millimetre: print lays out at 96 dpi. Kept here and nowhere else. */
const PX_PER_MM = 96 / 25.4

/**
 * @param {string} level
 * @returns {level is 'screen'|'a4l'|'a4p'}
 */
export function isPaperLevel(level) {
  return PAPER_LEVELS.includes(level)
}

/**
 * Map a sheet orientation to the A4 paper level that matches it.
 * Only `'portrait'` and `'landscape'` are accepted — same strictness as `paperOf`
 * (a typo must not silently become portrait).
 * @param {'portrait'|'landscape'} orientation
 * @returns {'a4p'|'a4l'}
 */
export function levelForOrientation(orientation) {
  if (orientation === 'landscape') return 'a4l'
  if (orientation === 'portrait') return 'a4p'
  throw new Error(
    `unknown sheet orientation ${JSON.stringify(orientation)}: use "portrait" or "landscape"`,
  )
}

/**
 * The printable area of an A4 sheet at the given orientation, in CSS pixels.
 * Same numbers the print slice pinned: portrait 703×1032, landscape 1032×703.
 * @param {'portrait'|'landscape'} orientation
 * @returns {{ width: number, height: number }}
 */
function a4Canvas(orientation) {
  const short = (A4_MM.width - PRINT_MARGIN_MM * 2) * PX_PER_MM
  const long = (A4_MM.height - PRINT_MARGIN_MM * 2) * PX_PER_MM
  const landscape = orientation === 'landscape'
  return {
    width: Math.round(landscape ? long : short),
    height: Math.round(landscape ? short : long),
  }
}

/**
 * Resolve a paper level to the drawing area (and, for A4, the print sheet fields).
 * Unknown or missing levels throw: a typo must not silently fall back to the screen.
 *
 * @param {'screen'|'a4l'|'a4p'} level
 * @returns {{
 *   level: 'screen'|'a4l'|'a4p',
 *   canvas: { width: number, height: number },
 *   orientation?: 'portrait'|'landscape',
 *   pageSize?: string,
 *   marginMm?: number,
 * }}
 */
/**
 * Resolve a caller-supplied paper value to a level.
 * Empty / missing → `fallback` (default `screen`). A non-empty unknown value throws.
 * @param {unknown} value
 * @param {{ fallback?: 'screen'|'a4l'|'a4p' }} [opts]
 * @returns {'screen'|'a4l'|'a4p'}
 */
export function resolvePaperLevel(value, { fallback = 'screen' } = {}) {
  if (value === undefined || value === null || value === '') return fallback
  if (!isPaperLevel(value)) {
    throw new Error(
      `unknown paper level ${JSON.stringify(value)}: use one of ${PAPER_LEVELS.join(', ')}`,
    )
  }
  return value
}

export function paperOf(level) {
  if (!isPaperLevel(level)) {
    throw new Error(
      `unknown paper level ${JSON.stringify(level)}: use one of ${PAPER_LEVELS.join(', ')}`,
    )
  }
  if (level === 'screen') {
    return Object.freeze({
      level: 'screen',
      canvas: Object.freeze({ width: REFERENCE_CANVAS.width, height: REFERENCE_CANVAS.height }),
    })
  }
  const orientation = level === 'a4l' ? 'landscape' : 'portrait'
  return Object.freeze({
    level,
    canvas: Object.freeze(a4Canvas(orientation)),
    orientation,
    pageSize: orientation === 'landscape' ? 'A4 landscape' : 'A4 portrait',
    marginMm: PRINT_MARGIN_MM,
  })
}

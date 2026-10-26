// ============================================================
//  src/shell/printHost.js — the Print action, from the dock button to the paper
//
//  The action needs two things that live in different places: the theme the page is in
//  (a printed sheet is paper, so it is laid out in the document theme) and the canvas
//  (only it knows the diagram's content size, and only it can fit the picture to the
//  paper area). The button sits in a renderer's dock and sees neither. App is the one
//  place that holds both, so it provides this host: the canvas registers what the action
//  needs, the button calls `print()`, and App runs the steps in order:
//
//    1. swap to the document theme (the sheet is paper), when the page is not in it
//    2. ask the canvas for the paper orientation from the diagram's shape, and for that
//       sheet the printable area
//    3. set the sheet size, resize the canvas to it and fit the diagram (the picture is
//       fitted, never cropped)
//    4. open the browser's own print preview, wait for it to finish
//    5. put the page back exactly as it was
//
//  It is only offered on the viewer page: an embedded diagram lives inside a host's page,
//  where `window.print()` would print the host's page, not the diagram.
// ============================================================

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'

import { PRINT_MARGIN_MM, levelForOrientation, paperOf } from '../core/paper.js'
import { frames, paperFor, showPrintDialog } from './printPaper.js'

const PrintHostContext = createContext(null)

/** What App provides to its subtree; null where printing makes no sense. */
export const PrintHostProvider = PrintHostContext.Provider
export const usePrintHost = () => useContext(PrintHostContext)

const PAGE_STYLE_ID = 'antu-print-page'

/** The `@page` rule for this sheet. The stylesheet carries a portrait A4 fallback; a
 *  landscape diagram needs its own sheet, and one id owns that override. Margins come
 *  from `PRINT_MARGIN_MM` in `src/core/paper.js`, the same number the printable area uses.
 *  Only an A4 `paperOf` result has `pageSize`; `screen` must not reach here. */
function setPageRule(page) {
  if (!page?.pageSize) {
    throw new Error(
      `setPageRule needs an A4 paperOf result with pageSize (got level ${JSON.stringify(page?.level)})`,
    )
  }
  document.getElementById(PAGE_STYLE_ID)?.remove()
  const style = document.createElement('style')
  style.id = PAGE_STYLE_ID
  style.textContent = `@page { size: ${page.pageSize}; margin: ${PRINT_MARGIN_MM}mm; }`
  document.head.appendChild(style)
}

function clearPageRule() {
  document.getElementById(PAGE_STYLE_ID)?.remove()
}

/**
 * The host App provides. `themeId` decides whether the page has to be re-drawn for paper.
 * @param {string} themeId the theme the page is in now
 * @returns {{value: {printing: boolean, print: () => Promise<void>, attach: (cap: object|null) => void}, printLight: boolean}}
 */
export function usePrintController(themeId) {
  const [printing, setPrinting] = useState(false)
  const [printLight, setPrintLight] = useState(false)
  const capRef = useRef(null)
  const busyRef = useRef(false)

  const attach = useCallback((cap) => {
    capRef.current = cap
  }, [])

  const print = useCallback(async () => {
    const cap = capRef.current
    if (!cap || busyRef.current) return
    busyRef.current = true
    setPrinting(true)
    try {
      // A printed sheet is paper: a dark page would waste ink and read poorly, so the
      // diagram is laid out in the document theme while it is on paper (issue 123).
      const light = themeId !== 'document'
      if (light) {
        setPrintLight(true)
        await frames(2)
      }
      // Orientation follows the diagram's shape; the sheet itself is the matching A4 level
      // from `paperOf` (issue 123), so print CSS and the fit area share one quantity.
      const page = paperOf(levelForOrientation(paperFor(cap.size?.width, cap.size?.height)))
      setPageRule(page)
      await cap.prepare?.(page.canvas)
      await frames(2)
      await showPrintDialog()
    } finally {
      cap.finish?.()
      clearPageRule()
      setPrintLight(false)
      setPrinting(false)
      busyRef.current = false
    }
  }, [themeId])

  const value = useMemo(() => ({ printing, print, attach }), [printing, print, attach])
  return { value, printLight }
}

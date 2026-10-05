// ============================================================
//  site/prototypes/hero/capture.mjs — what Antu itself draws, for the lenses draft
//
//  Renders a spec with the real engine, opens it in headless Chrome, fits the view, hides the page's own
//  controls, and returns: where each card is (by its id in the data), a picture of the whole diagram, and
//  a picture with the cards hidden (only the lines, lanes, headings and frames). The animation lands its
//  pieces on those places and ends on that picture, so the last frame is exactly Antu's output.
// ============================================================

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { renderToFile } from '../../../tools/lib/make-html.mjs'
import { launchBrowser, ITEM_SELECTOR } from '../../../tools/lib/chrome.mjs'

export const FRAME = { w: 1200, h: 600 }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export async function captureAll(jobs) {
  const dir = mkdtempSync(join(tmpdir(), 'antu-hero-'))
  const s = await launchBrowser({ width: FRAME.w, height: FRAME.h })
  const out = {}
  try {
    await s.cdp('Emulation.setDeviceMetricsOverride', { width: FRAME.w, height: FRAME.h, deviceScaleFactor: 2, mobile: false })
    for (const { name, spec, preset } of jobs) {
      const file = join(dir, `${name}.html`)
      renderToFile(spec, { outPath: file, quiet: true, preset })
      await s.open(pathToFileURL(file).href + '?lang=zh', { settleMs: 1200 })
      // hide the page's own controls, then fit the diagram to the whole frame
      await s.eval(`(() => { const st = document.createElement('style'); st.textContent = '.antu-header,.react-flow__panel,.react-flow__minimap,.react-flow__controls,.react-flow__attribution{display:none!important}'; document.head.appendChild(st); document.querySelector('.react-flow__controls-fitview')?.click(); return 1 })()`)
      await sleep(1200)
      const nodes = JSON.parse(await s.eval(`JSON.stringify(Object.fromEntries([...document.querySelectorAll('.react-flow__viewport .react-flow__node')]
        .filter((w) => !w.dataset.id.startsWith('__'))
        .map((w) => { const c = w.querySelector(${JSON.stringify(ITEM_SELECTOR)}) || w; const r = c.getBoundingClientRect(); return [w.dataset.id, { x: r.x, y: r.y, w: r.width, h: r.height }] })))`))
      const shot = async () => (await s.cdp('Page.captureScreenshot', { format: 'webp', quality: 88 })).data
      const full = await shot()
      await s.eval(`(() => { const st = document.createElement('style'); st.textContent = '.react-flow__viewport .react-flow__node:not([data-id^="__"]){visibility:hidden!important}'; document.head.appendChild(st); return 1 })()`)
      await sleep(200)
      const lines = await shot()
      out[name] = { nodes, full, lines }
    }
  } finally {
    await s.close()
    rmSync(dir, { recursive: true, force: true })
  }
  return out
}

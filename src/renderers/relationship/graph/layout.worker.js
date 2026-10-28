// ============================================================
//  layout.worker.js — relationship graph layout off the UI thread (issue 181)
//
//  The page stays responsive while ELK and the orthogonal router run. Bundled with
//  `?worker&inline` so the self-contained HTML / embed builds need no network fetch
//  for a separate worker file (blob URL from an inlined base64 script).
// ============================================================

import { buildRelationshipGraph } from './layout.js'

self.onmessage = (event) => {
  const msg = event.data
  if (!msg || typeof msg.id !== 'number') return
  try {
    const layout = buildRelationshipGraph(
      msg.spec,
      { groups: msg.groups, lang: msg.lang },
      undefined,
      msg.orientation,
    )
    self.postMessage({ id: msg.id, ok: true, layout })
  } catch (err) {
    self.postMessage({ id: msg.id, ok: false, error: String(err?.message ?? err) })
  }
}

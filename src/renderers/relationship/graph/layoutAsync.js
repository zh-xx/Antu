// ============================================================
//  layoutAsync.js — run buildRelationshipGraph in a Web Worker when the browser allows it
//
//  Sync `buildRelationshipGraph` stays the API for Node, MCP, tests and the registry.
//  The React graph view calls this so a large layout does not freeze the page (issue 181).
//
//  Worker is inlined (`?worker&inline`): self-contained HTML and the embed bundle must not
//  fetch a second script. If Worker is missing or construction fails, the layout still runs
//  on the main thread after one timeout so the UI can paint first.
// ============================================================

import { buildRelationshipGraph } from './layout.js'
import RelLayoutWorker from './layout.worker.js?worker&inline'

let worker = null
let workerFailed = false
let nextId = 1
const pending = new Map()

function ensureWorker() {
  if (workerFailed) return null
  if (worker) return worker
  if (typeof Worker === 'undefined') {
    workerFailed = true
    return null
  }
  try {
    worker = new RelLayoutWorker()
    worker.onmessage = (event) => {
      const msg = event.data
      const wait = pending.get(msg?.id)
      if (!wait) return
      pending.delete(msg.id)
      if (msg.ok) wait.resolve(msg.layout)
      else wait.reject(new Error(msg.error || 'relationship layout worker failed'))
    }
    worker.onerror = () => {
      // One hard failure: stop using the worker; in-flight callers fall through via reject + caller retry not needed —
      // we reject so the renderer can sync-fallback on the next effect if it wants. Mark failed for future calls.
      workerFailed = true
      for (const [, wait] of pending) wait.reject(new Error('relationship layout worker error'))
      pending.clear()
      try {
        worker.terminate()
      } catch {
        /* ignore */
      }
      worker = null
    }
    return worker
  } catch {
    workerFailed = true
    return null
  }
}

function layoutSync(spec, fields, orientation) {
  return buildRelationshipGraph(
    spec,
    { groups: fields?.groups, lang: fields?.lang, t: fields?.t },
    undefined,
    orientation,
  )
}

/**
 * Lay out a relationship graph without blocking the UI when a Worker is available.
 * @returns {Promise<object>} same shape as `buildRelationshipGraph`
 */
export function layoutRelationshipAsync(spec, fields = {}, orientation = 'vertical') {
  const w = ensureWorker()
  if (!w) {
    return new Promise((resolve) => {
      setTimeout(() => resolve(layoutSync(spec, fields, orientation)), 0)
    })
  }
  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    try {
      w.postMessage({
        id,
        spec,
        groups: fields.groups,
        lang: fields.lang || 'en',
        orientation,
      })
    } catch {
      pending.delete(id)
      workerFailed = true
      resolve(layoutSync(spec, fields, orientation))
    }
  }).catch(() => layoutSync(spec, fields, orientation))
}

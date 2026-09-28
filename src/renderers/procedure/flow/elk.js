// ============================================================
//  src/renderers/procedure/flow/elk.js — ELK's layered layout, called synchronously
//
//  Why ELK (Eclipse Layout Kernel, via elkjs): measured on the 7 real contracts plus the rule
//  drafts, its layered algorithm gave 0 edge crossings on 8 of 9 (2 on the hardest) where the
//  hand-written layout gave 12 and 38 on contracts 01 and 03, and dagre 7 and 11. It also
//  reserves room for the condition labels, so a label never lands on a node, and lets the
//  branches spread naturally instead of hanging off one rigid column.
//  Cost: about 1.6 MB of engine code in every generated HTML.
//
//  Why synchronously: the whole pipeline (validation, layout, the MCP geometry report, the
//  unit tests, the renderer's useMemo) is synchronous, and ELK's public API is a Promise only
//  because it may run in a Web Worker. Without a worker, elkjs uses a "FakeWorker" whose
//  dispatcher computes synchronously and only defers the reply with setTimeout. Talking to that
//  dispatcher directly gives the result in the same tick. This relies on elkjs internals, so
//  the version is pinned in package.json and the unit tests exercise it on every run.
// ============================================================

import elkWorker from 'elkjs/lib/elk-worker.min.js'

const FakeWorker = elkWorker.Worker ?? elkWorker.default ?? elkWorker

let worker = null
let reply

function ensureWorker() {
  if (worker) return worker
  worker = new FakeWorker()
  worker.onmessage = (m) => {
    reply = m.data
  }
  // The public API registers the algorithms before the first layout; do the same
  worker.dispatcher.saveDispatch({ data: { id: 0, cmd: 'register', algorithms: ['layered'] } })
  return worker
}

/** Lay out an ELK JSON graph; returns the graph with positions, or throws */
export function elkLayoutSync(graph) {
  const w = ensureWorker()
  reply = undefined
  w.dispatcher.saveDispatch({ data: { id: 1, cmd: 'layout', graph, layoutOptions: {}, options: {} } })
  if (!reply) throw new Error('ELK returned no result (the synchronous dispatch path of elkjs changed)')
  if (reply.error) throw new Error(`ELK layout failed: ${String(reply.error.message ?? reply.error)}`)
  return reply.data
}

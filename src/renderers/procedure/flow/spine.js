// @ts-check
// ============================================================
//  src/renderers/procedure/flow/spine.js — back edges, main line, and grouped links
//
//  Shared by the current flowchart layout and Mainline-first (issue 190): both views must
//  agree on which nodes are on the main line and which edges are loops. Pure structure,
//  no geometry.
// ============================================================

import { ruleEndIds } from './rules.js'

/** @param {{ from: string, to: string, condition?: string }} e */
export const edgeKey = (e) => `${e.from}|${e.to}|${e.condition ?? ''}`

/**
 * Recognise back edges (DFS into a node still on the path) and walk the main line.
 * @param {object} spec a validated procedure spec
 * @returns {{
 *   byId: Map<string, object>,
 *   outE: Map<string, object[]>,
 *   inE: Map<string, object[]>,
 *   back: Set<string>,
 *   ruleEnds: Set<string>,
 *   entries: string[],
 *   spine: string[],
 *   spines: string[][],
 *   spineSet: Set<string>,
 *   spineNext: Map<string, string>,
 *   groups: Array<{ from: string, to: string, isBack: boolean, isMain: boolean, merged: number, label: string }>,
 * }}
 */
export function analyseProcedureGraph(spec) {
  const nodes = spec.nodes
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const ids = nodes.map((n) => n.id)

  const outE = new Map(ids.map((id) => [id, []]))
  const inE = new Map(ids.map((id) => [id, []]))
  spec.edges.forEach((e, index) => {
    outE.get(e.from).push({ ...e, index })
    inE.get(e.to).push({ ...e, index })
  })

  const back = new Set()
  const color = new Map()
  const walk = (u) => {
    color.set(u, 1)
    for (const e of outE.get(u)) {
      const c = color.get(e.to) ?? 0
      if (c === 1) back.add(edgeKey(e))
      else if (c === 0) walk(e.to)
    }
    color.set(u, 2)
  }
  const starters = [...ids.filter((id) => inE.get(id).length === 0), ...ids]
  for (const id of starters) if ((color.get(id) ?? 0) === 0) walk(id)

  const ruleEnds = new Set([...ruleEndIds(spec)].filter((id) => byId.has(id) && inE.get(id).length === 0))
  const entries = ids.filter((id) => inE.get(id).length === 0 && !ruleEnds.has(id))

  /**
   * Walk one main chain from an entry, preferring `main:true` then unmarked forward edges.
   * Used for the primary spine and for each additional disconnected component (B08).
   * @param {string | undefined} start
   * @param {Set<string>} claimed
   */
  const walkSpine = (start, claimed) => {
    /** @type {string[]} */
    const path = []
    let cur = start
    const guard = new Set()
    while (cur !== undefined && !guard.has(cur) && !claimed.has(cur)) {
      guard.add(cur)
      path.push(cur)
      if (byId.get(cur).kind === 'end') break
      const outs = outE.get(cur)
      const pick =
        outs.find((e) => e.main === true && !guard.has(e.to) && !claimed.has(e.to)) ??
        outs.find((e) => e.main === true && !guard.has(e.to)) ??
        outs.find((e) => !e.condition && !guard.has(e.to) && !claimed.has(e.to)) ??
        outs.find((e) => !guard.has(e.to) && !claimed.has(e.to)) ??
        outs.find((e) => !guard.has(e.to))
      cur = pick?.to
    }
    return path
  }

  /** @type {string[][]} */
  const spines = []
  const spineSet = new Set()
  const claimed = new Set()
  for (const entry of entries) {
    if (claimed.has(entry)) continue
    const path = walkSpine(entry, claimed)
    if (!path.length) continue
    spines.push(path)
    for (const id of path) {
      spineSet.add(id)
      claimed.add(id)
    }
  }
  const spine = spines[0] ?? []
  /** @type {Map<string, string>} */
  const spineNext = new Map()
  for (const path of spines) {
    for (let i = 0; i < path.length - 1; i += 1) spineNext.set(path[i], path[i + 1])
  }

  const grouped = new Map()
  for (const e of spec.edges) {
    const k = `${e.from}|${e.to}`
    if (!grouped.has(k)) grouped.set(k, [])
    grouped.get(k).push(e)
  }
  const groups = [...grouped.values()].map((group) => {
    const { from, to } = group[0]
    const isBack = back.has(edgeKey(group[0]))
    const labels = group.map((e) => e.condition).filter(Boolean)
    // Main on any component spine (not only the primary entry's chain).
    const isMain = !isBack && spineNext.get(from) === to
    // Input main:true (may be a hang→spine rejoin that is not on spineNext).
    const inputMain = group.some((e) => e.main === true)
    return {
      from,
      to,
      isBack,
      isMain,
      inputMain,
      merged: group.length,
      label: labels.length ? labels.join(' / ') : '',
    }
  })

  return { byId, outE, inE, back, ruleEnds, entries, spine, spines, spineSet, spineNext, groups }
}

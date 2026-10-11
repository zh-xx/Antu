// ============================================================
//  src/renderers/relationship/scope.js — which party's picture the equity tree and the authority chart draw
//
//  A case often holds the shareholdings, the control and the posts of several companies. Drawn together they
//  stand side by side and the picture is wide and flat. The reader picks one party (a company, mostly) and
//  the picture holds it at the top and everyone below it (what it holds, who it commands, transitively); its
//  holders and controllers (transitively) are written under the picture as a list, except for a party with
//  nothing below it, whose picture holds the ones above it. What the picture leaves out is not listed: the graph
//  and the other views hold every relation.
//
//    '*'        the reader chose "all": nothing is left out
//    an id      that party's picture, when it is in the tree
//    otherwise  the default: with more than one separate structure in the data, the party with most lines
//               (the first written on a tie) is opened; with one structure, all of it
//
//  Pure JS, no React: Node computes the same picture for antu_layout and the tests check it.
// ============================================================

/**
 * The parties a party's picture holds: itself and everyone below it (what it holds, who it commands, transitively).
 * The ones above it are not drawn: they are listed under the picture (see splitScope), so the party sits at the top.
 */
export function reachDown(edges, focus) {
  const down = new Map()
  for (const e of edges) down.set(e.from, [...(down.get(e.from) ?? []), e.to])
  const seen = new Set([focus])
  const stack = [focus]
  while (stack.length) {
    for (const y of down.get(stack.pop()) ?? []) {
      if (seen.has(y)) continue
      seen.add(y)
      stack.push(y)
    }
  }
  return seen
}

/** The lines of a party's picture, and the other lines among it and everyone above it (the ones written under it) */
export function splitScope(edges, focus) {
  const down = reachDown(edges, focus)
  const drawn = edges.filter((e) => down.has(e.from) && down.has(e.to))
  const whole = reachScope(edges, focus)
  // A party with nothing below it (a company its officers all point at) would be a lone box: its picture is
  // then everyone above it too, as one picture
  if (!drawn.length) return { drawn: edges.filter((e) => whole.has(e.from) && whole.has(e.to)), above: [] }
  const above = edges.filter((e) => whole.has(e.from) && whole.has(e.to) && !drawn.includes(e))
  return { drawn, above }
}

/** The parties a party's picture holds: itself, everyone above it and everyone below it */
export function reachScope(edges, focus) {
  const up = new Map()
  const down = new Map()
  const push = (m, k, v) => m.set(k, [...(m.get(k) ?? []), v])
  for (const e of edges) {
    push(down, e.from, e.to)
    push(up, e.to, e.from)
  }
  const seen = new Set([focus])
  for (const m of [up, down]) {
    const stack = [focus]
    const visited = new Set([focus])
    while (stack.length) {
      for (const y of m.get(stack.pop()) ?? []) {
        if (visited.has(y)) continue
        visited.add(y)
        seen.add(y)
        stack.push(y)
      }
    }
  }
  return seen
}

/** How many separate structures the lines make (parties joined by a line, in either direction, are one) */
export function structureCount(ids, edges) {
  const parent = new Map(ids.map((id) => [id, id]))
  // The root of a party's structure, found without recursion, and every party on the way pointed at it
  const find = (x) => {
    let root = x
    while (parent.get(root) !== root) root = parent.get(root)
    while (parent.get(x) !== root) {
      const next = parent.get(x)
      parent.set(x, root)
      x = next
    }
    return root
  }
  for (const e of edges) parent.set(find(e.from), find(e.to))
  return new Set(ids.map(find)).size
}

/** Whether the reader has a choice to make: more than one separate structure */
export const hasSeveral = (ids, edges) => structureCount(ids, edges) > 1

/** The party opened when the reader has not chosen: null (all) unless there are several structures */
export function defaultCompany(ids, edges) {
  if (structureCount(ids, edges) < 2) return null
  const lines = (id) => edges.filter((e) => e.from === id || e.to === id).length
  let best = null
  for (const id of ids) if (best === null || lines(id) > lines(best)) best = id
  return best
}

/** The party actually used: null for "all" */
export function companyOf(asked, ids, edges) {
  if (asked === '*') return null
  if (ids.includes(asked)) return asked
  return defaultCompany(ids, edges)
}

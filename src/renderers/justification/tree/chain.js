// ============================================================
//  src/renderers/justification/tree/chain.js — what looking at one node brings out
//
//  Pointing at a node lights its whole chain: everything it rests on, down to the facts and the norms,
//  and everything it leads to, up to the end conclusion. Everything else fades. That is the question a
//  reader of a reasoning asks of a node: "what is this based on, and what does it lead to?"
//
//  A fact drawn in several issues is one node in the data, so looking at one copy lights every copy
//  with the chains that go with it. Pure and free of React, so the link layer and the nodes agree and
//  a unit test can pin it.
// ============================================================

/**
 * @param {{ id: string, from: string, to: string }[]} connections  the links, between placements
 * @param {{ id: string, data: { node: { id: string } } }[]} nodes    the placements, with the node each stands for
 * @param {string} placementId  the placement being looked at
 * @returns {{ lines: Set<string>, nodes: Set<string> }}  link ids and placement ids
 */
export function chainOf(connections, nodes, placementId) {
  const sameNode = new Map()
  for (const n of nodes) sameNode.set(n.data.node.id, [...(sameNode.get(n.data.node.id) ?? []), n.id])
  const nodeOf = new Map(nodes.map((n) => [n.id, n.data.node.id]))
  const copiesOf = (id) => sameNode.get(nodeOf.get(id)) ?? [id]

  const lit = new Set(copiesOf(placementId))
  const lines = new Set()
  // What it rests on: the links into a lit node, and what is at their other end, until none is new
  let grew = true
  while (grew) {
    grew = false
    for (const c of connections) {
      if (lit.has(c.to) && !lines.has(c.id)) {
        lines.add(c.id)
        for (const p of copiesOf(c.from)) if (!lit.has(p)) lit.add(p)
        grew = true
      }
    }
  }
  // What it leads to: from the node itself only, not from the things it rests on
  const up = new Set(copiesOf(placementId))
  grew = true
  while (grew) {
    grew = false
    for (const c of connections) {
      if (up.has(c.from) && !lines.has(c.id)) {
        lines.add(c.id)
        for (const p of copiesOf(c.to)) {
          up.add(p)
          lit.add(p)
        }
        grew = true
      }
    }
  }
  return { lines, nodes: lit }
}

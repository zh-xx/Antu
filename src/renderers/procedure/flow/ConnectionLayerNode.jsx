// ============================================================
//  src/renderers/procedure/flow/ConnectionLayerNode.jsx — the link layer (a decoration node)
//
//  Every link of the flowchart is drawn here, in one SVG, from the geometry layout.js already
//  computed (`points` / `d` / `labelAt`). This file computes no geometry of its own: what the
//  unit tests pin in layout.js is exactly what gets drawn.
//
//  Why not React Flow's own edges: a back edge has to go round the outside and several edges
//  into one target have to merge (spec/procedure/schema-draft.md §6.1); the built-in edges
//  can do neither. Same choice as the fact timeline's link layer.
//
//  The layer sits before the nodes, so a node always covers a line that runs behind it.
//  It takes no mouse events.
// ============================================================

import { memo } from 'react'
import { linkPaint, SCOPE_PAINT } from './palette.js'

/** The three link kinds. Each has its own arrowhead, so the head takes the line's colour. */
const KINDS = ['main', 'branch', 'back']

const ConnectionLayerNode = memo(function ConnectionLayerNode({ data }) {
  const { connections, ruleLinks = [], width, height, showConditions, highlightMain } = data

  return (
    <div className={`antu-plinks${highlightMain ? ' is-main-hl' : ''}`}>
      <svg className="antu-plinks-svg" width={width} height={height} aria-hidden="true">
        <defs>
          {KINDS.map((k) => (
            <marker
              key={k}
              id={`antu-arrow-${k}`}
              className={`antu-arrow k-${k}`}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              markerUnits="userSpaceOnUse"
              orient="auto"
            >
              <path d="M 0 1 L 9 5 L 0 9 Z" fill={linkPaint(k, highlightMain).stroke} />
            </marker>
          ))}
        </defs>
        {connections.map((c) => {
          // Paint as attributes, so the exported image carries it (see palette.js)
          const p = linkPaint(c.kind, highlightMain)
          return (
            <path
              key={c.id}
              className={`antu-plink k-${c.kind}`}
              d={c.d}
              fill="none"
              stroke={p.stroke}
              strokeWidth={p.width}
              strokeDasharray={p.dash}
              markerEnd={`url(#antu-arrow-${c.kind})`}
            />
          )
        })}
        {/* Rule trunks: the stubs join without a head, the trunk ends in one at its end */}
        {ruleLinks.map((l) => {
          // A scope bar is a broad, pale stroke beside the rule lane; a trunk is an ordinary link
          const p = l.scope ? SCOPE_PAINT : linkPaint('branch', false)
          return (
            <path
              key={l.id}
              className={`antu-plink ${l.scope ? 'k-scope' : 'k-rule'}`}
              d={l.d}
              fill="none"
              stroke={p.stroke}
              strokeWidth={p.width}
              strokeLinecap={l.scope ? 'round' : undefined}
              markerEnd={l.arrow ? 'url(#antu-arrow-branch)' : undefined}
            />
          )
        })}
      </svg>

      {showConditions &&
        connections
          .filter((c) => c.label)
          .map((c) => (
            <span
              key={c.id}
              className={`antu-plabel a-${c.labelAnchor} k-${c.kind}`}
              style={{ left: c.labelAt.x, top: c.labelAt.y }}
            >
              {c.label}
            </span>
          ))}
    </div>
  )
})

export default ConnectionLayerNode

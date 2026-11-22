// @ts-check
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
import { linkPaint } from './palette.js'
import { wordsOf } from './metrics.js'
import { useTheme } from '../../../theme/ThemeContext.jsx'

/** The three link kinds. Each has its own arrowhead, so the head takes the line's colour. */
const KINDS = ['main', 'branch', 'back']

/** Opening marks that must stay glued to the following word (never stranded at a line end). */
const OPENS = /^[（(「『“]+$/

/**
 * Word chunks for a condition label: same segmentation as wrapLines / FlowNode, with opening
 * punctuation merged onto the next token so `（第48条）` stays one break unit.
 * @param {string} text
 * @returns {string[]}
 */
export function labelChunks(text) {
  const words = wordsOf(text)
  /** @type {string[]} */
  const out = []
  for (let i = 0; i < words.length; i += 1) {
    const w = words[i]
    if (OPENS.test(w) && i + 1 < words.length) {
      out.push(w + words[i + 1])
      i += 1
    } else {
      out.push(w)
    }
  }
  return out
}

/**
 * @typedef {{
 *   id: string,
 *   kind: string,
 *   d: string,
 *   dCurve?: string,
 *   label?: string,
 *   labelAt: { x: number, y: number },
 *   labelSize: { width: number, height: number },
 * }} FlowConnection
 * @typedef {{
 *   connections: FlowConnection[],
 *   width: number,
 *   height: number,
 *   showConditions: boolean,
 *   highlightMain: boolean,
 *   curved: boolean,
 * }} ConnectionLayerNodeData
 * @type {(props: { id?: string, data: ConnectionLayerNodeData }) => import('react').ReactNode}
 */
const ConnectionLayerNode = memo(function ConnectionLayerNode({ data }) {
  const { theme } = useTheme()
  const { connections, width, height, showConditions, highlightMain, curved } = data
  // Straight or curved: the same route either way (layout.js computes both paths), so switching
  // moves no node and no label

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
              <path d="M 0 1 L 9 5 L 0 9 Z" fill={linkPaint(k, highlightMain, theme).stroke} />
            </marker>
          ))}
        </defs>
        {connections.map((c) => {
          // Paint as attributes, so the exported image carries it (see palette.js)
          const p = linkPaint(c.kind, highlightMain, theme)
          return (
            <path
              key={c.id}
              className={`antu-plink k-${c.kind}`}
              d={curved ? c.dCurve : c.d}
              fill="none"
              stroke={p.stroke}
              strokeWidth={p.width}
              strokeDasharray={p.dash}
              markerEnd={`url(#antu-arrow-${c.kind})`}
            />
          )
        })}
      </svg>

      {showConditions &&
        connections
          // labelAt can be null if a layout path forgot to place it; skip rather than crash the page
          .filter((c) => c.label && c.labelAt && c.labelSize)
          .map((c) => (
            // The box the layout reserved for it, clear of every node: drawn exactly there
            <span
              key={c.id}
              className={`antu-plabel k-${c.kind}`}
              style={{ left: c.labelAt.x, top: c.labelAt.y, width: c.labelSize.width, height: c.labelSize.height }}
            >
              {labelChunks(String(c.label)).map((chunk, i) => (
                <span key={i} className="antu-plabel-word">{chunk}</span>
              ))}
            </span>
          ))}
    </div>
  )
})

export default ConnectionLayerNode

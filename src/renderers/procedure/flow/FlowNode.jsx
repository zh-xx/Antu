// ============================================================
//  src/renderers/procedure/flow/FlowNode.jsx — one node of the flowchart
//
//  Two dimensions, never mixed (spec/procedure/schema-draft.md §4.3):
//    kind    fixes the **shape**: start / end pills, step box, decision diamond,
//            document with a wavy bottom, note with a folded corner
//    outcome fixes the **colour**: positive green, negative red, neutral grey
//
//  The size comes from metrics.js through layout.js (data.w / data.h); this file never
//  decides a size of its own. The outline is drawn in SVG because a diamond, a wavy bottom
//  and a folded corner cannot be made with CSS borders; the text sits on top in HTML so it
//  wraps and clamps like the rest of the interface.
//
//  Detail works like the fact card's: hover peeks, click pins, the overlay covers the canvas
//  rather than resizing anything, so no node ever moves.
// ============================================================

import { memo, useContext } from 'react'
import { PreviewContext } from '../../../shell/previewContext.js'
import { SOURCE_TYPE_KEYS, labelOf } from '../../../core/labels.js'
import { useLang } from '../../../shell/LangContext.jsx'
import { nodePaint } from './palette.js'

/** Inset of the outline from the node box, so a 1.5px stroke is not clipped at the edge */
const INSET = 1

/**
 * The outline of one shape, as SVG children. w / h are the node's design size.
 * Paint goes on as attributes (see palette.js for why not CSS).
 */
function Outline({ kind, outcome, w, h }) {
  const p = nodePaint(kind, outcome)
  const paint = { fill: p.fill, stroke: p.stroke, strokeWidth: 1.2 }
  const ring = { fill: 'none', stroke: p.stroke, strokeWidth: 1 }
  const x = INSET
  const y = INSET
  const W = w - INSET * 2
  const H = h - INSET * 2
  switch (kind) {
    case 'start':
      return <rect className="antu-pn-shape" {...paint} x={x} y={y} width={W} height={H} rx={H / 2} />
    case 'end':
      // Double border: the second ring is what tells an end from a start at a glance
      return (
        <>
          <rect className="antu-pn-shape" {...paint} x={x} y={y} width={W} height={H} rx={H / 2} />
          <rect className="antu-pn-ring" {...ring} x={x + 4} y={y + 4} width={W - 8} height={H - 8} rx={(H - 8) / 2} />
        </>
      )
    case 'decision':
      return (
        <polygon
          className="antu-pn-shape" {...paint}
          points={`${w / 2},${y} ${w - INSET},${h / 2} ${w / 2},${h - INSET} ${x},${h / 2}`}
        />
      )
    case 'document': {
      // A box whose bottom edge is one wave: down on the left half, up on the right
      const wave = 7
      const bottom = y + H - wave
      return (
        <path
          className="antu-pn-shape" {...paint}
          d={
            `M ${x} ${y + 6} Q ${x} ${y} ${x + 6} ${y} L ${x + W - 6} ${y} Q ${x + W} ${y} ${x + W} ${y + 6} ` +
            `L ${x + W} ${bottom} C ${x + W * 0.75} ${bottom - wave * 1.6} ${x + W * 0.5} ${bottom - wave * 0.2} ` +
            `${x + W * 0.5} ${bottom + wave * 0.4} S ${x + W * 0.2} ${bottom + wave * 1.8} ${x} ${bottom} Z`
          }
        />
      )
    }
    case 'note': {
      // No border, a folded top-right corner: explanation, not a step of the flow
      const f = 14
      return (
        <>
          <path
            className="antu-pn-shape" {...paint}
            d={`M ${x} ${y} L ${x + W - f} ${y} L ${x + W} ${y + f} L ${x + W} ${y + H} L ${x} ${y + H} Z`}
          />
          <path className="antu-pn-fold" fill="none" stroke={p.fold} strokeWidth={1} d={`M ${x + W - f} ${y} L ${x + W - f} ${y + f} L ${x + W} ${y + f}`} />
        </>
      )
    }
    default:
      return <rect className="antu-pn-shape" {...paint} x={x} y={y} width={W} height={H} rx={6} />
  }
}

const FlowNode = memo(function FlowNode({ id, data }) {
  const { node, w, h, isSpine, stageLabel, actorNames, sources, showDetail, vertical, layer } = data
  const { hoveredId, pinnedId, pin, unpin } = useContext(PreviewContext)
  const { t, lang } = useLang()

  const isPinned = pinnedId === id
  const showPreview = !pinnedId && hoveredId === id
  const open = isPinned || showPreview
  const kind = node.kind
  const outcome = node.outcome || 'neutral'
  const detail = showDetail && node.detail ? String(node.detail).split('\n')[0] : ''

  // The overlay pops towards where there is room, the same rule as the fact card: the first
  // layer has nothing before it along the flow, so it opens after; the rest open before and
  // leave what follows visible.
  const side = vertical ? (layer === 0 ? 'below' : 'above') : layer === 0 ? 'right' : 'left'

  return (
    <div
      className={`antu-pn k-${kind} o-${outcome}${isSpine ? ' is-spine' : ''}`}
      style={{ width: w, height: h }}
      role="button"
      tabIndex={0}
      aria-label={node.label}
      aria-expanded={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          if (isPinned) unpin()
          else pin(id)
        } else if (e.key === 'Escape') {
          unpin()
        }
      }}
    >
      <svg className="antu-pn-svg" width={w} height={h} aria-hidden="true">
        <Outline kind={kind} outcome={outcome} w={w} h={h} />
      </svg>

      <div className="antu-pn-body">
        <div className="antu-pn-label">{node.label}</div>
        {detail && <div className="antu-pn-detail">{detail}</div>}
      </div>

      {open && (
        <div
          className={['antu-preview', 'nowheel', 'nopan', side, isPinned ? 'pinned' : ''].filter(Boolean).join(' ')}
        >
          {isPinned && (
            <button
              className="antu-preview-close"
              title={t('common.close')}
              onClick={(e) => {
                e.stopPropagation()
                unpin()
              }}
            >
              ×
            </button>
          )}

          {isPinned && (
            <>
              {stageLabel && <div className="antu-preview-time">{stageLabel}</div>}
              <div className="antu-preview-title">{node.label}</div>
              {actorNames.length > 0 && (
                <div className="antu-preview-actors">
                  {actorNames.map((n) => (
                    <span key={n} className="antu-actor-tag">
                      {n}
                    </span>
                  ))}
                </div>
              )}
            </>
          )}

          {node.detail && <div className="antu-preview-text">{node.detail}</div>}

          {isPinned && sources.length > 0 && (
            <>
              <div className="antu-preview-sub">{t('card.sources', { n: sources.length })}</div>
              {sources.map((s) => (
                <div key={s.id} className="antu-source">
                  <div className="antu-source-name">
                    {s.name}
                    <span className="antu-source-type">{labelOf(SOURCE_TYPE_KEYS, s.type, lang)}</span>
                  </div>
                  {s.quote && <div className="antu-source-quote">{s.quote}</div>}
                </div>
              ))}
            </>
          )}

          {/* Provenance is never hidden behind "open it": hover already gives one line */}
          {!isPinned && (
            <div className={`antu-preview-src${sources.length ? '' : ' is-none'}`}>
              {sources.length
                ? t('card.sourcesList', { n: sources.length, names: sources.map((s) => s.name).join(' · ') })
                : t('card.sourcesUnlisted')}
            </div>
          )}

          {showPreview && <div className="antu-preview-hint">{t('flow.previewHint')}</div>}
        </div>
      )}
    </div>
  )
})

export default FlowNode

// ============================================================
//  src/renderers/relationship/graph/EntityNode.jsx — one party of the relationship graph
//
//  The kind fixes the shape and the colour of the outline (palette.js): a person a rounded box, a
//  company a square-cornered box in blue, an organisation a dashed outline, a government organ a
//  double border. The size comes from metrics.js through layout.js (data.w / data.h); this file
//  never decides a size of its own. The outline is SVG, the text sits on top in HTML so it wraps
//  and clamps like the rest of the interface.
//
//  Detail works like the flowchart node's: hover peeks, click pins, the overlay covers the canvas
//  rather than resizing anything, so no entity ever moves.
// ============================================================

import { memo, useContext } from 'react'
import { PreviewContext } from '../../../shell/previewContext.js'
import { SOURCE_TYPE_KEYS, labelOf } from '../../../core/labels.js'
import { useLang } from '../../../shell/LangContext.jsx'
import { entityPaint, entityRadius } from './palette.js'
import { useTheme } from '../../../theme/ThemeContext.jsx'

/** Inset of the outline from the box, so a 1.5px stroke is not clipped at the edge */
const INSET = 1

function Outline({ kind, w, h, theme, end = false }) {
  const p = entityPaint(kind, theme)
  const rx0 = entityRadius(kind, theme)
  // An end of a chain (the relation path) is a dark box in the theme's ink
  const paint = { fill: end ? theme.color.ink : p.fill, stroke: end ? theme.color.ink : p.stroke, strokeWidth: p.width }
  const dash = p.dash
  const x = INSET
  const y = INSET
  const W = w - INSET * 2
  const H = h - INSET * 2
  const rx = Math.min(rx0, H / 2)
  switch (kind) {
    case 'government':
      // A second ring, as an end pill has in the flowchart: it is what tells an organ of the state at a glance
      return (
        <>
          <rect className="antu-rn-shape" {...paint} strokeDasharray={dash} x={x} y={y} width={W} height={H} rx={rx} />
          <rect className="antu-rn-ring" fill="none" stroke={end ? theme.color.bg : p.stroke} strokeWidth={0.75} x={x + 4} y={y + 4} width={W - 8} height={H - 8} rx={Math.max(0, rx - 2)} />
        </>
      )
    default:
      return <rect className="antu-rn-shape" {...paint} strokeDasharray={dash} x={x} y={y} width={W} height={H} rx={rx} />
  }
}

const EntityNode = memo(function EntityNode({ id, data }) {
  const { entity, w, h, textW, lit = false, dim = false, groupLabel, sources, relations, vertical, layer, centre = false, end = false, camp = null, hintKey = 'rel.previewHint' } = data
  const { hoveredId, pinnedId, pin, unpin } = useContext(PreviewContext)
  const { t, lang } = useLang()
  const { theme } = useTheme()

  const isPinned = pinnedId === id
  const showPreview = !pinnedId && hoveredId === id
  const open = isPinned || showPreview

  // The overlay pops towards where there is room: the first layer has nothing before it, so it opens after
  const side = vertical ? (layer === 0 ? 'below' : 'above') : layer === 0 ? 'right' : 'left'

  return (
    <div
      className={`antu-rn k-${entity.kind}${lit ? ' is-lit' : ''}${dim ? ' is-dim' : ''}${centre ? ' is-centre' : ''}${end ? ' is-end' : ''}`}
      style={{ width: w, height: h }}
      role="button"
      tabIndex={0}
      aria-label={entity.label}
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
      {/* The focus view names a party's camp over its box, in the colour of its place */}
      {camp && (
        <span className={`antu-rn-camp t${camp.tone}`}>
          <i />
          {camp.label}
        </span>
      )}
      <svg className="antu-rn-svg" width={w} height={h} aria-hidden="true">
        <Outline kind={entity.kind} w={w} h={h} theme={theme} end={end} />
      </svg>

      {/* The text column is exactly as wide as metrics.js measured it, so the lines break where the box was sized for */}
      <div className="antu-rn-body" style={{ width: textW }}>
        <div className="antu-rn-label">{entity.label}</div>
        {entity.role && <div className="antu-rn-role">{entity.role}</div>}
      </div>

      {open && (
        <div className={['antu-preview', 'nowheel', 'nopan', side, isPinned ? 'pinned' : ''].filter(Boolean).join(' ')}>
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
              {groupLabel && <div className="antu-preview-time">{groupLabel}</div>}
              <div className="antu-preview-title">{entity.label}</div>
              {entity.role && <div className="antu-preview-sub">{entity.role}</div>}
            </>
          )}

          {entity.detail && <div className="antu-preview-text">{entity.detail}</div>}

          {/* What this party is related to: the point of the diagram, so it is in the overlay too */}
          {relations.length > 0 && (
            <div className="antu-rn-relations">
              {relations.map((r) => (
                <div key={r.id} className="antu-rn-relation">
                  <span className="antu-rn-relation-arrow">{r.directed ? (r.out ? '→' : '←') : '—'}</span>
                  <span className="antu-rn-relation-other">{r.other}</span>
                  <span className="antu-rn-relation-text">{r.text}</span>
                </div>
              ))}
            </div>
          )}

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

          {!isPinned && (
            <div className={`antu-preview-src${sources.length ? '' : ' is-none'}`}>
              {sources.length
                ? t('card.sourcesList', { n: sources.length, names: sources.map((s) => s.name).join(' · ') })
                : t('card.sourcesUnlisted')}
            </div>
          )}

          {showPreview && <div className="antu-preview-hint">{t(hintKey)}</div>}
        </div>
      )}
    </div>
  )
})

export default EntityNode

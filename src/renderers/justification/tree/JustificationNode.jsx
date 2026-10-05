// ============================================================
//  src/renderers/justification/tree/JustificationNode.jsx — one node of the justification tree
//
//  The kind fixes the shape and the colour of the outline (palette.js): a conclusion a heavy blue box,
//  a norm a square-cornered violet box, an element an amber pill, a fact a plain grey box, an
//  inference a green box, a judgement a rose box. No node has a bar or a stripe down its side. A line above the sentence names the kind, and carries
//  a fact's date and what the node holds. The size comes from metrics.js through layout.js (data.w /
//  data.h); this file never decides a size of its own. The outline is SVG, the text sits on top in HTML
//  so it wraps and clamps like the rest of the interface.
//
//  A rejected node (`holds: "no"`) is faded, dashed and struck through, so it reads in greyscale too. A
//  copy of a fact (the same fact drawn in another issue) says so in its top line.
//
//  Detail works like the other diagrams' nodes: hover peeks, click pins, the overlay covers the canvas
//  rather than resizing anything, so no node ever moves.
// ============================================================

import { memo, useContext } from 'react'
import { PreviewContext } from '../../../shell/previewContext.js'
import { SOURCE_TYPE_KEYS, labelOf } from '../../../core/labels.js'
import { useLang } from '../../../shell/LangContext.jsx'
import { nodePaint, REJECTED_OPACITY } from './palette.js'
import { useTheme } from '../../../theme/ThemeContext.jsx'

/** Inset of the outline from the box, so a stroke is not clipped at the edge */
const INSET = 1

function Outline({ kind, w, h, rejected, theme }) {
  const p = nodePaint(kind, theme)
  const paint = {
    fill: p.fill,
    stroke: p.stroke,
    strokeWidth: p.width,
    ...(rejected ? { strokeDasharray: '5 3' } : p.dash ? { strokeDasharray: p.dash } : {}),
  }
  const x = INSET
  const y = INSET
  const W = w - INSET * 2
  const H = h - INSET * 2
  switch (kind) {
    case 'conclusion':
      return <rect className="antu-jn-shape" {...paint} x={x} y={y} width={W} height={H} rx={9} />
    case 'norm':
      return <rect className="antu-jn-shape" {...paint} x={x} y={y} width={W} height={H} rx={3} />
    case 'element':
      return <rect className="antu-jn-shape" {...paint} x={x} y={y} width={W} height={H} rx={Math.min(16, H / 2)} />
    case 'inference':
      return <rect className="antu-jn-shape" {...paint} x={x} y={y} width={W} height={H} rx={8} />
    case 'judgement':
      return <rect className="antu-jn-shape" {...paint} x={x} y={y} width={W} height={H} rx={8} />
    default:
      return <rect className="antu-jn-shape" {...paint} x={x} y={y} width={W} height={H} rx={3} />
  }
}

/** The date of a fact, as the reader wants it: 2016-04-14 22:22 */
const showDate = (date) => date.replace('T', ' ')

const JustificationNode = memo(function JustificationNode({ id, data }) {
  const { node, w, h, textW, lit = false, dim = false, copyOf, copies, groupLabel, sources, grounds, supports, vertical, layer } = data
  const { hoveredId, pinnedId, pin, unpin } = useContext(PreviewContext)
  const { t, lang } = useLang()
  const { theme } = useTheme()

  const isPinned = pinnedId === id
  const showPreview = !pinnedId && hoveredId === id
  const open = isPinned || showPreview
  const rejected = node.holds === 'no'

  // The overlay pops towards where there is room: the first layer has nothing before it, so it opens after
  const side = vertical ? (layer === 0 ? 'below' : 'above') : layer === 0 ? 'right' : 'left'

  return (
    <div
      className={`antu-jn k-${node.kind}${lit ? ' is-lit' : ''}${dim ? ' is-dim' : ''}${rejected ? ' is-rejected' : ''}${copyOf ? ' is-copy' : ''}`}
      style={{ width: w, height: h, opacity: rejected && !dim ? REJECTED_OPACITY : undefined }}
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
      <svg className="antu-jn-svg" width={w} height={h} aria-hidden="true">
        <Outline kind={node.kind} w={w} h={h} rejected={rejected} theme={theme} />
      </svg>

      {/* The text column is exactly as wide as metrics.js measured it, so the lines break where the box was sized for */}
      <div className="antu-jn-body" style={{ width: textW }}>
        <div className="antu-jn-tag">
          <span className="antu-jn-kind">{t(`jus.kind.${node.kind}`)}</span>
          {node.date && <span className="antu-jn-date">{showDate(node.date)}</span>}
          {node.holds && <span className={`antu-jn-holds is-${node.holds}`}>{t(`jus.holds.${node.holds}`)}</span>}
          {node.combine && (
            <span className={`antu-jn-combine is-${node.combine}`} title={t(`jus.combine.${node.combine}Long`)}>
              {t(`jus.combine.${node.combine}`)}
            </span>
          )}
          {copyOf && <span className="antu-jn-copy">{t('jus.copy')}</span>}
        </div>
        <div className="antu-jn-label">{node.label}</div>
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
              <div className="antu-preview-sub">
                {t(`jus.kind.${node.kind}`)}
                {node.holds ? ` · ${t(`jus.holds.${node.holds}`)}` : ''}
                {node.date ? ` · ${showDate(node.date)}` : ''}
              </div>
              <div className="antu-preview-title">{node.label}</div>
            </>
          )}

          {node.detail && <div className="antu-preview-text">{node.detail}</div>}
          {copies > 1 && <div className="antu-preview-sub">{t('jus.copies', { n: copies })}</div>}

          {/* What this node rests on and what it leads to: the point of the diagram, so it is in the overlay too */}
          {grounds.length > 0 && (
            <div className="antu-jn-rows">
              <div className="antu-jn-rows-title">
                {t('jus.grounds')}
                {node.combine ? ` · ${t(`jus.combine.${node.combine}Long`)}` : ''}
              </div>
              {grounds.map((g) => (
                <div key={`${g.id}:${g.stance}`} className={`antu-jn-row is-${g.stance}`}>
                  <span className="antu-jn-row-stance">{t(`jus.stance.${g.stance}`)}</span>
                  <span className="antu-jn-row-text">{g.text}</span>
                </div>
              ))}
            </div>
          )}
          {supports.length > 0 && (
            <div className="antu-jn-rows">
              <div className="antu-jn-rows-title">{t('jus.supports')}</div>
              {supports.map((s) => (
                <div key={`${s.id}:${s.stance}`} className={`antu-jn-row is-${s.stance}`}>
                  <span className="antu-jn-row-stance">{t(`jus.stance.${s.stance}`)}</span>
                  <span className="antu-jn-row-text">{s.text}</span>
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

          {showPreview && <div className="antu-preview-hint">{t('jus.previewHint')}</div>}
        </div>
      )}
    </div>
  )
})

export default JustificationNode

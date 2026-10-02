// ============================================================
//  src/renderers/fact/EventPreview.jsx — the detail overlay beside an event card
//
//  Two levels, shared by every fact kind:
//    hover → the detail summary (3 lines) and one line of provenance
//    click → pinned: the full text, the duration, the time note and every source with its quote
//  It is drawn inside the card node and covers the canvas rather than resizing it.
// ============================================================

import { SOURCE_TYPE_KEYS, labelOf } from '../../core/labels.js'
import { useLang } from '../../shell/LangContext.jsx'
import { formatDuration, formatTimeText } from './dateText.js'

/**
 * @param placement which side of the card it pops out on: 'above' | 'below' | 'left' | 'right'
 *                  (the kind decides, from where its card sits)
 */
export default function EventPreview({ event, actorNames, sources, isPinned, showPreview, placement, onClose }) {
  const { t, lang } = useLang()
  // Leave the duration empty when it cannot be computed (dateEnd before date, etc.), so that the overlay never shows "Duration" with nothing after it
  const duration = event.date && event.dateEnd ? formatDuration(event.date, event.dateEnd, t) : ''
  return (
    <div
      className={[
        'antu-preview',
        // nowheel / nopan are React Flow's conventional class names: the canvas has
        // panOnScroll on, and without them the wheel is taken by the canvas for panning,
        // so long text in the overlay could never scroll.
        'nowheel',
        'nopan',
        placement,
        isPinned ? 'pinned' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {isPinned && (
        <button
          className="antu-preview-close"
          title={t('common.close')}
          onClick={(e) => {
            e.stopPropagation()
            onClose()
          }}
        >
          ×
        </button>
      )}

      {isPinned && (
        <>
          <div className="antu-preview-time">{formatTimeText(event, lang)}</div>
          {duration && <div className="antu-preview-duration">{t('card.duration', { duration })}</div>}
          <div className="antu-preview-title">{event.label}</div>
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

      {event.detail && <div className="antu-preview-text">{event.detail}</div>}

      {isPinned && event.dateNote && (
        <div className="antu-preview-note">{t('card.dateNote', { note: event.dateNote })}</div>
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

      {/* Hover already gives one line of provenance. What the diagram stands on is not to
          be hidden behind "open it": even the lightest action must show roughly what is there. */}
      {!isPinned && (
        <div className={`antu-preview-src${sources.length ? '' : ' is-none'}`}>
          {sources.length
            ? t('card.sourcesList', { n: sources.length, names: sources.map((s) => s.name).join(' · ') })
            : t('card.sourcesUnlisted')}
        </div>
      )}

      {showPreview && <div className="antu-preview-hint">{t('card.previewHint')}</div>}
    </div>
  )
}

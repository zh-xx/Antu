// ============================================================
//  src/renderers/fact/EventNode.jsx — the event card
//
//  Fixed size (320 × 112); the card carries only time, title, party tags and the source count.
//  The link from the card to its axis dot is not here: LinkLayerNode draws that whole layer
//  beneath the cards.
//
//  Detail sits right beside the card, in two levels:
//    hover → the overlay reveals the detail summary (3 lines, put away when the mouse leaves)
//    click → the same overlay pins, expanding the full text and all provenance, scrollable
//  The overlay covers rather than resizes the canvas, so a card never moves.
// ============================================================

import { memo, useContext } from 'react'
import { PreviewContext } from '../../shell/previewContext.js'
import { SOURCE_TYPE_KEYS, labelOf } from '../../core/labels.js'
import { useLang } from '../../shell/LangContext.jsx'
import { translate } from '../../core/i18n.js'

/**
 * Turn an ISO 8601 time into readable display text. Used inside this file only, not exported.
 *
 * Language is passed in as a parameter: this function lives outside the component, the "approx."
 * prefix has to follow the interface language, and it must not read global state here (the core
 * layer is not allowed to touch window either).
 */
function formatDate(date, approx, lang) {
  // The local is named time, not t: inside the component t is the translation function, and a name clash silently picks the wrong thing.
  const [d, time] = String(date).split('T')
  const prefix = approx ? translate(lang, 'card.approxPrefix') : ''
  if (!time) return prefix + d
  const parts = time.split(':')
  const hhmm = parts.slice(0, 2).join(':')
  return `${prefix}${d} ${hhmm}${parts[2] ? ':' + parts[2] : ''}`
}

/** Display text for the end instant: on the same day only the time is written, across days the full date */
function formatEnd(start, end, lang) {
  const full = formatDate(end, false, lang)
  const sameDay = String(start).split('T')[0] === String(end).split('T')[0]
  return sameDay && String(end).includes('T') ? full.split(' ').pop() : full
}

/**
 * The line of time on the card.
 * With a dateEnd (a lasting event) it is written "start - end", which sets it apart from an
 * instantaneous event at a glance. Note this expresses a span in text only, never as length on
 * the axis: slots are equally spaced and real time is not, so drawing length by real duration
 * would deceive (in the corridor-charging case 4 seconds and 264 seconds take the same distance).
 */
function formatTimeText(event, lang) {
  // An event with no date (the material gives none): say so, do not show a blank or a made-up one
  if (!event.date) return translate(lang, 'card.dateUnknown')
  const start = formatDate(event.date, event.approx, lang)
  if (!event.dateEnd) return start
  return `${start} - ${formatEnd(event.date, event.dateEnd, lang)}`
}

/** Human-readable duration, for the overlay (the card line has no room for it) */
function formatDuration(start, end, t) {
  const a = Date.parse(start)
  const b = Date.parse(end)
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return ''
  let s = Math.round((b - a) / 1000)
  const d = Math.floor(s / 86400)
  s -= d * 86400
  const h = Math.floor(s / 3600)
  s -= h * 3600
  const m = Math.floor(s / 60)
  s -= m * 60
  const parts = []
  if (d) parts.push(t('card.unitDay', { n: d }))
  if (h) parts.push(t('card.unitHour', { n: h }))
  if (m) parts.push(t('card.unitMinute', { n: m }))
  if (s || !parts.length) parts.push(t('card.unitSecond', { n: s }))
  return parts.join(' ')
}

const EventNode = memo(function EventNode({ data }) {
  const { event, actorNames, sources, groupIndex, row, cardW, cardH, labelLines, fields = {}, isH } = data
  const { hoveredId, pinnedId, pin, unpin } = useContext(PreviewContext)
  const { t, lang } = useLang()

  const isPinned = pinnedId === event.id
  // Once one card is pinned no other card pops a preview, so that two overlays do not fight
  const showPreview = !pinnedId && hoveredId === event.id
  const open = isPinned || showPreview
  // Leave the duration empty when it cannot be computed (dateEnd before date, etc.), so that the overlay never shows "Duration" with nothing after it
  const duration = event.date && event.dateEnd ? formatDuration(event.date, event.dateEnd, t) : ''

  return (
    <div
      className={`antu-card g${groupIndex}`}
      style={{ width: cardW, height: cardH }}
      // Keyboard reachable: Tab focuses, Enter/Space pins, Esc closes.
      // The mouse path still goes through React Flow's onNodeClick; both work.
      role="button"
      tabIndex={0}
      aria-label={t('card.ariaLabel', { label: event.label, date: event.date || '' })}
      aria-expanded={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          if (isPinned) unpin()
          else pin(event.id)
        } else if (e.key === 'Escape') {
          unpin()
        }
      }}
    >
      {/* Card content follows the switches. Title and time cannot be switched off:
          without a title you cannot tell what happened, without time there is no anchor on
          the axis. The title clamps to the lines the card actually reserves, no more, no earlier. */}
      <div
        className="antu-card-label"
        style={{ WebkitLineClamp: labelLines, lineClamp: labelLines }}
      >
        {event.label}
      </div>

      {fields.summary && event.summary && (
        <div className="antu-card-snippet">{event.summary}</div>
      )}

      {fields.actors && actorNames.length > 0 && (
        <div className="antu-card-actors">
          {actorNames.map((n) => (
            <span key={n} className="antu-actor-tag">
              {n}
            </span>
          ))}
        </div>
      )}

      <div className="antu-card-foot">
        <span className={`antu-card-time${event.date ? '' : ' is-unknown'}`} title={event.dateNote || ''}>
          {formatTimeText(event, lang)}
        </span>
        {fields.sources && (
          <span className={`antu-card-src${sources.length ? '' : ' is-none'}`}>
            <i className="antu-src-dot" />
            {sources.length ? t('card.sources', { n: sources.length }) : t('card.sourcesUnlisted')}
          </span>
        )}
      </div>

      {open && (
        <div
          className={[
            'antu-preview',
            // nowheel / nopan are React Flow's conventional class names: the canvas has
            // panOnScroll on, and without them the wheel is taken by the canvas for panning,
            // so long text in the overlay could never scroll.
            'nowheel',
            'nopan',
            // The first time point has no room towards the negative direction of the time axis
            // (upwards when vertical, leftwards when horizontal), so it pops the other way;
            // the rest pop towards the negative direction, so they do not cover later events
            isH ? (row === 0 ? 'right' : 'left') : row === 0 ? 'below' : 'above',
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
                unpin()
              }}
            >
              ×
            </button>
          )}

          {isPinned && (
            <>
              <div className="antu-preview-time">{formatTimeText(event, lang)}</div>
              {isPinned && duration && (
                <div className="antu-preview-duration">{t('card.duration', { duration })}</div>
              )}
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
              <div className="antu-preview-sub">
                {t('card.sources', { n: sources.length })}
              </div>
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
      )}
    </div>
  )
})

export default EventNode

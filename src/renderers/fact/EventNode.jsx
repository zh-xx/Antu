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
//  The overlay covers rather than resizes the canvas, so a card never moves. It is EventPreview.jsx,
//  shared with the chronicle.
// ============================================================

import { memo, useContext } from 'react'
import { PreviewContext } from '../../shell/previewContext.js'
import { useLang } from '../../shell/LangContext.jsx'
import { formatTimeText } from './dateText.js'
import EventPreview from './EventPreview.jsx'

const EventNode = memo(function EventNode({ data }) {
  const { event, actorNames, sources, groupIndex, row, cardW, cardH, labelLines, fields = {}, isH, joint = false } = data
  const { hoveredId, pinnedId, pin, unpin } = useContext(PreviewContext)
  const { t, lang } = useLang()

  const isPinned = pinnedId === event.id
  // Once one card is pinned no other card pops a preview, so that two overlays do not fight
  const showPreview = !pinnedId && hoveredId === event.id
  const open = isPinned || showPreview

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
        {/* An act of several parties on the axis: who, beside the time, cut short when long (issue 172).
            With the parties switch on they are on their own row already. */}
        {joint && !fields.actors && (
          <span className="antu-card-who" title={actorNames.join(t('card.whoSep'))}>
            {actorNames.join(t('card.whoSep'))}
          </span>
        )}
        {fields.sources && (
          <span className={`antu-card-src${sources.length ? '' : ' is-none'}`}>
            <i className="antu-src-dot" />
            {sources.length ? t('card.sources', { n: sources.length }) : t('card.sourcesUnlisted')}
          </span>
        )}
      </div>

      {open && (
        <EventPreview
          event={event}
          actorNames={actorNames}
          sources={sources}
          isPinned={isPinned}
          showPreview={showPreview}
          // The first time point has no room towards the negative direction of the time axis
          // (upwards when vertical, leftwards when horizontal), so it pops the other way;
          // the rest pop towards the negative direction, so they do not cover later events
          placement={isH ? (row === 0 ? 'right' : 'left') : row === 0 ? 'below' : 'above'}
          onClose={unpin}
        />
      )}
    </div>
  )
})

export default EventNode

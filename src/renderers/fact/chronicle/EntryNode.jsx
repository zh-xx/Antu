// ============================================================
//  src/renderers/fact/chronicle/EntryNode.jsx — one row of the chronicle
//
//  The time column on the left and the card on the right, in one node so they cannot drift
//  apart. The dot between them belongs to the spine layer (SpineNode.jsx).
//
//  The card is as tall as the layout computed from its text (chronicle/layout.js), and nothing
//  in it is clamped: a chronicle is read, so the whole title and summary are shown. No coloured
//  bar on the card's edge: the group colour is on the spine dot and on the group tag only.
// ============================================================

import { memo, useContext } from 'react'
import { PreviewContext } from '../../../shell/previewContext.js'
import { useLang } from '../../../shell/LangContext.jsx'
import { whenLines } from '../dateText.js'
import { CARD_W, CARD_X, WHEN_W } from './layout.js'
import EventPreview from '../EventPreview.jsx'

const EntryNode = memo(function EntryNode({ data }) {
  const { event, groupIndex, groupLabel, actorNames, sources, fields, cardH, sameDay } = data
  const { hoveredId, pinnedId, pin, unpin } = useContext(PreviewContext)
  const { t, lang } = useLang()

  const isPinned = pinnedId === event.id
  const showPreview = !pinnedId && hoveredId === event.id
  const open = isPinned || showPreview

  return (
    <div className="antu-chr-entry" style={{ height: cardH }}>
      <div className={`antu-chr-when${event.date ? '' : ' is-unknown'}`} style={{ width: WHEN_W }} title={event.dateNote || ''}>
        {whenLines(event, lang, sameDay).map((l, i) => (
          <div key={i} className={l.strong ? 'is-date' : ''}>
            {l.text}
          </div>
        ))}
      </div>
      <div
        className="antu-chr-card"
        style={{ left: CARD_X, width: CARD_W, height: cardH }}
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
        <div className="antu-chr-title">{event.label}</div>
        {fields.summary && event.summary && <div className="antu-chr-summary">{event.summary}</div>}
        {(groupLabel || (fields.actors && actorNames.length > 0) || fields.sources) && (
          <div className="antu-chr-tags">
            {groupLabel && (
              <span className={`antu-chr-group g${groupIndex}`}>
                <i />
                {groupLabel}
              </span>
            )}
            {fields.actors &&
              actorNames.map((n) => (
                <span key={n} className="antu-actor-tag">
                  {n}
                </span>
              ))}
            {fields.sources && (
              <span className={`antu-card-src${sources.length ? '' : ' is-none'}`}>
                <i className="antu-src-dot" />
                {sources.length ? t('card.sources', { n: sources.length }) : t('card.sourcesUnlisted')}
              </span>
            )}
          </div>
        )}

        {open && (
          <EventPreview
            event={event}
            actorNames={actorNames}
            sources={sources}
            isPinned={isPinned}
            showPreview={showPreview}
            placement="right"
            onClose={unpin}
          />
        )}
      </div>
    </div>
  )
})

export default EntryNode

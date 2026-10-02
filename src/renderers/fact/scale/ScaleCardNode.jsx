// ============================================================
//  src/renderers/fact/scale/ScaleCardNode.jsx — one event's card on the time scale
//
//  Neutral (white, grey border, no coloured edge): the title in at most two lines, the time
//  below. Its height comes from the layout, which measured the title, so the text stays inside.
//  An undated event's card is dashed and says it was placed by order.
// ============================================================

import { memo, useContext } from 'react'
import { PreviewContext } from '../../../shell/previewContext.js'
import { useLang } from '../../../shell/LangContext.jsx'
import { formatTimeText } from '../dateText.js'
import EventPreview from '../EventPreview.jsx'

const ScaleCardNode = memo(function ScaleCardNode({ data }) {
  const { event, undated, titleLines, cardH, actorNames = [], sources = [] } = data
  const { hoveredId, pinnedId, pin, unpin } = useContext(PreviewContext)
  const { t, lang } = useLang()
  const isPinned = pinnedId === event.id
  const showPreview = !pinnedId && hoveredId === event.id
  const open = isPinned || showPreview
  return (
    <div
      className={`antu-sc-card${undated ? ' is-undated' : ''}`}
      style={{ height: cardH }}
      role="button"
      tabIndex={0}
      aria-label={t('card.ariaLabel', { label: event.label, date: event.date || '' })}
      aria-expanded={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          if (isPinned) unpin()
          else pin(event.id)
        } else if (e.key === 'Escape') unpin()
      }}
    >
      <div className="antu-sc-title" style={{ WebkitLineClamp: titleLines, lineClamp: titleLines }}>
        {event.label}
      </div>
      <div className="antu-sc-time">{undated ? t('scale.undated') : formatTimeText(event, lang)}</div>
      {open && (
        <EventPreview event={event} actorNames={actorNames} sources={sources} isPinned={isPinned} showPreview={showPreview} placement="below" onClose={unpin} />
      )}
    </div>
  )
})

export default ScaleCardNode

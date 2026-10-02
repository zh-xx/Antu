// ============================================================
//  src/renderers/fact/scale/ScaleRunNode.jsx — a gathered run of events that lie too close
//
//  "③ 4 events · 21:53–22:26". Clicking lists them; every one is also written out under the
//  diagram (ScaleRunListNode.jsx), so an exported picture hides nothing.
// ============================================================

import { memo, useContext } from 'react'
import { PreviewContext } from '../../../shell/previewContext.js'
import { useLang } from '../../../shell/LangContext.jsx'
import { formatTimeText } from '../dateText.js'
import { runMark } from './ScaleLayerNode.jsx'
import { runRange } from './runText.js'

const ScaleRunNode = memo(function ScaleRunNode({ id, data }) {
  const { run, events, cardH } = data
  const { pinnedId, unpin } = useContext(PreviewContext)
  const { t, lang } = useLang()
  const isPinned = pinnedId === id
  return (
    <div className="antu-sc-card antu-sc-run" style={{ height: cardH }} role="button" tabIndex={0} aria-expanded={isPinned}>
      <div className="antu-sc-title" style={{ WebkitLineClamp: 1, lineClamp: 1 }}>
        {runMark(run)} {t('scale.run', { n: events.length })}
      </div>
      <div className="antu-sc-time">{runRange(events, lang)}</div>
      {isPinned && (
        <div className="antu-preview pinned below nowheel nopan">
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
          <div className="antu-preview-title">
            {runMark(run)} {t('scale.run', { n: events.length })}
          </div>
          {events.map((e) => (
            <div key={e.id} className="antu-sc-run-row">
              <span className="antu-sc-run-time">{formatTimeText(e, lang)}</span>
              <span>{e.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
})

export default ScaleRunNode

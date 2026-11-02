// @ts-check
// ============================================================
//  src/renderers/fact/scale/ScaleRunListNode.jsx — every gathered event, written out under the diagram
//
//  A gathered run shows only a count on screen; on paper it could not be opened. So the full
//  list is part of the diagram, and the exported picture carries it.
// ============================================================

import { memo } from 'react'
import { useLang } from '../../../shell/LangContext.jsx'
import { formatTimeText } from '../dateText.js'
import { runMark } from './ScaleLayerNode.jsx'

/**
 * @typedef {{
 *   id: string,
 *   label: string,
 *   date?: string,
 *   dateEnd?: string,
 *   dateNote?: string,
 *   approx?: boolean,
 *   summary?: string,
 *   detail?: string,
 * }} FactEvent
 * @typedef {{ run: number, events: FactEvent[] }} ScaleRun
 * @typedef {{ runs: ScaleRun[], width: number, lh: number }} ScaleRunListNodeData
 * @type {(props: { id?: string, data: ScaleRunListNodeData }) => import('react').ReactNode}
 */
const ScaleRunListNode = memo(function ScaleRunListNode({ data }) {
  const { t, lang } = useLang()
  return (
    <div
      className="antu-sc-list"
      style={/** @type {import('react').CSSProperties & Record<string, string | number>} */ ({
        width: data.width,
        '--antu-sc-list-lh': `${data.lh}px`,
      })}
    >
      {data.runs.map((r) => (
        <div key={r.run}>
          <div className="antu-sc-list-head">
            {runMark(r.run)} {t('scale.runListed', { n: r.events.length })}
          </div>
          {r.events.map((e) => (
            <div key={e.id} className="antu-sc-list-row">
              <span className="antu-sc-run-time">{formatTimeText(e, lang)}</span>
              <span>{e.label}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
})

export default ScaleRunListNode

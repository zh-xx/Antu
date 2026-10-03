// ============================================================
//  src/renderers/relationship/path/PathRenderer.jsx — the relation path (issue #93)
//
//  How two parties are tied: the shortest chains from A to B, left to right. The two ends are chosen in
//  two boxes in the dock (remembered per diagram); until then it opens with the two parties furthest
//  apart. The layout (path/layout.js) is pure; the page is the shared levelled view. It reads left to
//  right and is wide, so it opens fitted to the whole picture, not to its width.
// ============================================================

import { useState } from 'react'

import { readPrefs, writePrefs } from '../../../shell/prefs.js'
import { useLang } from '../../../shell/LangContext.jsx'
import LevelledView from '../LevelledView.jsx'
import { buildPathGraph } from './layout.js'

/** External preset (antu_preview, the skill's preview): `from` and `to` name the two ends */
const PRESET = typeof window !== 'undefined' ? window.__ANTU_PRESET__ ?? null : null

export default function RelationshipPath({ spec }) {
  const specKey = `rel:${spec?.title || ''}`
  const { t } = useLang()
  const [ends, setEnds] = useState(() => readPrefs().relationshipPaths?.[specKey] || {})
  const asked = { from: PRESET?.from ?? ends.from, to: PRESET?.to ?? ends.to }
  const setEnd = (patch) => {
    const next = { ...ends, ...patch }
    setEnds(next)
    writePrefs({ relationshipPaths: { ...(readPrefs().relationshipPaths || {}), [specKey]: next } })
  }
  const pick = (layoutValue, key) => (
    <select className="antu-dock-chip antu-pt-end" value={layoutValue} onChange={(e) => setEnd({ [key]: e.target.value })} title={t(`rel.path.${key}`)} aria-label={t(`rel.path.${key}`)}>
      {spec.entities.map((e) => (
        <option key={e.id} value={e.id}>
          {e.label}
        </option>
      ))}
    </select>
  )
  return (
    <LevelledView
      spec={spec}
      build={buildPathGraph}
      className="antu-pt"
      options={asked}
      fitWidth={false}
      dockExtra={(layout) => (
        <>
          {pick(layout.from, 'from')}
          <button className="antu-dock-chip" onClick={() => setEnd({ from: layout.to, to: layout.from })} title={t('rel.path.swap')} aria-label={t('rel.path.swap')}>
            ⇄
          </button>
          {pick(layout.to, 'to')}
        </>
      )}
    />
  )
}

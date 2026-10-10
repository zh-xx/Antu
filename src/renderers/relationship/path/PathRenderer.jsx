// ============================================================
//  src/renderers/relationship/path/PathRenderer.jsx — the relation path (issue #93)
//
//  How two parties are tied: the shortest chains from A to B, left to right. The two ends are chosen in
//  two boxes in the dock (remembered per diagram); until then it opens with the two parties furthest
//  apart. The layout (path/layout.js) is pure; the page is the shared levelled view. It reads left to
//  right and is wide, so it opens fitted to the whole picture, not to its width.
// ============================================================

import { useState } from 'react'

import { usePreset, usePrefs } from '../../../shell/env.js'
import { useLang } from '../../../shell/LangContext.jsx'
import LevelledView from '../LevelledView.jsx'
import { buildPathGraph } from './layout.js'

/** The path opens no larger than this (the review of PR 171: it filled the whole screen with no room to breathe) */
const OPEN_MAX_ZOOM = 1

export default function RelationshipPath({ spec }) {
  // External preset (antu_preview, the skill's preview): `from` and `to` name the two ends
  // (read through usePreset, shell/env.js: the viewer page's window.__ANTU_PRESET__, none when mounted)
  const PRESET = usePreset()
  const prefs = usePrefs()
  const specKey = `rel:${spec?.title || ''}`
  const { t } = useLang()
  const [ends, setEnds] = useState(() => prefs.read().relationshipPaths?.[specKey] || {})
  const asked = { from: PRESET?.from ?? ends.from, to: PRESET?.to ?? ends.to }
  const setEnd = (patch) => {
    const next = { ...ends, ...patch }
    setEnds(next)
    prefs.write({ relationshipPaths: { ...(prefs.read().relationshipPaths || {}), [specKey]: next } })
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
      fitMaxZoom={OPEN_MAX_ZOOM}
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

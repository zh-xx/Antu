// ============================================================
//  src/renderers/relationship/path/PathRenderer.jsx — the relation path (issue #93)
//
//  How two parties are tied: the shortest chains from A to B, left to right. The two ends are chosen in
//  two boxes in the dock (remembered per diagram); until then it opens with the two parties furthest
//  apart. The layout (path/layout.js) is pure; the page is the shared levelled view. It reads left to
//  right and is wide, so it opens fitted to the whole picture, not to its width.
// ============================================================

import { usePreset } from '../../../shell/env.js'
import { useLang } from '../../../shell/LangContext.jsx'
import LevelledView from '../LevelledView.jsx'
import { buildPathGraph } from './layout.js'
import { useSpecPref } from '../useSpecPref.js'

/** The path opens no larger than this (the review of PR 171: it filled the whole screen with no room to breathe) */
const OPEN_MAX_ZOOM = 1

export default function RelationshipPath({ spec }) {
  // External preset (antu_preview, the skill's preview): `from` and `to` name the two ends
  // (read through usePreset, shell/env.js: the viewer page's window.__ANTU_PRESET__, none when mounted)
  const PRESET = usePreset()
  const specKey = `rel:${spec?.title || ''}`
  const { t } = useLang()
  // The two ends, remembered per diagram; a preview's preset gives the first values
  const [stored, setStored] = useSpecPref('relationshipPaths', specKey, (was) => (PRESET?.from || PRESET?.to ? { ...was, ...(PRESET.from ? { from: PRESET.from } : {}), ...(PRESET.to ? { to: PRESET.to } : {}) } : was))
  const ends = stored || {}
  const asked = { from: ends.from, to: ends.to }
  const setEnd = (patch) => setStored({ ...ends, ...patch })
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

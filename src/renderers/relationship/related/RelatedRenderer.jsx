// ============================================================
//  src/renderers/relationship/related/RelatedRenderer.jsx — the related-party list (issue #93)
//
//  One party and everyone tied to it, as a table. The centre is chosen in a box in the dock (the same
//  choice as the focus view's, remembered per diagram).
//  The layout (related/layout.js) is pure; the page is the shared levelled view.
// ============================================================

import { usePreset } from '../../../shell/env.js'
import { useLang } from '../../../shell/LangContext.jsx'
import LevelledView from '../LevelledView.jsx'
import { buildRelatedGraph } from './layout.js'
import { useSpecPref } from '../useSpecPref.js'

export default function RelationshipRelated({ spec }) {
  // External preset (antu_preview, the skill's preview): `centre` names the party
  // (read through usePreset, shell/env.js: the viewer page's window.__ANTU_PRESET__, none when mounted)
  const PRESET = usePreset()
  const specKey = `rel:${spec?.title || ''}`
  const { t } = useLang()
  // The centre is shared with the focus view: picking one party there picks it here
  const [chosen, setChosen] = useSpecPref('relationshipCentres', specKey, (was) => PRESET?.centre ?? was)
  const setCentre = (id) => setChosen(id === '' ? null : id)
  return (
    <LevelledView
      spec={spec}
      build={buildRelatedGraph}
      className="antu-rl"
      options={{ centre: chosen }}
      dockExtra={(layout) => (
        <>
          <select className="antu-dock-chip antu-rl-centre" value={layout.centre} onChange={(e) => setCentre(e.target.value === layout.defaultCentre ? '' : e.target.value)} title={t('rel.related.centre')} aria-label={t('rel.related.centre')}>
            {spec.entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </select>
        </>
      )}
    />
  )
}

// ============================================================
//  src/renderers/relationship/CompanyView.jsx — the equity tree and the authority chart, with a company to pick
//
//  Both draw one party's picture (relationship/scope.js): the party, everyone above it and everyone below
//  it. The reader picks the party in a box in the dock (shown when the data holds several separate
//  structures; with one there is nothing to choose between); "All" draws the whole tree. The choice is
//  remembered per diagram and per kind. Until the reader chooses, a case with several separate structures
//  opens on the busiest party and one with a single structure on all of it.
// ============================================================

import { usePreset } from '../../shell/env.js'
import { useLang } from '../../shell/LangContext.jsx'
import LevelledView from './LevelledView.jsx'
import { useSpecPref } from './useSpecPref.js'
import { specKeyOf } from '../../shell/prefs.js'

export default function CompanyView({ spec, build, className, kind }) {
  const PRESET = usePreset()
  const { t } = useLang()
  // The content key plus the way of drawing it: the company picked in one kind does not move the other
  const key = `${specKeyOf(spec)}:${kind}`
  const [asked, pick] = useSpecPref('relationshipCompanies', key, (was) => PRESET?.company ?? was)
  return (
    <LevelledView
      spec={spec}
      build={build}
      className={className}
      options={{ company: asked }}
      dockExtra={(layout) =>
        layout.several && (
          <select className="antu-dock-chip antu-co-pick" value={layout.company ?? '*'} onChange={(e) => pick(e.target.value)} title={t('rel.company.label')} aria-label={t('rel.company.label')}>
            <option value="*">{t('rel.company.all')}</option>
            {layout.companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        )
      }
    />
  )
}

// ============================================================
//  src/renderers/relationship/graph/RelationshipDock.jsx — the relationship graph's control capsule
//
//  The controls are the ones listed in spec/relationship/schema-draft.md §6.2, in the same four
//  shapes as every other dock (spec/fact/rendering.md §4.2, no new shapes invented):
//    one chip per kind of relation the data uses      independent switches → chips
//    relation labels / group boxes                    independent switches → chips
//    orientation, link style (straight / curved)      two exclusive options → segmented
//    language, export image                           shared with every dock (shell/DockParts.jsx)
//  A chip is on when that kind is drawn. The kind chips are the relationship diagram's answer to
//  the fact diagram's views: the same data, one family of relations at a time. The group switch
//  only appears when the data has groups: a switch that can change nothing is noise.
// ============================================================

import { useLang } from '../../../shell/LangContext.jsx'
import { DockExportButton, DockLangSwitch, DockSegmented } from '../../../shell/DockParts.jsx'
import { RELATION_KINDS } from './rules.js'

const ORIENTATIONS = [
  ['vertical', 'dock.vertical'],
  ['horizontal', 'dock.horizontal'],
]

const LINK_STYLES = [
  ['curved', 'flow.linkCurved'],
  ['straight', 'flow.linkStraight'],
]

export default function RelationshipDock({
  kinds = {},
  hiddenKinds = [],
  onToggleKind,
  showLabels = true,
  onToggleLabels,
  hasGroups = false,
  showGroups = true,
  onToggleGroups,
  orientation = 'vertical',
  onToggleOrientation,
  linkStyle = 'curved',
  onToggleLinkStyle,
  exporting = false,
  onExport,
}) {
  const { t } = useLang()
  // Only the kinds the data uses, in the order the enum lists them
  const used = RELATION_KINDS.filter((k) => kinds[k] > 0)

  return (
    <div className="antu-dock">
      <div className="antu-dock-bar">
        {used.length > 1 &&
          used.map((k) => (
            <button
              key={k}
              className={`antu-dock-chip antu-rkind k-${k}${hiddenKinds.includes(k) ? '' : ' is-on'}`}
              onClick={() => onToggleKind(k)}
              title={t('rel.kindChipTitle', { n: kinds[k] })}
            >
              {t(`rel.kind.${k}`)}
            </button>
          ))}
        {used.length > 1 && <span className="antu-dock-sep" />}

        <button className={`antu-dock-chip${showLabels ? ' is-on' : ''}`} onClick={() => onToggleLabels(!showLabels)}>
          {t('rel.labels')}
        </button>
        {hasGroups && (
          <button className={`antu-dock-chip${showGroups ? ' is-on' : ''}`} onClick={() => onToggleGroups(!showGroups)}>
            {t('rel.groups')}
          </button>
        )}

        <span className="antu-dock-sep" />

        {/* The buttons say which way the levels run; with the camps boxed the camps stand across that way, which is why the
            picture can look the other way round (the review of PR 171): the tooltip says so */}
        <DockSegmented options={ORIENTATIONS} value={orientation} onChange={onToggleOrientation} title={t(hasGroups && showGroups ? 'dock.orientationCamps' : 'dock.orientation')} />

        <DockSegmented options={LINK_STYLES} value={linkStyle} onChange={onToggleLinkStyle} title={t('flow.linkStyle')} />

        <span className="antu-dock-sep" />

        <DockLangSwitch />

        <span className="antu-dock-sep" />

        <DockExportButton exporting={exporting} onExport={onExport} />
      </div>
    </div>
  )
}

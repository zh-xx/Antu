// ============================================================
//  src/renderers/justification/tree/JustificationDock.jsx — the justification tree's control capsule
//
//  The controls are the ones listed in spec/justification/schema-draft.md §6.2, in the same shapes as
//  every other dock (spec/fact/rendering.md §4.2, no new shapes invented):
//    link labels                                    an independent switch → a chip (only when a link has one)
//    orientation, link style (straight / curved)    two exclusive options → segmented
//    language, export image                         shared with every dock (shell/DockParts.jsx)
//  There is no chip per kind of node: the reader does not filter a reasoning by kind, they follow a chain
//  (pointing at a node lights it), and a switch that can change nothing is noise.
// ============================================================

import { useLang } from '../../../shell/LangContext.jsx'
import { DockExportButton, DockLangSwitch, DockSegmented } from '../../../shell/DockParts.jsx'

// A reasoning reads from the conclusion on the left to the facts on the right, so horizontal comes first
const ORIENTATIONS = [
  ['horizontal', 'dock.horizontal'],
  ['vertical', 'dock.vertical'],
]

const LINK_STYLES = [
  ['curved', 'flow.linkCurved'],
  ['straight', 'flow.linkStraight'],
]

export default function JustificationDock({
  hasLabels = false,
  showLabels = true,
  onToggleLabels,
  orientation = 'horizontal',
  onToggleOrientation,
  linkStyle = 'curved',
  onToggleLinkStyle,
  exporting = false,
  onExport,
}) {
  const { t } = useLang()
  return (
    <div className="antu-dock">
      <div className="antu-dock-bar">
        {hasLabels && (
          <>
            <button className={`antu-dock-chip${showLabels ? ' is-on' : ''}`} onClick={() => onToggleLabels(!showLabels)}>
              {t('rel.labels')}
            </button>
            <span className="antu-dock-sep" />
          </>
        )}

        <DockSegmented options={ORIENTATIONS} value={orientation} onChange={onToggleOrientation} />

        <DockSegmented options={LINK_STYLES} value={linkStyle} onChange={onToggleLinkStyle} title={t('flow.linkStyle')} />

        <span className="antu-dock-sep" />

        <DockLangSwitch />

        <span className="antu-dock-sep" />

        <DockExportButton exporting={exporting} onExport={onExport} />
      </div>
    </div>
  )
}

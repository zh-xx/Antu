// ============================================================
//  src/renderers/relationship/focus/FocusDock.jsx — the focus view's control capsule
//
//  The graph's dock without what does not apply (no orientation, no link style, no group boxes), plus
//  the controls this kind adds: a box to pick the centre from the list of parties (clicking a party does
//  the same), and back to the default centre, shown only when another party was
//  picked (a switch that can change nothing is noise). Kind chips and labels are shared with the
//  graph and remembered together with it.
// ============================================================

import { useLang } from '../../../shell/LangContext.jsx'
import { DockExportButton, DockLangSwitch } from '../../../shell/DockParts.jsx'
import { RELATION_KINDS } from '../graph/rules.js'

export default function FocusDock({ kinds = {}, hiddenKinds = [], onToggleKind, showLabels = true, onToggleLabels, parties = [], centre = null, onPickCentre, isDefaultCentre = true, onResetCentre, exporting = false, onExport, extra = null }) {
  const { t } = useLang()
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
        {extra}
        {parties.length > 1 && onPickCentre && (
          <select className="antu-dock-chip antu-pt-end" value={centre ?? ''} onChange={(e) => onPickCentre(e.target.value)} title={t('rel.focus.centre')} aria-label={t('rel.focus.centre')}>
            {parties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        )}
        {!isDefaultCentre && (
          <button className="antu-dock-chip antu-rf-reset" onClick={onResetCentre} title={t('rel.focus.resetTitle')}>
            {t('rel.focus.reset')}
          </button>
        )}

        <span className="antu-dock-sep" />

        <DockLangSwitch />

        <span className="antu-dock-sep" />

        <DockExportButton exporting={exporting} onExport={onExport} />
      </div>
    </div>
  )
}

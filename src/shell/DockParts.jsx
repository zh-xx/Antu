// ============================================================
//  src/shell/DockParts.jsx — the dock controls every rendering kind shares
//
//  Each rendering kind has its own control dock, because what can be switched is its own
//  business (the timeline has views and card fields, the flowchart has condition labels and
//  stage bands). Two controls are the same everywhere, though, and live here once:
//    the language switch  interface text only, never data
//    the export action    the one action in the dock, set apart from the states
//  Their markup and class names are what the verifier measures (spec/fact/rendering.md §4.2),
//  so a second copy in another dock would be a second thing to keep in step.
// ============================================================

import { useLang } from './LangContext.jsx'

/** Language switch. Each language name is written in its own language, so you recognise your entry even in the wrong language. */
const LANGS = [
  ['en', 'dock.langEn'],
  ['zh', 'dock.langZh'],
]

/** A segmented control: few mutually exclusive options, all out in the open, the selected one raised */
export function DockSegmented({ options, value, onChange, title }) {
  const { t } = useLang()
  return (
    <div className="antu-dock-seg" title={title}>
      {options.map(([v, key]) => (
        <button
          key={v}
          className={`antu-dock-seg-item${value === v ? ' is-on' : ''}`}
          onClick={() => onChange(v)}
        >
          {t(key)}
        </button>
      ))}
    </div>
  )
}

/** Language affects interface text only: switching reloads no data and changes no geometry */
export function DockLangSwitch() {
  const { t, lang, setLang } = useLang()
  return <DockSegmented options={LANGS} value={lang} onChange={setLang} title={t('dock.lang')} />
}

/** The export action: the only solid block in the dock, with a download symbol */
export function DockExportButton({ exporting = false, onExport }) {
  const { t } = useLang()
  return (
    <button className="antu-dock-action" onClick={onExport} disabled={exporting} title={t('dock.exportTitle')}>
      {/* The conventional download mark (an arrow down onto a line). This cell is an action
          while the others are states, and giving an action a symbol is standard toolbar
          practice: four words alone on a dark background read more like a label than
          something pressable.
          `fill="none"`: these strokes are drawn as outlines, and leaving the fill on
          smears them into a solid block.
          Size 13 rather than 12: a symbol beside small text must be slightly larger to
          not look small. */}
      <svg className="antu-dock-action-icon" viewBox="0 0 16 16" width="13" height="13" fill="none" aria-hidden="true">
        <path
          d="M8 1.8v7.4M4.8 6.2 8 9.4l3.2-3.2M2.4 12.6h11.2"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {exporting ? t('dock.exporting') : t('dock.exportImage')}
    </button>
  )
}

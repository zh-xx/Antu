// ============================================================
//  src/shell/DockParts.jsx — the dock controls every rendering kind shares
//
//  Each rendering kind has its own control dock, because what can be switched is its own
//  business (the timeline has views and card fields, the flowchart has condition labels and
//  stage bands). Three controls are the same everywhere, though, and live here once:
//    the language switch  interface text only, never data
//    the print chip       viewer page only; lays the diagram on paper (issue 123)
//    the export action    the one solid action in the dock, set apart from the states
//  Their markup and class names are what the verifier measures (spec/fact/rendering.md §4.2),
//  so a second copy in another dock would be a second thing to keep in step.
// ============================================================

import { useContext } from 'react'

import { useLang } from './LangContext.jsx'
import { ShownSpecContext, useEnv, usePrefs, useResetSpec } from './env.js'
import { usePrintHost } from './printHost.js'
import { hasSpecPrefs, specKeyOf } from './prefs.js'

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
  // a host can lock the language (`mount(…, { locked: { lang } })`): then there is no switch to offer (issue 200)
  const { locked } = useEnv()
  if (locked?.lang) return null
  return <DockSegmented options={LANGS} value={lang} onChange={setLang} title={t('dock.lang')} />
}

/**
 * Print: the diagram on paper, through the browser's own print preview. Only the viewer
 * page has it (an embedded diagram lives inside a host page, where `window.print()` would
 * print that page); the chip sits beside the export action, and the export action stays the
 * one solid block in the dock.
 */
export function DockPrintButton() {
  const { t } = useLang()
  const { embedded } = useEnv()
  const host = usePrintHost()
  if (embedded || !host) return null
  return (
    <button
      className="antu-dock-chip antu-dock-print"
      onClick={() => host.print()}
      disabled={host.printing}
      title={t('dock.printTitle')}
      aria-label={t('dock.printTitle')}
    >
      {host.printing ? t('dock.printing') : t('dock.print')}
    </button>
  )
}

/**
 * Print across sheets (issue 123): shown only when this picture does not fit the sheet it would print on at
 * its own size. Printing today fits it onto one sheet, so a big diagram arrives with its text under the
 * readable floor; this keeps the designed type size and cuts the picture into sheets instead.
 */
export function DockPrintAcrossButton() {
  const { t } = useLang()
  const { embedded } = useEnv()
  const host = usePrintHost()
  if (embedded || !host) return null
  const sheets = host.acrossNow?.()
  if (!sheets || sheets.total <= 1) return null
  const vars = {
    n: sheets.total,
    across: sheets.across,
    down: sheets.down,
    pct: Math.round((sheets.scale ?? 1) * 100),
  }
  return (
    <button
      className="antu-dock-chip antu-dock-print-across"
      onClick={() => host.printAcross()}
      disabled={host.printing}
      title={t('dock.printAcrossTitle', vars)}
      aria-label={t('dock.printAcrossTitle', vars)}
    >
      {t('dock.printAcross', vars)}
    </button>
  )
}

/** The export action: the only solid block in the dock, with a download symbol */
export function DockExportButton({ exporting = false, onExport }) {
  const { t } = useLang()
  return (
    <>
      <DockPrintButton />
      <DockPrintAcrossButton />
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
    </>
  )
}

/**
 * "Restore this diagram's defaults": shown only when this diagram has a remembered choice. It forgets them
 * (`clearSpecPrefs`) and App mounts the diagram again, so every control reads its default at mount. Theme and
 * language are global choices and are deliberately left alone.
 */
export function DockResetButton() {
  const { t } = useLang()
  const prefs = usePrefs()
  const reset = useResetSpec()
  const spec = useContext(ShownSpecContext)
  const key = specKeyOf(spec)
  if (!hasSpecPrefs(prefs, key)) return null
  return (
    <>
      <span className="antu-dock-sep" />
      <button className="antu-dock-chip antu-dock-reset" onClick={reset} title={t('dock.restoreTitle')} aria-label={t('dock.restoreTitle')}>
        {t('dock.restore')}
      </button>
    </>
  )
}

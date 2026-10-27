// ============================================================
//  src/shell/TracePanel.jsx — in-page source overview (issue 124)
//
//  One panel for every diagram type: a table of "what is on the picture → where it came
//  from". Opened from the dock (`DockTraceButton`); stays inside the same offline HTML.
//  Clicking a row pins and focuses that item through the canvas command bus (same path as
//  a host's `select` / `focus`).
// ============================================================

import { createContext, useContext, useMemo, useState } from 'react'

import { locTextOf, sourceTypesIn, traceRowsOf } from '../core/trace.js'
import { useLang } from './LangContext.jsx'
import { ShownSpecContext, useEnv } from './env.js'

const TraceOpenContext = createContext({ open: false, setOpen: () => {} })

export function TracePanelProvider({ children }) {
  const [open, setOpen] = useState(false)
  const value = useMemo(() => ({ open, setOpen }), [open])
  return <TraceOpenContext.Provider value={value}>{children}</TraceOpenContext.Provider>
}

export function useTracePanel() {
  return useContext(TraceOpenContext)
}

/** Dock chip: toggles the overview. Shared by every rendering kind's capsule. */
export function DockTraceButton() {
  const { t } = useLang()
  const { open, setOpen } = useTracePanel()
  return (
    <button
      className={`antu-dock-chip antu-dock-trace${open ? ' is-on' : ''}`}
      data-chip="trace"
      aria-pressed={open}
      title={t('trace.chipTitle')}
      onClick={() => setOpen(!open)}
    >
      {t('trace.chip')}
    </button>
  )
}

function SourceCell({ source, t }) {
  const loc = locTextOf(source)
  return (
    <div className="antu-trace-src">
      <div className="antu-trace-src-name">{source.name || source.id}</div>
      <div className="antu-trace-src-meta">
        <span className="antu-trace-kind">{t(`source.type.${source.type}`)}</span>
        {loc ? ` · ${loc}` : ''}
      </div>
    </div>
  )
}

/**
 * The floating panel. Renders nothing when closed. Lives under `.antu-app` so export / print
 * CSS can hide it with the rest of the chrome.
 */
export function SourceTracePanel() {
  const { t } = useLang()
  const { open, setOpen } = useTracePanel()
  const spec = useContext(ShownSpecContext)
  const { commands } = useEnv()
  const [filter, setFilter] = useState('all')
  const [selectedId, setSelectedId] = useState(null)

  const rows = useMemo(() => traceRowsOf(spec), [spec])
  const types = useMemo(() => sourceTypesIn(rows), [rows])

  const visible = useMemo(() => {
    if (filter === 'all') return rows
    if (filter === 'none') return rows.filter((r) => !r.sources.length)
    return rows.filter((r) => r.sources.some((s) => s.type === filter))
  }, [rows, filter])

  if (!open || !spec) return null

  const onRow = (row) => {
    setSelectedId(row.id)
    // Same path as a host's select/focus: pin the card and bring it into view when the kind can.
    if (commands.has('select')) commands.run('select', row.id)
    if (commands.has('focus')) commands.run('focus', row.id)
  }

  return (
    <aside className="antu-trace" aria-label={t('trace.title')}>
      <header className="antu-trace-head">
        <div>
          <h2 className="antu-trace-title">{t('trace.title')}</h2>
          <p className="antu-trace-sub">
            {t('trace.subtitle', { n: visible.length, total: rows.length })}
          </p>
        </div>
        <button
          type="button"
          className="antu-trace-close"
          onClick={() => setOpen(false)}
          aria-label={t('common.close')}
          title={t('common.close')}
        >
          ×
        </button>
      </header>

      <div className="antu-trace-filters" role="toolbar" aria-label={t('trace.filters')}>
        <button
          type="button"
          className={`antu-trace-filter${filter === 'all' ? ' is-on' : ''}`}
          onClick={() => setFilter('all')}
        >
          {t('trace.filterAll')}
        </button>
        {types.map((ty) => (
          <button
            key={ty}
            type="button"
            className={`antu-trace-filter${filter === ty ? ' is-on' : ''}`}
            onClick={() => setFilter(ty)}
          >
            {t(`source.type.${ty}`)}
          </button>
        ))}
        <button
          type="button"
          className={`antu-trace-filter${filter === 'none' ? ' is-on' : ''}`}
          onClick={() => setFilter('none')}
        >
          {t('trace.filterNone')}
        </button>
      </div>

      <div className="antu-trace-scroll">
        <table className="antu-trace-table">
          <thead>
            <tr>
              <th scope="col">{t('trace.colLabel')}</th>
              <th scope="col">{t('trace.colSource')}</th>
              <th scope="col">{t('trace.colQuote')}</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={3} className="antu-trace-empty">
                  {t('trace.empty')}
                </td>
              </tr>
            ) : (
              visible.map((row) => (
                <tr
                  key={`${row.collection}:${row.id}`}
                  className={selectedId === row.id ? 'is-sel' : ''}
                  onClick={() => onRow(row)}
                >
                  <td>
                    <div className="antu-trace-label">{row.label}</div>
                    <div className="antu-trace-id">{row.collection} · {row.id}</div>
                  </td>
                  <td>
                    {row.sources.length === 0 ? (
                      <span className="antu-trace-nosrc">{t('trace.noSource')}</span>
                    ) : (
                      row.sources.map((s) => <SourceCell key={s.id} source={s} t={t} />)
                    )}
                  </td>
                  <td>
                    {row.sources.length === 0 ? (
                      '—'
                    ) : (
                      row.sources.map((s) => (
                        <div key={s.id} className="antu-trace-quote">
                          {s.quote || '—'}
                        </div>
                      ))
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </aside>
  )
}

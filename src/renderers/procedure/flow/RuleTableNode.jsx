// ============================================================
//  src/renderers/procedure/flow/RuleTableNode.jsx — the rule table under the flowchart
//
//  Draws the table ruleTable.js laid out: a title, the column headings, then the groups (one
//  per end the rules lead to, then the rest), one row per rule. Every size (the table, the
//  columns, each row) comes from the layout; this file decides none of its own, so the table
//  and the canvas size cannot disagree and the exported image holds all of it.
//
//  A row is tied to the diagram by interaction, not by lines: hovering a row lights up the stage
//  boxes the rule applies in and the end it leads to (FlowRenderer passes that down); clicking
//  it pins an overlay with the full text and the sources, as a node does.
//
//  It is one canvas node, so it pans and zooms with the diagram and goes into the export.
// ============================================================

import { memo, useContext } from 'react'
import { PreviewContext } from '../../../shell/previewContext.js'
import { SOURCE_TYPE_KEYS, labelOf } from '../../../core/labels.js'
import { useLang } from '../../../shell/LangContext.jsx'
import { whensOf } from './ruleTable.js'

const scopeText = (t, scope) =>
  scope.kind === 'all' ? t('rule.tScopeAll') : scope.kind === 'one' ? scope.stage : t('rule.tScopeRange', { from: scope.from, to: scope.to })

const RuleTableNode = memo(function RuleTableNode({ data }) {
  const { table, sourceById } = data
  const { hoveredId, pinnedId, pin, unpin, hover } = useContext(PreviewContext)
  const { t, lang } = useLang()
  const cols = table.cols.map((c) => `${c}px`).join(' ')

  return (
    <div className="antu-rtable nopan" style={{ width: table.w, height: table.h }}>
      <div className="antu-rtable-title">
        <b>{t('rule.tableTitle')}</b>
        <span>{t('rule.tableNote')}</span>
      </div>
      <div className="antu-rtable-head" style={{ gridTemplateColumns: cols }}>
        <span>{t('rule.colWhen')}</span>
        <span>{t('rule.colThen')}</span>
        <span>{t('rule.colScope')}</span>
      </div>

      {table.groups.map((g) => (
        <div key={g.endId ?? 'rest'} className="antu-rtable-group">
          {g.headed && (
            <div className={`antu-rtable-ghead${g.endId ? ' is-end' : ''}`}>
              {g.endId ? t('rule.groupEnd', { end: g.endLabel }) : t('rule.groupRest')}
              <span>{t('rule.count', { n: g.rows.length })}</span>
            </div>
          )}
          {g.rows.map((row) => {
            const id = `rule:${row.rule.id}`
            const whens = whensOf(row.rule)
            const isPinned = pinnedId === id
            const lit = isPinned || (!pinnedId && hoveredId === id)
            const sources = (row.rule.sourceIds ?? []).map((s) => sourceById.get(s)).filter(Boolean)
            return (
              <div
                key={id}
                className={`antu-rtable-row${lit ? ' is-lit' : ''}`}
                style={{ gridTemplateColumns: cols, height: row.h }}
                role="button"
                tabIndex={0}
                aria-expanded={isPinned}
                onMouseEnter={() => hover(id)}
                onMouseLeave={() => hover(null)}
                onClick={(e) => {
                  e.stopPropagation()
                  if (isPinned) unpin()
                  else pin(id)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    if (isPinned) unpin()
                    else pin(id)
                  } else if (e.key === 'Escape') {
                    unpin()
                  }
                }}
              >
                <div className="antu-rtable-when">
                  {whens.length === 1 ? (
                    whens[0]
                  ) : (
                    <>
                      <div className="antu-rtable-any">{t('rule.anyOf')}</div>
                      <ul>
                        {whens.map((w) => (
                          <li key={w}>{w}</li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
                <div className="antu-rtable-then">{row.rule.then}</div>
                <div className="antu-rtable-scope">{scopeText(t, row.scope)}</div>

                {isPinned && (
                  <div className="antu-preview pinned below nowheel nopan antu-rtable-pop" onClick={(e) => e.stopPropagation()}>
                    <button
                      className="antu-preview-close"
                      title={t('common.close')}
                      onClick={(e) => {
                        e.stopPropagation()
                        unpin()
                      }}
                    >
                      ×
                    </button>
                    <div className="antu-preview-time">{scopeText(t, row.scope)}</div>
                    <div className="antu-preview-title">{row.rule.then}</div>
                    <div className="antu-preview-text">
                      {t('rule.if')} {whens.join(t('rule.or'))}
                    </div>
                    {sources.length > 0 ? (
                      sources.map((s) => (
                        <div key={s.id} className="antu-source">
                          <div className="antu-source-name">
                            {s.name}
                            <span className="antu-source-type">{labelOf(SOURCE_TYPE_KEYS, s.type, lang)}</span>
                          </div>
                          {s.quote && <div className="antu-source-quote">{s.quote}</div>}
                        </div>
                      ))
                    ) : (
                      <div className="antu-preview-src is-none">{t('card.sourcesUnlisted')}</div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
})

export default RuleTableNode

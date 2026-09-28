// ============================================================
//  src/renderers/procedure/flow/RuleCardNode.jsx — one rule card in the rule lane
//
//  A rule is "if <when>, then <then>", in force throughout its stages (breach, delay
//  liability, a right to terminate). It is not a step of the flow, so it is not drawn as a
//  node with edges: it is a card beside the stages it covers, which it names on its footer.
//
//  The card is white with a hairline edge. Outcome shows only as a small dot before the
//  consequence (palette.js), set as an inline style so the exported image keeps it; a neutral
//  rule has none. In the column layout the card is as wide as the stages it covers, so the
//  scope line is left off (spanShown); the overlay still names the stages.
//
//  The card's height was counted by metrics.js (ruleHeight); the stylesheet clamps each part
//  to the same number of lines. Full text and provenance are in the overlay, as on every node.
// ============================================================

import { memo, useContext } from 'react'
import { PreviewContext } from '../../../shell/previewContext.js'
import { SOURCE_TYPE_KEYS, labelOf } from '../../../core/labels.js'
import { useLang } from '../../../shell/LangContext.jsx'
import { rulePaint } from './palette.js'

const RuleCardNode = memo(function RuleCardNode({ id, data }) {
  const { rule, w, h, stageLabels, allStages, sources, vertical, spanShown } = data
  const { hoveredId, pinnedId, pin, unpin } = useContext(PreviewContext)
  const { t, lang } = useLang()

  const isPinned = pinnedId === id
  const showPreview = !pinnedId && hoveredId === id
  const open = isPinned || showPreview
  const whens = Array.isArray(rule.when) ? rule.when : [rule.when]
  const paint = rulePaint(rule.outcome || 'neutral')
  const scope = allStages
    ? t('rule.scopeAll')
    : stageLabels.length === 1
      ? t('rule.scopeOne', { stage: stageLabels[0] })
      : t('rule.scopeRange', { from: stageLabels[0], to: stageLabels[stageLabels.length - 1], n: stageLabels.length })

  return (
    <div
      className={`antu-rule o-${rule.outcome || 'neutral'}${rule.endId ? ' ends' : ''}`}
      style={{ width: w, height: h }}
      role="button"
      tabIndex={0}
      aria-label={`${whens.join(' / ')} → ${rule.then}`}
      aria-expanded={open}
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
      <div className="antu-rule-when">
        {whens.length === 1 ? (
          <span className="antu-rule-when-one">
            <span className="antu-rule-if">{t('rule.if')}</span>
            {whens[0]}
          </span>
        ) : (
          <ul className="antu-rule-when-list">
            <span className="antu-rule-if">{t('rule.ifAny')}</span>
            {whens.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}
      </div>
      <div className="antu-rule-then">
        {paint.dot && <span className="antu-rule-dot" style={{ background: paint.dot }} />}
        {rule.then}
      </div>
      {(!spanShown || sources.length > 0) && (
        <div className="antu-rule-foot">
          <span className="antu-rule-scope">{spanShown ? '' : scope}</span>
          {sources.length > 0 && <span className="antu-rule-src">{t('card.sources', { n: sources.length })}</span>}
        </div>
      )}

      {open && (
        <div
          className={[
            'antu-preview',
            'nowheel',
            'nopan',
            vertical ? 'left' : 'above',
            isPinned ? 'pinned' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {isPinned && (
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
          )}
          <div className="antu-preview-time">{scope}</div>
          <div className="antu-preview-title">{rule.then}</div>
          <div className="antu-preview-text">
            {t('rule.if')} {whens.join(t('rule.or'))}
          </div>
          {isPinned &&
            sources.map((s) => (
              <div key={s.id} className="antu-source">
                <div className="antu-source-name">
                  {s.name}
                  <span className="antu-source-type">{labelOf(SOURCE_TYPE_KEYS, s.type, lang)}</span>
                </div>
                {s.quote && <div className="antu-source-quote">{s.quote}</div>}
              </div>
            ))}
          {!isPinned && (
            <div className={`antu-preview-src${sources.length ? '' : ' is-none'}`}>
              {sources.length
                ? t('card.sourcesList', { n: sources.length, names: sources.map((s) => s.name).join(' · ') })
                : t('card.sourcesUnlisted')}
            </div>
          )}
        </div>
      )}
    </div>
  )
})

export default RuleCardNode
